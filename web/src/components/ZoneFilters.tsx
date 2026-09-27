import type { Messages } from '@/i18n';
import { PORTS } from '@/data/ports';
import { RANGE_OPTIONS, type SortBy } from '@/hooks/useSettings';
import { nmi } from '@/lib/format';

interface Props {
  t: Messages;
  homePort: string;
  rangeNmi: number | null;
  sortBy: SortBy;
  sectorNames: readonly string[];
  selectedSector: string | null;
  onHomePort: (slug: string) => void;
  onRange: (value: number | null) => void;
  onSortBy: (value: SortBy) => void;
  onSector: (value: string | null) => void;
}

/**
 * Range is a set of buttons rather than a slider.
 *
 * A slider needs a drag, and dragging fails with wet hands on a moving deck. Five
 * taps cover every useful case.
 */
export function ZoneFilters({
  t,
  homePort,
  rangeNmi,
  sortBy,
  sectorNames,
  selectedSector,
  onHomePort,
  onRange,
  onSortBy,
  onSector,
}: Props): React.JSX.Element {
  return (
    <div className="card stack">
      <div>
        <label className="label" htmlFor="home-port">
          {t.homePort}
        </label>
        <select id="home-port" value={homePort} onChange={(e) => onHomePort(e.target.value)} style={{ width: '100%' }}>
          {PORTS.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="label" id="range-label">
          {t.range}
        </span>
        <div className="row" role="group" aria-labelledby="range-label" style={{ gap: '0.5rem' }}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={String(option)}
              type="button"
              aria-pressed={rangeNmi === option}
              onClick={() => onRange(option)}
              className="num grow"
            >
              {option === null ? t.rangeAll : nmi(option)}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: '0.5rem' }}>
        <button
          type="button"
          className="grow"
          aria-pressed={sortBy === 'distance'}
          onClick={() => onSortBy('distance')}
        >
          {t.sortByDistance}
        </button>
        <button type="button" className="grow" aria-pressed={sortBy === 'bearing'} onClick={() => onSortBy('bearing')}>
          {t.sortByBearing}
        </button>
      </div>

      {sectorNames.length > 1 ? (
        <div>
          <label className="label" htmlFor="sector">
            {t.allSectors}
          </label>
          <select
            id="sector"
            value={selectedSector ?? ''}
            onChange={(e) => onSector(e.target.value || null)}
            style={{ width: '100%' }}
          >
            <option value="">{t.allSectors}</option>
            {sectorNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
