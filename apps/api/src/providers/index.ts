import type { AircraftProvider } from '@overhead/shared';
import type { Config } from '../config';
import { AdsbLolProvider } from './adsblol';
import { DemoProvider } from './demo';
import { OpenSkyProvider } from './opensky';

export function createProvider(cfg: Config): AircraftProvider {
  switch (cfg.FEED) {
    case 'opensky': return new OpenSkyProvider(cfg.OPENSKY_CLIENT_ID, cfg.OPENSKY_CLIENT_SECRET);
    case 'adsblol': return new AdsbLolProvider();
    case 'demo': return new DemoProvider();
  }
}

export { AdsbLolProvider, DemoProvider, OpenSkyProvider };
