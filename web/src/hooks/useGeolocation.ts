/**
 * The boat's position, watched only while it is being looked at.
 *
 * enableHighAccuracy is deliberately off. The nearest zone is a hundred-odd
 * nautical miles away, so fifty metres of error is irrelevant, and
 * high-accuracy GPS is the single largest battery drain available to a web app.
 * The watch is also torn down whenever the tab is hidden.
 */

import { useEffect, useState } from 'react';

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
    if (!active || typeof navigator === 'undefined' || !navigator.geolocation) return;

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
