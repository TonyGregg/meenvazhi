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


def test_pipeline_is_scheduled_with_margin_after_the_incois_update(pipeline: dict[str, Any]) -> None:
    """INCOIS published at 15:26 IST on the day this was built, so 09:56 UTC.

    Both schedules must sit comfortably after that, since GitHub's cron drifts.
    """
    crons = [s["cron"] for s in pipeline["on"]["schedule"]]
    assert crons, "the pipeline must be scheduled"
    for cron in crons:
        minute, hour = cron.split()[0], cron.split()[1]
        utc_minutes = int(hour) * 60 + int(minute)
        assert utc_minutes > 10 * 60, f"{cron} leaves too little margin after the INCOIS update"


def test_fetched_html_is_kept_as_an_artifact_not_committed(pipeline: dict[str, Any]) -> None:
    """Raw HTML is 50 KB per sector per day, so it does not belong in git history.

    It is still needed to debug a parse failure, hence the artifact.
    """
    steps = pipeline["jobs"]["fetch"]["steps"]
    upload = next(s for s in steps if str(s.get("uses", "")).startswith("actions/upload-artifact"))
    assert "runs/" in upload["with"]["path"]
    assert upload["if"].startswith("always()"), "capture the HTML even when the run failed"
