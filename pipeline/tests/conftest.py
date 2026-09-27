"""Shared test fixtures.

The HTML under tests/fixtures/html/ was captured live from INCOIS on 2026-09-27.
It is irreplaceable: it happens to contain a populated Karnataka sector, three
genuinely cloud-covered sectors, and the sessionless empty shell, all from the
same day. Session tokens have been redacted. Do not regenerate these casually --
a populated sector is only available on days when the satellite got a clear look.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
HTML_DIR = FIXTURE_DIR / "html"
GOLDEN_DIR = FIXTURE_DIR / "golden"

IST = ZoneInfo("Asia/Kolkata")

# The moment the captured advisory was issued, used to freeze clocks in tests.
CAPTURE_UPDATED_AT = datetime(2026, 9, 27, 15, 26, 56, tzinfo=IST)

HAS_ADVISORY_FIXTURE = "sec004-karnataka-has-advisory.html"
NO_ADVISORY_FIXTURES = (
    ("sec005-kerala-no-advisory.html", "SEC005", "KERALA"),
    ("sec006-south-tamilnadu-no-advisory.html", "SEC006", "SOUTH TAMILNADU"),
    ("sec014-lakshadweep-no-advisory.html", "SEC014", "LAKSHADWEEP"),
)


def read_fixture(name: str) -> str:
    return (HTML_DIR / name).read_text(encoding="utf-8", errors="replace")


@pytest.fixture
def karnataka_html() -> str:
    return read_fixture(HAS_ADVISORY_FIXTURE)


@pytest.fixture
def kerala_html() -> str:
    return read_fixture("sec005-kerala-no-advisory.html")


@pytest.fixture
def cookieless_html() -> str:
    """The HTTP 200 empty shell INCOIS serves when the session cookie is absent."""
    return read_fixture("cookieless-empty-shell.html")


@pytest.fixture
def home_html() -> str:
    """The site's own landing page, which shares a <title> with a populated sector."""
    return read_fixture("textdatahome.html")


def synthetic_body(inner: str) -> str:
    """Wrap markup in the JSP body markers, to build pages INCOIS has not served us."""
    return (
        "<html><head><title>Marine Fisheries Advisory Text Data</title></head><body>"
        "<!-- START OF BODY PART OF THIS PAGE -->"
        f"{inner}"
        "<!-- END OF BODY PART OF THIS PAGE -->"
        "</body></html>"
    )


SECTOR_NAME_P = '<p style="font-size:16px;font-weight:bold;text-align:center;">KARNATAKA</p>'
