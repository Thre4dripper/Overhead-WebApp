import { bboxCenter, bboxRadiusM, inBBox, kmToNm, parseReadsbResponse, type AircraftProvider, type BBox, type StateVector } from '@overhead/shared';
import { fetchJson } from './http';

/**
 * adsb.lol — community ADS-B aggregator, no key, ODbL (attribution and share-alike, commercial use
 * allowed). Point-and-radius queries up to 250 nm. Unlike OpenSky it carries the aircraft type and
 * registration in each record, so no aircraft database is needed to pick a 3D model.
 * Rate limits are dynamic rather than metered, so `costHint` is a flat 1 and the poller's spacing
 * and 429 backoff do the protecting.
 */
export class AdsbLolProvider implements AircraftProvider {
  readonly id = 'adsblol';
  readonly attribution = 'Aircraft data: adsb.lol community feed (ODbL)';
  readonly costHint = (_b: BBox): number => 1;
  constructor(private readonly base = 'https://api.adsb.lol') {}

  async fetchBox(bbox: BBox): Promise<StateVector[]> {
    const c = bboxCenter(bbox);
    const nm = Math.min(250, Math.ceil(kmToNm(bboxRadiusM(bbox) / 1000)) + 1);
    const json = await fetchJson(`${this.base}/v2/lat/${c.lat.toFixed(4)}/lon/${c.lon.toFixed(4)}/dist/${nm}`, { timeoutMs: 12_000 });
    return parseReadsbResponse(json).aircraft.filter((a) => inBBox(a.lat, a.lon, bbox));
  }
}
