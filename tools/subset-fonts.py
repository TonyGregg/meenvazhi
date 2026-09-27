#!/usr/bin/env python3
"""Subset Noto Sans Malayalam and Noto Sans Tamil to the characters the app uses.

Run by hand, never in CI, and commit the output. Vendored deterministic assets
beat a build that reaches out to the network, and the fonts change only when the
translations do.

Two things here are not optional.

Layout features are preserved with --layout-features='*'. Malayalam conjuncts and
chillu forms, and Tamil ligatures, are produced by the GSUB and GPOS tables. Drop
them and the text renders as a string of dotted circles and disconnected marks,
which looks like a broken font rather than a missing feature.

The zero-width joiner and non-joiner are kept explicitly. They are invisible, so
they never appear in a character census taken from the translations, and Malayalam
depends on them to select chillu versus conjunct forms.

Usage, from the repo root:
    /tmp/fontvenv/bin/python tools/subset-fonts.py --sources DIR
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
I18N = REPO / "web" / "src" / "i18n"
OUT = REPO / "web" / "src" / "assets" / "fonts"

# Invisible or structural characters a census of the translations cannot see.
ALWAYS = (
    "‌‍"  # ZWNJ, ZWJ: Malayalam chillu and conjunct selection
    "।॥"  # Devanagari danda, used as punctuation across Indic scripts
    "0123456789"  # digits stay Latin in every language, so the font must have them
    " .,:;!?-–—/()[]{}'\"°%&+*#@_<>=|~^$–—… "
)

SCRIPTS = {
    "malayalam": {"catalogue": "ml.ts", "block": (0x0D00, 0x0D7F)},
    "tamil": {"catalogue": "ta.ts", "block": (0x0B80, 0x0BFF)},
}


def characters_in(path: Path) -> set[str]:
    """Every character inside a string literal in a TypeScript catalogue."""
    source = path.read_text(encoding="utf-8")
    # Strip comments so prose in them does not inflate the subset.
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    source = re.sub(r"^\s*//.*$", "", source, flags=re.M)
    literals = re.findall(r"'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`", source)
    text = "".join(a or b for a, b in literals)
    return set(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True, help="directory holding the downloaded woff2 files")
    args = parser.parse_args()

    try:
        from fontTools import subset
    except ImportError:
        print("fontTools is not installed. See the module docstring.", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    total_before = total_after = 0

    for name, spec in SCRIPTS.items():
        source = args.sources / f"{name}-400-INDIC.woff2"
        if not source.exists():
            print(f"missing {source}; run tools/fetch-fonts.py first", file=sys.stderr)
            return 2

        wanted = characters_in(I18N / str(spec["catalogue"])) | set(ALWAYS)
        # Keep the whole script block, not only the characters used today. It costs
        # little, and it means a place name or a new string does not silently render
        # as a blank box until someone remembers to re-run this.
        low, high = spec["block"]  # type: ignore[misc]
        wanted |= {chr(c) for c in range(low, high + 1)}

        destination = OUT / f"NotoSans{name.capitalize()}-subset.woff2"
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]  # see the module docstring: not optional
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.notdef_outline = True
        options.recalc_bounds = True
        options.drop_tables = []
        options.passthrough_tables = False

        font = subset.load_font(str(source), options)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text="".join(sorted(wanted)))
        subsetter.subset(font)
        subset.save_font(font, str(destination), options)
        font.close()

        before = source.stat().st_size
        after = destination.stat().st_size
        total_before += before
        total_after += after
        print(f"{destination.name:34} {before:6} -> {after:6} bytes  ({len(wanted)} codepoints)")

    print(f"{'total':34} {total_before:6} -> {total_after:6} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
