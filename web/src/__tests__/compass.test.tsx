/**
 * The Compass tab with a simulated GPS the test drives fix by fix.
 *
 * The boat starts at Cochin Fisheries Harbour and the target is the first zone in
 * the golden advisory. Positions move it due north, where one minute of latitude
 * is one nautical mile, so expected speeds are easy to check by hand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import golden from '../../../pipeline/tests/fixtures/golden/pfz-latest.json';
import { CompassView } from '../components/CompassView';
import { en } from '../i18n/en';
import { allZones, validateDocument } from '../lib/pfz';

const zone = allZones(validateDocument(golden))[0]!;
const START = Date.parse('2026-10-04T06:00:00Z');
const KNOT_M_S = 0.514444;

type Success = (p: { coords: GeolocationCoordinates; timestamp: number }) => void;
let emit: Success | null = null;

function fix(minutesNorth: number, atMs: number, speedKnots: number | null, accuracy = 12): void {
  act(() => {
    emit?.({
      timestamp: atMs,
      coords: {
        latitude: 9.937 + minutesNorth / 60,
        longitude: 76.261,
        accuracy,
        speed: speedKnots === null ? null : speedKnots * KNOT_M_S,
        heading: null,
        altitude: null,
        altitudeAccuracy: null,
      } as unknown as GeolocationCoordinates,
    });
  });
}

function show(cruise: number | null = null): void {
  render(
    <CompassView t={en} target={zone} active portName="Kochi" cruiseSpeedKnots={cruise} localeTag="en-IN" />,
  );
}

beforeEach(() => {
  emit = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(START));
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      watchPosition: (success: Success) => {
        emit = success;
        return 1;
      },
      clearWatch: () => undefined,
    },
  });
});

afterEach(() => {
  cleanup(); // unmount while the fake GPS is still in place
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('where the figures are measured from', () => {
  it('says plainly when there is no GPS fix and it is using the home port', () => {
    show();
    expect(screen.getByText(/From Kochi · no GPS fix yet/)).toBeInTheDocument();
    expect(screen.getByText(/Looking for GPS/)).toBeInTheDocument();
  });

  it('switches to the boat’s own position once GPS has a fix, with its accuracy', () => {
    show();
    fix(0, START, null);
    expect(screen.getByText('From your position · GPS ±12 m')).toBeInTheDocument();
    expect(screen.queryByText(/no GPS fix yet/)).not.toBeInTheDocument();
  });
});

describe('speed and ETA', () => {
  it('shows the averaged GPS speed and an ETA while the boat is moving', () => {
    show();
    for (let i = 0; i < 6; i += 1) fix(i * 0.0125, START + i * 10_000, [7, 8, 7.5, 8.5, 7, 7][i]!);
    expect(screen.getByText('GPS, 2-minute average')).toBeInTheDocument();
    expect(screen.getByText(/^7\.5/)).toBeInTheDocument();
    expect(screen.getByText(/ h \d\d min$|\d+ d \d+ h/)).toBeInTheDocument();
    expect(screen.getByText(/^Arrive /)).toBeInTheDocument();
    expect(screen.getByText(/Currents and wind will change it/)).toBeInTheDocument();
  });

  it('works speed out from positions when the phone reports none', () => {
    show();
    // Two minutes heading north at 8 knots, with no reported speed.
    for (let i = 0; i <= 12; i += 1) fix((8 * i * 10) / 3600, START + i * 10_000, null);
    expect(screen.getByText(/^8\.0/)).toBeInTheDocument();
    expect(screen.getByText('GPS, 2-minute average')).toBeInTheDocument();
  });

  it('uses the cruising speed when stopped, as in harbour', () => {
    show(8);
    fix(0, START, 0);
    fix(0, START + 10_000, 0.2);
    expect(screen.getByText('your cruising speed')).toBeInTheDocument();
    expect(screen.getByText(/^8\.0/)).toBeInTheDocument();
    expect(screen.getByText(/^Arrive /)).toBeInTheDocument();
  });

  it('gives an ETA at cruising speed before any GPS fix', () => {
    show(8);
    expect(screen.getByText('your cruising speed')).toBeInTheDocument();
    expect(screen.getByText(/^Arrive /)).toBeInTheDocument();
  });

  it('says it cannot give an ETA when stopped with no cruising speed', () => {
    show();
    fix(0, START, 0.1);
    expect(screen.getByText('Not moving, so no ETA')).toBeInTheDocument();
    expect(screen.queryByText(/^Arrive /)).not.toBeInTheDocument();
  });

  it('suggests setting a cruising speed when there is no speed at all', () => {
    show();
    expect(screen.getByText(/Set a cruising speed in Settings/)).toBeInTheDocument();
  });

  it('computes the ETA from the live distance, not the distance from harbour', () => {
    // Already most of the way there: the ETA must shrink accordingly.
    show();
    const near = { lat: zone.lat - 10 / 60, lon: zone.lon };
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        emit?.({
          timestamp: START + i * 10_000,
          coords: { latitude: near.lat, longitude: near.lon, accuracy: 10, speed: 10 * KNOT_M_S, heading: null } as unknown as GeolocationCoordinates,
        });
      });
    }
    // About 10 nmi to go at 10 knots: roughly an hour, not the many hours from Kochi.
    expect(screen.getByText(/^(0|1) h \d\d min$/)).toBeInTheDocument();
  });
});
