"""Stammdaten: Firmendaten-Befund, Auftraggeber-Lebenslauf, Leitweg-Haerte."""

import pytest

from app.api.pedant.core import stammdaten
from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA


def test_firmendaten_starten_leer_mit_befund(app_conn):
    firma = stammdaten.firmendaten_lesen(app_conn)
    assert "Firmenname" in firma["fehlend"]
    assert any("BR-DE-2" in eintrag for eintrag in firma["fehlend"])


def test_firmendaten_speichern_leert_den_befund(app_conn):
    firma = stammdaten.firmendaten_speichern(app_conn, felder=dict(FIRMA), akteur="pytest")
    assert firma["fehlend"] == []
    assert firma["name"] == FIRMA["name"]
    with pytest.raises(stammdaten.StammdatenAbgelehnt, match="unbekannte"):
        stammdaten.firmendaten_speichern(app_conn, felder={"quatsch": "x"}, akteur="pytest")


def test_auftraggeber_lebenslauf(app_conn):
    with pytest.raises(stammdaten.StammdatenAbgelehnt, match="Pruefziffer"):
        stammdaten.auftraggeber_anlegen(
            app_conn, felder={**AUFTRAGGEBER, "leitweg_id": "04011000-12345-99"},
            akteur="pytest")
    neu = stammdaten.auftraggeber_anlegen(app_conn, felder=dict(AUFTRAGGEBER), akteur="pytest")
    assert neu["leitweg_id"] == AUFTRAGGEBER["leitweg_id"]
    assert [ag["id"] for ag in stammdaten.auftraggeber_liste(app_conn)] == [neu["id"]]
    # deaktivieren statt loeschen
    stammdaten.auftraggeber_speichern(
        app_conn, auftraggeber_id=neu["id"], felder={"aktiv": False}, akteur="pytest")
    assert stammdaten.auftraggeber_liste(app_conn) == []
    assert len(stammdaten.auftraggeber_liste(app_conn, nur_aktive=False)) == 1
