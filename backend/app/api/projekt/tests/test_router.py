"""HTTP-Schicht: Statuscodes, Gate, Fehlerbilder."""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.router import router


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    return app


def _als(rolle: str):
    app = _app()
    app.dependency_overrides[get_current_active_user] = (
        lambda: SimpleNamespace(role=rolle, username="pytest"))
    return TestClient(app)


def test_gate(frische_db, projekte_wurzel):
    assert TestClient(_app()).get("/FastAPI/projekte").status_code == 401
    assert _als("CLIENT").get("/FastAPI/projekte").status_code == 403
    assert _als("EXTERN").get("/FastAPI/projekte").status_code == 403
    assert _als("QUATSCH").get("/FastAPI/projekte").status_code == 403
    # Rang-Modell: ab WERKSTUDENT rein, Altwert INTERNAL laeuft als MITARBEITER
    assert _als("WERKSTUDENT").get("/FastAPI/projekte/phasen").json()[0] == "00_Angebote"
    assert _als("INTERNAL").get("/FastAPI/projekte/phasen").json()[0] == "00_Angebote"
    assert _als("ADMIN").get("/FastAPI/projekte/phasen").json()[0] == "00_Angebote"
    # Rechnungslegung nur ADMIN — der 403 kommt VOR dem Projekt-Lookup (404)
    assert _als("MITARBEITER").get("/FastAPI/projekte/999999/geld").status_code == 403
    assert _als("MITARBEITER").post("/FastAPI/projekte/999999/abschlag", json={"leistung_von": "2027-01-01"}).status_code == 403
    assert _als("ADMIN").get("/FastAPI/projekte/999999/geld").status_code == 404


def test_lebenszyklus_ueber_http(frische_db, projekte_wurzel):
    c = _als("ADMIN")
    antwort = c.post("/FastAPI/projekte", json={"name": "Regenrückhaltebecken", "honorarmodell": "hoai",
                                                "lph": [1, 2], "kurzname": "RRB Nord"})
    assert antwort.status_code == 201, antwort.json()
    p = antwort.json()
    assert p["phase"] == "00_Angebote" and p["ordnername"].endswith("_RRB_Nord")
    pid = p["id"]

    assert c.get(f"/FastAPI/projekte/{pid}").json()["name"] == "Regenrückhaltebecken"
    assert c.get("/FastAPI/projekte/999999").status_code == 404
    assert c.post("/FastAPI/projekte", json={"name": "", "honorarmodell": "hoai"}).status_code == 422
    assert c.post("/FastAPI/projekte", json={"name": "x", "honorarmodell": "gratis"}).status_code == 422
    assert c.post("/FastAPI/projekte", json={"name": "x", "phase": "77_Nix"}).status_code == 422

    assert c.put(f"/FastAPI/projekte/{pid}", json={"notiz": "Angebot raus"}).json()["notiz"] == "Angebot raus"
    assert c.post(f"/FastAPI/projekte/{pid}/verschieben", json={"phase": "01_Laufend"}).json()["phase"] == "01_Laufend"
    assert c.post(f"/FastAPI/projekte/{pid}/verschieben", json={"phase": "nix"}).status_code == 422

    b = c.post(f"/FastAPI/projekte/{pid}/beteiligte", json={"rolle": "bauherr", "name": "Stadt"})
    assert b.status_code == 201
    bid = b.json()["beteiligte"][0]["id"]
    assert c.delete(f"/FastAPI/projekte/{pid}/beteiligte/{bid}").json()["beteiligte"] == []
    assert c.delete(f"/FastAPI/projekte/{pid}/beteiligte/{bid}").status_code == 404

    m = c.post(f"/FastAPI/projekte/{pid}/meilensteine",
               json={"art": "bindefrist", "bezeichnung": "Angebot gilt bis", "faellig_am": "2027-03-01"})
    assert m.status_code == 201
    mid = m.json()["meilensteine"][0]["id"]
    assert c.put(f"/FastAPI/projekte/{pid}/meilensteine/{mid}",
                 json={"erledigt_am": "2027-02-01"}).json()["meilensteine"][0]["erledigt_am"] == "2027-02-01"

    liste = c.get("/FastAPI/projekte").json()
    assert any(z["id"] == pid and z["phase"] == "01_Laufend" for z in liste)
    kz = c.get("/FastAPI/projekte/kennzahlen").json()
    assert kz["je_phase"]["01_Laufend"] >= 1
    assert c.get("/FastAPI/projekte/abgleich").json()["akte_ohne_ordner"] == []


def test_abschnitte_ueber_http(frische_db, projekte_wurzel):
    c = _als("ADMIN")
    pid = c.post("/FastAPI/projekte", json={"name": "Kanal", "honorarmodell": "hoai"}).json()["id"]
    bilder = c.get("/FastAPI/projekte/leistungsbilder").json()
    assert any(b["paragraf"] == "47" for b in bilder)
    v = c.post(f"/FastAPI/projekte/{pid}/abschnitte/vorlage",
               json={"paragraf": "47", "honorar_cent": 50_000_00, "beauftragt": [1, 2, 3]})
    assert v.status_code == 201, v.json()
    akte = v.json()
    assert len(akte["abschnitte"]) == 9 and akte["fortschritt"]["honorar_beauftragt_cent"] == 23_500_00
    aid = akte["abschnitte"][1]["id"]
    g = c.put(f"/FastAPI/projekte/{pid}/abschnitte/{aid}",
              json={"fortschritt_prozent": 50, "honorar_cent": 11_000_00, "grund": "Auftrag"})
    assert g.status_code == 200
    assert g.json()["honorar_historie"][0]["grund"] == "Auftrag"
    assert c.put(f"/FastAPI/projekte/{pid}/abschnitte/{aid}", json={"fortschritt_prozent": 120}).status_code == 422
    assert c.put(f"/FastAPI/projekte/{pid}/abschnitte/999999", json={"fortschritt_prozent": 1}).status_code == 404
    n = c.post(f"/FastAPI/projekte/{pid}/abschnitte",
               json={"bezeichnung": "Nebenkosten", "art": "nebenkosten", "honorar_cent": 2_000_00})
    assert n.status_code == 201 and len(n.json()["abschnitte"]) == 10
    assert c.delete(f"/FastAPI/projekte/{pid}/abschnitte/{aid}").status_code == 422   # hat Historie


def test_dossier_und_vorschlaege_ueber_http(frische_db, projekte_wurzel):
    from app.api.projekt.core import vorschlaege
    from app.api.pedant import db
    c = _als("ADMIN")
    pid = c.post("/FastAPI/projekte", json={"name": "Dossier", "honorarmodell": "pauschal"}).json()["id"]
    d = c.get(f"/FastAPI/projekte/{pid}/dossier")
    assert d.status_code == 200 and d.headers["content-type"].startswith("text/markdown")
    assert f"# Projektakte #P{pid}" in d.text
    assert c.get("/FastAPI/projekte/999999/dossier").status_code == 404
    with db.pool().connection() as conn:
        v = vorschlaege.anlegen(conn, pid, art="notiz", nutzlast={"text": "per MCP"}, begruendung="Test")
    assert any(x["id"] == v["id"] for x in c.get("/FastAPI/projekte/vorschlaege").json())
    assert len(c.get(f"/FastAPI/projekte/{pid}/vorschlaege").json()) == 1
    e = c.post(f"/FastAPI/projekte/{pid}/vorschlaege/{v['id']}/entscheiden", json={"entscheidung": "uebernehmen"})
    assert e.status_code == 200 and "per MCP" in e.json()["notiz"] and e.json()["vorschlaege"] == []
    assert c.post(f"/FastAPI/projekte/{pid}/vorschlaege/{v['id']}/entscheiden",
                  json={"entscheidung": "verwerfen"}).status_code == 422
    assert c.post(f"/FastAPI/projekte/{pid}/vorschlaege/999/entscheiden",
                  json={"entscheidung": "verwerfen"}).status_code == 404


def test_geld_ueber_http(frische_db, projekte_wurzel):
    from app.api.pedant import db
    from app.api.pedant.core import stammdaten
    from app.api.projekt.core import abschnitte
    with db.pool().connection() as conn:
        ag = stammdaten.auftraggeber_anlegen(conn, akteur="pytest", felder={
            "name": "Kreis", "strasse": "Weg 1", "plz": "56068", "ort": "Koblenz",
            "leitweg_id": "04011000-12345-03", "portal": "zre_rlp", "email": "k@k.de"})["id"]
    c = _als("ADMIN")
    pid = c.post("/FastAPI/projekte", json={"name": "Geld", "honorarmodell": "pauschal",
                                            "phase": "01_Laufend", "auftraggeber_id": ag}).json()["id"]
    with db.pool().connection() as conn:
        abschnitte.anlegen(conn, pid, bezeichnung="Vorentwurf", honorar_cent=10_000_00,
                           fortschritt_prozent=40, akteur="pytest")
    v = c.get(f"/FastAPI/projekte/{pid}/abschlag").json()
    assert v["summe_netto_cent"] == 4_000_00
    r = c.post(f"/FastAPI/projekte/{pid}/abschlag", json={"leistung_von": "2027-01-01"})
    assert r.status_code == 201 and r.json()["status"] == "entwurf" and r.json()["netto_cent"] == 4_000_00
    g = c.get(f"/FastAPI/projekte/{pid}/geld").json()
    assert g["summen"]["entwurf_netto_cent"] == 4_000_00 and g["rechnungen"][0]["id"] == r.json()["rechnung_id"]
    assert g["planzeile"]["betrag_cent"] == 11_900_00
    assert c.post(f"/FastAPI/projekte/{pid}/abschlag", json={"leistung_von": "2027-01-01",
                                                             "leistung_bis": "2026-01-01"}).status_code == 422
    assert c.get(f"/FastAPI/projekte/{pid}/belege/frei").json() == []
    assert c.post(f"/FastAPI/projekte/{pid}/belege", json={"beleg_id": 999999}).status_code == 422


def test_aufgaben_zeit_timer_ueber_http(frische_db, projekte_wurzel):
    c = _als("ADMIN")
    pid = c.post("/FastAPI/projekte", json={"name": "Zeit", "honorarmodell": "stunden"}).json()["id"]
    a = c.post(f"/FastAPI/projekte/{pid}/aufgaben", json={"titel": "Anruf", "faellig_am": "2027-01-01"})
    assert a.status_code == 201 and a.json()["aufgaben"][0]["titel"] == "Anruf"
    aid = a.json()["aufgaben"][0]["id"]
    assert c.put(f"/FastAPI/projekte/{pid}/aufgaben/{aid}", json={"status": "erledigt"}).json()["aufgaben"][0]["status"] == "erledigt"
    assert any(x["id"] == aid for x in c.get("/FastAPI/projekte/aufgaben/faellig", params={"tage": 9999}).json()) is False
    assert c.delete(f"/FastAPI/projekte/{pid}/aufgaben/{aid}").json()["aufgaben"] == []
    assert c.delete(f"/FastAPI/projekte/{pid}/aufgaben/{aid}").status_code == 404

    z = c.post(f"/FastAPI/projekte/{pid}/zeiten", json={"datum": "2027-03-01", "dauer_min": 60, "taetigkeit": "Entwurf"})
    assert z.status_code == 201 and z.json()["zeit"]["minuten_gesamt"] == 60
    assert c.post(f"/FastAPI/projekte/{pid}/zeiten", json={"datum": "2027-03-01", "dauer_min": 0, "taetigkeit": "x"}).status_code == 422
    liste = c.get(f"/FastAPI/projekte/{pid}/zeiten").json()
    assert liste["buchungen"][0]["dauer_min"] == 60 and liste["summen"]["minuten_gesamt"] == 60
    assert c.get("/FastAPI/projekte/zeiten", params={"von": "2027-03-01", "bis": "2027-03-31"}).json()[0]["projekt_id"] == pid

    assert c.get("/FastAPI/projekte/timer").json() is None
    t = c.post(f"/FastAPI/projekte/{pid}/timer", json={"taetigkeit": "Telefonat"})
    assert t.status_code == 200 and t.json()["projekt_id"] == pid
    assert c.get("/FastAPI/projekte/timer").json()["taetigkeit"] == "Telefonat"
    gebucht = c.post("/FastAPI/projekte/timer/stop", json={}).json()
    assert gebucht["dauer_min"] == 1 and gebucht["taetigkeit"] == "Telefonat"
    assert c.get("/FastAPI/projekte/timer").json() is None
    assert c.post(f"/FastAPI/projekte/{pid}/stundenrechnung", json={"leistung_von": "2027-03-01"}).status_code == 422  # kein AG/Satz


def test_aufgaben_zeit_timer_ueber_http(frische_db, projekte_wurzel):
    c = _als("ADMIN")
    pid = c.post("/FastAPI/projekte", json={"name": "Zeit", "honorarmodell": "stunden"}).json()["id"]
    a = c.post(f"/FastAPI/projekte/{pid}/aufgaben", json={"titel": "Ortstermin vorbereiten", "faellig_am": "2027-03-01"})
    assert a.status_code == 201 and a.json()["aufgaben"][0]["titel"] == "Ortstermin vorbereiten"
    aid = a.json()["aufgaben"][0]["id"]
    assert c.put(f"/FastAPI/projekte/{pid}/aufgaben/{aid}", json={"status": "erledigt"}).json()["aufgaben"][0]["erledigt_am"]
    assert c.put(f"/FastAPI/projekte/{pid}/aufgaben/{aid}", json={"status": "vergessen"}).status_code == 422
    z = c.post(f"/FastAPI/projekte/{pid}/zeiten", json={"datum": "2027-02-01", "dauer_min": 45, "taetigkeit": "Plan"})
    assert z.status_code == 201 and z.json()["zeit"]["minuten_gesamt"] == 45
    liste = c.get(f"/FastAPI/projekte/{pid}/zeiten").json()
    assert liste["summen"]["minuten_gesamt"] == 45 and liste["buchungen"][0]["dauer_min"] == 45
    zid = liste["buchungen"][0]["id"]
    assert c.put(f"/FastAPI/projekte/{pid}/zeiten/{zid}", json={"dauer_min": 60}).json()["zeit"]["minuten_gesamt"] == 60
    assert c.get("/FastAPI/projekte/zeiten", params={"von": "2027-02-01", "bis": "2027-02-28"}).json()[0]["dauer_min"] == 60
    assert c.get("/FastAPI/projekte/timer").json() is None
    t = c.post(f"/FastAPI/projekte/{pid}/timer", json={"taetigkeit": "Entwurf"})
    assert t.status_code == 201 and t.json()["projekt_id"] == pid
    assert c.get("/FastAPI/projekte/timer").json()["taetigkeit"] == "Entwurf"
    b = c.post("/FastAPI/projekte/timer/stop", json={})
    assert b.status_code == 200 and b.json()["dauer_min"] == 1
    assert c.delete("/FastAPI/projekte/timer").json() == {"ok": True}
    assert c.delete(f"/FastAPI/projekte/{pid}/zeiten/{zid}").json()["zeit"]["minuten_gesamt"] == 1
    assert c.get(f"/FastAPI/projekte/{pid}/stundenrechnung").json()["positionen"][0]["minuten"] == 1
    assert c.post(f"/FastAPI/projekte/{pid}/stundenrechnung", json={"leistung_von": "2027-02-01"}).status_code == 422
