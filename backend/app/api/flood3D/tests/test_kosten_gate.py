"""
Kosten-Gate: flood-3D steht öffentlich, jeder Lauf kostet Server-Kerne oder
(über RunPod) Geld. Diese Tests halten fest, dass die Sperre auch dann greift,
wenn jemand die Oberfläche umgeht — und dass ein vergessenes Passwort SPERRT
statt zu öffnen.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import gate
from ..router import router
from .synthetic_case import build_spec_stage3

PW = "Testpasswort123"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("FLOOD3D_GATE_OFF", raising=False)   # Gate SCHARF
    monkeypatch.setenv("FLOOD3D_LAUNCH_PASSWORD", PW)
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_lauf_ohne_passwort_wird_abgewiesen(client):
    r = client.post("/runs", json={"case_id": "demo"})
    assert r.status_code == 403
    assert "Passwort" in r.json()["detail"]


def test_lauf_mit_falschem_passwort_wird_abgewiesen(client):
    r = client.post("/runs", json={"case_id": "demo", "launchPassword": "raten"})
    assert r.status_code == 403


def test_richtiges_passwort_kommt_durch(client):
    """
    Danach entscheidet die fachliche Prüfung — nur nicht mehr das Gate.
    (Der synthetische Fall darf am Validierungstor scheitern; 403 waere der
    Fehler, den dieser Test ausschliesst.)
    """
    r = client.post("/runs", json={"case_id": "demo", "launchPassword": PW})
    assert r.status_code != 403
    r2 = client.post("/runs", json={"case_id": "demo"},
                     headers={gate.KOPFZEILE: PW})
    assert r2.status_code != 403


def test_netzvorschau_und_bundle_sind_ebenfalls_gesperrt(client):
    """Beide rechnen bzw. bauen serverseitig — sonst waere das Gate umgehbar."""
    assert client.post("/cases/demo/mesh-preview", json={}).status_code == 403
    assert client.post("/cases/demo/bundle").status_code == 403
    # mit Kopfzeile kommen beide am Gate vorbei
    assert client.post("/cases/demo/bundle",
                       headers={gate.KOPFZEILE: PW}).status_code != 403


def test_lesende_endpunkte_bleiben_offen(client):
    """Das Gate schuetzt die Rechnung, nicht die Ansicht."""
    assert client.get("/cases").status_code == 200
    assert client.get("/cases/demo").status_code == 200


def test_ohne_konfiguriertes_passwort_wird_gesperrt(client, monkeypatch):
    """
    Fail-closed: ein vergessenes Passwort darf nicht in ein offenes
    Scheunentor umschlagen — genau der Fall, der die Rechnung hochtreibt.
    """
    monkeypatch.delenv("FLOOD3D_LAUNCH_PASSWORD", raising=False)
    monkeypatch.setenv("FLOOD2D_LAUNCH_PASSWORD", "")
    monkeypatch.setattr(gate, "env",
                        lambda k, d="": {"FLOOD3D_GATE_OFF": ""}.get(k, ""))
    r = client.post("/runs", json={"case_id": "demo"})
    assert r.status_code == 503
    assert "nicht konfiguriert" in r.json()["detail"]


def test_flood2d_passwort_gilt_als_rueckfall(client, monkeypatch):
    """Beide Werkzeuge teilen sich Publikum und Rechnung."""
    monkeypatch.setattr(gate, "env", lambda k, d="": {
        "FLOOD3D_LAUNCH_PASSWORD": "", "FLOOD2D_LAUNCH_PASSWORD": "Zweidee",
        "FLOOD3D_GATE_OFF": ""}.get(k, d))
    assert gate.launch_passwort() == "Zweidee"
    assert client.post("/runs", json={"case_id": "demo"}).status_code == 403
    assert client.post("/runs", json={"case_id": "demo",
                                      "launchPassword": "Zweidee"}).status_code != 403
