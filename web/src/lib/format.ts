/**
 * Number and date presentation.
 *
 * One rule dominates: always Latin digits, in every language. Bearings are read
 * off a GPS unit that shows Latin digits, so rendering Malayalam or Tamil
 * numerals would be a translation that makes the app harder to use, not easier.
 * Hence numberingSystem: 'latn' everywhere.
 */

const LATIN = { numberingSystem: 'latn' } as const;

/** A bearing as a GPS unit shows it: three digits, zero-padded, true. */
export function bearing(deg: number): string {
  const rounded = Math.round(((deg % 360) + 360) % 360) % 360;
  return String(rounded).padStart(3, '0');
}

export function nmi(value: number): string {
  return new Intl.NumberFormat('en-IN', { ...LATIN, maximumFractionDigits: 0 }).format(value);
}

export function km(value: number): string {
  return new Intl.NumberFormat('en-IN', { ...LATIN, maximumFractionDigits: 0 }).format(value);
}

export function depthRange(from: number, to: number): string {
  return `${km(from)}–${km(to)}`;
}

/**
 * A date as day, short month, year, in that order, in every language.
 *
 * Assembled from parts rather than taken from Intl's default pattern, because the
 * patterns disagree on order: en-IN gives "27 Sept 2026" but ml-IN gives
 * "2026 സെപ്റ്റം 27", year first. Someone comparing a date on this screen against
 * the INCOIS advisory, or against a date they were told on the radio, should not
 * have to work out which number is the day. The month name stays localised; only
 * the order is fixed.
 */
export function shortDate(iso: string | null, locale = 'en-IN'): string {
  if (!iso) return '';
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;

  const parts = new Intl.DateTimeFormat(locale, {
    ...LATIN,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(ms));

  const find = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  // Strip any trailing separator the locale attached to the month, such as the
  // full stop and comma in Tamil's "செப்., 2026".
  const month = find('month').replace(/[.,\s]+$/u, '');
  const day = find('day');
  const year = find('year');
  return [day, month, year].filter(Boolean).join(' ');
}

/** Clock time in India, where the advisory is issued. */
export function istTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Intl.DateTimeFormat('en-IN', {
    ...LATIN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(ms));
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
