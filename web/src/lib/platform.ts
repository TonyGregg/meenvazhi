/**
 * The few places the Android app and the website genuinely differ.
 *
 * Everything else is the same code. Keeping the differences in one file makes it
 * obvious what the native shell changes and what it does not.
 */

import { Capacitor } from '@capacitor/core';

/** Where the published advisory lives on the internet. */
export const PUBLISHED_DATA_BASE = 'https://tonygregg.github.io/meenvazhi/data/';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Base URL for the data files.
 *
 * On the website the data sits beside the app, so a relative path is right. Inside
 * the Android app, relative paths resolve into the APK itself, which only ever
 * contains whatever advisory was current on the day the APK was built. So the app
 * has to go to GitHub Pages explicitly, which sends permissive CORS headers.
 */
export function dataBaseUrl(): string {
  return isNativeApp() ? PUBLISHED_DATA_BASE : `${import.meta.env.BASE_URL}data/`;
}
