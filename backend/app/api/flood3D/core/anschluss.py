"""
anschluss — den Fall nach einer Drehung oder einem Zuschnitt wieder
anschlussfähig machen.

Ein Rechengebiet ist ein achsparalleler Quader; die Zu- und Abläufe leben
auf seinen Flächen. Sobald das Gebiet gedreht oder enger gezogen wird,
stimmen drei mechanische Dinge nicht mehr, die nichts mit Wasserbau zu tun
haben, den Lauf aber blockieren:

* die Randbedingung zeigt auf die falsche Gebietsfläche (das Rohr endet
  inzwischen an einer anderen),
* die Rohrachse endet vor oder weit hinter der Fläche, sodass die Mündung
  nicht mehr angeschnitten wird,
* ein Verfeinerungsquader ragt aus dem Gebiet heraus.

Alle drei lassen sich eindeutig aus der Geometrie herleiten — genau das
macht dieses Modul. Es ändert bewusst NICHTS an der Fachaussage: die
Rohrachse behält ihre Richtung (der Rohrscheitel bleibt, wie er liegt),
sie wird nur bis an die Gebietsfläche verlängert bzw. gekürzt.
"""
from __future__ import annotations

import numpy as np

from .casespec import CaseSpec

_PLANE = {"x_min": 0, "x_max": 2, "y_min": 1, "y_max": 3}
_ACHSE = {"x_min": 0, "x_max": 0, "y_min": 1, "y_max": 1}


def _naechste_flaeche(spec: CaseSpec, punkt) -> str:
    x0, y0, x1, y1 = spec.domain.extent
    return min({"x_min": abs(punkt[0] - x0), "x_max": abs(punkt[0] - x1),
                "y_min": abs(punkt[1] - y0), "y_max": abs(punkt[1] - y1)}.items(),
               key=lambda kv: kv[1])[0]


def _durchstoss(p, richtung, ebene: float, achse: int, ueberstand: float):
    """
    Punkt auf der Achse, der die Ebene um `ueberstand` überragt. None, wenn
    die Achse (nahezu) parallel zur Fläche läuft — dann ist die Verlängerung
    keine Frage der Länge, sondern der Ausrichtung.
    """
    d = richtung[achse]
    if abs(d) < 1e-9:
        return None
    t = (ebene - p[achse]) / d
    ziel = np.asarray(p, dtype=float) + t * richtung
    # ein Stück weiter in Achsrichtung: eine Fläche, die exakt auf der
    # Gebietsebene endet, schneidet snappyHexMesh unsauber an
    return ziel + (ueberstand / abs(d)) * richtung


def stutzen_anschliessen(spec: CaseSpec, cv, face: str,
                         ueberstand: float | None = None) -> str | None:
    """
    Achsende des Durchlasses bis auf die Gebietsfläche `face` führen
    (Richtung bleibt). Gibt eine Beschreibung der Änderung zurück oder None.
    """
    if spec.domain is None or len(cv.axis) < 2:
        return None
    ebene = spec.domain.extent[_PLANE[face]]
    achse = _ACHSE[face]
    if ueberstand is None:
        ueberstand = spec.mesh.base_cell if spec.mesh else 0.25

    # das Ende, das der Fläche näher liegt, wird angeschlossen
    kopf = abs(cv.axis[0][achse] - ebene) <= abs(cv.axis[-1][achse] - ebene)
    p = np.asarray(cv.axis[0] if kopf else cv.axis[-1], dtype=float)
    nachbar = np.asarray(cv.axis[1] if kopf else cv.axis[-2], dtype=float)
    richtung = p - nachbar
    if np.linalg.norm(richtung[:2]) < 1e-9:
        return (f"Stutzen „{cv.id}“: das Achsende steht senkrecht — die "
                "Richtung lässt sich nicht fortsetzen")
    ziel = _durchstoss(p, richtung, ebene, achse, ueberstand)
    if ziel is None:
        return (f"Stutzen „{cv.id}“ läuft parallel zur Fläche {face} — "
                "bitte die Achse ausrichten oder eine andere Fläche wählen")
    alt = p[achse]
    neu = tuple(round(float(v), 4) for v in ziel)
    if kopf:
        cv.axis[0] = neu
    else:
        cv.axis[-1] = neu
    weg = abs(ziel[achse] - alt)
    return (f"Stutzen „{cv.id}“: Achsende um {weg:.2f} m in seiner eigenen "
            f"Richtung verschoben — es steht jetzt {ueberstand:g} m über die "
            f"Fläche {face} hinaus (Rohrlage und -neigung unverändert)")


def gerinne_anschliessen(spec: CaseSpec, ch, face: str,
                         ueberstand: float | None = None) -> str | None:
    """
    Gerinneachse bis auf die Gebietsfläche `face` führen — dasselbe wie
    `stutzen_anschliessen`, nur für die 2D-Polylinie einer
    channel_carve-Operation.

    Das Sohlgefälle bleibt: die Sohlhöhe am verlängerten Ende wird mit dem
    vorhandenen Gefälle fortgeschrieben. Damit ändert sich die Fachaussage
    nicht, das Gerinne reicht nur bis an die Kante.
    """
    if spec.domain is None or len(ch.polyline) < 2:
        return None
    ebene = spec.domain.extent[_PLANE[face]]
    achse = _ACHSE[face]
    if ueberstand is None:
        ueberstand = spec.mesh.base_cell if spec.mesh else 0.25

    kopf = abs(ch.polyline[0][achse] - ebene) <= abs(ch.polyline[-1][achse] - ebene)
    p = np.asarray(ch.polyline[0] if kopf else ch.polyline[-1], dtype=float)
    nachbar = np.asarray(ch.polyline[1] if kopf else ch.polyline[-2], dtype=float)
    richtung = p - nachbar
    if np.linalg.norm(richtung) < 1e-9:
        return (f"Gerinne „{ch.id}“: die letzten beiden Stützpunkte liegen "
                "aufeinander — die Richtung lässt sich nicht fortsetzen")
    ziel = _durchstoss(p, richtung, ebene, achse, ueberstand)
    if ziel is None:
        return (f"Gerinne „{ch.id}“ läuft parallel zur Fläche {face} — bitte "
                "die Achse ausrichten oder eine andere Fläche wählen")

    # Sohlgefälle über die vorhandene Länge, um das verlängerte Ende
    # fortzuschreiben
    pts = np.asarray(ch.polyline, dtype=float)
    laenge = float(np.sum(np.linalg.norm(np.diff(pts, axis=0), axis=1)))
    zuwachs = float(np.linalg.norm(ziel[:2] - p))
    gefaelle = ((ch.invert_end - ch.invert_start) / laenge
                if laenge > 1e-9 else 0.0)
    neu = (round(float(ziel[0]), 4), round(float(ziel[1]), 4))
    if kopf:
        ch.polyline[0] = neu
        ch.invert_start = round(ch.invert_start - gefaelle * zuwachs, 4)
        sohle = ch.invert_start
    else:
        ch.polyline[-1] = neu
        ch.invert_end = round(ch.invert_end + gefaelle * zuwachs, 4)
        sohle = ch.invert_end
    return (f"Gerinne „{ch.id}“: Achsende um {zuwachs:.2f} m in seiner "
            f"eigenen Richtung verlängert — es steht jetzt {ueberstand:g} m "
            f"über die Fläche {face} hinaus, Sohle dort {sohle:g} m "
            "(Gefälle unverändert)")


def boxen_ins_gebiet(spec: CaseSpec) -> list[str]:
    """Verfeinerungsquader auf das Modellgebiet beschneiden."""
    meldungen: list[str] = []
    if spec.domain is None or spec.mesh is None:
        return meldungen
    x0, y0, x1, y1 = spec.domain.extent
    for ref in spec.mesh.refinements:
        if ref.type != "box":
            continue
        bx0, by0, bz0, bx1, by1, bz1 = ref.extent
        nx0, ny0 = max(bx0, x0), max(by0, y0)
        nx1, ny1 = min(bx1, x1), min(by1, y1)
        nz0 = max(bz0, spec.domain.z_min)
        nz1 = min(bz1, spec.domain.z_max)
        if (nx0, ny0, nz0, nx1, ny1, nz1) == tuple(ref.extent):
            continue
        if nx1 - nx0 < 1e-6 or ny1 - ny0 < 1e-6 or nz1 - nz0 < 1e-6:
            meldungen.append(f"Verfeinerungsquader „{ref.id}“ liegt komplett "
                             "außerhalb des Gebiets — bitte löschen oder "
                             "neu setzen")
            continue
        ref.extent = (round(nx0, 3), round(ny0, 3), round(nz0, 3),
                      round(nx1, 3), round(ny1, 3), round(nz1, 3))
        meldungen.append(f"Verfeinerungsquader „{ref.id}“ auf das Gebiet "
                         "beschnitten")
    return meldungen


def _mund_toleranz(spec: CaseSpec) -> float:
    """
    Erlaubter Überstand einer Rohr-/Grabenachse über den Gebietsrand: der
    Mündungs-Überstand ist GEWOLLT (`stutzen_anschliessen` legt Enden
    bewusst hinter die Fläche, `bohrkoerper` verlängert um bis zu
    max(4·Zelle, 1 m)). Erst was darüber hinausragt, ist ein Befund.
    """
    zelle = spec.mesh.base_cell if spec.mesh else 0.25
    return max(4 * zelle, 1.0) + zelle


def _gebiet_box(spec: CaseSpec, rand: float = 0.0):
    from shapely.geometry import box
    x0, y0, x1, y1 = spec.domain.extent
    return box(x0 - rand, y0 - rand, x1 + rand, y1 + rand)


def _anteil_linie(pts, gebiet) -> float:
    """Längenanteil einer Polylinie AUSSERHALB des Gebiets (0 … 1)."""
    from shapely.geometry import LineString, Point
    from shapely.ops import unary_union
    xy = [(float(p[0]), float(p[1])) for p in pts]
    if len(xy) < 2:
        return 0.0 if (xy and gebiet.covers(Point(xy[0]))) else 1.0
    linie = LineString(xy)
    if linie.length < 1e-9:
        return 0.0 if gebiet.covers(Point(xy[0])) else 1.0
    # Doppelt durchlaufene Strecken herausrechnen (eine senkrechte
    # Rechen-Ebene ist in der Draufsicht eine Hin-und-zurück-Linie; der
    # Verschnitt dedupliziert, die Rohlänge nicht — das Verhältnis löge)
    linie = unary_union(linie)
    if linie.length < 1e-9:
        return 0.0 if gebiet.covers(Point(xy[0])) else 1.0
    return 1.0 - linie.intersection(gebiet).length / linie.length


def _anteil_flaeche(pts, gebiet) -> float:
    """Flächenanteil eines Polygons AUSSERHALB des Gebiets (0 … 1)."""
    from shapely.geometry import Polygon
    xy = [(float(p[0]), float(p[1])) for p in pts]
    if len(xy) < 3:
        return _anteil_linie(pts, gebiet)
    poly = Polygon(xy)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.area < 1e-9:
        return _anteil_linie(pts, gebiet)
    return 1.0 - poly.intersection(gebiet).area / poly.area


def _linie_kappen(pts, gebiet):
    """
    Polylinie am Gebietsrand kappen; z an den Schnittpunkten linear entlang
    der Linie interpoliert. None, wenn nichts Brauchbares übrig bleibt.
    Bei mehreren Teilstücken bleibt das längste — die Linie behält damit
    ihre Fachaussage, sie reicht nur noch bis an die Kante.
    """
    from shapely.geometry import LineString, Point
    xy = [(float(p[0]), float(p[1])) for p in pts]
    if len(xy) < 2:
        return None
    linie = LineString(xy)
    schnitt = linie.intersection(gebiet)
    if schnitt.is_empty:
        return None
    if schnitt.geom_type == "MultiLineString":
        schnitt = max(schnitt.geoms, key=lambda g: g.length)
    if schnitt.geom_type != "LineString" or schnitt.length < 1e-9:
        return None
    stationen = np.concatenate(
        [[0.0], np.cumsum(np.linalg.norm(
            np.diff(np.asarray(xy, dtype=float), axis=0), axis=1))])
    z = np.asarray([float(p[2]) for p in pts])
    neu = []
    for x, y in schnitt.coords:
        s = linie.project(Point(x, y))
        neu.append((round(float(x), 4), round(float(y), 4),
                    round(float(np.interp(s, stationen, z)), 4)))
    return neu if len(neu) >= 2 else None


def _flaeche_kappen(pts, gebiet):
    """Polygon mit dem Gebiet verschneiden; None, wenn nichts übrig bleibt."""
    from shapely.geometry import Polygon
    xy = [(float(p[0]), float(p[1])) for p in pts]
    if len(xy) < 3:
        return None
    poly = Polygon(xy)
    if not poly.is_valid:
        poly = poly.buffer(0)
    schnitt = poly.intersection(gebiet)
    if schnitt.is_empty:
        return None
    if schnitt.geom_type == "MultiPolygon":
        schnitt = max(schnitt.geoms, key=lambda g: g.area)
    if schnitt.geom_type != "Polygon" or schnitt.area < 1e-9:
        return None
    coords = list(schnitt.exterior.coords)[:-1]
    if len(coords) < 3:
        return None
    return [(round(float(x), 4), round(float(y), 4)) for x, y in coords]


def gebietslage(spec: CaseSpec) -> list[dict]:
    """
    Welche Objekte über das Modellgebiet hinausragen — die EINE Messung, mit
    der sowohl die Prüfregel als auch die Kur `ins_gebiet` arbeiten (beide
    müssen dieselbe Größe messen, sonst meldet die Kur Erfolg und der
    Befund steht weiter).

    Je Eintrag: `id`, `art` (Klartext), `anteil` (Anteil außerhalb, 0 … 1),
    `voll` (liegt vollständig draußen), `klippbar` (die Kur kann es
    mechanisch ans Gebiet kappen, ohne eine fachliche Festlegung zu
    berühren). Rohr- und Grabenachsen dürfen um den Mündungs-Überstand
    hinausstehen; gemessen wird gegen das entsprechend vergrößerte Gebiet.
    """
    lagen: list[dict] = []
    if spec.domain is None:
        return lagen
    gebiet = _gebiet_box(spec)
    gebiet_mund = _gebiet_box(spec, _mund_toleranz(spec))

    def merken(obj_id, art, anteil, klippbar_wenn_teil):
        if anteil <= 1e-6:
            return
        voll = anteil >= 1.0 - 1e-6
        lagen.append({"id": obj_id, "art": art,
                      "anteil": round(float(anteil), 4), "voll": voll,
                      "klippbar": klippbar_wenn_teil and not voll})

    for s in spec.structures:
        if s.type == "wall":
            merken(s.id, "Wand",
                   _anteil_linie(s.alignment.points, gebiet), True)
        elif s.type == "weir":
            merken(s.id, "Wehr",
                   _anteil_linie(s.crest_polyline, gebiet), True)
        elif s.type in ("culvert", "graben"):
            art = "Durchlass" if s.type == "culvert" else "Graben"
            merken(s.id, art, _anteil_linie(s.axis, gebiet_mund), True)
        elif s.type == "screen":
            merken(s.id, "Rechen",
                   _anteil_flaeche(s.plane_polygon, gebiet), False)
        elif s.type in ("basin", "kammer"):
            art = "Becken" if s.type == "basin" else "Kammer"
            merken(s.id, art, _anteil_flaeche(s.footprint, gebiet), True)
        elif s.type == "pier":
            if s.shape == "polygon":
                merken(s.id, "Pfeiler",
                       _anteil_flaeche(s.footprint, gebiet), False)
            elif s.center is not None:
                from shapely.geometry import Point
                r = max(s.width or 0.0, s.length or 0.0) / 2 or 0.1
                kreis = Point(s.center).buffer(r, resolution=8)
                merken(s.id, "Pfeiler",
                       1.0 - kreis.intersection(gebiet).area / kreis.area,
                       False)
        elif s.type == "schacht":
            from shapely.geometry import Point
            r = max(s.width, s.length or 0.0) / 2 or 0.1
            kreis = Point(s.center).buffer(r, resolution=8)
            merken(s.id, "Schacht",
                   1.0 - kreis.intersection(gebiet).area / kreis.area, False)
        # imported: die Lage steckt im STL — sie wird beim Fallaufbau am
        # gebauten Körper gemessen (build_case), nicht hier am Spec.

    for v in (spec.solver.vorfuellungen if spec.solver else []):
        merken(v.id, "Vorfüllung", _anteil_flaeche(v.polygon, gebiet), True)
    return lagen


def ins_gebiet(spec: CaseSpec) -> list[str]:
    """
    Kur zu `gebietslage`: alles Klippbare am Gebietsrand kappen (Polylinien
    mit z-Interpolation, Grundrisse per Verschnitt). Was vollständig draußen
    liegt oder sich nicht mechanisch kappen lässt (Rechen-Ebene, Pfeiler,
    Schacht), wird nur GEMELDET — ob so ein Objekt gelöscht oder verschoben
    wird, ist eine fachliche Entscheidung.
    """
    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen
    gebiet = _gebiet_box(spec)
    gebiet_mund = _gebiet_box(spec, _mund_toleranz(spec))
    lagen = {l["id"]: l for l in gebietslage(spec)}
    if not lagen:
        return meldungen

    def kappen_linie(obj_id, art, pts, box_):
        neu = _linie_kappen(pts, box_)
        if neu is None:
            meldungen.append(f"{art} „{obj_id}“ liegt außerhalb des Gebiets "
                             "— bitte löschen oder verschieben")
            return None
        meldungen.append(f"{art} „{obj_id}“ am Gebietsrand gekappt "
                         f"({len(pts)} → {len(neu)} Stützpunkte)")
        return neu

    def kappen_flaeche(obj_id, art, pts):
        neu = _flaeche_kappen(pts, gebiet)
        if neu is None:
            meldungen.append(f"{art} „{obj_id}“ liegt außerhalb des Gebiets "
                             "— bitte löschen oder verschieben")
            return None
        meldungen.append(f"{art} „{obj_id}“ auf das Gebiet beschnitten")
        return neu

    for s in spec.structures:
        lage = lagen.get(s.id)
        if lage is None:
            continue
        if not lage["klippbar"]:
            meldungen.append(
                f"{lage['art']} „{s.id}“ ragt aus dem Gebiet heraus "
                f"({lage['anteil']:.0%} außerhalb) — kappen würde die Form "
                "verändern, bitte verschieben oder löschen")
            continue
        if s.type == "wall":
            neu = kappen_linie(s.id, lage["art"], s.alignment.points, gebiet)
            if neu is not None:
                s.alignment.points = neu
        elif s.type == "weir":
            neu = kappen_linie(s.id, lage["art"], s.crest_polyline, gebiet)
            if neu is not None:
                s.crest_polyline = neu
        elif s.type in ("culvert", "graben"):
            neu = kappen_linie(s.id, lage["art"], s.axis, gebiet_mund)
            if neu is not None:
                s.axis = neu
        elif s.type in ("basin", "kammer"):
            neu = kappen_flaeche(s.id, lage["art"], s.footprint)
            if neu is not None:
                s.footprint = neu

    for v in (spec.solver.vorfuellungen if spec.solver else []):
        lage = lagen.get(v.id)
        if lage is None:
            continue
        if not lage["klippbar"]:
            meldungen.append(
                f"Vorfüllung „{v.id}“ liegt vollständig außerhalb des "
                "Gebiets — bitte löschen oder verschieben")
            continue
        neu = kappen_flaeche(v.id, "Vorfüllung", v.polygon)
        if neu is not None:
            v.polygon = neu
    return meldungen


def gebiet_umschliesst_fenster(spec: CaseSpec) -> list[str]:
    """
    Gebietshöhe so weit aufziehen, dass jede Öffnung hineinpasst. Eine
    Rohrmündung, die unter der Gebietssohle liegt, kann der Vernetzer nicht
    anschneiden — das Loch fehlt dann einfach, und der Lauf endet mit
    „No matching patches".
    """
    from .casebuilder import resolve_window

    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen
    rand = 0.5 * (spec.mesh.base_cell if spec.mesh else 0.25)
    for b in spec.boundaries:
        if getattr(b, "window", None) is None:
            continue
        try:
            r = resolve_window(spec, b)
        except Exception:
            continue
        if r is None or r.get("zlo") is None:
            continue
        if r["zlo"] < spec.domain.z_min:
            alt = spec.domain.z_min
            spec.domain.z_min = round(r["zlo"] - rand, 3)
            meldungen.append(
                f"Gebietssohle von {alt:g} auf {spec.domain.z_min:g} m "
                f"abgesenkt — die Öffnung „{b.id}“ lag darunter")
        if r.get("zhi") is not None and r["zhi"] > spec.domain.z_max:
            alt = spec.domain.z_max
            spec.domain.z_max = round(r["zhi"] + rand, 3)
            meldungen.append(
                f"Gebietsdeckel von {alt:g} auf {spec.domain.z_max:g} m "
                f"angehoben — die Öffnung „{b.id}“ ragte darüber")
    return meldungen


def kopplung_ableiten(spec: CaseSpec) -> list[str]:
    """
    Welches Bauwerk an welchem Rand liegt, ist messbar — bisher wurde es nur
    GEPRÜFT. `resolve_window` verwirft eine Kopplung, deren Achsende weiter
    als zwei Basiszellen von der Fläche entfernt liegt; dieselbe Messung
    andersherum gelesen sagt, welches Bauwerk an diesen Rand gehört.

    Gesetzt wird nur, was eindeutig ist:

    * nur an einem Fenster, das ohne `follow` gar nicht auflösbar wäre (kein
      span, kein center) — ein bewusst gesetztes Rechteck bleibt unangetastet,
    * nur ein Bauwerk in Reichweite; kommen mehrere in Frage, wird das
      gemeldet und nichts geändert. Welcher von zwei Stutzen der Zulauf ist,
      ist eine fachliche Entscheidung.

    Trägt der Stutzen aus dem Import eine Rolle („Einlauf"/„Auslauf" stand
    am Zeichnungslayer), entscheidet sie mit: ein Ablaufrohr wird kein
    Zulauf, auch wenn es geometrisch passen würde.
    """
    from .casebuilder import _bc_face, _culvert_end, _follow_end

    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen

    grenze = 2 * (spec.mesh.base_cell if spec.mesh else 1.0)
    schon = {w.follow for b in spec.boundaries
             if (w := getattr(b, "window", None)) is not None and w.follow}
    stutzen = [s for s in spec.structures if s.type == "culvert"]
    gerinne = [op for op in (spec.terrain.operations if spec.terrain else [])
               if op.type == "channel_carve"]

    for b in spec.boundaries:
        w = getattr(b, "window", None)
        if w is None or w.follow or w.span is not None or w.center is not None:
            continue
        art = ("zulauf" if b.type.startswith("inflow")
               else "ablauf" if b.type.startswith("outflow") else None)
        if art is None:
            continue
        face = _bc_face(spec, b)
        flaechen = ([face] if face and face != "z_max"
                    else ["x_min", "x_max", "y_min", "y_max"])

        treffer: list[tuple[float, str, str]] = []
        for cv in stutzen:
            if cv.id in schon or (cv.rolle is not None and cv.rolle != art):
                continue
            d = min(_culvert_end(spec, fl, cv)[0] for fl in flaechen)
            if d <= grenze:
                treffer.append((d, cv.id, "Stutzen"))
        for ch in gerinne:
            if ch.id in schon:
                continue
            d = min(_follow_end(spec, fl, ch)[0] for fl in flaechen)
            if d <= grenze:
                treffer.append((d, ch.id, "Gerinne"))

        if not treffer:
            continue
        if len(treffer) > 1:
            namen = ", ".join(f"„{i}“" for _, i, _ in sorted(treffer))
            meldungen.append(
                f"Rand „{b.id}“: {namen} enden alle am Gebietsrand — welches "
                "davon der "
                f"{'Zulauf' if art == 'zulauf' else 'Ablauf'} ist, muss von "
                "Hand entschieden werden")
            continue
        d, kennung, was = treffer[0]
        w.follow = kennung
        schon.add(kennung)
        meldungen.append(
            f"Rand „{b.id}“ an {was} „{kennung}“ gekoppelt — dessen Ende "
            f"liegt {d:.2f} m von der Gebietsfläche entfernt (Grenze "
            f"{grenze:.2f} m). Das Fenster war ohne Bezug nicht auflösbar.")
    return meldungen


def anschluesse_herstellen(spec: CaseSpec) -> list[str]:
    """
    Alle mechanischen Anschlüsse in Ordnung bringen. Rückgabe: was geändert
    wurde (leere Liste = es war schon alles stimmig).
    """
    from .casebuilder import _follow_channel, _follow_culvert

    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen

    # Erst die Kopplung bestimmen, dann ihre mechanischen Folgen — sonst
    # bliebe ein frisch gekoppelter Rand bis zum nächsten Klick unverbunden
    meldungen.extend(kopplung_ableiten(spec))

    for b in spec.boundaries:
        w = getattr(b, "window", None)
        if w is None or w.follow is None:
            continue
        cv = _follow_culvert(spec, w)
        ch = _follow_channel(spec, w)
        if cv is not None:
            enden = [cv.axis[0], cv.axis[-1]]
        elif ch is not None:
            enden = [ch.polyline[0], ch.polyline[-1]]
        else:
            continue
        # die Fläche ergibt sich aus der Geometrie, nicht umgekehrt: das
        # Ende, das dem Gebietsrand am nächsten liegt, bestimmt sie
        kandidaten = [(_naechste_flaeche(spec, e), e) for e in enden]
        face, ende = min(kandidaten, key=lambda ke: abs(
            ke[1][_ACHSE[ke[0]]] - spec.domain.extent[_PLANE[ke[0]]]))
        belegt = {x.face: x.id for x in spec.boundaries
                  if x.id != b.id and x.face is not None}
        if face in belegt and b.face != face:
            # zwei Randbedingungen auf einer Quaderfläche kann blockMesh
            # nicht — das ist eine fachliche Entscheidung, keine mechanische
            meldungen.append(
                f"Rand „{b.id}“ endet an der Fläche {face}, dort liegt aber "
                f"schon „{belegt[face]}“ — eine der beiden muss auf eine "
                "andere Fläche, oder das Gebiet ist anders zu schneiden")
            continue
        if b.face != face:
            meldungen.append(f"Rand „{b.id}“ auf die Fläche {face} gelegt "
                             f"(war {b.face}) — dort endet „{w.follow}“")
            b.face = face
        zelle = spec.mesh.base_cell if spec.mesh else 0.25
        # Soll: das Achsende steht eine Basiszelle ÜBER die Fläche
        # hinaus. Nur wenn es davon merklich abweicht, wird angefasst —
        # sonst meldete jede Reparatur eine Verschiebung um 0,00 m.
        aussen = 1.0 if face.endswith("max") else -1.0
        ueber = aussen * (ende[_ACHSE[face]]
                          - spec.domain.extent[_PLANE[face]])
        if abs(ueber - zelle) > 0.5 * zelle:
            m = (stutzen_anschliessen(spec, cv, face) if cv is not None
                 else gerinne_anschliessen(spec, ch, face))
            if m:
                meldungen.append(m)

    meldungen.extend(gebiet_umschliesst_fenster(spec))
    meldungen.extend(boxen_ins_gebiet(spec))
    return meldungen
