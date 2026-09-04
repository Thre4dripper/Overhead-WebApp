import { flightLevel, formatFeet, metersToFeet } from '@overhead/altitude';

export const KNOTS_PER_MPS = 1.943844492;
export const FPM_PER_MPS = 196.8503937;
export const NM_PER_KM = 0.539956803;

export const mpsToKnots = (mps: number): number => mps * KNOTS_PER_MPS;
export const knotsToMps = (kt: number): number => kt / KNOTS_PER_MPS;
export const mpsToFpm = (mps: number): number => mps * FPM_PER_MPS;
export const fpmToMps = (fpm: number): number => fpm / FPM_PER_MPS;
export const kmToNm = (km: number): number => km * NM_PER_KM;
export const nmToKm = (nm: number): number => nm / NM_PER_KM;

/** "38 000 ft" from metres. Null-safe: returns "—" for a missing altitude. */
export function fmtAltitude(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return `${formatFeet(metersToFeet(m))} ft`;
}

/** "FL370" above the transition altitude, otherwise the feet string. */
export function fmtFlightLevel(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return '—';
  const ft = metersToFeet(m);
  return ft >= 18000 ? flightLevel(ft) : `${formatFeet(ft)} ft`;
}

export function fmtSpeed(mps: number | null): string {
  if (mps == null || !Number.isFinite(mps)) return '—';
  return `${Math.round(mpsToKnots(mps))} kt`;
}

export function fmtVerticalRate(mps: number | null): string {
  if (mps == null || !Number.isFinite(mps)) return '—';
  const fpm = Math.round(mpsToFpm(mps) / 50) * 50;
  if (Math.abs(fpm) < 100) return 'level';
  return `${fpm > 0 ? '+' : '−'}${formatFeet(Math.abs(fpm))} ft/min`;
}

export function fmtHeading(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return '—';
  return `${String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')}°`;
}

export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Climb/descend/level glyph as the HUD asset draws it. */
export function trendArrow(verticalRateMps: number | null): '↑' | '↓' | '→' {
  if (verticalRateMps == null) return '→';
  if (verticalRateMps > 1.5) return '↑';
  if (verticalRateMps < -1.5) return '↓';
  return '→';
}

export function fmtAgo(epochS: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round(nowMs / 1000 - epochS));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Emergency and special-purpose squawks: 7500 hijack, 7600 radio failure, 7700 general emergency. */
export function squawkMeaning(squawk: string | null): string | null {
  switch (squawk) {
    case '7500': return 'Hijack';
    case '7600': return 'Radio failure';
    case '7700': return 'Emergency';
    case '1200': return 'VFR (US)';
    case '7000': return 'VFR (Europe)';
    case '2000': return 'No code assigned';
    default: return null;
  }
}
export const isEmergencySquawk = (squawk: string | null): boolean => squawk === '7500' || squawk === '7600' || squawk === '7700';
