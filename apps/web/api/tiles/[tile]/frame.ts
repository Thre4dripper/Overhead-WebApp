import { airlineFromCallsign, geohashBounds, isValidGeohash, openSkyStatesUrl, parseOpenSkyResponse, resolveCategory, type Aircraft, type TileFrame } from '@overhead/shared';
import { accessToken, FRAME_TTL_S, json, OPENSKY_BASE } from '../../_opensky';

export const config = { runtime: 'edge' };

/**
 * GET /api/tiles/<geohash4>/frame — the same shape the relay serves, produced statelessly at the edge.
 * The response is cached by URL for FRAME_TTL_S, so N viewers of one tile cost one OpenSky call per
 * window per region. No aircraft database here: category comes from the emitter class.
 */
export default async function handler(req: Request): Promise<Response> {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const tile = (parts[parts.length - 2] ?? '').toLowerCase();
  if (!isValidGeohash(tile)) return json({ error: 'bad tile' }, 400, { 'cache-control': 'no-store' });
  try {
    const bearer = await accessToken();
    const res = await fetch(openSkyStatesUrl(OPENSKY_BASE, geohashBounds(tile)), { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    const remaining = res.headers.get('x-rate-limit-remaining') ?? '';
    if (res.status === 429) {
      const retryAfterS = Number(res.headers.get('x-rate-limit-retry-after-seconds') ?? 600) || 600;
      return json({ error: 'quota', retryAfterS }, 429, { 'cache-control': 'no-store', 'x-credits-remaining': '0' });
    }
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502, { 'cache-control': 'no-store' });
    const parsed = parseOpenSkyResponse(await res.json());
    const aircraft: Aircraft[] = parsed.aircraft.map((sv) => {
      const airline = airlineFromCallsign(sv.callsign);
      return { ...sv, category: resolveCategory({ typeCode: sv.typeCode, typeDescription: sv.typeDescription, emitterCategory: sv.emitterCategory }), operator: airline, model: null, airline };
    });
    const frame: TileFrame = { tile, t: parsed.time * 1000, aircraft, provider: bearer ? 'opensky-edge' : 'opensky-edge-anonymous' };
    return json(frame, 200, {
      'cache-control': `public, s-maxage=${FRAME_TTL_S}, stale-while-revalidate=${FRAME_TTL_S}`,
      'x-credits-remaining': remaining,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 502, { 'cache-control': 'no-store' });
  }
}
