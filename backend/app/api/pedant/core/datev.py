"""DATEV-Buchungsstapel im EXTF-Format (FAHRPLAN Kap. 9 + 13 Phase sechs).

Spezifikation (verifiziert 2026-08-24 gegen developer.datev.de und die
DATEV-Formatdefinition aus pydatev): Kennzeichen EXTF (Fremdsoftware),
DATEV-Format-Version 700, Datenkategorie 21, Formatname "Buchungsstapel",
Formatversion 13 = 125 Spalten. Kodierung CP1252 ohne BOM, Semikolon,
CRLF, Quoting NUR fuer Textfelder, leere Felder als ;;.

Abbildung unseres Journals (Soll an Haben) auf die EXTF-Zeile:
- Feld 2 (S/H) bezieht sich auf Feld 7 (Konto); der BU-Schluessel (Feld 9)
  haengt am GEGENKONTO (Feld 8). Praxisregel: das steuerrelevante Konto
  gehoert ins Gegenkonto.
- Traegt eine Buchung einen Steuerschluessel (Vorsteuer '9'/'8' aus der
  Beleg-Freigabe), wird deshalb GEDREHT exportiert: Konto = Habenkonto
  (Geldkonto), S/H = "H", Gegenkonto = Sollkonto (Aufwand), BU = Schluessel.
  Das bucht identisch ("6815 an 1800"), setzt den BU aber ans richtige Konto.
- Ohne Steuerschluessel geht es gerade heraus: Konto = Sollkonto, S/H = "S",
  Gegenkonto = Habenkonto, BU leer (Automatikkonten wie 4400 ziehen die
  Steuer selbst — ein BU-Schluessel dort erzeugte #REW00306).
- Feld 10 "Belegdatum" ist im Stapel DAS Buchungsdatum der Fibu (Format TTMM,
  Jahr kommt aus dem Header) — wir schreiben unser Journal-Buchungsdatum,
  das per Zeitraumfilter sicher im Header-Zeitraum liegt.
- Festschreibung = 0: der Steuerberater schreibt nach Pruefung selbst fest
  (leer waere die schlechteste Wahl — seit 2019 heisst leer "festschreiben").
"""

import re
from datetime import date, datetime

FORMAT_KENNZEICHEN = "EXTF"
FORMAT_VERSION = 700
DATENKATEGORIE = 21
FORMATNAME = "Buchungsstapel"
FORMATVERSION = 13
SPALTENZAHL = 125
STANDARD_BERATER = 1001     # DATEV-Platzhalter bis der Steuerberater die echte vergibt
STANDARD_MANDANT = 1
SACHKONTENLAENGE = 4
SKR = "04"
FESTSCHREIBUNG = 0

_BELEGFELD_ERLAUBT = re.compile(r"[^A-Za-z0-9$%&*+/-]")


class DatevAbgelehnt(ValueError):
    """Zeitraum/Parameter unbrauchbar — Router uebersetzt in 422."""


# Spaltenueberschriften (Zeile 2) — rein informativ fuer DATEV, aber die
# Spaltenzahl muss exakt stimmen. Die ersten 20 ausgeschrieben, der Rest
# programmatisch (Beleginfo/Zusatzinformation-Paare etc.).
def _spaltennamen() -> list:
    namen = [
        "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz",
        "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto",
        "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum",
        "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext", "Postensperre",
        "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt",
        "Zinssperre", "Beleglink",
    ]
    for nummer in range(1, 9):
        namen += [f"Beleginfo - Art {nummer}", f"Beleginfo - Inhalt {nummer}"]
    namen += ["KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge",
              "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
              "Abw. Versteuerungsart", "Sachverhalt L+L",
              "Funktionsergänzung L+L", "BU 49 Hauptfunktionstyp",
              "BU 49 Hauptfunktionsnummer", "BU 49 Funktionsergänzung"]
    for nummer in range(1, 21):
        namen += [f"Zusatzinformation - Art {nummer}",
                  f"Zusatzinformation - Inhalt {nummer}"]
    namen += ["Stück", "Gewicht", "Zahlweise", "Forderungsart",
              "Veranlagungsjahr", "Zugeordnete Fälligkeit", "Skontotyp",
              "Auftragsnummer", "Buchungstyp (Anzahlungen)",
              "USt-Schlüssel (Anzahlungen)", "EU-Land (Anzahlungen)",
              "Sachverhalt L+L (Anzahlungen)", "EU-Steuersatz (Anzahlungen)",
              "Erlöskonto (Anzahlungen)", "Herkunft-Kz", "Buchungs GUID",
              "KOST-Datum", "SEPA-Mandatsreferenz", "Skontosperre",
              "Gesellschaftername", "Beteiligtennummer", "Identifikationsnummer",
              "Zeichnernummer", "Postensperre bis",
              "Bezeichnung SoBil-Sachverhalt", "Kennzeichen SoBil-Buchung",
              "Festschreibung", "Leistungsdatum", "Datum Zuord. Steuerperiode",
              "Fälligkeit", "Generalumkehr (GU)", "Steuersatz", "Land",
              "Abrechnungsreferenz", "BVV-Position",
              "EU-Land u. UStID (Ursprung)", "EU-Steuersatz (Ursprung)",
              "Abw. Skontokonto"]
    assert len(namen) == SPALTENZAHL, len(namen)
    return namen


def _text(wert: str, laenge: int) -> str:
    """Textfeld: quoted, Anfuehrungszeichen verdoppelt, Laenge gedeckelt."""
    sicher = str(wert or "")[:laenge].replace('"', '""')
    return f'"{sicher}"'


def betrag_datev(cent: int) -> str:
    """Positive Cent -> '1463,11' (Dezimalkomma, keine Tausenderpunkte)."""
    if not isinstance(cent, int) or isinstance(cent, bool) or cent <= 0:
        raise DatevAbgelehnt(f"betrag muss positive ganzzahl in cent sein: {cent!r}")
    return f"{cent // 100},{cent % 100:02d}"


def belegfeld(text: str) -> str:
    """Belegfeld-1-Zeichensatz: A-Za-z0-9 $ % & * + - / — Rest faellt raus."""
    return _BELEGFELD_ERLAUBT.sub("", str(text or ""))[:36]


def _kopfzeile(*, von: date, bis: date, berater: int, mandant: int,
               bezeichnung: str, jetzt: datetime) -> str:
    felder = [
        _text(FORMAT_KENNZEICHEN, 4),                 # 1
        str(FORMAT_VERSION),                          # 2
        str(DATENKATEGORIE),                          # 3
        _text(FORMATNAME, 30),                        # 4
        str(FORMATVERSION),                           # 5
        jetzt.strftime("%Y%m%d%H%M%S") + "000",       # 6 erzeugt am (JJJJMMTTHHMMSSFFF)
        "",                                           # 7 importiert — leer
        _text("RE", 2),                               # 8 Herkunft
        _text("pedant", 25),                          # 9 exportiert von
        "",                                           # 10 importiert von — leer
        str(berater),                                 # 11
        str(mandant),                                 # 12
        f"{von.year:04d}0101",                        # 13 WJ-Beginn
        str(SACHKONTENLAENGE),                        # 14
        von.strftime("%Y%m%d"),                       # 15
        bis.strftime("%Y%m%d"),                       # 16
        _text(bezeichnung, 30),                       # 17
        _text("", 2),                                 # 18 Diktatkuerzel
        "1",                                          # 19 Buchungstyp Fibu
        "0",                                          # 20 Rechnungslegungszweck
        str(FESTSCHREIBUNG),                          # 21
        _text("EUR", 3),                              # 22
        "",                                           # 23 reserviert
        "",                                           # 24 Derivatskennzeichen
        "", "",                                       # 25-26 reserviert
        _text(SKR, 2),                                # 27
        "",                                           # 28 Branchenloesung
        "", "",                                       # 29-30 reserviert
        "",                                           # 31 Anwendungsinformation
    ]
    assert len(felder) == 31
    return ";".join(felder)


def _buchungszeile(buchung: dict) -> str:
    schluessel = str(buchung.get("steuerschluessel") or "").strip()
    if schluessel:
        # Gedreht: BU haengt am Gegenkonto -> steuerrelevantes Sollkonto dorthin.
        konto, sh, gegenkonto, bu = (buchung["habenkonto"], "H",
                                     buchung["sollkonto"], schluessel)
    else:
        konto, sh, gegenkonto, bu = (buchung["sollkonto"], "S",
                                     buchung["habenkonto"], "")
    felder = [""] * SPALTENZAHL
    felder[0] = betrag_datev(buchung["betrag_cent"])
    felder[1] = _text(sh, 1)
    felder[6] = str(konto)
    felder[7] = str(gegenkonto)
    felder[8] = _text(bu, 4) if bu else ""
    felder[9] = buchung["buchungsdatum"].strftime("%d%m")
    felder[10] = _text(belegfeld(buchung.get("belegreferenz")), 36)
    felder[13] = _text(buchung.get("buchungstext") or "", 60)
    return ";".join(felder)


def extf_erzeugen(buchungen: list, *, von: date, bis: date,
                  berater: int = STANDARD_BERATER,
                  mandant: int = STANDARD_MANDANT,
                  bezeichnung: str = "", jetzt: datetime | None = None) -> bytes:
    """Journalzeilen -> komplette EXTF-Datei (CP1252, CRLF)."""
    if von > bis:
        raise DatevAbgelehnt("von liegt nach bis")
    if von.year != bis.year:
        raise DatevAbgelehnt(
            "der zeitraum muss in EINEM wirtschaftsjahr liegen —"
            " je jahr eine datei exportieren")
    if not (1001 <= berater <= 9_999_999):
        raise DatevAbgelehnt("beraternummer muss zwischen 1001 und 9999999 liegen")
    if not (1 <= mandant <= 99_999):
        raise DatevAbgelehnt("mandantennummer muss zwischen 1 und 99999 liegen")
    jetzt = jetzt or datetime.now()
    bezeichnung = bezeichnung or f"Buchungen {von.strftime('%d.%m.')}-{bis.strftime('%d.%m.%Y')}"

    zeilen = [_kopfzeile(von=von, bis=bis, berater=berater, mandant=mandant,
                         bezeichnung=bezeichnung, jetzt=jetzt),
              ";".join(_spaltennamen())]
    zeilen += [_buchungszeile(buchung) for buchung in buchungen]
    inhalt = "\r\n".join(zeilen) + "\r\n"
    return inhalt.encode("cp1252", errors="replace")


def dateiname(von: date, bis: date) -> str:
    """Das Praefix EXTF_ ist Pflicht."""
    return f"EXTF_Buchungsstapel_{von.strftime('%Y%m%d')}_{bis.strftime('%Y%m%d')}.csv"
