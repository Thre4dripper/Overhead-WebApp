import type { AircraftProvider } from '@overhead/shared';
import type { Config } from '../config';
import { DemoProvider } from './demo';
import { OpenSkyProvider } from './opensky';

export function createProvider(cfg: Config): AircraftProvider {
  switch (cfg.AIRCRAFT_PROVIDER) {
    case 'opensky': return new OpenSkyProvider(cfg.OPENSKY_CLIENT_ID, cfg.OPENSKY_CLIENT_SECRET);
    case 'demo': return new DemoProvider();
  }
}

export { DemoProvider, OpenSkyProvider };
