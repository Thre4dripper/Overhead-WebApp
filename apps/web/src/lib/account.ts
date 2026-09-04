import { elevationDeg, haversineM, isRareType, type Aircraft, type Sighting, type StampAward, type WatchRule, type WatchRuleKind } from '@overhead/shared';
import { metersToFeet } from '@overhead/altitude';
import { useApp } from './store';
import type { Tracked } from './traffic';

/**
 * Hobby project: no accounts, no server state. The logbook, stamps and watch rules live in this
 * browser's localStorage; alerts are evaluated here against the live frames and surfaced as toasts
 * and (if allowed) browser notifications while the app is open.
 */

export const STAMP_FILES: Record<StampAward['stamp'], string> = {
  'first-sighting': '/assets/stamps/first-sighting.svg', 'wide-body': '/assets/stamps/wide-body.svg', helicopter: '/assets/stamps/helicopter.svg',
  'rare-type': '/assets/stamps/rare-type.svg', 'night-sighting': '/assets/stamps/night-sighting.svg', turboprop: '/assets/stamps/turboprop.svg',
  'century-club': '/assets/stamps/century-club.svg', 'high-flyer': '/assets/stamps/high-flyer.svg',
};
export const STAMP_LABEL: Record<StampAward['stamp'], string> = {
  'first-sighting': 'First sighting', 'wide-body': 'Wide-body', helicopter: 'Rotary', 'rare-type': 'Rare type', 'night-sighting': 'Night sighting',
  turboprop: 'Turboprop', 'century-club': '100 sightings', 'high-flyer': 'High flyer (FL400+)',
};
export const ALL_STAMPS = Object.keys(STAMP_FILES) as StampAward['stamp'][];

function stampsFor(x: Sighting, total: number): StampAward[] {
  const out: StampAward['stamp'][] = [];
  const h = new Date().getHours();
  if (total === 1) out.push('first-sighting');
  if (total >= 100) out.push('century-club');
  if (x.category === 'wide-body-jet') out.push('wide-body');
  if (x.category === 'helicopter') out.push('helicopter');
  if (x.category === 'turboprop') out.push('turboprop');
  if (isRareType(x.typeCode)) out.push('rare-type');
  if (x.altitudeM != null && metersToFeet(x.altitudeM) >= 40000) out.push('high-flyer');
  if (h >= 21 || h < 5) out.push('night-sighting');
  return out.map((stamp) => ({ stamp, awardedAt: x.seenAt, sightingId: x.id }));
}

/** Record a sighting locally. Returns the stamps that are new. TRUE altitude only is stored. */
export function logSighting(tr: Tracked): StampAward[] {
  const s = useApp.getState();
  const a = tr.a;
  const dist = haversineM(s.home.lat, s.home.lon, tr.lat, tr.lon);
  const row: Sighting = {
    id: `${Date.now().toString(36)}-${a.icao24}`, userId: s.userId, icao24: a.icao24, callsign: a.callsign, registration: a.registration, typeCode: a.typeCode,
    category: a.category, seenAt: new Date().toISOString(), lat: tr.lat, lon: tr.lon, altitudeM: tr.altM, elevationDeg: elevationDeg(tr.altM - s.groundElevM, dist), source: 'tap',
  };
  const merged = [row, ...s.sightings];
  const fresh = stampsFor(row, merged.length).filter((n) => !s.stamps.some((x) => x.stamp === n.stamp));
  s.setLogbook(merged, [...s.stamps, ...fresh]);
  return fresh;
}

export function clearLogbook(): void { useApp.getState().setLogbook([], []); }

export function exportLogbook(): string {
  const s = useApp.getState();
  return JSON.stringify({ exportedAt: new Date().toISOString(), sightings: s.sightings, stamps: s.stamps }, null, 2);
}

// ---- watch rules (client side) ----
export function addRule(kind: WatchRuleKind, value?: string): WatchRule {
  const s = useApp.getState();
  const rule: WatchRule = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, userId: s.userId, kind, params: value ? { value } : {}, enabled: true };
  s.setRules([...s.rules, rule]);
  return rule;
}
export function deleteRule(id: string): void { const s = useApp.getState(); s.setRules(s.rules.filter((r) => r.id !== id)); }
export function toggleRule(id: string, enabled: boolean): void { const s = useApp.getState(); s.setRules(s.rules.map((r) => (r.id === id ? { ...r, enabled } : r))); }

export function ruleMatches(rule: WatchRule, a: Aircraft, seenBefore: boolean): boolean {
  switch (rule.kind) {
    case 'type_code': return !!a.typeCode && a.typeCode.toUpperCase() === (rule.params.value ?? '').toUpperCase();
    case 'registration': return !!a.registration && a.registration.toUpperCase().replace('-', '') === (rule.params.value ?? '').toUpperCase().replace('-', '');
    case 'operator': return !!(a.operator ?? a.airline) && (a.operator ?? a.airline ?? '').toLowerCase().includes((rule.params.value ?? '').toLowerCase());
    case 'rare': return isRareType(a.typeCode) || ((a.dbFlags ?? 0) & 1) === 1;
    case 'first_seen': return !seenBefore;
  }
}

const alerted = new Map<string, number>();
/** Evaluate enabled rules against aircraft currently overhead (≥ 20°). One alert per aircraft per hour. */
export function evaluateRules(overhead: { icao24: string; elevationDeg: number }[], get: (icao: string) => Tracked | undefined): { rule: WatchRule; tr: Tracked }[] {
  const s = useApp.getState();
  const rules = s.rules.filter((r) => r.enabled);
  if (!rules.length) return [];
  const hits: { rule: WatchRule; tr: Tracked }[] = [];
  const now = Date.now();
  for (const e of overhead) {
    if (e.elevationDeg < 20) continue;
    const tr = get(e.icao24);
    if (!tr) continue;
    if (now - (alerted.get(e.icao24) ?? 0) < 3_600_000) continue;
    const seenBefore = s.sightings.some((x) => x.icao24 === e.icao24);
    const rule = rules.find((r) => ruleMatches(r, tr.a, seenBefore));
    if (rule) { alerted.set(e.icao24, now); hits.push({ rule, tr }); }
  }
  return hits;
}

export async function enableNotifications(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  useApp.getState().setNotify(true);
  return 'ok';
}

export function notify(title: string, body: string): void {
  const s = useApp.getState();
  s.showToast(`${title} — ${body}`);
  if (s.notify && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(title, { body, icon: '/icons/icon-192.png', tag: title }); } catch { /* ignore */ }
  }
}
