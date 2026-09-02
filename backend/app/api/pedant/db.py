"""Verbindungsschicht des Pedanten — eigenstaendig, bewusst OHNE Bezug zu
app/db/database.py (dort lebt die SQLite/SQLModel-Welt der uebrigen App).

Zwei Rollen, vier URLs in backend/.env:
  PEDANT_DB_URL / PEDANT_DB_URL_TEST            — pedant_app (nur INSERT+SELECT)
  PEDANT_MIGRATE_URL / PEDANT_MIGRATE_URL_TEST  — pedant_migrate (DDL, nur cli.py)
PEDANT_ZIEL ('prod' | 'test', Default 'prod') waehlt, welche Datenbank die
laufende API bedient — gleicher Code, nur eine Umgebungsvariable (FAHRPLAN 14).

Gelesen wird ueber env_util, weil PM2 die .env nicht in den Prozess exportiert —
dasselbe Muster wie flood2D/flood3D. Pool klein (max 4): die PM2-cgroup laeuft
mit LimitNOFILE=100, jede Verbindung kostet Dateideskriptoren.
"""

import psycopg
from psycopg_pool import ConnectionPool

from app.api.flood2D.env_util import env

_URL_SCHLUESSEL = {
    ("app", "prod"): "PEDANT_DB_URL",
    ("app", "test"): "PEDANT_DB_URL_TEST",
    ("migrate", "prod"): "PEDANT_MIGRATE_URL",
    ("migrate", "test"): "PEDANT_MIGRATE_URL_TEST",
}

_pools: dict[str, ConnectionPool] = {}


def aktives_ziel() -> str:
    ziel = env("PEDANT_ZIEL", "prod").strip() or "prod"
    if ziel not in ("prod", "test"):
        raise RuntimeError(f"PEDANT_ZIEL muss 'prod' oder 'test' sein, nicht {ziel!r}")
    return ziel


def db_url(ziel: str, rolle: str = "app") -> str:
    schluessel = _URL_SCHLUESSEL[(rolle, ziel)]
    url = env(schluessel, "")
    if not url:
        raise RuntimeError(f"{schluessel} ist nicht gesetzt (backend/.env)")
    return url


def pool(ziel: str | None = None) -> ConnectionPool:
    """App-Rollen-Pool je Ziel; entsteht beim ersten Zugriff, min_size=0 haelt
    den Leerlauf-Fussabdruck bei null Verbindungen."""
    ziel = ziel or aktives_ziel()
    if ziel not in _pools:
        _pools[ziel] = ConnectionPool(
            db_url(ziel, "app"), min_size=0, max_size=4,
            name=f"pedant-{ziel}", open=True,
        )
    return _pools[ziel]


def migrate_verbindung(ziel: str) -> psycopg.Connection:
    """Einzelverbindung als pedant_migrate — nur fuer cli.py."""
    return psycopg.connect(db_url(ziel, "migrate"))
