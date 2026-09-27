import type { Messages } from '@/i18n';
import type { PfzDocument, Zone } from '@/lib/pfz';
import { ZoneCard } from './ZoneCard';

interface Props {
  t: Messages;
  doc: PfzDocument;
  zones: readonly Zone[];
  targetZoneId: string | null;
  dead: boolean;
  onSetTarget: (zoneId: string | null) => void;
}

export function ZoneList({ t, doc, zones, targetZoneId, dead, onSetTarget }: Props): React.JSX.Element {
  const sectorNameOf = (zone: Zone): string =>
    doc.sectors.find((s) => s.zones.some((z) => z.id === zone.id))?.sector_name ?? '';

  return (
    <>
      <p className="label" style={{ margin: 0 }}>
        {t.zonesFound(zones.length)}
      </p>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {zones.map((zone) => (
          <li key={zone.id}>
            <ZoneCard
              t={t}
              zone={zone}
              sectorName={sectorNameOf(zone)}
              isTarget={zone.id === targetZoneId}
              dead={dead}
              onSetTarget={onSetTarget}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
