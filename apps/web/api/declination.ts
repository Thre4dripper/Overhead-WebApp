import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/declination?lat=&lon= — magnetic declination for the AR view's Android compass path, via
 * NOAA's calculator, cached a day per half-degree cell.
 */
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'lat/lon required' });
    return;
  }
  let declination: number | null = null;
  try {
    const r = await fetch(
      `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat.toFixed(2)}&lon1=${lon.toFixed(2)}&key=zNEw7&resultFormat=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (r.ok) {
      const j = (await r.json()) as { result?: { declination?: number }[] };
      const d = j.result?.[0]?.declination;
      if (typeof d === 'number' && Number.isFinite(d)) declination = d;
    }
  } catch { /* leave null: the client shows its calibration prompt */ }
  res.setHeader('cache-control', declination == null ? 'no-store' : 'public, s-maxage=86400');
  res.status(200).json({ declination, source: declination == null ? null : 'NOAA WMM' });
}
