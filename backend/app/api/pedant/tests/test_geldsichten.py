"""Geld-Sichten: drei Summen, Monats-Bucketing, Planungsliste erwartetes Geld."""

from datetime import date, timedelta

import pytest
from psycopg import errors

from app.api.pedant.core import geldsichten, kosit, rechnungen, stammdaten
from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA

HEUTE = date.today()


@pytest.fixture()
def bereit(app_conn, rechnung_wurzel, monkeypatch):
    """Stammdaten + gestubbter KoSIT — wir brauchen gestellte Rechnungen."""
    monkeypatch.setattr(rechnungen.kosit, "validieren", lambda xml: kosit.KositBericht(
        valide=True, meldungen=[], report_xml=b"<r/>",
        report_html=b"<!DOCTYPE html><html>ok</html>"))
    stammdaten.firmendaten_speichern(app_conn, felder=dict(FIRMA), akteur="pytest")
    return stammdaten.auftraggeber_anlegen(app_conn, felder=dict(AUFTRAGGEBER),
                                           akteur="pytest")


def gestellte_rechnung(conn, ag, *, rechnungsdatum=HEUTE, zahlungsziel=30,
                       preis_cent=100_000):
    neu = rechnungen.rechnung_anlegen(conn, felder=dict(
        auftraggeber_id=ag["id"], rechnungsdatum=rechnungsdatum,
        leistung_von=rechnungsdatum.replace(day=1), leistung_bis=rechnungsdatum,
        zahlungsziel_tage=zahlungsziel), akteur="pytest")
    rechnungen.positionen_speichern(conn, rechnung_id=neu["id"], positionen=[
        {"bezeichnung": "Leistung", "menge_tausendstel": 1_000,
         "einheit": "C62", "einzelpreis_cent": preis_cent}], akteur="pytest")
    rechnungen.stellen(conn, rechnung_id=neu["id"], akteur="pytest")
    return rechnungen.rechnung_lesen(conn, neu["id"])


def test_sichten_zaehlen_die_drei_ebenen(app_conn, bereit):
    # offen (faellig in der Zukunft) + ueberfaellig (Faelligkeit gerissen)
    offen = gestellte_rechnung(app_conn, bereit)
    ueberfaellig = gestellte_rechnung(
        app_conn, bereit, rechnungsdatum=HEUTE - timedelta(days=60), zahlungsziel=14)
    # bezahlt
    bezahlt = gestellte_rechnung(app_conn, bereit, preis_cent=50_000)
    rechnungen.bezahlt_setzen(app_conn, rechnung_id=bezahlt["id"], bezahlt=True,
                              bezahlt_am=HEUTE, akteur="pytest")
    # kommend: beauftragt (voll) + teilweise gestellt (Rest) + angefragt (zaehlt nicht)
    geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="Vergabe A", betrag_cent=500_000, erwartet_am=HEUTE,
        status="beauftragt"), akteur="pytest")
    geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="Vergabe B", betrag_cent=300_000, bereits_gestellt_cent=100_000,
        erwartet_am=HEUTE, status="teilweise_gestellt"), akteur="pytest")
    geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="nur angefragt", betrag_cent=999_999, erwartet_am=HEUTE,
        status="angefragt"), akteur="pytest")

    sichten = geldsichten.sichten(app_conn)
    assert sichten["bezahlt"] == {"summe_cent": bezahlt["brutto_cent"], "anzahl": 1}
    assert sichten["offen"]["anzahl"] == 2
    assert sichten["offen"]["summe_cent"] == offen["brutto_cent"] + ueberfaellig["brutto_cent"]
    assert sichten["offen"]["ueberfaellig_anzahl"] == 1
    assert sichten["offen"]["ueberfaellig_cent"] == ueberfaellig["brutto_cent"]
    assert sichten["kommend"] == {"summe_cent": 500_000 + 200_000, "anzahl": 2}


def test_monatsreihe_bucketing(app_conn, bereit):
    rechnung = gestellte_rechnung(app_conn, bereit)   # faellig HEUTE+30
    geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="Q-Plan", betrag_cent=400_000,
        erwartet_am=HEUTE + timedelta(days=90), status="beauftragt"), akteur="pytest")

    reihe = geldsichten.monatsreihe(app_conn, zurueck=2, vor=4, heute=HEUTE)
    assert len(reihe) == 7
    assert reihe[2]["monat"] == f"{HEUTE.year:04d}-{HEUTE.month:02d}"
    faellig = HEUTE + timedelta(days=30)
    offen_monat = next(zeile for zeile in reihe
                       if zeile["monat"] == f"{faellig.year:04d}-{faellig.month:02d}")
    assert offen_monat["offen_cent"] >= rechnung["brutto_cent"]
    erwartet = HEUTE + timedelta(days=90)
    kommend_monat = next(zeile for zeile in reihe
                         if zeile["monat"] == f"{erwartet.year:04d}-{erwartet.month:02d}")
    assert kommend_monat["kommend_cent"] == 400_000


def test_monate_spanne_ueber_jahresgrenze():
    spanne = geldsichten._monate_spanne(date(2027, 1, 15), 2, 2)
    assert spanne == ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]


def test_erwartet_lebenslauf_und_validierung(app_conn):
    with pytest.raises(geldsichten.ErwartetAbgelehnt, match="bezeichnung"):
        geldsichten.erwartet_anlegen(app_conn, felder=dict(
            bezeichnung=" ", betrag_cent=1, erwartet_am=HEUTE), akteur="pytest")
    with pytest.raises(geldsichten.ErwartetAbgelehnt, match="status"):
        geldsichten.erwartet_anlegen(app_conn, felder=dict(
            bezeichnung="x", betrag_cent=1, erwartet_am=HEUTE,
            status="vielleicht"), akteur="pytest")
    with pytest.raises(geldsichten.ErwartetAbgelehnt, match="zwischen"):
        geldsichten.erwartet_anlegen(app_conn, felder=dict(
            bezeichnung="x", betrag_cent=100, bereits_gestellt_cent=200,
            erwartet_am=HEUTE, status="beauftragt"), akteur="pytest")

    eintrag = geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="Vergabe C", betrag_cent=100_000, erwartet_am=HEUTE),
        akteur="pytest")
    assert eintrag["status"] == "angefragt"
    assert eintrag["offener_rest_cent"] == 0     # angefragt zaehlt nicht als kommend

    beauftragt = geldsichten.erwartet_speichern(app_conn, eintrag_id=eintrag["id"],
                                                felder={"status": "beauftragt"},
                                                akteur="pytest")
    assert beauftragt["offener_rest_cent"] == 100_000

    fertig = geldsichten.erwartet_speichern(
        app_conn, eintrag_id=eintrag["id"],
        felder={"status": "vollstaendig_gestellt",
                "bereits_gestellt_cent": 100_000}, akteur="pytest")
    assert fertig["offener_rest_cent"] == 0
    assert eintrag["id"] not in [zeile["id"] for zeile in
                                 geldsichten.erwartet_liste(app_conn)]
    assert eintrag["id"] in [zeile["id"] for zeile in
                             geldsichten.erwartet_liste(app_conn, mit_erledigten=True)]


def test_erwartet_kein_delete(app_conn, migrate_conn):
    geldsichten.erwartet_anlegen(app_conn, felder=dict(
        bezeichnung="bleibt", betrag_cent=1_000, erwartet_am=HEUTE), akteur="pytest")
    with pytest.raises(errors.RaiseException, match="append-only"):
        migrate_conn.execute("DELETE FROM erwartetes_geld")
    migrate_conn.rollback()
