import { CATEGORY_LABEL, displayCallsign, fmtAltitude, type AircraftCategory } from '@overhead/shared';
import { useState } from 'react';
import { ALL_STAMPS, STAMP_FILES, STAMP_LABEL, clearLogbook, exportLogbook } from '../lib/account';
import { iconMarkup } from '../lib/icons';
import { useApp } from '../lib/store';

export function Logbook() {
  const s = useApp();
  const [copied, setCopied] = useState(false);
  const have = new Set(s.stamps.map((x) => x.stamp));
  const copy = async () => {
    try { await navigator.clipboard.writeText(exportLogbook()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { s.showToast('Clipboard unavailable'); }
  };
  return (
    <div className="panel" role="dialog" aria-labelledby="lb-title">
      <div className="panel-head">
        <button className="iconbtn" aria-label="Back" onClick={() => s.setPanel('about')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 6l-6 6 6 6" /></svg></button>
        <h1 id="lb-title">Logbook</h1>
        <span className="muted" style={{ marginLeft: 'auto' }}>{s.sightings.length} sighting{s.sightings.length === 1 ? '' : 's'}</span>
      </div>
      <p className="muted">Kept in this browser only. Export it before clearing site data.</p>
      <h3>Stamps</h3>
      <div className="stamps">
        {ALL_STAMPS.map((id) => <img key={id} src={STAMP_FILES[id]} alt={STAMP_LABEL[id]} title={STAMP_LABEL[id]} className={have.has(id) ? '' : 'locked'} />)}
      </div>
      <p className="muted">{have.size} of {ALL_STAMPS.length}. Tap "Log sighting" on an aircraft to collect.</p>
      <h3>Sightings</h3>
      {s.sightings.length === 0 && <p className="muted">Nothing logged yet.</p>}
      {s.sightings.map((x) => (
        <div key={x.id} className="sighting">
          <svg className="ic" viewBox="0 0 64 64" fill="currentColor" dangerouslySetInnerHTML={{ __html: iconMarkup(x.category as AircraftCategory) }} />
          <span>
            <div className="cs">{displayCallsign(x.callsign, x.icao24)}{x.registration ? <span className="sub"> {x.registration}</span> : null}</div>
            <div className="sub">{x.typeCode ?? CATEGORY_LABEL[x.category as AircraftCategory]} · {new Date(x.seenAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </span>
          <span className="right">{fmtAltitude(x.altitudeM)}<br />{x.elevationDeg != null ? `${Math.round(x.elevationDeg)}° up` : ''}</span>
        </div>
      ))}
      {s.sightings.length > 0 && (
        <div className="formrow" style={{ marginTop: 16 }}>
          <button className="btn small" onClick={copy}>{copied ? 'Copied' : 'Copy as JSON'}</button>
          <button className="btn small" onClick={() => { if (confirm('Clear the logbook on this device?')) clearLogbook(); }}>Clear</button>
        </div>
      )}
    </div>
  );
}
