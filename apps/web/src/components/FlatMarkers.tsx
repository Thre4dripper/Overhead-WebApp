import { useEffect, useRef } from 'react';
import type { Projected } from '../lib/aircraftLayer';
import { metersPerPixel } from '../lib/camera';
import { iconMarkup } from '../lib/icons';
import { runtime } from '../lib/runtime';
import { useApp } from '../lib/store';
import { traffic } from '../lib/traffic';

/**
 * 2D fallback for low zoom and low-end devices: flat silhouettes on the flat map, rotated to
 * track, positioned with map.project every frame. Publishes the same `Projected` list the HUD
 * labels consume, so labels and picking work identically in both modes.
 */
export function FlatMarkers() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current!;
    const pool = new Map<string, { el: HTMLDivElement; svg: SVGSVGElement; cat: string }>();
    let raf = 0;
    const loop = () => {
      const map = runtime.map;
      if (map) {
        const now = Date.now();
        const list = traffic.tick(now);
        const sel = useApp.getState().selected;
        const W = root.clientWidth, H = root.clientHeight;
        const mpp = metersPerPixel(map);
        const out: Projected[] = [];
        const seen = new Set<string>();
        for (const tr of list) {
          const p = map.project([tr.lon, tr.lat]);
          const visible = p.x > -40 && p.x < W + 40 && p.y > -40 && p.y < H + 40;
          out.push({ icao24: tr.icao24, x: p.x, y: p.y, visible, pxPerM: 1 / mpp, lengthPx: 26, distanceM: 0, visualM: tr.altM, tracked: tr });
          if (!visible) continue;
          seen.add(tr.icao24);
          let e = pool.get(tr.icao24);
          if (!e || e.cat !== tr.a.category) {
            e?.el.remove();
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;color:var(--accent);will-change:transform;pointer-events:none;transition:opacity 300ms';
            el.innerHTML = `<svg viewBox="0 0 64 64" width="26" height="26" fill="currentColor">${iconMarkup(tr.a.category)}</svg>`;
            root.appendChild(el);
            e = { el, svg: el.firstElementChild as SVGSVGElement, cat: tr.a.category };
            pool.set(tr.icao24, e);
          }
          const size = tr.icao24 === sel ? 34 : 26;
          e.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${tr.track.toFixed(1)}deg) scale(${(size / 26).toFixed(2)})`;
          e.el.style.opacity = String(0.35 + 0.65 * tr.freshness);
          e.el.style.filter = tr.icao24 === sel ? 'drop-shadow(0 0 0.5px var(--ink))' : '';
        }
        for (const [k, e] of pool) if (!seen.has(k)) { e.el.remove(); pool.delete(k); }
        runtime.projected = out;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); root.replaceChildren(); runtime.projected = []; };
  }, []);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden />;
}
