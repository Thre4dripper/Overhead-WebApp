# Design system

The city is scenery. Its only job is to make "above you" legible, so every decision below ranks the
aircraft first, the altitude ruler second, and the city third. The palette is adapted from FAA
sectional charts: buff and tan grounds, hairline ink, and magenta reserved almost entirely for
aircraft, their trails and the ruler accent. That reservation is what makes a 20 px aircraft the most
salient thing on screen. Night mode inverts to deep navy with lit aircraft and dark buildings.

The token values come straight from the approved assets in `/assets`: the sky-treatment GLB
materials (ground `#CAB37F`, massing `#AF9761`, airframe bands `#020D29 → #3C516B`), the HUD design
canvas (ink `#12263C` day / `#E7EDF4` night, accent `#B0246E` / `#E2589B`, sky `#BCD0DD` / `#1B2440` /
golden `#E0B184`), the stamps palette and the app icon.

## Tokens

Six named values per theme, exposed as CSS custom properties in `apps/web/src/styles/tokens.css`
and mirrored for the map style in `apps/web/src/lib/mapStyle.ts` and the three.js layer.

| Token | Day | Golden hour | Night | Used for |
|---|---|---|---|---|
| `sky` | `#BCD0DD` | `#E0B184` | `#1B2440` | sky, fog, page background, haze; aircraft lerp toward it with height and distance |
| `ground` | `#E3D6B4` | `#E2C89D` | `#161E33` | land, chart background |
| `massing` | `#B9A67A` | `#B98F5C` | `#232E4A` | extruded buildings (taller → `#C9B88C` / `#C9A06D` / `#2D3A5C`) |
| `ink` | `#12263C` | `#2A2418` | `#E7EDF4` | HUD linework and type, roads at 12–22 % opacity, labels |
| `accent` | `#B0246E` | `#B0246E` | `#E2589B` | aircraft icons, trails, selection ring, ruler marks, compass north, nothing else |
| `blue` | `#3A5C7D` | `#4A5F78` | `#7FA3C7` | secondary chart linework: airport codes, boundaries, water names, observer dot |

Surfaces: `paper` `#F3ECDC` (day), `#F5E6CF` (golden), `#141B2E` (night) for sheets and panels; the
label plate is the only fill in the HUD, 55 % white by day and 50 % near-black at night, so the
overlay never reads as a surface sitting in front of the sky. Theme follows the sun at the user's
location (day above 9° sun elevation, golden hour to −5°, night below), with a manual override.

## Typefaces

One family, system grotesk (`-apple-system, "Helvetica Neue", Helvetica, Inter, Arial`), tabular
numerals everywhere. Roles, from the HUD design canvas:

| Role | Size / weight | Tracking | Where |
|---|---|---|---|
| Ruler tick labels | 11 px regular | 0.06 em | altitude ruler, scale bar |
| Chart captions | 9 px regular, caps | 0.18 em | `FEET MSL`, `SCALE`, `TILT` — chart vernacular only, never UI eyebrows |
| Callsign | 12 px semibold | 0.06 em | aircraft label plate, list rows |
| True altitude | 10 px regular at 78 % | 0.04 em | aircraft label plate |
| Readout | 15 px regular | 0.02 em | tilt readout |
| Big number | 40 px semibold | −0.02 em | true altitude in the detail panel, overhead count |
| Body | 15 px / 1.5 | — | panels |

Map labels use OpenFreeMap's Noto Sans (Regular, Bold, Italic) with airport codes set as spaced
caps, the one place the sectional-chart typography carries into the basemap.

## Rules

- Magenta appears on aircraft, trails, the selection ring, the compass north triangle and ruler
  marks. Never on buildings, ground, buttons other than the primary action, or decoration.
- Hairlines: 0.75–1 px. No glow, no drop shadows on the HUD, no filled panels behind the ruler.
- No identical rounded cards with the same grey shadow; sheets are one paper surface each.
- No tracked-out all-caps eyebrow labels in UI copy (chart captions in the HUD are the exception).
- No middle-dot joined meta strings in prose; list rows use a thin gap or two spaces.
- Every altitude shown as text is the TRUE barometric altitude in feet (and flight level above
  18 000 ft). The compressed height is never written anywhere.

## Layout

```
┌────────────────────────────────────────────┐  390 × 844 portrait
│ (N)◔  16,24        ● Live  adsb.lol  4 ovhd│  ← status line, top centre, 11 px
│                                       ≡ ☼ △│  ← menu · theme · AR (40 px round plates)
│                                    FEET MSL│
│                                      40 000│  ← ruler: x = W−104, y 42 … H−42
│              ✈ DLH 441 · 38 000 ft ↑ 30 000│     ticks through visualHeight()
│                                      20 000│     accent dots = true altitude of
│        ✈                          •  10 000│     each aircraft; selected labelled
│   tilted 3D city, MapLibre + three.js 5 000│
│            ✈ N7124G · 2 600 ft →      2 000│
│                                       1 000│
│  ┌ 500 m ┐ SCALE                        500│  ← scale bar + tilt arc, x 16, y H−132
│  TILT 64°                               GND│
├────────────────────────────────────────────┤
│ ═══   4 overhead   Most directly above:    │  ← bottom sheet, 64 px collapsed
│       UAL 214, 62° up                      │     opens to the elevation-sorted list
└────────────────────────────────────────────┘
      ↑ tap an aircraft: detail sheet replaces the list — orbitable model,
        true altitude large, speed / heading / vertical / type / reg / category,
        distance · bearing · elevation, Log sighting · Centre · Watch type
```

Desktop (≥ 900 px): the sheet and panels dock to the right as a 420–460 px column; the ruler moves
inboard of the column.

## Scene treatment (from the sky-treatment asset)

- Airframe: one `MeshStandardMaterial`, flat shaded, roughness 0.72, metalness 0.12, no textures;
  colour per instance lerps from the airframe base toward the sky with compressed height (aerial mix
  4 % near the rooftops → 46 % at the top of the band) and again with distance beyond 4 km.
- Silhouette scale applies on top of true perspective so an aircraft never falls below ~3.2 % of the
  viewport height (18–34 px). A cruising airliner reads as an airliner, not a dot.
- Trails: the tapering solid ribbon (the asset's recommendation), horizontal, half-width
  `w₀ · (1−age)^0.95`, alpha `0.5 · (1−age)^1.5` to zero at the aft end, last 240 s, one merged mesh.
- Night: airframe slightly lighter than the sky, port red / starboard green / tail white discs and a
  blinking belly beacon, unlit; buildings dark.
- No billboards, no glow sprites. The selection cue is a hairline ring under the aircraft.
- Fog: MapLibre sky/fog toward the sky colour plus a CSS haze gradient over the top 38 % of the
  viewport whose opacity rises with pitch.
