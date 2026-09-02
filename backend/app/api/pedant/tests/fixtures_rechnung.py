"""Kanonische Rechnungs-Fixtures — EINE Quelle fuer Golden-File-Test,
KoSIT-Integrationstest und die Golden-Datei-Erzeugung selbst."""

from datetime import date

from app.api.pedant.core import xrechnung

FIRMA = {
    "name": "Quagg Engineering", "rechtsform_zusatz": "UG (haftungsbeschraenkt)",
    "strasse": "Musterstrasse 12", "plz": "56070", "ort": "Koblenz", "land": "DE",
    "steuernummer": "", "ust_id": "DE123456789",
    "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
    "bank_name": "Commerzbank", "email": "rechnung@quagg-engineering.org",
    "telefon": "+49 261 1234567", "ansprechpartner": "Fabio Quagg",
}

AUFTRAGGEBER = {
    "name": "Stadtverwaltung Musterstadt", "strasse": "Rathausplatz 1",
    "plz": "55116", "ort": "Mainz", "land": "DE",
    "leitweg_id": "04011000-12345-03", "portal": "zre_rlp",
    "email": "rechnungseingang@musterstadt.de",
}

RECHNUNG = {
    "rechnungsdatum": date(2027, 2, 1),
    "leistung_von": date(2027, 1, 1),
    "leistung_bis": date(2027, 1, 31),
    "steuersatz": 19,
    "zahlungsziel_tage": 30,
    "auftrag_referenz": "VG-2027-042",
}

POSITIONEN = [
    {"pos_nr": 1, "bezeichnung": "Ingenieurleistung Entwaesserungsplanung",
     "menge_tausendstel": 12_500, "einheit": "HUR", "einzelpreis_cent": 9_500},
    {"pos_nr": 2, "bezeichnung": "Pauschale Fahrtkosten",
     "menge_tausendstel": 1_000, "einheit": "C62", "einzelpreis_cent": 4_200},
]


def beispiel_xml() -> bytes:
    betraege = xrechnung.summen(POSITIONEN, RECHNUNG["steuersatz"])
    return xrechnung.ubl_erzeugen(
        rechnungsnummer="RE-2027-0001", firma=FIRMA, auftraggeber=AUFTRAGGEBER,
        rechnung=RECHNUNG, positionen=POSITIONEN, betraege=betraege)
