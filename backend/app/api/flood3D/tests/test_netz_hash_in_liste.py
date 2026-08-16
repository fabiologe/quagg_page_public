"""
Die Netz-Identitaet muss in der Laufliste stehen.

Grund: die Laubkarten verschneiden ZWEI Laeufe Zelle fuer Zelle (Ablagerung
aus dem Leerlauf, Spuelwirkung aus dem Schwall). Passen die Netze nicht
zusammen, entsteht kein Fehler — sondern ein plausibel aussehendes Bild von
zwei verschiedenen Orten. Das Panel kann unpassende Paare nur dann gar
nicht erst anbieten, wenn es den `netz_hash` schon aus der Liste kennt.
"""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..router import router
from .synthetic_case import build_spec_stage3


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), tmp_path / "runs"


def _lauf(runs, name, manifest):
    d = runs / name
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps(manifest))


def test_liste_traegt_den_netz_hash(client):
    c, runs = client
    _lauf(runs, "demo_r001", {"status": "completed",
                              "netz": {"cells": 1234, "netz_hash": "abc123"}})
    # Altlauf ohne Netzblock: null statt Fehler — das Panel macht daraus
    # "Netz unbekannt" und laesst ihn NICHT stillschweigend zu.
    _lauf(runs, "demo_r002", {"status": "completed"})

    liste = {r["run_id"]: r for r in c.get("/runs").json()}

    assert liste["demo_r001"]["netz_hash"] == "abc123"
    assert liste["demo_r002"]["netz_hash"] is None
