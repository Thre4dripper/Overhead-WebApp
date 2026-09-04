// Shared helpers for the edge functions: OpenSky OAuth2 (credentials from Vercel env), JSON responses.
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
export const OPENSKY_BASE = 'https://opensky-network.org/api';

let token: { value: string; exp: number } | null = null;

/** Bearer token when OPENSKY_CLIENT_ID/SECRET are configured; null → anonymous (400 credits/day, shared by this deployment's egress IP). */
export async function accessToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID, secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
  });
  if (!res.ok) throw new Error(`OpenSky token request failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

/** Seconds a tile frame stays in Vercel's edge cache — every viewer of a tile shares one upstream call per window. */
export const FRAME_TTL_S = Math.max(10, Number(process.env.FRAME_TTL_S ?? 20) || 20);
