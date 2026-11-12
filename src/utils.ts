export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Minuscolo, senza accenti né punteggiatura: per ricerche e confronti. */
export function norm(s?: string | null): string {
  let out = (s ?? '').toLowerCase();
  try {
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {}
  return out.replace(/[^a-z0-9]+/g, ' ').trim();
}

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Percorso della libreria → parte di URL: ogni segmento codificato, gli "/" restano. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export interface LrcLine {
  time: number;
  text: string;
}

export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const m = line.match(/^\s*((?:\[\d+:\d+(?:[.:]\d+)?\]\s*)+)(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    const stamps = m[1].match(/\[\d+:\d+(?:[.:]\d+)?\]/g) ?? [];
    for (const st of stamps) {
      const mm = st.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/);
      if (!mm) continue;
      const sec = Number(mm[1]) * 60 + Number(mm[2]) + (mm[3] ? Number('0.' + mm[3]) : 0);
      out.push({ time: sec, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function songTitle(s: { name?: string; title?: string }): string {
  return s.name ?? s.title ?? 'Senza titolo';
}

export function songArtist(s: { artist?: string; artists?: string[] }): string {
  return s.artist ?? (s.artists ?? []).join(', ');
}

export function firstArtist(name: string): string {
  return name.split(/[;,&/]/)[0] ?? name;
}
