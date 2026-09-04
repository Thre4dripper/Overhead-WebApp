import type { Sighting, StampAward, WatchRule } from '@overhead/shared';
import { create } from 'zustand';
import { DEFAULT_HOME } from './api';
import type { ConnectionInfo } from './connection';
import type { Theme, ThemeChoice } from './solar';

export interface Home { lat: number; lon: number; source: 'gps' | 'default' | 'city'; label?: string }
export type Panel = null | 'about' | 'logbook' | 'alerts' | 'ar';
export type RenderMode = '3d' | 'flat' | 'chart';

export interface OverheadEntry {
  icao24: string; callsign: string; category: string; typeCode: string | null; operator: string | null; originCountry: string | null;
  altM: number; elevationDeg: number; bearingDeg: number; distanceKm: number; track: number; vrate: number | null; speedMps: number | null;
  squawk: string | null; lat: number; lon: number; freshness: number;
}
export type ListSort = 'elevation' | 'distance' | 'altitude';

interface AppState {
  themeChoice: ThemeChoice; theme: Theme;
  setThemeChoice: (c: ThemeChoice) => void; setResolvedTheme: (t: Theme) => void;
  home: Home; setHome: (h: Home) => void;
  onboarded: boolean; setOnboarded: (v: boolean) => void;
  conn: ConnectionInfo; setConn: (c: ConnectionInfo) => void;
  selected: string | null; select: (icao: string | null) => void;
  panel: Panel; setPanel: (p: Panel) => void;
  sheetOpen: boolean; setSheetOpen: (v: boolean) => void;
  renderMode: RenderMode; setRenderMode: (m: RenderMode) => void;
  forceFlat: boolean; setForceFlat: (v: boolean) => void;
  trails: boolean; setTrails: (v: boolean) => void;
  terrain: boolean; setTerrain: (v: boolean) => void;
  camera: { zoom: number; pitch: number; bearing: number; metersPerPixel: number; eyeAltM: number };
  initialCamera: { zoom?: number; pitch?: number; bearing?: number };
  setCamera: (c: AppState['camera']) => void;
  groundElevM: number; setGroundElevM: (m: number) => void;
  overhead: OverheadEntry[]; count: number; setOverhead: (list: OverheadEntry[], count: number) => void;
  listSort: ListSort; setListSort: (s: ListSort) => void;
  lastFrameAt: number; setLastFrameAt: (t: number) => void;
  toast: { text: string; img?: string } | null; showToast: (text: string, img?: string) => void;
  userId: string;
  sightings: Sighting[]; stamps: StampAward[]; setLogbook: (s: Sighting[], st: StampAward[]) => void;
  rules: WatchRule[]; setRules: (r: WatchRule[]) => void;
  notify: boolean; setNotify: (v: boolean) => void;
  pendingSelect: string | null;
}

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function anonId(): string {
  const existing = LS.get<string | null>('overhead.userId', null);
  if (existing) return existing;
  const id = (crypto.randomUUID?.() ?? `u-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).replace(/-/g, '').slice(0, 32);
  LS.set('overhead.userId', id);
  return id;
}

const params = new URLSearchParams(window.location.search);
const atParam = params.get('at');
const deepHome: Home | null = (() => {
  if (!atParam) return null;
  const [la, lo] = atParam.split(',').map(Number);
  if (la == null || lo == null || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo, source: 'city', label: params.get('label') ?? `${la.toFixed(3)}, ${lo.toFixed(3)}` };
})();
const themeParam = params.get('theme');
const deepTheme: ThemeChoice | null = themeParam === 'day' || themeParam === 'golden' || themeParam === 'night' || themeParam === 'auto' ? themeParam : null;

export const useApp = create<AppState>((set) => ({
  themeChoice: deepTheme ?? LS.get<ThemeChoice>('overhead.theme', 'auto'),
  theme: 'day',
  setThemeChoice: (c) => { LS.set('overhead.theme', c); set({ themeChoice: c }); },
  setResolvedTheme: (t) => set({ theme: t }),
  home: deepHome ?? LS.get<Home>('overhead.home', { ...DEFAULT_HOME, source: 'default', label: 'West London (default)' }),
  setHome: (h) => { LS.set('overhead.home', h); set({ home: h }); },
  onboarded: deepHome != null || LS.get<boolean>('overhead.onboarded', false),
  setOnboarded: (v) => { LS.set('overhead.onboarded', v); set({ onboarded: v }); },
  conn: { status: 'connecting', provider: '', attribution: '' },
  setConn: (c) => set({ conn: c }),
  selected: null,
  select: (icao) => set({ selected: icao, pendingSelect: null }),
  panel: null, setPanel: (p) => set({ panel: p }),
  sheetOpen: false, setSheetOpen: (v) => set({ sheetOpen: v }),
  renderMode: '3d', setRenderMode: (m) => set({ renderMode: m }),
  forceFlat: LS.get<boolean>('overhead.forceFlat', false),
  setForceFlat: (v) => { LS.set('overhead.forceFlat', v); set({ forceFlat: v }); },
  terrain: params.get('terrain') === '0' ? false : LS.get<boolean>('overhead.terrain', true),
  setTerrain: (v) => { LS.set('overhead.terrain', v); set({ terrain: v }); },
  trails: LS.get<boolean>('overhead.trails', true),
  setTrails: (v) => { LS.set('overhead.trails', v); set({ trails: v }); },
  camera: { zoom: 14.4, pitch: 72, bearing: 0, metersPerPixel: 3, eyeAltM: 0 },
  initialCamera: (() => {
    const n = (k: string, lo: number, hi: number) => { const v = Number(params.get(k)); return params.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined; };
    return { zoom: n('z', 3, 18), pitch: n('pitch', 0, 75), bearing: n('bearing', -180, 360) };
  })(),
  setCamera: (c) => set({ camera: c }),
  groundElevM: 0, setGroundElevM: (m) => set({ groundElevM: m }),
  overhead: [], count: 0, setOverhead: (list, count) => set({ overhead: list, count }),
  listSort: LS.get<ListSort>('overhead.listSort', 'elevation'), setListSort: (v) => { LS.set('overhead.listSort', v); set({ listSort: v }); },
  lastFrameAt: 0, setLastFrameAt: (t) => set({ lastFrameAt: t }),
  toast: null,
  showToast: (text, img) => { set({ toast: { text, img } }); setTimeout(() => set((s) => (s.toast?.text === text ? { toast: null } : {})), 3600); },
  userId: anonId(),
  sightings: LS.get<Sighting[]>('overhead.sightings', []),
  stamps: LS.get<StampAward[]>('overhead.stamps', []),
  setLogbook: (s, st) => { LS.set('overhead.sightings', s.slice(0, 500)); LS.set('overhead.stamps', st); set({ sightings: s, stamps: st }); },
  rules: LS.get<WatchRule[]>('overhead.rules', []), setRules: (r) => { LS.set('overhead.rules', r); set({ rules: r }); },
  notify: LS.get<boolean>('overhead.notify', false), setNotify: (v) => { LS.set('overhead.notify', v); set({ notify: v }); },
  pendingSelect: params.get('select'),
}));
