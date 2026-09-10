"""Was die CDE SELBST erzeugt hat — als konforme IFC4X3_ADD2-Quelle.

DIE LUECKE, DIE DIESE DATEI SCHLIESST (2026-09-10). Der Verbund
(`verbund.py`) fuehrt gelieferte IFC-Dateien zusammen. Die Bauteile, die die
CDE selbst erzeugt — Aushub- und Auftragskoerper, das geformte DGM, der
Kanalgraben, Rohre und Schaechte —, hatten bis hierher KEINEN IFC-Weg:
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
    Rezept, dem WIRT (siehe unten) und — wo die CDE ein geliefertes Bauteil
    ersetzt — dessen GlobalId.

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
import sys
import time
from pathlib import Path

import ifcopenshell

from . import guids
from .verbund import ZIELSCHEMA, VerbundUnmoeglich, zielgeruest

PSET_CDE = "Quagg_CDE"
PAKET_VERSION = 1

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
        raise PaketFehler(f"Paketversion {paket.get('version')!r}, erwartet {PAKET_VERSION}")
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


def _merkmale(f, besitz, objekt, satzname: str, werte: dict, schluessel: str):
    """Merkmalssatz mit abgeleiteten GlobalIds. Praefix `Quagg_` — `Pset_` ist bSI-reserviert."""
    eigenschaften = [
        f.create_entity("IfcPropertySingleValue", Name=str(k),
                        NominalValue=f.create_entity("IfcText", str(v)))
        for k, v in werte.items() if v not in (None, "", [])
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

        _merkmale(f, besitz, el, PSET_CDE, {
            "CdeId": cde_id,
            "Rezept": b.get("rezept"),
            "Rolle": b.get("rolle"),
            "Ableitung": b.get("ableitung"),
            "Wirt": _ifc_id(b.get("wirt")),
            "ErsetztGlobalId": ", ".join(_ifc_id(x) for x in (b.get("ersetzt") or []) if x),
            "Hinweis": b.get("hinweis"),
        }, schluessel=f"{satz}|{cde_id}")
        produkte.append(el)

    # Wirte im selben Paket: jetzt, wo alle Bauteile stehen (der Wirt kann in
    # der Liste nach seinem Aushub kommen).
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
        # V08 des Prueftors: jedes Bauteil gehoert einer Fachmodell-Gruppe an.
        gruppe = f.create_entity("IfcGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|gruppe"),
                                 OwnerHistory=besitz, Name="CDE-Eigenbau",
                                 Description="In der CDE erzeugte Bauteile", ObjectType="Fachmodell")
        f.create_entity("IfcRelAssignsToGroup",
                        GlobalId=guids.guid_aus_cde_id(f"{satz}|gruppe-rel"), OwnerHistory=besitz,
                        RelatedObjects=produkte, RelatingGroup=gruppe)
        _merkmale(f, besitz, gruppe, "Quagg_Fachmodell", {
            "Datei": "CDE-Eigenbau",
            "Quelle": "CDE-Journal",
            "Bauteile": len(produkte),
            "Erzeugt": paket.get("erzeugt"),
        }, schluessel=f"{satz}|gruppe")
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
        "dauer_s": round(time.time() - begonnen, 2),
    }


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

    @returns {"geschlossen": n, "offen": [GlobalIds], "schon_da": n,
              "fehlende_wirte": [GlobalIds, wie sie im Paket stehen]}
    """
    besitz = (datei.by_type("IfcOwnerHistory") or [None])[0]
    geschlossen, schon_da, offen, fehlende = 0, 0, [], []
    for aushub in datei.by_type("IfcFeatureElementSubtraction"):
        if _hat_wirt(aushub):
            schon_da += 1
            continue
        gesucht = _merkmal(aushub, PSET_CDE, "Wirt")
        wirt = _nach_guid(datei, gesucht)
        if wirt is None or wirt.id() == aushub.id():
            offen.append(aushub.GlobalId)
            if wirt is None and gesucht and gesucht not in fehlende:
                fehlende.append(gesucht)
            continue
        _voids(datei, besitz, wirt, aushub, "verbund")
        geschlossen += 1
    return {"geschlossen": geschlossen, "offen": offen, "schon_da": schon_da,
            "fehlende_wirte": fehlende}


def wirte_herstellen(pfad) -> dict:
    """Dasselbe fuer eine fertige Datei auf der Platte: oeffnen, schliessen, zurueckschreiben."""
    datei = ifcopenshell.open(str(pfad))
    bericht = wirte_herstellen_in(datei)
    if bericht["geschlossen"]:
        datei.write(str(pfad))
    return bericht


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
