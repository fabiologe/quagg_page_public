"""Projektakte: DB und Ordner im Verbund (Test-DB + tmp-Wurzel)."""

from datetime import date, timedelta

import pytest

from app.api.projekt.core import akte, ordner, projekte


def _anlegen(conn, **ueber):
    felder = dict(name="Kanal Musterhausen", honorarmodell="hoai", akteur="pytest")
    felder.update(ueber)
    return projekte.anlegen(conn, **felder)


def test_anlegen_schreibt_zeile_ordner_und_akte(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn, lph=[1, 2, 3], kurzname="Kanal MH")
    assert p["id"] >= ordner.MINDESTNUMMER
    assert p["ordnername"] == f"{p['id']}_Kanal_MH"
    assert p["phase"] == "00_Angebote" and p["ordner_vorhanden"] is True
    o = ordner.finde(p["id"])
    assert (o.pfad / "02_Planung" / "LPH3_Entwurfsplanung").is_dir()
    gelesen = akte.lesen(o)
    assert gelesen["name"] == "Kanal Musterhausen" and gelesen["phase"] == "00_Angebote"
    # Nummernkreis: zweites Projekt bekommt die naechste Nummer
    q = _anlegen(app_conn, name="Zweites")
    assert q["id"] == p["id"] + 1
    audit = app_conn.execute(
        "SELECT aktion, detail FROM projekt.auditlog ORDER BY id DESC LIMIT 1").fetchone()
    assert audit[0] == "projekt_anlegen" and audit[1]["id"] == q["id"]


def test_nummernkreis_respektiert_fremde_ordner(frische_db, app_conn, projekte_wurzel):
    (projekte_wurzel / "01_Laufend" / "4711_Bestand").mkdir()
    p = _anlegen(app_conn)
    assert p["id"] == 4712


def test_dateisystem_fehler_rollt_db_zurueck(frische_db, app_conn, projekte_wurzel, monkeypatch):
    vorher = app_conn.execute("SELECT count(*) FROM projekt.projekte").fetchone()[0]

    def kaputt(*a, **k):
        raise OSError("storagebox weg")
    monkeypatch.setattr(ordner, "anlegen", kaputt)
    with pytest.raises(OSError):
        _anlegen(app_conn)
    app_conn.rollback()
    nachher = app_conn.execute("SELECT count(*) FROM projekt.projekte").fetchone()[0]
    assert nachher == vorher


def test_verschieben_aendert_phase_ueber_ordnerlage(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn)
    v = projekte.verschieben(app_conn, p["id"], "01_Laufend", akteur="pytest")
    assert v["phase"] == "01_Laufend"
    assert ordner.finde(p["id"]).phase == "01_Laufend"
    assert akte.lesen(ordner.finde(p["id"]))["phase"] == "01_Laufend"
    with pytest.raises(ordner.OrdnerFehler):
        projekte.verschieben(app_conn, p["id"], "99_Nix", akteur="pytest")
    with pytest.raises(projekte.ProjektUnbekannt):
        projekte.verschieben(app_conn, 999999, "01_Laufend", akteur="pytest")


def test_abgleich_meldet_beide_richtungen(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn, name="Mit Ordner")
    (projekte_wurzel / "01_Laufend" / "8000_Nur_Ordner").mkdir()
    o = ordner.finde(p["id"])
    o.pfad.rename(projekte_wurzel / "01_Laufend" / "verschollen")   # Nummer weg -> Akte ohne Ordner
    bericht = projekte.abgleich(app_conn)
    assert any(z["id"] == 8000 for z in bericht["ordner_ohne_akte"])
    assert any(z["id"] == p["id"] for z in bericht["akte_ohne_ordner"])
    kz = projekte.kennzahlen(app_conn)
    assert kz["ohne_ordner"] >= 1 and kz["ordner_ohne_akte"] >= 1
    # Uebernahme des Bestandsordners
    u = projekte.uebernehmen(app_conn, 8000, name="Bestand", honorarmodell="stunden", akteur="pytest")
    assert u["phase"] == "01_Laufend" and u["ordnername"] == "8000_Nur_Ordner"
    assert (projekte_wurzel / "01_Laufend" / "8000_Nur_Ordner" / ordner.AKTE / "akte.yaml").is_file()
    with pytest.raises(projekte.ProjektAbgelehnt):
        projekte.uebernehmen(app_conn, 8000, name="x", honorarmodell="stunden", akteur="pytest")


def test_aendern_beteiligte_meilensteine(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn, name="Bruecke")
    pid = p["id"]
    g = projekte.aendern(app_conn, pid, {"honorarmodell": "stunden", "stundensatz_cent": 9500,
                                        "budget_stunden": 120}, akteur="pytest")
    assert g["honorarmodell"] == "stunden" and g["stundensatz_cent"] == 9500
    with pytest.raises(projekte.ProjektAbgelehnt):
        projekte.aendern(app_conn, pid, {"ordnername": "hack"}, akteur="pytest")
    with pytest.raises(projekte.ProjektAbgelehnt):
        projekte.aendern(app_conn, pid, {"honorarmodell": "gratis"}, akteur="pytest")
    with pytest.raises(projekte.ProjektUnbekannt):
        projekte.aendern(app_conn, 999999, {"name": "x"}, akteur="pytest")

    b = projekte.beteiligter_anlegen(app_conn, pid, rolle="bauherr", name="Stadt Musterhausen",
                                     kontakt="bau@muster.de", akteur="pytest")
    assert b["beteiligte"][0]["rolle"] == "bauherr"
    bid = b["beteiligte"][0]["id"]
    b = projekte.beteiligter_aendern(app_conn, pid, bid, {"rolle": "auftraggeber"}, akteur="pytest")
    assert b["beteiligte"][0]["rolle"] == "auftraggeber"
    with pytest.raises(projekte.ProjektAbgelehnt):
        projekte.beteiligter_anlegen(app_conn, pid, rolle="chef", name="x", akteur="pytest")

    bald = date.today() + timedelta(days=3)
    m = projekte.meilenstein_anlegen(app_conn, pid, art="abgabe", bezeichnung="Entwurf",
                                     faellig_am=bald, akteur="pytest")
    mid = m["meilensteine"][0]["id"]
    assert projekte.kennzahlen(app_conn)["faellig"] >= 1
    assert projekte.liste(app_conn)[0]["naechster_termin"] == bald
    m = projekte.meilenstein_aendern(app_conn, pid, mid, {"erledigt_am": date.today()}, akteur="pytest")
    assert m["meilensteine"][0]["erledigt_am"] == date.today()
    gelesen = akte.lesen(ordner.finde(pid))
    assert gelesen["beteiligte"][0]["name"] == "Stadt Musterhausen"
    assert gelesen["meilensteine"][0]["bezeichnung"] == "Entwurf"
    m = projekte.meilenstein_loeschen(app_conn, pid, mid, akteur="pytest")
    assert m["meilensteine"] == []
    b = projekte.beteiligter_loeschen(app_conn, pid, bid, akteur="pytest")
    assert b["beteiligte"] == []


def test_projekt_verschwindet_nie(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn)
    app_conn.rollback()
    with pytest.raises(Exception):
        with app_conn.transaction():
            app_conn.execute("DELETE FROM projekt.projekte WHERE id = %s", (p["id"],))
    app_conn.rollback()


def test_abschluss_legt_fristen_an(frische_db, app_conn, projekte_wurzel):
    p = _anlegen(app_conn, name="Fertig")
    a = projekte.verschieben(app_conn, p["id"], "03_Abgeschlossen", akteur="pytest")
    arten = sorted(m["art"] for m in a["meilensteine"])
    assert arten == ["aufbewahrung", "gewaehrleistung"]
    g = next(m for m in a["meilensteine"] if m["art"] == "gewaehrleistung")
    assert g["faellig_am"].year == date.today().year + 5
    # zurueck und nochmal: keine Duplikate
    projekte.verschieben(app_conn, p["id"], "01_Laufend", akteur="pytest")
    a = projekte.verschieben(app_conn, p["id"], "03_Abgeschlossen", akteur="pytest")
    assert len(a["meilensteine"]) == 2
