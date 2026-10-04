/**
 * The boat's position and speed, watched only while the Compass tab is open.
 *
 * High accuracy is on, and it has to be. With it off, Android leans on mobile
 * towers and Wi-Fi to place the phone, and fifty nautical miles offshore there are
 * neither, so the phone may never get a fix at all, which is exactly where this
 * matters. High accuracy uses the GPS chip itself. That costs battery, so the
 * watch runs only while the Compass tab is visible and stops whenever it is hidden
 * or the app goes to the background.
 *
 * Recent fixes are kept for two minutes so speed can be averaged: single readings
 * on a rolling boat jump about too much to base an ETA on.
 */

import { useEffect, useRef, useState } from 'react';
import { Geolocation, type Position as NativePosition } from '@capacitor/geolocation';
import { isNativeApp } from '@/lib/platform';
import { SPEED_WINDOW_MS, smoothedSpeedKnots, type Fix } from '@/lib/navigation';

export interface Position {
  lat: number;
  lon: number;
  /** Course over ground in degrees true. Only present while actually moving. */
  headingDeg: number | null;
  /** Speed over ground in knots, as the receiver reported it for this one fix. */
  speedKnots: number | null;
  accuracyM: number;
}

export interface GeolocationState {
  position: Position | null;
  /** Speed over ground averaged over the last two minutes, in knots. */
  speedKnots: number | null;
  error: string | null;
  supported: boolean;
}

const MS_PER_S_TO_KNOTS = 1.94384;

const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 } as const;

interface Coords {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy: number;
}

export function useGeolocation(active: boolean): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    speedKnots: null,
    error: null,
    supported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
  });
  const fixes = useRef<Fix[]>([]);

  /** One place both the Android and the web paths report a fix to. */
  const record = useRef((coords: Coords, timeMs: number): void => {
    const reported = coords.speed == null || Number.isNaN(coords.speed) ? null : coords.speed * MS_PER_S_TO_KNOTS;
    fixes.current = [
      ...fixes.current.filter((f) => timeMs - f.timeMs <= SPEED_WINDOW_MS),
      { timeMs, lat: coords.latitude, lon: coords.longitude, speedKnots: reported },
    ];
    setState((s) => ({
      ...s,
      error: null,
      speedKnots: smoothedSpeedKnots(fixes.current, timeMs),
      position: {
        lat: coords.latitude,
        lon: coords.longitude,
        headingDeg: coords.heading ?? null,
        speedKnots: reported,
        accuracyM: coords.accuracy,
      },
    }));
  });

  const fail = useRef((error: unknown): void => {
    // Browser and plugin errors are plain objects with a message, not Error instances.
    const message =
      typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);
    setState((s) => ({ ...s, error: message }));
  });

  // Android app: the native plugin, which asks for the location permission properly.
  // Stopped whenever the app is hidden, like the website path, so GPS never runs in
  // the background.
  useEffect(() => {
    if (!active || !isNativeApp()) return;

    let callbackId: string | null = null;
    let cancelled = false;
    let starting = false;

    const start = async (): Promise<void> => {
      if (callbackId !== null || starting) return;
      starting = true;
      try {
        const permission = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (permission.location === 'denied') {
          fail.current(new Error('Location permission denied'));
          return;
        }
        if (cancelled) return;
        callbackId = await Geolocation.watchPosition(WATCH_OPTIONS, (position: NativePosition | null, error) => {
          if (error) fail.current(error);
          else if (position) record.current(position.coords, position.timestamp);
        });
        if (cancelled) void stop();
      } catch (error) {
        fail.current(error);
      } finally {
        starting = false;
      }
    };

    const stop = async (): Promise<void> => {
      if (callbackId === null) return;
      const id = callbackId;
      callbackId = null;
      await Geolocation.clearWatch({ id });
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void start();
      else void stop();
    };

    void start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void stop();
    };
  }, [active]);

  // Website: the browser's own geolocation, stopped whenever the page is hidden.
  useEffect(() => {
    if (!active || isNativeApp() || typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;

    const start = (): void => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (p) => record.current(p.coords, p.timestamp),
        (e) => fail.current(e),
        WATCH_OPTIONS,
      );
    };

    const stop = (): void => {
      if (watchId !== null) {
        navigator.geolocation?.clearWatch(watchId);
        watchId = null;
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [active]);

  return state;
}
