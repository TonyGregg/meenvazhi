import type { Messages } from '@/i18n';
import type { Zone } from '@/lib/pfz';
import { bearing, depthRange, km, nmi } from '@/lib/format';

interface Props {
  t: Messages;
  zone: Zone;
  sectorName: string;
  isTarget: boolean;
  /** True when the whole advisory is expired or stale. */
  dead: boolean;
  onSetTarget: (zoneId: string | null) => void;
}

/**
 * One zone.
 *
 * The layout answers the only two questions that matter on a deck: which way, and
 * how far. Those two numbers are set in the largest type on the screen, with
 * tabular figures so they do not shift width as they change. Everything else is
 * secondary.
 *
 * INCOIS's own bearing is shown too, in small text and explicitly labelled with the
 * place it is measured from. It is there because a fisherman comparing this app
 * against the printed advisory should find the difference explained rather than
 * conclude one of them is broken.
 */
export function ZoneCard({ t, zone, sectorName, isTarget, dead, onSetTarget }: Props): React.JSX.Element {
  const home = zone.from_home;
  const position = `${zone.lat_dms} ${zone.lon_dms}`;

  return (
    <div className={`card ${dead ? 'dead' : ''} ${isTarget ? 'zone--target' : ''}`}>
      <div className="zone">
        <div className="zone__code num">
          {zone.gpx_name} · {sectorName}
          {!home.reachable ? <span className="muted"> · {t.outOfRange}</span> : null}
        </div>

        <div>
          <div className="label">{t.steer}</div>
          <div className="zone__bearing num">
            {bearing(home.bearing_deg)}
            <span style={{ fontSize: '0.4em' }}>{t.degreesTrue}</span>
          </div>
        </div>

        <div>
          <div className="label">{home.compass}</div>
          <div className="zone__distance num">
            {nmi(home.distance_nmi)} <span style={{ fontSize: '0.5em' }}>{t.nauticalMiles}</span>
          </div>
          <div className="muted num">
            {km(home.distance_km)} {t.kilometres}
          </div>
        </div>

        <div className="zone__meta stack" style={{ gap: '0.25rem' }}>
          <div>
            {t.fromCoastOf(zone.landing_centre)} · {t.depth}{' '}
            <span className="num">{depthRange(zone.depth_m.from, zone.depth_m.to)}</span> {t.metres}
          </div>
          <div className="zone__dms num wrap-anywhere">{position}</div>
          <div className="muted">
            {t.incoisSays(zone.incois.direction, zone.incois.bearing_deg, zone.landing_centre)}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 'var(--gap)' }}>
        <button
          type="button"
          className={isTarget ? 'primary grow' : 'grow'}
          aria-pressed={isTarget}
          onClick={() => onSetTarget(isTarget ? null : zone.id)}
        >
          {isTarget ? t.clearTarget : t.setTarget}
        </button>
        <CopyButton t={t} text={position} />
      </div>
    </div>
  );
}

export function CopyButton({ t, text }: { t: Messages; text: string }): React.JSX.Element {
  // No state machine and no timer: a boat does not need a toast. The label flips
  // on the element itself via the title so nothing animates or reflows.
  const copy = (): void => {
    void navigator.clipboard?.writeText(text).catch(() => {
      // Clipboard access can be refused. The coordinates are on screen anyway.
    });
  };
  return (
    <button type="button" onClick={copy} title={t.copy}>
      {t.copy}
    </button>
  );
}
