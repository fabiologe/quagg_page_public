"""Testrahmen des Projektmoduls — teilt DB-Fixtures und Sperren mit dem
Pedanten (dieselbe Test-DB, frische_db migriert beide Module)."""

import os

os.environ["PROJEKTE_ROOT"] = "/projekt-testsperre-nicht-vorhanden"

import pytest  # noqa: E402

from app.api.pedant.tests.conftest import (  # noqa: E402,F401 — Fixtures re-exportiert
    app_conn, beleg_wurzel, frische_db, migrate_conn,
)
from app.api.projekt.core import ordner  # noqa: E402


@pytest.fixture()
def projekte_wurzel(tmp_path, monkeypatch):
    """Wegwerf-1_Projekte mit allen Phasenordnern."""
    w = tmp_path / "1_Projekte"
    w.mkdir()
    for phase in ordner.PHASEN:
        (w / phase).mkdir()
    monkeypatch.setenv("PROJEKTE_ROOT", str(w))
    return w
