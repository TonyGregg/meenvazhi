import type { Messages } from '@/i18n';
import type { StalenessReport } from '@/lib/staleness';
import { shortDate } from '@/lib/format';

interface Props {
  t: Messages;
  report: StalenessReport;
  localeTag: string;
  /** True when the advisory came from storage rather than the network. */
  fromCache: boolean;
  /** True when the forecast-dates bar is on screen, so the dates need not repeat. */
  datesShownAbove?: boolean;
}

/**
 * The safety-critical banner.
 *
 * Always rendered below "fresh", never dismissible, and announced politely so a
 * screen reader reaches it without interrupting.
 *
 * It always shows the absolute advisory date alongside the relative age. Relative
 * alone is ambiguous after a few days at sea, and absolute alone asks someone to
 * do date arithmetic on a moving deck.
 */
export function StalenessBanner({ t, report, localeTag, fromCache, datesShownAbove = false }: Props): React.JSX.Element | null {
  if (report.freshness === 'fresh' && !fromCache) return null;

  const dead = report.isDead;
  const message = (): string => {
    switch (report.freshness) {
      case 'none':
        return t.noDataWarning;
      case 'expired':
        return t.expiredWarning;
      case 'stale':
        return t.staleWarning;
      case 'clock_suspect':
        return t.clockWarning;
      case 'aging':
        return t.agingWarning;
      default:
        return t.usingSavedCopy;
    }
  };

  const detail = (): string => {
    const bits: string[] = [];
    // With the dates bar on screen the absolute dates are already visible, so the
    // banner adds only the relative age. Without it, it carries everything itself.
    if (report.advisoryDate && !datesShownAbove) bits.push(t.issued(shortDate(report.advisoryDate, localeTag)));
    // A negative age is not shown as a number; the clock warning covers it.
    if (report.ageDays !== null && report.ageDays > 0) bits.push(t.ageDays(report.ageDays));
    if (!datesShownAbove) {
      if (report.validUntil) bits.push(t.validUntil(shortDate(report.validUntil, localeTag)));
      else if (report.freshness !== 'none') bits.push(t.noValidity);
    }
    return bits.join(' · ');
  };

  return (
    <div
      className={`banner ${dead ? 'banner--danger' : 'banner--warn'}`}
      role="status"
      aria-live="polite"
    >
      <div>{message()}</div>
      {detail() ? (
        <div className="num" style={{ fontWeight: 500, marginTop: '0.25rem' }}>
          {detail()}
        </div>
      ) : null}
    </div>
  );
}
