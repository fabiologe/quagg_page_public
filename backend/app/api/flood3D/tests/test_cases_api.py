"""
API-Tests Stufe 4: Fallverwaltung, Geländefeld, Vorschaugeometrie,
Validierung und Profilschnitt.
"""
from __future__ import annotations

import base64

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..router import router
from .synthetic_case import build_spec_stage3


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("cases")
    mp.setenv("FLOOD3D_CASES_ROOT", str(root))
    (root / "demo").mkdir()
    build_spec_stage3().to_yaml(root / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    mp.undo()


def test_liste_und_anlegen(client):
    cases = client.get("/cases").json()
    assert [c["id"] for c in cases] == ["demo"]

    r = client.post("/cases", json={"id": "neu-1", "title": "Neues Becken"})
    assert r.status_code == 200
    cases = client.get("/cases").json()
    assert {c["id"] for c in cases} == {"demo", "neu-1"}
    assert client.post("/cases", json={"id": "neu-1"}).status_code == 409
    assert client.post("/cases", json={"id": "../boese"}).status_code == 422


def test_lesen_und_speichern_mit_validierung(client):
    spec = client.get("/cases/demo").json()
    assert spec["meta"]["id"] == "test-stufe3"
    assert len(spec["structures"]) == 5

    r = client.put("/cases/demo", json=spec).json()
    assert r["ok"] is True
    assert isinstance(r["validation"], list)

    kaputt = dict(spec)
    kaputt["solver"] = {**spec["solver"], "max_co": "quatsch"}
    assert client.put("/cases/demo", json=kaputt).status_code == 422


def test_schema(client):
    schema = client.get("/cases/demo/schema").json()
    assert "structures" in schema["properties"]


def test_terrain_feld(client):
    t = client.get("/cases/demo/terrain").json()
    ny, nx = t["dims"]
    z = np.frombuffer(base64.b64decode(t["z_b64"]), dtype="<f4").reshape(ny, nx)
    assert (nx, ny) == (49, 37)          # 24 x 18 m bei 0.5 m Knotenraster
    assert z[0, 0] == pytest.approx(96.0)         # ungestörte Ecke
    j, i = int(round(9 / 0.5)), int(round(12 / 0.5))
    assert z[j, i] == pytest.approx(94.7, abs=0.05)  # Gerinnesohle


def test_solids_vorschau(client):
    data = client.get("/cases/demo/solids").json()
    patches = {s["patch"] for s in data["solids"]}
    # inkl. Rechenstäbe — nur in der Vorschau, der Solver sieht die poröse Zone
    assert patches == {"wand_becken", "becken_1", "dl_1", "pfeiler_1", "rechen_1"}
    stl = base64.b64decode(data["solids"][0]["stl_b64"])
    assert len(stl) > 200                # binäres STL mit Inhalt


def test_validierung_liefert_befunde(client):
    findings = client.get("/cases/demo/validate").json()
    assert all({"object_id", "severity", "message"} <= set(f) for f in findings)
    # Demo-Fall: Pegel liegt auf Gelände über dem Anfangswasserspiegel
    assert any(f["object_id"] == "pegel_becken" and f["severity"] == "warnung"
               for f in findings)
    assert not any(f["severity"] == "fehler" for f in findings)


def test_validierung_meldet_zu_grobe_zelle(client):
    spec = client.get("/cases/demo").json()
    spec["structures"][0]["thickness"] = 0.2   # Wand 0.2 m bei 0.5-m-Zelle...
    spec["mesh"]["refinements"] = [r for r in spec["mesh"]["refinements"]
                                   if r.get("target") != "wand_becken"]
    r = client.put("/cases/demo", json=spec).json()
    assert any("nicht aufgelöst" in f["message"] for f in r["validation"])
    # Ursprungszustand wiederherstellen
    spec["structures"][0]["thickness"] = 0.5
    spec["mesh"]["refinements"] = build_spec_stage3().model_dump(
        mode="json")["mesh"]["refinements"]
    client.put("/cases/demo", json=spec)


def test_profil(client):
    r = client.post("/cases/demo/profile",
                    json={"polyline": [[12, 2], [12, 16]], "samples": 100}).json()
    ground = np.asarray(r["ground"])
    assert len(ground) == 100
    assert ground.min() == pytest.approx(94.7, abs=0.05)   # Gerinne
    assert ground.max() == pytest.approx(96.0, abs=0.05)   # Umgebung
    assert r["initial_level"] == pytest.approx(94.9)
