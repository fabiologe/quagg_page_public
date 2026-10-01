"""Eine Signatur einer IFC-Datei: Struktur und Inhalt, ohne Zeitstempel (Teil XXVI, Z0).

Wozu: `backend/app/ifc/*` wirkt SOFORT. Jede Stufe von Teil XXVI, die den
Schreiber anfasst, muss beweisen, dass ein Paket OHNE die neuen Schluessel
dieselbe Datei ergibt wie vorher. „Tests gruen" beweist das nicht — die
vorhandenen Tests zaehlen einzelne Dinge. Die Signatur fasst ALLES, was ein
Empfaenger sieht:

  typen        jede Entitaetsklasse mit ihrer Anzahl
  roots        jede IfcRoot-Instanz als (Klasse, GlobalId)
  beziehungen  jede Beziehung: Klasse, GlobalId und wohin sie zeigt (per
               GlobalId, sonst per Klasse) — so faellt eine Umhaengung auf
  objekte      jedes IfcObject mit Name, ObjectType, PredefinedType, LongName
               und — fuer Produkte — einem Fingerabdruck der Geometrie:
               Platzierung (mm), Zahl der Punkte und Dreiecke, Huelle (mm)
  merkmale     jedes Merkmal und jede Menge als (Traeger, Satz, Name, Wert)

Gegenprobe beim Anlegen (2026-10-01): die erste Fassung ohne `objekte` blieb
GRUEN, als der Schreiber im Speicher jeden PredefinedType verlor. Eine
Signatur, die das nicht sieht, ist keine.

Ausgenommen sind nur Werte, die sich OHNE Verhaltensaenderung aendern:
Zeitstempel (stehen nicht in den Merkmalen, sondern im Kopf und in
IfcOwnerHistory — beide nicht erfasst) und das Merkmal `Werkzeug`
(`herkunft.werkzeug()` = Name + FASSUNG + ifcopenshell-Version: ein
Versionsschild, das beim Heben der Fassung fuer jedes alte Paket wechselt).
"""
import collections

# Merkmale, deren Wert ein Versionsschild ist, kein Inhalt.
VERSIONSSCHILDER = frozenset({"Werkzeug"})


def _wert(v):
    if hasattr(v, "wrappedValue"):
        v = v.wrappedValue
    if isinstance(v, float):
        return round(v, 9)
    if isinstance(v, (int, str, bool)) or v is None:
        return v
    return type(v).__name__


def _ziel(x):
    return getattr(x, "GlobalId", None) or x.is_a()


def _messwert(p):
    wert = getattr(p, "NominalValue", None)
    if wert is not None:
        return wert
    for a in ("LengthValue", "AreaValue", "VolumeValue", "CountValue", "WeightValue", "TimeValue"):
        if hasattr(p, a):
            return getattr(p, a)
    return None


def _mm(x):
    return round(float(x), 3)


def _fingerabdruck(produkt):
    """Platzierung, Punkt- und Dreieckszahl, Huelle — in Millimetern."""
    lage = None
    platz = getattr(produkt, "ObjectPlacement", None)
    rel = getattr(platz, "RelativePlacement", None) if platz else None
    if rel is not None and getattr(rel, "Location", None) is not None:
        lage = [_mm(c) for c in rel.Location.Coordinates]
    punkte, dreiecke, alle = 0, 0, []
    form = getattr(produkt, "Representation", None)
    for darst in (form.Representations if form else []):
        for item in darst.Items:
            if item.is_a("IfcTriangulatedFaceSet"):
                koords = item.Coordinates.CoordList
                punkte += len(koords)
                dreiecke += len(item.CoordIndex)
                alle.extend(koords)
            elif item.is_a("IfcIndexedPolyCurve") and item.Points is not None:
                koords = item.Points.CoordList
                punkte += len(koords)
                alle.extend(koords)
    huelle = None
    if alle:
        dim = len(alle[0])
        huelle = [[_mm(min(k[i] for k in alle)) for i in range(dim)],
                  [_mm(max(k[i] for k in alle)) for i in range(dim)]]
    return {"lage": lage, "punkte": punkte, "dreiecke": dreiecke, "huelle": huelle}


def signatur(datei) -> dict:
    typen = collections.Counter(e.is_a() for e in datei)
    roots = sorted([e.is_a(), e.GlobalId] for e in datei.by_type("IfcRoot"))
    beziehungen = []
    for r in datei.by_type("IfcRelationship"):
        teile = []
        for k, v in sorted(r.get_info(recursive=False).items()):
            if k in ("id", "type", "GlobalId", "OwnerHistory", "Name", "Description"):
                continue
            if isinstance(v, (list, tuple)):
                teile.append([k, sorted(_ziel(x) for x in v if hasattr(x, "is_a"))])
            elif hasattr(v, "is_a"):
                teile.append([k, _ziel(v)])
        beziehungen.append([r.is_a(), r.GlobalId, teile])
    objekte = []
    for o in datei.by_type("IfcObject"):
        info = {k: _wert(getattr(o, k, None)) for k in ("Name", "ObjectType", "PredefinedType", "LongName")
                if hasattr(o, k) and getattr(o, k, None) is not None}
        if o.is_a("IfcProduct"):
            info["geometrie"] = _fingerabdruck(o)
        objekte.append([o.is_a(), o.GlobalId, info])
    merkmale = []
    for r in datei.by_type("IfcRelDefinesByProperties"):
        satz = r.RelatingPropertyDefinition
        for traeger in r.RelatedObjects:
            for p in (getattr(satz, "HasProperties", None) or getattr(satz, "Quantities", None) or []):
                if p.Name in VERSIONSSCHILDER:
                    continue
                merkmale.append([traeger.GlobalId, satz.Name, p.Name, _wert(_messwert(p))])
    return {
        "typen": dict(sorted(typen.items())),
        "roots": roots,
        "beziehungen": sorted(beziehungen, key=lambda b: b[1]),
        "objekte": sorted(objekte, key=lambda o: o[1]),
        "merkmale": sorted(merkmale, key=lambda m: tuple(str(x) for x in m)),
    }


def unterschiede(ist: dict, soll: dict, grenze: int = 8) -> list:
    """Was abweicht — lesbar genug, um einen roten Test zu verstehen."""
    aus = []
    for teil in ("typen", "roots", "beziehungen", "objekte", "merkmale"):
        a, b = ist.get(teil), soll.get(teil)
        if a == b:
            continue
        if isinstance(a, dict):
            for k in sorted(set(a) | set(b)):
                if a.get(k) != b.get(k):
                    aus.append(f"{teil}: {k} {b.get(k)} -> {a.get(k)}")
        else:
            neu = [x for x in a if x not in b]
            weg = [x for x in b if x not in a]
            aus += [f"{teil} neu: {x}" for x in neu[:grenze]] + [f"{teil} weg: {x}" for x in weg[:grenze]]
    return aus[: grenze * 4]
