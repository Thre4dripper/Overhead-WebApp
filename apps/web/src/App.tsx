import { bearingDeg, displayCallsign, elevationDeg, haversineM, tilesCovering } from '@overhead/shared';
import { useEffect } from 'react';
import { Home } from './components/Home';
import { Live } from './components/Live';
import { evaluateRules, notify } from './lib/account';
import { Connection } from './lib/connection';
import { navigate, useRoute } from './lib/router';
import { runtime } from './lib/runtime';
import { sunElevationDeg, themeForSun } from './lib/solar';
import { useApp, type OverheadEntry } from './lib/store';
import { traffic } from './lib/traffic';
import { lowEndDevice } from './lib/webgl';

runtime.lowEnd = lowEndDevice();

export default function App() {
  const route = useRoute();
  const onboarded = useApp((s) => s.onboarded);
  const theme = useApp((s) => s.theme);
  const themeChoice = useApp((s) => s.themeChoice);
  const home = useApp((s) => s.home);
  const toast = useApp((s) => s.toast);

  // /live without a chosen location goes back to the homepage
  useEffect(() => { if (route === 'live' && !onboarded) navigate('/', true); }, [route, onboarded]);

  // theme: follow the sun unless overridden
  useEffect(() => {
    const apply = () => {
      const s = useApp.getState();
      const t = s.themeChoice === 'auto' ? themeForSun(sunElevationDeg(s.home.lat, s.home.lon)) : s.themeChoice;
      if (t !== s.theme) s.setResolvedTheme(t);
    };
    apply();
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  }, [themeChoice, home.lat, home.lon]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? (() => { const m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); return m; })();
    (meta as HTMLMetaElement).content = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim() || '#bcd0dd';
  }, [theme]);

  // live data — only while the live view is open
  useEffect(() => {
    if (route !== 'live') return;
    const conn = new Connection({
      onFrame: (aircraft, t) => { traffic.ingest(aircraft, t); useApp.getState().setLastFrameAt(Date.now()); },
      onInfo: (info) => useApp.getState().setConn(info),
      demoCenter: () => { const h = useApp.getState().home; return { lat: h.lat, lon: h.lon }; },
    });
    runtime.connection = conn;
    const h = useApp.getState().home;
    conn.setTiles(tilesCovering(h.lat, h.lon, 10000));
    conn.start();
    return () => { conn.stop(); runtime.connection = null; };
  }, [route]);
  useEffect(() => { runtime.connection?.setTiles(tilesCovering(home.lat, home.lon, 10000)); }, [home.lat, home.lon]);

  // overhead list at 2 Hz from TRUE altitude; client-side watch rules
  useEffect(() => {
    if (route !== 'live') return;
    const id = setInterval(() => {
      const s = useApp.getState();
      const now = Date.now();
      const out: OverheadEntry[] = [];
      for (const tr of traffic.tick(now)) {
        const dist = haversineM(s.home.lat, s.home.lon, tr.lat, tr.lon);
        if (dist > 120_000) continue;
        const el = elevationDeg(tr.altM - s.groundElevM, dist);
        out.push({
          icao24: tr.icao24, callsign: displayCallsign(tr.a.callsign, tr.icao24), category: tr.a.category, typeCode: tr.a.typeCode, operator: tr.a.operator ?? tr.a.airline,
          originCountry: tr.a.originCountry, altM: tr.altM, elevationDeg: el, bearingDeg: bearingDeg(s.home.lat, s.home.lon, tr.lat, tr.lon), distanceKm: dist / 1000,
          track: tr.track, vrate: tr.a.verticalRateMps, speedMps: tr.a.velocityMps, squawk: tr.a.squawk, lat: tr.lat, lon: tr.lon, freshness: tr.freshness,
        });
      }
      out.sort((a, b) => b.elevationDeg - a.elevationDeg);
      s.setOverhead(out, out.filter((e) => e.elevationDeg >= 20).length);
      for (const hit of evaluateRules(out, (i) => traffic.get(i))) {
        const a = hit.tr.a;
        notify(`${displayCallsign(a.callsign, a.icao24)} overhead`, `${a.model ?? a.typeCode ?? 'Aircraft'}${a.operator ? `, ${a.operator}` : ''} matched your ${hit.rule.kind.replace('_', ' ')} rule`);
      }
      if (s.selected && !traffic.get(s.selected)) s.select(null);
    }, 500);
    return () => clearInterval(id);
  }, [route]);

  if (route === 'live' && onboarded) return <Live />;
  return (
    <>
      <Home />
      {toast && <div className="toast" role="status">{toast.img && <img src={toast.img} alt="" />}<span>{toast.text}</span></div>}
    </>
  );
}
