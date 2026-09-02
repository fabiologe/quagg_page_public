"""Rechnungs-Lebenslauf: Entwurf, Nummern-Lueckenlosigkeit, Stellen-Flow
(Validator gestubbt — der echte laeuft in test_kosit_integration)."""

from datetime import date

import pytest
from psycopg import errors

from app.api.pedant.core import hashkette, journal, kosit, rechnungen, stammdaten
from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA

HEUTE = date.today()
JAHR = HEUTE.year


@pytest.fixture()
def bereit(app_conn, rechnung_wurzel):
    """Gefuellte Firma + aktiver Auftraggeber + Rechnungs-Ablage auf tmp."""
    stammdaten.firmendaten_speichern(app_conn, felder=dict(FIRMA), akteur="pytest")
    auftraggeber = stammdaten.auftraggeber_anlegen(
        app_conn, felder=dict(AUFTRAGGEBER), akteur="pytest")
    return auftraggeber


@pytest.fixture()
def kosit_gruen(monkeypatch):
    monkeypatch.setattr(rechnungen.kosit, "validieren", lambda xml: kosit.KositBericht(
        valide=True, meldungen=[], report_xml=b"<report/>",
        report_html=b"<!DOCTYPE html><html>ok</html>"))


def entwurf(conn, auftraggeber, **ueber):
    felder = dict(auftraggeber_id=auftraggeber["id"], rechnungsdatum=HEUTE,
                  leistung_von=HEUTE.replace(day=1), leistung_bis=HEUTE,
                  zahlungsziel_tage=30)
    felder.update(ueber)
    neu = rechnungen.rechnung_anlegen(conn, felder=felder, akteur="pytest")
    rechnungen.positionen_speichern(conn, rechnung_id=neu["id"], positionen=[
        {"bezeichnung": "Planung", "menge_tausendstel": 10_000,
         "einheit": "HUR", "einzelpreis_cent": 9_500},
    ], akteur="pytest")
    return rechnungen.rechnung_lesen(conn, neu["id"])


def test_entwurf_ohne_nummer_mit_livesummen(app_conn, bereit):
    rechnung = entwurf(app_conn, bereit)
    assert rechnung["status"] == "entwurf"
    assert rechnung["rechnungsnummer"] is None
    assert rechnung["netto_cent"] == 95_000
    assert rechnung["brutto_cent"] == 95_000 + (95_000 * 19 + 50) // 100
    from datetime import timedelta
    assert rechnung["faellig_am"] == HEUTE + timedelta(days=30)
    # Positionsvalidierung
    with pytest.raises(rechnungen.RechnungAbgelehnt, match="einheit"):
        rechnungen.positionen_speichern(app_conn, rechnung_id=rechnung["id"],
                                        positionen=[{"bezeichnung": "x",
                                                     "menge_tausendstel": 1000,
                                                     "einheit": "STD",
                                                     "einzelpreis_cent": 1}],
                                        akteur="pytest")


def test_vorpruefung_meldet_luecken(app_conn, bereit):
    rechnung = entwurf(app_conn, bereit)
    ergebnis = rechnungen.vorpruefung(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert ergebnis["pflichtfelder_ok"] is True
    # Firma unvollstaendig machen -> Vorpruefung wird rot
    stammdaten.firmendaten_speichern(app_conn, felder={"iban": ""}, akteur="pytest")
    ergebnis = rechnungen.vorpruefung(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert ergebnis["pflichtfelder_ok"] is False
    assert any("IBAN" in fehler for fehler in ergebnis["fehler"])
    stammdaten.firmendaten_speichern(app_conn, felder={"iban": FIRMA["iban"]}, akteur="pytest")


def test_stellen_vergibt_nummer_bucht_und_ist_idempotent(app_conn, bereit, kosit_gruen):
    rechnung = entwurf(app_conn, bereit)
    ergebnis = rechnungen.stellen(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert ergebnis["bereits_gestellt"] is False
    nummer = ergebnis["rechnungsnummer"]
    assert nummer == f"RE-{JAHR}-0001"

    danach = rechnungen.rechnung_lesen(app_conn, rechnung["id"])
    assert danach["status"] == "gestellt"
    assert danach["xml_pfad"] and danach["bericht_pfad"]
    assert danach["leitweg_id"] == AUFTRAGGEBER["leitweg_id"]

    zeile = journal.letzte_buchungen(app_conn, limit=1)[0]
    assert zeile["lfd_nr"] == ergebnis["lfd_nr"]
    assert zeile["sollkonto"] == "1200" and zeile["habenkonto"] == "4400"
    assert zeile["betrag_cent"] == danach["brutto_cent"]
    assert zeile["steuerschluessel"] == ""          # 4400 = Automatikkonto
    assert zeile["belegreferenz"] == nummer
    assert hashkette.kette_pruefen(app_conn).ok

    nochmal = rechnungen.stellen(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert nochmal["bereits_gestellt"] is True
    assert nochmal["lfd_nr"] == ergebnis["lfd_nr"]


def test_stellen_validator_rot_persistiert_nichts(app_conn, bereit, monkeypatch):
    rechnung = entwurf(app_conn, bereit)
    monkeypatch.setattr(rechnungen.kosit, "validieren", lambda xml: kosit.KositBericht(
        valide=False, meldungen=["BR-DE-15: kaputt"], report_xml=b"<r/>", report_html=b""))
    with pytest.raises(rechnungen.RechnungAbgelehnt) as fehler:
        rechnungen.stellen(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert fehler.value.meldungen == ["BR-DE-15: kaputt"]
    danach = rechnungen.rechnung_lesen(app_conn, rechnung["id"])
    assert danach["status"] == "entwurf"
    assert danach["rechnungsnummer"] is None        # keine Nummer verbrannt


def test_stellen_heilt_abgebrochenen_lauf(app_conn, bereit, kosit_gruen):
    rechnung = entwurf(app_conn, bereit)
    # Crash-Simulation: Nummer+Snapshot sind gebunden, Buchung existiert,
    # aber die Finalisierung fehlte.
    lfd = int(rechnungen._nummer_kandidat(app_conn, rechnung).rsplit("-", 1)[1])
    with app_conn.transaction():
        app_conn.execute(
            "UPDATE rechnungen SET re_jahr = %s, re_lfd = %s, leitweg_id = %s,"
            " netto_cent = %s, steuer_cent = %s, brutto_cent = %s WHERE id = %s",
            (JAHR, lfd, AUFTRAGGEBER["leitweg_id"], 95_000, 18_050, 113_050,
             rechnung["id"]))
    nummer = f"RE-{JAHR}-{lfd:04d}"
    vorab = journal.buchung_anlegen(
        app_conn, buchungsdatum=HEUTE, belegdatum=HEUTE, sollkonto="1200",
        habenkonto="4400", betrag_cent=113_050, buchungstext="Crash-Simulation",
        belegreferenz=nummer, akteur="pytest", aktion="rechnung_stellen")
    stand = journal.status(app_conn)["anzahl_buchungen"]
    ergebnis = rechnungen.stellen(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    assert ergebnis["lfd_nr"] == vorab["lfd_nr"]
    assert journal.status(app_conn)["anzahl_buchungen"] == stand
    assert rechnungen.rechnung_lesen(app_conn, rechnung["id"])["status"] == "gestellt"


def test_lueckenlosigkeit_ueber_verwerfen_hinweg(app_conn, bereit, kosit_gruen):
    # Modul-DB ist geteilt — relativ zaehlen, nicht absolute Nummern erwarten.
    erste = entwurf(app_conn, bereit)
    vorher = rechnungen.stellen(app_conn, rechnung_id=erste["id"], akteur="pytest")
    lfd_vorher = int(vorher["rechnungsnummer"].rsplit("-", 1)[1])
    wegwerf = entwurf(app_conn, bereit)
    rechnungen.verwerfen(app_conn, rechnung_id=wegwerf["id"],
                         grund="doch nicht", akteur="pytest")
    dritte = entwurf(app_conn, bereit)
    ergebnis = rechnungen.stellen(app_conn, rechnung_id=dritte["id"], akteur="pytest")
    # der verworfene Entwurf riss KEINE Luecke: direkt die Folgenummer
    assert ergebnis["rechnungsnummer"] == f"RE-{JAHR}-{lfd_vorher + 1:04d}"


def test_nach_gestellt_eingefroren(app_conn, migrate_conn, bereit, kosit_gruen):
    rechnung = entwurf(app_conn, bereit)
    rechnungen.stellen(app_conn, rechnung_id=rechnung["id"], akteur="pytest")
    with pytest.raises(rechnungen.RechnungAbgelehnt, match="formbar"):
        rechnungen.kopf_speichern(app_conn, rechnung_id=rechnung["id"],
                                  felder={"zahlungsziel_tage": 14}, akteur="pytest")
    with pytest.raises(errors.RaiseException, match="nur noch"):
        # echter Wertwechsel — now()::date waere heute ein No-op-UPDATE
        migrate_conn.execute("UPDATE rechnungen SET rechnungsdatum ="
                             " rechnungsdatum + 1 WHERE id = %s", (rechnung["id"],))
    migrate_conn.rollback()
    with pytest.raises(errors.RaiseException, match="entwurf"):
        migrate_conn.execute("DELETE FROM rechnungspositionen WHERE rechnung_id = %s",
                             (rechnung["id"],))
    migrate_conn.rollback()
    with pytest.raises(errors.RaiseException, match="append-only"):
        migrate_conn.execute("DELETE FROM rechnungen WHERE id = %s", (rechnung["id"],))
    migrate_conn.rollback()
    # Statuspflege bleibt erlaubt: versand + bezahlt (rueckholbar)
    rechnungen.versand_vermerken(app_conn, rechnung_id=rechnung["id"],
                                 weg="zre_rlp", akteur="pytest")
    bezahlt = rechnungen.bezahlt_setzen(app_conn, rechnung_id=rechnung["id"],
                                        bezahlt=True, bezahlt_am=None, akteur="pytest")
    assert bezahlt["status"] == "bezahlt"
    zurueck = rechnungen.bezahlt_setzen(app_conn, rechnung_id=rechnung["id"],
                                        bezahlt=False, bezahlt_am=None, akteur="pytest")
    assert zurueck["status"] == "gestellt" and zurueck["bezahlt_am"] is None


def test_verwerfen_regeln(app_conn, bereit):
    rechnung = entwurf(app_conn, bereit)
    with pytest.raises(rechnungen.RechnungAbgelehnt, match="grund"):
        rechnungen.verwerfen(app_conn, rechnung_id=rechnung["id"], grund=" ", akteur="pytest")
    # Nummer manuell binden -> verwerfen verboten (Lueckenlosigkeit)
    with app_conn.transaction():
        app_conn.execute("UPDATE rechnungen SET re_jahr = %s, re_lfd = 9999"
                         " WHERE id = %s", (JAHR, rechnung["id"]))
    with pytest.raises(rechnungen.RechnungAbgelehnt, match="nummer"):
        rechnungen.verwerfen(app_conn, rechnung_id=rechnung["id"],
                             grund="zu spaet", akteur="pytest")


def test_schlussrechnung_mit_vorrechnungen(app_conn, bereit, kosit_gruen):
    """4b: Abschlag (326) stellen, Schlussrechnung referenziert ihn, bucht nur den Rest."""
    abschlag = entwurf(app_conn, bereit, rechnungstyp="326")
    rechnungen.positionen_speichern(app_conn, rechnung_id=abschlag["id"], akteur="pytest", positionen=[
        {"bezeichnung": "1. Abschlag", "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": 10_000_00}])
    assert rechnungen.rechnung_lesen(app_conn, abschlag["id"])["rechnungstyp"] == "326"
    schluss = entwurf(app_conn, bereit)
    rechnungen.positionen_speichern(app_conn, rechnung_id=schluss["id"], akteur="pytest", positionen=[
        {"bezeichnung": "Gesamtleistung", "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": 30_000_00}])
    # Vorrechnung muss gestellt sein
    with pytest.raises(rechnungen.RechnungAbgelehnt):
        rechnungen.referenzen_setzen(app_conn, rechnung_id=schluss["id"], vor_rechnung_ids=[abschlag["id"]], akteur="pytest")
    gestellt = rechnungen.stellen(app_conn, rechnung_id=abschlag["id"], akteur="pytest")
    assert gestellt["bereits_gestellt"] is False
    a = rechnungen.rechnung_lesen(app_conn, abschlag["id"])
    assert a["vorab_cent"] == 0 and a["zahlbar_cent"] == a["brutto_cent"] == 11_900_00
    with pytest.raises(rechnungen.RechnungAbgelehnt):                   # sich selbst
        rechnungen.referenzen_setzen(app_conn, rechnung_id=schluss["id"], vor_rechnung_ids=[schluss["id"]], akteur="pytest")
    s = rechnungen.referenzen_setzen(app_conn, rechnung_id=schluss["id"], vor_rechnung_ids=[abschlag["id"]], akteur="pytest")
    assert [v["rechnungsnummer"] for v in s["vorrechnungen"]] == [a["rechnungsnummer"]]
    assert s["vorab_cent"] == 11_900_00 and s["zahlbar_cent"] == 35_700_00 - 11_900_00
    # fremder Auftraggeber -> abgelehnt
    fremd_ag = stammdaten.auftraggeber_anlegen(app_conn, akteur="pytest", felder={
        **AUFTRAGGEBER, "name": "Anderer Kreis", "email": "x@kreis.de"})
    fremd = entwurf(app_conn, fremd_ag)
    rechnungen.positionen_speichern(app_conn, rechnung_id=fremd["id"], akteur="pytest", positionen=[
        {"bezeichnung": "x", "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": 100}])
    rechnungen.stellen(app_conn, rechnung_id=fremd["id"], akteur="pytest")
    with pytest.raises(rechnungen.RechnungAbgelehnt):
        rechnungen.referenzen_setzen(app_conn, rechnung_id=schluss["id"], vor_rechnung_ids=[fremd["id"]], akteur="pytest")
    ergebnis = rechnungen.stellen(app_conn, rechnung_id=schluss["id"], akteur="pytest")
    danach = rechnungen.rechnung_lesen(app_conn, schluss["id"])
    assert danach["status"] == "gestellt" and danach["vorab_cent"] == 11_900_00 and danach["zahlbar_cent"] == 23_800_00
    zeile = journal.letzte_buchungen(app_conn, limit=1)[0]
    assert zeile["lfd_nr"] == ergebnis["lfd_nr"] and zeile["betrag_cent"] == 23_800_00   # nur der Rest
    # Referenzen nach dem Stellen eingefroren
    with pytest.raises(rechnungen.RechnungAbgelehnt):
        rechnungen.referenzen_setzen(app_conn, rechnung_id=schluss["id"], vor_rechnung_ids=[], akteur="pytest")
    # Rest null -> Stellen verweigert (Statusmaschine verlangt eine Buchung)
    voll = entwurf(app_conn, bereit)
    rechnungen.positionen_speichern(app_conn, rechnung_id=voll["id"], akteur="pytest", positionen=[
        {"bezeichnung": "nur Abschlag", "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": 10_000_00}])
    rechnungen.referenzen_setzen(app_conn, rechnung_id=voll["id"], vor_rechnung_ids=[abschlag["id"]], akteur="pytest")
    with pytest.raises(rechnungen.RechnungAbgelehnt, match="zahlbarer rest"):
        rechnungen.stellen(app_conn, rechnung_id=voll["id"], akteur="pytest")
