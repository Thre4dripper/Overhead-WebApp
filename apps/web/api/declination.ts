import { json } from './_opensky';

export const config = { runtime: 'edge' };

/** Magnetic declination for the AR view's Android path, via NOAA; cached a day per half-degree cell. */
export default async function handler(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat')), lon = Number(u.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'lat/lon required' }, 400);
  let declination: number | null = null;
  try {
    const res = await fetch(`https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat.toFixed(2)}&lon1=${lon.toFixed(2)}&key=zNEw7&resultFormat=json`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) { const j = (await res.json()) as { result?: { declination?: number }[] }; const d = j.result?.[0]?.declination; if (typeof d === 'number' && Number.isFinite(d)) declination = d; }
  } catch { /* leave null */ }
  return json({ declination, source: declination == null ? null : 'NOAA WMM' }, 200, { 'cache-control': 'public, s-maxage=86400' });
}
