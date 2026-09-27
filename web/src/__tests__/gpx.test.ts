/**
 * The client-side GPX, checked against what real GPS units accept.
 *
 * Same constraints as the Python writer, and for the same reason: a name longer
 * than six characters gets truncated and silently merged by older Garmin, Lowrance
 * and Simrad units, and Indic text comes out as mojibake or gets the file rejected.
 */

import { describe, expect, it } from 'vitest';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { buildGpx, gpxFilename, safeName } from '../lib/gpx';
import { allZones, validateDocument, type Zone } from '../lib/pfz';

const doc = validateDocument(golden);
const zones = allZones(doc);
const sectorNameOf = (zone: Zone): string =>
  doc.sectors.find((s) => s.zones.some((z) => z.id === zone.id))?.sector_name ?? '';

const gpx = buildGpx(doc, zones, sectorNameOf);

function parse(text: string): Document {
  const parsed = new DOMParser().parseFromString(text, 'application/xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
  return parsed;
}

describe('buildGpx', () => {
  it('produces well-formed GPX 1.1', () => {
    const root = parse(gpx).documentElement;
    expect(root.tagName).toBe('gpx');
    expect(root.getAttribute('version')).toBe('1.1');
    expect(root.namespaceURI).toBe('http://www.topografix.com/GPX/1/1');
  });

  it('emits one waypoint per zone', () => {
    expect(parse(gpx).querySelectorAll('wpt')).toHaveLength(zones.length);
    expect(zones.length).toBe(20);
  });

  it('keeps every name within what a unit can store', () => {
    for (const wpt of parse(gpx).querySelectorAll('wpt')) {
      expect(wpt.querySelector('name')?.textContent ?? '').toMatch(/^[A-Z0-9]{1,6}$/);
    }
  });

  it('keeps names unique after a unit truncates them to six characters', () => {
    const names = [...parse(gpx).querySelectorAll('name')].map((n) => (n.textContent ?? '').slice(0, 6));
    // The metadata name is in there too, so compare only the waypoint names.
    const waypointNames = names.filter((n) => /^[A-Z0-9]{1,6}$/.test(n));
    expect(new Set(waypointNames).size).toBe(waypointNames.length);
  });

  it('keeps comments short enough for a unit display line', () => {
    for (const cmt of parse(gpx).querySelectorAll('cmt')) {
      expect((cmt.textContent ?? '').length).toBeLessThanOrEqual(40);
    }
  });

  it('contains no non-ASCII anywhere', () => {
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(gpx)).toBe(false);
  });

  it('has no byte-order mark and uses newline endings', () => {
    expect(gpx.startsWith('﻿')).toBe(false);
    expect(gpx).not.toContain('\r');
    expect(gpx.endsWith('\n')).toBe(true);
  });

  it('writes coordinates at six decimal places', () => {
    for (const wpt of parse(gpx).querySelectorAll('wpt')) {
      expect(wpt.getAttribute('lat')).toMatch(/^-?\d+\.\d{6}$/);
      expect(wpt.getAttribute('lon')).toMatch(/^-?\d+\.\d{6}$/);
    }
  });

  it('carries the credit and the disclaimer', () => {
    const desc = parse(gpx).querySelector('metadata > desc')?.textContent ?? '';
    expect(desc).toContain('INCOIS');
    expect(desc).toContain('Not for navigation');
  });

  it('names the home port in each description, not just the coast', () => {
    const desc = parse(gpx).querySelector('wpt > desc')?.textContent ?? '';
    expect(desc).toContain('Kochi');
    expect(desc).toContain('deg true');
  });

  it('handles an empty selection', () => {
    const empty = buildGpx(doc, [], sectorNameOf);
    expect(parse(empty).querySelectorAll('wpt')).toHaveLength(0);
  });

  it('escapes XML metacharacters rather than emitting them raw', () => {
    const zone = { ...zones[0]!, landing_centre: 'Fish & <Chips>' };
    const text = buildGpx(doc, [zone], () => 'A & B');
    expect(text).not.toMatch(/<cmt>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(parse(text).querySelectorAll('wpt')).toHaveLength(1);
  });
});

describe('safeName', () => {
  it.each([
    ['KA01', 'KA01'],
    ['ka01', 'KA01'],
    ['KARNATAKA01', 'KARNAT'],
    ['KA-01', 'KA01'],
    ['മീൻ', 'WPT'],
    ['', 'WPT'],
  ])('turns %s into %s', (input, expected) => {
    expect(safeName(input)).toBe(expected);
  });
});

describe('gpxFilename', () => {
  it('names the file after the advisory date', () => {
    expect(gpxFilename(doc)).toBe('meenvazhi-pfz-2026-09-27.gpx');
  });
});
