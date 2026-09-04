// M2 acceptance evidence: how OpenFreeMap's building layer resolves heights, per city.
// OpenMapTiles bakes render_height = COALESCE(height, building:levels × 3.66, 5) at build time, so the
// tile only lets us distinguish: (a) the 5 m default (neither tag), (b) values that are exact multiples
// of 3.66 (levels-derived, inferred), (c) anything else (a tagged height). We also count features per
// tile because in data-poor cities the dominant failure is missing footprints, not missing heights.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { mkdirSync, writeFileSync } from 'node:fs';

const CITIES = [
  ['London centre', 51.5074, -0.1278], ['London suburb (Hounslow)', 51.468, -0.36],
  ['New York Midtown', 40.758, -73.985], ['New Jersey suburb (Paramus)', 40.9445, -74.0754],
  ['Denver centre', 39.7392, -104.9903], ['Denver suburb (Aurora)', 39.7294, -104.8319],
  ['Nairobi centre', -1.2921, 36.8219], ['Nairobi suburb (Kasarani)', -1.2216, 36.8967],
  ['Lagos centre', 6.455, 3.3841], ['Lagos suburb (Ikeja)', 6.6018, 3.3515],
  ['Mumbai (Bandra)', 19.0596, 72.8295], ['Jakarta (Menteng)', -6.1954, 106.8305],
  ['Tokyo (Shinjuku)', 35.6938, 139.7034], ['São Paulo (Pinheiros)', -23.5629, -46.6913],
];
function xy(lat, lon, z) { const n = 2 ** z; const x = Math.floor(((lon + 180) / 360) * n); const la = (lat * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n); return [x, y]; }
const tj = await fetch('https://tiles.openfreemap.org/planet').then((r) => r.json());
const rows = [];
let ids = 0, total = 0;
for (const [name, lat, lon] of CITIES) {
  const [x, y] = xy(lat, lon, 14);
  const buf = await fetch(tj.tiles[0].replace('{z}', 14).replace('{x}', x).replace('{y}', y)).then((r) => r.arrayBuffer());
  const L = new VectorTile(new Pbf(new Uint8Array(buf))).layers.building;
  if (!L) { rows.push({ name, n: 0 }); continue; }
  // OpenMapTiles (planetiler) stores ceil(height) so levels-derived values land on ceil(n × 3.66): 4, 8, 11, 15, 19, 22, 26 …
  const LEVEL_SHAPED = new Set(Array.from({ length: 80 }, (_, n) => Math.ceil((n + 1) * 3.66)));
  // OpenFreeMap merges same-attribute buildings into one MultiPolygon feature per tile, so count
  // exterior rings (buildings), not features. MVT exterior rings share the sign of the largest ring.
  let def = 0, lv = 0, real = 0, tiny = 0, buildings = 0;
  for (let i = 0; i < L.length; i++) {
    const f = L.feature(i); total++; if (f.id) ids++;
    const rings = f.loadGeometry();
    const area = (r) => { let a = 0; for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
    const areas = rings.map(area);
    const big = areas.reduce((m, a) => (Math.abs(a) > Math.abs(m) ? a : m), 0);
    const n = areas.filter((a) => a !== 0 && Math.sign(a) === Math.sign(big)).length || 1;
    buildings += n;
    const h = f.properties.render_height;
    if (h == null || h === 5) def += n;
    else if (Number.isInteger(h) && LEVEL_SHAPED.has(h)) lv += n;
    else real += n;
    if (h != null && h < 2) tiny += n;
  }
  rows.push({ name, features: L.length, n: buildings, def, lv, real, tiny });
}
const pct = (a, n) => (n ? `${Math.round((100 * a) / n)}%` : '—');
const date = new Date().toISOString().slice(0, 10);
let md = `# Building height survey — OpenFreeMap z14 tiles (${date})\n\nSource: \`${tj.tiles[0]}\` (OpenMapTiles ${tj.version}). One z14 tile per location, centred on the coordinates.\n\n`;
md += `| Location | features | buildings (polygons) | default 5 m (no tags) | levels-shaped ceil(n×3.66) (inferred, upper bound) | other value (tagged height, lower bound) | < 2 m |\n|---|---:|---:|---:|---:|---:|---:|\n`;
for (const r of rows) md += `| ${r.name} | ${r.features ?? 0} | ${r.n} | ${r.def ?? 0} (${pct(r.def, r.n)}) | ${r.lv ?? 0} (${pct(r.lv, r.n)}) | ${r.real ?? 0} (${pct(r.real, r.n)}) | ${r.tiny ?? 0} |\n`;
md += `\nFeatures with an id: ${ids} of ${total} (${pct(ids, total)}). Because merged features carry one id for many buildings, per-building variation must come from geometry (area) at runtime — see apps/web/src/lib/buildingFallback.ts.\n\n`;
md += `## Reading\n\n- The tile carries only \`render_height\` / \`render_min_height\`; raw \`height\` and \`building:levels\` are not present, so the three-case split is measured as *default vs levels-shaped vs other*, with the levels share inferred from values that equal ceil(n × 3.66) — an upper bound, since a tagged height can coincide with one of those integers.\n- Exact-5 m is the OpenMapTiles fallback marker; a real 5.00 m building is indistinguishable and is (rarely) mis-bucketed into the heuristic.\n- In data-poor cities the dominant problem is the footprint count, not the height share: compare buildings-per-tile across rows.\n- OpenFreeMap merges same-attribute buildings per tile: the *features* column is how many MultiPolygons the tile holds; *buildings* counts their exterior rings.\n`;
mkdirSync('docs/evidence', { recursive: true });
writeFileSync(`docs/evidence/building-heights-${date}.md`, md);
console.log(md);
