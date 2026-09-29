"""Fetch orchestration against the INCOIS marine fisheries pages.

The access pattern was established by reading the live page, not guessed. See
docs/INCOIS.md for the full investigation. In short:

    GET TextDataHome?mfid=1&request_locale=en   -> sets JSESSIONID
    GET TextData?secid=SEC004                   -> the sector page, with that cookie

The sector dropdown is a plain window.location navigation, not an AJAX call, and
the ;jsessionid=... path parameter in its option values is unnecessary when a
normal cookie jar is used.

Requests are strictly sequential over one session. There is no threading and no
asyncio here, deliberately: this runs once a day, parallelism buys nothing, and
hammering a government weather service concurrently would be rude.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from . import config
from .http import FetchError, PoliteClient
from .model import FetchFailed, ForecastDates, ParseError, SectorPage, SectorStatus
from .parse import parse_forecast_dates, parse_sector_page
from .sectors import get_sector

log = logging.getLogger("meenvazhi.incois")

SESSION_COOKIE = "JSESSIONID"


@dataclass(frozen=True, slots=True)
class SectorResult:
    """The outcome of one sector request, including failures.

    A failure is recorded rather than raised here so the caller can report every
    sector's outcome in one place, then decide whether the run as a whole is
    publishable.
    """

    sector_id: str
    sector_name: str
    page: SectorPage | None
    error: str | None = None

    @property
    def status(self) -> SectorStatus:
        return self.page.status if self.page else SectorStatus.FETCH_FAILED

    @property
    def ok(self) -> bool:
        return self.page is not None


HOME_HTML = "TextDataHome.html"


@dataclass(frozen=True, slots=True)
class FetchedAdvisory:
    """Everything one run gathers: each sector's outcome, and the landing page's dates."""

    results: list[SectorResult]
    forecast: ForecastDates


def _base_url() -> str:
    return str(config.incois().get("base_url", "https://incois.gov.in/MarineFisheries/"))


def home_url() -> str:
    path = str(config.incois().get("home_path", "TextDataHome?mfid=1&request_locale=en"))
    return _base_url() + path


def sector_url(sector_id: str) -> str:
    template = str(config.incois().get("sector_path", "TextData?secid={secid}"))
    return _base_url() + template.format(secid=sector_id)


def open_session(client: PoliteClient) -> str:
    """Fetch the landing page to obtain a session cookie, and return the page.

    The page is returned because it also carries INCOIS's Forecast Date and Valid
    upto, so reading them costs no extra request.

    Asserts the cookie actually arrived. Without that check a misconfigured run
    would cheerfully fetch every sector, receive an empty shell each time, and
    report a day with no fish anywhere.
    """
    url = home_url()
    log.info("opening session: %s", url)
    html = client.get_text(url)
    if not client.cookie(SESSION_COOKIE):
        raise FetchError(
            f"{url} did not set a {SESSION_COOKIE} cookie; without a session INCOIS returns "
            "an empty page shell for every sector"
        )
    return html


def _save_html(save_dir: Path, sector_id: str, html: str) -> None:
    save_dir.mkdir(parents=True, exist_ok=True)
    (save_dir / f"{sector_id}.html").write_text(html, encoding="utf-8")


def fetch_sector(
    client: PoliteClient,
    sector_id: str,
    *,
    save_dir: Path | None = None,
) -> SectorResult:
    """Fetch and parse one sector, retrying once with a fresh session on failure.

    Two independent retry layers are in play and they address different problems.
    PoliteClient retries transport errors and 5xx responses. This retries a page
    that arrived intact but was not a usable sector page, which in practice means
    the session expired mid-run.
    """
    sector = get_sector(sector_id)
    url = sector_url(sector.sector_id)

    for attempt in (1, 2):
        html = client.get_text(url, extra_headers={"Referer": home_url()})
        if save_dir is not None:
            _save_html(save_dir, sector.sector_id, html)
        try:
            page = parse_sector_page(
                html,
                expected_sector_id=sector.sector_id,
                expected_sector_name=sector.name,
            )
        except FetchFailed as exc:
            if attempt == 1:
                log.warning("%s: %s; re-establishing the session and retrying once", sector.sector_id, exc)
                open_session(client)
                continue
            log.error("%s: %s", sector.sector_id, exc)
            return SectorResult(sector.sector_id, sector.name, None, str(exc))
        except ParseError as exc:
            log.error("%s: unparseable page: %s", sector.sector_id, exc)
            return SectorResult(sector.sector_id, sector.name, None, str(exc))
        else:
            log.info("%s (%s): %s, %d zone(s)", sector.sector_id, sector.name, page.status, page.zone_count)
            return SectorResult(sector.sector_id, sector.name, page)

    raise AssertionError("unreachable")


def fetch_all(
    client: PoliteClient,
    sector_ids: list[str],
    *,
    save_dir: Path | None = None,
) -> FetchedAdvisory:
    """Fetch every configured sector sequentially over one session."""
    if save_dir is not None:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        save_dir = save_dir / stamp

    home_html = open_session(client)
    if save_dir is not None:
        save_dir.mkdir(parents=True, exist_ok=True)
        (save_dir / HOME_HTML).write_text(home_html, encoding="utf-8")
    forecast = parse_forecast_dates(home_html)
    log.info("INCOIS forecast date %s, valid upto %s", forecast.forecast_date, forecast.valid_upto)

    results: list[SectorResult] = []
    for sector_id in sector_ids:
        try:
            results.append(fetch_sector(client, sector_id, save_dir=save_dir))
        except FetchError as exc:
            sector = get_sector(sector_id)
            log.error("%s: %s", sector_id, exc)
            results.append(SectorResult(sector.sector_id, sector.name, None, str(exc)))
    return FetchedAdvisory(results=results, forecast=forecast)


def load_from_fixtures(fixture_dir: Path, sector_ids: list[str]) -> FetchedAdvisory:
    """Parse saved HTML instead of fetching, for offline development and CI.

    Files are matched by sector id, case-insensitively, anywhere in the filename,
    so both the captured fixture names and --save-html output work unchanged.
    """
    results: list[SectorResult] = []
    candidates = sorted(fixture_dir.glob("*.html"))
    for sector_id in sector_ids:
        sector = get_sector(sector_id)
        matches = [p for p in candidates if sector.sector_id.lower() in p.name.lower()]
        if not matches:
            results.append(SectorResult(sector.sector_id, sector.name, None, f"no fixture for {sector.sector_id}"))
            continue
        html = matches[0].read_text(encoding="utf-8", errors="replace")
        try:
            page = parse_sector_page(
                html,
                expected_sector_id=sector.sector_id,
                expected_sector_name=sector.name,
            )
        except ParseError as exc:
            results.append(SectorResult(sector.sector_id, sector.name, None, str(exc)))
        else:
            results.append(SectorResult(sector.sector_id, sector.name, page))

    # The landing page, if saved alongside: "textdatahome.html" in the test fixtures,
    # "TextDataHome.html" in --save-html output.
    homes = [p for p in candidates if "textdatahome" in p.name.lower()]
    forecast = (
        parse_forecast_dates(homes[0].read_text(encoding="utf-8", errors="replace"))
        if homes
        else ForecastDates(forecast_date=None, valid_upto=None)
    )
    return FetchedAdvisory(results=results, forecast=forecast)
