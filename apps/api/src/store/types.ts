import type { TileFrame } from '@overhead/shared';

/**
 * Tile registry + last-frame cache + fan-out bus. Redis in production (shared across API nodes),
 * memory for single-node dev. The poller only ever asks: which tiles have subscribers anywhere,
 * may I be the one to poll this tile this interval, and here is the frame — cache it and publish it.
 */
export interface TileStore {
  /** Register this node's subscriber count for a tile (0 removes). */
  setLocalSubscribers(tile: string, count: number): Promise<void>;
  /** Tiles with ≥1 subscriber on any node, with their total counts. */
  activeTiles(): Promise<Map<string, number>>;
  /** Try to take the per-interval poll lock for a tile. True = this node polls it now. */
  acquirePollLock(tile: string, ttlMs: number): Promise<boolean>;
  setFrame(frame: TileFrame, ttlMs: number): Promise<void>;
  getFrame(tile: string): Promise<TileFrame | null>;
  publish(frame: TileFrame): Promise<void>;
  onFrame(handler: (frame: TileFrame) => void): () => void;
  /** Keep this node's registrations alive (Redis keys expire if a node dies). */
  heartbeat(): Promise<void>;
  close(): Promise<void>;
}
