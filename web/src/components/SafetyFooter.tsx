import type { Messages } from '@/i18n';

/**
 * On every screen, never conditional.
 *
 * This app reformats a forecast. Someone who starts treating it as a chart is the
 * failure mode that matters most, so the disclaimer and the INCOIS credit travel
 * with every view rather than hiding in an About page.
 */
export function SafetyFooter({ t }: { t: Messages }): React.JSX.Element {
  return (
    <footer className="stack" style={{ gap: '0.25rem', marginTop: 'var(--pad)' }}>
      <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
        {t.disclaimer}
      </p>
      <p className="muted" style={{ margin: 0 }}>
        {t.bearingsAreTrue}
      </p>
      <p className="muted" style={{ margin: 0 }}>
        {t.credit}
      </p>
    </footer>
  );
}
