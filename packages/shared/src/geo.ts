import type { BBox } from './types';

export const EARTH_RADIUS_M = 6371008.8;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from true north. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * D2R, φ2 = lat2 * D2R, Δλ = (lon2 - lon1) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * R2D) + 360) % 360;
}

/**
 * Elevation angle of an aircraft as seen from the observer, degrees above the horizon.
 * ALWAYS from TRUE altitude — the compressed value is a render device and would lie here.
 */
export function elevationDeg(altitudeAboveObserverM: number, groundDistanceM: number): number {
  return Math.atan2(altitudeAboveObserverM, Math.max(1, groundDistanceM)) * R2D;
}

/** Destination point along a bearing for a distance — used for dead reckoning. */
export function destination(lat: number, lon: number, bearing: number, distanceM: number): { lat: number; lon: number } {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = bearing * D2R;
  const φ1 = lat * D2R, λ1 = lon * D2R;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return { lat: φ2 * R2D, lon: (((λ2 * R2D) + 540) % 360) - 180 };
}

export function bboxAround(lat: number, lon: number, radiusM: number): BBox {
  const dLat = (radiusM / EARTH_RADIUS_M) * R2D;
  const dLon = dLat / Math.max(0.05, Math.cos(lat * D2R));
  return { lamin: Math.max(-90, lat - dLat), lamax: Math.min(90, lat + dLat), lomin: lon - dLon, lomax: lon + dLon };
}

export function bboxAreaSqDeg(b: BBox): number {
  return Math.abs(b.lamax - b.lamin) * Math.abs(b.lomax - b.lomin);
}

export function bboxCenter(b: BBox): { lat: number; lon: number } {
  return { lat: (b.lamin + b.lamax) / 2, lon: (b.lomin + b.lomax) / 2 };
}

export function inBBox(lat: number, lon: number, b: BBox): boolean {
  return lat >= b.lamin && lat <= b.lamax && lon >= b.lomin && lon <= b.lomax;
}

/** Radius in metres of the circle that covers the bbox from its centre. */
export function bboxRadiusM(b: BBox): number {
  const c = bboxCenter(b);
  return haversineM(c.lat, c.lon, b.lamax, b.lomax);
}

export function normalizeLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}
