import { useMemo } from 'react';
import { resetNorth } from '../../lib/camera';
import { runtime } from '../../lib/runtime';
import { useApp } from '../../lib/store';

/** Compass dial rotates by minus the map bearing; tap resets to north. Geometry from the HUD asset. */
export function Compass() {
  const bearing = useApp((s) => s.camera.bearing);
  const ticks = useMemo(() => {
    const out: { d: string; major: boolean }[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i * 10 * Math.PI) / 180;
      const major = i % 9 === 0;
      const r0 = major ? 20 : 23.6, r1 = 27;
      out.push({ d: `M${(38 + Math.sin(a) * r0).toFixed(2)} ${(38 - Math.cos(a) * r0).toFixed(2)} L${(38 + Math.sin(a) * r1).toFixed(2)} ${(38 - Math.cos(a) * r1).toFixed(2)}`, major });
    }
    return out;
  }, []);
  return (
    <button className="hud-compass" aria-label={`Compass, bearing ${Math.round(bearing)} degrees. Tap to reset to north`} onClick={() => runtime.map && resetNorth(runtime.map)}>
      <svg viewBox="0 0 76 76" fill="none" stroke="currentColor">
        <circle cx="38" cy="38" r="27" strokeWidth="1" strokeOpacity="0.75" />
        <g style={{ transform: `rotate(${-bearing}deg)`, transformOrigin: '38px 38px', transition: 'transform 80ms linear' }}>
          {ticks.map((t, i) => <path key={i} d={t.d} strokeWidth={t.major ? 1 : 0.75} strokeOpacity={t.major ? 1 : 0.5} />)}
          <path d="M38 12 L33.4 21 L42.6 21 Z" fill="var(--hud-accent)" stroke="none" />
          <text x="38" y="31" fontSize="9" letterSpacing="0.14em" textAnchor="middle" fill="currentColor" stroke="none">N</text>
        </g>
        <path d="M38 33 L38 43" strokeWidth="0.75" strokeOpacity="0.45" />
        <path d="M33 38 L43 38" strokeWidth="0.75" strokeOpacity="0.45" />
      </svg>
    </button>
  );
}
