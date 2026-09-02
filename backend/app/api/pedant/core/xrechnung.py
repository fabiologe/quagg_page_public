"""XRechnung-Erzeugung (UBL 2.1) — pur, deterministisch, ohne DB.

Warum eigenes Template statt Bibliothek: 2026 existiert keine gepflegte
Python-Bibliothek mit XRechnung-UBL als Kernaufgabe (drafthorse = ZUGFeRD/CII
mit PDF-Huelle, factur-x = FR-zentriert). Eine Behoerden-Dienstleistungs-
rechnung ist strukturell klein (~30 Pflicht-BTs), die normative Vorlage ist
die KoSIT-Testsuite (01.01a-INVOICE_ubl.xml), und die Absicherung leistet der
offizielle KoSIT-Validator (core/kosit.py) — exakt die Artefakte, mit denen
auch die Portale pruefen. Kein Stellen ohne gruenen Validator.

Deterministisch: gleiche Eingaben -> byte-gleiches XML (Golden-File-Tests,
idempotente Wiederholung des Stellen-Flows). Keine Zeitstempel ausser den
Felddaten selbst.

Der Konstantenblock unten ist die EINZIGE Stelle, die beim Umstieg auf
XRechnung 4.0 (angekuendigt fuer Ende 2026) angefasst werden muss.
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta

from lxml import etree

# ── Versions-/Namensraum-Konstanten (Upgrade-Punkt fuer XRechnung 4.0) ───────
XRECHNUNG_VERSION = "3.0.2"
CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
NS_INV = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
NS_CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
NS_CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
NSMAP = {None: NS_INV, "cac": NS_CAC, "cbc": NS_CBC}

RECHNUNGSTYP = "380"        # BT-3: Handelsrechnung (Default; Schlussrechnung ebenfalls 380)
RECHNUNGSTYPEN = ("380", "326")   # 326 = Abschlagsrechnung (Teilrechnung)
WAEHRUNG = "EUR"            # BT-5
ZAHLUNGSMITTEL = "58"       # BT-81: SEPA-Ueberweisung
STEUERKATEGORIE = "S"       # BT-118/151: Standardsatz
EINHEITEN = ("HUR", "C62", "H87")  # Stunde, Pauschale/Einheit, Stueck


@dataclass(frozen=True)
class Summen:
    netto_cent: int
    steuer_cent: int
    brutto_cent: int


def cent_als_dezimal(cent: int) -> str:
    """123456 -> '1234.56' — UBL will Dezimalpunkt und zwei Stellen."""
    if not isinstance(cent, int) or isinstance(cent, bool) or cent < 0:
        raise ValueError(f"cent muss nicht-negative Ganzzahl sein: {cent!r}")
    return f"{cent // 100}.{cent % 100:02d}"


def tausendstel_als_menge(tausendstel: int) -> str:
    """2500 -> '2.500' — Mengen mit drei Nachkommastellen."""
    if not isinstance(tausendstel, int) or tausendstel <= 0:
        raise ValueError(f"menge muss positive Ganzzahl (Tausendstel) sein: {tausendstel!r}")
    return f"{tausendstel // 1000}.{tausendstel % 1000:03d}"


def positions_betrag_cent(menge_tausendstel: int, einzelpreis_cent: int) -> int:
    """DIE Rundungswahrheit — identisch zur GENERATED-Spalte in der DB
    ((m*p+500)/1000, BIGINT-Division) und zu useRechnungSummen im Client."""
    return (menge_tausendstel * einzelpreis_cent + 500) // 1000


def summen(positionen: list, steuersatz: int) -> Summen:
    """Positionsweise kaufmaennisch runden, dann summieren (EN-16931-konform);
    Steuer auf die Nettosumme, kaufmaennisch."""
    netto = sum(positions_betrag_cent(p["menge_tausendstel"], p["einzelpreis_cent"])
                for p in positionen)
    steuer = (netto * steuersatz + 50) // 100
    return Summen(netto_cent=netto, steuer_cent=steuer, brutto_cent=netto + steuer)


def faellig_am(rechnungsdatum: date, zahlungsziel_tage: int) -> date:
    return rechnungsdatum + timedelta(days=zahlungsziel_tage)


# ── Leitweg-ID (BT-10) ───────────────────────────────────────────────────────
_LEITWEG_MUSTER = re.compile(r"^(\d{2,12})(?:-([0-9A-Za-z]{1,30}))?-(\d{2})$")


def leitweg_pruefen(leitweg: str) -> str | None:
    """Format + ISO-7064-MOD-97-10-Pruefziffer (Buchstaben wie bei IBAN zu
    Zahlen). None = in Ordnung, sonst Fehlertext. BR-DE-15 ist der haeufigste
    Portal-Ablehnungsgrund — deshalb hart pruefen, bevor die Nummer verbrannt ist."""
    treffer = _LEITWEG_MUSTER.fullmatch((leitweg or "").strip())
    if not treffer:
        return ("Leitweg-ID passt nicht ins Muster Grobadressierung"
                "[-Feinadressierung]-Pruefziffer (z. B. 04011000-12345-03)")
    grob, fein, pruefziffer = treffer.group(1), treffer.group(2) or "", treffer.group(3)
    ziffern = "".join(str(int(zeichen, 36)) for zeichen in (grob + fein).upper())
    if int(ziffern + pruefziffer) % 97 != 1:
        return "Leitweg-ID: Pruefziffer stimmt nicht (ISO 7064 MOD 97-10)"
    return None


# ── Pflichtfelder (FAHRPLAN Kap. 7 Schritt 2 — VOR der XML-Erzeugung) ────────

def firmendaten_fehlend(firma: dict) -> list[str]:
    fehlend = []
    for feld, name in (("name", "Firmenname"), ("strasse", "Strasse"),
                       ("plz", "PLZ"), ("ort", "Ort"),
                       ("email", "E-Mail (BT-43)"), ("telefon", "Telefon (BT-42)"),
                       ("ansprechpartner", "Ansprechpartner (BT-41)"),
                       ("iban", "IBAN (BT-84)")):
        if not str(firma.get(feld, "")).strip():
            fehlend.append(name)
    if not str(firma.get("ust_id", "")).strip() and not str(firma.get("steuernummer", "")).strip():
        fehlend.append("USt-ID oder Steuernummer (BR-DE-2)")
    return fehlend


def pflichtfelder_pruefen(*, firma: dict, auftraggeber: dict,
                          rechnung: dict, positionen: list) -> list[str]:
    fehler = [f"Firmendaten: {eintrag}" for eintrag in firmendaten_fehlend(firma)]
    for feld, name in (("name", "Name"), ("strasse", "Strasse"),
                       ("plz", "PLZ"), ("ort", "Ort"), ("email", "E-Mail (BT-49)")):
        if not str(auftraggeber.get(feld, "")).strip():
            fehler.append(f"Auftraggeber: {name} fehlt")
    leitweg_fehler = leitweg_pruefen(auftraggeber.get("leitweg_id", ""))
    if leitweg_fehler:
        fehler.append(f"Auftraggeber: {leitweg_fehler}")
    if not rechnung.get("rechnungsdatum"):
        fehler.append("Rechnungsdatum fehlt")
    if not rechnung.get("leistung_von") or not rechnung.get("leistung_bis"):
        fehler.append("Leistungszeitraum fehlt (BG-14)")
    if not positionen:
        fehler.append("Mindestens eine Position wird gebraucht")
    return fehler


# ── UBL-Erzeugung ────────────────────────────────────────────────────────────

def _el(eltern, ns: str, name: str, text: str | None = None, **attribute):
    knoten = etree.SubElement(eltern, f"{{{ns}}}{name}")
    for schluessel, wert in attribute.items():
        knoten.set(schluessel, wert)
    if text is not None:
        knoten.text = text
    return knoten


def _betrag(eltern, name: str, cent: int):
    return _el(eltern, NS_CBC, name, cent_als_dezimal(cent), currencyID=WAEHRUNG)


def _adresse(eltern, daten: dict):
    adresse = _el(eltern, NS_CAC, "PostalAddress")
    _el(adresse, NS_CBC, "StreetName", daten["strasse"])
    _el(adresse, NS_CBC, "CityName", daten["ort"])
    _el(adresse, NS_CBC, "PostalZone", daten["plz"])
    land = _el(adresse, NS_CAC, "Country")
    _el(land, NS_CBC, "IdentificationCode", daten.get("land") or "DE")


def ubl_erzeugen(*, rechnungsnummer: str, firma: dict, auftraggeber: dict,
                 rechnung: dict, positionen: list, betraege: Summen,
                 vorrechnungen: list | tuple = (), vorab_cent: int = 0) -> bytes:
    """Baut die XRechnung als UBL-2.1-Invoice. Elementreihenfolge folgt dem
    UBL-Schema (Sequenz!) und der KoSIT-Vorlage 01.01a-INVOICE_ubl.xml."""
    wurzel = etree.Element(f"{{{NS_INV}}}Invoice", nsmap=NSMAP)
    _el(wurzel, NS_CBC, "CustomizationID", CUSTOMIZATION_ID)
    _el(wurzel, NS_CBC, "ProfileID", PROFILE_ID)
    _el(wurzel, NS_CBC, "ID", rechnungsnummer)                       # BT-1
    _el(wurzel, NS_CBC, "IssueDate", rechnung["rechnungsdatum"].isoformat())  # BT-2
    faellig = faellig_am(rechnung["rechnungsdatum"], rechnung["zahlungsziel_tage"])
    _el(wurzel, NS_CBC, "DueDate", faellig.isoformat())              # BT-9
    typ = str(rechnung.get("rechnungstyp") or RECHNUNGSTYP)
    if typ not in RECHNUNGSTYPEN:
        raise ValueError(f"rechnungstyp muss einer von {RECHNUNGSTYPEN} sein")
    if not isinstance(vorab_cent, int) or vorab_cent < 0 or vorab_cent > betraege.brutto_cent:
        raise ValueError("vorab_cent muss zwischen 0 und brutto liegen")
    _el(wurzel, NS_CBC, "InvoiceTypeCode", typ)                       # BT-3
    _el(wurzel, NS_CBC, "DocumentCurrencyCode", WAEHRUNG)            # BT-5
    _el(wurzel, NS_CBC, "BuyerReference", auftraggeber["leitweg_id"])  # BT-10

    zeitraum = _el(wurzel, NS_CAC, "InvoicePeriod")                  # BG-14
    _el(zeitraum, NS_CBC, "StartDate", rechnung["leistung_von"].isoformat())
    _el(zeitraum, NS_CBC, "EndDate", rechnung["leistung_bis"].isoformat())

    if str(rechnung.get("auftrag_referenz", "")).strip():            # BT-13
        auftrag = _el(wurzel, NS_CAC, "OrderReference")
        _el(auftrag, NS_CBC, "ID", rechnung["auftrag_referenz"].strip())

    for vor in vorrechnungen:                                        # BG-3: Vorrechnungen (Abschlaege)
        ref = _el(_el(wurzel, NS_CAC, "BillingReference"), NS_CAC, "InvoiceDocumentReference")
        _el(ref, NS_CBC, "ID", str(vor["rechnungsnummer"]))          # BT-25
        datum = vor.get("rechnungsdatum")
        if datum:                                                    # BT-26
            _el(ref, NS_CBC, "IssueDate", datum.isoformat() if hasattr(datum, "isoformat") else str(datum))

    # ── Verkaeufer (BG-4) ────────────────────────────────────────────────────
    verkaeufer = _el(_el(wurzel, NS_CAC, "AccountingSupplierParty"), NS_CAC, "Party")
    _el(verkaeufer, NS_CBC, "EndpointID", firma["email"], schemeID="EM")  # BT-34
    _adresse(verkaeufer, firma)
    if str(firma.get("ust_id", "")).strip():                         # BT-31
        steuer_schema = _el(verkaeufer, NS_CAC, "PartyTaxScheme")
        _el(steuer_schema, NS_CBC, "CompanyID", firma["ust_id"].strip())
        _el(_el(steuer_schema, NS_CAC, "TaxScheme"), NS_CBC, "ID", "VAT")
    else:                                                            # BT-32
        steuer_schema = _el(verkaeufer, NS_CAC, "PartyTaxScheme")
        _el(steuer_schema, NS_CBC, "CompanyID", firma["steuernummer"].strip())
        _el(_el(steuer_schema, NS_CAC, "TaxScheme"), NS_CBC, "ID", "FC")
    rechtstraeger = _el(verkaeufer, NS_CAC, "PartyLegalEntity")
    name = firma["name"] + (f" {firma['rechtsform_zusatz']}" if str(firma.get("rechtsform_zusatz", "")).strip() else "")
    _el(rechtstraeger, NS_CBC, "RegistrationName", name)             # BT-27
    kontakt = _el(verkaeufer, NS_CAC, "Contact")                     # BG-6, BR-DE-5/6/7
    _el(kontakt, NS_CBC, "Name", firma["ansprechpartner"])           # BT-41
    _el(kontakt, NS_CBC, "Telephone", firma["telefon"])              # BT-42
    _el(kontakt, NS_CBC, "ElectronicMail", firma["email"])           # BT-43

    # ── Kaeufer (BG-7) ───────────────────────────────────────────────────────
    kaeufer = _el(_el(wurzel, NS_CAC, "AccountingCustomerParty"), NS_CAC, "Party")
    _el(kaeufer, NS_CBC, "EndpointID", auftraggeber["email"], schemeID="EM")  # BT-49
    _adresse(kaeufer, auftraggeber)
    _el(_el(kaeufer, NS_CAC, "PartyLegalEntity"), NS_CBC,
        "RegistrationName", auftraggeber["name"])                    # BT-44

    # ── Zahlung (BG-16) ──────────────────────────────────────────────────────
    zahlung = _el(wurzel, NS_CAC, "PaymentMeans")
    _el(zahlung, NS_CBC, "PaymentMeansCode", ZAHLUNGSMITTEL)         # BT-81
    konto = _el(zahlung, NS_CAC, "PayeeFinancialAccount")
    _el(konto, NS_CBC, "ID", firma["iban"].replace(" ", ""))         # BT-84
    if str(firma.get("bank_name", "")).strip():
        _el(konto, NS_CBC, "Name", firma["bank_name"])               # BT-85
    if str(firma.get("bic", "")).strip():
        zweig = _el(konto, NS_CAC, "FinancialInstitutionBranch")
        _el(zweig, NS_CBC, "ID", firma["bic"].strip())               # BT-86
    bedingungen = _el(wurzel, NS_CAC, "PaymentTerms")                # BT-20
    _el(bedingungen, NS_CBC, "Note",
        f"Zahlbar ohne Abzug bis {faellig.isoformat()}")

    # ── Steuer (BG-23) ───────────────────────────────────────────────────────
    steuersatz = rechnung["steuersatz"]
    steuer_gesamt = _el(wurzel, NS_CAC, "TaxTotal")
    _betrag(steuer_gesamt, "TaxAmount", betraege.steuer_cent)        # BT-110
    teil = _el(steuer_gesamt, NS_CAC, "TaxSubtotal")
    _betrag(teil, "TaxableAmount", betraege.netto_cent)              # BT-116
    _betrag(teil, "TaxAmount", betraege.steuer_cent)                 # BT-117
    kategorie = _el(teil, NS_CAC, "TaxCategory")
    _el(kategorie, NS_CBC, "ID", STEUERKATEGORIE)                    # BT-118
    _el(kategorie, NS_CBC, "Percent", f"{steuersatz}.00")            # BT-119
    _el(_el(kategorie, NS_CAC, "TaxScheme"), NS_CBC, "ID", "VAT")

    # ── Summen (BG-22) ───────────────────────────────────────────────────────
    gesamt = _el(wurzel, NS_CAC, "LegalMonetaryTotal")
    _betrag(gesamt, "LineExtensionAmount", betraege.netto_cent)      # BT-106
    _betrag(gesamt, "TaxExclusiveAmount", betraege.netto_cent)       # BT-109
    _betrag(gesamt, "TaxInclusiveAmount", betraege.brutto_cent)      # BT-112
    if vorab_cent:
        _betrag(gesamt, "PrepaidAmount", vorab_cent)                 # BT-113: gestellte Abschlaege
    _betrag(gesamt, "PayableAmount", betraege.brutto_cent - vorab_cent)  # BT-115

    # ── Positionen (BG-25) ───────────────────────────────────────────────────
    for position in positionen:
        zeile = _el(wurzel, NS_CAC, "InvoiceLine")
        _el(zeile, NS_CBC, "ID", str(position["pos_nr"]))            # BT-126
        _el(zeile, NS_CBC, "InvoicedQuantity",                       # BT-129
            tausendstel_als_menge(position["menge_tausendstel"]),
            unitCode=position["einheit"])
        _betrag(zeile, "LineExtensionAmount",                        # BT-131
                positions_betrag_cent(position["menge_tausendstel"],
                                      position["einzelpreis_cent"]))
        artikel = _el(zeile, NS_CAC, "Item")
        _el(artikel, NS_CBC, "Name", position["bezeichnung"])        # BT-153
        artikel_steuer = _el(artikel, NS_CAC, "ClassifiedTaxCategory")
        _el(artikel_steuer, NS_CBC, "ID", STEUERKATEGORIE)           # BT-151
        _el(artikel_steuer, NS_CBC, "Percent", f"{steuersatz}.00")   # BT-152
        _el(_el(artikel_steuer, NS_CAC, "TaxScheme"), NS_CBC, "ID", "VAT")
        preis = _el(zeile, NS_CAC, "Price")
        _betrag(preis, "PriceAmount", position["einzelpreis_cent"])  # BT-146

    return etree.tostring(wurzel, xml_declaration=True, encoding="UTF-8",
                          pretty_print=True)
