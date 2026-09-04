import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/config — the same contract the relay serves, so the browser needs no build-time mode switch.
 * `frameEndpoint: 'raw'` tells the client to poll /api/opensky and parse OpenSky's own JSON itself;
 * the relay answers `'enriched'` and pushes pre-joined frames with aircraft types over its socket.
 *
 * Import-free like every file under api/: Vercel type-checks these with nodenext resolution, where even
 * a relative import needs a file extension, and bundles each one alone. `src/lib/edge-functions.test.ts`
 * keeps this feed default in step with api/feed.ts.
 */
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const feed = process.env.FEED === 'opensky' ? 'opensky' : 'adsblol';
  const refreshSeconds = Math.max(10, Number(process.env.REFRESH_SECONDS ?? 30) || 30);
  const opensky = feed === 'opensky';
  res.setHeader('cache-control', 'public, s-maxage=300');
  res.status(200).json({
    provider: `${feed}-serverless`,
    attribution: opensky ? 'Aircraft data: The OpenSky Network' : 'Aircraft data: adsb.lol community feed (ODbL)',
    // no WebSocket here: serverless functions cannot hold connections open
    socket: null,
    // the browser fetches the upstream's own JSON from /api/feed and parses it itself
    frameEndpoint: 'raw',
    feedFormat: opensky ? 'opensky' : 'readsb',
    refreshSeconds,
    // OpenSky meters credits, so one tile per round; adsb.lol does not, so two tiles widen the view
    pollIntervalMs: refreshSeconds * 1000,
    pollTiles: opensky ? 1 : 2,
    authenticated: opensky ? Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) : true,
    // the aircraft-database join lives only in the relay; adsb.lol carries types in the feed itself
    aircraftDbRows: 0,
  });
}
