# Overhead

The aircraft above your city, right now, in a tilted 3D view of your actual streets. A free hobby
project: MapLibre GL JS owns terrain, extruded buildings and the camera; a three.js custom layer draws
live OpenSky traffic as instanced low-poly models at **compressed** heights, with the true altitude on
every label and a ruler that shows the compression honestly. No accounts, no databases: your logbook
and alert rules stay in your browser.

```
pnpm install
cp .env.example .env          # add OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET from your OpenSky account
pnpm dev                      # api on :8787, web on https://localhost:5173 (self-signed cert)
```

On first start the API downloads OpenSky's aircraft database (~94 MB) into `data/` so aircraft types
and registrations can be joined; until it is loaded, types fall back to the ADS-B emitter category.
Routes: `/` homepage, `/live` the view (deep links go on `/live`).

## Layout

| Path | What |
|---|---|
| `packages/altitude` | `visualHeight` / `trueHeight` / ruler ticks — the one compression function, with monotonicity tests |
| `packages/shared` | types, units, geohash tiles, geo math, category tables, airline prefixes, WS protocol, dead reckoning, synthetic airspace |
| `apps/api` | Fastify: OpenSky (OAuth2, credit-budgeted) and demo providers, in-memory tile poller with clustering, WebSocket fan-out, aircraft-database join, declination proxy |
| `apps/web` | React + Vite PWA: homepage, MapLibre style in sectional-chart palette with night street lighting, three.js aircraft layer (spinning props, trails, drop lines, clouds), HUD, detail panel with orbitable model, overhead list, 2D and chart fallbacks, browser-side logbook and alerts, AR sky view |
| `docs/` | design system, decisions, data-source and map-data comparisons, research notes, evidence |
| `assets/` | approved Claude Design assets (untouched); runtime copies live in `apps/web/public/assets` |

## Scripts

- `pnpm test` / `pnpm typecheck` / `pnpm build`
- `pnpm survey:buildings` — M2 evidence: height-data coverage per city from live tiles
- `pnpm icons` — rasterise PWA icons from the SVG app icon
- `node scripts/screenshot.mjs [outDir]` — capture the running dev server with the local Chrome (software WebGL); `node scripts/diag.mjs <url>` polls map-load state
- `GET /api/stats` — live counters for M4/M5 (clients, active tiles, clusters, upstream calls, frames)

## Deep links

`/live?at=51.47,-0.30&theme=night&label=London&z=14.4&pitch=72&bearing=0` — sets the home, pins
theme and camera. `?select=<icao24>` (used by push notifications) selects an
aircraft once it appears.

## Hosting

**Free, all on Vercel (default):** OpenSky blocks direct browser calls (its CORS header allows only its
own origin), so the web app talks to three tiny edge functions in `apps/web/api/` on the same origin.
`/api/tiles/<tile>/frame` fetches OpenSky for one ~20 km tile and is cached at Vercel's edge for
`FRAME_TTL_S` (20 s), so however many people watch an area it costs one OpenSky call per window.
Add `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` as Vercel environment variables (server side only,
the browser never sees them; without them the functions run anonymously on a 400-credit day shared by
the deployment). Set `VITE_TRANSPORT=poll`. Trade-offs: no WebSocket push (20 s cadence, dead reckoning
in between) and no aircraft types or registrations, because the aircraft database lives in the full relay.
Skip step 1 below and leave `VITE_API_URL`/`VITE_WS_URL` blank.

**With the relay:** the web app is static and fits Vercel. The API is **not** a serverless function: it holds WebSockets
open, runs a poller every few seconds and keeps the tile cache and the 520 k-row aircraft database in
memory, none of which survive on Vercel's request-scoped functions. Host it as one always-on container
(Fly.io, Railway, Render "starter", or any VPS) and point the Vercel build at it.

1. **API on Fly.io** (about $3–5/month for a 512 MB machine; adjust `fly.toml`):
   ```
   fly launch --no-deploy --copy-config          # accepts fly.toml, creates the app
   fly volumes create overhead_data --size 1     # keeps the aircraft database between deploys
   fly secrets set OPENSKY_CLIENT_ID=… OPENSKY_CLIENT_SECRET=…
   fly deploy
   ```
   Then set `CORS_ORIGIN` in `fly.toml` to your Vercel URL and `fly deploy` again. Check
   `https://<app>.fly.dev/health` and `/api/config` (the `aircraftDbRows` count fills in after the download).
   Railway or Render work the same way from `apps/api/Dockerfile` (see `render.yaml`).

2. **Web on Vercel**: import the repository, set **Root Directory** to `apps/web` and enable "Include
   source files outside of the Root Directory" (the workspace packages live in `packages/`). `vercel.json`
   already carries the install and build commands and the SPA rewrite for `/live`. Add two environment
   variables and deploy:
   ```
   VITE_API_URL = https://<app>.fly.dev
   VITE_WS_URL  = wss://<app>.fly.dev/ws
   ```
   Vercel gives you HTTPS, which the phone needs for location, camera and sensors. `?transport=poll` or
   `?transport=ws` on the URL forces a transport when you want to compare.

3. **Everything on one box** instead: build the web (`pnpm --filter @overhead/web build`), serve `apps/web/dist`
   with any static server or reverse proxy in front of the API on the same host, leave `VITE_API_URL` blank,
   and proxy `/api` and `/ws` to port 8787 (Caddy or nginx, with TLS).

## Testing on a phone

Open `https://<your-mac-lan-ip>:5173` on the phone and accept the self-signed certificate once.
HTTPS is not optional: Android and iOS only expose geolocation, the camera and orientation sensors
to secure origins, so over plain HTTP the AR view reports "no sensors" and "Use my location" fails
while the same page works on the desktop's `localhost` (which browsers treat as secure).

## Dev notes

- Vite reads the single root `.env` (`envDir: '../../'`) and proxies `/api` and `/ws` to the API, so
  `VITE_API_URL` can stay blank in dev and behind one reverse proxy in production.
- MapLibre 6's worker is bundled explicitly (`src/lib/maplibreWorker.ts`) because both Vite's dep
  optimiser and the production bundler lose its `new URL(...)` reference otherwise.
- OpenSky meters credits per account. The poller clusters adjacent tiles into one request, spends at
  most `OPENSKY_DAILY_CREDITS ÷ 24` per hour, and pauses everything on 429.

## Status

Everything through the AR view is implemented for a free, single-user-per-browser hobby deployment.
See `docs/decisions.md` for the 2026-09-04 pivot away from accounts and databases.
