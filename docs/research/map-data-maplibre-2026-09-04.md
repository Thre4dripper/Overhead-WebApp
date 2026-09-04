# Map data / MapLibre research — verified 2026-09-03/04

All claims below were checked against the cited URL on 2026-09-03 (UTC evening) using direct HTTP fetches (curl) or WebFetch. Items I could not confirm are marked **UNVERIFIED**.

---

## 1. OpenFreeMap

### 1a. Operating status, style URLs, vector source URL

**Operating: yes.** `GET https://tiles.openfreemap.org/planet` returned `HTTP/2 200`, `server: cloudflare`, `last-modified: Wed, 02 Sep 2026 22:00:29 GMT`. TileJSON body:

```json
{"tilejson":"3.0.0",
 "tiles":["https://tiles.openfreemap.org/planet/20260830_080001_pt/{z}/{x}/{y}.pbf"],
 "minzoom":0,"maxzoom":14,"name":"OpenFreeMap",
 "attribution":"<a href=\"https://openfreemap.org\">OpenFreeMap</a> <a href=\"https://www.openmaptiles.org/\">&copy; OpenMapTiles</a> Data from <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>"}
```
(The versioned `tiles` URL rotates weekly; always reference the TileJSON `https://tiles.openfreemap.org/planet` as the vector source `url`, as the Liberty style itself does: `"openmaptiles":{"type":"vector","url":"https://tiles.openfreemap.org/planet"}`.)

Style URLs (from https://openfreemap.org/quick_start/ and https://github.com/hyperknot/openfreemap-styles README), each probed with HEAD:

| Style | URL | HTTP |
|---|---|---|
| Liberty | https://tiles.openfreemap.org/styles/liberty | 200 |
| Bright | https://tiles.openfreemap.org/styles/bright | 200 |
| Positron | https://tiles.openfreemap.org/styles/positron | 200 |
| Dark | https://tiles.openfreemap.org/styles/dark | 200 |
| Fiord | https://tiles.openfreemap.org/styles/fiord | 200 |
| "3D" | https://tiles.openfreemap.org/styles/3d and /styles/liberty-3d | **404** |

The homepage/quick-start "3D" tab is not a separate style: `https://openfreemap.org/scripts/map.js` does `styleUrl = \`https://tiles.openfreemap.org/styles/${style.split('-')[0]}\`` and for `liberty-3d` just sets a London camera with `pitch: 60` — i.e. Liberty's built-in `building-3d` layer.

Liberty also bundles a Natural Earth raster: `"ne2_shaded":{"type":"raster","tiles":["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"],"tileSize":256,"maxzoom":6}`.

Styles repo README (https://github.com/hyperknot/openfreemap-styles): "All the OpenMapTiles styles (Bright, Positron, Dark, Fiord) are abandoned by their upstream project. Liberty is fresh and alive." / "Dark and Fiord is not yet complete."

### 1b. Acceptable use, limits, API keys, production — exact wording

From https://openfreemap.org and https://github.com/hyperknot/openfreemap README (identical text):

> "Using our **public instance** is completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies. We aim to cover the running costs of our public instance through donations."

> "The public instance has been the production basemap service of [MapHub](https://maphub.net/) since June 2024."

> "The nature of this project needs recurring donations to cover the server costs." / "If this project helps you save on your map hosting costs, please consider sponsoring me on GitHub Sponsors."

Attribution (README): required string is `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`; "You do not need to display the OpenFreeMap part, but it is nice if you do."

README "Limitations of this project":
> "OpenFreeMap is not providing: search or geocoding; route calculation, navigation or directions; static image generation; raster tile hosting; satellite image hosting; elevation lookup; custom tile or dataset hosting"

**Not found:** any acceptable-use policy, rate limit, fair-use clause, or "heavy users must sponsor" clause. There is no ToS page. The site's only ask is voluntary donation. (A WebFetch summary reported an FAQ answer "Is commercial usage allowed? Yes." — my raw-text grep of the homepage did not find that sentence, so treat it as **UNVERIFIED**; the README's "completely free… no limits" wording and MapHub production use are the citable basis for commercial/production use.)

### 1c. `building` layer: `render_height` / `render_min_height`

Confirmed from the live TileJSON `vector_layers`:
`('building', minzoom 13, maxzoom 14)`, fields `{'colour': 'String', 'hide_3d': 'Boolean', 'render_height': 'Number', 'render_min_height': 'Number'}`.

OpenMapTiles schema (https://openmaptiles.org/schema/#building):
> "All OSM Buildings. All building tags are imported (building=*). Only buildings with tag location:underground are excluded."
> render_height — "An approximated height from levels and height of the building or building:part."
> render_min_height — "An approximated height from minimum levels or minimum height of the bottom of the building or building:part."
> hide_3d — "If True, building (part) should not be rendered in 3D. Currently, building outlines are marked as hide_3d."

OFM's own Liberty style already does exactly this (layer `building-3d`, `minzoom: 14`):
```json
{"fill-extrusion-base":["get","render_min_height"],
 "fill-extrusion-height":["get","render_height"],
 "fill-extrusion-color":"hsl(35,8%,85%)","fill-extrusion-opacity":0.8}
```
Note the building layer only exists at z13–14 in the tiles (overzoomed beyond 14).

### 1d. Terrain / raster-dem / hillshade — **NO**

- No style returned by OFM has a `terrain` or `sky` key; sources are only `openmaptiles` (vector) and `ne2_shaded` (raster).
- Probes `https://tiles.openfreemap.org/{terrain,hillshade,dem,terrarium}` → 403; `/styles/terrain` → 404.
- README "not providing" list includes "elevation lookup" and "raster tile hosting".
- GitHub issue #19 "Terrain tiles / hillshading" (https://github.com/hyperknot/openfreemap/issues/19) opened 2024-09-25 by the maintainer, still **open** (last activity 2026-08-19). Maintainer, 2025-10-01: "This is not yet high-priority, as you can just directly use the source Mapterhorn Cloudflare bucket with the Maplibre plugin. But in the future I'm planning on setting it up for sure." 2025-10-22: "@wipfli set-up the plugin-free / direct-file endpoint of Mapterhorn, I made an example here: https://openfreemap.org/debug/terrain/terrain".
- That demo's `terrain.js` uses a third-party DEM, not OFM: `hillshadeSource: { type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json' }`.

Conclusion: OpenFreeMap serves vector tiles only. For DEM use AWS Terrain Tiles (below) or Mapterhorn (`https://tiles.mapterhorn.com/tilejson.json`, also used by MapLibre's official 3D-terrain example).

---

## 2. AWS Terrain Tiles (Tilezen / Mapzen) open data

Registry entry https://registry.opendata.aws/terrain-tiles/ (YAML source https://raw.githubusercontent.com/awslabs/open-data-registry/main/datasets/terrain-tiles.yaml):
> Name: Terrain Tiles — "A global dataset providing bare-earth terrain heights, tiled for easy usage and provided on S3."
> ManagedBy: "Mapzen, a Linux Foundation project"
> UpdateFrequency: "New data is added based on community feedback"
> License: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
> Resources: `arn:aws:s3:::elevation-tiles-prod` (us-east-1); `arn:aws:s3:::elevation-tiles-prod-eu` (eu-central-1)
> Documentation: https://github.com/tilezen/joerd/tree/master/docs

Registry page citation line: "Terrain Tiles was accessed on `DATE` from https://registry.opendata.aws/terrain-tiles."

**URL template** — https://github.com/tilezen/joerd/blob/master/docs/use-service.md, "Additional Amazon S3 Endpoints":
- `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- `https://s3.amazonaws.com/elevation-tiles-prod/normal/{z}/{x}/{y}.png`
- `https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif`
- `https://s3.amazonaws.com/elevation-tiles-prod/skadi/{N|S}{y}/{N|S}{y}{E|W}{x}.hgt.gz`

Same doc's caveat (quote): "NOTE: The S3 tiles are meant for efficient networking with EC2 resources only. Terrarium and normal formats are only available as 256 tile size on the Amazon S3 endpoints. The Amazon S3 endpoints are not cached using Cloudfront, but you could put your own Cloudfront or other CDN in front of them". (The `tile.mapzen.com` endpoints in that doc are defunct; the S3 bucket is what's public today.)

Live checks (2026-09-03): `terrarium/0/0/0.png` 200; `terrarium/10/163/395.png` 200 (`Last-Modified: 11 Nov 2017`, `x-amz-meta-x-imagery-sources: srtm/…, gmted/…, etopo1/…`); `terrarium/15/5241/12663.png` 200; `terrarium/16/…` **404**. EU replica `elevation-tiles-prod-eu` returned **403** for anonymous HTTPS in all URL forms tried — public HTTP access to the EU bucket is **UNVERIFIED**; use the us-east-1 bucket.

**Max zoom** (use-service.md): "Tiles are available for zooms 0 through 15"; "`{z}` zoom ranges from 0 to 20 (but no new information is added after zoom 15)"; "The maximum `{z}` value for 256 pixel tiles is zoom **15**. Requesting `{z}` coordinates past that will result in a 404 error." → set `maxzoom: 15` on the raster-dem source.

**Encoding** (https://github.com/tilezen/joerd/blob/master/docs/formats.md): "**Terrarium** format PNG tiles contain raw elevation data in meters, in Web Mercator projection (EPSG:3857). All values are positive with a 32,768 offset, split into the red, green, and blue channels, with 16 bits of integer and 8 bits of fraction." Decode: **`(red * 256 + green + blue / 256) - 32768`**. Voids: "flagged with the value -32768". Tile sizes 256/260/512/516 (S3 only serves 256).

**Licence / attribution** (https://github.com/tilezen/joerd/blob/master/docs/attribution.md): there is no single licence — it is a compilation; "Attribution is required for many terrain tile data providers. Example language is provided below, but you are responsible for researching each project to follow their license terms." Required attribution block (abridged): ArcticDEM (NSF awards 1043681, 1559691, 1542736); "Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017"; Austria "© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich"; Canada "Open Government Licence – Canada"; Europe "produced using Copernicus data and information funded by the European Union - EU-DEM layers"; "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration"; Mexico "INEGI, Continental relief, 2016"; New Zealand "Copyright 2011 Crown copyright (c) Land Information New Zealand…"; Norway "© Kartverket"; UK "© Environment Agency copyright and/or database right 2015"; US "3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey". Plus "Mapzen".

---

## 3. MapLibre GL JS

### 3a. Latest version
npm registry (https://registry.npmjs.org/maplibre-gl): `dist-tags {latest: "6.7.0", next: "6.0.0-22", v1: "1.15.3"}`; **6.7.0 published 2026-09-02T14:27:35Z**. CHANGELOG top released heading `## 6.7.0`; `## main` (unreleased) has only bug fixes.

### 3b. `CustomLayerInterface` / `render()` contract — exact, per version

Verified from published `dist/maplibre-gl.d.ts` on jsDelivr and https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/style/style_layer/custom_style_layer.ts.

| Version | `CustomRenderMethod` |
|---|---|
| ≤4.5.0 | `render(gl, matrix: mat4)` (original Mapbox-derived form) |
| 4.5.1 – 4.7.1 | `(gl: WebGLRenderingContext \| WebGL2RenderingContext, matrix: mat4, options: CustomRenderMethodInput) => void` — 3 args; CHANGELOG 4.5.1: "Expose projection matrix parameters (#3136)" |
| **5.0.0-pre.1 / 5.0.0** | `(gl: WebGLRenderingContext \| WebGL2RenderingContext, options: CustomRenderMethodInput) => void` — **matrix arg removed**, `defaultProjectionData: ProjectionData` added (globe: "Support globe mode (#3963)" in 5.0.0-pre.1; 5.0.0 breaking "⚠️ … Pass non-translated matrices to custom layer on mercator map (#3854)"). Note the 5.0.0 doc comment says "use `defaultProjectionData.projectionMatrix`" — a doc slip; the field is `mainMatrix`. |
| **6.0.0 – 6.7.0 (current)** | **`type CustomRenderMethod = (gl: WebGL2RenderingContext, options: CustomRenderMethodInput) => void;`** — gl narrowed to WebGL2 ("⚠️ WebGL (v1) support has been removed; WebGL2 is now required."), `defaultProjectionData: CustomLayerProjectionData`, `getProjectionData` added ("Expose `getProjectionData` function in custom layer args objects (#7471)"). |

Current interface (docs https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/ and source):
```ts
export interface CustomLayerInterface {
  id: string;
  type: 'custom';
  renderingMode?: '2d' | '3d';           // "Defaults to '2d'"
  render: CustomRenderMethod;             // required
  prerender?: CustomRenderMethod;
  onAdd?(map: Map, gl: WebGL2RenderingContext): void;
  onRemove?(map: Map, gl: WebGL2RenderingContext): void;
}
```

`CustomRenderMethodInput` (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CustomRenderMethodInput/), 6.7.0:
- `farZ: number` — "distance from the camera to the far clipping plane"
- `nearZ: number` — "distance from the camera to the near clipping plane"
- `fov: number` — "Vertical field of view in radians."
- `modelViewProjectionMatrix: mat4` — "Represents the matrix converting from world space to clip space."
- `projectionMatrix: mat4` — "Represents the matrix converting from view space to clip space."
- `shaderData: { variantName: string; vertexShaderPrelude: string; define: string }` — "Data required for picking and compiling a custom shader for the current projection."
- `defaultProjectionData: CustomLayerProjectionData` — "Uniforms that should be passed to the vertex shader, if MapLibre's projection code is used. … **If you just need a projection matrix, use `defaultProjectionData.mainMatrix`.** A projection matrix is sufficient for simple custom layers that only support mercator projection. Under mercator projection … The spherical mercator coordinate `[0, 0]` represents the top left corner of the mercator world and `[1, 1]` represents the bottom right corner. When the `renderingMode` is `"3d"`, the z coordinate is conformal. A box with identical x, y, and z lengths in mercator units would be rendered as a cube. `MercatorCoordinate.fromLngLat` can be used to project a `LngLat` to a mercator coordinate."
- `getProjectionData: (params: CustomLayerProjectionDataParams) => RendererProjectionData`

`ProjectionData` / `CustomLayerProjectionData` (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/ProjectionData/): `mainMatrix` ("The main projection matrix. For mercator projection, it usually projects in-tile coordinates 0..EXTENT to screen, for globe projection, it projects a unit sphere planet to screen." uniform `u_projection_matrix`), `fallbackMatrix`, `tileMercatorCoords: [x,y,sx,sy]`, `clippingPlane`, `projectionTransition` (0 mercator … 1 globe), `clipAntimeridian`. `CustomLayerProjectionData = ProjectionData<ProjectionMatrix, ProjectionMatrix>` where matrices may be Float64 ("so custom layer code can apply additional CPU-side transforms before converting to 32-bit floats for WebGL upload").

Practical: for a mercator-only custom layer, use `options.defaultProjectionData.mainMatrix` (the drop-in for the old `matrix`). Since 6.0.0 the bundle is ESM-only (`maplibre-gl.mjs`), `map.transform` is gone, and shaders use `#pragma maplibre`.

### 3c. `MercatorCoordinate`
https://maplibre.org/maplibre-gl-js/docs/API/classes/MercatorCoordinate/ — "the size of 1 unit is the width of the projected world", origin north-west, `(0,0,0)` NW … `(1,1,0)` SE; z conformal.
- `static fromLngLat(lngLatLike: LngLatLike, altitude?: number): MercatorCoordinate` — "Project a `LngLat` to a `MercatorCoordinate`." `altitude` = "The altitude in meters of the position" (default 0).
- `meterInMercatorCoordinateUnits(): number` — "Returns the distance of 1 meter in `MercatorCoordinate` units at this latitude."
- also `toLngLat(): LngLat`, `toAltitude(): number`.

### 3d. `maxPitch`
Source https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/map.ts: `const defaultMaxPitch = 60; const maxPitchThreshold = 180;` Constructor and `setMaxPitch()` throw `` `maxPitch must be less than or equal to ${maxPitchThreshold}` `` (i.e. 180).
MapOptions docs (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/):
> `maxPitch` — "The maximum pitch of the map (0-180)." `@defaultValue 60`
> `pitch` — "The initial pitch (tilt) of the map, measured in degrees away from the plane of the screen (0-85). … Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project."
> `setMaxPitch(maxPitch?: number | null)` — "The maximum pitch to set (0-180). Values greater than 60 degrees are experimental and may result in rendering issues."
History: 2.0.0 "Allow maxPitch value up to 85, use values greater than 60 at your own risk (#574)"; 5.0.0 "Add support for pitch > 90 degrees (#4717)" and "⚠️ Fix level of detail at high pitch angle by changing which tiles to load (#3983)". MapLibre's own example `test/examples/3d-terrain.html` uses `maxPitch: 85`.

### 3e. raster-dem `terrarium` + `setTerrain`
Style spec sources (https://maplibre.org/maplibre-style-spec/sources/ raster-dem): `encoding` — "Optional enum. Possible values: `terrarium`, `mapbox`, `custom`. Defaults to `"mapbox"`." terrarium: "Terrarium format PNG tiles. See https://aws.amazon.com/es/public-datasets/terrain/ for more info." custom: "Decodes tiles using the redFactor, blueFactor, greenFactor, baseShift parameters." `tileSize` default 512.
Terrain root (https://maplibre.org/maplibre-style-spec/terrain/): `source` (string, required) "The source for the terrain data."; `exaggeration` (number, default 1) "The exaggeration of the terrain - how high it will look." Example `"terrain": {"source": "raster-dem-source", "exaggeration": 0.5}`.
Map API: `setTerrain(options: TerrainSpecification | null, styleOptions: StyleSetterOptions = {}): this` — "Loads a 3D terrain mesh, based on a "raster-dem" source. Triggers the `terrain` event." example `map.setTerrain({ source: 'terrain' });`. 6.0.0: "Validate the terrain passed to `map.setTerrain`" and "Validate `raster-dem` sources passed to `map.addSource`".
```js
map.addSource('dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: '…' });
map.setTerrain({ source: 'dem', exaggeration: 1 });
```

### 3f. fill-extrusion + sky
Style spec v8.json (https://raw.githubusercontent.com/maplibre/maplibre-style-spec/main/src/reference/v8.json):
- `fill-extrusion-height` number, meters, default 0, **data-driven** (zoom, feature, feature-state; interpolated) — "The height with which to extrude this layer. Negative values extrude below ground level…"
- `fill-extrusion-base` number, meters, default 0, **data-driven** — "Must be less than or equal to `fill-extrusion-height`."
- `fill-extrusion-vertical-gradient` boolean, default **true**, data-constant (zoom only) — "Whether to apply a vertical gradient to the sides of a fill-extrusion layer. If true, sides will be shaded slightly darker farther down."
- `fill-extrusion-color` data-driven; alpha ignored — use `fill-extrusion-opacity` (layer-wide).
So `"fill-extrusion-height": ["get","render_height"]` is valid (OFM Liberty does it).

Sky (https://maplibre.org/maplibre-style-spec/sky/): "The map's sky configuration. **Note:** this definition is still experimental and is under development in maplibre-gl-js." Properties/defaults: `sky-color` `#88C6FC`; `horizon-color` `#ffffff`; `fog-color` `#ffffff` ("Requires 3D terrain."); `fog-ground-blend` 0.5 ("Where 0 is the map center and 1 is the horizon."); `horizon-fog-blend` 0.8; `sky-horizon-blend` 0.8; `atmosphere-blend` 0.8 ("It is best to interpolate this expression when using globe projection."). API: `setSky(sky: SkySpecification, options: StyleSetterOptions = {}): this`, e.g. `map.setSky({'atmosphere-blend': 1.0})`; `getSky()`. 5.0.0: "Disabled unsupported Fog rendering, for Terrain3D on Globe". 6.1.0: `global-state` expressions allowed in `sky.*`.

---

## 4. Protomaps

PMTiles (https://docs.protomaps.com/pmtiles/): "PMTiles is a single-file archive format for pyramids of tiled data." "PMTiles readers use HTTP Range Requests to fetch only the relevant tile or metadata inside a PMTiles archive on-demand." Can be "hosted on a storage platform like S3, and enables low-cost, zero-maintenance map applications." "PMTiles is a read-only format. It is not possible to update an archive in-place without re-writing the entire file." Cloud storage (https://docs.protomaps.com/pmtiles/cloud-storage): "PMTiles is designed to work on any S3-compatible cloud storage platform that supports HTTP Range Requests." — S3, Cloudflare R2 ("recommended … because it does not have bandwidth fees, only per-request fees"), GCS, Azure, DigitalOcean Spaces, Backblaze B2, Supabase, Tigris, Bunny, GitHub Pages; CORS must allow methods `GET,HEAD`, headers `range,if-match`, expose `etag`; "each Range tile request will count as a GET." **No server is needed**: MapLibre reads the archive directly via `new Protocol(); maplibregl.addProtocol("pmtiles", protocol.tile)` and `"url": "pmtiles://https://example.com/example.pmtiles"` (https://docs.protomaps.com/pmtiles/maplibre — "Using the `pmtiles://` protocol will automatically derive a `minzoom` and `maxzoom` for your `Source`."). A serverless function/CDN (https://docs.protomaps.com/deploy/) is optional, adding plain `{z}/{x}/{y}.mvt` URLs, edge caching and private-bucket access.

Hosted API (https://protomaps.com/api): "The Protomaps Tile API is free for non-commercial use." "For commercial use, become a GitHub Sponsor". API key required; URL `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=MY_KEY` (TileJSON `tiles/v4.json?key=`, styles `styles/v5/light/en.json?key=`). Limits: GitHub Sponsors $14/mo tier (https://github.com/sponsors/protomaps): "Commercial use of api.protomaps.com - up to **1 million** tile requests per month. This is a soft limit that's forgiving of occasional traffic spikes." Blog (https://protomaps.com/blog/free-tier-maps/, 2022): "free up to a soft cap of 1,000,000 requests per month." Self-host basemap builds (https://docs.protomaps.com/basemaps/downloads): "A full planet file is roughly 120 gigabytes, including zoom levels from 0 to 15"; ODbL produced work (OSM attribution required); "URLs may change and hotlinking to these downloads are discouraged. Instead, you should copy the tileset to your own Cloud Storage."

---

## 5. Overture Maps — buildings

Licence (https://docs.overturemaps.org/guides/buildings/): "Because it includes OpenStreetMap data, the buildings theme is published under the ODbL license." "This requires that any other source included in the theme also be provided under ODbL or a compatible license, such as CC BY 4.0". Attribution page (https://docs.overturemaps.org/attribution/): buildings/base/transportation/divisions = **ODbL**, attribution "© OpenStreetMap contributors. Available under the Open Database License"; places = CDLA Permissive 2.0 / Apache 2.0 / CC0 (not buildings). Sources: OSM, Esri Community Maps, Microsoft ML roofprints, Google Open Buildings, authoritative national sets.

Format / access (https://docs.overturemaps.org/getting-data/, https://docs.overturemaps.org/examples/overture-tiles/): "Overture is primarily distributed in the GeoParquet format" — hive-partitioned `s3://overturemaps-us-west-2/release/2026-08-19.0/theme=buildings/type=building/*` and Azure `https://overturemapswestus2.blob.core.windows.net/release/2026-08-19.0/theme=buildings/type=building/*`; query with DuckDB ("DuckDB lets you query Overture's GeoParquet files with SQL"), `pip install overturemaps` CLI (bbox download), STAC catalog `https://stac.overturemaps.org/catalog.json`. Building schema (https://docs.overturemaps.org/schema/reference/buildings/building/): `height` float64 "Height of the building or part in meters"; `min_height` ("Altitude above ground where the bottom of the building or building part starts"); `num_floors` int32; `min_floor`; `roof_height`.

Hosted tiles: **no Z/X/Y API**, but Overture publishes per-theme PMTiles for each release: `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/<RELEASE>/<THEME>.pmtiles` (s3: `s3://overturemaps-extras-us-west-2/tiles/<RELEASE>/<THEME>.pmtiles`). Verified `tiles/2026-08-19.0/buildings.pmtiles` HEAD 200, size 180,364,329,147 bytes (~180 GB; `Last-Modified 19 Aug 2026`). Docs caveat: "The tilesets accompanying Overture releases are primarily for powering the Overture Explorer." "These tilesets are designed for an 'X-ray' visualization like at explore.overturemaps.org to aid in inspecting geometry and properties. They are not designed to be a production-ready cartographic basemap." Recommended: `pmtiles extract <url> --bbox=…` a regional subset to your own bucket. Generator: https://github.com/OvertureMaps/overture-tiles (Planetiler).

---

## Beliefs checked
- (i) "OpenFreeMap serves free raster-dem terrain" — **WRONG.** Vector tiles only; terrain is an open issue (#19); their demo uses Mapterhorn.
- (ii) "MapLibre maxPitch can be raised to 85" — **TRUE but out of date.** 85 was the cap in v2–v4; since 5.0.0 the hard cap is **180** (`maxPitchThreshold = 180`, "(0-180)"); >60 still documented as experimental; `pitch` option doc still says 0-85.
- (iii) "OpenFreeMap has no API key and no stated request limit" — **CORRECT** (verbatim: "no limits on the number of map views or requests … no API keys"); donation-funded, no ToS/AUP found.
