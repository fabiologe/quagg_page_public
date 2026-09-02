"""Bank-Datei-Parser: CSV (deutsche Banken, heterogene Header) und CAMT.053.

Beide liefern dieselbe neutrale Form: eine Liste von Bewegungen mit
buchungsdatum, SIGNIERTEM betrag_cent, verwendungszweck, gegen_name,
gegen_iban. Pur und ohne DB — der Import (core/abgleich.py) uebernimmt
Dedup und Persistenz.

CSV: deutsche Banken exportieren wild verschiedene Spaltennamen — der Parser
erkennt die gaengigen Varianten ueber eine Alias-Tabelle und deutsche
Betragsformate ("1.234,56", "-42,00"). Unbekannte Header -> klare Fehlermeldung
mit dem, was gefunden wurde.
"""

import csv
import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime

from lxml import etree


class ImportAbgelehnt(ValueError):
    """Datei unlesbar/unbekanntes Format — Router uebersetzt in 422."""


@dataclass(frozen=True)
class Bewegung:
    buchungsdatum: date
    betrag_cent: int          # signiert: Eingang +, Ausgang -
    verwendungszweck: str
    gegen_name: str
    gegen_iban: str

    def dedup_hash(self) -> str:
        kanonisch = "|".join([
            self.buchungsdatum.isoformat(), str(self.betrag_cent),
            " ".join(self.verwendungszweck.split()),
            self.gegen_iban.replace(" ", "").upper(),
        ])
        return hashlib.sha256(kanonisch.encode("utf-8")).hexdigest()


# ── CSV ──────────────────────────────────────────────────────────────────────

_SPALTEN_ALIASE = {
    "buchungsdatum": ("buchungstag", "buchungsdatum", "buchung", "datum",
                      "valutadatum", "wertstellung"),
    "betrag": ("betrag", "betrag (eur)", "umsatz", "umsatz (eur)",
               "betrag in eur"),
    "verwendungszweck": ("verwendungszweck", "vwz", "buchungstext",
                         "umsatztext", "verwendungszweck 1"),
    "gegen_name": ("beguenstigter/zahlungspflichtiger", "name",
                   "auftraggeber/empfaenger", "beguenstigter", "empfaenger",
                   "auftraggeber / beguenstigter", "zahlungspflichtige*r",
                   "beguenstigte/r"),
    "gegen_iban": ("iban", "kontonummer/iban", "iban zahlungsbeteiligter",
                   "iban auftraggeberkonto", "kontonummer"),
}


def _kopf_normalisieren(kopf: str) -> str:
    return (kopf or "").strip().strip('"').lower()
    

def betrag_zu_cent(text: str) -> int:
    """Deutsches Bankformat -> signierte Cent. '1.234,56' / '-42,00' / '42.00'."""
    roh = str(text or "").strip().replace(" ", "").replace(" ", "")
    roh = roh.replace("EUR", "").replace("€", "")
    if not roh:
        raise ImportAbgelehnt("leerer betrag")
    vorzeichen = -1 if roh.startswith("-") else 1
    roh = roh.lstrip("+-")
    if "," in roh:
        roh = roh.replace(".", "").replace(",", ".")
    ganz, _, nachkomma = roh.partition(".")
    if not ganz.isdigit() or (nachkomma and not nachkomma.isdigit()) or len(nachkomma) > 2:
        raise ImportAbgelehnt(f"betrag unlesbar: {text!r}")
    return vorzeichen * (int(ganz) * 100 + int(nachkomma.ljust(2, "0") or 0))


def _datum(text: str) -> date:
    roh = str(text or "").strip().strip('"')
    for muster in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(roh, muster).date()
        except ValueError:
            continue
    raise ImportAbgelehnt(f"datum unlesbar: {text!r}")


def _trennzeichen(kopfzeile: str) -> str:
    return ";" if kopfzeile.count(";") >= kopfzeile.count(",") else ","


def csv_lesen(daten: bytes) -> list:
    """Bank-CSV -> Bewegungen. Erkennt die Kopfzeile auch, wenn davor
    Metazeilen stehen (Sparkassen-Muster)."""
    text = daten.decode("utf-8-sig", errors="replace")
    zeilen = [zeile for zeile in text.splitlines() if zeile.strip()]
    if not zeilen:
        raise ImportAbgelehnt("leere datei")

    # Kopfzeile suchen: die erste Zeile, die Datum- UND Betrag-Alias enthaelt.
    kopf_index = None
    zuordnung = {}
    for index, zeile in enumerate(zeilen[:10]):
        trenner = _trennzeichen(zeile)
        koepfe = [_kopf_normalisieren(kopf) for kopf in
                  next(csv.reader([zeile], delimiter=trenner))]
        gefunden = {}
        for ziel, aliase in _SPALTEN_ALIASE.items():
            for stelle, kopf in enumerate(koepfe):
                if kopf in aliase and ziel not in gefunden:
                    gefunden[ziel] = stelle
        if "buchungsdatum" in gefunden and "betrag" in gefunden:
            kopf_index, zuordnung = index, gefunden
            break
    if kopf_index is None:
        raise ImportAbgelehnt(
            "keine bekannte kopfzeile gefunden (gebraucht: datum + betrag;"
            f" erste zeile war: {zeilen[0][:120]!r})")

    trenner = _trennzeichen(zeilen[kopf_index])
    bewegungen = []
    for zeile in csv.reader(io.StringIO("\n".join(zeilen[kopf_index + 1:])),
                            delimiter=trenner):
        if not any(feld.strip() for feld in zeile):
            continue

        def feld(name):
            stelle = zuordnung.get(name)
            return zeile[stelle].strip() if stelle is not None and stelle < len(zeile) else ""

        bewegungen.append(Bewegung(
            buchungsdatum=_datum(feld("buchungsdatum")),
            betrag_cent=betrag_zu_cent(feld("betrag")),
            verwendungszweck=" ".join(feld("verwendungszweck").split()),
            gegen_name=feld("gegen_name"),
            gegen_iban=feld("gegen_iban").replace(" ", "").upper(),
        ))
    if not bewegungen:
        raise ImportAbgelehnt("keine umsatzzeilen unter der kopfzeile")
    return bewegungen


# ── CAMT.053 ─────────────────────────────────────────────────────────────────

def camt_lesen(daten: bytes) -> list:
    """CAMT.053 (Kontoauszug) -> Bewegungen. Namensraum-agnostisch ueber
    local-name, damit camt.053.001.02 bis .08 gleichermassen lesbar sind."""
    try:
        baum = etree.fromstring(daten)
    except etree.XMLSyntaxError as fehler:
        raise ImportAbgelehnt(f"kein lesbares xml: {fehler}")

    def lokal(knoten, name):
        return [kind for kind in knoten.iter()
                if etree.QName(kind).localname == name]

    eintraege = lokal(baum, "Ntry")
    if not eintraege:
        raise ImportAbgelehnt("camt ohne Ntry-eintraege (falsches format?)")

    bewegungen = []
    for eintrag in eintraege:
        def erster_text(name, wurzel):
            treffer = lokal(wurzel, name)
            return (treffer[0].text or "").strip() if treffer else ""

        betrag_knoten = lokal(eintrag, "Amt")[0]
        betrag = betrag_zu_cent(betrag_knoten.text)
        if erster_text("CdtDbtInd", eintrag) == "DBIT":
            betrag = -abs(betrag)
        datum_text = erster_text("Dt", lokal(eintrag, "BookgDt")[0]) \
            if lokal(eintrag, "BookgDt") else ""
        zweck = " ".join(" ".join(
            (knoten.text or "").strip() for knoten in lokal(eintrag, "Ustrd")).split())
        parteien = lokal(eintrag, "RltdPties")
        name = erster_text("Nm", parteien[0]) if parteien else ""
        iban = erster_text("IBAN", parteien[0]) if parteien else ""

        bewegungen.append(Bewegung(
            buchungsdatum=_datum(datum_text),
            betrag_cent=betrag,
            verwendungszweck=zweck,
            gegen_name=name,
            gegen_iban=iban.replace(" ", "").upper(),
        ))
    return bewegungen


def datei_lesen(daten: bytes, dateiname: str) -> list:
    """Weiche: CAMT-XML oder CSV, nach Inhalt entschieden (nicht nur Endung)."""
    anfang = daten[:200].lstrip()
    if anfang.startswith(b"<?xml") or anfang.startswith(b"<Document"):
        return camt_lesen(daten)
    if (dateiname or "").lower().endswith((".xml", ".camt")):
        return camt_lesen(daten)
    return csv_lesen(daten)
