"""Core value types shared by the parser, the builder and the writers.

Everything here is frozen and slotted. These objects are the provenance record
of what INCOIS actually said on a given day, so they are never mutated in place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

# INCOIS reports zone directions using 8- and 16-point compass abbreviations.
VALID_DIRECTIONS = frozenset(
    {
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
    }
)

_RANGE_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


class SectorStatus(StrEnum):
    """The three genuinely distinct outcomes of requesting one sector page.

    Keeping FETCH_FAILED distinct from NO_ADVISORY is the single most important
    correctness property in this project. A sessionless request to INCOIS returns
    HTTP 200 with an empty page shell that is indistinguishable from a genuine
    "no fish today" unless the body marker is checked. Collapsing the two would
    silently report no advisory every day, forever, without ever failing a build.
    """

    HAS_ADVISORY = "HAS_ADVISORY"
    NO_ADVISORY = "NO_ADVISORY"
    FETCH_FAILED = "FETCH_FAILED"


class ParseError(Exception):
    """The page was retrieved but could not be understood."""


class FetchFailed(ParseError):
    """The page is not a usable sector page at all.

    Raised for a broken session, an unrecognised page shape, or a redesign.
    Never raised for a legitimately empty (cloud-covered) sector: that is data,
    and it is reported as NO_ADVISORY.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class SectorMismatch(ParseError):
    """The page names a different sector than the one we asked for.

    Signals a stale or crossed session. Treated as a hard failure rather than
    quietly filing another sector's zones under the requested name.
    """


@dataclass(frozen=True, slots=True)
class Range:
    """An inclusive from-to range, as INCOIS publishes distances and depths.

    Kept as a range rather than collapsed to a midpoint: the band is the useful
    information. A zone spanning 105-110 m of depth tells a fisherman which gear
    to shoot; "107.5" tells him nothing he can act on and implies a precision
    the source never claimed.
    """

    frm: int
    to: int

    @classmethod
    def parse(cls, raw: str) -> Range:
        m = _RANGE_RE.match(raw)
        if not m:
            raise ParseError(f"expected a 'from-to' integer range, got {raw!r}")
        frm, to = int(m.group(1)), int(m.group(2))
        if to < frm:
            raise ParseError(f"range {raw!r} runs backwards")
        return cls(frm=frm, to=to)

    def as_dict(self) -> dict[str, int]:
        return {"from": self.frm, "to": self.to}

    def __str__(self) -> str:
        return f"{self.frm}-{self.to}"


@dataclass(frozen=True, slots=True)
class RawRow:
    """One advisory row, exactly as published.

    bearing_deg and distance_km are INCOIS's own, measured FROM THE NAMED LOCAL
    LANDING CENTRE, not from the user's home port. They are kept under this
    deliberately awkward name, and namespaced again in the output JSON, because
    mistaking them for a bearing from home is a 60-degree steering error.

    The DMS strings are preserved verbatim. They are the provenance record, and
    they are also what a GPS unit's manual-entry screen asks for.
    """

    landing_centre: str
    direction: str
    bearing_deg: int
    distance_km: Range
    depth_m: Range
    lat_dms: str
    lon_dms: str


@dataclass(frozen=True, slots=True)
class SectorPage:
    """The parsed result of one sector request."""

    sector_id: str
    sector_name: str
    status: SectorStatus
    rows: tuple[RawRow, ...] = ()
    reason: str | None = None
    valid_until: date | None = None
    incois_updated_at: datetime | None = None

    @property
    def zone_count(self) -> int:
        return len(self.rows)
