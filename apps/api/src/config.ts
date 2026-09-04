import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = z.preprocess(blankToUndefined, z.string().optional());
const optInt = (d: number) => z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(d));
const optBool = (d: boolean) => z.preprocess((v) => (v == null || v === '' ? d : v === '1' || v === 'true' || v === true), z.boolean());

const Schema = z.object({
  PORT: optInt(8787),
  HOST: z.preprocess(blankToUndefined, z.string().default('0.0.0.0')),
  /** opensky is the only live provider; demo is synthetic traffic for offline work */
  AIRCRAFT_PROVIDER: z.preprocess(blankToUndefined, z.enum(['opensky', 'demo']).default('opensky')),
  OPENSKY_CLIENT_ID: optStr,
  OPENSKY_CLIENT_SECRET: optStr,
  /** daily credit budget for this account: anonymous 400, registered 4 000, active feeder 8 000 */
  OPENSKY_DAILY_CREDITS: optInt(4000),
  POLL_INTERVAL_MS: optInt(15000),
  MAX_ACTIVE_TILES: optInt(24),
  TILE_IDLE_MS: optInt(20000),
  UPSTREAM_MIN_SPACING_MS: optInt(1500),
  CORS_ORIGIN: z.preprocess(blankToUndefined, z.string().default('https://localhost:5173,http://localhost:5173')),
  /** local copy of OpenSky's aircraft database CSV; downloaded here automatically when missing */
  AIRCRAFT_DB_CSV: z.preprocess(blankToUndefined, z.string().default('../../data/aircraft-db.csv')),
  AIRCRAFT_DB_AUTO: optBool(true),
  AIRCRAFT_DB_URL: z.preprocess(blankToUndefined, z.string().default('https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv')),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
