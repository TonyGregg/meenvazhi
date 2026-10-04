import type { Messages } from '@/i18n';
import type { Zone } from '@/lib/pfz';
import { relativeBearing, useHeading } from '@/hooks/useHeading';
import { useGeolocation } from '@/hooks/useGeolocation';
import { inverse } from '@/lib/geo';
import { bearing, nmi } from '@/lib/format';
import { estimateArrival, splitDuration, type Arrival } from '@/lib/navigation';

interface Props {
  t: Messages;
  target: Zone | null;
  active: boolean;
  /** Short home-port name, for saying where the figures come from without a fix. */
  portName: string;
  cruiseSpeedKnots: number | null;
  localeTag: string;
}

/** "5 h 04 min", or "1 d 9 h" past a day, in the reader's language. */
function duration(t: Messages, minutes: number): string {
  const { days, hours, mins } = splitDuration(minutes);
  return days > 0 ? t.durationDH(days, hours) : t.durationHM(hours, mins);
}

/** Arrival as a clock time on the phone, with the weekday when it is not today. */
function arrivalTime(at: Date, now: Date, localeTag: string): string {
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(localeTag, {
    numberingSystem: 'latn',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(sameDay ? {} : { weekday: 'short' }),
  }).format(at);
}

/**
 * Which way to turn, how far, and how long it will take.
 *
 * Course and distance are measured from the boat's own GPS position whenever there
 * is a fix, and the screen says so. Fifty miles out, the bearing from harbour is no
 * longer the course to steer. Without a fix it falls back to the home port and says
 * that instead, rather than presenting the same figures under the same label.
 *
 * The ETA uses speed over ground averaged over two minutes, or the cruising speed
 * from Settings when the boat is not moving or GPS has no speed. It is an estimate
 * along a straight line at constant speed, and the screen says that too.
 *
 * When there is no magnetometer the app falls back to GPS course over ground and
 * says so, because course over ground is meaningless while stopped. Showing a
 * confident arrow to a drifting boat would be worse than showing none.
 */
export function CompassView({ t, target, active, portName, cruiseSpeedKnots, localeTag }: Props): React.JSX.Element {
  const gps = useGeolocation(active);
  const heading = useHeading(active, gps.position?.headingDeg ?? null);

  if (!target) {
    return (
      <div className="card centre stack" role="status">
        <p className="big" style={{ margin: 0 }}>
          {t.compassNoTarget}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {t.compassPickZone}
        </p>
      </div>
    );
  }

  const now = new Date();
  // Prefer the live position; fall back to the figures computed from the home port.
  const live = gps.position ? inverse(gps.position.lat, gps.position.lon, target.lat, target.lon) : null;
  const courseDeg = live?.bearingDeg ?? target.from_home.bearing_deg;
  const distanceNmi = live?.distanceNmi ?? target.from_home.distance_nmi;
  const turn = heading.headingDeg === null ? null : relativeBearing(heading.headingDeg, courseDeg);
  const arrival: Arrival | null = estimateArrival(distanceNmi, gps.speedKnots, cruiseSpeedKnots, now);

  // The second card holds only notes, so it is left out entirely when there are none.
  const hasNotes =
    heading.needsPermission || heading.source !== 'compass' || gps.position !== null || gps.error !== null;

  const origin = live
    ? `${t.fromYourPosition} · ${t.gpsAccuracy(Math.round(gps.position?.accuracyM ?? 0))}`
    : t.fromPortNoFix(portName);

  return (
    <div className="stack">
      <div className="card stack centre">
        <p className="label" style={{ margin: 0 }}>
          {t.compassTitle} · {target.gpx_name}
        </p>
        <p className="muted" style={{ margin: 0 }} aria-live="polite">
          {origin}
          {!live && !gps.error && gps.supported ? ` · ${t.lookingForGps}` : ''}
        </p>

        <div>
          <div className="label">{t.steer}</div>
          <div className="huge num">
            {bearing(courseDeg)}
            <span style={{ fontSize: '0.35em' }}>{t.degreesTrue}</span>
          </div>
        </div>

        <div>
          <div className="label">{t.distanceToGo}</div>
          <div className="big num">
            {nmi(distanceNmi)} <span style={{ fontSize: '0.5em' }}>{t.nauticalMiles}</span>
          </div>
        </div>

        <div>
          <div className="label">{t.speed}</div>
          {arrival ? (
            <>
              <div className="big num">
                {arrival.speedKnots.toFixed(1)} <span style={{ fontSize: '0.5em' }}>{t.knots}</span>
              </div>
              <div className="muted">{arrival.source === 'gps' ? t.speedFromGps : t.speedFromCruise}</div>
            </>
          ) : (
            <div className="big num">
              {gps.speedKnots === null ? '\u2014' : gps.speedKnots.toFixed(1)}{' '}
              <span style={{ fontSize: '0.5em' }}>{t.knots}</span>
            </div>
          )}
        </div>

        <div>
          <div className="label">{t.eta}</div>
          {arrival ? (
            <>
              <div className="big num">{duration(t, arrival.minutes)}</div>
              <div className="num" style={{ fontWeight: 700 }}>
                {t.arriveAt(arrivalTime(arrival.at, now, localeTag))}
              </div>
              <div className="muted">{t.etaCaveat}</div>
            </>
          ) : (
            <div className="muted">{gps.speedKnots !== null ? t.etaNotMoving : t.etaSetCruise}</div>
          )}
        </div>

        {turn === null ? null : (
          <div>
            <div className="label">{t.relativeBearing}</div>
            <div className="huge num" aria-live="polite">
              {Math.abs(Math.round(turn)) <= 5 ? (
                t.onCourse
              ) : (
                <>
                  <span aria-hidden="true">{turn < 0 ? '←' : '→'}</span> {Math.abs(Math.round(turn))}°
                  <span style={{ fontSize: '0.35em' }}> {turn < 0 ? t.turnLeft : t.turnRight}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {hasNotes ? (
        <div className="card stack">
          {heading.needsPermission ? (
            // iOS only grants motion access from a real gesture, so this must be a button.
            <button type="button" className="primary" onClick={() => void heading.requestPermission()}>
              {t.enableCompass}
            </button>
          ) : null}

          {heading.source === 'gps' ? (
            <p className="muted" style={{ margin: 0 }}>
              {t.headingFromGps}
            </p>
          ) : null}
          {heading.source === 'none' && !heading.needsPermission ? (
            <p className="muted" style={{ margin: 0 }}>
              {t.headingUnavailable}
            </p>
          ) : null}

          {gps.position ? (
            <p className="muted num" style={{ margin: 0 }}>
              {t.yourPosition}: {gps.position.lat.toFixed(4)}, {gps.position.lon.toFixed(4)}
            </p>
          ) : null}
          {gps.error ? (
            <p className="muted" style={{ margin: 0 }}>
              {gps.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
