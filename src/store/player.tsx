import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AudioPlaylist,
  AudioPlaylistStatus,
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Track } from '../api/client';
import { uuid } from '../utils';
import { useSession } from './session';

export type Repeat = 'off' | 'all' | 'one';
export type QualityId = 'original' | 'aac-256' | 'opus-128';

export const QUALITIES: Record<QualityId, { label: string; format?: string; bitrate?: string }> = {
  original: { label: 'Originale' },
  'aac-256': { label: 'AAC 256 kbps', format: 'aac', bitrate: '256' },
  'opus-128': { label: 'Opus 128 kbps (risparmia dati)', format: 'opus', bitrate: '128' },
};

const QUALITY_KEY = 'downtify.quality';

/**
 * Il player nativo (AudioPlaylist) ha SOLO una finestra della coda: così i pulsanti
 * "precedente/successivo" dello schermo bloccato e della notifica sono gestiti dal sistema,
 * anche con l'app in background, senza passare da JavaScript.
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
  index: number;
  current?: Track;
  playing: boolean;
  buffering: boolean;
  repeat: Repeat;
  quality: QualityId;
  play(tracks: Track[], startIndex?: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  enqueue(track: Track): void;
  playNext(track: Track): void;
  cycleRepeat(): void;
  setQuality(q: QualityId): void;
}

const PlayerCtx = createContext<PlayerApi | null>(null);
const ProgressCtx = createContext<{ position: number; duration: number }>({ position: 0, duration: 0 });

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { api } = useSession();

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [quality, setQualityState] = useState<QualityId>('original');
  const [progress, setProgress] = useState({ position: 0, duration: 0 });

  const plRef = useRef<AudioPlaylist | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const repeatRef = useRef<Repeat>('off');
  const qualityRef = useRef<QualityId>('original');
  const progressRef = useRef({ position: 0, duration: 0 });
  const baseRef = useRef(0); // indice in coda del primo brano caricato nel player nativo
  const loadedEndRef = useRef(0); // indice in coda (escluso) dell'ultimo brano caricato
  const suppressUntilRef = useRef(0);
  const lockActiveRef = useRef(false);
  const metaTokenRef = useRef(0);
  const notifAskedRef = useRef(false);
  const reportedRef = useRef(false);
  const playIdRef = useRef(uuid());
  const endedRef = useRef('');
  const installIdRef = useRef(uuid());
  const statusRef = useRef<(s: AudioPlaylistStatus) => void>(() => {});
  const changedRef = useRef<(e: { currentIndex: number }) => void>(() => {});

  repeatRef.current = repeat;
  qualityRef.current = quality;

  const current: Track | undefined = queue[index];

  /* ---------------------------- Helper interni ---------------------------- */

  const sourceFor = (t: Track) => {
    const q = QUALITIES[qualityRef.current];
    const params = q.format ? { format: q.format, bitrate: q.bitrate } : undefined;
    return { uri: api!.streamUrl(t.id, params), headers: api!.authHeaders(), name: t.title };
  };

  const resetPlayState = () => {
    reportedRef.current = false;
    playIdRef.current = uuid();
    endedRef.current = '';
    progressRef.current = { position: 0, duration: 0 };
    setProgress(progressRef.current);
  };

  /** Titolo/artista/copertina sullo schermo bloccato e nella notifica. */
  const applyMetadata = async (track: Track) => {
    const pl = plRef.current;
    if (!pl || !api) return;
    const token = ++metaTokenRef.current;
    const meta = { title: track.title, artist: track.artist, albumTitle: track.album };
    try {
      if (!lockActiveRef.current) {
        pl.setActiveForLockScreen(true, meta, LOCK_OPTIONS);
        lockActiveRef.current = true;
      } else {
        pl.updateLockScreenMetadata(meta);
      }
    } catch {}
    if (!track.has_cover) return;
    try {
      // il sistema scarica la copertina da solo, senza header: serve un URL firmato
      const [artworkUrl] = await api.sign([{ path: `/api/v1/tracks/${track.id}/cover`, params: { size: '600' } }], 6 * 3600);
      if (token === metaTokenRef.current) {
        try {
          pl.updateLockScreenMetadata({ ...meta, artworkUrl });
        } catch {}
      }
    } catch {}
  };

  const maybeRefill = () => {
    const pl = plRef.current;
    const q = queueRef.current;
    if (!pl || !api) return;
    if (loadedEndRef.current < q.length && loadedEndRef.current - indexRef.current < REFILL_AT) {
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

    // Ascolto valido: metà del brano (o 4 minuti), come il player web
    if (api && cur && !reportedRef.current && s.playing && dur > 0 && pos >= Math.min(dur / 2, 240)) {
      reportedRef.current = true;
      api.reportListen(cur.id, playIdRef.current).catch(() => {
        reportedRef.current = false;
      });
    }

    // Fine coda con "ripeti tutto": si riparte dal primo brano
    if (s.didJustFinish && endedRef.current !== playIdRef.current) {
      endedRef.current = playIdRef.current;
      if (indexRef.current === queueRef.current.length - 1 && repeatRef.current === 'all') goTo(0);
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
    resetPlayState();
    applyMetadata(t);
    maybeRefill();
  };

  useEffect(() => {
    // 'doNotMix' è richiesto perché il sistema associ i controlli dello schermo bloccato all'app
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
    const pl = createAudioPlaylist({ sources: [], loop: 'none' });
    plRef.current = pl;
    const s1 = pl.addListener('playlistStatusUpdate', (s: AudioPlaylistStatus) => statusRef.current(s));
    const s2 = pl.addListener('trackChanged', (e: { currentIndex: number }) => changedRef.current(e));
    AsyncStorage.getItem(QUALITY_KEY)
      .then((v) => v && v in QUALITIES && setQualityState(v as QualityId))
      .catch(() => {});
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
      pl.loop = repeat === 'one' ? 'single' : 'none';
    } catch {}
  }, [repeat]);

  // "Sta ascoltando" per la pagina Attività degli admin: a ogni cambio di stato e ogni 30 s
  useEffect(() => {
    if (!api || !current) return;
    const send = () =>
      api.reportPlayback(installIdRef.current, playing ? 'playing' : 'paused', current, progressRef.current.position).catch(() => {});
    send();
    if (!playing) return;
    const t = setInterval(send, 30000);
    return () => clearInterval(t);
  }, [api, current?.id, playing]);

  /* ---------------------------- Comandi pubblici (stabili) ---------------------------- */

  const impl = useRef({
    play: (_tracks: Track[], _start: number) => {},
    next: () => {},
    prev: () => {},
    enqueue: (_t: Track) => {},
    playNext: (_t: Track) => {},
  });

  impl.current = {
    play: (tracks, startIndex) => {
      if (!tracks.length) return;
      if (Platform.OS === 'android' && !notifAskedRef.current) {
        // Android 13+: senza permesso la notifica con i controlli non compare
        notifAskedRef.current = true;
        requestNotificationPermissionsAsync().catch(() => {});
      }
      queueRef.current = tracks;
      setQueue(tracks);
      baseRef.current = 0;
      loadedEndRef.current = 0; // forza il ricaricamento della finestra
      goTo(Math.min(Math.max(startIndex, 0), tracks.length - 1));
    },
    next: () => {
      const len = queueRef.current.length;
      if (!len) return;
      const ni = indexRef.current + 1;
      if (ni < len) goTo(ni);
      else if (repeatRef.current === 'all') goTo(0);
      else {
        plRef.current?.pause();
        plRef.current?.seekTo(0);
      }
    },
    prev: () => {
      if (!queueRef.current.length) return;
      if (progressRef.current.position > 3 || indexRef.current <= 0) plRef.current?.seekTo(0);
      else goTo(indexRef.current - 1);
    },
    enqueue: (t) => {
      const pl = plRef.current;
      if (!queueRef.current.length || !pl) return impl.current.play([t], 0);
      const wasAtEnd = loadedEndRef.current === queueRef.current.length;
      const nq = [...queueRef.current, t];
      queueRef.current = nq;
      setQueue(nq);
      if (wasAtEnd) {
        pl.add(sourceFor(t));
        loadedEndRef.current = nq.length;
      }
    },
    playNext: (t) => {
      const pl = plRef.current;
      if (!queueRef.current.length || !pl) return impl.current.play([t], 0);
      const at = indexRef.current + 1;
      const nq = queueRef.current.slice();
      nq.splice(at, 0, t);
      queueRef.current = nq;
      setQueue(nq);
      pl.insert(sourceFor(t), at - baseRef.current);
      loadedEndRef.current += 1;
    },
  };

  const play = useCallback((tracks: Track[], startIndex = 0) => impl.current.play(tracks, startIndex), []);
  const next = useCallback(() => impl.current.next(), []);
  const prev = useCallback(() => impl.current.prev(), []);
  const enqueue = useCallback((t: Track) => impl.current.enqueue(t), []);
  const playNext = useCallback((t: Track) => impl.current.playNext(t), []);

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

  const cycleRepeat = useCallback(() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')), []);

  const setQuality = useCallback((q: QualityId) => {
    setQualityState(q);
    AsyncStorage.setItem(QUALITY_KEY, q).catch(() => {});
  }, []);

  const value = useMemo<PlayerApi>(
    () => ({ queue, index, current, playing, buffering, repeat, quality, play, toggle, next, prev, seek, enqueue, playNext, cycleRepeat, setQuality }),
    [queue, index, current, playing, buffering, repeat, quality, play, toggle, next, prev, seek, enqueue, playNext, cycleRepeat, setQuality],
  );

  return (
    <PlayerCtx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </PlayerCtx.Provider>
  );
}

export function usePlayer(): PlayerApi {
  const v = useContext(PlayerCtx);
  if (!v) throw new Error('usePlayer fuori da PlayerProvider');
  return v;
}

/** Posizione/durata: aggiornate ~2 volte al secondo, da usare solo dove serve. */
export function usePlayerProgress() {
  return useContext(ProgressCtx);
}
