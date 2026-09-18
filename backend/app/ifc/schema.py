"""Die EINE Schema-Wahrheit der CDE: IFC4X3_ADD2, wie das gepinnte ifcopenshell es kennt.

WARUM ES DIESE DATEI GIBT. Bis 2026-09-11 stand IFC-Schemawissen an vier
Stellen, und keine wusste von der anderen:

  * `eigenbau.py` fragte ifcopenshell direkt (Klasse, PredefinedType, Qto),
  * das Client-Woerterbuch `data/entity-schema.js` war aus einem bSDD-Export
    erzeugt — von einem Generator, den es im Repo nie gab,
  * `Typprofile.js` fuehrte die Altnamen von Hand,
  * `pset-templates.js` stammte aus derselben 61-MB-Datei.

Der bSDD-Export ist NICHT das Schema. Er laesst abgekuendigte Klassen weg,
die in IFC4X3_ADD2 sehr wohl stehen (`IfcCivilElement`, `IfcWallStandardCase`,
`IfcElectricDistributionBoard` — gemessen), und fuehrt statt dessen 1.057
PredefinedType-Abflachungen (`IFCPIPESEGMENTCULVERT`), die in keiner Datei je
als Klasse vorkommen. Auf diesem Grund stand die Behauptung „IfcCivilElement
ist in 4.3 gestrichen", und auf ihr der strukturelle Rueckweg in `IfcQuelle`.

DIE REGEL: ifcopenshell 0.8.5 (gepinnt, `requirements-ifc.txt`) ist die
Quelle. Diese Datei zieht aus ihm EINEN Schnappschuss
(`daten/schema_IFC4X3_ADD2.json`, im Repo). Alles andere liest ihn:

  * der Eigenbau-Schreiber (welche Klasse, welcher PredefinedType, welche Mengen),
  * der Generator des Client-Woerterbuchs (`generiere_client.py`),
  * der MCP-Server fuer den Agenten und die Diagramme.

Ein Test haelt Schnappschuss und ifcopenshell gleich, ein zweiter die erzeugten
JS-Dateien und den Schnappschuss. Wer ifcopenshell hebt, sieht dort zuerst,
was sich am Schema geaendert hat — mit Namen, nicht als Absturz im Verbund.

REIN BEIM LESEN: jede Abfrage braucht nur den Schnappschuss. Nur
`baue_snapshot()` importiert ifcopenshell. Deshalb laeuft das Lesen auch im
Produktions-venv, im MCP-venv und mit jedem `python3`.

Aufruf:
    .venv-ifc/bin/python -m app.ifc.schema --snapshot       # neu schreiben
    .venv-ifc/bin/python -m app.ifc.schema --pruefe         # Exit 1 bei Abweichung
    python3 -m app.ifc.schema --json IfcEarthworksCut       # eine Klasse, nur Schnappschuss
"""
import argparse
import ast
import importlib
import json
import re
import sys
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

# Das Zielschema. `schema=` nimmt die FASSUNG, `f.schema` meldet die FAMILIE —
# zwei Ebenen derselben Sache (README). Der Migrator arbeitet mit der Familie.
ZIELSCHEMA = "IFC4X3_ADD2"
ZIELFAMILIE = "IFC4X3"
# Die aelteren Schemata, deren Dateien die CDE lesen muss — neueste zuerst.
ALTSCHEMATA = ("IFC4", "IFC2X3")

SNAPSHOT = Path(__file__).parent / "daten" / f"schema_{ZIELSCHEMA}.json"
FORMAT = 1

# ── Was ifcopenshell NICHT weiss: wie alte Namen heute heissen ──────────────
#
# Die Menge der Waisen (IfcProduct-Nachfahren aus IFC4/IFC2X3, die ADD2 nicht
# kennt) wird BERECHNET (`baue_snapshot`). Wohin eine Waise gehoert, ist eine
# Entscheidung — sie steht hier, und ein Test verlangt, dass JEDE Waise eine
# hat: Altname, gestrichen, oder ueber die Endung aufloesbar.
#
# Vorher stand diese Tabelle von Hand in `Typprofile.js`; die beiden
# Structural-*Varying fehlten dort (der Vollstaendigkeitstest fand sie).
ALTNAMEN = {
    # IFC4 -> IFC4.3: umbenannt.
    "IfcBuildingElement": "IfcBuiltElement",
    # Das Abschneiden der Endung allein ergaebe `IfcOpening` — das gibt es nicht.
    "IfcOpeningStandardCase": "IfcOpeningElement",
    # In ADD2 abgekuendigt, aber vorhanden: der Nachfolger ist die bessere Lesart.
    "IfcElectricDistributionBoard": "IfcDistributionBoard",
    # IFC2X3 -> IFC4: umbenannt bzw. zusammengefasst.
    "IfcBuildingElementComponent": "IfcElementComponent",
    "IfcEdgeFeature": "IfcFeatureElementSubtraction",
    "IfcChamferEdgeFeature": "IfcFeatureElementSubtraction",
    "IfcRoundedEdgeFeature": "IfcFeatureElementSubtraction",
    # IFC2X3 -> IFC4: in den Obertyp aufgegangen (veraenderliche Last ist dort Parameter).
    "IfcStructuralLinearActionVarying": "IfcStructuralLinearAction",
    "IfcStructuralPlanarActionVarying": "IfcStructuralPlanarAction",
}
# Ersatzlos gestrichen: kein Nachfolger. Die CDE fuehrt sie trotzdem im
# Woerterbuch (mit ihrer alten Vererbung), weil sie in Lieferungen stehen.
GESTRICHEN = ("IfcElectricDistributionPoint", "IfcElectricalElement", "IfcEquipmentElement", "IfcProxy")
# In ADD2 noch vorhanden, von buildingSMART abgekuendigt. Gemessen 2026-09-11:
# ADD2-Objektklassen, die das bSDD-Woerterbuch 4.3 nicht mehr fuehrt, abzueglich
# der Alignment-Teile und Ressourcen (die fuehrt bSDD grundsaetzlich nicht).
ABGEKUENDIGT = ("IfcBuildingSystem", "IfcCivilElement", "IfcElectricDistributionBoard", "IfcWallStandardCase")
# Endungen, die beschreiben, WIE etwas modelliert ist, nicht WAS es ist.
ENDUNGEN = ("StandardCase", "ElementedCase")

BESCHREIBUNG_ZEICHEN = 400
MERKMAL_ZEICHEN = 240

# Vorlagentyp einer Menge -> Messtyp (die Qto-Vorlagen nennen keinen PrimaryMeasureType).
MESSTYP_MENGE = {"Q_LENGTH": "IfcLengthMeasure", "Q_AREA": "IfcAreaMeasure", "Q_VOLUME": "IfcVolumeMeasure",
                 "Q_WEIGHT": "IfcMassMeasure", "Q_COUNT": "IfcCountMeasure", "Q_TIME": "IfcTimeMeasure",
                 "Q_NUMBER": "IfcNumericMeasure"}


def kurz(text, n: int) -> str:
    """Leerraum zusammenziehen, am Satzende kuerzen — sonst am Wort, mit Auslassung."""
    t = " ".join(str(text or "").split())
    if len(t) <= n:
        return t
    schnitt = t.rfind(". ", 0, n)
    if schnitt >= n // 2:
        return t[:schnitt + 1]
    return t[:n].rsplit(" ", 1)[0] + " …"


# ── Normieren: EIN Algorithmus, gespiegelt in Typprofile.normalisiereKategorie ──

@lru_cache(maxsize=None)
def _alt_gross() -> dict:
    return {k.upper(): v.upper() for k, v in ALTNAMEN.items()}


def normalisiere(name) -> str:
    """Kategorie -> der Name, unter dem ADD2 sie fuehrt (GROSSSCHRIFT).

    Dieselbe Reihenfolge wie im Client (`normalisiereKategorie`): erst der
    Altname, dann die Endung, dann noch einmal der Altname. Andersherum ergaebe
    `IFCOPENINGSTANDARDCASE` das Wort `IFCOPENING`, das es in keinem Schema gibt.
    Ob das Ergebnis existiert, prueft `klasse_zu`. Der Client haelt seine
    Normierung gegen die Tabelle `NORMIERT`, die aus DIESER Funktion erzeugt wird.
    """
    k = str(name or "").strip().upper()
    if not k:
        return ""
    alt = _alt_gross()
    if k in alt:
        return alt[k]
    for endung in ENDUNGEN:
        e = endung.upper()
        if k.endswith(e) and len(k) > len(e):
            ohne = k[: -len(e)]
            return alt.get(ohne, ohne)
    return k


# ── Der Schnappschuss (nur hier wird ifcopenshell importiert) ───────────────

def _ist(decl, wurzel: str) -> bool:
    t = decl
    while t is not None:
        if t.name() == wurzel:
            return True
        t = t.supertype()
    return False


def _typtext(t) -> str:
    """Ein Attributtyp so, wie EXPRESS ihn schreibt: `IfcLabel`, `SET [1:?] OF IfcObjectDefinition`."""
    art = type(t).__name__
    if art == "named_type":
        return t.declared_type().name()
    if art == "aggregation_type":
        b2 = t.bound2()
        return (f"{t.type_of_aggregation_string().upper()} [{t.bound1()}:{'?' if b2 < 0 else b2}] "
                f"OF {_typtext(t.type_of_element())}")
    if art == "simple_type":
        return str(t.declared_type()).upper()
    return str(t)


def _enum_von(attr) -> list:
    """Die Aufzaehlung hinter einem Attribut — durch Typdeklarationen hindurch."""
    t = attr.type_of_attribute()
    while hasattr(t, "declared_type"):
        t = t.declared_type()
    return list(t.enumeration_items()) if hasattr(t, "enumeration_items") else []


def _eigene_inverse(decl) -> list:
    sup = decl.supertype()
    geerbt = {i.name() for i in sup.all_inverse_attributes()} if sup else set()
    out = []
    for i in decl.all_inverse_attributes():
        if i.name() in geerbt:
            continue
        b2 = i.bound2()
        out.append([i.name(), i.entity_reference().name(), i.attribute_reference().name(),
                    (i.type_of_aggregation_string() or "").upper() or None, i.bound1(), b2])
    return out


def _eintrag(decl, doku: dict, schemata: list) -> dict:
    name = decl.name()
    sup = decl.supertype()
    e = {
        "ober": sup.name() if sup else None,
        "abstrakt": bool(decl.is_abstract()),
        "schemata": schemata,
        "attribute": [[a.name(), _typtext(a.type_of_attribute()), bool(a.optional())] for a in decl.attributes()],
        "inverse": _eigene_inverse(decl),
        "beschreibung": kurz((doku.get(name) or {}).get("description"), BESCHREIBUNG_ZEICHEN),
        "spec_url": (doku.get(name) or {}).get("spec_url"),
    }
    pt = next((a for a in decl.attributes() if a.name() == "PredefinedType"), None)
    if pt is not None:
        e["predefined"] = _enum_von(pt)
    return e


def _regeln() -> dict:
    """Die Where-Rules des Zielschemas, wie ifcopenshell sie ausfuehrt.

    Die EXPRESS-Datei liegt dem Paket nicht bei; die Regeln aber als uebersetzte
    Python-Klassen (`express/rules/IFC4X3_ADD2.py`, je Klasse SCOPE, TYPE_NAME,
    RULE_NAME). Der Quelltext wird EINMAL geparst und je Klasse ausgeschnitten —
    `inspect.getsource` je Klasse liefe fuer jede der 777 Klassen erneut ueber
    den ganzen Modulbaum.
    """
    modul = importlib.import_module(f"ifcopenshell.express.rules.{ZIELSCHEMA}")
    quelle = Path(modul.__file__).read_text(encoding="utf-8")
    zeilen = quelle.splitlines()
    out = {}
    for knoten in ast.parse(quelle).body:
        if not isinstance(knoten, ast.ClassDef):
            continue
        klasse = getattr(modul, knoten.name, None)
        typ, regel = getattr(klasse, "TYPE_NAME", None), getattr(klasse, "RULE_NAME", None)
        if not typ or not regel:
            continue
        out[f"{typ}.{regel}"] = {"bereich": getattr(klasse, "SCOPE", None), "typ": typ,
                                 "quelle": "\n".join(zeilen[knoten.lineno - 1:knoten.end_lineno])}
    return out


def _vorlagen() -> dict:
    """Die Pset-/Qto-Vorlagen von buildingSMART fuer das Zielschema.

    Alle 3.988 Merkmalsvorlagen in ADD2 sind einfache (gemessen 2026-09-11).
    Kaeme eine komplexe dazu, bricht der Bau hier LAUT ab, statt sie still zu
    verlieren.
    """
    import ifcopenshell.util.pset
    datei = ifcopenshell.util.pset.get_template(ZIELSCHEMA).templates[0]
    out = {}
    for v in datei.by_type("IfcPropertySetTemplate"):
        merkmale = []
        for p in v.HasPropertyTemplates or ():
            if not p.is_a("IfcSimplePropertyTemplate"):
                raise RuntimeError(f"{v.Name}.{p.Name}: {p.is_a()} — der Schnappschuss kennt nur einfache Vorlagen")
            aufz = getattr(p, "Enumerators", None)
            werte = [getattr(w, "wrappedValue", w) for w in (aufz.EnumerationValues or ())] if aufz else []
            merkmale.append([p.Name, p.TemplateType, p.PrimaryMeasureType or MESSTYP_MENGE.get(p.TemplateType),
                             kurz(p.Description, MERKMAL_ZEICHEN), werte])
        out[v.Name] = {"art": v.TemplateType,
                       "gilt_fuer": [x.strip() for x in (v.ApplicableEntity or "").split(",") if x.strip()],
                       "beschreibung": kurz(v.Description, BESCHREIBUNG_ZEICHEN),
                       "merkmale": merkmale}
    return out


def baue_snapshot() -> dict:
    """Den Schnappschuss aus dem installierten ifcopenshell ziehen. Rein, schreibt nichts."""
    import ifcopenshell

    ziel = ifcopenshell.schema_by_name(ZIELSCHEMA)
    alt = {n: ifcopenshell.schema_by_name(n) for n in ALTSCHEMATA}
    namen_alt = {n: {d.name() for d in s.entities()} for n, s in alt.items()}
    doku_ordner = Path(ifcopenshell.__file__).parent / "util" / "schema"
    doku = {n: json.loads((doku_ordner / f"{n.split('_')[0].lower()}_entities.json").read_text(encoding="utf-8"))
            for n in (ZIELSCHEMA, *ALTSCHEMATA)}

    def schemata_von(name):
        # Alt nach neu, damit die Anzeige wie eine Zeitleiste liest.
        return [n for n in reversed(ALTSCHEMATA) if name in namen_alt[n]]

    regeln = _regeln()
    je_typ = defaultdict(list)
    for kennung, r in regeln.items():
        if r["bereich"] == "entity":
            je_typ[r["typ"]].append(kennung)

    ents = {}
    for d in ziel.entities():
        e = _eintrag(d, doku[ZIELSCHEMA], schemata_von(d.name()) + [ZIELSCHEMA])
        e["regeln"] = sorted(je_typ.get(d.name(), []))
        if d.name() in ABGEKUENDIGT:
            e["abgekuendigt"] = True
        ents[d.name()] = e

    # Die Waisen: Produkte aelterer Schemata, die ADD2 nicht kennt. Ihr Obertyp
    # wird in ADD2-Begriffe uebersetzt, damit ihre Vererbungskette dort endet,
    # wo die Typprofile stehen (IfcBuildingElementComponent -> IfcBuiltElement,
    # nicht -> IfcBuildingElement, das kein Profil traegt).
    bekannt = {n.upper(): n for n in ents}          # nur ADD2 — die Waisen kommen erst unten dazu
    for s_name in ALTSCHEMATA:
        for d in alt[s_name].entities():
            name = d.name()
            if name in ents or not _ist(d, "IfcProduct"):
                continue
            e = _eintrag(d, doku[s_name], schemata_von(name))
            ober = e["ober"]
            # Gegen ADD2 pruefen, nicht gegen `ents`: das waechst in dieser
            # Schleife, und eine Waise unter einer Waise (IfcBuildingElement-
            # Component unter IfcBuildingElement) blieb sonst in alten Begriffen
            # — gefunden vom ersten Lauf von test_waisen_erben_in_add2_begriffen.
            if ober and ober.upper() not in bekannt:
                ober = bekannt.get(normalisiere(ober), ober)
            e["ober"] = ober
            e["herkunft"] = s_name
            ziel_name = bekannt.get(normalisiere(name))
            e["nachfolger"] = ziel_name
            e["regeln"] = []
            ents[name] = e

    return {
        "format": FORMAT,
        "werkzeug": f"ifcopenshell {ifcopenshell.version}",
        "zielschema": ZIELSCHEMA,
        "altschemata": list(ALTSCHEMATA),
        "altnamen": dict(sorted(ALTNAMEN.items())),
        "gestrichen": sorted(GESTRICHEN),
        "abgekuendigt": sorted(ABGEKUENDIGT),
        "endungen": list(ENDUNGEN),
        "entitaeten": dict(sorted(ents.items())),
        "regeln": dict(sorted(regeln.items())),
        "vorlagen": dict(sorted(_vorlagen().items())),
    }


def als_text(snap: dict) -> str:
    return json.dumps(snap, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def unterschiede(frisch: dict, gespeichert: dict, grenze: int = 25) -> list:
    """Was sich zwischen zwei Schnappschuessen geaendert hat — benannt, nicht als Diff-Wand."""
    out = []
    for k in sorted(set(frisch) | set(gespeichert)):
        a, b = frisch.get(k), gespeichert.get(k)
        if a == b:
            continue
        if isinstance(a, dict) and isinstance(b, dict):
            neu = sorted(set(a) - set(b))
            weg = sorted(set(b) - set(a))
            anders = sorted(n for n in set(a) & set(b) if a[n] != b[n])
            if neu:
                out.append(f"{k}: {len(neu)} neu, z. B. {neu[:5]}")
            if weg:
                out.append(f"{k}: {len(weg)} entfallen, z. B. {weg[:5]}")
            if anders:
                out.append(f"{k}: {len(anders)} geaendert, z. B. {anders[:5]}")
        else:
            out.append(f"{k}: {str(b)[:80]!r} -> {str(a)[:80]!r}")
    return out[:grenze]


# ── Lesen (rein, nur der Schnappschuss) ─────────────────────────────────────

@lru_cache(maxsize=None)
def snapshot() -> dict:
    """Der gespeicherte Schnappschuss. Ohne ihn gibt es keine Schema-Auskunft."""
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def _ents(snap=None) -> dict:
    return (snap or snapshot())["entitaeten"]


def _index(snap=None) -> dict:
    if snap is None:
        return _index_datei()
    return {n.upper(): n for n in snap["entitaeten"]}


@lru_cache(maxsize=None)
def _index_datei() -> dict:
    return {n.upper(): n for n in snapshot()["entitaeten"]}


def name_von(name, snap=None):
    """Der kanonische Name (`IfcEarthworksCut`) — gleich wie geschrieben — oder None."""
    return _index(snap).get(str(name or "").strip().upper())


def klasse_zu(name, snap=None):
    """Welche Klasse des Woerterbuchs meint diese Kategorie? Erst wie geschrieben, dann normiert."""
    return name_von(name, snap) or name_von(normalisiere(name), snap)


def eintrag(name, snap=None):
    n = name_von(name, snap)
    return _ents(snap)[n] if n else None


def vererbung(name, snap=None) -> list:
    """Die Kette von der Wurzel bis zur Klasse: ['IfcRoot', …, 'IfcWall']. Unbekannt: []."""
    ents = _ents(snap)
    n = name_von(name, snap)
    kette = []
    while n and n not in kette:
        kette.append(n)
        n = ents[n].get("ober")
    return list(reversed(kette))


def ist_untertyp(name, wurzel, snap=None) -> bool:
    w = name_von(wurzel, snap)
    return bool(w) and w in vererbung(name, snap)


def untertypen(name, konkret: bool = False, snap=None) -> list:
    """Alle Nachfahren, die Klasse selbst eingeschlossen; `konkret` laesst abstrakte weg."""
    w = name_von(name, snap)
    if not w:
        return []
    ents = _ents(snap)
    return sorted(n for n in ents
                  if w in vererbung(n, snap) and not (konkret and ents[n]["abstrakt"]))


def attribute(name, snap=None) -> list:
    """Alle Attribute in EXPRESS-Reihenfolge (von der Wurzel abwaerts), je mit der Stufe, die es fuehrt."""
    ents = _ents(snap)
    return [{"name": a, "typ": t, "optional": o, "von": stufe}
            for stufe in vererbung(name, snap) for a, t, o in ents[stufe]["attribute"]]


def inverse(name, snap=None) -> list:
    ents = _ents(snap)
    return [{"name": i[0], "von_typ": i[1], "ueber": i[2], "aggregat": i[3], "min": i[4],
             "max": None if i[5] is None or i[5] < 0 else i[5], "von": stufe}
            for stufe in vererbung(name, snap) for i in ents[stufe]["inverse"]]


def predefined(name, snap=None) -> list:
    """Die erlaubten PredefinedType-Werte — von der naechsten Stufe, die das Attribut fuehrt."""
    ents = _ents(snap)
    for stufe in reversed(vererbung(name, snap)):
        if "predefined" in ents[stufe]:
            return list(ents[stufe]["predefined"])
    return []


def where_rules(name, geerbt: bool = True, snap=None) -> list:
    """Die Where-Rules einer Klasse — auf Wunsch samt denen der Obertypen (sie gelten mit)."""
    s = snap or snapshot()
    stufen = vererbung(name, s) if geerbt else [n for n in [name_von(name, s)] if n]
    return [{"regel": r, "bereich": s["regeln"][r]["bereich"], "quelle": s["regeln"][r]["quelle"]}
            for stufe in stufen for r in s["entitaeten"][stufe]["regeln"]]


def vorlage(name, snap=None):
    """Eine Pset-/Qto-Vorlage beim Namen (Gross-/Kleinschreibung egal), mit `name` — oder None."""
    s = snap or snapshot()
    ziel = str(name or "").strip().upper()
    for n, v in s["vorlagen"].items():
        if n.upper() == ziel:
            return {"name": n, **v}
    return None


def vorlagen_fuer(name, predefined_type=None, snap=None) -> list:
    """Die Vorlagen, die fuer eine Klasse gelten — ueber die Vererbung.

    `IfcActuator/ELECTRICACTUATOR` gilt nur mit diesem PredefinedType. Eine
    Vorlage fuer `IfcElement` gilt fuer jede Wand: ApplicableEntity schliesst
    Untertypen ein.
    """
    s = snap or snapshot()
    kette = {n.upper() for n in vererbung(name, s)}
    pt = str(predefined_type).upper() if predefined_type else None
    out = []
    for n, v in s["vorlagen"].items():
        for eintrag_ in v["gilt_fuer"]:
            klasse, _, typ = eintrag_.partition("/")
            if klasse.upper() in kette and (not typ or typ.upper() == pt):
                out.append(n)
                break
    return sorted(out)


def qto_vorlage(klasse, snap=None):
    """Die bSI-Mengenvorlage `Qto_<Klasse>BaseQuantities` — oder None."""
    n = name_von(klasse, snap)
    return vorlage(f"Qto_{n[3:]}BaseQuantities", snap) if n else None


def typklasse(name, snap=None):
    """Die TYPKLASSE einer Bauteilklasse (`IfcSign` -> `IfcSignType`) — oder None.

    Gelesen aus der Where-Rule `CorrectTypeAssigned`, nicht aus dem Namen
    geraten: die Regel sagt, welcher Typ an `IsTypedBy` haengen DARF, und genau
    das prueft das Tor. Die spezifischste Regel gewinnt (eine Klasse ohne eigene
    erbt die ihres Obertyps). Klassen ohne diese Regel — Aushub, Auftrag,
    Annotation — bekommen keinen Typ (Teil XXIII, A9b).
    """
    k = name_von(name, snap)
    if not k:
        return None
    gefunden = None
    for r in where_rules(k, snap=snap):
        if r["regel"].endswith(".CorrectTypeAssigned"):
            m = re.search(r"'[a-z0-9_]+\.(ifc\w+)' in typeof", r["quelle"])
            if m and name_von(m.group(1), snap):
                gefunden = name_von(m.group(1), snap)      # spaeter = spezifischer (Wurzel -> Blatt)
    return gefunden


def ist_schreibbar(name, snap=None):
    """Darf der Eigenbau diese Klasse schreiben? -> kanonischer Name oder None.

    Dieselbe Regel, die `eigenbau.py` bisher gegen ifcopenshell prueft: im
    Zielschema, nicht abstrakt, ein IfcProduct. Eine Waise aus IFC2X3 ist
    lesbar, aber nicht schreibbar — die Datei waere schemawidrig.
    """
    n = name_von(name, snap)
    if not n:
        return None
    e = _ents(snap)[n]
    if ZIELSCHEMA not in e["schemata"] or e["abstrakt"] or "IfcProduct" not in vererbung(n, snap):
        return None
    return n


def waisen(snap=None) -> list:
    """Klassen aelterer Schemata, die ADD2 nicht kennt (nur Produkte)."""
    return sorted(n for n, e in _ents(snap).items() if ZIELSCHEMA not in e["schemata"])


# ── Befehlszeile ────────────────────────────────────────────────────────────

def _main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Die Schema-Wahrheit der CDE")
    p.add_argument("--snapshot", action="store_true", help="aus ifcopenshell neu schreiben")
    p.add_argument("--pruefe", action="store_true", help="gespeicherten Schnappschuss gegen ifcopenshell halten")
    p.add_argument("--json", metavar="KLASSE", help="eine Klasse ausgeben (liest nur den Schnappschuss)")
    a = p.parse_args(argv)

    if a.snapshot:
        snap = baue_snapshot()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(als_text(snap), encoding="utf-8")
        print(f"{SNAPSHOT.name}: {len(snap['entitaeten'])} Klassen, {len(snap['regeln'])} Where-Rules, "
              f"{len(snap['vorlagen'])} Vorlagen, {SNAPSHOT.stat().st_size / 1e6:.2f} MB")
        return 0
    if a.pruefe:
        diff = unterschiede(json.loads(als_text(baue_snapshot())), snapshot())
        for zeile in diff:
            print(zeile)
        print("0 Abweichungen" if not diff else f"Schnappschuss veraltet — neu schreiben: python -m app.ifc.schema --snapshot")
        return 1 if diff else 0
    if a.json:
        n = klasse_zu(a.json)
        if not n:
            print(f"{a.json!r} steht in keinem der Schemata {ZIELSCHEMA}, {', '.join(ALTSCHEMATA)}")
            return 1
        e = eintrag(n)
        print(json.dumps({"klasse": n, "vererbung": vererbung(n), "abstrakt": e["abstrakt"],
                          "schemata": e["schemata"], "beschreibung": e["beschreibung"], "spec_url": e.get("spec_url"),
                          "predefined": predefined(n), "attribute": attribute(n), "inverse": inverse(n),
                          "where_rules": [r["regel"] for r in where_rules(n)], "vorlagen": vorlagen_fuer(n),
                          "schreibbar": ist_schreibbar(n) is not None, "nachfolger": e.get("nachfolger")},
                         ensure_ascii=False, indent=1))
        return 0
    p.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(_main())
