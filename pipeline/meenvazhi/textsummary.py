"""A plain-text digest of the advisory.

Thirty lines of code for the thing that actually gets used: something short enough
to send the crew over WhatsApp from the harbour, or read out over VHF to a boat
that has no smartphone at all.
"""

from __future__ import annotations

from typing import Any

from .model import SectorStatus


def build_text(document: dict[str, Any], *, reachable_only: bool = True) -> str:
    lines = [
        f"MEENVAZHI PFZ {document.get('advisory_date') or 'unknown date'}",
        f"Valid until: {document.get('valid_until') or 'not stated'}",
        f"From: {document['home_port']['name']}",
        "",
    ]

    for sector in document["sectors"]:
        if sector["status"] == SectorStatus.NO_ADVISORY:
            lines.append(f"{sector['sector_name']}: no advisory ({sector['reason']})")
            continue

        shown = [z for z in sector["zones"] if z["from_home"]["reachable"] or not reachable_only]
        if not shown:
            in_range = document["reachable_nmi"]
            lines.append(f"{sector['sector_name']}: {sector['zone_count']} zones, none within {in_range:.0f} nmi")
            continue

        lines.append(f"{sector['sector_name']}: {len(shown)} zone(s)")
        for zone in shown:
            home = zone["from_home"]
            depth = zone["depth_m"]
            lines.append(
                f"  {zone['gpx_name']} {home['distance_nmi']:.0f}nmi "
                f"{home['bearing_deg']:.0f}T depth {depth['from']}-{depth['to']}m "
                f"({zone['lat_dms']} {zone['lon_dms']})"
            )

    lines += ["", document["disclaimer"], document["source"]["credit"], ""]
    return "\n".join(lines)
