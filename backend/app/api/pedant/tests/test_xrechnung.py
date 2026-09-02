"""UBL-Erzeugung: Rundung, Pflichtfelder, Leitweg-Pruefziffer, Golden-File."""

from datetime import date
from pathlib import Path

import pytest

from app.api.pedant.core import xrechnung
from app.api.pedant.tests.fixtures_rechnung import (
    AUFTRAGGEBER, FIRMA, POSITIONEN, RECHNUNG, beispiel_xml)


def test_cent_und_mengen_formatierung():
    assert xrechnung.cent_als_dezimal(123456) == "1234.56"
    assert xrechnung.cent_als_dezimal(5) == "0.05"
    assert xrechnung.cent_als_dezimal(0) == "0.00"
    assert xrechnung.tausendstel_als_menge(12_500) == "12.500"
    assert xrechnung.tausendstel_als_menge(1) == "0.001"
    with pytest.raises(ValueError):
        xrechnung.cent_als_dezimal(-1)
    with pytest.raises(ValueError):
        xrechnung.cent_als_dezimal(12.5)


def test_positionsrundung_kaufmaennisch():
    # 0,5-Cent-Faelle: aufrunden wie die GENERATED-Spalte in der DB
    assert xrechnung.positions_betrag_cent(500, 1) == 1     # 0,5 -> 1
    assert xrechnung.positions_betrag_cent(1500, 1) == 2    # 1,5 -> 2
    assert xrechnung.positions_betrag_cent(1499, 1) == 1
    assert xrechnung.positions_betrag_cent(12_500, 9_500) == 118_750  # 12,5 h x 95 EUR


def test_summen_positionsweise_dann_steuer():
    betraege = xrechnung.summen(POSITIONEN, 19)
    assert betraege.netto_cent == 118_750 + 4_200
    assert betraege.steuer_cent == (122_950 * 19 + 50) // 100
    assert betraege.brutto_cent == betraege.netto_cent + betraege.steuer_cent


def test_leitweg_pruefung():
    assert xrechnung.leitweg_pruefen("04011000-12345-03") is None  # KoSIT-Beispiel
    assert "Pruefziffer" in xrechnung.leitweg_pruefen("04011000-12345-99")
    assert "Muster" in xrechnung.leitweg_pruefen("kein-format")
    assert "Muster" in xrechnung.leitweg_pruefen("")
    assert "Muster" in xrechnung.leitweg_pruefen("1-x-3")  # Grob zu kurz


def test_pflichtfelder_matrix():
    basis = dict(firma=FIRMA, auftraggeber=AUFTRAGGEBER,
                 rechnung=RECHNUNG, positionen=POSITIONEN)
    assert xrechnung.pflichtfelder_pruefen(**basis) == []
    # jedes kritische Feld einzeln ausschalten
    ohne_iban = {**basis, "firma": {**FIRMA, "iban": ""}}
    assert any("IBAN" in fehler for fehler in xrechnung.pflichtfelder_pruefen(**ohne_iban))
    ohne_steuer = {**basis, "firma": {**FIRMA, "ust_id": "", "steuernummer": ""}}
    assert any("BR-DE-2" in fehler for fehler in xrechnung.pflichtfelder_pruefen(**ohne_steuer))
    ohne_mail = {**basis, "auftraggeber": {**AUFTRAGGEBER, "email": ""}}
    assert any("BT-49" in fehler for fehler in xrechnung.pflichtfelder_pruefen(**ohne_mail))
    kaputte_leitweg = {**basis, "auftraggeber": {**AUFTRAGGEBER, "leitweg_id": "x"}}
    assert any("Leitweg" in fehler for fehler in xrechnung.pflichtfelder_pruefen(**kaputte_leitweg))
    ohne_positionen = {**basis, "positionen": []}
    assert any("Position" in fehler for fehler in xrechnung.pflichtfelder_pruefen(**ohne_positionen))


def test_ubl_ist_deterministisch_und_golden():
    erste = beispiel_xml()
    zweite = beispiel_xml()
    assert erste == zweite, "ubl_erzeugen muss deterministisch sein"
    golden = Path(__file__).parent / "daten" / "rechnung_golden.xml"
    assert golden.is_file(), (
        "Golden-Datei fehlt — einmalig erzeugen (nach KoSIT-Freigabe):"
        " venv/bin/python -m app.api.pedant.tests.golden_erzeugen")
    assert erste == golden.read_bytes(), (
        "UBL-Ausgabe weicht von der Golden-Datei ab — wenn die Aenderung"
        " gewollt ist: golden_erzeugen neu laufen lassen UND gegen KoSIT pruefen")


def test_ubl_enthaelt_die_kern_bts():
    xml = beispiel_xml().decode("utf-8")
    for erwartet in (
        xrechnung.CUSTOMIZATION_ID,                    # CIUS
        "<cbc:ID>RE-2027-0001</cbc:ID>",               # BT-1
        "<cbc:BuyerReference>04011000-12345-03",       # BT-10
        'unitCode="HUR"', 'unitCode="C62"',            # BT-129
        "<cbc:PaymentMeansCode>58<",                   # BT-81
        "DE89370400440532013000",                      # BT-84
        "<cbc:InvoiceTypeCode>380<",                   # BT-3
        'currencyID="EUR"',
        "<cbc:IssueDate>2027-02-01<",
        "<cbc:DueDate>2027-03-03<",                    # +30 Tage
    ):
        assert erwartet in xml, f"fehlt im UBL: {erwartet}"


def test_abschlag_und_schlussrechnung_im_xml():
    """4b: Typ 326, Vorrechnungen (BG-3) und Vorab-Betrag (BT-113/115)."""
    from datetime import date
    from app.api.pedant.tests.fixtures_rechnung import AUFTRAGGEBER, FIRMA, POSITIONEN, RECHNUNG
    betraege = xrechnung.summen(POSITIONEN, 19)
    abschlag = xrechnung.ubl_erzeugen(
        rechnungsnummer="RE-2027-0002", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
        rechnung={**RECHNUNG, "rechnungstyp": "326"}, positionen=POSITIONEN, betraege=betraege)
    assert b"<cbc:InvoiceTypeCode>326</cbc:InvoiceTypeCode>" in abschlag
    assert b"PrepaidAmount" not in abschlag
    schluss = xrechnung.ubl_erzeugen(
        rechnungsnummer="RE-2027-0003", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
        rechnung=RECHNUNG, positionen=POSITIONEN, betraege=betraege,
        vorrechnungen=[{"rechnungsnummer": "RE-2027-0002", "rechnungsdatum": date(2027, 1, 15)}],
        vorab_cent=50_000)
    assert b"<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>" in schluss
    assert b"<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>RE-2027-0002</cbc:ID>" in schluss.replace(b"\n", b"").replace(b"  ", b"")
    assert b"<cbc:IssueDate>2027-01-15</cbc:IssueDate>" in schluss
    assert f'<cbc:PrepaidAmount currencyID="EUR">500.00</cbc:PrepaidAmount>'.encode() in schluss
    zahlbar = xrechnung.cent_als_dezimal(betraege.brutto_cent - 50_000)
    assert f'<cbc:PayableAmount currencyID="EUR">{zahlbar}</cbc:PayableAmount>'.encode() in schluss
    # BillingReference steht VOR AccountingSupplierParty (UBL-Sequenz)
    assert schluss.index(b"BillingReference") < schluss.index(b"AccountingSupplierParty")
    with pytest.raises(ValueError):
        xrechnung.ubl_erzeugen(rechnungsnummer="x", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
                               rechnung={**RECHNUNG, "rechnungstyp": "999"}, positionen=POSITIONEN, betraege=betraege)
    with pytest.raises(ValueError):
        xrechnung.ubl_erzeugen(rechnungsnummer="x", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
                               rechnung=RECHNUNG, positionen=POSITIONEN, betraege=betraege,
                               vorab_cent=betraege.brutto_cent + 1)
