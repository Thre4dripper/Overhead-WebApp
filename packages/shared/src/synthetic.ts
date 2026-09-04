import { bboxAround, destination, haversineM, inBBox } from './geo';
import type { AircraftCategory, BBox, StateVector } from './types';

/**
 * Deterministic synthetic airspace: an airport near the requested point with approach and
 * departure streams, overflights at cruise, GA and rotary traffic. Used by the `demo` provider
 * (dev / offline / screenshots) and by the web client when the API is unreachable.
 * It is honest about being fake: callsigns are DEMO-prefixed and the attribution says so.
 */

interface Plan {
  icao24: string;
  callsign: string;
  category: AircraftCategory;
  typeCode: string;
  registration: string;
  emitter: string;
  /** anchor point and the moment (s) the plan started; loops with `period` */
  lat0: number; lon0: number; t0: number; period: number;
  trackDeg: number; speedMps: number; alt0: number; vrate: number;
  kind: 'cruise' | 'approach' | 'departure' | 'orbit' | 'meander';
  orbitRadiusM?: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = '0123456789abcdef';
const hex6 = (r: () => number) => Array.from({ length: 6 }, () => HEX[Math.floor(r() * 16)]).join('');
const REG = ['G-', 'D-', 'N', 'F-', 'PH-', 'OE-', 'EI-', 'HB-'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const reg = (r: () => number) => {
  const p = REG[Math.floor(r() * REG.length)]!;
  return p + Array.from({ length: p === 'N' ? 4 : 4 }, () => (p === 'N' ? '0123456789' : ALPHA)[Math.floor(r() * (p === 'N' ? 10 : 24))]).join('') + (p === 'N' ? ALPHA[Math.floor(r() * 24)] : '');
};

const AIRLINES = ['DLH', 'BAW', 'UAL', 'SKW', 'RYR', 'EZY', 'KLM', 'AFR', 'SWR', 'UAE', 'QTR', 'FDX', 'VIR', 'SAS', 'IBE'];
const TYPES: Record<AircraftCategory, string[]> = {
  'wide-body-jet': ['B77W', 'A388', 'B789', 'A359', 'A333'],
  'narrow-body-jet': ['A320', 'B738', 'A21N', 'A319', 'B38M'],
  'regional-jet': ['E190', 'CRJ9', 'E75L'],
  turboprop: ['AT76', 'DH8D', 'PC12'],
  'business-jet': ['GLF6', 'C56X', 'CL35', 'PC24'],
  helicopter: ['EC35', 'A139', 'R44'],
  'light-piston': ['C172', 'P28A', 'SR22'],
  generic: ['ZZZZ'],
};
const EMIT: Record<AircraftCategory, string> = {
  'wide-body-jet': 'A5', 'narrow-body-jet': 'A3', 'regional-jet': 'A2', turboprop: 'A2', 'business-jet': 'A2', helicopter: 'A7', 'light-piston': 'A1', generic: 'A0',
};

export class SyntheticAirspace {
  private plans: Plan[] = [];
  readonly centerLat: number;
  readonly centerLon: number;
  readonly runwayHeading: number;

  constructor(centerLat: number, centerLon: number, seed = 42) {
    this.centerLat = centerLat;
    this.centerLon = centerLon;
    const r = mulberry32(seed);
    this.runwayHeading = Math.round(r() * 36) * 10 % 360;
    const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
    const mk = (kind: Plan['kind'], category: AircraftCategory, i: number): Plan => {
      const typeCode = pick(TYPES[category]);
      const airline = category === 'light-piston' || category === 'helicopter' ? null : pick(AIRLINES);
      const callsign = airline ? `${airline}${Math.floor(100 + r() * 8900)}` : reg(r).replace('-', '');
      const base: Omit<Plan, 'lat0' | 'lon0' | 'trackDeg' | 'speedMps' | 'alt0' | 'vrate' | 'period' | 'kind'> = {
        icao24: hex6(r), callsign, category, typeCode, registration: reg(r), emitter: EMIT[category], t0: -r() * 1800,
      };
      if (kind === 'cruise') {
        const trk = r() * 360;
        const start = destination(centerLat, centerLon, (trk + 180) % 360, 45000 + r() * 30000);
        const off = destination(start.lat, start.lon, (trk + 90) % 360, (r() - 0.5) * 30000);
        const alt = 8500 + r() * 4500;
        return { ...base, kind, lat0: off.lat, lon0: off.lon, trackDeg: trk, speedMps: 215 + r() * 40, alt0: alt, vrate: 0, period: 700 + r() * 200 };
      }
      if (kind === 'approach') {
        const trk = this.runwayHeading;
        const start = destination(centerLat, centerLon, (trk + 180) % 360, 22000 + i * 4500);
        const dist = haversineM(start.lat, start.lon, centerLat, centerLon);
        const alt = dist * Math.tan((3 * Math.PI) / 180) + 30; // 3° glide
        const spd = 72 + r() * 10;
        return { ...base, kind, lat0: start.lat, lon0: start.lon, trackDeg: trk, speedMps: spd, alt0: alt, vrate: -spd * Math.tan((3 * Math.PI) / 180), period: dist / spd };
      }
      if (kind === 'departure') {
        const trk = (this.runwayHeading + (r() - 0.5) * 20 + 360) % 360;
        const start = destination(centerLat, centerLon, this.runwayHeading, 1500 + i * 2500);
        const spd = 85 + r() * 25;
        return { ...base, kind, lat0: start.lat, lon0: start.lon, trackDeg: trk, speedMps: spd, alt0: 120 + i * 220, vrate: 9 + r() * 5, period: 420 };
      }
      if (kind === 'orbit') {
        const c = destination(centerLat, centerLon, r() * 360, 2000 + r() * 6000);
        return { ...base, kind, lat0: c.lat, lon0: c.lon, trackDeg: 0, speedMps: 45 + r() * 15, alt0: 220 + r() * 300, vrate: 0, period: 300 + r() * 120, orbitRadiusM: 900 + r() * 700 };
      }
      const c = destination(centerLat, centerLon, r() * 360, 4000 + r() * 10000);
      return { ...base, kind, lat0: c.lat, lon0: c.lon, trackDeg: r() * 360, speedMps: 50 + r() * 20, alt0: 500 + r() * 700, vrate: 0, period: 600 + r() * 300, orbitRadiusM: 2500 + r() * 2000 };
    };
    const cruise: AircraftCategory[] = ['wide-body-jet', 'narrow-body-jet', 'narrow-body-jet', 'wide-body-jet', 'regional-jet', 'business-jet', 'narrow-body-jet', 'wide-body-jet', 'narrow-body-jet', 'business-jet'];
    cruise.forEach((c, i) => this.plans.push(mk('cruise', c, i)));
    (['narrow-body-jet', 'wide-body-jet', 'regional-jet', 'narrow-body-jet', 'turboprop', 'narrow-body-jet'] as AircraftCategory[]).forEach((c, i) => this.plans.push(mk('approach', c, i)));
    (['narrow-body-jet', 'regional-jet', 'wide-body-jet', 'turboprop'] as AircraftCategory[]).forEach((c, i) => this.plans.push(mk('departure', c, i)));
    (['helicopter', 'helicopter'] as AircraftCategory[]).forEach((c, i) => this.plans.push(mk('orbit', c, i)));
    (['light-piston', 'light-piston', 'turboprop'] as AircraftCategory[]).forEach((c, i) => this.plans.push(mk('meander', c, i)));
  }

  stateAt(epochS: number): StateVector[] {
    const out: StateVector[] = [];
    for (const p of this.plans) {
      const tt = ((epochS - p.t0) % p.period + p.period) % p.period;
      let lat: number, lon: number, alt: number, trk = p.trackDeg, vr = p.vrate;
      if (p.kind === 'orbit' || p.kind === 'meander') {
        const rad = p.orbitRadiusM ?? 1000;
        const circ = 2 * Math.PI * rad;
        const ang = ((tt * p.speedMps) / circ) * 360;
        const pos = destination(p.lat0, p.lon0, ang, rad);
        lat = pos.lat; lon = pos.lon; trk = (ang + 90) % 360;
        alt = p.alt0 + (p.kind === 'meander' ? Math.sin(tt / 40) * 60 : 0);
        vr = p.kind === 'meander' ? Math.cos(tt / 40) * 1.5 : 0;
      } else {
        const pos = destination(p.lat0, p.lon0, p.trackDeg, p.speedMps * tt);
        lat = pos.lat; lon = pos.lon;
        alt = p.alt0 + p.vrate * tt;
        if (p.kind === 'departure' && alt > 3500) { vr = 4; alt = 3500 + (tt - (3500 - p.alt0) / p.vrate) * 4; }
        if (p.kind === 'approach' && alt < 40) continue;
      }
      out.push({
        icao24: p.icao24, callsign: p.callsign, lat, lon, baroAltM: alt, geoAltM: alt + 30, onGround: false,
        velocityMps: p.speedMps, trackDeg: trk, verticalRateMps: vr, squawk: '1000', originCountry: 'Demo', timePosition: Math.floor(epochS), lastContact: Math.floor(epochS),
        emitterCategory: p.emitter, registration: p.registration, typeCode: p.typeCode, typeDescription: null, positionSource: 'adsb', dbFlags: 0,
      });
    }
    return out;
  }

  fetchBox(bbox: BBox, epochS = Date.now() / 1000): StateVector[] {
    return this.stateAt(epochS).filter((s) => inBBox(s.lat, s.lon, bbox));
  }

  static defaultBBox(lat: number, lon: number): BBox { return bboxAround(lat, lon, 60000); }
}
