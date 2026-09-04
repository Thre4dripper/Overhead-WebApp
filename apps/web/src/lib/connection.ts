import { geohashBounds, SyntheticAirspace, airlineFromCallsign, resolveCategory, type Aircraft, type ServerMessage, type StateVector } from '@overhead/shared';
import { API_URL, WS_URL } from './api';

export type ConnStatus = 'connecting' | 'live' | 'cached' | 'demo' | 'offline';

export interface ConnectionInfo { status: ConnStatus; provider: string; attribution: string; detail?: string }

interface Opts {
  onFrame: (aircraft: Aircraft[], t: number) => void;
  onInfo: (info: ConnectionInfo) => void;
  demoCenter: () => { lat: number; lon: number };
}

function enrichLocal(sv: StateVector): Aircraft {
  return { ...sv, category: resolveCategory({ typeCode: sv.typeCode, typeDescription: sv.typeDescription, emitterCategory: sv.emitterCategory }), operator: airlineFromCallsign(sv.callsign), model: null, airline: airlineFromCallsign(sv.callsign) };
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

  start(): void { this.stopped = false; this.connect(); }

  stop(): void {
    this.stopped = true;
    this.ws?.close(); this.ws = null;
    if (this.demoTimer) clearInterval(this.demoTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
  }

  setTiles(tiles: string[]): void {
    const same = tiles.length === this.tiles.length && tiles.every((t) => this.tiles.includes(t));
    this.tiles = tiles;
    if (!same && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'subscribe', tiles }));
    if (!same && this.demo) this.demo = null;
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

  /** WS blocked? Try the HTTP frame endpoint; API fully unreachable? Go demo. */
  private async probeHttpOrDemo(): Promise<void> {
    try {
      const cfg = await fetch(`${API_URL}/api/config`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()) as { provider: string; attribution: string };
      this.setInfo({ provider: cfg.provider, attribution: cfg.attribution, status: 'cached', detail: 'WebSocket blocked — polling over HTTP' });
      this.startHttpPolling();
    } catch {
      this.startDemo();
    }
  }

  private httpTimer: ReturnType<typeof setInterval> | null = null;
  private startHttpPolling(): void {
    if (this.httpTimer) return;
    const poll = async () => {
      if (this.ws?.readyState === WebSocket.OPEN) { if (this.httpTimer) clearInterval(this.httpTimer); this.httpTimer = null; return; }
      for (const tile of this.tiles) {
        try {
          const f = await fetch(`${API_URL}/api/tiles/${tile}/frame`).then((r) => (r.ok ? r.json() : null)) as { t: number; aircraft: Aircraft[] } | null;
          if (f) { this.lastFrameAt = Date.now(); this.opts.onFrame(f.aircraft, f.t); }
        } catch { /* try next tile */ }
      }
    };
    void poll();
    this.httpTimer = setInterval(() => void poll(), 10_000);
  }

  private startDemo(): void {
    if (this.demoTimer) return;
    this.setInfo({ status: 'demo', provider: 'demo', attribution: 'Demo traffic — synthetic, not real aircraft', detail: 'API unreachable' });
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
