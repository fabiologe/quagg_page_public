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

from .casespec import CaseSpec, DomainFace
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


def location_in_mesh(spec: CaseSpec, terrain_sample) -> tuple[float, float, float]:
    """
    Punkt im Strömungsgebiet: nahe dem Zuflussrand, mittig in y, vertikal
    zwischen Gelände und Gebietsoberkante. terrain_sample(x, y) -> z oder
    None wenn kein Gelände definiert ist.
    """
    x0, y0, x1, y1 = spec.domain.extent
    x = x0 + (x1 - x0) * 0.15
    y = (y0 + y1) / 2
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
