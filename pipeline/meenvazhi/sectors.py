"""The INCOIS sector registry.

All fourteen identifiers were read off the sector dropdown on the live page, so
this table is complete rather than inferred.

Each sector also carries a two-letter code used to build GPX waypoint names.
Those codes are load-bearing: consumer GPS units truncate waypoint names to six
characters and then silently deduplicate the collisions, so a two-letter code plus
a two-digit index keeps every name short, unique and unambiguous. Note that the
two Tamil Nadu and two Andhra Pradesh sectors get distinct codes for exactly that
reason -- both mapping to "TN" would merge waypoints hundreds of miles apart.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Sector:
    sector_id: str
    name: str
    code: str


SECTORS: tuple[Sector, ...] = (
    Sector("SEC001", "GUJARAT", "GJ"),
    Sector("SEC002", "MAHARASHTRA", "MH"),
    Sector("SEC003", "GOA", "GA"),
    Sector("SEC004", "KARNATAKA", "KA"),
    Sector("SEC005", "KERALA", "KL"),
    Sector("SEC006", "SOUTH TAMILNADU", "TS"),
    Sector("SEC007", "NORTH TAMILNADU", "TN"),
    Sector("SEC008", "SOUTH ANDHRA PRADESH", "AS"),
    Sector("SEC009", "NORTH ANDHRA PRADESH", "AN"),
    Sector("SEC010", "ODISHA", "OD"),
    Sector("SEC011", "WEST BENGAL", "WB"),
    Sector("SEC012", "ANDAMAN", "AM"),
    Sector("SEC013", "NICOBAR", "NC"),
    Sector("SEC014", "LAKSHADWEEP", "LD"),
)

SECTOR_BY_ID = {s.sector_id: s for s in SECTORS}


def get_sector(sector_id: str) -> Sector:
    try:
        return SECTOR_BY_ID[sector_id.strip().upper()]
    except KeyError:
        known = ", ".join(SECTOR_BY_ID)
        raise ValueError(f"unknown sector id {sector_id!r}; known ids are {known}") from None
