// MapLibre 6 spawns its worker with new URL('./maplibre-gl-worker.mjs', import.meta.url). Vite's
// dep optimiser (dev) and rolldown (build) both lose that file, so bundle the worker explicitly and
// hand MapLibre the URL. Must be imported before the first Map is created.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
