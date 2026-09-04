import type { FastifyInstance } from 'fastify';

/**
 * Magnetic declination for the AR view's Android path (alpha is magnetic; iOS's compass heading is
 * already true). Proxies NOAA's geomag calculator with a 24 h cache per 0.5° cell; returns null on
 * failure so the client can show its calibration prompt instead of silently pointing wrong.
 */
const cache = new Map<string, { at: number; value: number | null }>();

export function registerDeclination(app: FastifyInstance): void {
  app.get<{ Querystring: { lat?: string; lon?: string } }>('/api/declination', async (req, reply) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return reply.code(400).send({ error: 'lat/lon required' });
    const key = `${(Math.round(lat * 2) / 2).toFixed(1)},${(Math.round(lon * 2) / 2).toFixed(1)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 86_400_000) return { declination: hit.value, cached: true };
    let value: number | null = null;
    try {
      const url = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat.toFixed(3)}&lon1=${lon.toFixed(3)}&key=zNEw7&resultFormat=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Overhead/0.1' } });
      if (res.ok) {
        const j = (await res.json()) as { result?: { declination?: number }[] };
        const d = j.result?.[0]?.declination;
        if (typeof d === 'number' && Number.isFinite(d)) value = d;
      }
    } catch { /* leave null */ }
    cache.set(key, { at: Date.now(), value });
    return { declination: value, cached: false, source: value == null ? null : 'NOAA WMM' };
  });
}
