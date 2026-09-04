import { describe, expect, it } from 'vitest';
import type { AircraftProvider, BBox, StateVector } from '@overhead/shared';
import { AircraftMetaStore, parseCsvLine } from './meta';
import { TilePoller, clusterTiles } from './poller';
import { openskyToStateVector, parseOpenSkyResponse } from '@overhead/shared';
import { MemoryTileStore } from './store/memory';

describe('OpenSky parser', () => {
  const live = ['4079f6', 'BAW870  ', 'United Kingdom', 1788466375, 1788466375, -0.4786, 51.389, 1501.14, false, 149.14, 135, 4.55, null, 1615.44, '0512', false, 0];
  it('parses a real 17-element state vector with trimmed callsign and metric units untouched', () => {
    const sv = openskyToStateVector(live)!;
    expect(sv.icao24).toBe('4079f6');
    expect(sv.callsign).toBe('BAW870');
    expect(sv.lat).toBe(51.389); expect(sv.lon).toBe(-0.4786);
    expect(sv.baroAltM).toBe(1501.14);
    expect(sv.velocityMps).toBe(149.14);
    expect(sv.trackDeg).toBe(135);
    expect(sv.verticalRateMps).toBe(4.55);
    expect(sv.positionSource).toBe('adsb');
    expect(sv.emitterCategory).toBeNull();
    expect(sv.originCountry).toBe('United Kingdom');
  });
  it('reads the extended category slot', () => {
    expect(openskyToStateVector([...live, 6])!.emitterCategory).toBe('A5');
  });
  it('drops vectors with no position and rejects index-shifted arrays', () => {
    expect(openskyToStateVector(['40676a', 'CFE18M  ', 'UK', 1, 1, null, null, null, true, 0.9, 188, null, null, null, '6355', false, 0])).toBeNull();
    const shifted = ['4079f6', 'United Kingdom', 1788466375, 1788466375, -0.4786, 51.389, 1501.14, false, 149.14, 135, 4.55, null, 1615.44, '0512', false, 0, 0];
    expect(openskyToStateVector(shifted)).toBeNull();
    const r = parseOpenSkyResponse({ time: 1, states: [live, shifted] });
    expect(r.aircraft).toHaveLength(1); expect(r.rejected).toBe(1);
  });
  it('tolerates a null states array', () => {
    expect(parseOpenSkyResponse({ time: 1, states: null }).aircraft).toEqual([]);
  });
});

describe('metadata join', () => {
  it('learns from the feed and enriches with a category that is never null', () => {
    const m = new AircraftMetaStore();
    const base: StateVector = { icao24: 'abc123', callsign: 'DLH441', lat: 0, lon: 0, baroAltM: 1000, geoAltM: null, onGround: false, velocityMps: 100, trackDeg: 0, verticalRateMps: 0, squawk: null, originCountry: 'Germany', timePosition: 0, lastContact: 0, emitterCategory: 'A5', registration: 'D-AIMA', typeCode: 'A388', typeDescription: null, positionSource: 'adsb', dbFlags: 0 };
    m.learn(base);
    const later = m.enrich({ ...base, registration: null, typeCode: null, emitterCategory: null });
    expect(later.typeCode).toBe('A388'); expect(later.category).toBe('wide-body-jet'); expect(later.airline).toBe('Lufthansa');
    const miss = m.enrich({ ...base, icao24: '000000', registration: null, typeCode: null, emitterCategory: null, callsign: null });
    expect(miss.category).toBe('generic'); expect(miss.airline).toBeNull();
  });
  it('parses quoted CSV cells', () => {
    expect(parseCsvLine('"a","b,c",d,"e ""q"""')).toEqual(['a', 'b,c', 'd', 'e "q"']);
  });
});

describe('tile poller (M4 acceptance)', () => {
  function fakeProvider(): AircraftProvider & { calls: BBox[] } {
    const calls: BBox[] = [];
    return {
      id: 'fake', attribution: 'fake', costHint: () => 1, calls,
      async fetchBox(b) { calls.push(b); return []; },
    };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('two subscribers on one tile → exactly one upstream call per interval; polling stops when they leave', async () => {
    let now = 0;
    const timers: { fn: () => void; at: number; id: number }[] = [];
    let nextId = 1;
    const setT = ((fn: () => void, ms: number) => { const id = nextId++; timers.push({ fn, at: now + ms, id }); return id as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout;
    const clearT = ((id: unknown) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); }) as typeof clearTimeout;
    const advance = async (ms: number) => {
      const target = now + ms;
      for (;;) {
        await flush(); await flush();
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > target) break;
        now = next.at; timers.shift(); next.fn(); await flush(); await flush(); await flush();
      }
      now = target;
    };
    const store = new MemoryTileStore(() => now);
    const provider = fakeProvider();
    const poller = new TilePoller(provider, store, new AircraftMetaStore(), { intervalMs: 10_000, maxActiveTiles: 8, idleMs: 15_000, now: () => now, setTimer: setT, clearTimer: clearT });
    // two clients on the same tile
    await store.setLocalSubscribers('gcpu', 2);
    poller.start();
    await advance(100);
    expect(provider.calls).toHaveLength(1);
    await advance(30_000);
    expect(provider.calls).toHaveLength(4); // t=0,10,20,30 — one per interval regardless of subscriber count
    expect(poller.activeTileIds()).toEqual(['gcpu']);
    // last subscriber leaves → stops within idleMs
    await store.setLocalSubscribers('gcpu', 0);
    poller.notifyChange();
    const callsAtLeave = provider.calls.length;
    await advance(16_000);
    expect(poller.activeTileIds()).toEqual([]);
    await advance(30_000);
    expect(provider.calls.length).toBeLessThanOrEqual(callsAtLeave + 1);
    await poller.stop();
  });

  it('fetches adjacent tiles with ONE upstream call and publishes a frame per tile', async () => {
    const store = new MemoryTileStore();
    const provider = fakeProvider();
    const frames: string[] = [];
    const poller = new TilePoller(provider, store, new AircraftMetaStore(), { intervalMs: 10_000, maxActiveTiles: 8, idleMs: 15_000, onFrame: (f) => frames.push(f.tile) });
    await store.setLocalSubscribers('gcps', 1);
    await store.setLocalSubscribers('gcpu', 1); // east neighbour
    await poller.reconcile();
    expect(poller.activeClusters()).toEqual(['gcps+gcpu']);
    await poller.pollCluster('gcps+gcpu');
    expect(provider.calls).toHaveLength(1);
    expect(frames.sort()).toEqual(['gcps', 'gcpu']);
    // the union bbox covers both tiles
    const b = provider.calls[0]!;
    expect(b.lomin).toBeLessThan(-0.35); expect(b.lomax).toBeGreaterThan(-0.35);
    // far-apart tiles stay separate
    expect(clusterTiles(['gcps', '9q8y'], 110_000)).toHaveLength(2);
    await poller.stop();
  });

  it('gates upstream calls: spacing, hourly credit budget, and a global pause on 429', async () => {
    let now = 0;
    const store = new MemoryTileStore(() => now);
    let fail = false;
    const provider: AircraftProvider = { id: 'f', attribution: 'f', costHint: () => 1, async fetchBox() { if (fail) { const e = new Error('429') as Error & { status: number }; e.status = 429; throw e; } return []; } };
    const poller = new TilePoller(provider, store, new AircraftMetaStore(), { intervalMs: 10_000, maxActiveTiles: 8, idleMs: 15_000, minSpacingMs: 1500, creditsPerHour: 3, now: () => now, setTimer: (() => 0) as unknown as typeof setTimeout, clearTimer: (() => undefined) as unknown as typeof clearTimeout });
    await store.setLocalSubscribers('gcps', 1); await store.setLocalSubscribers('9q8y', 1); await store.setLocalSubscribers('r3gx', 1);
    await poller.reconcile();
    const keys = poller.activeClusters();
    expect(keys).toHaveLength(3);
    await poller.pollCluster(keys[0]!);                 // call 1 at t=0
    await poller.pollCluster(keys[1]!);                 // deferred: within 1.5 s spacing
    expect(poller.stats.upstreamCalls).toBe(1); expect(poller.stats.rateDeferred).toBe(1);
    now = 2000; await poller.pollCluster(keys[1]!);     // call 2
    now = 4000; await poller.pollCluster(keys[2]!);     // call 3 — hourly budget spent
    now = 6000; await poller.pollCluster(keys[0]!);     // deferred by the budget
    expect(poller.stats.upstreamCalls).toBe(3); expect(poller.stats.rateDeferred).toBe(2);
    now = 3_601_000; fail = true; await poller.pollCluster(keys[0]!); // budget window rolled; 429 → global pause
    expect(poller.stats.upstreamErrors).toBe(1); expect(poller.stats.globalBackoffUntil).toBeGreaterThan(now);
    fail = false; now = 3_603_000; await poller.pollCluster(keys[1]!);
    expect(poller.stats.upstreamCalls).toBe(4);         // nobody called upstream during the pause
    await poller.stop();
  });

  it('caps active tiles and sheds the least-populated', async () => {
    const store = new MemoryTileStore();
    const provider = fakeProvider();
    const poller = new TilePoller(provider, store, new AircraftMetaStore(), { intervalMs: 10_000, maxActiveTiles: 2, idleMs: 15_000 });
    await store.setLocalSubscribers('gcps', 5); // London
    await store.setLocalSubscribers('9q8y', 3); // San Francisco
    await store.setLocalSubscribers('r3gx', 1); // Sydney
    await poller.reconcile();
    expect(new Set(poller.activeTileIds())).toEqual(new Set(['gcps', '9q8y']));
    expect(poller.stats.shedTiles).toBe(1);
    await poller.stop();
  });

  it('serves the cached frame to a late subscriber (M5) and respects the poll lock across nodes', async () => {
    const store = new MemoryTileStore();
    expect(await store.acquirePollLock('gcpu', 5000)).toBe(true);
    expect(await store.acquirePollLock('gcpu', 5000)).toBe(false);
    await store.setFrame({ tile: 'gcpu', t: 1, aircraft: [], provider: 'fake' }, 60_000);
    expect((await store.getFrame('gcpu'))?.tile).toBe('gcpu');
    expect(await store.getFrame('zzzz')).toBeNull();
  });
});
