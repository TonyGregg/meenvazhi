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
    # Approximate positions of each fishing harbour, grouped by state in the same
    # order as the areas. A few hundred metres of error is immaterial for zones
    # tens of miles out; the area view uses INCOIS's own bearing from the coast.
    Port("colachel", "Colachel", "Tamil Nadu", "west", 8.1747, 77.2513),
    Port("chinnamuttom", "Chinnamuttom (Kanniyakumari)", "Tamil Nadu", "east", 8.0975, 77.5642),
    Port("tuticorin", "Tuticorin (Thoothukudi)", "Tamil Nadu", "east", 8.8000, 78.1580),
    Port("rameswaram", "Rameswaram", "Tamil Nadu", "east", 9.2876, 79.3129),
    Port("nagapattinam", "Nagapattinam", "Tamil Nadu", "east", 10.7667, 79.8433),
    Port("cuddalore", "Cuddalore", "Tamil Nadu", "east", 11.7208, 79.7797),
    Port("chennai", "Chennai (Kasimedu)", "Tamil Nadu", "east", 13.1167, 80.2967),
    Port("vizhinjam", "Vizhinjam", "Kerala", "west", 8.3790, 76.9900),
    Port("neendakara", "Neendakara", "Kerala", "west", 8.9383, 76.5392),
    Port("kochi", "Kochi (Cochin Fisheries Harbour)", "Kerala", "west", 9.9370, 76.2610),
    Port("munambam", "Munambam", "Kerala", "west", 10.1780, 76.1700),
    Port("beypore", "Beypore", "Kerala", "west", 11.1700, 75.8060),
    Port("mangalore", "Mangalore", "Karnataka", "west", 12.8450, 74.8280),
    Port("malpe", "Malpe", "Karnataka", "west", 13.3500, 74.7040),
    Port("karwar", "Karwar (Baithkol)", "Karnataka", "west", 14.8050, 74.1170),
    Port("cutbona", "Cutbona", "Goa", "west", 15.1640, 73.9440),
    Port("malim", "Panaji (Malim)", "Goa", "west", 15.5020, 73.8230),
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
