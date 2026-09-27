/**
 * Which way the phone, or the boat, is pointing.
 *
 * Two sources, and the app says which one it is using rather than pretending they
 * are equivalent.
 *
 * A magnetometer gives a heading while stationary but needs an explicit permission
 * grant on iOS, from a user gesture.
 *
 * GPS course over ground needs no permission beyond location but is meaningless
 * while stopped, because there is no course when there is no movement. Showing a
 * confidently wrong arrow to a drifting boat would be worse than showing none, so
 * that case is labelled instead.
 */

import { useCallback, useEffect, useState } from 'react';

export type HeadingSource = 'compass' | 'gps' | 'none';

export interface HeadingState {
  /** Degrees true, or null when unknown. */
  headingDeg: number | null;
  source: HeadingSource;
  /** True when iOS is waiting for an explicit grant. */
  needsPermission: boolean;
  requestPermission: () => Promise<void>;
}

interface WebkitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

type PermissionCapableEvent = {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

export function useHeading(active: boolean, gpsHeadingDeg: number | null): HeadingState {
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  const iosNeedsGesture =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as PermissionCapableEvent).requestPermission === 'function';

  const requestPermission = useCallback(async () => {
    const ctor = DeviceOrientationEvent as unknown as PermissionCapableEvent;
    if (typeof ctor.requestPermission !== 'function') {
      setGranted(true);
      return;
    }
    try {
      setGranted((await ctor.requestPermission()) === 'granted');
    } catch {
      setGranted(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    if (iosNeedsGesture && granted !== true) return;

    const handle = (event: DeviceOrientationEvent): void => {
      const webkit = event as WebkitDeviceOrientationEvent;

      // Safari reports a true heading directly.
      if (typeof webkit.webkitCompassHeading === 'number') {
        setCompassHeading(webkit.webkitCompassHeading);
        return;
      }

      // Elsewhere, alpha is degrees anticlockwise from north, so it inverts. It is
      // only a true heading when the event is absolute; a relative event is
      // measured from wherever the device happened to start.
      if (event.absolute && typeof event.alpha === 'number') {
        const screenAngle = screen.orientation?.angle ?? 0;
        setCompassHeading((360 - event.alpha + screenAngle) % 360);
      }
    };

    // deviceorientationabsolute is the one that is actually referenced to north.
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, handle as EventListener);
    return () => window.removeEventListener(eventName, handle as EventListener);
  }, [active, granted, iosNeedsGesture]);

  if (compassHeading !== null) {
    return { headingDeg: compassHeading, source: 'compass', needsPermission: false, requestPermission };
  }
  if (gpsHeadingDeg !== null && !Number.isNaN(gpsHeadingDeg)) {
    return { headingDeg: gpsHeadingDeg, source: 'gps', needsPermission: false, requestPermission };
  }
  return {
    headingDeg: null,
    source: 'none',
    needsPermission: iosNeedsGesture && granted !== true,
    requestPermission,
  };
}

/** Signed turn from a heading to a bearing: negative is to port. */
export function relativeBearing(headingDeg: number, targetBearingDeg: number): number {
  return ((((targetBearingDeg - headingDeg) % 360) + 540) % 360) - 180;
}
