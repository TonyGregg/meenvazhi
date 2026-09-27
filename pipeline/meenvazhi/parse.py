"""Parse an INCOIS sector page.

Pure functions over strings. No network, no clock, no filesystem, so every branch
below is reachable from a saved fixture.

Read docs/INCOIS.md before changing anything here. The page is hand-written JSP
with malformed markup, and four separate details look like reasonable things to
key on while being actively wrong:

1. A request without a session cookie returns HTTP 200 and an empty page shell.
   It has no tables, no sector name and no cloud-cover message, so it is
   indistinguishable from a genuine "no advisory" unless the body marker is
   checked. This is why extract_body() runs first and why FETCH_FAILED exists.

2. The <title> distinguishes the three states, but the site's own home page
   carries the SAME title as a populated sector page. Title can corroborate; it
   can never decide. There are also three <title> tags per document and nested
   duplicate <html>/<head> elements.

3. Testing for the substring "cloud" matches every page on the site, including
   the failure shell, because they all load Font Awesome from cdnjs.cloudflare.com.
   Match the whole phrase, and only inside the body region.

4. Element ids (sectorname, satmsg, forecastdata, mfsadvisory) exist only on a
   populated page. On a legitimately cloud-covered page all four are absent and
   the sector name is an unlabelled centred bold <p>. Anything keyed on those ids
   silently yields nothing for the empty state.

And the data table is located by its header text, never by index: the populated
page has five tables, one of them nested.
"""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, Tag
from dateutil import parser as dateparser

from .model import (
    VALID_DIRECTIONS,
    FetchFailed,
    ParseError,
    Range,
    RawRow,
    SectorMismatch,
    SectorPage,
    SectorStatus,
)

IST = ZoneInfo("Asia/Kolkata")

# The JSP wraps its real content in these comments. Present exactly once on every
# genuine sector page (populated or cloud-covered), absent from the sessionless
# shell and from the site home page. This is the session-failure discriminator.
BODY_START = "START OF BODY PART OF THIS PAGE"
BODY_END = "END OF BODY PART OF THIS PAGE"

COAST_HEADER = "from the coast of"

NO_DATA_RE = re.compile(r"no\s+data\s+available\s+for\s+this\s+sector\s+due\s+to\s+excessive\s+cloud\s+cover", re.I)

# "SATELLITE DATA SHOWS LIKELY AVAILABILITY OF FISH STOCK TILL  28 SEP 2026"
# Note the double space after TILL in the real output, hence \s+ throughout.
VALID_UNTIL_RE = re.compile(r"TILL\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})", re.I)

# "Sun Sep 27 15:26:56 IST 2026" in a hidden <p id="updatedDate">.
UPDATED_AT_RE = re.compile(r"([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}:\d{2})\s+IST\s+(\d{4})")

EXPECTED_COLUMNS = 7


def _norm(text: str) -> str:
    """Collapse whitespace, including the non-breaking spaces the page is full of."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def extract_body(html: str) -> str | None:
    """Return the JSP body region, or None if this is not a real sector page.

    None means the request failed in a way the server reported as success, which
    in practice means the session cookie was missing or expired.
    """
    start = html.find(BODY_START)
    if start < 0:
        return None
    end = html.find(BODY_END, start)
    # A page that opens the region but never closes it is truncated, not empty.
    return html[start:] if end < 0 else html[start:end]


def find_data_table(soup: Tag) -> Tag | None:
    """Locate the advisory table by its header text.

    Never by position. The populated page has five tables and that count has
    already changed once during investigation.
    """
    for table in soup.find_all("table"):
        if not isinstance(table, Tag):
            continue
        header = _norm(table.get_text(" ")).lower()
        if COAST_HEADER in header:
            return table
    return None


def extract_sector_name(body_soup: Tag) -> str | None:
    """Pull the sector name from the body region.

    Prefers the id used on populated pages, then falls back to the first centred
    bold paragraph, which is all the cloud-covered pages give us.
    """
    tagged = body_soup.find(id="sectorname")
    if isinstance(tagged, Tag):
        name = _norm(tagged.get_text(" "))
        if name:
            return name.upper()

    for p in body_soup.find_all("p"):
        if not isinstance(p, Tag):
            continue
        style = str(p.get("style") or "")
        if "bold" not in style:
            continue
        text = _norm(p.get_text(" "))
        # The cloud-cover sentence is also a bold centred <p>; skip it.
        if text and not NO_DATA_RE.search(text):
            return text.upper()
    return None


def parse_valid_until(body_text: str) -> datetime | None:
    """Parse the 'FISH STOCK TILL <date>' validity line. Absent on empty sectors."""
    m = VALID_UNTIL_RE.search(body_text)
    if not m:
        return None
    try:
        parsed: datetime | None = dateparser.parse(m.group(1), dayfirst=True)
    except (ValueError, OverflowError):
        return None
    return parsed


def parse_updated_at(html: str) -> datetime | None:
    """Parse the hidden issue timestamp, e.g. 'Sun Sep 27 15:26:56 IST 2026'.

    dateutil cannot resolve the bare token IST, which is ambiguous with Irish
    Standard Time, so the literal is dropped and Asia/Kolkata attached explicitly.
    This IST date, not the UTC run time, is the advisory's logical date.
    """
    m = UPDATED_AT_RE.search(html)
    if not m:
        return None
    _dow, mon, day, clock, year = m.groups()
    try:
        naive = dateparser.parse(f"{day} {mon} {year} {clock}")
    except (ValueError, OverflowError):
        return None
    return None if naive is None else naive.replace(tzinfo=IST)


def parse_rows(table: Tag) -> tuple[RawRow, ...]:
    """Parse the advisory table's data rows, skipping the header."""
    rows: list[RawRow] = []
    for tr in table.find_all("tr"):
        if not isinstance(tr, Tag):
            continue
        cells = [_norm(td.get_text(" ")) for td in tr.find_all("td")]
        if not cells:
            continue  # header row uses <th>
        if len(cells) < EXPECTED_COLUMNS:
            raise ParseError(f"expected {EXPECTED_COLUMNS} columns, got {len(cells)}: {cells!r}")
        centre, direction, bearing, distance, depth, lat, lon = cells[:EXPECTED_COLUMNS]

        direction = direction.upper()
        if direction not in VALID_DIRECTIONS:
            raise ParseError(f"unrecognised direction {direction!r} for {centre!r}")
        if not bearing.isdigit() or not 0 <= int(bearing) <= 360:
            raise ParseError(f"unrecognised bearing {bearing!r} for {centre!r}")
        if not centre:
            raise ParseError("row has an empty landing centre")

        rows.append(
            RawRow(
                landing_centre=centre,  # verbatim: hyphens intact, never title-cased
                direction=direction,
                bearing_deg=int(bearing),
                distance_km=Range.parse(distance),
                depth_m=Range.parse(depth),
                lat_dms=lat,
                lon_dms=lon,
            )
        )
    return tuple(rows)


def classify(html: str) -> SectorStatus:
    """Classify a fetched page without parsing its contents.

    Exposed separately from parse_sector_page so the decision ladder can be
    tested directly against fixtures.
    """
    body = extract_body(html)
    if body is None:
        return SectorStatus.FETCH_FAILED

    body_soup = BeautifulSoup(body, "lxml")
    if extract_sector_name(body_soup) is None:
        return SectorStatus.FETCH_FAILED

    table = find_data_table(body_soup)
    if table is not None:
        # A header with no data rows is a broken render, not an empty sector.
        has_data = any(isinstance(tr, Tag) and tr.find_all("td") for tr in table.find_all("tr"))
        return SectorStatus.HAS_ADVISORY if has_data else SectorStatus.FETCH_FAILED

    if NO_DATA_RE.search(_norm(body_soup.get_text(" "))):
        return SectorStatus.NO_ADVISORY

    # A real page in a shape we do not recognise. Fail loudly: reporting "no fish"
    # because INCOIS redesigned their page is the worst possible outcome.
    return SectorStatus.FETCH_FAILED


def parse_sector_page(html: str, *, expected_sector_id: str, expected_sector_name: str) -> SectorPage:
    """Parse one sector page into a SectorPage.

    Raises FetchFailed when the page is not usable, and SectorMismatch when it
    names a sector other than the one requested. FETCH_FAILED is an exception
    path here, not a return value; only the fetch orchestrator turns it into a
    recorded result.
    """
    body = extract_body(html)
    if body is None:
        raise FetchFailed(
            "no JSP body marker; the session cookie was probably missing or expired "
            "(INCOIS returns HTTP 200 with an empty shell in that case)"
        )

    body_soup = BeautifulSoup(body, "lxml")
    sector_name = extract_sector_name(body_soup)
    if sector_name is None:
        raise FetchFailed("body region present but no sector name found")

    expected_name = expected_sector_name.upper()
    if sector_name != expected_name:
        raise SectorMismatch(
            f"requested {expected_sector_id} ({expected_name}) but the page names {sector_name!r}; "
            "the session may be stale"
        )

    body_text = _norm(body_soup.get_text(" "))
    table = find_data_table(body_soup)

    if table is not None:
        rows = parse_rows(table)
        if not rows:
            raise FetchFailed("advisory table present but contains no data rows")
        valid_until = parse_valid_until(body_text)
        return SectorPage(
            sector_id=expected_sector_id,
            sector_name=sector_name,
            status=SectorStatus.HAS_ADVISORY,
            rows=rows,
            valid_until=None if valid_until is None else valid_until.date(),
            incois_updated_at=parse_updated_at(html),
        )

    if NO_DATA_RE.search(body_text):
        return SectorPage(
            sector_id=expected_sector_id,
            sector_name=sector_name,
            status=SectorStatus.NO_ADVISORY,
            reason="excessive cloud cover",
            incois_updated_at=parse_updated_at(html),
        )

    raise FetchFailed("unrecognised page shape: no advisory table and no known empty-sector message")
