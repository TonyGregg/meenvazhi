"""Publish the output files, or refuse to.

The governing rule: a failed run must never damage a good previous run. Someone at
sea may be relying on the file that is already published, and stale-but-known data
beats a truncated or half-written file. So every write is atomic, and a run with
any failed sector publishes nothing at all.

The converse also matters. A run where every sector is legitimately cloud-covered
is a success and gets published. "Nothing today, because clouds" is real
information, and withholding it leaves yesterday's zones on the boat's screen with
nothing to say they are superseded.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from .incois import SectorResult
from .model import SectorStatus

log = logging.getLogger("meenvazhi.writer")

LATEST_JSON = "pfz-latest.json"
LATEST_GPX = "pfz-latest.gpx"
LATEST_TXT = "pfz-latest.txt"
STATUS_JSON = "status.json"
HISTORY_DIR = "history"
HISTORY_INDEX = "index.json"


UNCHANGED_REASON = "unchanged since the last publish"


@dataclass(slots=True)
class PublishOutcome:
    published: bool
    reason: str | None = None
    advisory_date: str | None = None
    files: list[str] = field(default_factory=list)
    # True when the run succeeded but INCOIS had nothing new: the same advisory as
    # the one already published. Not a failure, and nothing is written.
    unchanged: bool = False


def write_atomic(path: Path, data: str) -> None:
    """Write via a temporary file in the same directory, then rename.

    The rename is atomic within a filesystem, so a reader either sees the old file
    or the new one, never a partial write.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(data, encoding="utf-8", newline="\n")
    tmp.replace(path)


def _read_status(out_dir: Path) -> dict[str, Any]:
    path = out_dir / STATUS_JSON
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def write_status(
    out_dir: Path,
    results: list[SectorResult],
    *,
    outcome: PublishOutcome,
    exit_code: int,
    now: datetime,
) -> None:
    """Record the attempt, successful or not.

    Kept in its own file so that failure telemetry never touches the data file the
    app reads.
    """
    previous = _read_status(out_dir)
    previous_failures = int(previous.get("consecutive_failures", 0) or 0)

    status = {
        "last_attempt_at": now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "published": outcome.published,
        "reason": outcome.reason,
        "exit_code": exit_code,
        "advisory_date": outcome.advisory_date or previous.get("advisory_date"),
        "consecutive_failures": 0 if outcome.published else previous_failures + 1,
        "sectors": [
            {
                "sector_id": r.sector_id,
                "sector_name": r.sector_name,
                "status": str(r.status),
                "reason": r.page.reason if r.page else r.error,
                "zone_count": r.page.zone_count if r.page else 0,
            }
            for r in results
        ],
    }
    if outcome.published:
        status["last_success_at"] = status["last_attempt_at"]
    elif previous.get("last_success_at"):
        status["last_success_at"] = previous["last_success_at"]

    write_atomic(out_dir / STATUS_JSON, json.dumps(status, indent=2) + "\n")


def prune_history(out_dir: Path, *, retention_days: int, today: date) -> list[str]:
    """Drop history files older than the retention window."""
    history = out_dir / HISTORY_DIR
    if not history.is_dir():
        return []
    cutoff = today - timedelta(days=retention_days)
    removed: list[str] = []
    for path in sorted(history.glob("*.json")):
        if path.name == HISTORY_INDEX:
            continue
        try:
            stamp = date.fromisoformat(path.stem)
        except ValueError:
            continue
        if stamp < cutoff:
            path.unlink()
            removed.append(path.name)
    return removed


def write_history_index(out_dir: Path, *, now: datetime) -> None:
    """List the available history dates, newest first.

    GitHub Pages serves no directory listing, so the app cannot discover these on
    its own without an index.
    """
    history = out_dir / HISTORY_DIR
    dates = sorted(
        (p.stem for p in history.glob("*.json") if p.name != HISTORY_INDEX),
        reverse=True,
    )
    payload = {
        "dates": dates,
        "updated_at": now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    write_atomic(history / HISTORY_INDEX, json.dumps(payload, indent=2) + "\n")


def _comparable(document: dict[str, Any]) -> dict[str, Any]:
    """The document minus the one field that changes on every run."""
    return {k: v for k, v in document.items() if k != "generated_at"}


def is_unchanged(out_dir: Path, document: dict[str, Any]) -> bool:
    """True when the published advisory already says exactly this.

    The pipeline runs several times a day, and until INCOIS posts the day's update
    every run fetches the same advisory as last time. Publishing it again would
    change nothing but the generated_at timestamp, and would add a commit and a
    deploy for each run. An unreadable previous file counts as changed, so a
    corrupt file is always replaced.
    """
    path = out_dir / LATEST_JSON
    if not path.exists():
        return False
    try:
        previous = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return isinstance(previous, dict) and _comparable(previous) == _comparable(document)


def publish(
    results: list[SectorResult],
    *,
    document: dict[str, Any],
    gpx: str,
    text: str,
    out_dir: Path,
    now: datetime,
    retention_days: int = 400,
) -> PublishOutcome:
    """Write every output file, or nothing.

    Returns an outcome describing what happened. The caller maps that to an exit
    code; this function does not exit.
    """
    failed = [r for r in results if not r.ok]
    if failed:
        names = ", ".join(f"{r.sector_id} ({r.error})" for r in failed)
        # Refusing wholesale is deliberate. A failed sector means the session
        # broke, which casts doubt on the whole run, and quietly dropping a sector
        # the fisherman expects to see is worse than publishing nothing at all.
        return PublishOutcome(published=False, reason=f"sector fetch failed: {names}")

    advisory_date = document.get("advisory_date")

    if is_unchanged(out_dir, document):
        return PublishOutcome(
            published=False,
            reason=UNCHANGED_REASON,
            advisory_date=advisory_date,
            unchanged=True,
        )
    json_text = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    written: list[str] = []

    # Order matters. pfz-latest.json is what the app polls, so it goes last: an
    # interrupted run can then never leave the app pointing at a document whose
    # sibling files do not exist yet.
    if advisory_date:
        write_atomic(out_dir / HISTORY_DIR / f"{advisory_date}.json", json_text)
        written.append(f"{HISTORY_DIR}/{advisory_date}.json")
        for name in prune_history(out_dir, retention_days=retention_days, today=now.date()):
            log.info("pruned history/%s", name)
        write_history_index(out_dir, now=now)
        written.append(f"{HISTORY_DIR}/{HISTORY_INDEX}")
    else:
        # Every sector cloud-covered, so INCOIS published no timestamp to key on.
        # Still publish the latest files; just do not invent a history date.
        log.warning("no advisory date available; publishing latest files without a history entry")

    for name, payload in ((LATEST_GPX, gpx), (LATEST_TXT, text), (LATEST_JSON, json_text)):
        write_atomic(out_dir / name, payload)
        written.append(name)

    all_empty = all(r.status is SectorStatus.NO_ADVISORY for r in results)
    reason = "all sectors cloud-covered" if all_empty else None
    return PublishOutcome(published=True, reason=reason, advisory_date=advisory_date, files=written)
