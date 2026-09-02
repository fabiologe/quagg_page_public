"""HTTP-Schicht der Beleg-Endpunkte: Statuscodes, Fehlerbilder, Auth-Gate."""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.pedant.router import router

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/pedant")
    return app


def _als(rolle: str):
    app = _app()
    app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(role=rolle, username="pytest"))
    return TestClient(app)


def _lade_hoch(client, inhalt=PDF_BYTES, name="bon.pdf"):
    return client.post("/FastAPI/pedant/belege",
                       files={"datei": (name, inhalt, "application/pdf")})


def test_gate_deckt_beleg_routen(frische_db, beleg_wurzel):
    ohne = TestClient(_app())
    assert ohne.get("/FastAPI/pedant/belege").status_code == 401
    assert _als("CLIENT").get("/FastAPI/pedant/belege").status_code == 403


def test_upload_liste_datei_und_duplikat(frische_db, beleg_wurzel):
    client = _als("ADMIN")

    antwort = _lade_hoch(client)
    assert antwort.status_code == 201
    beleg = antwort.json()
    assert beleg["status"] == "erfasst"
    assert beleg["belegnummer"].startswith("B-")

    nochmal = _lade_hoch(client, name="anders.pdf")
    assert nochmal.status_code == 409
    assert nochmal.json()["detail"]["belegnummer"] == beleg["belegnummer"]

    liste = client.get("/FastAPI/pedant/belege", params={"status": "erfasst"}).json()
    assert any(zeile["id"] == beleg["id"] for zeile in liste)
    assert client.get("/FastAPI/pedant/belege",
                      params={"status": "quatsch"}).status_code == 422

    datei = client.get(f"/FastAPI/pedant/belege/{beleg['id']}/datei")
    assert datei.status_code == 200
    assert datei.headers["content-type"].startswith("application/pdf")
    assert datei.content == PDF_BYTES

    assert client.get("/FastAPI/pedant/belege/999999").status_code == 404
    assert client.get("/FastAPI/pedant/belege/999999/datei").status_code == 404


def test_upload_lehnt_getarnte_datei_ab(frische_db, beleg_wurzel, app_conn):
    client = _als("ADMIN")
    antwort = _lade_hoch(client, inhalt=b"\xff\xd8\xff\xe0" + b"\x00" * 16,
                         name="getarnt.pdf")
    assert antwort.status_code == 422
    assert "image/jpeg" in antwort.json()["detail"]
    # Die Ablehnung steht im Auditlog — samt Dateiname und Grund.
    app_conn.rollback()
    zeile = app_conn.execute(
        "SELECT erfolg, detail FROM auditlog WHERE aktion = 'beleg_anlegen'"
        " ORDER BY id DESC LIMIT 1").fetchone()
    assert zeile[0] is False
    assert zeile[1]["original_name"] == "getarnt.pdf"
    assert "image/jpeg" in zeile[1]["grund"]


def test_upload_nimmt_heic_an(frische_db, beleg_wurzel):
    # Minimaler HEIC-Container (ftyp heic), wie iPhone-Fotos ihn tragen.
    heic = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + b"\x00" * 32
    client = _als("ADMIN")
    antwort = client.post("/FastAPI/pedant/belege",
                          files={"datei": ("IMG_0001.HEIC", heic, "image/heic")})
    assert antwort.status_code == 201, antwort.json()
    assert antwort.json()["mime_typ"] in ("image/heic", "image/heif")


def test_felder_freigeben_verwerfen_ueber_http(frische_db, beleg_wurzel):
    client = _als("ADMIN")
    # eigener Inhalt — die Modul-DB kennt PDF_BYTES aus dem Upload-Test schon
    beleg = _lade_hoch(client, inhalt=PDF_BYTES + b"%felder\n").json()

    felder = {"lieferant": "Baumarkt", "belegdatum": "2027-01-15",
              "netto_cent": 10_000, "steuersatz": 19, "brutto_cent": 11_900}
    gespeichert = client.put(f"/FastAPI/pedant/belege/{beleg['id']}", json=felder)
    assert gespeichert.status_code == 200
    assert gespeichert.json()["status"] == "geprueft"
    assert gespeichert.json()["vorschlag"]["stufe"] == "sofortaufwand"

    kaputt = client.put(f"/FastAPI/pedant/belege/{beleg['id']}",
                        json={**felder, "steuersatz": 5})
    assert kaputt.status_code == 422

    frei = client.post(f"/FastAPI/pedant/belege/{beleg['id']}/freigeben",
                       json={"sollkonto": "6815"})
    assert frei.status_code == 201
    assert frei.json()["bereits_gebucht"] is False

    wiederholt = client.post(f"/FastAPI/pedant/belege/{beleg['id']}/freigeben",
                             json={"sollkonto": "6815"})
    assert wiederholt.status_code == 200
    assert wiederholt.json()["bereits_gebucht"] is True

    # gebuchter Beleg: Felder fest, verwerfen unmoeglich
    assert client.put(f"/FastAPI/pedant/belege/{beleg['id']}",
                      json=felder).status_code == 422
    assert client.post(f"/FastAPI/pedant/belege/{beleg['id']}/verwerfen",
                       json={"grund": "zu spaet"}).status_code == 422

    zweiter = _lade_hoch(client, inhalt=PDF_BYTES + b"%verwerfen\n").json()
    verworfen = client.post(f"/FastAPI/pedant/belege/{zweiter['id']}/verwerfen",
                            json={"grund": "privat"})
    assert verworfen.status_code == 200
    assert verworfen.json()["status"] == "verworfen"
