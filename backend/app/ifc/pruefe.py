"""Das Prueftor: ist diese Datei buildingSMART-konform — und was verlangt das Projekt?

STUFEN, in der Reihenfolge des offiziellen Validierungsdienstes von
buildingSMART, dazu die eigenen:

  schema   SPF-Syntax, EXPRESS-Schema, Where-Rules    -> ifcopenshell.validate (mit PFAD)
  verbund  was ein Verbund leisten muss (V00-V08)      -> hier
  ids      Projektanforderungen (IDS 1.0)              -> ifctester
  gherkin  normative Regeln (Implementer Agreements)   -> nicht eingerichtet (README)
  motor    der ZWEITE Motor (V09)                      -> probe.zweiter_motor

JEDER BEFUND hat dieselbe Form (`_befund`): id, titel, ok, sagt, zahl, stufe,
schwere, beispiele (dazu `teile` beim SPF- und beim IDS-Befund). `ok=None` heisst „nicht
pruefbar" — etwas anderes als „durchgefallen" und als „bestanden".

DIE SCHWERE entscheidet, was sperrt (`offen`), und nur „fehler" tut es. Eine
verfehlte IDS-Anforderung ist eine WARNUNG: die Datei bleibt konform, das
Projekt verlangt nur mehr. Ein nicht eingerichteter Pruefschritt ist ein
HINWEIS. Bis 2026-09-11 zaehlte jeder nicht bestandene Befund als Verstoss —
mit einer Stufe „keine IDS hinterlegt" haette das jeden Verbund abgelehnt.

WARUM DIE STUFE „verbund" UEBERHAUPT NOETIG IST: das Schema laesst vieles zu,
was einen Verbund praktisch unbrauchbar macht. Drei Geometriekontexte
nebeneinander sind schemakonform. Ein Modell in Millimetern neben einem in
Metern ist es auch — solange nur eine Einheitenzuweisung dasteht. Die Datei
oeffnet sich, und alles liegt falsch.

JEDE REGEL MISST DIE GROESSE, DIE SIE BEHAUPTET. Genau daran fehlte es der
Syntaxpruefung bis 2026-09-11: `schema_pruefen` bekam das GEOEFFNETE
Dateiobjekt, und `validate` sammelt Parserfehler der C++-Schicht nur mit dem
PFAD. Gemessen an zwei beschaedigten Kopien: halb abgeschnitten 1 statt 5.691
Befunde, zwei Unsinnszeilen 0 statt 2. Der Befund hiess „SPF-Syntax,
EXPRESS-Schema und Where-Rules" und sah die Syntax nie.

Aufruf:
    .venv-ifc/bin/python -m app.ifc.pruefe <datei.ifc> [--ids a.ids ...] [--ohne-regeln] [--json]
Exit 0 = nichts Sperrendes, 1 = Verstoesse.
"""
import argparse
import json
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.unit
import ifcopenshell.validate

from . import bezugssysteme
from .guids import ist_gueltig
from .schema import ZIELSCHEMA
from .verbund import anzahl, by_type_weich, huelle

SCHWEREN = ("fehler", "warnung", "hinweis")
# Was nur ein VERBUND leisten muss. Bei einer einzelnen Lieferung (`verbund=False`)
# melden diese Regeln, sperren aber nicht. Konformitaet (SPF), genau ein Projekt
# (V01) und gueltige GlobalIds (V04) bleiben auch dort Fehler.
NUR_IM_VERBUND = ("V00", "V02", "V03", "V05", "V06a", "V06b", "V07", "V08")
GHERKIN_GRUND = ("nicht eingerichtet — buildingSMART ifc-gherkin-rules verlangt eigene numpy- und "
                 "shapely-Fassungen und django (backend/app/ifc/README.md, Pruefaufwand und Werkzeuge)")


def _befund(kennung, titel, ok, sagt="", zahl=None, *, stufe="verbund", schwere="fehler",
            beispiele=(), teile=None):
    # `None` bleibt `None`: „nicht pruefbar" ist etwas anderes als „durchgefallen",
    # und beides etwas anderes als „bestanden". Mit Schwere „fehler" sperrt es wie
    # ein Verstoss (ein Tor, das Ungeprueftes durchwinkt, ist keines) — aber es
    # SAGT, was es ist.
    b = {"id": kennung, "titel": titel, "ok": None if ok is None else bool(ok), "sagt": sagt, "zahl": zahl,
         "stufe": stufe, "schwere": schwere, "beispiele": [str(x)[:200] for x in list(beispiele)[:5]]}
    if teile is not None:
        b["teile"] = teile
    return b


def offen(befund: dict) -> bool:
    """Sperrt dieser Befund? Nicht bestanden (False ODER ungeprueft) UND Schwere „fehler".

    EINE Stelle: der Unterprozess (`cli.py`), der Probelauf (`probe.py`) und
    `pruefe()` selbst zaehlen hierueber. Ein Befund ohne Schwere ist ein Fehler —
    so waren alle Befunde vor den Stufen gemeint.
    """
    return befund.get("ok") is not True and befund.get("schwere", "fehler") == "fehler"


# ── Stufe schema ────────────────────────────────────────────────────────────

class _Protokoll(ifcopenshell.validate.json_logger):
    """Der strukturierte Logger von `validate`, der zusaetzlich die QUELLE jeder Meldung festhaelt.

    `validate` setzt fuer die Parserfehler der C++-Schicht keinen eigenen
    Zustand — sie erben das zuletzt gesetzte Attribut und sehen aus wie
    Schemaverstoesse. Woher eine Meldung kommt, verraet nur ihr Aufrufer
    (`log_internal_cpp_errors`; der Vertragstest nagelt den Namen fest).
    """

    def log(self, level, message, *args):
        herkunft = sys._getframe(1).f_code.co_name
        super().log(level, message, *args)
        self.statements[-1]["herkunft"] = herkunft


def schema_pruefen(pfad, *, regeln: bool = True) -> dict:
    """Syntax, Schema und Where-Rules — der bSI-Massstab, als EIN Befund mit Teilzaehlung.

    Mit dem PFAD, nicht dem Dateiobjekt (siehe Kopf). Die Kennung bleibt „SPF":
    sie steht in Tests, im Register (`herkunft.pruefung.kriterien`) und im Client.
    `teile` sagt, woraus die Zahl besteht:
      syntax  Zeilen- und Verweisfehler (unbekannte Klasse, falsche Attributzahl,
              Verweis ins Leere) — was der Parser beim Lesen fand
      schema  Typen, Kardinalitaeten, inverse Attribute
      regeln  Where-Rules (`express_rules`)
    """
    titel = ("SPF-Syntax, EXPRESS-Schema und Where-Rules" if regeln
             else "SPF-Syntax und EXPRESS-Schema (ohne Where-Rules)")
    log = _Protokoll()
    try:
        ifcopenshell.validate.validate(str(pfad), log, express_rules=regeln)
    except Exception as e:                           # noqa: BLE001 — unlesbar ist ein Befund
        return _befund("SPF", titel, False, f"Datei nicht lesbar: {type(e).__name__}: {e}"[:800], 1,
                       stufe="schema", teile={"syntax": 1, "schema": 0, "regeln": 0})
    teile = {"syntax": 0, "schema": 0, "regeln": 0}
    texte, beispiele = [], []
    for s in log.statements:
        if s.get("herkunft") == "log_internal_cpp_errors":
            art = "syntax"
        elif s.get("type") != "schema":
            art = "regeln"
        else:
            art = "schema"
        teile[art] += 1
        # Das Feld `attribute` traegt bei Where-Rules den REGELNAMEN
        # (IfcFeatureElement.NotContained), bei Schemaverstoessen das Attribut.
        # Ohne es stuende nur der Regelrumpf da. Bei Parserfehlern ist es ein
        # Rest der letzten Meldung und bleibt weg.
        wo = s.get("attribute")
        meldung = str(s.get("message", "")).strip()
        texte.append(f"[{art}] {wo}: {meldung}" if wo and art != "syntax" else f"[{art}] {meldung}")
        ort = s.get("instance") or s.get("attribute")
        if ort and len(beispiele) < 5:
            beispiele.append(f"{art}: {str(ort)[:160]}")
    zahl = sum(teile.values())
    sagt = ("keine Beanstandung" if not zahl else
            f"{teile['syntax']} Zeilen-/Verweisfehler, {teile['schema']} Schemaverstoesse, "
            f"{teile['regeln']} Where-Rules\n" + "\n".join(texte))[:4000]
    return _befund("SPF", titel, zahl == 0, sagt, zahl, stufe="schema", beispiele=beispiele, teile=teile)


# ── Stufe verbund ───────────────────────────────────────────────────────────

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
    """Stufe verbund: was ein VERBUND leisten muss, ueber das Schema hinaus."""
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
                     len(doppelt) + len(ungueltig), beispiele=doppelt + ungueltig))

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
                     len(ohne_raum) + len(ohne_wirt), beispiele=ohne_wirt + ohne_raum))

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


# ── Stufe ids ───────────────────────────────────────────────────────────────

def ids_pruefen(datei, ids_dateien=()) -> list:
    """Projektanforderungen nach IDS 1.0, geprueft mit ifctester — je Spezifikation ein Befund.

    Keine IDS-Datei heisst NICHT „bestanden": ein Hinweis (ok=None), der nicht
    sperrt. Eine verfehlte Anforderung ist eine WARNUNG. Eine unlesbare IDS-Datei
    auch — die Lieferung ist dadurch nicht schlechter geworden.
    """
    pfade = [Path(p) for p in ids_dateien or ()]
    if not pfade:
        return [_befund("IDS", "Projektanforderungen (IDS 1.0)", None,
                        "keine IDS-Datei hinterlegt — nichts zu pruefen", stufe="ids", schwere="hinweis")]
    import ifctester.ids
    import ifctester.reporter

    out = []
    for pfad in pfade:
        try:
            spez = ifctester.ids.open(str(pfad))
            spez.validate(datei)
            bericht = ifctester.reporter.Json(spez).report()
        except Exception as e:                       # noqa: BLE001 — eine kaputte IDS ist ein Befund
            out.append(_befund(f"IDS:{pfad.stem}", f"IDS {pfad.name}", None,
                               f"nicht lesbar: {type(e).__name__}: {e}"[:600], stufe="ids", schwere="warnung"))
            continue
        for nr, s in enumerate(bericht["specifications"], 1):
            fehl = [f for r in s["requirements"] for f in r["failed_entities"]]
            kennungen = []
            for f in fehl:
                g = f.get("global_id") or f"#{f.get('id')}"
                if g not in kennungen:
                    kennungen.append(g)
            anwendbar = s["total_applicable"]
            if s.get("is_skipped"):
                sagt = "trifft auf kein Element zu (optional)"
            elif not s["status"] and anwendbar == 0:
                sagt = "verlangt, aber kein Element trifft zu"
            else:
                sagt = f"{s['total_applicable_pass']} von {anwendbar} Elementen erfuellen die Anforderung"
                gruende = sorted({str(f.get("reason")) for f in fehl if f.get("reason")})[:3]
                if gruende:
                    sagt += " — " + "; ".join(gruende)
            out.append(_befund(f"IDS:{pfad.stem}:{nr:02d}", f"{s['name']} ({pfad.name})", bool(s["status"]),
                               sagt[:1000], s["total_applicable_fail"], stufe="ids", schwere="warnung",
                               beispiele=kennungen,
                               teile={"anwendbar": anwendbar, "erfuellt": s["total_applicable_pass"]}))
    return out


def gherkin_hinweis() -> dict:
    """Stufe gherkin: ausdruecklich NICHT eingerichtet — und das steht im Bericht, nicht nur im README."""
    return _befund("GHERKIN", "Normative Regeln (buildingSMART Implementer Agreements)", None, GHERKIN_GRUND,
                   stufe="gherkin", schwere="hinweis")


def paketregeln(paket: dict) -> list:
    """Was der CDE-Eigenbau NICHT in die Datei brachte (Fahrplan Erdbau-Container, Stufe 1).

    V10 sperrt: ein Bauteil des Journals, das sich nicht ableiten liess
    (`misserfolge` des Pakets). Bis 2026-09-11 stand das nur im Bericht, und im
    Projekt 1337 kam ein Verbund, dem zwei Aushuebe fehlten, als „geprueft,
    0 Verstoesse" ins Register. V11 meldet nur: leere Gegenstuecke (ein Gerinne
    hat keinen Auftrag) und Ausgeblendetes gehoeren nicht in die Datei.

    WEGGELASSEN (Fahrplan Klare Ablaeufe, S4 neu): was im Auswahlbaum des
    Ausgebens abgewaehlt wurde, nennt das Paket unter `ausgelassen`
    ([{globalId, vorgang, grund}]). Ein bewusst weggelassener Misserfolg sperrt
    nicht mehr — gesagt wird er trotzdem (V10 zaehlt ihn, V11 nennt ihn, die
    Datei traegt ihn am Fachmodell). Eine weggelassene Kennung, die doch gebaut
    ist, gilt als gebaut und wird genannt.
    """
    gebaut_ids = {str(b.get("cdeId")) for b in paket.get("bauteile") or []
                  if isinstance(b, dict) and b.get("cdeId")}
    aus = [a for a in paket.get("ausgelassen") or [] if isinstance(a, dict) and a.get("globalId")]
    doch_gebaut = sorted({str(a["globalId"]) for a in aus} & gebaut_ids)
    weg = {str(a["globalId"]) for a in aus} - gebaut_ids
    fehl = [m for m in paket.get("misserfolge") or []
            if isinstance(m, dict) and str(m.get("globalId")) not in weg]
    leer = [str(x) for x in paket.get("leer") or []]
    verborgen = [str(x) for x in paket.get("verborgen") or []]
    gebaut = len(paket.get("bauteile") or [])
    gruende = sorted({str(m.get("grund") or "ohne Grund")[:160] for m in fehl})
    dazu = f" · {len(weg)} bewusst weggelassen" if weg else ""
    v10 = _befund("V10", "Eigenbau vollstaendig — jedes Bauteil des Journals ist gebaut", not fehl,
                  (f"{len(fehl)} von {len(fehl) + gebaut} Bauteilen nicht ableitbar: " + "; ".join(gruende[:3]) + dazu)
                  if fehl else f"{gebaut} Bauteile gebaut{dazu}", len(fehl),
                  beispiele=[f"{m.get('globalId')} · {m.get('grund') or 'ohne Grund'}" for m in fehl])
    vorgaenge = sorted({str(a["vorgang"]) for a in aus if str(a["globalId"]) in weg and a.get("vorgang")})
    nicht_drin = [f"{len(leer)} leer (ohne Gegenstueck)", f"{len(verborgen)} ausgeblendet"]
    if weg:
        nicht_drin.append(f"{len(weg)} weggelassen" + (f" ({', '.join(vorgaenge[:5])})" if vorgaenge else ""))
    sagt = ", ".join(nicht_drin) + " — nicht in der Datei"
    if doch_gebaut:
        sagt += f"; {len(doch_gebaut)} als weggelassen genannt, steht aber in der Datei"
    v11 = _befund("V11", "Eigenbau: Leeres und Ausgeblendetes",
                  True if not (leer or verborgen or weg or doch_gebaut) else None,
                  sagt, len(leer) + len(verborgen) + len(weg), schwere="hinweis",
                  beispiele=leer + verborgen + [f"{g} · weggelassen" for g in sorted(weg)]
                  + [f"{g} · weggelassen, aber gebaut" for g in doch_gebaut])
    return [v10, v11]


# ── Alles zusammen ──────────────────────────────────────────────────────────

def pruefe(pfad, *, ids=(), regeln: bool = True, verbund: bool = True, paket: dict | None = None) -> dict:
    """Alle Stufen ausser dem zweiten Motor (den faehrt `cli.py` bzw. `probe.py` dazu).

    `verbund=False` prueft eine LIEFERUNG (Registerdokument, Stufe 4b): die
    Verbundregeln melden als Warnung (`NUR_IM_VERBUND`), und `zaehlung` traegt
    dieselben Groessen wie der Verbundbericht — fuer den zweiten Motor.
    `paket` ist das Eigenbau-Paket eines Verbund- oder Erdbau-Laufs — dann
    kommen V10/V11 dazu (`paketregeln`).

    Reihenfolge fuer den SPEICHER: erst `validate` mit dem Pfad (oeffnet selbst
    und gibt wieder frei), danach `ifcopenshell.open` fuer die Verbundregeln —
    nacheinander, nicht nebeneinander (RLIMIT_AS im Unterprozess).
    """
    pfad = Path(pfad)
    spf = schema_pruefen(pfad, regeln=regeln)
    try:
        datei = ifcopenshell.open(pfad)
    except Exception as e:                           # noqa: BLE001 — unlesbar ist ein Befund, kein Absturz
        befunde = [_befund("OPEN", "Datei laesst sich oeffnen", False, f"{type(e).__name__}: {e}"[:800],
                           stufe="schema"), spf]
        return {"datei": str(pfad), "schema": None, "befunde": befunde,
                "verstoesse": sum(1 for x in befunde if offen(x))}
    befunde = [_befund("V00", f"Schema ist {ZIELSCHEMA}", datei.schema_identifier == ZIELSCHEMA,
                       datei.schema_identifier)]
    befunde += verbundregeln(datei)
    if paket is not None:
        befunde += paketregeln(paket)
    if not verbund:
        # Eine Lieferung ist kein Verbund: ihr fehlen Fachmodell-Gruppe und oft
        # die Georeferenz, sie darf IFC2X3 und Millimeter sein. Das gehoert
        # gesagt, sperrt aber nicht — die Lieferung gehoert dem Planer.
        for b in befunde:
            if b["id"] in NUR_IM_VERBUND:
                b["schwere"] = "warnung"
    befunde.append(spf)
    befunde += ids_pruefen(datei, ids)
    befunde.append(gherkin_hinweis())
    return {
        "datei": str(pfad),
        "schema": datei.schema_identifier,
        "befunde": befunde,
        "verstoesse": sum(1 for x in befunde if offen(x)),
        # Was der zweite Motor nachzaehlt — dieselben Groessen wie der Verbundbericht.
        "zaehlung": {"schema": datei.schema_identifier, "entitaeten": anzahl(datei),
                     "produkte": len(datei.by_type("IfcProduct")),
                     "raumwurzeln": len(datei.by_type("IfcSite")),
                     "kontexte": len(datei.by_type("IfcGeometricRepresentationContext"))},
    }


def zeichen(befund: dict) -> str:
    """Die Spalte der Tabelle: ok, FEHL, ? (ungeprueft, sperrt), warn, info."""
    if befund.get("ok") is True:
        return "ok  "
    if befund.get("schwere", "fehler") != "fehler":
        return "info" if befund.get("ok") is None else "warn"
    return "?   " if befund.get("ok") is None else "FEHL"


def _main(argv=None):
    p = argparse.ArgumentParser(description="Konformitaetspruefung einer IFC-Datei")
    p.add_argument("datei")
    p.add_argument("--ids", nargs="*", default=[], help="IDS-Dateien mit Projektanforderungen")
    p.add_argument("--ohne-regeln", action="store_true", help="Where-Rules auslassen (schneller)")
    p.add_argument("--lieferung", action="store_true", help="einzelne Lieferung: Verbundregeln nur melden")
    p.add_argument("--json", action="store_true", help="Bericht als JSON statt als Tabelle")
    a = p.parse_args(argv)

    ergebnis = pruefe(a.datei, ids=a.ids, regeln=not a.ohne_regeln, verbund=not a.lieferung)
    if a.json:
        print(json.dumps(ergebnis, indent=1, ensure_ascii=False))
    else:
        print(f"Pruefung {Path(a.datei).name}  (Schema {ergebnis['schema']})")
        for x in ergebnis["befunde"]:
            print(f"  [{zeichen(x)}] {x['id']:5} {x['titel']}")
            if x["ok"] is not True or x["sagt"]:
                for zeile in str(x["sagt"]).splitlines()[:8]:
                    print(f"           {zeile}")
        print(f"\n{ergebnis['verstoesse']} sperrende(r) Verstoss(e)")
    return 1 if ergebnis["verstoesse"] else 0


if __name__ == "__main__":
    sys.exit(_main())
