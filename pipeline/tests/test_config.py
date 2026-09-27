"""Configuration loading, the sector registry and the port table."""

from __future__ import annotations

from pathlib import Path

import pytest

from meenvazhi import config
from meenvazhi.gpx import MAX_NAME_LENGTH
from meenvazhi.ports import BAN_WINDOW, COAST_LABELS, DEFAULT_PORT_SLUG, PORTS, get_port
from meenvazhi.sectors import SECTORS, get_sector


@pytest.fixture
def custom_config(tmp_path: Path, monkeypatch):
    def write(text: str) -> Path:
        path = tmp_path / "config.yaml"
        path.write_text(text, encoding="utf-8")
        monkeypatch.setattr(config, "CONFIG_PATH", path)
        # Invalidate rather than load: a test may be asserting that loading fails.
        monkeypatch.setattr(config, "_cache", None)
        return path

    yield write
    monkeypatch.undo()
    config.load(force=True)


def test_shipped_config_is_usable() -> None:
    config.load(force=True)
    assert config.sectors()
    assert config.app()["user_agent"].startswith("Meenvazhi/")
    assert config.output()["home_port"] in {p.slug for p in PORTS}


def test_user_agent_is_identifiable() -> None:
    """A government service should be able to see who is calling and why."""
    agent = config.app()["user_agent"]
    assert agent.startswith("Meenvazhi/")
    assert "+http" in agent, "the User-Agent should carry a contact URL"


def test_polite_interval_is_not_aggressive() -> None:
    assert float(config.app()["per_host_min_interval"]) >= 1.0


def test_configured_sectors_are_all_real(custom_config) -> None:
    for sector_id in config.sectors():
        assert get_sector(sector_id)


def test_sectors_are_uppercased_and_stripped(custom_config) -> None:
    custom_config("incois:\n  sectors: ['  sec004 ', 'sec005']\n")
    assert config.sectors() == ["SEC004", "SEC005"]


def test_empty_sector_list_is_refused(custom_config) -> None:
    custom_config("incois:\n  sectors: []\n")
    with pytest.raises(ValueError, match="empty"):
        config.sectors()


def test_non_mapping_config_is_refused(custom_config) -> None:
    custom_config("- just\n- a\n- list\n")
    with pytest.raises(ValueError, match="mapping"):
        config.load(force=True)


def test_missing_sections_default_to_empty(custom_config) -> None:
    custom_config("app: {}\n")
    assert config.incois() == {}
    assert config.output() == {}


def test_out_dir_is_resolved_against_the_pipeline_root(custom_config) -> None:
    custom_config("app:\n  out_dir: some-place\n")
    assert config.out_dir() == config.ROOT / "some-place"


def test_absolute_out_dir_is_left_alone(custom_config) -> None:
    custom_config("app:\n  out_dir: /tmp/meenvazhi-out\n")
    assert config.out_dir() == Path("/tmp/meenvazhi-out")


def test_get_key_prefers_the_environment(custom_config, monkeypatch) -> None:
    custom_config("keys:\n  SOME_TOKEN: from-file\n")
    assert config.get_key("SOME_TOKEN") == "from-file"
    monkeypatch.setenv("SOME_TOKEN", "from-env")
    assert config.get_key("SOME_TOKEN") == "from-env"


def test_get_key_returns_none_when_absent(custom_config) -> None:
    custom_config("app: {}\n")
    assert config.get_key("NOT_SET") is None


def test_all_fourteen_sectors_are_registered() -> None:
    """Read off the live dropdown, so this table is complete rather than inferred."""
    assert len(SECTORS) == 14
    assert {s.sector_id for s in SECTORS} == {f"SEC{n:03d}" for n in range(1, 15)}


def test_sector_codes_are_unique_and_short() -> None:
    """Codes become GPX waypoint prefixes, so a collision merges waypoints on the unit.

    The two Tamil Nadu sectors and the two Andhra Pradesh sectors are the trap:
    naming both of a pair "TN" would merge zones hundreds of miles apart.
    """
    codes = [s.code for s in SECTORS]
    assert len(set(codes)) == len(codes)
    for code in codes:
        assert len(code) == 2
        assert code.isupper() and code.isalpha()


def test_sector_code_plus_index_fits_a_gps_waypoint_name() -> None:
    for sector in SECTORS:
        assert len(f"{sector.code}99") <= MAX_NAME_LENGTH


def test_get_sector_is_case_insensitive() -> None:
    assert get_sector("sec004").name == "KARNATAKA"
    assert get_sector(" SEC004 ").code == "KA"


def test_get_sector_rejects_an_unknown_id() -> None:
    with pytest.raises(ValueError, match="unknown sector id"):
        get_sector("SEC999")


def test_default_port_is_the_kochi_fishing_harbour() -> None:
    """Thoppumpady, not the city centre: bearings start where the boats do."""
    port = get_port(DEFAULT_PORT_SLUG)
    assert port.slug == "kochi"
    assert port.lat == pytest.approx(9.9370, abs=1e-4)
    assert port.lon == pytest.approx(76.2610, abs=1e-4)


def test_ports_have_plausible_indian_coordinates() -> None:
    for port in PORTS:
        assert 8.0 <= port.lat <= 13.5, port.slug
        assert 74.0 <= port.lon <= 79.0, port.slug
        assert port.coast in ("west", "east")


def test_port_slugs_are_unique() -> None:
    slugs = [p.slug for p in PORTS]
    assert len(set(slugs)) == len(slugs)


def test_get_port_rejects_an_unknown_slug() -> None:
    with pytest.raises(ValueError, match="unknown home port"):
        get_port("atlantis")


def test_monsoon_ban_window_is_recorded_for_both_coasts() -> None:
    """A statutory ban, not weather. The app shows it; INCOIS does not mention it."""
    assert "June" in BAN_WINDOW["west"]
    assert "April" in BAN_WINDOW["east"]
    assert set(COAST_LABELS) == {"west", "east"}
