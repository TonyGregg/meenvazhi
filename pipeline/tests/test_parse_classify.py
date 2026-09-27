"""The most important tests in this project.

Every test here defends the boundary between "INCOIS says there are no fish today"
and "we failed to talk to INCOIS". Getting that boundary wrong sends someone to
sea on a forecast that does not exist, so each case below names the specific way
the real page tried to fool us.
"""

from __future__ import annotations

import pytest
from conftest import (
    HAS_ADVISORY_FIXTURE,
    NO_ADVISORY_FIXTURES,
    SECTOR_NAME_P,
    read_fixture,
    synthetic_body,
)

from meenvazhi.model import FetchFailed, SectorMismatch, SectorStatus
from meenvazhi.parse import classify, extract_body, parse_sector_page

CLOUD_SENTENCE = '<p style="font-weight:bold;">No data available for this sector due to excessive cloud cover</p>'


def test_populated_sector_is_has_advisory(karnataka_html: str) -> None:
    assert classify(karnataka_html) is SectorStatus.HAS_ADVISORY


@pytest.mark.parametrize(("filename", "sector_id", "sector_name"), NO_ADVISORY_FIXTURES)
def test_cloud_covered_sectors_are_no_advisory(filename: str, sector_id: str, sector_name: str) -> None:
    html = read_fixture(filename)
    assert classify(html) is SectorStatus.NO_ADVISORY
    page = parse_sector_page(html, expected_sector_id=sector_id, expected_sector_name=sector_name)
    assert page.status is SectorStatus.NO_ADVISORY
    assert page.reason == "excessive cloud cover"
    assert page.zone_count == 0


def test_cookieless_shell_is_fetch_failed_not_no_advisory(cookieless_html: str) -> None:
    """The regression test this whole design exists for.

    Requesting a sector without a session cookie returns HTTP 200 and a page with
    no tables, no sector name and no cloud-cover message. It looks exactly like a
    genuinely empty sector. If this is ever classified NO_ADVISORY, the pipeline
    will report "no fish today" every single day and never fail a build.
    """
    status = classify(cookieless_html)
    assert status is not SectorStatus.NO_ADVISORY, "a session failure must never be reported as an empty sector"
    assert status is SectorStatus.FETCH_FAILED


def test_home_page_is_fetch_failed_despite_matching_title(home_html: str) -> None:
    """The site home page carries the same <title> as a populated sector page.

    Pins the reason classification keys on the JSP body marker rather than the
    title: the title alone cannot tell these two apart.
    """
    assert "Marine Fisheries Advisory Text Data" in home_html
    assert classify(home_html) is SectorStatus.FETCH_FAILED


def test_cloudflare_reference_does_not_imply_cloud_cover() -> None:
    """Every INCOIS page loads Font Awesome from cdnjs.cloudflare.com.

    So a naive `"cloud" in html` check matches every page on the site, including
    the failure shell. A real page that mentions cloudflare but carries neither an
    advisory table nor the empty-sector sentence is a failure, not an empty sector.
    """
    html = synthetic_body(
        f'{SECTOR_NAME_P}<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">'
    )
    assert "cloudflare" in html
    assert classify(html) is SectorStatus.FETCH_FAILED


def test_no_advisory_does_not_depend_on_sectorname_id(kerala_html: str) -> None:
    """Element ids exist only on populated pages.

    On a legitimately cloud-covered page sectorname, satmsg, forecastdata and
    mfsadvisory are all absent, and the sector name is an unlabelled bold <p>.
    Anything keyed on those ids reads the empty state as a failure.
    """
    assert 'id="sectorname"' not in kerala_html
    assert 'id="satmsg"' not in kerala_html
    assert classify(kerala_html) is SectorStatus.NO_ADVISORY


def test_data_table_is_not_found_by_position(karnataka_html: str) -> None:
    """The populated page has more than one table, so indexing is not an option."""
    assert karnataka_html.lower().count("<table") > 1
    assert classify(karnataka_html) is SectorStatus.HAS_ADVISORY


def test_header_only_table_is_fetch_failed() -> None:
    """A table with headers but no rows is a broken render, not an empty sector."""
    html = synthetic_body(f"{SECTOR_NAME_P}<table><tr><th>From the coast of</th><th>Direction</th></tr></table>")
    assert classify(html) is SectorStatus.FETCH_FAILED


def test_recognised_page_with_unknown_shape_is_fetch_failed() -> None:
    """A real page we cannot read must fail loudly rather than report no fish.

    This is the branch that catches an INCOIS redesign.
    """
    html = synthetic_body(f"{SECTOR_NAME_P}<p>Some entirely new layout we have never seen.</p>")
    assert classify(html) is SectorStatus.FETCH_FAILED


def test_body_marker_without_sector_name_is_fetch_failed() -> None:
    html = synthetic_body(CLOUD_SENTENCE)
    assert classify(html) is SectorStatus.FETCH_FAILED


@pytest.mark.parametrize("html", ["", "   ", "<html><body>truncated", "not html at all"])
def test_unusable_input_is_fetch_failed(html: str) -> None:
    assert classify(html) is SectorStatus.FETCH_FAILED


def test_truncated_body_region_still_parses(karnataka_html: str) -> None:
    """A body region that opens but never closes is truncated, not absent.

    extract_body keeps everything from the marker onward so the parser can still
    find the advisory rather than discarding a page that merely lost its footer.
    """
    cut = karnataka_html.split("END OF BODY PART OF THIS PAGE")[0]
    assert extract_body(cut) is not None
    assert classify(cut) is SectorStatus.HAS_ADVISORY


def test_extract_body_returns_none_without_marker(cookieless_html: str) -> None:
    assert extract_body(cookieless_html) is None


def test_sector_mismatch_raises(karnataka_html: str) -> None:
    """A stale session serving another sector must not be filed under ours."""
    with pytest.raises(SectorMismatch, match="KARNATAKA"):
        parse_sector_page(karnataka_html, expected_sector_id="SEC005", expected_sector_name="KERALA")


def test_parse_raises_fetch_failed_for_shell(cookieless_html: str) -> None:
    """FETCH_FAILED is an exception path, not a return value, at the parse layer."""
    with pytest.raises(FetchFailed, match="session cookie"):
        parse_sector_page(cookieless_html, expected_sector_id="SEC004", expected_sector_name="KARNATAKA")


def test_every_fixture_classifies_without_raising() -> None:
    """classify() is total: it never raises, whatever it is handed."""
    for filename in (HAS_ADVISORY_FIXTURE, *(f for f, _, _ in NO_ADVISORY_FIXTURES)):
        assert classify(read_fixture(filename)) in set(SectorStatus)
