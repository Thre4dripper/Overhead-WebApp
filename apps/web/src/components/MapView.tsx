import { geohashBounds, geohashEncode, haversineM, tilesCovering } from '@overhead/shared';
import { Map as MlMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { AircraftLayer } from '../lib/aircraftLayer';
import { installBuildingFallback } from '../lib/buildingFallback';
import { FLAT_BELOW_ZOOM, HOME_PITCH, HOME_ZOOM, MAX_PITCH, VERTICAL_FOV, flyHome, lookAt, metersPerPixel } from '../lib/camera';
import { applyTheme, buildStyle, lightFor, setBuildings3D, TERRAIN_SOURCE } from '../lib/mapStyle';
import { sunPosition } from '../lib/solar';
import { runtime } from '../lib/runtime';
import { useApp } from '../lib/store';
import { traffic } from '../lib/traffic';
import { AircraftLabels } from './hud/AircraftLabels';
import { FlatMarkers } from './FlatMarkers';

function tileCentre(hash: string): [number, number] {
  const b = geohashBounds(hash);
  return [(b.lamin + b.lamax) / 2, (b.lomin + b.lomax) / 2];
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const layerRef = useRef<AircraftLayer | null>(null);
  const theme = useApp((s) => s.theme);
  const home = useApp((s) => s.home);
  const forceFlat = useApp((s) => s.forceFlat);
  const renderMode = useApp((s) => s.renderMode);
  const pendingSelect = useApp((s) => s.pendingSelect);
  const pitch = useApp((s) => s.camera.pitch);
  const terrain = useApp((s) => s.terrain);
  const firstHome = useRef(true);

  useEffect(() => {
    const st = useApp.getState();
    const map = new MlMap({
      container: container.current!,
      style: buildStyle(st.theme),
      center: [st.home.lon, st.home.lat],
      zoom: st.initialCamera.zoom ?? HOME_ZOOM, pitch: st.initialCamera.pitch ?? HOME_PITCH, bearing: st.initialCamera.bearing ?? 0,
      maxPitch: MAX_PITCH, minZoom: 3, maxZoom: 18,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      fadeDuration: 150,
    });
    mapRef.current = map;
    runtime.map = map;
    map.setVerticalFieldOfView(VERTICAL_FOV);
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();

    const layer = new AircraftLayer({
      traffic,
      getTheme: () => useApp.getState().theme,
      getGroundElevM: () => useApp.getState().groundElevM,
      getSelected: () => useApp.getState().selected,
      getTrails: () => useApp.getState().trails,
      getSun: () => { const c = map.getCenter(); return sunPosition(c.lat, c.lng); },
      onProjected: (list) => { if (useApp.getState().renderMode === '3d') runtime.projected = list; },
      getHome: () => { const h = useApp.getState().home; return { lat: h.lat, lon: h.lon }; },
      lowEnd: () => runtime.lowEnd,
      maxInstances: runtime.lowEnd ? 48 : 96,
    });
    layerRef.current = layer;
    runtime.layer = layer;

    let lastMode: string | null = null;
    let lastTiles = '';
    const onMove = () => {
      const s = useApp.getState();
      const c = map.getCenter();
      const fovRad = (map.getVerticalFieldOfView() * Math.PI) / 180;
      const camDistM = ((0.5 * map.getContainer().clientHeight) / Math.tan(fovRad / 2)) * metersPerPixel(map);
      const eyeAltM = camDistM * Math.cos((map.getPitch() * Math.PI) / 180) + s.groundElevM;
      s.setCamera({ zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), metersPerPixel: metersPerPixel(map), eyeAltM });
      const mode = s.forceFlat || map.getZoom() < FLAT_BELOW_ZOOM ? 'flat' : '3d';
      if (mode !== lastMode) {
        lastMode = mode;
        setBuildings3D(map, mode === '3d');
        layer.setVisible(mode === '3d');
        if (mode === 'flat') runtime.projected = [];
        s.setRenderMode(mode);
      }
      // tiles under the camera plus every tile the view can see (capped, nearest first); clustering makes them one upstream call
      const want = new Set(tilesCovering(c.lat, c.lng, 10000));
      try {
        const b = map.getBounds();
        const s0 = Math.max(b.getSouth(), c.lat - 0.6), n0 = Math.min(b.getNorth(), c.lat + 0.6);
        const w0 = Math.max(b.getWest(), c.lng - 0.9), e0 = Math.min(b.getEast(), c.lng + 0.9);
        for (let la = s0; la <= n0 + 0.17; la += 0.17) for (let lo = w0; lo <= e0 + 0.35; lo += 0.35) want.add(geohashEncode(Math.min(n0, la), Math.min(e0, lo), 4));
      } catch { /* bounds unavailable before load */ }
      const tiles = [...want]
        .sort((a, b) => haversineM(c.lat, c.lng, ...tileCentre(a)) - haversineM(c.lat, c.lng, ...tileCentre(b)))
        .slice(0, 8).join(',');
      if (tiles !== lastTiles) { lastTiles = tiles; runtime.connection?.setTiles(tiles.split(',')); }
    };
    const onMoveEnd = () => {
      const c = map.getCenter();
      const g = map.getTerrain() ? map.queryTerrainElevation(c) : null;
      if (g != null && Number.isFinite(g)) useApp.getState().setGroundElevM(g);
    };

    let uninstallFallback: (() => void) | null = null;
    map.on('load', () => {
      if (useApp.getState().terrain) map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1 });
      map.addLayer(layer);
      uninstallFallback = installBuildingFallback(map, (st) => { runtime.fallbackStats = st; });
      onMove(); onMoveEnd();
    });
    map.on('move', onMove);
    map.on('moveend', onMoveEnd);
    map.on('click', (e) => {
      const s = useApp.getState();
      let best: { icao24: string; d: number } | null = null;
      for (const p of runtime.projected) {
        if (!p.visible) continue;
        const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
        const r = Math.max(22, p.lengthPx * 0.6);
        if (d < r && (!best || d < best.d)) best = { icao24: p.icao24, d };
      }
      if (best) { s.select(best.icao24); s.setSheetOpen(false); } else s.select(null);
    });
    map.on('error', (e) => { if (!/tile|Failed to fetch/i.test(String(e.error?.message ?? ''))) console.warn('map error', e.error); });

    return () => { uninstallFallback?.(); map.remove(); mapRef.current = null; runtime.map = null; runtime.projected = []; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const apply = () => { applyTheme(map, theme); const c = map.getCenter(); map.setLight(lightFor(theme, sunPosition(c.lat, c.lng))); layerRef.current?.setTheme(theme); };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (firstHome.current) { firstHome.current = false; return; }
    flyHome(map, home.lat, home.lon, true);
  }, [home.lat, home.lon]);

  useEffect(() => { mapRef.current?.fire('move'); }, [forceFlat]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !map.isStyleLoaded()) return;
    map.setTerrain(terrain ? { source: TERRAIN_SOURCE, exaggeration: 1 } : null);
    if (!terrain) useApp.getState().setGroundElevM(0);
  }, [terrain]);

  // deep link from a push notification: select once the aircraft shows up
  useEffect(() => {
    if (!pendingSelect) return;
    const id = setInterval(() => {
      const tr = traffic.get(pendingSelect);
      if (tr && mapRef.current) { useApp.getState().select(pendingSelect); lookAt(mapRef.current, tr.lat, tr.lon); clearInterval(id); }
    }, 500);
    const stop = setTimeout(() => clearInterval(id), 60_000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [pendingSelect]);

  const haze = Math.min(0.5, Math.max(0, (pitch - 48) / 50));
  return (
    <>
      <div className="map" ref={container} role="application" aria-label="Tilted 3D map of your city with live aircraft" />
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '26%', pointerEvents: 'none', opacity: haze, background: 'linear-gradient(180deg, var(--sky) 0%, color-mix(in srgb, var(--sky) 55%, transparent) 50%, transparent 100%)', transition: 'opacity 300ms' }} />
      {renderMode === 'flat' && <FlatMarkers />}
      <AircraftLabels />
    </>
  );
}
