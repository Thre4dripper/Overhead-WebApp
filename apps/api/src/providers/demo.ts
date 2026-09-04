import { bboxCenter, geohashEncode, SyntheticAirspace, type AircraftProvider, type BBox, type StateVector } from '@overhead/shared';

/** Synthetic traffic around whatever tile is asked for. Costs nothing, lies about nothing: attribution says demo. */
export class DemoProvider implements AircraftProvider {
  readonly id = 'demo';
  readonly attribution = 'Demo traffic — synthetic, not real aircraft';
  readonly costHint = (_b: BBox): number => 0;
  private spaces = new Map<string, SyntheticAirspace>();

  async fetchBox(bbox: BBox): Promise<StateVector[]> {
    const c = bboxCenter(bbox);
    const key = geohashEncode(c.lat, c.lon, 4);
    let s = this.spaces.get(key);
    if (!s) {
      let seed = 0;
      for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      s = new SyntheticAirspace(c.lat, c.lon, seed);
      this.spaces.set(key, s);
    }
    return s.fetchBox(bbox);
  }
}
