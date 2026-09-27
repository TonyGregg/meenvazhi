"""Coordinate conversion and geodesic calculation.

Two deliberate choices here.

Coordinates are converted from the degrees-minutes-seconds strings on the INCOIS
page, never taken from its decimal-degrees view. That view exists -- the
formattedForecast.action endpoint will return latlongformat=dd -- but it rounds to
two decimal places, which discards up to about 550 m of position. On a fishing
zone only a mile or two wide, handed to someone steering a boat, that is not an
acceptable loss. DMS gives us roughly 30 m.

Distances and bearings use exact WGS84 geodesics via geographiclib rather than a
spherical approximation. The difference over the 350 nautical miles that separate
Kochi from the northern Karnataka zones is about 2 km and 0.2 degrees. Small, but
free to get right, and it makes the golden tests reproducible against an
authoritative implementation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from geographiclib.geodesic import Geodesic

from .model import ParseError

KM_PER_NAUTICAL_MILE = 1.852

# "14 49 10 N", "73 18 26 E", tolerating any whitespace run and optional symbols.
_DMS_RE = re.compile(
    r"""^\s*
    (?P<deg>\d{1,3})\s*[°d]?\s+
    (?P<min>\d{1,2})\s*['m]?\s+
    (?P<sec>\d{1,2}(?:\.\d+)?)\s*["s]?\s*
    (?P<hemi>[NSEW])
    \s*$""",
    re.IGNORECASE | re.VERBOSE,
)

_COMPASS_16 = (
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
)
_COMPASS_8 = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


@dataclass(frozen=True, slots=True)
class Vector:
    """A geodesic from one point to another, as the app needs to present it."""

    distance_km: float
    distance_nmi: float
    bearing_deg: float
    compass: str


def dms_to_decimal(raw: str) -> float:
    """Convert an INCOIS DMS string to signed decimal degrees.

    Accepts single-digit minutes and seconds, which the source emits freely
    ("14 40 0 N", "13 2 26 N"). Rejects out-of-range values rather than wrapping
    them, because a silently wrapped latitude puts a waypoint in the wrong ocean.
    """
    m = _DMS_RE.match(raw)
    if not m:
        raise ParseError(f"unrecognised DMS coordinate {raw!r}")

    deg = int(m.group("deg"))
    minutes = int(m.group("min"))
    seconds = float(m.group("sec"))
    hemi = m.group("hemi").upper()

    if minutes >= 60:
        raise ParseError(f"{raw!r}: minutes must be under 60")
    if seconds >= 60:
        raise ParseError(f"{raw!r}: seconds must be under 60")

    limit = 90 if hemi in ("N", "S") else 180
    value = deg + minutes / 60 + seconds / 3600
    if value > limit:
        raise ParseError(f"{raw!r}: {value} is out of range for a {'latitude' if limit == 90 else 'longitude'}")

    return -value if hemi in ("S", "W") else value


def decimal_to_dms(value: float, axis: Literal["lat", "lon"]) -> str:
    """Render decimal degrees back as a DMS string, the way a GPS unit asks for it."""
    limit = 90 if axis == "lat" else 180
    if not -limit <= value <= limit:
        raise ValueError(f"{value} is out of range for {axis}")

    hemi = ("S" if axis == "lat" else "W") if value < 0 else ("N" if axis == "lat" else "E")
    total_seconds = round(abs(value) * 3600)
    degrees, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{degrees} {minutes} {seconds} {hemi}"


def compass_point(bearing_deg: float, points: int = 16) -> str:
    """Name a bearing, e.g. 329.6 -> 'NNW'."""
    if points not in (8, 16):
        raise ValueError("points must be 8 or 16")
    names = _COMPASS_16 if points == 16 else _COMPASS_8
    step = 360.0 / points
    index = int((bearing_deg % 360) / step + 0.5) % points
    return names[index]


def inverse(lat1: float, lon1: float, lat2: float, lon2: float) -> Vector:
    """Exact WGS84 distance and initial true bearing from point 1 to point 2."""
    result = Geodesic.WGS84.Inverse(lat1, lon1, lat2, lon2)
    distance_km = float(result["s12"]) / 1000.0
    bearing = float(result["azi1"]) % 360.0
    return Vector(
        distance_km=distance_km,
        distance_nmi=distance_km / KM_PER_NAUTICAL_MILE,
        bearing_deg=bearing,
        compass=compass_point(bearing),
    )
