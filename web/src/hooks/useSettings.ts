/**
 * User settings, persisted per device.
 *
 * localStorage is used deliberately, and only for preferences. It can throw or
 * come back empty in a private window or with site data blocked, so every access
 * is wrapped and the app renders correctly on defaults if it fails. The advisory
 * itself lives in IndexedDB, which is the durable store.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PORT_SLUG, portBySlug } from '@/data/ports';
import { detectLocale, isLocale, messages, type Locale } from '@/i18n';

export type Theme = 'sun' | 'day' | 'night';
export type SortBy = 'distance' | 'bearing';
/** "Nearest to me" filters by range from the home port; "By area" follows INCOIS. */
export type ZoneView = 'nearest' | 'area';

export interface Settings {
  locale: Locale;
  theme: Theme;
  homePort: string;
  /** Nautical miles. null means no range limit. */
  rangeNmi: number | null;
  sortBy: SortBy;
  /** Zone id the compass points at. */
  targetZoneId: string | null;
  view: ZoneView;
  /** The area last opened in the "By area" view, by INCOIS sector id. */
  areaSectorId: string | null;
  /** The boat's usual speed in knots, for an ETA before it moves. Null means off. */
  cruiseSpeedKnots: number | null;
}

/** Buttons rather than a slider: dragging fails with wet hands on a moving deck. */
export const CRUISE_SPEED_OPTIONS: readonly (number | null)[] = [null, 6, 7, 8, 9, 10, 12] as const;

export const RANGE_OPTIONS: readonly (number | null)[] = [50, 100, 150, 200, null] as const;

const KEY = 'meenvazhi:settings:v1';

function readStored(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Returned untyped on purpose: reconcile() validates every field, so nothing
    // downstream trusts the stored shape.
    return parsed;
  } catch {
    return {};
  }
}

function defaults(): Settings {
  return {
    // Malayalam or Tamil if the phone asks for it. Most users will never open
    // Settings, so the first guess has to be a good one.
    locale: detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]),
    theme: 'sun',
    homePort: DEFAULT_PORT_SLUG,
    rangeNmi: 120,
    sortBy: 'distance',
    targetZoneId: null,
    view: 'nearest',
    areaSectorId: null,
    cruiseSpeedKnots: null,
  };
}

function reconcile(stored: Partial<Settings>): Settings {
  const base = defaults();
  return {
    locale: isLocale(stored.locale) ? stored.locale : base.locale,
    theme: stored.theme === 'day' || stored.theme === 'night' || stored.theme === 'sun' ? stored.theme : base.theme,
    // A port slug from an older build may no longer exist.
    homePort: stored.homePort && portBySlug(stored.homePort) ? stored.homePort : base.homePort,
    rangeNmi:
      stored.rangeNmi === null || (typeof stored.rangeNmi === 'number' && stored.rangeNmi > 0)
        ? stored.rangeNmi
        : base.rangeNmi,
    sortBy: stored.sortBy === 'bearing' ? 'bearing' : 'distance',
    targetZoneId: typeof stored.targetZoneId === 'string' ? stored.targetZoneId : null,
    view: stored.view === 'area' ? 'area' : 'nearest',
    areaSectorId: typeof stored.areaSectorId === 'string' ? stored.areaSectorId : null,
    cruiseSpeedKnots:
      typeof stored.cruiseSpeedKnots === 'number' && stored.cruiseSpeedKnots >= 1 && stored.cruiseSpeedKnots <= 40
        ? stored.cruiseSpeedKnots
        : null,
  };
}

export function useSettings(): [Settings, <K extends keyof Settings>(key: K, value: Settings[K]) => void] {
  const [settings, setSettings] = useState<Settings>(() => reconcile(readStored()));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Preferences will not survive this session. Not worth interrupting anyone over.
    }
  }, [settings]);

  // Drives the theme tokens and the per-script font rules, and tells a screen
  // reader which language it is reading. Also publishes the service-worker update
  // prompt's labels, because that prompt is plain DOM outside React and would
  // otherwise be stuck in English.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.setAttribute('lang', settings.locale);
    const t = messages(settings.locale);
    root.setAttribute('data-update-label', t.updateAvailable);
    root.setAttribute('data-update-now', t.updateNow);
    root.setAttribute('data-update-later', t.updateLater);
  }, [settings.theme, settings.locale]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  return [settings, update];
}
