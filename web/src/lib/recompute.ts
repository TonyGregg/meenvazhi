/**
 * Recompute every bearing and distance for a different home port.
 *
 * This exists because the home port is a setting and the boat has no signal. If
 * changing it required a new pipeline run, the setting would be useless at sea,
 * which is the only place it matters. So the app redoes the geodesics itself,
 * using the same Vincenty solution the pipeline uses, checked against the same
 * golden file.
 */

import { inverse } from './geo';
import type { PfzDocument, Sector, Zone } from './pfz';
import type { Port } from '@/data/ports';

function recomputeZone(zone: Zone, port: Port, reachableNmi: number | null): Zone {
  const v = inverse(port.lat, port.lon, zone.lat, zone.lon);
  return {
    ...zone,
    from_home: {
      // Rounded to match what the pipeline publishes, so a zone reads identically
      // whether the figures came from Python or from here.
      distance_km: Math.round(v.distanceKm * 10) / 10,
      distance_nmi: Math.round(v.distanceNmi * 10) / 10,
      bearing_deg: Math.round(v.bearingDeg * 10) / 10,
      compass: v.compass,
      reachable: reachableNmi === null ? true : v.distanceNmi <= reachableNmi,
    },
  };
}

/**
 * Return the document as it would read from `port`.
 *
 * Returns the original untouched when the port already matches and the range is
 * unchanged, so the common case costs nothing.
 */
export function withHomePort(doc: PfzDocument, port: Port, reachableNmi: number | null): PfzDocument {
  const samePort = doc.home_port.id === port.slug;
  const sameRange = reachableNmi === doc.reachable_nmi;
  if (samePort && sameRange) return doc;

  const sectors: Sector[] = doc.sectors.map((sector) => ({
    ...sector,
    zones: sector.zones
      .map((zone) => recomputeZone(zone, port, reachableNmi))
      .sort((a, b) => a.from_home.distance_nmi - b.from_home.distance_nmi),
  }));

  const zones = sectors.flatMap((s) => s.zones);
  return {
    ...doc,
    home_port: { id: port.slug, name: port.name, lat: port.lat, lon: port.lon },
    reachable_nmi: reachableNmi ?? Number.POSITIVE_INFINITY,
    sectors,
    counts: { ...doc.counts, reachable: zones.filter((z) => z.from_home.reachable).length },
  };
}
