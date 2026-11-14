# Downtify Mobile

React Native (Expo + TypeScript) app for [Downtify](https://downtify.henriquesebastiao.com) server.

Uses **only the normal API** from the [API Reference](https://downtify.henriquesebastiao.com/api-reference/): no calls to `/api/v1/*` routes ("Mobile API"). Tracks don't have an id — they're identified by their `file` path, just like the web page does.

## Getting Started

```bash
npm install --legacy-peer-deps
npx expo install --fix      # align react-native and other packages to Expo SDK version
npx expo run:ios        # or: npx expo run:android  (development build)
```

A **development build** is required — the background screen lock controls (`expo-audio`) are unreliable in Expo Go.

The phone must reach the server (same Wi-Fi, VPN, or https address). `app.json` enables HTTP plaintext (Android and iOS) because Downtify typically runs on LAN: if you use only https, you can remove it.

## Endpoints Used

| Area                  | Endpoint                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Connection            | `GET /api/server/info`                                                                                     |
| Authentication        | `POST /api/auth/token` (username+password) · `POST /api/auth/pair` (code) · header `Authorization: Bearer` |
| Library               | `GET /tracks` · `GET /list?refresh=true` (rescan)                                                          |
| Playlists & Favorites | `GET /playlists` (the playlist with `liked: true` contains favorites) · `PUT /api/likes`                   |
| Playback              | `GET /media/{file}` (streaming, with Range) · `GET /lyrics?file=`                                          |
| Images                | `GET /cover?file=&size=` · `GET /playlist-cover?file=`                                                     |
| Search & Download     | `GET /api/songs/search` · `GET /api/discover/chart` · `GET /api/url/resolve` · `POST /api/download/batch`  |
| Download Queue        | `GET /api/queue` · `GET /api/queue/state` · `DELETE /api/queue/completed` · `DELETE /api/queue/item`       |
| Real-time             | `WS /api/ws` (`library_changed`, `playlists_changed`, `likes`, `queue_reload`, download progress)          |
| Activity              | `POST /api/activity/playback`                                                                              |

A paired device cannot change settings, delete files, or manage devices (403): the app doesn't offer those actions.

## ⚠ TODO

`PUT /api/likes` is the only call I couldn't read from documentation (the _Likes_ section of docs was cut off by my reader). The app sends `{ "file": "<path>", "liked": true|false }`. If your server wants a different format, just change in **one function**: `setLike` in `src/api/client.ts`. Reading favorites doesn't depend on this: it comes from `GET /playlists`.

## Lock Screen / Notification Controls

Title, artist, artwork, and **previous · play/pause · next** on iOS (lock screen & Control Center) and Android (media notification). The player is an `AudioPlaylist` from `expo-audio`: skip/next is handled by the system even with the app in the background. In the native player there's only a queue window (10 tracks before, 100 after, refilled as needed); the full queue stays in JavaScript. Artwork is downloaded via `/cover` with the `Authorization` header, cached locally, and passed to the system as a local file (the system can't send headers by itself).

This requires a recent Expo SDK (package.json targets 58) and, on Android 13+, the notification permission (required for first playback).

## Differences from the version with Mobile API

- **No recorded listens (`/api/discover/listens`)**: that endpoint requires track ID (`t7b2…`), which only exists in `/api/v1/library` feed. With the normal API there's no ID to send, so we don't record them.
- **No transcoding**: streaming is always the original file (AAC/Opus conversion happens only in v1).
- **No local library cache**: every launch fetches `GET /tracks` (server responds from an in-memory copy); when returning to foreground after 1 minute or on `library_changed`, it syncs again.
- Albums and artists are grouped by the app (album artist + album title, like the web page).

## Structure

```
App.tsx                      provider + navigation (auth / app)
src/api/client.ts            typed REST client (normal API only)
src/store/session.tsx        server, token (SecureStore), user
src/store/data.tsx           library, favorites, playlists, queue, WebSocket
src/store/player.tsx         expo-audio (AudioPlaylist), queue, lock screen
src/navigation/              tab bar + stack for tabs + modal player
src/screens/                 Connect, SignIn, Library, Search, Playlists, TrackList, Downloads, More, Player
src/components/              Cover, TrackRow, MiniPlayer, ui
```

## Not Yet Done

- Offline playback (can download via `/media/{file}` with `Range`)
- Automatic discovery mDNS (`_downtify._tcp`, needs `react-native-zeroconf` and a dev build)
- QR code scanning for pairing (`expo-camera`)
- Playlist editing
