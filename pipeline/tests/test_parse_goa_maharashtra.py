"""Goa and Maharashtra, captured live on 2026-11-22 when both sectors were populated.

Maharashtra is the largest sector on the coast, with nearly two hundred rows, so it
also guards against anything that only holds up for a short table.
"""

from __future__ import annotations

import pytest
from conftest import read_fixture

from meenvazhi.model import Range, SectorStatus
from meenvazhi.parse import parse_sector_page


@pytest.fixture(scope="module")
def goa():
    html = read_fixture("sec003-goa-has-advisory.html")
    return parse_sector_page(html, expected_sector_id="SEC003", expected_sector_name="GOA")


@pytest.fixture(scope="module")
def maharashtra():
    html = read_fixture("sec002-maharashtra-has-advisory.html")
    return parse_sector_page(html, expected_sector_id="SEC002", expected_sector_name="MAHARASHTRA")


def test_goa_rows(goa) -> None:
    assert goa.status is SectorStatus.HAS_ADVISORY
    assert goa.zone_count == 10
    assert goa.rows[0].landing_centre == "Chapora"
    assert goa.rows[0].lat_dms == "15 37 34 N"
    assert goa.rows[-1].landing_centre == "Kolamb"
    assert goa.rows[-1].lon_dms == "73 56 49 E"


def test_maharashtra_rows(maharashtra) -> None:
    assert maharashtra.status is SectorStatus.HAS_ADVISORY
    assert maharashtra.zone_count == 196
    first, last = maharashtra.rows[0], maharashtra.rows[-1]
    assert (first.landing_centre, first.bearing_deg, first.distance_km) == ("Zai", 258, Range(12, 17))
    assert (first.lat_dms, first.lon_dms) == ("20 6 1 N", "72 36 48 E")
    assert (last.landing_centre, last.bearing_deg, last.distance_km) == ("Terekhol", 273, Range(58, 63))
    assert (last.lat_dms, last.lon_dms) == ("15 45 18 N", "73 7 10 E")


def test_maharashtra_keeps_punctuated_landing_centres_verbatim(maharashtra) -> None:
    names = {row.landing_centre for row in maharashtra.rows}
    assert {"Narpad/DahanuAgar", "Satpati(M/S)", "Colaba Pt.(Mumbai)", "WashiBridge,PWDJetty"} <= names


def test_validity_and_timestamp(goa, maharashtra) -> None:
    for page in (goa, maharashtra):
        assert str(page.valid_until) == "2026-11-23"
        assert page.incois_updated_at is not None
        assert page.incois_updated_at.isoformat() == "2026-11-22T18:27:51+05:30"
