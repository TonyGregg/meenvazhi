import { useCallback, useState } from 'react';
import type { Messages } from '@/i18n';
import type { PfzDocument, Zone } from '@/lib/pfz';
import { buildGpx, gpxFilename } from '@/lib/gpx';
import { isNativeApp } from '@/lib/platform';
import { shareGpxNatively } from '@/lib/nativeShare';

interface Props {
  t: Messages;
  doc: PfzDocument;
  zones: readonly Zone[];
}

/**
 * Hand the filtered zones to the GPS, or to the crew.
 *
 * Share is offered first where the platform supports it, because on a phone that
 * is how the file actually reaches a chart app or a WhatsApp group. Download is
 * the fallback, built from a blob so it works with no network.
 */
export function GpxExport({ t, doc, zones }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);

  const makeFile = useCallback((): File => {
    const sectorNameOf = (zone: Zone): string =>
      doc.sectors.find((s) => s.zones.some((z) => z.id === zone.id))?.sector_name ?? '';
    const gpx = buildGpx(doc, zones, sectorNameOf);
    return new File([gpx], gpxFilename(doc), { type: 'application/gpx+xml' });
  }, [doc, zones]);

  const download = useCallback(() => {
    setError(null);
    try {
      const file = makeFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      // Revoked on the next tick: revoking immediately can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [makeFile]);

  const share = useCallback(() => {
    setError(null);
    if (isNativeApp()) {
      // The app's WebView can neither download nor share a File, so hand it to the OS.
      const sectorNameOf = (zone: Zone): string =>
        doc.sectors.find((s) => s.zones.some((z) => z.id === zone.id))?.sector_name ?? '';
      shareGpxNatively(gpxFilename(doc), buildGpx(doc, zones, sectorNameOf), t.share).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
      return;
    }
    const file = makeFile();
    if (!navigator.canShare?.({ files: [file] })) {
      download();
      return;
    }
    void navigator.share({ files: [file], title: file.name }).catch(() => {
      // A cancelled share is not an error worth reporting.
    });
  }, [makeFile, download, doc, zones, t.share]);

  if (zones.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          {t.exportEmpty}
        </p>
      </div>
    );
  }

  // In the native apps sharing always works, through the system share sheet, and a
  // browser-style download does not work at all, so share is the only button.
  const native = isNativeApp();
  const canShare = native || (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>
        {t.exportNote}
      </p>
      <div className="row">
        {canShare ? (
          <button type="button" className="primary grow" onClick={share}>
            {t.share}
          </button>
        ) : null}
        {native ? null : (
          <button type="button" className={canShare ? 'grow' : 'primary grow'} onClick={download}>
            {t.download}
          </button>
        )}
      </div>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
