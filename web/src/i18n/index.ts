import { en } from './en';
import { ml } from './ml';
import { ta } from './ta';
import type { Messages } from './en';

export type { Messages };
export type Locale = 'en' | 'ml' | 'ta';

export const LOCALES: readonly Locale[] = ['ml', 'ta', 'en'] as const;

/** Each language named in itself, never in English. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ml: 'മലയാളം',
  ta: 'தமிழ்',
};

const CATALOGUES: Record<Locale, Messages> = { en, ml, ta };

/** BCP 47 tags, used for `<html lang>` and for Intl date formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-IN',
  ml: 'ml-IN',
  ta: 'ta-IN',
};

export function messages(locale: Locale): Messages {
  return CATALOGUES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ml' || value === 'ta';
}

/** Malayalam or Tamil if the device asks for it, English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'ml' || primary === 'ta' || primary === 'en') return primary;
  }
  return 'en';
}
