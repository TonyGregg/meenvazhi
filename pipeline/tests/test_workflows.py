"""Sanity checks on the GitHub Actions workflows.

Unusual to test YAML, and justified here by one specific bug. The first live run
committed a freshly fetched advisory and then deployed the previous one, because
the deploy job's checkout defaulted to the SHA that triggered the run rather than
the branch tip. Every step reported success while the site served stale data.

The consequence of that class of bug is someone at sea steering to zones that have
been superseded, so it is worth a few cheap assertions rather than trusting that
nobody reintroduces it.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

WORKFLOW_DIR = Path(__file__).resolve().parent.parent.parent / ".github" / "workflows"


def load(name: str) -> dict[str, Any]:
    data = yaml.safe_load((WORKFLOW_DIR / name).read_text(encoding="utf-8"))
    # Bare `on:` is parsed as the boolean True under YAML 1.1, so triggers may sit
    # under either key depending on the parser.
    if "on" not in data and True in data:
        data["on"] = data.pop(True)
    return data


@pytest.fixture
def pages() -> dict[str, Any]:
    return load("pages.yml")


@pytest.fixture
def pipeline() -> dict[str, Any]:
    return load("pipeline.yml")


def test_all_workflows_parse() -> None:
    for path in WORKFLOW_DIR.glob("*.yml"):
        assert yaml.safe_load(path.read_text(encoding="utf-8")), path.name


def test_deploy_checks_out_the_branch_tip(pages: dict[str, Any]) -> None:
    """The regression test for the stale-deploy bug.

    The pipeline commits the day's advisory and then calls this workflow. That
    commit does not exist when the run starts, so a checkout without an explicit
    ref publishes the tree from before the fetch.
    """
    steps = pages["jobs"]["build-and-deploy"]["steps"]
    checkout = next(s for s in steps if str(s.get("uses", "")).startswith("actions/checkout"))
    assert checkout.get("with", {}).get("ref") == "main", (
        "the Pages deploy must check out the branch tip, or it will publish the "
        "advisory as it was before the pipeline committed the new one"
    )


def test_pages_is_callable_by_the_pipeline(pages: dict[str, Any]) -> None:
    """A push made with the built-in token cannot trigger another workflow.

    So the deploy has to be invoked directly, not by watching for the data commit.
    """
    assert "workflow_call" in pages["on"]


def test_pipeline_invokes_the_deploy(pipeline: dict[str, Any]) -> None:
    deploy = pipeline["jobs"]["deploy"]
    assert deploy["uses"].endswith("pages.yml")
    assert deploy["needs"] == "fetch"
    assert "published" in deploy["if"], "only deploy when something was actually published"


def test_pipeline_can_write_contents(pipeline: dict[str, Any]) -> None:
    """The daily run commits the advisory back to the default branch."""
    assert pipeline["permissions"]["contents"] == "write"


def test_pipeline_runs_are_not_cancelled_midway(pipeline: dict[str, Any]) -> None:
    """Cancelling a run partway could interrupt the commit and push."""
    assert pipeline["concurrency"]["cancel-in-progress"] is False


def _schedule_minutes_utc(pipeline: dict[str, Any]) -> list[int]:
    minutes = []
    for entry in pipeline["on"]["schedule"]:
        minute, hour = entry["cron"].split()[:2]
        minutes.append(int(hour) * 60 + int(minute))
    return sorted(minutes)


def test_pipeline_runs_several_times_a_day(pipeline: dict[str, Any]) -> None:
    """One run a day proved fragile: GitHub delayed the first two by six and seven hours."""
    assert len(_schedule_minutes_utc(pipeline)) >= 5


def test_some_runs_come_after_the_incois_update(pipeline: dict[str, Any]) -> None:
    """INCOIS published at 15:26 IST, 09:56 UTC, on the day this was built.

    Runs before that only ever find yesterday's advisory, so several must come after it.
    """
    after_update = [m for m in _schedule_minutes_utc(pipeline) if m > 9 * 60 + 56]
    assert len(after_update) >= 3


def test_every_run_is_before_midnight_india_time(pipeline: dict[str, Any]) -> None:
    """A run after midnight IST files the day's advisory under the next date's guard,
    which is exactly how the first scheduled runs published the same advisory twice.
    Midnight IST is 18:30 UTC."""
    assert max(_schedule_minutes_utc(pipeline)) < 18 * 60 + 30


def test_every_scheduled_run_checks_before_contacting_incois(pipeline: dict[str, Any]) -> None:
    """With seven runs a day, the guard has to cover all of them, not just a retry slot."""
    steps = pipeline["jobs"]["fetch"]["steps"]
    guard = next(s for s in steps if s.get("id") == "guard")
    assert "github.event_name" in guard["run"]
    assert "schedule" in guard["run"]
    # And it must not be tied to one particular cron expression any more.
    assert "github.event.schedule" not in guard["run"]


def test_unchanged_runs_do_not_commit_or_deploy(pipeline: dict[str, Any]) -> None:
    """Both depend on the pipeline reporting published, which it does not for a no-op."""
    steps = pipeline["jobs"]["fetch"]["steps"]
    commit = next(s for s in steps if s.get("name") == "Commit the advisory")
    assert commit["if"] == "steps.run.outputs.published == 'true'"
    assert "published" in pipeline["jobs"]["deploy"]["if"]


def test_fetched_html_is_kept_as_an_artifact_not_committed(pipeline: dict[str, Any]) -> None:
    """Raw HTML is 50 KB per sector per day, so it does not belong in git history.

    It is still needed to debug a parse failure, hence the artifact.
    """
    steps = pipeline["jobs"]["fetch"]["steps"]
    upload = next(s for s in steps if str(s.get("uses", "")).startswith("actions/upload-artifact"))
    assert "runs/" in upload["with"]["path"]
    assert upload["if"].startswith("always()"), "capture the HTML even when the run failed"


def test_pages_builds_the_app_before_deploying(pages: dict[str, Any]) -> None:
    """The deploy must publish the built app, not just the data files."""
    steps = pages["jobs"]["build-and-deploy"]["steps"]
    names = [s.get("name") or s.get("uses", "") for s in steps]
    assert any("setup-node" in n for n in names), "the app has to be built before it can be deployed"
    assert "Build the app" in names
    assert "Assemble the site" in names
    # Order matters: assembling before building would copy a stale or absent dist.
    assert names.index("Build the app") < names.index("Assemble the site")


def test_ci_runs_the_offline_end_to_end_tests() -> None:
    """The offline behaviour is the whole product, so it cannot be checked by hand only."""
    ci = load("ci.yml")
    web = ci["jobs"]["web"]
    run_steps = " ".join(str(s.get("run", "")) for s in web["steps"])
    assert "npm run test:e2e" in run_steps
    assert "playwright install" in run_steps
