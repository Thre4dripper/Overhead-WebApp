export class UpstreamError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number | null = null) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * adsb.lol rejects generic User-Agents ("User-Agent too generic; include valid contact info").
 * Set UPSTREAM_CONTACT (a URL or email the feed operators can reach) in .env; it is appended here.
 */
export const USER_AGENT = `Overhead/0.1 (+https://github.com/overhead-app${process.env.UPSTREAM_CONTACT ? `; contact: ${process.env.UPSTREAM_CONTACT}` : ''})`;

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const ra = res.headers.get('x-rate-limit-retry-after-seconds') ?? res.headers.get('retry-after');
      const retryAfterMs = ra ? (Number.isFinite(Number(ra)) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : null;
      throw new UpstreamError(`${res.status} ${res.statusText} from ${new URL(url).host}`, res.status, retryAfterMs);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
