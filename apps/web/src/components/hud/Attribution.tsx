import { useApp } from '../../lib/store';

export function Attribution() {
  const conn = useApp((s) => s.conn);
  return (
    <div className="hud-attrib">
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
      <br />Terrain: Mapzen / AWS open data. {conn.attribution || 'Aircraft data: connecting'}
    </div>
  );
}
