"""Modellsaetze (Stufe 11.2) — benannte Auswahlen aus der Ablage.

Der Auftrag besitzt die Dateien; ein Satz waehlt daraus aus und besitzt nichts.
Dasselbe Gelaende in drei Varianten kostet einmal Platz.

Geprueft werden vor allem die ZWEI INVARIANTEN. Beide sind so, dass ihre
Verletzung nicht knallt, sondern still falsche Ergebnisse liefert — deshalb
werden sie beim SCHREIBEN geprueft und laut abgewiesen:

  1. Jede sha256 in `enthaelt` steht auch im Register. Sonst zeigt ein Satz ins
     Leere, und eine Auswertung findet ein Modell weniger, ohne es zu sagen.
  2. Hoechstens EINE Revision je Fachmodell. Sonst laegen zwei Fassungen
     desselben Modells gleichzeitig im Raum, und keine Mengenermittlung koennte
     sagen, welche gilt.
"""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import cde, ordner, projekte
from app.api.projekt.router import router


def _client():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(role="INTERNAL", username="fabio")
    return TestClient(app)


def _projekt_mit_modellen(app_conn):
    """Ein Auftrag mit drei Dateien: zwei Revisionen eines Modells + ein zweites."""
    p = projekte.anlegen(app_conn, name="Saetze", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    basis = f"/FastAPI/projekte/{p['id']}/cde"
    kanal1 = c.post(f"{basis}/upload", files={"datei": ("Kanal_R01.ifc", b"ISO-10303-21;a", "application/octet-stream")}).json()
    kanal2 = c.post(f"{basis}/upload", files={"datei": ("Kanal_R02.ifc", b"ISO-10303-21;b", "application/octet-stream")}).json()
    gelaende = c.post(f"{basis}/upload", files={"datei": ("Gelaende.ifc", b"ISO-10303-21;c", "application/octet-stream")}).json()
    return p, c, basis, kanal1, kanal2, gelaende


def test_altes_manifest_ohne_saetze_liest_sich_weiter(frische_db, app_conn, projekte_wurzel):
    """Rueckwaertsvertraeglich: die drei Modelle in 1337_Genau kamen vor Stufe 11."""
    p = projekte.anlegen(app_conn, name="Alt", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    assert cde.manifest_lesen(o)["saetze"] == []
    assert cde.saetze(o) == []


def test_satz_anlegen_und_lesen(frische_db, app_conn, projekte_wurzel):
    p, c, basis, kanal1, _kanal2, gelaende = _projekt_mit_modellen(app_conn)

    r = c.post(f"{basis}/saetze", json={"name": "Variante Nord", "zweck": "variante",
                                        "enthaelt": [kanal1["sha256"], gelaende["sha256"]]})
    assert r.status_code == 201, r.json()
    satz = r.json()
    assert satz["name"] == "Variante Nord" and satz["id"].startswith("s-")
    assert satz["von"] == "fabio"

    # Der Satz loest seine Verweise auf — der Waehler braucht die Dateinamen.
    gelesen = c.get(f"{basis}/saetze").json()
    assert len(gelesen) == 1
    assert {d["datei"] for d in gelesen[0]["dokumente"]} == {"Kanal_R01.ifc", "Gelaende.ifc"}
    assert gelesen[0]["verwaist"] == []

    # Und er steht im Register, damit der Client ihn ohne zweiten Aufruf hat.
    assert len(c.get(basis).json()["saetze"]) == 1


def test_ein_satz_kostet_keine_zweite_datei(frische_db, app_conn, projekte_wurzel):
    """Der Kern: ein Satz VERWEIST. Dasselbe Gelaende in zwei Saetzen liegt einmal."""
    p, c, basis, kanal1, kanal2, gelaende = _projekt_mit_modellen(app_conn)
    c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"], gelaende["sha256"]]})
    c.post(f"{basis}/saetze", json={"name": "Sued", "enthaelt": [kanal2["sha256"], gelaende["sha256"]]})

    o = ordner.finde(p["id"])
    dateien = sorted(x.name for x in (o.pfad / "CDE").glob("*.ifc"))
    assert dateien == ["Gelaende.ifc", "Kanal_R01.ifc", "Kanal_R02.ifc"]   # drei, nicht vier
    assert len(cde.manifest_lesen(o)["dokumente"]) == 3


def test_invariante_unbekannte_sha_wird_abgewiesen(frische_db, app_conn, projekte_wurzel):
    p, c, basis, kanal1, _k2, _g = _projekt_mit_modellen(app_conn)
    r = c.post(f"{basis}/saetze", json={"name": "Kaputt", "enthaelt": [kanal1["sha256"], "f" * 64]})
    assert r.status_code == 422
    assert "nicht im Register" in str(r.json())


def test_invariante_zwei_revisionen_desselben_modells(frische_db, app_conn, projekte_wurzel):
    """Kanal_R01 und Kanal_R02 sind dasselbe Fachmodell — nicht beide zugleich.

    Die Linie kommt hier aus (basisname, art): die Projekt-Akte laedt ohne
    IFCPROJECT-GlobalId hoch, sie steht als None im Manifest.
    """
    p, c, basis, kanal1, kanal2, _g = _projekt_mit_modellen(app_conn)
    r = c.post(f"{basis}/saetze", json={"name": "Doppelt", "enthaelt": [kanal1["sha256"], kanal2["sha256"]]})
    assert r.status_code == 422
    assert "zwei Revisionen" in str(r.json())


def test_linie_bevorzugt_die_global_id(frische_db, app_conn, projekte_wurzel):
    """Zwei Dateinamen, ein Modell — die GlobalId sticht den Basisnamen."""
    p = projekte.anlegen(app_conn, name="Linie", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    basis = f"/FastAPI/projekte/{p['id']}/cde"
    gid = "0aB$cd12345678901234"
    # Seit dem Import-Tor (IFC-Konsistenz, Stufe 4a) beginnt eine .ifc mit dem STEP-Kopf — sonst 422.
    a = c.post(f"{basis}/upload", params={"projekt_global_id": gid},
               files={"datei": ("Alt.ifc", b"ISO-10303-21;1", "application/octet-stream")}).json()
    b = c.post(f"{basis}/upload", params={"projekt_global_id": gid},
               files={"datei": ("Neu.ifc", b"ISO-10303-21;2", "application/octet-stream")}).json()
    # Verschiedene Basisnamen, aber dieselbe GlobalId -> dieselbe Linie.
    r = c.post(f"{basis}/saetze", json={"name": "Doppelt", "enthaelt": [a["sha256"], b["sha256"]]})
    assert r.status_code == 422
    assert "zwei Revisionen" in str(r.json())


def test_namen_sind_eindeutig(frische_db, app_conn, projekte_wurzel):
    p, c, basis, kanal1, _k2, _g = _projekt_mit_modellen(app_conn)
    c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"]]})
    assert c.post(f"{basis}/saetze", json={"name": "Nord"}).status_code == 422
    assert c.post(f"{basis}/saetze", json={"name": "  "}).status_code == 422
    assert c.post(f"{basis}/saetze", json={"name": "X", "zweck": "quatsch"}).status_code == 422


def test_satz_aendern(frische_db, app_conn, projekte_wurzel):
    p, c, basis, kanal1, kanal2, gelaende = _projekt_mit_modellen(app_conn)
    satz = c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"]]}).json()

    # Nur umbenennen — `enthaelt` bleibt, weil None nicht "leer" heisst.
    r = c.put(f"{basis}/saetze/{satz['id']}", json={"name": "Vorzugsvariante", "zweck": "vorzug"})
    assert r.status_code == 200
    assert r.json()["name"] == "Vorzugsvariante" and r.json()["zweck"] == "vorzug"
    assert r.json()["enthaelt"] == [kanal1["sha256"]]

    # Revision wechseln: R01 raus, R02 rein — das ist der Variantenvergleich.
    r2 = c.put(f"{basis}/saetze/{satz['id']}", json={"enthaelt": [kanal2["sha256"], gelaende["sha256"]]})
    assert r2.status_code == 200 and len(r2.json()["enthaelt"]) == 2

    assert c.put(f"{basis}/saetze/gibtsnicht", json={"name": "X"}).status_code == 404


def test_loeschen_eines_gefuehrten_dokuments_wird_abgewiesen(frische_db, app_conn, projekte_wurzel):
    """Sonst zeigte der Satz ins Leere, und niemand saehe es."""
    p, c, basis, kanal1, _k2, _g = _projekt_mit_modellen(app_conn)
    c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"]]})

    r = c.delete(f"{basis}/{kanal1['sha256']}")
    assert r.status_code == 422
    assert "Nord" in str(r.json())          # der Satz wird NAMENTLICH genannt

    # Erst aus dem Satz nehmen, dann geht es.
    satz = c.get(f"{basis}/saetze").json()[0]
    c.put(f"{basis}/saetze/{satz['id']}", json={"enthaelt": []})
    assert c.delete(f"{basis}/{kanal1['sha256']}").status_code == 200


def test_satz_loeschen_laesst_die_dateien_stehen(frische_db, app_conn, projekte_wurzel):
    """Ein Satz besitzt nichts — sein Ende darf keine Datei kosten."""
    p, c, basis, kanal1, _k2, gelaende = _projekt_mit_modellen(app_conn)
    satz = c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"], gelaende["sha256"]]}).json()

    assert c.delete(f"{basis}/saetze/{satz['id']}").status_code == 200
    assert c.get(f"{basis}/saetze").json() == []
    assert len(c.get(basis).json()["dokumente"]) == 3
    o = ordner.finde(p["id"])
    assert (o.pfad / "CDE" / "Kanal_R01.ifc").is_file()

    assert c.delete(f"{basis}/saetze/gibtsnicht").status_code == 404


def test_verwaiste_verweise_werden_gemeldet(frische_db, app_conn, projekte_wurzel):
    """Wer im Explorer aufraeumt, umgeht jede Pruefung. Das gehoert gesagt."""
    p, c, basis, kanal1, _k2, _g = _projekt_mit_modellen(app_conn)
    c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [kanal1["sha256"]]})

    o = ordner.finde(p["id"])
    daten = cde.manifest_lesen(o)
    daten["dokumente"] = [d for d in daten["dokumente"] if d["sha256"] != kanal1["sha256"]]
    cde._manifest_schreiben(o, daten)

    gelesen = cde.saetze(o)[0]
    assert gelesen["dokumente"] == []
    assert gelesen["verwaist"] == [kanal1["sha256"]]


def test_ein_verbund_gehoert_in_keinen_satz(frische_db, app_conn, projekte_wurzel):
    """E1 (Fahrplan Erdbau-Container): ein Verbund ist ein Abgabe-Container — ein Erdbau-Dokument ein Fachmodell."""
    p, c, basis, kanal1, _kanal2, gelaende = _projekt_mit_modellen(app_conn)
    o = ordner.finde(p["id"])
    daten = cde.manifest_lesen(o)
    for d in daten["dokumente"]:
        if d["sha256"] == kanal1["sha256"]:
            d["herkunft"] = {"art": "verbund"}
        elif d["sha256"] == gelaende["sha256"]:
            d["herkunft"] = {"art": "erdbau"}
    cde._manifest_schreiben(o, daten)
    r = c.post(f"{basis}/saetze", json={"name": "Mit Verbund", "zweck": "variante", "enthaelt": [kanal1["sha256"]]})
    assert r.status_code == 422 and "Abgabe-Container" in r.json()["detail"], r.text
    r = c.post(f"{basis}/saetze", json={"name": "Mit Erdbau", "zweck": "variante", "enthaelt": [gelaende["sha256"]]})
    assert r.status_code == 201, r.text
    r = c.put(f"{basis}/saetze/{r.json()['id']}", json={"enthaelt": [gelaende["sha256"], kanal1["sha256"]]})
    assert r.status_code == 422 and "Abgabe-Container" in r.json()["detail"], r.text


def test_erdbau_dokument_nicht_im_eigenen_satz(frische_db, app_conn, projekte_wurzel):
    """K3 (Fahrplan „Klare Ablaeufe", S3): ein Erdbau-Dokument gehoert nicht in den Satz, aus dem es kam.

    In jedem ANDEREN Satz ist es ein normales Modell — nur im eigenen stuende es
    neben dem Bau, aus dem es entstand, und ein Verbund naehme beides.
    """
    p, c, basis, _kanal1, _kanal2, gelaende = _projekt_mit_modellen(app_conn)
    nord = c.post(f"{basis}/saetze", json={"name": "Nord", "enthaelt": [gelaende["sha256"]]}).json()
    sued = c.post(f"{basis}/saetze", json={"name": "Sued", "enthaelt": [gelaende["sha256"]]}).json()
    erdbau = c.post(f"{basis}/upload", files={"datei": ("Erdbau_Nord_R01.ifc", b"ISO-10303-21;e", "application/octet-stream")}).json()
    o = ordner.finde(p["id"])
    daten = cde.manifest_lesen(o)
    for d in daten["dokumente"]:
        if d["sha256"] == erdbau["sha256"]:
            d["herkunft"] = {"art": "erdbau", "satz_id": nord["id"], "satz_name": "Nord"}
    cde._manifest_schreiben(o, daten)

    r = c.put(f"{basis}/saetze/{nord['id']}", json={"enthaelt": [gelaende["sha256"], erdbau["sha256"]]})
    assert r.status_code == 422, r.json()
    assert "eigenen Satz" in r.json()["detail"]

    r = c.put(f"{basis}/saetze/{sued['id']}", json={"enthaelt": [gelaende["sha256"], erdbau["sha256"]]})
    assert r.status_code == 200, r.json()
    assert erdbau["sha256"] in r.json()["enthaelt"]

