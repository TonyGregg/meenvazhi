import type { Messages } from '@/i18n';
import { BAN_WINDOW, isInBanWindow, type Coast } from '@/data/ports';

interface Props {
  t: Messages;
  coast: Coast;
  now: Date;
}

/**
 * The statutory monsoon fishing ban.
 *
 * Shown because INCOIS says nothing about it, and an advisory during a ban is
 * information nobody can legally act on. The exact dates are set annually by each
 * maritime state and move by a few days, so the wording asks the reader to confirm
 * this year's notification rather than presenting itself as the authority.
 */
export function BanNotice({ t, coast, now }: Props): React.JSX.Element | null {
  if (!isInBanWindow(coast, now)) return null;
  const key = BAN_WINDOW[coast].labelKey;
  return (
    <div className="banner banner--info" role="note">
      {key === 'banWest' ? t.banWest : t.banEast}
    </div>
  );
}
