import { displayCallsign, fmtAltitude, haversineM, trendArrow } from '@overhead/shared';
import { useEffect, useRef, useState } from 'react';
import { iconMarkup } from '../lib/icons';
import { useApp } from '../lib/store';
import { traffic, type Tracked } from '../lib/traffic';

/**
 * No-WebGL mode: a plain sectional-style chart drawn in SVG. Range rings, a north arrow, the
 * observer, and every aircraft as a flat silhouette with its callsign and TRUE altitude.
 * Drag to pan, wheel or pinch to zoom, tap an aircraft to select it. A real supported mode, not an error page.
 */
export function ChartView() {
  const ref = useRef<HTMLDivElement>(null);
  const home = useApp((s) => s.home);
  const selected = useApp((s) => s.selected);
  const select = useApp((s) => s.select);
  const [size, setSize] = useState({ w: 390, h: 800 });
  const [view, setView] = useState({ cx: 0, cy: 0, mpp: 40 }); // metres per px
  const [list, setList] = useState<Tracked[]>([]);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let raf = 0;
    const loop = () => { setList(traffic.tick(Date.now())); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  const toPx = (lat: number, lon: number) => {
    const dx = (lon - home.lon) * 111320 * cosLat, dy = (lat - home.lat) * 110574;
    return { x: size.w / 2 + (dx - view.cx) / view.mpp, y: size.h / 2 - (dy - view.cy) / view.mpp };
  };
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * v.mpp, cy: d.cy + (e.clientY - d.y) * v.mpp })); };
  const onUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => setView((v) => ({ ...v, mpp: Math.min(400, Math.max(4, v.mpp * (e.deltaY > 0 ? 1.15 : 0.87))) }));

  const rings = [2000, 5000, 10000, 20000, 40000].filter((r) => r / view.mpp < Math.max(size.w, size.h));
  const o = toPx(home.lat, home.lon);
  return (
    <div className="chart" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
      <svg viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Chart of aircraft around you">
        <defs><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="var(--ink)" strokeOpacity="0.07" strokeWidth="0.6" /></pattern></defs>
        <rect width={size.w} height={size.h} fill="url(#grid)" />
        <g fill="none" stroke="var(--ink)">
          {rings.map((r) => (
            <g key={r}>
              <circle cx={o.x} cy={o.y} r={r / view.mpp} strokeOpacity="0.28" strokeWidth="0.75" strokeDasharray={r >= 10000 ? '4 4' : undefined} />
              <text x={o.x + 4} y={o.y - r / view.mpp - 4} fontSize="10" letterSpacing="0.08em" stroke="none" fillOpacity="0.6" style={{ fill: 'var(--ink)' }}>{r / 1000} KM</text>
            </g>
          ))}
          <path d={`M${o.x} ${o.y - 60} L${o.x} ${o.y + 60} M${o.x - 60} ${o.y} L${o.x + 60} ${o.y}`} strokeOpacity="0.35" strokeWidth="0.75" />
          <circle cx={o.x} cy={o.y} r="3.5" style={{ fill: 'var(--blue)' }} stroke="none" />
        </g>
        <g>
          <path d={`M${size.w - 40} 40 L${size.w - 46} 58 L${size.w - 34} 58 Z`} fill="var(--accent)" />
          <text x={size.w - 40} y="74" fontSize="10" letterSpacing="0.14em" textAnchor="middle" style={{ fill: 'var(--ink)' }}>N</text>
        </g>
        {list.map((tr) => {
          const p = toPx(tr.lat, tr.lon);
          if (p.x < -60 || p.x > size.w + 60 || p.y < -60 || p.y > size.h + 60) return null;
          const sel = tr.icao24 === selected;
          const distKm = haversineM(home.lat, home.lon, tr.lat, tr.lon) / 1000;
          return (
            <g key={tr.icao24} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); select(tr.icao24); }} opacity={0.4 + 0.6 * tr.freshness}>
              <g transform={`translate(${p.x} ${p.y}) rotate(${tr.track}) scale(${sel ? 0.55 : 0.42}) translate(-32 -32)`} fill="var(--accent)" dangerouslySetInnerHTML={{ __html: iconMarkup(tr.a.category) }} />
              <g transform={`translate(${p.x - 9} ${p.y - 39})`}>
                <path d="M9 36.6 L9 26 L26 26" stroke="var(--ink)" strokeOpacity="0.7" strokeWidth="0.75" fill="none" />
                <rect x="26" y="6" width="146" height="26" rx="2" fill="var(--plate)" stroke={sel ? 'var(--accent)' : 'var(--ink)'} strokeOpacity={sel ? 0.9 : 0.28} strokeWidth="0.75" />
                <text x="34" y="18" fontSize="12" fontWeight="600" letterSpacing="0.06em" style={{ fill: sel ? 'var(--accent)' : 'var(--ink)' }}>{displayCallsign(tr.a.callsign, tr.icao24)}</text>
                <text x="34" y="28.5" fontSize="10" letterSpacing="0.04em" fillOpacity="0.78" style={{ fill: 'var(--ink)' }}>{fmtAltitude(tr.altM)}  ·  {distKm.toFixed(0)} km</text>
                <text x="163" y="28.5" fontSize="10" textAnchor="end" style={{ fill: 'var(--accent)' }}>{trendArrow(tr.a.verticalRateMps)}</text>
              </g>
            </g>
          );
        })}
        <text x="16" y={size.h - 16} fontSize="10" letterSpacing="0.06em" fillOpacity="0.55" style={{ fill: 'var(--ink)' }}>CHART MODE — WebGL unavailable. Flat positions, true altitudes.</text>
      </svg>
    </div>
  );
}
