# Map and building-height source

Decision: **OpenFreeMap** vector tiles (OpenMapTiles schema, no key, no stated limits) for the
basemap and extruded buildings; **AWS open-data terrain tiles** (terrarium) for 3D terrain. Verified
2026-09-04; full report `docs/research/map-data-maplibre-2026-09-04.md`.

| | OpenFreeMap | Protomaps | MapTiler / Stadia | AWS Terrain Tiles | Overture buildings |
|---|---|---|---|---|---|
| What | Hosted OSM vector tiles, z0–14, OpenMapTiles 3.16, styles Liberty/Bright/Positron/Dark/Fiord | PMTiles single-file archive, self-host from object storage via HTTP range requests (no server) or hosted API | Hosted vector tiles + terrain | Terrarium/normal DEM PNGs, z ≤ 15, 256 px | Bulk GeoParquet (ODbL), heights backfilled from lidar; PMTiles "x-ray" tiles exist but are not a basemap |
| Key / limits | None; "no limits on the number of map views or requests"; donation-funded, no ToS/AUP | Hosted: key required, free non-commercial, $14/mo sponsor for commercial (~1 M tiles/mo soft limit); self-host: none | Key required, monthly caps | None; not CDN-cached (S3 direct) | None; bulk download |
| Building heights | `render_height`, `render_min_height`, `colour`, `hide_3d` | Same schema when built with planetiler-openmaptiles | Same schema | — | `height`, `num_floors` |
| Terrain | **None** (open issue #19; their demo uses Mapterhorn) | Not included | Yes | Yes | — |
| Verdict | **Default basemap** | The fallback if OFM's reliability or terms change; we control it | Fallback only | **Default DEM** | Build-time enrichment candidate for a later milestone |

## Facts that changed the plan

1. **OpenFreeMap has no DEM.** Terrain comes from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
   with `encoding: 'terrarium'` (`elevation = R·256 + G + B/256 − 32768`). Getting the encoding wrong
   yields plausible-looking wrong terrain, so the source declares it explicitly. Attribution is a
   per-source list (USGS, Copernicus EU-DEM, Geoscience Australia, Kartverket, Mapzen); the About
   panel credits "Mapzen / AWS open data terrain tiles".
2. **Merged buildings.** OpenFreeMap merges same-attribute buildings in a tile into one MultiPolygon
   feature (one feature can be a whole suburb). This makes per-building style heuristics impossible
   and is why the client re-splits no-height features at runtime.
3. **MapLibre 6.** Custom layer signature is `render(gl: WebGL2RenderingContext, options)` with
   `options.defaultProjectionData.mainMatrix`; the `matrix` argument was removed in 5.0. No default
   export (ESM only); `map.transform` is gone; pitch cap is 180 (default 60, > 60 experimental).

## Height fallback chain, as shipped

1. `render_height ≠ 5` → use it (floored at 3 m). Covers tagged `height` and `building:levels`
   (baked as ceil(levels × 3.66)).
2. `render_height = 5` → the OpenMapTiles marker for "neither tag". Feature excluded from the vector
   extrusion layer and re-drawn per footprint by `apps/web/src/lib/buildingFallback.ts` with an
   area-based height and deterministic jitter.
3. No footprint at all → nothing to draw; the city reads as streets and landuse, which is the honest
   picture. (This, not missing heights, is the dominant failure in data-poor cities.)

Measured shares (z14 tile per location, exterior rings counted) — see the dated file in
`docs/evidence/`:

| Location | buildings | no tags (heuristic) | levels-shaped | tagged |
|---|---:|---:|---:|---:|
| New York Midtown | 4 835 | 6 % | 25 % | 68 % |
| London centre | 3 289 | 31 % | 34 % | 34 % |
| London suburb (Hounslow) | 1 117 | 74 % | 26 % | 0 % |
| Denver centre | 3 556 | 69 % | 15 % | 16 % |
| Denver suburb (Aurora) | 4 181 | 100 % | 0 % | 0 % |
| Nairobi centre | 3 438 | 93 % | 5 % | 2 % |
| Tokyo (Shinjuku) | 11 678 | 94 % | 4 % | 2 % |
| Jakarta (Menteng) | 11 389 | 95 % | 5 % | 1 % |
| São Paulo (Pinheiros) | 12 781 | 14 % | 39 % | 47 % |

Re-run with `pnpm survey:buildings`.
