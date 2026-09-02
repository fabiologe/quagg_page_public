"""EXTF-Format: Kopfzeile, 125 Spalten, S/H-Semantik, BU-Drehung,
Zeichensaetze, CP1252/CRLF — strukturell gegen die DATEV-Spezifikation."""

from datetime import date, datetime

import pytest

from app.api.pedant.core import datev

JETZT = datetime(2026, 8, 24, 12, 0, 0)
VON, BIS = date(2026, 8, 1), date(2026, 8, 31)


def erzeuge(buchungen, **ueber):
    werte = dict(von=VON, bis=BIS, jetzt=JETZT)
    werte.update(ueber)
    return datev.extf_erzeugen(buchungen, **werte)


def zeilen_von(daten: bytes) -> list:
    text = daten.decode("cp1252")
    assert text.endswith("\r\n")
    return text[:-2].split("\r\n")


def test_kopfzeile_exakt():
    kopf = zeilen_von(erzeuge([]))[0]
    felder = kopf.split(";")
    assert len(felder) == 31
    assert felder[0] == '"EXTF"'
    assert felder[1] == "700" and felder[2] == "21"
    assert felder[3] == '"Buchungsstapel"' and felder[4] == "13"
    assert felder[5] == "20260824120000000"
    assert felder[6] == "" and felder[9] == ""      # importiert-Felder leer
    assert felder[10] == "1001" and felder[11] == "1"
    assert felder[12] == "20260101" and felder[13] == "4"
    assert felder[14] == "20260801" and felder[15] == "20260831"
    assert felder[20] == "0"                        # Festschreibung 0, nie leer
    assert felder[21] == '"EUR"' and felder[26] == '"04"'


def test_spaltenzeile_hat_125_spalten():
    spalten = zeilen_von(erzeuge([]))[1].split(";")
    assert len(spalten) == 125
    assert spalten[0] == "Umsatz (ohne Soll/Haben-Kz)"
    assert spalten[102] == "Buchungs GUID"          # nicht "Leerfeld"


def _buchung(**ueber):
    werte = dict(buchungsdatum=date(2026, 8, 24), sollkonto="1200",
                 habenkonto="4400", betrag_cent=146_311, steuerschluessel="",
                 belegreferenz="RE-2026-0001", buchungstext="AR Musterstadt")
    werte.update(ueber)
    return werte


def test_fall_b_forderung_an_automatikkonto():
    zeile = zeilen_von(erzeuge([_buchung()]))[2]
    felder = zeile.split(";")
    assert len(felder) == 125
    assert felder[0] == "1463,11"                   # Komma, kein Tausenderpunkt
    assert felder[1] == '"S"'                       # Konto 1200 im Soll
    assert felder[6] == "1200" and felder[7] == "4400"
    assert felder[8] == ""                          # 4400 Automatik: BU LEER
    assert felder[9] == "2408"                      # TTMM ohne Jahr
    assert felder[10] == '"RE-2026-0001"'
    assert felder[13] == '"AR Musterstadt"'


def test_fall_a_vorsteuer_wird_gedreht():
    # Journal: 6815 an 1800 mit VSt-Schluessel '9' -> EXTF Variante A2:
    # Konto=1800 im Haben, Gegenkonto=6815 traegt den BU.
    zeile = zeilen_von(erzeuge([_buchung(
        sollkonto="6815", habenkonto="1800", betrag_cent=11_900,
        steuerschluessel="9", belegreferenz="B-2026-0001",
        buchungstext="Buerobedarf")]))[2]
    felder = zeile.split(";")
    assert felder[0] == "119,00"
    assert felder[1] == '"H"'
    assert felder[6] == "1800" and felder[7] == "6815"
    assert felder[8] == '"9"'


def test_belegfeld_zeichensatz_und_laengen():
    zeile = zeilen_von(erzeuge([_buchung(
        belegreferenz="RE 2026_0001.x",             # Leerzeichen/Unterstrich/Punkt raus
        buchungstext="x" * 100)]))[2]
    felder = zeile.split(";")
    assert felder[10] == '"RE20260001x"'
    assert felder[13] == '"' + "x" * 60 + '"'


def test_umlaute_ueberleben_cp1252():
    daten = erzeuge([_buchung(buchungstext="Bäcker Müller €")])
    assert b"\xe4" in daten and b"\x80" in daten    # ae und Euro in CP1252


def test_zeitraum_und_parameter_grenzen():
    with pytest.raises(datev.DatevAbgelehnt, match="EINEM wirtschaftsjahr"):
        erzeuge([], von=date(2026, 12, 1), bis=date(2027, 1, 31))
    with pytest.raises(datev.DatevAbgelehnt, match="von liegt nach bis"):
        erzeuge([], von=BIS, bis=VON)
    with pytest.raises(datev.DatevAbgelehnt, match="beraternummer"):
        erzeuge([], berater=1)
    with pytest.raises(datev.DatevAbgelehnt, match="betrag"):
        erzeuge([_buchung(betrag_cent=0)])


def test_dateiname_konvention():
    assert datev.dateiname(VON, BIS) == "EXTF_Buchungsstapel_20260801_20260831.csv"
