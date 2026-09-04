import { displayCallsign, fmtAltitude, trendArrow } from '@overhead/shared';
import { useEffect, useRef } from 'react';
import { runtime } from '../../lib/runtime';
import { useApp } from '../../lib/store';

interface Entry { el: HTMLDivElement; cs: SVGTextElement; alt: SVGTextElement; tr: SVGTextElement; lastText: number; lastSeen: number; key: string }

type Side = 'right' | 'left';
type Vert = 'above' | 'below';
// Plate to the right of the anchor dot (asset geometry), mirrored left near the right edge, and dropped
// below the dot for aircraft near the top edge (cruise traffic sits in the sky band).
function template(side: Side, vert: Vert): string {
  const dotX = side === 'right' ? 9 : 167, plateX = side === 'right' ? 26 : 4, textX = plateX + 8, trendX = plateX + 137, elbowX = side === 'right' ? 26 : 150;
  const dotY = vert === 'above' ? 39 : 9, plateY = vert === 'above' ? 6 : 22, leadY = vert === 'above' ? 26 : 22;
  const leader = vert === 'above' ? `M${dotX} ${dotY - 2.4} L${dotX} ${leadY} L${elbowX} ${leadY}` : `M${dotX} ${dotY + 2.4} L${dotX} ${leadY} L${elbowX} ${leadY}`;
  return `<svg viewBox="0 0 176 48" fill="none"><circle class="dot" cx="${dotX}" cy="${dotY}" r="2.4"/><path class="leader" d="${leader}"/><rect class="plate" x="${plateX}" y="${plateY}" width="146" height="26" rx="2"/><text class="cs" x="${textX}" y="${plateY + 12}"></text><text class="alt" x="${textX}" y="${plateY + 22.5}"></text><text class="trend" x="${trendX}" y="${plateY + 22.5}" text-anchor="end"></text><path class="rule" d="M${textX} ${plateY + 15.4} L${textX + 58} ${plateY + 15.4}"/></svg>`;
}
const intersects = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);

/**
 * Callsign + TRUE altitude plates anchored to each aircraft's projected screen point. Positions are
 * written imperatively every frame (React would be far too slow); text refreshes at 4 Hz. A greedy
 * pass hides plates that would overlap, keeping the selected aircraft and the largest silhouettes.
 */
export function AircraftLabels() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current!;
    const pool = new Map<string, Entry>();
    let raf = 0;
    // Plates must not cover the HUD furniture. Measuring the real elements keeps this correct when the
    // layout changes (phone stack vs desktop columns) instead of duplicating their positions here.
    const HUD_SELECTOR = '.hud-compass, .hud-topright, .hud-tape, .hud-data, .hud-status, .hud-ruler, .hud-scale, .hud-attrib, .sheet, .detail';
    let reserved: { x0: number; y0: number; x1: number; y1: number }[] = [];
    let reservedAt = 0;
    const measureReserved = () => {
      const base = root.getBoundingClientRect();
      reserved = [...document.querySelectorAll(HUD_SELECTOR)].map((el) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left - base.left - 4, y0: r.top - base.top - 4, x1: r.right - base.left + 4, y1: r.bottom - base.top + 4 };
      });
    };
    const loop = () => {
      const now = performance.now();
      const list = runtime.projected;
      const sel = useApp.getState().selected;
      const W = root.clientWidth, H = root.clientHeight;
      const max = runtime.lowEnd ? 6 : 10;
      const cand = list
        .filter((p) => p.visible && p.x > -10 && p.x < W + 10 && p.y > 2 && p.y < H - 40)
        .sort((a, b) => (a.icao24 === sel ? -1 : b.icao24 === sel ? 1 : 0) || b.lengthPx - a.lengthPx);
      const wide = W >= 900;
      if (now - reservedAt > 500) { measureReserved(); reservedAt = now; }
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const shown = new Set<string>();
      for (const p of cand) {
        if (shown.size >= max && p.icao24 !== sel) break;
        // plate right of the dot and above it by default; try the other orientations when that would
        // run into the ruler, the compass, the buttons, the sheet, the edge, or another plate
        const rulerX = wide ? W - 480 : W - 108;
        const preferSide: Side = p.x + 17 + 146 > rulerX ? 'left' : 'right';
        const preferVert: Vert = p.y - 33 < 8 ? 'below' : 'above';
        const options: [Side, Vert][] = [[preferSide, preferVert], [preferSide, preferVert === 'above' ? 'below' : 'above'], [preferSide === 'right' ? 'left' : 'right', preferVert], [preferSide === 'right' ? 'left' : 'right', preferVert === 'above' ? 'below' : 'above']];
        let chosen: { side: Side; vert: Vert; rect: { x0: number; y0: number; x1: number; y1: number } } | null = null;
        for (const [side, vert] of options) {
          const x0 = side === 'right' ? p.x + 17 : p.x - 17 - 146, y0 = vert === 'above' ? p.y - 33 : p.y + 13;
          const rect = { x0, y0, x1: x0 + 146, y1: y0 + 26 };
          if (rect.x0 < 2 || rect.x1 > W - 2 || rect.y0 < 2 || rect.y1 > H - 2) continue;
          if (reserved.some((r) => intersects(rect, r))) continue;
          if (p.icao24 !== sel && placed.some((r) => intersects(rect, r))) continue;
          chosen = { side, vert, rect }; break;
        }
        if (!chosen) continue;
        const { side, vert, rect } = chosen;
        const key = side + vert;
        placed.push(rect);
        shown.add(p.icao24);
        let e = pool.get(p.icao24);
        if (!e) {
          const el = document.createElement('div');
          el.className = 'label';
          el.innerHTML = template(side, vert);
          root.appendChild(el);
          e = { el, cs: el.querySelector('.cs')!, alt: el.querySelector('.alt')!, tr: el.querySelector('.trend')!, lastText: 0, lastSeen: now, key };
          pool.set(p.icao24, e);
        } else if (e.key !== key) {
          e.el.innerHTML = template(side, vert);
          e.cs = e.el.querySelector('.cs')!; e.alt = e.el.querySelector('.alt')!; e.tr = e.el.querySelector('.trend')!; e.key = key; e.lastText = 0;
        }
        e.el.style.transform = `translate(${(side === 'right' ? p.x - 9 : p.x - 167).toFixed(1)}px, ${(vert === 'above' ? p.y - 39 : p.y - 9).toFixed(1)}px)`;
        e.el.classList.toggle('selected', p.icao24 === sel);
        if (!e.el.classList.contains('on')) e.el.classList.add('on');
        if (now - e.lastText > 250) {
          const t = p.tracked;
          e.cs.textContent = displayCallsign(t.a.callsign, t.icao24);
          e.alt.textContent = fmtAltitude(t.altM);
          e.tr.textContent = trendArrow(t.a.verticalRateMps);
          e.lastText = now;
        }
        e.lastSeen = now;
      }
      for (const [k, e] of pool) {
        if (shown.has(k)) continue;
        e.el.classList.remove('on');
        if (now - e.lastSeen > 1500) { e.el.remove(); pool.delete(k); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); root.replaceChildren(); };
  }, []);
  return <div className="labels" ref={ref} aria-hidden />;
}
