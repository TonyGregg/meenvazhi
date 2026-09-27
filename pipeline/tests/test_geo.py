"""Coordinate conversion and geodesic maths.

The golden distances and bearings below were produced by geographiclib's exact
WGS84 solution. They are deliberately not spherical-approximation figures: a mean
radius calculation puts Karwar at 630.6 km on a bearing of 329.7, about 2 km and
0.16 degrees off, which is the kind of quiet disagreement that makes a
cross-implementation test useless.
"""

from __future__ import annotations

import pytest

from meenvazhi.geo import (
    KM_PER_NAUTICAL_MILE,
    compass_point,
    decimal_to_dms,
    dms_to_decimal,
    inverse,
)
from meenvazhi.model import ParseError
from meenvazhi.ports import get_port

KOCHI = get_port("kochi")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("14 49 10 N", 14.819444),
        ("73 18 26 E", 73.307222),
        ("14 40 0 N", 14.666667),  # single-digit seconds, as the source emits
        ("13 2 26 N", 13.040556),  # single-digit minutes
        ("0 0 0 N", 0.0),
        ("12 52 25 S", -12.873611),  # southern hemisphere is negative
        ("73 46 34 W", -73.776111),  # western hemisphere is negative
        ("  14   49   10   N  ", 14.819444),  # arbitrary whitespace
        ("14 49 10.5 N", 14.819583),  # fractional seconds
    ],
)
def test_dms_to_decimal(raw: str, expected: float) -> None:
    assert dms_to_decimal(raw) == pytest.approx(expected, abs=1e-6)


@pytest.mark.parametrize(
    "raw",
    [
        "14 60 10 N",  # 60 minutes
        "14 49 60 N",  # 60 seconds
        "91 0 0 N",  # latitude beyond the pole
        "181 0 0 E",  # longitude beyond the antimeridian
        "14 49 10",  # no hemisphere
        "14 49 10 X",  # bad hemisphere
        "14 49 N",  # missing a component
        "",
        "not a coordinate",
    ],
)
def test_dms_rejects_bad_input(raw: str) -> None:
    """Out-of-range values are rejected, never silently wrapped.

    A wrapped latitude puts a waypoint in a different ocean without complaining.
    """
    with pytest.raises(ParseError):
        dms_to_decimal(raw)


@pytest.mark.parametrize(
    "raw",
    ["14 49 10 N", "73 18 26 E", "14 40 0 N", "13 2 26 N", "12 52 25 S", "73 46 34 W"],
)
def test_dms_round_trips(raw: str) -> None:
    axis = "lat" if raw[-1] in "NS" else "lon"
    assert decimal_to_dms(dms_to_decimal(raw), axis) == raw


def test_decimal_to_dms_rejects_out_of_range() -> None:
    with pytest.raises(ValueError, match="out of range"):
        decimal_to_dms(91.0, "lat")


@pytest.mark.parametrize(
    ("lat_dms", "lon_dms", "km", "nmi", "bearing"),
    [
        ("14 49 10 N", "73 18 26 E", 628.366, 339.291, 329.5633),  # Karwar, farthest
        ("12 52 25 N", "73 46 34 E", 423.140, 228.477, 320.3820),  # Hosabettu, nearest
    ],
)
def test_geodesic_goldens(lat_dms: str, lon_dms: str, km: float, nmi: float, bearing: float) -> None:
    vector = inverse(KOCHI.lat, KOCHI.lon, dms_to_decimal(lat_dms), dms_to_decimal(lon_dms))
    assert vector.distance_km == pytest.approx(km, abs=0.01)
    assert vector.distance_nmi == pytest.approx(nmi, abs=0.01)
    assert vector.bearing_deg == pytest.approx(bearing, abs=0.001)


def test_same_point_is_zero_distance() -> None:
    vector = inverse(KOCHI.lat, KOCHI.lon, KOCHI.lat, KOCHI.lon)
    assert vector.distance_km == pytest.approx(0.0, abs=1e-9)


def test_nautical_mile_conversion_is_exact() -> None:
    """A nautical mile is exactly 1852 m by definition, not an approximation."""
    assert KM_PER_NAUTICAL_MILE == 1.852
    vector = inverse(KOCHI.lat, KOCHI.lon, 14.819444, 73.307222)
    assert vector.distance_nmi == pytest.approx(vector.distance_km / 1.852, abs=1e-9)


def test_bearing_is_normalised_to_positive_range() -> None:
    """A bearing due west must read 270, never -90."""
    vector = inverse(0.0, 10.0, 0.0, 0.0)
    assert 0.0 <= vector.bearing_deg < 360.0
    assert vector.bearing_deg == pytest.approx(270.0, abs=1e-6)


@pytest.mark.parametrize(
    ("bearing", "expected"),
    [
        (0.0, "N"),
        (359.9, "N"),
        (11.24, "N"),  # just inside the N sector
        (11.26, "NNE"),  # just past the 11.25 boundary
        (348.75, "N"),
        (348.74, "NNW"),
        (90.0, "E"),
        (180.0, "S"),
        (270.0, "W"),
        (329.5633, "NNW"),  # the Karwar bearing
        (360.0, "N"),  # wraps
        (720.0, "N"),  # wraps twice
    ],
)
def test_compass_point_16(bearing: float, expected: str) -> None:
    assert compass_point(bearing) == expected


@pytest.mark.parametrize(("bearing", "expected"), [(0.0, "N"), (45.0, "NE"), (330.0, "NW"), (22.4, "N")])
def test_compass_point_8(bearing: float, expected: str) -> None:
    assert compass_point(bearing, points=8) == expected


def test_compass_point_rejects_other_resolutions() -> None:
    with pytest.raises(ValueError, match="8 or 16"):
        compass_point(0.0, points=32)
