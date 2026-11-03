import { Platform } from 'react-native';

export const APP_API_VERSION = 1;

/* ------------------------------- Tipi ------------------------------- */

export interface ServerInfo {
  server_id: string;
  name: string;
  product: string;
  version: string;
  api_version: number;
  require_sign_in: boolean;
  library_only?: boolean;
  capabilities?: {
    transcoding?: { available: boolean; formats: string[]; bitrates: number[] };
    signed_urls?: boolean;
    pairing?: boolean;
    password_sign_in?: boolean;
    podcasts?: boolean;
    discover?: boolean;
    lyrics?: boolean;
    library_sync?: boolean;
  };
}

export interface UserInfo {
  username: string;
  role: string;
}

export interface AuthResult {
  token: string;
  device: { id: string; name: string };
  server: { server_id: string; name: string };
  user: UserInfo;
}

export interface Track {
  id: string;
  file: string;
  title: string;
  artist: string;
  artists?: string[];
  album: string;
  album_artist?: string;
  album_id: string;
  artist_id: string;
  track_number?: number;
  year?: string;
  duration: number;
  codec?: string;
  bitrate?: number;
  size?: number;
  added?: number;
  has_cover?: boolean;
  explicit?: boolean;
  playlists?: string[];
}

export interface Playlist {
  name: string;
  liked: boolean;
  manual: boolean;
  count: number;
  cover: string;
  track_ids: string[];
  owner?: string;
  visibility?: string;
  mine?: boolean;
  followed?: boolean;
  shared_with_me?: boolean;
  new?: boolean;
}

/** Oggetto "song" restituito da ricerca / risoluzione link (campi tutti opzionali). */
export interface Song {
  song_id?: string;
  name?: string;
  title?: string;
  artist?: string;
  artists?: string[];
  album_name?: string;
  cover_url?: string;
  url?: string;
  duration?: number;
  source?: string;
  explicit?: boolean;
  [key: string]: unknown;
}

export interface QueueJob {
  song: Song;
  status: 'queued' | 'downloading' | 'done' | 'error';
  progress: number;
  message?: string;
  filename?: string;
  position?: number | null;
  provider?: string;
  user_ids?: string[];
}

export interface LibraryResponse {
  cursor: number;
  full: boolean;
  tracks: Track[];
  deleted: string[];
}

export interface ResolvedUrl {
  kind: 'track' | 'album' | 'playlist' | 'artist';
  name: string;
  subtitle?: string;
  cover_url?: string;
  year?: string;
  tracks: Song[];
  albums: unknown[];
}

export interface ChartResponse {
  tracks: Song[];
  albums: unknown[];
  artists: unknown[];
  playlists: unknown[];
}

/* ------------------------------ Errori ------------------------------ */

export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return `Troppi tentativi. Riprova tra ${e.retryAfter ?? 60} secondi.`;
    if (e.status === 403) return 'Questa azione richiede un account amministratore (usa la pagina web).';
    if (e.status === 409 && /library/i.test(e.message)) return 'Il server è in modalità solo libreria.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Errore imprevisto';
}

/* ------------------------------ HTTP base ------------------------------ */

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError(0, 'Il server non risponde (timeout).');
    throw new ApiError(0, 'Impossibile raggiungere il server. Controlla indirizzo e rete.');
  } finally {
    clearTimeout(timer);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Errore HTTP ${res.status}`;
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') message = data.detail;
    else if (data?.detail) message = JSON.stringify(data.detail);
  } catch {}
  const ra = res.headers.get('Retry-After');
  return new ApiError(res.status, message, ra ? Number(ra) : undefined);
}

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export function deviceName(): string {
  return `Downtify Mobile (${Platform.OS})`;
}

/* ------------------------- Chiamate pre-autenticazione ------------------------- */

/** GET /api/server/info — pubblico. Verifica prodotto e versione API. */
export async function fetchServerInfo(baseUrl: string, timeoutMs = 8000): Promise<ServerInfo> {
  const res = await timedFetch(`${baseUrl}/api/server/info`, { headers: { Accept: 'application/json' } }, timeoutMs);
  if (!res.ok) throw await toApiError(res);
  let info: ServerInfo;
  try {
    info = await res.json();
  } catch {
    throw new ApiError(0, "L'indirizzo non risponde come un server Downtify.");
  }
  if (info.product !== 'Downtify') throw new ApiError(0, 'Questo server non è Downtify.');
  if (info.api_version > APP_API_VERSION) {
    throw new ApiError(0, `Il server usa l'API v${info.api_version}: aggiorna l'app.`);
  }
  return info;
}

async function postAuth(baseUrl: string, path: string, body: object): Promise<AuthResult> {
  const res = await timedFetch(
    `${baseUrl}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, device_name: deviceName(), platform: Platform.OS }),
    },
    15000,
  );
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export const signInWithPassword = (baseUrl: string, username: string, password: string) =>
  postAuth(baseUrl, '/api/auth/token', { username, password });

export const pairWithCode = (baseUrl: string, code: string) => postAuth(baseUrl, '/api/auth/pair', { code });

/* ------------------------------ Client API ------------------------------ */

export type StreamParams = { format?: string; bitrate?: string };

export class DowntifyApi {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
    private readonly onUnauthorized?: () => void,
  ) {}

  authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async request<T>(
    path: string,
    opts: { method?: string; query?: Query; body?: unknown; timeoutMs?: number } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...this.authHeaders() };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await timedFetch(
      `${this.baseUrl}${path}${qs(opts.query)}`,
      { method: opts.method ?? 'GET', headers, body },
      opts.timeoutMs,
    );
    if (res.status === 401) {
      this.onUnauthorized?.();
      throw await toApiError(res);
    }
    if (!res.ok) throw await toApiError(res);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /* --- URL helper (immagini con header Authorization) --- */
  coverUrl(trackId: string, size: 150 | 300 | 600 = 300) {
    return `${this.baseUrl}/api/v1/tracks/${trackId}/cover?size=${size}`;
  }
  playlistCoverUrl(path: string) {
    return `${this.baseUrl}/playlist-cover${qs({ file: path })}`;
  }
  streamUrl(trackId: string, p?: StreamParams) {
    return `${this.baseUrl}/api/v1/tracks/${trackId}/stream${qs(p as Query)}`;
  }
  wsUrl(clientId: string) {
    return `${this.baseUrl.replace(/^http/i, 'ws')}/api/ws${qs({ client_id: clientId })}`;
  }

  /* --- Libreria --- */
  library(since: number, refresh?: boolean) {
    return this.request<LibraryResponse>('/api/v1/library', {
      query: { since, refresh: refresh ? 'true' : undefined },
      timeoutMs: 120000,
    });
  }
  playlists() {
    return this.request<Playlist[]>('/api/v1/playlists');
  }
  likes() {
    return this.request<{ track_ids: string[] }>('/api/v1/likes');
  }
  setLike(trackId: string, liked: boolean) {
    return this.request('/api/v1/likes', { method: 'PUT', body: { track_id: trackId, liked } });
  }
  lyrics(trackId: string) {
    return this.request<{ synced: string; plain: string }>(`/api/v1/tracks/${trackId}/lyrics`);
  }

  /* --- Streaming con URL firmati (nessun header necessario) --- */
  async sign(items: { path: string; params?: Record<string, string> }[], ttl = 3600): Promise<string[]> {
    const r = await this.request<{ urls: string[] }>('/api/v1/sign', { method: 'POST', body: { items, ttl } });
    return r.urls.map((u) => (u.startsWith('http') ? u : `${this.baseUrl}${u}`));
  }

  /* --- Ricerca e download --- */
  search(query: string) {
    return this.request<Song[]>('/api/songs/search', { query: { query }, timeoutMs: 40000 });
  }
  chart(limit = 25) {
    return this.request<ChartResponse>('/api/discover/chart', { query: { limit }, timeoutMs: 30000 });
  }
  resolveUrl(url: string) {
    return this.request<ResolvedUrl>('/api/url/resolve', { query: { url }, timeoutMs: 60000 });
  }
  downloadBatch(songs: Song[], extra: { playlist_url?: string; playlist_name?: string } = {}) {
    return this.request<{ job_ids: string[]; count: number }>('/api/download/batch', {
      method: 'POST',
      body: { songs, generate_m3u: !!(extra.playlist_url || extra.playlist_name), ...extra },
    });
  }

  /* --- Coda download --- */
  queue() {
    return this.request<QueueJob[]>('/api/queue');
  }
  clearCompleted() {
    return this.request<{ removed: number }>('/api/queue/completed', { method: 'DELETE' });
  }

  /* --- Report ascolti / attività --- */
  reportListen(trackId: string, playId: string, playedAt = new Date().toISOString()) {
    return this.request('/api/discover/listens', {
      method: 'POST',
      body: { track_id: trackId, play_id: playId, played_at: playedAt },
    });
  }
  reportPlayback(
    player: string,
    state: 'playing' | 'paused' | 'stopped',
    track: Track | undefined,
    position: number,
  ) {
    return this.request('/api/activity/playback', {
      method: 'POST',
      body: {
        player,
        state,
        position,
        track: track
          ? { track_id: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration }
          : {},
      },
    });
  }
}
