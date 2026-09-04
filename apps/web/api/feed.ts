import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/feed?tile=<geohash4> — a thin, cached proxy in front of one live aircraft feed, so the whole
 * project can run on Vercel with no server of its own.
 *
 * Why a proxy at all: browsers cannot call these feeds directly (OpenSky answers with
 * `access-control-allow-origin: https://opensky-network.org`), and any API credentials must stay off
 * the client.
 *
 * Why the default upstream is adsb.lol and not OpenSky: **OpenSky's network refuses Vercel's egress.**
 * Measured 2026-09-04 from Vercel functions in both bom1 and fra1, and from the edge runtime:
 * `opensky-network.org`, its `/api/states/all` and `auth.opensky-network.org` all time out, while
 * adsb.lol answers in ~57 ms and NOAA in ~690 ms from the same function. OpenSky therefore only works
 * from a host it accepts (the relay in apps/api, on your own machine or a small VM), where it also has
 * the aircraft-database join. Set FEED=opensky here if that ever changes.
 *
 * Two rules keep it cheap: the query is keyed on a geohash-4 tile (~39 × 19.5 km) rather than an
 * arbitrary bounding box, so every viewer of an area shares one cache entry; and the response carries
 * `s-maxage` of REFRESH_SECONDS, so Vercel's CDN answers repeat views without touching the upstream. The body is the
 * upstream's own JSON, untouched — the browser parses it with the same schemas the relay uses, so
 * there is exactly one parser per feed format in the project.
 *
 * Constraints worth knowing before editing: this file may not import the workspace (Vercel bundles each
 * function alone and `@overhead/shared` fails the build with "referencing unsupported modules"), and no
 * test may live under api/ (every file there becomes a public endpoint). `geohashBounds` is therefore
 * inlined here, and `src/lib/edge-functions.test.ts` asserts it matches the shared implementation.
 */
export const maxDuration = 20;

const OPENSKY_BASE = 'https://opensky-network.org/api';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const ADSBLOL_BASE = 'https://api.adsb.lol';
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const TOKEN_TIMEOUT_MS = 8000;
const UPSTREAM_TIMEOUT_MS = 12_000;

/** 'adsblol' (default, reachable from Vercel, carries aircraft types) or 'opensky' (needs a host it accepts). */
export type Feed = 'adsblol' | 'opensky';
export const feedName = (raw: string | undefined): Feed => (raw === 'opensky' ? 'opensky' : 'adsblol');

/** Great-circle radius in nautical miles that covers a tile from its centre, for the point+radius feeds. */
function tileRadiusNm(b: { lamin: number; lomin: number; lamax: number; lomax: number }): number {
  const R = 6371.0088, d2r = Math.PI / 180;
  const cLat = (b.lamin + b.lamax) / 2, cLon = (b.lomin + b.lomax) / 2;
  const dLat = (b.lamax - cLat) * d2r, dLon = (b.lomax - cLon) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(cLat * d2r) ** 2 * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.min(250, Math.ceil(km * 0.539957) + 1);
}

/** Decode a geohash to its bounding box. Mirrors `geohashBounds` in @overhead/shared. */
export function geohashBounds(hash: string): { lamin: number; lomin: number; lamax: number; lomax: number } {
  let evenBit = true;
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  for (const ch of hash.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid geohash character: ${ch}`);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bitN === 1) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitN === 1) latMin = mid; else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lamin: latMin, lomin: lonMin, lamax: latMax, lomax: lonMax };
}

export const isTile = (s: string): boolean => s.length === 4 && [...s].every((c) => BASE32.includes(c));

let token: { value: string; exp: number } | null = null;

/**
 * Bearer token from the OAuth2 client credentials, cached until it expires.
 * Falls back to null — anonymous, 400 credits a day for this deployment — when the credentials are
 * absent or the token endpoint fails. Anonymous data beats no data; the response says which was used.
 */
async function accessToken(): Promise<{ value: string | null; error?: string }> {
  const id = process.env.OPENSKY_CLIENT_ID, secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return { value: null };
  if (token && token.exp > Date.now() + 30_000) return { value: token.value };
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!res.ok) return { value: null, error: `token ${res.status}` };
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return { value: null, error: 'token response had no access_token' };
    token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 1800) * 1000 };
    return { value: token.value };
  } catch (err) {
    return { value: null, error: `token ${(err as Error).name}: ${(err as Error).message}` };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // every path is guarded: an uncaught throw would surface as Vercel's opaque "internal error"
  let stage = 'request';
  const feed = feedName(process.env.FEED);
  try {
    const raw = req.query.tile;
    const tile = String(Array.isArray(raw) ? raw[0] : raw ?? '').toLowerCase();
    if (!isTile(tile)) {
      res.setHeader('cache-control', 'no-store');
      res.status(400).json({ error: 'tile must be a 4-character geohash', stage });
      return;
    }
    const b = geohashBounds(tile);
    const ttlS = Math.max(10, Number(process.env.REFRESH_SECONDS ?? 30) || 30);
    res.setHeader('x-feed', feed);

    let url: string;
    let headers: Record<string, string> = { 'user-agent': 'Overhead/0.1 (hobby project; github.com/overhead-app)', accept: 'application/json' };
    if (feed === 'opensky') {
      stage = 'token';
      const tToken = Date.now();
      const auth = await accessToken();
      res.setHeader('x-opensky-auth', auth.value ? 'bearer' : 'anonymous');
      res.setHeader('x-opensky-token-ms', String(Date.now() - tToken));
      if (auth.error) res.setHeader('x-opensky-token-error', auth.error.slice(0, 120));
      if (auth.value) headers = { ...headers, authorization: `Bearer ${auth.value}` };
      url = `${OPENSKY_BASE}/states/all?lamin=${b.lamin.toFixed(4)}&lomin=${b.lomin.toFixed(4)}&lamax=${b.lamax.toFixed(4)}&lomax=${b.lomax.toFixed(4)}&extended=1`;
    } else {
      const cLat = ((b.lamin + b.lamax) / 2).toFixed(4), cLon = ((b.lomin + b.lomax) / 2).toFixed(4);
      url = `${ADSBLOL_BASE}/v2/lat/${cLat}/lon/${cLon}/dist/${tileRadiusNm(b)}`;
    }

    stage = 'upstream';
    const tUp = Date.now();
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    res.setHeader('x-upstream-ms', String(Date.now() - tUp));
    const remaining = upstream.headers.get('x-rate-limit-remaining') ?? '';

    if (upstream.status === 429) {
      const retryAfterS = Number(upstream.headers.get('x-rate-limit-retry-after-seconds') ?? upstream.headers.get('retry-after') ?? 600) || 600;
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-credits-remaining', '0');
      res.status(429).json({ error: 'quota', retryAfterS, feed });
      return;
    }
    if (upstream.status === 401 || upstream.status === 403) {
      token = null; // a stale cached token is the usual cause; force re-authentication next time
      res.setHeader('cache-control', 'no-store');
      res.status(502).json({ error: `upstream ${upstream.status}`, stage, feed });
      return;
    }
    if (!upstream.ok) {
      res.setHeader('cache-control', 'no-store');
      res.status(502).json({ error: `upstream ${upstream.status}`, stage, feed });
      return;
    }

    stage = 'body';
    const body = await upstream.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', `public, s-maxage=${ttlS}, stale-while-revalidate=${ttlS * 2}`);
    if (remaining) res.setHeader('x-credits-remaining', remaining);
    res.setHeader('x-tile', tile);
    res.status(200).send(body);
  } catch (err) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: `${(err as Error).name}: ${(err as Error).message}`, stage, feed });
  }
}
