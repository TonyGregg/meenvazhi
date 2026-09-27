#!/usr/bin/env python3
"""Regenerate the golden output files from the captured HTML fixtures.

Run this deliberately, never automatically, and always read the resulting diff.
The goldens are byte-compared by tests/test_build_golden.py, so they are the
tripwire for accidental schema drift. Regenerating them to make a red test go
green defeats the point: the app runs on a phone that cannot be updated at sea,
so a field that silently changes shape breaks a boat rather than a build.

Usage, from the repo root:
    pipeline/.venv/bin/python tools/regen-goldens.py
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "pipeline"))

from meenvazhi.build import build_document  # noqa: E402
from meenvazhi.gpx import build_gpx  # noqa: E402
from meenvazhi.parse import parse_sector_page  # noqa: E402
from meenvazhi.ports import get_port  # noqa: E402
from meenvazhi.textsummary import build_text  # noqa: E402

HTML_DIR = REPO / "pipeline" / "tests" / "fixtures" / "html"
GOLDEN_DIR = REPO / "pipeline" / "tests" / "fixtures" / "golden"

# Must stay in step with tests/test_build_golden.py.
FROZEN_NOW = datetime(2026, 9, 27, 11, 31, 4, tzinfo=UTC)
HOME_PORT = "kochi"
REACHABLE_NMI = 120.0

SECTOR_SPEC = (
    ("sec005-kerala-no-advisory.html", "SEC005", "KERALA"),
    ("sec004-karnataka-has-advisory.html", "SEC004", "KARNATAKA"),
    ("sec014-lakshadweep-no-advisory.html", "SEC014", "LAKSHADWEEP"),
    ("sec006-south-tamilnadu-no-advisory.html", "SEC006", "SOUTH TAMILNADU"),
)


def main() -> int:
    pages = [
        parse_sector_page(
            (HTML_DIR / filename).read_text(encoding="utf-8", errors="replace"),
            expected_sector_id=sector_id,
            expected_sector_name=sector_name,
        )
        for filename, sector_id, sector_name in SECTOR_SPEC
    ]
    document = build_document(
        pages,
        home=get_port(HOME_PORT),
        reachable_nmi=REACHABLE_NMI,
        now=FROZEN_NOW,
    )

    outputs = {
        "pfz-latest.json": json.dumps(document, indent=2, ensure_ascii=False) + "\n",
        "pfz-latest.gpx": build_gpx(document),
        "pfz-latest.txt": build_text(document),
    }
    for name, payload in outputs.items():
        (GOLDEN_DIR / name).write_text(payload, encoding="utf-8", newline="\n")
        print(f"wrote {GOLDEN_DIR.relative_to(REPO)}/{name}")

    print("\nNow read the diff before committing: git diff pipeline/tests/fixtures/golden/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
