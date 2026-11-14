import {
  AudioPlaylist,
  AudioPlaylistStatus,
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { Track } from "../api/client";
import { hashString, uuid } from "../utils";
import { useSession } from "./session";

export type Repeat = "off" | "all" | "one";

/**
 * Il player nativo (AudioPlaylist) ha SOLO una finestra della coda: così i pulsanti
 * "precedente/successivo" dello schermo bloccato e della notifica sono gestiti dal sistema,
 * anche con l'app in background. La coda completa resta qui, in JavaScript.
 */
const BACK_WINDOW = 10; // brani precedenti caricati davanti al brano scelto
const CHUNK = 100; // brani caricati in avanti per volta
const REFILL_AT = 20; // quando ne restano meno di così, si aggiunge il blocco successivo

const LOCK_OPTIONS = {
  showNextTrack: true,
  showPreviousTrack: true,
  showSeekBackward: false,
  showSeekForward: false,
};

export interface PlayerApi {
  queue: Track[];
  userQueue: Track[]; // "In coda" (aggiunti dall'utente)
  contextQueue: Track[]; // "Prossimi da..." (coda precalcolata / casuale)
  index: number;
  current?: Track;
  playing: boolean;
  buffering: boolean;
  repeat: Repeat;
  play(tracks: Track[], startIndex?: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  enqueue(track: Track): void;
  cycleRepeat(): void;
}

const PlayerCtx = createContext<PlayerApi | null>(null);
const ProgressCtx = createContext<{ position: number; duration: number }>({
  position: 0,
  duration: 0,
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { api } = useSession();

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const [userRange, setUserRange] = useState({ start: 0, end: 0 });
  const userRangeRef = useRef({ start: 0, end: 0 });

  const plRef = useRef<AudioPlaylist | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const repeatRef = useRef<Repeat>("off");
  const progressRef = useRef({ position: 0, duration: 0 });
  const baseRef = useRef(0); // indice in coda del primo brano caricato nel player nativo
  const loadedEndRef = useRef(0); // indice in coda (escluso) dell'ultimo brano caricato
  const suppressUntilRef = useRef(0);
  const lockActiveRef = useRef(false);
  const metaTokenRef = useRef(0);
  const notifAskedRef = useRef(false);
  const playIdRef = useRef(uuid());
  const endedRef = useRef("");
  const installIdRef = useRef(uuid());
  const statusRef = useRef<(s: AudioPlaylistStatus) => void>(() => {});
  const changedRef = useRef<(e: { currentIndex: number }) => void>(() => {});

  repeatRef.current = repeat;

  const current: Track | undefined = queue[index];

  const setUserBlock = (start: number, end: number) => {
    const r = end > start ? { start, end } : { start: 0, end: 0 };
    userRangeRef.current = r;
    setUserRange(r);
  };

  /** Il brano `ni` è diventato quello corrente: aggiorna il blocco utente. */
  const consumeUserBlock = (ni: number) => {
    const { start, end } = userRangeRef.current;
    if (end <= start) return;
    if (ni >= end)
      setUserBlock(0, 0); // saltato oltre il blocco
    else if (ni >= start) setUserBlock(ni + 1, end); // sto suonando un brano utente
    // ni < start (sono tornato indietro): il blocco resta com'è
  };

  /* ---------------------------- Helper interni ---------------------------- */

  const sourceFor = (t: Track) => ({
    uri: api!.trackStreamUrl(t),
    headers: api!.authHeaders(),
    name: t.title,
  });

  const resetPlayState = () => {
    playIdRef.current = uuid();
    endedRef.current = "";
    progressRef.current = { position: 0, duration: 0 };
    setProgress(progressRef.current);
  };

  /**
   * Il sistema scarica da solo la copertina dello schermo bloccato, senza header:
   * la scarico io (con l'Authorization) in cache e gli passo il file locale.
   */
  const coverFileFor = async (track: Track): Promise<string | undefined> => {
    if (!api || !track.has_cover) return undefined;
    try {
      const dest = new File(Paths.cache, `cover-${hashString(track.file)}.jpg`);
      if (dest.exists) return dest.uri;
      const f = await File.downloadFileAsync(
        api.coverUrl(track.file, 600),
        dest,
        {
          headers: api.authHeaders(),
          idempotent: true,
        },
      );
      return f.uri;
    } catch {
      return undefined;
    }
  };

  /** Titolo/artista/copertina sullo schermo bloccato e nella notifica. */
  const applyMetadata = async (track: Track) => {
    const pl = plRef.current;
    if (!pl) return;
    const token = ++metaTokenRef.current;
    const meta = {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
    };
    try {
      if (!lockActiveRef.current) {
        pl.setActiveForLockScreen(true, meta, LOCK_OPTIONS);
        lockActiveRef.current = true;
      } else {
        pl.updateLockScreenMetadata(meta);
      }
    } catch {}
    const artworkUrl = await coverFileFor(track);
    if (artworkUrl && token === metaTokenRef.current) {
      try {
        pl.updateLockScreenMetadata({ ...meta, artworkUrl });
      } catch {}
    }
  };

  const maybeRefill = () => {
    const pl = plRef.current;
    const q = queueRef.current;
    if (!pl || !api) return;
    if (
      loadedEndRef.current < q.length &&
      loadedEndRef.current - indexRef.current < REFILL_AT
    ) {
      const end = Math.min(q.length, loadedEndRef.current + CHUNK);
      for (let i = loadedEndRef.current; i < end; i++) pl.add(sourceFor(q[i]));
      loadedEndRef.current = end;
    }
  };

  const loadWindow = (tracks: Track[], startIndex: number) => {
    const pl = plRef.current;
    if (!pl || !api) return;
    suppressUntilRef.current = Date.now() + 600; // ignora gli eventi generati dal ricaricamento
    const base = Math.max(0, startIndex - BACK_WINDOW);
    const end = Math.min(tracks.length, startIndex + CHUNK);
    pl.clear();
    for (let i = base; i < end; i++) pl.add(sourceFor(tracks[i]));
    baseRef.current = base;
    loadedEndRef.current = end;
    pl.skipTo(startIndex - base);
    pl.play();
  };

  const goTo = (qi: number) => {
    const pl = plRef.current;
    const t = queueRef.current[qi];
    if (!pl || !t) return;
    indexRef.current = qi;
    setIndex(qi);
    consumeUserBlock(qi);
    resetPlayState();
    if (qi >= baseRef.current && qi < loadedEndRef.current) {
      suppressUntilRef.current = Date.now() + 600;
      pl.skipTo(qi - baseRef.current);
      pl.play();
    } else {
      loadWindow(queueRef.current, qi);
    }
    applyMetadata(t);
    maybeRefill();
  };

  /* ---------------------------- Eventi del player nativo ---------------------------- */

  statusRef.current = (s: AudioPlaylistStatus) => {
    setPlaying(s.playing);
    setBuffering(!!s.isBuffering);

    const cur = queueRef.current[indexRef.current];
    const pos = s.currentTime ?? 0;
    const dur = s.duration || cur?.duration || 0;
    progressRef.current = { position: pos, duration: dur };
    setProgress(progressRef.current);

    // Fine coda con "ripeti tutto": si riparte dal primo brano
    if (s.didJustFinish && endedRef.current !== playIdRef.current) {
      endedRef.current = playIdRef.current;
      if (
        indexRef.current === queueRef.current.length - 1 &&
        repeatRef.current === "all"
      )
        goTo(0);
    }
  };

  // Cambio brano deciso dal sistema (pulsanti sullo schermo bloccato, cuffie, auto, fine brano)
  changedRef.current = ({ currentIndex }) => {
    if (Date.now() < suppressUntilRef.current) return;
    const qi = baseRef.current + currentIndex;
    if (qi === indexRef.current) return;
    const t = queueRef.current[qi];
    if (!t) return;
    indexRef.current = qi;
    setIndex(qi);
    consumeUserBlock(qi);
    resetPlayState();
    applyMetadata(t);
    maybeRefill();
  };

  useEffect(() => {
    // 'doNotMix' è richiesto perché il sistema associ i controlli dello schermo bloccato all'app
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {});
    const pl = createAudioPlaylist({ sources: [], loop: "none" });
    plRef.current = pl;
    const s1 = pl.addListener(
      "playlistStatusUpdate",
      (s: AudioPlaylistStatus) => statusRef.current(s),
    );
    const s2 = pl.addListener("trackChanged", (e: { currentIndex: number }) =>
      changedRef.current(e),
    );
    return () => {
      s1.remove();
      s2.remove();
      try {
        pl.clearLockScreenControls();
      } catch {}
      pl.destroy();
      plRef.current = null;
      lockActiveRef.current = false;
    };
  }, []);

  // "Ripeti un brano" = loop nativo del brano corrente
  useEffect(() => {
    const pl = plRef.current;
    if (!pl) return;
    try {
      pl.loop = repeat === "one" ? "single" : "none";
    } catch {}
  }, [repeat]);

  // "Sta ascoltando" per la pagina Attività degli admin: a ogni cambio di stato e ogni 30 s
  useEffect(() => {
    if (!api || !current) return;
    const send = () =>
      api
        .reportPlayback(
          installIdRef.current,
          playing ? "playing" : "paused",
          current,
          progressRef.current.position,
        )
        .catch(() => {});
    send();
    if (!playing) return;
    const t = setInterval(send, 30000);
    return () => clearInterval(t);
  }, [api, current?.file, playing]);

  /* ---------------------------- Comandi pubblici (stabili) ---------------------------- */

  const impl = useRef({
    play: (_tracks: Track[], _start: number) => {},
    next: () => {},
    prev: () => {},
    enqueue: (_t: Track) => {},
  });

  impl.current = {
    play: (tracks, startIndex) => {
      if (!tracks.length) return;
      if (Platform.OS === "android" && !notifAskedRef.current) {
        notifAskedRef.current = true;
        requestNotificationPermissionsAsync().catch(() => {});
      }
      const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);

      // I brani aggiunti dall'utente e non ancora suonati sopravvivono al cambio di contesto (come Spotify).
      // Per azzerarli sempre, metti `const pending: Track[] = [];`
      const { start: us, end: ue } = userRangeRef.current;
      const pending =
        ue > us
          ? queueRef.current.slice(Math.max(us, indexRef.current + 1), ue)
          : [];

      const nq = pending.length
        ? [
            ...tracks.slice(0, start + 1),
            ...pending,
            ...tracks.slice(start + 1),
          ]
        : tracks;

      queueRef.current = nq;
      setQueue(nq);
      setUserBlock(start + 1, start + 1 + pending.length);
      baseRef.current = 0;
      loadedEndRef.current = 0; // forza il ricaricamento della finestra
      goTo(start);
    },
    next: () => {
      const len = queueRef.current.length;
      if (!len) return;
      const ni = indexRef.current + 1;
      if (ni < len) goTo(ni);
      else if (repeatRef.current === "all") goTo(0);
      else {
        plRef.current?.pause();
        plRef.current?.seekTo(0);
      }
    },
    prev: () => {
      if (!queueRef.current.length) return;
      if (progressRef.current.position > 3 || indexRef.current <= 0)
        plRef.current?.seekTo(0);
      else goTo(indexRef.current - 1);
    },
    enqueue: (t) => {
      const pl = plRef.current;
      if (!queueRef.current.length || !pl) return impl.current.play([t], 0);

      const { start, end } = userRangeRef.current;
      const empty = end <= start;
      const p = empty ? indexRef.current + 1 : end; // dopo l'ultimo brano utente

      const nq = [...queueRef.current];
      nq.splice(p, 0, t);
      queueRef.current = nq;
      setQueue(nq);
      setUserBlock(empty ? p : start, p + 1);

      if (p < loadedEndRef.current) {
        // Niente pl.insert: ricrea solo la coda dopo `p`, il brano corrente non viene toccato
        const newEnd = loadedEndRef.current + 1;
        suppressUntilRef.current = Date.now() + 600; // ignora eventuali trackChanged spuri
        for (let i = loadedEndRef.current - 1; i >= p; i--) {
          pl.remove(i - baseRef.current); // dal fondo, così gli indici non scalano
        }
        for (let i = p; i < newEnd; i++) pl.add(sourceFor(nq[i]));
        loadedEndRef.current = newEnd;
      } else {
        maybeRefill();
      }
    },
  };

  const play = useCallback(
    (tracks: Track[], startIndex = 0) => impl.current.play(tracks, startIndex),
    [],
  );
  const next = useCallback(() => impl.current.next(), []);
  const prev = useCallback(() => impl.current.prev(), []);
  const enqueue = useCallback((t: Track) => impl.current.enqueue(t), []);

  const toggle = useCallback(() => {
    const pl = plRef.current;
    if (!pl || indexRef.current < 0) return;
    if (pl.playing) pl.pause();
    else {
      const { position, duration } = progressRef.current;
      if (duration > 0 && position >= duration - 0.5) pl.seekTo(0);
      pl.play();
    }
  }, []);

  const seek = useCallback((s: number) => {
    plRef.current?.seekTo(s);
  }, []);

  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
    [],
  );

  const userQueue = useMemo(() => {
    const s = Math.max(userRange.start, index + 1);
    return userRange.end > s ? queue.slice(s, userRange.end) : [];
  }, [queue, index, userRange]);

  const contextQueue = useMemo(
    () => queue.slice(Math.max(index + 1, userRange.end)),
    [queue, index, userRange],
  );

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      userQueue,
      contextQueue,
      index,
      current,
      playing,
      buffering,
      repeat,
      play,
      toggle,
      next,
      prev,
      seek,
      enqueue,
      cycleRepeat,
    }),
    [
      queue,
      userQueue,
      contextQueue,
      index,
      current,
      playing,
      buffering,
      repeat,
      play,
      toggle,
      next,
      prev,
      seek,
      enqueue,
      cycleRepeat,
    ],
  );

  return (
    <PlayerCtx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </PlayerCtx.Provider>
  );
}

export function usePlayer(): PlayerApi {
  const v = useContext(PlayerCtx);
  if (!v) throw new Error("usePlayer fuori da PlayerProvider");
  return v;
}

/** Posizione/durata: aggiornate ~2 volte al secondo, da usare solo dove serve. */
export function usePlayerProgress() {
  return useContext(ProgressCtx);
}
