/**
 * How old, and how dead, is the advisory on this device?
 *
 * The safety-critical module. A Potential Fishing Zone advisory is valid for
 * roughly a day and moves with the oceanographic fronts it is derived from. On
 * day five of a trip a cached document is not "slightly old", it is finished, and
 * the zones it names are no longer where the fish are.
 *
 * Two rules follow, and both are easy to get wrong:
 *
 * Freshness is computed from INCOIS's own advisory_date and valid_until, never
 * from when the app happened to fetch the file. A successful re-fetch of an old
 * document must not look fresh.
 *
 * Expiry is independent of age. An advisory whose valid_until has passed is
 * expired even if it was downloaded an hour ago.
 *
 * Pure, with the clock injected, so every branch is testable.
 */

import type { PfzDocument } from './pfz';

export type Freshness =
  /** Today's or yesterday's, still within its validity. */
  | 'fresh'
  /** Two or three days old, still within its validity. */
  | 'aging'
  /** More than three days old. */
  | 'stale'
  /** Past its valid_until. Over, regardless of age. */
  | 'expired'
  /** Nothing on this device at all. */
  | 'none'
  /** The device clock reads before the advisory was issued. */
  | 'clock_suspect';

export interface StalenessReport {
  freshness: Freshness;
  /** Whole days between the advisory date and now. Null when unknown. */
  ageDays: number | null;
  /** The advisory's own date, as published. */
  advisoryDate: string | null;
  validUntil: string | null;
  /** True for anything the user must not mistake for current data. */
  isDead: boolean;
  /** True when the banner must not be dismissible. */
  mustWarn: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC on an ISO date, so comparisons are whole days, not part-days. */
function dayStart(iso: string): number | null {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function todayStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function assess(doc: PfzDocument | null, now: Date): StalenessReport {
  if (!doc) {
    return {
      freshness: 'none',
      ageDays: null,
      advisoryDate: null,
      validUntil: null,
      isDead: true,
      mustWarn: true,
    };
  }

  const advisoryDate = doc.advisory_date;
  const validUntil = doc.valid_until;
  const issued = advisoryDate ? dayStart(advisoryDate) : null;
  const ageDays = issued === null ? null : Math.round((todayStart(now) - issued) / DAY_MS);

  // A negative age means the device clock is wrong, or the advisory is from the
  // future. Either way, saying "minus two days old" would be nonsense and
  // claiming freshness would be dangerous.
  if (ageDays !== null && ageDays < 0) {
    return {
      freshness: 'clock_suspect',
      ageDays,
      advisoryDate,
      validUntil,
      isDead: false,
      mustWarn: true,
    };
  }

  // Expiry first: it outranks age. valid_until is inclusive, so an advisory valid
  // until the 28th is still live throughout the 28th.
  if (validUntil) {
    const expires = dayStart(validUntil);
    if (expires !== null && todayStart(now) > expires) {
      return { freshness: 'expired', ageDays, advisoryDate, validUntil, isDead: true, mustWarn: true };
    }
  }

  // No advisory date at all. This is the legitimate all-sectors-cloudy case:
  // INCOIS only stamps a timestamp on a populated page. It is not stale, but it
  // cannot be called fresh either, so it warns without being treated as dead.
  if (ageDays === null) {
    return { freshness: 'aging', ageDays: null, advisoryDate, validUntil, isDead: false, mustWarn: true };
  }

  if (ageDays > 3) {
    return { freshness: 'stale', ageDays, advisoryDate, validUntil, isDead: true, mustWarn: true };
  }
  if (ageDays >= 2) {
    return { freshness: 'aging', ageDays, advisoryDate, validUntil, isDead: false, mustWarn: true };
  }
  return { freshness: 'fresh', ageDays, advisoryDate, validUntil, isDead: false, mustWarn: false };
}
