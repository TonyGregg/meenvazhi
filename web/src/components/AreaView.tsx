import type { Messages } from '@/i18n';
import type { PfzDocument, Sector, Zone } from '@/lib/pfz';
import { sectorLabel } from '@/lib/areas';
import { bearing, depthRange, km, nmi } from '@/lib/format';
import { KM_PER_NAUTICAL_MILE } from '@/lib/geo';
import { CopyButton } from './ZoneCard';

interface Props {
  t: Messages;
  doc: PfzDocument;
  sector: Sector | undefined;
  /** The sector's zones, already in INCOIS order. */
  zones: readonly Zone[];
  portName: string;
  targetZoneId: string | null;
  dead: boolean;
  onSector: (sectorId: string) => void;
  onSetTarget: (zoneId: string | null) => void;
}

/**
 * Area by area, as INCOIS presents it: pick a sector, see every zone in it, in
 * coastal order, with nothing hidden by range.
 */
export function AreaView({
  t,
  doc,
  sector,
  zones,
  portName,
  targetZoneId,
  dead,
  onSector,
  onSetTarget,
}: Props): React.JSX.Element {
  return (
    <div className="stack">
      <div className="card stack">
        <span className="label" id="area-label">
          {t.area}
        </span>
        <div className="area-grid" role="group" aria-labelledby="area-label">
          {doc.sectors.map((s) => (
            <button
              key={s.sector_id}
              type="button"
              aria-pressed={s.sector_id === sector?.sector_id}
              onClick={() => onSector(s.sector_id)}
            >
              {sectorLabel(t, s)} <span className="num">({s.zone_count})</span>
            </button>
          ))}
        </div>
      </div>

      {!sector ? null : sector.status !== 'HAS_ADVISORY' ? (
        <div className="card centre stack" role="status">
          <p className="big" style={{ margin: 0 }}>
            {t.areaNoAdvisory}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {t.emptyNoAdvisoryWhy}
          </p>
        </div>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {sectorLabel(t, sector)} · {t.zonesFound(zones.length)} · {t.inIncoisOrder}
          </p>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {zones.map((zone) => (
              <li key={zone.id}>
                <AreaZoneCard
                  t={t}
                  zone={zone}
                  sectorName={sectorLabel(t, sector)}
                  portName={portName}
                  isTarget={zone.id === targetZoneId}
                  dead={dead}
                  onSetTarget={onSetTarget}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * One zone the INCOIS way: led by its landing centre and INCOIS's own bearing and
 * distance from that coast.
 *
 * Both bearings appear, each labelled with the place it is measured from, and in
 * the same size of type so neither reads as "the" course. Mistaking INCOIS's
 * bearing from Kanniyakumari for a course from Kochi would be the worst error this
 * app could make, so the origin is named every time.
 */
function AreaZoneCard({
  t,
  zone,
  sectorName,
  portName,
  isTarget,
  dead,
  onSetTarget,
}: {
  t: Messages;
  zone: Zone;
  sectorName: string;
  portName: string;
  isTarget: boolean;
  dead: boolean;
  onSetTarget: (zoneId: string | null) => void;
}): React.JSX.Element {
  const coastKm = zone.incois.distance_km;
  const coastNmi = `${Math.round(coastKm.from / KM_PER_NAUTICAL_MILE)}–${Math.round(coastKm.to / KM_PER_NAUTICAL_MILE)}`;
  const position = `${zone.lat_dms} ${zone.lon_dms}`;

  return (
    <div className={`card stack ${dead ? 'dead' : ''} ${isTarget ? 'zone--target' : ''}`} style={{ gap: '0.5rem' }}>
      <div className="zone__code num">
        {zone.gpx_name} · {sectorName}
      </div>
      <div className="big wrap-anywhere" style={{ fontSize: '1.75rem' }}>
        {t.fromCoastOf(zone.landing_centre)}
      </div>

      <div>
        <div className="label">{t.fromCoastIncois(zone.landing_centre)}</div>
        <div className="zone__bearing num" style={{ fontSize: 'var(--size-big)' }}>
          {zone.incois.direction} {zone.incois.bearing_deg}°
        </div>
        <div className="num">
          {depthRange(coastKm.from, coastKm.to)} {t.kilometres} · {coastNmi} {t.nauticalMiles}
        </div>
      </div>

      <div>
        <div className="label">{t.fromYourPort(portName)}</div>
        <div className="zone__distance num" style={{ fontSize: 'var(--size-big)' }}>
          {bearing(zone.from_home.bearing_deg)}
          {t.degreesTrue} · {nmi(zone.from_home.distance_nmi)} {t.nauticalMiles}
        </div>
        <div className="muted num">
          {km(zone.from_home.distance_km)} {t.kilometres}
        </div>
      </div>

      <div className="zone__meta">
        {t.depth} <span className="num">{depthRange(zone.depth_m.from, zone.depth_m.to)}</span> {t.metres}
      </div>
      <div className="zone__dms num wrap-anywhere">{position}</div>

      <div className="row">
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
