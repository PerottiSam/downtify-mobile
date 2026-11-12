import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Playlist, QueueJob, Track, errorMessage } from '../api/client';
import { norm, uuid } from '../utils';
import { useSession } from './session';

export interface AlbumGroup {
  key: string;
  title: string;
  artist: string;
  year?: string;
  files: string[];
  coverFile?: string;
}

export interface ArtistGroup {
  key: string;
  name: string;
  files: string[];
  albumCount: number;
  coverFile?: string;
}

interface DataCtx {
  tracks: Track[];
  byFile: Map<string, Track>;
  albums: AlbumGroup[];
  artists: ArtistGroup[];
  likes: Set<string>;
  playlists: Playlist[];
  queue: QueueJob[];
  queuePaused: boolean;
  activeDownloads: number;
  syncing: boolean;
  error?: string;
  sync(opts?: { rescan?: boolean }): Promise<void>;
  refreshPlaylists(): Promise<void>;
  refreshQueue(): Promise<void>;
  toggleLike(file: string): Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

const VARIOUS = 'various artists';

/** Artista sotto cui la libreria raggruppa un brano (stessa logica della pagina web). */
function groupArtist(t: Track): string {
  const aa = t.album_artist?.trim();
  if (aa && !(aa.toLowerCase() === VARIOUS && !t.compilation)) return aa;
  return t.artists?.[0] || t.artist || 'Sconosciuto';
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { api, signOut } = useSession();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistRows, setPlaylistRows] = useState<Playlist[]>([]);
  const [likeFiles, setLikeFiles] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>();

  const lock = useRef(false);
  const pending = useRef<{ rescan?: boolean } | null>(null);
  const lastSync = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const likes = useMemo(() => new Set(likeFiles), [likeFiles]);
  const likesRef = useRef(likes);
  likesRef.current = likes;

  /* ------------------------------ Caricamenti ------------------------------ */

  const syncRef = useRef<DataCtx['sync']>(async () => {});

  const sync = useCallback<DataCtx['sync']>(
    async (opts = {}) => {
      if (!api) return;
      if (lock.current) {
        pending.current = { rescan: opts.rescan || pending.current?.rescan };
        return;
      }
      lock.current = true;
      setSyncing(true);
      setError(undefined);
      try {
        if (opts.rescan) await api.rescan().catch(() => {});
        setTracks(await api.tracks());
        lastSync.current = Date.now();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        lock.current = false;
        setSyncing(false);
        const p = pending.current;
        if (p) {
          pending.current = null;
          setTimeout(() => syncRef.current(p), 0);
        }
      }
    },
    [api],
  );
  syncRef.current = sync;

  const refreshPlaylists = useCallback(async () => {
    if (!api) return;
    try {
      const rows = await api.playlists();
      setPlaylistRows(rows);
      // i preferiti sono la playlist "liked" (dal più recente)
      setLikeFiles(rows.find((p) => p.liked)?.files ?? []);
    } catch {}
  }, [api]);

  const refreshQueue = useCallback(async () => {
    if (!api) return;
    try {
      setQueue(await api.queue());
    } catch {}
    try {
      setQueuePaused((await api.queueState()).paused);
    } catch {}
  }, [api]);

  const refreshAll = useCallback(() => {
    syncRef.current();
    refreshPlaylists();
    refreshQueue();
  }, [refreshPlaylists, refreshQueue]);

  useEffect(() => {
    if (api) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Il WebSocket muore in background: al ritorno in primo piano si riallinea tutto
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && api && Date.now() - lastSync.current > 60000) refreshAll();
    });
    return () => sub.remove();
  }, [api, refreshAll]);

  /* ------------------------------ Preferiti ------------------------------ */

  const toggleLike = useCallback(
    async (file: string) => {
      if (!api) return;
      const liked = !likesRef.current.has(file);
      setLikeFiles((prev) => (liked ? [file, ...prev.filter((f) => f !== file)] : prev.filter((f) => f !== file)));
      try {
        await api.setLike(file, liked);
      } catch {
        setLikeFiles((prev) => (liked ? prev.filter((f) => f !== file) : [file, ...prev]));
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
      case 'likes':
        refreshPlaylists();
        break;
      case 'queue_reload':
      case 'queue_state':
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

  const sorted = useMemo(() => tracks.slice().sort((a, b) => (b.added ?? 0) - (a.added ?? 0)), [tracks]);
  const byFile = useMemo(() => new Map(tracks.map((t) => [t.file, t])), [tracks]);

  const { albums, artists } = useMemo(() => {
    const albumMap = new Map<string, Track[]>();
    const artistMap = new Map<string, { name: string; list: Track[] }>();
    for (const t of tracks) {
      const ga = groupArtist(t);
      const ak = `${norm(ga)}|${norm(t.album) || 'single'}`;
      (albumMap.get(ak) ?? albumMap.set(ak, []).get(ak)!).push(t);
      if (ga.toLowerCase() !== VARIOUS) {
        const rk = norm(ga);
        (artistMap.get(rk) ?? artistMap.set(rk, { name: ga, list: [] }).get(rk)!).list.push(t);
      }
    }
    const byNo = (a: Track, b: Track) =>
      (a.track_number ?? 0) - (b.track_number ?? 0) || a.title.localeCompare(b.title);

    const albums: AlbumGroup[] = [];
    albumMap.forEach((list, key) => {
      list.sort(byNo);
      const first = list[0];
      albums.push({
        key,
        title: first.album || 'Singoli',
        artist: groupArtist(first),
        year: first.year,
        files: list.map((t) => t.file),
        coverFile: list.find((t) => t.has_cover)?.file,
      });
    });
    albums.sort((a, b) => a.title.localeCompare(b.title));

    const artists: ArtistGroup[] = [];
    artistMap.forEach(({ name, list }, key) => {
      const withCover = list.find((t) => t.has_cover);
      artists.push({
        key,
        name,
        files: list.map((t) => t.file),
        albumCount: new Set(list.map((t) => norm(t.album))).size,
        coverFile: withCover?.file,
      });
    });
    artists.sort((a, b) => a.name.localeCompare(b.name));
    return { albums, artists };
  }, [tracks]);

  // La playlist dei preferiti segue i like locali (anche prima che il server risponda)
  const playlists = useMemo(() => {
    const rest = playlistRows.filter((p) => !p.liked);
    if (!likeFiles.length) return rest;
    const base = playlistRows.find((p) => p.liked);
    const liked: Playlist = {
      name: 'Downtify Liked Songs',
      manual: false,
      cover: '',
      ...base,
      liked: true,
      files: likeFiles,
      count: likeFiles.length,
    };
    return [liked, ...rest];
  }, [playlistRows, likeFiles]);

  const value = useMemo<DataCtx>(
    () => ({
      tracks: sorted,
      byFile,
      albums,
      artists,
      likes,
      playlists,
      queue,
      queuePaused,
      activeDownloads,
      syncing,
      error,
      sync,
      refreshPlaylists,
      refreshQueue,
      toggleLike,
    }),
    [sorted, byFile, albums, artists, likes, playlists, queue, queuePaused, activeDownloads, syncing, error, sync, refreshPlaylists, refreshQueue, toggleLike],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fuori da DataProvider');
  return v;
}
