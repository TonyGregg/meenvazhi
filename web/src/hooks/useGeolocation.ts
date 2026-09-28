/**
 * The boat's position, watched only while it is being looked at.
 *
 * enableHighAccuracy is deliberately off. The nearest zone is a hundred-odd
 * nautical miles away, so fifty metres of error is irrelevant, and
 * high-accuracy GPS is the single largest battery drain available to a web app.
 * The watch is also torn down whenever the tab is hidden.
 */

import { useEffect, useState } from 'react';
import { Geolocation, type Position as NativePosition } from '@capacitor/geolocation';
import { isNativeApp } from '@/lib/platform';

export interface Position {
  lat: number;
  lon: number;
  /** Course over ground in degrees true. Only present while actually moving. */
  headingDeg: number | null;
  /** Speed over ground in knots. */
  speedKnots: number | null;
  accuracyM: number;
}

export interface GeolocationState {
  position: Position | null;
  error: string | null;
  supported: boolean;
}

const MS_PER_S_TO_KNOTS = 1.94384;

export function useGeolocation(active: boolean): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    supported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
  });

  useEffect(() => {
    if (!active || !isNativeApp()) return;

    let callbackId: string | null = null;
    let cancelled = false;

    const onFix = (p: NativePosition | null): void => {
      if (!p) return;
      setState((s) => ({
        ...s,
        error: null,
        position: {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          headingDeg: p.coords.heading ?? null,
          speedKnots: p.coords.speed == null ? null : p.coords.speed * MS_PER_S_TO_KNOTS,
          accuracyM: p.coords.accuracy,
        },
      }));
    };

    void (async () => {
      try {
        const permission = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (permission.location === 'denied') {
          setState((s) => ({ ...s, error: 'Location permission denied' }));
          return;
        }
        if (cancelled) return;
        // Same battery reasoning as the web path: coarse accuracy is plenty when
        // the nearest zone is a hundred-odd nautical miles away.
        callbackId = await Geolocation.watchPosition(
          { enableHighAccuracy: false, maximumAge: 15000, timeout: 30000 },
          (position, error) => {
            if (error) setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error) }));
            else onFix(position);
          },
        );
      } catch (error) {
        setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error) }));
      }
    })();

    return () => {
      cancelled = true;
      if (callbackId !== null) void Geolocation.clearWatch({ id: callbackId });
    };
  }, [active]);

  useEffect(() => {
    if (!active || isNativeApp() || typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;

    const start = (): void => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          setState((s) => ({
            ...s,
            error: null,
            position: {
              lat: p.coords.latitude,
              lon: p.coords.longitude,
              headingDeg: p.coords.heading ?? null,
              speedKnots: p.coords.speed === null ? null : p.coords.speed * MS_PER_S_TO_KNOTS,
              accuracyM: p.coords.accuracy,
            },
          }));
        },
        (e) => setState((s) => ({ ...s, error: e.message })),
        { enableHighAccuracy: false, maximumAge: 15000, timeout: 30000 },
      );
    };

    const stop = (): void => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
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
