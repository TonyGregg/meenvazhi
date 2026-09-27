"""Home ports a user can compute bearings from.

Ported from fish_websbite/src/data/harbours.ts, keeping its slug, name, state and
coast field names so the two files stay recognisably siblings. Coordinates are new:
that file had none.

The default is Cochin Fisheries Harbour at Thoppumpady rather than the city centre,
because that is where the deep-sea boats actually cast off from, and a bearing is
only as good as the point it starts from.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Coast = Literal["west", "east"]


@dataclass(frozen=True, slots=True)
class Port:
    slug: str
    name: str
    state: str
    coast: Coast
    lat: float
    lon: float


PORTS: tuple[Port, ...] = (
    Port("kochi", "Kochi (Cochin Fisheries Harbour)", "Kerala", "west", 9.9370, 76.2610),
    Port("munambam", "Munambam", "Kerala", "west", 10.1780, 76.1700),
    Port("beypore", "Beypore", "Kerala", "west", 11.1700, 75.8060),
    Port("vizhinjam", "Vizhinjam", "Kerala", "west", 8.3790, 76.9900),
    Port("malpe", "Malpe", "Karnataka", "west", 13.3500, 74.7040),
    Port("mangalore", "Mangalore", "Karnataka", "west", 12.8450, 74.8280),
    Port("tuticorin", "Tuticorin (Thoothukudi)", "Tamil Nadu", "east", 8.7500, 78.2000),
)

PORT_BY_SLUG = {p.slug: p for p in PORTS}

DEFAULT_PORT_SLUG = "kochi"

# India's statutory monsoon fishing ban, carried over from harbours.ts. Mechanised
# vessels stop entirely for the window: this is law, not weather. Dates are set
# annually by each maritime state and shift by a few days, so the app presents this
# as guidance to confirm rather than as an authority.
BAN_WINDOW: dict[Coast, str] = {
    "west": "1 June to 31 July (Kerala, Karnataka, Goa, Maharashtra, Gujarat)",
    "east": "15 April to 14 June (Tamil Nadu, Andhra Pradesh, Odisha, West Bengal)",
}

COAST_LABELS: dict[Coast, str] = {
    "west": "West coast (Arabian Sea)",
    "east": "East coast (Bay of Bengal)",
}


def get_port(slug: str) -> Port:
    try:
        return PORT_BY_SLUG[slug]
    except KeyError:
        known = ", ".join(sorted(PORT_BY_SLUG))
        raise ValueError(f"unknown home port {slug!r}; known ports are {known}") from None
