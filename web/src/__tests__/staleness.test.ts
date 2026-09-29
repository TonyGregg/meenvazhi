/**
 * The staleness rules, which are the app's safety logic.
 *
 * A fisherman five days into a trip must not be shown an expired advisory as
 * though it were current. Every case below is a real situation on a boat.
 */

import { describe, expect, it } from 'vitest';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { assess } from '../lib/staleness';
import { validateDocument, type PfzDocument } from '../lib/pfz';

const base = validateDocument(golden);

/** The golden advisory: issued 27 Sep 2026, valid until the 28th. */
function doc(overrides: Partial<PfzDocument> = {}): PfzDocument {
  return { ...base, ...overrides };
}

const at = (iso: string): Date => new Date(iso);

describe('no data at all', () => {
  it('reports none and demands a warning', () => {
    const r = assess(null, at('2026-09-27T12:00:00Z'));
    expect(r.freshness).toBe('none');
    expect(r.isDead).toBe(true);
    expect(r.mustWarn).toBe(true);
    expect(r.ageDays).toBeNull();
  });
});

describe('within validity', () => {
  it('is fresh on the day it was issued', () => {
    const r = assess(doc(), at('2026-09-27T18:00:00Z'));
    expect(r.freshness).toBe('fresh');
    expect(r.ageDays).toBe(0);
    expect(r.mustWarn).toBe(false);
    expect(r.isDead).toBe(false);
  });

  it('is still fresh the next day, while valid_until has not passed', () => {
    const r = assess(doc(), at('2026-09-28T06:00:00Z'));
    expect(r.freshness).toBe('fresh');
    expect(r.ageDays).toBe(1);
  });

  it('treats valid_until as inclusive, so the last day still counts', () => {
    const r = assess(doc(), at('2026-09-28T23:59:00Z'));
    expect(r.freshness).toBe('fresh');
    expect(r.isDead).toBe(false);
  });
});

describe('expiry outranks age', () => {
  it('is expired the day after valid_until, though only two days old', () => {
    const r = assess(doc(), at('2026-09-29T00:30:00Z'));
    expect(r.freshness).toBe('expired');
    expect(r.ageDays).toBe(2);
    expect(r.isDead).toBe(true);
    expect(r.mustWarn).toBe(true);
  });

  it('is expired on day five of a trip', () => {
    const r = assess(doc(), at('2026-10-02T09:00:00Z'));
    expect(r.freshness).toBe('expired');
    expect(r.ageDays).toBe(5);
    expect(r.isDead).toBe(true);
  });

  it('expires a freshly downloaded copy of an old advisory', () => {
    // The point of computing freshness from INCOIS's dates and not from
    // fetchedAt: re-fetching an old file must not make it look current.
    const r = assess(doc(), at('2026-10-05T09:00:00Z'));
    expect(r.freshness).toBe('expired');
  });
});

describe('aging and stale, when no validity was published', () => {
  // Blank every source of validity, including INCOIS's landing-page date.
  const noValidity = () => doc({ valid_until: null, valid_upto: null });

  it('is aging at two days', () => {
    const r = assess(noValidity(), at('2026-09-29T09:00:00Z'));
    expect(r.freshness).toBe('aging');
    expect(r.ageDays).toBe(2);
    expect(r.mustWarn).toBe(true);
    expect(r.isDead).toBe(false);
  });

  it('is aging at three days', () => {
    expect(assess(noValidity(), at('2026-09-30T09:00:00Z')).freshness).toBe('aging');
  });

  it('is stale at four days', () => {
    const r = assess(noValidity(), at('2026-10-01T09:00:00Z'));
    expect(r.freshness).toBe('stale');
    expect(r.ageDays).toBe(4);
    expect(r.isDead).toBe(true);
  });
});

describe('an all-cloudy day', () => {
  it('warns without being treated as dead when no advisory date exists', () => {
    // INCOIS only stamps a timestamp on a populated page, so a day where every
    // sector is cloud-covered legitimately has no advisory_date. That is not
    // stale data, but it cannot be called fresh either.
    const r = assess(
      doc({ advisory_date: null, valid_until: null, forecast_date: null, valid_upto: null }),
      at('2026-09-27T12:00:00Z'),
    );
    expect(r.freshness).toBe('aging');
    expect(r.ageDays).toBeNull();
    expect(r.isDead).toBe(false);
    expect(r.mustWarn).toBe(true);
  });
});

describe('a wrong device clock', () => {
  it('says the clock is suspect rather than showing a negative age', () => {
    const r = assess(doc(), at('2026-09-20T09:00:00Z'));
    expect(r.freshness).toBe('clock_suspect');
    expect(r.ageDays).toBeLessThan(0);
    expect(r.mustWarn).toBe(true);
    // Not marked dead: the data may well be fine and the clock wrong.
    expect(r.isDead).toBe(false);
  });
});

describe('what the report always carries', () => {
  it('reports the advisory dates so the UI can show absolute and relative together', () => {
    const r = assess(doc(), at('2026-09-29T09:00:00Z'));
    expect(r.advisoryDate).toBe('2026-09-27');
    expect(r.validUntil).toBe('2026-09-28');
  });

  it('marks everything below fresh as requiring a warning', () => {
    const cases: Array<[PfzDocument | null, string]> = [
      [null, '2026-09-27T09:00:00Z'],
      [doc({ valid_until: null, valid_upto: null }), '2026-09-29T09:00:00Z'],
      [doc({ valid_until: null, valid_upto: null }), '2026-10-01T09:00:00Z'],
      [doc(), '2026-09-29T09:00:00Z'],
      [doc(), '2026-09-20T09:00:00Z'],
    ];
    for (const [d, when] of cases) {
      const r = assess(d, at(when));
      expect(r.freshness).not.toBe('fresh');
      expect(r.mustWarn).toBe(true);
    }
  });
});

describe("INCOIS's landing-page dates", () => {
  it('are preferred over the dates taken from sector pages', () => {
    // A landing page saying the forecast is for the 29th wins over a sector date of the 27th.
    const r = assess(doc({ forecast_date: '2026-09-29', valid_upto: '2026-09-30' }), at('2026-09-30T09:00:00Z'));
    expect(r.advisoryDate).toBe('2026-09-29');
    expect(r.validUntil).toBe('2026-09-30');
    expect(r.freshness).toBe('fresh');
  });

  it('make an all-cloudy day fresh rather than undated', () => {
    // Every sector cloud-covered: the sector pages carry no date, the landing page does.
    const r = assess(
      doc({ advisory_date: null, valid_until: null, forecast_date: '2026-09-27', valid_upto: '2026-09-28' }),
      at('2026-09-27T12:00:00Z'),
    );
    expect(r.freshness).toBe('fresh');
    expect(r.mustWarn).toBe(false);
  });

  it('still expire once Valid upto has passed', () => {
    const r = assess(doc({ forecast_date: '2026-09-27', valid_upto: '2026-09-28' }), at('2026-09-29T01:00:00Z'));
    expect(r.freshness).toBe('expired');
  });

  it('fall back to the sector dates for documents published before they existed', () => {
    const older = { ...base };
    delete older.forecast_date;
    delete older.valid_upto;
    const r = assess(older, at('2026-09-27T12:00:00Z'));
    expect(r.advisoryDate).toBe('2026-09-27');
    expect(r.validUntil).toBe('2026-09-28');
  });
});

