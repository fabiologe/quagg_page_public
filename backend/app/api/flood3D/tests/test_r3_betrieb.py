"""
Tests R3 (Betriebssicherheit): Lauf-Abbruch, verfallene Companion-
Reservierungen, Entwurfs-Körper-Cache.
"""
from __future__ import annotations

import json
import time

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


# ---- Lauf-Abbruch (H3) ----------------------------------------------------

def test_abbruch_eines_verwaisten_laufs(client):
    """Kein Thread, kein Container (API-Neustart-Fall): der Status wird
    direkt ehrlich gemacht statt ewig `building` zu bleiben."""
    c, runs = client
    d = runs / "demo_r001"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps(
        {"run_id": "demo_r001", "status": "building"}))
    r = c.post("/runs/demo_r001/abort")
    assert r.status_code == 200
    m = json.loads((d / "manifest.json").read_text())
    assert m["status"] == "abgebrochen"
    assert not (d / "ABBRUCH").exists()


def test_abbruch_beendeter_lauf_409(client):
    c, runs = client
    d = runs / "demo_r002"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({"status": "completed"}))
    assert c.post("/runs/demo_r002/abort").status_code == 409


def test_abbruch_unbekannter_lauf_404(client):
    c, _ = client
    assert c.post("/runs/gibtsnicht_r001/abort").status_code == 404


def test_abgebrochen_ist_terminal(client):
    """Ein abgebrochener Lauf wird nicht als „hängt?" gepollt/markiert."""
    c, runs = client
    d = runs / "demo_r003"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps(
        {"status": "abgebrochen", "title": "x"}))
    eintrag = next(r for r in c.get("/runs").json()
                   if r["run_id"] == "demo_r003")
    assert eintrag["status"] == "abgebrochen"
    assert eintrag["stale"] is False


# ---- Verfallene Companion-Reservierungen (H5) -----------------------------

def test_alte_lokal_reservierung_ist_verfallen(client):
    c, runs = client
    for name, alter_s in (("demo_r010", 8 * 86400), ("demo_r011", 3600)):
        d = runs / name
        d.mkdir(parents=True)
        (d / "manifest.json").write_text(json.dumps(
            {"status": "lokal", "origin": "companion",
             "created": time.time() - alter_s}))
    liste = {r["run_id"]: r for r in c.get("/runs").json()}
    assert liste["demo_r010"]["verfallen"] is True
    assert liste["demo_r011"]["verfallen"] is False


# ---- Entwurfs-Körper-Cache ------------------------------------------------

def test_draft_cache_liefert_identische_und_frische_koerper(client):
    """Zweiter Entwurf: unveränderte Bauteile kommen aus dem Cache
    (bitidentisch), das geänderte wird neu gebaut."""
    c, _ = client
    spec = c.get("/cases/demo").json()

    r1 = {s["patch"]: s["stl_b64"]
          for s in c.post("/cases/demo/preview", json=spec).json()["solids"]}
    r2 = {s["patch"]: s["stl_b64"]
          for s in c.post("/cases/demo/preview", json=spec).json()["solids"]}
    assert r1.keys() == r2.keys() and len(r1) >= 3
    assert r1 == r2                       # Cache-Treffer sind bitidentisch

    # Wand verschieben: NUR ihr Körper ändert sich
    wand = next(s for s in spec["structures"] if s["id"] == "wand_becken")
    for p in wand["alignment"]["points"]:
        p[0] += 1.0
    r3 = {s["patch"]: s["stl_b64"]
          for s in c.post("/cases/demo/preview", json=spec).json()["solids"]}
    assert r3["wand_becken"] != r1["wand_becken"]
    for patch in r1:
        if patch != "wand_becken":
            assert r3[patch] == r1[patch], f"{patch} wurde unnötig neu gebaut"
