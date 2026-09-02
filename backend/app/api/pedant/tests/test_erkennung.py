"""OCR-Baustein: bleibt ohne Scharfstellung stumm, Mock-Pfad funktioniert."""

import hashlib
from datetime import date

import pytest

from app.api.pedant import cli
from app.api.pedant.core import belege, erkennung
from app.api.pedant.core.ablage import AblageErgebnis


def test_aus_umgebung_ist_none_ohne_scharfstellung(monkeypatch):
    # conftest leert PEDANT_OCR und ANTHROPIC_API_KEY bereits hart.
    assert erkennung.erkenner_aus_umgebung() is None
    monkeypatch.setenv("PEDANT_OCR", "1")            # Schalter ohne Key: nein
    assert erkennung.erkenner_aus_umgebung() is None
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    erkenner = erkennung.erkenner_aus_umgebung()      # beides da: Erkenner
    assert isinstance(erkenner, erkennung.AnthropicErkenner)


def test_anthropic_erkenner_meldet_fehlendes_sdk(tmp_path):
    erkenner = erkennung.AnthropicErkenner("sk-test")
    datei = tmp_path / "bon.pdf"
    datei.write_bytes(b"%PDF-1.4")
    with pytest.raises(erkennung.ErkennungNichtKonfiguriert, match="anthropic"):
        erkenner.erkenne(datei)


def test_cli_verweigert_unkonfiguriert(capsys):
    assert cli.beleg_erkennen("test") == 1
    assert "nicht konfiguriert" in capsys.readouterr().out


def test_felder_aus_roh_parst_defensiv():
    felder = erkennung.felder_aus_roh({
        "lieferant": "  Baumarkt  ", "belegdatum": "2027-01-15",
        "netto_cent": 10_000, "steuersatz": 19, "brutto_cent": 11_900})
    assert felder.lieferant == "Baumarkt"
    assert felder.belegdatum == date(2027, 1, 15)
    assert felder.unsicher is False
    kaputt = erkennung.felder_aus_roh({
        "lieferant": None, "belegdatum": "gestern", "netto_cent": "viel",
        "steuersatz": 5, "brutto_cent": True, "unsicher": True})
    assert kaputt.lieferant is None
    assert kaputt.belegdatum is None
    assert kaputt.netto_cent is None
    assert kaputt.steuersatz is None      # 5 ist kein gueltiger Satz
    assert kaputt.brutto_cent is None     # bool ist kein Betrag
    assert kaputt.unsicher is True


def test_beleg_schema_pflichtfelder():
    assert set(erkennung.BELEG_SCHEMA["required"]) == {
        "lieferant", "belegdatum", "netto_cent", "steuersatz", "brutto_cent"}


def test_mock_pfad_schreibt_erkennung(app_conn, beleg_wurzel, monkeypatch):
    inhalt = b"%PDF-1.4 mock-ocr"
    sha = hashlib.sha256(inhalt).hexdigest()
    jahr = date.today().year
    (beleg_wurzel / str(jahr)).mkdir(parents=True, exist_ok=True)
    (beleg_wurzel / f"{jahr}/{sha}.pdf").write_bytes(inhalt)
    ergebnis = AblageErgebnis(sha256=sha, relativ=f"{jahr}/{sha}.pdf",
                              mime_typ="application/pdf",
                              groesse_bytes=len(inhalt), original_name="mock.pdf")
    beleg = belege.beleg_anlegen(app_conn, ergebnis=ergebnis, akteur="pytest")

    felder = erkennung.ErkannteFelder(
        lieferant="Baumarkt", belegdatum=date(2027, 1, 15), netto_cent=10_000,
        steuersatz=19, brutto_cent=11_900, unsicher=False,
        roh={"quelle": "mock"})
    app_conn.commit()  # der CLI-Batch oeffnet eine eigene Verbindung
    assert cli.beleg_erkennen("test", erkenner=erkennung.MockErkenner(felder)) == 0

    app_conn.rollback()
    danach = belege.beleg_lesen(app_conn, beleg["id"])
    assert danach["status"] == "erkannt"
    assert danach["lieferant"] == "Baumarkt"
    assert danach["netto_cent"] == 10_000
    # menschliche Pruefung bleibt Pflicht: geprueft erst nach felder_speichern
    geprueft = belege.felder_speichern(
        app_conn, beleg_id=beleg["id"], lieferant="Baumarkt",
        belegdatum=date(2027, 1, 15), netto_cent=10_000, steuersatz=19,
        brutto_cent=11_900, akteur="pytest")
    assert geprueft["status"] == "geprueft"
