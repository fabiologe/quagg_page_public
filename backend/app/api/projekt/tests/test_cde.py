"""Stufe 6 (light): CDE-Register im Projektordner."""

import io
import json
from types import SimpleNamespace

import pytest
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


def test_basisname():
    assert cde._basisname("Kanal_R03.ifc") == "Kanal"
    assert cde._basisname("Lageplan-v2.pdf") == "Lageplan"
    assert cde._basisname("Bruecke rev 12.ifc") == "Bruecke"
    assert cde._basisname("Modell.ifc") == "Modell"
    assert cde._basisname("KanalR03.ifc") == "Kanal"


def test_basisname_laesst_angehaengte_ziffern_stehen():
    """Eine Ziffer OHNE Trenner ist Teil des Namens, keine Revision.

    Aufgefallen am ersten echten Upload in 1337_Genau: aus
    "BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc" wurde "..._Erdarbeiten", und eine
    spaeter gelieferte "..._Erdarbeiten.ifc" haette als Revision 2 DESSELBEN
    Modells gegolten — zwei verschiedene Fachmodelle in einer Linie. Damit
    haette ein Modellsatz sie auch nicht mehr beide fuehren duerfen.
    """
    assert cde._basisname("BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc") == "BIM26_Gruppe5_BODEN_Erdarbeiten3"
    assert cde._basisname("Halle7.ifc") == "Halle7"


def test_kein_wasserzeichen_zwilling():
    """Der Text gehoert zum Zeichnen, nicht zum Server.

    Es gab hier eine zweite Umsetzung von resolveWatermarkText — von keiner
    Produktivstelle gerufen, und schon auseinandergelaufen: Server sagte
    "ARCHIV", der Viewer "ARCHIVIERT". Genau das faellt auf, wenn dieselbe
    Regel an zwei Orten steht.
    """
    assert not hasattr(cde, "wasserzeichen")


def test_register_upload_revision_status(frische_db, app_conn, projekte_wurzel):
    p = projekte.anlegen(app_conn, name="CDE", honorarmodell="pauschal", akteur="pytest")
    projekte.beteiligter_anlegen(app_conn, p["id"], rolle="bauherr", name="Stadt", akteur="pytest")
    o = ordner.finde(p["id"])
    assert cde.register(o) == []
    c = _client()
    r1 = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload", params={"projekt_global_id": "0aB$cd12345678901234"},
                files={"datei": ("Kanal_R01.ifc", b"ISO-10303-21;\nHEADER;", "application/octet-stream")})
    assert r1.status_code == 201, r1.json()
    d1 = r1.json()
    assert d1["art"] == "modell" and d1["revision"] == 1 and d1["status"] == "WIP" and d1["pfad"] == "CDE/Kanal_R01.ifc"
    # Die IFCPROJECT-GlobalId wird MITGEFUEHRT, aber nicht fuer die Revision
    # benutzt — gezaehlt wird weiter je (basisname, art).
    assert d1["projekt_global_id"] == "0aB$cd12345678901234"
    assert (o.pfad / "CDE" / "Kanal_R01.ifc").read_bytes().startswith(b"ISO-10303")
    r2 = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload", files={"datei": ("Kanal_R02.ifc", b"ISO-10303-21;\nHEADER;v2", "application/octet-stream")})
    assert r2.json()["revision"] == 2 and r2.json()["basisname"] == "Kanal"
    assert c.post(f"/FastAPI/projekte/{p['id']}/cde/upload", files={"datei": ("Kanal_R02.ifc", b"x", "application/octet-stream")}).status_code == 422
    assert c.post(f"/FastAPI/projekte/{p['id']}/cde/upload", files={"datei": ("leer.ifc", b"", "application/octet-stream")}).status_code == 422
    plan = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload", params={"status": "Shared"},
                  files={"datei": ("Lageplan.pdf", b"%PDF-1.4", "application/pdf")}).json()
    assert plan["art"] == "plan" and plan["status"] == "Shared" and plan["projekt_global_id"] is None
    reg = c.get(f"/FastAPI/projekte/{p['id']}/cde").json()
    assert [d["datei"] for d in reg["dokumente"]] == ["Kanal_R02.ifc", "Kanal_R01.ifc", "Lageplan.pdf"]
    assert reg["stammdaten"]["bauherr"] == "Stadt" and reg["viewer_url"] == f"/cde?projekt={p['id']}"
    # ISO-19650-Arbeitsfluss (Luecke 4): WIP -> Archived ist KEIN Weg mehr —
    # der Status geht vorwaerts ueber die Stufen. Der volle Weg unten.
    kaputt = c.put(f"/FastAPI/projekte/{p['id']}/cde/{d1['sha256']}/status", json={"status": "Archived"})
    assert kaputt.status_code == 422 and "ISO-19650-Weg" in kaputt.json()["detail"]
    # Stufe 4b: WIP -> Shared verlangt fuer ein Modell einen Pruefbericht (hier eingetragen, nicht gerechnet).
    cde.pruefung_eintragen(app_conn, o, d1["sha256"], {"stand": "test", "verstoesse": 0, "befunde": []},
                           akteur="pytest")
    for stufe in ("Shared", "Published", "Archived"):
        s = c.put(f"/FastAPI/projekte/{p['id']}/cde/{d1['sha256']}/status", json={"status": stufe})
        assert s.status_code == 200 and s.json()["status"] == stufe
    assert len(s.json()["status_historie"]) == 4
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{d1['sha256']}/status", json={"status": "Fertig"}).status_code == 422
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/deadbeef/status", json={"status": "WIP"}).status_code == 404
    (o.pfad / "CDE" / "Lageplan.pdf").unlink()
    assert [d["vorhanden"] for d in cde.register(o) if d["datei"] == "Lageplan.pdf"] == [False]
    manifest = cde.manifest_lesen(o)
    assert manifest["projekt_id"] == p["id"] and len(manifest["dokumente"]) == 3
    from app.api.projekt.core import dossier
    text = dossier.erzeugen(app_conn, p["id"])
    assert "## CDE" in text and "Kanal_R02.ifc · modell · Rev. 2 · WIP" in text and "DATEI FEHLT" in text


def test_entfernen(frische_db, app_conn, projekte_wurzel):
    """Aus dem Register nehmen — den Weg gab es serverseitig gar nicht.

    Der Viewer strich den Eintrag bisher nur aus seiner eigenen Liste; Manifest
    und Datei blieben stehen. Genau daran liefen die beiden Register
    auseinander.
    """
    p = projekte.anlegen(app_conn, name="Weg", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    d = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
               files={"datei": ("Alt.ifc", b"ISO-10303-21;", "application/octet-stream")}).json()

    weg = c.delete(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}")
    assert weg.status_code == 200, weg.json()
    assert weg.json()["ok"] is True and weg.json()["datei"] == "Alt.ifc"

    # Eintrag ist raus …
    assert cde.register(o) == []
    # … die Datei aber nicht geloescht, sondern beiseite gelegt. Ein CDE ist
    # eine Ablage: was einmal geteilt wurde, bleibt nachvollziehbar.
    assert not (o.pfad / "CDE" / "Alt.ifc").exists()
    beiseite = list((o.pfad / "CDE" / cde.GELOESCHT).iterdir())
    assert len(beiseite) == 1 and beiseite[0].name.endswith("-Alt.ifc")
    assert beiseite[0].read_bytes() == b"ISO-10303-21;"

    # Unbekannt -> 404, Unsinn -> 422
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/{'0' * 64}").status_code == 404
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/deadbeef").status_code == 422

    # Die Routen-Falle: DELETE /cde/repo darf NICHT als sha256="repo" gelten.
    # Beide Routen liegen im selben Pfadraum; die sha-Pruefung faengt es ab.
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/repo").status_code == 422

    # Und ein zweiter Upload gleichen Namens geht danach wieder, weil die
    # alte Datei nicht mehr in CDE/ liegt.
    neu = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
                 files={"datei": ("Alt.ifc", b"ISO-10303-21;v2", "application/octet-stream")})
    assert neu.status_code == 201 and neu.json()["revision"] == 1


def test_viewer_repo(frische_db, app_conn, projekte_wurzel):
    p = projekte.anlegen(app_conn, name="Repo", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    assert c.get(f"/FastAPI/projekte/{p['id']}/cde/repo").json() == {}
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/repo/global:saved-views", json=[{"name": "Nord", "cam": [1, 2, 3]}]).status_code == 200
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/repo/global:annotations:gid:abc", json={"issues": [{"id": 1, "titel": "Riss"}]}).status_code == 200
    # Pfad-Traversal. Geprueft wird, was zaehlt: der Versuch wird abgewiesen
    # UND es entsteht nichts ausserhalb von CDE/_repo/. Der reine Statuscode
    # taugt dafuer nicht — seit es DELETE /cde/{sha256} gibt, normalisiert der
    # Client "/cde/repo/../boese" zu "/cde/boese", das trifft jetzt eine
    # bestehende Route mit anderer Methode und ergibt 405 statt 404.
    for weg in ("../boese", "mit%2Fslash"):
        antwort = c.put(f"/FastAPI/projekte/{p['id']}/cde/repo/{weg}", json=1)
        assert antwort.status_code >= 400, (weg, antwort.status_code)
    assert not (o.pfad / "boese").exists() and not (o.pfad / "CDE" / "boese").exists()
    # Und DELETE auf demselben Weg loescht auch nichts: cde.loeschen besteht
    # auf 64 Hexzeichen, "boese" faellt als 422 durch.
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/repo/../boese").status_code >= 400
    alles = c.get(f"/FastAPI/projekte/{p['id']}/cde/repo").json()
    assert alles["global:saved-views"][0]["name"] == "Nord" and "global:annotations:gid:abc" in alles
    assert (o.pfad / "CDE" / "_repo" / "global:saved-views.json").is_file()
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/repo/global:saved-views").json() == {"ok": True}
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/repo/global:saved-views").json() == {"ok": False}
    assert "global:saved-views" not in c.get(f"/FastAPI/projekte/{p['id']}/cde/repo").json()
    assert c.get(f"/FastAPI/projekte/{p['id']}/cde").json()["basis"] == f"00_Angebote/{o.ordnername}"
    with pytest.raises(cde.CdeAbgelehnt):
        cde.repo_setzen(o, "x", "y" * (cde.MAX_REPO_BYTES + 1))


def test_status_workflow_rechte(frische_db, app_conn, projekte_wurzel):
    """Luecke 4: Uebergangs-Graph + Rangschranke am Endpunkt.

    Rueckwaerts braucht Rang: Published -> Shared ist ADMIN-Sache; ein
    MITARBEITER wird abgewiesen, der Sprung ueber Stufen ebenso. ADMIN darf
    jeden Sprung (Korrektur-Eskape) — auditiert wird ohnehin.
    """
    p = projekte.anlegen(app_conn, name="Wf", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    d = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
               files={"datei": ("W.ifc", b"ISO-10303-21;", "application/octet-stream")}).json()
    sha = d["sha256"]
    url = f"/FastAPI/projekte/{p['id']}/cde/{sha}/status"
    cde.pruefung_eintragen(app_conn, ordner.finde(p["id"]), sha, {"stand": "test", "verstoesse": 0, "befunde": []},
                           akteur="pytest")                      # Stufe 4b: der Bericht muss da sein

    # Mitarbeiter: vorwaerts geht, rueckwaerts von Published nicht.
    assert c.put(url, json={"status": "Shared"}).status_code == 200
    assert c.put(url, json={"status": "Published"}).status_code == 200
    zurueck = c.put(url, json={"status": "Shared"})
    assert zurueck.status_code == 422 and "ADMIN" in zurueck.json()["detail"]

    # Admin: derselbe Wechsel geht — und sogar der Sprung.
    c.app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(role="ADMIN", username="chef")
    assert c.put(url, json={"status": "Shared"}).status_code == 200
    assert c.put(url, json={"status": "Archived"}).status_code == 200   # Sprung: nur ADMIN

    # Der Core ohne Rolle haelt den GRAPH trotzdem ein.
    import pytest as _pytest
    o = ordner.finde(p["id"])
    with _pytest.raises(cde.CdeAbgelehnt):
        cde.status_setzen(app_conn, o, sha, "WIP", akteur="test")


# ── Stufe 4 des Aushub-Fachmodells: Revisionsgrundlagen ─────────────────────

def _up(c, pid, name, inhalt, **params):
    return c.post(f"/FastAPI/projekte/{pid}/cde/upload", params=params,
                  files={"datei": (name, inhalt, "application/octet-stream")})


def test_basisname_laesst_ein_datum_am_ende_stehen():
    """Aus '6275_ENQUIER_0X_2026-08-31.ifc' wurde '..._2026-08' — der Tag galt als Revision."""
    assert cde._basisname("6275_ENQUIER_0X_2026-08-31.ifc") == "6275_ENQUIER_0X_2026-08-31"
    assert cde._basisname("Kanal_2026-08-31_R02.ifc") == "Kanal_2026-08-31"
    assert cde._basisname("Plan_20260831.pdf") == "Plan_20260831"
    assert cde._basisname("Bericht_2026-08-31_v2.pdf") == "Bericht_2026-08-31"
    # Der Bestand bleibt, wie er war.
    assert cde._basisname("Kanal_R03.ifc") == "Kanal"
    assert cde._basisname("Bruecke rev 12.ifc") == "Bruecke"
    assert cde._basisname("BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc") == "BIM26_Gruppe5_BODEN_Erdarbeiten3"


def test_ein_alter_eintrag_mit_falschem_stamm_bleibt_in_seiner_linie(frische_db, app_conn, projekte_wurzel):
    """Der Stamm wird aus dem DATEINAMEN gerechnet, nicht gelesen — und kein Eintrag wird umgeschrieben."""
    p = projekte.anlegen(app_conn, name="Datum", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    (o.pfad / "CDE").mkdir(exist_ok=True)
    (o.pfad / "CDE" / "6275_ENQUIER_0X_2026-08-31.ifc").write_bytes(b"ISO-10303-21;")
    cde._manifest_schreiben(o, {"version": 1, "projekt_id": o.id, "saetze": [], "dokumente": [
        {"sha256": "a" * 64, "datei": "6275_ENQUIER_0X_2026-08-31.ifc", "basisname": "6275_ENQUIER_0X_2026-08",
         "art": "modell", "revision": 1, "status": "WIP"}]})
    r = _up(_client(), p["id"], "6275_ENQUIER_0X_2026-08-31_R02.ifc", b"ISO-10303-21;v2")
    assert r.status_code == 201, r.json()
    assert (r.json()["revision"], r.json()["basisname"]) == (2, "6275_ENQUIER_0X_2026-08-31")
    assert {d["basisname"] for d in cde.register(o)} == {"6275_ENQUIER_0X_2026-08-31"}
    assert cde.manifest_lesen(o)["dokumente"][0]["basisname"] == "6275_ENQUIER_0X_2026-08"


KOPF = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1= IFCPROJECT('0Osfh3c9f9_PSSk12wpzoa',#2,'Boden',$,$,$,$,$,$);\n"


def test_der_server_liest_die_projekt_globalid_selbst(frische_db, app_conn, projekte_wurzel):
    """Ueber Akte und API kam jedes Modell ohne sie herein (9 von 9) — die Saetze pruefen ihre Linien zuerst darueber."""
    p = projekte.anlegen(app_conn, name="Kopf", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    assert _up(c, p["id"], "Boden.ifc", KOPF).json()["projekt_global_id"] == "0Osfh3c9f9_PSSk12wpzoa"
    # Was der Viewer schickt, gilt — er hat das Modell offen.
    r = _up(c, p["id"], "Boden_R02.ifc", KOPF + b"x", projekt_global_id="1ViewerSagtEs000000000")
    assert r.json()["projekt_global_id"] == "1ViewerSagtEs000000000"
    # Nur .ifc: ein Plan traegt keine, auch wenn die Zeichenkette darin vorkommt.
    assert _up(c, p["id"], "Plan.pdf", b"%PDF-1.4 " + KOPF).json()["projekt_global_id"] is None


def test_zwei_modelle_mit_derselben_projektkennung_sagen_warum(frische_db, app_conn, projekte_wurzel):
    """Zwei Namen, eine IFCPROJECT-GlobalId: fuer den Satz dieselbe Linie — und die Meldung nennt den Grund."""
    p = projekte.anlegen(app_conn, name="Linie", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    a = _up(c, p["id"], "Boden.ifc", KOPF).json()
    b = _up(c, p["id"], "Erdarbeiten.ifc", KOPF + b"anders").json()
    r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
               json={"name": "Beide", "zweck": "variante", "enthaelt": [a["sha256"], b["sha256"]]})
    assert r.status_code == 422 and "gleiche IFCPROJECT-GlobalId 0Osfh3c9f9_PSSk12wpzoa" in r.json()["detail"]


GELAENDE_IFC = b"ISO-10303-21;\nDATA;\n#5= IFCGEOGRAPHICELEMENT('2TestDGM0000000000TEST',#2,'Gelaende',$,$,$,$,$,.TERRAIN.);\n"


def test_entfernen_fragt_das_journal(frische_db, app_conn, projekte_wurzel):
    """1337 (2026-09-10): ein `geloescht` zeigte auf das Gelaende einer Datei, die laengst beiseite lag.

    Abgewiesen wird, was danach ins LEERE zeigte — nicht, was eine andere
    Lieferung noch traegt (R01 entfernen, waehrend R02 dieselben Kennungen hat).
    """
    p = projekte.anlegen(app_conn, name="Journal", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    d = _up(c, p["id"], "Gelaende.ifc", GELAENDE_IFC).json()
    satz = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze", json={"name": "Boden", "zweck": "variante"}).json()
    ablage = o.pfad / "CDE" / "_repo"
    ablage.mkdir(exist_ok=True)
    (ablage / f"stand:{satz['id']}:aenderungen.json").write_text(json.dumps({"version": 2, "sitzung": None, "commits": [
        {"id": "c-1", "schritte": [
            {"id": "e1", "art": "geloescht", "globalId": "2TestDGM0000000000TEST", "nachher": True},
            {"id": "e2", "art": "erzeugt", "globalId": "cde-a", "modell": "cde",
             "nachher": {"rezept": "erdbau", "parameter": {"quellen": {"gelaende": "2TestDGM0000000000TEST"}}}},
            {"id": "e3", "art": "erzeugt", "globalId": "cde-b", "modell": "cde", "nachher": {"rezept": "rohr"}}]}]}),
        encoding="utf-8")
    assert cde.journale_mit(o, d["sha256"]) == [{"ebene": "Satz Boden", "eintraege": 2}]
    weg = c.delete(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}")
    assert weg.status_code == 422 and "Satz Boden (2 Eintraege)" in weg.json()["detail"]
    assert (o.pfad / "CDE" / "Gelaende.ifc").is_file()                 # nichts verschoben
    # R02 derselben Linie traegt dieselbe Kennung: R01 darf gehen.
    _up(c, p["id"], "Gelaende_R02.ifc", GELAENDE_IFC + b"\n")
    assert cde.journale_mit(o, d["sha256"]) == []
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}").status_code == 200


def test_entfernen_sieht_auch_verdichtete_journalschritte(frische_db, app_conn, projekte_wurzel):
    """Teil XXIII A7: ein verdichteter Schritt nennt eine NEUE Quelle nur im Patch.

    Nach einem Rebase haengt der Vorgang an R02 — und genau das steht nur als
    Pfad `parameter.quellen.gelaende` im verdichteten Schritt. Die Sperre muss
    es trotzdem sehen, sonst liesse sich R02 entfernen und das Journal zeigte
    ins Leere.
    """
    p = projekte.anlegen(app_conn, name="Pfade", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    neu_ifc = GELAENDE_IFC.replace(b"2TestDGM0000000000TEST", b"3NeuesDGM000000000R02X")
    d = _up(c, p["id"], "Neu.ifc", neu_ifc).json()
    ablage = o.pfad / "CDE" / "_repo"
    ablage.mkdir(exist_ok=True)
    (ablage / "global:aenderungen.json").write_text(json.dumps({"version": 2, "mindestClient": 3, "sitzung": None, "commits": [
        {"id": "c-1", "schritte": [
            {"id": "e1", "art": "erzeugt", "globalId": "cde-a", "modell": "cde",
             "nachher": {"rezept": "erdbau", "parameter": {"quellen": {"gelaende": "2TestDGM0000000000TEST"}}}},
            {"id": "e2", "art": "erzeugt", "globalId": "cde-a", "modell": "cde",
             "nachher": {"_pfade": {"basis": "e1", "patch": [
                 {"pfad": ["parameter", "quellen", "gelaende"], "wert": "3NeuesDGM000000000R02X"}]}}}]}]}),
        encoding="utf-8")
    assert cde.journale_mit(o, d["sha256"]) == [{"ebene": "Auftrag", "eintraege": 1}]
    assert c.delete(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}").status_code == 422


def test_eine_linie_auch_wenn_nur_die_neue_revision_eine_projektkennung_traegt(frische_db, app_conn, projekte_wurzel):
    """R01 vor Stufe 4 (ohne GlobalId), R02 danach (mit): DASSELBE Modell — nicht zusammen in einen Satz.

    Mit dem alten Schluessel „GlobalId, sonst Stamm|Art" waren das zwei Linien.
    Zwei VERSCHIEDENE GlobalIds bei gleichem Stamm bleiben zwei Modelle.
    """
    p = projekte.anlegen(app_conn, name="Linie2", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    (o.pfad / "CDE").mkdir(exist_ok=True)
    for name in ("Gelaende.ifc", "Gelaende_R02.ifc", "Gelaende_R03.ifc"):
        (o.pfad / "CDE" / name).write_bytes(b"ISO-10303-21;")
    doks = [{"sha256": "a" * 64, "datei": "Gelaende.ifc", "art": "modell", "revision": 1, "status": "WIP"},
            {"sha256": "b" * 64, "datei": "Gelaende_R02.ifc", "art": "modell", "revision": 2, "status": "WIP",
             "projekt_global_id": "0Uktvit05mFcrH4auhENsK"},
            {"sha256": "c" * 64, "datei": "Gelaende_R03.ifc", "art": "modell", "revision": 3, "status": "WIP",
             "projekt_global_id": "1AnderesProjekt0000000"}]
    cde._manifest_schreiben(o, {"version": 1, "projekt_id": o.id, "dokumente": doks, "saetze": []})
    with pytest.raises(cde.CdeAbgelehnt, match="zwei Revisionen desselben Modells: Gelaende.ifc und Gelaende_R02.ifc"):
        cde._satz_pruefen(cde.manifest_lesen(o), ["a" * 64, "b" * 64])
    assert cde._satz_pruefen(cde.manifest_lesen(o), ["b" * 64, "c" * 64]) == ["b" * 64, "c" * 64]


# ── Der Kopf beim Upload (IFC-Konsistenz, Stufe 4a, 2026-09-11) ─────────────

def test_keine_ifc_datei_kommt_nicht_ins_register(frische_db, app_conn, projekte_wurzel):
    """Eine PDF mit der Endung .ifc landete bis 2026-09-11 als Modell im Register."""
    p = projekte.anlegen(app_conn, name="KopfTor", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    r = _up(c, p["id"], "Lieferung.ifc", b"%PDF-1.4\n% ISO-10303-21;\n")
    assert r.status_code == 422 and "STEP-Kopf" in r.json()["detail"], r.text
    r = _up(c, p["id"], "Paket.ifczip", b"ISO-10303-21;\nHEADER;")
    assert r.status_code == 422 and "ZIP-Kopf" in r.json()["detail"], r.text
    o = ordner.finde(p["id"])
    cde_ordner = o.pfad / "CDE"
    assert not list(cde_ordner.glob("Lieferung*")) and not list(cde_ordner.glob("Paket*"))
    assert not list(cde_ordner.glob(".tmp-*")), "abgelehnter Upload hinterliess eine Temporaerdatei"
    assert cde.manifest_lesen(o)["dokumente"] == []


def test_das_register_traegt_schema_und_einheit_aus_dem_kopf(frische_db, app_conn, projekte_wurzel):
    """Hinweise, kein Urteil: die Millimeter-Lieferung kommt herein und sagt, dass sie eine ist."""
    from pathlib import Path
    datei = Path(__file__).parents[5] / "client/src/features/cde/test/BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc"
    if not datei.is_file():
        pytest.skip("Gruppendatei liegt nicht im Baum")
    p = projekte.anlegen(app_conn, name="KopfHinweis", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    e = _up(c, p["id"], "Boden_mm.ifc", datei.read_bytes()).json()
    assert (e["schema"], e["einheit_hinweis"]) == ("IFC4X3_ADD2", "mm")
    assert e["projekt_global_id"]
    # Ein Plan traegt keine Kopfangaben — und bekommt keine erfundenen.
    plan = _up(c, p["id"], "Plan.pdf", b"%PDF-1.4 ").json()
    assert "schema" not in plan and "einheit_hinweis" not in plan
    # Die Registertests laden „ISO-10303-21;" ohne Schemazeile hoch — das bleibt erlaubt.
    kurz = _up(c, p["id"], "Kurz.ifc", b"ISO-10303-21;\nHEADER;").json()
    assert kurz["schema"] is None


def test_der_kopf_steht_einmal():
    """Die IFCPROJECT-Regel lebte hier UND im Client; jetzt in app/ifc/kopf.py (Spiegel: ModelIdentity.js)."""
    from pathlib import Path
    quelle = Path(cde.__file__).read_text(encoding="utf-8")
    assert "IFCPROJECT" not in quelle.split("def _projekt_global_id_aus")[0].split("KOPF_BYTES")[-1]
    assert "re.compile(rb\"IFCPROJECT" not in quelle


# ── Pruefbericht vor dem Teilen (IFC-Konsistenz, Stufe 4b, 2026-09-11) ──────

def test_wip_nach_shared_verlangt_einen_pruefbericht(frische_db, app_conn, projekte_wurzel):
    """Vorhanden, nicht gruen. Plaene brauchen keinen, ADMIN darf springen."""
    p = projekte.anlegen(app_conn, name="Pruefbericht", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    m = _up(c, p["id"], "Modell.ifc", b"ISO-10303-21;\nHEADER;").json()
    url = f"/FastAPI/projekte/{p['id']}/cde/{m['sha256']}/status"
    r = c.put(url, json={"status": "Shared"})
    assert r.status_code == 422 and "Pruefbericht" in r.json()["detail"], r.text
    plan = _up(c, p["id"], "Plan.pdf", b"%PDF-1.4").json()
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{plan['sha256']}/status", json={"status": "Shared"}).status_code == 200
    o = ordner.finde(p["id"])
    cde.pruefung_eintragen(app_conn, o, m["sha256"], {"stand": "t", "verstoesse": 3, "befunde": []}, akteur="pytest")
    r = c.put(url, json={"status": "Shared"})
    assert r.status_code == 200, r.text            # drei Verstoesse — geteilt wird trotzdem, der Bericht ist da
    reg = {d["sha256"]: d for d in c.get(f"/FastAPI/projekte/{p['id']}/cde").json()["dokumente"]}
    assert reg[m["sha256"]]["pruefung"]["verstoesse"] == 3
    zweites = _up(c, p["id"], "Zweites.ifc", b"ISO-10303-21;\nHEADER;v2").json()
    c.app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(role="ADMIN", username="chef")
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{zweites['sha256']}/status",
                 json={"status": "Shared"}).status_code == 200


def test_pruefbericht_regel_gleich_der_des_clients():
    """Spiegel: StatusWorkflow.js fuehrt dieselben Paare (Muster test_bezugssysteme.py)."""
    import re
    from pathlib import Path
    js = Path(__file__).parents[5] / "client/src/features/cde/services/StatusWorkflow.js"
    if not js.is_file():
        pytest.skip("Client liegt nicht im Baum")
    m = re.search(r"UEBERGANG_VERLANGT_PRUEFUNG = Object\.freeze\(\[(.*?)\]\);", js.read_text(encoding="utf-8"), re.S)
    assert m, "UEBERGANG_VERLANGT_PRUEFUNG in StatusWorkflow.js nicht gefunden"
    assert set(re.findall(r"\['(\w+)',\s*'(\w+)'\]", m.group(1))) == cde.UEBERGANG_VERLANGT_PRUEFUNG


def test_ein_ids_regelwerk_kommt_als_regelwerk_ins_register(frische_db, app_conn, projekte_wurzel):
    """Stufe 5: .ids ist ein Regelwerk — kein Modell, kein Kopf-Tor, keine Pruefbericht-Pflicht."""
    from pathlib import Path
    starter = Path(__file__).parents[3] / "ifc" / "daten" / "quagg-starter.ids"
    p = projekte.anlegen(app_conn, name="Regelwerk", honorarmodell="pauschal", akteur="pytest")
    c = _client()
    e = _up(c, p["id"], "Anforderungen.ids", starter.read_bytes()).json()
    assert e["art"] == "regelwerk" and "schema" not in e
    assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{e['sha256']}/status", json={"status": "Shared"}).status_code == 200


def test_eignung_folgt_dem_status_und_bleibt_wenn_gesetzt(frische_db, app_conn, projekte_wurzel):
    """E3 (Fahrplan Erdbau-Container): Eignung nach ISO 19650 — Vorgabe je Status, ausdruecklich gesetzt bleibt sie."""
    p = projekte.anlegen(app_conn, name="Eignung", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    url = f"/FastAPI/projekte/{p['id']}/cde"
    d = c.post(f"{url}/upload", files={"datei": ("Lageplan.pdf", b"%PDF-1.4", "application/pdf")}).json()
    assert "eignung" not in d                                            # eine WIP-Lieferung hat keine
    assert c.put(f"{url}/{d['sha256']}/status", json={"status": "Shared"}).json()["eignung"] == "S2"
    s = c.put(f"{url}/{d['sha256']}/status", json={"status": "Shared", "eignung": "S3"}).json()
    assert (s["status"], s["eignung"]) == ("Shared", "S3")               # gesetzt ohne Statuswechsel
    assert c.put(f"{url}/{d['sha256']}/status", json={"status": "Published"}).json()["eignung"] == "A1"
    assert c.put(f"{url}/{d['sha256']}/status", json={"status": "Archived", "eignung": "X9"}).status_code == 422
    assert [x.get("eignung") for x in cde.register(o)] == ["A1"]


def test_eignung_gleich_der_des_clients():
    """Spiegel: StatusWorkflow.js fuehrt dieselben Eignungs-Codes (Muster test_pruefbericht_regel_gleich_der_des_clients)."""
    import re
    from pathlib import Path
    js = Path(__file__).parents[5] / "client/src/features/cde/services/StatusWorkflow.js"
    if not js.is_file():
        pytest.skip("Client liegt nicht im Baum")
    m = re.search(r"EIGNUNG = Object\.freeze\(\{(.*?)\}\);", js.read_text(encoding="utf-8"), re.S)
    assert m, "EIGNUNG in StatusWorkflow.js nicht gefunden"
    assert dict(re.findall(r"(\w+): '([^']+)'", m.group(1))) == cde.EIGNUNG


def test_ein_aelterer_tab_ueberschreibt_kein_neueres_journal(frische_db, app_conn, projekte_wurzel):
    """Teil XXIV, Fahrplan R9: der Server-Waechter fuer `mindestClient`.

    Der Client liest ein Journal mit hoeherem `mindestClient` nur — aber erst
    seit 2026-09-18 16:05. Ein Tab von davor kennt das Feld nicht und schriebe
    eine Stufe-4-Datei mit seiner alten Lesart ueber. Vorher: 200, danach 409.
    """
    p = projekte.anlegen(app_conn, name="Waechter", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    url = f"/FastAPI/projekte/{p['id']}/cde/repo"
    stufe = lambda n: {"version": 2, **({"mindestClient": n} if n else {}), "commits": [], "sitzung": None,
                       "schreibstand": {"zaehler": 1, "marke": "m", "wer": "fabio", "wann": 0}}
    assert c.put(f"{url}/global:aenderungen", json=stufe(4)).status_code == 200

    # Ein Tab mit Stufe 2 (oder ganz ohne Feld, oder ein v1-Journal) auf eine Datei mit 4: abgelehnt, mit Grund.
    for alt in (stufe(2), stufe(0), [{"id": "e1", "art": "kg"}]):
        antwort = c.put(f"{url}/global:aenderungen", json=alt)
        assert antwort.status_code == 409, alt
        assert "Stufe 4" in antwort.json()["detail"] and "neu laden" in antwort.json()["detail"]
    assert c.get(url).json()["global:aenderungen"]["mindestClient"] == 4      # die Datei blieb, wie sie war

    # Gleich oder hoeher geht durch; dasselbe gilt fuer das Journal eines Satzes.
    assert c.put(f"{url}/global:aenderungen", json=stufe(4)).status_code == 200
    assert c.put(f"{url}/global:aenderungen", json=stufe(5)).status_code == 200
    assert c.put(f"{url}/stand:s-1:aenderungen", json=stufe(4)).status_code == 200
    assert c.put(f"{url}/stand:s-1:aenderungen", json=stufe(3)).status_code == 409

    # Andere Schluessel und Journale ohne gespeicherte Stufe sperren nichts.
    assert c.put(f"{url}/global:panel-state", json={"mindestClient": 9}).status_code == 200
    assert c.put(f"{url}/global:panel-state", json={}).status_code == 200
    assert c.put(f"{url}/stand:s-2:aenderungen", json=stufe(0)).status_code == 200
    assert c.put(f"{url}/stand:s-2:aenderungen", json=stufe(0)).status_code == 200
    # Der Kern sagt dasselbe ohne Router.
    with pytest.raises(cde.CdeZuAlt):
        cde.repo_setzen(o, "global:aenderungen", stufe(3))


def test_unlesbare_ablage_ist_nicht_leer(frische_db, app_conn, projekte_wurzel, caplog):
    """Tragfaehig, T4: eine unlesbare Repo-Datei war fuer den Client „nicht da".

    Vorher: der Schluessel fehlte im GET, der Client startete leer, und der
    Journal-Waechter liess den naechsten PUT ueber die kaputte Datei. Jetzt
    nennt der GET sie unter `@unlesbar`, das Log sagt welche, und ein Journal
    wird nicht ueberschrieben.
    """
    p = projekte.anlegen(app_conn, name="Unlesbar", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    url = f"/FastAPI/projekte/{p['id']}/cde/repo"
    assert c.put(f"{url}/global:panel-state", json={"offen": True}).status_code == 200
    ablage = o.pfad / "CDE" / "_repo"
    (ablage / "global:aenderungen.json").write_text('{"version": 2, "commits": [', encoding="utf-8")

    with caplog.at_level("WARNING"):
        stand = c.get(url).json()
    assert stand["@unlesbar"] == ["global:aenderungen"]
    assert stand["global:panel-state"] == {"offen": True}                    # das Lesbare bleibt lesbar
    assert "global:aenderungen" not in stand
    assert any("unlesbar" in r.getMessage() for r in caplog.records)

    antwort = c.put(f"{url}/global:aenderungen", json={"version": 2, "commits": [], "sitzung": None})
    assert antwort.status_code == 409 and "unlesbar" in antwort.json()["detail"]
    assert (ablage / "global:aenderungen.json").read_text(encoding="utf-8") == '{"version": 2, "commits": ['
    # Andere Schluessel schreibt man weiter; ohne kaputte Datei faellt die Meldung weg.
    assert c.put(f"{url}/global:panel-state", json={}).status_code == 200
    (ablage / "global:aenderungen.json").unlink()
    assert "@unlesbar" not in c.get(url).json()
    # `@` kann kein echter Schluessel sein.
    assert c.put(f"{url}/@unlesbar", json=[]).status_code == 422


def test_entfernen_mit_unlesbarem_journal_wird_abgewiesen(frische_db, app_conn, projekte_wurzel):
    """T4: ein unlesbares Journal kann an der Datei haengen — ungeprueft heisst nicht „haengt nicht"."""
    p = projekte.anlegen(app_conn, name="Journal kaputt", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    c = _client()
    d = _up(c, p["id"], "Gelaende.ifc", GELAENDE_IFC).json()
    ablage = o.pfad / "CDE" / "_repo"
    ablage.mkdir(exist_ok=True)
    (ablage / "global:aenderungen.json").write_text("{kaputt", encoding="utf-8")
    weg = c.delete(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}")
    assert weg.status_code == 422 and "unlesbar" in weg.json()["detail"]
    assert (o.pfad / "CDE" / "Gelaende.ifc").is_file()                      # vorher: verschoben
