"""IFC-Schema-Auskunft als Werkzeuge — fuer den MCP-Server `ifc` (Fahrplan IFC-Konsistenz, Stufe 7).

Liest NUR den Schnappschuss der Schema-Wahrheit (`app/ifc/schema.py`,
`app/ifc/daten/schema_IFC4X3_ADD2.json`, gezogen aus dem gepinnten
ifcopenshell 0.8.5). Das MCP-venv hat kein ifcopenshell und bekommt keins.
Eine zweite Schema-Quelle (etwa ifc-core-mcp, gebaut aus dem
IFC4.3-Entwicklungsstand) wird bewusst NICHT eingebunden: dieselbe Frage
bekaeme zwei Antworten.

Einzige Ausnahme: `ifc_pruefe_datei` startet das Prueftor als Unterprozess im
IFC-venv — dieselbe Pruefung, die der Server faehrt.

Rein, ohne fastmcp: angemeldet werden die Werkzeuge in ifc_server.py, getestet
in backend/app/ifc/tests/test_mcp_werkzeuge.py.
"""
import json
import os
import subprocess
from pathlib import Path

from app.ifc import schema as S

BACKEND = Path(__file__).resolve().parents[2]
IFC_PYTHON = BACKEND / "app" / "ifc" / ".venv-ifc" / "bin" / "python"
IFC_ENDUNGEN = (".ifc", ".ifczip")

ANLEITUNG = (
    "IFC-Schema der Quagg-CDE (IFC4X3_ADD2 aus ifcopenshell 0.8.5, dazu Produkt-Waisen aus IFC4/IFC2X3). "
    "Klassen NACHSCHLAGEN statt raten: ifc_entity, ifc_vererbung, ifc_attribute, ifc_where_rules, ifc_pset, "
    "ifc_altname. Schreibweise egal (IFCWALL = IfcWall). ifc_pruefe_datei schickt eine .ifc durch das "
    "Prueftor; sperrend ist nur ein Befund mit ok != true UND schwere 'fehler' — ok=null heisst ungeprueft, "
    "und ungeprueft gilt als nicht bestanden."
)


def _unbekannt(name) -> dict:
    return {"fehler": f"{name!r} ist keine Klasse des Schnappschusses ({S.ZIELSCHEMA} + Waisen aus IFC4/IFC2X3)",
            "tipp": "ifc_altname fragen — vielleicht umbenannt oder gestrichen"}


def ifc_entity(name: str) -> dict:
    """Eine IFC-Klasse nachschlagen: Obertyp, abstrakt, Schemata, Beschreibung, PredefinedTypes, ob der
    CDE-Eigenbau sie schreiben darf, Link zur buildingSMART-Doku. Schreibweise egal (IFCWALL = IfcWall)."""
    n = S.klasse_zu(name)
    if not n:
        return _unbekannt(name)
    e = S.eintrag(n)
    out = {"name": n, "ober": e.get("ober"), "abstrakt": e["abstrakt"], "schemata": e["schemata"],
           "beschreibung": e.get("beschreibung"), "spec_url": e.get("spec_url"),
           "predefined": S.predefined(n), "schreibbar": S.ist_schreibbar(n) is not None}
    for k in ("abgekuendigt", "nachfolger", "herkunft"):
        if e.get(k) is not None:
            out[k] = e[k]
    return out


def ifc_vererbung(name: str, untertypen: bool = False) -> dict:
    """Die Vererbungskette einer IFC-Klasse von IfcRoot bis zu ihr; mit untertypen=True auch alle konkreten
    Nachfahren (die Klasse selbst eingeschlossen, wenn sie konkret ist)."""
    n = S.klasse_zu(name)
    if not n:
        return _unbekannt(name)
    out = {"name": n, "kette": S.vererbung(n)}
    if untertypen:
        out["untertypen_konkret"] = S.untertypen(n, konkret=True)
    return out


def ifc_attribute(name: str, inverse: bool = False) -> dict:
    """Alle Attribute einer IFC-Klasse in EXPRESS-Reihenfolge — Name, Typ, optional und die Stufe, die es
    fuehrt. Mit inverse=True auch die inversen Attribute (z. B. IsDefinedBy, VoidsElements)."""
    n = S.klasse_zu(name)
    if not n:
        return _unbekannt(name)
    out = {"name": n, "attribute": S.attribute(n)}
    if inverse:
        out["inverse"] = S.inverse(n)
    return out


def ifc_where_rules(name: str, geerbt: bool = True) -> dict:
    """Die Where-Rules einer IFC-Klasse samt Quelltext (ifcopenshell.express.rules) — mit geerbt=True auch die
    der Obertypen, die ebenso gelten. Hilft, einen SPF-Befund des Prueftors zu verstehen."""
    n = S.klasse_zu(name)
    if not n:
        return _unbekannt(name)
    return {"name": n, "geerbt": geerbt, "regeln": S.where_rules(n, geerbt=geerbt)}


def ifc_pset(name: str, predefined_type: str | None = None) -> dict:
    """Pset-/Qto-Vorlagen der buildingSMART. Mit einem Klassennamen: welche Vorlagen gelten (ueber die
    Vererbung; optional nur die fuer diesen PredefinedType) und die Mengenvorlage. Mit einem Vorlagennamen
    (Pset_WallCommon, Qto_EarthworksCutBaseQuantities): die Vorlage mit ihren Merkmalen."""
    v = S.vorlage(name)
    if v:
        return {"vorlage": v}
    n = S.klasse_zu(name)
    if not n:
        return _unbekannt(name)
    return {"name": n, "predefined_type": predefined_type, "vorlagen": S.vorlagen_fuer(n, predefined_type),
            "mengenvorlage": (S.qto_vorlage(n) or {}).get("name")}


def ifc_altname(name: str) -> dict:
    """Wie liest die CDE einen Klassennamen aus IFC2X3/IFC4? Umbenannt (und wohin), gestrichen, abgekuendigt,
    im Zielschema IFC4X3_ADD2 oder nicht."""
    gross = str(name or "").strip().upper()
    umbenannt = {k.upper(): v for k, v in S.ALTNAMEN.items()}
    gestrichen = {g.upper() for g in S.GESTRICHEN}
    klasse = S.klasse_zu(name)
    e = S.eintrag(klasse) if klasse else None
    return {"gefragt": name, "klasse": klasse, "normiert": S.normalisiere(name),
            "umbenannt_zu": umbenannt.get(gross), "gestrichen": gross in gestrichen,
            "im_zielschema": bool(e and S.ZIELSCHEMA in e["schemata"]),
            "abgekuendigt": bool(e and e.get("abgekuendigt")), "nachfolger": (e or {}).get("nachfolger")}


def ifc_pruefe_datei(pfad: str, ids: list[str] | None = None, lieferung: bool = True,
                     ohne_regeln: bool = False) -> dict:
    """Eine .ifc/.ifczip durch das Prueftor der CDE schicken: SPF (Syntax, Schema, Where-Rules),
    Verbundregeln, IDS. lieferung=True prueft wie eine einzelne Lieferung (Verbundregeln melden nur).
    ids: Pfade zu IDS-1.0-Dateien. Dauert Sekunden bis Minuten (Where-Rules gemessen 27–81 s)."""
    datei = Path(pfad).expanduser()
    if not datei.is_file() or datei.suffix.lower() not in IFC_ENDUNGEN:
        return {"fehler": f"{pfad}: keine vorhandene .ifc/.ifczip-Datei"}
    if not IFC_PYTHON.is_file():
        return {"fehler": f"IFC-venv fehlt ({IFC_PYTHON}) — Einrichtung: backend/app/ifc/README.md"}
    befehl = [str(IFC_PYTHON), "-m", "app.ifc.pruefe", str(datei.resolve()), "--json"]
    if ids:
        befehl += ["--ids", *[str(Path(i).expanduser().resolve()) for i in ids]]
    if lieferung:
        befehl.append("--lieferung")
    if ohne_regeln:
        befehl.append("--ohne-regeln")
    try:
        r = subprocess.run(befehl, cwd=BACKEND, capture_output=True, text=True, timeout=1800,
                           env={**os.environ, "PYTHONPATH": str(BACKEND)})
    except subprocess.TimeoutExpired:
        return {"fehler": "Prueftor nach 30 min abgebrochen"}
    try:
        bericht = json.loads(r.stdout)
    except ValueError:
        return {"fehler": f"Prueftor endete mit {r.returncode} ohne JSON", "ausgabe": (r.stdout + r.stderr)[-3000:]}
    return {"datei": str(datei), "rueckgabe": r.returncode, "bericht": bericht}


WERKZEUGE = (ifc_entity, ifc_vererbung, ifc_attribute, ifc_where_rules, ifc_pset, ifc_altname, ifc_pruefe_datei)
