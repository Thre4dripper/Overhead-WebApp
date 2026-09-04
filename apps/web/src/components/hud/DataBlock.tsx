import { useEffect, useState } from 'react';
import { sunPosition, sunTimes } from '../../lib/solar';
import { useApp } from '../../lib/store';

function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60);
  return `${String(d).padStart(pos === 'N' ? 2 : 3, '0')}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
}
const hhmm = (d: Date | null, tz?: string) => (d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }) : '—');

/** Chart data block under the compass: where you are, how high the ground is, local and Zulu time, the sun. */
export function DataBlock() {
  const home = useApp((s) => s.home);
  const ground = useApp((s) => s.groundElevM);
  const inRange = useApp((s) => s.overhead.length);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(id); }, []);
  const sun = sunPosition(home.lat, home.lon, now);
  const times = sunTimes(home.lat, home.lon, now);
  return (
    <div className="hud-data" aria-hidden>
      <div><b>{dms(home.lat, 'N', 'S')} {dms(home.lon, 'E', 'W')}</b></div>
      <div>ELEV <b>{Math.round(ground)} m</b> · RINGS 2 · 5 · 10 KM</div>
      <div><b>{hhmm(now)}</b> LOCAL · <b>{hhmm(now, 'UTC')}Z</b></div>
      <div>SUN <b>{Math.round(sun.elevation)}°</b> AT {String(Math.round(sun.azimuth)).padStart(3, '0')}° · ↑{hhmm(times.sunrise)} ↓{hhmm(times.sunset)}</div>
      <div>TRAFFIC <b>{inRange}</b> IN RANGE</div>
    </div>
  );
}
