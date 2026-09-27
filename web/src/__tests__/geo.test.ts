/**
 * The cross-language drift check.
 *
 * The pipeline computes bearings in Python with geographiclib; the app recomputes
 * them in TypeScript when the home port changes. Two implementations of the same
 * maths will drift apart eventually, and here drift means a wrong course on a
 * boat. So both are checked against the same golden file.
 */

import { describe, expect, it } from 'vitest';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { KM_PER_NAUTICAL_MILE, compassPoint, inverse, toDms } from '../lib/geo';
import { validateDocument } from '../lib/pfz';

const doc = validateDocument(golden);
const home = doc.home_port;

describe('agreement with the pipeline', () => {
  it('reproduces every zone from the golden file', () => {
    const zones = doc.sectors.flatMap((s) => s.zones);
    expect(zones.length).toBeGreaterThan(0);

    for (const zone of zones) {
      const v = inverse(home.lat, home.lon, zone.lat, zone.lon);
      // The published figures are rounded to one decimal place, so agreement is
      // asserted at that precision. Any real divergence in the maths shows up far
      // above this threshold.
      expect(v.distanceKm).toBeCloseTo(zone.from_home.distance_km, 1);
      expect(v.distanceNmi).toBeCloseTo(zone.from_home.distance_nmi, 1);
      expect(v.bearingDeg).toBeCloseTo(zone.from_home.bearing_deg, 1);
      expect(v.compass).toBe(zone.from_home.compass);
    }
  });

  it('matches the two anchor zones to three decimal places', () => {
    // Karwar and Hosabettu-Udaivar, the farthest and nearest in the golden file.
    // These exact numbers came out of geographiclib.
    const karwar = inverse(home.lat, home.lon, 14.819444, 73.307222);
    expect(karwar.distanceKm).toBeCloseTo(628.366, 2);
    expect(karwar.distanceNmi).toBeCloseTo(339.291, 2);
    expect(karwar.bearingDeg).toBeCloseTo(329.5633, 3);

    const hosabettu = inverse(home.lat, home.lon, 12.873611, 73.776111);
    expect(hosabettu.distanceKm).toBeCloseTo(423.14, 2);
    expect(hosabettu.bearingDeg).toBeCloseTo(320.382, 3);
  });

  it('reproduces the published DMS strings from the coordinates', () => {
    for (const zone of doc.sectors.flatMap((s) => s.zones)) {
      expect(toDms(zone.lat, 'lat')).toBe(zone.lat_dms);
      expect(toDms(zone.lon, 'lon')).toBe(zone.lon_dms);
    }
  });
});

describe('inverse', () => {
  it('returns zero for the same point', () => {
    expect(inverse(home.lat, home.lon, home.lat, home.lon).distanceKm).toBeCloseTo(0, 6);
  });

  it('normalises a westward bearing to 270 rather than -90', () => {
    const v = inverse(0, 10, 0, 0);
    expect(v.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(v.bearingDeg).toBeLessThan(360);
    expect(v.bearingDeg).toBeCloseTo(270, 6);
  });

  it('treats a nautical mile as exactly 1852 metres', () => {
    expect(KM_PER_NAUTICAL_MILE).toBe(1.852);
    const v = inverse(home.lat, home.lon, 14.819444, 73.307222);
    expect(v.distanceNmi).toBeCloseTo(v.distanceKm / 1.852, 9);
  });
});

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [359.9, 'N'],
    [11.24, 'N'],
    [11.26, 'NNE'],
    [348.75, 'N'],
    [348.74, 'NNW'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [329.5633, 'NNW'],
    [360, 'N'],
    [720, 'N'],
  ])('names %s as %s', (bearing, expected) => {
    expect(compassPoint(bearing)).toBe(expected);
  });
});

describe('toDms', () => {
  it.each([
    [14.819444, 'lat', '14 49 10 N'],
    [73.307222, 'lon', '73 18 26 E'],
    [14.666667, 'lat', '14 40 0 N'],
    [-12.873611, 'lat', '12 52 25 S'],
    [-73.776111, 'lon', '73 46 34 W'],
  ] as const)('renders %s as %s', (value, axis, expected) => {
    expect(toDms(value, axis)).toBe(expected);
  });
});
