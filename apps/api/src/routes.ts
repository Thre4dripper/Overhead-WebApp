import type { FastifyInstance } from 'fastify';
import { isValidGeohash } from '@overhead/shared';
import type { AircraftMetaStore } from './meta';
import type { TilePoller } from './poller';
import type { TileStore } from './store/types';
import type { Subscriptions } from './ws';

export function registerRoutes(app: FastifyInstance, deps: {
  meta: AircraftMetaStore; poller: TilePoller; store: TileStore; subs: Subscriptions;
  provider: { id: string; attribution: string }; pollIntervalMs: number; creditsPerHour: number; startedAt: number;
}): void {
  app.get('/health', async () => ({ ok: true, uptimeS: Math.round((Date.now() - deps.startedAt) / 1000) }));

  app.get('/api/config', async () => ({
    provider: deps.provider.id,
    attribution: deps.provider.attribution,
    pollIntervalMs: deps.pollIntervalMs,
    creditsPerHour: deps.creditsPerHour,
    aircraftDbRows: deps.meta.size,
  }));

  /** Operational counters — the M4/M5 acceptance evidence comes from here. */
  app.get('/api/stats', async () => ({
    clients: deps.subs.clientCount,
    tiles: deps.subs.tileCounts(),
    activeTiles: deps.poller.activeTileIds(),
    clusters: deps.poller.activeClusters(),
    poller: deps.poller.stats,
    meta: deps.meta.stats,
    metaRows: deps.meta.size,
  }));

  /**
   * HTTP polling transport (same contract as the Vercel edge function). A poll leases the tile for 60 s
   * so the poller keeps it live; the first request waits up to 4 s for the first frame instead of 404ing.
   */
  app.get<{ Params: { tile: string } }>('/api/tiles/:tile/frame', async (req, reply) => {
    const tile = req.params.tile.toLowerCase();
    if (!isValidGeohash(tile)) return reply.code(400).send({ error: 'bad tile' });
    const leaseId = `${req.ip}|${req.headers['user-agent'] ?? ''}`.slice(0, 200);
    deps.subs.touchHttp(leaseId, tile);
    let f = await deps.store.getFrame(tile);
    for (let i = 0; !f && i < 8; i++) { await new Promise((r) => setTimeout(r, 500)); f = await deps.store.getFrame(tile); }
    if (!f) return reply.code(404).send({ error: 'no frame yet' });
    reply.header('cache-control', 'no-store');
    reply.header('x-credits-remaining', '');
    return f;
  });

  app.get<{ Params: { icao24: string } }>('/api/aircraft/:icao24', async (req, reply) => {
    const m = deps.meta.get(req.params.icao24);
    if (!m) return reply.code(404).send({ error: 'unknown' });
    return m;
  });
}
