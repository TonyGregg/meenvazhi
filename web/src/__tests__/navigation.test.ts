/**
 * Speed and ETA. Positions here move a boat due north from Kochi at known speeds:
 * one minute of latitude is one nautical mile, which makes the expected figures easy
 * to check by hand.
 */

import { describe, expect, it } from 'vitest';
import { MIN_SPEED_KNOTS, estimateArrival, smoothedSpeedKnots, splitDuration, type Fix } from '../lib/navigation';

const START = Date.parse('2026-10-04T06:00:00Z');
const NMI_IN_DEGREES = 1 / 60;

/** A boat heading due north at `knots`, one fix every `everySec` seconds. */
function track(knots: number, count: number, everySec = 10, reported: number | null = null): Fix[] {
  return Array.from({ length: count }, (_, i) => {
    const hours = (i * everySec) / 3600;
    return { timeMs: START + i * everySec * 1000, lat: 9.937 + knots * hours * NMI_IN_DEGREES, lon: 76.261, speedKnots: reported };
  });
}

describe('smoothedSpeedKnots', () => {
  it('averages the speeds the receiver reports', () => {
    const fixes = track(0, 6).map((f, i) => ({ ...f, speedKnots: [7, 8, 7.5, 8.5, 7, 7][i] ?? null }));
    expect(smoothedSpeedKnots(fixes, START + 60_000)).toBeCloseTo(7.5, 5);
  });

  it('works speed out from positions when the receiver reports none', () => {
    const fixes = track(8, 13); // two minutes at 8 knots
    expect(smoothedSpeedKnots(fixes, START + 120_000)).toBeCloseTo(8, 1);
  });

  it('ignores fixes older than the two-minute window', () => {
    const old = { timeMs: START - 10 * 60_000, lat: 9.0, lon: 76.0, speedKnots: 30 };
    const fixes = [old, ...track(0, 6).map((f) => ({ ...f, speedKnots: 6 }))];
    expect(smoothedSpeedKnots(fixes, START + 50_000)).toBeCloseTo(6, 5);
  });

  it('will not guess a speed from too short a stretch of positions', () => {
    // 20 seconds is not enough to separate real movement from GPS wander.
    expect(smoothedSpeedKnots(track(8, 3), START + 20_000)).toBeNull();
  });

  it('returns null with nothing to go on', () => {
    expect(smoothedSpeedKnots([], START)).toBeNull();
  });

  it('reads a stationary boat as close to zero, not as a speed', () => {
    const fixes = track(0, 13);
    expect(smoothedSpeedKnots(fixes, START + 120_000)).toBeCloseTo(0, 3);
  });

  it('discards nonsense reported speeds', () => {
    const fixes = track(0, 4).map((f, i) => ({ ...f, speedKnots: [Number.NaN, -3, 7, 8][i] ?? null }));
    expect(smoothedSpeedKnots(fixes, START + 30_000)).toBeCloseTo(7.5, 5);
  });
});

describe('estimateArrival', () => {
  const now = new Date(START);

  it('divides distance by GPS speed when the boat is moving', () => {
    const eta = estimateArrival(38, 7.5, null, now)!;
    expect(eta.minutes).toBe(304); // 38 / 7.5 = 5.0667 h
    expect(eta.source).toBe('gps');
    expect(eta.at.toISOString()).toBe('2026-10-04T11:04:00.000Z');
  });

  it('prefers GPS speed over the cruising speed while moving', () => {
    expect(estimateArrival(30, 6, 10, now)!.speedKnots).toBe(6);
  });

  it('uses the cruising speed when the boat is not moving, as in harbour', () => {
    const eta = estimateArrival(120, 0.3, 8, now)!;
    expect(eta.source).toBe('cruise');
    expect(eta.minutes).toBe(900);
  });

  it('uses the cruising speed when there is no GPS at all', () => {
    expect(estimateArrival(16, null, 8, now)!.minutes).toBe(120);
  });

  it('gives no ETA when drifting with no cruising speed set', () => {
    expect(estimateArrival(30, MIN_SPEED_KNOTS - 0.1, null, now)).toBeNull();
    expect(estimateArrival(30, null, null, now)).toBeNull();
  });

  it('treats one knot as the threshold for moving', () => {
    expect(estimateArrival(10, 1, null, now)!.minutes).toBe(600);
  });
});

describe('splitDuration', () => {
  it.each([
    [0, { days: 0, hours: 0, mins: 0 }],
    [59, { days: 0, hours: 0, mins: 59 }],
    [304, { days: 0, hours: 5, mins: 4 }],
    [1440, { days: 1, hours: 0, mins: 0 }],
    [2000, { days: 1, hours: 9, mins: 20 }],
  ])('splits %i minutes', (minutes, expected) => {
    expect(splitDuration(minutes)).toEqual(expected);
  });
});
