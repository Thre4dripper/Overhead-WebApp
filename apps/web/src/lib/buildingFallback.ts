import type { Feature, Position } from 'geojson';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';

export const FALLBACK_SOURCE = 'building-fallback';
export const FALLBACK_LAYER = 'building-3d-fallback';

/**
 * Third case of the height chain (M2): a building with neither `height` nor `building:levels`.
 * OpenMapTiles bakes those to render_height = 5 and, worse, merges every same-attribute building in
 * a tile into ONE MultiPolygon feature — so a style expression cannot vary them per building. We
 * therefore split those features at runtime and assign each footprint a conservative height from its
 * area, with a deterministic ±14 % jitter so a data-poor city reads as stylised low-rise, not as a
 * field of identical stubs. Measured shares live in docs/evidence/.
 */
export function heuristicHeight(areaM2: number, seed01: number): number {
  let base: number;
  if (areaM2 < 60) base = 4.2;          // shed, garage, kiosk
  else if (areaM2 < 220) base = 7.4;    // detached house, two floors
  else if (areaM2 < 700) base = 9.6;    // terrace block, small commercial
  else if (areaM2 < 2500) base = 12.5;  // apartment or office footprint
  else base = 9.5;                      // big-box, warehouse, industrial: wide and low
  return Math.round(base * (0.86 + 0.28 * seed01) * 10) / 10;
}

const hash01 = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export interface FallbackStats { features: number; buildings: number; at: number }

export function installBuildingFallback(map: MlMap, onStats?: (s: FallbackStats) => void): () => void {
  let lastKey = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (map.getZoom() < 13.3 || !map.getSource(FALLBACK_SOURCE)) return;
    const c = map.getCenter();
    const key = `${c.lng.toFixed(3)},${c.lat.toFixed(3)},${Math.round(map.getZoom() * 2)}`;
    if (key === lastKey) return;
    const feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building', filter: ['==', ['coalesce', ['get', 'render_height'], 5], 5] });
    if (feats.length === 0 && !map.isSourceLoaded('openmaptiles')) return;
    lastKey = key;
    const cosLat = Math.cos((c.lat * Math.PI) / 180);
    const seen = new Set<string>();
    const out: Feature[] = [];
    outer: for (const f of feats) {
      const g = f.geometry;
      const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 4) continue;
        let a2 = 0, cx = 0, cy = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i]!, q = ring[i + 1]!;
          const cross = p[0]! * q[1]! - q[0]! * p[1]!;
          a2 += cross; cx += (p[0]! + q[0]!) * cross; cy += (p[1]! + q[1]!) * cross;
        }
        if (a2 === 0) continue;
        cx /= 3 * a2; cy /= 3 * a2;
        const areaM2 = (Math.abs(a2) / 2) * 111320 * cosLat * 110574;
        const k = `${cx.toFixed(5)},${cy.toFixed(5)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ type: 'Feature', properties: { h: heuristicHeight(areaM2, hash01(cx * 1000, cy * 1000)) }, geometry: { type: 'Polygon', coordinates: poly } });
        if (out.length >= 30000) break outer;
      }
    }
    (map.getSource(FALLBACK_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: out });
    onStats?.({ features: feats.length, buildings: out.length, at: Date.now() });
  };
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(run, 350); };
  const onSource = (e: { sourceId?: string; isSourceLoaded?: boolean }) => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) schedule(); };
  map.on('moveend', schedule);
  map.on('sourcedata', onSource);
  schedule();
  return () => { map.off('moveend', schedule); map.off('sourcedata', onSource); if (timer) clearTimeout(timer); };
}
