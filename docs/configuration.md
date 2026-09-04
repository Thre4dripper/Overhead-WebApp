# Configuration

## The three moving parts

```
┌──────────────┐   asks GET /api/config, then subscribes or polls   ┌──────────────────┐
│   browser    │ ────────────────────────────────────────────────►  │  a feed server   │
│ (VITE_* only)│ ◄──────── frames of aircraft positions ─────────── │                  │
└──────────────┘                                                    └────────┬─────────┘
                                                                             │ FEED=…
                                                          ┌──────────────────▼──────────────────┐
                                                          │  OpenSky · adsb.lol · demo          │
                                                          └─────────────────────────────────────┘
```

The "feed server" is one of two implementations, and they read **the same variable names**:

| | Serverless functions | Relay |
|---|---|---|
| Where | `apps/web/api/` — deployed with the web app on Vercel | `apps/api/` — one always-on container |
| How the browser gets data | HTTP polling of `/api/feed?tile=…`, cached at the CDN | WebSocket push, plus HTTP polling as a fallback |
| Cost of many viewers | one upstream call per area per `REFRESH_SECONDS`, shared by the CDN | one upstream call per area per `REFRESH_SECONDS`, shared by the poller |
| Aircraft type and registration | whatever the feed itself carries | the same, plus OpenSky's 520 k-row database joined on the ICAO address |
| Runs OpenSky | no — OpenSky refuses Vercel's network | yes |
| Cost | free | a small VM, or your own machine |

The browser never needs to know which one it is talking to: it asks `GET /api/config` and configures
itself from the answer. That is why there is no build variable for the cadence or the feed.

## `FEED` — one name, one meaning

`FEED` picks the upstream aircraft source. Both servers read it, so it means exactly the same thing
wherever you set it. (It used to be called `AIRCRAFT_PROVIDER` on the relay and `FEED` on the
functions, which was the confusing part.)

| `FEED` | Key needed | Type and registration | Where it works | Notes |
|---|---|---|---|---|
| `adsblol` | none | **yes**, in the feed | anywhere | ODbL: attribution is shown in the HUD. Rate limits are dynamic, not metered. Default. |
| `opensky` | client id and secret | no — needs the database join | **not on Vercel** | Metered: 4 000 credits a day for a registered account. |
| `demo` | none | synthetic | relay only | Deterministic fake traffic for working offline. |

**Why `opensky` cannot be used on Vercel.** Measured on 2026-09-04 from Vercel functions in `bom1`
and `fra1` and from the edge runtime: `opensky-network.org`, its `/api/states/all` and
`auth.opensky-network.org` all time out, while adsb.lol answers in 57 ms and NOAA in 690 ms from the
same function, and OpenSky answers in 440 ms from an ordinary network. OpenSky evidently refuses that
egress. Your credentials are not wasted: they work from the relay, where they also unlock the
aircraft-database join.

## Recipes

### A. Everything on Vercel — free, no server of your own

Vercel project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `FEED` | `adsblol` |
| `REFRESH_SECONDS` | `30` |
| `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LON` | your city, e.g. `25.20` / `55.27` |

That is all. `VITE_API_URL` stays blank (same origin) and `VITE_TRANSPORT` can be left unset, because
`auto` reads `/api/config` and finds no socket, so it polls. Project → Settings → Root Directory must
be `apps/web`, with "Include source files outside of the Root Directory" enabled.

### B. Web on Vercel, relay on a small host — push updates and aircraft types

**On the relay host** (Fly.io, Railway, Render, a VPS, a Raspberry Pi — see `fly.toml`):

| Variable | Value | Why |
|---|---|---|
| `FEED` | `opensky` | it works from here, and adds the database join |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | from your OpenSky account | as secrets, never in the repo |
| `OPENSKY_DAILY_CREDITS` | `4000` | the relay spends at most 1/24 of this per hour |
| `REFRESH_SECONDS` | `15` | |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | **the browser is blocked without this** |
| `PORT`, `HOST` | `8787`, `0.0.0.0` | usually the platform's defaults |
| `AIRCRAFT_DB_CSV` | `/data/aircraft-db.csv` | on a mounted volume, so the 95 MB download survives deploys |

**On Vercel:**

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-relay.fly.dev` |
| `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LON` | your city |

Drop `FEED` and `REFRESH_SECONDS` from Vercel in this recipe: the functions are then unused, because
`VITE_API_URL` points the browser at the relay instead. (They stay deployed and harmless.)

### C. One host for everything

Build the web app (`pnpm --filter @overhead/web build`), serve `apps/web/dist` behind a proxy that
also forwards `/api` and `/ws` to the relay on port 8787. Leave `VITE_API_URL` blank — same origin —
and set the relay variables from recipe B, with `CORS_ORIGIN` set to your own domain.

### D. Local development

`cp .env.example .env`, then `pnpm dev`. Everything defaults correctly: the relay listens on 8787,
Vite serves `https://localhost:5173` and proxies `/api` and `/ws` to it, so `VITE_API_URL` stays
blank. Set `FEED=opensky` with your credentials if you want the database join locally, `FEED=adsblol`
for no key, or `FEED=demo` to work on a plane.

## Every variable

**Feed** — read by whichever server you run, same names in both:

| Variable | Default | Applies when | What it does |
|---|---|---|---|
| `FEED` | `adsblol` | always | `adsblol` \| `opensky` \| `demo` (relay only) |
| `REFRESH_SECONDS` | relay `15`, functions `30` | always | How often an area is refreshed upstream. The browser is told this and paces itself, dead-reckoning aircraft in between, so a larger number costs smoothness, not correctness. |
| `OPENSKY_CLIENT_ID` | — | `FEED=opensky` | Blank falls back to OpenSky's anonymous quota (400 credits a day). |
| `OPENSKY_CLIENT_SECRET` | — | `FEED=opensky` | Keep it a secret; the browser never receives it. |
| `OPENSKY_DAILY_CREDITS` | `4000` | `FEED=opensky`, relay | Budget. A bounding-box call costs 1–4 credits by area; the relay spends at most a twenty-fourth of the day's allowance per hour and pauses everything on a 429. |
| `AIRCRAFT_DB_CSV` | `../../data/aircraft-db.csv` | `FEED=opensky`, relay | Where the aircraft database lives. Put it on a volume in production. |
| `AIRCRAFT_DB_AUTO` | `1` | `FEED=opensky`, relay | Download it on first start. Set `0` to manage the file yourself. |
| `AIRCRAFT_DB_URL` | OpenSky's S3 | `FEED=opensky`, relay | Source of that file. |

**Relay serving** — relay only:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8787` | Listen port. |
| `HOST` | `0.0.0.0` | Listen address. |
| `CORS_ORIGIN` | `https://localhost:5173,http://localhost:5173` | Comma-separated origins allowed to call the relay from a browser. Add your deployed web URL or the browser is blocked. |
| `MAX_ACTIVE_TILES` | `24` | Most areas polled at once; the least-watched are shed beyond it and keep serving cached frames. |
| `TILE_IDLE_MS` | `20000` | How long an area keeps polling after its last viewer leaves. |
| `UPSTREAM_MIN_SPACING_MS` | `1500` | Minimum gap between any two upstream calls. |

**Web** — build-time only, baked into the bundle, so changing one needs a rebuild:

| Variable | Default | What it does |
|---|---|---|
| `VITE_API_URL` | same origin | Blank for the serverless deployment or a single-host proxy; otherwise the relay's base URL. The WebSocket URL is derived from it, so there is nothing to keep in sync. |
| `VITE_TRANSPORT` | `auto` | `auto` asks `/api/config` and uses a WebSocket if the deployment offers one, otherwise polls, otherwise shows demo traffic. `ws` and `poll` force one, for comparison. `?transport=ws\|poll` on the URL overrides it at runtime. |
| `VITE_DEFAULT_LAT`, `VITE_DEFAULT_LON` | `51.47`, `-0.30` | Where to look before a location is chosen. |

## Checking what a deployment actually decided

```
curl https://your-app/api/config
```

A relay answers with `"socket": "/ws"` and `"frameEndpoint": "enriched"`, plus `aircraftDbRows` once
the database has loaded. The serverless functions answer `"socket": null`,
`"frameEndpoint": "raw"` and the feed's wire format. `GET /api/feed?tile=gcps` returns the raw upstream
JSON with `x-feed`, `x-upstream-ms` and, for OpenSky, `x-credits-remaining` headers. The relay also
exposes `GET /api/stats` with live counters for upstream calls, credits spent in the last hour and
active areas. In the app itself, the status line shows the feed, how many seconds ago the last frame
arrived, and any quota message.
