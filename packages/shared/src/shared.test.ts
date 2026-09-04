import { describe, expect, it } from 'vitest';
import { airlineFromCallsign, displayCallsign } from './airlines';
import { categoryForType, resolveCategory } from './categories';
import { angleDelta, deadReckon } from './deadReckon';
import { bearingDeg, elevationDeg, haversineM } from './geo';
import { geohashBounds, geohashEncode, tilesCovering } from './geohash';
import { parseClientMessage } from './protocol';
import { parseReadsbResponse, readsbToStateVector } from './readsb';
import { SyntheticAirspace } from './synthetic';
import { fmtAltitude, fmtFlightLevel, fmtSpeed, fmtVerticalRate, squawkMeaning, trendArrow } from './units';

describe('geohash', () => {
  it('encodes known values', () => {
    expect(geohashEncode(51.47, -0.45, 4)).toBe('gcps');
    expect(geohashEncode(37.77, -122.42, 4)).toBe('9q8y');
    expect(geohashEncode(-33.87, 151.21, 4)).toBe('r3gx');
  });
  it('bounds contain the point and are ~39 km × 19.5 km at precision 4', () => {
    const b = geohashBounds('gcps');
    expect(b.lamin).toBeLessThanOrEqual(51.47); expect(b.lamax).toBeGreaterThanOrEqual(51.47);
    expect(b.lomin).toBeLessThanOrEqual(-0.45); expect(b.lomax).toBeGreaterThanOrEqual(-0.45);
    expect(b.lamax - b.lamin).toBeCloseTo(0.17578125, 6);
    expect(b.lomax - b.lomin).toBeCloseTo(0.3515625, 6);
  });
  it('subscribes both sides of a boundary', () => {
    const b = geohashBounds('gcps');
    const tiles = tilesCovering(b.lamin + 0.001, (b.lomin + b.lomax) / 2, 3000);
    expect(tiles).toContain('gcps');
    expect(tiles.length).toBeGreaterThan(1);
    const mid = tilesCovering((b.lamin + b.lamax) / 2, (b.lomin + b.lomax) / 2, 3000);
    expect(mid).toEqual(['gcps']);
  });
});

describe('geo', () => {
  it('haversine LHR→JFK ≈ 5 540 km', () => {
    expect(haversineM(51.47, -0.4543, 40.6413, -73.7781) / 1000).toBeCloseTo(5540, -1);
  });
  it('bearing north/east', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
  });
  it('elevation: 11 km up at 5 km out beats 1 km up at 3 km out (why distance is the wrong sort)', () => {
    expect(elevationDeg(11000, 5000)).toBeGreaterThan(elevationDeg(1000, 3000));
    expect(elevationDeg(1000, 0)).toBeGreaterThan(89.9);
  });
});

describe('deadReckon', () => {
  it('moves along track and climbs', () => {
    const sv = { lat: 51, lon: 0, baroAltM: 1000, velocityMps: 100, trackDeg: 90, verticalRateMps: 10 };
    const p = deadReckon(sv, 10);
    expect(p.lat).toBeCloseTo(51, 4);
    expect(p.lon).toBeGreaterThan(0);
    expect(haversineM(51, 0, p.lat, p.lon)).toBeCloseTo(1000, -1);
    expect(p.baroAltM).toBe(1100);
  });
  it('holds position with nulls and never goes below -500 m', () => {
    expect(deadReckon({ lat: 1, lon: 2, baroAltM: null, velocityMps: null, trackDeg: null, verticalRateMps: null }, 30)).toEqual({ lat: 1, lon: 2, baroAltM: null });
    expect(deadReckon({ lat: 1, lon: 2, baroAltM: 0, velocityMps: 0, trackDeg: 0, verticalRateMps: -100 }, 30).baroAltM).toBe(-500);
  });
  it('angleDelta wraps', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('categories', () => {
  it('maps common types', () => {
    expect(categoryForType('B77W')).toBe('wide-body-jet');
    expect(categoryForType('a320')).toBe('narrow-body-jet');
    expect(categoryForType('AT76')).toBe('turboprop');
    expect(categoryForType('EC35')).toBe('helicopter');
    expect(categoryForType('C172')).toBe('light-piston');
    expect(categoryForType('GLF6')).toBe('business-jet');
    expect(categoryForType('E190')).toBe('regional-jet');
    expect(categoryForType('NOPE')).toBeNull();
  });
  it('falls back to emitter category, then generic — never null', () => {
    expect(resolveCategory({ emitterCategory: 'A5' })).toBe('wide-body-jet');
    expect(resolveCategory({ emitterCategory: 'A7' })).toBe('helicopter');
    expect(resolveCategory({ typeDescription: 'Twin turboprop' })).toBe('turboprop');
    expect(resolveCategory({})).toBe('generic');
  });
});

describe('airlines', () => {
  it('decodes airline prefixes only for airline-shaped callsigns', () => {
    expect(airlineFromCallsign('DLH441  ')).toBe('Lufthansa');
    expect(airlineFromCallsign('N7124G')).toBeNull();
    expect(airlineFromCallsign(null)).toBeNull();
  });
  it('displays with a thin gap and trims padding', () => {
    expect(displayCallsign('UAL214  ', 'a1b2c3')).toBe('UAL 214');
    expect(displayCallsign('   ', 'a1b2c3')).toBe('A1B2C3');
  });
});

describe('units', () => {
  it('formats at the display boundary', () => {
    expect(fmtAltitude(11582.4)).toBe('38 000 ft');
    expect(fmtFlightLevel(11277.6)).toBe('FL370');
    expect(fmtFlightLevel(792.5)).toBe('2 600 ft');
    expect(fmtSpeed(231.5)).toBe('450 kt');
    expect(fmtVerticalRate(-7.62)).toBe('−1 500 ft/min');
    expect(fmtVerticalRate(0.2)).toBe('level');
    expect(trendArrow(5)).toBe('↑');
    expect(fmtAltitude(null)).toBe('—');
    expect(squawkMeaning('7700')).toBe('Emergency');
    expect(squawkMeaning('4521')).toBeNull();
  });
});

describe('protocol', () => {
  it('parses and rejects', () => {
    expect(parseClientMessage('{"type":"subscribe","tiles":["gcpu","gcpv"]}')).toEqual({ type: 'subscribe', tiles: ['gcpu', 'gcpv'] });
    expect(parseClientMessage('{"type":"subscribe","tiles":[1]}')).toBeNull();
    expect(parseClientMessage('nope')).toBeNull();
  });
});

describe('readsb parser (community feeds)', () => {
  const now = 1_788_466_375;
  it('converts feet, knots and ft/min to metric and trims the callsign', () => {
    const sv = readsbToStateVector({ hex: '4ca303', type: 'adsb_icao', flight: 'RYR34QB ', r: 'EI-DLX', t: 'B738', alt_baro: 11300, alt_geom: 11925, gs: 322.6, track: 307.19, baro_rate: 1536, squawk: '6312', category: 'A3', lat: 51.251407, lon: -0.632706, seen_pos: 0.4, seen: 0.1 }, now)!;
    expect(sv.callsign).toBe('RYR34QB');
    expect(sv.baroAltM).toBeCloseTo(3444.24, 1);
    expect(sv.velocityMps).toBeCloseTo(165.96, 1);
    expect(sv.verticalRateMps).toBeCloseTo(7.80, 1);
    expect(sv.typeCode).toBe('B738');
    expect(sv.registration).toBe('EI-DLX');
    expect(sv.onGround).toBe(false);
    expect(sv.timePosition).toBe(now);
  });
  it('treats "ground" as on the ground with no barometric altitude', () => {
    const sv = readsbToStateVector({ hex: '42592e', type: 'adsb_icao_nt', alt_baro: 'ground', lat: 51.28, lon: -0.77, seen_pos: 14 }, now)!;
    expect(sv.onGround).toBe(true);
    expect(sv.baroAltM).toBeNull();
  });
  it('drops records with no position or a malformed address, and reads the TIS-B prefix', () => {
    expect(readsbToStateVector({ hex: 'abcdef', type: 'mode_s' }, now)).toBeNull();
    expect(readsbToStateVector({ hex: 'zzzzzz', lat: 1, lon: 1 }, now)).toBeNull();
    expect(readsbToStateVector({ hex: '~a1b2c3', type: 'tisb_other', lat: 1, lon: 1 }, now)!.positionSource).toBe('tisb');
  });
  it('parses a whole response on the feed clock', () => {
    const r = parseReadsbResponse({ ac: [{ hex: 'abcdef', lat: 1, lon: 2, alt_baro: 1000, seen_pos: 5 }, { hex: 'nope' }], now: 1_700_000_000_000 });
    expect(r.aircraft).toHaveLength(1);
    expect(r.rejected).toBe(1);
    expect(r.aircraft[0]!.timePosition).toBe(1_700_000_000 - 5);
    expect(r.time).toBe(1_700_000_000);
  });
});

describe('synthetic airspace', () => {
  it('is deterministic and yields airborne traffic in a box', () => {
    const a = new SyntheticAirspace(51.47, -0.3, 7);
    const b = new SyntheticAirspace(51.47, -0.3, 7);
    const t = 1_700_000_000;
    expect(a.stateAt(t)).toEqual(b.stateAt(t));
    const box = a.fetchBox(SyntheticAirspace.defaultBBox(51.47, -0.3), t);
    expect(box.length).toBeGreaterThan(8);
    for (const s of box) { expect(s.baroAltM).not.toBeNull(); expect(s.onGround).toBe(false); }
  });
});
