import { feetToMeters } from '@overhead/altitude';
import { z } from 'zod';
import { fpmToMps, knotsToMps } from './units';
import type { StateVector } from './types';

/**
 * readsb / tar1090 `aircraft.json` records — the shape adsb.lol and other community aggregators serve.
 * Units at the source are imperial: `alt_baro` in feet or the string "ground", `gs` in knots,
 * `baro_rate` in ft/min, `track` in degrees. They are converted to metric here, once, at the boundary.
 * Unlike OpenSky's state vectors these carry the aircraft type and registration already, so no
 * separate database is needed to pick the right 3D model.
 */
export const ReadsbAircraft = z.looseObject({
  hex: z.string(),
  type: z.string().optional(),
  flight: z.string().optional(),
  r: z.string().optional(),
  t: z.string().optional(),
  desc: z.string().optional(),
  ownOp: z.string().optional(),
  alt_baro: z.union([z.number(), z.literal('ground')]).optional(),
  alt_geom: z.number().optional(),
  gs: z.number().optional(),
  track: z.number().optional(),
  true_heading: z.number().optional(),
  mag_heading: z.number().optional(),
  baro_rate: z.number().optional(),
  geom_rate: z.number().optional(),
  squawk: z.string().optional(),
  category: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  seen: z.number().optional(),
  seen_pos: z.number().optional(),
  dbFlags: z.number().optional(),
});
export type ReadsbAircraft = z.infer<typeof ReadsbAircraft>;

export const ReadsbResponse = z.looseObject({
  ac: z.array(z.unknown()),
  now: z.number().optional(),
  msg: z.string().optional(),
});

function positionSource(type: string | undefined): StateVector['positionSource'] {
  if (!type) return 'other';
  if (type.startsWith('adsb') || type.startsWith('adsr')) return 'adsb';
  if (type === 'mlat') return 'mlat';
  if (type.startsWith('tisb')) return 'tisb';
  if (type === 'adsc') return 'adsc';
  return 'other';
}

/** Returns null for records that cannot be placed at all (no position, or a malformed address). */
export function readsbToStateVector(raw: unknown, nowS: number): StateVector | null {
  const p = ReadsbAircraft.safeParse(raw);
  if (!p.success) return null;
  const a = p.data;
  if (a.lat == null || a.lon == null || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return null;
  // a '~' prefix marks a non-ICAO (TIS-B) address
  const icao24 = a.hex.replace(/^~/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(icao24)) return null;
  const seenPos = a.seen_pos ?? a.seen ?? 0;
  return {
    icao24,
    callsign: a.flight?.trim() || null,
    lat: a.lat,
    lon: a.lon,
    baroAltM: typeof a.alt_baro === 'number' ? feetToMeters(a.alt_baro) : null,
    geoAltM: a.alt_geom != null ? feetToMeters(a.alt_geom) : null,
    onGround: a.alt_baro === 'ground',
    velocityMps: a.gs != null ? knotsToMps(a.gs) : null,
    trackDeg: a.track ?? a.true_heading ?? a.mag_heading ?? null,
    verticalRateMps: a.baro_rate != null ? fpmToMps(a.baro_rate) : a.geom_rate != null ? fpmToMps(a.geom_rate) : null,
    squawk: a.squawk ?? null,
    originCountry: null,
    timePosition: Math.round(nowS - seenPos),
    lastContact: Math.round(nowS - (a.seen ?? seenPos)),
    emitterCategory: a.category ?? null,
    registration: a.r?.trim() || null,
    typeCode: a.t?.trim().toUpperCase() || null,
    typeDescription: a.desc?.trim() || null,
    positionSource: positionSource(a.type),
    dbFlags: a.dbFlags ?? null,
  };
}

/** Parse a whole aircraft.json response. `now` is milliseconds in the readsb wire format. */
export function parseReadsbResponse(json: unknown): { time: number; aircraft: StateVector[]; rejected: number } {
  const r = ReadsbResponse.parse(json);
  const nowS = r.now != null ? r.now / 1000 : Date.now() / 1000;
  const aircraft: StateVector[] = [];
  let rejected = 0;
  for (const raw of r.ac) {
    const sv = readsbToStateVector(raw, nowS);
    if (sv) aircraft.push(sv); else rejected++;
  }
  return { time: nowS, aircraft, rejected };
}
