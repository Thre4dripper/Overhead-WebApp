import { RULER_TOP_FT, metersToFeet, rulerFraction, rulerTicks } from '@overhead/altitude';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/store';
import { traffic } from '../../lib/traffic';

/**
 * The visible altitude ruler. Tick positions come from `rulerTicks`, i.e. the same `visualHeight`
 * that places the aircraft, so the gridlines bunch exactly where the traffic bunches. Small marks
 * show every tracked aircraft's TRUE altitude on the same scale; the selected one is labelled.
 */
export function AltitudeRuler() {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  const groundM = useApp((s) => s.groundElevM);
  const selected = useApp((s) => s.selected);
  const eyeAltM = useApp((s) => s.camera.eyeAltM);
  const [marks, setMarks] = useState<{ icao24: string; altM: number }[]>([]);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const id = setInterval(() => setMarks(traffic.all().map((t) => ({ icao24: t.icao24, altM: t.altM }))), 500);
    return () => clearInterval(id);
  }, []);

  const yTop = 14, yGround = h - 14;
  const band = yGround - yTop;
  const yFor = (fraction: number) => yGround - fraction * band;
  const ticks = rulerTicks(RULER_TOP_FT, groundM);
  const sel = marks.find((m) => m.icao24 === selected);

  return (
    <div className="hud-ruler" ref={ref} aria-hidden>
      <svg viewBox={`0 0 96 ${h}`} width="96" height={h} fill="none" stroke="currentColor">
        <g strokeWidth="1" strokeLinecap="square">
          <path d={`M78 ${yTop} L78 ${yGround + 6}`} />
          {ticks.filter((t) => t.major).map((t) => <path key={t.feet} d={`M64 ${yFor(t.fraction).toFixed(2)} L78 ${yFor(t.fraction).toFixed(2)}`} />)}
        </g>
        <g strokeWidth="0.75" strokeOpacity="0.55" strokeLinecap="square">
          {ticks.filter((t) => !t.major).map((t) => <path key={t.feet} d={`M71 ${yFor(t.fraction).toFixed(2)} L78 ${yFor(t.fraction).toFixed(2)}`} />)}
        </g>
        <g stroke="none" fontSize="11" letterSpacing="0.06em" textAnchor="end">
          {ticks.filter((t) => t.major).map((t) => <text key={t.feet} x="59" y={(yFor(t.fraction) + 3.8).toFixed(2)}>{t.label}</text>)}
        </g>
        <g stroke="none" fontSize="9" letterSpacing="0.18em" textAnchor="end" fillOpacity="0.7">
          <text x="78" y="8">FEET MSL</text>
        </g>
        <g stroke="none" fill="var(--hud-accent)">
          {marks.map((m) => (
            <circle key={m.icao24} cx="83" cy={yFor(rulerFraction(m.altM, RULER_TOP_FT, groundM)).toFixed(2)} r={m.icao24 === selected ? 2.6 : 1.5} fillOpacity={m.icao24 === selected ? 1 : 0.5} />
          ))}
        </g>
        {eyeAltM > 0 && (
          <g stroke="none" fill="var(--blue)" fillOpacity="0.85">
            <path d={`M79 ${yFor(rulerFraction(eyeAltM, RULER_TOP_FT, groundM)).toFixed(2)} l6 -3.5 v7 z`} />
            <text x="88" y={(yFor(rulerFraction(eyeAltM, RULER_TOP_FT, groundM)) + 3).toFixed(2)} fontSize="7" letterSpacing="0.14em">EYE</text>
          </g>
        )}
        {sel && (
          <g stroke="none" fill="var(--hud-accent)" fontSize="10" letterSpacing="0.04em" textAnchor="end">
            <text x="59" y={(yFor(rulerFraction(sel.altM, RULER_TOP_FT, groundM)) - 5).toFixed(2)}>{Math.round(metersToFeet(sel.altM)).toLocaleString('en-US').replace(/,/g, ' ')}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
