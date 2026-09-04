import type { StateVector } from '@overhead/shared';
import { z } from 'zod';

/**
 * OpenSky /api/states/all returns positional arrays, not objects. Index order (verified against a
 * live anonymous response on 2026-09-04, 17 elements; 18 with `extended=1`):
 *   0 icao24  1 callsign  2 origin_country  3 time_position  4 last_contact  5 longitude  6 latitude
 *   7 baro_altitude  8 on_ground  9 velocity  10 true_track  11 vertical_rate  12 sensors
 *   13 geo_altitude  14 squawk  15 spi  16 position_source  [17 category]
 * A silent index shift corrupts everything downstream, so each slot is type-checked at runtime.
 */
export const OpenSkyState = z.tuple([
  z.string(),                              // 0 icao24
  z.string().nullable(),                   // 1 callsign
  z.string(),                              // 2 origin_country
  z.number().nullable(),                   // 3 time_position
  z.number(),                              // 4 last_contact
  z.number().nullable(),                   // 5 longitude
  z.number().nullable(),                   // 6 latitude
  z.number().nullable(),                   // 7 baro_altitude (m)
  z.boolean(),                             // 8 on_ground
  z.number().nullable(),                   // 9 velocity (m/s)
  z.number().nullable(),                   // 10 true_track (deg)
  z.number().nullable(),                   // 11 vertical_rate (m/s)
  z.array(z.number()).nullable(),          // 12 sensors
  z.number().nullable(),                   // 13 geo_altitude (m)
  z.string().nullable(),                   // 14 squawk
  z.boolean(),                             // 15 spi
  z.number(),                              // 16 position_source 0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM
]).rest(z.number().nullable());            // 17 category (extended=1 only)

export const OpenSkyResponse = z.object({
  time: z.number(),
  states: z.array(z.unknown()).nullable(),
});

const POSITION_SOURCE: Record<number, StateVector['positionSource']> = { 0: 'adsb', 1: 'other', 2: 'mlat', 3: 'other' };

/** OpenSky's numeric emitter category → the ADS-B letter code the rest of the app speaks. */
const CATEGORY_CODE: Record<number, string> = {
  2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7', 9: 'B1', 10: 'B2', 11: 'B3', 12: 'B4', 14: 'B6', 15: 'B7', 16: 'C1', 17: 'C2', 18: 'C3',
};

export function openskyToStateVector(raw: unknown): StateVector | null {
  const p = OpenSkyState.safeParse(raw);
  if (!p.success) return null;
  const s = p.data;
  const lon = s[5], lat = s[6];
  if (lon == null || lat == null) return null;
  const cat = s[17];
  return {
    icao24: s[0].toLowerCase(),
    callsign: s[1]?.trim() || null,
    lat,
    lon,
    baroAltM: s[7],
    geoAltM: s[13],
    onGround: s[8],
    velocityMps: s[9],
    trackDeg: s[10],
    verticalRateMps: s[11],
    squawk: s[14],
    originCountry: s[2] || null,
    timePosition: s[3] ?? s[4],
    lastContact: s[4],
    emitterCategory: typeof cat === 'number' ? (CATEGORY_CODE[cat] ?? null) : null,
    registration: null,
    typeCode: null,
    typeDescription: null,
    positionSource: POSITION_SOURCE[s[16]] ?? 'other',
    dbFlags: null,
  };
}

export function parseOpenSkyResponse(json: unknown): { time: number; aircraft: StateVector[]; rejected: number } {
  const r = OpenSkyResponse.parse(json);
  const aircraft: StateVector[] = [];
  let rejected = 0;
  for (const raw of r.states ?? []) {
    const sv = openskyToStateVector(raw);
    if (sv) aircraft.push(sv); else rejected++;
  }
  return { time: r.time, aircraft, rejected };
}
