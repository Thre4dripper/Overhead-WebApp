import { CATEGORY_LABEL, fmtAltitude, fmtHeading, fmtSpeed, isEmergencySquawk, trendArrow, type AircraftCategory } from '@overhead/shared';
import { useState } from 'react';
import { lookAt } from '../lib/camera';
import { iconMarkup } from '../lib/icons';
import { runtime } from '../lib/runtime';
import { useApp, type ListSort } from '../lib/store';
import { EmptyState } from './EmptyState';

/**
 * The overhead list. "Overhead" means elevation angle above ~20°, computed from TRUE altitude and
 * sorted by elevation by default, so the aircraft most directly above you is first — never by distance.
 */
export function OverheadSheet() {
  const list = useApp((s) => s.overhead);
  const count = useApp((s) => s.count);
  const open = useApp((s) => s.sheetOpen);
  const setOpen = useApp((s) => s.setSheetOpen);
  const selected = useApp((s) => s.selected);
  const select = useApp((s) => s.select);
  const conn = useApp((s) => s.conn);
  const sort = useApp((s) => s.listSort);
  const setSort = useApp((s) => s.setListSort);
  const [all, setAll] = useState(false);
  const rows = (all ? list : list.filter((e) => e.elevationDeg >= 20)).slice().sort((a, b) =>
    sort === 'distance' ? a.distanceKm - b.distanceKm : sort === 'altitude' ? b.altM - a.altM : b.elevationDeg - a.elevationDeg);
  const top = list[0];
  const lead = conn.status === 'connecting' ? 'Listening for traffic…' : count === 0 ? (list.length ? `Nothing directly overhead. ${list.length} in range.` : 'Clear overhead. Nothing but sky up there.') : top ? <>Most directly above: <b>{top.callsign}</b>, {Math.round(top.elevationDeg)}° up</> : '';
  const sorts: [ListSort, string][] = [['elevation', 'Highest up'], ['distance', 'Nearest'], ['altitude', 'Altitude']];

  return (
    <div className={`sheet${open ? ' open' : ''}`} role="region" aria-label="Aircraft overhead">
      <button className="sheet-handle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grip" />
        <span className="n">{count}<small>overhead</small></span>
        <span className="lead">{lead}</span>
      </button>
      <div className="sheet-body">
        <div className="filterbar">
          <button className="chip" aria-pressed={!all} onClick={() => setAll(false)}>Overhead ≥ 20°</button>
          <button className="chip" aria-pressed={all} onClick={() => setAll(true)}>All in range ({list.length})</button>
          <span style={{ flex: 1 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as ListSort)} aria-label="Sort" style={{ padding: '4px 8px', fontSize: 12 }}>
            {sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {rows.length === 0 && list.length === 0 && <EmptyState />}
        {rows.length === 0 && list.length > 0 && <div className="muted" style={{ padding: '18px 8px 24px', textAlign: 'center' }}>Nothing above 20° elevation. Switch to "All in range" to see what is passing further out.</div>}
        {rows.map((e) => (
          <button key={e.icao24} className={`row${e.icao24 === selected ? ' selected' : ''}`} style={{ opacity: 0.55 + 0.45 * e.freshness }} onClick={() => { select(e.icao24); setOpen(false); if (runtime.map) { const t = runtime.map; setTimeout(() => lookAt(t, e.lat, e.lon), 50); } }}>
            <svg className="ic" viewBox="0 0 64 64" fill="currentColor" style={{ transform: `rotate(${e.track}deg)` }} dangerouslySetInnerHTML={{ __html: iconMarkup(e.category as AircraftCategory) }} />
            <span>
              <div className="cs">{e.callsign}{isEmergencySquawk(e.squawk) && <span style={{ marginLeft: 8, fontSize: 10, color: '#fff', background: 'var(--accent)', padding: '1px 6px', borderRadius: 3 }}>SQUAWK {e.squawk}</span>}</div>
              <div className="sub">{e.operator ?? CATEGORY_LABEL[e.category as AircraftCategory]}{e.typeCode ? ` · ${e.typeCode}` : ''}{e.originCountry ? ` · ${e.originCountry}` : ''}</div>
              <div className="sub">{fmtSpeed(e.speedMps)} · {fmtHeading(e.track)}{e.vrate != null && Math.abs(e.vrate) > 1.5 ? ` · ${trendArrow(e.vrate)} ${Math.round(Math.abs(e.vrate) * 196.85 / 100) * 100} ft/min` : ''}</div>
            </span>
            <span className="right"><b>{fmtAltitude(e.altM)}</b>{Math.round(e.elevationDeg)}° up · {fmtHeading(e.bearingDeg)}<br />{e.distanceKm < 10 ? e.distanceKm.toFixed(1) : Math.round(e.distanceKm)} km</span>
          </button>
        ))}
      </div>
    </div>
  );
}
