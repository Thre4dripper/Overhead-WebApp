# Overhead — build brief for a coding agent

## What we're building

A web app (PWA first) that shows you the aircraft flying above you, in a tilted 3D view of your
actual city. Open it and the buildings around you stand up in low-poly form; live traffic moves
above them at readable heights. Drag to orbit, pinch to zoom, tilt the camera up toward the
horizon. Tap an aircraft for altitude, speed, heading, type and registration, and orbit a 3D
model of what you're looking at.

Not an open-world game. There is no ground-level walking, no interiors, no vehicles, no
first-person camera. The city is scenery whose only job is to make "above you" legible — a
tilt-limited overhead camera looking down and out at your neighbourhood with planes over it.

A second view, shipped last, lets you hold the phone up and point it at the sky to identify what
you're actually looking at.

The free product is the live view, forever. The paid product is memory and attention: a logbook
of what you've spotted, alerts when something unusual passes overhead, and a daily digest.

## Owner decisions already made

Do not re-litigate these. Record any consequence you discover in `docs/decisions.md`.

1. **Altitude is compressed, not true-to-scale.** See "The altitude problem" below — it is the
   most important section in this brief.
2. **Global coverage, quality varies.** Anywhere on earth loads. Buildings extrude where height
   data exists and degrade gracefully where it doesn't. No per-city hand-tuning.
3. **Both views ship.** The 3D city view and the point-at-the-sky AR view. The owner was told
   these overlap and that the AR view is the single largest risk in the project, and chose both
   anyway. The 3D city view is the primary product and ships first; AR is the last milestone and
   is the one to cut if anything must be cut.
4. **MapLibre GL JS plus a three.js custom layer.** MapLibre owns terrain, extruded buildings,
   tiles and the camera; aircraft meshes ride in a three.js custom layer sharing MapLibre's
   camera matrix. Do not hand-roll tile loading or projection.

## The altitude problem

This decides the feel of the whole app, so understand it before writing render code.

A cruising airliner is at ~11,000m. Buildings are 30–150m. At true scale every interesting
aircraft is a dot seventy times higher than the tallest thing on screen, and the city is a flat
texture at the bottom of the frame. True scale makes the 3D city pointless.

So altitude is **compressed monotonically**: low-altitude traffic renders near true scale, and
everything above roughly 1,000m is progressively squashed so that cruise traffic sits visibly
above the skyline instead of off-screen.

Requirements on the mapping:

- **One pure function, one module.** Something in the shape of
  `visualHeight(altitudeMeters, latitude): number`. Every consumer — the mesh layer, the altitude
  ruler, the tap-target picking, the trail rendering — calls it. No consumer applies its own
  fudge factor. This is the single most copy-pasted-by-accident function in the codebase; put it
  behind a test that asserts monotonicity across the full 0–20,000m range.
- **Monotonic and invertible.** A higher aircraft must never render lower than a lower one, and
  you need the inverse to label the altitude ruler.
- **Near-linear below ~1,000m.** Approach and departure traffic is the most visually interesting
  content in the app and it should look geometrically honest against the buildings.
- **Log-like above that.** A curve like `k * log1p(alt / a)` above the linear zone, C¹-continuous
  at the join so aircraft don't visibly kink as they descend through it. Tune `k` and `a` so
  FL370 lands a comfortable distance above a 150m skyline rather than at the top of the frustum.

Requirements on the UI, which are not optional:

- **Never imply the view is to scale.** The displayed height is a readability device.
- **Always show true altitude as text** on every aircraft label and in the detail panel, in feet
  and flight level, from the real `baro_altitude`.
- **Draw a visible altitude ruler** along one edge of the viewport with labelled gridlines at real
  altitudes, positioned through the same mapping. This is what makes the compression legible
  rather than deceptive: the user can see that the gridlines bunch up.
- **Say so in the UI once**, in the about or first-run copy. One sentence.

## Settle these before writing any code

### 1. The aircraft data source licence decides the project

OpenSky Network's free tier is non-commercial, which directly conflicts with charging money. Do
not start building against it and hope to sort it out later.

Write a comparison in `docs/data-source.md` covering at minimum:

- **OpenSky Network** — free, well documented, non-commercial restriction, larger quota if you
  contribute a receiver.
- **adsb.lol** and **airplanes.live** — community feeds, generally more permissive, verify their
  current terms directly.
- **ADSBExchange** — sells commercial access.
- **Running your own receiver** — an SDR dongle on a windowsill is roughly $150 and changes the
  licensing question entirely, though it only covers your own reception radius.

Whatever you choose, **write the data layer behind a provider interface from commit one** so
swapping sources is a config change and not a rewrite:

```ts
interface AircraftProvider {
  fetchBox(bbox: BBox): Promise<StateVector[]>
  readonly attribution: string
  readonly costHint: (bbox: BBox) => number
}
```

### 2. The map and building-height source

Write a second comparison in `docs/map-data.md`. Candidates, with what I believe to be true —
verify each:

- **OpenFreeMap** (`https://tiles.openfreemap.org/planet`) — hosted OSM vector tiles, OpenMapTiles
  schema, no API key, no registration, no stated request limit. Its `building` layer carries a
  `render_height` property usable directly by `fill-extrusion`. Also serves free `raster-dem`
  terrain. This is the recommended starting point precisely because it has no key and no bill.
  Confirm it is still operating and check what it says about acceptable use at app scale.
- **Protomaps** — the open map in a single archive file, self-hostable from object storage. The
  right answer if OpenFreeMap's terms or reliability don't hold, because you control it.
- **MapTiler / Stadia Maps** — good free tiers, but require an API key and have monthly tile-load
  caps. Fine as a fallback, not as the default.
- **AWS Terrain Tiles open data** (`elevation-tiles-prod`, terrarium encoding) — free DEM tiles, no
  key. Note the encoding: MapLibre's `raster-dem` source needs `encoding: 'terrarium'` for these,
  and Mapbox-RGB encoding for others. Getting this wrong yields plausible-looking but completely
  wrong terrain.
- **Overture Maps buildings theme** — a bulk dataset, not tiles. Relevant because it backfills
  building heights from lidar (USGS 3DEP in the US) that plain OSM lacks. Consider it as a
  build-time enrichment source, not a runtime one, and check its licence separately.

**The load-bearing fact:** under 10% of OSM buildings globally carry a `height` tag, and under 20%
in the US. `building:levels` is more common. This means **most of the world will not extrude from
real heights**, and the fallback heuristic is not a nicety — it is what renders the majority of the
planet. Specify it explicitly:

1. Real `height` in metres if present.
2. Else `building:levels × 3.2m`.
3. Else a heuristic from footprint area and building type, deliberately conservative and visibly
   uniform, so a data-poor city reads as "stylized low-rise" rather than as a broken render.

Do not let the third case produce a field of identical 3m stubs. Test the fallback against a city
known to have sparse height data before considering M2 done, and report the measured share of
buildings hitting each of the three cases.

## Verify these too

Working partly from memory here. Confirm against current docs and record findings in
`docs/research-notes.md`. If any of it is wrong, say so explicitly rather than routing around it.

- **OpenSky auth.** I believe they moved from HTTP basic auth to OAuth2 client credentials, and
  introduced an API credit system where anonymous, registered, and receiver-contributing accounts
  get progressively larger daily budgets, with bounding-box queries costing credits scaled by the
  area requested. Confirm the current mechanism and the actual numbers before designing around
  them.
- **State vector shape.** I believe `/api/states/all` returns positional arrays, not objects,
  roughly: `[icao24, callsign, origin_country, time_position, last_contact, longitude, latitude,
  baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk,
  spi, position_source]`. Confirm the exact order and write a typed parser with a runtime schema
  check, because a silent index shift here corrupts everything downstream.
- **Aircraft metadata.** OpenSky publishes a downloadable aircraft database keyed on ICAO24 hex.
  Confirm it still exists, check its licence separately from the API licence, and check coverage.
- **MapLibre pitch ceiling.** `maxPitch` defaults to 60 and can be raised to 85, but pitch above 60
  is documented as experimental, may cause rendering issues, and can load excessive tiles near the
  horizon. Verify current status, then pick a clamp — see the camera section.
- **Custom-layer camera contract.** Confirm the current `CustomLayerInterface` shape and how the
  projection matrix is handed to `render()`, since this is the seam the entire 3D layer sits on and
  it has changed across MapLibre majors. Pin the MapLibre version.

## What the feed gives you, and what it doesn't

The feed gives you positions. It does not give you the thing users actually want to know.

- **Type and registration**: not in the state vector. Join locally on ICAO24 against the aircraft
  metadata database. Static file, costs nothing at request time. Ship it as a build artifact,
  refresh on a schedule. The type code is also what selects which 3D model to render, so a join
  miss must fall back to a generic mesh, never to nothing.
- **Route (where it's going)**: genuinely hard and not in the free feed. Historical flight
  endpoints exist but are heavy and not built for live lookup. **For v1, do not show routes.** Show
  the callsign, decode the airline prefix from a static ICAO airline table, and stop there. Do not
  fabricate or guess a destination.

## Stack

- **TypeScript** throughout.
- **Backend**: a long-running Node service (Fastify). Not serverless — you need persistent pollers
  and open connections.
- **Redis** for tile state and pub/sub. Load-bearing, not optional.
- **Postgres** for users, sightings and alert rules.
- **Frontend**: React + Vite, as a PWA.
- **Map and camera**: MapLibre GL JS. Terrain from a `raster-dem` source, buildings via
  `fill-extrusion`, pitch-limited camera.
- **Aircraft and models**: three.js inside a MapLibre `CustomLayerInterface`, sharing MapLibre's
  projection matrix. glTF/GLB models, instanced per category.
- **AR sky view** (last milestone): the same three.js renderer driven by device orientation instead
  of the map camera, over a camera feed or a plain sky gradient.

## Camera

The camera is a product decision, not a default. Specify and tune it deliberately.

- **Pitch clamp.** Start at `maxPitch: 75`. Enough to see planes above the skyline and a slice of
  horizon; short of the range where MapLibre's tile loading degrades. Treat 85 as an experiment to
  measure, not a target, and never allow a fully horizontal camera — it turns the compressed
  altitude mapping into a wall of overlapping aircraft and loads tiles to the horizon.
- **Zoom range.** Buildings only make sense from roughly z14 up. Below that, drop the extrusion
  layer and the aircraft meshes entirely and fall back to flat icons on a 2D map — this is also
  your WebGL-unavailable and low-end-device path, so build it as a real supported mode rather than
  an error state.
- **Rotation.** Free bearing rotation, but provide a prominent reset-to-north control. Users get
  lost instantly in a rotated 3D city.
- **Fog / depth cue.** Fade distant geometry toward the sky colour. Without it, a tilted city at
  z14 reads as visual noise and you cannot tell near buildings from far ones.
- **Home framing.** Opening the app should land on a specific, tuned camera pose over the user's
  location, not on whatever the last session left behind.

## Architecture — the part that makes this viable

API credits are consumed **per application, not per user**. So never let clients talk to the
upstream provider directly. Instead:

```
client → subscribes to a geohash tile (precision ~4, roughly 20km)
       ↓
   tile registry (Redis): which tiles have live subscribers
       ↓
   poller: for each ACTIVE tile, fetch bbox every ~10s, once
       ↓
   normalize → join aircraft metadata → publish to tile channel
       ↓
   fan out over WebSocket/SSE to every subscriber of that tile
```

Cost then scales with the number of *distinct populated areas*, not with user count. Five hundred
users in one city cost the same as five. Guard it properly:

- Stop polling a tile within seconds of its last subscriber leaving.
- Hard-cap concurrent active tiles and shed the least-populated ones under pressure.
- Cache the last frame per tile so a new subscriber gets data instantly instead of waiting for the
  next poll.
- If a user sits on a tile boundary, subscribe them to both neighbours.

Map tiles are a separate concern and are cached by the browser and the CDN — do not route them
through your backend.

## Known gotchas

**Mercator units are not metres.** This is the one that will silently ruin the 3D layer. MapLibre
custom layers work in Mercator coordinate space where one unit is not one metre and the scale
varies with latitude. Convert through `MercatorCoordinate.fromLngLat(lngLat, altitude)` and scale
model geometry by `meterInMercatorCoordinateUnits()`, recomputed for the current latitude. Hardcode
a scale factor and your aircraft will be correctly sized in one city and absurd in another.

**Aircraft must not be occluded by buildings.** They are above everything, but a tilted camera plus
a shared depth buffer will happily hide a plane behind a tower. Decide the depth interaction
explicitly and test it against a tall-building city with the camera near max pitch.

**Draw calls, not triangles, are the phone killer.** Fifty aircraft as fifty separate meshes will
stutter on a mid-range Android. Instance per category and share materials. Budget the whole scene,
not just the models.

**Planes will teleport if you don't interpolate.** You poll every ~10 seconds but render at 60fps.
Dead-reckon between updates using `velocity` and `true_track` to move aircraft smoothly, then
correct when the next real position lands. Without this the app feels broken; with it, it feels
alive. Interpolate `baro_altitude` and `vertical_rate` too, or climbing aircraft will jump
vertically through the compressed altitude mapping — which is far more visible than a horizontal
jump. This is the highest-impact piece of frontend work in the project.

**Callsigns are space-padded.** Fixed-width 8-character strings. Trim them or your UI will be full
of ragged whitespace and your lookups will miss.

**Nulls are everywhere.** `longitude`, `latitude`, `baro_altitude`, `velocity` and `true_track` can
all be null in a valid state vector. `baro_altitude` and `geo_altitude` differ and either may be
missing. An aircraft with no altitude cannot be placed in a 3D scene at all — drop it from the 3D
view rather than defaulting it to zero and burying it in the ground. Aircraft with `on_ground: true`
are excluded from the airborne view but are legitimately interesting on the runway; decide and
document which.

**Units are metric at the source.** Altitude in metres, velocity in m/s, track in degrees. Convert
once at the boundary into a display layer that knows about feet and knots, and never let raw units
leak into components.

**Terrain DEM encoding.** Terrarium and Mapbox-RGB encode elevation differently. Mismatch produces
terrain that looks plausible and is wrong. Assert the encoding matches the source.

**Aircraft altitude is above sea level, terrain is not zero.** With 3D terrain enabled, an aircraft
at 2,000m over a 1,500m plateau is 500m above the ground. Barometric altitude is MSL. Decide
whether the compressed mapping operates on MSL or on height-above-terrain, and be consistent — in
mountainous cities the two look completely different.

**Elevation angle is what "overhead" means.** For the overhead list and the AR view, compute
great-circle distance and bearing from user to aircraft, then:

```
elevation = atan2(altitude_m, ground_distance_m)
```

Use **true** altitude here, never the compressed value. Filter to elevation above roughly 20° and
sort by elevation descending so the most directly-overhead aircraft is first. Distance alone is the
wrong sort: a plane 5km away at 11km altitude is far more visible than one 3km away on final
approach.

**Compass is the hardest part of the AR view.** Three separate problems:

- iOS requires `DeviceOrientationEvent.requestPermission()`, called from inside a user gesture,
  over HTTPS. It will not work from a page-load effect.
- iOS exposes `webkitCompassHeading` (already true-north-referenced); Android gives `alpha`, which
  is magnetic and needs local magnetic declination applied. Handle both explicitly.
- Readings are noisy. Smooth them, and build a visible calibration prompt for when they are clearly
  wrong.

## Data model

```
users(id, email, plan, home_lat, home_lon, created_at)
sightings(id, user_id, icao24, callsign, registration, type_code,
          seen_at, lat, lon, altitude_m, elevation_deg, source)
watch_rules(id, user_id, kind, params_jsonb, enabled)
           -- kind: 'type_code' | 'registration' | 'operator' | 'rare' | 'first_seen'
aircraft_meta(icao24 PK, registration, type_code, manufacturer, model, operator,
              category)  -- category selects the 3D model; never null, defaults to generic
```

Store real altitudes only. The compressed value is a render-time concern and must never be
persisted.

Alert rules are cheap to evaluate because you're already polling that tile. Run them inside the
poller against each frame, not as a separate scan.

## Milestones

Each lands green before the next begins.

- **M0** — Aircraft data source decided and documented. Provider interface defined. One
  bounding-box fetch working end to end, parsed into typed state vectors with a runtime schema
  check.
- **M1** — Map data source decided and documented. Tilted MapLibre map with terrain and extruded
  buildings over the user's location, pitch-clamped, with the fog and reset-north controls.
  Acceptance: legible and interactive at 30fps+ on a real mid-range Android phone.
- **M2** — Building-height fallback chain implemented. Acceptance: report the measured share of
  buildings resolved by real height, by `building:levels`, and by heuristic, across three cities
  chosen to span good and poor coverage. A data-poor city must still look deliberate.
- **M3** — Aircraft metadata ingested into Postgres and joining on ICAO24, mapped to model
  categories. Acceptance: report join hit rate over a real busy-airspace sample; if below ~70%,
  investigate before proceeding.
- **M4** — Tile poller with geohash bucketing, Redis last-frame cache, correct start/stop on
  subscriber count. Acceptance: two clients in the same tile produce exactly one upstream call per
  interval.
- **M5** — WebSocket fan-out. Acceptance: a new subscriber receives a frame in under 200ms from
  cache, without waiting for a poll.
- **M6** — Altitude mapping module, with monotonicity tests and the altitude ruler UI. Acceptance:
  the ruler's labelled gridlines and the rendered aircraft heights derive from the same function,
  demonstrated by a test.
- **M7** — three.js custom layer: live aircraft as instanced 3D models at compressed altitudes,
  correct Mercator scaling, tap to select. Acceptance: 50 simultaneous aircraft at 30fps+ on that
  same mid-range phone, correctly sized in two cities at very different latitudes.
- **M8** — Dead-reckoning interpolation, horizontal and vertical. Acceptance: motion is smooth at
  60fps and corrections on new data are not visibly jarring.
- **M9** — Detail panel with an orbitable 3D model of the selected aircraft, true altitude, speed,
  heading, type, registration and decoded operator.
- **M10** — Overhead list: geolocation, true-altitude elevation filter, sorted by elevation.
- **M11** — 2D fallback mode: flat icons on a flat map for low zoom, low-end devices and
  WebGL-unavailable. Acceptance: a device with WebGL disabled gets a working app, not an error.
- **M12** — Accounts and logbook. Tapping an aircraft records a sighting.
- **M13** — Watch rules and web push notifications.
- **M14** — AR sky view: device orientation driving the three.js camera, both platforms,
  calibration UI, and a graceful fallback for devices with no orientation sensors. **This is the
  highest-risk milestone and the designated cut line.** If the schedule slips, it is what gets
  dropped.

Free tier is everything through M11. Paid starts at M12.

## Out of scope for v1

Route and destination data. Historical playback. Flight number to schedule matching. Photos of
specific aircraft. Ground-level or first-person camera. Interiors. Named landmark models. Vehicles
or people in the city. Weather rendering. Native apps. Social features.

## Design direction

The city is scenery. It must be beautiful enough to be worth tilting and quiet enough that a 20px
aircraft is the most salient thing on screen. Every design decision follows from that ranking, and
the most common way to fail here is a city so detailed that you cannot find the planes.

**Do not** reach for green-radar-on-black, and do not reach for the photoreal-city look either.
Photoreal is a losing race against Google Earth and it buries the aircraft.

The recommendation is a **stylized low-poly city carrying the palette of FAA sectional charts**:
buff and pale tan grounds, magenta and blue linework, brown terrain contours, and a dense,
confident use of small type and hairline linework. Sectional charts are a flat-map vocabulary, so
this is an adaptation, not a transplant — take the palette, the hairline weight and the typographic
confidence; leave the flat symbology. Buildings as untextured flat-shaded masses in two or three
ground tones, with the magenta and blue reserved almost exclusively for aircraft, their trails and
the altitude ruler. That reservation is what makes the traffic pop. A night mode inverts to deep
navy with lit aircraft and dark buildings, which is the more atmospheric of the two and worth
designing first.

Read `/mnt/skills/public/frontend-design/SKILL.md` if it exists in your environment. Avoid the
standard tells: identical rounded cards with the same grey shadow, tracked-out all-caps eyebrow
labels, meta strings joined with middle dots, gradient washes as decoration.

Propose a token system (4–6 named hex values, typefaces with clear roles, layout concept with an
ASCII wireframe) and check it against this brief before building.

---

# Appendix — asset prompts for Claude Design

Claude Design produces both 3D objects and 2D/vector work, so the asset set splits on engineering
lines rather than tooling limits:

- **3D**: aircraft category models, the building kit, and the sky/lighting treatment. These are the
  scene.
- **Vector**: the altitude ruler and map HUD, logbook stamps, empty state, app icon, and the flat
  aircraft icons for the 2D fallback mode. Drawn at 24–96px, recoloured at runtime, rotated per
  frame — SVG is faster and sharper than a mesh here.

Order of work: prompt 1 first, because the aircraft silhouettes set the visual family everything
else answers to. Then 2 and 3 for the city, then the vector sets. Run each prompt as its own
separate request.

**Shared constraints for every 3D prompt.** State these in the prompt, not afterwards, and check
the export against them:

- Y-up, nose or facade-front along −Z, origin at the centre of mass for aircraft and at the
  footprint centre at ground level for buildings, so aircraft rotate cleanly on heading and
  buildings sit flush on terrain.
- One material per model, flat-shaded, no textures — the app recolours by category and by day/night
  theme.
- Aircraft: roughly 1–3k triangles each. Buildings: a few hundred. These render several dozen at
  once on a mid-range phone alongside a live map and extruded terrain.
- Real proportions from real airframes (span-to-length, engine count and placement, tail shape).
  Category legibility lives in the silhouette, not in detail.
- No livery, no text, no registration markings; these represent categories, not airlines.
- Export as glTF/GLB, and keep approved views as PNG or SVG stills regardless — the stills are the
  reference for the vector sets and the source for the 2D fallback icons.

### 1. Aircraft category models (3D)

> Model 7 aircraft categories as 3D objects for a live flight-tracking app that renders them flying
> above a stylized low-poly city: wide-body jet, narrow-body jet, regional jet, turboprop, business
> jet, helicopter, light single-engine piston. Low-poly flat-shaded forms, around 1–3k triangles
> each, one untextured material per model since the app recolours them per theme. Y-up with the
> nose along −Z and the origin at the centre of mass. Real airframe proportions — span-to-length
> ratio, engine count and placement, tail shape — because that is what makes a turboprop read as a
> turboprop rather than as a small jet. They must stay distinguishable from one another when seen
> from below at roughly 30px on screen, so exaggerate the category-defining features and drop
> everything else. No livery, no text, no registration markings. Landing gear retracted. Deliver
> each as a separate GLB, plus a top-down and a three-quarter-from-below still of each.

### 2. Low-poly city building kit (3D)

> Model a kit of low-poly building masses for a stylized 3D city view, to be placed procedurally
> from OpenStreetMap footprints. Cover 8 archetypes: low-rise house, terraced row, mid-rise
> apartment block, office slab, glass tower, industrial shed, parking structure, and a generic tall
> landmark. Flat-shaded untextured masses, a few hundred triangles each, one material, with the
> origin at the footprint centre at ground level so they sit flush on 3D terrain. They will be
> non-uniformly scaled to match real footprint dimensions and heights, so avoid detail that
> distorts badly when stretched — no fine window mullions, no ornament. Silhouette and roof form
> carry all the character: parapets, setbacks, rooftop plant, pitched versus flat roofs. These are
> background scenery for aircraft flying above them and must never out-compete a small aircraft for
> attention. Deliver each as a separate GLB plus a three-quarter still, and show one street of them
> assembled together.

### 3. Sky, lighting and altitude treatment (3D)

> Design the sky and lighting treatment for a 3D city view with live aircraft above it, where
> aircraft altitude is visually compressed so high-cruising traffic sits readably above the
> skyline. Establish how an aircraft reads at four heights — just above the rooftops, mid-level,
> high, and at the top of the visible band — using silhouette scale, tonal contrast against the
> sky, and an optional contrail, with no billboarded labels or glow sprites. Show the same
> treatment in three lighting conditions: bright midday, golden hour, and night with buildings dark
> and aircraft lit only by beacon and nav lights. Include the distance fog that fades the far city
> toward the sky colour. Palette adapted from FAA sectional charts: buff and tan grounds, magenta
> and blue reserved almost entirely for aircraft and their trails. Deliver as a scene containing
> the height and lighting variants, plus stills of each, so the treatment can be reimplemented as
> material and shader settings in the app.

### 4. Altitude ruler and map HUD (vector)

> Design the on-screen overlay for a tilted 3D city view showing live aircraft overhead. It needs a
> vertical altitude ruler along one edge with labelled gridlines whose spacing compresses
> non-linearly with height (near-linear near the ground, logarithmic above), a compass and
> reset-to-north control, a zoom and tilt indicator, and a compact aircraft label treatment showing
> callsign and true altitude that stays readable against both a pale daytime sky and a dark night
> sky. Hairline strokes, minimal fills, drawing on the typographic confidence and linework of FAA
> sectional charts rather than a video-game HUD. The overlay must never compete with the aircraft
> for attention. Deliver as SVGs that scale to any portrait phone aspect ratio.

### 5. Flat aircraft icons for 2D fallback (vector)

> Design a set of 7 top-down aircraft silhouettes for the 2D fallback map of a flight-tracking app,
> matching the silhouettes of an existing set of 3D aircraft models seen from directly above. The
> categories are wide-body jet, narrow-body jet, regional jet, turboprop, business jet, helicopter,
> light single-engine piston. Flat single-colour shapes, no gradients or shadows, nose pointing up,
> each on a square canvas with the centre of mass at the exact centre so they rotate cleanly around
> it. They must stay instantly distinguishable at 24px. Deliver as individual SVGs with a 64×64
> viewBox, using `currentColor` for fill so the app can recolour them.

### 6. Aircraft trail treatment (vector)

> Design a motion-trail treatment showing an aircraft's recent flight path in a tilted 3D city
> view: the last few minutes of travel behind the aircraft, drawn in the air rather than flat on
> the ground. Explore three variations — a tapering solid, a dotted sequence, and a fading gradient
> — and show each against both a pale daytime sky and a dark night sky, seen at a shallow camera
> tilt so the trail recedes in perspective. Deliver as SVGs with each trail as a single path so it
> can be generated dynamically from coordinates.

### 7. Empty state (vector)

> Design an illustration for the empty state of a flight-tracking app when no aircraft are
> overhead: quiet, warm, and a little wry, not apologetic. Palette and linework adapted from FAA
> sectional charts — buff ground, magenta and blue linework, hairline strokes — and it should feel
> like it belongs above a stylized low-poly city. Include space for a short line of copy beneath
> it. Deliver as an SVG on a 400×300 viewBox.

### 8. Logbook stamps (vector)

> Design a set of 8 collectible stamp-style badges for a plane-spotting logbook, awarded for things
> like first sighting, spotting a wide-body, spotting a helicopter, a rare aircraft type, and a
> night sighting. Draw on real aviation stamp and placard vernacular: passport stamps, airframe
> data plates, luggage tags. Each must read clearly at 48px. Muted palette that sits comfortably
> against a buff sectional-chart background. Deliver as individual SVGs on a 96×96 viewBox.

### 9. App icon (vector)

> Design an app icon for "Overhead," an app that shows you what aircraft is flying above your city
> right now in a tilted 3D view. The idea to express is looking upward from among buildings, not
> aviation generally, so avoid the obvious plane-on-a-blue-square. Must work at 48px, at 1024px,
> and as a monochrome silhouette for a notification badge. Deliver as an SVG on a square viewBox
> with safe margins for both round and rounded-square masks.

---

## How to work

- Ask before assuming. Flag ambiguity rather than resolving it silently.
- Small working commits. Each milestone lands green before the next begins.
- Record every decision on an open question in `docs/decisions.md`.
- If anything in this brief turns out to be factually wrong, say so explicitly rather than routing
  around it. The map-data and MapLibre claims above are the most likely to have drifted.
- Profile on a real mid-range Android phone, not on a desktop and not in a simulator. This project
  lives or dies on phone frame rate, and desktop numbers will lie to you.
- Credentials in env vars only, `.env.example` documenting every key, nothing secret in the repo.
