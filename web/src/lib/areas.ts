/**
 * Reading the advisory area by area, the way INCOIS presents it.
 *
 * INCOIS lists each sector's zones in coastal order, each measured from its nearest
 * landing centre. That is exactly what a fisherman sailing from that stretch of
 * coast wants, and it is why the "By area" view exists alongside "Nearest to me".
 */

import type { Messages } from '@/i18n';
import type { PfzDocument, Sector, Zone } from './pfz';

/** The row position INCOIS published, recovered from the zone id ("SEC006-17" -> 17). */
function incoisRow(zone: Zone): number {
  const n = Number(zone.id.split('-').pop());
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Zones in the order INCOIS lists them.
 *
 * The published document sorts each sector by distance from the home port, which
 * suits "Nearest to me". The original order survives in the zone id, which the
 * pipeline assigns from the INCOIS row number.
 */
export function incoisOrder(zones: readonly Zone[]): Zone[] {
  return [...zones].sort((a, b) => incoisRow(a) - incoisRow(b));
}

/** Every zone in one named sector, or across all sectors, regardless of range. */
export function zonesInSelection(doc: PfzDocument, sectorName: string | null): Zone[] {
  const sectors = sectorName ? doc.sectors.filter((s) => s.sector_name === sectorName) : doc.sectors;
  return sectors.flatMap((s) => s.zones);
}

/**
 * How many zones the range filter is hiding from the current selection.
 *
 * Shown to the user rather than left silent. On 29 Sep 2026 every South Tamil Nadu
 * zone sat beyond the default range from Kochi, so the list quietly showed none of
 * them while Kerala's zones filled the screen.
 */
export function hiddenByRange(doc: PfzDocument, sectorName: string | null): number {
  return zonesInSelection(doc, sectorName).filter((z) => !z.from_home.reachable).length;
}

/** The sector to show in the area view: the remembered one, else the first with zones. */
export function pickAreaSector(doc: PfzDocument, preferredId: string | null): Sector | undefined {
  return (
    doc.sectors.find((s) => s.sector_id === preferredId) ??
    doc.sectors.find((s) => s.zones.length > 0) ??
    doc.sectors[0]
  );
}

/** A sector's name in the reader's language, falling back to INCOIS's own name. */
export function sectorLabel(t: Messages, sector: Pick<Sector, 'sector_id' | 'sector_name'>): string {
  return t.sectorNames[sector.sector_id] ?? sector.sector_name;
}

/** "Kochi (Cochin Fisheries Harbour)" -> "Kochi", for labels that must stay short. */
export function portShortName(name: string): string {
  return name.split(' (')[0] ?? name;
}
