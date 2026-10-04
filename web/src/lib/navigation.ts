/**
 * Speed over ground and the time to reach a zone.
 *
 * Pure functions with the clock passed in, so every case is testable without a
 * moving boat.
 */

import { inverse } from './geo';

/** One GPS fix, as the location hooks record it. */
export interface Fix {
  /** When the fix was taken, from the GPS itself, in milliseconds. */
  timeMs: number;
  lat: number;
  lon: number;
  /** Speed over ground the receiver reported, in knots. Null when it reported none. */
  speedKnots: number | null;
}

/** How far back speed is averaged. A rolling boat makes single readings jump about. */
export const SPEED_WINDOW_MS = 2 * 60 * 1000;

/**
 * Below this the boat is drifting, anchored or tied up, and an ETA would be
 * meaningless: at half a knot, every zone is days away.
 */
export const MIN_SPEED_KNOTS = 1;

/** How long a stretch of positions must cover before distance over time is trusted. */
const MIN_TRACK_MS = 30 * 1000;

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Speed over ground averaged over the last two minutes, in knots, or null if there
 * is not enough to go on.
 *
 * Prefers the speeds the receiver reports, which come from the Doppler shift of the
 * satellite signals and are steadier than anything worked out from positions. When
 * a phone does not report them, falls back to the distance between the oldest and
 * newest fix in the window divided by the time between them.
 */
export function smoothedSpeedKnots(fixes: readonly Fix[], nowMs: number, windowMs = SPEED_WINDOW_MS): number | null {
  const recent = fixes.filter((f) => nowMs - f.timeMs <= windowMs && f.timeMs <= nowMs);
  const reported = recent
    .map((f) => f.speedKnots)
    .filter((s): s is number => s !== null && Number.isFinite(s) && s >= 0);

  // The receiver's own speed whenever it gives one: it is measured directly, and is
  // better than anything worked out from positions that wander by metres.
  if (reported.length > 0) return mean(reported);

  const first = recent[0];
  const last = recent.at(-1);
  if (first && last && last.timeMs - first.timeMs >= MIN_TRACK_MS) {
    const hours = (last.timeMs - first.timeMs) / 3_600_000;
    return inverse(first.lat, first.lon, last.lat, last.lon).distanceNmi / hours;
  }
  return null;
}

export type SpeedSource = 'gps' | 'cruise';

export interface Arrival {
  /** Whole minutes to the zone. */
  minutes: number;
  /** When the boat would arrive, holding this speed on a straight course. */
  at: Date;
  speedKnots: number;
  /** Whether the speed came from GPS or from the cruising speed set in Settings. */
  source: SpeedSource;
}

/**
 * Time to a zone at the current speed, or at the cruising speed when GPS shows the
 * boat is not moving or GPS gives no speed at all.
 *
 * Returns null when neither speed is usable. An estimate along a straight line at
 * constant speed: currents, wind and changes of course will all move it.
 */
export function estimateArrival(
  distanceNmi: number,
  gpsSpeedKnots: number | null,
  cruiseSpeedKnots: number | null,
  now: Date,
): Arrival | null {
  const moving = gpsSpeedKnots !== null && gpsSpeedKnots >= MIN_SPEED_KNOTS;
  const speed = moving ? gpsSpeedKnots : cruiseSpeedKnots;
  if (speed === null || !Number.isFinite(speed) || speed < MIN_SPEED_KNOTS) return null;

  const minutes = Math.round((distanceNmi / speed) * 60);
  return {
    minutes,
    at: new Date(now.getTime() + minutes * 60_000),
    speedKnots: speed,
    source: moving ? 'gps' : 'cruise',
  };
}

/** Split minutes into days, hours and minutes, for the duration strings. */
export function splitDuration(minutes: number): { days: number; hours: number; mins: number } {
  const total = Math.max(0, Math.round(minutes));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), mins: total % 60 };
}
