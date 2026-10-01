"""Was die CDE SELBST erzeugt hat — als konforme IFC4X3_ADD2-Quelle.

DIE LUECKE, DIE DIESE DATEI SCHLIESST (2026-09-10). Der Verbund
(`verbund.py`) fuehrt gelieferte IFC-Dateien zusammen. Die Bauteile, die die
CDE selbst erzeugt — Aushub- und Auftragskoerper, Kanalgraben, Baugrube,
Rohre und Schaechte —, hatten bis hierher KEINEN IFC-Weg:
`guids.guid_aus_cde_id()` war vorbereitet und wurde nirgends aufgerufen. Sie
lebten nur im Journal und im fragments-Modell des Browsers.

WAS HIER ENTSTEHT, ist eine gewoehnliche Quelle. Sie laeuft durch
`fuehre_zusammen()` wie jede Lieferung eines Beteiligten und durch dasselbe
Prueftor (`pruefe.py`). Deshalb baut sie auf DEMSELBEN Geruest auf
(`verbund.zielgeruest`) und leitet ihre GlobalIds mit DERSELBEN Funktion ab
(`guids.guid_aus_cde_id`) — zwei Schreiber mit zwei Vorstellungen davon, was
konform ist, waeren genau die Sorte Unterschied, die erst beim Partner
auffaellt.

DIE EINGABE ist ein JSON-Paket aus dem Browser (`EigenbauPaket.js`). Es traegt
LANDESKOORDINATEN mit Z nach oben — die Umrechnung aus der three-Welt der CDE
(Y oben, Nord auf -Z, Ladeversatz) passiert dort, an derselben Stelle, an der
die CDE alle Projektkoordinaten rechnet (`Projektkoordinaten.nachProjekt`).
Hier wird nichts mehr umgerechnet, nur geschrieben.

JE BAUTEIL:
  * Klasse und PredefinedType aus dem Journal, gegen das Schema geprueft —
    ein unbekannter Aufzaehlungswert wird NOTDEFINED und gemeldet, nicht
    erfunden.
  * die Geometrie als `IfcTriangulatedFaceSet` (Tessellation) unter einer
    eigenen Platzierung im Bauteilursprung: 2,5 Millionen Meter in jedem
    einzelnen Punkt kosten Stellen, die ein Empfaenger im Float verliert.
  * die Farbe als `IfcSurfaceStyle` — ein Aushub bleibt durchscheinend auch
    beim Empfaenger, nicht nur in der CDE.
  * die Spur zurueck: Merkmalssatz `Quagg_CDE` mit der Journal-Kennung, dem
    Rezept, dem Vorgang, dem WIRT (siehe unten) und den Fuellungen frueherer
    Vorgaenge, durch die ein Aushub schneidet.
  * die MENGEN als `IfcElementQuantity` nach der bSI-Vorlage der Klasse
    (`Qto_EarthworksCutBaseQuantities.UndisturbedVolume`, ...). Welche Kennzahl
    welche Menge ist, sagt das Rezept in der CDE — hier wird nur geschrieben.

PAKET v2 (Stufe 2 des Aushub-Fachmodells, 2026-09-10). Die geformte Flaeche,
die der Raum der CDE zeigt, ist KEIN Bauteil und kommt nicht mehr: sie stand
als zweites TERRAIN am Ort des Ur-Gelaendes, und der Aushub war damit dreimal
in der Datei (Void im Ur, Koerper des Cut, abgesenkte Kopie). bSI: „no CSG
operation is expected to be performed on import". Dafuer gruppiert die Datei:
ein Fachmodell „Erdbau" (Aushub und Auftrag), ein Fachmodell „CDE-Eigenbau"
(der Rest), und je Erdbau-Vorgang eine Gruppe `ObjectType='Vorgang'` mit Cut
und Fill — `IfcRelFillsElement` kann einen Cut nicht fuellen (es verlangt eine
IfcOpeningElement), die Gruppe ist die richtige Beziehung.

DER WIRT JEDES AUSHUBS (erster Lauf gegen das Prueftor, 2026-09-10). V00 bis
V08 waren gruen, die Schema-Pruefung nicht: `IfcEarthworksCut` ist eine
`IfcFeatureElementSubtraction`, und deren inverses Attribut `VoidsElements`
ist PFLICHT. Ein Aushub ohne das Bauteil, das er aushoehlt, ist schemawidrig.
Fachlich ist der Wirt das UR-GELAENDE, auf dem geformt wurde — in IFC 4.3
bleibt es als TERRAIN stehen, der Aushub hoehlt es aus. Liegt der Wirt im
selben Paket (Folgeformung auf einem CDE-DGM), schliesst `baue_datei` die
Beziehung selbst. Liegt er in einer GELIEFERTEN Datei, kann sie hier nicht
entstehen; dann schliesst sie `wirte_herstellen()` im Verbund, wo beide
nebeneinander liegen.

Rein: kein HTTP, kein Dateisystem ausser den uebergebenen Pfaden.

Aufruf:
    .venv-ifc/bin/python -m app.ifc.eigenbau <paket.json> <ziel.ifc>
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import ifcopenshell

from . import guids
from . import herkunft as H
from . import schema as S
from .schema import ZIELSCHEMA
from .verbund import VerbundUnmoeglich, zielgeruest

PSET_CDE = "Quagg_CDE"
PSET_VORGANG = "Quagg_Vorgang"
PAKET_VERSION = 2

# Die Fachmodelle einer Eigenbau-Datei. Schluessel = `fachmodell` im Paket;
# Wert = (Name, Beschreibung, GlobalId-Anhang). Der Eigenbau behaelt die
# GlobalId seiner Gruppe aus Paket v1 — eine Revision, kein Fremdling.
FACHMODELLE = {
    "erdbau": ("Erdbau", "In der CDE geplanter Erdbau: Aushub und Auftrag je Vorgang, am Ur-Gelaende",
               "gruppe|erdbau"),
    "cde": ("CDE-Eigenbau", "In der CDE erzeugte Bauteile", "gruppe"),
}
ART_TITEL = {"erdbau": "Gelaende formen", "kanalgraben": "Kanalgraben", "bauwerksgrube": "Bauwerksgrube"}

# BOESCHUNGSKANTEN (Teil XX Stufe B) — WIE SIE IM SCHEMA HEISSEN.
#
# Fabios Frage (2026-09-17): „ist IfcAnnotation wirklich richtig, oder eher
# ein Survey-Point, also die Punkte einer Bruchkante als IFC-Element?"
# Am gepinnten Schema IFC4X3_ADD2 nachgeschlagen, nicht geraten:
#
#  1. Ein `IfcSurveyPoint` GIBT ES NICHT. In der ganzen Deklarationsliste des
#     Schemas kommt „Survey" nur als Aufzaehlungswert und in einem Pset vor —
#     keine Entitaet.
#  2. Vermessungsdaten SIND `IfcAnnotation`. Beleg: `Pset_AnnotationSurveyArea`
#     gilt fuer `IfcAnnotation/SURVEY` und sagt woertlich „...to be assigned to
#     survey point set or resulting surface patches". Die Entitaet ist also
#     richtig; offen war nur der PredefinedType.
#  3. `IfcAnnotation` selbst: „an information element within the geometric
#     (and spatial) context ... Annotations include additional POINTS, curves,
#     text, dimensioning" — Punkte und Kurven ausdruecklich eingeschlossen.
#  4. BREAKLINE gibt es nirgends. Der einzige eigene Bruchkanten-Begriff des
#     Schemas ist `IfcTriangulatedIrregularNetwork.Flags` („flags for each face
#     indicating breaklines between faces"). Der braucht die geformte
#     Gelaendeflaeche IN der Datei — die schreibt die CDE seit Paket v2 bewusst
#     nicht (sie waere ein zweites TERRAIN am selben Ort).
#
# DESHALB: `IfcAnnotation` mit PredefinedType SURVEY — der Wert, unter dem ein
# Empfaenger Vermessungs- und Gelaendeannotationen mit einem Standardfilter
# findet —, verfeinert durch `ObjectType` mit dem deutschen Fachbegriff.
#
# UND KEINE FALSCHE AUSSAGE: `Pset_AnnotationSurveyArea` (AcquisitionMethod
# GPS, LASERSCAN, THEODOLITE ...) wird NICHT geschrieben — diese Kanten sind
# gerechnet, nicht gemessen. Woher sie kommen, steht in `Quagg_CDE`
# (Ableitung, Rolle, Vorgang) und in der Vorgangsgruppe.
KANTEN_PREDEFINED = "SURVEY"
KANTEN_ARTEN = {
    "oberkante":   ("Boeschungsoberkante", "Boeschungsoberkante"),
    "fuss":        ("Boeschungsfuss", "Boeschungsfuss"),
    "sohlkante":   ("Sohlkante", "Sohlkante"),
    "kronenkante": ("Kronenkante", "Kronenkante"),
}
MENGEN_METHODE = ("Quagg CDE: Differenz der Gelaenderaster vor und nach dem Vorgang "
                  "(Mittel der vier Knoten je Zelle); der Koerper ist die Gegenprobe")
# WIE gemessen wurde (Teil XXVI, Z4). Bis Z4 trugen nur Erdbauteile Mengen, und
# der Text oben war fuer jede Menge wahr. Eine Wand misst man nicht am Raster:
# ihr Text stuende sonst falsch in der Datei. Der Client nennt den SCHLUESSEL
# (`mengenMethode`), die Texte stehen hier — ohne Schluessel gilt der alte.
MENGEN_METHODEN = {
    "raster": MENGEN_METHODE,
    "koerper": ("Quagg CDE: aus dem Bauplan — Laengen und Flaechen aus Achse und Umriss "
                "(waagerecht), Masse aus dem Rezept, Volumen aus dem geschlossenen Koerper"),
}
# Vorlagentyp -> (Mengenklasse, Wertattribut)
_MENGENTYP = {"Q_VOLUME": ("IfcQuantityVolume", "VolumeValue"), "Q_LENGTH": ("IfcQuantityLength", "LengthValue"),
              "Q_AREA": ("IfcQuantityArea", "AreaValue"), "Q_WEIGHT": ("IfcQuantityWeight", "WeightValue"),
              "Q_COUNT": ("IfcQuantityCount", "CountValue")}

# Das Bezugssystem schreibt das Geruest der Verbund-Sitzung
# (`verbund.georeferenz_setzen`, Systeme aus `bezugssysteme.py`) — EIN Weg fuer
# gelieferte und eigene Dateien. Bis 2026-09-10 stand hier eine eigene
# Gauss-Krueger-Tabelle, weil das Geruest fest UTM schrieb; zwei Tabellen
# fuer dieselbe Frage waeren irgendwann auseinandergelaufen.


class PaketFehler(ValueError):
    """Das Paket taugt nicht — mit Grund, nicht mit einem Stapel."""


def _pruefe_paket(paket: dict) -> None:
    if not isinstance(paket, dict):
        raise PaketFehler("Paket ist kein Objekt")
    if paket.get("version") != PAKET_VERSION:
        # LAUT: ein v1-Paket traegt die geformte Kopie des Gelaendes als Bauteil.
        # Still angenommen, stuende wieder ein zweites TERRAIN in der Datei.
        raise PaketFehler(f"Paketversion {paket.get('version')!r}, erwartet {PAKET_VERSION} — "
                          "die CDE im Browser und der Schreiber sprechen verschiedene Fassungen "
                          "(Seite neu laden)")
    if not isinstance(paket.get("bauteile"), list):
        raise PaketFehler("Paket ohne Bauteilliste")


def _klasse(name):
    """Kategorie aus dem Journal ('IFCEARTHWORKSCUT') -> kanonischer Klassenname, oder None.

    Gross-/Kleinschreibung egal. Eine Klasse, die das Schema nicht kennt, die
    abstrakt ist, die kein Bauteil ist oder ein Raumelement (Teil XXVI, Z1), wird
    nicht geschrieben — der
    Aufrufer meldet sie. Die Regel steht EINMAL (`schema.ist_schreibbar`); der
    Client prueft dieselbe vorab (`Bauteilrezepte.istSchreibbar`).
    """
    return S.ist_schreibbar(name)


def _predefined(klasse, wert):
    """PredefinedType gegen die Aufzaehlung der Klasse pruefen.

    Rueckgabe (wert, warnung). Ein Wert, den das Schema nicht kennt, wird
    NOTDEFINED — nie USERDEFINED: das verlangte ObjectType, und das haetten wir
    erfinden muessen. Eine Klasse ohne PredefinedType bekommt keinen.
    """
    erlaubt = S.predefined(klasse)
    if not erlaubt:
        return None, None
    if wert is None or wert == "":
        return "NOTDEFINED", None
    w = str(wert).upper()
    if w in erlaubt and w != "USERDEFINED":
        return w, None
    return "NOTDEFINED", f"PredefinedType {wert!r} ist fuer {klasse} nicht erlaubt — NOTDEFINED geschrieben"


def _stil(f, farbe: int, deckkraft: float, cache: dict):
    """Ein Oberflaechenstil je (Farbe, Deckkraft) — geteilt, nicht je Bauteil."""
    schluessel = (int(farbe), round(float(deckkraft), 3))
    if schluessel in cache:
        return cache[schluessel]
    r = ((int(farbe) >> 16) & 255) / 255.0
    g = ((int(farbe) >> 8) & 255) / 255.0
    b = (int(farbe) & 255) / 255.0
    rgb = f.create_entity("IfcColourRgb", Red=r, Green=g, Blue=b)
    # IFC zaehlt DURCHSICHTIGKEIT, die CDE Deckkraft: 0,55 deckend = 0,45 durchsichtig.
    schattierung = f.create_entity("IfcSurfaceStyleShading", SurfaceColour=rgb,
                                   Transparency=max(0.0, min(1.0, 1.0 - float(deckkraft))))
    stil = f.create_entity("IfcSurfaceStyle", Name=f"Quagg {int(farbe):06x}", Side="BOTH",
                           Styles=[schattierung])
    cache[schluessel] = stil
    return stil


def _wert(f, v):
    """Der Wert eines Merkmals, GETYPT: eine Zahl bleibt eine Zahl.

    `(typ, wert)` schreibt einen Messwert mit Einheit (IfcVolumeMeasure — die
    Einheit kommt aus dem Projekt); bool/int/float ihre Grundtypen; alles
    andere Text. Bis Paket v1 war alles IfcText, auch die Bauteilzahl.
    """
    if isinstance(v, tuple):
        return f.create_entity(v[0], v[1])
    if isinstance(v, bool):
        return f.create_entity("IfcBoolean", v)
    if isinstance(v, int):
        return f.create_entity("IfcInteger", v)
    if isinstance(v, float):
        return f.create_entity("IfcReal", v)
    return f.create_entity("IfcText", str(v))


def _merkmale(f, besitz, objekt, satzname: str, werte: dict, schluessel: str):
    """Merkmalssatz mit abgeleiteten GlobalIds.

    Eigene Saetze tragen das Praefix `Quagg_` — `Pset_` ist bSI-reserviert und
    kommt nur ueber `_bsi_merkmale`, gegen die Vorlage geprueft (Teil XXVI, Z3).
    """
    eigenschaften = [
        f.create_entity("IfcPropertySingleValue", Name=str(k), NominalValue=_wert(f, v))
        for k, v in werte.items() if v is not None and v != "" and v != []
    ]
    if not eigenschaften:
        return None
    satz = f.create_entity("IfcPropertySet", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|{satzname}"),
                           OwnerHistory=besitz, Name=satzname, HasProperties=eigenschaften)
    f.create_entity("IfcRelDefinesByProperties",
                    GlobalId=guids.guid_aus_cde_id(f"{schluessel}|{satzname}|rel"),
                    OwnerHistory=besitz, RelatedObjects=[objekt], RelatingPropertyDefinition=satz)
    return satz


def _merkmal(objekt, satzname: str, name: str):
    """Einen Wert aus einem Merkmalssatz lesen — ueber die inverse Beziehung."""
    for rel in getattr(objekt, "IsDefinedBy", None) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        satz = rel.RelatingPropertyDefinition
        if not satz or not satz.is_a("IfcPropertySet") or satz.Name != satzname:
            continue
        for e in satz.HasProperties or []:
            if e.Name == name and e.is_a("IfcPropertySingleValue") and e.NominalValue is not None:
                return e.NominalValue.wrappedValue
    return None


def _nach_guid(f, guid):
    """Ein Bauteil ueber seine GlobalId — oder None, wenn es nicht in dieser Datei ist.

    Faellt auf `Quagg_Herkunft.OriginalGlobalId` zurueck: der Verbund benennt
    eine GlobalId um, wenn sie mit einer anderen Quelle kollidiert, und haelt
    die alte in genau diesem Merkmal fest.
    """
    if not guid:
        return None
    try:
        return f.by_guid(guid)
    except Exception:                               # noqa: BLE001 — nicht vorhanden
        pass
    for satz in f.by_type("IfcPropertySet"):
        if satz.Name != H.PSET_HERKUNFT:
            continue
        if any(e.Name == "OriginalGlobalId" and e.NominalValue is not None
               and e.NominalValue.wrappedValue == guid for e in (satz.HasProperties or [])):
            for rel in satz.DefinesOccurrence or []:
                for o in rel.RelatedObjects or []:
                    return o
    return None


def _voids(f, besitz, wirt, aushub, schluessel: str):
    """Die Beziehung Wirt -> Aushub. Die GlobalId ist abgeleitet: zweimal hergestellt ist dieselbe."""
    return f.create_entity(
        "IfcRelVoidsElement", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|voids|{aushub.GlobalId}"),
        OwnerHistory=besitz, RelatingBuildingElement=wirt, RelatedOpeningElement=aushub)


def _hat_wirt(aushub) -> bool:
    return bool(getattr(aushub, "VoidsElements", None))


def _volumen(wert):
    """Eine Kennzahl in m3 als Messwert — oder nichts, wenn keine Zahl kam."""
    try:
        zahl = float(wert)
    except (TypeError, ValueError):
        return None
    return ("IfcVolumeMeasure", zahl) if math.isfinite(zahl) and zahl >= 0 else None


def _qto_vorlage(klasse: str):
    """Die bSI-Vorlage `Qto_<Klasse>BaseQuantities` — oder None.

    Aus den Vorlagen der Norm (Schema-Schnappschuss, `schema.py`), NICHT aus
    einer eigenen Liste: welche Mengen es gibt und welchen Typ sie haben,
    entscheidet die Norm. Eine eigene Aufzaehlung waere irgendwann eine andere.
    """
    return S.qto_vorlage(klasse)


def _mengen(f, besitz, el, mengen: dict, schluessel: str, warnungen: list, cde_id: str, methode=None):
    """Die Mengen eines Bauteils als `IfcElementQuantity` nach der Vorlage seiner Klasse.

    Ein Schluessel `undisturbedVolume` wird `UndisturbedVolume`, sein Typ
    (Volumen, Laenge, ...) kommt aus der Vorlage. Was die Vorlage nicht kennt,
    wird gemeldet, nicht geschrieben — ein `Qto_`-Satz mit erfundenen Mengen
    waere so unkonform wie ein erfundener PredefinedType.
    """
    if not mengen:
        return None
    vorlage = _qto_vorlage(el.is_a())
    if vorlage is None:
        warnungen.append(f"{cde_id}: fuer {el.is_a()} gibt es keine Qto-Vorlage — Mengen nicht geschrieben")
        return None
    typen = {merkmal[0]: merkmal[1] for merkmal in vorlage["merkmale"]}
    werte = []
    for schl, roh in mengen.items():
        name = str(schl)[:1].upper() + str(schl)[1:]
        typ = _MENGENTYP.get(typen.get(name))
        if typ is None:
            warnungen.append(f"{cde_id}: {name} steht nicht in {vorlage['name']} — nicht geschrieben")
            continue
        try:
            zahl = float(roh)
        except (TypeError, ValueError):
            warnungen.append(f"{cde_id}: {name} ist keine Zahl ({roh!r})")
            continue
        if not math.isfinite(zahl) or zahl < 0:
            warnungen.append(f"{cde_id}: {name} = {roh!r} ist keine Menge")
            continue
        werte.append(f.create_entity(typ[0], Name=name, **{typ[1]: zahl}))
    if not werte:
        return None
    text = MENGEN_METHODEN.get(methode or "raster")
    if text is None:
        warnungen.append(f"{cde_id}: Messmethode {methode!r} unbekannt — MethodOfMeasurement leer gelassen")
    qto = f.create_entity("IfcElementQuantity", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|qto"),
                          OwnerHistory=besitz, Name=vorlage["name"], MethodOfMeasurement=text,
                          Quantities=werte)
    f.create_entity("IfcRelDefinesByProperties", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|qto|rel"),
                    OwnerHistory=besitz, RelatedObjects=[el], RelatingPropertyDefinition=qto)
    return qto


def _nach_vorlage(typ: str, wert):
    """Ein Paketwert, getypt nach der bSI-Vorlage — oder None, wenn er nicht passt.

    Nie geraten: ein Text wird kein Wahrheitswert, eine Zahl kein Text. Was nicht
    passt, nennt der Aufrufer im Bericht.
    """
    if typ in ("IfcBoolean", "IfcLogical"):
        return wert if isinstance(wert, bool) else None
    if typ in ("IfcLabel", "IfcText", "IfcIdentifier"):
        return wert.strip() if isinstance(wert, str) and wert.strip() else None
    if isinstance(wert, bool) or not isinstance(wert, (int, float)) or not math.isfinite(wert):
        return None
    if typ in ("IfcInteger", "IfcCountMeasure"):
        return int(wert) if float(wert).is_integer() else None
    return float(wert)


def _bsi_merkmale(f, besitz, el, klasse: str, pt, merkmale, schluessel: str, warnungen: list, cde_id: str) -> int:
    """bSI-Merkmalssaetze aus dem Paket (Teil XXVI, Z3) — nur, was die Vorlage fuer DIESE Klasse kennt.

    Der Client sammelt sie aus Rezeptfeldern, die ein Ziel nennen
    (`pset: 'Pset_WallCommon.LoadBearing'`). Entschieden wird HIER, gegen den
    Schema-Schnappschuss: gilt der Satz fuer die Klasse (samt PredefinedType)?
    Gibt es das Merkmal, ist es ein Einzelwert, passt der Wert zu seinem Typ?
    Was nicht passt, steht als Warnung im Bericht — nie still in der Datei, nie
    still verworfen. Ein Bauteil, dessen Typ der Planer geaendert hat (Platte
    als IfcCovering), bekommt so keinen Pset_SlabCommon.

    @returns Zahl der geschriebenen Saetze
    """
    if not isinstance(merkmale, dict) or not merkmale:
        return 0
    gilt = set(S.vorlagen_fuer(klasse, pt))
    n = 0
    for satzname, werte in merkmale.items():
        vorlage = S.vorlage(satzname)
        if vorlage is None or not str(vorlage.get("art", "")).startswith("PSET_") or vorlage["name"] not in gilt:
            warnungen.append(f"{cde_id}: Merkmalssatz {satzname} gilt nicht fuer {klasse} — nicht geschrieben")
            continue
        typen = {m[0]: (m[1], m[2]) for m in vorlage["merkmale"]}
        getypt = {}
        for name, wert in (werte or {}).items():
            art, typ = typen.get(name, (None, None))
            if art != "P_SINGLEVALUE":
                warnungen.append(f"{cde_id}: {vorlage['name']}.{name} "
                                 + ("steht nicht in der Vorlage" if art is None else f"ist kein Einzelwert ({art})")
                                 + " — nicht geschrieben")
                continue
            w = _nach_vorlage(typ, wert)
            if w is None:
                warnungen.append(f"{cde_id}: {vorlage['name']}.{name} erwartet {typ}, bekam {wert!r} — nicht geschrieben")
                continue
            getypt[name] = (typ, w)
        if getypt and _merkmale(f, besitz, el, vorlage["name"], getypt, schluessel=schluessel) is not None:
            n += 1
    return n


def _ifc_id(wert: str | None) -> str | None:
    """Eine Kennung, wie sie im IFC steht: CDE-Kennungen werden abgeleitet, echte bleiben."""
    if not wert:
        return None
    return guids.guid_aus_cde_id(wert) if str(wert).startswith("cde-") else str(wert)


def _quelldokumente_von(b: dict, quell_dokumente: list) -> tuple[list, bool]:
    """Die Registerdateien, aus denen dieses Bauteil stammt — die des Wirts zuerst.

    Der Browser nennt je Registerdatei die gelieferten GlobalIds, die er darin
    fand (`paket.quellDokumente[].globalIds`: die Wirte der Aushuebe, die
    Ur-Gelaende der Auftraege); das Bauteil nennt seinen Wirt und seine Quellen.
    Eine CDE-Kennung liegt in keiner Datei.

    @returns (Registerdateien, ob das Bauteil GELIEFERTE Quellen hat)
    """
    q = b.get("quellen") or {}
    gesucht = [b.get("wirt"), q.get("gelaende"), q.get("bauteil"), *(q.get("rohre") or []),
               *(q.get("schaechte") or [])]
    geliefert = [str(g) for g in gesucht if g and not str(g).startswith("cde-")]
    out = []
    for g in geliefert:
        for d in quell_dokumente:
            if g in (d.get("globalIds") or []) and d not in out:
                out.append(d)
    return out, bool(geliefert)


def _quellen_json(b: dict) -> str | None:
    """Wirt und Quellen, wie sie im IFC heissen — `Quagg_Herkunft.QuellGlobalIds`."""
    werte = {}
    for k, v in (b.get("quellen") or {}).items():
        v = [_ifc_id(x) for x in v if x] if isinstance(v, list) else _ifc_id(v)
        if v:
            werte[k] = v
    if b.get("wirt"):
        werte["wirt"] = _ifc_id(b["wirt"])
    return json.dumps(werte, sort_keys=True, separators=(",", ":")) if werte else None


# DIE ARTEN EINES BAUWERKS (Teil XXVI, Z5 — Fabios E19). Welche Beziehung ein
# Teil zu seinem Bauwerk hat, ist SCHEMAWISSEN und steht deshalb hier, nicht im
# Client: in einer Anlage (Raumelement) wird ein Teil ENTHALTEN, in einer
# Baugruppe (Element) wird es ZERLEGT. Beides zugleich zaehlte es doppelt.
BAUWERKSARTEN = ("anlage", "baugruppe")
# DER RAUM (Teil XXVI, Z6): das einzige Raumelement, das als Paket-Bauteil kommt —
# es hat einen Koerper (den Hohlraum) und Mengen (das Speichervolumen). Es wird
# ZERLEGT unter seiner Anlage oder der Site (WR41), nie enthalten (WR31). Alle
# anderen Raumelemente bleiben im Bauteilweg gesperrt (Z1).
RAUMKLASSE = "IfcSpace"


def _platz(f, bezug):
    """Eine Platzierung ohne Versatz, relativ zu `bezug` — die Lage aendert sich nicht."""
    return f.create_entity(
        "IfcLocalPlacement", PlacementRelTo=bezug,
        RelativePlacement=f.create_entity(
            "IfcAxis2Placement3D", Location=f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))))


def _bauwerke_anlegen(f, besitz, site, bauwerke, satz: str, warnungen: list) -> dict:
    """Die Behaelter eines Pakets: Bauwerke, in denen Bauteile stehen (Teil XXVI, Z5a).

    `bauwerke: [{cdeId, art: 'anlage'|'baugruppe', name, teilVon?, predefinedType?}]`

      anlage, ohne Eltern      -> IfcFacility, unter der Site ZERLEGT (WR41)
      anlage in einer Anlage   -> IfcFacilityPartCommon, unter ihr ZERLEGT;
                                  UsageType ist Pflicht (NOTDEFINED)
      baugruppe                -> IfcElementAssembly/USERDEFINED mit ObjectType;
                                  sie selbst wird spaeter wie ein Bauteil eingeordnet

    Eltern vor Kindern; eine unbekannte Elternkennung, ein Kreis oder eine Anlage
    in einer Baugruppe werden GENANNT und das Bauwerk an die Site gehaengt — nie
    still verworfen. Ein Bauwerk ohne Koerper braucht keinen: es ist ein
    Behaelter, kein Bauteil (deshalb ein eigener Paketschluessel, Fund 4).

    @returns {cdeId: {"inst", "rolle": 'anlage'|'teilanlage'|'baugruppe', "eltern"}}
    """
    eintraege = {}
    for w in bauwerke or []:
        cid = w.get("cdeId") if isinstance(w, dict) else None
        if not cid:
            warnungen.append("Bauwerk ohne cdeId — nicht geschrieben")
        elif w.get("art") not in BAUWERKSARTEN:
            warnungen.append(f"{cid}: Bauwerksart {w.get('art')!r} unbekannt ({', '.join(BAUWERKSARTEN)}) — nicht geschrieben")
        elif cid in eintraege:
            warnungen.append(f"{cid}: Bauwerk steht doppelt im Paket — das erste gilt")
        else:
            eintraege[cid] = w
    behaelter = {}

    def anlegen(cid, pfad=()):
        if cid in behaelter:
            return behaelter[cid]
        w = eintraege[cid]
        eltern = None
        eltern_id = w.get("teilVon")
        if eltern_id:
            if eltern_id == cid or eltern_id in pfad:
                warnungen.append(f"{cid}: Bauwerk liegt im Kreis ueber {eltern_id} — an die Site gehaengt")
            elif eltern_id not in eintraege:
                warnungen.append(f"{cid}: Bauwerk {eltern_id} gibt es im Paket nicht — an die Site gehaengt")
            else:
                eltern = anlegen(eltern_id, pfad + (cid,))
        if w["art"] == "anlage" and eltern is not None and eltern["rolle"] == "baugruppe":
            warnungen.append(f"{cid}: eine Anlage kann nicht Teil einer Baugruppe sein — an die Site gehaengt")
            eltern = None
        bezug = (eltern["inst"] if eltern else site).ObjectPlacement
        attrs = dict(GlobalId=guids.guid_aus_cde_id(cid), OwnerHistory=besitz, Name=w.get("name") or None,
                     ObjectPlacement=_platz(f, bezug))
        if w["art"] == "baugruppe":
            inst = f.create_entity("IfcElementAssembly", **attrs, PredefinedType="USERDEFINED",
                                   ObjectType=w.get("objectType") or "Baugruppe")
            rolle = "baugruppe"
        elif eltern is None:
            inst = f.create_entity("IfcFacility", **attrs, CompositionType="ELEMENT",
                                   ObjectType=w.get("objectType") or None)
            rolle = "anlage"
        else:
            pt, warnung = _predefined("IfcFacilityPartCommon", w.get("predefinedType"))
            if warnung:
                warnungen.append(f"{cid}: {warnung}")
            inst = f.create_entity("IfcFacilityPartCommon", **attrs, CompositionType="ELEMENT",
                                   UsageType="NOTDEFINED", PredefinedType=pt)
            rolle = "teilanlage"
        if rolle != "baugruppe":
            # Raumelemente haengen ZERLEGT unter ihrem Raumelternteil (WR41) — nie enthalten (WR31).
            f.create_entity("IfcRelAggregates", GlobalId=guids.guid_aus_cde_id(f"{satz}|bauwerk|{cid}"),
                            OwnerHistory=besitz, RelatingObject=eltern["inst"] if eltern else site,
                            RelatedObjects=[inst])
        _merkmale(f, besitz, inst, PSET_CDE, {"CdeId": cid, "Rezept": "bauwerk", "Art": w["art"]},
                  schluessel=f"{satz}|{cid}")
        behaelter[cid] = {"inst": inst, "rolle": rolle, "eltern": eltern_id if eltern else None}
        return behaelter[cid]

    for cid in eintraege:
        anlegen(cid)
    return behaelter


def baue_datei(paket: dict, ziel, *, schluessel: str = "cde", projektname: str | None = None,
               bearbeiter: str = "", firma: str = "", ablage: str | None = None) -> dict:
    """Das Paket als eigenstaendige IFC4X3_ADD2-Datei schreiben.

    Der Einhaengepunkt fuer den Verbundlauf (`cli.py`, Sitzung quagg-page-de).

    @param schluessel  macht die abgeleiteten GlobalIds je Satz eindeutig
    @param ablage      wo die Registerdateien liegen — `Location` der Dokumentverweise
    @param firma       Organisation dessen, der ausgibt (S4 neu); leer: `paket.organisation`, sonst die Vorgabe
    @returns Bericht: {"bauteile": n, "uebersprungen": [...], "warnungen": [...],
             "wirte_offen": n, ...}
    """
    _pruefe_paket(paket)
    begonnen = time.time()
    # Ohne System KEINE Vorgabe. Die alte Vorgabe EPSG:25832 haette ENQUIER
    # (GK2) falsch etikettiert — dieselbe Falle, die die Verbund-Sitzung aus
    # ihrem Geruest genommen hat. Ohne Angabe traegt die Datei Landeskoordinaten
    # ohne Georeferenz, und der Verbund entscheidet an den Lieferungen.
    crs = paket.get("crs") or None
    satz = f"eigenbau:{schluessel}"
    name = projektname or paket.get("projektname") or "CDE-Eigenbau"
    herkunft = paket.get("crsHerkunft") or f"aus der Georeferenz-Erkennung der CDE ({crs})"
    try:
        g = zielgeruest(name, crs=crs, bearbeiter=bearbeiter or paket.get("bearbeiter", ""),
                        firma=firma or paket.get("organisation") or "",
                        schluessel=satz, crs_herkunft=herkunft)
    except VerbundUnmoeglich as e:                   # unbekanntes System: nennen, nicht raten
        raise PaketFehler(str(e)) from e
    f, site, besitz, koerper_ctx = g["datei"], g["site"], g["besitz"], g["koerper"]
    # DIE BAUWERKE zuerst (Teil XXVI, Z5a): ein Teil wird relativ zu seinem Behaelter platziert.
    behaelter_warnungen = []
    behaelter = _bauwerke_anlegen(f, besitz, site, paket.get("bauwerke"), satz, behaelter_warnungen)

    stile = {}
    produkte, uebersprungen, warnungen = [], [], list(behaelter_warnungen)
    raeume = []                                      # IfcSpace — zerlegt, nie enthalten (Z6)
    geschrieben = []                                 # (Element, Paketeintrag) — fuer die Gruppen
    mengen_n = 0
    merkmale_n = 0                                   # bSI-Saetze aus Rezeptfeldern (Teil XXVI, Z3)
    if crs is None:
        warnungen.append("Paket ohne Bezugssystem — die Datei traegt Landeskoordinaten ohne "
                         "Georeferenz; der Verbund entscheidet an den Lieferungen")

    # Die Herkunft jedes Elements (Fahrplan Erdbau-Container, Stufe 3): die
    # Registerdateien der Quellen — je sha256 EINE, auch wenn der Browser sie
    # zweimal nennt —, der Journalstand, das Werkzeug.
    quell_dokumente = {}
    for q in paket.get("quellDokumente") or []:
        if isinstance(q, dict) and q.get("sha256"):
            quell_dokumente.setdefault(q["sha256"], q)
    quell_dokumente = list(quell_dokumente.values())
    stand, werkzeug = H.journalstand(paket.get("journal")), H.werkzeug()
    je_dokument, referenzen = {}, {}                 # sha256 -> [Element] | Dokumentverweis

    for b in paket["bauteile"]:
        cde_id = b.get("cdeId")
        if not cde_id:
            uebersprungen.append({"grund": "ohne cdeId", "name": b.get("name")})
            continue
        raum = S.name_von(b.get("klasse")) == RAUMKLASSE
        klasse = RAUMKLASSE if raum else _klasse(b.get("klasse"))
        if klasse is None:
            # Der GRUND kommt aus derselben Regel wie die Entscheidung (schema._schreibbar):
            # abstrakt, kein Produkt, nicht im Zielschema — oder ein Raumelement, das im
            # Bauteilweg WR31/WR41 verletzte (Teil XXVI, Z1).
            uebersprungen.append({"cdeId": cde_id, "grund": f"Klasse {S.warum_nicht_schreibbar(b.get('klasse'))}"})
            continue
        punkte = b.get("punkte") or []
        dreiecke = b.get("dreiecke") or []
        if len(punkte) < 3 or not dreiecke:
            uebersprungen.append({"cdeId": cde_id, "grund": "ohne Geometrie"})
            continue
        n = len(punkte)
        if any(not (0 <= int(i) < n) for d in dreiecke for i in d):
            uebersprungen.append({"cdeId": cde_id, "grund": "Dreiecksindex ausserhalb der Punktliste"})
            continue

        pt, warnung = _predefined(klasse, b.get("predefinedType"))
        if warnung:
            warnungen.append(f"{cde_id}: {warnung}")

        ursprung = [float(v) for v in (b.get("ursprung") or [0.0, 0.0, 0.0])]
        # Relativ zu seinem Behaelter (Teil XXVI) — der liegt ohne Versatz, die Lage bleibt.
        bezug = behaelter[b["teilVon"]]["inst"].ObjectPlacement if b.get("teilVon") in behaelter else site.ObjectPlacement
        platz = f.create_entity(
            "IfcLocalPlacement", PlacementRelTo=bezug,
            RelativePlacement=f.create_entity(
                "IfcAxis2Placement3D",
                Location=f.create_entity("IfcCartesianPoint", Coordinates=tuple(ursprung))))

        koord = f.create_entity("IfcCartesianPointList3D",
                                CoordList=[tuple(float(c) for c in p) for p in punkte])
        # CoordIndex zaehlt ab EINS (IfcPositiveInteger) — die CDE ab null.
        geschlossen = b.get("geschlossen")
        flaeche = f.create_entity("IfcTriangulatedFaceSet", Coordinates=koord,
                                  Closed=bool(geschlossen) if geschlossen is not None else None,
                                  CoordIndex=[(int(a) + 1, int(c) + 1, int(d) + 1) for a, c, d in dreiecke])
        if b.get("farbe") is not None:
            f.create_entity("IfcStyledItem", Item=flaeche,
                            Styles=[_stil(f, b["farbe"], b.get("deckkraft", 1.0), stile)])
        darstellung = f.create_entity("IfcShapeRepresentation", ContextOfItems=koerper_ctx,
                                      RepresentationIdentifier="Body", RepresentationType="Tessellation",
                                      Items=[flaeche])
        form = f.create_entity("IfcProductDefinitionShape", Representations=[darstellung])

        attrs = dict(GlobalId=guids.guid_aus_cde_id(cde_id), OwnerHistory=besitz,
                     Name=b.get("name") or None, ObjectPlacement=platz, Representation=form)
        if pt is not None:
            attrs["PredefinedType"] = pt
        el = f.create_entity(klasse, **attrs)

        vorgang = b.get("vorgang") or {}
        _merkmale(f, besitz, el, PSET_CDE, {
            "CdeId": cde_id,
            "Rezept": b.get("rezept"),
            "Rolle": b.get("rolle"),
            "Ableitung": b.get("ableitung"),
            "Vorgang": vorgang.get("titel"),
            "Wirt": _ifc_id(b.get("wirt")),
            # Fabios Entscheidung 3: der Wirt bleibt IMMER das Ur-Gelaende. Schneidet
            # ein Aushub durch den Auftrag eines frueheren Vorgangs, steht es HIER —
            # nicht als zweite Wirt-Beziehung.
            "SchneidetAuffuellung": ", ".join(_ifc_id(x) for x in (b.get("schneidetAuffuellung") or []) if x),
            "AushubAusAuffuellung": _volumen(b.get("aushubAusAuffuellung")),
            "Hinweis": b.get("hinweis"),
            # Die Vorlage (A1/A9b) — auch an Klassen ohne Typobjekt lesbar.
            "Vorlage": (b.get("typ") or {}).get("id") if isinstance(b.get("typ"), dict) else None,
        }, schluessel=f"{satz}|{cde_id}")
        if _mengen(f, besitz, el, b.get("mengen") or {}, f"{satz}|{cde_id}", warnungen, cde_id,
                   methode=b.get("mengenMethode")):
            mengen_n += 1
        merkmale_n += _bsi_merkmale(f, besitz, el, klasse, pt, b.get("merkmale"), f"{satz}|{cde_id}",
                                    warnungen, cde_id)
        docs, geliefert = _quelldokumente_von(b, quell_dokumente)
        if docs:
            quelle = {"QuellDokument": "; ".join(str(d.get("datei") or d["sha256"][:12]) for d in docs),
                      "QuellRevision": "; ".join("?" if d.get("revision") is None else str(d["revision"])
                                                 for d in docs),
                      "QuellSHA256": "; ".join(d["sha256"] for d in docs)}
        elif not geliefert:
            # Nur aus der CDE (ein Aushub auf selbst gezeichnetem Gelaende, ein
            # gezeichnetes Bauteil): die Quelle IST das Journal (Stufe 4).
            quelle = {"QuellDokument": H.QUELLE_JOURNAL, "QuellRevision": stand or "ohne Commit"}
        else:
            # Aus einer Lieferung, deren Registerdatei der Browser nicht fand: unbekannt
            # bleibt unbekannt — die IDS-Regel `spec-*-herkunft` meldet es.
            quelle = {}
        H.schreibe(f, besitz, el, {
            **quelle,
            "QuellGlobalIds": _quellen_json(b),
            "Journalstand": stand,
            "Erzeugt": paket.get("erzeugt"),
            "Werkzeug": werkzeug,
            "EingabeHash": H.eingabe_hash(b),
        }, guid_von=lambda teil, _s=f"{satz}|{cde_id}|{H.PSET_HERKUNFT}": guids.guid_aus_cde_id(
            _s if teil == "satz" else f"{_s}|{teil}"))
        for d in docs:
            je_dokument.setdefault(d["sha256"], []).append(el)
        # Ein Raum ist kein Bauteil: er kommt nicht in die Einordnung (WR31), sondern
        # wird unten unter sein Raumelement zerlegt (WR41).
        (raeume if raum else produkte).append(el)
        geschrieben.append((el, b))

    # DIE TYPEN (Teil XXIII, A9b): je Vorlage EIN Typobjekt, bevor die Kanten
    # dazukommen — Kanten haben keine Vorlage.
    typen_n = _typen_schreiben(f, besitz, g["projekt"], geschrieben, satz, warnungen)

    # DIE BOESCHUNGSKANTEN (Teil XX Stufe B): keine Bauteile, aber `IfcProduct`
    # — sie gehen deshalb durch dieselben Listen wie ein Bauteil und landen in
    # Raumgliederung, Fachmodell- und Vorgangsgruppe.
    kanten_neu, kanten_weg = _kanten_schreiben(f, besitz, koerper_ctx.ParentContext or koerper_ctx,
                                               paket, satz, geschrieben)
    for el, b in kanten_neu:
        produkte.append(el)
        geschrieben.append((el, b))
    uebersprungen.extend(kanten_weg)

    # Wirte im selben Paket: jetzt, wo alle Bauteile stehen (der Wirt kann in
    # der Liste nach seinem Aushub kommen).
    fachmodelle, vorgaenge = {}, 0
    offen = []
    for el in produkte:
        if not el.is_a("IfcFeatureElementSubtraction"):
            continue
        wirt = _nach_guid(f, _merkmal(el, PSET_CDE, "Wirt"))
        if wirt is not None and wirt.id() != el.id():
            _voids(f, besitz, wirt, el, satz)
        else:
            offen.append(el.GlobalId)
    if offen:
        warnungen.append(f"{len(offen)} Aushub/Aushuebe ohne Wirt in dieser Datei — "
                         "konform erst im Verbund (wirte_herstellen)")

    # DIE RAEUME (Teil XXVI, Z6): unter ihrer Anlage zerlegt — oder unter der Site.
    # Eine Baugruppe ist ein Element; ein Raum darin waere schemawidrig (WR41
    # verlangt ein RAUMelement als Ganzes). Das wird genannt, und er kommt an die Site.
    raeume_unter = {}
    paket_raum = {el.id(): b for el, b in geschrieben if el.is_a(RAUMKLASSE)}
    for el in raeume:
        ziel_id = (paket_raum.get(el.id()) or {}).get("teilVon")
        b_ziel = behaelter.get(ziel_id)
        if ziel_id and (b_ziel is None or b_ziel["rolle"] == "baugruppe"):
            warnungen.append(f"{(paket_raum.get(el.id()) or {}).get('cdeId')}: ein Raum gehoert in eine Anlage, "
                             f"nicht in {ziel_id} — unter der Site zerlegt")
            b_ziel = None
        raeume_unter.setdefault(ziel_id if b_ziel else None, []).append(el)
    for cid, glieder in raeume_unter.items():
        f.create_entity("IfcRelAggregates", GlobalId=guids.guid_aus_cde_id(f"{satz}|raeume|{cid or 'site'}"),
                        OwnerHistory=besitz, RelatingObject=behaelter[cid]["inst"] if cid else site,
                        RelatedObjects=glieder)

    if produkte:
        # NICHT in die Raumgliederung: Aushuebe (IfcFeatureElement). Die
        # Where-Rule `IfcFeatureElement.NotContained` verlangt
        # SIZEOF(ContainedInStructure) = 0 — ein Aushub haengt ueber seinen
        # WIRT in der Gliederung, nicht selbst. Das Prueftor hat es beim
        # zweiten Lauf gezeigt, nachdem der Wirt geschlossen war.
        eingeordnet = [p for p in produkte if not p.is_a("IfcFeatureElement")]
        # JE BEHAELTER (Teil XXVI, Z5a): ein Teil einer ANLAGE wird dort enthalten,
        # ein Teil einer BAUGRUPPE zerlegt — und dann NICHT zusaetzlich enthalten.
        # Die Baugruppe selbst wird eingeordnet wie ein Bauteil. Ohne `teilVon`
        # bleibt alles bei der Site, mit derselben Beziehung wie vor Teil XXVI.
        paket_von = {el.id(): b for el, b in geschrieben}
        in_site, enthalten, zerlegt = [], {}, {}
        for p in eingeordnet:
            ziel_id = (paket_von.get(p.id()) or {}).get("teilVon")
            if ziel_id and ziel_id not in behaelter:
                warnungen.append(f"{(paket_von.get(p.id()) or {}).get('cdeId')}: Bauwerk {ziel_id} gibt es "
                                 "im Paket nicht — an der Site eingeordnet")
            b_ziel = behaelter.get(ziel_id)
            if b_ziel is None:
                in_site.append(p)
            elif b_ziel["rolle"] == "baugruppe":
                zerlegt.setdefault(ziel_id, []).append(p)
            else:
                enthalten.setdefault(ziel_id, []).append(p)
        for cid, b_ziel in behaelter.items():
            if b_ziel["rolle"] != "baugruppe":
                continue
            e = behaelter.get(b_ziel["eltern"])
            if e is None:
                in_site.append(b_ziel["inst"])
            elif e["rolle"] == "baugruppe":
                zerlegt.setdefault(b_ziel["eltern"], []).append(b_ziel["inst"])
            else:
                enthalten.setdefault(b_ziel["eltern"], []).append(b_ziel["inst"])
        if in_site:
            f.create_entity("IfcRelContainedInSpatialStructure",
                            GlobalId=guids.guid_aus_cde_id(f"{satz}|enthalten"), OwnerHistory=besitz,
                            RelatingStructure=site, RelatedElements=in_site)
        for cid, glieder in enthalten.items():
            f.create_entity("IfcRelContainedInSpatialStructure",
                            GlobalId=guids.guid_aus_cde_id(f"{satz}|enthalten|{cid}"), OwnerHistory=besitz,
                            RelatingStructure=behaelter[cid]["inst"], RelatedElements=glieder)
        for cid, glieder in zerlegt.items():
            f.create_entity("IfcRelAggregates", GlobalId=guids.guid_aus_cde_id(f"{satz}|zerlegt|{cid}"),
                            OwnerHistory=besitz, RelatingObject=behaelter[cid]["inst"], RelatedObjects=glieder)
        leer = [cid for cid in behaelter
                if not enthalten.get(cid) and not zerlegt.get(cid)
                and not any(x["eltern"] == cid for x in behaelter.values())]
        for cid in leer:
            warnungen.append(f"{cid}: Bauwerk ohne Teile")
        # V08 des Prueftors: jedes Bauteil gehoert einer Fachmodell-Gruppe an —
        # Erdbau und Eigenbau getrennt, damit ein Empfaenger den Aushub findet,
        # ohne Rezeptnamen zu kennen.
        # WEGGELASSEN (S4 neu, K7): was beim Ausgeben abgewaehlt wurde, steht in der
        # Datei — an jeder Fachmodell-Gruppe, denn es gilt fuer die ganze Ausgabe.
        ausgelassen = [a for a in paket.get("ausgelassen") or [] if isinstance(a, dict) and a.get("globalId")]
        weg_vorgaenge = "; ".join(sorted({str(a["vorgang"]) for a in ausgelassen if a.get("vorgang")}))[:250]
        je_fachmodell = {}
        baugruppen = [(x["inst"], {"fachmodell": "cde"}) for x in behaelter.values() if x["rolle"] == "baugruppe"]
        for el, b in [*geschrieben, *baugruppen]:
            # Ein RAUM ist kein Bauteil (Z6) — V08 zaehlt die Glieder gegen die Bauteile;
            # seine Herkunft traegt er im eigenen Merkmalssatz.
            if el.is_a(RAUMKLASSE):
                continue
            art = b.get("fachmodell") if b.get("fachmodell") in FACHMODELLE else "cde"
            je_fachmodell.setdefault(art, []).append(el)
        gruppe_von = {}                              # Element-Id -> seine Fachmodell-Gruppe
        for art, glieder in je_fachmodell.items():
            name, beschreibung, anhang = FACHMODELLE[art]
            gruppe = f.create_entity("IfcGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|{anhang}"),
                                     OwnerHistory=besitz, Name=name, Description=beschreibung,
                                     ObjectType="Fachmodell")
            f.create_entity("IfcRelAssignsToGroup",
                            GlobalId=guids.guid_aus_cde_id(f"{satz}|{anhang}-rel"), OwnerHistory=besitz,
                            RelatedObjects=glieder, RelatingGroup=gruppe)
            _merkmale(f, besitz, gruppe, H.PSET_FACHMODELL, {
                "Datei": name,
                "Quelle": "CDE-Journal",
                "Bauteile": len(glieder),
                "Erzeugt": paket.get("erzeugt"),
                "Journalstand": (paket.get("journal") or {}).get("commit"),
                "Ausgelassen": len(ausgelassen) or None,
                "AusgelasseneVorgaenge": weg_vorgaenge or None,
            }, schluessel=f"{satz}|{anhang}")
            fachmodelle[name] = len(glieder)
            gruppe_von.update({el.id(): gruppe for el in glieder})
        vorgaenge = _vorgaenge_gruppieren(f, besitz, geschrieben, satz)
        # Je Quelldokument EIN Verweis — an jedem Element, das daraus stammt, und an
        # dessen Fachmodell-Gruppe (Fahrplan Erdbau-Container, Stufe 3). Nennt kein
        # Element das Dokument, gilt es fuer alle Gruppen der Datei.
        for d in quell_dokumente:
            elemente = je_dokument.get(d["sha256"], [])
            gruppen = [gruppe_von[e.id()] for e in elemente] or list(gruppe_von.values())
            ref = H.dokument(f, referenzen, sha256=d["sha256"], datei=d.get("datei"),
                             revision=d.get("revision"), ablage=ablage)
            H.verknuepfe(f, besitz, ref, [*gruppen, *elemente],
                         guid=guids.guid_aus_cde_id(f"{satz}|dokument|{d['sha256']}"))
    else:
        warnungen.append("keine Bauteile geschrieben — die Datei traegt nur das Geruest")

    Path(ziel).parent.mkdir(parents=True, exist_ok=True)
    f.write(str(ziel))
    return {
        "ziel": str(ziel),
        "schema": ZIELSCHEMA,
        "crs": g["crs"],
        "bauteile": len(produkte),
        "uebersprungen": uebersprungen,
        "warnungen": warnungen,
        "wirte_offen": len(offen),
        "stile": len(stile),
        "mengen": mengen_n,
        "merkmalsaetze": merkmale_n,
        "bauwerke": len(behaelter),
        "raeume": len(raeume),
        "vorgaenge": vorgaenge,
        "typen": typen_n,
        "kanten": len(kanten_neu),
        "fachmodelle": fachmodelle,
        "dokumente": len(referenzen),
        "dauer_s": round(time.time() - begonnen, 2),
    }


def _typen_schreiben(f, besitz, projekt, geschrieben: list, satz: str, warnungen: list) -> int:
    """Je Vorlage EIN `Ifc<Klasse>Type` mit `IfcRelDefinesByType` (Teil XXIII, A9b — Befund B21).

    Die Vorlage kommt als `typ: {id, name}` aus dem Paket (A1: die Instanz
    behaelt ihre Vorlage). Welche Typklasse, sagt das Schema (`typklasse`, aus
    `CorrectTypeAssigned`) — nie geraten. Eine Vorlage, deren Bauteile in zwei
    Klassen stehen, ergibt zwei Typen (die Regel verlangt den Typ DER Klasse).
    `PredefinedType` ist am Typ Pflicht: der gemeinsame Wert der Bauteile, sonst
    NOTDEFINED (USERDEFINED verlangte ein `ElementType`, das wir erfinden
    muessten). Die Typen sind im Projekt erklaert (`IfcRelDeclares`).
    """
    je_typ, ohne = {}, set()
    for el, b in geschrieben:
        typ = b.get("typ")
        if not isinstance(typ, dict) or not typ.get("id"):
            continue
        tk = S.typklasse(el.is_a())
        if tk is None:
            ohne.add(el.is_a())
            continue
        e = je_typ.setdefault((tk, str(typ["id"])), {"name": typ.get("name") or str(typ["id"]), "glieder": [], "pt": set()})
        e["glieder"].append(el)
        e["pt"].add(getattr(el, "PredefinedType", None))
    for klasse in sorted(ohne):
        warnungen.append(f"{klasse} kennt im Schema keinen Typ — die Vorlage steht nur am Merkmal {PSET_CDE}.Vorlage")
    typen = []
    for (tk, vid), e in sorted(je_typ.items()):
        pt = next(iter(e["pt"])) if len(e["pt"]) == 1 else None
        pt = pt if pt in S.predefined(tk) and pt != "USERDEFINED" else "NOTDEFINED"
        schluessel = f"{satz}|typ|{tk}|{vid}"
        typ = f.create_entity(tk, GlobalId=guids.guid_aus_cde_id(schluessel), OwnerHistory=besitz,
                              Name=S.kurz(e["name"], 250), Tag=S.kurz(vid, 250), PredefinedType=pt)
        f.create_entity("IfcRelDefinesByType", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|rel"),
                        OwnerHistory=besitz, RelatedObjects=e["glieder"], RelatingType=typ)
        typen.append(typ)
    if typen:
        f.create_entity("IfcRelDeclares", GlobalId=guids.guid_aus_cde_id(f"{satz}|typen"), OwnerHistory=besitz,
                        RelatingContext=projekt, RelatedDefinitions=typen)
    return len(typen)


def _kanten_schreiben(f, besitz, kontext, paket: dict, satz: str, geschrieben: list) -> tuple:
    """Die BOESCHUNGSKANTEN eines Vorgangs als `IfcAnnotation` (Teil XX Stufe B).

    Fabio (2026-09-10): „die Boeschungskanten der Erdbauten leicht
    hervorheben". Im Raum sind sie Linien, im IFC das, was eine Vermessung
    absteckt — eine 3D-Kurve je Kante, Mitglied DERSELBEN Vorgangsgruppe wie
    Aushub und Auftrag.

    KEIN BAUTEIL: eine Kante ist kein `IfcElement`, sondern die Beschreibung
    einer Grenze. Sie traegt trotzdem Raumgliederung und Fachmodell-Gruppe —
    V07 und V08 des Prueftors zaehlen `IfcProduct`, und ein Annotation IST
    eines. Deshalb kommt sie in dieselben Listen wie ein Bauteil zurueck.

    OPTIONAL: ein Paket ohne `kanten` (aelterer Client) schreibt keine — das
    ist kein Fehler, sondern der Stand von vorher.

    @returns (neue, uebersprungen) — `neue` ist [(Element, Paketeintrag)] wie
             `geschrieben`, damit Gruppen und Raumgliederung sie mitnehmen.
    """
    kanten = paket.get("kanten") or []
    if not kanten:
        return [], []
    # Der Vorgang, zu dem eine Kante gehoert — aus den schon geschriebenen
    # Bauteilen. Eine Kante ohne Vorgang in DIESER Datei waere eine Waise.
    vorgang_je = {}
    for el, b in geschrieben:
        v = b.get("vorgang") or {}
        abl = v.get("ableitung")
        if abl and abl not in vorgang_je:
            vorgang_je[abl] = (v, b.get("fachmodell"))
    ctx = f.create_entity("IfcGeometricRepresentationSubContext",
                          ContextIdentifier="Annotation", ContextType="Model",
                          ParentContext=kontext, TargetView="MODEL_VIEW")
    neue, weg, zaehler = [], [], {}
    for k in kanten:
        abl, art = k.get("ableitung"), str(k.get("art") or "")
        punkte = k.get("punkte") or []
        if art not in KANTEN_ARTEN:
            weg.append({"grund": f"unbekannte Kantenart {art!r}", "ableitung": abl})
            continue
        if abl not in vorgang_je:
            weg.append({"grund": "Kante ohne Vorgang in dieser Datei", "ableitung": abl})
            continue
        if len(punkte) < 2:
            weg.append({"grund": "Kante mit weniger als zwei Punkten", "ableitung": abl})
            continue
        vorgang, fach = vorgang_je[abl]
        schluessel = (abl, art)
        zaehler[schluessel] = zaehler.get(schluessel, 0) + 1
        lauf = zaehler[schluessel]
        name, objekttyp = KANTEN_ARTEN[art]

        ursprung = [float(v) for v in (k.get("ursprung") or [0.0, 0.0, 0.0])]
        platz = f.create_entity(
            "IfcLocalPlacement",
            RelativePlacement=f.create_entity(
                "IfcAxis2Placement3D",
                Location=f.create_entity("IfcCartesianPoint", Coordinates=tuple(ursprung))))
        koord = [tuple(float(c) for c in p) for p in punkte]
        # OHNE `Segments`: dann verbindet das Schema die Punkte der Reihe nach
        # mit Strecken — genau das, was eine Bruchkante ist. Ein geschlossener
        # Ring bekommt seinen ersten Punkt am Ende noch einmal, statt einen
        # `IfcLineIndex` zu bauen, den kaum ein Empfaenger liest.
        if k.get("geschlossen"):
            koord.append(koord[0])
        kurve = f.create_entity("IfcIndexedPolyCurve",
                                Points=f.create_entity("IfcCartesianPointList3D", CoordList=koord))
        form = f.create_entity("IfcProductDefinitionShape", Representations=[
            f.create_entity("IfcShapeRepresentation", ContextOfItems=ctx,
                            RepresentationIdentifier="Annotation", RepresentationType="Curve3D",
                            Items=[kurve])])
        cde_id = f"kante|{abl}|{art}|{lauf}"
        el = f.create_entity("IfcAnnotation",
                             GlobalId=guids.guid_aus_cde_id(f"{satz}|{cde_id}"), OwnerHistory=besitz,
                             Name=name, ObjectType=objekttyp, PredefinedType=KANTEN_PREDEFINED,
                             ObjectPlacement=platz, Representation=form)
        _merkmale(f, besitz, el, PSET_CDE, {
            "CdeId": cde_id,
            "Rolle": art,
            "Ableitung": abl,
            "Vorgang": vorgang.get("titel"),
        }, schluessel=f"{satz}|{cde_id}")
        neue.append((el, {"fachmodell": fach if fach in FACHMODELLE else "erdbau",
                          "vorgang": vorgang, "quellen": {}}))
    return neue, weg


def _vorgaenge_gruppieren(f, besitz, geschrieben, satz: str) -> int:
    """Je Erdbau-Vorgang eine Gruppe `ObjectType='Vorgang'` mit Cut und Fill.

    Fabios Entscheidung 2: ein `IfcEarthworksCut` je Vorgang. Die Gruppe haelt
    zusammen, was zusammengehoert — Aushub und Verfuellung eines Grabens —,
    und traegt in `Quagg_Vorgang.Quellen` die gelieferten Bauteile, aus denen
    er abgeleitet ist (Rohre, Schaechte, Bauwerk). Die liegen in einer ANDEREN
    Datei; in die Gruppe holt sie erst `vorgaenge_schliessen_in` im Verbund.

    Reihenfolge = Reihenfolge im Erdbau-Stapel (der zweite Cut nimmt nur, was
    der erste uebrig liess). `Reihenfolge` zaehlt ab 1, fuer Menschen.
    """
    je = {}
    for el, b in geschrieben:
        v = b.get("vorgang") or {}
        abl = v.get("ableitung")
        if not abl:
            continue
        e = je.setdefault(abl, {"titel": v.get("titel"), "art": v.get("art"), "reihe": v.get("reihe"),
                                "glieder": [], "quellen": {"rohre": [], "schaechte": [], "bauteil": None}})
        e["glieder"].append(el)
        q = b.get("quellen") or {}
        for k in ("rohre", "schaechte"):
            for x in q.get(k) or []:
                i = _ifc_id(x)
                if i and i not in e["quellen"][k]:
                    e["quellen"][k].append(i)
        if q.get("bauteil"):
            e["quellen"]["bauteil"] = _ifc_id(q["bauteil"])
    reihe_von = lambda kv: (not isinstance(kv[1]["reihe"], int), kv[1]["reihe"] or 0, kv[0])  # noqa: E731
    for abl, e in sorted(je.items(), key=reihe_von):
        reihe = e["reihe"] if isinstance(e["reihe"], int) else None
        art = ART_TITEL.get(e["art"], e["art"] or "Erdbau-Vorgang")
        gruppe = f.create_entity(
            "IfcGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|vorgang|{abl}"), OwnerHistory=besitz,
            Name=e["titel"] or art,
            Description=art + (f" - Schritt {reihe + 1} am Ur-Gelaende" if reihe is not None else ""),
            ObjectType="Vorgang")
        f.create_entity("IfcRelAssignsToGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|vorgang|{abl}|rel"),
                        OwnerHistory=besitz, RelatedObjects=e["glieder"], RelatingGroup=gruppe)
        quellen = {k: w for k, w in e["quellen"].items() if w}
        _merkmale(f, besitz, gruppe, PSET_VORGANG, {
            "Ableitung": abl,
            "Art": e["art"],
            "Reihenfolge": reihe + 1 if reihe is not None else None,
            "Quellen": json.dumps(quellen, ensure_ascii=True, sort_keys=True) if quellen else None,
        }, schluessel=f"{satz}|vorgang|{abl}")
    return len(je)


def wirte_herstellen_in(datei) -> dict:
    """Im Verbund (IM SPEICHER) jedem CDE-Aushub seinen Wirt geben.

    Der Einhaengepunkt fuer `fuehre_zusammen(..., nachbearbeiten=...)` der
    Verbund-Sitzung: gerufen, NACHDEM alle Quellen uebernommen sind und BEVOR
    aufgeraeumt und geschrieben wird. Erst dort liegen das gelieferte
    Ur-Gelaende und der Aushub der CDE in derselben Datei.

    Die GlobalId des Wirts steht im Merkmal `Quagg_CDE.Wirt` — sie ueberlebt
    den Verbund, auch wenn dieser eine GlobalId wegen einer Kollision ersetzt
    hat (`_nach_guid` folgt dann `Quagg_Herkunft.OriginalGlobalId`).

    Ein Aushub, dessen Wirt NICHT im Verbund ist, bleibt offen und steht im
    Bericht — ein erfundener Wirt waere eine falsche Aussage in der Datei.
    Offen ist kein Abbruch: das Schema-Tor lehnt den Verbund dann ab, und der
    Bericht nennt die Aushuebe beim Namen — und unter `fehlende_wirte`, WAS
    fehlt. Das ist fast immer das gelieferte Gelaende, das nicht im Satz steht
    (ein Satz ohne Modell ist mit Eigenbau erlaubt); ohne diesen Namen hiesse
    der Befund nur „rot", nicht „dieses Gelaende mitnehmen".

    NUR EIGENE AUSHUEBE (Paket v2): ein Aushub ohne `Quagg_CDE.CdeId` gehoert
    einer Lieferung. Eine gelieferte Oeffnung ohne Wirt ist deren Befund, nicht
    unserer — sie wird weder angefasst noch als „offen" gezaehlt. Ein eigener
    Aushub, der gar KEINEN Wirt nennt, steht unter `ohne_wirtangabe` (mit
    seiner CDE-Kennung): dort fehlt nicht ein Gelaende im Satz, sondern die
    Angabe im Journal.

    @returns {"geschlossen": n, "offen": [GlobalIds], "schon_da": n,
              "fehlende_wirte": [GlobalIds, wie sie im Paket stehen],
              "ohne_wirtangabe": [CDE-Kennungen]}
    """
    besitz = (datei.by_type("IfcOwnerHistory") or [None])[0]
    geschlossen, schon_da, offen, fehlende, ohne_angabe = 0, 0, [], [], []
    for aushub in datei.by_type("IfcFeatureElementSubtraction"):
        cde_id = _merkmal(aushub, PSET_CDE, "CdeId")
        if not cde_id:
            continue                                # nicht unseres
        if _hat_wirt(aushub):
            schon_da += 1
            continue
        gesucht = _merkmal(aushub, PSET_CDE, "Wirt")
        if not gesucht:
            offen.append(aushub.GlobalId)
            ohne_angabe.append(cde_id)
            continue
        wirt = _nach_guid(datei, gesucht)
        if wirt is None or wirt.id() == aushub.id():
            offen.append(aushub.GlobalId)
            if wirt is None and gesucht and gesucht not in fehlende:
                fehlende.append(gesucht)
            continue
        _voids(datei, besitz, wirt, aushub, "verbund")
        geschlossen += 1
    return {"geschlossen": geschlossen, "offen": offen, "schon_da": schon_da,
            "fehlende_wirte": fehlende, "ohne_wirtangabe": ohne_angabe}


def wirte_herstellen(pfad) -> dict:
    """Dasselbe fuer eine fertige Datei auf der Platte: oeffnen, schliessen, zurueckschreiben."""
    datei = ifcopenshell.open(str(pfad))
    bericht = wirte_herstellen_in(datei)
    if bericht["geschlossen"]:
        datei.write(str(pfad))
    return bericht


def vorgaenge_schliessen_in(datei) -> dict:
    """Im Verbund die GELIEFERTEN Quellen jedes Vorgangs in seine Gruppe holen.

    Ein Kanalgraben ist aus Rohren abgeleitet, eine Baugrube aus einem Bauwerk
    — beide liegen in anderen Lieferungen. Die Eigenbau-Datei allein kann sie
    nicht gruppieren; im Verbund liegen sie nebeneinander, und die Gruppe
    „Kanalgraben H-001" enthaelt dann Graben, Verfuellung UND die Haltung.
    Das Gelaende gehoert NICHT hinein: es ist der Wirt, verbunden ueber
    `IfcRelVoidsElement`.

    Wiederholbar: was schon in der Gruppe ist, kommt nicht ein zweites Mal.
    Was nicht im Verbund liegt, steht unter `fehlend` — kein Fehler, der Satz
    enthaelt die Lieferung eben nicht.

    ZWEI ZAHLEN, getrennt: `vorgaenge` sind ALLE Vorgangsgruppen der Datei,
    `mit_quellen` die, die gelieferte Bauteile nennen (ein Gerinne nennt keine).
    Der erste Produktionslauf meldete „2" bei drei Gruppen in der Datei — die
    Zahl stimmte, sagte aber etwas anderes, als ihr Name versprach.

    @returns {"vorgaenge": n, "mit_quellen": n, "ergaenzt": n, "fehlend": [GlobalIds]}
    """
    vorgaenge, mit_quellen, ergaenzt, fehlend = 0, 0, 0, set()
    for gruppe in datei.by_type("IfcGroup"):
        if gruppe.ObjectType != "Vorgang":
            continue
        vorgaenge += 1
        roh = _merkmal(gruppe, PSET_VORGANG, "Quellen")
        rel = next(iter(gruppe.IsGroupedBy or ()), None)
        if not roh or rel is None:
            continue
        mit_quellen += 1
        try:
            q = json.loads(roh)
        except ValueError:
            continue
        gesucht = [*(q.get("rohre") or []), *(q.get("schaechte") or []),
                   *([q["bauteil"]] if q.get("bauteil") else [])]
        drin = {o.id() for o in rel.RelatedObjects or ()}
        neu = []
        for guid in gesucht:
            el = _nach_guid(datei, guid)
            if el is None:
                fehlend.add(guid)
            elif el.id() not in drin:
                neu.append(el)
                drin.add(el.id())
        if neu:
            rel.RelatedObjects = list(rel.RelatedObjects) + neu
            ergaenzt += len(neu)
    return {"vorgaenge": vorgaenge, "mit_quellen": mit_quellen, "ergaenzt": ergaenzt, "fehlend": sorted(fehlend)}


def _main(argv=None):
    p = argparse.ArgumentParser(description="CDE-Eigenbau als IFC4X3_ADD2-Quelle schreiben")
    p.add_argument("paket")
    p.add_argument("ziel")
    p.add_argument("--schluessel", default="cde")
    a = p.parse_args(argv)
    try:
        paket = json.loads(Path(a.paket).read_text(encoding="utf-8"))
        bericht = baue_datei(paket, a.ziel, schluessel=a.schluessel)
    except PaketFehler as fehler:
        print(f"Paket taugt nicht: {fehler}", file=sys.stderr)
        return 2
    print(json.dumps(bericht, indent=1, ensure_ascii=False))
    return 0 if bericht["bauteile"] else 1


if __name__ == "__main__":
    sys.exit(_main())
