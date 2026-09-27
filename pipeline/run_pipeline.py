#!/usr/bin/env python3
"""Meenvazhi daily pipeline.

Fetches INCOIS Potential Fishing Zone advisories, recomputes every zone's bearing
and distance from a configured home port, and publishes static JSON, GPX and text
into the output directory for GitHub Pages to serve.

Structure follows bloom/refresh.py: a JSON summary on stdout so a cron job's mail
is readable, and a meaningful exit code.

Exit codes:
    0  published
    2  refused (bad configuration, or no session could be opened)
    3  a sector fetch or parse failed; previously published data is untouched
    4  a write failed
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from meenvazhi import __version__, config
from meenvazhi.build import build_document
from meenvazhi.gpx import GpxError, build_gpx
from meenvazhi.http import FetchError, PoliteClient
from meenvazhi.incois import SectorResult, fetch_all, load_from_fixtures
from meenvazhi.ports import DEFAULT_PORT_SLUG, get_port
from meenvazhi.sectors import get_sector
from meenvazhi.textsummary import build_text
from meenvazhi.writer import PublishOutcome, publish, write_status

log = logging.getLogger("meenvazhi")

EXIT_OK = 0
EXIT_REFUSED = 2
EXIT_FETCH_FAILED = 3
EXIT_WRITE_FAILED = 4


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sectors", help="comma-separated sector ids, overriding the configured list")
    parser.add_argument("--home-port", help=f"home port slug (default from config, else {DEFAULT_PORT_SLUG})")
    parser.add_argument("--reachable-nmi", type=float, help="range within which a zone counts as reachable")
    parser.add_argument(
        "--from-fixtures",
        type=Path,
        metavar="DIR",
        help="parse saved HTML instead of fetching; makes the run fully offline",
    )
    parser.add_argument("--save-html", type=Path, metavar="DIR", help="save every fetched page for debugging")
    parser.add_argument("--out", type=Path, help="output directory (default from config)")
    parser.add_argument("--dry-run", action="store_true", help="compute and report, but write nothing")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--version", action="version", version=f"Meenvazhi {__version__}")
    return parser.parse_args(argv)


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def resolve_sectors(raw: str | None) -> list[str]:
    ids = [s.strip().upper() for s in raw.split(",") if s.strip()] if raw else config.sectors()
    for sector_id in ids:
        get_sector(sector_id)  # raises ValueError on an unknown id, before any network use
    return ids


def summarise(results: list[SectorResult], outcome: PublishOutcome, exit_code: int) -> dict[str, Any]:
    return {
        "generator": f"Meenvazhi/{__version__}",
        "published": outcome.published,
        "reason": outcome.reason,
        "advisory_date": outcome.advisory_date,
        "exit_code": exit_code,
        "files": outcome.files,
        "sectors": [
            {
                "sector_id": r.sector_id,
                "sector_name": r.sector_name,
                "status": str(r.status),
                "zone_count": r.page.zone_count if r.page else 0,
                "reason": r.page.reason if r.page else r.error,
            }
            for r in results
        ],
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)
    now = datetime.now(UTC)

    try:
        sector_ids = resolve_sectors(args.sectors)
        home = get_port(args.home_port or config.output().get("home_port") or DEFAULT_PORT_SLUG)
        reachable_nmi = float(
            args.reachable_nmi if args.reachable_nmi is not None else config.output().get("reachable_nmi", 120)
        )
        out_dir = args.out or config.out_dir()
        retention_days = int(config.app().get("history_retention_days", 400))
    except (ValueError, OSError) as exc:
        print(f"refusing to run: {exc}", file=sys.stderr)
        return EXIT_REFUSED

    log.info("home port %s (%.4f, %.4f); sectors %s", home.name, home.lat, home.lon, ", ".join(sector_ids))

    if args.from_fixtures:
        results = load_from_fixtures(args.from_fixtures, sector_ids)
    else:
        try:
            with PoliteClient() as client:
                results = fetch_all(client, sector_ids, save_dir=args.save_html)
        except FetchError as exc:
            print(f"refusing to run: {exc}", file=sys.stderr)
            return EXIT_REFUSED

    pages = [r.page for r in results if r.page is not None]
    document = build_document(pages, home=home, reachable_nmi=reachable_nmi, now=now)

    try:
        gpx = build_gpx(document)
    except GpxError as exc:
        log.error("GPX generation failed: %s", exc)
        outcome = PublishOutcome(published=False, reason=f"gpx generation failed: {exc}")
        if not args.dry_run:
            write_status(out_dir, results, outcome=outcome, exit_code=EXIT_WRITE_FAILED, now=now)
        print(json.dumps(summarise(results, outcome, EXIT_WRITE_FAILED), indent=2))
        return EXIT_WRITE_FAILED

    text = build_text(document)

    if args.dry_run:
        failed = [r for r in results if not r.ok]
        outcome = PublishOutcome(
            published=False,
            reason="dry run" if not failed else f"dry run; {len(failed)} sector(s) failed",
            advisory_date=document.get("advisory_date"),
        )
        print(json.dumps(summarise(results, outcome, EXIT_OK if not failed else EXIT_FETCH_FAILED), indent=2))
        return EXIT_OK if not failed else EXIT_FETCH_FAILED

    try:
        outcome = publish(
            results,
            document=document,
            gpx=gpx,
            text=text,
            out_dir=out_dir,
            now=now,
            retention_days=retention_days,
        )
        exit_code = EXIT_OK if outcome.published else EXIT_FETCH_FAILED
        write_status(out_dir, results, outcome=outcome, exit_code=exit_code, now=now)
    except OSError as exc:
        log.error("write failed: %s", exc)
        outcome = PublishOutcome(published=False, reason=f"write failed: {exc}")
        exit_code = EXIT_WRITE_FAILED

    print(json.dumps(summarise(results, outcome, exit_code), indent=2))
    if not outcome.published:
        log.warning("nothing published: %s (previously published data is untouched)", outcome.reason)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
