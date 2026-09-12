"""Der Kopf einer IFC-Datei — gelesen OHNE ifcopenshell, im API-Server beim Upload.

WARUM (2026-09-11): der Upload pruefte nichts Fachliches. Eine PDF mit der
Endung .ifc landete als `art: modell` im Register und fiel erst Minuten oder
Tage spaeter im Verbund auf — oder nie, wenn niemand einen Verbund baute.

Was hier geschieht, ist billig und SICHER: die ersten Megabytes, vier regulaere
Ausdruecke. ABGELEHNT wird nur, was sicher keine IFC-Datei ist (.ifc ohne
STEP-Kopf, .ifczip ohne ZIP-Kopf). Schema und Laengeneinheit sind HINWEISE:
die Lieferung gehoert dem Planer, und ob sie konform ist, sagt das Prueftor
(`pruefe.py`), nicht der Upload.

Spiegel: client/src/features/cde/services/ModelIdentity.js (`leseKopf`,
`kopfAblehnung`). Beide lesen dieselbe Falltabelle
(`tests/daten/kopf_faelle.json`) — zwei Umsetzungen, eine Tabelle.
Rein: kein ifcopenshell, laeuft im Produktions-venv.
"""
import re

# So viel liest der Upload mit (die IFCPROJECT-Zeile steht praktisch immer darin).
KOPF_BYTES = 4 * 1024 * 1024

_STEP = re.compile(rb"^(?:\xef\xbb\xbf)?\s*ISO-10303-21\s*;")
_ZIP = b"PK\x03\x04"
_SCHEMA = re.compile(rb"FILE_SCHEMA\s*\(\s*\(\s*'([A-Za-z0-9_]+)'")
_PROJEKT = re.compile(rb"IFCPROJECT\s*\(\s*'([^']{1,64})'")
_LAENGE = re.compile(rb"IFCSIUNIT\s*\(\s*\*\s*,\s*\.LENGTHUNIT\.\s*,\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)")
# SI-Vorsilbe der Laengeneinheit -> Zeichen. Eine Vorsilbe ausserhalb der Tabelle
# kommt als Wort zurueck, nie als geratenes Zeichen.
VORSILBEN = {"$": "m", ".KILO.": "km", ".HECTO.": "hm", ".DECA.": "dam", ".DECI.": "dm",
             ".CENTI.": "cm", ".MILLI.": "mm", ".MICRO.": "µm", ".NANO.": "nm"}


def lies_kopf(kopf: bytes) -> dict:
    """STEP-/ZIP-Kopf, FILE_SCHEMA, SI-Laengeneinheit und IFCPROJECT-GlobalId — oder None je Feld."""
    k = bytes(kopf or b"")
    anfang = k[:200]
    schema = _SCHEMA.search(k)
    projekt = _PROJEKT.search(k)
    laenge = _LAENGE.search(k)
    vorsilbe = laenge.group(1).decode("ascii") if laenge else None
    return {
        "ist_step": bool(_STEP.match(anfang)),
        "ist_zip": anfang.startswith(_ZIP),
        "schema": schema.group(1).decode("ascii").upper() if schema else None,
        "einheit_hinweis": VORSILBEN.get(vorsilbe, vorsilbe.strip(".").lower()) if vorsilbe else None,
        "projekt_global_id": projekt.group(1).decode("ascii", "replace") if projekt else None,
    }


def ablehnung(kopf: bytes, endung: str) -> str | None:
    """Der Grund, warum diese Datei nicht als Modell ins Register darf — oder None."""
    e = (endung or "").lower()
    k = lies_kopf(kopf)
    if e == ".ifc" and not k["ist_step"]:
        return ("keine IFC-Datei: der STEP-Kopf 'ISO-10303-21;' fehlt am Anfang "
                "— bitte die Lieferung pruefen (falsche Endung oder beschaedigt?)")
    if e == ".ifczip" and not k["ist_zip"]:
        return "keine IFCZIP-Datei: der ZIP-Kopf fehlt am Anfang"
    return None
