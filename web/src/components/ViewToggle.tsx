import type { Messages } from '@/i18n';
import type { ZoneView } from '@/hooks/useSettings';

export function ViewToggle({
  t,
  view,
  onChange,
}: {
  t: Messages;
  view: ZoneView;
  onChange: (view: ZoneView) => void;
}): React.JSX.Element {
  return (
    <div className="row" role="group" aria-label={t.tabZones} style={{ gap: '0.5rem' }}>
      <button type="button" className="grow" aria-pressed={view === 'nearest'} onClick={() => onChange('nearest')}>
        {t.viewNearest}
      </button>
      <button type="button" className="grow" aria-pressed={view === 'area'} onClick={() => onChange('area')}>
        {t.viewByArea}
      </button>
    </div>
  );
}
