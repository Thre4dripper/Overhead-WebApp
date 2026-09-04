const envApi = import.meta.env.VITE_API_URL?.trim();

/**
 * Where the aircraft feed lives. Blank means "this same origin", which covers both the serverless
 * deployment (the functions in apps/web/api) and a single host serving the web app and the relay
 * behind one proxy. Otherwise it is the relay's base URL, and the WebSocket URL is derived from it —
 * one variable instead of two that could disagree.
 */
export const API_URL = envApi && envApi.length > 0 ? envApi.replace(/\/$/, '') : window.location.origin;
export const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;

/**
 * How the browser gets frames:
 *   'auto' (default) — ask GET /api/config: a relay advertises a socket, so use WebSocket push;
 *                      the serverless functions do not, so poll. Neither reachable → demo traffic.
 *   'ws'   — force the relay's WebSocket.
 *   'poll' — force HTTP polling.
 * `?transport=ws|poll` on the URL overrides the build setting, which is handy for comparing them.
 */
export type Transport = 'auto' | 'ws' | 'poll';
const tParam = new URLSearchParams(window.location.search).get('transport');
export const TRANSPORT: Transport = (tParam === 'ws' || tParam === 'poll' ? tParam : (import.meta.env.VITE_TRANSPORT as Transport | undefined)) ?? 'auto';

/** Fallback cadence, used only until GET /api/config states the real one. */
export const DEFAULT_POLL_MS = 30_000;

export const DEFAULT_HOME = {
  lat: Number(import.meta.env.VITE_DEFAULT_LAT ?? 51.47),
  lon: Number(import.meta.env.VITE_DEFAULT_LON ?? -0.3),
};

export async function apiGet<T>(path: string, timeoutMs = 6000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } finally { clearTimeout(t); }
}

export async function apiSend<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}
