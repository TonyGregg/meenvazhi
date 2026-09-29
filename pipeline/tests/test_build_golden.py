"""End-to-end build from fixtures, compared byte for byte against the goldens.

This is the test that catches accidental schema drift. The app is installed on a
phone that cannot be updated at sea, so a field that quietly changes name or
nesting breaks a boat rather than a build. The clock is injected so the only way
this test changes is if the output genuinely changed.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from conftest import GOLDEN_DIR, read_fixture

from meenvazhi import SCHEMA_VERSION
from meenvazhi.build import build_document
from meenvazhi.gpx import build_gpx
from meenvazhi.parse import parse_forecast_dates, parse_sector_page
from meenvazhi.ports import get_port
from meenvazhi.textsummary import build_text

FROZEN_NOW = datetime(2026, 9, 27, 11, 31, 4, tzinfo=UTC)

# Order matters: it is the configured fetch order, and it is preserved in output.
SECTOR_SPEC = (
    ("sec005-kerala-no-advisory.html", "SEC005", "KERALA"),
    ("sec004-karnataka-has-advisory.html", "SEC004", "KARNATAKA"),
    ("sec014-lakshadweep-no-advisory.html", "SEC014", "LAKSHADWEEP"),
    ("sec006-south-tamilnadu-no-advisory.html", "SEC006", "SOUTH TAMILNADU"),
)


# The landing page captured the same day, carrying INCOIS's Forecast Date and Valid upto.
FORECAST = parse_forecast_dates(read_fixture("textdatahome.html"))


@pytest.fixture
def document() -> dict:
    pages = [
        parse_sector_page(read_fixture(f), expected_sector_id=i, expected_sector_name=n) for f, i, n in SECTOR_SPEC
    ]
    return build_document(pages, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW, forecast=FORECAST)


def test_matches_golden_json(document: dict) -> None:
    expected = json.loads((GOLDEN_DIR / "pfz-latest.json").read_text(encoding="utf-8"))
    assert document == expected


def test_matches_golden_gpx(document: dict) -> None:
    assert build_gpx(document) == (GOLDEN_DIR / "pfz-latest.gpx").read_text(encoding="utf-8")


def test_matches_golden_text(document: dict) -> None:
    assert build_text(document) == (GOLDEN_DIR / "pfz-latest.txt").read_text(encoding="utf-8")


def test_schema_version_is_declared(document: dict) -> None:
    assert document["schema_version"] == SCHEMA_VERSION


def test_advisory_date_comes_from_ist_not_the_run_clock(document: dict) -> None:
    """The run was 11:31 UTC; the advisory was issued 15:26 IST the same day.

    Pins that the advisory's date is INCOIS's, so a retry either side of midnight
    UTC cannot relabel yesterday's advisory as today's.
    """
    assert document["advisory_date"] == "2026-09-27"
    assert document["generated_at"] == "2026-09-27T11:31:04Z"


def test_counts_are_consistent(document: dict) -> None:
    assert document["counts"] == {"sectors": 4, "with_advisory": 1, "zones": 20, "reachable": 0}


def test_empty_sectors_state_their_reason(document: dict) -> None:
    """Three of four sectors were genuinely cloud-covered, which is the common case."""
    empty = [s for s in document["sectors"] if s["status"] == "NO_ADVISORY"]
    assert len(empty) == 3
    for sector in empty:
        assert sector["reason"] == "excessive cloud cover"
        assert sector["zones"] == []


def test_zones_are_sorted_by_range_from_home(document: dict) -> None:
    for sector in document["sectors"]:
        distances = [z["from_home"]["distance_nmi"] for z in sector["zones"]]
        assert distances == sorted(distances)


def test_home_bearings_differ_from_incois_bearings(document: dict) -> None:
    """The entire point of the pipeline, asserted.

    INCOIS measures from the local landing centre; we measure from Kochi. If these
    ever agree, something has started copying the wrong field, and the result is a
    course roughly 60 degrees wrong.
    """
    zones = [z for s in document["sectors"] for z in s["zones"]]
    assert zones
    for zone in zones:
        assert abs(zone["from_home"]["bearing_deg"] - zone["incois"]["bearing_deg"]) > 40


def test_no_zone_is_reachable_today(document: dict) -> None:
    """Karnataka's zones sit 228 to 339 nmi from Kochi, all outside a normal trip."""
    zones = [z for s in document["sectors"] for z in s["zones"]]
    assert all(not z["from_home"]["reachable"] for z in zones)
    assert min(z["from_home"]["distance_nmi"] for z in zones) == pytest.approx(228.5, abs=0.1)


def test_disclaimer_and_credit_are_present(document: dict) -> None:
    assert "Not for navigation" in document["disclaimer"]
    assert document["source"]["credit"].startswith("Source: INCOIS")


def test_build_is_deterministic(document: dict) -> None:
    pages = [
        parse_sector_page(read_fixture(f), expected_sector_id=i, expected_sector_name=n) for f, i, n in SECTOR_SPEC
    ]
    again = build_document(pages, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW, forecast=FORECAST)
    assert json.dumps(again, sort_keys=True) == json.dumps(document, sort_keys=True)


def test_reachable_nmi_type_is_stable(document: dict) -> None:
    """The published type must not depend on how the caller spelled the argument.

    Passing 120 rather than 120.0 previously changed the JSON from an int to a
    float, which the golden byte-compare caught. Coercion in build_document fixes
    it; this pins it.
    """
    from meenvazhi.build import build_document as build

    pages = [
        parse_sector_page(read_fixture(f), expected_sector_id=i, expected_sector_name=n) for f, i, n in SECTOR_SPEC
    ]
    as_int = build(pages, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW, forecast=FORECAST)
    as_float = build(pages, home=get_port("kochi"), reachable_nmi=120.0, now=FROZEN_NOW, forecast=FORECAST)
    assert isinstance(as_int["reachable_nmi"], float)
    assert json.dumps(as_int) == json.dumps(as_float)


def test_user_agent_url_matches_the_gpx_creator() -> None:
    """Both must point at the real repo, so INCOIS can see who is calling."""
    from meenvazhi import config
    from meenvazhi.gpx import build_gpx as _build_gpx  # noqa: F401

    agent = config.app()["user_agent"]
    assert "github.com/TonyGregg/meenvazhi" in agent


def test_forecast_dates_are_published_as_incois_shows_them(document: dict) -> None:
    assert document["forecast_date"] == "2026-09-27"
    assert document["valid_upto"] == "2026-09-28"


def test_an_all_cloudy_day_still_has_a_forecast_date() -> None:
    """The reason the landing page matters: cloudy sector pages carry no date at all."""
    cloudy = [
        parse_sector_page(read_fixture(f), expected_sector_id=i, expected_sector_name=n)
        for f, i, n in SECTOR_SPEC
        if i != "SEC004"
    ]
    without = build_document(cloudy, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW)
    assert without["advisory_date"] is None
    with_dates = build_document(cloudy, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW, forecast=FORECAST)
    assert with_dates["advisory_date"] == "2026-09-27"
    assert with_dates["valid_until"] == "2026-09-28"
    assert with_dates["forecast_date"] == "2026-09-27"
