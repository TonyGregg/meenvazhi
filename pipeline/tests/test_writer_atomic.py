"""Publishing rules, especially the refusal to damage good data.

Someone at sea may be relying on the file already published. Stale-but-known data
beats a half-written file, and a run that cannot reach INCOIS must leave the
previous advisory exactly as it found it.
"""

from __future__ import annotations

import json
import pathlib
from datetime import UTC, datetime
from pathlib import Path

import pytest
from conftest import GOLDEN_DIR

from meenvazhi.incois import SectorResult
from meenvazhi.model import SectorPage, SectorStatus
from meenvazhi.writer import (
    HISTORY_DIR,
    LATEST_JSON,
    STATUS_JSON,
    prune_history,
    publish,
    write_atomic,
    write_status,
)

NOW = datetime(2026, 9, 27, 11, 31, 4, tzinfo=UTC)


@pytest.fixture
def document() -> dict:
    return json.loads((GOLDEN_DIR / "pfz-latest.json").read_text(encoding="utf-8"))


@pytest.fixture
def gpx() -> str:
    return (GOLDEN_DIR / "pfz-latest.gpx").read_text(encoding="utf-8")


def _ok(sector_id: str, name: str, status: SectorStatus, zones: int = 0) -> SectorResult:
    page = SectorPage(
        sector_id=sector_id,
        sector_name=name,
        status=status,
        rows=(),
        reason="excessive cloud cover" if status is SectorStatus.NO_ADVISORY else None,
        incois_updated_at=NOW,
    )
    object.__setattr__(page, "rows", tuple(range(zones)))  # type: ignore[arg-type]
    return SectorResult(sector_id, name, page)


def _failed(sector_id: str, name: str, error: str = "no JSP body marker") -> SectorResult:
    return SectorResult(sector_id, name, None, error)


def _publish(results, tmp_path: Path, document: dict, gpx: str):
    return publish(
        results,
        document=document,
        gpx=gpx,
        text="summary\n",
        out_dir=tmp_path,
        now=NOW,
    )


def test_write_atomic_leaves_no_temp_file(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "file.json"
    write_atomic(target, "hello\n")
    assert target.read_text(encoding="utf-8") == "hello\n"
    assert list(tmp_path.rglob("*.tmp")) == []


def test_write_atomic_uses_unix_endings(tmp_path: Path) -> None:
    target = tmp_path / "file.txt"
    write_atomic(target, "a\nb\n")
    assert target.read_bytes() == b"a\nb\n"


def test_successful_run_publishes_every_file(tmp_path: Path, document: dict, gpx: str) -> None:
    results = [_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)]
    outcome = _publish(results, tmp_path, document, gpx)
    assert outcome.published
    for name in (LATEST_JSON, "pfz-latest.gpx", "pfz-latest.txt"):
        assert (tmp_path / name).exists()
    assert (tmp_path / HISTORY_DIR / "2026-09-27.json").exists()
    assert (tmp_path / HISTORY_DIR / "index.json").exists()


def test_all_sectors_cloud_covered_is_still_published(tmp_path: Path, document: dict, gpx: str) -> None:
    """An empty day is information, not a failure.

    If this were withheld, the boat would keep showing yesterday's zones with
    nothing to indicate they had been superseded.
    """
    results = [
        _ok("SEC005", "KERALA", SectorStatus.NO_ADVISORY),
        _ok("SEC004", "KARNATAKA", SectorStatus.NO_ADVISORY),
    ]
    outcome = _publish(results, tmp_path, document, gpx)
    assert outcome.published
    assert outcome.reason == "all sectors cloud-covered"
    assert (tmp_path / LATEST_JSON).exists()


def test_failed_sector_leaves_previous_data_byte_identical(tmp_path: Path, document: dict, gpx: str) -> None:
    """The central guarantee of this module."""
    previous = '{"schema_version": 1, "advisory_date": "2026-09-26"}\n'
    (tmp_path / LATEST_JSON).write_text(previous, encoding="utf-8")
    before = (tmp_path / LATEST_JSON).read_bytes()

    results = [
        _ok("SEC005", "KERALA", SectorStatus.NO_ADVISORY),
        _failed("SEC004", "KARNATAKA"),
    ]
    outcome = _publish(results, tmp_path, document, gpx)

    assert not outcome.published
    assert "sector fetch failed" in (outcome.reason or "")
    assert (tmp_path / LATEST_JSON).read_bytes() == before
    assert not (tmp_path / HISTORY_DIR / "2026-09-27.json").exists()
    assert list(tmp_path.rglob("*.tmp")) == []


def test_partial_results_are_never_published(tmp_path: Path, document: dict, gpx: str) -> None:
    """One broken sector invalidates the run rather than silently shrinking it.

    A failure means the session broke, so the sectors that did parse are of
    unknown completeness, and a fisherman who expects four sectors must not
    silently receive three.
    """
    results = [
        _ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20),
        _failed("SEC005", "KERALA"),
    ]
    outcome = _publish(results, tmp_path, document, gpx)
    assert not outcome.published
    assert not (tmp_path / LATEST_JSON).exists()


def test_latest_json_is_written_last(tmp_path: Path, document: dict, gpx: str, monkeypatch) -> None:
    """So an interrupted run never points the app at a document whose siblings are missing."""
    order: list[str] = []
    real_replace = pathlib.Path.replace

    def spy(self: Path, target):  # type: ignore[no-untyped-def]
        order.append(Path(target).name)
        return real_replace(self, target)

    monkeypatch.setattr(pathlib.Path, "replace", spy)
    _publish([_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)], tmp_path, document, gpx)
    assert order[-1] == LATEST_JSON


def test_interrupted_rename_leaves_the_original(tmp_path: Path, document: dict, gpx: str, monkeypatch) -> None:
    previous = '{"advisory_date": "2026-09-26"}\n'
    (tmp_path / LATEST_JSON).write_text(previous, encoding="utf-8")

    def boom(self: Path, target):  # type: ignore[no-untyped-def]
        raise OSError("disk full")

    monkeypatch.setattr(pathlib.Path, "replace", boom)
    with pytest.raises(OSError, match="disk full"):
        _publish([_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)], tmp_path, document, gpx)
    assert (tmp_path / LATEST_JSON).read_text(encoding="utf-8") == previous


def test_status_is_written_even_when_nothing_is_published(tmp_path: Path, document: dict, gpx: str) -> None:
    results = [_failed("SEC004", "KARNATAKA")]
    outcome = _publish(results, tmp_path, document, gpx)
    write_status(tmp_path, results, outcome=outcome, exit_code=3, now=NOW)

    status = json.loads((tmp_path / STATUS_JSON).read_text(encoding="utf-8"))
    assert status["published"] is False
    assert status["exit_code"] == 3
    assert status["consecutive_failures"] == 1
    assert status["sectors"][0]["status"] == "FETCH_FAILED"


def test_consecutive_failures_accumulate_then_reset(tmp_path: Path, document: dict, gpx: str) -> None:
    failed = [_failed("SEC004", "KARNATAKA")]
    for expected in (1, 2, 3):
        outcome = _publish(failed, tmp_path, document, gpx)
        write_status(tmp_path, failed, outcome=outcome, exit_code=3, now=NOW)
        status = json.loads((tmp_path / STATUS_JSON).read_text(encoding="utf-8"))
        assert status["consecutive_failures"] == expected

    good = [_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)]
    outcome = _publish(good, tmp_path, document, gpx)
    write_status(tmp_path, good, outcome=outcome, exit_code=0, now=NOW)
    status = json.loads((tmp_path / STATUS_JSON).read_text(encoding="utf-8"))
    assert status["consecutive_failures"] == 0
    assert status["last_success_at"] == "2026-09-27T11:31:04Z"


def test_status_survives_a_corrupt_previous_file(tmp_path: Path, document: dict, gpx: str) -> None:
    (tmp_path / STATUS_JSON).write_text("not json at all", encoding="utf-8")
    results = [_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)]
    outcome = _publish(results, tmp_path, document, gpx)
    write_status(tmp_path, results, outcome=outcome, exit_code=0, now=NOW)
    assert json.loads((tmp_path / STATUS_JSON).read_text(encoding="utf-8"))["published"] is True


def test_history_index_lists_newest_first(tmp_path: Path, document: dict, gpx: str) -> None:
    history = tmp_path / HISTORY_DIR
    history.mkdir()
    for stamp in ("2026-09-20", "2026-09-25"):
        (history / f"{stamp}.json").write_text("{}", encoding="utf-8")

    _publish([_ok("SEC004", "KARNATAKA", SectorStatus.HAS_ADVISORY, zones=20)], tmp_path, document, gpx)
    index = json.loads((history / "index.json").read_text(encoding="utf-8"))
    assert index["dates"] == ["2026-09-27", "2026-09-25", "2026-09-20"]


def test_prune_history_drops_only_expired_files(tmp_path: Path) -> None:
    history = tmp_path / HISTORY_DIR
    history.mkdir()
    for stamp in ("2024-01-01", "2026-09-01", "2026-09-27"):
        (history / f"{stamp}.json").write_text("{}", encoding="utf-8")
    (history / "index.json").write_text("{}", encoding="utf-8")
    (history / "notadate.json").write_text("{}", encoding="utf-8")

    removed = prune_history(tmp_path, retention_days=400, today=NOW.date())
    assert removed == ["2024-01-01.json"]
    assert (history / "2026-09-01.json").exists()
    assert (history / "index.json").exists()
    assert (history / "notadate.json").exists()
