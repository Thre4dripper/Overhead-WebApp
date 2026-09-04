import type { BBox } from './types';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash tiles are the unit of polling. Precision 4 ≈ 39 km × 19.5 km. */
export const TILE_PRECISION = 4;

export function geohashEncode(lat: number, lon: number, precision = TILE_PRECISION): string {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx *= 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32.charAt(idx); bit = 0; idx = 0; }
  }
  return hash;
}

export function geohashBounds(hash: string): BBox {
  let evenBit = true;
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  for (const ch of hash.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid geohash character: ${ch}`);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bitN === 1) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitN === 1) latMin = mid; else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lamin: latMin, lomin: lonMin, lamax: latMax, lomax: lonMax };
}

export function geohashDecode(hash: string): { lat: number; lon: number } {
  const b = geohashBounds(hash);
  return { lat: (b.lamin + b.lamax) / 2, lon: (b.lomin + b.lomax) / 2 };
}

export function isValidGeohash(hash: string, precision = TILE_PRECISION): boolean {
  return hash.length === precision && [...hash].every((c) => BASE32.includes(c));
}

/**
 * The tile containing the point plus any neighbours within `marginM` of it — a user on a tile
 * boundary is subscribed to both sides so aircraft don't pop at the seam.
 */
export function tilesCovering(lat: number, lon: number, marginM: number, precision = TILE_PRECISION): string[] {
  const dLat = (marginM / 6371008.8) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const out = new Set<string>();
  for (const la of [lat - dLat, lat, lat + dLat]) {
    for (const lo of [lon - dLon, lon, lon + dLon]) {
      if (la > 90 || la < -90) continue;
      out.add(geohashEncode(la, ((lo + 540) % 360) - 180, precision));
    }
  }
  return [...out];
}
