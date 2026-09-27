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
from meenvazhi.parse import parse_sector_page
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


@pytest.fixture
def document() -> dict:
    pages = [
        parse_sector_page(read_fixture(f), expected_sector_id=i, expected_sector_name=n) for f, i, n in SECTOR_SPEC
    ]
    return build_document(pages, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW)


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
    again = build_document(pages, home=get_port("kochi"), reachable_nmi=120, now=FROZEN_NOW)
    assert json.dumps(again, sort_keys=True) == json.dumps(document, sort_keys=True)
