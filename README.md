# Downtify Mobile

A React Native app (Expo + TypeScript) for a [Downtify](https://github.com/henriquesebastiao/downtify) server.

It follows the official _Mobile Client Contract_ (API v1): **verification → authentication/pairing → sync → streaming → reporting**.

## Getting Started

```bash
npm install
npx expo install --fix      # Align package versions with your Expo SDK
npx expo start              # Scan the QR code with Expo Go, or press a / i
```

Your phone must be able to reach the server (same Wi-Fi network, VPN, or public HTTPS address).

For a production build: `npx expo prebuild` or EAS Build.

`app.json` already enables cleartext HTTP traffic (Android `usesCleartextTraffic`, iOS ATS) because Downtify typically runs over HTTP on a local network.

If you only use HTTPS, remove those two settings.

## Features

| Area              | Description                                                                                        | Endpoint                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Connection        | Verifies the server's product and API version                                                      | `GET /api/server/info`                                                                     |
| Authentication    | Username + password, pairing code (`XXXX-XXXX`), or no account                                     | `POST /api/auth/token`, `POST /api/auth/pair`                                              |
| Library           | Incremental sync with cursor + local cache; search, Tracks / Albums / Artists                      | `GET /api/v1/library?since=`                                                               |
| Player            | Streaming with signed URLs, original/AAC/Opus quality, repeat, synced lyrics, lock screen controls | `POST /api/v1/sign`, `/api/v1/tracks/{id}/stream`, `/lyrics`                               |
| Favorites         | Likes with optimistic updates                                                                      | `GET/PUT /api/v1/likes`                                                                    |
| Playlists         | Personal and shared playlists (read-only)                                                          | `GET /api/v1/playlists`                                                                    |
| Search & Download | YouTube Music search, paste Spotify/YouTube/Deezer/SoundCloud links, global chart                  | `/api/songs/search`, `/api/url/resolve`, `/api/discover/chart`, `POST /api/download/batch` |
| Downloads         | Server-side queue with real-time progress                                                          | `GET /api/queue` + WebSocket `/api/ws`                                                     |
| Statistics        | Play counts after listening to more than half a track; "now listening" updates every 30 seconds    | `/api/discover/listens`, `/api/activity/playback`                                          |

A paired device cannot change settings, delete files, or manage devices (the server responds with `403`).

The app does not provide these actions.

## Project Structure

```text
App.tsx                      provider + navigation (auth / app)
src/api/client.ts            typed REST client, errors, signed URLs
src/store/session.tsx         server, token (SecureStore), user
src/store/data.tsx            library, likes, playlists, queue, WebSocket
src/store/player.tsx          expo-audio, playback queue, listening reports
src/navigation/               tabs + stack + player modal
src/screens/                  Connect, SignIn, Library, Search, Playlists, TrackList, Downloads, More, Player
src/components/               Cover, TrackRow, MiniPlayer, ui
```
