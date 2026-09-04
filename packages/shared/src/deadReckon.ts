import { destination } from './geo';
import type { StateVector } from './types';

/**
 * Where an aircraft is `dtSeconds` after its last report, assuming it kept its ground speed,
 * track and vertical rate. Both horizontal and vertical motion are extrapolated, because a
 * climbing aircraft that only moved horizontally would visibly jump up the compressed altitude
 * mapping when the next real position lands.
 */
export function deadReckon<T extends Pick<StateVector, 'lat' | 'lon' | 'baroAltM' | 'velocityMps' | 'trackDeg' | 'verticalRateMps'>>(
  sv: T,
  dtSeconds: number,
): { lat: number; lon: number; baroAltM: number | null } {
  const dt = Math.max(0, dtSeconds);
  let lat = sv.lat, lon = sv.lon;
  if (sv.velocityMps != null && sv.trackDeg != null && sv.velocityMps > 0.5 && dt > 0) {
    const d = destination(sv.lat, sv.lon, sv.trackDeg, sv.velocityMps * dt);
    lat = d.lat; lon = d.lon;
  }
  let baroAltM = sv.baroAltM;
  if (baroAltM != null && sv.verticalRateMps != null && dt > 0) {
    baroAltM = Math.max(-500, baroAltM + sv.verticalRateMps * dt);
  }
  return { lat, lon, baroAltM };
}

/** Shortest signed angular difference b − a in degrees, in (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** Smoothstep 0..1 */
export const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
