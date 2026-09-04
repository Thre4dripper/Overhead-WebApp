import type { ExpressionSpecification, Map as MlMap, StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { FALLBACK_LAYER, FALLBACK_SOURCE } from './buildingFallback';
import type { Theme } from './solar';

/** MapLibre's extrusion light: follows the real sun by azimuth, warm and low at golden hour, dim and blue at night. */
export function lightFor(theme: Theme, sun: { azimuth: number; elevation: number }) {
  const polar = Math.min(80, Math.max(15, 90 - Math.max(12, sun.elevation)));
  const color = theme === 'night' ? '#8fa4d8' : theme === 'golden' ? '#ffb070' : '#fff4e0';
  const intensity = theme === 'night' ? 0.22 : theme === 'golden' ? 0.6 : 0.42;
  return { anchor: 'map' as const, position: [1.2, sun.azimuth, polar] as [number, number, number], color, intensity };
}

export const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
/** AWS open-data terrain tiles, terrarium encoding, 256 px, z ≤ 15. OpenFreeMap serves no DEM (verified 2026-09-04). */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_SOURCE = 'terrain-dem';
export const EXTRUSION_LAYER = 'building-3d';
export const BUILDING_2D_LAYER = 'building-2d';

interface Palette {
  land: string; residential: string; industrial: string; park: string; wood: string; water: string; waterway: string;
  roadMinor: string; roadMajor: string; roadMotorway: string; rail: string; runway: string; apron: string;
  buildingFill: string; buildingLine: string; extrusion: string; extrusionTall: string;
  label: string; labelHalo: string; boundary: string; roadOpacity: number;
  street: string; shoreline: string;
  /** warm streetlight colour; only set for the night palette */
  glow?: string;
  skyColor: string; horizonColor: string; fogColor: string;
}

export const PALETTES: Record<Theme, Palette> = {
  day: {
    land: '#e3d6b4', residential: '#dccea8', industrial: '#d6c8a2', park: '#cfcb9c', wood: '#c4c493', water: '#b7cad4', waterway: '#a9bfcb',
    roadMinor: '#12263c', roadMajor: '#12263c', roadMotorway: '#12263c', rail: '#12263c', runway: '#12263c', apron: '#d2c59f',
    buildingFill: '#d0c197', buildingLine: '#12263c', extrusion: '#b9a67a', extrusionTall: '#c9b88c',
    label: '#12263c', labelHalo: '#e3d6b4', boundary: '#3a5c7d', roadOpacity: 0.22,
    street: '#ece1c4', shoreline: '#7d9fb3',
    skyColor: '#a9c4d6', horizonColor: '#d8e2e8', fogColor: '#cfdbe3',
  },
  golden: {
    land: '#e2c89d', residential: '#dabf92', industrial: '#d4b98c', park: '#cdbc86', wood: '#c1b27d', water: '#c1ad9c', waterway: '#b7a291',
    roadMinor: '#2a2418', roadMajor: '#2a2418', roadMotorway: '#2a2418', rail: '#2a2418', runway: '#2a2418', apron: '#d3b98b',
    buildingFill: '#cfae7c', buildingLine: '#2a2418', extrusion: '#b98f5c', extrusionTall: '#c9a06d',
    label: '#2a2418', labelHalo: '#e2c89d', boundary: '#5a4a3a', roadOpacity: 0.22,
    street: '#ebd4ab', shoreline: '#8e7a6c',
    skyColor: '#b48a72', horizonColor: '#f0cfa6', fogColor: '#e6c39c',
  },
  night: {
    land: '#161e33', residential: '#192239', industrial: '#171f36', park: '#152239', wood: '#131f34', water: '#0e1526', waterway: '#101a2e',
    roadMinor: '#e7edf4', roadMajor: '#e7edf4', roadMotorway: '#e7edf4', rail: '#e7edf4', runway: '#e7edf4', apron: '#1b2540',
    buildingFill: '#212b46', buildingLine: '#e7edf4', extrusion: '#232e4a', extrusionTall: '#4a4a6a',
    label: '#e7edf4', labelHalo: '#161e33', boundary: '#7fa3c7', roadOpacity: 0.12,
    street: '#1c2540', shoreline: '#3a4c70', glow: '#f3c47a',
    skyColor: '#0f1630', horizonColor: '#2a3557', fogColor: '#1b2440',
  },
};

/**
 * Building height chain, M2. OpenMapTiles bakes `render_height` = COALESCE(height, levels × 3.66, 5)
 * and merges same-attribute buildings per tile, so from the tile alone:
 *   1. render_height ≠ 5 → a tagged height or a levels-derived height: use it (floored at 3 m so
 *      `height=1` kiosks don't vanish under the ground plane).
 *   2. render_height = 5 → neither tag. These features are EXCLUDED here and re-drawn by the
 *      runtime area heuristic in buildingFallback.ts (one extrusion per footprint, varied heights).
 * Measured shares per city: docs/evidence/building-heights-*.md.
 */
export const HAS_HEIGHT_DATA: ExpressionSpecification = ['!=', ['coalesce', ['get', 'render_height'], 5], 5];
export const BUILDING_HEIGHT_EXPR: ExpressionSpecification = ['max', 3, ['coalesce', ['get', 'render_height'], 5]];

const roadWidth = (minor: number, major: number, motorway: number): ExpressionSpecification => [
  'interpolate', ['linear'], ['zoom'],
  12, ['match', ['get', 'class'], ['motorway', 'trunk'], motorway * 0.6, ['primary', 'secondary'], major * 0.6, minor * 0.5],
  16, ['match', ['get', 'class'], ['motorway', 'trunk'], motorway, ['primary', 'secondary'], major, minor],
];

export function buildLayers(p: Palette): LayerSpecification[] {
  return [
    { id: 'background', type: 'background', paint: { 'background-color': p.land } },
    { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland', 'wetland']]], paint: { 'fill-color': ['match', ['get', 'class'], 'wood', p.wood, p.park], 'fill-opacity': 0.9 } },
    { id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], p.residential, ['industrial', 'commercial', 'retail', 'railway'], p.industrial, ['cemetery', 'pitch', 'stadium', 'playground', 'garden', 'park'], p.park, p.land] } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': p.park, 'fill-opacity': 0.8 } },
    { id: 'landcover-detail', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['sand', 'rock', 'ice']]], paint: { 'fill-color': ['match', ['get', 'class'], 'sand', p.street, 'ice', p.labelHalo, p.industrial], 'fill-opacity': 0.8 } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'shoreline', type: 'line', source: 'openmaptiles', 'source-layer': 'water', minzoom: 11, paint: { 'line-color': p.shoreline, 'line-opacity': 0.55, 'line-width': 0.75 } },
    { id: 'park-outline', type: 'line', source: 'openmaptiles', 'source-layer': 'park', minzoom: 13, paint: { 'line-color': p.boundary, 'line-opacity': 0.25, 'line-width': 0.6, 'line-dasharray': [3, 2] } },
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': p.waterway, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2] } },
    { id: 'aeroway-area', type: 'fill', source: 'openmaptiles', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': p.apron, 'fill-opacity': 0.9 } },
    { id: 'aeroway-runway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'runway']], paint: { 'line-color': p.runway, 'line-opacity': 0.32, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 14, 8, 16, 22] } },
    { id: 'aeroway-taxiway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'taxiway']], paint: { 'line-color': p.runway, 'line-opacity': 0.18, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 3] } },
    { id: 'rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]], paint: { 'line-color': p.rail, 'line-opacity': p.roadOpacity * 0.9, 'line-width': 0.75, 'line-dasharray': [4, 3] } },
    { id: 'street-fill', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 14.5, filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'living_street', 'pedestrian']]], paint: { 'line-color': p.street, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14.5, 1.5, 16, ['match', ['get', 'class'], ['motorway', 'trunk'], 14, ['primary', 'secondary'], 10, 6], 18, ['match', ['get', 'class'], ['motorway', 'trunk'], 34, ['primary', 'secondary'], 24, 14]], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.2, 0.9] } },
    { id: 'path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 14, filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]], paint: { 'line-color': p.roadMinor, 'line-opacity': p.roadOpacity * 0.9, 'line-width': 0.6, 'line-dasharray': [2, 2.5] } },
    // night: streets read as lines of streetlights — a soft wide glow under a warm hairline
    { id: 'street-glow', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'living_street']]], layout: { visibility: p.glow ? 'visible' : 'none' }, paint: { 'line-color': p.glow ?? '#000000', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.05, 15, 0.12], 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 2, 16, ['match', ['get', 'class'], ['motorway', 'trunk'], 22, ['primary', 'secondary'], 14, 8]], 'line-blur': 6 } },
    { id: 'street-lamps', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'living_street']]], layout: { visibility: p.glow ? 'visible' : 'none' }, paint: { 'line-color': p.glow ?? '#000000', 'line-opacity': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 0.55, 0.32], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1.4] } },
    { id: 'runway-lights', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway', minzoom: 12, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'runway']], layout: { visibility: p.glow ? 'visible' : 'none' }, paint: { 'line-color': '#f2efe6', 'line-opacity': 0.75, 'line-width': 1, 'line-dasharray': [1, 3], 'line-gap-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 24] } },
    { id: 'road-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'living_street', 'pedestrian']]], paint: { 'line-color': p.roadMinor, 'line-opacity': p.roadOpacity, 'line-width': roadWidth(0.9, 1.4, 1.8) } },
    { id: 'road-major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary']]], paint: { 'line-color': p.roadMajor, 'line-opacity': p.roadOpacity * 1.5, 'line-width': roadWidth(1.2, 1.6, 2.2) } },
    { id: 'road-motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]], paint: { 'line-color': p.roadMotorway, 'line-opacity': p.roadOpacity * 1.9, 'line-width': roadWidth(1.4, 2, 2.6) } },
    { id: BUILDING_2D_LAYER, type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12, paint: { 'fill-color': p.buildingFill, 'fill-outline-color': p.buildingLine, 'fill-opacity': 0.85 } },
    {
      id: EXTRUSION_LAYER, type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
      filter: ['all', ['!=', ['get', 'hide_3d'], true], HAS_HEIGHT_DATA],
      paint: {
        'fill-extrusion-color': ['case', ['has', 'colour'],
          ['interpolate', ['linear'], 0.35, 0, ['to-color', p.extrusion], 1, ['to-color', ['get', 'colour'], p.extrusion]],
          ['interpolate', ['linear'], BUILDING_HEIGHT_EXPR, 0, p.extrusion, 60, p.extrusion, 140, p.extrusionTall]],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, BUILDING_HEIGHT_EXPR],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: FALLBACK_LAYER, type: 'fill-extrusion', source: FALLBACK_SOURCE, minzoom: 13,
      paint: {
        'fill-extrusion-color': p.extrusion,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.6, ['get', 'h']],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    { id: 'boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 4], paint: { 'line-color': p.boundary, 'line-opacity': 0.35, 'line-width': 0.75, 'line-dasharray': [6, 3] } },
    { id: 'aerodrome-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'aerodrome_label', minzoom: 9, layout: { 'text-field': ['coalesce', ['get', 'iata'], ['get', 'icao'], ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-letter-spacing': 0.14, 'text-transform': 'uppercase', 'text-anchor': 'center', 'text-pitch-alignment': 'viewport' }, paint: { 'text-color': p.boundary, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 } },
    { id: 'place-suburb', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-letter-spacing': 0.06, 'text-transform': 'uppercase', 'text-pitch-alignment': 'viewport', 'text-max-width': 8 }, paint: { 'text-color': p.label, 'text-opacity': 0.62, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 } },
    { id: 'place-town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14], 'text-letter-spacing': 0.04, 'text-pitch-alignment': 'viewport' }, paint: { 'text-color': p.label, 'text-opacity': 0.8, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.2 } },
    { id: 'road-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 14.5, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'symbol-placement': 'line', 'text-letter-spacing': 0.05, 'text-pitch-alignment': 'viewport', 'symbol-spacing': 400 }, paint: { 'text-color': p.label, 'text-opacity': 0.6, 'text-halo-color': p.labelHalo, 'text-halo-width': 1 } },
    { id: 'water-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 10, 'symbol-placement': 'line', 'text-letter-spacing': 0.08 }, paint: { 'text-color': p.boundary, 'text-opacity': 0.7 } },
  ];
}

export function buildStyle(theme: Theme): StyleSpecification {
  const p = PALETTES[theme];
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: OFM_TILEJSON },
      [TERRAIN_SOURCE]: { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: Mapzen / AWS terrain tiles' },
      [FALLBACK_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    sky: skyFor(theme),
    layers: buildLayers(p),
  };
}

export function skyFor(theme: Theme) {
  const p = PALETTES[theme];
  return {
    'sky-color': p.skyColor, 'horizon-color': p.horizonColor, 'fog-color': p.fogColor,
    'fog-ground-blend': 0.6, 'horizon-fog-blend': 0.85, 'sky-horizon-blend': 0.7, 'atmosphere-blend': 0,
  };
}

/** Re-paint an existing map for a new theme without reloading tiles. */
export function applyTheme(map: MlMap, theme: Theme): void {
  const p = PALETTES[theme];
  const fresh = new Map(buildLayers(p).map((l) => [l.id, l]));
  for (const [id, spec] of fresh) {
    if (!map.getLayer(id)) continue;
    const paint = (spec as { paint?: Record<string, unknown> }).paint ?? {};
    const setPaint = (map as unknown as { setPaintProperty: (layer: string, name: string, value: unknown) => void }).setPaintProperty.bind(map);
    for (const [k, v] of Object.entries(paint)) setPaint(id, k, v);
  }
  map.setSky(skyFor(theme));
}

export function setBuildings3D(map: MlMap, on: boolean): void {
  if (map.getLayer(EXTRUSION_LAYER)) map.setLayoutProperty(EXTRUSION_LAYER, 'visibility', on ? 'visible' : 'none');
  if (map.getLayer(FALLBACK_LAYER)) map.setLayoutProperty(FALLBACK_LAYER, 'visibility', on ? 'visible' : 'none');
  if (map.getLayer(BUILDING_2D_LAYER)) map.setLayoutProperty(BUILDING_2D_LAYER, 'visibility', on ? 'none' : 'visible');
}
