"""Stufe 4: Verzahnung mit dem Pedanten — Planzeile, Abschlag, Belege, Balken-Schichten."""

from datetime import date

import pytest

from app.api.pedant.core import belege as ped_belege, geldsichten, rechnungen as ped_rechnungen, stammdaten
from app.api.pedant.core.ablage import AblageErgebnis
from app.api.projekt.core import abschnitte, geld, projekte

LEITWEG = "04011000-12345-03"


def _auftraggeber(conn) -> int:
    return stammdaten.auftraggeber_anlegen(conn, akteur="pytest", felder={
        "name": "Stadt Musterhausen", "strasse": "Rathausplatz 1", "plz": "55116", "ort": "Mainz",
        "leitweg_id": LEITWEG, "portal": "zre_rlp", "email": "rechnung@muster.de"})["id"]


def _projekt(conn, projekte_wurzel, ag_id, **ueber):
    felder = dict(name="Kanal Musterhausen", honorarmodell="hoai", akteur="pytest",
                  phase="01_Laufend", auftraggeber_id=ag_id)
    felder.update(ueber)
    return projekte.anlegen(conn, **felder)


def test_brutto_und_kostenmerkmal():
    assert geld.brutto(100_00) == 119_00
    assert geld.brutto(1) == 1            # (1*119+50)//100 = 1
    assert geld.kostenmerkmal(1338) == "#P1338"


def test_planzeile_folgt_dem_honorar(frische_db, app_conn, projekte_wurzel):
    ag = _auftraggeber(app_conn)
    p = _projekt(app_conn, projekte_wurzel, ag)
    assert geld.planzeile_lesen(app_conn, p["id"]) is None          # ohne Honorar keine Planzeile
    abschnitte.aus_vorlage(app_conn, p["id"], paragraf="43", honorar_cent=100_000_00,
                           beauftragt=[1, 2, 3], akteur="pytest")
    projekte.abschnitt_aktion(app_conn, p["id"], lambda: None)       # loest den Sync aus
    z = geld.planzeile_lesen(app_conn, p["id"])
    assert z["betrag_cent"] == geld.brutto(47_000_00) and z["status"] == "beauftragt"
    assert z["bezeichnung"].startswith(f"#P{p['id']} ")
    # Phase Angebot -> angeboten; Ablehnung -> entfallen
    projekte.verschieben(app_conn, p["id"], "00_Angebote", akteur="pytest")
    assert geld.planzeile_lesen(app_conn, p["id"])["status"] == "angeboten"
    projekte.verschieben(app_conn, p["id"], "04_Abgelehnt", akteur="pytest")
    assert geld.planzeile_lesen(app_conn, p["id"])["status"] == "entfallen"
    # nur EINE Planzeile je Projekt, auch nach vielen Syncs
    anzahl = app_conn.execute("SELECT count(*) FROM erwartetes_geld WHERE projekt_id = %s", (p["id"],)).fetchone()[0]
    assert anzahl == 1
    assert any(e["projekt_id"] == p["id"] for e in geldsichten.erwartet_liste(app_conn, mit_erledigten=True))


def test_abschlag_aus_leistungsstand(frische_db, app_conn, projekte_wurzel):
    ag = _auftraggeber(app_conn)
    p = _projekt(app_conn, projekte_wurzel, ag, name="RRB Süd")
    pid = p["id"]
    abschnitte.aus_vorlage(app_conn, pid, paragraf="43", honorar_cent=100_000_00,
                           beauftragt=[1, 2, 3], akteur="pytest")
    a = projekte.lesen(app_conn, pid)["abschnitte"]
    abschnitte.aendern(app_conn, pid, a[0]["id"], {"fortschritt_prozent": 100}, akteur="pytest")
    abschnitte.aendern(app_conn, pid, a[1]["id"], {"fortschritt_prozent": 50}, akteur="pytest")
    akte = projekte.lesen(app_conn, pid)
    v = geld.abschlag_vorschlag(app_conn, pid, akte["abschnitte"])
    assert v["nummer"] == 1
    assert [x["einzelpreis_cent"] for x in v["positionen"]] == [2_000_00, 10_000_00]
    assert v["summe_netto_cent"] == 12_000_00
    assert akte["geld"]["unabgerechnet_cent"] == 12_000_00

    r = geld.abschlag_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 1, 1))
    assert r["status"] == "entwurf" and r["netto_cent"] == 12_000_00 and r["projekt_id"] == pid
    assert r["positionen"][0]["abschnitt_id"] == a[0]["id"]
    assert r["positionen"][0]["bezeichnung"].startswith("1. Abschlag: LPH 1")
    # Entwurf zaehlt noch nicht als gestellt: Vorschlag bleibt gleich, Entwurf sichtbar
    stand = geld.stand(app_conn, pid, akte["fortschritt"])
    assert stand["summen"]["entwurf_netto_cent"] == 12_000_00
    assert stand["summen"]["gestellt_netto_cent"] == 0
    assert stand["rechnungen"][0]["id"] == r["id"] and stand["rechnungen"][0]["netto_cent"] == 12_000_00
    # Simulation "gestellt": Status/Snapshot direkt setzen (KoSIT-Weg ist im Pedanten getestet)
    from app.api.pedant.core import journal
    buchung = journal.buchung_anlegen(app_conn, akteur="pytest", buchungsdatum=date.today(),
                                      belegdatum=date.today(), sollkonto="1200", habenkonto="4400",
                                      betrag_cent=1428000, buchungstext="AR Abschlag Test")
    app_conn.rollback()
    with app_conn.transaction():
        app_conn.execute(
            "UPDATE rechnungen SET re_jahr = 2027, re_lfd = 1, leitweg_id = %s, netto_cent = 1200000,"
            " steuer_cent = 228000, brutto_cent = 1428000, gestellt_am = now(), xml_pfad = 'x',"
            " xml_sha256 = repeat('a', 64), bericht_pfad = 'b', buchung_lfd_nr = %s, status = 'gestellt'"
            " WHERE id = %s", (LEITWEG, buchung["lfd_nr"], r["id"]))
    abschnitte.aendern(app_conn, pid, a[1]["id"], {"fortschritt_prozent": 80}, akteur="pytest")
    akte = projekte.abschnitt_aktion(app_conn, pid, lambda: None)   # Sync der Planzeile
    v2 = geld.abschlag_vorschlag(app_conn, pid, akte["abschnitte"])
    assert v2["nummer"] == 2
    assert [(x["abschnitt_id"], x["einzelpreis_cent"]) for x in v2["positionen"]] == [(a[1]["id"], 6_000_00)]
    assert akte["geld"]["gestellt_netto_cent"] == 12_000_00 and akte["geld"]["unabgerechnet_cent"] == 6_000_00
    assert geld.planzeile_lesen(app_conn, pid)["bereits_gestellt_cent"] == 14_280_00
    assert geld.planzeile_lesen(app_conn, pid)["status"] == "teilweise_gestellt"
    liste = {z["id"]: z for z in projekte.liste(app_conn)}
    assert liste[pid]["geld"]["unabgerechnet_cent"] == 6_000_00
    assert projekte.kennzahlen(app_conn)["unabgerechnet_cent"] >= 6_000_00
    # projekt_id nach dem Stellen eingefroren
    with pytest.raises(Exception):
        with app_conn.transaction():
            app_conn.execute("UPDATE rechnungen SET projekt_id = 1 WHERE id = %s", (r["id"],))
    app_conn.rollback()


def test_abschlag_ablehnungen(frische_db, app_conn, projekte_wurzel):
    ag = _auftraggeber(app_conn)
    ohne_ag = _projekt(app_conn, projekte_wurzel, ag, name="Ohne AG", auftraggeber_id=None, honorarmodell="pauschal")
    abschnitte.anlegen(app_conn, ohne_ag["id"], bezeichnung="Pauschale", honorar_cent=5_000_00,
                       fortschritt_prozent=50, akteur="pytest")
    with pytest.raises(geld.GeldAbgelehnt):
        geld.abschlag_anlegen(app_conn, projekte.lesen(app_conn, ohne_ag["id"]), akteur="pytest",
                              leistung_von=date(2027, 1, 1))
    nix = _projekt(app_conn, projekte_wurzel, ag, name="Nichts fällig", honorarmodell="pauschal")
    with pytest.raises(geld.GeldAbgelehnt):
        geld.abschlag_anlegen(app_conn, projekte.lesen(app_conn, nix["id"]), akteur="pytest",
                              leistung_von=date(2027, 1, 1))


def test_belege_ueber_kostenmerkmal(frische_db, app_conn, projekte_wurzel, beleg_wurzel):
    ag = _auftraggeber(app_conn)
    p = _projekt(app_conn, projekte_wurzel, ag, name="Belege")
    b = ped_belege.beleg_anlegen(app_conn, akteur="pytest", ergebnis=AblageErgebnis(
        sha256="f" * 64, relativ="2027/ffff.pdf", mime_typ="application/pdf",
        groesse_bytes=10, original_name="bon.pdf"))
    ped_belege.felder_speichern(app_conn, beleg_id=b["id"], akteur="pytest", lieferant="Vermessung GmbH",
                                belegdatum=date(2027, 2, 1), netto_cent=1_000_00, steuersatz=19,
                                brutto_cent=1_190_00)
    assert [x["id"] for x in ped_belege.belege_liste(app_conn, kostenmerkmal="")] == [b["id"]]
    ped_belege.kostenmerkmal_setzen(app_conn, beleg_id=b["id"], kostenmerkmal=geld.kostenmerkmal(p["id"]),
                                    akteur="pytest")
    stand = geld.stand(app_conn, p["id"], {"leistung_cent": 0})
    assert stand["belege"][0]["lieferant"] == "Vermessung GmbH"
    assert stand["summen"]["fremdkosten_brutto_cent"] == 1_190_00
    assert ped_belege.belege_liste(app_conn, kostenmerkmal="") == []
    ped_belege.kostenmerkmal_setzen(app_conn, beleg_id=b["id"], kostenmerkmal="", akteur="pytest")
    assert geld.stand(app_conn, p["id"], {"leistung_cent": 0})["belege"] == []
    with pytest.raises(ped_belege.BelegAbgelehnt):
        ped_belege.kostenmerkmal_setzen(app_conn, beleg_id=999999, kostenmerkmal="#P1", akteur="pytest")


def test_schlussrechnung_aus_leistungsstand(frische_db, app_conn, projekte_wurzel, monkeypatch):
    from app.api.pedant.core import kosit, rechnungen as ped, stammdaten
    from app.api.pedant.tests.fixtures_rechnung import FIRMA
    monkeypatch.setattr(ped.kosit, "validieren", lambda xml: kosit.KositBericht(
        valide=True, meldungen=[], report_xml=b"<r/>", report_html=b"<html>ok</html>"))
    stammdaten.firmendaten_speichern(app_conn, felder=dict(FIRMA), akteur="pytest")
    ag = _auftraggeber(app_conn)
    p = _projekt(app_conn, projekte_wurzel, ag, name="Schluss", honorarmodell="pauschal")
    pid = p["id"]
    a = abschnitte.anlegen(app_conn, pid, bezeichnung="Entwurf", honorar_cent=20_000_00, fortschritt_prozent=50, akteur="pytest")
    akte = projekte.lesen(app_conn, pid)
    r1 = geld.abschlag_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 1, 1))
    assert r1["rechnungstyp"] == "326"
    ped.stellen(app_conn, rechnung_id=r1["id"], akteur="pytest")                       # echter Stellen-Pfad (KoSIT gestubbt)
    abschnitte.aendern(app_conn, pid, a["id"], {"fortschritt_prozent": 100, "status": "fertig"}, akteur="pytest")
    akte = projekte.lesen(app_conn, pid)
    assert akte["geld"]["gestellt_netto_cent"] == 10_000_00 and akte["geld"]["unabgerechnet_cent"] == 10_000_00
    v = geld.schlussrechnung_vorschlag(app_conn, pid, akte["abschnitte"])
    assert v["summe_netto_cent"] == 20_000_00 and v["vorab_cent"] == 11_900_00 and v["zahlbar_cent"] == 23_800_00 - 11_900_00
    assert [x["id"] for x in v["vorrechnungen"]] == [r1["id"]]
    s = geld.schlussrechnung_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 1, 1))
    assert s["rechnungstyp"] == "380" and s["vorab_cent"] == 11_900_00 and s["zahlbar_cent"] == 11_900_00
    assert [x["id"] for x in s["vorrechnungen"]] == [r1["id"]]
    ped.stellen(app_conn, rechnung_id=s["id"], akteur="pytest")
    akte = projekte.lesen(app_conn, pid)
    # kein Doppelzaehlen: der Abschlag ist in der Schlussrechnung aufgegangen
    assert akte["geld"]["gestellt_netto_cent"] == 20_000_00 and akte["geld"]["unabgerechnet_cent"] == 0
    assert geld.abschlag_vorschlag(app_conn, pid, akte["abschnitte"])["positionen"] == []
    rl = geld.rechnungen_des_projekts(app_conn, pid)
    assert next(r for r in rl if r["id"] == r1["id"])["abgerechnet_in_schluss"] is True
    akte = projekte.abschnitt_aktion(app_conn, pid, lambda: None)                      # Planzeilen-Sync
    assert geld.planzeile_lesen(app_conn, pid)["bereits_gestellt_cent"] == 23_800_00
    with pytest.raises(geld.GeldAbgelehnt):                                              # nichts mehr offen
        geld.schlussrechnung_anlegen(app_conn, akte, akteur="pytest", leistung_von=date(2027, 1, 1))
