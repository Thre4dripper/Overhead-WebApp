import { bearingDeg, displayCallsign, elevationDeg, fmtAltitude, haversineM, angleDelta } from '@overhead/shared';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../lib/api';
import { iconMarkup } from '../lib/icons';
import { useApp } from '../lib/store';
import { traffic } from '../lib/traffic';

type SensorState = 'idle' | 'need-permission' | 'running' | 'unavailable' | 'denied';
const D2R = Math.PI / 180;

/**
 * Point-at-the-sky view. Device orientation drives a virtual camera; each aircraft's azimuth and
 * elevation are computed from TRUE altitude and projected through a pinhole model onto the screen.
 * iOS: webkitCompassHeading (already true north). Android: absolute alpha is magnetic, corrected
 * with the declination the API fetched for this location. Readings are smoothed; a nudge control
 * and a manual "drag to look" fallback cover bad compasses and sensor-less devices.
 */
export function ArView() {
  const s = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sensor, setSensor] = useState<SensorState>('idle');
  const [cam, setCam] = useState(false);
  const [declination, setDeclination] = useState<number | null>(null);
  const [nudge, setNudge] = useState<number>(() => Number(localStorage.getItem('overhead.compassNudge') ?? 0));
  const pose = useRef({ heading: 0, pitch: 35, roll: 0, has: false });
  const manual = useRef({ heading: 0, pitch: 35 });
  const [, force] = useState(0);
  const iosLike = /iP(hone|ad|od)/.test(navigator.userAgent);

  useEffect(() => {
    fetch(`${API_URL}/api/declination?lat=${s.home.lat}&lon=${s.home.lon}`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json())
      .then((j: { declination?: number | null }) => setDeclination(typeof j.declination === 'number' ? j.declination : null))
      .catch(() => setDeclination(null));
  }, [s.home.lat, s.home.lon]);

  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') { setSensor('unavailable'); return; }
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    if (typeof DOE.requestPermission === 'function') setSensor('need-permission'); else start();
    return stop;
  }, []);

  const handlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  function start() {
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean }) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const a = e.alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
      // W3C: R = Rz(alpha) · Rx(beta) · Ry(gamma); device −Z is the rear camera, +Y is the top edge
      const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
      const R = [
        [cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG],
        [sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG],
        [-cB * sG, sB, cB * cG],
      ];
      // earth frame here: x east, y north, z up (alpha=0 → top edge points north)
      const look = { x: -R[0]![2]!, y: -R[1]![2]!, z: -R[2]![2]! };
      const top = { x: R[0]![1]!, y: R[1]![1]!, z: R[2]![1]! };
      let heading = Math.atan2(look.x, look.y) / D2R;
      const pitch = Math.asin(Math.max(-1, Math.min(1, look.z))) / D2R;
      if (typeof e.webkitCompassHeading === 'number') {
        // iOS alpha is arbitrary; align the matrix's top-edge heading to the compass
        const topHeading = Math.atan2(top.x, top.y) / D2R;
        heading += angleDelta(topHeading, e.webkitCompassHeading);
      } else {
        // the matrix already yields a compass heading (alpha=0 → north, alpha=90 → west); alpha is magnetic on Android
        if (declination != null) heading += declination;
      }
      heading = ((heading + nudge) % 360 + 360) % 360;
      // roll: angle of the device's top edge around the look direction
      const rightE = { x: Math.cos(heading * D2R), y: -Math.sin(heading * D2R), z: 0 };
      const roll = Math.atan2(top.x * rightE.x + top.y * rightE.y, Math.max(0.001, Math.sqrt(Math.max(0, 1 - Math.pow(top.x * rightE.x + top.y * rightE.y, 2))))) / D2R;
      const p = pose.current;
      if (!p.has) { p.heading = heading; p.pitch = pitch; p.roll = roll; p.has = true; }
      else {
        p.heading = (p.heading + angleDelta(p.heading, heading) * 0.18 + 360) % 360;
        p.pitch += (pitch - p.pitch) * 0.18;
        p.roll += (roll - p.roll) * 0.12;
      }
      setSensor('running');
    };
    handlerRef.current = handler as (e: DeviceOrientationEvent) => void;
    const evt = 'ondeviceorientationabsolute' in window && !iosLike ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evt, handler as EventListener, true);
    setTimeout(() => { if (!pose.current.has) setSensor((x) => (x === 'running' ? x : 'unavailable')); }, 3000);
  }
  function stop() {
    if (handlerRef.current) { window.removeEventListener('deviceorientation', handlerRef.current as EventListener, true); window.removeEventListener('deviceorientationabsolute', handlerRef.current as EventListener, true); }
    const v = videoRef.current; const st = v?.srcObject as MediaStream | null; st?.getTracks().forEach((t) => t.stop());
  }
  const requestPermission = async () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    try { const r = await DOE.requestPermission!(); if (r === 'granted') start(); else setSensor('denied'); } catch { setSensor('denied'); }
  };
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setCam(true); }
    } catch { setCam(false); }
  };

  // render loop at 30 fps
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 33); return () => clearInterval(id); }, []);
  useEffect(() => { localStorage.setItem('overhead.compassNudge', String(nudge)); }, [nudge]);

  const drag = useRef<{ x: number; y: number; h: number; p: number } | null>(null);
  const manualMode = sensor !== 'running';
  const onDown = (e: React.PointerEvent) => { if (!manualMode) return; drag.current = { x: e.clientX, y: e.clientY, h: manual.current.heading, p: manual.current.pitch }; };
  // drag the sky: pulling right turns the view left; pulling down brings higher sky into view
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; manual.current.heading = (d.h - (e.clientX - d.x) * 0.3 + 360) % 360; manual.current.pitch = Math.max(-10, Math.min(89, d.p + (e.clientY - d.y) * 0.3)); };
  const onUp = () => { drag.current = null; };

  const W = wrap.current?.clientWidth ?? 390, H = wrap.current?.clientHeight ?? 800;
  const view = manualMode ? { heading: manual.current.heading, pitch: manual.current.pitch, roll: 0 } : pose.current;
  const vfov = 62 * D2R;
  const f = (H / 2) / Math.tan(vfov / 2);
  const h = view.heading * D2R, p = view.pitch * D2R, r = view.roll * D2R;
  const fwd = { x: Math.sin(h) * Math.cos(p), y: Math.cos(h) * Math.cos(p), z: Math.sin(p) };
  let right = { x: Math.cos(h), y: -Math.sin(h), z: 0 };
  let up = { x: -Math.sin(h) * Math.sin(p), y: -Math.cos(h) * Math.sin(p), z: Math.cos(p) };
  if (r) { const cr = Math.cos(r), sr = Math.sin(r); const nr = { x: right.x * cr + up.x * sr, y: right.y * cr + up.y * sr, z: right.z * cr + up.z * sr }; up = { x: -right.x * sr + up.x * cr, y: -right.y * sr + up.y * cr, z: -right.z * sr + up.z * cr }; right = nr; }
  const project = (az: number, el: number) => {
    const d = { x: Math.cos(el) * Math.sin(az), y: Math.cos(el) * Math.cos(az), z: Math.sin(el) };
    const z = d.x * fwd.x + d.y * fwd.y + d.z * fwd.z;
    if (z <= 0.08) return null;
    const x = d.x * right.x + d.y * right.y + d.z * right.z, y = d.x * up.x + d.y * up.y + d.z * up.z;
    return { x: W / 2 + (x / z) * f, y: H / 2 - (y / z) * f };
  };

  const list = traffic.tick(Date.now());
  const items = list.map((tr) => {
    const dist = haversineM(s.home.lat, s.home.lon, tr.lat, tr.lon);
    const az = bearingDeg(s.home.lat, s.home.lon, tr.lat, tr.lon);
    const el = elevationDeg(tr.altM - s.groundElevM, dist);
    const pt = project(az * D2R, el * D2R);
    return { tr, az, el, pt, dist };
  }).filter((x) => x.pt && x.el > 2).sort((a, b) => b.el - a.el);
  const horizon = project(h, 0);
  const compass = Array.from({ length: 72 }, (_, i) => i * 5).map((deg) => ({ deg, pt: project(deg * D2R, Math.max(0.1, view.pitch * D2R - 0.35)) }));

  return (
    <div className="ar" ref={wrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="application" aria-label="Sky view">
      <video ref={videoRef} playsInline muted style={{ display: cam ? 'block' : 'none' }} />
      <svg viewBox={`0 0 ${W} ${H}`}>
        {horizon && <line x1={0} x2={W} y1={horizon.y} y2={horizon.y} stroke="var(--ink)" strokeOpacity="0.35" strokeWidth="0.75" strokeDasharray="6 4" transform={`rotate(${-view.roll} ${W / 2} ${horizon.y})`} />}
        <g fontSize="10" letterSpacing="0.14em" textAnchor="middle" style={{ fill: 'var(--ink)' }} fillOpacity="0.8">
          {compass.map(({ deg, pt }) => pt && pt.x > -20 && pt.x < W + 20 ? (
            <g key={deg}>
              <line x1={pt.x} x2={pt.x} y1={pt.y - (deg % 90 === 0 ? 10 : deg % 30 === 0 ? 6 : 3)} y2={pt.y} stroke="var(--ink)" strokeOpacity={deg % 30 === 0 ? 0.8 : 0.4} strokeWidth={deg % 90 === 0 ? 1 : 0.75} />
              {deg % 90 === 0 && <text x={pt.x} y={pt.y - 14} style={{ fill: deg === 0 ? 'var(--accent)' : 'var(--ink)' }}>{['N', 'E', 'S', 'W'][deg / 90]}</text>}
              {deg % 30 === 0 && deg % 90 !== 0 && <text x={pt.x} y={pt.y - 12} fontSize="8">{String(deg).padStart(3, '0')}</text>}
            </g>
          ) : null)}
        </g>
        {items.map(({ tr, el, pt, az }) => {
          const sel = tr.icao24 === s.selected;
          const size = sel ? 44 : 32;
          const rot = angleDelta(view.heading, tr.track);
          return (
            <g key={tr.icao24} onPointerDown={(e) => { e.stopPropagation(); s.select(tr.icao24); }} style={{ cursor: 'pointer' }} opacity={0.5 + 0.5 * tr.freshness}>
              <circle cx={pt!.x} cy={pt!.y} r={size * 0.78} fill="none" stroke={sel ? 'var(--accent)' : 'var(--ink)'} strokeOpacity={sel ? 0.9 : 0.35} strokeWidth="0.75" />
              <g transform={`translate(${pt!.x} ${pt!.y}) rotate(${rot}) scale(${size / 64}) translate(-32 -32)`} fill="var(--accent)" dangerouslySetInnerHTML={{ __html: iconMarkup(tr.a.category) }} />
              <g transform={`translate(${pt!.x - 73} ${pt!.y + size * 0.85})`}>
                <rect x="0" y="0" width="146" height="26" rx="2" fill="var(--plate)" stroke={sel ? 'var(--accent)' : 'var(--ink)'} strokeOpacity={sel ? 0.9 : 0.28} strokeWidth="0.75" />
                <text x="8" y="12" fontSize="12" fontWeight="600" letterSpacing="0.06em" style={{ fill: 'var(--ink)' }}>{displayCallsign(tr.a.callsign, tr.icao24)}</text>
                <text x="8" y="22.5" fontSize="10" letterSpacing="0.04em" fillOpacity="0.78" style={{ fill: 'var(--ink)' }}>{fmtAltitude(tr.altM)} · {Math.round(el)}° up · {Math.round(az)}°</text>
              </g>
            </g>
          );
        })}
        <text x="16" y={28 + 0} fontSize="11" letterSpacing="0.06em" style={{ fill: 'var(--ink)' }} fillOpacity="0.7">{manualMode ? 'DRAG TO LOOK AROUND' : `HDG ${String(Math.round(view.heading)).padStart(3, '0')}  ·  UP ${Math.round(view.pitch)}°`}</text>
      </svg>
      <button className="iconbtn" style={{ position: 'absolute', left: 12, top: 'calc(56px + var(--safe-top))' }} aria-label="Back to the map" onClick={() => { stop(); s.setPanel(null); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div className="ar-ui">
        {sensor === 'need-permission' && <div className="msg">Hold the phone up and point the back at the sky. iOS needs permission to read the compass.</div>}
        {sensor === 'denied' && <div className="msg">Motion permission denied. Drag to look around instead; aircraft are placed by true bearing and elevation.</div>}
        {sensor === 'unavailable' && <div className="msg">No orientation sensors here. Drag to look around; the layout is still true to bearing and elevation.</div>}
        {sensor === 'running' && !iosLike && declination == null && <div className="msg">Compass is magnetic and the declination lookup failed — if aircraft sit a few degrees off, nudge the heading.</div>}
        {sensor === 'running' && items.length === 0 && list.length > 0 && <div className="msg">Nothing in this part of the sky. Sweep around; {list.length} aircraft in range.</div>}
        <div className="btns">
          {sensor === 'need-permission' && <button className="btn small primary" onClick={requestPermission}>Enable compass</button>}
          {!cam && <button className="btn small" onClick={startCamera}>Use camera</button>}
          {sensor === 'running' && <><button className="btn small" onClick={() => setNudge((n) => n - 2)} aria-label="Nudge heading left">−2°</button><button className="btn small" onClick={() => setNudge(0)} title="Reset nudge">Nudge {nudge > 0 ? '+' : ''}{nudge}°</button><button className="btn small" onClick={() => setNudge((n) => n + 2)} aria-label="Nudge heading right">+2°</button></>}
        </div>
      </div>
    </div>
  );
}
