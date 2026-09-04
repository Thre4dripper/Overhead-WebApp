import type { Map as MlMap } from 'maplibre-gl';
import type { AircraftLayer, Projected } from './aircraftLayer';
import type { FallbackStats } from './buildingFallback';
import type { Connection } from './connection';

/** Imperative singletons shared between the React tree and the render loop. */
export const runtime = {
  connection: null as Connection | null,
  map: null as MlMap | null,
  layer: null as AircraftLayer | null,
  projected: [] as Projected[],
  lowEnd: false,
  fallbackStats: null as FallbackStats | null,
};

if (import.meta.env.DEV) (window as unknown as { __overhead: typeof runtime }).__overhead = runtime;
