import type { Messages } from '@/i18n';
import type { PfzDocument } from '@/lib/pfz';
import { shortDate } from '@/lib/format';

/**
 * INCOIS's Forecast Date and Valid upto, laid out as INCOIS lays them out.
 *
 * On every screen, whether the advisory is fresh or not, so the first thing anyone
 * sees is which day's forecast this is and when it stops applying. The staleness
 * banner beneath adds the relative age when it matters; together they give both the
 * absolute date and the age, which a boat needs.
 */
export function ForecastDatesBar({
  t,
  doc,
  localeTag,
  dead,
}: {
  t: Messages;
  doc: PfzDocument;
  localeTag: string;
  dead: boolean;
}): React.JSX.Element | null {
  // Documents published before these fields existed fall back to the dates taken
  // from the sector pages, which mean the same thing.
  const forecast = doc.forecast_date ?? doc.advisory_date;
  const valid = doc.valid_upto ?? doc.valid_until;
  if (!forecast && !valid) return null;

  return (
    <div className={`forecast-dates ${dead ? 'forecast-dates--dead' : ''}`} role="note">
      <div>
        <div className="label">{t.forecastDate}</div>
        <div className="forecast-dates__value num">{forecast ? shortDate(forecast, localeTag) : '—'}</div>
      </div>
      <div className="forecast-dates__right">
        <div className="label">{t.validUpto}</div>
        <div className="forecast-dates__value num">{valid ? shortDate(valid, localeTag) : '—'}</div>
      </div>
    </div>
  );
}
