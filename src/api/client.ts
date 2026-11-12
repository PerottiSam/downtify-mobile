import { Platform } from "react-native";
import { encodePath } from "../utils";

/* ------------------------------- Tipi ------------------------------- */

export interface ServerInfo {
  server_id: string;
  name: string;
  product: string;
  version: string;
  require_sign_in: boolean;
  library_only?: boolean;
  capabilities?: { password_sign_in?: boolean; pairing?: boolean };
}

export interface UserInfo {
  username: string;
  role: string;
}

export interface AuthResult {
  token: string;
  user: UserInfo;
}

/** Riga di `GET /tracks`. Non esiste un id: un brano è identificato dal percorso `file`. */
export interface Track {
  file: string;
  title: string;
  artist: string;
  artists?: string[];
  album: string;
  album_artist?: string;
  compilation?: boolean;
  track_number?: number;
  year?: string;
  duration: number;
  codec?: string;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  explicit?: boolean;
  has_cover?: boolean;
  added?: number;
  size?: number;
  playlists?: string[];
}

/** Riga di `GET /playlists`. `files` è nell'ordine della playlist e può ripetere un brano. */
export interface Playlist {
  name: string;
  files: string[];
  count: number;
  added?: number;
  cover: string;
  liked: boolean;
  manual: boolean;
  owner?: string;
  visibility?: string;
  mine?: boolean;
  can_edit_tracks?: boolean;
}

/** Oggetto "song" di ricerca / classifica / link (campi tutti opzionali). */
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
  status: "queued" | "downloading" | "done" | "error";
  progress: number;
  message?: string;
  filename?: string;
  position?: number | null;
  provider?: string;
  user_ids?: string[];
}

export interface QueueState {
  paused: boolean;
  state: "running" | "pausing" | "paused";
  active: number;
}

export interface ResolvedUrl {
  kind: "track" | "album" | "playlist" | "artist";
  name: string;
  subtitle?: string;
  cover_url?: string;
  year?: string;
  tracks: Song[];
  albums: unknown[];
}

export interface ChartResponse {
  tracks: Song[];
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
    if (e.status === 429)
      return `Troppi tentativi. Riprova tra ${e.retryAfter ?? 60} secondi.`;
    if (e.status === 403)
      return "Questa azione richiede la pagina web (account amministratore).";
    if (e.status === 409 && /library/i.test(e.message))
      return "Il server è in modalità solo libreria.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Errore imprevisto";
}

/* ------------------------------ HTTP base ------------------------------ */

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError")
      throw new ApiError(0, "Il server non risponde (timeout).");
    throw new ApiError(
      0,
      "Impossibile raggiungere il server. Controlla indirizzo e rete.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Errore HTTP ${res.status}`;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
    else if (data?.detail) message = JSON.stringify(data.detail);
  } catch {}
  const ra = res.headers.get("Retry-After");
  return new ApiError(res.status, message, ra ? Number(ra) : undefined);
}

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, "");
}

export function deviceName(): string {
  return `Downtify Mobile (${Platform.OS})`;
}

/* ------------------------- Chiamate pre-autenticazione ------------------------- */

/** GET /api/server/info — pubblico. Basta verificare che sia davvero Downtify. */
export async function fetchServerInfo(
  baseUrl: string,
  timeoutMs = 8000,
): Promise<ServerInfo> {
  const res = await timedFetch(
    `${baseUrl}/api/server/info`,
    { headers: { Accept: "application/json" } },
    timeoutMs,
  );
  if (!res.ok) throw await toApiError(res);
  let info: ServerInfo;
  try {
    info = await res.json();
  } catch {
    throw new ApiError(0, "L'indirizzo non risponde come un server Downtify.");
  }
  if (info.product !== "Downtify")
    throw new ApiError(0, "Questo server non è Downtify.");
  return info;
}

async function postAuth(
  baseUrl: string,
  path: string,
  body: object,
): Promise<AuthResult> {
  const res = await timedFetch(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...body,
        device_name: deviceName(),
        platform: Platform.OS,
      }),
    },
    15000,
  );
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export const signInWithPassword = (
  baseUrl: string,
  username: string,
  password: string,
) => postAuth(baseUrl, "/api/auth/token", { username, password });

export const pairWithCode = (baseUrl: string, code: string) =>
  postAuth(baseUrl, "/api/auth/pair", { code });

/* ------------------------------ Client API ------------------------------ */

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
    opts: {
      method?: string;
      query?: Query;
      body?: unknown;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.authHeaders(),
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await timedFetch(
      `${this.baseUrl}${path}${qs(opts.query)}`,
      { method: opts.method ?? "GET", headers, body },
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

  /* --- URL di file (audio e immagini; vanno con l'header Authorization) --- */
  mediaUrl(file: string) {
    return `${this.baseUrl}/downloads/${encodePath(file)}`;
  }
  coverUrl(file: string, size: 150 | 300 | 600 = 300) {
    return `${this.baseUrl}/cover${qs({ file, size })}`;
  }
  playlistCoverUrl(path: string) {
    return `${this.baseUrl}/playlist-cover${qs({ file: path })}`;
  }
  wsUrl(clientId: string) {
    return `${this.baseUrl.replace(/^http/i, "ws")}/api/ws${qs({ client_id: clientId })}`;
  }

  /* --- Libreria --- */
  tracks() {
    return this.request<Track[]>("/tracks", { timeoutMs: 120000 });
  }
  /** Scarta la cache del server e riscansiona la cartella (pull to refresh). */
  rescan() {
    return this.request<string[]>("/list", {
      query: { refresh: "true" },
      timeoutMs: 120000,
    });
  }
  playlists() {
    return this.request<Playlist[]>("/playlists");
  }
  lyrics(file: string) {
    return this.request<{ synced: string; plain: string }>("/lyrics", {
      query: { file },
    });
  }

  /**
   * Preferiti. La lettura viene dalla playlist `liked` di GET /playlists (documentata).
   * ⚠ Il corpo di PUT /api/likes non è nella parte di documentazione che ho potuto leggere:
   * qui è `{ file, liked }`. Se il tuo server vuole un altro formato, si cambia solo qui.
   */
  setLike(file: string, liked: boolean) {
    return this.request("/api/likes", { method: "PUT", body: { file, liked } });
  }

  /* --- Ricerca e download --- */
  search(query: string) {
    return this.request<Song[]>("/api/songs/search", {
      query: { query },
      timeoutMs: 40000,
    });
  }
  chart(limit = 25) {
    return this.request<ChartResponse>("/api/discover/chart", {
      query: { limit },
      timeoutMs: 30000,
    });
  }
  resolveUrl(url: string) {
    return this.request<ResolvedUrl>("/api/url/resolve", {
      query: { url },
      timeoutMs: 60000,
    });
  }
  downloadBatch(
    songs: Song[],
    extra: { playlist_url?: string; playlist_name?: string } = {},
  ) {
    return this.request<{ job_ids: string[]; count: number }>(
      "/api/download/batch",
      {
        method: "POST",
        body: {
          songs,
          generate_m3u: !!(extra.playlist_url || extra.playlist_name),
          ...extra,
        },
      },
    );
  }

  /* --- Coda download --- */
  queue() {
    return this.request<QueueJob[]>("/api/queue");
  }
  queueState() {
    return this.request<QueueState>("/api/queue/state");
  }
  clearCompleted() {
    return this.request<{ removed: number }>("/api/queue/completed", {
      method: "DELETE",
    });
  }
  removeQueueItem(songId: string) {
    return this.request<{ removed: boolean }>("/api/queue/item", {
      method: "DELETE",
      query: { song_id: songId },
    });
  }

  /** "Sta ascoltando" per la pagina Attività degli admin. */
  reportPlayback(
    player: string,
    state: "playing" | "paused" | "stopped",
    track: Track | undefined,
    position: number,
  ) {
    return this.request("/api/activity/playback", {
      method: "POST",
      body: {
        player,
        state,
        position,
        track: track
          ? {
              track_id: track.file,
              title: track.title,
              artist: track.artist,
              album: track.album,
              duration: track.duration,
            }
          : {},
      },
    });
  }
}
