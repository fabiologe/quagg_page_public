"""Kontoabgleich: Import-Dedup, Vorschlaege, Zuordnen (Buchung+bezahlt),
Beleg-Abhaken ohne Doppelbuchung, Loesen per Storno, Auto-Abgleich, Trigger."""

import hashlib
from datetime import date

import pytest
from psycopg import errors

from app.api.pedant.core import (abgleich, hashkette, journal, kosit,
                                 rechnungen, stammdaten)
from app.api.pedant.core import belege as belegmodul
from app.api.pedant.core.ablage import AblageErgebnis
from app.api.pedant.core.bankimport import Bewegung
from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA

HEUTE = date.today()


@pytest.fixture()
def bereit(app_conn, rechnung_wurzel, beleg_wurzel, monkeypatch):
    monkeypatch.setattr(rechnungen.kosit, "validieren", lambda xml: kosit.KositBericht(
        valide=True, meldungen=[], report_xml=b"<r/>",
        report_html=b"<!DOCTYPE html><html>ok</html>"))
    stammdaten.firmendaten_speichern(app_conn, felder=dict(FIRMA), akteur="pytest")
    return stammdaten.auftraggeber_anlegen(app_conn, felder=dict(AUFTRAGGEBER),
                                           akteur="pytest")


def gestellte_rechnung(conn, ag, preis_cent=123_000):
    neu = rechnungen.rechnung_anlegen(conn, felder=dict(
        auftraggeber_id=ag["id"], rechnungsdatum=HEUTE,
        leistung_von=HEUTE.replace(day=1), leistung_bis=HEUTE), akteur="pytest")
    rechnungen.positionen_speichern(conn, rechnung_id=neu["id"], positionen=[
        {"bezeichnung": "Leistung", "menge_tausendstel": 1_000,
         "einheit": "C62", "einzelpreis_cent": preis_cent}], akteur="pytest")
    rechnungen.stellen(conn, rechnung_id=neu["id"], akteur="pytest")
    return rechnungen.rechnung_lesen(conn, neu["id"])


def gebuchter_beleg(conn, inhalt: bytes, brutto=11_900):
    sha = hashlib.sha256(inhalt).hexdigest()
    ergebnis = AblageErgebnis(sha256=sha, relativ=f"{HEUTE.year}/{sha}.pdf",
                              mime_typ="application/pdf",
                              groesse_bytes=len(inhalt), original_name="bon.pdf")
    beleg = belegmodul.beleg_anlegen(conn, ergebnis=ergebnis, akteur="pytest")
    netto = round(brutto / 1.19)
    netto = (brutto * 100 + 119 // 2) // 119  # exakt: brutto/1.19 kaufmaennisch
    belegmodul.felder_speichern(conn, beleg_id=beleg["id"], lieferant="Vermieter",
                                belegdatum=HEUTE, netto_cent=netto, steuersatz=19,
                                brutto_cent=brutto, akteur="pytest")
    belegmodul.freigeben(conn, beleg_id=beleg["id"], sollkonto="6310",
                         akteur="pytest")
    return belegmodul.beleg_lesen(conn, beleg["id"])


def importiere(conn, *bewegungen):
    return abgleich.importieren(conn, list(bewegungen), akteur="pytest")


def bewegung(betrag, zweck="", name="", iban="DE00", datum=HEUTE):
    return Bewegung(buchungsdatum=datum, betrag_cent=betrag,
                    verwendungszweck=zweck, gegen_name=name, gegen_iban=iban)


def test_import_dedup(app_conn, bereit):
    ergebnis = importiere(app_conn, bewegung(100_00, "A"), bewegung(-50_00, "B"))
    assert ergebnis == {"neu": 2, "uebersprungen": 0}
    nochmal = importiere(app_conn, bewegung(100_00, "A"))
    assert nochmal == {"neu": 0, "uebersprungen": 1}


def test_vorschlaege_konfidenzstufen(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    importiere(app_conn,
               bewegung(rechnung["brutto_cent"], f"Zahlung {rechnung['rechnungsnummer']}"),
               bewegung(rechnung["brutto_cent"], "ohne referenz"),
               bewegung(1, f"nur referenz {rechnung['rechnungsnummer']}"))
    offene = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")
    stufen = {}
    for zeile in offene:
        kandidaten = abgleich.vorschlaege(app_conn, zeile)
        if kandidaten:
            stufen[zeile["verwendungszweck"]] = kandidaten[0]["konfidenz"]
    assert stufen[f"Zahlung {rechnung['rechnungsnummer']}"] == "sicher"
    assert stufen["ohne referenz"] == "betrag"
    assert stufen[f"nur referenz {rechnung['rechnungsnummer']}"] == "referenz"


def test_zuordnen_rechnung_bucht_und_setzt_bezahlt(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    importiere(app_conn, bewegung(rechnung["brutto_cent"],
                                  rechnung["rechnungsnummer"], "Stadtkasse"))
    offene = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")[0]
    danach = abgleich.zuordnen(app_conn, bewegung_id=offene["id"],
                               rechnung_id=rechnung["id"], akteur="pytest")
    assert danach["status"] == "zugeordnet"
    zeile = journal.letzte_buchungen(app_conn, limit=1)[0]
    assert zeile["lfd_nr"] == danach["buchung_lfd_nr"]
    assert zeile["sollkonto"] == "1800" and zeile["habenkonto"] == "1200"
    assert zeile["betrag_cent"] == rechnung["brutto_cent"]
    assert zeile["belegreferenz"] == rechnung["rechnungsnummer"]
    assert hashkette.kette_pruefen(app_conn).ok
    assert rechnungen.rechnung_lesen(app_conn, rechnung["id"])["status"] == "bezahlt"


def test_teilzahlung_bucht_aber_setzt_nicht_bezahlt(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    importiere(app_conn, bewegung(rechnung["brutto_cent"] - 50_000, "Teilzahlung"))
    offene = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")[0]
    abgleich.zuordnen(app_conn, bewegung_id=offene["id"],
                      rechnung_id=rechnung["id"], akteur="pytest")
    assert rechnungen.rechnung_lesen(app_conn, rechnung["id"])["status"] == "gestellt"


def test_beleg_zuordnung_hakt_nur_ab(app_conn, bereit):
    beleg = gebuchter_beleg(app_conn, b"miete-1")
    stand = journal.status(app_conn)["anzahl_buchungen"]
    importiere(app_conn, bewegung(-beleg["brutto_cent"], "Miete", "Vermieter"))
    offene = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")[0]
    kandidaten = abgleich.vorschlaege(app_conn, offene)
    assert kandidaten and kandidaten[0]["art"] == "beleg"
    danach = abgleich.zuordnen(app_conn, bewegung_id=offene["id"],
                               beleg_id=beleg["id"], akteur="pytest")
    assert danach["status"] == "zugeordnet"
    assert danach["buchung_lfd_nr"] is None                       # KEINE Doppelbuchung
    assert journal.status(app_conn)["anzahl_buchungen"] == stand


def test_falsche_richtung_wird_abgelehnt(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    beleg = gebuchter_beleg(app_conn, b"miete-2")
    importiere(app_conn, bewegung(10_000, "eingang"), bewegung(-10_000, "ausgang"))
    eingang = [zeile for zeile in abgleich.bewegungen_liste(app_conn, status="unabgeglichen")
               if zeile["betrag_cent"] > 0][0]
    ausgang = [zeile for zeile in abgleich.bewegungen_liste(app_conn, status="unabgeglichen")
               if zeile["betrag_cent"] < 0][0]
    with pytest.raises(abgleich.AbgleichAbgelehnt, match="belegen"):
        abgleich.zuordnen(app_conn, bewegung_id=eingang["id"],
                          beleg_id=beleg["id"], akteur="pytest")
    with pytest.raises(abgleich.AbgleichAbgelehnt, match="rechnungen"):
        abgleich.zuordnen(app_conn, bewegung_id=ausgang["id"],
                          rechnung_id=rechnung["id"], akteur="pytest")


def test_loesen_storniert_und_setzt_zurueck(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    importiere(app_conn, bewegung(rechnung["brutto_cent"], "Zahlung"))
    offene = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")[0]
    zugeordnet = abgleich.zuordnen(app_conn, bewegung_id=offene["id"],
                                   rechnung_id=rechnung["id"], akteur="pytest")
    geloest = abgleich.loesen(app_conn, bewegung_id=offene["id"],
                              grund="falsche rechnung", akteur="pytest")
    assert geloest["status"] == "unabgeglichen"
    assert geloest["buchung_lfd_nr"] is None
    # Storno existiert als Gegenbuchung auf die Zahlungsbuchung
    storno = journal.letzte_buchungen(app_conn, limit=1)[0]
    assert storno["stornoreferenz"] == zugeordnet["buchung_lfd_nr"]
    assert rechnungen.rechnung_lesen(app_conn, rechnung["id"])["status"] == "gestellt"
    assert hashkette.kette_pruefen(app_conn).ok


def test_auto_abgleich_nur_sichere_treffer(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)
    importiere(app_conn,
               bewegung(rechnung["brutto_cent"], f"AUTO {rechnung['rechnungsnummer']}"),
               bewegung(rechnung["brutto_cent"], "nur betrag — bleibt liegen"))
    ergebnis = abgleich.auto_abgleich(app_conn, akteur="pytest")
    assert ergebnis["zugeordnet"] >= 1
    # Modul-DB ist geteilt — gezielt pruefen statt global zaehlen:
    alle = {zeile["verwendungszweck"]: zeile["status"]
            for zeile in abgleich.bewegungen_liste(app_conn)}
    assert alle[f"AUTO {rechnung['rechnungsnummer']}"] == "zugeordnet"
    assert alle["nur betrag — bleibt liegen"] == "unabgeglichen"


def test_trigger_bankfelder_und_statusmatrix(app_conn, migrate_conn, bereit):
    importiere(app_conn, bewegung(42_00, "unantastbar"))
    zeile = abgleich.bewegungen_liste(app_conn, status="unabgeglichen")[0]
    with pytest.raises(errors.RaiseException, match="unveraenderlich"):
        migrate_conn.execute("UPDATE bankbewegungen SET betrag_cent = 1"
                             " WHERE id = %s", (zeile["id"],))
    migrate_conn.rollback()
    with pytest.raises(errors.RaiseException, match="append-only"):
        migrate_conn.execute("DELETE FROM bankbewegungen WHERE id = %s",
                             (zeile["id"],))
    migrate_conn.rollback()
    abgleich.ignorieren(app_conn, bewegung_id=zeile["id"], grund="privat",
                        akteur="pytest")
    geloest = abgleich.loesen(app_conn, bewegung_id=zeile["id"],
                              grund="doch nicht privat", akteur="pytest")
    assert geloest["status"] == "unabgeglichen"
