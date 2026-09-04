# Aircraft data source

Decision (revised 2026-09-04, owner): **OpenSky Network** with the owner's OAuth2 credentials, as a
free non-commercial hobby project, plus a synthetic `demo` provider for offline work. The adsb.lol and
airplanes.live providers were removed. The comparison below is kept for the record; the full report
with URLs and quotes is `docs/research/aircraft-data-sources-2026-09-04.md`.

What OpenSky gives us and how the app copes:
- Positions, velocity, track, vertical rate, squawk, **origin country** — every ~15–25 s within the
  credit budget (4 000 per day registered; the poller spends ≤ 1/24 of that per hour).
- No type or registration in the state vector: joined locally from OpenSky's aircraft database CSV,
  auto-downloaded on first start (`AIRCRAFT_DB_*` in `.env`). Emitter category (with `extended=1`)
  is the fallback for airframes the 2024 database lacks.
- 429 with `X-Rate-Limit-Retry-After-Seconds` when the budget is exhausted: the poller pauses all
  areas and the client keeps dead-reckoning from cached frames.

| | OpenSky Network | adsb.lol | airplanes.live | ADSBExchange | Own receiver |
|---|---|---|---|---|---|
| Cost | Free tiers by credits | Free ("in the future you will require an API key") | Free for feeders | Paid only: RapidAPI $10/mo (non-commercial) or enterprise contract | ~$150 SDR + antenna |
| Commercial use | **Written licence required for any live product**, even non-profit | Allowed under ODbL 1.0 (attribution + share-alike) | Not without approval | Yes, enterprise | Yes (your data) |
| Auth | OAuth2 client credentials only (basic auth removed); token endpoint `auth.opensky-network.org/.../token`, 30 min expiry | None today | None, but **API returns 403 to non-feeders** | API key | None |
| Quota | Anonymous 400 / registered 4 000 / active feeder 8 000 credits per day; bbox cost 1–4 credits by area (≤25 sq° = 1) | Dynamic, load-based | 1 req/s (archived README) | Plan-based | Unlimited, your radius only |
| Coverage | Global, research-grade | Global community aggregator | Global community aggregator | Global, best | Your reception radius (~100–300 km) |
| Type / registration | Not in the state vector; separate aircraft DB CSV (94 MB, 520 k rows, dated 2024-11, "unlicensed, as is") | **Included** (`t`, `r`, `desc`, `dbFlags` from tar1090 db) | Included | Included | Needs readsb + db |
| Units | metres, m/s, degrees | feet, knots, ft/min, `alt_baro: "ground"` | same as adsb.lol | readsb-style | readsb-style |

## Why adsb.lol

- Licence compatible with charging money for the logbook tier (ODbL requires attribution and
  share-alike on derived *databases*; the sightings table is the user's own data, positions are not
  redistributed).
- No credit budget to engineer around today. The tile poller still caps concurrent tiles and
  sheds under pressure so a future key/quota is a config change.
- Type and registration ride along, so the M3 join is a no-op for this provider. Measured on
  2026-09-04 over six busy airspaces: see `docs/research-notes.md` (join hit rate table).

## Risks and mitigations

- adsb.lol may introduce API keys or rate limits: `costHint` and the provider interface exist for
  that day; the `airplaneslive` and `opensky` providers are already implemented.
- Community feeds have uneven coverage away from populated areas; the empty state is designed for it.
- OpenSky remains the best-documented fallback for development (anonymous 400 credits/day, 10 s
  resolution) and is what `AIRCRAFT_PROVIDER=opensky` uses; do not ship on it without a licence.

## The interface (packages/shared/src/types.ts)

```ts
interface AircraftProvider {
  readonly id: string
  readonly attribution: string
  readonly costHint: (bbox: BBox) => number
  fetchBox(bbox: BBox): Promise<StateVector[]>
}
```
Every provider normalises to metric `StateVector`s at the boundary (feet → metres, knots → m/s,
ft/min → m/s, callsigns trimmed, `"ground"` → `onGround`), and runtime schema checks reject
malformed records: OpenSky's positional arrays are checked slot by slot (`OpenSkyState`), readsb
objects through `ReadsbAircraft`.
