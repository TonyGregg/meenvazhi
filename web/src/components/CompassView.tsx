import type { Messages } from '@/i18n';
import type { Zone } from '@/lib/pfz';
import { relativeBearing, useHeading } from '@/hooks/useHeading';
import { useGeolocation } from '@/hooks/useGeolocation';
import { inverse } from '@/lib/geo';
import { bearing, nmi } from '@/lib/format';

interface Props {
  t: Messages;
  target: Zone | null;
  active: boolean;
}

/**
 * Which way to turn, right now.
 *
 * The distance and bearing here are recomputed from the boat's own position when
 * GPS gives one, rather than from the home port. Fifty miles out, the bearing from
 * harbour is no longer the course to steer.
 *
 * The turn instruction is the largest thing on screen, because "turn 40 left" is
 * usable at a glance in a way that two compass numbers are not.
 *
 * When there is no magnetometer the app falls back to GPS course over ground and
 * says so, because course over ground is meaningless while stopped. Showing a
 * confident arrow to a drifting boat would be worse than showing none.
 */
export function CompassView({ t, target, active }: Props): React.JSX.Element {
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

  // Prefer the live position; fall back to the figures computed from the home port.
  const live = gps.position ? inverse(gps.position.lat, gps.position.lon, target.lat, target.lon) : null;
  const courseDeg = live?.bearingDeg ?? target.from_home.bearing_deg;
  const distanceNmi = live?.distanceNmi ?? target.from_home.distance_nmi;
  const turn = heading.headingDeg === null ? null : relativeBearing(heading.headingDeg, courseDeg);

  return (
    <div className="stack">
      <div className="card stack centre">
        <p className="label" style={{ margin: 0 }}>
          {t.compassTitle} · {target.gpx_name}
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

      <div className="card stack">
        {heading.needsPermission ? (
          // iOS only grants motion access from a real gesture, so this must be a button.
          <button type="button" className="primary" onClick={() => void heading.requestPermission()}>
            {t.enableCompass}
          </button>
        ) : null}

        {heading.source === 'gps' ? <p className="muted" style={{ margin: 0 }}>{t.headingFromGps}</p> : null}
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
        {gps.error ? <p className="muted" style={{ margin: 0 }}>{gps.error}</p> : null}
      </div>
    </div>
  );
}
