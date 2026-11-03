# Downtify Mobile

App React Native (Expo + TypeScript) per un server [Downtify](https://downtify.henriquesebastiao.com).
Segue il *Mobile Client Contract* ufficiale (API v1): **verifica → accesso/abbinamento → sync → streaming → report**.

## Avvio

```bash
npm install
npx expo install --fix      # allinea le versioni dei pacchetti alla tua SDK Expo
npx expo start              # scansiona il QR con Expo Go, oppure premi a / i
```

Il telefono deve raggiungere il server (stessa rete Wi-Fi, VPN o indirizzo https pubblico).
Per una build di produzione: `npx expo prebuild` oppure EAS Build. `app.json` abilita già
HTTP in chiaro (Android `usesCleartextTraffic`, iOS ATS) perché Downtify di solito gira su LAN in http.
Se usi solo https, rimuovi quelle due impostazioni.

## Funzioni

| Area | Cosa fa | Endpoint |
|---|---|---|
| Connessione | Verifica prodotto/versione API del server | `GET /api/server/info` |
| Accesso | Utente + password, oppure codice di abbinamento (`XXXX-XXXX`), oppure nessun account | `POST /api/auth/token`, `POST /api/auth/pair` |
| Libreria | Sync incrementale con cursore + cache locale; ricerca, Brani / Album / Artisti | `GET /api/v1/library?since=` |
| Player | Streaming con URL firmati, qualità originale/AAC/Opus, repeat, testi sincronizzati, lock screen | `POST /api/v1/sign`, `/api/v1/tracks/{id}/stream`, `/lyrics` |
| Preferiti | Like con aggiornamento ottimistico | `GET/PUT /api/v1/likes` |
| Playlist | Proprie e condivise (sola lettura) | `GET /api/v1/playlists` |
| Cerca e scarica | Ricerca YouTube Music, incolla link Spotify/YouTube/Deezer/SoundCloud, classifica globale | `/api/songs/search`, `/api/url/resolve`, `/api/discover/chart`, `POST /api/download/batch` |
| Download | Coda del server con avanzamento in tempo reale | `GET /api/queue` + WebSocket `/api/ws` |
| Statistiche | Ascolti dopo metà brano, "sta ascoltando" ogni 30 s | `/api/discover/listens`, `/api/activity/playback` |

Un dispositivo abbinato non può cambiare impostazioni, cancellare file o gestire dispositivi (il server risponde 403):
l'app non offre quelle azioni.

## Struttura

```
App.tsx                      provider + navigazione (auth / app)
src/api/client.ts            client REST tipizzato, errori, URL firmati
src/store/session.tsx        server, token (SecureStore), utente
src/store/data.tsx           libreria, like, playlist, coda, WebSocket
src/store/player.tsx         expo-audio, coda di riproduzione, report ascolti
src/navigation/              tab + stack + modale player
src/screens/                 Connect, SignIn, Library, Search, Playlists, TrackList, Downloads, More, Player
src/components/              Cover, TrackRow, MiniPlayer, ui
```

## Da sapere / prossimi passi

- **Non ancora fatti**: ascolto offline (scaricare i file con `Range` e chiave `id`), scoperta automatica mDNS
  (`_downtify._tcp`, serve `react-native-zeroconf` e una dev build), scansione QR di abbinamento (`expo-camera`),
  podcast, Cast, coda degli ascolti fatti offline.
- Le sezioni dei JSON di ricerca/classifica sono lette in modo tollerante (`name`/`title`, `artist`/`artists`):
  la documentazione non ne elenca tutti i campi, quindi se il tuo server usa nomi diversi basta ritoccare
  `songTitle`/`songArtist` in `src/utils.ts`.
- Se l'audio in background non parte su iOS/Android, serve una dev build (Expo Go ha limiti sul background).
- Ho scritto il codice senza poterlo eseguire: lancia `npm run typecheck` e correggi eventuali discrepanze
  con la versione di `expo-audio` che installi.
