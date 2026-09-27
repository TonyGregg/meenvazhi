/**
 * Changing the home port, which has to work with no signal.
 *
 * This is the reason the geodesics are duplicated in TypeScript at all. If a new
 * home port required a pipeline run, the setting would be useless in the only place
 * it matters.
 */

import { describe, expect, it } from 'vitest';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { portBySlug } from '../data/ports';
import { withHomePort } from '../lib/recompute';
import { allZones, validateDocument } from '../lib/pfz';

const doc = validateDocument(golden);
const kochi = portBySlug('kochi')!;
const mangalore = portBySlug('mangalore')!;

describe('withHomePort', () => {
  it('returns the original untouched when nothing changed', () => {
    expect(withHomePort(doc, kochi, doc.reachable_nmi)).toBe(doc);
  });

  it('reproduces the published figures when recomputing for the same port', () => {
    // Forces the recompute path by changing the range, then checks the bearings
    // still match what Python published. This is the cross-language check applied
    // through the app's own code path rather than through geo directly.
    const same = withHomePort(doc, kochi, 999);
    for (const [i, zone] of allZones(same).entries()) {
      const original = allZones(doc)[i]!;
      expect(zone.from_home.bearing_deg).toBeCloseTo(original.from_home.bearing_deg, 1);
      expect(zone.from_home.distance_nmi).toBeCloseTo(original.from_home.distance_nmi, 1);
    }
  });

  it('moves every zone closer when the port moves toward them', () => {
    // The Karnataka zones lie north of Kochi, so Mangalore is much nearer to them.
    const from = withHomePort(doc, mangalore, null);
    const before = allZones(doc);
    const after = allZones(from);
    expect(after.length).toBe(before.length);
    for (const zone of after) {
      const original = before.find((z) => z.id === zone.id)!;
      expect(zone.from_home.distance_nmi).toBeLessThan(original.from_home.distance_nmi);
    }
    expect(from.home_port.id).toBe('mangalore');
  });

  it('makes zones reachable that were not, once the port is nearer', () => {
    // From Kochi nothing is inside 120 nmi. From Mangalore most of it is.
    expect(doc.counts.reachable).toBe(0);
    const from = withHomePort(doc, mangalore, 120);
    expect(from.counts.reachable).toBeGreaterThan(0);
  });

  it('treats a null range as no limit', () => {
    const from = withHomePort(doc, kochi, null);
    expect(allZones(from).every((z) => z.from_home.reachable)).toBe(true);
    expect(from.counts.reachable).toBe(from.counts.zones);
  });

  it('keeps zones sorted nearest first', () => {
    const from = withHomePort(doc, mangalore, null);
    for (const sector of from.sectors) {
      const distances = sector.zones.map((z) => z.from_home.distance_nmi);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    }
  });

  it('leaves the INCOIS figures untouched', () => {
    // Theirs are measured from the local landing centre and are not ours to change.
    const from = withHomePort(doc, mangalore, null);
    for (const zone of allZones(from)) {
      const original = allZones(doc).find((z) => z.id === zone.id)!;
      expect(zone.incois).toEqual(original.incois);
      expect(zone.lat).toBe(original.lat);
      expect(zone.lon).toBe(original.lon);
      expect(zone.lat_dms).toBe(original.lat_dms);
    }
  });
});
