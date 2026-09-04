const envApi = import.meta.env.VITE_API_URL?.trim();
const envWs = import.meta.env.VITE_WS_URL?.trim();

export const API_URL = envApi && envApi.length > 0 ? envApi.replace(/\/$/, '') : window.location.origin;
export const WS_URL = envWs && envWs.length > 0 ? envWs : `${API_URL.replace(/^http/, 'ws')}/ws`;

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
