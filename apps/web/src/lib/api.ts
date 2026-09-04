const envApi = import.meta.env.VITE_API_URL?.trim();
const envWs = import.meta.env.VITE_WS_URL?.trim();

export const API_URL = envApi && envApi.length > 0 ? envApi.replace(/\/$/, '') : window.location.origin;
export const WS_URL = envWs && envWs.length > 0 ? envWs : `${API_URL.replace(/^http/, 'ws')}/ws`;

/**
 * Transport to the aircraft feed:
 *   'ws'   — the relay's WebSocket (push, clustered polling, aircraft-database join)
 *   'poll' — HTTP GET /api/tiles/<tile>/frame every POLL_INTERVAL_MS. Served either by the relay or, with
 *            no server at all, by the Vercel edge functions in apps/web/api (cached per tile at the edge,
 *            OpenSky credentials in Vercel env, no CORS because it is the same origin)
 *   'auto' — try ws, fall back to poll, then to demo traffic
 * `?transport=poll|ws` on the URL overrides the build setting for testing.
 */
export type Transport = 'auto' | 'ws' | 'poll';
const tParam = new URLSearchParams(window.location.search).get('transport');
export const TRANSPORT: Transport = (tParam === 'ws' || tParam === 'poll' ? tParam : (import.meta.env.VITE_TRANSPORT as Transport | undefined)) ?? 'auto';
export const POLL_INTERVAL_MS = Math.max(10_000, Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 20_000) || 20_000);

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
