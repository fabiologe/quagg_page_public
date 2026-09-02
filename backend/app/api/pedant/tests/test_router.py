"""HTTP-Schicht: Auth-Gate und die Uebersetzung Fachlogik → Statuscodes.
Der Router wird in eine frische FastAPI-App montiert; fuer 403/200 wird die
Auth-Dependency uebersteuert, fuer 401 bleibt sie echt."""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.pedant.router import router


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/pedant")
    return app


def _als(rolle: str):
    app = _app()
    app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(role=rolle, username="pytest"))
    return TestClient(app)


def test_ohne_token_401(frische_db):
    antwort = TestClient(_app()).get("/FastAPI/pedant/status")
    assert antwort.status_code == 401


def test_client_rolle_403(frische_db):
    antwort = _als("CLIENT").get("/FastAPI/pedant/status")
    assert antwort.status_code == 403


def test_internal_kann_status_konten_und_buchung(frische_db):
    client = _als("ADMIN")

    status = client.get("/FastAPI/pedant/status").json()
    assert status["umgebung"] == "test"
    assert status["db_erreichbar"] is True
    assert status["anzahl_buchungen"] == 0

    konten = client.get("/FastAPI/pedant/konten").json()
    assert any(k["kontonr"] == "1800" for k in konten)

    neu = client.post("/FastAPI/pedant/buchungen", json={
        "buchungsdatum": "2027-01-15", "belegdatum": "2027-01-14",
        "sollkonto": "6815", "habenkonto": "1800",
        "betrag_cent": 4321, "buchungstext": "Buerobedarf per HTTP",
    })
    assert neu.status_code == 201
    nr = neu.json()["lfd_nr"]

    zeilen = client.get("/FastAPI/pedant/buchungen").json()
    assert zeilen[0]["lfd_nr"] == nr
    assert zeilen[0]["betrag_cent"] == 4321

    kette = client.get("/FastAPI/pedant/kette").json()
    assert kette["ok"] is True and kette["zeilen_geprueft"] == 1

    storno = client.post(f"/FastAPI/pedant/buchungen/{nr}/storno",
                         json={"grund": "Testlauf"})
    assert storno.status_code == 201

    abgelehnt = client.post("/FastAPI/pedant/buchungen", json={
        "buchungsdatum": "2027-01-15", "belegdatum": "2027-01-15",
        "sollkonto": "1800", "habenkonto": "1800",
        "betrag_cent": 100, "buchungstext": "soll gleich haben",
    })
    assert abgelehnt.status_code == 422
