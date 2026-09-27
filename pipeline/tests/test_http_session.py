"""The polite client, and specifically its session.

The cookie test is the one that matters. INCOIS issues a JSESSIONID on its landing
page and serves an empty page shell to any request that arrives without it, so a
client that discards cookies between requests produces a pipeline that silently
reports no fish every day.
"""

from __future__ import annotations

import httpx
import pytest

from meenvazhi.http import FetchError, PoliteClient, RobotsDisallowed, Settings

APP = {
    "user_agent": "Meenvazhi/1.0 (+https://github.com/antonygenil/meenvazhi)",
    "timeout_seconds": 5,
    "retries": 3,
    "per_host_min_interval": 0,  # tests must not actually sleep
    "respect_robots": False,
}

HOME = "https://incois.gov.in/MarineFisheries/TextDataHome?mfid=1&request_locale=en"
SECTOR = "https://incois.gov.in/MarineFisheries/TextData?secid=SEC004"


def make_client(handler, app: dict | None = None) -> PoliteClient:
    client = PoliteClient(Settings(app or APP))
    client._client = httpx.Client(  # swapping in a mock transport
        transport=httpx.MockTransport(handler),
        headers=dict(client._client.headers),
        follow_redirects=True,
        cookies=httpx.Cookies(),
    )
    return client


@pytest.fixture(autouse=True)
def no_sleeping(monkeypatch):
    """Record backoff delays instead of waiting them out."""
    slept: list[float] = []
    monkeypatch.setattr("meenvazhi.http.time.sleep", slept.append)
    return slept


def test_session_cookie_is_reused_on_the_next_request() -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("cookie"))
        if "TextDataHome" in str(request.url):
            return httpx.Response(200, text="home", headers={"Set-Cookie": "JSESSIONID=ABC123; Path=/MarineFisheries"})
        return httpx.Response(200, text="sector")

    with make_client(handler) as client:
        client.get(HOME)
        assert client.cookie("JSESSIONID") == "ABC123"
        client.get(SECTOR)

    assert seen[0] is None
    assert seen[1] is not None
    assert "JSESSIONID=ABC123" in seen[1]


def test_user_agent_identifies_the_project() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, text="ok")

    with make_client(handler) as client:
        client.get(HOME)

    assert seen == ["Meenvazhi/1.0 (+https://github.com/antonygenil/meenvazhi)"]


def test_referer_is_passed_through() -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("referer"))
        return httpx.Response(200, text="ok")

    with make_client(handler) as client:
        client.get(SECTOR, extra_headers={"Referer": HOME})

    assert seen == [HOME]


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
def test_retryable_statuses_are_retried(status: int, no_sleeping: list[float]) -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(status)
        return httpx.Response(status, text="busy")

    with make_client(handler) as client, pytest.raises(FetchError, match=str(status)):
        client.get(HOME)

    assert len(calls) == APP["retries"]
    assert no_sleeping == [1.5, 3.0]  # one sleep fewer than attempts


@pytest.mark.parametrize("status", [400, 403, 404, 410])
def test_client_errors_are_not_retried(status: int, no_sleeping: list[float]) -> None:
    """A 404 will still be a 404 in three seconds. Retrying it is just noise."""
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(status)
        return httpx.Response(status, text="nope")

    with make_client(handler) as client, pytest.raises(FetchError, match="not retried"):
        client.get(HOME)

    assert len(calls) == 1
    assert no_sleeping == []


def test_transient_failure_then_success(no_sleeping: list[float]) -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ConnectTimeout("timed out")
        return httpx.Response(200, text="recovered")

    with make_client(handler) as client:
        assert client.get(HOME).text == "recovered"

    assert len(calls) == 2
    assert no_sleeping == [1.5]


def test_backoff_is_capped(no_sleeping: list[float]) -> None:
    app = {**APP, "retries": 8}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with make_client(handler, app) as client, pytest.raises(FetchError):
        client.get(HOME)

    assert no_sleeping == [1.5, 3.0, 6.0, 8.0, 8.0, 8.0, 8.0]
    assert max(no_sleeping) == 8.0


def test_oversized_response_is_rejected(no_sleeping: list[float]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="x" * 5000)

    with make_client(handler) as client, pytest.raises(FetchError, match="too large"):
        client.get(HOME, max_bytes=1000)


def test_missing_robots_file_means_allowed() -> None:
    """INCOIS returns a 404 HTML page for robots.txt, which must not block the run."""
    app = {**APP, "respect_robots": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404, text="<html>Page Not Found</html>")
        return httpx.Response(200, text="sector")

    with make_client(handler, app) as client:
        assert client.get(SECTOR).text == "sector"


def test_robots_disallow_is_honoured() -> None:
    app = {**APP, "respect_robots": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /MarineFisheries/")
        return httpx.Response(200, text="should not be reached")

    with make_client(handler, app) as client:
        with pytest.raises(RobotsDisallowed):
            client.get(SECTOR)
        # Cached, so a second call does not refetch robots.txt.
        with pytest.raises(RobotsDisallowed):
            client.get(SECTOR)


def test_robots_can_be_bypassed_per_request() -> None:
    app = {**APP, "respect_robots": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        return httpx.Response(200, text="fetched")

    with make_client(handler, app) as client:
        assert client.get(SECTOR, ignore_robots=True).text == "fetched"


def test_requests_are_sequential(monkeypatch) -> None:
    """One request at a time, by construction. Concurrency here would be rude."""
    inflight = 0
    max_inflight = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal inflight, max_inflight
        inflight += 1
        max_inflight = max(max_inflight, inflight)
        inflight -= 1
        return httpx.Response(200, text="ok")

    with make_client(handler) as client:
        for _ in range(4):
            client.get(SECTOR)

    assert max_inflight == 1


def test_throttle_waits_between_requests(monkeypatch) -> None:
    app = {**APP, "per_host_min_interval": 2.0}
    slept: list[float] = []
    monkeypatch.setattr("meenvazhi.http.time.sleep", slept.append)
    monkeypatch.setattr("meenvazhi.http.time.monotonic", lambda: 100.0)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="ok")

    with make_client(handler, app) as client:
        client.get(SECTOR)
        client.get(SECTOR)

    # The clock is frozen, so the second request must wait the full interval.
    assert slept == [2.0]
