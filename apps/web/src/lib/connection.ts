import { geohashBounds, parseOpenSkyResponse, parseReadsbResponse, SyntheticAirspace, airlineFromCallsign, resolveCategory, type Aircraft, type ServerMessage, type StateVector } from '@overhead/shared';
import { API_URL, DEFAULT_POLL_MS, TRANSPORT, WS_URL } from './api';

export type ConnStatus = 'connecting' | 'live' | 'cached' | 'demo' | 'offline';

/** GET /api/config — how a deployment describes itself to the browser (relay and functions agree on this). */
export interface ServerConfig {
  provider: string;
  attribution: string;
  /** path to the WebSocket, or null when the deployment cannot hold connections open */
  socket?: string | null;
  frameEndpoint?: 'raw' | 'enriched';
  feedFormat?: 'opensky' | 'readsb';
  refreshSeconds?: number;
  pollIntervalMs?: number;
  pollTiles?: number;
}

export interface ConnectionInfo { status: ConnStatus; provider: string; attribution: string; detail?: string; creditsRemaining?: number | null; retryAt?: number | null }

interface Opts {
  onFrame: (aircraft: Aircraft[], t: number) => void;
  onInfo: (info: ConnectionInfo) => void;
  demoCenter: () => { lat: number; lon: number };
}

/** No aircraft database in the browser: the category comes from the type code the feed supplies, or the emitter class. */
function enrichLocal(sv: StateVector): Aircraft {
  const airline = airlineFromCallsign(sv.callsign);
  return {
    ...sv,
    category: resolveCategory({ typeCode: sv.typeCode, typeDescription: sv.typeDescription, emitterCategory: sv.emitterCategory }),
    operator: airline,
    model: sv.typeDescription,
    airline,
  };
}

/**
 * WebSocket subscription to geohash tiles with reconnect. If the API cannot be reached at all,
 * falls back to a local synthetic airspace so the product still demonstrates — and says so.
 */
export class Connection {
  private ws: WebSocket | null = null;
  private tiles: string[] = [];
  private stopped = false;
  private attempts = 0;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private demo: SyntheticAirspace | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private info: ConnectionInfo = { status: 'connecting', provider: '', attribution: '' };

  constructor(private readonly opts: Opts) {}

  start(): void {
    this.stopped = false;
    if (TRANSPORT === 'ws') { this.connect(); return; }
    if (TRANSPORT === 'poll') { void this.probeHttpOrDemo(); return; }
    // 'auto': let the deployment describe itself rather than guessing, so no build variable is needed
    void this.autoDetect();
  }

  /** Ask the server what it is: a relay advertises a socket, the serverless functions do not. */
  private async autoDetect(): Promise<void> {
    try {
      const cfg = await fetch(`${API_URL}/api/config`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json()) as ServerConfig;
      this.applyConfig(cfg);
      if (cfg.socket) this.connect(); else this.startHttpPolling();
    } catch {
      // no config endpoint: it may still be an older relay that only speaks WebSocket
      this.connect();
    }
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close(); this.ws = null;
    if (this.demoTimer) clearInterval(this.demoTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.httpTimer) clearInterval(this.httpTimer);
  }

  /** Adopt the deployment's own settings: the server owns the cadence, because it owns the budget. */
  private applyConfig(cfg: ServerConfig): void {
    this.feedKind = cfg.frameEndpoint === 'raw' ? 'raw' : 'enriched';
    this.feedFormat = cfg.feedFormat === 'readsb' ? 'readsb' : 'opensky';
    this.pollIntervalMs = Math.max(10_000, cfg.pollIntervalMs ?? DEFAULT_POLL_MS);
    this.pollTiles = Math.max(1, Math.min(4, cfg.pollTiles ?? 2));
    this.setInfo({ provider: cfg.provider, attribution: cfg.attribution, status: this.lastFrameAt ? 'cached' : 'connecting' });
  }

  setTiles(tiles: string[]): void {
    const same = tiles.length === this.tiles.length && tiles.every((t) => this.tiles.includes(t));
    this.tiles = tiles;
    if (!same && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'subscribe', tiles }));
    if (!same && this.demo) this.demo = null;
    // polling: a new area deserves a prompt refresh, but never more than one round per 5 s
    if (!same && this.httpTimer && Date.now() - this.httpLastAt > 5000) void this.httpRound();
  }

  private setInfo(patch: Partial<ConnectionInfo>): void {
    this.info = { ...this.info, ...patch };
    this.opts.onInfo(this.info);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setInfo({ status: this.attempts === 0 ? 'connecting' : this.info.status });
    let ws: WebSocket;
    try { ws = new WebSocket(WS_URL); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    const openTimeout = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) ws.close(); }, 5000);
    ws.onopen = () => {
      clearTimeout(openTimeout);
      this.attempts = 0;
      this.stopDemo();
      if (this.tiles.length) ws.send(JSON.stringify({ type: 'subscribe', tiles: this.tiles }));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }, 25_000);
    };
    ws.onmessage = (ev) => {
      let m: ServerMessage;
      try { m = JSON.parse(String(ev.data)) as ServerMessage; } catch { return; }
      if (m.type === 'hello') this.setInfo({ provider: m.provider, attribution: m.attribution, status: this.lastFrameAt ? this.info.status : 'connecting' });
      else if (m.type === 'frame') {
        this.lastFrameAt = Date.now();
        this.opts.onFrame(m.aircraft, m.t);
        this.setInfo({ status: m.fromCache ? 'cached' : 'live' });
      }
    };
    ws.onclose = () => { clearTimeout(openTimeout); if (this.ws === ws) this.ws = null; this.scheduleRetry(); };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.attempts++;
    if (this.attempts >= 2) void this.probeHttpOrDemo();
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, this.attempts));
    setTimeout(() => this.connect(), delay);
  }

  /** No WebSocket? Use the HTTP frame endpoint (relay or edge functions); nothing at all? Demo traffic. */
  private async probeHttpOrDemo(): Promise<void> {
    try {
      const cfg = await fetch(`${API_URL}/api/config`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json()) as ServerConfig;
      this.applyConfig(cfg);
      if (TRANSPORT !== 'poll' && !cfg.socket) this.setInfo({ detail: undefined });
      this.startHttpPolling();
    } catch {
      this.startDemo();
    }
  }

  private httpTimer: ReturnType<typeof setInterval> | null = null;
  private httpLastAt = 0;
  private httpFailures = 0;
  private httpInFlight = false;
  /** 'enriched' = the relay's pre-joined frames; 'raw' = the upstream's own JSON from the proxy, parsed here */
  private feedKind: 'enriched' | 'raw' = 'enriched';
  /** which wire format /api/feed returns when feedKind is 'raw' */
  private feedFormat: 'opensky' | 'readsb' = 'opensky';
  private pollIntervalMs = DEFAULT_POLL_MS;
  private pollTiles = 2;

  private startHttpPolling(): void {
    if (this.httpTimer) return;
    void this.httpRound();
    this.httpTimer = setInterval(() => void this.httpRound(), this.pollIntervalMs);
  }

  /**
   * One polling round: the two nearest tiles, so per-tile edge caching is shared with other viewers.
   * 429 from the feed pauses until the quota resets and says so; three network failures fall to demo.
   */
  private async httpRound(): Promise<void> {
    if (this.stopped || this.httpInFlight) return;
    if (this.ws?.readyState === WebSocket.OPEN) { if (this.httpTimer) clearInterval(this.httpTimer); this.httpTimer = null; return; }
    if (this.info.retryAt && Date.now() < this.info.retryAt) return;
    this.httpInFlight = true;
    this.httpLastAt = Date.now();
    let ok = 0, remaining: number | null = null;
    try {
      for (const tile of this.tiles.slice(0, this.pollTiles)) {
        const url = this.feedKind === 'raw' ? `${API_URL}/api/feed?tile=${tile}` : `${API_URL}/api/tiles/${tile}/frame`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const rem = res.headers.get('x-credits-remaining');
        if (rem != null && rem !== '' && Number.isFinite(Number(rem))) remaining = Number(rem);
        if (res.status === 429) {
          const j = (await res.json().catch(() => ({}))) as { retryAfterS?: number };
          const waitMs = Math.max(60, Number(j.retryAfterS ?? 600)) * 1000;
          this.stopDemo();
          this.setInfo({ status: this.lastFrameAt ? 'cached' : 'offline', creditsRemaining: 0, retryAt: Date.now() + waitMs, detail: `OpenSky quota used up — retrying in ${Math.max(1, Math.round(waitMs / 60000))} min` });
          return;
        }
        if (res.status === 404) continue; // relay has no frame for this tile yet
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (this.feedKind === 'raw') {
          // the upstream's own JSON, through the shared parser for that format, then local enrichment
          const body = await res.json();
          const parsed = this.feedFormat === 'readsb' ? parseReadsbResponse(body) : parseOpenSkyResponse(body);
          this.opts.onFrame(parsed.aircraft.map(enrichLocal), parsed.time * 1000);
        } else {
          const f = (await res.json()) as { t: number; aircraft: Aircraft[] };
          this.opts.onFrame(f.aircraft, f.t);
        }
        this.lastFrameAt = Date.now();
        ok++;
      }
      this.httpFailures = 0;
      if (ok > 0) { this.stopDemo(); this.setInfo({ status: 'live', creditsRemaining: remaining, retryAt: null, detail: remaining != null ? `${remaining} OpenSky credits left today` : undefined }); }
    } catch (err) {
      this.httpFailures++;
      if (this.httpFailures >= 3 && !this.demoTimer) { this.startDemo(); this.setInfo({ detail: `Feed unreachable (${(err as Error).message})` }); }
    } finally {
      this.httpInFlight = false;
    }
  }

  private startDemo(): void {
    if (this.demoTimer) return;
    this.setInfo({ status: 'demo', provider: 'demo', attribution: 'Demo traffic — synthetic, not real aircraft', detail: 'Feed unreachable' });
    const emit = () => {
      if (this.ws?.readyState === WebSocket.OPEN) { this.stopDemo(); return; }
      const c = this.opts.demoCenter();
      if (!this.demo) this.demo = new SyntheticAirspace(c.lat, c.lon, 7);
      const box = this.tiles.length ? unionBounds(this.tiles) : SyntheticAirspace.defaultBBox(c.lat, c.lon);
      const t = Date.now();
      this.opts.onFrame(this.demo.fetchBox(box, t / 1000).map(enrichLocal), t);
    };
    emit();
    this.demoTimer = setInterval(emit, 5000);
  }
  private stopDemo(): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null; this.demo = null;
  }
}

function unionBounds(tiles: string[]) {
  const bs = tiles.map(geohashBounds);
  return {
    lamin: Math.min(...bs.map((b) => b.lamin)), lamax: Math.max(...bs.map((b) => b.lamax)),
    lomin: Math.min(...bs.map((b) => b.lomin)), lomax: Math.max(...bs.map((b) => b.lomax)),
  };
}
