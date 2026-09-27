"""Polite HTTP client with a persistent session.

Adapted from bloom/tracker/http.py, keeping its behaviour: a descriptive
User-Agent, robots.txt honoured with per-host caching, a per-host minimum
interval, bounded retries on 429 and 5xx only, a response size guard, and
exponential backoff.

The one substantive change is the session. bloom builds a fresh httpx.Client
inside a `with` block for every request, which discards cookies on exit. INCOIS
hands out a JSESSIONID on its landing page and serves an empty page shell to any
request that arrives without it, so the cookie has to survive between calls. Hence
a long-lived client wrapped in a class rather than a module-level function.

INCOIS has no robots.txt -- the URL returns a 404 HTML error page -- and the
inherited "no robots file means allowed" branch handles that correctly with no
special case.
"""

from __future__ import annotations

import logging
import threading
import time
import urllib.robotparser
from types import TracebackType
from typing import Any, Self
from urllib.parse import urlparse

import httpx

from . import config

log = logging.getLogger("meenvazhi.http")

DEFAULT_MAX_BYTES = 15_000_000
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class FetchError(Exception):
    """A request could not be completed after retries."""


class RobotsDisallowed(FetchError):
    pass


class Settings:
    """Resolved HTTP settings, read once per client."""

    __slots__ = ("interval", "respect_robots", "retries", "timeout", "user_agent")

    def __init__(self, app: dict[str, Any] | None = None) -> None:
        cfg = app if app is not None else config.app()
        self.user_agent: str = cfg.get("user_agent", "Meenvazhi/1.0 (+https://github.com/antonygenil/meenvazhi)")
        self.timeout: float = float(cfg.get("timeout_seconds", 30))
        self.retries: int = int(cfg.get("retries", 3))
        self.interval: float = float(cfg.get("per_host_min_interval", 2.0))
        self.respect_robots: bool = bool(cfg.get("respect_robots", True))


class PoliteClient:
    """One HTTP session, reused across every request of a run.

    Not thread-safe by intent as far as ordering goes: the throttle is locked, but
    this client is meant to be driven sequentially. Fetching INCOIS sectors in
    parallel would gain nothing on a once-a-day job and would look like abuse.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or Settings()
        self._lock = threading.Lock()
        self._last_hit: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._client = httpx.Client(
            headers={
                "User-Agent": self._settings.user_agent,
                "Accept": "text/html,application/xhtml+xml,*/*",
                "Accept-Encoding": "gzip, deflate",
            },
            timeout=self._settings.timeout,
            follow_redirects=True,
            cookies=httpx.Cookies(),
        )

    @property
    def user_agent(self) -> str:
        return self._settings.user_agent

    def cookie(self, name: str) -> str | None:
        """Read a cookie from the jar, so callers can assert a session was issued."""
        return self._client.cookies.get(name)

    def _throttle(self, host: str) -> None:
        with self._lock:
            last = self._last_hit.get(host, 0.0)
            wait = self._settings.interval - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            self._last_hit[host] = time.monotonic()

    def _robots_ok(self, url: str) -> bool:
        if not self._settings.respect_robots:
            return True
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        if base not in self._robots:
            parser = urllib.robotparser.RobotFileParser()
            try:
                self._throttle(parsed.netloc)
                response = self._client.get(f"{base}/robots.txt")
                if response.status_code == 200:
                    parser.parse(response.text.splitlines())
                    self._robots[base] = parser
                else:
                    # No robots file means nothing is disallowed. INCOIS serves a
                    # 404 HTML page here, which lands in this branch correctly.
                    self._robots[base] = None
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                log.warning("robots.txt fetch failed for %s: %s", base, exc)
                self._robots[base] = None
        parser_or_none = self._robots.get(base)
        if parser_or_none is None:
            return True
        token = self._settings.user_agent.split("/")[0]
        return parser_or_none.can_fetch(token, url) and parser_or_none.can_fetch("*", url)

    def get(
        self,
        url: str,
        *,
        extra_headers: dict[str, str] | None = None,
        max_bytes: int = DEFAULT_MAX_BYTES,
        ignore_robots: bool = False,
    ) -> httpx.Response:
        """GET with throttling and bounded retries. Raises FetchError on final failure."""
        if not ignore_robots and not self._robots_ok(url):
            raise RobotsDisallowed(f"robots.txt disallows {url}")

        host = urlparse(url).netloc
        last_error: Exception | None = None

        for attempt in range(self._settings.retries):
            try:
                self._throttle(host)
                response = self._client.get(url, headers=extra_headers or {})
                if response.status_code in RETRY_STATUSES:
                    raise FetchError(f"HTTP {response.status_code}")
                if response.status_code >= 400:
                    raise FetchError(f"HTTP {response.status_code} (not retried)")
                if len(response.content) > max_bytes:
                    raise FetchError(f"response too large ({len(response.content)} bytes)")
            except FetchError as exc:
                last_error = exc
                if "not retried" in str(exc):
                    break
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = FetchError(f"{type(exc).__name__}: {exc}")
            else:
                return response

            if attempt < self._settings.retries - 1:
                time.sleep(min(8.0, 1.5 * (2**attempt)))

        raise FetchError(f"{url}: {last_error}")

    def get_text(self, url: str, **kwargs: Any) -> str:
        return self.get(url, **kwargs).text

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()
