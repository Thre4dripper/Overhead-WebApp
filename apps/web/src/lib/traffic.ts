import { angleDelta, deadReckon, smoothstep, type Aircraft } from '@overhead/shared';

export interface TrailPoint { lat: number; lon: number; altM: number; t: number }

export interface Tracked {
  icao24: string;
  /** last real sample after the metadata join */
  a: Aircraft;
  /** wall-clock ms when the sample arrived */
  receivedAt: number;
  /** how old the position report already was when it arrived (server clock minus report time), seconds */
  ageAtRxS: number;
  /** rendered (dead-reckoned + correction-blended) state */
  lat: number; lon: number; altM: number; track: number;
  /** correction offset being blended out after a new sample */
  corr: { dLat: number; dLon: number; dAlt: number; dTrack: number; startedAt: number; ms: number } | null;
  trail: TrailPoint[];
  lastTrailAt: number;
  /** 1 fresh … 0 about to be dropped */
  freshness: number;
  firstSeenAt: number;
}

/** position age (report time → now), independent of the device clock */
const STALE_AFTER_S = 45;
const DROP_AFTER_S = 150;
const MAX_EXTRAPOLATE_S = 120;
const TRAIL_EVERY_MS = 2_000;
const TRAIL_KEEP_MS = 240_000;
const BLEND_MS = 1_800;

/**
 * Holds every airborne aircraft we know about and produces smooth render states at 60 fps.
 * Polls land every ~10 s; between them each aircraft is dead-reckoned from its last velocity,
 * track and vertical rate. When a new sample lands, the difference between where we had drawn it
 * and where it really is becomes an offset that blends to zero over BLEND_MS — no teleporting,
 * horizontally or vertically.
 */
export class TrafficStore {
  private byIcao = new Map<string, Tracked>();
  private listeners = new Set<() => void>();
  private lastTick = 0;
  version = 0;

  get size(): number { return this.byIcao.size; }
  get(icao24: string): Tracked | undefined { return this.byIcao.get(icao24); }
  all(): Tracked[] { return [...this.byIcao.values()]; }

  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private emit(): void { this.version++; for (const l of this.listeners) l(); }

  clear(): void { this.byIcao.clear(); this.emit(); }

  ingest(aircraft: Aircraft[], frameT: number, now = Date.now()): void {
    // frameT is the server's clock when the poll completed; report times are on that same clock,
    // so position age is measured server-side and never touches the device clock (phones drift by minutes).
    for (const a of aircraft) {
      if (a.onGround || a.baroAltM == null || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) {
        // On-ground and altitude-less aircraft cannot be placed in the 3D scene: drop, don't bury.
        if (this.byIcao.has(a.icao24)) this.byIcao.delete(a.icao24);
        continue;
      }
      const prev = this.byIcao.get(a.icao24);
      // where the new sample says it is *now* (its own report may be a few seconds old)
      const ageS = Math.min(MAX_EXTRAPOLATE_S, Math.max(0, frameT / 1000 - a.timePosition));
      const dr = deadReckon(a, ageS);
      const targetLat = dr.lat, targetLon = dr.lon, targetAlt = dr.baroAltM ?? a.baroAltM;
      const targetTrack = a.trackDeg ?? prev?.track ?? 0;
      if (!prev) {
        this.byIcao.set(a.icao24, {
          icao24: a.icao24, a, receivedAt: now, ageAtRxS: ageS, lat: targetLat, lon: targetLon, altM: targetAlt, track: targetTrack, corr: null,
          trail: [{ lat: targetLat, lon: targetLon, altM: targetAlt, t: now }], lastTrailAt: now, freshness: 1, firstSeenAt: now,
        });
      } else {
        // keep drawing from where we were; blend the discrepancy away
        prev.corr = {
          dLat: prev.lat - targetLat, dLon: prev.lon - targetLon, dAlt: prev.altM - targetAlt,
          dTrack: angleDelta(targetTrack, prev.track), startedAt: now, ms: BLEND_MS,
        };
        prev.a = a; prev.receivedAt = now; prev.ageAtRxS = ageS;
      }
    }
    this.emit();
  }

  /** Advance every aircraft to `now`. Returns the live set (stale ones fade, then drop). */
  tick(now = Date.now()): Tracked[] {
    if (now === this.lastTick) return this.all();
    this.lastTick = now;
    let changed = false;
    for (const [icao, tr] of this.byIcao) {
      // position age = age when it arrived + time since it arrived (both measured locally, no clock skew)
      const ageS = tr.ageAtRxS + (now - tr.receivedAt) / 1000;
      if (ageS > DROP_AFTER_S) { this.byIcao.delete(icao); changed = true; continue; }
      tr.freshness = ageS < STALE_AFTER_S ? 1 : 1 - (ageS - STALE_AFTER_S) / (DROP_AFTER_S - STALE_AFTER_S);
      const a = tr.a;
      // dead-reckon from the report time; keep extrapolating (fading) rather than freezing in mid-air
      const dr = deadReckon(a, Math.min(ageS, MAX_EXTRAPOLATE_S));
      let lat = dr.lat, lon = dr.lon, alt = dr.baroAltM ?? tr.altM, track = a.trackDeg ?? tr.track;
      if (tr.corr) {
        const k = 1 - smoothstep((now - tr.corr.startedAt) / tr.corr.ms);
        if (k <= 0) tr.corr = null;
        else { lat += tr.corr.dLat * k; lon += tr.corr.dLon * k; alt += tr.corr.dAlt * k; track = (track + tr.corr.dTrack * k + 360) % 360; }
      }
      tr.lat = lat; tr.lon = lon; tr.altM = alt; tr.track = track;
      if (now - tr.lastTrailAt >= TRAIL_EVERY_MS) {
        tr.trail.push({ lat, lon, altM: alt, t: now });
        tr.lastTrailAt = now;
        const cutoff = now - TRAIL_KEEP_MS;
        while (tr.trail.length > 1 && tr.trail[0]!.t < cutoff) tr.trail.shift();
      }
    }
    if (changed) this.emit();
    return this.all();
  }
}

export const traffic = new TrafficStore();
