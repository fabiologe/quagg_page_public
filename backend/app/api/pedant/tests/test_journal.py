"""Schreibpfad: Validierung, lueckenlose Nummernvergabe, Storno-Regeln."""

import threading
from datetime import date

import psycopg
import pytest

from app.api.pedant.core import journal


def test_fachliche_ablehnungen(buche):
    with pytest.raises(journal.BuchungAbgelehnt, match="groesser als 0"):
        buche(betrag_cent=0)
    with pytest.raises(journal.BuchungAbgelehnt, match="groesser als 0"):
        buche(betrag_cent=-500)
    with pytest.raises(journal.BuchungAbgelehnt, match="ganze Zahl"):
        buche(betrag_cent=12.5)
    with pytest.raises(journal.BuchungAbgelehnt, match="ganze Zahl"):
        buche(betrag_cent=True)
    with pytest.raises(journal.BuchungAbgelehnt, match="verschieden"):
        buche(sollkonto="1800", habenkonto="1800")
    with pytest.raises(journal.BuchungAbgelehnt, match="kein bekanntes Konto"):
        buche(sollkonto="9999")
    with pytest.raises(journal.BuchungAbgelehnt, match="leer"):
        buche(buchungstext="   ")


def test_nummern_sind_lueckenlos_auch_bei_parallelen_schreibern(frische_db, app_conn, buche):
    erste = buche()["lfd_nr"]

    ergebnisse = []
    def schreibe(text):
        with psycopg.connect(frische_db["app"]) as conn:
            ergebnisse.append(journal.buchung_anlegen(
                conn, buchungsdatum=date(2027, 2, 1), belegdatum=date(2027, 2, 1),
                sollkonto="6800", habenkonto="1800", betrag_cent=100,
                buchungstext=text, akteur="parallel")["lfd_nr"])

    faeden = [threading.Thread(target=schreibe, args=(f"parallel {i}",))
              for i in range(4)]
    for f in faeden:
        f.start()
    for f in faeden:
        f.join()

    nummern = sorted([erste] + ergebnisse)
    assert nummern == list(range(erste, erste + 5))


def test_storno_ist_die_gespiegelte_gegenbuchung(app_conn, buche):
    original = buche(sollkonto="6310", habenkonto="1800", betrag_cent=95_000)
    storno = journal.storno_anlegen(
        app_conn, nr_original=original["lfd_nr"], grund="Test", akteur="pytest")
    zeilen = journal.letzte_buchungen(app_conn, limit=1)
    neueste = zeilen[0]
    assert neueste["lfd_nr"] == storno["lfd_nr"]
    assert neueste["sollkonto"] == "1800"
    assert neueste["habenkonto"] == "6310"
    assert neueste["betrag_cent"] == 95_000
    assert neueste["stornoreferenz"] == original["lfd_nr"]
    assert "Storno zu Nr." in neueste["buchungstext"]


def test_doppelstorno_und_storno_vom_storno_sind_verboten(app_conn, buche):
    original = buche()
    storno = journal.storno_anlegen(
        app_conn, nr_original=original["lfd_nr"], grund="einmal", akteur="pytest")
    with pytest.raises(journal.BuchungAbgelehnt, match="bereits storniert"):
        journal.storno_anlegen(
            app_conn, nr_original=original["lfd_nr"], grund="nochmal", akteur="pytest")
    with pytest.raises(journal.BuchungAbgelehnt, match="selbst ein storno"):
        journal.storno_anlegen(
            app_conn, nr_original=storno["lfd_nr"], grund="rueckwaerts", akteur="pytest")
    with pytest.raises(journal.BuchungAbgelehnt, match="existiert nicht"):
        journal.storno_anlegen(
            app_conn, nr_original=999_999, grund="geist", akteur="pytest")
