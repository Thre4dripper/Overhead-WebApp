import { cyclePitch, niceScale } from '../../lib/camera';
import { runtime } from '../../lib/runtime';
import { useApp } from '../../lib/store';

/** Scale bar and tilt indicator from the HUD asset. Tap the tilt arc to step through pitch presets. */
export function ScaleTilt() {
  const cam = useApp((s) => s.camera);
  const sc = niceScale(cam.metersPerPixel, 80);
  const barEnd = 8 + Math.min(112, Math.max(20, sc.px));
  const a = (cam.pitch * Math.PI) / 180;
  const nx = 34 + 26 * Math.cos(a), ny = 78 - 26 * Math.sin(a);
  return (
    <button className="hud-scale" aria-label={`Scale ${sc.label}. Tilt ${Math.round(cam.pitch)} degrees. Tap to change tilt`} onClick={() => runtime.map && cyclePitch(runtime.map)}>
      <svg viewBox="0 0 128 108" fill="none" stroke="currentColor">
        <g strokeWidth="1" strokeLinecap="square">
          <path d={`M8 26 L8 34 M8 30 L${barEnd} 30 M${barEnd} 26 L${barEnd} 34`} />
          <path d={`M${(8 + barEnd) / 2} 27.5 L${(8 + barEnd) / 2} 32.5`} strokeOpacity="0.5" />
        </g>
        <g stroke="none" fill="currentColor">
          <text x="8" y="20" fontSize="11" letterSpacing="0.06em">{sc.label}</text>
          <text x="8" y="52" fontSize="9" letterSpacing="0.18em" fillOpacity="0.7">SCALE</text>
          <text x="8" y="98" fontSize="9" letterSpacing="0.18em" fillOpacity="0.7">TILT</text>
          <text x="46" y="99" fontSize="15" letterSpacing="0.02em">{Math.round(cam.pitch)}°</text>
        </g>
        <g strokeWidth="1">
          <path d="M8 78 A 26 26 0 0 1 60 78" strokeOpacity="0.55" strokeWidth="0.75" />
          <path d="M8 78 L60 78" strokeOpacity="0.35" strokeWidth="0.75" />
          <path d={`M34 78 L${nx.toFixed(1)} ${ny.toFixed(1)}`} stroke="var(--hud-accent)" />
          <circle cx="34" cy="78" r="1.6" fill="currentColor" stroke="none" />
        </g>
      </svg>
    </button>
  );
}
