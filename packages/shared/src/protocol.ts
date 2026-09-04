import type { Aircraft } from './types';

export type ClientMessage =
  | { type: 'subscribe'; tiles: string[] }
  | { type: 'ping'; t: number };

export type ServerMessage =
  | { type: 'hello'; provider: string; attribution: string; pollIntervalMs: number; serverTime: number }
  | { type: 'frame'; tile: string; t: number; aircraft: Aircraft[]; fromCache: boolean }
  | { type: 'tiles'; active: string[] }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'error'; message: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as unknown;
    if (!m || typeof m !== 'object') return null;
    const o = m as Record<string, unknown>;
    if (o.type === 'subscribe' && Array.isArray(o.tiles) && o.tiles.every((t) => typeof t === 'string')) {
      return { type: 'subscribe', tiles: (o.tiles as string[]).slice(0, 9) };
    }
    if (o.type === 'ping' && typeof o.t === 'number') return { type: 'ping', t: o.t };
    return null;
  } catch {
    return null;
  }
}
