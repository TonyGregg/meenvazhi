"""Fetch orchestration: sessions, retries, and how failures are recorded."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from conftest import HTML_DIR, read_fixture
from test_http_session import make_client

from meenvazhi.http import FetchError
from meenvazhi.incois import (
    SESSION_COOKIE,
    fetch_all,
    fetch_sector,
    home_url,
    load_from_fixtures,
    open_session,
    sector_url,
)
from meenvazhi.model import SectorStatus

KARNATAKA = read_fixture("sec004-karnataka-has-advisory.html")
KERALA = read_fixture("sec005-kerala-no-advisory.html")
SHELL = read_fixture("cookieless-empty-shell.html")

SESSION_HEADER = {"Set-Cookie": "JSESSIONID=ABC123; Path=/MarineFisheries"}


@pytest.fixture(autouse=True)
def no_sleeping(monkeypatch):
    monkeypatch.setattr("meenvazhi.http.time.sleep", lambda _: None)


def test_urls_are_built_from_config() -> None:
    assert home_url().endswith("TextDataHome?mfid=1&request_locale=en")
    assert sector_url("SEC004").endswith("TextData?secid=SEC004")
    # The ;jsessionid= path parameter the page's own dropdown uses is unnecessary.
    assert "jsessionid" not in sector_url("SEC004")


def test_open_session_requires_a_cookie() -> None:
    """Without this check a misconfigured run fetches empty shells and reports no fish."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="home page with no Set-Cookie")

    with make_client(handler) as client, pytest.raises(FetchError, match=SESSION_COOKIE):
        open_session(client)


def test_open_session_accepts_a_cookie() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="home", headers=SESSION_HEADER)

    with make_client(handler) as client:
        open_session(client)
        assert client.cookie(SESSION_COOKIE) == "ABC123"


def test_fetch_sector_parses_a_populated_page() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=KARNATAKA)

    with make_client(handler) as client:
        result = fetch_sector(client, "SEC004")

    assert result.ok
    assert result.status is SectorStatus.HAS_ADVISORY
    assert result.page is not None
    assert result.page.zone_count == 20


def test_fetch_sector_records_an_empty_sector_as_data() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=KERALA)

    with make_client(handler) as client:
        result = fetch_sector(client, "SEC005")

    assert result.ok
    assert result.status is SectorStatus.NO_ADVISORY
    assert result.error is None


def test_expired_session_is_re_established_once_then_succeeds() -> None:
    """The first sector response is a shell, so the client reopens the session and retries."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        calls.append(url)
        if "TextDataHome" in url:
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        sector_calls = [c for c in calls if "TextData?secid" in c]
        if len(sector_calls) == 1:
            return httpx.Response(200, text=SHELL)
        return httpx.Response(200, text=KARNATAKA)

    with make_client(handler) as client:
        result = fetch_sector(client, "SEC004")

    assert result.ok
    assert any("TextDataHome" in c for c in calls), "expected the session to be reopened"


def test_persistent_shell_is_recorded_as_a_failure_not_an_empty_sector() -> None:
    """The regression that matters, at the orchestration layer.

    A sessionless shell must never be recorded as NO_ADVISORY, however many times
    it is retried.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        return httpx.Response(200, text=SHELL)

    with make_client(handler) as client:
        result = fetch_sector(client, "SEC004")

    assert not result.ok
    assert result.status is SectorStatus.FETCH_FAILED
    assert result.status is not SectorStatus.NO_ADVISORY
    assert "session cookie" in (result.error or "")


def test_wrong_sector_is_recorded_as_a_failure() -> None:
    """A stale session serving Karnataka when Kerala was asked for is not usable data."""

    def handler(request: httpx.Request) -> httpx.Response:
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        return httpx.Response(200, text=KARNATAKA)

    with make_client(handler) as client:
        result = fetch_sector(client, "SEC005")

    assert not result.ok
    assert "KARNATAKA" in (result.error or "")


def test_fetch_sector_saves_html_when_asked(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=KARNATAKA)

    with make_client(handler) as client:
        fetch_sector(client, "SEC004", save_dir=tmp_path)

    assert (tmp_path / "SEC004.html").read_text(encoding="utf-8") == KARNATAKA


def test_fetch_all_visits_sectors_in_order() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "TextDataHome" in url:
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        secid = url.rsplit("=", 1)[1]
        requested.append(secid)
        return httpx.Response(200, text=KERALA if secid == "SEC005" else KARNATAKA)

    with make_client(handler) as client:
        results = fetch_all(client, ["SEC005", "SEC004"]).results

    assert requested == ["SEC005", "SEC004"]
    assert [r.sector_id for r in results] == ["SEC005", "SEC004"]


def test_fetch_all_records_a_transport_failure_without_aborting() -> None:
    """One unreachable sector is recorded; the rest of the run still reports."""

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "TextDataHome" in url:
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        if "SEC004" in url:
            raise httpx.ConnectError("network unreachable")
        return httpx.Response(200, text=KERALA)

    with make_client(handler) as client:
        results = fetch_all(client, ["SEC005", "SEC004"]).results

    assert results[0].ok
    assert not results[1].ok
    assert "ConnectError" in (results[1].error or "")


def test_fetch_all_nests_saved_html_under_a_timestamp(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text="home", headers=SESSION_HEADER)
        return httpx.Response(200, text=KERALA)

    with make_client(handler) as client:
        fetch_all(client, ["SEC005"], save_dir=tmp_path)

    runs = list(tmp_path.iterdir())
    assert len(runs) == 1
    assert (runs[0] / "SEC005.html").exists()


def test_load_from_fixtures_matches_by_sector_id() -> None:
    results = load_from_fixtures(HTML_DIR, ["SEC005", "SEC004", "SEC014"]).results
    assert [r.status for r in results] == [
        SectorStatus.NO_ADVISORY,
        SectorStatus.HAS_ADVISORY,
        SectorStatus.NO_ADVISORY,
    ]


def test_load_from_fixtures_reports_a_missing_file(tmp_path: Path) -> None:
    results = load_from_fixtures(tmp_path, ["SEC004"]).results
    assert not results[0].ok
    assert "no fixture" in (results[0].error or "")


def test_load_from_fixtures_reports_an_unparseable_file(tmp_path: Path) -> None:
    (tmp_path / "SEC004.html").write_text(SHELL, encoding="utf-8")
    results = load_from_fixtures(tmp_path, ["SEC004"]).results
    assert not results[0].ok
    assert results[0].status is SectorStatus.FETCH_FAILED


def test_fetch_all_reads_the_forecast_dates_from_the_page_it_already_loads() -> None:
    """The landing page opens the session, so its dates cost no extra request."""
    home = read_fixture("textdatahome.html")
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text=home, headers=SESSION_HEADER)
        return httpx.Response(200, text=KERALA)

    with make_client(handler) as client:
        fetched = fetch_all(client, ["SEC005"])

    assert fetched.forecast.forecast_date is not None
    assert fetched.forecast.forecast_date.isoformat() == "2026-09-27"
    assert fetched.forecast.valid_upto is not None
    assert fetched.forecast.valid_upto.isoformat() == "2026-09-28"
    assert len(requests) == 2, "one landing page and one sector, nothing extra"


def test_fetch_all_saves_the_landing_page_for_debugging(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text=read_fixture("textdatahome.html"), headers=SESSION_HEADER)
        return httpx.Response(200, text=KERALA)

    with make_client(handler) as client:
        fetch_all(client, ["SEC005"], save_dir=tmp_path)

    run = next(tmp_path.iterdir())
    assert (run / "TextDataHome.html").exists()
    # And a --save-html folder can be replayed with --from-fixtures, dates included.
    replayed = load_from_fixtures(run, ["SEC005"])
    assert replayed.forecast.forecast_date is not None


def test_load_from_fixtures_reads_the_forecast_dates() -> None:
    fetched = load_from_fixtures(HTML_DIR, ["SEC004"])
    assert fetched.forecast.forecast_date is not None
    assert fetched.forecast.forecast_date.isoformat() == "2026-09-27"


def test_load_from_fixtures_without_a_landing_page_has_no_dates(tmp_path: Path) -> None:
    (tmp_path / "SEC004.html").write_text(KARNATAKA, encoding="utf-8")
    fetched = load_from_fixtures(tmp_path, ["SEC004"])
    assert fetched.forecast.forecast_date is None
    assert fetched.forecast.valid_upto is None
