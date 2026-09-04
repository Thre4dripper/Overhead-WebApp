import { useState } from 'react';
import { CITIES } from '../lib/cities';
import { iconMarkup } from '../lib/icons';
import { navigate } from '../lib/router';
import { useApp, type Home as HomeLoc } from '../lib/store';
import { hasWebGL2 } from '../lib/webgl';
import { Diorama } from './Diorama';
import { ALL_STAMPS, STAMP_FILES, STAMP_LABEL } from '../lib/account';

const CATS = ['wide-body-jet', 'narrow-body-jet', 'regional-jet', 'turboprop', 'business-jet', 'helicopter', 'light-piston'] as const;

export function Home() {
  const setHome = useApp((s) => s.setHome);
  const setOnboarded = useApp((s) => s.setOnboarded);
  const theme = useApp((s) => s.theme);
  const setThemeChoice = useApp((s) => s.setThemeChoice);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const webgl = hasWebGL2();

  const go = (h: HomeLoc) => { setHome(h); setOnboarded(true); navigate('/live'); };
  const useLocation = () => {
    if (!('geolocation' in navigator)) { setErr('No geolocation on this device — pick a city instead.'); return; }
    if (!window.isSecureContext) { setErr('Location needs a secure page (https). Open this site over https, or pick a city.'); return; }
    setLocating(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => go({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'gps', label: 'Your location' }),
      (e) => { setLocating(false); setErr(e.code === 1 ? 'Location permission denied — pick a city instead.' : 'Could not get a position — pick a city instead.'); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className="home">
      <section className="hero">
        {webgl ? <Diorama /> : <div className="diorama" />}
        <div className="hero-copy">
          <div className="brand"><img src="/assets/icon/overhead.svg" alt="" /><span>Overhead</span></div>
          <h1>The aircraft above your city, right now.</h1>
          <p>A tilted 3D view of your actual streets with live traffic moving over it. Tap any aircraft for its true altitude, speed, heading, type and registration. Free, no account, a hobby.</p>
          <div className="cta">
            <button className="btn primary" onClick={useLocation} disabled={locating}>{locating ? 'Locating…' : 'Use my location'}</button>
            <button className="btn" onClick={() => go(CITIES[0]!)}>Look over London</button>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="cities">
            {CITIES.map((c) => <button key={c.label} className="chip" onClick={() => go(c)}>{c.label}</button>)}
          </div>
        </div>
      </section>

      <section className="strip">
        <div><b>Live</b> from the OpenSky Network, every few seconds</div>
        <div><b>Anywhere</b> on Earth, buildings where OpenStreetMap has them</div>
        <div><b>Honest heights</b>: compressed to fit, labelled true</div>
        <div><b>Yours</b>: logbook and alerts stay in this browser</div>
      </section>

      <section className="features">
        <article>
          <img className="art ruler" src="/assets/hud/altitude-ruler-day.svg" alt="Altitude ruler with compressed scale" />
          <h2>Why the heights are compressed</h2>
          <p>A cruising airliner is eleven kilometres up; buildings are a hundred metres. At true scale every interesting aircraft is a dot far above the frame. So the 3D view squashes altitude above 1 000 m along a logarithmic curve, and the ruler on the right is drawn through the same function. Its gridlines bunch up exactly where the traffic does. Every label shows the true barometric altitude.</p>
        </article>
        <article>
          <div className="art icons">
            {CATS.map((c) => <svg key={c} viewBox="0 0 64 64" fill="currentColor" dangerouslySetInnerHTML={{ __html: iconMarkup(c) }} />)}
          </div>
          <h2>Seven silhouettes</h2>
          <p>Wide-body, narrow-body, regional jet, turboprop, business jet, helicopter and light piston, as low-poly 3D models with spinning propellers and rotors. The type comes from OpenSky's aircraft database, joined on the aircraft's ICAO address; unknown types render as a generic jet, never as nothing.</p>
        </article>
        <article>
          <div className="art stamps">
            {ALL_STAMPS.map((id) => <img key={id} src={STAMP_FILES[id]} alt={STAMP_LABEL[id]} title={STAMP_LABEL[id]} />)}
          </div>
          <h2>A logbook, if you want one</h2>
          <p>Tap "Log sighting" on any aircraft and it goes into a logbook kept in this browser, with stamps for firsts, wide-bodies, helicopters, rare types and night sightings. Set a watch rule and get a nudge when a type or registration passes over your home while the app is open.</p>
        </article>
      </section>

      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li>Your browser subscribes to the ~20 km map tiles it can see. The relay polls OpenSky once per interval per area, however many people are watching it, and fans the frame out over a WebSocket.</li>
          <li>Between polls, every aircraft is dead-reckoned from its last speed, track and vertical rate, then eased onto the next real position, so motion is smooth at 60 fps and nothing teleports.</li>
          <li>MapLibre draws the city from OpenFreeMap vector tiles and AWS terrain; a three.js layer shares its camera to draw the aircraft, trails, drop lines and clouds at compressed heights.</li>
        </ol>
        <p className="muted">Map © OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors. Terrain: Mapzen / AWS open data. Aircraft positions and database: The OpenSky Network. Palette adapted from FAA sectional charts.</p>
        <div className="formrow" style={{ marginTop: 14 }}>
          <span className="muted" style={{ alignSelf: 'center' }}>Lighting:</span>
          {(['auto', 'day', 'golden', 'night'] as const).map((t) => <button key={t} className="chip" aria-pressed={useApp.getState().themeChoice === t} onClick={() => setThemeChoice(t)}>{t === 'auto' ? `Auto (${theme})` : t}</button>)}
        </div>
      </section>
    </div>
  );
}
