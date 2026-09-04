import { describe, expect, it } from 'vitest';
import {
  LINEAR_CEILING_M, LOG_SCALE_M, feetToMeters, flightLevel, formatFeet, rulerFraction, rulerTicks, trueHeight,
  visualAltitudeMsl, visualHeight,
} from './index';

describe('visualHeight', () => {
  it('is strictly monotonic across 0–20 000 m at 1 m resolution', () => {
    let prev = visualHeight(0);
    for (let h = 1; h <= 20000; h += 1) {
      const v = visualHeight(h);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('is exactly true-to-scale in the linear zone', () => {
    for (const h of [0, 12.5, 150, 600, 999.99, LINEAR_CEILING_M]) expect(visualHeight(h)).toBe(h);
  });

  it('never renders a higher aircraft below a lower one (random pairs)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 20000;
    for (let i = 0; i < 5000; i++) {
      const a = rnd(); const b = rnd();
      if (a === b) continue;
      expect(Math.sign(visualHeight(a) - visualHeight(b))).toBe(Math.sign(a - b));
    }
  });

  it('is C¹-continuous at the join (slope 1 on both sides)', () => {
    const eps = 1e-3;
    const below = (visualHeight(LINEAR_CEILING_M) - visualHeight(LINEAR_CEILING_M - eps)) / eps;
    const above = (visualHeight(LINEAR_CEILING_M + eps) - visualHeight(LINEAR_CEILING_M)) / eps;
    expect(below).toBeCloseTo(1, 4);
    expect(above).toBeCloseTo(1, 4);
  });

  it('compresses cruise to a comfortable height above a 150 m skyline, not the top of the frustum', () => {
    const fl370 = visualHeight(feetToMeters(37000));
    expect(fl370).toBeGreaterThan(150 * 8);
    expect(fl370).toBeLessThan(1800);
    expect(visualHeight(20000)).toBeLessThan(1800);
  });

  it('is latitude-independent by design', () => {
    expect(visualHeight(5000, 0)).toBe(visualHeight(5000, 60));
  });

  it('rejects non-finite input rather than burying an aircraft in the ground', () => {
    expect(() => visualHeight(Number.NaN)).toThrow(RangeError);
    expect(() => visualHeight(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('trueHeight (inverse)', () => {
  it('round-trips across the full range', () => {
    for (let h = -50; h <= 20000; h += 37) expect(trueHeight(visualHeight(h))).toBeCloseTo(h, 6);
  });
  it('uses the documented constants', () => {
    expect(trueHeight(LINEAR_CEILING_M + LOG_SCALE_M)).toBeCloseTo(LINEAR_CEILING_M + LOG_SCALE_M * (Math.E - 1), 6);
  });
});

describe('visualAltitudeMsl', () => {
  it('compresses height above the reference ground and adds the ground back', () => {
    expect(visualAltitudeMsl(1600 + 300, 1600)).toBe(1900);
    expect(visualAltitudeMsl(1600 + 5000, 1600)).toBeCloseTo(1600 + visualHeight(5000), 9);
  });
});

describe('ruler', () => {
  it('positions ticks through the same function as the scene (M6 acceptance)', () => {
    const ticks = rulerTicks(45000);
    const top = visualHeight(feetToMeters(45000));
    for (const t of ticks) {
      expect(t.fraction).toBeCloseTo(visualHeight(feetToMeters(t.feet)) / top, 12);
      expect(t.fraction).toBeCloseTo(rulerFraction(feetToMeters(t.feet), 45000), 12);
    }
  });
  it('gridlines bunch up with height: spacing per 10 000 ft shrinks monotonically', () => {
    const top = visualHeight(feetToMeters(45000));
    const step = (lo: number) => (visualHeight(feetToMeters(lo + 10000)) - visualHeight(feetToMeters(lo))) / top;
    expect(step(0)).toBeGreaterThan(step(10000));
    expect(step(10000)).toBeGreaterThan(step(20000));
    expect(step(20000)).toBeGreaterThan(step(30000));
  });
  it('is sorted and bounded', () => {
    const ticks = rulerTicks();
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.feet).toBeGreaterThan(ticks[i - 1]!.feet);
    for (const t of ticks) { expect(t.fraction).toBeGreaterThanOrEqual(0); expect(t.fraction).toBeLessThanOrEqual(1); }
    expect(ticks[0]!.label).toBe('GND');
  });
});

describe('formatting', () => {
  it('formats feet with thin-space grouping like the HUD asset', () => {
    expect(formatFeet(38000)).toBe('38 000');
    expect(formatFeet(2600)).toBe('2 600');
    expect(formatFeet(500)).toBe('500');
  });
  it('formats flight levels', () => {
    expect(flightLevel(37000)).toBe('FL370');
    expect(flightLevel(4500)).toBe('FL045');
  });
});
