# Decisions

Consequences of the owner's decisions and every call made on an open question. Dates are absolute.

## 2026-09-04 — Altitude compression constants
`visualHeight(h) = h` for h ≤ 1 000 m; above that `1000 + 150 · ln(1 + (h − 1000) / 150)`. Slope is 1
on both sides of the join (C¹). FL370 lands at ~1 640 m visual, 20 000 m at ~1 730 m — roughly 11×
a 150 m skyline and inside the frustum at the home framing (zoom 14.4, pitch 70). Tuned on
2026-09-04 after screenshots at pitch 64 showed cruise traffic sitting just above the frame. Inverse is `trueHeight`. Package:
`packages/altitude`, tests assert monotonicity at 1 m resolution, round-trip, C¹ continuity, and
that the ruler ticks derive from the same function (M6 acceptance).

**Latitude parameter.** The brief's signature was `visualHeight(altitudeMeters, latitude)`. The
function accepts latitude but ignores it: the mapping is in metres, and the latitude-dependent
Mercator scale is applied exactly once by the renderer through `meterInMercatorCoordinateUnits()`.
Folding latitude into the mapping would double-apply it.

## 2026-09-04 — MSL vs height above terrain
Barometric altitude is MSL; terrain is not zero. The mapping compresses **height above the terrain
elevation at the map centre** (`visualAltitudeMsl(alt, groundRef)`), then adds that ground back.
One reference elevation per scene, not per aircraft, so a plateau city (Denver, 1 600 m) shows
rooftop traffic at rooftop height without per-aircraft terrain queries. In steep terrain an aircraft
over a distant ridge is placed relative to the centre's ground — acceptable for v1, recorded here.

## 2026-09-04 — Aircraft data source: adsb.lol by default
See `docs/data-source.md`. OpenSky's terms (verified 2026-09-04) require a written licence for
"integration into a live product, service, or automated system" regardless of profit status, so it
is a dev/testing option only. airplanes.live returns 403 to non-feeders and is non-commercial.
adsb.lol is free, ODbL (attribution + share-alike, commercial use allowed), warns that an API key
will be required in future. Provider is a config switch (`AIRCRAFT_PROVIDER`), and the readsb feeds
already join type/registration from the tar1090 database so M3's join needs no separate download.

## 2026-09-04 — Map data: OpenFreeMap vector + AWS terrarium DEM
OpenFreeMap serves **no terrain tiles** (the brief believed it did). Terrain comes from AWS open-data
terrain tiles, terrarium encoding, z ≤ 15, asserted in the style (`encoding: 'terrarium'`). Those S3
endpoints are not CDN-cached; if latency matters, Mapterhorn or a self-hosted PMTiles DEM is the
swap. See `docs/map-data.md`.

## 2026-09-04 — Building height chain and the merged-feature problem
OpenMapTiles bakes `render_height = COALESCE(height, levels × 3.66, 5)` and OpenFreeMap merges
every same-attribute building in a tile into one MultiPolygon feature. Consequences:
1. Raw `height` and `building:levels` are not in the tile; the chain's first two cases collapse into
   "render_height ≠ 5, use it" (floored at 3 m).
2. The third case (neither tag) cannot be varied per building by a style expression — a whole
   suburb is one feature. So the web client splits those features at runtime
   (`buildingFallback.ts`) into per-footprint GeoJSON extrusions with an **area-based** height
   (4.2 m sheds → 7.4 m houses → 9.6 m terraces → 12.5 m blocks → 9.5 m big-box) and a
   deterministic ±14 % jitter. Uniform in spirit, not identical stubs.
3. Measured on 2026-09-04 (`docs/evidence/building-heights-*.md`): the no-tag share is 6 % in
   Midtown Manhattan, 31 % in central London, 74 % in a London suburb, 93–100 % in Nairobi, 94–95 %
   in Tokyo/Jakarta, 100 % in US suburbs sampled. The brief's load-bearing fact holds; the
   heuristic renders most of the planet.
4. Known artefact: a footprint straddling a tile edge is emitted clipped from both tiles; the two
   halves overlap slightly. Acceptable for v1.

## 2026-09-04 — Depth: aircraft draw over everything
The custom layer clears the depth buffer before drawing aircraft, so a tower can never occlude a
plane; aircraft still depth-sort against each other. Trade-off: an aircraft "behind" a skyscraper at
max pitch draws in front of it. The alternative (true occlusion) hides exactly the traffic the app
exists to show.

## 2026-09-04 — Camera
`maxPitch: 75` (brief), home framing zoom 14.4 / pitch 70 / bearing 0 with the user's point in the
lower third. Below zoom 13.6 (or on a forced flat setting / low-end device) the extrusions and the
3D layer switch off and aircraft become flat silhouettes on the flat map, with the same labels and
picking. MapLibre 6 caps pitch at 180 (not 85 as the brief believed); above 60 remains documented as
experimental.

## 2026-09-04 — On-ground aircraft
Excluded from every view. `on_ground: true` and `alt_baro: "ground"` records are dropped at the
traffic store; an aircraft with no barometric altitude cannot be placed and is dropped too (never
defaulted to zero).

## 2026-09-04 — Metadata "generic" category
A join miss renders the narrow-body mesh in the `generic` category (label "Aircraft (unknown
type)"). Emitter category (A1–A7) is used as the fallback before that.

## 2026-09-04 — Building kit usage
Owner decision 4 gives MapLibre the buildings, so the low-poly kit is scenery for the first-run
diorama (`street.glb`) rather than placed from footprints. Recorded so nobody wonders why the kit is
not on the map.

## 2026-09-04 — Accounts and billing
No OAuth provider or payment processor was specified. Accounts are anonymous device ids (UUID in
localStorage, posted to `/api/users` with the home location); "Pro" is a local flag with a visible
"billing not wired" note. Postgres and Redis are optional: blank `DATABASE_URL`/`REDIS_URL` select
in-process stores so `pnpm dev` works with nothing else running. Docker compose provides both.

## 2026-09-04 — AR compass
iOS uses `webkitCompassHeading` (true north) to align the orientation matrix; Android uses
`deviceorientationabsolute` (magnetic) plus declination fetched via the API's NOAA proxy, with a
visible calibration prompt when that fails and a ±2° nudge control. The pinhole projection uses a
fixed 62° vertical field of view; no camera-intrinsics calibration in v1.

## 2026-09-04 — Demo traffic
If the API is unreachable the client runs a local synthetic airspace and says so in the status line
("Demo traffic — not real aircraft"). The same generator backs the API's `demo` provider.

## 2026-09-04 — Tile clustering after adsb.lol 429s
A user on a tile boundary subscribes to 2–4 geohash tiles; polling each separately every 10 s drew
`429 Too Many Requests` from adsb.lol within minutes. The poller now groups adjacent active tiles
whose union fits in 110 km (≈ 60 nm) into one upstream request and splits the result per tile, so a
seam costs one call, not four. Per-cluster locks keep "one call per interval per deployment" (test:
`fetches adjacent tiles with ONE upstream call`). Backoff honours `Retry-After` and doubles otherwise.
The client subscribes to every tile within 10 km of the view centre (2–4 tiles); clustering makes
that one upstream call, and the overhead list gains the traffic just across a cell seam.

## 2026-09-04 — Phone fixes after first device test
- **Frozen aircraft.** Dead reckoning measured elapsed time against the device clock, so a phone a
  minute behind the server clamped to zero and froze; staleness was measured from receipt time, so a
  position the aggregator kept re-sending never expired. Position age is now `ageAtRx + sinceRx`,
  both local, extrapolation continues (fading) to 120 s, drop at 150 s.
- **Sky in frame.** Vertical FOV raised to 50° (MapLibre default 36.87° hides the horizon below pitch
  71.6°), home pitch 72, max pitch 80. On a portrait phone the top of the frame is now sky with cruise
  traffic in it; approach traffic sits over the city below.
- **Secure context.** The dev server is HTTPS (self-signed) because sensors, camera and geolocation
  require it on phones. `DEV_HTTP=1` keeps plain HTTP for localhost-only work.
- **What the camera sees is what we subscribe to.** Tiles are chosen from the visible bounds (nearest
  8), not just a radius around the centre; clustering keeps it one upstream call.
- **Drop lines.** A hairline from each aircraft to its ground track makes the compressed height read
  as "above that point"; the flat-map icon sits on exactly that point, so the two views agree.

## 2026-09-04 — Per-IP upstream gate
With several sessions (phone, laptop, screenshot runs) polling different clusters at once, adsb.lol
returned 429 on more than half the calls. The limit is per IP, so the poller now gates all clusters
together: 1.5 s minimum spacing, 24 calls per minute (`UPSTREAM_MAX_PER_MINUTE`), and any 429 pauses
every cluster for at least 20 s. Clusters that cannot poll keep serving their cached frame while the
client dead-reckons. Consequence: with many distinct areas active, each area's refresh stretches
beyond 10 s; that is the honest cost of a free community feed and the place a paid feed would plug in.

## 2026-09-04 — Hobby project: free, one provider, no databases (owner decision)
The owner dropped monetisation. Consequences applied:
- **OpenSky is the only live provider**, with the owner's OAuth2 client credentials. adsb.lol and
  airplanes.live providers were removed. OpenSky's terms (see docs/research) reserve the REST API
  for non-profit research and educational use and ask for a written licence for "integration into a
  live product"; a personal hobby site is the closest fit to that spirit, and the owner accepts the
  reading. Nobody is charged, nothing is redistributed, and the attribution names OpenSky.
- **Credits are budgeted.** A registered account has 4 000 credits per day; each bounding-box call
  costs 1–4 depending on area. The poller spends at most `OPENSKY_DAILY_CREDITS ÷ 24` per rolling
  hour across all areas, so a single watched area refreshes every ~22 s and two areas every ~44 s.
  Dead reckoning covers the gaps; the HUD shows "updated N s ago" so the cadence is visible.
- **Type and registration come from OpenSky's aircraft database.** OpenSky state vectors carry
  neither, so without the join every model would be the generic jet. The API downloads the CSV
  (~94 MB, ~520 k rows, dated 2024-11) into `data/` on first start and loads it into memory.
  Coverage of new airframes since 2024 is missing; the emitter category (A1–A7) fills in.
- **No Postgres, no Redis, no push server.** The tile registry and frame cache are in-process; the
  logbook, stamps and watch rules live in the browser's localStorage; alerts are evaluated in the
  browser and shown as toasts or Notifications while the app is open (no background push).
- **Routes.** `/` is the homepage, `/live` the view. `/live` without a chosen location redirects home.
- **Phone fixes.** Android AR heading had a sign error (the orientation matrix already yields a
  compass heading; the extra negation inverted horizontal motion). Manual "drag to look" now drags
  the sky. The reversed diorama plane was a yaw sign (nose is −Z; heading east is −90°).
