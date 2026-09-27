import { useEffect, useRef } from 'react';
import type { Messages } from '@/i18n';
import type { PfzDocument, Zone } from '@/lib/pfz';
import { nmi } from '@/lib/format';

interface Props {
  t: Messages;
  doc: PfzDocument;
  zones: readonly Zone[];
  targetZoneId: string | null;
  dead: boolean;
}

const RINGS_NMI = [50, 100, 150, 200] as const;

/**
 * A plot, not a map, and that is a deliberate choice rather than a shortcut.
 *
 * Caching OpenStreetMap tiles for offline use is against the tile usage policy,
 * and a 350 nautical mile radius of the Arabian Sea is on the order of twenty
 * thousand tiles and a few hundred megabytes, nearly all of it featureless blue
 * water. It would be downloaded over a harbour connection and could be evicted by
 * the browser at any moment.
 *
 * What a fisherman actually needs is spatial sense: which way, how far, and are
 * the zones clustered or scattered. A canvas with the home port at the centre and
 * range rings gives all of that for no bytes and no battery.
 *
 * Drawn on a canvas rather than as SVG elements so twenty-odd zones cost one paint
 * rather than twenty nodes, and redrawn only when the inputs change.
 */
export function PlotView({ t, doc, zones, targetZoneId, dead }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Wrapped, not merely null-checked. A canvas context can be refused outright:
    // some privacy modes block it as a fingerprinting surface, and a device under
    // memory pressure can fail to allocate one. The plot is a secondary screen, so
    // losing it must never take the zone list down with it.
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!context) return;

    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--text').trim() || '#000';
    const dim = styles.getPropertyValue('--text-dim').trim() || '#666';
    const accent = styles.getPropertyValue('--accent').trim() || '#04283c';
    const surface = styles.getPropertyValue('--surface').trim() || '#fff';

    // Render at device resolution so the labels are not soft on a phone.
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const size = canvas.clientWidth;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    context.fillStyle = surface;
    context.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const margin = 26;
    const maxRadius = size / 2 - margin;

    const furthest = zones.reduce((max, z) => Math.max(max, z.from_home.distance_nmi), 0);
    // Always show at least the 50 nmi ring, so an empty plot still reads as a scale
    // rather than as a blank square.
    const scaleNmi = Math.max(furthest * 1.08, 50);
    const toPx = (distanceNmi: number): number => (distanceNmi / scaleNmi) * maxRadius;

    context.lineWidth = 1;
    context.font = '12px system-ui, sans-serif';
    context.textAlign = 'center';

    for (const ring of RINGS_NMI) {
      if (ring > scaleNmi) continue;
      const r = toPx(ring);
      context.strokeStyle = dim;
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = dim;
      context.fillText(`${ring}`, cx, cy - r - 4);
    }

    // Cardinal spokes and letters, so the plot is readable without a legend.
    context.strokeStyle = dim;
    context.beginPath();
    context.moveTo(cx, cy - maxRadius);
    context.lineTo(cx, cy + maxRadius);
    context.moveTo(cx - maxRadius, cy);
    context.lineTo(cx + maxRadius, cy);
    context.stroke();

    context.fillStyle = ink;
    context.font = 'bold 15px system-ui, sans-serif';
    context.fillText('N', cx, margin - 8);
    context.fillText('S', cx, size - 6);
    context.textAlign = 'left';
    context.fillText('E', size - margin + 6, cy + 5);
    context.textAlign = 'right';
    context.fillText('W', margin - 6, cy + 5);

    for (const zone of zones) {
      const angle = ((zone.from_home.bearing_deg - 90) * Math.PI) / 180;
      const r = toPx(zone.from_home.distance_nmi);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const isTarget = zone.id === targetZoneId;

      context.beginPath();
      context.arc(x, y, isTarget ? 9 : 6, 0, Math.PI * 2);
      // Reachable zones are filled, unreachable ones hollow, so the distinction
      // survives a glance and does not depend on colour.
      if (zone.from_home.reachable && !dead) {
        context.fillStyle = isTarget ? accent : ink;
        context.fill();
      } else {
        context.strokeStyle = isTarget ? accent : dim;
        context.lineWidth = isTarget ? 3 : 2;
        context.stroke();
      }
    }

    // The home port last, on top of everything.
    context.fillStyle = accent;
    context.beginPath();
    context.arc(cx, cy, 5, 0, Math.PI * 2);
    context.fill();
  }, [zones, targetZoneId, dead]);

  return (
    <div className="stack">
      <div className="card stack">
        <p className="label" style={{ margin: 0 }}>
          {t.plotTitle}
        </p>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }}
          role="img"
          aria-label={
            zones.length === 0
              ? t.plotNoZones
              : `${t.plotTitle}. ${t.zonesFound(zones.length)}. ${zones
                  .slice(0, 5)
                  .map((z) => `${z.gpx_name} ${Math.round(z.from_home.bearing_deg)} ${nmi(z.from_home.distance_nmi)}`)
                  .join('. ')}`
          }
        />
        <p className="muted" style={{ margin: 0 }}>
          {doc.home_port.name} · {RINGS_NMI.map((r) => t.plotRings(r)).join(' · ')}
        </p>
      </div>
    </div>
  );
}
