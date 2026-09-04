import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = z.preprocess(blankToUndefined, z.string().optional());
const optInt = (d: number) => z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(d));
const optBool = (d: boolean) => z.preprocess((v) => (v == null || v === '' ? d : v === '1' || v === 'true' || v === true), z.boolean());

/**
 * Environment for the relay. `FEED`, `REFRESH_SECONDS` and the `OPENSKY_*` keys are deliberately the
 * same names the serverless functions read (apps/web/api), so one concept never has two names.
 * See docs/configuration.md.
 */
const Schema = z.object({
  // ---- which live feed ----
  /** opensky (needs credentials and a host it accepts) | adsblol (no key) | demo (synthetic, offline) */
  FEED: z.preprocess(blankToUndefined, z.enum(['opensky', 'adsblol', 'demo']).default('adsblol')),
  /** how often each watched area is refreshed upstream */
  REFRESH_SECONDS: optInt(15),
  // ---- OpenSky only ----
  OPENSKY_CLIENT_ID: optStr,
  OPENSKY_CLIENT_SECRET: optStr,
  /** daily credit budget for the account: anonymous 400, registered 4 000, active feeder 8 000 */
  OPENSKY_DAILY_CREDITS: optInt(4000),
  /** local copy of OpenSky's aircraft database (type, registration, operator per ICAO24) */
  AIRCRAFT_DB_CSV: z.preprocess(blankToUndefined, z.string().default('../../data/aircraft-db.csv')),
  AIRCRAFT_DB_AUTO: optBool(true),
  AIRCRAFT_DB_URL: z.preprocess(blankToUndefined, z.string().default('https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv')),
  // ---- serving ----
  PORT: optInt(8787),
  HOST: z.preprocess(blankToUndefined, z.string().default('0.0.0.0')),
  /** comma-separated origins allowed to call this relay from a browser */
  CORS_ORIGIN: z.preprocess(blankToUndefined, z.string().default('https://localhost:5173,http://localhost:5173')),
  // ---- guard rails ----
  MAX_ACTIVE_TILES: optInt(24),
  TILE_IDLE_MS: optInt(20000),
  UPSTREAM_MIN_SPACING_MS: optInt(1500),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
