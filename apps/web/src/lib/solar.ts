/** Sun elevation in degrees (NOAA low-precision algorithm; ±0.5° is plenty for choosing a theme). */
export function sunPosition(lat: number, lon: number, date = new Date()): { elevation: number; azimuth: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = ((gmst + lon / 15) % 24 + 24) % 24;
  const ha = (lst * 15) * rad - ra;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat * rad) - Math.tan(dec) * Math.cos(lat * rad)) / rad + 180;
  return { elevation: el / rad, azimuth: ((az % 360) + 360) % 360 };
}

export function sunElevationDeg(lat: number, lon: number, date = new Date()): number {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = ((gmst + lon / 15) % 24 + 24) % 24;
  const ha = (lst * 15) * rad - ra;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return el / rad;
}

export type Theme = 'day' | 'golden' | 'night';
export type ThemeChoice = Theme | 'auto';

export function themeForSun(elevationDeg: number): Theme {
  if (elevationDeg > 9) return 'day';
  if (elevationDeg > -5) return 'golden';
  return 'night';
}

/** Today's sunrise and sunset (local Date objects) by scanning the day in 2-minute steps; null in polar day/night. */
export function sunTimes(lat: number, lon: number, date = new Date()): { sunrise: Date | null; sunset: Date | null } {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  let prev = sunElevationDeg(lat, lon, start);
  let sunrise: Date | null = null, sunset: Date | null = null;
  for (let m = 2; m <= 24 * 60; m += 2) {
    const t = new Date(start.getTime() + m * 60000);
    const el = sunElevationDeg(lat, lon, t);
    if (prev < -0.833 && el >= -0.833 && !sunrise) sunrise = t;
    if (prev >= -0.833 && el < -0.833 && !sunset) sunset = t;
    prev = el;
  }
  return { sunrise, sunset };
}
