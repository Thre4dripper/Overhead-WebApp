import { bboxRadiusM, geohashBounds, inBBox, type Aircraft, type AircraftProvider, type BBox, type TileFrame } from '@overhead/shared';
import type { AircraftMetaStore } from './meta';
import type { TileStore } from './store/types';

export interface PollerOptions {
  intervalMs: number;
  maxActiveTiles: number;
  idleMs: number;
  /** tiles whose union fits inside this radius are fetched with ONE upstream request (default 110 km ≈ 60 nm) */
  clusterRadiusM?: number;
  /** credit budget per rolling hour across ALL clusters (OpenSky: daily credits ÷ 24); each call charges provider.costHint(bbox) */
  creditsPerHour?: number;
  /** minimum gap between any two upstream calls (default 1 500 ms) */
  minSpacingMs?: number;
  frameTtlMs?: number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  onFrame?: (frame: TileFrame) => void;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

interface ClusterState {
  tiles: string[];
  bbox: BBox;
  timer: ReturnType<typeof setTimeout> | null;
  lastSubscribersAt: number;
  backoffUntil: number;
  consecutiveErrors: number;
}

function unionBBox(a: BBox, b: BBox): BBox {
  return { lamin: Math.min(a.lamin, b.lamin), lomin: Math.min(a.lomin, b.lomin), lamax: Math.max(a.lamax, b.lamax), lomax: Math.max(a.lomax, b.lomax) };
}

/** Greedy grouping of tiles whose union bbox stays within `radiusM` — one upstream call per group. */
export function clusterTiles(tiles: string[], radiusM: number): { key: string; tiles: string[]; bbox: BBox }[] {
  const sorted = [...tiles].sort();
  const assigned = new Set<string>();
  const out: { key: string; tiles: string[]; bbox: BBox }[] = [];
  for (const t of sorted) {
    if (assigned.has(t)) continue;
    assigned.add(t);
    let bbox = geohashBounds(t);
    const members = [t];
    for (const u of sorted) {
      if (assigned.has(u)) continue;
      const union = unionBBox(bbox, geohashBounds(u));
      if (bboxRadiusM(union) <= radiusM) { bbox = union; members.push(u); assigned.add(u); }
    }
    out.push({ key: members.join('+'), tiles: members, bbox });
  }
  return out;
}

/**
 * One upstream call per active tile CLUSTER per interval, across the whole deployment. Adjacent
 * tiles (a user on a tile boundary subscribes to 2–4) are fetched together and split by bbox, so
 * cost scales with distinct populated areas, not with users or seams. Tiles start polling within one
 * tick of their first subscriber and stop within `idleMs` of their last one leaving. Under pressure
 * the least-populated tiles are shed first (they still serve their cached frame).
 */
export class TilePoller {
  private clusters = new Map<string, ClusterState>();
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  stats = { upstreamCalls: 0, upstreamErrors: 0, framesPublished: 0, shedTiles: 0, lastPollMs: 0, rateDeferred: 0, globalBackoffUntil: 0, creditsLastHour: 0 };
  private charges: { t: number; cost: number }[] = [];
  private lastCallAt = Number.NEGATIVE_INFINITY;
  private globalBackoffUntil = 0;
  private readonly now: () => number;
  private readonly setT: typeof setTimeout;
  private readonly clearT: typeof clearTimeout;

  constructor(
    private readonly provider: AircraftProvider,
    private readonly store: TileStore,
    private readonly meta: AircraftMetaStore,
    private readonly opts: PollerOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.setT = opts.setTimer ?? setTimeout;
    this.clearT = opts.clearTimer ?? clearTimeout;
  }

  start(): void {
    this.stopped = false;
    void this.reconcile();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconcileTimer) this.clearT(this.reconcileTimer);
    for (const [key, st] of this.clusters) { if (st.timer) this.clearT(st.timer); this.clusters.delete(key); }
  }

  /** Called on every subscriber change so a new tile starts within one tick, not one interval. */
  notifyChange(): void {
    if (this.reconcileTimer) this.clearT(this.reconcileTimer);
    this.reconcileTimer = this.setT(() => void this.reconcile(), 50);
  }

  activeTileIds(): string[] { return [...this.clusters.values()].flatMap((c) => c.tiles); }
  activeClusters(): string[] { return [...this.clusters.keys()]; }

  async reconcile(): Promise<void> {
    if (this.stopped) return;
    const active = await this.store.activeTiles();
    const t = this.now();
    // Rank by subscriber count; cap; shed the tail.
    const ranked = [...active.entries()].sort((a, b) => b[1] - a[1]);
    const keep = ranked.slice(0, this.opts.maxActiveTiles).map(([tile]) => tile);
    this.stats.shedTiles = Math.max(0, ranked.length - keep.length);
    const wanted = clusterTiles(keep, this.opts.clusterRadiusM ?? 110_000);
    const wantedKeys = new Set(wanted.map((c) => c.key));
    for (const c of wanted) {
      const st = this.clusters.get(c.key);
      if (!st) {
        this.clusters.set(c.key, { tiles: c.tiles, bbox: c.bbox, timer: null, lastSubscribersAt: t, backoffUntil: 0, consecutiveErrors: 0 });
        this.schedule(c.key, 0);
      } else st.lastSubscribersAt = t;
    }
    const keepSet = new Set(keep);
    for (const [key, st] of this.clusters) {
      if (wantedKeys.has(key)) continue;
      const stillWanted = st.tiles.some((tile) => keepSet.has(tile));
      // re-clustered (membership changed): the new cluster covers it, stop now; all gone: stop after idleMs
      if (stillWanted || t - st.lastSubscribersAt >= this.opts.idleMs) {
        if (st.timer) this.clearT(st.timer);
        this.clusters.delete(key);
        if (!stillWanted) this.opts.log?.('tile stopped', { tiles: st.tiles });
      }
    }
    if (this.reconcileTimer) this.clearT(this.reconcileTimer);
    this.reconcileTimer = this.setT(() => void this.reconcile(), Math.min(this.opts.idleMs, 5000));
  }

  private schedule(key: string, delayMs: number): void {
    const st = this.clusters.get(key);
    if (!st || this.stopped) return;
    if (st.timer) this.clearT(st.timer);
    st.timer = this.setT(() => void this.pollCluster(key), delayMs);
  }

  /** ms to wait before the next upstream call is allowed by the shared gate; 0 = go now */
  private gateDelay(now: number, cost: number): number {
    if (this.globalBackoffUntil > now) return this.globalBackoffUntil - now;
    const spacing = this.opts.minSpacingMs ?? 1500;
    if (now - this.lastCallAt < spacing) return spacing - (now - this.lastCallAt);
    const budget = this.opts.creditsPerHour ?? Number.POSITIVE_INFINITY;
    this.charges = this.charges.filter((c) => now - c.t < 3_600_000);
    const spent = this.charges.reduce((a, c) => a + c.cost, 0);
    this.stats.creditsLastHour = spent;
    if (spent + cost > budget) {
      // wait until enough of the oldest charges fall out of the window
      let freed = 0;
      for (const c of this.charges) { freed += c.cost; if (spent - freed + cost <= budget) return 3_600_000 - (now - c.t) + 50; }
      return 60_000;
    }
    return 0;
  }

  async pollCluster(key: string): Promise<void> {
    const st = this.clusters.get(key);
    if (!st || this.stopped) return;
    const t0 = this.now();
    if (st.backoffUntil > t0) { this.schedule(key, st.backoffUntil - t0); return; }
    const cost = Math.max(1, this.provider.costHint(st.bbox));
    const wait = this.gateDelay(t0, cost);
    if (wait > 0) { this.stats.rateDeferred++; this.schedule(key, wait); return; }
    // Exactly one node polls this cluster per interval.
    const mine = await this.store.acquirePollLock(key, Math.max(1000, this.opts.intervalMs - 500));
    if (mine) {
      try {
        this.stats.upstreamCalls++;
        this.lastCallAt = t0; this.charges.push({ t: t0, cost });
        const states = await this.provider.fetchBox(st.bbox);
        for (const s of states) this.meta.learn(s);
        const now = this.now();
        for (const tile of st.tiles) {
          const b = geohashBounds(tile);
          const aircraft: Aircraft[] = states.filter((s) => inBBox(s.lat, s.lon, b)).map((s) => this.meta.enrich(s));
          const frame: TileFrame = { tile, t: now, aircraft, provider: this.provider.id };
          await this.store.setFrame(frame, this.opts.frameTtlMs ?? Math.max(60_000, this.opts.intervalMs * 6));
          await this.store.publish(frame);
          this.opts.onFrame?.(frame);
          this.stats.framesPublished++;
        }
        this.stats.lastPollMs = this.now() - t0;
        st.consecutiveErrors = 0;
      } catch (err) {
        this.stats.upstreamErrors++;
        st.consecutiveErrors++;
        const retryAfter = (err as { retryAfterMs?: number | null }).retryAfterMs ?? null;
        const status = (err as { status?: number }).status;
        const backoff = retryAfter ?? Math.min(120_000, this.opts.intervalMs * 2 ** Math.min(4, st.consecutiveErrors));
        st.backoffUntil = this.now() + backoff;
        // 429 is a per-IP verdict: pause every cluster, not just this one
        if (status === 429) { this.globalBackoffUntil = this.now() + Math.max(backoff, 20_000); this.stats.globalBackoffUntil = this.globalBackoffUntil; }
        this.opts.log?.('poll failed', { tiles: st.tiles, error: (err as Error).message, backoffMs: backoff });
      }
    }
    const elapsed = this.now() - t0;
    this.schedule(key, Math.max(250, this.opts.intervalMs - elapsed));
  }
}
