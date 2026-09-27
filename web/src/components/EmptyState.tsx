import type { Messages } from '@/i18n';

export type EmptyReason =
  /** INCOIS published nothing, usually cloud cover. Common, not an error. */
  | 'no-advisory'
  /** Zones exist but all beyond the chosen range. Also common. */
  | 'out-of-range'
  /** Never been online. The first-run case. */
  | 'no-data';

interface Props {
  t: Messages;
  reason: EmptyReason;
  rangeNmi: number | null;
}

/**
 * Three genuinely different empty states, each named plainly.
 *
 * All three are ordinary outcomes rather than failures. On the day this was built,
 * three of four sectors were cloud-covered and not one published zone was inside a
 * realistic range, so these screens get seen more often than the list does. An
 * empty list with no explanation would read as a broken app and lose trust that is
 * hard to win back.
 */
export function EmptyState({ t, reason, rangeNmi }: Props): React.JSX.Element {
  const [heading, why] =
    reason === 'no-advisory'
      ? [t.emptyNoAdvisory, t.emptyNoAdvisoryWhy]
      : reason === 'out-of-range'
        ? [t.emptyOutOfRange(rangeNmi ?? 0), t.emptyOutOfRangeWhy]
        : [t.emptyNoData, t.emptyNoDataWhy];

  return (
    <div className="card centre stack" role="status">
      <p className="big" style={{ margin: 0 }}>
        {heading}
      </p>
      <p className="muted" style={{ margin: 0 }}>
        {why}
      </p>
    </div>
  );
}
