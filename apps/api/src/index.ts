import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { resolve } from 'node:path';
import { loadConfig } from './config';
import { registerDeclination } from './declination';
import { AircraftMetaStore, ensureAircraftDb } from './meta';
import { TilePoller } from './poller';
import { createProvider } from './providers';
import { registerRoutes } from './routes';
import { MemoryTileStore } from './store/memory';
import { registerWebSocket, Subscriptions } from './ws';

/**
 * Overhead API — a hobby project's live-traffic relay. One long-running Node process, no databases:
 * the tile registry and last-frame cache live in memory, the browser keeps the logbook and alert rules.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);

  const provider = createProvider(cfg);
  const store = new MemoryTileStore();
  const meta = new AircraftMetaStore();
  const refreshMs = cfg.REFRESH_SECONDS * 1000;
  // OpenSky meters credits per account; the community feeds do not, so only OpenSky gets an hourly budget
  const creditsPerHour = Math.max(1, Math.floor(cfg.OPENSKY_DAILY_CREDITS / 24));
  const poller = new TilePoller(provider, store, meta, {
    intervalMs: refreshMs, maxActiveTiles: cfg.MAX_ACTIVE_TILES, idleMs: cfg.TILE_IDLE_MS,
    creditsPerHour: cfg.FEED === 'opensky' ? creditsPerHour : undefined, minSpacingMs: cfg.UPSTREAM_MIN_SPACING_MS, log,
  });
  const subs = new Subscriptions(store, poller);
  store.onFrame((frame) => subs.fanOut(frame));

  await app.register(cors, { origin: cfg.CORS_ORIGIN.split(',').map((s) => s.trim()) });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  registerWebSocket(app, { store, poller, subs, provider, pollIntervalMs: refreshMs });
  registerDeclination(app);
  registerRoutes(app, { meta, poller, store, subs, provider, refreshSeconds: cfg.REFRESH_SECONDS, creditsPerHour: cfg.FEED === 'opensky' ? creditsPerHour : null, startedAt: Date.now() });

  poller.start();
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  log('overhead api up', { feed: cfg.FEED, port: cfg.PORT, refreshSeconds: cfg.REFRESH_SECONDS, openskyAuth: cfg.FEED === 'opensky' ? Boolean(cfg.OPENSKY_CLIENT_ID) : undefined });

  // The aircraft database only matters for OpenSky, whose state vectors carry no type or registration;
  // the community feeds supply both per record. Downloaded once, loaded in the background.
  if (cfg.FEED === 'opensky') {
    void (async () => {
      const path = resolve(process.cwd(), cfg.AIRCRAFT_DB_CSV);
      const ready = cfg.AIRCRAFT_DB_AUTO ? await ensureAircraftDb(path, cfg.AIRCRAFT_DB_URL, log) : path;
      if (!ready) return;
      const t0 = Date.now();
      const rows = await meta.loadCsv(ready);
      log('aircraft database loaded', { rows, ms: Date.now() - t0 });
    })();
  }

  const shutdown = async () => {
    await poller.stop();
    await store.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => { console.error(err); process.exit(1); });
