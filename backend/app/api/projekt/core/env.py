"""Schlanker .env-Leser fuer das Projektmodul (Kopie des Musters flood2D/env_util,
OHNE den Umweg ueber das flood2D-Paket: dessen __init__ zieht den FastAPI-Router,
und der MCP-Server laeuft in einem venv ohne fastapi). PM2 exportiert backend/.env
nicht in den Prozess — deshalb wird die Datei bei Bedarf selbst gelesen."""

import os
from pathlib import Path

_ENV_DATEI = Path(__file__).resolve().parents[4] / ".env"   # backend/.env
_cache: dict[str, str] | None = None


def _datei() -> dict[str, str]:
    global _cache
    if _cache is None:
        _cache = {}
        if _ENV_DATEI.exists():
            for zeile in _ENV_DATEI.read_text(encoding="utf-8", errors="replace").splitlines():
                zeile = zeile.strip()
                if zeile and not zeile.startswith("#") and "=" in zeile:
                    k, v = zeile.split("=", 1)
                    _cache[k.strip()] = v.strip().strip('"').strip("'")
    return _cache


def env(key: str, default: str = "") -> str:
    """os.environ hat Vorrang (ein leerer String ist eine gesetzte Sperre)."""
    if key in os.environ:
        return os.environ[key]
    return _datei().get(key, default)
