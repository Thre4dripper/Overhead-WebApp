# Building height survey — OpenFreeMap z14 tiles (2026-09-03)

Source: `https://tiles.openfreemap.org/planet/20260830_080001_pt/{z}/{x}/{y}.pbf` (OpenMapTiles 3.16.0). One z14 tile per location, centred on the coordinates.

| Location | features | buildings (polygons) | default 5 m (no tags) | levels-shaped ceil(n×3.66) (inferred, upper bound) | other value (tagged height, lower bound) | < 2 m |
|---|---:|---:|---:|---:|---:|---:|
| London centre | 510 | 3289 | 1035 (31%) | 1122 (34%) | 1132 (34%) | 5 |
| London suburb (Hounslow) | 73 | 1117 | 822 (74%) | 292 (26%) | 3 (0%) | 0 |
| New York Midtown | 1488 | 4835 | 313 (6%) | 1214 (25%) | 3308 (68%) | 0 |
| New Jersey suburb (Paramus) | 1 | 327 | 327 (100%) | 0 (0%) | 0 (0%) | 0 |
| Denver centre | 249 | 3556 | 2451 (69%) | 533 (15%) | 572 (16%) | 48 |
| Denver suburb (Aurora) | 4 | 4181 | 4163 (100%) | 18 (0%) | 0 (0%) | 0 |
| Nairobi centre | 86 | 3438 | 3187 (93%) | 189 (5%) | 62 (2%) | 0 |
| Nairobi suburb (Kasarani) | 12 | 5190 | 5176 (100%) | 12 (0%) | 2 (0%) | 0 |
| Lagos centre | 35 | 4266 | 2790 (65%) | 1454 (34%) | 22 (1%) | 0 |
| Lagos suburb (Ikeja) | 23 | 807 | 744 (92%) | 26 (3%) | 37 (5%) | 0 |
| Mumbai (Bandra) | 21 | 2327 | 2066 (89%) | 259 (11%) | 2 (0%) | 1 |
| Jakarta (Menteng) | 83 | 11389 | 10775 (95%) | 535 (5%) | 79 (1%) | 0 |
| Tokyo (Shinjuku) | 103 | 11678 | 10990 (94%) | 418 (4%) | 270 (2%) | 7 |
| São Paulo (Pinheiros) | 125 | 12781 | 1825 (14%) | 4989 (39%) | 5967 (47%) | 0 |

Features with an id: 2813 of 2813 (100%). Because merged features carry one id for many buildings, per-building variation must come from geometry (area) at runtime — see apps/web/src/lib/buildingFallback.ts.

## Reading

- The tile carries only `render_height` / `render_min_height`; raw `height` and `building:levels` are not present, so the three-case split is measured as *default vs levels-shaped vs other*, with the levels share inferred from values that equal ceil(n × 3.66) — an upper bound, since a tagged height can coincide with one of those integers.
- Exact-5 m is the OpenMapTiles fallback marker; a real 5.00 m building is indistinguishable and is (rarely) mis-bucketed into the heuristic.
- In data-poor cities the dominant problem is the footprint count, not the height share: compare buildings-per-tile across rows.
- OpenFreeMap merges same-attribute buildings per tile: the *features* column is how many MultiPolygons the tile holds; *buildings* counts their exterior rings.
