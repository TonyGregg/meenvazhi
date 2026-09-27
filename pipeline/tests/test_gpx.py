"""GPX output, checked against what consumer GPS units actually accept."""

from __future__ import annotations

import json
import re
from xml.etree import ElementTree

import pytest
from conftest import GOLDEN_DIR

from meenvazhi.gpx import GPX_NS, MAX_COMMENT_LENGTH, GpxError, build_gpx, validate_name

NS = {"gpx": GPX_NS}
EXPECTED_ZONE_COUNT = 20


@pytest.fixture
def document() -> dict:
    return json.loads((GOLDEN_DIR / "pfz-latest.json").read_text(encoding="utf-8"))


@pytest.fixture
def gpx_text(document: dict) -> str:
    return build_gpx(document)


def test_matches_golden(gpx_text: str) -> None:
    assert gpx_text == (GOLDEN_DIR / "pfz-latest.gpx").read_text(encoding="utf-8")


def test_is_well_formed_gpx_11(gpx_text: str) -> None:
    root = ElementTree.fromstring(gpx_text)
    assert root.tag == f"{{{GPX_NS}}}gpx"
    assert root.attrib["version"] == "1.1"
    assert "Meenvazhi" in root.attrib["creator"]


def test_every_zone_becomes_a_waypoint(gpx_text: str) -> None:
    root = ElementTree.fromstring(gpx_text)
    assert len(root.findall("gpx:wpt", NS)) == EXPECTED_ZONE_COUNT


def test_waypoint_names_are_unit_safe(gpx_text: str) -> None:
    """Six uppercase ASCII alphanumerics at most.

    Longer names get truncated to six characters by older Garmin, Lowrance and
    Simrad units, which then silently merge the collisions.
    """
    root = ElementTree.fromstring(gpx_text)
    names = [w.findtext("gpx:name", namespaces=NS) or "" for w in root.findall("gpx:wpt", NS)]
    assert names
    for name in names:
        assert re.match(r"^[A-Z0-9]{1,6}$", name), name


def test_names_remain_unique_after_truncation_to_six(gpx_text: str) -> None:
    """The property that actually matters: uniqueness survives the unit's truncation."""
    root = ElementTree.fromstring(gpx_text)
    names = [(w.findtext("gpx:name", namespaces=NS) or "")[:6] for w in root.findall("gpx:wpt", NS)]
    assert len(set(names)) == len(names)


def test_comments_fit_a_unit_display_line(gpx_text: str) -> None:
    root = ElementTree.fromstring(gpx_text)
    for wpt in root.findall("gpx:wpt", NS):
        comment = wpt.findtext("gpx:cmt", namespaces=NS) or ""
        assert len(comment) <= MAX_COMMENT_LENGTH, comment


def test_file_is_pure_ascii(gpx_text: str) -> None:
    """No Indic text anywhere.

    Units that are Latin-1 or CP437 internally render multi-byte text as mojibake
    or refuse the import outright. Malayalam and Tamil live in the app, not here.
    """
    gpx_text.encode("ascii")  # raises UnicodeEncodeError if not


def test_no_byte_order_mark_and_unix_endings(gpx_text: str) -> None:
    """Some units reject a file that opens with a BOM."""
    assert not gpx_text.startswith("﻿")
    encoded = gpx_text.encode("utf-8")
    assert not encoded.startswith(b"\xef\xbb\xbf")
    assert "\r" not in gpx_text
    assert gpx_text.endswith("\n")


def test_coordinates_carry_six_decimal_places(gpx_text: str) -> None:
    """Six places is about 10 cm. More is false precision, fewer loses metres."""
    root = ElementTree.fromstring(gpx_text)
    for wpt in root.findall("gpx:wpt", NS):
        for axis in ("lat", "lon"):
            assert re.match(r"^-?\d+\.\d{6}$", wpt.attrib[axis]), wpt.attrib[axis]


def test_credit_and_disclaimer_reach_the_file(gpx_text: str) -> None:
    root = ElementTree.fromstring(gpx_text)
    desc = root.findtext("gpx:metadata/gpx:desc", namespaces=NS) or ""
    assert "INCOIS" in desc
    assert "Not for navigation" in desc


def test_reachable_only_filters(document: dict) -> None:
    """Today nothing is in range, so the filtered file is legitimately empty."""
    root = ElementTree.fromstring(build_gpx(document, reachable_only=True))
    assert root.findall("gpx:wpt", NS) == []


@pytest.mark.parametrize("name", ["KA01", "A", "ZZ9999"])
def test_validate_name_accepts_safe_names(name: str) -> None:
    assert validate_name(name) == name


@pytest.mark.parametrize("name", ["KARNATAKA01", "ka01", "KA-01", "KA 01", "", "മീൻ"])
def test_validate_name_rejects_unsafe_names(name: str) -> None:
    with pytest.raises(GpxError):
        validate_name(name)


def test_duplicate_names_are_refused(document: dict) -> None:
    """A duplicate name would be merged by the unit, so refuse to emit one."""
    doc = json.loads(json.dumps(document))
    zones = doc["sectors"][1]["zones"]
    zones[1]["gpx_name"] = zones[0]["gpx_name"]
    with pytest.raises(GpxError, match="duplicate"):
        build_gpx(doc)


def test_non_ascii_landing_centre_is_stripped_not_emitted(document: dict) -> None:
    doc = json.loads(json.dumps(document))
    doc["sectors"][1]["zones"][0]["landing_centre"] = "Kārwār മീൻ"
    build_gpx(doc).encode("ascii")
