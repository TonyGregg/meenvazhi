/**
 * Home ports, mirroring pipeline/meenvazhi/ports.py.
 *
 * The default is Cochin Fisheries Harbour at Thoppumpady rather than the city
 * centre, because that is where the deep-sea boats actually leave from and a
 * bearing is only as good as the point it starts from.
 */

export type Coast = 'west' | 'east';

export interface Port {
  slug: string;
  name: string;
  state: string;
  coast: Coast;
  lat: number;
  lon: number;
}

export const PORTS: readonly Port[] = [
  { slug: 'kochi', name: 'Kochi (Cochin Fisheries Harbour)', state: 'Kerala', coast: 'west', lat: 9.937, lon: 76.261 },
  { slug: 'munambam', name: 'Munambam', state: 'Kerala', coast: 'west', lat: 10.178, lon: 76.17 },
  { slug: 'beypore', name: 'Beypore', state: 'Kerala', coast: 'west', lat: 11.17, lon: 75.806 },
  { slug: 'vizhinjam', name: 'Vizhinjam', state: 'Kerala', coast: 'west', lat: 8.379, lon: 76.99 },
  { slug: 'malpe', name: 'Malpe', state: 'Karnataka', coast: 'west', lat: 13.35, lon: 74.704 },
  { slug: 'mangalore', name: 'Mangalore', state: 'Karnataka', coast: 'west', lat: 12.845, lon: 74.828 },
  { slug: 'tuticorin', name: 'Tuticorin (Thoothukudi)', state: 'Tamil Nadu', coast: 'east', lat: 8.75, lon: 78.2 },
] as const;

export const DEFAULT_PORT_SLUG = 'kochi';

export function portBySlug(slug: string): Port | undefined {
  return PORTS.find((p) => p.slug === slug);
}

/**
 * India's statutory monsoon fishing ban.
 *
 * This is law, not weather: mechanised vessels stop entirely for the window. The
 * exact dates are set annually by each maritime state and shift by a few days, so
 * the app presents this as something to confirm rather than as an authority. It is
 * shown because INCOIS says nothing about it, and an advisory during a ban is
 * information a fisherman cannot act on.
 */
export const BAN_WINDOW: Record<Coast, { monthsUtc: number[]; labelKey: 'banWest' | 'banEast' }> = {
  // Zero-indexed months: June and July.
  west: { monthsUtc: [5, 6], labelKey: 'banWest' },
  // Mid-April to mid-June.
  east: { monthsUtc: [3, 4, 5], labelKey: 'banEast' },
};

export function isInBanWindow(coast: Coast, now: Date): boolean {
  const window = BAN_WINDOW[coast];
  return window.monthsUtc.includes(now.getUTCMonth());
}
