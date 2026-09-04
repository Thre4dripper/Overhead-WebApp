/**
 * The one altitude-compression function in the codebase.
 *
 * Every consumer — the three.js aircraft layer, the altitude ruler, tap-target picking, trails —
 * calls `visualHeight`. Nothing else may apply its own fudge factor.
 *
 * Shape: exactly true-to-scale (slope 1) up to LINEAR_CEILING_M, then a log curve
 *   v(h) = H0 + A · ln(1 + (h − H0) / A)
 * The derivative of the log branch at h = H0 is A / A = 1, so the join is C¹-continuous:
 * an aircraft descending through 1 000 m does not visibly kink.
 *
 * With A = 150 m the whole 0–20 000 m range folds into roughly 0–1 730 m of visual height:
 *   FL200 (6 096 m)  → ~1 530 m visual
 *   FL370 (11 278 m) → ~1 640 m visual   (≈ 11 × a 150 m skyline, inside the home frame at pitch 70)
 *   20 000 m         → ~1 730 m visual
 *
 * Latitude is accepted for signature stability but does not affect the result: the mapping is in
 * metres, and the Mercator scale correction (which *does* vary with latitude) is applied once by
 * the renderer through MapLibre's `meterInMercatorCoordinateUnits()`. See docs/decisions.md.
 */

export const LINEAR_CEILING_M = 1000;
export const LOG_SCALE_M = 150;

/** Compressed render height in metres for a true height in metres. Monotonic, C¹, invertible. */
export function visualHeight(heightMeters: number, _latitude?: number): number {
  if (!Number.isFinite(heightMeters)) {
    throw new RangeError(`visualHeight: height must be finite, got ${heightMeters}`);
  }
  if (heightMeters <= LINEAR_CEILING_M) return heightMeters;
  return LINEAR_CEILING_M + LOG_SCALE_M * Math.log1p((heightMeters - LINEAR_CEILING_M) / LOG_SCALE_M);
}

/** Inverse of visualHeight: true height in metres for a compressed visual height. */
export function trueHeight(visualMeters: number): number {
  if (!Number.isFinite(visualMeters)) {
    throw new RangeError(`trueHeight: visual height must be finite, got ${visualMeters}`);
  }
  if (visualMeters <= LINEAR_CEILING_M) return visualMeters;
  return LINEAR_CEILING_M + LOG_SCALE_M * Math.expm1((visualMeters - LINEAR_CEILING_M) / LOG_SCALE_M);
}

/**
 * Where the scene's ground is not at sea level, compress the height *above the scene's reference
 * ground* and add the ground back, so rooftop traffic in Denver reads like rooftop traffic in
 * Amsterdam. Barometric altitude is MSL; `referenceGroundM` is the terrain elevation at the map
 * centre. Decision recorded in docs/decisions.md (MSL vs AGL).
 */
export function visualAltitudeMsl(altitudeMslM: number, referenceGroundM: number, latitude?: number): number {
  return referenceGroundM + visualHeight(altitudeMslM - referenceGroundM, latitude);
}

export const FEET_PER_METER = 3.280839895;
export const feetToMeters = (ft: number): number => ft / FEET_PER_METER;
export const metersToFeet = (m: number): number => m * FEET_PER_METER;

/** Ruler tick set, in feet MSL, matching the HUD asset. Major ticks carry labels. */
export const RULER_MAJOR_FT: readonly number[] = [0, 500, 1000, 2000, 5000, 10000, 20000, 30000, 40000];
export const RULER_MINOR_FT: readonly number[] = [250, 750, 1500, 3000, 4000, 7500, 15000, 25000, 35000, 45000];
export const RULER_TOP_FT = 45000;

export interface RulerTick {
  feet: number;
  /** 0 at ground, 1 at the ruler top — derived from visualHeight so the ruler and the scene agree. */
  fraction: number;
  major: boolean;
  label: string;
}

/**
 * Tick positions along a ruler whose top is `topFt`. Positions come from the same
 * `visualHeight` the scene uses, so gridlines bunch exactly where aircraft bunch.
 * `groundM` shifts the whole scale when terrain puts the ground above sea level.
 */
export function rulerTicks(topFt: number = RULER_TOP_FT, groundM = 0): RulerTick[] {
  const top = visualHeight(feetToMeters(topFt) - groundM);
  const mk = (feet: number, major: boolean): RulerTick => {
    const v = visualHeight(Math.max(0, feetToMeters(feet) - groundM));
    return { feet, fraction: Math.min(1, Math.max(0, v / top)), major, label: feet === 0 ? 'GND' : formatFeet(feet) };
  };
  return [...RULER_MAJOR_FT.map((f) => mk(f, true)), ...RULER_MINOR_FT.filter((f) => f <= topFt).map((f) => mk(f, false))]
    .sort((a, b) => a.feet - b.feet);
}

/** Fraction along the ruler (0..1) of a true MSL altitude — the same mapping as `rulerTicks`. */
export function rulerFraction(altitudeMslM: number, topFt: number = RULER_TOP_FT, groundM = 0): number {
  const top = visualHeight(feetToMeters(topFt) - groundM);
  const v = visualHeight(Math.max(0, altitudeMslM - groundM));
  return Math.min(1, Math.max(0, v / top));
}

/** "38 000" — thin-space thousands grouping, as the HUD asset draws it. */
export function formatFeet(feet: number): string {
  const n = Math.round(feet);
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

/** Flight level from feet: FL370 for 37 000 ft. Only meaningful above the transition altitude. */
export function flightLevel(feet: number): string {
  return `FL${String(Math.round(feet / 100)).padStart(3, '0')}`;
}
