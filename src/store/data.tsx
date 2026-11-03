import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Playlist, QueueJob, Track, errorMessage } from '../api/client';
import { libraryCacheKey, uuid } from '../utils';
import { useSession } from './session';

export interface AlbumGroup {
  id: string;
  title: string;
  artist: string;
  year?: string;
  trackIds: string[];
  coverTrackId?: string;
}

export interface ArtistGroup {
  id: string;
  name: string;
  trackIds: string[];
  albumCount: number;
  coverTrackId?: string;
}

interface DataCtx {
  tracks: Track[];
  byId: Map<string, Track>;
  albums: AlbumGroup[];
  artists: ArtistGroup[];
  likes: Set<string>;
  likeIds: string[];
  playlists: Playlist[];
  queue: QueueJob[];
  activeDownloads: number;
  syncing: boolean;
  error?: string;
  sync(opts?: { refresh?: boolean; full?: boolean }): Promise<void>;
  refreshPlaylists(): Promise<void>;
  refreshQueue(): Promise<void>;
  toggleLike(trackId: string): Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { api, baseUrl, signOut } = useSession();

  const [trackMap, setTrackMap] = useState<Map<string, Track>>(new Map());
  const [likeIds, setLikeIds] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>();

  const cursorRef = useRef(0);
  const mapRef = useRef(trackMap);
  const queueRef = useRef(queue);
  const syncLock = useRef(false);
  const syncPending = useRef(false);
  mapRef.current = trackMap;
  queueRef.current = queue;

  const likes = useMemo(() => new Set(likeIds), [likeIds]);
  const likesRef = useRef(likes);
  likesRef.current = likes;

  /* ------------------------------ Sync libreria ------------------------------ */

  const syncRef = useRef<DataCtx['sync']>(async () => {});

  const sync = useCallback<DataCtx['sync']>(
    async (opts = {}) => {
      if (!api) return;
      if (syncLock.current) {
        syncPending.current = true;
        return;
      }
      syncLock.current = true;
      setSyncing(true);
      setError(undefined);
      try {
        const res = await api.library(opts.full ? 0 : cursorRef.current, opts.refresh);
        const next = res.full ? new Map<string, Track>() : new Map(mapRef.current);
        for (const t of res.tracks) next.set(t.id, t);
        for (const id of res.deleted ?? []) next.delete(id);
        cursorRef.current = res.cursor;
        mapRef.current = next;
        setTrackMap(next);
        AsyncStorage.setItem(
          libraryCacheKey(baseUrl),
          JSON.stringify({ cursor: res.cursor, tracks: Array.from(next.values()) }),
        ).catch(() => {});
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        syncLock.current = false;
        setSyncing(false);
        if (syncPending.current) {
          syncPending.current = false;
          setTimeout(() => syncRef.current(), 0);
        }
      }
    },
    [api, baseUrl],
  );
  syncRef.current = sync;

  const refreshLikes = useCallback(async () => {
    if (!api) return;
    try {
      setLikeIds((await api.likes()).track_ids);
    } catch {}
  }, [api]);

  const refreshPlaylists = useCallback(async () => {
    if (!api) return;
    try {
      setPlaylists(await api.playlists());
    } catch {}
  }, [api]);

  const refreshQueue = useCallback(async () => {
    if (!api) return;
    try {
      setQueue(await api.queue());
    } catch {}
  }, [api]);

  /* Avvio: cache locale → sync incrementale */
  useEffect(() => {
    if (!api) return;
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(libraryCacheKey(baseUrl));
        if (raw && alive) {
          const { cursor, tracks } = JSON.parse(raw) as { cursor: number; tracks: Track[] };
          const m = new Map<string, Track>();
          tracks.forEach((t) => m.set(t.id, t));
          cursorRef.current = cursor ?? 0;
          mapRef.current = m;
          setTrackMap(m);
        }
      } catch {}
      if (!alive) return;
      sync();
      refreshLikes();
      refreshPlaylists();
      refreshQueue();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  /* ------------------------------ Like ------------------------------ */

  const toggleLike = useCallback(
    async (trackId: string) => {
      if (!api) return;
      const liked = !likesRef.current.has(trackId);
      setLikeIds((prev) => (liked ? [trackId, ...prev.filter((x) => x !== trackId)] : prev.filter((x) => x !== trackId)));
      try {
        await api.setLike(trackId, liked);
      } catch {
        setLikeIds((prev) => (liked ? prev.filter((x) => x !== trackId) : [trackId, ...prev]));
      }
    },
    [api],
  );

  /* ------------------------------ WebSocket ------------------------------ */

  const handlerRef = useRef<(m: any) => void>(() => {});
  handlerRef.current = (m: any) => {
    switch (m?.type) {
      case 'library_changed':
        sync();
        break;
      case 'playlists_changed':
        refreshPlaylists();
        break;
      case 'likes':
        refreshLikes();
        break;
      case 'queue_reload':
        refreshQueue();
        break;
      case undefined: {
        // avanzamento di un download: { song, progress, status, message, filename, provider }
        if (!m?.song) break;
        const id = m.song.song_id;
        const i = queueRef.current.findIndex((j) => j.song?.song_id === id);
        if (i < 0) {
          refreshQueue();
          break;
        }
        setQueue((q) => {
          const next = q.slice();
          const j = next[i];
          if (!j) return q;
          next[i] = {
            ...j,
            status: m.status ?? j.status,
            progress: m.progress ?? j.progress,
            message: m.message ?? j.message,
            filename: m.filename ?? j.filename,
            provider: m.provider ?? j.provider,
          };
          return next;
        });
        if (m.status === 'done' || m.status === 'error') refreshQueue();
        break;
      }
    }
  };

  useEffect(() => {
    if (!api) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const clientId = uuid();

    const connect = () => {
      try {
        // React Native accetta un terzo argomento con gli header dell'handshake
        ws = new (WebSocket as any)(api.wsUrl(clientId), undefined, { headers: api.authHeaders() }) as WebSocket;
      } catch {
        retry = setTimeout(connect, 5000);
        return;
      }
      ws.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(String(e.data)));
        } catch {}
      };
      ws.onclose = (e) => {
        if (closed) return;
        if (e.code === 4401) {
          signOut(); // dispositivo scollegato dal server
          return;
        }
        retry = setTimeout(connect, 4000);
      };
      ws.onerror = () => {};
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const activeDownloads = useMemo(
    () => queue.filter((j) => j.status === 'queued' || j.status === 'downloading').length,
    [queue],
  );

  // Rete di sicurezza: finché ci sono download attivi, ricarica la coda ogni 4 s
  useEffect(() => {
    if (!activeDownloads) return;
    const t = setInterval(refreshQueue, 4000);
    return () => clearInterval(t);
  }, [activeDownloads, refreshQueue]);

  /* ------------------------------ Derivati ------------------------------ */

  const tracks = useMemo(
    () => Array.from(trackMap.values()).sort((a, b) => (b.added ?? 0) - (a.added ?? 0)),
    [trackMap],
  );

  const { albums, artists } = useMemo(() => {
    const albumMap = new Map<string, Track[]>();
    const artistMap = new Map<string, Track[]>();
    for (const t of tracks) {
      const ak = t.album_id || `single:${t.artist_id}`;
      (albumMap.get(ak) ?? albumMap.set(ak, []).get(ak)!).push(t);
      const rk = t.artist_id || `artist:${t.artist}`;
      (artistMap.get(rk) ?? artistMap.set(rk, []).get(rk)!).push(t);
    }
    const byTrackNo = (a: Track, b: Track) =>
      (a.track_number ?? 0) - (b.track_number ?? 0) || a.title.localeCompare(b.title);

    const albums: AlbumGroup[] = [];
    albumMap.forEach((list, id) => {
      list.sort(byTrackNo);
      const first = list[0];
      albums.push({
        id,
        title: first.album || 'Singoli',
        artist: first.album_artist || first.artist,
        year: first.year,
        trackIds: list.map((t) => t.id),
        coverTrackId: (list.find((t) => t.has_cover) ?? first).id,
      });
    });
    albums.sort((a, b) => a.title.localeCompare(b.title));

    const artists: ArtistGroup[] = [];
    artistMap.forEach((list, id) => {
      const first = list[0];
      artists.push({
        id,
        name: first.album_artist || first.artist,
        trackIds: list.map((t) => t.id),
        albumCount: new Set(list.map((t) => t.album_id)).size,
        coverTrackId: (list.find((t) => t.has_cover) ?? first).id,
      });
    });
    artists.sort((a, b) => a.name.localeCompare(b.name));
    return { albums, artists };
  }, [tracks]);

  const value = useMemo<DataCtx>(
    () => ({
      tracks,
      byId: trackMap,
      albums,
      artists,
      likes,
      likeIds,
      playlists,
      queue,
      activeDownloads,
      syncing,
      error,
      sync,
      refreshPlaylists,
      refreshQueue,
      toggleLike,
    }),
    [tracks, trackMap, albums, artists, likes, likeIds, playlists, queue, activeDownloads, syncing, error, sync, refreshPlaylists, refreshQueue, toggleLike],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fuori da DataProvider');
  return v;
}
