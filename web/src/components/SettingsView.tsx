import { useEffect, useState } from 'react';
import type { Messages } from '@/i18n';
import { LOCALE_NAMES, LOCALES } from '@/i18n';
import type { Settings, Theme } from '@/hooks/useSettings';
import { requestPersistence, storageEstimate } from '@/lib/store';
import { bytes } from '@/lib/format';
import type { PfzDocument } from '@/lib/pfz';

interface Props {
  t: Messages;
  settings: Settings;
  doc: PfzDocument | null;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const THEMES: readonly Theme[] = ['sun', 'day', 'night'] as const;

export function SettingsView({ t, settings, doc, onChange }: Props): React.JSX.Element {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // Surfaced rather than assumed: Chrome grants persistence to an installed
      // app, Safari ignores the request entirely, and the difference decides
      // whether a week-old advisory is still there when the boat comes back.
      setPersisted(await requestPersistence());
      const estimate = await storageEstimate();
      setUsage(estimate ? bytes(estimate.usage) : null);
    })();
  }, []);

  const themeLabel = (theme: Theme): string =>
    theme === 'sun' ? t.themeSun : theme === 'day' ? t.themeDay : t.themeNight;

  return (
    <div className="stack">
      <div className="card stack">
        <span className="label" id="lang-label">
          {t.language}
        </span>
        <div className="row" role="group" aria-labelledby="lang-label">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              className="grow"
              lang={l}
              aria-pressed={settings.locale === l}
              onClick={() => onChange('locale', l)}
            >
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <span className="label" id="theme-label">
          {t.theme}
        </span>
        <div className="row" role="group" aria-labelledby="theme-label">
          {THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              className="grow"
              aria-pressed={settings.theme === theme}
              onClick={() => onChange('theme', theme)}
            >
              {themeLabel(theme)}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {settings.theme === 'night' ? t.themeNightWhy : t.themeSunWhy}
        </p>
      </div>

      <div className="card stack">
        <span className="label">{t.storage}</span>
        <p style={{ margin: 0 }}>{persisted ? t.storageKept : t.storageNotKept}</p>
        {usage ? (
          <p className="muted num" style={{ margin: 0 }}>
            {t.storageUsed(usage)}
          </p>
        ) : null}
      </div>

      <div className="card stack">
        <span className="label">{t.credits}</span>
        <p style={{ margin: 0 }}>{t.credit}</p>
        {doc ? (
          <p className="muted num wrap-anywhere" style={{ margin: 0 }}>
            {doc.generator} · {doc.source.url}
          </p>
        ) : null}
        <p className="muted" style={{ margin: 0 }}>
          {t.bearingsAreTrue}
        </p>
      </div>
    </div>
  );
}
