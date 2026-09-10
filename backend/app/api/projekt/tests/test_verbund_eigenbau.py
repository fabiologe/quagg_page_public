"""Der CDE-Eigenbau als Teil des Verbund-Auftrags — was der Server annimmt.

Der Inhalt des Pakets wird im Unterprozess geprueft (app/ifc/eigenbau.py, dann
das Prueftor). Hier geht es nur um die Tuer: was nicht einmal die Form eines
Pakets hat, wird mit 422 abgewiesen, BEVOR ein Laufordner entsteht — sonst
laege fuer jeden kaputten Aufruf ein Ordner in der Ablage des Projekts.
"""
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import cde, ordner, projekte, verbund_lauf
from app.api.projekt.router import router

braucht_werkzeug = pytest.mark.skipif(
    not verbund_lauf.python_pfad().is_file(),
    reason=f"IFC-venv fehlt ({verbund_lauf.python_pfad()}) — Einrichtung: backend/app/ifc/README.md")


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.dependency_overrides[get_current_active_user] = \
        lambda: SimpleNamespace(role="INTERNAL", username="fabio")
    return app


def _projekt(app_conn, dokumente, saetze, dateien=()):
    p = projekte.anlegen(app_conn, name="Eigenbau", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    (o.pfad / cde.ORDNER).mkdir(exist_ok=True)
    for name in dateien:
        (o.pfad / cde.ORDNER / name).write_text("ISO-10303-21;\n", encoding="utf-8")
    cde._manifest_schreiben(o, {"version": 1, "projekt_id": o.id, "dokumente": dokumente, "saetze": saetze})
    return p, o


def _laeufe(o):
    wurzel = o.pfad / cde.ORDNER / verbund_lauf.LAUF_ORDNER
    return sorted(p.name for p in wurzel.iterdir()) if wurzel.is_dir() else []


@braucht_werkzeug
@pytest.mark.parametrize("roh, grund", [(b"kein json", "kein JSON"), (b"[1, 2]", "JSON-Objekt")])
def test_kaputtes_paket_wird_abgewiesen_ohne_laufordner(frische_db, app_conn, projekte_wurzel, roh, grund):
    p, o = _projekt(app_conn, [{"sha256": "a" * 64, "datei": "Kanal.ifc", "basisname": "Kanal",
                                "art": "modell", "revision": 1, "status": "WIP"}],
                    [{"id": "s-1", "name": "Kanal", "enthaelt": ["a" * 64]}], dateien=("Kanal.ifc",))
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": "s-1"},
                   files={"eigenbau": ("eigenbau.json", roh, "application/json")})
    assert r.status_code == 422, r.text
    assert grund in r.json()["detail"]
    assert _laeufe(o) == []


def test_nur_eigenbau_braucht_kein_modell_im_satz(frische_db, app_conn, projekte_wurzel):
    """Ein Satz mit nur einem Plan: ohne Eigenbau abgelehnt, mit Eigenbau der Export des Eigenen."""
    _p, o = _projekt(app_conn, [{"sha256": "b" * 64, "datei": "Lageplan.pdf", "basisname": "Lageplan",
                                 "art": "plan", "revision": 1, "status": "WIP"}],
                     [{"id": "s-1", "name": "Nur Plan", "enthaelt": ["b" * 64]}], dateien=("Lageplan.pdf",))
    with pytest.raises(cde.CdeAbgelehnt, match="kein IFC-Modell"):
        verbund_lauf.auftrag_bauen(o, "s-1")
    auftrag = verbund_lauf.auftrag_bauen(o, "s-1", mit_eigenbau=True)
    assert auftrag["quellen"] == [] and auftrag["uebergangen"] == ["Lageplan.pdf"]
