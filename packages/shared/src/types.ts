/** Normalised, metric, nullable-where-the-feed-is-nullable. Units convert once, at the display boundary. */
export interface StateVector {
  /** 6-char lowercase hex */
  icao24: string;
  /** trimmed; null when the feed has none */
  callsign: string | null;
  lat: number;
  lon: number;
  /** barometric altitude, metres MSL; null is legal and means "cannot be placed in 3D" */
  baroAltM: number | null;
  geoAltM: number | null;
  onGround: boolean;
  /** m/s over ground */
  velocityMps: number | null;
  /** degrees clockwise from true north */
  trackDeg: number | null;
  /** m/s, positive = climbing */
  verticalRateMps: number | null;
  squawk: string | null;
  /** country of registration as OpenSky reports it (from the ICAO24 block); null when the feed lacks it */
  originCountry: string | null;
  /** epoch seconds of the last position report */
  timePosition: number;
  /** epoch seconds of the last message of any kind */
  lastContact: number;
  /** ADS-B emitter category as broadcast (A0–A7, B0–B7, C0–C7) when the feed carries it */
  emitterCategory: string | null;
  /** Feed-supplied joins, when the feed does them for us (readsb-based feeds do) */
  registration: string | null;
  typeCode: string | null;
  typeDescription: string | null;
  /** how the position was determined */
  positionSource: 'adsb' | 'mlat' | 'tisb' | 'adsc' | 'other';
  /** bit flags from readsb dbFlags when present: 1 military, 2 interesting, 4 PIA, 8 LADD */
  dbFlags: number | null;
}

export type AircraftCategory =
  | 'wide-body-jet'
  | 'narrow-body-jet'
  | 'regional-jet'
  | 'turboprop'
  | 'business-jet'
  | 'helicopter'
  | 'light-piston'
  | 'generic';

export const AIRCRAFT_CATEGORIES: readonly AircraftCategory[] = [
  'wide-body-jet', 'narrow-body-jet', 'regional-jet', 'turboprop', 'business-jet', 'helicopter', 'light-piston', 'generic',
];

export interface AircraftMeta {
  icao24: string;
  registration: string | null;
  typeCode: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
  /** never null — defaults to 'generic' */
  category: AircraftCategory;
}

/** A state vector after the metadata join: what the client renders. */
export interface Aircraft extends StateVector {
  category: AircraftCategory;
  operator: string | null;
  model: string | null;
  /** decoded from the callsign's 3-letter ICAO airline prefix; null for GA / unknown */
  airline: string | null;
}

export interface BBox {
  /** south latitude */
  lamin: number;
  /** west longitude */
  lomin: number;
  /** north latitude */
  lamax: number;
  /** east longitude */
  lomax: number;
}

export interface AircraftProvider {
  readonly id: string;
  readonly attribution: string;
  /** relative cost of one poll of this box (provider-specific units: OpenSky credits, request count, …) */
  readonly costHint: (bbox: BBox) => number;
  fetchBox(bbox: BBox): Promise<StateVector[]>;
}

export interface TileFrame {
  tile: string;
  /** epoch ms when the poll completed */
  t: number;
  aircraft: Aircraft[];
  provider: string;
}

export type WatchRuleKind = 'type_code' | 'registration' | 'operator' | 'rare' | 'first_seen';

export interface WatchRule {
  id: string;
  userId: string;
  kind: WatchRuleKind;
  params: Record<string, string>;
  enabled: boolean;
}

export interface Sighting {
  id: string;
  userId: string;
  icao24: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  category: AircraftCategory;
  seenAt: string;
  lat: number;
  lon: number;
  /** TRUE altitude in metres. The compressed value is never persisted. */
  altitudeM: number | null;
  elevationDeg: number | null;
  source: string;
}

export type StampId =
  | 'first-sighting' | 'wide-body' | 'helicopter' | 'rare-type'
  | 'night-sighting' | 'turboprop' | 'century-club' | 'high-flyer';

export interface StampAward { stamp: StampId; awardedAt: string; sightingId: string | null }
