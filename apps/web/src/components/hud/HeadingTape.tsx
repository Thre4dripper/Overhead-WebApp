import { useEffect, useRef, useState } from 'react';
import { angleDelta } from '@overhead/shared';
import { sunPosition } from '../../lib/solar';
import { useApp } from '../../lib/store';

const CARDINAL: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/**
 * Heading tape along the top: ±60° around the camera bearing, hairline ticks every 5°, cardinal
 * letters, the sun's azimuth, and a magenta tick for every tracked aircraft's bearing from you —
 * so traffic behind the camera still shows where it is. Tap-free; the compass does reset-to-north.
 */
export function HeadingTape() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const bearing = useApp((s) => s.camera.bearing);
  const overhead = useApp((s) => s.overhead);
  const selected = useApp((s) => s.selected);
  const home = useApp((s) => s.home);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 40, span = 120, pxPerDeg = w / span, cx = w / 2, base = 26;
  const xFor = (deg: number) => cx + angleDelta(bearing, deg) * pxPerDeg;
  const ticks: { deg: number; x: number; major: boolean; label?: string }[] = [];
  for (let d = 0; d < 360; d += 5) {
    const x = xFor(d);
    if (x < -8 || x > w + 8) continue;
    ticks.push({ deg: d, x, major: d % 45 === 0, label: d % 45 === 0 ? CARDINAL[d] : d % 15 === 0 ? String(d).padStart(3, '0') : undefined });
  }
  const sun = sunPosition(home.lat, home.lon);
  const sunX = sun.elevation > -6 ? xFor(sun.azimuth) : null;
  const hdg = ((Math.round(bearing) % 360) + 360) % 360;
  return (
    <div className="hud-tape" ref={ref} aria-label={`Camera heading ${hdg} degrees`}>
      <svg viewBox={`0 0 ${w} ${H}`} fill="none" stroke="currentColor">
        <path d={`M0 ${base} L${w} ${base}`} strokeWidth="0.75" strokeOpacity="0.5" />
        {ticks.map((t) => (
          <g key={t.deg}>
            <path d={`M${t.x.toFixed(1)} ${base} v${t.major ? -9 : t.label ? -6 : -3.5}`} strokeWidth={t.major ? 1 : 0.75} strokeOpacity={t.major ? 1 : 0.55} />
            {t.label && <text x={t.x.toFixed(1)} y={base - 12} fontSize={t.major ? 10 : 8} letterSpacing="0.12em" textAnchor="middle" stroke="none" fillOpacity={t.major ? 1 : 0.6} style={{ fill: t.deg === 0 ? 'var(--hud-accent)' : undefined }}>{t.label}</text>}
          </g>
        ))}
        {sunX != null && sunX > 4 && sunX < w - 4 && (
          <g stroke="none" fill="#e0a640" transform={`translate(${sunX.toFixed(1)} ${base + 7})`}>
            <circle r="3" /><circle r="5.5" fill="none" stroke="#e0a640" strokeWidth="0.75" strokeOpacity="0.6" />
          </g>
        )}
        {overhead.map((e) => {
          const x = xFor(e.bearingDeg);
          if (x < 2 || x > w - 2) return null;
          const sel = e.icao24 === selected;
          return <path key={e.icao24} d={`M${x.toFixed(1)} ${base + 2} l${sel ? 4 : 2.6} ${sel ? 7 : 4.5} h${sel ? -8 : -5.2} z`} fill="var(--hud-accent)" fillOpacity={sel ? 1 : 0.35 + 0.45 * Math.min(1, e.elevationDeg / 60)} stroke="none" />;
        })}
        <path d={`M${cx} ${base - 1} l-4 -6 h8 z`} fill="currentColor" stroke="none" />
        <text x={cx} y={H - 1} fontSize="11" letterSpacing="0.06em" textAnchor="middle" stroke="none" fontWeight="600">{String(hdg).padStart(3, '0')}°</text>
      </svg>
    </div>
  );
}
