import type { Locale, Messages } from '@/i18n';
import { LOCALE_NAMES, LOCALES } from '@/i18n';

interface Props {
  t: Messages;
  locale: Locale;
  online: boolean;
  refreshing: boolean;
  onLocaleChange: (locale: Locale) => void;
  onRefresh: () => void;
}

/**
 * The name is shown as "Meenvazhi · മീൻവഴി" so the brand is recognisable in Latin
 * while the script confirms to a Malayalam or Tamil reader that the app is theirs.
 */
export function AppHeader({ t, locale, online, refreshing, onLocaleChange, onRefresh }: Props): React.JSX.Element {
  return (
    <header className="header">
      <h1 className="header__name">
        {t.appName}
        {t.script ? <span aria-hidden="true"> · </span> : null}
        {t.script ? <span lang={locale}>{t.script}</span> : null}
      </h1>

      <div className="row" style={{ gap: '0.5rem' }}>
        <span className="muted" style={{ color: 'inherit' }}>
          <span className="header__dot" aria-hidden="true" style={{ opacity: online ? 1 : 0.35 }} />
          <span className="visually-hidden">{online ? t.online : t.offline}</span>
        </span>

        <label className="visually-hidden" htmlFor="locale">
          {t.language}
        </label>
        <select
          id="locale"
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
          style={{ minHeight: '2.75rem' }}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>

        <button type="button" onClick={onRefresh} disabled={refreshing || !online}>
          {refreshing ? t.refreshing : t.refresh}
        </button>
      </div>
    </header>
  );
}
