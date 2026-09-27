"""The plain-text digest: what gets sent over WhatsApp or read out on VHF."""

from __future__ import annotations

import json

import pytest
from conftest import GOLDEN_DIR

from meenvazhi.textsummary import build_text


@pytest.fixture
def document() -> dict:
    return json.loads((GOLDEN_DIR / "pfz-latest.json").read_text(encoding="utf-8"))


def test_matches_golden(document: dict) -> None:
    assert build_text(document) == (GOLDEN_DIR / "pfz-latest.txt").read_text(encoding="utf-8")


def test_reports_the_advisory_date_and_home_port(document: dict) -> None:
    text = build_text(document)
    assert "2026-09-27" in text
    assert "Kochi" in text


def test_names_the_reason_a_sector_is_empty(document: dict) -> None:
    assert "KERALA: no advisory (excessive cloud cover)" in build_text(document)


def test_says_when_zones_exist_but_none_are_in_range(document: dict) -> None:
    """Today's real case: 20 Karnataka zones, all beyond a week-long trip's reach."""
    assert "KARNATAKA: 20 zones, none within 120 nmi" in build_text(document)


def test_lists_zones_when_not_filtering_by_range(document: dict) -> None:
    text = build_text(document, reachable_only=False)
    assert "KARNATAKA: 20 zone(s)" in text
    # Nearest first, with the course to steer and the DMS a GPS unit asks for.
    assert "KA20 228nmi 320T depth 944-949m (12 52 25 N 73 46 34 E)" in text


def test_every_zone_appears_when_not_filtering(document: dict) -> None:
    text = build_text(document, reachable_only=False)
    for zone in document["sectors"][1]["zones"]:
        assert zone["gpx_name"] in text


def test_carries_the_disclaimer_and_credit(document: dict) -> None:
    text = build_text(document)
    assert "Not for navigation" in text
    assert "Source: INCOIS" in text


def test_is_short_enough_to_send_as_a_message(document: dict) -> None:
    assert len(build_text(document).splitlines()) < 20


def test_handles_a_document_with_no_advisory_date(document: dict) -> None:
    document["advisory_date"] = None
    assert "unknown date" in build_text(document)
