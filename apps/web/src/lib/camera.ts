import type { Map as MlMap } from 'maplibre-gl';

export const MAX_PITCH = 80;          // brief: start at 75, treat higher as an experiment to measure; never horizontal
export const HOME_PITCH = 72;
/** vertical field of view in degrees; MapLibre's default 36.87° hides the horizon below pitch 71.6°, 50° shows it from 65° */
export const VERTICAL_FOV = 50;
export const HOME_ZOOM = 14.4;
export const FLAT_BELOW_ZOOM = 13.6;  // buildings only make sense from ~z14; below, flat icons on a flat map
export const PITCH_PRESETS = [55, HOME_PITCH, MAX_PITCH];

/** Home framing: the user's point sits in the lower third, camera looking north and out over the skyline. */
export function flyHome(map: MlMap, lat: number, lon: number, animate = true): void {
  const h = map.getContainer().clientHeight;
  const opts = { center: [lon, lat] as [number, number], zoom: HOME_ZOOM, pitch: HOME_PITCH, bearing: 0, padding: { top: 0, bottom: Math.round(h * 0.22), left: 0, right: 0 } };
  if (animate) map.easeTo({ ...opts, duration: 1400, essential: true }); else map.jumpTo(opts);
}

export function lookAt(map: MlMap, lat: number, lon: number): void {
  const h = map.getContainer().clientHeight;
  map.easeTo({ center: [lon, lat], padding: { top: 0, bottom: Math.round(h * 0.3), left: 0, right: 0 }, duration: 900, essential: true });
}

export function resetNorth(map: MlMap): void { map.easeTo({ bearing: 0, duration: 600, essential: true }); }

export function cyclePitch(map: MlMap): void {
  const p = map.getPitch();
  const next = PITCH_PRESETS.find((x) => x > p + 2) ?? PITCH_PRESETS[0]!;
  map.easeTo({ pitch: next, duration: 600, essential: true });
}

/** Metres per CSS pixel at the map centre (for the scale bar). */
export function metersPerPixel(map: MlMap): number {
  const lat = map.getCenter().lat;
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
}

export function niceScale(mpp: number, maxPx = 80): { metres: number; px: number; label: string } {
  const target = mpp * maxPx;
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  let m = steps[0]!;
  for (const s of steps) if (s <= target) m = s;
  return { metres: m, px: m / mpp, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}
