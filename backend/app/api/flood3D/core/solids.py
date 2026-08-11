"""
solids — parametrische Bauwerkserzeugung (Spez. Kap. 5.2 und 6.3).

Jeder Katalogtyp erzeugt einen wasserdichten Volumenkörper (trimesh), der als
STL unter dem Patchnamen in den OpenFOAM-Fall geht. Der Rechen erzeugt
bewusst KEINEN Körper — die Stäbe werden nicht aufgelöst, seine Wirkung ist
eine poröse Zone (topoSet + fvOptions im casebuilder, Spez. 6.3).

Konstruktionsprinzipien:
    Wand      Grundriss = gepufferte Polylinie (shapely, Gehrungsstoß),
              Extrusion von Unterkante bis Oberkante. Oberkante = max z der
              Stützpunkte, Unterkante = min z - height (Einbindung).
    Becken    Sohlplatte + umlaufende Wand als zwei geschlossene Körper.
    Durchlass Ringquerschnitt je Achssegment (Kreis: annulus, Rechteck:
              vier Wandplatten) — je Segment wasserdicht.
    Pfeiler   Extrusion des Grundrisspolygons.
    Import    STL unverändert, mit Einfügepunkt und Drehung um z.
    Wehr      folgt nach dem ersten abgeschlossenen Nachweis (Spez. 6.3).

Invariantenprüfung (Spez. Kap. 13): check_solid() meldet fehlende
Wasserdichtheit und degenerierte Körper in wasserbaulicher Sprache.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import shapely
import shapely.affinity
import trimesh
from trimesh.creation import annulus, extrude_polygon

from .casespec import CaseSpec


def _extrude(polygon: shapely.Polygon, z_bottom: float, z_top: float) -> trimesh.Trimesh:
    mesh = extrude_polygon(polygon, height=z_top - z_bottom)
    mesh.apply_translation([0, 0, z_bottom])
    return mesh


def _rot_z(angle_deg: float, point=(0, 0, 0)) -> np.ndarray:
    return trimesh.transformations.rotation_matrix(
        math.radians(angle_deg), [0, 0, 1], point)


# --------------------------------------------------------------------------
# Katalogtypen
# --------------------------------------------------------------------------

def _axis_point_and_dir(pts2d: np.ndarray, station: float,
                        closed: bool) -> tuple[np.ndarray, np.ndarray]:
    """
    Punkt und Richtung auf einer Achse bei der Bogenlänge `station`.
    closed=True hängt den Anfangspunkt an (Beckenumfang).
    """
    p = np.vstack([pts2d, pts2d[:1]]) if closed else pts2d
    seg = np.diff(p, axis=0)
    laengen = np.linalg.norm(seg, axis=1)
    gesamt = float(laengen.sum())
    st = min(max(float(station), 0.0), gesamt)
    lauf = 0.0
    for i, L in enumerate(laengen):
        if L <= 0:
            continue
        if lauf + L >= st or i == len(laengen) - 1:
            f = (st - lauf) / L
            richtung = seg[i] / L
            return p[i] + f * seg[i], richtung
        lauf += L
    return p[0], np.array([1.0, 0.0])


def _cutter(op, punkt: np.ndarray, richtung: np.ndarray,
            dicke: float) -> trimesh.Trimesh:
    """
    Schneidkörper einer Aussparung: liegt waagerecht, durchdringt die
    Bauteildicke vollständig (Zuschlag gegen Flächen, die exakt aufeinander
    liegen — die mag kein Boolean-Kern).
    """
    tiefe = dicke * 3 + 1.0
    # senkrecht = Schacht durch Sohle oder Decke; sonst liegt das Loch
    # waagerecht und durchstößt die Bauteildicke
    senkrecht = bool(getattr(op, "vertikal", False))
    if op.shape == "kreis":
        body = trimesh.creation.cylinder(radius=op.diameter / 2,
                                         height=tiefe, sections=32)
    elif senkrecht:
        r = min(getattr(op, "radius", 0.0), op.width / 2 - 1e-6,
                op.height / 2 - 1e-6)
        grund = shapely.Polygon([(-op.width / 2, -op.height / 2),
                                 (op.width / 2, -op.height / 2),
                                 (op.width / 2, op.height / 2),
                                 (-op.width / 2, op.height / 2)])
        if r > 0:
            grund = grund.buffer(-r, join_style="mitre").buffer(r, quad_segs=8)
        body = trimesh.creation.extrude_polygon(grund, tiefe)
        body.apply_translation([0, 0, -tiefe / 2])
    elif getattr(op, "radius", 0.0) > 0:
        # Verrundete Ecken: scharfe Innenecken sind im Beton unüblich und
        # sind auch numerisch die schlechtere Stelle (Eckenwirbel, Zellen
        # mit hohem Seitenverhältnis). Querschnitt in der xz-Ebene bauen
        # und quer zur Wand extrudieren.
        r = min(op.radius, op.width / 2 - 1e-6, op.height / 2 - 1e-6)
        quer = shapely.Polygon([(-op.width / 2, -op.height / 2),
                                (op.width / 2, -op.height / 2),
                                (op.width / 2, op.height / 2),
                                (-op.width / 2, op.height / 2)])
        quer = quer.buffer(-r, join_style="mitre").buffer(r, quad_segs=8)
        body = trimesh.creation.extrude_polygon(quer, tiefe)
        # extrude_polygon zieht von z=0 nach z=tiefe — erst mittig setzen,
        # sonst sitzt das Loch um die halbe Tiefe versetzt und trifft die
        # Wand nur zur Hälfte
        body.apply_translation([0, 0, -tiefe / 2])
        # Extrusion liegt entlang +z; Querschnitt soll in xz stehen
        body.apply_transform(trimesh.transformations.rotation_matrix(
            math.pi / 2, [1, 0, 0]))
    else:
        body = trimesh.creation.box(extents=(op.width, tiefe, op.height))
    # Zylinder liegt entlang +z -> auf die Wandnormale kippen (beim
    # Schacht bleibt er stehen)
    if op.shape == "kreis" and not senkrecht:
        body.apply_transform(trimesh.geometry.align_vectors([0, 0, 1],
                                                            [0, 1, 0]))
    # lokale Achse (x = Achsrichtung, y = Wandnormale) in die Welt drehen
    winkel = math.atan2(richtung[1], richtung[0])
    body.apply_transform(trimesh.transformations.rotation_matrix(
        winkel, [0, 0, 1]))
    body.apply_translation([punkt[0], punkt[1], op.z])
    return body


def _achse_von(struct) -> tuple[np.ndarray, bool, float]:
    """Bauwerksachse (2D), geschlossen?, Bauteildicke — je Typ."""
    t = getattr(struct, "type", "")
    if t == "wall":
        return (np.asarray(struct.alignment.points, dtype=float)[:, :2],
                False, struct.thickness)
    if t == "basin":
        return (np.asarray(struct.footprint, dtype=float), True,
                struct.wall_thickness)
    if t == "weir":
        return (np.asarray(struct.crest_polyline, dtype=float)[:, :2],
                False, struct.crest_width)
    if t == "culvert":
        d = struct.profile.diameter or struct.profile.width or 1.0
        return np.asarray(struct.axis, dtype=float)[:, :2], False, d
    return np.zeros((0, 2)), False, 1.0


def grundriss(mesh: trimesh.Trimesh):
    """
    Umriss des Körpers in der Draufsicht (für den Gelände-Anschluss).

    Bewusst über shapely und nicht über trimesh.path.polygons.projected:
    das braucht `rtree`, sobald die Projektion mehr als ein Polygon ergibt,
    und lieferte deshalb bei jedem ZUSAMMENGESETZTEN Körper still None —
    ein Becken (Sohlplatte + Ringwand) hatte damit gar keinen Grundriss,
    und der Gelände-Anschluss wirkte dort nicht.

    Rückgabe ist ein Polygon oder ein MultiPolygon (getrennte Teilkörper).
    """
    d = np.asarray(mesh.triangles, dtype=float)[:, :, :2]
    if not len(d):
        return None
    # senkrechte Wände projizieren sich auf eine Linie und tragen nichts bei
    a, b, c = d[:, 0], d[:, 1], d[:, 2]
    flaeche = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1])
                     - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])) / 2
    d = d[flaeche > 1e-12]
    if not len(d):
        return None
    poly = shapely.union_all(shapely.polygons(shapely.linearrings(d)))
    if poly.is_empty or poly.area <= 0:
        return None
    return poly


def umriss_teile(poly) -> list:
    """Ein Umriss kann mehrteilig sein — hier immer als Liste."""
    if poly is None:
        return []
    return list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]


def gelaende_anschluss(mesh: trimesh.Trimesh, e, terrain
                       ) -> trimesh.Trimesh:
    """
    Körper an das Gelände anschließen: bis unter die tiefste Geländehöhe
    im Grundriss verlängern und/oder die Übertiefe abschneiden.
    """
    poly = grundriss(mesh)
    if poly is None or terrain is None:
        return mesh
    # tiefstes Gelände unter dem Körper: Umriss abtasten (Rand + Raster)
    minx, miny, maxx, maxy = poly.bounds
    schritt = max(min(maxx - minx, maxy - miny) / 12.0, 0.05)
    gx = np.arange(minx, maxx + schritt, schritt)
    gy = np.arange(miny, maxy + schritt, schritt)
    xx, yy = np.meshgrid(gx, gy)
    px, py = xx.ravel(), yy.ravel()
    drin = np.array([poly.contains(shapely.Point(a, b))
                     for a, b in zip(px, py)])
    raender = [np.asarray(teil.exterior.coords, dtype=float)
               for teil in umriss_teile(poly)]
    rand = np.vstack(raender) if raender else np.zeros((0, 2))
    xs = np.concatenate([px[drin], rand[:, 0]])
    ys = np.concatenate([py[drin], rand[:, 1]])
    if not len(xs):
        return mesh
    z_soll = float(np.min(terrain.sample(xs, ys))) - max(e.einbindetiefe, 0.0)
    z_unten = float(mesh.bounds[0][2])

    if e.modus in ("auto", "einbinden") and z_unten > z_soll + 1e-6:
        # Sockel unter den Körper setzen (mit Überlappung, sonst mag der
        # Boolean-Kern die aufeinanderliegenden Flächen nicht)
        teile = [_extrude(teil, z_soll, z_unten + 0.01)
                 for teil in umriss_teile(poly)]
        sockel = (teile[0] if len(teile) == 1
                  else trimesh.util.concatenate(teile))
        try:
            v = trimesh.boolean.union([mesh, sockel])
            mesh = trimesh.util.concatenate(v) if isinstance(v, list) else v
        except Exception:                   # noqa: BLE001
            mesh = trimesh.util.concatenate([mesh, sockel])
    if e.modus in ("auto", "kappen") and z_unten < z_soll - 1e-6:
        mesh = _kappen(mesh, np.array([0.0, 0.0, z_soll]),
                       np.array([0.0, 0.0, 1.0]))
    return mesh


def apply_edits(mesh: trimesh.Trimesh, struct,
                domain=None, terrain=None) -> trimesh.Trimesh:
    """
    Bearbeitungsstapel auf einen fertigen Körper anwenden — unabhängig
    davon, ob er parametrisch entstanden oder importiert ist. Reihenfolge
    ist die Reihenfolge in der Liste, damit sich Schritte aufeinander
    beziehen können (erst zuschneiden, dann bohren, dann heilen).
    """
    edits = getattr(struct, "edits", None)
    if not edits:
        return mesh
    pts2d, closed, dicke = _achse_von(struct)
    schnitte = []

    for e in edits:
        if e.type == "aussparung":
            if e.point is not None:
                punkt = np.asarray(e.point, dtype=float)
                # `direction` ist die BOHRrichtung; _cutter erwartet die
                # Achsrichtung (Loch liegt quer dazu) -> 90 Grad drehen
                bohr = np.asarray(e.direction or (0.0, 1.0), dtype=float)
                bohr = bohr / (np.linalg.norm(bohr) or 1.0)
                richtung = np.array([-bohr[1], bohr[0]])
            elif len(pts2d):
                punkt, richtung = _axis_point_and_dir(pts2d, e.station, closed)
            else:
                continue        # ohne Achse und ohne Punkt nicht platzierbar
            # Bei importierten Körpern ist die Dicke unbekannt -> aus der
            # Ausdehnung ableiten, damit der Schnitt sicher durchgeht
            if getattr(e, "vertikal", False):
                # senkrecht: maßgeblich ist die Höhe des Körpers
                d = float(np.ptp(mesh.bounds, axis=0)[2])
            else:
                d = dicke if dicke > 0 \
                    else float(np.ptp(mesh.bounds, axis=0).max())
            schnitte.append(_cutter(e, punkt, richtung, d))

        elif e.type == "schnitt":
            i = {"x": 0, "y": 1, "z": 2}[e.achse]
            normale = np.zeros(3)
            normale[i] = -1.0 if e.behalten == "unter" else 1.0
            ursprung = np.zeros(3)
            ursprung[i] = e.position
            mesh = _kappen(mesh, ursprung, normale)

        elif e.type == "auf_gebiet":
            if domain is None:
                continue
            x0, y0, x1, y1 = domain.extent
            r = e.rand
            for ursprung, normale in (
                    ((x0 + r, 0, 0), (1, 0, 0)), ((x1 - r, 0, 0), (-1, 0, 0)),
                    ((0, y0 + r, 0), (0, 1, 0)), ((0, y1 - r, 0), (0, -1, 0)),
                    ((0, 0, domain.z_min + r), (0, 0, 1)),
                    ((0, 0, domain.z_max - r), (0, 0, -1))):
                mesh = _kappen(mesh, np.asarray(ursprung, dtype=float),
                               np.asarray(normale, dtype=float))

        elif e.type == "transform":
            if e.skalieren != 1.0:
                mesh.apply_scale(e.skalieren)
            if e.drehen_deg:
                mesh.apply_transform(_rot_z(e.drehen_deg))
            if any(e.verschieben):
                mesh.apply_translation(list(e.verschieben))

        elif e.type == "gelaende":
            # erst die anstehenden Bohrungen anwenden — der Sockel soll
            # sie nicht wieder zumauern
            if schnitte:
                out = trimesh.boolean.difference([mesh, *schnitte])
                mesh = trimesh.util.concatenate(out) if isinstance(out, list) \
                    else out
                schnitte = []
            mesh = gelaende_anschluss(mesh, e, terrain)

        elif e.type == "heilen":
            mesh.remove_unreferenced_vertices()
            mesh.merge_vertices()
            trimesh.repair.fill_holes(mesh)
            trimesh.repair.fix_normals(mesh)

    if schnitte:
        out = trimesh.boolean.difference([mesh, *schnitte])
        mesh = trimesh.util.concatenate(out) if isinstance(out, list) else out
    return mesh


def _kappen(mesh: trimesh.Trimesh, ursprung: np.ndarray,
            normale: np.ndarray) -> trimesh.Trimesh:
    """Halbraum abschneiden; cap=True schließt die Schnittfläche wieder."""
    if not len(mesh.faces):
        return mesh
    try:
        geschnitten = mesh.slice_plane(ursprung, normale, cap=True)
    except Exception:                       # noqa: BLE001
        return mesh
    if geschnitten is None or not len(geschnitten.faces):
        return mesh                          # Schnitt hätte alles entfernt
    return geschnitten


def build_wall(struct) -> trimesh.Trimesh:
    """
    Wand als Querschnitts-Sweep entlang der Achse. Die Oberkante folgt
    dabei points[i].z JE STÜTZPUNKT (casespec: „height: konstant; je
    Stützpunkt über points[i].z") — vorher kollabierte der Bau alle z auf
    max/min und extrudierte zwischen zwei konstanten Ebenen, womit das
    Ziehen einer einzelnen Ecke immer die GANZE Oberkante hob. Der Fuß
    bleibt eine Ebene: tiefster Punkt minus Einbindehöhe.
    """
    pts = np.asarray(struct.alignment.points, dtype=float)
    if len(pts) >= 2:
        # doppelte aufeinanderfolgende Stützpunkte filtern —
        # _sweep_sections teilte sonst durch die Segmentlänge null
        halten = np.ones(len(pts), dtype=bool)
        halten[1:] = np.linalg.norm(np.diff(pts[:, :2], axis=0),
                                    axis=1) > 1e-9
        pts = pts[halten]
    if len(pts) < 2:
        raise ValueError(f"Wand {struct.id}: Achse braucht mindestens zwei "
                         "verschiedene Stützpunkte")
    z_bottom = float(pts[:, 2].min()) - struct.height
    halb_o = struct.thickness / 2
    # Anlauf: die Wand steht nicht senkrecht, sondern verbreitert sich
    # nach unten (positiver Winkel) — Stützmauern werden so gebaut
    anlauf = (math.tan(math.radians(struct.batter_deg))
              if abs(struct.batter_deg) > 1e-6 else 0.0)
    sections = []
    for z_top in pts[:, 2]:
        h = max(float(z_top) - z_bottom, 1e-6)
        halb_u = max(halb_o + h * anlauf, 0.02) if anlauf else halb_o
        sections.append(np.array([[-halb_u, z_bottom], [halb_u, z_bottom],
                                  [halb_o, float(z_top)],
                                  [-halb_o, float(z_top)]]))
    return _sweep_sections(pts[:, :2], sections)


def _gefaelle_richtung(poly: shapely.Polygon, vorgabe) -> np.ndarray:
    """Gefällerichtung: Vorgabe oder die längste Ausdehnung des Grundrisses."""
    if vorgabe is not None:
        d = np.asarray(vorgabe, dtype=float)
        n = np.linalg.norm(d)
        if n > 1e-9:
            return d / n
    x0, y0, x1, y1 = poly.bounds
    return (np.array([1.0, 0.0]) if (x1 - x0) >= (y1 - y0)
            else np.array([0.0, 1.0]))


def build_basin(struct) -> trimesh.Trimesh:
    poly = shapely.Polygon(struct.footprint)
    unten = struct.invert_level - struct.wall_thickness
    if abs(struct.invert_slope) > 1e-9:
        # Sohlgefälle: die Sohle fällt in Gefällerichtung. Sie entsteht als
        # zu hoher Block, der an der geneigten Ebene gekappt wird — die
        # Sohlplatte bleibt dabei wasserdicht.
        d = _gefaelle_richtung(poly, struct.invert_slope_dir)
        ecken = np.asarray(poly.exterior.coords, dtype=float)[:-1, :2]
        # Schwerpunkt als Drehpunkt — der Mittelwert der Stützpunkte läge
        # beim geschlossenen Ring um den doppelten Anfangspunkt daneben
        mitte = np.array([poly.centroid.x, poly.centroid.y])
        lauf = (ecken - mitte) @ d
        hub = float(np.abs(lauf).max()) * abs(struct.invert_slope)
        floor = _extrude(poly, unten - hub, struct.invert_level + hub + 0.01)
        floor = _kappen(floor,
                        np.array([mitte[0], mitte[1], struct.invert_level]),
                        np.array([struct.invert_slope * d[0],
                                  struct.invert_slope * d[1], -1.0]))
        # Die Wand muss bis unter den TIEFSTEN Sohlpunkt reichen, sonst
        # klafft an der Gefälleseite ein Spalt und das Becken läuft aus.
        ring_unten = struct.invert_level - hub
    else:
        floor = _extrude(poly, unten, struct.invert_level)
        ring_unten = struct.invert_level
    ring_poly = poly.buffer(struct.wall_thickness, join_style="mitre") - poly
    ring = _extrude(ring_poly, ring_unten,
                    struct.invert_level + struct.wall_height)
    return trimesh.util.concatenate([floor, ring])


def _pier_footprint(struct) -> shapely.Polygon:
    if struct.shape == "polygon":
        return shapely.Polygon(struct.footprint)
    w2 = struct.width / 2
    if struct.shape == "rund":
        poly = shapely.Point(0, 0).buffer(w2, quad_segs=12)
    elif struct.shape == "rechteck":
        L2 = struct.length / 2
        poly = shapely.Polygon([(-L2, -w2), (L2, -w2), (L2, w2), (-L2, w2)])
    else:  # tropfen: halbrunde Nase (stromauf) + spitz zulaufendes Heck
        arc = [(w2 * math.cos(a), w2 * math.sin(a))
               for a in np.linspace(math.pi / 2, 3 * math.pi / 2, 13)]
        poly = shapely.Polygon(arc + [(struct.length, 0.0)])
    if struct.rotation_deg:
        poly = shapely.affinity.rotate(poly, struct.rotation_deg,
                                       origin=(0, 0))
    return shapely.affinity.translate(poly, struct.center[0], struct.center[1])


def build_pier(struct) -> trimesh.Trimesh:
    return _extrude(_pier_footprint(struct), struct.base_level,
                    struct.top_level)


# --------------------------------------------------------------------------
# Wehr: Sweep eines Vertikalquerschnitts entlang der Kronenachse
# --------------------------------------------------------------------------

def _weir_section(profile: str, crest: float, base: float, cw: float,
                  su: float, sd: float) -> list[tuple[float, float]]:
    """Querschnitt in (Querabstand s, Höhe z), gegen den Uhrzeigersinn."""
    h = max(crest - base, 0.05)
    if profile == "breitkronig":
        return [(-cw / 2, base), (cw / 2, base), (cw / 2, crest), (-cw / 2, crest)]
    if profile == "scharfkantig":
        t = min(cw, 0.08) / 2
        return [(-t, base), (t, base), (t, crest), (-t, crest)]
    if profile == "rundkronig":
        r = cw / 2
        arc = [(r * math.cos(a), crest - r + r * math.sin(a))
               for a in np.linspace(0, math.pi, 9)]
        return ([(-cw / 2 - h * su, base), (cw / 2 + h * sd, base)]
                + arc)
    # trapez (Dachwehr)
    return [(-cw / 2 - h * su, base), (cw / 2 + h * sd, base),
            (cw / 2, crest), (-cw / 2, crest)]


def _sweep_sections(axis_xy: np.ndarray,
                    sections: list[np.ndarray]) -> trimesh.Trimesh:
    """
    Vertikalquerschnitte (m, 2) entlang einer xy-Polylinie aufziehen:
    Gehrungsnormalen an den Knicken, Seitenflächen als Quads, Endkappen als
    Fächer (Querschnitte sind konvex).
    """
    n = len(axis_xy)
    m = len(sections[0])
    seg = np.diff(axis_xy, axis=0)
    seg_dir = seg / np.linalg.norm(seg, axis=1, keepdims=True)
    normals = np.column_stack([seg_dir[:, 1], -seg_dir[:, 0]])

    verts = np.zeros((n * m, 3))
    for i in range(n):
        if i == 0:
            nrm = normals[0]
        elif i == n - 1:
            nrm = normals[-1]
        else:
            nrm = normals[i - 1] + normals[i]
            L = np.linalg.norm(nrm)
            nrm = normals[i] if L < 1e-9 else nrm / L
            # Gehrungsverlängerung am Knick
            nrm = nrm / max(np.dot(nrm, normals[i]), 0.3)
        sec = sections[i]
        verts[i * m:(i + 1) * m, 0] = axis_xy[i, 0] + nrm[0] * sec[:, 0]
        verts[i * m:(i + 1) * m, 1] = axis_xy[i, 1] + nrm[1] * sec[:, 0]
        verts[i * m:(i + 1) * m, 2] = sec[:, 1]

    faces = []
    for i in range(n - 1):
        for j in range(m):
            a = i * m + j
            b = i * m + (j + 1) % m
            c = (i + 1) * m + (j + 1) % m
            d = (i + 1) * m + j
            faces += [[a, b, c], [a, c, d]]
    for j in range(1, m - 1):                       # Endkappen (konvex)
        faces.append([0, j + 1, j])
        base = (n - 1) * m
        faces.append([base, base + j, base + j + 1])

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


def build_weir(struct) -> trimesh.Trimesh:
    pts = np.asarray(struct.crest_polyline, dtype=float)
    if len(pts) < 2:
        raise ValueError(f"Wehr {struct.id}: Kronenachse braucht 2 Punkte")
    base = struct.base_level if struct.base_level is not None \
        else float(pts[:, 2].min()) - 2.0
    sections = [np.asarray(_weir_section(
        struct.profile_type, z, base, struct.crest_width,
        struct.slope_upstream, struct.slope_downstream))
        for z in pts[:, 2]]
    return _sweep_sections(pts[:, :2], sections)


# --------------------------------------------------------------------------
# Rechen: echte Stabkörper (nur Vorschau — der Solver sieht die poröse Zone)
# --------------------------------------------------------------------------

def build_screen_bars(struct) -> trimesh.Trimesh:
    p = np.asarray(struct.plane_polygon, dtype=float)
    if len(p) < 4:
        raise ValueError(f"Rechen {struct.id}: Rechenebene braucht 4 Punkte")
    u = p[1] - p[0]                    # Richtung entlang der Ebene
    v = p[-1] - p[0]                   # zweite Ebenenrichtung
    # Stäbe verlaufen entlang der stärker geneigten Richtung
    if abs(u[2]) > abs(v[2]):
        u, v = v, u
    width = float(np.linalg.norm(u))
    u_hat = u / width
    normal = np.cross(u, v)
    normal /= np.linalg.norm(normal)

    t = struct.bar_thickness
    d = struct.bar_depth
    n_bars = max(2, int(width / struct.bar_spacing) + 1)
    stride = max(1, n_bars // 120)     # Vorschau-Deckelung

    frame = np.eye(4)
    frame[:3, 0] = u_hat
    frame[:3, 1] = normal
    frame[:3, 2] = v / np.linalg.norm(v)

    # Anströmwinkel: bei Schräganströmung (≠ 90°) drehen sich die Stäbe
    # um ihre Längsachse in die Strömung — Stabtiefe zeigt zur Anströmung,
    # nicht stur zur Ebenen-Normalen
    delta = math.radians(struct.approach_angle_deg - 90.0)
    if abs(delta) > 1e-9:
        rot = trimesh.transformations.rotation_matrix(delta, frame[:3, 2])
        frame = rot @ frame

    bars = []
    length = float(np.linalg.norm(v))
    for i in range(0, n_bars, stride):
        if struct.bar_shape == "rund":
            bar = trimesh.creation.cylinder(radius=t / 2, height=length,
                                            sections=10)
        elif struct.bar_shape == "tropfen":
            nose = trimesh.creation.cylinder(radius=t / 2, height=length,
                                             sections=10)
            tail = trimesh.creation.box((t, d - t / 2, length))
            tail.apply_translation([0, -(d - t / 2) / 2, 0])
            bar = trimesh.util.concatenate([nose, tail])
        else:                          # rechteck
            bar = trimesh.creation.box((t, d, length))
        pos = p[0] + u_hat * (i * struct.bar_spacing) + v / 2
        tf = frame.copy()
        tf[:3, 3] = pos
        bar.apply_transform(tf)
        bars.append(bar)
    return trimesh.util.concatenate(bars)


_CULVERT_WALL = 0.15   # Wandstärke des Rohrkörpers in m


def _achsen_transform(vec: np.ndarray) -> np.ndarray:
    """
    Querschnittsebene auf die Rohrachse legen — mit definierter LAGE um die
    Achse: lokal +y zeigt nach oben, lokal +x quer dazu.

    trimesh.geometry.align_vectors liefert nur die kürzeste Drehung von +z
    auf die Achse; wie der Querschnitt dabei um die Achse verdreht wird,
    bleibt offen. Beim Kreis ist das egal, beim Rechteck- und Maulprofil
    nicht: ein Durchlass 2,0 m breit und 1,0 m hoch kam in y-Richtung als
    1,0 m breit und 2,0 m hoch heraus.
    """
    e3 = vec / np.linalg.norm(vec)
    oben = np.array([0.0, 0.0, 1.0]) - e3 * float(e3[2])
    if np.linalg.norm(oben) < 1e-9:          # senkrechtes Rohr (Schacht)
        oben = np.array([0.0, 1.0, 0.0]) - e3 * float(e3[1])
    e2 = oben / np.linalg.norm(oben)
    e1 = np.cross(e2, e3)
    tf = np.eye(4)
    tf[:3, 0], tf[:3, 1], tf[:3, 2] = e1, e2, e3
    return tf


def _maulprofil(width: float, height: float) -> shapely.Polygon:
    """
    Maulprofil: senkrechte Wände mit halbkreisförmigem Scheitel. Lichte
    Weite `width`, Scheitelhöhe `height` über der Sohle. Der Querschnitt
    liegt in der lokalen x-y-Ebene, y ist oben.
    """
    r = width / 2
    gerade = max(height - r, 0.0)
    pkte = [(-r, 0.0), (r, 0.0), (r, gerade)]
    for a in np.linspace(0.0, math.pi, 24)[1:-1]:
        pkte.append((r * math.cos(a), gerade + r * math.sin(a)))
    pkte.append((-r, gerade))
    return shapely.Polygon(pkte)


def build_culvert(struct) -> trimesh.Trimesh:
    axis = np.asarray(struct.axis, dtype=float)
    if len(axis) < 2:
        raise ValueError(f"Durchlass {struct.id}: Achse braucht mindestens 2 Punkte")
    segments = []
    for a, b in zip(axis[:-1], axis[1:]):
        vec = b - a
        length = float(np.linalg.norm(vec))
        if length < 1e-9:
            continue
        if struct.profile.kind == "circular":
            r = struct.profile.diameter / 2
            seg = annulus(r_min=r, r_max=r + _CULVERT_WALL, height=length,
                          sections=48)
        elif struct.profile.kind == "rectangular":
            seg = _rect_shell(struct.profile.width, struct.profile.height, length)
        else:                                    # arch = Maulprofil
            innen = _maulprofil(struct.profile.width, struct.profile.height)
            ring = innen.buffer(_CULVERT_WALL, join_style=2).difference(innen)
            seg = extrude_polygon(ring, height=length)
            seg.apply_translation([0, 0, -length / 2])
        # Querschnitt liegt um den Ursprung in der x-y-Ebene — auf die Achse
        # legen, mit +y nach oben (sonst kippt das Profil um die Achse)
        seg.apply_transform(_achsen_transform(vec))
        seg.apply_translation((a + b) / 2)
        segments.append(seg)
    return trimesh.util.concatenate(segments)


# --------------------------------------------------------------------------
# Aushub-Grundtypen: Schacht, Kammer, Graben (Stufe B)
#
# Alle drei bauen zuerst den LICHTEN Raum und leiten daraus ab:
#   wirkung = aushub  -> lichter Raum + Wandstärke ringsum (der Bagger nimmt
#                        die Wand mit, sonst passt das Bauteil nicht hinein)
#   wirkung = bauteil -> die Schale dazwischen (das ist der Beton)
# Dieselben Maße, zweimal eingesetzt, ergeben Hohlraum und Wand passgenau.
# --------------------------------------------------------------------------

def _schacht_grundriss(struct, aufmass: float = 0.0) -> shapely.Polygon:
    cx, cy = struct.center
    if struct.shape == "rund":
        poly = shapely.Point(cx, cy).buffer(struct.width / 2 + aufmass,
                                            quad_segs=24)
    else:
        laenge = struct.length if struct.length is not None else struct.width
        b, l = struct.width / 2 + aufmass, laenge / 2 + aufmass
        poly = shapely.Polygon([(cx - b, cy - l), (cx + b, cy - l),
                                (cx + b, cy + l), (cx - b, cy + l)])
        if abs(struct.rotation_deg) > 1e-9:
            poly = shapely.affinity.rotate(poly, struct.rotation_deg,
                                           origin=(cx, cy))
    return poly


def _schale(aussen: trimesh.Trimesh, innen: trimesh.Trimesh, name: str
            ) -> trimesh.Trimesh:
    """Beton = außen minus innen. Der Innenkörper ragt bewusst über."""
    try:
        v = trimesh.boolean.difference([aussen, innen])
    except Exception as e:                           # pragma: no cover
        raise ValueError(f"{name}: Wandschale nicht erzeugbar ({e})") from e
    return trimesh.util.concatenate(v) if isinstance(v, list) else v


def build_schacht(struct) -> trimesh.Trimesh:
    t = max(struct.wall_thickness, 0.0)
    unten, oben = struct.invert_level, struct.top_level
    if ist_aushub(struct):
        # Der Aushub reicht eine Wandstärke tiefer: sonst stünde das Bauteil
        # mit seiner Sohlplatte im gewachsenen Boden
        return _extrude(_schacht_grundriss(struct, t), unten - t, oben)
    if t <= 0:
        return _extrude(_schacht_grundriss(struct), unten, oben)
    aussen = _extrude(_schacht_grundriss(struct, t), unten - t, oben)
    innen = _extrude(_schacht_grundriss(struct), unten, oben + t)
    return _schale(aussen, innen, f"Schacht {struct.id}")


def _kammer_sohle(struct, poly: shapely.Polygon) -> float:
    """Tiefster Punkt der Sohle (Gefälle wird über die Länge gerechnet)."""
    if abs(struct.invert_slope) < 1e-9:
        return struct.invert_level
    minx, miny, maxx, maxy = poly.bounds
    laenge = max(maxx - minx, maxy - miny)
    return struct.invert_level - abs(struct.invert_slope) * laenge


def build_kammer(struct) -> trimesh.Trimesh:
    t = max(struct.wall_thickness, 0.0)
    innen_poly = shapely.Polygon(struct.footprint)
    unten = _kammer_sohle(struct, innen_poly)
    oben = struct.top_level
    if ist_aushub(struct):
        return _extrude(innen_poly.buffer(t, join_style=2), unten - t, oben)
    if t <= 0:
        return _extrude(innen_poly, unten, oben)
    aussen = _extrude(innen_poly.buffer(t, join_style=2), unten - t, oben)
    innen = _extrude(innen_poly, unten, oben + t)
    return _schale(aussen, innen, f"Kammer {struct.id}")


def _graben_querschnitt(profil, aufmass: float = 0.0) -> shapely.Polygon:
    """
    Querschnitt in der lokalen x-y-Ebene, y nach oben, Sohle auf y = 0.
    `aufmass` weitet ihn allseitig — damit entsteht die Außenkontur.
    """
    if profil.kind == "kreis":
        return shapely.Point(0.0, profil.width / 2).buffer(
            profil.width / 2 + aufmass, quad_segs=24)
    h = profil.height
    if profil.kind == "maul":
        return _maulprofil(profil.width, h).buffer(aufmass, join_style=2) \
            if aufmass > 0 else _maulprofil(profil.width, h)
    b = profil.width / 2
    if profil.kind == "rechteck":
        roh = shapely.Polygon([(-b, 0.0), (b, 0.0), (b, h), (-b, h)])
    else:                                            # trapez
        o = b + profil.side_slope * h
        roh = shapely.Polygon([(-b, 0.0), (b, 0.0), (o, h), (-o, h)])
    return roh.buffer(aufmass, join_style=2) if aufmass > 0 else roh


def _graben_sweep(struct, aufmass: float, nach_unten: float
                  ) -> trimesh.Trimesh:
    """
    Querschnitt entlang der Achse ziehen. z je Achspunkt ist die SOHLE,
    der Querschnitt sitzt darauf; `nach_unten` legt ihn zusätzlich tiefer.
    """
    achse = np.asarray(struct.axis, dtype=float)
    quer = _graben_querschnitt(struct.profile, aufmass)
    if nach_unten > 0:
        quer = shapely.affinity.translate(quer, yoff=-nach_unten)
    teile = []
    for a, b in zip(achse[:-1], achse[1:]):
        vec = b - a
        laenge = float(np.linalg.norm(vec))
        if laenge < 1e-9:
            continue
        seg = extrude_polygon(quer, height=laenge)
        seg.apply_translation([0, 0, -laenge / 2])
        seg.apply_transform(_achsen_transform(vec))
        seg.apply_translation((a + b) / 2)
        teile.append(seg)
    if not teile:
        raise ValueError(f"Graben {struct.id}: Achse hat keine Länge")
    return teile[0] if len(teile) == 1 else trimesh.util.concatenate(teile)


def build_graben(struct) -> trimesh.Trimesh:
    t = max(struct.wall_thickness, 0.0)
    if ist_aushub(struct):
        return _graben_sweep(struct, aufmass=t, nach_unten=t)
    if t <= 0:
        return _graben_sweep(struct, aufmass=0.0, nach_unten=0.0)
    aussen = _graben_sweep(struct, aufmass=t, nach_unten=t)
    innen = _graben_sweep(struct, aufmass=0.0, nach_unten=0.0)
    return _schale(aussen, innen, f"Graben {struct.id}")


def bohrkoerper(struct, ueberstand: float, domain=None,
                zelle: float = 0.25) -> trimesh.Trimesh | None:
    """
    Der Raum, den ein Durchlass im Erdreich BRAUCHT: Rohraußenkontur, an
    den Enden verlängert. Genau dieser Körper wird aus dem Geländekörper
    herausgeschnitten, damit die Leitung wirklich durchsteht statt vom
    Vernetzer zugeschüttet zu werden.

    Wie weit ein Ende verlängert wird, hängt von seiner Lage ab: an einer
    MÜNDUNG (Ende außerhalb des Gebiets oder nahe einer Gebietsfläche)
    der volle `ueberstand` — der Schnitt muss die Böschungs-/Gebietsfläche
    sicher durchstoßen. Ein Ende MITTEN IM GEBIET bekommt nur ein kleines
    Epsilon gegen deckungsgleiche Flächen: der volle Überstand fräste
    sonst einen offenen Graben über das Rohrende hinaus ins
    Simulationsgebiet.
    """
    axis = np.asarray(struct.axis, dtype=float)
    if len(axis) < 2:
        return None

    def end_ueberstand(p) -> float:
        if domain is None:
            return ueberstand
        x0, y0, x1, y1 = domain.extent
        rand = 2 * zelle
        muendung = (p[0] <= x0 + rand or p[0] >= x1 - rand
                    or p[1] <= y0 + rand or p[1] >= y1 - rand)
        return ueberstand if muendung else 0.05

    # Enden in Achsrichtung verlängern — ein Schnitt genau auf der
    # Geländeoberfläche oder der Gebietsfläche wäre deckungsgleich
    a0, a1 = axis[0], axis[1]
    e0, e1 = axis[-1], axis[-2]
    v0 = a0 - a1
    v1 = e0 - e1
    if np.linalg.norm(v0) > 1e-9:
        axis[0] = a0 + end_ueberstand(a0) * v0 / np.linalg.norm(v0)
    if np.linalg.norm(v1) > 1e-9:
        axis[-1] = e0 + end_ueberstand(e0) * v1 / np.linalg.norm(v1)

    teile = []
    for a, b in zip(axis[:-1], axis[1:]):
        vec = b - a
        length = float(np.linalg.norm(vec))
        if length < 1e-9:
            continue
        if struct.profile.kind == "circular":
            r = struct.profile.diameter / 2 + _CULVERT_WALL
            seg = trimesh.creation.cylinder(radius=r, height=length,
                                            sections=48)
        elif struct.profile.kind == "rectangular":
            seg = trimesh.creation.box((struct.profile.width + 2 * _CULVERT_WALL,
                                        struct.profile.height + 2 * _CULVERT_WALL,
                                        length))
        else:                                    # arch = Maulprofil
            aussen = _maulprofil(struct.profile.width,
                                 struct.profile.height).buffer(
                                     _CULVERT_WALL, join_style=2)
            seg = extrude_polygon(aussen, height=length)
            seg.apply_translation([0, 0, -length / 2])
        seg.apply_transform(_achsen_transform(vec))
        seg.apply_translation((a + b) / 2)
        # Ein Segment mit negativem Volumen hat gekippte Normalen — als
        # Subtrahend einer Booleschen Operation FÜGT es Material hinzu,
        # statt zu bohren (das „negativ ins Gelände geschnittene Rohr")
        if seg.volume < 0:
            seg.invert()
        teile.append(seg)
    if not teile:
        return None
    if len(teile) == 1:
        return teile[0]
    return trimesh.boolean.union(teile)


def oberseite(mesh: trimesh.Trimesh, mindest_neigung: float = 0.02) -> trimesh.Trimesh:
    """
    Die nach oben zeigenden Flächen eines Körpers — daraus lässt sich ein
    Höhenraster ableiten. Ein geschlossener Volumenkörper hat auch Boden
    und Wände; die würden im Grundriss über der Oberfläche liegen und die
    Vermaschung unbrauchbar machen.
    """
    n = mesh.face_normals[:, 2]
    oben = n > mindest_neigung
    if not oben.any():
        raise ValueError("Der Körper hat keine nach oben zeigende Fläche — "
                         "als Gelände ist er nicht verwendbar")
    return mesh.submesh([np.nonzero(oben)[0]], append=True)


def gelaende_koerper_laden(spec: CaseSpec, base_dir) -> trimesh.Trimesh | None:
    """Importierter Geländekörper (STL neben dem Fall), sonst None."""
    from pathlib import Path as _P

    name = getattr(spec.terrain.base, "koerper", None) if spec.terrain else None
    if not name:
        return None
    pfad = _P(base_dir) / name
    if not pfad.is_file():
        raise FileNotFoundError(f"Geländekörper nicht gefunden: {pfad}")
    return trimesh.load(pfad, force="mesh")


# Typen, die sich selbst als Aushub erkennen dürfen. Bewusst nur diese drei:
# eine in den Boden geschobene WAND soll eine eingegrabene Wand bleiben und
# keine Grube werden — das wäre eine stille Umdeutung von Beton in Wasser.
AUSHUB_TYPEN = {"schacht", "kammer", "graben"}

# Wie weit die Oberkante über dem Gelände liegen darf und trotzdem als
# „eingegraben" gilt. Ein Schachtdeckel schließt bündig ab; ohne diesen
# Spielraum entschiede die dritte Nachkommastelle über Grube oder Bauteil.
_BUENDIG = 0.05


def eingegraben(struct, field) -> bool:
    """
    Liegt die Oberkante des Körpers auf oder unter dem gewachsenen Gelände?
    Das ist die Frage, aus der sich `wirkung: auto` beantwortet.
    """
    if field is None or struct.type not in AUSHUB_TYPEN:
        return False
    oben = getattr(struct, "top_level", None)
    if oben is None and struct.type == "graben":
        p = struct.profile
        hoehe = p.width if p.kind == "kreis" else (p.height or 0.0)
        oben = max(float(a[2]) + hoehe for a in struct.axis)
    if oben is None:
        return False
    lage = aushub_grundriss(struct)
    if lage is None:
        return False
    poly = lage[0]
    rand = np.asarray(poly.exterior.coords, dtype=float)
    if not len(rand):
        return False
    gelaende = field.sample(rand[:, 0], rand[:, 1])
    return float(np.min(gelaende)) >= oben - _BUENDIG


def wirkung_von(struct, field=None) -> str:
    """
    Wirkung eines Körpers: „bauteil" oder „aushub". Bei `wirkung: auto`
    (Vorbelegung der Aushub-Grundtypen) entscheidet die Lage — ein frisch
    abgesetzter Schacht steht auf dem Gelände und ist ein Bauteil; erst
    wenn er in den Boden geschoben wird, wird er zur Grube.
    """
    gesetzt = getattr(struct, "wirkung", "bauteil")
    if gesetzt != "auto":
        return gesetzt
    return "aushub" if eingegraben(struct, field) else "bauteil"


def ist_aushub(struct, field=None) -> bool:
    """Wird dieser Körper aus dem Erdreich geschnitten statt hineingestellt?"""
    return wirkung_von(struct, field) == "aushub"


def braucht_erdkoerper(spec: CaseSpec, field=None) -> bool:
    """
    Ob der Fall den Geländekörper braucht statt der offenen Höhenfläche.
    Ein Höhenfeld hat ein z je x/y und kann deshalb weder eine Bohrung noch
    einen Schacht tragen — sobald etwas ausgehoben wird oder durchstößt,
    muss das Gelände ein geschlossener Körper sein.
    """
    if spec.domain is None:
        return False
    # Expliziter Schalter gewinnt — "auto" ist die Inferenz darunter
    modus = spec.terrain.erdkoerper if spec.terrain is not None else "auto"
    if modus == "an":
        return True
    if modus == "aus":
        return False
    if spec.terrain is not None and getattr(spec.terrain.base, "koerper", None):
        return True
    return any(ist_aushub(s, field)
               or (s.type == "culvert"
                   and getattr(s, "durchstoesst_gelaende", False))
               for s in spec.structures)


def erdkoerper_abgeschaltet_aber_noetig(spec: CaseSpec, field=None) -> bool:
    """
    Regelseite zum Schalter: `erdkoerper: aus`, obwohl die Inferenz ihn
    verlangt — Bohrungen/Aushübe wirkten dann still nicht.
    """
    if spec.terrain is None or spec.terrain.erdkoerper != "aus":
        return False
    probe = spec.model_copy(deep=True)
    probe.terrain.erdkoerper = "auto"
    return braucht_erdkoerper(probe, field)


def aushub_grundriss(struct) -> tuple[shapely.base.BaseGeometry, float] | None:
    """
    Grundriss und Sohle eines Aushubs — ohne den Körper zu bauen.

    Ein geneigter Grabensohle wird durch ihren tiefsten Punkt vertreten. Das
    ist für die Frage, ob etwas IM Aushub liegt, die richtige Näherung: es
    gilt dann für den ganzen Graben, was am tiefsten Punkt gilt.
    """
    t = max(getattr(struct, "wall_thickness", 0.0) or 0.0, 0.0)
    if struct.type == "schacht":
        return _schacht_grundriss(struct, t), struct.invert_level - t
    if struct.type == "kammer":
        poly = shapely.Polygon(struct.footprint)
        return (poly.buffer(t, join_style=2),
                _kammer_sohle(struct, poly) - t)
    if struct.type == "graben":
        achse = np.asarray(struct.axis, dtype=float)
        p = struct.profile
        halbe = (p.width / 2 if p.kind in ("kreis", "rechteck", "maul")
                 else p.width / 2 + p.side_slope * (p.height or 0.0))
        linie = shapely.LineString(achse[:, :2])
        return linie.buffer(halbe + t, join_style=2), float(achse[:, 2].min()) - t
    return None


def gelaende_mit_aushub(field, spec: CaseSpec):
    """
    Höhenfeld mit eingeschnittenen Aushüben.

    Das Höhenraster kennt nur die gewachsene Oberfläche — der Aushub lebt
    im Erdkörper. Jede Regel, die „liegt das Bauteil über dem Gelände?"
    fragt, bekäme damit für alles IN einer Kammer die falsche Antwort: eine
    Trennwand im ausgehobenen Schacht gälte als „vollständig unter dem
    Gelände und hydraulisch wirkungslos".

    Rückgabe ist ein neues Feld; das übergebene bleibt unverändert. Ohne
    Aushub wird dasselbe Feld zurückgegeben (kein Kopieraufwand).
    """
    # Entschieden wird gegen das GEWACHSENE Feld (das übergebene) — sonst
    # senkt der erste Aushub das Gelände und der zweite gilt plötzlich als
    # freistehend
    aushuebe = [s for s in spec.structures if ist_aushub(s, field)]
    if field is None or not aushuebe:
        return field
    import dataclasses

    xx, yy = field.mesh_xy()
    z = np.array(field.z, dtype=float)

    for s in aushuebe:
        lage = aushub_grundriss(s)
        if lage is None:
            continue
        poly, sohle = lage
        minx, miny, maxx, maxy = poly.bounds
        grob = ((xx >= minx) & (xx <= maxx) & (yy >= miny) & (yy <= maxy))
        if not grob.any():
            continue
        # nur die Punkte im Hüllrechteck einzeln gegen das Polygon prüfen.
        # Die KANTE zählt mit (intersects statt contains): ein Bauteil, das
        # den Aushub voll ausfüllt — eine Endschwelle über die ganze
        # Beckenbreite — hat seine Eckpunkte genau auf der Kante und läge
        # sonst scheinbar im gewachsenen Boden.
        idx = np.nonzero(grob)
        drin = shapely.intersects_xy(poly, xx[idx], yy[idx])
        ziel = (idx[0][drin], idx[1][drin])
        z[ziel] = np.minimum(z[ziel], sohle)

    return dataclasses.replace(field, z=z)


def _sicher_abziehen(koerper: trimesh.Trimesh, werkzeug: trimesh.Trimesh
                     ) -> tuple[trimesh.Trimesh, str | None]:
    """
    Boolesche Differenz MIT Ergebnisprüfung. Die manifold-Engine liefert
    auf zweifelhaftem Input keine Exception, sondern still Müll — mal ist
    das Rohr ausgehöhlt, mal als Material HINZUGEFÜGT. Deshalb wird das
    Ergebnis gemessen: es muss ein geschlossener Körper sein und darf
    nicht größer werden als der Ausgangskörper. Scheitert das, einmal mit
    der blender-Engine nachversucht; sonst bleibt der Körper ungebohrt
    und der Fehler wird GEMELDET statt geschluckt.
    """
    alt_vol = abs(koerper.volume)
    fehler = None
    for engine in (None, "blender"):
        try:
            if engine is None:
                neu = trimesh.boolean.difference([koerper, werkzeug])
            else:
                neu = trimesh.boolean.difference([koerper, werkzeug],
                                                 engine=engine)
        except Exception as e:                       # noqa: BLE001
            fehler = f"{type(e).__name__}: {e}"
            continue
        if not neu.is_volume:
            fehler = "Ergebnis ist kein geschlossener Körper"
            continue
        if abs(neu.volume) > alt_vol * (1 + 1e-6) + 1e-6:
            fehler = ("Ergebnis ist größer als der Ausgangskörper — "
                      "invertierter Schnitt")
            continue
        return neu, None
    return koerper, fehler


def gelaende_koerper_bauen(field, spec: CaseSpec, hinweise: list | None = None,
                           base_dir=".") -> trimesh.Trimesh | None:
    """
    Der Geländekörper, wie ihn der Vernetzer bekommt: entweder der
    importierte Volumenkörper oder ein aus dem Höhenfeld aufgezogener
    Erdkörper — in beiden Fällen mit allem Ausgehobenen herausgeschnitten
    (Rohrbohrungen und Bauwerke mit `wirkung: aushub`).
    None heißt: die einfache Höhenfläche genügt (schneller, und für alles
    ohne Hohlraum richtig).
    """
    # Die billige Frage zuerst — sie kostet keine einzige Boolesche
    # Operation und kein Laden einer STL-Datei
    if not braucht_erdkoerper(spec, field):
        return None
    rohre = [s for s in spec.structures
             if s.type == "culvert" and getattr(s, "durchstoesst_gelaende", False)]
    aushub = [s for s in spec.structures if ist_aushub(s, field)]
    importiert = gelaende_koerper_laden(spec, base_dir)
    zelle = spec.mesh.base_cell if spec.mesh else 0.25
    if importiert is not None:
        koerper = importiert
    else:
        # Maße vom Gelände (früher die Pseudo-Operation) — leer heißt
        # Vorbelegung
        unterkante = (min(float(np.min(field.z)), spec.domain.z_min)
                      - max(4 * zelle, 1.0))
        ueberstand = 2 * zelle
        t = spec.terrain
        if t is not None and t.erdkoerper_unterkante is not None:
            unterkante = float(t.erdkoerper_unterkante)
        if t is not None and t.erdkoerper_ueberstand is not None:
            ueberstand = max(float(t.erdkoerper_ueberstand), 0.0)
        koerper = field.to_solid(unterkante, ueberstand=ueberstand)
    # Ein nicht wasserdichter Ausgangskörper (importierte STL) macht jede
    # Boolesche Operation zum Glücksspiel — erst reparieren, sonst gar
    # nicht erst schneiden und das KLAR sagen
    if (rohre or aushub) and not koerper.is_volume:
        trimesh.repair.fix_normals(koerper)
        koerper.fill_holes()
        if not koerper.is_volume:
            if hinweise is not None:
                hinweise.append(
                    "Geländekörper ist nicht wasserdicht — Bohrungen und "
                    "Aushübe können nicht ausgeschnitten werden")
            return koerper
    for s in rohre:
        bohrung = bohrkoerper(s, ueberstand=max(4 * zelle, 1.0),
                              domain=spec.domain, zelle=zelle)
        if bohrung is None:
            if hinweise is not None:
                hinweise.append(f"Durchlass {s.id}: Profil lässt sich nicht "
                                "durch das Gelände bohren")
            continue
        koerper, fehler = _sicher_abziehen(koerper, bohrung)
        if fehler is not None and hinweise is not None:
            hinweise.append(f"Durchlass {s.id}: Bohrung durch das Gelände "
                            f"fehlgeschlagen ({fehler}) — das Rohr steckt "
                            "weiter im Erdreich")

    # Aushub: Schacht, Kammer, Graben — und jeder andere Körper, den der
    # Bearbeiter auf „aushub" gestellt hat. Die Wandungen des Hohlraums
    # gehören danach zur Geländefläche; ein eigener Patch entsteht nicht.
    if aushub:
        for s in aushub:
            try:
                loch = koerper_von(s, base_dir, spec.domain, field)
            except Exception as e:                   # pragma: no cover
                if hinweise is not None:
                    hinweise.append(f"Aushub {s.id}: Körper nicht erzeugbar ({e})")
                continue
            koerper, fehler = _sicher_abziehen(koerper, loch)
            if fehler is not None and hinweise is not None:
                hinweise.append(f"Aushub {s.id}: Ausschneiden aus dem "
                                f"Gelände fehlgeschlagen ({fehler})")
    return koerper



def _rect_shell(width: float, height: float, length: float) -> trimesh.Trimesh:
    """Vier Wandplatten um den lichten Querschnitt, jede für sich geschlossen."""
    t = _CULVERT_WALL
    w2, h2 = width / 2, height / 2
    plates = [
        trimesh.creation.box((width + 2 * t, t, length),
                             trimesh.transformations.translation_matrix(
                                 [0, h2 + t / 2, 0])),
        trimesh.creation.box((width + 2 * t, t, length),
                             trimesh.transformations.translation_matrix(
                                 [0, -h2 - t / 2, 0])),
        trimesh.creation.box((t, height, length),
                             trimesh.transformations.translation_matrix(
                                 [w2 + t / 2, 0, 0])),
        trimesh.creation.box((t, height, length),
                             trimesh.transformations.translation_matrix(
                                 [-w2 - t / 2, 0, 0])),
    ]
    return trimesh.util.concatenate(plates)


def build_imported(struct, base_dir: Path) -> trimesh.Trimesh:
    path = Path(struct.source)
    if not path.is_absolute():
        path = base_dir / path
    if not path.exists():
        raise FileNotFoundError(f"Importkörper {struct.id}: {path} nicht gefunden")
    mesh = trimesh.load(path, force="mesh")
    if struct.rotation_deg:
        mesh.apply_transform(_rot_z(struct.rotation_deg))
    mesh.apply_translation(struct.insert_point)
    return mesh


# --------------------------------------------------------------------------
# Sammler und Invarianten
# --------------------------------------------------------------------------

def ueberschneidungen(solids: dict[str, trimesh.Trimesh],
                      mindest_volumen: float = 1e-4,
                      ausnehmen: set[str] | None = None
                      ) -> list[tuple[str, str, float]]:
    """
    Paare, die sich durchdringen, mit dem gemeinsamen Volumen (m³).
    Grobfilter über die Hüllquader, erst danach der teure Boolean.
    `ausnehmen` sind Patches, deren Durchdringung gewollt ist — ein
    Rohrstutzen steckt bestimmungsgemäß in der Wand, die er durchstößt.
    """
    namen = list(solids)
    aus = ausnehmen or set()
    treffer = []
    for i, a in enumerate(namen):
        for b in namen[i + 1:]:
            if a in aus or b in aus:
                continue
            ma, mb = solids[a], solids[b]
            if not len(ma.faces) or not len(mb.faces):
                continue
            la, ha = ma.bounds
            lb, hb = mb.bounds
            if np.any(ha <= lb) or np.any(hb <= la):
                continue
            try:
                s = trimesh.boolean.intersection([ma, mb])
                v = float(abs(s.volume)) if s is not None and len(s.faces) else 0.0
            except Exception:                # noqa: BLE001
                continue
            if v > mindest_volumen:
                treffer.append((a, b, v))
    return treffer


def entflechten(solids: dict[str, trimesh.Trimesh],
                ausnehmen: set[str] | None = None) -> list[str]:
    """
    Sich durchdringende Körper zu berührenden machen: der in der Liste
    ZUERST genannte behält seine Form, dem späteren wird der gemeinsame
    Teil abgezogen. Das Wasser sieht exakt dieselbe Berandung (die
    Vereinigung bleibt unverändert), aber snappyHexMesh bekommt keine
    doppelt belegten Flächen mehr — die sind die häufigste Ursache für
    zerrissene Oberflächen und Splitterzellen an Bauwerksfugen.
    """
    hinweise: list[str] = []
    for a, b, v in ueberschneidungen(solids, ausnehmen=ausnehmen):
        try:
            rest = trimesh.boolean.difference([solids[b], solids[a]])
        except Exception as e:               # noqa: BLE001
            hinweise.append(f"{a} und {b} durchdringen sich ({v:.2f} m³), "
                            f"lassen sich aber nicht trennen: {e}")
            continue
        if rest is None or not len(rest.faces) or abs(rest.volume) < 1e-9:
            hinweise.append(f"{b} steckt vollständig in {a} — als eigener "
                            "Körper wirkungslos")
            continue
        solids[b] = trimesh.util.concatenate(rest) if isinstance(rest, list) \
            else rest
        hinweise.append(f"{b} durchdrang {a} um {v:.2f} m³ — der gemeinsame "
                        f"Teil wurde {b} abgezogen (Wasserberandung "
                        "unverändert)")
    return hinweise


def gewollt_verschnitten(spec: CaseSpec) -> set[str]:
    """
    Patches, deren Durchdringung zur Konstruktion gehört: Durchlässe und
    Zulaufstutzen stecken in der Wand, die sie durchstoßen — sie dürfen
    weder gemeldet noch beschnitten werden (ein beschnittener Rohrschaft
    wäre nicht mehr wasserdicht).
    """
    return {s.patch for s in spec.structures if s.type == "culvert"}


_BUILDER = {"wall": build_wall, "basin": build_basin, "pier": build_pier,
            "culvert": build_culvert, "weir": build_weir,
            "schacht": build_schacht, "kammer": build_kammer,
            "graben": build_graben}


def koerper_von(struct, base_dir: str | Path = ".", domain=None,
                terrain=None) -> trimesh.Trimesh:
    """
    Der fertige Körper eines Bauwerks — parametrisch gebaut oder importiert,
    in beiden Fällen mit angewandtem Bearbeitungsstapel. Eine Stelle, damit
    Vernetzung und Aushub garantiert denselben Körper sehen.
    """
    builder = _BUILDER.get(struct.type)
    mesh = (builder(struct) if builder
            else build_imported(struct, Path(base_dir)))
    return apply_edits(mesh, struct, domain, terrain)


def build_solids(spec: CaseSpec, base_dir: str | Path = ".",
                 include_screens: bool = False,
                 hinweise: list[str] | None = None,
                 ausfaelle: list[dict] | None = None
                 ) -> dict[str, trimesh.Trimesh]:
    """
    Alle Körper des Falls, Schlüssel = Patchname. Rechenstäbe nur auf
    Wunsch (Vorschau im Editor) — für den Solver bleibt der Rechen eine
    poröse Zone, die Stäbe werden nicht aufgelöst (Spez. 6.3).

    Ausgehobene Körper (`wirkung: aushub`) tauchen hier NICHT auf: sie sind
    Hohlraum im Gelände, keine eigene Fläche. Sie werden in
    `gelaende_koerper_bauen` abgezogen.

    `ausfaelle`: wird eine Liste übergeben, fängt der Bau jedes Bauwerk
    EINZELN ab — ein kaputtes Bauwerk (etwa außerhalb des Gebiets gezogen)
    ließ sonst die komplette Schleife platzen und damit ALLE Körper aus der
    Szene verschwinden. Je Ausfall ein Eintrag {id, meldung}. Ohne die
    Liste wirft der erste Fehler wie bisher.
    """
    base_dir = Path(base_dir)
    out: dict[str, trimesh.Trimesh] = {}
    terrain = None
    # Das Gelände wird gebraucht für Gelände-Bearbeitungen UND für die
    # Frage, ob ein Körper mit `wirkung: auto` eingegraben ist
    braucht_gelaende = spec.terrain is not None and (
        any(e.type == "gelaende"
            for s in spec.structures for e in getattr(s, "edits", []))
        or any(s.type in AUSHUB_TYPEN
               and getattr(s, "wirkung", "bauteil") == "auto"
               for s in spec.structures))
    if braucht_gelaende:
        from .terrain import TerrainField
        terrain = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
    for s in spec.structures:
        try:
            if ist_aushub(s, terrain):
                continue
            if s.type == "screen":
                if include_screens:
                    out[s.patch] = build_screen_bars(s)
                continue
            out[s.patch] = koerper_von(s, base_dir, spec.domain, terrain)
        except Exception as e:
            if ausfaelle is None:
                raise
            ausfaelle.append({
                "id": s.id,
                "meldung": (f"Bauwerk „{s.id}“ nicht baubar "
                            f"({type(e).__name__}: {e}) — es fehlt in "
                            "Szene und Netz")})
    if hinweise is not None:
        hinweise += entflechten(out, gewollt_verschnitten(spec))
    return out


def check_solid(name: str, mesh: trimesh.Trimesh) -> list[str]:
    """Invarianten in wasserbaulicher Sprache (Spez. Kap. 7 und 13)."""
    problems = []
    bodies = mesh.split(only_watertight=False)
    for i, body in enumerate(bodies if len(bodies) else [mesh]):
        if not body.is_watertight:
            problems.append(f"{name}: Teilkörper {i + 1} ist nicht wasserdicht "
                            "— der Vernetzer würde stillschweigend falsch rechnen")
        elif body.volume <= 0:
            problems.append(f"{name}: Teilkörper {i + 1} hat kein positives "
                            "Volumen (degenerierte Geometrie)")
    if not len(mesh.faces):
        problems.append(f"{name}: Körper ist leer")
    return problems


def export_solids(solids: dict[str, trimesh.Trimesh],
                  tri_surface_dir: str | Path) -> list[str]:
    d = Path(tri_surface_dir)
    d.mkdir(parents=True, exist_ok=True)
    problems = []
    for patch, mesh in solids.items():
        problems += check_solid(patch, mesh)
        mesh.export(d / f"{patch}.stl")
    return problems
