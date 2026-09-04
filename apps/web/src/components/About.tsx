import { LINEAR_CEILING_M, LOG_SCALE_M } from '@overhead/altitude';
import { useApp } from '../lib/store';
import type { ThemeChoice } from '../lib/solar';
import { CITIES } from '../lib/cities';
import { navigate } from '../lib/router';

export function About() {
  const s = useApp();
  const close = () => s.setPanel(null);
  const themes: ThemeChoice[] = ['auto', 'day', 'golden', 'night'];
  return (
    <div className="panel" role="dialog" aria-labelledby="about-title">
      <div className="panel-head">
        <button className="iconbtn" aria-label="Back to the map" onClick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 6l-6 6 6 6" /></svg></button>
        <h1 id="about-title">Overhead</h1>
      </div>

      <div className="formrow">
        <button className="btn" onClick={() => s.setPanel('logbook')}>Logbook</button>
        <button className="btn" onClick={() => s.setPanel('alerts')}>Alerts</button>
        <button className="btn" onClick={() => s.setPanel('ar')}>Point at the sky</button>
        <button className="btn" onClick={() => { s.setPanel(null); navigate('/'); }}>Home page</button>
      </div>

      <h3>Lighting</h3>
      <div className="segment" role="radiogroup" aria-label="Theme">
        {themes.map((t) => <button key={t} role="radio" aria-checked={s.themeChoice === t} aria-pressed={s.themeChoice === t} onClick={() => s.setThemeChoice(t)}>{t === 'auto' ? `Auto (${s.theme})` : t[0]!.toUpperCase() + t.slice(1)}</button>)}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>Auto follows the sun at your location: day, golden hour, night.</p>

      <h3>View</h3>
      <div className="formrow">
        <button className="chip" aria-pressed={!s.forceFlat} onClick={() => s.setForceFlat(false)}>3D city</button>
        <button className="chip" aria-pressed={s.forceFlat} onClick={() => s.setForceFlat(true)}>Flat map (saves battery)</button>
        <button className="chip" aria-pressed={s.trails} onClick={() => s.setTrails(!s.trails)}>Trails {s.trails ? 'on' : 'off'}</button>
        <button className="chip" aria-pressed={s.terrain} onClick={() => s.setTerrain(!s.terrain)}>3D terrain {s.terrain ? 'on' : 'off'}</button>
      </div>

      <h3>Location</h3>
      <p className="muted">{s.home.label ?? `${s.home.lat.toFixed(3)}, ${s.home.lon.toFixed(3)}`}</p>
      <div className="formrow">
        <button className="btn small" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { s.setHome({ lat: p.coords.latitude, lon: p.coords.longitude, source: 'gps', label: 'Your location' }); close(); })}>Use my location</button>
        {CITIES.map((c) => <button key={c.label} className="chip" onClick={() => { s.setHome(c); close(); }}>{c.label}</button>)}
      </div>

      <h3>About the heights</h3>
      <p>The 3D view compresses altitude so that cruising traffic sits readably above the skyline instead of off-screen. Below {LINEAR_CEILING_M.toLocaleString()} m the scene is true to scale; above that, height follows a logarithmic curve (scale {LOG_SCALE_M} m). The ruler on the right is drawn through the same function, which is why its gridlines bunch up. Every label and the detail panel show the true barometric altitude.</p>

      <h3>Data and credits</h3>
      <p className="muted">Map: <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © OpenMapTiles, data © OpenStreetMap contributors (ODbL). Terrain: Mapzen / AWS open data terrain tiles. Aircraft positions: {s.conn.attribution || 'community ADS-B feed'}. Type and registration come from OpenSky's aircraft database joined on the ICAO address; routes and destinations are not shown because no free feed provides them reliably.</p>
      <p className="muted">Status: {s.conn.status}{s.conn.detail ? ` — ${s.conn.detail}` : ''}. {s.conn.provider === 'opensky-edge' ? 'Positions come through a small edge function that fetches OpenSky and caches each map tile for everyone; aircraft types and registrations are not available in this mode (the aircraft database lives in the full relay).' : 'Positions come through the Overhead relay, which joins types and registrations from OpenSky\u2019s aircraft database.'} Everything you save (logbook, stamps, watch rules) stays in this browser; there is no account and no server-side storage.</p>

      <h3>Palette</h3>
      <div className="swatches" aria-hidden>
        {['--sky', '--ground', '--massing', '--ink', '--accent', '--blue'].map((v) => <div key={v} className="swatch" style={{ background: `var(${v})` }} title={v} />)}
      </div>
      <p className="muted">Adapted from FAA sectional charts: buff grounds, hairline ink, and magenta reserved for aircraft, their trails and the altitude ruler.</p>
    </div>
  );
}
