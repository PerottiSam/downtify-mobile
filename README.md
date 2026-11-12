# Downtify Mobile

App React Native (Expo + TypeScript) per un server [Downtify](https://downtify.henriquesebastiao.com).

Usa **solo l'API normale** della [API Reference](https://downtify.henriquesebastiao.com/api-reference/): nessuna chiamata
alle rotte `/api/v1/*` ("Mobile API"). I brani non hanno un id: sono identificati dal loro percorso `file`,
esattamente come fa la pagina web.

## Avvio

```bash
npm install --legacy-peer-deps
npx expo install --fix      # allinea react-native e gli altri pacchetti alla SDK Expo
npx expo run:android        # oppure: npx expo run:ios  (development build)
```

Serve una **development build**: i controlli sullo schermo bloccato (`expo-audio`) non sono affidabili in Expo Go.
Il telefono deve raggiungere il server (stessa Wi-Fi, VPN o indirizzo https). `app.json` abilita HTTP in chiaro
(Android e iOS) perché Downtify di solito gira in LAN: se usi solo https, puoi toglierlo.

## Endpoint usati

| Area | Endpoint |
|---|---|
| Connessione | `GET /api/server/info` |
| Accesso | `POST /api/auth/token` (utente+password) · `POST /api/auth/pair` (codice) · header `Authorization: Bearer` |
| Libreria | `GET /tracks` · `GET /list?refresh=true` (riscansione) |
| Playlist e preferiti | `GET /playlists` (la playlist con `liked: true` contiene i preferiti) · `PUT /api/likes` |
| Ascolto | `GET /media/{file}` (streaming, con Range) · `GET /lyrics?file=` |
| Immagini | `GET /cover?file=&size=` · `GET /playlist-cover?file=` |
| Cerca e scarica | `GET /api/songs/search` · `GET /api/discover/chart` · `GET /api/url/resolve` · `POST /api/download/batch` |
| Coda download | `GET /api/queue` · `GET /api/queue/state` · `DELETE /api/queue/completed` · `DELETE /api/queue/item` |
| Tempo reale | `WS /api/ws` (`library_changed`, `playlists_changed`, `likes`, `queue_reload`, avanzamento download) |
| Attività | `POST /api/activity/playback` |

Un dispositivo abbinato non può cambiare impostazioni, cancellare file o gestire dispositivi (403): l'app non offre quelle azioni.

## ⚠ Da verificare

`PUT /api/likes` è l'unica chiamata di cui non ho potuto leggere il corpo (la sezione *Likes* della documentazione
era tra quelle tagliate dal lettore). L'app invia `{ "file": "<percorso>", "liked": true|false }`. Se il tuo server
vuole un altro formato, si cambia in **una sola funzione**: `setLike` in `src/api/client.ts`.
La lettura dei preferiti non dipende da questo: viene da `GET /playlists`.

## Controlli sullo schermo bloccato / notifica

Titolo, artista, copertina e **precedente · play/pausa · successivo** su iOS (schermata di blocco e Centro di controllo)
e Android (notifica multimediale). Il player è un `AudioPlaylist` di `expo-audio`: avanti/indietro li gestisce il
sistema anche con l'app in background; nel player nativo c'è solo una finestra della coda (10 brani prima, 100 dopo,
rifornita man mano), la coda completa resta in JavaScript. La copertina viene scaricata con l'header `Authorization`
da `/cover` in cache e passata al sistema come file locale (il sistema non può mandare l'header da solo).
Servono una SDK Expo recente (il package.json punta alla 58) e, su Android 13+, il permesso notifiche (richiesto al primo ascolto).

## Cosa cambia rispetto alla versione con la Mobile API

- **Niente ascolti registrati (`/api/discover/listens`)**: quell'endpoint vuole l'id del brano (`t7b2…`), che esiste
  solo nel feed `/api/v1/library`. Con l'API normale non c'è un id da mandare, quindi non li segnalo.
- **Niente transcodifica**: lo streaming è sempre il file originale (la conversione AAC/Opus è solo nella v1).
- **Niente cache locale della libreria**: a ogni avvio si scarica `GET /tracks` (il server risponde da una copia in
  memoria); al ritorno in primo piano si riallinea se è passato più di un minuto, e subito se arriva `library_changed`.
- Album e artisti sono raggruppati dall'app (album artist + titolo album, come la pagina web).

## Struttura

```
App.tsx                      provider + navigazione (auth / app)
src/api/client.ts            client REST tipizzato (solo API normale)
src/store/session.tsx        server, token (SecureStore), utente
src/store/data.tsx           libreria, preferiti, playlist, coda, WebSocket
src/store/player.tsx         expo-audio (AudioPlaylist), coda, schermo bloccato
src/navigation/              tab bar + stack per tab + modale player
src/screens/                 Connect, SignIn, Library, Search, Playlists, TrackList, Downloads, More, Player
src/components/              Cover, TrackRow, MiniPlayer, ui
```

## Non ancora fatto

Ascolto offline (si può scaricare da `/media/{file}` con `Range`), scoperta automatica mDNS (`_downtify._tcp`, serve
`react-native-zeroconf` e una dev build), scansione QR di abbinamento (`expo-camera`), podcast, modifica delle playlist.
