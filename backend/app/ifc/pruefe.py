"""Das Prueftor: ist diese Datei buildingSMART-konform?

DREI EBENEN, in der Reihenfolge, in der der offizielle Validierungsdienst von
buildingSMART prueft:

  1. SPF-Syntax und EXPRESS-Schema samt Where-Rules  -> `ifcopenshell.validate`
  2. Eigene Regeln zum Verbund (V01-V08)             -> hier
  3. Der ZWEITE Motor (V09)                          -> scripts/verbund_webifc.mjs

Ebene 1 ist genau das, was der bSI-Dienst als „Schema Compliance" fuehrt; die
normativen Gherkin-Regeln (Implementer Agreements) kommen spaeter dazu.

WARUM EBENE 2 UEBERHAUPT NOETIG IST: das Schema laesst vieles zu, was einen
Verbund praktisch unbrauchbar macht. Drei Geometriekontexte nebeneinander sind
schemakonform. Ein Modell in Millimetern neben einem in Metern ist es auch —
solange nur eine Einheitenzuweisung dasteht. Die Datei oeffnet sich, und alles
liegt falsch. Ebene 2 prueft, was ein VERBUND leisten muss, nicht nur, was IFC
erlaubt.

JEDE REGEL MISST DIE GROESSE, DIE SIE BEHAUPTET. Ein Befund „nicht konform"
heisst hier: „N benannte Verstoesse". Geheilt ist er, wenn dieselbe Zahl 0 ist —
nicht, wenn sich die Datei oeffnen laesst.

Aufruf:
    .venv-ifc/bin/python -m app.ifc.pruefe <datei.ifc> [--json]
Exit 0 = sauber, 1 = Verstoesse.
"""
import argparse
import io
import json
import logging
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.unit
import ifcopenshell.validate

from . import bezugssysteme
from .guids import ist_gueltig
from .verbund import ZIELSCHEMA, by_type_weich, huelle


def _befund(kennung, titel, ok, sagt="", zahl=None):
    # `None` bleibt `None`: „nicht pruefbar" ist etwas anderes als „durchgefallen",
    # und beides etwas anderes als „bestanden". Gezaehlt wird es wie ein Verstoss
    # (ein Tor, das Ungeprueftes durchwinkt, ist keines) — aber es SAGT, was es ist.
    return {"id": kennung, "titel": titel, "ok": None if ok is None else bool(ok),
            "sagt": sagt, "zahl": zahl}


def schema_pruefen(datei) -> dict:
    """Ebene 1: Syntax, Schema und Where-Rules — der bSI-Massstab.

    `validate` schreibt in einen Logger statt zurueckzugeben; wir fangen den ab.
    `express_rules=True` schaltet die Where-Rules zu — ohne sie faende die
    Pruefung z. B. `IfcOwnerHistory.CorrectChangeAction` nicht, und genau die
    war der erste echte Befund an unserem eigenen Geruest.
    """
    puffer = io.StringIO()
    log = logging.getLogger("quagg.ifc.validate")
    log.handlers = [logging.StreamHandler(puffer)]
    log.setLevel(logging.DEBUG)
    log.propagate = False
    ifcopenshell.validate.validate(datei, log, express_rules=True)
    text = puffer.getvalue().strip()
    # Der Logger schreibt je Verstoss einen Block, eingeleitet mit
    # "On instance:" oder "For instance:".
    verstoesse = text.count("On instance:") + text.count("For instance:")
    return _befund("SPF", "SPF-Syntax, EXPRESS-Schema und Where-Rules",
                   verstoesse == 0,
                   "keine Beanstandung" if verstoesse == 0 else text[:4000],
                   verstoesse)


def _wirt_von(merkmal):
    """Der Wirt eines IfcFeatureElement — ueber die Beziehung, die seine Art verlangt.

    Subtraktion (Aushub, Oeffnung): IfcRelVoidsElement. Addition:
    IfcRelProjectsElement. Oberflaechenmerkmal (IFC4X3): IfcRelAdheresToElement.
    Ein Attribut, das das Schema nicht kennt, zaehlt als „keine Beziehung".
    """
    for inverses, feld in (("VoidsElements", "RelatingBuildingElement"),
                           ("ProjectsElements", "RelatingElement"),
                           ("AdheresToElement", "RelatingElement")):
        for rel in getattr(merkmal, inverses, None) or ():
            wirt = getattr(rel, feld, None)
            if wirt is not None:
                return wirt
    return None


def verbundregeln(datei) -> list:
    """Ebene 2: was ein VERBUND leisten muss, ueber das Schema hinaus."""
    b = []

    projekte = datei.by_type("IfcProject")
    b.append(_befund("V01", "genau ein IfcProject", len(projekte) == 1,
                     f"{len(projekte)} gefunden", len(projekte)))

    zuweisungen = datei.by_type("IfcUnitAssignment")
    faktor = ifcopenshell.util.unit.calculate_unit_scale(datei)
    meter = abs(faktor - 1.0) < 1e-12
    b.append(_befund("V02", "eine Einheitenzuweisung, Laenge in Metern",
                     len(zuweisungen) == 1 and meter,
                     f"{len(zuweisungen)} Zuweisung(en), Faktor {faktor}", len(zuweisungen)))

    # Wurzelkontexte: Unterkontexte zaehlen nicht mit, die gehoeren dazu.
    alle = datei.by_type("IfcGeometricRepresentationContext")
    wurzeln = [k for k in alle if not k.is_a("IfcGeometricRepresentationSubContext")]
    fremd = [d for d in datei.by_type("IfcRepresentation")
             if d.ContextOfItems is None or d.ContextOfItems.id() not in {k.id() for k in alle}]
    b.append(_befund("V03", "ein Wurzelkontext, jede Darstellung zeigt hinein",
                     len(wurzeln) == 1 and not fremd,
                     f"{len(wurzeln)} Wurzelkontext(e), {len(fremd)} Darstellung(en) ohne Kontext",
                     len(wurzeln)))

    gesehen, doppelt, ungueltig = set(), [], []
    for inst in datei.by_type("IfcRoot"):
        g = inst.GlobalId
        if g in gesehen:
            doppelt.append(g)
        gesehen.add(g)
        if not ist_gueltig(g):
            ungueltig.append(f"{inst.is_a()} {g!r}")
    b.append(_befund("V04", "GlobalIds eindeutig und formgerecht (22 Zeichen, erstes 0-3)",
                     not doppelt and not ungueltig,
                     f"{len(doppelt)} doppelt, {len(ungueltig)} ungueltig"
                     + (f" — z. B. {ungueltig[:3]}" if ungueltig else ""),
                     len(doppelt) + len(ungueltig)))

    sites = [s for s in datei.by_type("IfcSite")]
    unter_projekt = []
    for rel in datei.by_type("IfcRelAggregates"):
        if rel.RelatingObject and rel.RelatingObject.is_a("IfcProject"):
            unter_projekt.extend(rel.RelatedObjects or [])
    b.append(_befund("V05", "genau eine Raumwurzel unter dem Projekt",
                     len(unter_projekt) == 1,
                     f"{len(unter_projekt)} direkt unter dem Projekt, {len(sites)} IfcSite gesamt",
                     len(unter_projekt)))

    crs = by_type_weich(datei, "IfcProjectedCRS")
    mc = by_type_weich(datei, "IfcMapConversion")
    b.append(_befund("V06a", "Georeferenzierung vorhanden (CRS + MapConversion)",
                     len(crs) >= 1 and len(mc) >= 1,
                     f"{len(crs)} IfcProjectedCRS, {len(mc)} IfcMapConversion"))

    # V06b: stimmt das Etikett mit dem Inhalt? Der erste Entwurf pruefte fest das
    # UTM32-Fenster — ein Verbund in Gauss-Krueger Zone 2 (ENQUIER) waere
    # durchgefallen, obwohl er richtig war. Jetzt gilt das DEKLARIERTE System,
    # und ein System, das die Tabelle nicht kennt, wird nicht geraten.
    h = huelle(datei)
    groesste = h["max"] if h else "keine Koordinaten"
    deklariert = crs[0].Name if crs else None
    if deklariert:
        passt = bezugssysteme.fenster_passt(h, deklariert)
        if passt is None:
            sagt = f"{deklariert} steht nicht in der Tabelle (bezugssysteme.py) — nicht pruefbar"
        else:
            erkannt = bezugssysteme.erkenne_huelle(h)
            sagt = f"{deklariert}: groesste Koordinate {groesste}" + (
                "" if passt else f" — passt zu {erkannt or 'keinem bekannten System'}")
    else:
        # Nichts deklariert: dann wenigstens pruefen, OB es Landeskoordinaten
        # sind. Genau hier faellt die unveraenderte Millimeter-Lieferung durch.
        erkannt = bezugssysteme.erkenne_huelle(h)
        passt = bool(erkannt)
        sagt = (f"kein Bezugssystem deklariert; groesste Koordinate {groesste} passt zu "
                f"{erkannt or 'keinem bekannten System'}")
    b.append(_befund("V06b", "groesste Koordinate liegt im Fenster des Bezugssystems", passt, sagt))

    # V07: jedes Bauteil haengt in der Raumgliederung — AUSSPARUNGEN UEBER IHREN
    # WIRT. Ein IfcFeatureElement (IfcEarthworksCut, IfcOpeningElement, ...) darf
    # laut Schema gar nicht in IfcRelContainedInSpatialStructure stehen (Where-Rule
    # `IfcFeatureElement.NotContained`); es haengt ueber seinen Wirt in der
    # Gliederung. Die erste Fassung dieser Regel zaehlte nur Contained/Aggregates
    # und widersprach damit dem Schema: ein konformer Verbund mit Aushub konnte
    # V07 nicht bestehen, und einer, der V07 bestand, verletzte NotContained.
    # Gefunden von der Nachbarsitzung am CDE-Eigenbau.
    zugeordnet = set()
    for rel in datei.by_type("IfcRelContainedInSpatialStructure"):
        zugeordnet.update(e.id() for e in (rel.RelatedElements or []))
    for rel in datei.by_type("IfcRelAggregates"):
        zugeordnet.update(e.id() for e in (rel.RelatedObjects or []))
    ohne_raum, ohne_wirt = [], []
    for p in datei.by_type("IfcProduct"):
        if p.is_a("IfcSpatialElement") or p.is_a("IfcSpatialStructureElement"):
            continue
        if p.is_a("IfcFeatureElement"):
            wirt = _wirt_von(p)
            if wirt is None:
                ohne_wirt.append(f"{p.is_a()} {p.GlobalId}")
            elif wirt.id() not in zugeordnet:
                ohne_raum.append(f"{p.is_a()} {p.GlobalId} (Wirt {wirt.GlobalId} nicht eingeordnet)")
            continue
        if p.id() not in zugeordnet:
            ohne_raum.append(f"{p.is_a()} {p.GlobalId}")
    beispiele = (ohne_wirt + ohne_raum)[:3]
    b.append(_befund("V07", "jedes Bauteil haengt in der Raumgliederung (Aussparungen ueber ihren Wirt)",
                     not ohne_raum and not ohne_wirt,
                     f"{len(ohne_raum)} ohne Zuordnung, {len(ohne_wirt)} Aussparung(en) ohne Wirt"
                     + (f" — z. B. {beispiele}" if beispiele else ""),
                     len(ohne_raum) + len(ohne_wirt)))

    gruppen = [g for g in datei.by_type("IfcGroup") if g.ObjectType == "Fachmodell"]
    in_gruppen = set()
    for rel in datei.by_type("IfcRelAssignsToGroup"):
        if rel.RelatingGroup in gruppen:
            in_gruppen.update(e.id() for e in (rel.RelatedObjects or []))
    bauteile = [p for p in datei.by_type("IfcProduct")
                if not (p.is_a("IfcSpatialElement") or p.is_a("IfcSpatialStructureElement"))]
    b.append(_befund("V08", "jedes Bauteil traegt seine Herkunft (Fachmodell-Gruppe)",
                     len(in_gruppen) == len(bauteile),
                     f"{len(in_gruppen)} von {len(bauteile)} Bauteilen in {len(gruppen)} Gruppe(n)",
                     len(bauteile) - len(in_gruppen)))

    return b


def pruefe(pfad) -> dict:
    """Alles, was ohne den zweiten Motor geht. V09 faehrt `probe.py` dazu."""
    pfad = Path(pfad)
    datei = ifcopenshell.open(pfad)
    befunde = [_befund("V00", f"Schema ist {ZIELSCHEMA}",
                       datei.schema_identifier == ZIELSCHEMA,
                       datei.schema_identifier)]
    befunde += verbundregeln(datei)
    befunde.append(schema_pruefen(datei))
    return {
        "datei": str(pfad),
        "schema": datei.schema_identifier,
        "befunde": befunde,
        "verstoesse": sum(1 for x in befunde if not x["ok"]),
    }


def _main(argv=None):
    p = argparse.ArgumentParser(description="Konformitaetspruefung einer IFC-Datei")
    p.add_argument("datei")
    p.add_argument("--json", action="store_true", help="Bericht als JSON statt als Tabelle")
    a = p.parse_args(argv)

    ergebnis = pruefe(a.datei)
    if a.json:
        print(json.dumps(ergebnis, indent=1, ensure_ascii=False))
    else:
        print(f"Pruefung {Path(a.datei).name}  (Schema {ergebnis['schema']})")
        for x in ergebnis["befunde"]:
            zeichen = "ok  " if x["ok"] else "FEHL"
            print(f"  [{zeichen}] {x['id']:5} {x['titel']}")
            if not x["ok"] or x["sagt"]:
                for zeile in str(x["sagt"]).splitlines()[:8]:
                    print(f"           {zeile}")
        print(f"\n{ergebnis['verstoesse']} Verstoss(e)")
    return 1 if ergebnis["verstoesse"] else 0


if __name__ == "__main__":
    sys.exit(_main())
