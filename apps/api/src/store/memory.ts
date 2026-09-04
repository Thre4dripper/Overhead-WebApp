import type { TileFrame } from '@overhead/shared';
import type { TileStore } from './types';

export class MemoryTileStore implements TileStore {
  private subs = new Map<string, number>();
  private frames = new Map<string, { frame: TileFrame; expiresAt: number }>();
  private locks = new Map<string, number>();
  private handlers = new Set<(f: TileFrame) => void>();
  constructor(private readonly now: () => number = Date.now) {}

  async setLocalSubscribers(tile: string, count: number): Promise<void> {
    if (count <= 0) this.subs.delete(tile); else this.subs.set(tile, count);
  }
  async activeTiles(): Promise<Map<string, number>> { return new Map(this.subs); }
  async acquirePollLock(tile: string, ttlMs: number): Promise<boolean> {
    const t = this.now();
    const until = this.locks.get(tile) ?? 0;
    if (until > t) return false;
    this.locks.set(tile, t + ttlMs);
    return true;
  }
  async setFrame(frame: TileFrame, ttlMs: number): Promise<void> { this.frames.set(frame.tile, { frame, expiresAt: this.now() + ttlMs }); }
  async getFrame(tile: string): Promise<TileFrame | null> {
    const e = this.frames.get(tile);
    if (!e) return null;
    if (e.expiresAt < this.now()) { this.frames.delete(tile); return null; }
    return e.frame;
  }
  async publish(frame: TileFrame): Promise<void> { for (const h of this.handlers) h(frame); }
  onFrame(handler: (f: TileFrame) => void): () => void { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  async heartbeat(): Promise<void> { /* nothing expires in memory */ }
  async close(): Promise<void> { this.handlers.clear(); }
}
