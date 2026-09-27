/**
 * GPX for the zones currently in range, generated on the device.
 *
 * The pipeline already publishes a GPX of every zone. This exists because the
 * filtered set is the one that gets loaded: older units cap out at 500 to 1000
 * waypoints and some replace all stored waypoints on import, so handing someone
 * twenty zones they can reach beats handing them every zone on the coast.
 *
 * The same constraints as the Python writer apply, for the same reason, and they
 * are not stylistic. Names are at most six uppercase ASCII alphanumerics because
 * real Garmin, Lowrance and Simrad units truncate longer ones and then silently
 * merge the collisions. No Malayalam or Tamil appears anywhere: units that are
 * Latin-1 internally render it as mojibake or reject the file outright.
 */

import type { PfzDocument, Zone } from './pfz';

const GPX_NS = 'http://www.topografix.com/GPX/1/1';
const MAX_NAME_LENGTH = 6;
const MAX_COMMENT_LENGTH = 40;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Drop anything a Latin-1 unit cannot render, and collapse whitespace. */
function asciiOnly(value: string): string {
  return value
    .split('')
    .filter((c) => c.charCodeAt(0) < 128)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function safeName(name: string): string {
  const cleaned = asciiOnly(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, MAX_NAME_LENGTH) || 'WPT';
}

export function buildGpx(doc: PfzDocument, zones: readonly Zone[], sectorNameOf: (zone: Zone) => string): string {
  const stamp = doc.generated_at;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(doc.generator)} (Meenvazhi app)"`,
    `     xmlns="${GPX_NS}"`,
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    `     xsi:schemaLocation="${GPX_NS} ${GPX_NS}/gpx.xsd">`,
    '  <metadata>',
    `    <name>Meenvazhi PFZ ${escapeXml(doc.advisory_date ?? 'unknown date')}</name>`,
    `    <desc>${escapeXml(asciiOnly(metadataDesc(doc)))}</desc>`,
    `    <time>${stamp}</time>`,
    '  </metadata>',
  ];

  const used = new Set<string>();
  for (const zone of zones) {
    // Suffix a collision rather than emit a duplicate the unit would merge.
    let name = safeName(zone.gpx_name);
    if (used.has(name)) {
      for (let n = 2; n < 100; n += 1) {
        const candidate = safeName(`${name.slice(0, MAX_NAME_LENGTH - String(n).length)}${n}`);
        if (!used.has(candidate)) {
          name = candidate;
          break;
        }
      }
    }
    used.add(name);

    const home = zone.from_home;
    const centre = asciiOnly(zone.landing_centre);
    const comment = asciiOnly(
      `${centre} ${Math.round(home.distance_nmi)}nmi ${Math.round(home.bearing_deg)}T d${zone.depth_m.from}-${zone.depth_m.to}m`,
    ).slice(0, MAX_COMMENT_LENGTH);
    const description = asciiOnly(
      `${sectorNameOf(zone)} / ${centre}. ${home.distance_nmi.toFixed(1)} nmi at ` +
        `${Math.round(home.bearing_deg)} deg true from ${asciiOnly(doc.home_port.name)}. ` +
        `Depth ${zone.depth_m.from}-${zone.depth_m.to} m.` +
        (doc.valid_until ? ` Valid until ${doc.valid_until}.` : ''),
    );

    lines.push(
      `  <wpt lat="${zone.lat.toFixed(6)}" lon="${zone.lon.toFixed(6)}">`,
      `    <time>${stamp}</time>`,
      `    <name>${escapeXml(name)}</name>`,
      `    <cmt>${escapeXml(comment)}</cmt>`,
      `    <desc>${escapeXml(description)}</desc>`,
      '    <sym>Fish</sym>',
      '    <type>PFZ</type>',
      '  </wpt>',
    );
  }

  lines.push('</gpx>');
  // Newline endings and no byte-order mark: some units reject a file with a BOM.
  return `${lines.join('\n')}\n`;
}

function metadataDesc(doc: PfzDocument): string {
  const parts = ['INCOIS Potential Fishing Zone advisory'];
  if (doc.valid_until) parts.push(`valid until ${doc.valid_until}`);
  parts.push(doc.disclaimer.replace(/\.$/, ''));
  parts.push(doc.source.credit);
  return parts.join('. ');
}

export function gpxFilename(doc: PfzDocument): string {
  return `meenvazhi-pfz-${doc.advisory_date ?? 'latest'}.gpx`;
}
