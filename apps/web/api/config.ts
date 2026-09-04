import { FRAME_TTL_S, json } from './_opensky';

export const config = { runtime: 'edge' };

/** Same contract as the relay's /api/config, so the web app needs no mode switch. */
export default function handler(): Response {
  const authed = Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
  return json({
    provider: 'opensky-edge',
    attribution: 'Aircraft data: The OpenSky Network',
    pollIntervalMs: FRAME_TTL_S * 1000,
    transport: 'poll',
    authenticated: authed,
    aircraftDbRows: 0,
  }, 200, { 'cache-control': 'public, s-maxage=300' });
}
