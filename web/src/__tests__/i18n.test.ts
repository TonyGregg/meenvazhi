/**
 * Translation completeness and the rules the catalogues have to obey.
 *
 * TypeScript already guarantees no key is missing. These tests catch the things it
 * cannot see: an English string left in a translated file, a script that ended up
 * in the wrong catalogue, or Indic numerals sneaking into a figure someone reads
 * against a GPS display.
 */

import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { ml } from '../i18n/ml';
import { ta } from '../i18n/ta';
import { LOCALES, LOCALE_NAMES, detectLocale, isLocale, messages } from '../i18n';
import { bearing, nmi, shortDate } from '../lib/format';

const CATALOGUES = { en, ml, ta } as const;
const MALAYALAM = /[ഀ-ൿ]/;
const TAMIL = /[஀-௿]/;

function stringsOf(catalogue: Record<string, unknown>): [string, string][] {
  return Object.entries(catalogue).flatMap(([key, value]) => {
    if (typeof value === 'string') return [[key, value] as [string, string]];
    // Call the functions with plausible arguments so their output is checked too.
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      const attempts = [[2], ['27 Sep 2026'], ['W', 270, 'Karwar'], ['1 MB']];
      for (const args of attempts) {
        try {
          const out = fn(...args);
          if (typeof out === 'string') return [[key, out] as [string, string]];
        } catch {
          // Wrong shape; try the next.
        }
      }
    }
    return [];
  });
}

describe('every catalogue', () => {
  it.each(Object.keys(CATALOGUES))('%s has the same keys as English', (name) => {
    const catalogue = CATALOGUES[name as keyof typeof CATALOGUES];
    expect(Object.keys(catalogue).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.keys(CATALOGUES))('%s has no empty strings except the script label', (name) => {
    for (const [key, value] of stringsOf(CATALOGUES[name as keyof typeof CATALOGUES])) {
      if (key === 'script') continue;
      expect(value.trim(), `${name}.${key}`).not.toBe('');
    }
  });

  it.each(Object.keys(CATALOGUES))('%s keeps the brand name in Latin so it is recognisable', (name) => {
    expect(CATALOGUES[name as keyof typeof CATALOGUES].appName).toBe('Meenvazhi');
  });

  it.each(Object.keys(CATALOGUES))('%s credits INCOIS', (name) => {
    expect(CATALOGUES[name as keyof typeof CATALOGUES].credit).toContain('INCOIS');
  });
});

describe('the translated catalogues are actually translated', () => {
  // Keys whose value is legitimately identical across languages.
  const SHARED = new Set(['appName', 'degreesTrue']);

  it('Malayalam is in Malayalam script, not English', () => {
    const translated = stringsOf(ml).filter(([k]) => !SHARED.has(k) && k !== 'script');
    const englishLeftovers = translated.filter(([key, value]) => {
      const source = (en as Record<string, unknown>)[key];
      return typeof source === 'string' && source === value;
    });
    expect(englishLeftovers.map(([k]) => k)).toEqual([]);
  });

  it('Tamil is in Tamil script, not English', () => {
    const translated = stringsOf(ta).filter(([k]) => !SHARED.has(k) && k !== 'script');
    const englishLeftovers = translated.filter(([key, value]) => {
      const source = (en as Record<string, unknown>)[key];
      return typeof source === 'string' && source === value;
    });
    expect(englishLeftovers.map(([k]) => k)).toEqual([]);
  });

  it('does not mix the two scripts up', () => {
    expect(MALAYALAM.test(ml.script)).toBe(true);
    expect(TAMIL.test(ta.script)).toBe(true);
    expect(TAMIL.test(ml.script)).toBe(false);
    expect(MALAYALAM.test(ta.script)).toBe(false);
  });

  it('renders the hard strings the fonts have to cope with', () => {
    // Malayalam conjuncts and a chillu; Tamil ligatures. If the subset font loses
    // its layout tables these are what break first.
    expect(ml.script).toBe('മീൻവഴി');
    expect(ta.script).toBe('மீன்வழி');
  });

  it('never uses Indic numerals in a figure read against a GPS display', () => {
    const indicDigits = /[൦-൯௦-௯]/;
    for (const catalogue of [ml, ta]) {
      for (const [key, value] of stringsOf(catalogue)) {
        expect(indicDigits.test(value), `${key}: ${value}`).toBe(false);
      }
    }
  });
});

describe('plurals', () => {
  it('says "1 day old", not "1 days old"', () => {
    // Seen on the Android emulator the first time the app ran offline.
    expect(en.ageDays(1)).toBe('1 day old');
    expect(en.ageDays(5)).toBe('5 days old');
  });
});

describe('locale selection', () => {
  it('offers Malayalam and Tamil before English', () => {
    expect(LOCALES[0]).toBe('ml');
    expect(LOCALES).toContain('ta');
    expect(LOCALES).toContain('en');
  });

  it('names each language in itself', () => {
    expect(LOCALE_NAMES.ml).toBe('മലയാളം');
    expect(LOCALE_NAMES.ta).toBe('தமிழ்');
    expect(LOCALE_NAMES.en).toBe('English');
  });

  it.each([
    [['ml-IN'], 'ml'],
    [['ml'], 'ml'],
    [['ta-IN', 'en-GB'], 'ta'],
    [['en-US'], 'en'],
    [['hi-IN', 'ml-IN'], 'ml'],
    [['fr-FR'], 'en'],
    [[], 'en'],
  ] as const)('maps %s to %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });

  it('rejects anything that is not a supported locale', () => {
    expect(isLocale('ml')).toBe(true);
    expect(isLocale('hi')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('returns a catalogue for every locale', () => {
    for (const locale of LOCALES) expect(messages(locale).appName).toBe('Meenvazhi');
  });
});

describe('number and date presentation', () => {
  it('zero-pads bearings to three digits the way a GPS unit shows them', () => {
    expect(bearing(7)).toBe('007');
    expect(bearing(70.4)).toBe('070');
    expect(bearing(329.6)).toBe('330');
    expect(bearing(360)).toBe('000');
    expect(bearing(-90)).toBe('270');
  });

  it('uses Latin digits regardless of locale', () => {
    for (const tag of ['en-IN', 'ml-IN', 'ta-IN']) {
      expect(shortDate('2026-09-27', tag)).toMatch(/\d{4}/);
    }
    expect(nmi(1234)).toMatch(/^[\d,]+$/);
  });

  it('puts day before month before year in every language', () => {
    // Intl's own patterns disagree: en-IN gives "27 Sept 2026" while ml-IN gives
    // "2026 സെപ്റ്റം 27", year first. Someone checking a date against the printed
    // advisory must not have to work out which number is the day.
    expect(shortDate('2026-09-27', 'en-IN')).toBe('27 Sept 2026');
    expect(shortDate('2026-09-27', 'ml-IN')).toBe('27 സെപ്റ്റം 2026');
    expect(shortDate('2026-09-27', 'ta-IN')).toBe('27 செப் 2026');
  });

  it('starts every localised date with the day of the month', () => {
    for (const tag of ['en-IN', 'ml-IN', 'ta-IN']) {
      expect(shortDate('2026-09-27', tag).startsWith('27'), tag).toBe(true);
      expect(shortDate('2026-09-27', tag).endsWith('2026'), tag).toBe(true);
    }
  });

  it('strips the trailing separator some locales attach to the month', () => {
    // Tamil's default pattern yields "செப்., 2026"; the comma must not survive.
    expect(shortDate('2026-09-27', 'ta-IN')).not.toContain(',');
  });

  it('survives a malformed date rather than throwing', () => {
    expect(shortDate(null)).toBe('');
    expect(shortDate('not-a-date')).toBe('not-a-date');
  });
});
