"""Turn parsed sector pages into the published document.

Every function here takes the current time as an argument. Nothing in this module
calls datetime.now(), which is what makes the golden tests reproducible: a schema
change shows up as a diff rather than as a test that passes today and fails
tomorrow.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from . import SCHEMA_VERSION, __version__
from .geo import inverse
from .model import SectorPage, SectorStatus
from .ports import Port
from .sectors import get_sector

SOURCE_URL = "https://incois.gov.in/MarineFisheries/TextDataHome?mfid=1&request_locale=en"
SOURCE_CREDIT = "Source: INCOIS, Ministry of Earth Sciences, Govt. of India"
SOURCE_NAME = "INCOIS Potential Fishing Zone advisory"

DISCLAIMER = "Advisory only. Not for navigation or safety of life at sea."


def _iso_utc(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def advisory_date(pages: list[SectorPage]) -> date | None:
    """The advisory's own date, in IST, taken from INCOIS's issue timestamp.

    Never the UTC run date. A run that fires at 17:00 IST is 11:30 UTC the same
    day, but a retry after midnight UTC would file the same advisory under the
    following date and make a one-day-old file look fresh.
    """
    stamps = [p.incois_updated_at for p in pages if p.incois_updated_at is not None]
    return max(stamps).date() if stamps else None


def valid_until(pages: list[SectorPage]) -> date | None:
    dates = [p.valid_until for p in pages if p.valid_until is not None]
    return max(dates) if dates else None


def build_zone(page: SectorPage, index: int, home: Port, reachable_nmi: float) -> dict[str, Any]:
    from .geo import dms_to_decimal

    row = page.rows[index]
    lat = dms_to_decimal(row.lat_dms)
    lon = dms_to_decimal(row.lon_dms)
    vector = inverse(home.lat, home.lon, lat, lon)
    code = get_sector(page.sector_id).code

    return {
        "id": f"{page.sector_id}-{index + 1:02d}",
        "gpx_name": f"{code}{index + 1:02d}",
        "landing_centre": row.landing_centre,
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "lat_dms": row.lat_dms,
        "lon_dms": row.lon_dms,
        "depth_m": row.depth_m.as_dict(),
        # INCOIS's own figures, measured from the named local landing centre.
        # Namespaced apart from from_home so the two can never be confused: the
        # difference for these zones is about 60 degrees of heading.
        "incois": {
            "direction": row.direction,
            "bearing_deg": row.bearing_deg,
            "distance_km": row.distance_km.as_dict(),
        },
        "from_home": {
            "distance_km": round(vector.distance_km, 1),
            "distance_nmi": round(vector.distance_nmi, 1),
            "bearing_deg": round(vector.bearing_deg, 1),
            "compass": vector.compass,
            "reachable": vector.distance_nmi <= reachable_nmi,
        },
    }


def build_sector(page: SectorPage, home: Port, reachable_nmi: float) -> dict[str, Any]:
    zones = [build_zone(page, i, home, reachable_nmi) for i in range(page.zone_count)]
    # Sorted by range from the home port, because that is the only order that
    # matters to someone deciding where to steer.
    zones.sort(key=lambda z: z["from_home"]["distance_nmi"])
    return {
        "sector_id": page.sector_id,
        "sector_name": page.sector_name,
        "status": str(page.status),
        "reason": page.reason,
        "incois_updated_at": page.incois_updated_at.isoformat() if page.incois_updated_at else None,
        "valid_until": page.valid_until.isoformat() if page.valid_until else None,
        "zone_count": page.zone_count,
        "zones": zones,
    }


def build_document(
    pages: list[SectorPage],
    *,
    home: Port,
    reachable_nmi: float,
    now: datetime,
) -> dict[str, Any]:
    """Assemble the published document. `now` is injected, never read from the clock."""
    # Coerced so the published type does not depend on whether the caller passed
    # an int or a float. The golden byte-compare caught exactly that drift.
    reachable_nmi = float(reachable_nmi)
    sectors = [build_sector(p, home, reachable_nmi) for p in pages]
    all_zones = [z for s in sectors for z in s["zones"]]
    issued = advisory_date(pages)
    expires = valid_until(pages)

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": _iso_utc(now),
        "generator": f"Meenvazhi/{__version__}",
        "advisory_date": issued.isoformat() if issued else None,
        "valid_until": expires.isoformat() if expires else None,
        "source": {
            "name": SOURCE_NAME,
            "url": SOURCE_URL,
            "credit": SOURCE_CREDIT,
        },
        "disclaimer": DISCLAIMER,
        "home_port": {
            "id": home.slug,
            "name": home.name,
            "lat": home.lat,
            "lon": home.lon,
        },
        "reachable_nmi": reachable_nmi,
        "sectors": sectors,
        "counts": {
            "sectors": len(sectors),
            "with_advisory": sum(1 for s in sectors if s["status"] == SectorStatus.HAS_ADVISORY),
            "zones": len(all_zones),
            "reachable": sum(1 for z in all_zones if z["from_home"]["reachable"]),
        },
    }
