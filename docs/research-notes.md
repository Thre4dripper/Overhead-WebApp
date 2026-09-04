# Research notes

What the brief believed, what is true as of 2026-09-04, and where they differ. Sources with quotes:
`docs/research/`.

## OpenSky
- **Auth**: OAuth2 client credentials only; "Basic authentication … is no longer accepted". Token
  URL `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`,
  30 min tokens. Brief: correct.
- **Credits**: anonymous 400 / standard 4 000 / active feeder (≥ 30 % monthly uptime) 8 000 per
  day, plus a licensed tier at 14 400 per hour; buckets are per endpoint family. `/states/all` bbox
  cost: ≤ 25 sq° 1, 25–100 2, 100–400 3, larger 4. 429 with `X-Rate-Limit-Retry-After-Seconds`.
  Brief: correct on the numbers, missed the per-endpoint buckets and the feeder uptime rule.
- **State vector**: 17 positional fields, `category` as index 17 only with `extended=1`. Verified
  against a live anonymous response and encoded as a runtime tuple schema. Brief: correct.
- **Licence**: "The REST API is provided for non-profit research and educational use only. Use of the
  REST API in any operational capacity — including … integration into a live product, service, or
  automated system — requires a written license … regardless of the entity's non-profit status."
  Stronger than the brief's "non-commercial": even a free live app needs a licence.
- **Aircraft database**: still downloadable (`aircraftDatabase.csv`, 94 MB, ~520 k rows, dated
  2024-11-04; a 2025-08 "complete" file with 609 k rows), CSV, "unlicensed … offered as is", and the
  site says it is not up to date. The loader (`AIRCRAFT_DB_CSV`) reads column positions from the
  header. It is optional because the readsb feeds already supply type and registration.

## adsb.lol / airplanes.live / ADSBExchange
- adsb.lol: OpenAPI at `api.adsb.lol/api/openapi.json`; `/v2/lat/{lat}/lon/{lon}/dist/{nm}` (≤ 250 nm),
  envelope `{ac, msg, now (ms), total, ctime, ptime}`; readsb fields; ODbL; "You can use the API for
  free … In the future, you will require an API key"; rate limits "dynamic".
- airplanes.live: docs moved to `/api-docs/`; **403 for non-feeders** ("Please contact us…");
  terms forbid commercial use without approval. Implemented, not default.
- ADSBExchange: enterprise contracts, or RapidAPI BASIC $10/mo for personal non-commercial use. No
  free tier.
- readsb semantics: `alt_baro` feet or `"ground"`, `gs` knots, `track` degrees, `baro_rate` ft/min,
  `dbFlags` 1 military / 2 interesting / 4 PIA / 8 LADD, emitter categories A1 light … A7 rotorcraft.

## MapLibre GL JS 6.7.0
- `render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput)`; use
  `options.defaultProjectionData.mainMatrix`. History: ≤ 4.5.0 `(gl, matrix)`, 4.5.1–4.7.1
  `(gl, matrix, options)`, 5.0 removed `matrix`, 6.0 dropped WebGL1 and the default export.
- `MercatorCoordinate.fromLngLat(lngLat, altitude?)` and `meterInMercatorCoordinateUnits()` exist
  and are used once, in the layer's model matrix.
- `maxPitch` default 60, cap 180 since 5.0 (brief said 85); > 60 documented as experimental.
- Sky: `sky-color, horizon-color, fog-color, fog-ground-blend, horizon-fog-blend, sky-horizon-blend,
  atmosphere-blend` all present; fog "requires 3D terrain" (we enable terrain).
- No `getFreeCameraOptions` in 6.x typings; the layer derives the eye position from centre, zoom,
  pitch, bearing and `getVerticalFieldOfView()`.

## OpenFreeMap / terrain / Overture
- Operating; planet data 2026-08-30; "no limits … no registration … no API keys"; the advertised
  "3d" style URL is 404 (Liberty at pitch 60 is what the homepage shows).
- **No DEM** (brief wrong). Their own demo uses Mapterhorn; MapLibre's official terrain example too.
- AWS terrarium: z ≤ 15 (z16 → 404), 256 px, not CDN-cached; EU replica 403 anonymously.
- Overture buildings: ODbL, GeoParquet, per-theme PMTiles (~180 GB) not intended as a basemap.
  Deferred to a build-time enrichment milestone.

## Local measurements (2026-09-04)
- Building heights: `docs/evidence/building-heights-2026-09-0*.md`. Headline: no-tag share 6 %
  Manhattan, 31 % central London, 74 % London suburb, 93–100 % Nairobi, ~95 % Tokyo/Jakarta,
  100 % sampled US suburbs. Every feature has an id, but merged features make per-building ids
  meaningless, hence the runtime area heuristic.
- Metadata join (M3), adsb.lol feed-supplied `t`/`r` over six busy airspaces: table below (re-run
  the snippet in the session log or `pnpm --filter @overhead/api ingest:aircraft-db`).

| Sample area (60 nm radius) | airborne aircraft | with type or registration | with type code | top emitter categories |
|---|---:|---:|---:|---|
| London (LHR/LGW/STN) | 61 | 60 (98%) | 60 (98%) | A3 53, A5 6, A1 1, ? 1 |
| New York (JFK/EWR/LGA) | 210 | 200 (95%) | 198 (94%) | A1 82, A3 59, A2 35, A7 18, A5 12 |
| Frankfurt | 19 | 18 (95%) | 18 (95%) | A3 11, A5 6, A2 2 |
| Los Angeles | fetch failed | | | |
| Tokyo | 14 | 14 (100%) | 14 (100%) | A5 9, A3 2, ? 1, A2 1, A0 1 |
| Nairobi | fetch failed | | | |

Overall: 292 of 304 airborne aircraft (96%) carried a type code or registration from the feed alone (adsb.lol, tar1090 database), measured 2026-09-03. Above the brief's 70% threshold.
