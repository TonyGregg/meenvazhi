"""Row-level parsing against the captured Karnataka advisory.

The expected values below were read off the live page on 2026-09-27 and match the
sample rows in the project brief.
"""

from __future__ import annotations

import pytest
from conftest import CAPTURE_UPDATED_AT, SECTOR_NAME_P, synthetic_body

from meenvazhi.model import ParseError, Range, SectorStatus
from meenvazhi.parse import parse_sector_page, parse_updated_at, parse_valid_until

EXPECTED_ZONE_COUNT = 20


@pytest.fixture
def karnataka(karnataka_html: str):
    return parse_sector_page(karnataka_html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_all_rows_parsed(karnataka) -> None:
    assert karnataka.status is SectorStatus.HAS_ADVISORY
    assert karnataka.zone_count == EXPECTED_ZONE_COUNT


def test_first_row_exact(karnataka) -> None:
    row = karnataka.rows[0]
    assert row.landing_centre == "Karwar"
    assert row.direction == "W"
    assert row.bearing_deg == 270
    assert row.distance_km == Range(79, 84)
    assert row.depth_m == Range(105, 110)
    assert row.lat_dms == "14 49 10 N"
    assert row.lon_dms == "73 18 26 E"


def test_last_row_exact(karnataka) -> None:
    row = karnataka.rows[-1]
    assert row.landing_centre == "Hosabettu-Udaivar"
    assert row.direction == "SW"
    assert row.bearing_deg == 261
    assert row.distance_km == Range(108, 113)
    assert row.depth_m == Range(944, 949)
    assert row.lat_dms == "12 52 25 N"
    assert row.lon_dms == "73 46 34 E"


def test_hyphenated_landing_centre_is_preserved(karnataka) -> None:
    """Names are kept verbatim: no title-casing, no splitting on the hyphen."""
    names = [r.landing_centre for r in karnataka.rows]
    assert "Hosabettu-Udaivar" in names


def test_single_digit_dms_components_survive(karnataka) -> None:
    """Minutes and seconds are not zero-padded in the source, e.g. '14 40 0 N'."""
    singles = [r.lat_dms for r in karnataka.rows if len(r.lat_dms.split()[2]) == 1]
    assert singles, "expected at least one row with a single-digit seconds value"
    assert "14 40 0 N" in singles


def test_every_row_has_plausible_values(karnataka) -> None:
    for row in karnataka.rows:
        assert 0 <= row.bearing_deg <= 360
        assert row.distance_km.frm <= row.distance_km.to
        assert row.depth_m.frm <= row.depth_m.to
        assert row.lat_dms.endswith(("N", "S"))
        assert row.lon_dms.endswith(("E", "W"))


def test_valid_until_parsed_from_double_spaced_line(karnataka) -> None:
    """The source reads 'FISH STOCK TILL  28 SEP 2026', with two spaces."""
    assert karnataka.valid_until is not None
    assert karnataka.valid_until.isoformat() == "2026-09-28"


def test_updated_at_is_ist_aware(karnataka) -> None:
    """The issue timestamp is Asia/Kolkata, and that date is the advisory's date.

    dateutil cannot parse the bare 'IST' token, so this pins that the zone is
    attached explicitly rather than falling back to a naive or UTC datetime.
    """
    assert karnataka.incois_updated_at == CAPTURE_UPDATED_AT
    assert karnataka.incois_updated_at.utcoffset().total_seconds() == 5.5 * 3600
    assert karnataka.incois_updated_at.date().isoformat() == "2026-09-27"


def test_empty_sector_has_no_validity(kerala_html: str) -> None:
    page = parse_sector_page(kerala_html, expected_sector_id="SEC005", expected_sector_name="KERALA")
    assert page.valid_until is None
    assert page.rows == ()


@pytest.mark.parametrize("text", ["nothing here", "TILL soon", ""])
def test_valid_until_absent_returns_none(text: str) -> None:
    assert parse_valid_until(text) is None


@pytest.mark.parametrize("text", ["no timestamp", "Sun Sep 27 15:26:56 GMT 2026"])
def test_updated_at_absent_returns_none(text: str) -> None:
    """A non-IST timestamp is not silently reinterpreted as IST."""
    assert parse_updated_at(text) is None


def _row_html(cells: list[str]) -> str:
    tds = "".join(f'<td align="center">{c}</td>' for c in cells)
    return synthetic_body(f"{SECTOR_NAME_P}<table><tr><th>From the coast of</th></tr><tr>{tds}</tr></table>")


def test_unknown_direction_is_rejected() -> None:
    html = _row_html(["Karwar", "XX", "270", "79-84", "105-110", "14 49 10 N", "73 18 26 E"])
    with pytest.raises(ParseError, match="direction"):
        parse_sector_page(html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_out_of_range_bearing_is_rejected() -> None:
    html = _row_html(["Karwar", "W", "999", "79-84", "105-110", "14 49 10 N", "73 18 26 E"])
    with pytest.raises(ParseError, match="bearing"):
        parse_sector_page(html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_malformed_range_is_rejected() -> None:
    html = _row_html(["Karwar", "W", "270", "about eighty", "105-110", "14 49 10 N", "73 18 26 E"])
    with pytest.raises(ParseError, match="range"):
        parse_sector_page(html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_short_row_is_rejected() -> None:
    """A row with missing columns must fail rather than silently shift fields."""
    html = _row_html(["Karwar", "W", "270"])
    with pytest.raises(ParseError, match="columns"):
        parse_sector_page(html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_incois_bearing_is_not_a_bearing_from_home(karnataka) -> None:
    """Documents, and pins, that these bearings are measured from the local coast.

    Every Karnataka zone reads 248-270 degrees from its own landing centre, while
    from Kochi the same zones lie on 315-330. Anything that treats the published
    bearing as a course to steer from the home port is 60 degrees wrong.
    """
    bearings = [r.bearing_deg for r in karnataka.rows]
    assert min(bearings) >= 248
    assert max(bearings) <= 270
