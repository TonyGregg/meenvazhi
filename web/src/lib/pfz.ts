/**
 * The published advisory document, and a validator for it.
 *
 * Mirrors docs/SCHEMA.md. The pipeline's golden JSON is the shared contract, and
 * src/__tests__ reads that same file so the two implementations cannot drift
 * apart unnoticed.
 */

/** The schema this build understands. See the note on validateDocument. */
export const SUPPORTED_SCHEMA_VERSION = 1;

export type SectorStatus = 'HAS_ADVISORY' | 'NO_ADVISORY' | 'FETCH_FAILED';

export interface Range {
  from: number;
  to: number;
}

/** INCOIS's own figures, measured from the named local landing centre. */
export interface IncoisReading {
  direction: string;
  bearing_deg: number;
  distance_km: Range;
}

/** Recomputed from the user's home port. This is the one to steer by. */
export interface FromHome {
  distance_km: number;
  distance_nmi: number;
  bearing_deg: number;
  compass: string;
  reachable: boolean;
}

export interface Zone {
  id: string;
  gpx_name: string;
  landing_centre: string;
  lat: number;
  lon: number;
  lat_dms: string;
  lon_dms: string;
  depth_m: Range;
  incois: IncoisReading;
  from_home: FromHome;
}

export interface Sector {
  sector_id: string;
  sector_name: string;
  status: SectorStatus;
  reason: string | null;
  incois_updated_at: string | null;
  valid_until: string | null;
  zone_count: number;
  zones: Zone[];
}

export interface HomePort {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface PfzDocument {
  schema_version: number;
  generated_at: string;
  generator: string;
  advisory_date: string | null;
  valid_until: string | null;
  /** INCOIS's "Forecast Date" from its Text Data page. Absent in older documents. */
  forecast_date?: string | null;
  /** INCOIS's "Valid upto" from its Text Data page. Absent in older documents. */
  valid_upto?: string | null;
  source: { name: string; url: string; credit: string };
  disclaimer: string;
  home_port: HomePort;
  reachable_nmi: number;
  sectors: Sector[];
  counts: { sectors: number; with_advisory: number; zones: number; reachable: number };
}

export class SchemaTooNewError extends Error {
  constructor(readonly found: number) {
    super(`document schema_version ${found} is newer than this app understands (${SUPPORTED_SCHEMA_VERSION})`);
    this.name = 'SchemaTooNewError';
  }
}

export class InvalidDocumentError extends Error {
  constructor(reason: string) {
    super(`advisory document is not usable: ${reason}`);
    this.name = 'InvalidDocumentError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a parsed document before anything renders it.
 *
 * A newer schema_version throws SchemaTooNewError rather than being rendered on
 * a best-effort basis. The app is installed on a phone that may not be updated
 * for weeks, so showing "this app needs updating" is safer than displaying
 * fields it has half-understood.
 */
export function validateDocument(value: unknown): PfzDocument {
  if (!isRecord(value)) throw new InvalidDocumentError('not an object');

  const version = value['schema_version'];
  if (typeof version !== 'number') throw new InvalidDocumentError('schema_version missing');
  if (version > SUPPORTED_SCHEMA_VERSION) throw new SchemaTooNewError(version);

  if (!Array.isArray(value['sectors'])) throw new InvalidDocumentError('sectors missing');
  if (!isRecord(value['home_port'])) throw new InvalidDocumentError('home_port missing');
  if (typeof value['generated_at'] !== 'string') throw new InvalidDocumentError('generated_at missing');

  for (const sector of value['sectors']) {
    if (!isRecord(sector)) throw new InvalidDocumentError('a sector is not an object');
    if (typeof sector['sector_id'] !== 'string') throw new InvalidDocumentError('a sector has no sector_id');
    if (!Array.isArray(sector['zones'])) throw new InvalidDocumentError(`${String(sector['sector_id'])} has no zones array`);
    for (const zone of sector['zones']) {
      if (!isRecord(zone)) throw new InvalidDocumentError('a zone is not an object');
      const home = zone['from_home'];
      if (!isRecord(home) || typeof home['bearing_deg'] !== 'number' || typeof home['distance_nmi'] !== 'number') {
        throw new InvalidDocumentError(`zone ${String(zone['id'])} has no usable from_home figures`);
      }
      if (typeof zone['lat'] !== 'number' || typeof zone['lon'] !== 'number') {
        throw new InvalidDocumentError(`zone ${String(zone['id'])} has no coordinates`);
      }
    }
  }

  return value as unknown as PfzDocument;
}

/** Every zone across every sector, nearest to the home port first. */
export function allZones(doc: PfzDocument): Zone[] {
  return doc.sectors
    .flatMap((s) => s.zones)
    .slice()
    .sort((a, b) => a.from_home.distance_nmi - b.from_home.distance_nmi);
}

export function sectorOfZone(doc: PfzDocument, zoneId: string): Sector | undefined {
  return doc.sectors.find((s) => s.zones.some((z) => z.id === zoneId));
}
