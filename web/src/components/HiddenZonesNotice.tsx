import type { Messages } from '@/i18n';

/**
 * Says out loud that the range filter is hiding zones, with one tap to show them.
 *
 * Without this, zones beyond the range simply vanish. On 29 Sep 2026 that hid all
 * ninety South Tamil Nadu zones behind a list full of Kerala ones, and the natural
 * conclusion was that the app had not picked them up at all.
 */
export function HiddenZonesNotice({
  t,
  hidden,
  rangeNmi,
  onShow,
}: {
  t: Messages;
  hidden: number;
  rangeNmi: number | null;
  onShow: () => void;
}): React.JSX.Element | null {
  if (hidden <= 0 || rangeNmi === null) return null;
  return (
    <div className="card row" role="status" style={{ justifyContent: 'space-between' }}>
      <span className="num" style={{ fontWeight: 700 }}>
        {t.moreBeyondRange(hidden, rangeNmi)}
      </span>
      <button type="button" className="primary" onClick={onShow}>
        {t.showThem}
      </button>
    </div>
  );
}
