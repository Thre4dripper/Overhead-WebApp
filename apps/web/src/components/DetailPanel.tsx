import { flightLevel, metersToFeet } from '@overhead/altitude';
import { CATEGORY_LABEL, bearingDeg, displayCallsign, elevationDeg, fmtAgo, fmtAltitude, fmtDistance, fmtHeading, fmtSpeed, fmtVerticalRate, haversineM, isEmergencySquawk, squawkMeaning, trendArrow } from '@overhead/shared';
import { useEffect, useState } from 'react';
import { addRule, logSighting, STAMP_FILES, STAMP_LABEL } from '../lib/account';
import { lookAt } from '../lib/camera';
import { runtime } from '../lib/runtime';
import { useApp } from '../lib/store';
import { traffic, type Tracked } from '../lib/traffic';
import { ModelViewer } from './ModelViewer';

export function DetailPanel() {
  const selected = useApp((s) => s.selected);
  const select = useApp((s) => s.select);
  const home = useApp((s) => s.home);
  const groundElevM = useApp((s) => s.groundElevM);
  const showToast = useApp((s) => s.showToast);
  const [tr, setTr] = useState<Tracked | undefined>(() => (selected ? traffic.get(selected) : undefined));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const tick = () => setTr(traffic.get(selected) ? { ...traffic.get(selected)! } : undefined);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [selected]);

  if (!selected) return null;
  if (!tr) return (
    <div className="detail"><div className="detail-head"><div><h2>Lost contact</h2><div className="op">No report from this aircraft in the last minute.</div></div><button className="iconbtn close" aria-label="Close" onClick={() => select(null)}>✕</button></div><div style={{ height: 18 }} /></div>
  );
  const a = tr.a;
  const dist = haversineM(home.lat, home.lon, tr.lat, tr.lon);
  const brg = bearingDeg(home.lat, home.lon, tr.lat, tr.lon);
  const elev = elevationDeg(tr.altM - groundElevM, dist);
  const ft = metersToFeet(tr.altM);
  const title = displayCallsign(a.callsign, a.icao24);
  const op = a.operator ?? a.airline ?? (a.registration ? 'Private / unknown operator' : 'Unknown operator');

  const onLog = () => {
    setBusy(true);
    const fresh = logSighting(tr);
    if (fresh.length) showToast(`Logged. New stamp: ${STAMP_LABEL[fresh[0]!.stamp]}`, STAMP_FILES[fresh[0]!.stamp]);
    else showToast(`Logged ${title} in your logbook`);
    setTimeout(() => setBusy(false), 600);
  };
  const onWatch = () => {
    if (!a.typeCode) return;
    addRule('type_code', a.typeCode);
    showToast(`Watching for ${a.typeCode} overhead`);
  };
  const emergency = isEmergencySquawk(a.squawk);
  const sq = squawkMeaning(a.squawk);
  // altitude over the last minutes, from the trail, TRUE metres
  const trail = tr.trail.length >= 3 ? tr.trail : null;
  const spark = (() => {
    if (!trail) return null;
    const alts = trail.map((p) => p.altM); const lo = Math.min(...alts), hi = Math.max(...alts); const span = Math.max(60, hi - lo);
    const t0 = trail[0]!.t, t1 = trail[trail.length - 1]!.t || t0 + 1;
    return trail.map((p) => `${(((p.t - t0) / Math.max(1, t1 - t0)) * 140).toFixed(1)},${(30 - ((p.altM - lo) / span) * 26).toFixed(1)}`).join(' ');
  })();

  return (
    <div className="detail" role="dialog" aria-label={`${title} details`}>
      <div className="detail-head">
        <div>
          <h2>{title}</h2>
          <div className="op">{op}{a.model || a.typeCode ? ` — ${a.model ?? a.typeCode}` : ''}</div>
        </div>
        <button className="iconbtn close" aria-label="Close" onClick={() => select(null)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <ModelViewer category={a.category} />
      <div className="bigalt">
        <span className="v">{fmtAltitude(tr.altM)}</span>
        <span className="trend">{trendArrow(a.verticalRateMps)}</span>
        {ft >= 18000 && <span className="fl">{flightLevel(ft)}</span>}
        <span className="note">True barometric altitude. The 3D height is compressed for readability.</span>
      </div>
      <div className="facts">
        <div className="fact"><div className="k">SPEED</div><div className="v">{fmtSpeed(a.velocityMps)}</div></div>
        <div className="fact"><div className="k">HEADING</div><div className="v">{fmtHeading(tr.track)}</div></div>
        <div className="fact"><div className="k">VERTICAL</div><div className="v small">{fmtVerticalRate(a.verticalRateMps)}</div></div>
        <div className="fact"><div className="k">TYPE</div><div className="v">{a.typeCode ?? '—'}</div></div>
        <div className="fact"><div className="k">REGISTRATION</div><div className="v">{a.registration ?? '—'}</div></div>
        <div className="fact"><div className="k">CATEGORY</div><div className="v small">{CATEGORY_LABEL[a.category]}{a.category === 'generic' ? ' (unknown type)' : ''}</div></div>
        <div className="fact"><div className="k">FROM YOU</div><div className="v">{fmtDistance(dist / 1000)}</div></div>
        <div className="fact"><div className="k">BEARING</div><div className="v">{fmtHeading(brg)}</div></div>
        <div className="fact"><div className="k">ELEVATION</div><div className="v">{Math.round(elev)}° up</div></div>
        <div className="fact"><div className="k">COUNTRY</div><div className="v small">{a.originCountry ?? '—'}</div></div>
        <div className="fact" style={emergency ? { background: 'var(--accent)', color: '#fff' } : undefined}><div className="k" style={emergency ? { color: 'rgba(255,255,255,0.8)' } : undefined}>SQUAWK</div><div className="v">{a.squawk ?? '—'}{sq ? <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>{sq}</span> : null}</div></div>
        <div className="fact"><div className="k">GNSS ALT</div><div className="v small">{fmtAltitude(a.geoAltM)}</div></div>
      </div>
      {spark && (
        <div style={{ margin: '12px 18px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
          <svg viewBox="0 0 140 32" width="140" height="32" aria-label="Altitude over the last minutes"><polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth="1.25" /><line x1="0" x2="140" y1="31" y2="31" stroke="var(--ink)" strokeOpacity="0.2" strokeWidth="0.75" /></svg>
          <span className="muted" style={{ fontSize: 11 }}>True altitude, last {Math.round((tr.trail[tr.trail.length - 1]!.t - tr.trail[0]!.t) / 60000) || 1} min · report {fmtAgo(a.timePosition)}</span>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" onClick={onLog} disabled={busy}>Log sighting</button>
        <button className="btn" onClick={() => runtime.map && lookAt(runtime.map, tr.lat, tr.lon)}>Centre</button>
        {a.typeCode && <button className="btn" onClick={onWatch} title="Alert me when this type is overhead">Watch type</button>}
      </div>
      <div className="muted" style={{ padding: '0 18px 16px', fontSize: 11 }}>
        ICAO24 {a.icao24.toUpperCase()} · position via {a.positionSource.toUpperCase()}{(a.dbFlags ?? 0) & 1 ? ' · military' : ''} · <a href={`https://opensky-network.org/aircraft-profile?icao24=${a.icao24}`} target="_blank" rel="noreferrer">OpenSky profile</a>
      </div>
    </div>
  );
}
