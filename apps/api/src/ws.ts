import type { FastifyInstance } from 'fastify';
import { isValidGeohash, parseClientMessage, type ServerMessage, type TileFrame } from '@overhead/shared';
import type { WebSocket } from 'ws';
import type { TilePoller } from './poller';
import type { TileStore } from './store/types';

interface Client { id: number; ws: WebSocket; tiles: Set<string> }

export class Subscriptions {
  private clients = new Map<number, Client>();
  private counts = new Map<string, number>();
  private nextId = 1;
  constructor(private readonly store: TileStore, private readonly poller: TilePoller) {}

  get clientCount(): number { return this.clients.size + this.httpLeases.size; }
  tileCounts(): Record<string, number> { return Object.fromEntries(this.counts); }

  /** HTTP pollers hold a 60 s lease per tile so the poller keeps that tile live without a socket. */
  private httpLeases = new Map<string, { tiles: Set<string>; expiresAt: number }>();
  touchHttp(leaseId: string, tile: string): void {
    const now = Date.now();
    let lease = this.httpLeases.get(leaseId);
    if (!lease) { lease = { tiles: new Set(), expiresAt: 0 }; this.httpLeases.set(leaseId, lease); }
    lease.expiresAt = now + 60_000;
    if (!lease.tiles.has(tile)) { lease.tiles.add(tile); void this.bump(tile, +1); this.poller.notifyChange(); }
    // expire stale leases
    for (const [id, l] of this.httpLeases) {
      if (l.expiresAt > now) continue;
      for (const t of l.tiles) void this.bump(t, -1);
      this.httpLeases.delete(id);
      this.poller.notifyChange();
    }
  }

  add(ws: WebSocket): Client {
    const c: Client = { id: this.nextId++, ws, tiles: new Set() };
    this.clients.set(c.id, c);
    return c;
  }

  async setTiles(c: Client, tiles: string[]): Promise<{ added: string[] }> {
    const want = new Set(tiles.filter((t) => isValidGeohash(t)));
    const added: string[] = [];
    for (const t of want) if (!c.tiles.has(t)) { c.tiles.add(t); added.push(t); await this.bump(t, +1); }
    for (const t of [...c.tiles]) if (!want.has(t)) { c.tiles.delete(t); await this.bump(t, -1); }
    this.poller.notifyChange();
    return { added };
  }

  async remove(c: Client): Promise<void> {
    this.clients.delete(c.id);
    for (const t of c.tiles) await this.bump(t, -1);
    c.tiles.clear();
    this.poller.notifyChange();
  }

  private async bump(tile: string, d: number): Promise<void> {
    const n = Math.max(0, (this.counts.get(tile) ?? 0) + d);
    if (n === 0) this.counts.delete(tile); else this.counts.set(tile, n);
    await this.store.setLocalSubscribers(tile, n);
  }

  fanOut(frame: TileFrame): number {
    const msg = JSON.stringify({ type: 'frame', tile: frame.tile, t: frame.t, aircraft: frame.aircraft, fromCache: false } satisfies ServerMessage);
    let sent = 0;
    for (const c of this.clients.values()) {
      if (!c.tiles.has(frame.tile) || c.ws.readyState !== c.ws.OPEN) continue;
      c.ws.send(msg); sent++;
    }
    return sent;
  }
}

export function registerWebSocket(app: FastifyInstance, deps: {
  store: TileStore; poller: TilePoller; subs: Subscriptions; provider: { id: string; attribution: string }; pollIntervalMs: number;
}): void {
  const send = (ws: WebSocket, m: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

  app.get('/ws', { websocket: true }, (socket) => {
    const client = deps.subs.add(socket);
    send(socket, { type: 'hello', provider: deps.provider.id, attribution: deps.provider.attribution, pollIntervalMs: deps.pollIntervalMs, serverTime: Date.now() });

    socket.on('message', (raw: Buffer | string) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) { send(socket, { type: 'error', message: 'bad message' }); return; }
      if (msg.type === 'ping') { send(socket, { type: 'pong', t: msg.t, serverTime: Date.now() }); return; }
      void (async () => {
        const { added } = await deps.subs.setTiles(client, msg.tiles);
        send(socket, { type: 'tiles', active: [...client.tiles] });
        // New subscriber gets the cached frame immediately (M5: < 200 ms), not after the next poll.
        for (const tile of added) {
          const cached = await deps.store.getFrame(tile);
          if (cached) send(socket, { type: 'frame', tile, t: cached.t, aircraft: cached.aircraft, fromCache: true });
        }
      })();
    });
    socket.on('close', () => void deps.subs.remove(client));
    socket.on('error', () => void deps.subs.remove(client));
  });
}
