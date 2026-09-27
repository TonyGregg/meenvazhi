"""GPX 1.1 waypoint output, shaped around what real GPS units do.

The constraints below are not style preferences, they are what stops a file from
quietly corrupting itself on the hardware it is meant for.

Waypoint names are capped at six uppercase ASCII alphanumerics. Older Garmin
marine and handheld units, and many Lowrance and Simrad units, truncate longer
names to six characters and then silently deduplicate the collisions. That is how
two waypoints two hundred miles apart end up sharing one entry. A two-letter
sector code plus a two-digit index stays inside the limit with room to spare.

No Malayalam or Tamil appears anywhere in the file. Most units are Latin-1 or
CP437 internally and respond to multi-byte text with mojibake or an outright
rejected import. The app carries the Indic text; the GPX does not.

Comments are kept to forty characters, which is roughly what a unit shows on its
waypoint detail line. The longer description goes in <desc>, which units that
cannot use it simply ignore.
"""

from __future__ import annotations

import re
from typing import Any
from xml.sax.saxutils import escape

GPX_NS = "http://www.topografix.com/GPX/1/1"
MAX_NAME_LENGTH = 6
MAX_COMMENT_LENGTH = 40

_NAME_RE = re.compile(r"^[A-Z0-9]{1,6}$")


class GpxError(Exception):
    """A waypoint would not survive the trip into a consumer GPS unit."""


def _ascii_only(text: str) -> str:
    """Strip anything a Latin-1 unit cannot render, and collapse whitespace."""
    cleaned = text.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", cleaned).strip()


def validate_name(name: str) -> str:
    if not _NAME_RE.match(name):
        raise GpxError(
            f"waypoint name {name!r} must be 1 to {MAX_NAME_LENGTH} uppercase ASCII "
            "alphanumerics; longer names are truncated and merged by real GPS units"
        )
    return name


def _waypoint_xml(zone: dict[str, Any], sector_name: str, valid_until: str | None, stamp: str) -> list[str]:
    name = validate_name(zone["gpx_name"])
    home = zone["from_home"]
    depth = zone["depth_m"]

    centre = _ascii_only(zone["landing_centre"])
    comment = _ascii_only(
        f"{centre} {home['distance_nmi']:.0f}nmi {home['bearing_deg']:.0f}T d{depth['from']}-{depth['to']}m"
    )[:MAX_COMMENT_LENGTH]

    description = _ascii_only(
        f"{sector_name} / {centre}. "
        f"{home['distance_nmi']:.1f} nmi at {home['bearing_deg']:.0f} deg true from home port. "
        f"Depth {depth['from']}-{depth['to']} m." + (f" Valid until {valid_until}." if valid_until else "")
    )

    return [
        f'  <wpt lat="{zone["lat"]:.6f}" lon="{zone["lon"]:.6f}">',
        f"    <time>{stamp}</time>",
        f"    <name>{escape(name)}</name>",
        f"    <cmt>{escape(comment)}</cmt>",
        f"    <desc>{escape(description)}</desc>",
        "    <sym>Fish</sym>",
        "    <type>PFZ</type>",
        "  </wpt>",
    ]


def build_gpx(document: dict[str, Any], *, reachable_only: bool = False) -> str:
    """Render a document as GPX 1.1.

    Returns text with newline endings and no byte-order mark: some units choke on
    a BOM and refuse the whole file.
    """
    stamp = document["generated_at"]
    valid_until = document.get("valid_until")
    advisory_date = document.get("advisory_date") or "unknown date"
    creator = f"{document['generator']} (+https://github.com/antonygenil/meenvazhi)"

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<gpx version="1.1" creator="{escape(creator)}"',
        f'     xmlns="{GPX_NS}"',
        '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        f'     xsi:schemaLocation="{GPX_NS} {GPX_NS}/gpx.xsd">',
        "  <metadata>",
        f"    <name>Meenvazhi PFZ {escape(advisory_date)}</name>",
        f"    <desc>{escape(_ascii_only(_metadata_desc(document)))}</desc>",
        f"    <time>{stamp}</time>",
        "  </metadata>",
    ]

    seen: set[str] = set()
    for sector in document["sectors"]:
        for zone in sector["zones"]:
            if reachable_only and not zone["from_home"]["reachable"]:
                continue
            name = zone["gpx_name"]
            if name in seen:
                raise GpxError(f"duplicate waypoint name {name!r}: a GPS unit would merge these")
            seen.add(name)
            lines.extend(_waypoint_xml(zone, sector["sector_name"], valid_until, stamp))

    lines.append("</gpx>")
    return "\n".join(lines) + "\n"


def _metadata_desc(document: dict[str, Any]) -> str:
    valid = document.get("valid_until")
    parts = ["INCOIS Potential Fishing Zone advisory"]
    if valid:
        parts.append(f"valid until {valid}")
    parts.append(document["disclaimer"])
    parts.append(document["source"]["credit"])
    # Join on ". " without doubling the periods the parts already carry.
    return ". ".join(part.rstrip(".") for part in parts)
