"""Stufe 8: Kundenportal — Freigaben und geldfreie Sicht."""

import sqlite3
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import abschnitte, portal, projekte
from app.api.projekt.router import router
from app.api.projekt.router_portal import router_portal


@pytest.fixture()
def nutzer_db(tmp_path, monkeypatch):
    pfad = tmp_path / "quagg.db"
    c = sqlite3.connect(pfad)
    c.execute("CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT, role TEXT, is_active INTEGER)")
    c.executemany("INSERT INTO user (username, role, is_active) VALUES (?, ?, ?)",
                  [("admin", "INTERNAL", 1), ("kunde", "CLIENT", 1), ("ehemalig", "CLIENT", 0)])
    c.execute("CREATE TABLE email_events (id INTEGER PRIMARY KEY, subject TEXT, sender TEXT, received_at TEXT, project_id INTEGER, body_text TEXT)")
    c.commit(); c.close()
    monkeypatch.setenv("QUAGG_SQLITE_PFAD", str(pfad))
    return pfad


def _app(rolle, name):
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.include_router(router_portal, prefix="/FastAPI/portal")
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(role=rolle, username=name)
    return TestClient(app)


def test_freigaben_und_sicht(frische_db, app_conn, projekte_wurzel, nutzer_db):
    assert [n["username"] for n in portal.portal_nutzer()] == ["kunde"]
    p = projekte.anlegen(app_conn, name="Portal", honorarmodell="hoai", akteur="pytest", phase="01_Laufend")
    pid = p["id"]
    abschnitte.aus_vorlage(app_conn, pid, paragraf="43", honorar_cent=100_000_00, beauftragt=[1, 2, 3], akteur="pytest")
    a = projekte.lesen(app_conn, pid)["abschnitte"]
    abschnitte.aendern(app_conn, pid, a[1]["id"], {"fortschritt_prozent": 50}, akteur="pytest")
    projekte.meilenstein_anlegen(app_conn, pid, art="abgabe", bezeichnung="Entwurf", faellig_am=date.today() + timedelta(days=5), akteur="pytest")
    projekte.meilenstein_anlegen(app_conn, pid, art="bindefrist", bezeichnung="intern", faellig_am=date.today(), akteur="pytest")
    with pytest.raises(portal.PortalAbgelehnt):
        portal.freigeben(app_conn, pid, "ehemalig", akteur="pytest")      # inaktiv
    with pytest.raises(portal.PortalAbgelehnt):
        portal.freigeben(app_conn, pid, "admin", akteur="pytest")         # kein CLIENT
    f = portal.freigeben(app_conn, pid, "kunde", akteur="pytest")
    assert [x["username"] for x in f] == ["kunde"]
    portal.freigeben(app_conn, pid, "kunde", akteur="pytest")             # idempotent
    assert len(portal.freigaben(app_conn, pid)) == 1

    sicht = portal.sicht(app_conn, "kunde")
    assert len(sicht) == 1 and sicht[0]["id"] == pid and sicht[0]["phase_titel"] == "in Bearbeitung"
    s = sicht[0]
    assert s["fortschritt_prozent"] > 0 and len(s["abschnitte"]) == 9
    assert abs(sum(x["anteil"] for x in s["abschnitte"]) - 1) < 0.01
    assert [t["bezeichnung"] for t in s["termine"]] == ["Entwurf"]          # Bindefrist bleibt intern
    text = str(s)
    for geheim in ("honorar", "cent", "geld", "rechnung", "stundensatz"):
        assert geheim not in text.lower(), geheim
    assert portal.sicht(app_conn, "niemand") == []
    portal.entziehen(app_conn, pid, "kunde", akteur="pytest")
    assert portal.sicht(app_conn, "kunde") == []


def test_portal_ueber_http(frische_db, app_conn, projekte_wurzel, nutzer_db):
    p = projekte.anlegen(app_conn, name="HTTP", honorarmodell="pauschal", akteur="pytest")
    intern = _app("INTERNAL", "admin")
    assert intern.get("/FastAPI/projekte/portal-nutzer").json() == [{"username": "kunde"}]
    assert intern.post(f"/FastAPI/projekte/{p['id']}/freigaben", json={"username": "kunde"}).status_code == 201
    assert intern.post(f"/FastAPI/projekte/{p['id']}/freigaben", json={"username": "fremd"}).status_code == 422
    kunde = _app("CLIENT", "kunde")
    assert kunde.get("/FastAPI/projekte").status_code == 403                 # Cockpit bleibt intern
    sicht = kunde.get("/FastAPI/portal/projekte").json()
    assert [s["name"] for s in sicht] == ["HTTP"]
    assert _app("CLIENT", "anderer").get("/FastAPI/portal/projekte").json() == []
    assert intern.delete(f"/FastAPI/projekte/{p['id']}/freigaben/kunde").json() == []
