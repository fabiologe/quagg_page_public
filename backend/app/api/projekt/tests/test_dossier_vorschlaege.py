"""Stufe 7a: Dossier, Vorschlaege, MCP-Werkzeuge (reine Funktionen)."""

import sqlite3
from datetime import date, timedelta

import pytest

from app.api.projekt.core import abschnitte, dossier, mcp_werkzeuge, ordner, projekte, vorschlaege


def _projekt(conn, **ueber):
    felder = dict(name="Regenrückhaltebecken Nord", honorarmodell="hoai", akteur="pytest",
                  kurzname="RRB Nord", lph=[1, 2, 3])
    felder.update(ueber)
    return projekte.anlegen(conn, **felder)


@pytest.fixture()
def mail_db(tmp_path, monkeypatch):
    pfad = tmp_path / "quagg.db"
    c = sqlite3.connect(pfad)
    c.execute("CREATE TABLE email_events (id INTEGER PRIMARY KEY, subject TEXT, sender TEXT,"
              " received_at TEXT, project_id INTEGER)")
    c.executemany("INSERT INTO email_events (subject, sender, received_at, project_id) VALUES (?, ?, ?, ?)", [
        ("Bauzeitenplan RRB", "bauamt@muster.de", "2026-08-20 09:15:00", 0),
        ("Nachtrag Vermessung", "vermessung@muster.de", "2026-08-22 14:00:00", 0),
        ("Fremdes Projekt", "x@y.de", "2026-08-23 10:00:00", 999999),
    ])
    c.commit()
    c.close()
    monkeypatch.setenv("QUAGG_SQLITE_PFAD", str(pfad))
    return pfad


def test_dossier_enthaelt_alle_bereiche(frische_db, app_conn, projekte_wurzel, mail_db):
    p = _projekt(app_conn)
    pid = p["id"]
    sqlite3.connect(mail_db).execute("UPDATE email_events SET project_id = ? WHERE project_id = 0", (pid,)).connection.commit()
    abschnitte.aus_vorlage(app_conn, pid, paragraf="43", honorar_cent=80_000_00, beauftragt=[1, 2, 3], akteur="pytest")
    projekte.beteiligter_anlegen(app_conn, pid, rolle="bauherr", name="Stadt Musterhausen", akteur="pytest")
    projekte.meilenstein_anlegen(app_conn, pid, art="abgabe", bezeichnung="Vorentwurf",
                                 faellig_am=date.today() - timedelta(days=2), akteur="pytest")
    o = ordner.finde(pid)
    (o.pfad / "03_Schriftverkehr" / "Anschreiben.txt").write_text("Sehr geehrte Damen und Herren", encoding="utf-8")
    (o.pfad / ordner.AKTE / "geheim.txt").write_text("intern", encoding="utf-8")
    vorschlaege.anlegen(app_conn, pid, art="notiz", nutzlast={"text": "Bauamt will Termin"}, begruendung="aus Mail")

    text, pfad = dossier.schreiben(app_conn, pid)
    assert pfad == o.pfad / ordner.AKTE / "DOSSIER.md" and pfad.read_text(encoding="utf-8") == text
    for erwartet in (f"# Projektakte #P{pid} — Regenrückhaltebecken Nord", "Phase: 00_Angebote",
                     "## Stammdaten", "Leistungsbild § 43", "## Beteiligte", "bauherr: Stadt Musterhausen",
                     "## Leistungsstand", "| 1 | LPH 1 Grundlagenermittlung | grund |",
                     "## Honorarhistorie", "Vorlage § 43", "## Termine und Fristen", "Vorentwurf ÜBERFÄLLIG",
                     "## E-Mails", "Nachtrag Vermessung", "Bauzeitenplan RRB",
                     "## Dokumente", "03_Schriftverkehr/ (1 Dateien)", "Anschreiben.txt",
                     "## Offene KI-Vorschläge", "Bauamt will Termin"):
        assert erwartet in text, erwartet
    assert "Fremdes Projekt" not in text
    assert "geheim" not in text and "_akte" not in text
    assert len(text) < 20_000


def test_vorschlaege_lebenszyklus(frische_db, app_conn, projekte_wurzel):
    p = _projekt(app_conn, name="Vorschläge", honorarmodell="pauschal", lph=[])
    pid = p["id"]
    a = abschnitte.anlegen(app_conn, pid, bezeichnung="Entwurf", honorar_cent=10_000_00, akteur="pytest")
    with pytest.raises(vorschlaege.VorschlagAbgelehnt):
        vorschlaege.anlegen(app_conn, pid, art="wunsch", nutzlast={"x": 1}, begruendung="")
    with pytest.raises(projekte.ProjektUnbekannt):
        vorschlaege.anlegen(app_conn, 999999, art="notiz", nutzlast={"text": "x"}, begruendung="")

    t = vorschlaege.anlegen(app_conn, pid, art="termin", begruendung="Bindefrist laut Angebot",
                            nutzlast={"art": "bindefrist", "bezeichnung": "Angebot gilt bis", "faellig_am": "2027-03-01"})
    f = vorschlaege.anlegen(app_conn, pid, art="fortschritt", begruendung="Entwurf abgegeben",
                            nutzlast={"abschnitt_id": a["id"], "fortschritt_prozent": 80})
    n = vorschlaege.anlegen(app_conn, pid, art="notiz", begruendung="", nutzlast={"text": "Bauherr wünscht Variante B"})
    g = vorschlaege.anlegen(app_conn, pid, art="aufgabe", begruendung="", nutzlast={"titel": "Anruf Bauamt"})
    assert projekte.lesen(app_conn, pid)["vorschlaege"].__len__() == 4
    assert projekte.liste(app_conn)[0]["vorschlaege_offen"] == 4
    assert projekte.kennzahlen(app_conn)["vorschlaege_offen"] >= 4   # Modul-DB ist geteilt: relativ zaehlen

    ok = vorschlaege.entscheiden(app_conn, pid, t["id"], entscheidung="uebernehmen", akteur="fabio")
    assert ok["status"] == "uebernommen" and ok["ergebnis"].startswith("meilenstein ")
    akte = projekte.lesen(app_conn, pid)
    assert akte["meilensteine"][0]["bezeichnung"] == "Angebot gilt bis"
    vorschlaege.entscheiden(app_conn, pid, f["id"], entscheidung="uebernehmen", akteur="fabio")
    akte = projekte.lesen(app_conn, pid)
    assert akte["abschnitte"][0]["fortschritt_prozent"] == 80
    vorschlaege.entscheiden(app_conn, pid, n["id"], entscheidung="uebernehmen", akteur="fabio")
    assert "Variante B" in projekte.lesen(app_conn, pid)["notiz"]
    ok = vorschlaege.entscheiden(app_conn, pid, g["id"], entscheidung="uebernehmen", akteur="fabio")
    assert ok["ergebnis"].startswith("aufgabe ")             # seit Stufe 3 uebernehmbar
    with pytest.raises(vorschlaege.VorschlagAbgelehnt):      # schon entschieden
        vorschlaege.entscheiden(app_conn, pid, g["id"], entscheidung="verwerfen", akteur="fabio")
    w = vorschlaege.anlegen(app_conn, pid, art="notiz", begruendung="", nutzlast={"text": "weg damit"})
    v = vorschlaege.entscheiden(app_conn, pid, w["id"], entscheidung="verwerfen", akteur="fabio")
    assert v["status"] == "verworfen"
    with pytest.raises(vorschlaege.VorschlagUnbekannt):
        vorschlaege.entscheiden(app_conn, pid, 999999, entscheidung="verwerfen", akteur="fabio")
    assert vorschlaege.liste(app_conn, projekt_id=pid, status="offen") == []
    assert len(vorschlaege.liste(app_conn, projekt_id=pid, status=None)) == 5
    # kaputte Nutzlast -> 422, nicht 500
    k = vorschlaege.anlegen(app_conn, pid, art="termin", begruendung="", nutzlast={"bezeichnung": "ohne datum"})
    with pytest.raises(vorschlaege.VorschlagAbgelehnt):
        vorschlaege.entscheiden(app_conn, pid, k["id"], entscheidung="uebernehmen", akteur="fabio")


def test_mcp_werkzeuge(frische_db, app_conn, projekte_wurzel):
    p = _projekt(app_conn, name="MCP")
    pid = p["id"]
    projekte.meilenstein_anlegen(app_conn, pid, art="termin", bezeichnung="Ortstermin",
                                 faellig_am=date.today() + timedelta(days=5), akteur="pytest")
    assert any(z["id"] == pid and z["phase"] == "00_Angebote" for z in mcp_werkzeuge.liste(app_conn))
    t = mcp_werkzeuge.termine(app_conn, 30)
    assert any(x["bezeichnung"] == "Ortstermin" and x["tage"] == 5 for x in t)
    assert mcp_werkzeuge.termine(app_conn, 2) == [x for x in t if x["tage"] <= 2]
    assert "abschnitte" in mcp_werkzeuge.leistung(app_conn, pid)

    o = ordner.finde(pid)
    (o.pfad / "01_Grundlagen" / "notiz.md").write_text("# Grundlagen\nBestand vermessen.", encoding="utf-8")
    import fitz
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "Bodengutachten Seite eins")
    doc.save(o.pfad / "01_Grundlagen" / "gutachten.pdf")
    wurzel = mcp_werkzeuge.dokumente(pid)
    assert [e["name"] for e in wurzel if e["typ"] == "ordner"] == list(ordner.TEMPLATE)
    assert all(e["name"] != ordner.AKTE for e in wurzel)
    unten = mcp_werkzeuge.dokumente(pid, "01_Grundlagen")
    assert {e["name"] for e in unten} == {"notiz.md", "gutachten.pdf"}
    assert "Bestand vermessen" in mcp_werkzeuge.dokument_lesen(pid, "01_Grundlagen/notiz.md")
    assert "Bodengutachten" in mcp_werkzeuge.dokument_lesen(pid, "01_Grundlagen/gutachten.pdf")
    with pytest.raises(PermissionError):
        mcp_werkzeuge.dokumente(pid, "../")
    with pytest.raises(PermissionError):
        mcp_werkzeuge.dokument_lesen(pid, "_akte/akte.yaml")
    with pytest.raises(FileNotFoundError):
        mcp_werkzeuge.dokument_lesen(pid, "01_Grundlagen/fehlt.txt")
    (o.pfad / "01_Grundlagen" / "x.docx").write_bytes(b"PK")
    with pytest.raises(RuntimeError):
        mcp_werkzeuge.dokument_lesen(pid, "01_Grundlagen/x.docx")   # Office-Formate erst mit Stufe 5
    v = mcp_werkzeuge.vorschlag(app_conn, pid, art="notiz", nutzlast={"text": "aus MCP"}, begruendung="Test")
    assert v["status"] == "offen"
    assert "aus MCP" in mcp_werkzeuge.dossier_text(app_conn, pid)
