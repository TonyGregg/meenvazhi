"""Configuration loading. Shape copied from bloom/tracker/config.py."""

import os
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.environ.get("MEENVAZHI_CONFIG", ROOT / "config.yaml"))

_cache: dict[str, Any] | None = None


def load(force: bool = False) -> dict[str, Any]:
    global _cache
    if _cache is None or force:
        with CONFIG_PATH.open(encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"{CONFIG_PATH}: expected a mapping at the top level")
        _cache = loaded
    return _cache


def app() -> dict[str, Any]:
    return load().get("app") or {}


def incois() -> dict[str, Any]:
    return load().get("incois") or {}


def output() -> dict[str, Any]:
    return load().get("output") or {}


def get_key(name: str) -> str | None:
    """Secret from the environment first, then config.keys.

    Unused today (INCOIS needs no credential) but kept so that adding a keyed
    source later does not invent a second convention.
    """
    v = os.environ.get(name)
    if v:
        return v.strip()
    raw = (load().get("keys") or {}).get(name)
    return str(raw).strip() if raw else None


def resolve_path(value: str | os.PathLike[str]) -> Path:
    """Resolve a config path relative to the pipeline root, not the caller's cwd."""
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


def out_dir() -> Path:
    return resolve_path(app().get("out_dir", "../public-data"))


def sectors() -> list[str]:
    raw = incois().get("sectors") or []
    if not raw:
        raise ValueError(f"{CONFIG_PATH}: incois.sectors is empty; nothing to fetch")
    return [str(s).strip().upper() for s in raw]
