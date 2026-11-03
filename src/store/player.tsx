import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

  const playerRef = useRef<AudioPlayer | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const repeatRef = useRef<Repeat>('off');
  const qualityRef = useRef<QualityId>('original');
  const progressRef = useRef({ position: 0, duration: 0 });
  const tokenRef = useRef(0);
  const endedRef = useRef(0);
  const reportedRef = useRef(false);
  const playIdRef = useRef(uuid());
  const installIdRef = useRef(uuid());
  const statusRef = useRef<(s: AudioStatus) => void>(() => {});

  repeatRef.current = repeat;
  qualityRef.current = quality;

  const current: Track | undefined = queue[index];

  /* ---------------------------- Caricamento brano ---------------------------- */

  const startTrack = useCallback(
    async (track: Track) => {
      const p = playerRef.current;
      if (!p || !api) return;
      const token = ++tokenRef.current;
      reportedRef.current = false;
      playIdRef.current = uuid();
      progressRef.current = { position: 0, duration: track.duration };
      setProgress(progressRef.current);
      setBuffering(true);

      const q = QUALITIES[qualityRef.current];
      const params = q.format ? { format: q.format, bitrate: q.bitrate as string } : undefined;
      const items: { path: string; params?: Record<string, string> }[] = [
        { path: `/api/v1/tracks/${track.id}/stream`, ...(params ? { params } : {}) },
      ];
      if (track.has_cover) items.push({ path: `/api/v1/tracks/${track.id}/cover`, params: { size: '600' } });

      let source: { uri: string; headers?: Record<string, string> };
      let artwork: string | undefined;
      try {
        const urls = await api.sign(items, 6 * 3600);
        source = { uri: urls[0] };
        artwork = urls[1];
      } catch {
        // server senza URL firmati: si ripiega sull'header Authorization
        source = { uri: api.streamUrl(track.id, params), headers: api.authHeaders() };
      }
      if (token !== tokenRef.current) return; // nel frattempo è partito un altro brano

      try {
        p.replace(source);
        p.play();
        try {
          p.setActiveForLockScreen(true, {
            title: track.title,
            artist: track.artist,
            albumTitle: track.album,
            artworkUrl: artwork,
          });
        } catch {}
      } catch {
        setBuffering(false);
      }
    },
    [api],
  );

  const goTo = useCallback(
    (i: number) => {
      const t = queueRef.current[i];
      if (!t) return;
      indexRef.current = i;
      setIndex(i);
      startTrack(t);
    },
    [startTrack],
  );

  /* ---------------------------- Comandi pubblici ---------------------------- */

  const play = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (!tracks.length) return;
      queueRef.current = tracks;
      setQueue(tracks);
      goTo(Math.min(Math.max(startIndex, 0), tracks.length - 1));
    },
    [goTo],
  );

  const next = useCallback(() => {
    const len = queueRef.current.length;
    if (!len) return;
    let ni = indexRef.current + 1;
    if (ni >= len) {
      if (repeatRef.current === 'all') ni = 0;
      else {
        playerRef.current?.pause();
        playerRef.current?.seekTo(0);
        return;
      }
    }
    goTo(ni);
  }, [goTo]);

  const prev = useCallback(() => {
    if (!queueRef.current.length) return;
    if (progressRef.current.position > 3 || indexRef.current <= 0) {
      playerRef.current?.seekTo(0);
      return;
    }
    goTo(indexRef.current - 1);
  }, [goTo]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p || indexRef.current < 0) return;
    if (p.playing) p.pause();
    else {
      const { position, duration } = progressRef.current;
      if (duration > 0 && position >= duration - 0.5) p.seekTo(0);
      p.play();
    }
  }, []);

  const seek = useCallback((s: number) => {
    playerRef.current?.seekTo(s);
  }, []);

  const enqueue = useCallback(
    (t: Track) => {
      if (!queueRef.current.length) return play([t], 0);
      const nq = [...queueRef.current, t];
      queueRef.current = nq;
      setQueue(nq);
    },
    [play],
  );

  const playNext = useCallback(
    (t: Track) => {
      if (!queueRef.current.length) return play([t], 0);
      const nq = queueRef.current.slice();
      nq.splice(indexRef.current + 1, 0, t);
      queueRef.current = nq;
      setQueue(nq);
    },
    [play],
  );

  const cycleRepeat = useCallback(() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')), []);

  const setQuality = useCallback((q: QualityId) => {
    setQualityState(q);
    AsyncStorage.setItem(QUALITY_KEY, q).catch(() => {});
  }, []);

  /* ---------------------------- Eventi del player ---------------------------- */

  statusRef.current = (s: AudioStatus) => {
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

    if (s.didJustFinish && endedRef.current !== tokenRef.current) {
      endedRef.current = tokenRef.current;
      if (repeatRef.current === 'one') {
        playerRef.current?.seekTo(0);
        playerRef.current?.play();
      } else {
        next();
      }
    }
  };

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    const p = createAudioPlayer(null);
    playerRef.current = p;
    const sub = p.addListener('playbackStatusUpdate', (s: AudioStatus) => statusRef.current(s));
    AsyncStorage.getItem(QUALITY_KEY)
      .then((v) => v && v in QUALITIES && setQualityState(v as QualityId))
      .catch(() => {});
    return () => {
      sub.remove();
      p.remove();
      playerRef.current = null;
    };
  }, []);

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

  /* ---------------------------- Valori esposti ---------------------------- */

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
