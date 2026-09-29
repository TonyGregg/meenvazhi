import { useEffect, useMemo, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { AppHeader } from '@/components/AppHeader';
import { BanNotice } from '@/components/BanNotice';
import { CompassView } from '@/components/CompassView';
import { EmptyState, type EmptyReason } from '@/components/EmptyState';
import { GpxExport } from '@/components/GpxExport';
import { PlotView } from '@/components/PlotView';
import { SafetyFooter } from '@/components/SafetyFooter';
import { SettingsView } from '@/components/SettingsView';
import { StalenessBanner } from '@/components/StalenessBanner';
import { ForecastDatesBar } from '@/components/ForecastDatesBar';
import { ZoneFilters } from '@/components/ZoneFilters';
import { ZoneList } from '@/components/ZoneList';
import { AreaView } from '@/components/AreaView';
import { HiddenZonesNotice } from '@/components/HiddenZonesNotice';
import { ViewToggle } from '@/components/ViewToggle';
import { DEFAULT_PORT_SLUG, portBySlug } from '@/data/ports';
import { useOnline } from '@/hooks/useOnline';
import { usePfzData } from '@/hooks/usePfzData';
import { useSettings } from '@/hooks/useSettings';
import { LOCALE_TAGS, messages } from '@/i18n';
import { allZones } from '@/lib/pfz';
import { hiddenByRange, incoisOrder, pickAreaSector, portShortName } from '@/lib/areas';
import { withHomePort } from '@/lib/recompute';
import { assess } from '@/lib/staleness';
import { isNativeApp } from '@/lib/platform';

type Tab = 'zones' | 'plot' | 'compass' | 'settings';

/**
 * The shell.
 *
 * Tabs are plain state rather than a router. It saves a dependency and a class of
 * base-path bugs on a project Pages subpath, and the app has four screens and no
 * deep links worth preserving.
 */
export function App(): React.JSX.Element {
  const [settings, update] = useSettings();
  const { state, refresh } = usePfzData();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>('zones');
  const [sector, setSector] = useState<string | null>(null);

  // Android's back button: from any other tab it returns to the zone list, and from
  // the zone list it sends the app to the background rather than closing it. A
  // fisherman who backs out by accident should find the app exactly where they left
  // it, not reloading.
  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (tab !== 'zones') setTab('zones');
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [tab]);

  const t = messages(settings.locale);
  const localeTag = LOCALE_TAGS[settings.locale];
  const port = portBySlug(settings.homePort) ?? portBySlug(DEFAULT_PORT_SLUG)!;

  // Read once per render rather than on a timer. Nothing on these screens needs to
  // tick, and a timer would wake the device for no reason.
  const now = new Date();

  // Recomputed for whatever home port and range are set, so changing either works
  // with no signal.
  const doc = useMemo(
    () => (state.document ? withHomePort(state.document, port, settings.rangeNmi) : null),
    [state.document, port, settings.rangeNmi],
  );

  // Not memoised: assess is a handful of date comparisons, and a memo keyed on a
  // fresh Date could never hit.
  const staleness = assess(doc, now);

  const visibleZones = useMemo(() => {
    if (!doc) return [];
    let zones = allZones(doc).filter((z) => z.from_home.reachable);
    if (sector) {
      const named = doc.sectors.find((s) => s.sector_name === sector);
      const ids = new Set(named?.zones.map((z) => z.id) ?? []);
      zones = zones.filter((z) => ids.has(z.id));
    }
    if (settings.sortBy === 'bearing') {
      zones = [...zones].sort((a, b) => a.from_home.bearing_deg - b.from_home.bearing_deg);
    }
    return zones;
  }, [doc, sector, settings.sortBy]);

  const target = useMemo(
    () => (doc && settings.targetZoneId ? (allZones(doc).find((z) => z.id === settings.targetZoneId) ?? null) : null),
    [doc, settings.targetZoneId],
  );

  const publishedZoneCount = doc ? doc.counts.zones : 0;
  const emptyReason: EmptyReason | null = !doc
    ? 'no-data'
    : visibleZones.length > 0
      ? null
      : publishedZoneCount > 0
        ? 'out-of-range'
        : 'no-advisory';

  const sectorNames = doc ? doc.sectors.filter((s) => s.zones.length > 0).map((s) => s.sector_name) : [];

  // "Nearest to me": zones the range filter hides are counted, never silently dropped.
  const hidden = doc ? hiddenByRange(doc, sector) : 0;

  // "By area": one sector, every zone, in the order INCOIS lists them.
  const areaSector = doc ? pickAreaSector(doc, settings.areaSectorId) : undefined;
  const areaZones = useMemo(() => (areaSector ? incoisOrder(areaSector.zones) : []), [areaSector]);
  const byArea = settings.view === 'area';
  const shownZones = byArea ? areaZones : visibleZones;

  return (
    <div className="app">
      <AppHeader
        t={t}
        locale={settings.locale}
        online={online}
        refreshing={state.loading}
        onLocaleChange={(l) => update('locale', l)}
        onRefresh={() => void refresh()}
      />

      {doc ? <ForecastDatesBar t={t} doc={doc} localeTag={localeTag} dead={staleness.isDead} /> : null}
      <StalenessBanner
        t={t}
        report={staleness}
        localeTag={localeTag}
        fromCache={state.source === 'cache'}
        datesShownAbove={doc !== null}
      />
      {state.needsAppUpdate ? (
        <div className="banner banner--warn" role="status">
          {t.appUpdateNeeded}
        </div>
      ) : null}
      <BanNotice t={t} coast={port.coast} now={now} />

      <main className="app__main stack">
        {tab === 'zones' ? (
          <>
            <ViewToggle t={t} view={settings.view} onChange={(v) => update('view', v)} />
            <ZoneFilters
              t={t}
              homePort={settings.homePort}
              rangeNmi={settings.rangeNmi}
              sortBy={settings.sortBy}
              sectorNames={byArea ? [] : sectorNames}
              selectedSector={sector}
              onHomePort={(slug) => update('homePort', slug)}
              onRange={(value) => update('rangeNmi', value)}
              onSortBy={(value) => update('sortBy', value)}
              onSector={setSector}
              showRangeControls={!byArea}
            />
            {!doc ? (
              <EmptyState t={t} reason="no-data" rangeNmi={settings.rangeNmi} />
            ) : byArea ? (
              <>
                <AreaView
                  t={t}
                  doc={doc}
                  sector={areaSector}
                  zones={areaZones}
                  portName={portShortName(port.name)}
                  targetZoneId={settings.targetZoneId}
                  dead={staleness.isDead}
                  onSector={(id) => update('areaSectorId', id)}
                  onSetTarget={(id) => update('targetZoneId', id)}
                />
                {areaZones.length > 0 ? <GpxExport t={t} doc={doc} zones={areaZones} /> : null}
              </>
            ) : (
              <>
                {emptyReason ? (
                  <EmptyState t={t} reason={emptyReason} rangeNmi={settings.rangeNmi} />
                ) : (
                  <ZoneList
                    t={t}
                    doc={doc}
                    zones={visibleZones}
                    targetZoneId={settings.targetZoneId}
                    dead={staleness.isDead}
                    onSetTarget={(id) => update('targetZoneId', id)}
                  />
                )}
                <HiddenZonesNotice
                  t={t}
                  hidden={hidden}
                  rangeNmi={settings.rangeNmi}
                  onShow={() => update('rangeNmi', null)}
                />
                {visibleZones.length > 0 ? <GpxExport t={t} doc={doc} zones={visibleZones} /> : null}
              </>
            )}
          </>
        ) : null}

        {tab === 'plot' ? (
          doc ? (
            <PlotView
              t={t}
              doc={doc}
              zones={shownZones.length > 0 ? shownZones : allZones(doc)}
              targetZoneId={settings.targetZoneId}
              dead={staleness.isDead}
            />
          ) : (
            <EmptyState t={t} reason="no-data" rangeNmi={settings.rangeNmi} />
          )
        ) : null}

        {tab === 'compass' ? <CompassView t={t} target={target} active={tab === 'compass'} /> : null}

        {tab === 'settings' ? <SettingsView t={t} settings={settings} doc={doc} onChange={update} /> : null}

        <SafetyFooter t={t} />
      </main>

      <nav className="tabs" aria-label={t.appName}>
        {(
          [
            ['zones', t.tabZones, '≣'],
            ['plot', t.tabPlot, '◉'],
            ['compass', t.tabCompass, '↑'],
            // U+FE0E asks for the plain text glyph: iOS otherwise draws the gear as a
            // colour emoji, unlike the other three tab icons.
            ['settings', t.tabSettings, '\u2699\uFE0E'],
          ] as const
        ).map(([id, label, glyph]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <span className="tabs__icon" aria-hidden="true">
              {glyph}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
