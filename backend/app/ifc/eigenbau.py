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
from .verbund import ZIELSCHEMA, VerbundUnmoeglich, zielgeruest

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
MENGEN_METHODE = ("Quagg CDE: Differenz der Gelaenderaster vor und nach dem Vorgang "
                  "(Mittel der vier Knoten je Zelle); der Koerper ist die Gegenprobe")
# Vorlagentyp -> (Mengenklasse, Wertattribut)
_MENGENTYP = {"Q_VOLUME": ("IfcQuantityVolume", "VolumeValue"), "Q_LENGTH": ("IfcQuantityLength", "LengthValue"),
              "Q_AREA": ("IfcQuantityArea", "AreaValue"), "Q_WEIGHT": ("IfcQuantityWeight", "WeightValue"),
              "Q_COUNT": ("IfcQuantityCount", "CountValue")}
_VORLAGEN = None

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


def _klasse(schema, name):
    """Kategorie aus dem Journal ('IFCEARTHWORKSCUT') -> Schemadeklaration, oder None.

    Die Nachschlagung ist unabhaengig von Gross-/Kleinschreibung (gemessen).
    Eine Klasse, die das Schema nicht kennt, die abstrakt ist oder die kein
    Bauteil ist, wird nicht geschrieben — der Aufrufer meldet sie.
    """
    try:
        decl = schema.declaration_by_name(str(name))
    except Exception:                               # noqa: BLE001 — unbekannt heisst: nicht schreiben
        return None
    if decl.is_abstract():
        return None
    t = decl
    while t is not None:
        if t.name() == "IfcProduct":
            return decl
        t = t.supertype()
    return None


def _predefined(decl, wert):
    """PredefinedType gegen die Aufzaehlung der Klasse pruefen.

    Rueckgabe (wert, warnung). Ein Wert, den das Schema nicht kennt, wird
    NOTDEFINED — nie USERDEFINED: das verlangte ObjectType, und das haetten wir
    erfinden muessen.
    """
    attr = {a.name(): a for a in decl.all_attributes()}.get("PredefinedType")
    if attr is None:
        return None, None
    t = attr.type_of_attribute()
    while hasattr(t, "declared_type"):
        t = t.declared_type()
    erlaubt = list(t.enumeration_items()) if hasattr(t, "enumeration_items") else []
    if wert is None or wert == "":
        return "NOTDEFINED", None
    w = str(wert).upper()
    if w in erlaubt and w != "USERDEFINED":
        return w, None
    return "NOTDEFINED", f"PredefinedType {wert!r} ist fuer {decl.name()} nicht erlaubt — NOTDEFINED geschrieben"


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
    """Merkmalssatz mit abgeleiteten GlobalIds. Praefix `Quagg_` — `Pset_` ist bSI-reserviert."""
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
        if satz.Name != "Quagg_Herkunft":
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

    Aus ifcopenshells Vorlagen, NICHT aus einer eigenen Liste: welche Mengen
    es gibt und welchen Typ sie haben, entscheidet die Norm. Eine eigene
    Aufzaehlung waere irgendwann eine andere (die 4.3-Liste der CDE hat so
    schon IfcCivilElement verloren).
    """
    global _VORLAGEN
    if _VORLAGEN is None:
        import ifcopenshell.util.pset
        _VORLAGEN = ifcopenshell.util.pset.get_template(ZIELSCHEMA)
    return _VORLAGEN.get_by_name(f"Qto_{klasse[3:]}BaseQuantities")


def _mengen(f, besitz, el, mengen: dict, schluessel: str, warnungen: list, cde_id: str):
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
    typen = {v.Name: v.TemplateType for v in (vorlage.HasPropertyTemplates or [])}
    werte = []
    for schl, roh in mengen.items():
        name = str(schl)[:1].upper() + str(schl)[1:]
        typ = _MENGENTYP.get(typen.get(name))
        if typ is None:
            warnungen.append(f"{cde_id}: {name} steht nicht in {vorlage.Name} — nicht geschrieben")
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
    qto = f.create_entity("IfcElementQuantity", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|qto"),
                          OwnerHistory=besitz, Name=vorlage.Name, MethodOfMeasurement=MENGEN_METHODE,
                          Quantities=werte)
    f.create_entity("IfcRelDefinesByProperties", GlobalId=guids.guid_aus_cde_id(f"{schluessel}|qto|rel"),
                    OwnerHistory=besitz, RelatedObjects=[el], RelatingPropertyDefinition=qto)
    return qto


def _ifc_id(wert: str | None) -> str | None:
    """Eine Kennung, wie sie im IFC steht: CDE-Kennungen werden abgeleitet, echte bleiben."""
    if not wert:
        return None
    return guids.guid_aus_cde_id(wert) if str(wert).startswith("cde-") else str(wert)


def baue_datei(paket: dict, ziel, *, schluessel: str = "cde", projektname: str | None = None,
               bearbeiter: str = "") -> dict:
    """Das Paket als eigenstaendige IFC4X3_ADD2-Datei schreiben.

    Der Einhaengepunkt fuer den Verbundlauf (`cli.py`, Sitzung quagg-page-de).

    @param schluessel  macht die abgeleiteten GlobalIds je Satz eindeutig
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
                        schluessel=satz, crs_herkunft=herkunft)
    except VerbundUnmoeglich as e:                   # unbekanntes System: nennen, nicht raten
        raise PaketFehler(str(e)) from e
    f, site, besitz, koerper_ctx = g["datei"], g["site"], g["besitz"], g["koerper"]

    schema = ifcopenshell.schema_by_name(ZIELSCHEMA)
    stile = {}
    produkte, uebersprungen, warnungen = [], [], []
    geschrieben = []                                 # (Element, Paketeintrag) — fuer die Gruppen
    mengen_n = 0
    if crs is None:
        warnungen.append("Paket ohne Bezugssystem — die Datei traegt Landeskoordinaten ohne "
                         "Georeferenz; der Verbund entscheidet an den Lieferungen")

    for b in paket["bauteile"]:
        cde_id = b.get("cdeId")
        if not cde_id:
            uebersprungen.append({"grund": "ohne cdeId", "name": b.get("name")})
            continue
        decl = _klasse(schema, b.get("klasse"))
        if decl is None:
            uebersprungen.append({"cdeId": cde_id,
                                  "grund": f"Klasse {b.get('klasse')!r} ist kein IfcProduct in {ZIELSCHEMA}"})
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

        pt, warnung = _predefined(decl, b.get("predefinedType"))
        if warnung:
            warnungen.append(f"{cde_id}: {warnung}")

        ursprung = [float(v) for v in (b.get("ursprung") or [0.0, 0.0, 0.0])]
        platz = f.create_entity(
            "IfcLocalPlacement", PlacementRelTo=site.ObjectPlacement,
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
        el = f.create_entity(decl.name(), **attrs)

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
        }, schluessel=f"{satz}|{cde_id}")
        if _mengen(f, besitz, el, b.get("mengen") or {}, f"{satz}|{cde_id}", warnungen, cde_id):
            mengen_n += 1
        produkte.append(el)
        geschrieben.append((el, b))

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

    if produkte:
        # NICHT in die Raumgliederung: Aushuebe (IfcFeatureElement). Die
        # Where-Rule `IfcFeatureElement.NotContained` verlangt
        # SIZEOF(ContainedInStructure) = 0 — ein Aushub haengt ueber seinen
        # WIRT in der Gliederung, nicht selbst. Das Prueftor hat es beim
        # zweiten Lauf gezeigt, nachdem der Wirt geschlossen war.
        eingeordnet = [p for p in produkte if not p.is_a("IfcFeatureElement")]
        if eingeordnet:
            f.create_entity("IfcRelContainedInSpatialStructure",
                            GlobalId=guids.guid_aus_cde_id(f"{satz}|enthalten"), OwnerHistory=besitz,
                            RelatingStructure=site, RelatedElements=eingeordnet)
        # V08 des Prueftors: jedes Bauteil gehoert einer Fachmodell-Gruppe an —
        # Erdbau und Eigenbau getrennt, damit ein Empfaenger den Aushub findet,
        # ohne Rezeptnamen zu kennen.
        je_fachmodell = {}
        for el, b in geschrieben:
            art = b.get("fachmodell") if b.get("fachmodell") in FACHMODELLE else "cde"
            je_fachmodell.setdefault(art, []).append(el)
        for art, glieder in je_fachmodell.items():
            name, beschreibung, anhang = FACHMODELLE[art]
            gruppe = f.create_entity("IfcGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|{anhang}"),
                                     OwnerHistory=besitz, Name=name, Description=beschreibung,
                                     ObjectType="Fachmodell")
            f.create_entity("IfcRelAssignsToGroup",
                            GlobalId=guids.guid_aus_cde_id(f"{satz}|{anhang}-rel"), OwnerHistory=besitz,
                            RelatedObjects=glieder, RelatingGroup=gruppe)
            _merkmale(f, besitz, gruppe, "Quagg_Fachmodell", {
                "Datei": name,
                "Quelle": "CDE-Journal",
                "Bauteile": len(glieder),
                "Erzeugt": paket.get("erzeugt"),
                "Journalstand": (paket.get("journal") or {}).get("commit"),
            }, schluessel=f"{satz}|{anhang}")
            fachmodelle[name] = len(glieder)
        vorgaenge = _vorgaenge_gruppieren(f, besitz, geschrieben, satz)
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
        "vorgaenge": vorgaenge,
        "fachmodelle": fachmodelle,
        "dauer_s": round(time.time() - begonnen, 2),
    }


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

    @returns {"vorgaenge": n, "ergaenzt": n, "fehlend": [GlobalIds]}
    """
    vorgaenge, ergaenzt, fehlend = 0, 0, set()
    for gruppe in datei.by_type("IfcGroup"):
        if gruppe.ObjectType != "Vorgang":
            continue
        roh = _merkmal(gruppe, PSET_VORGANG, "Quellen")
        rel = next(iter(gruppe.IsGroupedBy or ()), None)
        if not roh or rel is None:
            continue
        vorgaenge += 1
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
    return {"vorgaenge": vorgaenge, "ergaenzt": ergaenzt, "fehlend": sorted(fehlend)}


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
