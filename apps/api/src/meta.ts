import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { airlineFromCallsign, resolveCategory, type Aircraft, type AircraftMeta, type StateVector } from '@overhead/shared';

/**
 * ICAO24 → registration / type / operator. OpenSky state vectors carry neither, so the join against
 * OpenSky's downloadable aircraft database (~520 k rows, CSV) is what makes a 747 render as a 747.
 * The CSV is fetched once into data/ and loaded into memory at boot (a few seconds, ~100 MB).
 * The category is derived, never stored null: a join miss renders the generic mesh.
 */
/** Rows are packed as one tab-separated string per ICAO24 — ~520 k JS objects would cost 3× the memory. */
const SEP = '\t';
function pack(m: AircraftMeta): string {
  return [m.registration ?? '', m.typeCode ?? '', m.manufacturer ?? '', m.model ?? '', m.operator ?? '', m.category].join(SEP);
}
function unpack(icao24: string, row: string): AircraftMeta {
  const [registration, typeCode, manufacturer, model, operator, category] = row.split(SEP);
  return {
    icao24, registration: registration || null, typeCode: typeCode || null, manufacturer: manufacturer || null, model: model || null,
    operator: operator || null, category: (category as AircraftMeta['category']) || 'generic',
  };
}

export class AircraftMetaStore {
  private byIcao = new Map<string, string>();
  private learned = 0;
  stats = { csvRows: 0, learned: 0, joinsHit: 0, joinsMiss: 0 };

  get size(): number { return this.byIcao.size; }
  get(icao24: string): AircraftMeta | undefined {
    const k = icao24.toLowerCase(); const row = this.byIcao.get(k);
    return row == null ? undefined : unpack(k, row);
  }

  upsert(meta: AircraftMeta): void { this.byIcao.set(meta.icao24.toLowerCase(), pack(meta)); }

  /** Remember what the feed told us so a later provider (or a later frame with a dropped field) still joins. */
  learn(sv: StateVector): void {
    if (!sv.typeCode && !sv.registration) return;
    const prev = this.get(sv.icao24);
    if (prev?.typeCode && prev.registration) return;
    const typeCode = sv.typeCode ?? prev?.typeCode ?? null;
    this.upsert({
      icao24: sv.icao24,
      registration: sv.registration ?? prev?.registration ?? null,
      typeCode,
      manufacturer: prev?.manufacturer ?? null,
      model: prev?.model ?? sv.typeDescription ?? null,
      operator: prev?.operator ?? null,
      category: resolveCategory({ typeCode, typeDescription: sv.typeDescription, emitterCategory: sv.emitterCategory }),
    });
    this.learned++; this.stats.learned = this.learned;
  }

  enrich(sv: StateVector): Aircraft {
    const meta = this.get(sv.icao24);
    const typeCode = sv.typeCode ?? meta?.typeCode ?? null;
    const registration = sv.registration ?? meta?.registration ?? null;
    if (typeCode || registration) this.stats.joinsHit++; else this.stats.joinsMiss++;
    const airline = airlineFromCallsign(sv.callsign);
    return {
      ...sv,
      typeCode,
      registration,
      category: resolveCategory({ typeCode, typeDescription: sv.typeDescription ?? meta?.model, emitterCategory: sv.emitterCategory }),
      operator: meta?.operator ?? airline,
      model: meta?.model ?? sv.typeDescription ?? null,
      airline,
    };
  }

  /**
   * Load the OpenSky aircraft database CSV (header row: icao24, registration, manufacturericao,
   * manufacturername, model, typecode, serialnumber, linenumber, icaoaircrafttype, operator, ...).
   * Column positions are read from the header, not assumed.
   */
  async loadCsv(path: string): Promise<number> {
    if (!existsSync(path)) return 0;
    const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
    let header: string[] | null = null;
    let idx: Record<string, number> = {};
    let rows = 0;
    for await (const line of rl) {
      if (!line) continue;
      const cells = parseCsvLine(line);
      if (!header) {
        header = cells.map((c) => c.trim().toLowerCase().replace(/^'|'$/g, ''));
        idx = Object.fromEntries(header.map((h, i) => [h, i]));
        if (idx.icao24 == null) throw new Error(`aircraft CSV: no icao24 column in header ${header.join(',')}`);
        continue;
      }
      const g = (k: string) => { const i = idx[k]; return i == null ? '' : (cells[i] ?? '').trim().replace(/^'|'$/g, ''); };
      const icao24 = g('icao24').toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(icao24)) continue;
      const typeCode = g('typecode') || null;
      const model = g('model') || null;
      const icaoAircraftType = g('icaoaircrafttype');
      const emitterHint = icaoAircraftType.startsWith('H') ? 'A7' : null;
      this.upsert({
        icao24,
        registration: g('registration') || null,
        typeCode,
        manufacturer: g('manufacturername') || g('manufacturericao') || null,
        model,
        operator: g('operator') || g('owner') || null,
        category: resolveCategory({ typeCode, typeDescription: model, emitterCategory: emitterHint }),
      });
      rows++;
    }
    this.stats.csvRows = rows;
    return rows;
  }
}

/** Download the CSV if it is missing (or suspiciously small), atomically. Returns the path or null. */
export async function ensureAircraftDb(path: string, url: string, log: (m: string, x?: Record<string, unknown>) => void): Promise<string | null> {
  try {
    if (existsSync(path) && statSync(path).size > 1_000_000) return path;
    mkdirSync(dirname(path), { recursive: true });
    log('downloading aircraft database', { url });
    const res = await fetch(url, { headers: { 'user-agent': 'Overhead/0.1 (hobby project)' } });
    if (!res.ok || !res.body) { log('aircraft database download failed', { status: res.status }); return null; }
    const tmp = `${path}.part`;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
    renameSync(tmp, path);
    log('aircraft database downloaded', { bytes: statSync(path).size });
    return path;
  } catch (err) {
    log('aircraft database download failed', { error: (err as Error).message });
    return null;
  }
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
