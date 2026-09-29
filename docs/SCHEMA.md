# Output schema

`schema_version` is currently **1**.

This file is a contract. The app is installed on a phone that cannot be updated at
sea, so a field that quietly changes name or nesting breaks a boat rather than a
build. Any incompatible change increments `schema_version`, and the app refuses a
document whose version it does not know rather than mis-rendering it.

`tests/test_build_golden.py` compares a full build against
`tests/fixtures/golden/pfz-latest.json` byte for byte, so drift shows up as a diff.

## Files published

| File | Purpose |
|---|---|
| `pfz-latest.json` | The document below. What the app reads. |
| `pfz-latest.gpx` | GPX 1.1 waypoints for a GPS unit. See `meenvazhi/gpx.py` for the unit constraints. |
| `pfz-latest.txt` | A short digest to send over WhatsApp or read out on VHF. |
| `status.json` | Last attempt, including failures. Never read by the app for advisory data. |
| `history/YYYY-MM-DD.json` | A copy of the document, keyed by IST advisory date. |
| `history/index.json` | Available dates, newest first, because Pages serves no directory listing. |

## Document

```json
{
  "schema_version": 1,
  "generated_at": "2026-09-27T11:31:04Z",
  "generator": "Meenvazhi/1.0.0",
  "advisory_date": "2026-09-27",
  "valid_until": "2026-09-28",
  "forecast_date": "2026-09-27",
  "valid_upto": "2026-09-28",
  "source": {
    "name": "INCOIS Potential Fishing Zone advisory",
    "url": "https://incois.gov.in/MarineFisheries/TextDataHome?mfid=1&request_locale=en",
    "credit": "Source: INCOIS, Ministry of Earth Sciences, Govt. of India"
  },
  "disclaimer": "Advisory only. Not for navigation or safety of life at sea.",
  "home_port": { "id": "kochi", "name": "Kochi (Cochin Fisheries Harbour)", "lat": 9.937, "lon": 76.261 },
  "reachable_nmi": 120.0,
  "sectors": [ /* see below */ ],
  "counts": { "sectors": 4, "with_advisory": 1, "zones": 20, "reachable": 0 }
}
```

`advisory_date` is INCOIS's own issue date in **Asia/Kolkata**, taken from the
hidden `updatedDate` field on their page. It is never the UTC run date: a retry
either side of midnight UTC would otherwise relabel yesterday's advisory as
today's and make stale data look fresh. `generated_at` is the run time in UTC, and
is not a freshness signal.

`forecast_date` and `valid_upto` are the Forecast Date and Valid upto shown on
INCOIS's Text Data landing page, exactly as labelled there, or null if the page
lacked them. The pipeline already loads that page to open its session, so they cost
no extra request. They matter most on a day when every sector is cloud-covered:
the sector pages then carry no date at all, but the landing page still does. When
present they also supply `advisory_date` and `valid_until`. Added without changing
`schema_version`, because older apps simply ignore fields they do not know.

`valid_until` comes from INCOIS's own "FISH STOCK TILL" line. An advisory is good
for about a day, so on day five of a trip a cached document is not slightly old,
it is finished. The app computes staleness from these two fields, never from when
it happened to fetch the file.

## Sector

```json
{
  "sector_id": "SEC005",
  "sector_name": "KERALA",
  "status": "NO_ADVISORY",
  "reason": "excessive cloud cover",
  "incois_updated_at": "2026-09-27T15:26:56+05:30",
  "valid_until": null,
  "zone_count": 0,
  "zones": []
}
```

`status` is one of:

| Value | Meaning |
|---|---|
| `HAS_ADVISORY` | Zones were published for this sector. |
| `NO_ADVISORY` | INCOIS genuinely published nothing, with `reason` saying why. Usually cloud cover, and usually most sectors on most days. |
| `FETCH_FAILED` | Appears only in `status.json`. A run containing one publishes nothing at all. |

A sector saying `NO_ADVISORY` is data, and the app states it plainly. It is not an
error and not an empty screen.

## Zone

```json
{
  "id": "SEC004-01",
  "gpx_name": "KA01",
  "landing_centre": "Karwar",
  "lat": 14.819444,
  "lon": 73.307222,
  "lat_dms": "14 49 10 N",
  "lon_dms": "73 18 26 E",
  "depth_m": { "from": 105, "to": 110 },
  "incois":    { "direction": "W", "bearing_deg": 270, "distance_km": { "from": 79, "to": 84 } },
  "from_home": { "distance_km": 628.4, "distance_nmi": 339.3, "bearing_deg": 329.6, "compass": "NNW", "reachable": false }
}
```

**The `incois` and `from_home` split is the most important thing in this schema.**
INCOIS measures bearing and distance from the named local landing centre. We
measure from the user's home port. For these Karnataka zones the two differ by
about 60 degrees, so anything that reads `incois.bearing_deg` as a course to steer
sends a boat badly wrong. The namespacing exists to make that mistake hard.

`lat` and `lon` are converted from the DMS strings, which are kept verbatim as the
provenance record and because a GPS unit's manual-entry screen asks for DMS.
Coordinates are never taken from INCOIS's own decimal-degrees view, which rounds
to two places and discards up to about 550 m.

`depth_m` and `incois.distance_km` stay as ranges. The band is the useful
information; a midpoint implies precision the source never claimed.

`reachable` is precomputed against `reachable_nmi`, while the raw distance stays
present so the app can re-filter offline without fetching anything.

`id` and `gpx_name` are stable within one advisory only. Do not treat either as a
durable key across days.
