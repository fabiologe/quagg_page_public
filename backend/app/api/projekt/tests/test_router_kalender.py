"""HTTP-Schicht Kalender: Gates, Termin-Lebenszyklus ueber die API, Akte-Variante, Feed ohne Auth."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.deps import get_current_active_user
from app.api.projekt import router_kalender as modul
from app.api.projekt.core import projekte
from app.api.projekt.router import router
from app.db.database import get_session
from app.services import ical


@pytest.fixture()
def gesendet(monkeypatch):
    """SMTP-Stub: sammelt Aufrufe von email_sender.send_email."""
    aufrufe = []

    def stub(**kw):
        aufrufe.append(kw)
        return SimpleNamespace(id=len(aufrufe))

    monkeypatch.setattr(modul.email_sender, "send_email", stub)
    monkeypatch.setattr(modul.email_sender, "smtp_zugang", lambda: {"email": "info@quagg-engineering.org"})
    return aufrufe


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.include_router(modul.router_feed, prefix="/FastAPI/kalender/feed")
    app.include_router(modul.router_kalender, prefix="/FastAPI/kalender")
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)

    def _session():
        with Session(eng) as s:
            yield s

    app.dependency_overrides[get_session] = _session
    return app


def _als(rolle: str):
    app = _app()
    app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(role=rolle, username="pytest", anzeigename="Py Test"))
    return TestClient(app)


def _projekt(conn) -> int:
    return projekte.anlegen(conn, name="Kalender-Projekt", honorarmodell="pauschal", akteur="pytest")["id"]


TERMIN = {"titel": "Baubesprechung", "beginn": "2026-09-01T10:00:00+02:00", "ende": "2026-09-01T11:00:00+02:00",
          "ort": "Bauamt", "teilnehmer": [{"email": "Max@example.org", "name": "Max"}]}


def test_gates(frische_db, app_conn, projekte_wurzel):
    assert TestClient(_app()).get("/FastAPI/kalender", params={"von": "2026-09-01", "bis": "2026-09-30"}).status_code == 401
    assert _als("EXTERN").get("/FastAPI/kalender", params={"von": "2026-09-01", "bis": "2026-09-30"}).status_code == 403
    w = _als("WERKSTUDENT")
    assert w.get("/FastAPI/kalender", params={"von": "2026-09-01", "bis": "2026-09-30"}).status_code == 200
    assert w.post("/FastAPI/kalender/termine", json=TERMIN).status_code == 403
    assert w.get("/FastAPI/kalender/feed-link").status_code == 200
    assert _als("MITARBEITER").post("/FastAPI/kalender/termine", json={**TERMIN, "titel": " "}).status_code == 422
    assert _als("MITARBEITER").get("/FastAPI/kalender/termine/999999").status_code == 404


def test_lebenszyklus_ueber_http(frische_db, app_conn, projekte_wurzel, gesendet):
    pid = _projekt(app_conn)
    c = _als("MITARBEITER")
    r = c.post("/FastAPI/kalender/termine", json={**TERMIN, "projekt_id": pid, "einladung": {"nachricht": "Bitte kommen."}})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["uid"] == f"termin-{t['id']}@quagg-engineering.org" and t["eingeladen_am"] is not None
    assert t["teilnehmer"][0]["email"] == "max@example.org"
    assert len(gesendet) == 1 and gesendet[0]["to"] == ["max@example.org"] and gesendet[0]["ical_methode"] == "REQUEST"
    # Signatur des Absenders reist mit (Anzeigename aus dem angemeldeten Nutzer)
    assert gesendet[0]["signatur_daten"]["person"]["anzeigename"] == "Py Test"
    assert ical.parse_kalender(gesendet[0]["ical"])["organizer"]["email"] == "info@quagg-engineering.org"

    kal = c.get("/FastAPI/kalender", params={"von": "2026-09-01T00:00:00Z", "bis": "2026-09-02T00:00:00Z"}).json()
    assert [x["id"] for x in kal["termine"]] == [t["id"]] and "sync" in kal

    r = c.put(f"/FastAPI/kalender/termine/{t['id']}", json={"ort": "Rathaus", "teilnehmer": [
        {"email": "max@example.org"}, {"email": "neu@example.org", "name": "Neu"}]})
    assert r.status_code == 200 and r.json()["ort"] == "Rathaus" and len(r.json()["teilnehmer"]) == 2
    assert r.json()["sequenz"] == 1 and r.json()["einladung_offen"] is True
    assert c.put(f"/FastAPI/kalender/termine/{t['id']}", json={"beginn": "kaputt"}).status_code == 422

    r = c.post(f"/FastAPI/kalender/termine/{t['id']}/einladen", json={"nur_neue": True})
    assert r.status_code == 200 and gesendet[-1]["to"] == ["neu@example.org"]

    r = c.delete(f"/FastAPI/kalender/termine/{t['id']}")
    assert r.status_code == 200 and r.json()["status"] == "abgesagt"
    assert gesendet[-1]["ical_methode"] == "CANCEL"
    # abgesagt + nochmal loeschen -> wirklich weg
    assert c.delete(f"/FastAPI/kalender/termine/{t['id']}").json() == {"geloescht": True, "id": t["id"]}
    assert c.get(f"/FastAPI/kalender/termine/{t['id']}").status_code == 404


def test_versandfehler_wird_502(frische_db, app_conn, projekte_wurzel, monkeypatch):
    def kaputt(**kw):
        raise modul.email_sender.VersandFehler("SMTP down")
    monkeypatch.setattr(modul.email_sender, "send_email", kaputt)
    monkeypatch.setattr(modul.email_sender, "smtp_zugang", lambda: {"email": "info@quagg-engineering.org"})
    c = _als("MITARBEITER")
    r = c.post("/FastAPI/kalender/termine", json={**TERMIN, "einladung": {}})
    assert r.status_code == 502
    # Termin selbst wurde angelegt (Einladung kann wiederholt werden)
    termine = c.get("/FastAPI/kalender", params={"von": "2026-09-01", "bis": "2026-09-02", "mit_abgesagten": True}).json()["termine"]
    assert any(x["titel"] == "Baubesprechung" and x["eingeladen_am"] is None for x in termine)


def test_akte_variante(frische_db, app_conn, projekte_wurzel, gesendet):
    pid = _projekt(app_conn)
    c = _als("MITARBEITER")
    r = c.post(f"/FastAPI/kalender/projekte/{pid}/termine", json=TERMIN)
    assert r.status_code == 201, r.text
    akte = r.json()
    assert akte["id"] == pid and len(akte["termine"]) == 1
    tid = akte["termine"][0]["id"]
    assert c.post(f"/FastAPI/kalender/projekte/{pid}/termine/{tid}/einladen", json={}).json()["termine"][0]["eingeladen_am"]
    assert c.post(f"/FastAPI/kalender/projekte/{pid + 1}/termine/{tid}/einladen", json={}).status_code == 404
    assert c.put(f"/FastAPI/kalender/projekte/{pid}/termine/{tid}", json={"titel": "Neu"}).json()["termine"][0]["titel"] == "Neu"
    assert c.delete(f"/FastAPI/kalender/projekte/{pid}/termine/{tid}").json()["termine"][0]["status"] == "abgesagt"
    assert _als("WERKSTUDENT").post(f"/FastAPI/kalender/projekte/{pid}/termine", json=TERMIN).status_code == 403


def test_feed_ohne_auth(frische_db, app_conn, projekte_wurzel, monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://quagg-engineering.org")
    c = _als("WERKSTUDENT")
    assert c.get("/FastAPI/kalender/feed-link").json()["aktiv"] is False
    r = c.post("/FastAPI/kalender/feed-link/neu")
    assert r.status_code == 201
    d = r.json()
    assert d["url"].startswith("https://quagg-engineering.org/FastAPI/kalender/feed/") and d["url"].endswith(".ics")
    assert d["webcal"].startswith("webcal://quagg-engineering.org/")
    token = d["url"].rsplit("/", 1)[1][:-4]

    anonym = TestClient(_app())
    r = anonym.get(f"/FastAPI/kalender/feed/{token}.ics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert "METHOD:PUBLISH" in r.text and "X-WR-CALNAME:Quagg Termine" in r.text
    assert anonym.get("/FastAPI/kalender/feed/falsch.ics").status_code == 404
    assert c.get("/FastAPI/kalender/feed-link").json()["zuletzt_abgerufen_am"] is not None
    assert c.delete("/FastAPI/kalender/feed-link").json() == {"aktiv": False, "widerrufen": 1}
    assert anonym.get(f"/FastAPI/kalender/feed/{token}.ics").status_code == 404
