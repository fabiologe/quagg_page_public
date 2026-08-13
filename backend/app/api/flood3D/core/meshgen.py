"""
meshgen — blockMesh- und snappyHexMesh-Dictionaries (Spez. Kap. 3).

blockMesh erzeugt den Hintergrundquader des Modellgebiets mit der Basiszelle
aus casespec.mesh, snappyHexMesh schneidet Gelände und Bauwerke heraus und
verfeinert nach dem refinements-Stapel. Die Zuordnung der Gebietsränder zu
Quaderflächen kommt aus boundaries[].face mit der Vorbelegung: erster
Zufluss x_min, erster Abfluss x_max, Atmosphäre z_max.
"""
from __future__ import annotations

import math
import os

from .casespec import CaseSpec
from .foam import foam_file, vec

_FACE_VERTICES: dict[str, str] = {
    "x_min": "(0 4 7 3)", "x_max": "(1 2 6 5)",
    "y_min": "(0 1 5 4)", "y_max": "(3 7 6 2)",
    "z_min": "(0 3 2 1)", "z_max": "(4 5 6 7)",
}


def assign_faces(spec: CaseSpec) -> dict[str, tuple[str, str]]:
    """je Quaderfläche (Patchname, Patchtyp); Rest wird Wand."""
    assignment: dict[str, tuple[str, str]] = {}
    for b in spec.boundaries:
        if b.type in ("inflow_hydrograph", "inflow_constant"):
            face_default = "x_min"
        elif b.type.startswith("outflow"):
            face_default = "x_max"
        else:
            face_default = "z_max"
        face = b.face or face_default
        if face in assignment:
            raise ValueError(
                f"Randbedingung {b.id}: Gebietsrand {face} ist bereits durch "
                f"{assignment[face][0]} belegt — bitte face explizit setzen")
        assignment[face] = (b.patch, "patch")
    for face in _FACE_VERTICES:
        if face not in assignment:
            assignment[face] = ("bottom" if face == "z_min" else "farfield", "wall")
    return assignment


# ── Deterministische Netz-Zerlegung ─────────────────────────────────────────
# Das Netz haengt sonst an der Maschine: scotch partitioniert je Rangzahl
# anders, und mit der Partition aendert sich das parallele snappy-Ergebnis —
# 4 Raenge bauten 317.375 Zellen, 16 Raenge aus demselben Fall 127.466 mit
# Schiefe 7,2 und durchgefallenem checkMesh (Benchmark r007, 2026-08-13).
# Deshalb: Vernetzen IMMER mit fester Rangzahl und method hierarchical
# (feste Koeffizienten, feste Reihenfolge) — identische Zerlegung auf jeder
# Maschine, identisches Netz. Der SOLVER dekomponiert danach separat mit
# den Raengen der jeweiligen Maschine (scotch, unveraendert).
# Diese Datei reist im Bundle mit — die Konstanten sind damit auf Server,
# Nutzer-Maschine und RunPod automatisch identisch. Ein Override bricht die
# Standort-Gleichheit und ist nur fuer Experimente gedacht.
MESH_RANKS = int(os.environ.get("FLOOD3D_MESH_RANKS", "8"))
PREVIEW_RANKS = min(2, int(os.environ.get("FLOOD3D_PREVIEW_RANKS", "2")))


def drei_faktoren(n: int) -> tuple[int, int, int]:
    """Deterministische Zerlegung n -> (nx, ny, nz), moeglichst wuerfelig.

    8 -> (2, 2, 2) · 4 -> (2, 2, 1) · 2 -> (2, 1, 1) · 6 -> (3, 2, 1).
    Immer dieselbe Antwort fuer dasselbe n — darauf baut die Gleichheit der
    Netze zwischen den Rechenorten.
    """
    beste = (n, 1, 1)
    for a in range(1, int(n ** (1 / 3)) + 2):
        if n % a:
            continue
        rest = n // a
        for b in range(a, int(rest ** 0.5) + 1):
            if rest % b:
                continue
            c = rest // b
            if c >= b >= a and (c - a) < (beste[0] - beste[2]):
                beste = (c, b, a)
    return beste


def netz_zerlegung_dict(ranks: int) -> str:
    """decomposeParDict fuer die VERNETZUNG — hierarchisch und byte-stabil."""
    nx, ny, nz = drei_faktoren(max(1, int(ranks)))
    return foam_file(
        "decomposeParDict",
        f"numberOfSubdomains {max(1, int(ranks))};\n\n"
        "method          hierarchical;\n\n"
        "hierarchicalCoeffs\n{\n"
        f"    n           ({nx} {ny} {nz});\n"
        "    delta       0.001;\n"
        "    order       xyz;\n"
        "}",
        location="system")


def cell_counts(spec: CaseSpec) -> tuple[int, int, int]:
    x0, y0, x1, y1 = spec.domain.extent
    c = spec.mesh.base_cell
    return (max(1, math.ceil((x1 - x0) / c)),
            max(1, math.ceil((y1 - y0) / c)),
            max(1, math.ceil((spec.domain.z_max - spec.domain.z_min) / c)))


def blockmesh_dict(spec: CaseSpec) -> str:
    x0, y0, x1, y1 = spec.domain.extent
    z0, z1 = spec.domain.z_min, spec.domain.z_max
    nx, ny, nz = cell_counts(spec)

    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]

    # Flächen gleichen Patchnamens zusammenfassen (farfield)
    grouped: dict[str, tuple[str, list[str]]] = {}
    for face, (name, ptype) in assign_faces(spec).items():
        grouped.setdefault(name, (ptype, []))[1].append(_FACE_VERTICES[face])

    boundary = ""
    for name, (ptype, faces) in grouped.items():
        faces_txt = "\n".join(f"            {f}" for f in faces)
        boundary += (f"    {name}\n    {{\n        type {ptype};\n"
                     f"        faces\n        (\n{faces_txt}\n        );\n    }}\n")

    body = (
        "scale 1;\n\n"
        "vertices\n(\n"
        + "\n".join(f"    {vec(v)}" for v in verts)
        + "\n);\n\n"
        f"blocks\n(\n    hex (0 1 2 3 4 5 6 7) ({nx} {ny} {nz}) "
        "simpleGrading (1 1 1)\n);\n\n"
        "edges\n(\n);\n\n"
        f"boundary\n(\n{boundary});\n\n"
        "mergePatchPairs\n(\n);"
    )
    return foam_file("blockMeshDict", body, location="system")


def _bauwerk_bboxen(spec: CaseSpec) -> list[tuple[float, float, float, float]]:
    """Grundriss-Hüllen aller Bauwerke — grob, aber billig (kein trimesh)."""
    boxen = []
    for s in spec.structures:
        pts: list[tuple[float, float]] = []
        for feld in ("axis", "crest_polyline", "footprint", "plane_polygon"):
            pts += [(p[0], p[1]) for p in (getattr(s, feld, None) or [])]
        al = getattr(s, "alignment", None)
        if al is not None:
            pts += [(p[0], p[1]) for p in al.points]
        c = getattr(s, "center", None)
        if c is not None:
            r = max(getattr(s, "width", 0) or 0,
                    getattr(s, "length", 0) or 0) / 2 or 0.5
            pts += [(c[0] - r, c[1] - r), (c[0] + r, c[1] + r)]
        if not pts:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        boxen.append((min(xs), min(ys), max(xs), max(ys)))
    return boxen


def location_in_mesh(spec: CaseSpec, terrain_sample) -> tuple[float, float, float]:
    """
    Punkt im Strömungsgebiet: bevorzugt nahe dem Zuflussrand, mittig in y,
    vertikal zwischen Gelände und Gebietsoberkante. terrain_sample(x, y)
    -> z oder None wenn kein Gelände definiert ist.

    Der Punkt darf in KEINEM Bauwerk stecken: liegt er in einem Körper,
    hält snappyHexMesh dessen Inneres für das Strömungsgebiet und vernetzt
    die falsche Seite. Der frühere Festpunkt bei 15 % der Gebietslänge tat
    genau das, sobald dort ein Einlaufbauwerk stand (Audit F10). Geprüft
    wird gegen die Grundriss-Hüllen der Bauwerke; der erste freie Kandidat
    gewinnt, ohne freien Kandidaten bleibt es beim alten Festpunkt.
    """
    x0, y0, x1, y1 = spec.domain.extent
    rand = spec.mesh.base_cell if spec.mesh else 0.25
    boxen = _bauwerk_bboxen(spec)

    def frei(px, py) -> bool:
        return not any(bx0 - rand <= px <= bx1 + rand
                       and by0 - rand <= py <= by1 + rand
                       for bx0, by0, bx1, by1 in boxen)

    kandidaten = [(fx, fy)
                  for fy in (0.5, 0.3, 0.7, 0.15, 0.85)
                  for fx in (0.15, 0.3, 0.5, 0.7, 0.85)]
    x = x0 + (x1 - x0) * 0.15
    y = (y0 + y1) / 2
    for fx, fy in kandidaten:
        px = x0 + (x1 - x0) * fx
        py = y0 + (y1 - y0) * fy
        if frei(px, py):
            x, y = px, py
            break
    ground = spec.domain.z_min
    if terrain_sample is not None:
        ground = float(terrain_sample(x, y))
    z = ground + (spec.domain.z_max - ground) * 0.35
    return (x, y, z)


def feature_flaechen(spec: CaseSpec, solid_patches: list[str],
                     has_terrain: bool) -> list[tuple[str, int]]:
    """
    Flächen, deren KANTEN erfasst werden — (Name ohne Endung, Stufe).

    Ohne diese Liste findet snappyHexMesh scharfe Kanten nur implizit über
    den Winkel. Genau dort hängt aber der Nachweis: Wehrkrone, Rohrmündung,
    Beckenoberkante. Das Gelände bleibt außen vor — eine Höhenfläche hat
    keine gewollten Kanten, und die zufälligen aus der Vermessung würde
    snappy sonst festhalten.
    """
    stufen = {r.target: r.level for r in spec.mesh.refinements
              if r.type == "surface"}
    return [(patch, stufen.get(patch, 2)) for patch in solid_patches]


def surface_feature_dict(flaechen: list[tuple[str, int]]) -> str | None:
    """surfaceFeatureExtractDict — je Bauwerksfläche die scharfen Kanten."""
    if not flaechen:
        return None
    body = ""
    for name, _level in flaechen:
        body += (f"{name}.stl\n{{\n"
                 "    extractionMethod    extractFromSurface;\n"
                 "    extractFromSurfaceCoeffs { includedAngle 150; }\n"
                 "    writeObj            no;\n}\n\n")
    return foam_file("surfaceFeatureExtractDict", body.rstrip(),
                     location="system")


def snappy_dict(spec: CaseSpec, solid_patches: list[str], has_terrain: bool,
                location: tuple[float, float, float]) -> str:
    geometry = ""
    refinement_surfaces = ""
    refinement_regions = ""

    surface_levels = {r.target: r.level for r in spec.mesh.refinements
                      if r.type == "surface"}

    if has_terrain:
        # Die Sohle ist verfeinerbar wie jede andere Fläche — der
        # Sohlschubnachweis hängt an genau ihr. Ohne eigene Angabe bleibt
        # es bei Stufe 1: das Gelände trägt die Strömung, ist aber
        # großflächig, und jede Stufe mehr kostet über die ganze Fläche.
        t_level = surface_levels.get("terrain", 1)
        geometry += ('    terrain.stl\n    {\n        type triSurfaceMesh;\n'
                     '        name terrain;\n    }\n')
        refinement_surfaces += ("        terrain\n        {\n"
                                f"            level ({t_level} {t_level});\n"
                                "            patchInfo { type wall; }\n"
                                "        }\n")

    for patch in solid_patches:
        level = surface_levels.get(patch, 2)
        geometry += (f'    {patch}.stl\n    {{\n        type triSurfaceMesh;\n'
                     f'        name {patch};\n    }}\n')
        refinement_surfaces += (f"        {patch}\n        {{\n"
                                f"            level ({level} {level});\n"
                                "            patchInfo { type wall; }\n"
                                "        }\n")

    for r in spec.mesh.refinements:
        if r.type != "box":
            continue
        x0, y0, z0, x1, y1, z1 = r.extent
        geometry += (f'    {r.id}\n    {{\n        type searchableBox;\n'
                     f'        min {vec((x0, y0, z0))};\n'
                     f'        max {vec((x1, y1, z1))};\n    }}\n')
        refinement_regions += (f"        {r.id}\n        {{\n"
                               "            mode inside;\n"
                               f"            levels ((1e15 {r.level}));\n"
                               "        }\n")

    # Kanten der Bauwerksflächen: eine Stufe unter der Flächenverfeinerung
    # reicht, damit die Kante gehalten wird, ohne das Netz zu sprengen
    features = ""
    for name, level in feature_flaechen(spec, solid_patches, has_terrain):
        features += (f'        {{ file "{name}.eMesh"; '
                     f"level {max(level - 1, 0)}; }}\n")

    layers = ""
    bl = spec.mesh.boundary_layers
    if bl and bl.patches:
        for patch in bl.patches:
            layers += (f'        "{patch}"\n        {{\n'
                       f"            nSurfaceLayers {bl.n_layers};\n        }}\n")
    expansion = bl.expansion_ratio if bl else 1.2

    body = f"""castellatedMesh true;
snap            true;
addLayers       {"true" if layers else "false"};

geometry
{{
{geometry}}};

castellatedMeshControls
{{
    maxLocalCells       2000000;
    maxGlobalCells      8000000;
    minRefinementCells  10;
    maxLoadUnbalance    0.10;
    nCellsBetweenLevels 2;

    features
    (
{features}    );

    refinementSurfaces
    {{
{refinement_surfaces}    }};

    resolveFeatureAngle 30;

    refinementRegions
    {{
{refinement_regions}    }};

    locationInMesh {vec(location)};
    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch    3;
    tolerance       2.0;
    nSolveIter      50;
    nRelaxIter      5;
    nFeatureSnapIter 10;
    implicitFeatureSnap true;
    explicitFeatureSnap false;
    multiRegionFeatureSnap false;
}}

addLayersControls
{{
    relativeSizes   true;
    layers
    {{
{layers}    }};
    expansionRatio      {expansion};
    finalLayerThickness 0.3;
    minThickness        0.1;
    nGrow               0;
    featureAngle        60;
    slipFeatureAngle    30;
    nRelaxIter          3;
    nSmoothSurfaceNormals 1;
    nSmoothNormals      3;
    nSmoothThickness    10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle  90;
    nBufferCellsNoExtrude 0;
    nLayerIter          50;
}}

meshQualityControls
{{
    maxNonOrtho         65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave          80;
    minVol              1e-13;
    minTetQuality       1e-15;
    minArea             -1;
    minTwist            0.02;
    minDeterminant      0.001;
    minFaceWeight       0.05;
    minVolRatio         0.01;
    minTriangleTwist    -1;
    nSmoothScale        4;
    errorReduction      0.75;
}}

writeFlags
(
    scalarLevels
);

mergeTolerance 1e-6;"""
    return foam_file("snappyHexMeshDict", body, location="system")


# ── Netz-Qualitätstor ────────────────────────────────────────────────────────
# r007 (2026-08-13): checkMesh fiel durch (Schiefe 7,2, 60 % der Zellen
# fehlten), und der Solver rechnete kommentarlos 2,5 Stunden auf dem kaputten
# Netz. Das Tor sitzt VOR dem Solver: ein durchgefallenes Netz bricht ab,
# bevor Geld verbrannt wird — mit Befunden, die der Nutzer sieht.
NETZ_SKEW_FEHLER = 4.0        # == maxInternalSkewness im snappy-Dict
NETZ_NONORTHO_WARNUNG = 65.0
ZELLEN_ABWEICHUNG_WARNUNG = 0.25


class NetzTorFehler(RuntimeError):
    """Netz taugt nicht — Lauf soll VOR dem Solver enden."""

    def __init__(self, meldung: str, befunde: list[dict]):
        super().__init__(meldung)
        self.befunde = befunde


def netz_tor(cm: dict, vorschau: dict | None = None) -> list[dict]:
    """
    Befunde aus dem checkMesh-Ergebnis (Schema wie validate._finding, plus
    wert/grenze/quelle). Wirft ``NetzTorFehler``, wenn mindestens ein
    ``fehler`` dabei ist.

    ``vorschau``: mesh_preview.json des Falls (cells, ohne_verfeinerung) —
    Zellabweichung ist nur eine WARNUNG (die Vorschau ist laut Entscheidung
    nur eine Vorschau) und wird bei ohne_verfeinerung uebersprungen (dort
    ist die Zellzahl eine bewusste Untergrenze).
    """
    befunde: list[dict] = []

    def b(severity, message, **extra):
        befunde.append({"object_id": "netz", "severity": severity,
                        "message": message, **extra})

    skew = cm.get("max_skewness")
    if skew is not None and float(skew) > NETZ_SKEW_FEHLER:
        b("fehler", f"Zellschiefe {float(skew):g} über der Grenze "
                    f"{NETZ_SKEW_FEHLER:g} — solche Zellen kippen den Solver "
                    "oder verfälschen die Lösung.",
          wert=float(skew), grenze=NETZ_SKEW_FEHLER, quelle="checkmesh")
    if cm.get("failed_checks"):
        b("fehler", f"checkMesh meldet {cm['failed_checks']} durchgefallene "
                    "Prüfung(en).",
          wert=cm["failed_checks"], grenze=0, quelle="checkmesh")
    elif not cm.get("checkmesh_ok"):
        b("fehler", "checkMesh meldet kein »Mesh OK« — Netz unbrauchbar.",
          quelle="checkmesh")
    nonortho = cm.get("max_non_ortho")
    if nonortho is not None and float(nonortho) > NETZ_NONORTHO_WARNUNG:
        b("warnung", f"Nichtorthogonalität {float(nonortho):g}° über "
                     f"{NETZ_NONORTHO_WARNUNG:g}° — Löser braucht mehr "
                     "Korrekturschleifen.",
          wert=float(nonortho), grenze=NETZ_NONORTHO_WARNUNG, quelle="checkmesh")

    if vorschau and not vorschau.get("ohne_verfeinerung"):
        soll = vorschau.get("cells")
        ist = cm.get("cells")
        if soll and ist:
            abw = abs(ist - soll) / soll
            if abw > ZELLEN_ABWEICHUNG_WARNUNG:
                b("warnung",
                  f"Zellzahl weicht {abw * 100:.0f} % von der Netzvorschau ab "
                  f"({ist:,} statt {soll:,}) — die Vorschau ist nur eine "
                  "Vorschau, aber so viel Abstand verdient einen Blick."
                  .replace(",", "."),
                  wert=ist, grenze=soll, quelle="vorschau")

    fehler = [x for x in befunde if x["severity"] == "fehler"]
    if fehler:
        raise NetzTorFehler(
            "Netz-Qualitätstor: " + " | ".join(x["message"] for x in fehler),
            befunde)
    return befunde
