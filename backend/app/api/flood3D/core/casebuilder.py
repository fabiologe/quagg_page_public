"""
casebuilder — vollständige OpenFOAM-Fallstruktur aus der casespec
(Spez. Kap. 3, Stufe 3). Ziel-Dialekt ist die ESI-Variante (openfoam.com),
weil deren Docker-Images das spätere Runner-Muster (Stufe 5) tragen; die
Leser in extract verstehen beide Dialekte.

Der Namenskontrakt der functionObjects ist in extract/readers.py festgelegt
und wird hier erzeugt — forces_<patch>, discharge_<section>, gauge_<gauge>,
water_volume, residuals. Bricht man ihn, findet das PostProzessing die
Ergebnisse nicht mehr; test_stage3 prüft die Kopplung.

Bewusste Stufe-3-Vereinfachung: outflow_fixed_level wird als
Druckrand p_rgh = 0 mit inletOutlet-Alphafeld angesetzt; die exakte
Wasserspiegelhaltung (prghTotalPressure/Wellenauslass) wird in Stufe 5 an
echten Rechenläufen abgestimmt und dann hier nachgezogen.
"""
from __future__ import annotations

import math
import stat
from pathlib import Path

import numpy as np
import pandas as pd

from .casespec import CaseSpec
from .conventions import section_normal
from .foam import foam_file, table, vec
from .meshgen import (assign_faces, blockmesh_dict, feature_flaechen,
                      location_in_mesh, snappy_dict, surface_feature_dict)
from .solids import (build_solids, export_solids, gelaende_koerper_bauen)
from .terrain import TerrainField



# --------------------------------------------------------------------------
# functionObjects (Namenskontrakt zu extract/readers.py)
# --------------------------------------------------------------------------

def _momentbezug(spec: CaseSpec, base_dir, koerper=None) -> dict:
    """
    Fußmitte je Bauwerkspatch als Momentbezugspunkt (x, y aus dem
    Grundrissschwerpunkt, z von der Unterkante). Scheitert der Körperbau,
    bleibt der Punkt weg — die Kraft ist dann trotzdem auswertbar.
    `koerper`: bereits gebaute Solids durchreichen — build_case baute sie
    sonst ZWEIMAL (Boolesche Operationen inklusive).
    """
    if not spec.evaluation.force_patches:
        return {}
    if koerper is None:
        try:
            from .solids import build_solids
            koerper = build_solids(spec, base_dir)
        except Exception:                   # noqa: BLE001
            return {}
    out = {}
    for patch, mesh in koerper.items():
        if patch not in spec.evaluation.force_patches or not len(mesh.faces):
            continue
        c = mesh.centroid
        out[patch] = (float(c[0]), float(c[1]), float(mesh.bounds[0][2]))
    return out


def _fo_series_controls(spec: CaseSpec) -> str:
    return (f"        writeControl    runTime;\n"
            f"        writeInterval   {spec.solver.write_interval_series:g};\n"
            f"        log             no;\n")


def function_objects(spec: CaseSpec, base_dir=".", koerper=None) -> str:
    ctl = _fo_series_controls(spec)
    out = ""

    # Bezugspunkt der Momente: Fußmitte des jeweiligen Bauwerks. Mit dem
    # Ursprung (0 0 0) waeren die Momente das Produkt aus Kraft und
    # Modellkoordinate — eine Zahl ohne Bedeutung. Erst um die Fußkante
    # gerechnet ist es das Kippmoment, das der Standsicherheitsnachweis
    # braucht.
    bezug = _momentbezug(spec, base_dir, koerper)
    for patch in spec.evaluation.force_patches:
        cofr = bezug.get(patch, (0.0, 0.0, 0.0))
        out += f"""    forces_{patch}
    {{
        type            forces;
        libs            (forces);
        patches         ({patch});
        rho             rho;
        CofR            {vec(cofr)};
{ctl}    }}
"""

    z_mid = ((spec.domain.z_min + spec.domain.z_max) / 2) if spec.domain else 0.0
    for sec in spec.evaluation.sections:
        p0 = np.asarray(sec.polyline[0], dtype=float)
        p1 = np.asarray(sec.polyline[-1], dtype=float)
        mid = (p0 + p1) / 2
        n = section_normal(sec.polyline)
        out += f"""    discharge_{sec.id}
    {{
        type            surfaceFieldValue;
        libs            (fieldFunctionObjects);
        regionType      sampledSurface;
        name            {sec.id};
        sampledSurfaceDict
        {{
            type            plane;
            planeType       pointAndNormal;
            pointAndNormalDict
            {{
                point           {vec((mid[0], mid[1], z_mid))};
                normal          {vec((n[0], n[1], 0.0))};
            }}
        }}
        operation       weightedAreaIntegrate;
        fields          (U);
        weightField     alpha.water;
        surfaceFormat   none;
        writeFields     false;
{ctl}    }}
"""

    # Durchfluss ueber die RANDFLAECHEN. Damit schliesst sich die
    # Wasserbilanz aus gemessenen Groessen (Zufluss - Ablauf =
    # Speicheraenderung) statt aus der Vorgabe im Fall — und man sieht
    # sofort, ob ein Lauf noch am Auffuellen ist.
    face_of = {patch: face for face, (patch, _) in assign_faces(spec).items()}
    for b in spec.boundaries:
        if b.type == "atmosphere" or b.patch not in face_of:
            continue
        out += f"""    patchflow_{b.patch}
    {{
        type            surfaceFieldValue;
        libs            (fieldFunctionObjects);
        regionType      patch;
        name            {b.patch};
        operation       weightedAreaIntegrate;
        fields          (U);
        weightField     alpha.water;
        writeFields     false;
{ctl}    }}
"""

    if spec.terrain is not None:
        # Sohlschubspannung auf Gelände- und Bauwerksflächen (Spez. Kap. 2);
        # geschrieben zu den Feld-Ausgabezeitpunkten, gelesen von foamfields.
        patches = " ".join(["terrain"] + [s.patch for s in spec.structures
                                          if s.type != "screen"])
        out += f"""    wall_shear
    {{
        type            wallShearStress;
        libs            (fieldFunctionObjects);
        patches         ({patches});
        // jeden Zeitschritt RECHNEN (sonst laesen die Auswertungen unten
        // ein veraltetes Feld), aber nur zu den Ausgabezeitpunkten SCHREIBEN
        executeControl  timeStep;
        executeInterval 1;
        writeControl    writeTime;
        log             no;
    }}
"""

    # Schubspannung je BAUWERKSflaeche — bisher gab es sie nur auf dem
    # Gelaende. Am Pfeiler und am Wehrruecken entscheidet genau dieser Wert
    # ueber Kolk und Oberflaechenangriff.
    if spec.terrain is not None and any(st.type != "screen"
                                       for st in spec.structures):
        # Betrag zuerst als eigenes Feld: `max` auf einem Vektor waere
        # komponentenweise (und `maxMag` kennt v2406 an dieser Stelle nicht),
        # auf einem Skalar ist es eindeutig.
        out += f"""    tau_betrag
    {{
        type            mag;
        libs            (fieldFunctionObjects);
        field           wallShearStress;
        result          tauMag;
        executeControl  timeStep;
        executeInterval 1;
        writeControl    writeTime;
        log             no;
    }}
"""
    if spec.terrain is not None:
        for st in spec.structures:
            if st.type == "screen":
                continue
            out += f"""    shear_{st.patch}
    {{
        type            surfaceFieldValue;
        libs            (fieldFunctionObjects);
        regionType      patch;
        name            {st.patch};
        operation       max;
        fields          (tauMag);
        writeFields     false;
{ctl}    }}
    shearmean_{st.patch}
    {{
        type            surfaceFieldValue;
        libs            (fieldFunctionObjects);
        regionType      patch;
        name            {st.patch};
        operation       areaAverage;
        fields          (tauMag);
        writeFields     false;
{ctl}    }}
"""

    if spec.evaluation.verweilzeit:
        out += f"""    verweilzeit
    {{
        type            scalarTransport;
        libs            (solverFunctionObjects);
        field           T;
        schemesField    T;
        nCorr           2;
        writeControl    writeTime;
        log             no;
    }}
"""
        for b in spec.boundaries:
            if not b.type.startswith("outflow"):
                continue
            out += f"""    tracer_{b.patch}
    {{
        type            surfaceFieldValue;
        libs            (fieldFunctionObjects);
        regionType      patch;
        name            {b.patch};
        operation       weightedAverage;
        fields          (T);
        weightField     alpha.water;
        writeFields     false;
{ctl}    }}
"""

    for gauge in spec.evaluation.gauges:
        out += f"""    gauge_{gauge.id}
    {{
        type            interfaceHeight;
        libs            (fieldFunctionObjects);
        alpha           alpha.water;
        locations       ({vec((gauge.point[0], gauge.point[1], z_mid))});
{ctl}    }}
"""

    out += f"""    water_volume
    {{
        type            volFieldValue;
        libs            (fieldFunctionObjects);
        operation       volIntegrate;
        fields          (alpha.water);
        writeFields     false;
{ctl}    }}
    residuals
    {{
        type            solverInfo;
        libs            (utilityFunctionObjects);
        fields          (p_rgh U alpha.water);
{ctl}    }}
    y_plus
    {{
        type            yPlus;
        libs            (fieldFunctionObjects);
        writeFields     false;
        writeControl    writeTime;
        log             no;
    }}
"""
    return out


# --------------------------------------------------------------------------
# system/
# --------------------------------------------------------------------------

def control_dict(spec: CaseSpec, base_dir=".", koerper=None) -> str:
    s = spec.solver
    body = f"""application     {s.application};
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {s.end_time:g};
deltaT          0.001;
writeControl    adjustableRunTime;
writeInterval   {s.write_interval_fields:g};
purgeWrite      0;
writeFormat     ascii;
writePrecision  7;
writeCompression on;
timeFormat      general;
timePrecision   6;
runTimeModifiable yes;
adjustTimeStep  yes;
maxCo           {s.max_co:g};
maxAlphaCo      {s.max_alpha_co:g};
maxDeltaT       1;

functions
{{
{function_objects(spec, base_dir, koerper)}}}"""
    return foam_file("controlDict", body, location="system")


_FV_SCHEMES = """ddtSchemes
{
    default         Euler;
}
gradSchemes
{
    // begrenzt: snappy-Netze erreichen an Bauwerkskanten leicht 60°
    // Schiefe, ungebremste Gradienten schaukeln sich dort auf
    default         cellLimited Gauss linear 1;
}
divSchemes
{
    div(rhoPhi,U)   Gauss linearUpwind grad(U);
    div(phi,alpha)  Gauss vanLeer;
    div(phirb,alpha) Gauss linear;
    div(phi,k)      Gauss upwind;
    div(phi,omega)  Gauss upwind;
    div(phi,epsilon) Gauss upwind;
    // Markierungsstoff der Verweilzeit: begrenzt, damit die Front nicht
    // ueberschwingt (Konzentrationen ausserhalb 0…1 waeren sinnlos)
    div(phi,T)      Gauss limitedLinear 1;
    div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes
{
    // "corrected" ist unbegrenzt und nur auf nahezu orthogonalen Netzen
    // stabil; gemessen wurden 59.9° Nichtorthogonalität -> begrenzen
    default         Gauss linear limited corrected 0.33;
}
interpolationSchemes
{
    default         linear;
}
snGradSchemes
{
    default         limited corrected 0.33;
}
wallDist
{
    method          meshWave;
}"""

_FV_SOLUTION = """solvers
{
    T
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-8;
        relTol          0;
    }
    "alpha.water.*"
    {
        nAlphaCorr      2;
        nAlphaSubCycles 1;
        cAlpha          1;
        MULESCorr       yes;
        nLimiterIter    3;
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0;
    }
    "pcorr.*"
    {
        solver          PCG;
        preconditioner  DIC;
        tolerance       1e-5;
        relTol          0;
    }
    p_rgh
    {
        solver          GAMG;
        smoother        DIC;
        tolerance       1e-7;
        relTol          0.05;
    }
    p_rghFinal
    {
        $p_rgh;
        relTol          0;
    }
    "(U|k|omega|epsilon).*"
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-6;
        relTol          0;
    }
}

PIMPLE
{
    momentumPredictor   no;
    nOuterCorrectors    1;
    nCorrectors         3;
    nNonOrthogonalCorrectors 2;
}

relaxationFactors
{
    equations
    {
        ".*"            1;
    }
}"""


def set_fields_dict(spec: CaseSpec, out: Path | None = None) -> str | None:
    """
    Anfangszustand: global `initial_level` (boxToCell), darüber je
    Vorfüllung ein Teilbereich mit EIGENEM Spiegel — das Polygon wird als
    Prisma extrudiert (STL neben den Fall) und surfaceToCell setzt alpha.
    Reihenfolge: Vorfüllungen NACH der Box, spätere überschreiben frühere.
    """
    vorf = spec.solver.vorfuellungen
    if spec.solver.initial_level is None and not vorf:
        return None
    x0, y0, x1, y1 = spec.domain.extent
    regionen = []
    if spec.solver.initial_level is not None:
        regionen.append(f"""    boxToCell
    {{
        box {vec((x0 - 1, y0 - 1, spec.domain.z_min - 1))} {vec((x1 + 1, y1 + 1, spec.solver.initial_level))};
        fieldValues
        (
            volScalarFieldValue alpha.water 1
        );
    }}""")
    for v in vorf:
        import shapely as _sh

        from .solids import _extrude
        name = f"vorfuellung_{v.id}.stl"
        if out is not None:
            prisma = _extrude(_sh.Polygon(v.polygon),
                              spec.domain.z_min - 1.0, float(v.level))
            ziel = out / "constant" / "triSurface" / name
            ziel.parent.mkdir(parents=True, exist_ok=True)
            prisma.export(ziel)
        # outsidePoint sicher außerhalb des Prismas: über dem Deckel
        aussen = vec((x0 - 0.5, y0 - 0.5, spec.domain.z_max + 0.5))
        regionen.append(f"""    surfaceToCell
    {{
        file "constant/triSurface/{name}";
        outsidePoints ({aussen});
        includeCut true;
        includeInside true;
        includeOutside false;
        nearDistance -1;
        curvature -100;
        useSurfaceOrientation false;
        fieldValues
        (
            volScalarFieldValue alpha.water 1
        );
    }}""")
    body = ("defaultFieldValues\n(\n    volScalarFieldValue alpha.water 0\n"
            ");\n\nregions\n(\n" + "\n".join(regionen) + "\n);")
    return foam_file("setFieldsDict", body, location="system")


# ---- Zu-/Ablauf-Fenster (Spez.: Randbedingung wirkt nur auf Teilfläche) --

def _bc_face(spec: CaseSpec, b) -> str | None:
    """Gebietsrand der Randbedingung (inkl. Vorbelegungslogik)."""
    for face, (patch, _t) in assign_faces(spec).items():
        if patch == b.patch:
            return face
    return None


def _follow_channel(spec: CaseSpec, w):
    """channel_carve-Operation zu window.follow, oder None."""
    if spec.terrain is None or w.follow is None:
        return None
    for op in spec.terrain.operations:
        if op.id == w.follow and op.type == "channel_carve":
            return op
    return None


def _follow_culvert(spec: CaseSpec, w):
    """Durchlass/Stutzen (culvert) zu window.follow, oder None."""
    if w.follow is None:
        return None
    for s in spec.structures:
        if s.id == w.follow and s.type == "culvert":
            return s
    return None


def _culvert_end(spec: CaseSpec, face: str, cv) -> tuple[float, tuple]:
    """Achsende des Durchlasses, das der Randfläche am nächsten liegt."""
    x0, y0, x1, y1 = spec.domain.extent
    plane = {"x_min": x0, "x_max": x1, "y_min": y0, "y_max": y1}[face]
    axis = 0 if face.startswith("x") else 1
    ends = [cv.axis[0], cv.axis[-1]]
    pt = min(ends, key=lambda p: abs(p[axis] - plane))
    return abs(pt[axis] - plane), pt


def _follow_end(spec: CaseSpec, face: str, ch) -> tuple[float, tuple, float]:
    """
    Gerinne-Ende an der Randfläche: (Abstand zur Fläche, Endpunkt,
    Sohlhöhe an diesem Ende). invert_start gehört zu polyline[0].
    """
    x0, y0, x1, y1 = spec.domain.extent
    plane = {"x_min": x0, "x_max": x1, "y_min": y0, "y_max": y1}[face]
    axis = 0 if face.startswith("x") else 1
    ends = [(ch.polyline[0], ch.invert_start),
            (ch.polyline[-1], ch.invert_end)]
    pt, invert = min(ends, key=lambda e: abs(e[0][axis] - plane))
    return abs(pt[axis] - plane), pt, invert


def resolve_window(spec: CaseSpec, b) -> dict | None:
    """
    Wirksames Fenster als dict: shape (rechteck | kreis | trapez) plus
    lo/hi/zlo/zhi als umschließendes Rechteck (z None = volle Höhe, nur
    bei rechteck). kreis zusätzlich center/zc/d, trapez center/bw/tw und
    z_w0/z_w1 (z-Bereich, über den die Breite von bw nach tw läuft).
    Bei follow leitet sich ein Trapez aus dem Gerinnequerschnitt am Rand
    ab: Sohlbreite an der Sohle, Sohle + beide Böschungen an der
    Einschnittkante, Sohlhöhe mit 0.2 m Reserve nach unten. None wenn
    kein auflösbares Fenster — fehlendes Gerinne oder ein Ende abseits
    des Rands meldet validate mit konkretem Befund.
    """
    w = getattr(b, "window", None)
    if w is None:
        return None
    face = _bc_face(spec, b)
    if face is None or face == "z_max":
        return None
    x0, y0, x1, y1 = spec.domain.extent
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
    if w.follow is not None:
        limit = 2 * (spec.mesh.base_cell if spec.mesh else 1.0)
        ch = _follow_channel(spec, w)
        if ch is not None:
            dist, pt, invert = _follow_end(spec, face, ch)
            if dist > limit:
                return None
            c = pt[1] if face.startswith("x") else pt[0]
            bw = ch.bottom_width
            tw = bw + 2 * ch.side_slope * ch.depth
            lo, hi = max(c - tw / 2, e0), min(c + tw / 2, e1)
            if hi - lo <= 0:
                return None
            zlo = w.z_min if w.z_min is not None else invert - 0.2
            zhi = w.z_max if w.z_max is not None else invert + ch.depth
            return {"shape": "trapez", "lo": lo, "hi": hi, "zlo": zlo,
                    "zhi": zhi, "center": c, "bw": bw, "tw": tw,
                    "z_w0": invert, "z_w1": invert + ch.depth}
        # Stufe C — Stutzen: das Fenster ist der Rohr-INNENquerschnitt am
        # Anschlussende der Durchlass-Achse; das Rohr selbst ist Wand und
        # führt den Strahl gerichtet ins Gebiet
        cv = _follow_culvert(spec, w)
        if cv is None:
            return None
        dist, pt = _culvert_end(spec, face, cv)
        if dist > limit:
            return None
        c = pt[1] if face.startswith("x") else pt[0]
        zc = pt[2]
        if cv.profile.kind == "circular":
            d = cv.profile.diameter
            return {"shape": "kreis", "lo": c - d / 2, "hi": c + d / 2,
                    "zlo": zc - d / 2, "zhi": zc + d / 2,
                    "center": c, "zc": zc, "d": d}
        bw = cv.profile.width
        hh = cv.profile.height
        return {"shape": "rechteck", "lo": c - bw / 2, "hi": c + bw / 2,
                "zlo": zc - hh / 2, "zhi": zc + hh / 2}
    if w.shape == "kreis":
        if w.center is None or w.z_center is None or w.diameter is None:
            return None
        r = w.diameter / 2
        return {"shape": "kreis", "lo": w.center - r, "hi": w.center + r,
                "zlo": w.z_center - r, "zhi": w.z_center + r,
                "center": w.center, "zc": w.z_center, "d": w.diameter}
    if w.shape == "trapez":
        if (w.center is None or w.bottom_width is None
                or w.top_width is None or w.z_min is None or w.z_max is None):
            return None
        half = max(w.bottom_width, w.top_width) / 2
        return {"shape": "trapez", "lo": w.center - half,
                "hi": w.center + half, "zlo": w.z_min, "zhi": w.z_max,
                "center": w.center, "bw": w.bottom_width,
                "tw": w.top_width, "z_w0": w.z_min, "z_w1": w.z_max}
    if w.shape == "polygon":
        if not w.points or len(w.points) < 3:
            return None
        a = [p[0] for p in w.points]
        z = [p[1] for p in w.points]
        return {"shape": "polygon", "lo": min(a), "hi": max(a),
                "zlo": min(z), "zhi": max(z), "points": list(w.points)}
    if w.span is None:
        return None
    lo, hi = sorted(w.span)
    return {"shape": "rechteck", "lo": lo, "hi": hi,
            "zlo": w.z_min, "zhi": w.z_max}


def _window_active(spec: CaseSpec, b) -> bool:
    """
    Fenster nur dann wirksam, wenn es die Fläche wirklich beschneidet —
    ein Fenster über die volle Kante und Höhe ist ein No-op (kein
    createPatch nötig, Verhalten wie ohne Fenster).
    """
    r = resolve_window(spec, b)
    if r is None:
        return False
    face = _bc_face(spec, b)
    x0, y0, x1, y1 = spec.domain.extent
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
    full_edge = r["lo"] <= e0 + 1e-6 and r["hi"] >= e1 - 1e-6
    full_z = ((r["zlo"] is None or r["zlo"] <= spec.domain.z_min + 1e-6)
              and (r["zhi"] is None or r["zhi"] >= spec.domain.z_max - 1e-6))
    return not (full_edge and full_z)


def _face_box(spec: CaseSpec, face: str, lo: float, hi: float,
              zlo: float, zhi: float) -> tuple[tuple, tuple]:
    """Achsparallele Suchbox auf der Randfläche, quer zur Fläche gepolstert."""
    x0, y0, x1, y1 = spec.domain.extent
    if face == "x_min":
        return (x0 - 0.5, lo, zlo), (x0 + 0.5, hi, zhi)
    if face == "x_max":
        return (x1 - 0.5, lo, zlo), (x1 + 0.5, hi, zhi)
    if face == "y_min":
        return (lo, y0 - 0.5, zlo), (hi, y0 + 0.5, zhi)
    return (lo, y1 - 0.5, zlo), (hi, y1 + 0.5, zhi)


def _poly_intervals(pts, z: float) -> list[tuple[float, float]]:
    """Schnittintervalle eines geschlossenen Polygons mit der Höhe z."""
    xs = []
    n = len(pts)
    for i in range(n):
        a0, z0 = pts[i]
        a1, z1 = pts[(i + 1) % n]
        if (z0 <= z) != (z1 <= z):
            t = (z - z0) / (z1 - z0)
            xs.append(a0 + t * (a1 - a0))
    xs.sort()
    return list(zip(xs[0::2], xs[1::2]))


def _window_delete_actions(spec: CaseSpec, b, set_name: str) -> str:
    """
    topoSet-delete-Aktionen, die das Fenster aus dem Patch-faceSet
    ausstanzen. rechteck = eine Box; kreis = Zylinder quer durch die
    Wand (cylinderToFace); trapez = Boxstreifen je Zellschicht — exakt
    in der Auflösung, in der das Netz die Form ohnehin abbildet.
    """
    r = resolve_window(spec, b)
    face = _bc_face(spec, b)
    x0, y0, x1, y1 = spec.domain.extent
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)

    def delete(source: str) -> str:
        return (f"    {{\n        name    {set_name};\n"
                f"        type    faceSet;\n        action  delete;\n"
                f"{source}    }}\n")

    def box_source(lo, hi, zlo, zhi) -> str:
        blo, bhi = _face_box(spec, face, lo, hi, zlo, zhi)
        return (f"        source  boxToFace;\n"
                f"        box     {vec(blo)} {vec(bhi)};\n")

    if r["shape"] == "kreis":
        plane = {"x_min": x0, "x_max": x1, "y_min": y0, "y_max": y1}[face]
        if face.startswith("x"):
            p1 = (plane - 0.5, r["center"], r["zc"])
            p2 = (plane + 0.5, r["center"], r["zc"])
        else:
            p1 = (r["center"], plane - 0.5, r["zc"])
            p2 = (r["center"], plane + 0.5, r["zc"])
        return delete(f"        source  cylinderToFace;\n"
                      f"        p1      {vec(p1)};\n"
                      f"        p2      {vec(p2)};\n"
                      f"        radius  {r['d'] / 2:g};\n")

    if r["shape"] in ("trapez", "polygon"):
        # Zellschicht-Streifen: exakt die Auflösung, in der das Netz die
        # Form ohnehin abbildet; polygon per Scanline (auch konkav)
        cell = spec.mesh.base_cell
        zdom = spec.domain.z_min
        k0 = math.floor((r["zlo"] - zdom) / cell)
        k1 = math.ceil((r["zhi"] - zdom) / cell)
        out = ""
        for k in range(k0, k1):
            za = max(zdom + k * cell, r["zlo"])
            zb = min(zdom + (k + 1) * cell, r["zhi"])
            if zb - za <= 1e-9:
                continue
            zm = (za + zb) / 2
            if r["shape"] == "polygon":
                intervals = _poly_intervals(r["points"], zm)
            else:
                span_w = r["z_w1"] - r["z_w0"]
                t = 0.0 if span_w <= 0 else (zm - r["z_w0"]) / span_w
                t = min(max(t, 0.0), 1.0)
                width = r["bw"] + (r["tw"] - r["bw"]) * t
                intervals = [(r["center"] - width / 2, r["center"] + width / 2)]
            for ilo, ihi in intervals:
                lo = max(ilo, e0)
                hi = min(ihi, e1)
                if hi - lo <= 0:
                    continue
                out += delete(box_source(lo, hi, za, zb))
        return out

    zlo = r["zlo"] if r["zlo"] is not None else spec.domain.z_min - 0.5
    zhi = r["zhi"] if r["zhi"] is not None else spec.domain.z_max + 0.5
    return delete(box_source(r["lo"], r["hi"], zlo, zhi))


def _windowed_bcs(spec: CaseSpec) -> list:
    return [b for b in spec.boundaries if _window_active(spec, b)]


def topo_set_dict(spec: CaseSpec) -> str | None:
    screens = [s for s in spec.structures if s.type == "screen"]
    windows = _windowed_bcs(spec)
    if not screens and not windows:
        return None
    actions = ""
    # Fenster: Flächen des Randpatches AUSSERHALB des Fensters sammeln —
    # createPatch macht daraus die Wand randwand_<id>
    for b in windows:
        actions += f"""    {{
        name    {b.id}WinOut;
        type    faceSet;
        action  new;
        source  patchToFace;
        patch   {b.patch};
    }}
"""
        actions += _window_delete_actions(spec, b, f"{b.id}WinOut")
    for s in screens:
        pts = np.asarray(s.plane_polygon, dtype=float)
        origin = pts[0]
        i_vec = pts[1] - pts[0]
        j_vec = pts[-1] - pts[0]
        k_vec = np.cross(i_vec, j_vec)
        k_norm = np.linalg.norm(k_vec)
        if k_norm > 0:
            k_vec = k_vec / k_norm * 0.15   # Zonentiefe in Anströmrichtung
        actions += f"""    {{
        name    {s.id}Cells;
        type    cellSet;
        action  new;
        source  rotatedBoxToCell;
        origin  {vec(origin)};
        i       {vec(i_vec)};
        j       {vec(j_vec)};
        k       {vec(k_vec)};
    }}
    {{
        name    {s.id}Zone;
        type    cellZoneSet;
        action  new;
        source  setToCellZone;
        set     {s.id}Cells;
    }}
"""
    return foam_file("topoSetDict", f"actions\n(\n{actions});", location="system")


def create_patch_dict(spec: CaseSpec) -> str | None:
    """Restfläche jedes Fenster-Randpatches wird zur Wand randwand_<id>."""
    windows = _windowed_bcs(spec)
    if not windows:
        return None
    patches = ""
    for b in windows:
        patches += f"""    {{
        name            randwand_{b.id};
        patchInfo
        {{
            type            wall;
        }}
        constructFrom   set;
        set             {b.id}WinOut;
    }}
"""
    body = f"pointSync       false;\n\npatches\n(\n{patches});"
    return foam_file("createPatchDict", body, location="system")


# Kirschmer-Formbeiwerte β je Stabform (DWA/klassisch): Verlust
# ζ = β (Stabdicke / lichte Weite)^(4/3) · sin α
_KIRSCHMER_BETA = {"rechteck": 2.42, "rund": 1.79, "tropfen": 0.76}


def _screen_resistance(s) -> tuple[tuple, tuple]:
    """d/f-Vektoren; ohne explizite Vorgabe aus Kirschmer + Stabform."""
    d = tuple(s.resistance.d)
    f = tuple(s.resistance.f)
    if not any(d) and not any(f):
        clear = max(s.bar_spacing - s.bar_thickness, 1e-4)
        beta = _KIRSCHMER_BETA.get(s.bar_shape, 2.42)
        zeta = beta * (s.bar_thickness / clear) ** (4 / 3) \
            * math.sin(math.radians(s.approach_angle_deg))
        f = (zeta / max(s.bar_depth, 1e-3), 0.0, 0.0)
    return d, f


def fv_options(spec: CaseSpec) -> str | None:
    screens = [s for s in spec.structures if s.type == "screen"]
    if not screens:
        return None
    body = ""
    for s in screens:
        pts = np.asarray(s.plane_polygon, dtype=float)
        i_vec = pts[1] - pts[0]
        j_vec = pts[-1] - pts[0]
        normal = np.cross(i_vec, j_vec)
        normal = normal / (np.linalg.norm(normal) or 1.0)
        e2 = i_vec / (np.linalg.norm(i_vec) or 1.0)
        # Verlegungsgrad wirkt als Kontraktion: Widerstand ~ 1/(1-a)²
        blockage = min(s.resistance.blockage_ratio, 0.95)
        factor = 1.0 / (1.0 - blockage) ** 2
        d_raw, f_raw = _screen_resistance(s)
        d = tuple(x * factor for x in d_raw)
        f = tuple(x * factor for x in f_raw)
        body += f"""{s.id}_porosity
{{
    type            explicitPorositySource;
    active          true;
    explicitPorositySourceCoeffs
    {{
        selectionMode   cellZone;
        cellZone        {s.id}Zone;
        type            DarcyForchheimer;
        d               {vec(d)};
        f               {vec(f)};
        coordinateSystem
        {{
            origin          {vec(pts[0])};
            e1              {vec(normal)};
            e2              {vec(e2)};
        }}
    }}
}}
"""
    return foam_file("fvOptions", body, location="constant")


# --------------------------------------------------------------------------
# 0/ Randbedingungen
# --------------------------------------------------------------------------

def _inflow_rate_entry(b, base_dir: Path) -> str:
    if b.type == "inflow_constant":
        return f"constant {b.q:g}"
    csv = base_dir / b.source
    df = pd.read_csv(csv)
    pairs = list(zip(df[b.column_time], df[b.column_q]))
    return table(pairs)


def _field_file(name: str, dimensions: str, internal: str,
                entries: dict[str, str], default_wall: str) -> str:
    bf = ""
    for patch, entry in entries.items():
        bf += f"    {patch}\n    {{\n{entry}    }}\n"
    bf += f'    ".*"\n    {{\n{default_wall}    }}\n'
    body = (f"dimensions      {dimensions};\n\n"
            f"internalField   {internal};\n\n"
            f"boundaryField\n{{\n{bf}}}")
    return foam_file(name, body, class_="volScalarField"
                     if "(" not in internal else "volVectorField", location="0")


# Äquivalente Sandrauheit k_s (m) je Oberflächenmaterial — Größenordnungen
# nach Schlichting/DVWK: Stahl gezogen, Beton geschalt/roh, Bruchstein-
# mauerwerk, Holz gehobelt, Erdböschung, Steinschüttung/Riprap
MATERIAL_KS = {
    "stahl": 0.0001,
    "beton_glatt": 0.0005,
    "beton": 0.002,
    "mauerwerk": 0.005,
    "holz": 0.0008,
    "erde": 0.03,
    "steinschuettung": 0.1,
}


# Dichte des Wassers. Muss mit constant/transportProperties übereinstimmen —
# der feste Unterwasserstand rechnet p_rgh = rho*g*(L - hRef), und wenn der
# Randdruck mit einer anderen Dichte gebildet wird als der Solver rechnet,
# stellt sich ein anderer Wasserspiegel ein als angegeben.
RHO_WASSER = 1000.0


def h_ref(spec: CaseSpec) -> float:
    """
    Bezugshöhe für p_rgh. Sie wird auf den ERSTEN festen Ablaufpegel gelegt:
    dann ist der vorzuschreibende Druck dort exakt null und gilt für Wasser
    UND Luft gleichermaßen. Ohne festen Pegel bleibt sie null (Standard).
    """
    for b in spec.boundaries:
        if b.type == "outflow_fixed_level":
            return float(b.level)
    return 0.0


def _rough_nut(ks: float) -> str:
    return (f"        type            nutkRoughWallFunction;\n"
            f"        Ks              uniform {ks:g};\n"
            f"        Cs              uniform 0.5;\n"
            f"        value           uniform 0;\n")


def initial_fields(spec: CaseSpec, base_dir: Path) -> dict[str, str]:
    inflows = [b for b in spec.boundaries
               if b.type in ("inflow_hydrograph", "inflow_constant")]
    outflows = [b for b in spec.boundaries
                if b.type.startswith("outflow")]
    atmos = [b for b in spec.boundaries if b.type == "atmosphere"]

    u, alpha, p = {}, {}, {}
    k_f, omega_f, nut_f = {}, {}, {}

    for b in inflows:
        rate = _inflow_rate_entry(b, base_dir)
        u[b.patch] = (f"        type            flowRateInletVelocity;\n"
                      f"        volumetricFlowRate {rate};\n"
                      f"        value           uniform (0 0 0);\n")
        alpha[b.patch] = "        type            fixedValue;\n        value           uniform 1;\n"
        p[b.patch] = "        type            fixedFluxPressure;\n        value           uniform 0;\n"
        k_f[b.patch] = "        type            fixedValue;\n        value           uniform 1e-4;\n"
        omega_f[b.patch] = "        type            fixedValue;\n        value           uniform 1;\n"
        nut_f[b.patch] = "        type            calculated;\n        value           uniform 0;\n"

    href = h_ref(spec)
    for b in outflows + atmos:
        u[b.patch] = ("        type            pressureInletOutletVelocity;\n"
                      "        value           uniform (0 0 0);\n")
        alpha[b.patch] = ("        type            inletOutlet;\n"
                          "        inletValue      uniform 0;\n"
                          "        value           uniform 0;\n")
        p[b.patch] = ("        type            totalPressure;\n"
                      "        p0              uniform 0;\n"
                      "        value           uniform 0;\n")
        if b.type == "outflow_constant":
            # Vorgegebener Drosselabfluss: die Geschwindigkeit folgt aus dem
            # Volumenstrom, der Druck stellt sich dazu ein. Genau die
            # Randbedingung für die Frage, was VOR dem Rohr passiert.
            u[b.patch] = (f"        type            flowRateOutletVelocity;\n"
                          f"        volumetricFlowRate {b.q:g};\n"
                          f"        value           uniform (0 0 0);\n")
            p[b.patch] = ("        type            fixedFluxPressure;\n"
                          "        value           uniform 0;\n")
            alpha[b.patch] = "        type            zeroGradient;\n"
        elif b.type == "outflow_fixed_level":
            # Fester Unterwasserstand. p_rgh = p - rho*g*(z - hRef); für eine
            # ruhende Wassersäule mit Spiegel L ist das KONSTANT und gleich
            # rho*g*(L - hRef) — deshalb genügt ein fester Wert auf dem Patch.
            # Mit hRef = L (siehe h_ref) wird er null und gilt zugleich für
            # die Luft darüber, die dann ihren eigenen, sehr kleinen
            # hydrostatischen Verlauf behält.
            wert = RHO_WASSER * 9.81 * (b.level - href)
            p[b.patch] = (f"        type            fixedValue;\n"
                          f"        value           uniform {wert:.6g};\n")
            # Wasser darf hinaus und wieder herein — inletOutlet würde von
            # außen ausschließlich Luft nachziehen und den Pegel leersaugen.
            alpha[b.patch] = ("        type            variableHeightFlowRate;\n"
                              "        lowerBound      0;\n"
                              "        upperBound      1;\n"
                              "        value           uniform 0;\n")
        k_f[b.patch] = ("        type            inletOutlet;\n"
                        "        inletValue      uniform 1e-4;\n"
                        "        value           uniform 1e-4;\n")
        omega_f[b.patch] = ("        type            inletOutlet;\n"
                            "        inletValue      uniform 1;\n"
                            "        value           uniform 1;\n")
        nut_f[b.patch] = "        type            calculated;\n        value           uniform 0;\n"

    wall_u = "        type            noSlip;\n"
    wall_alpha = "        type            zeroGradient;\n"
    wall_p = "        type            fixedFluxPressure;\n        value           uniform 0;\n"
    wall_k = "        type            kqRWallFunction;\n        value           uniform 1e-4;\n"
    wall_omega = "        type            omegaWallFunction;\n        value           uniform 1;\n"
    wall_nut = "        type            nutkWallFunction;\n        value           uniform 0;\n"

    # Material -> Sandrauheit: raue Wandfunktion auf dem jeweiligen Patch;
    # material_ks (m) überschreibt den Katalogwert des Materials
    for st in spec.structures:
        # Ein Rechen hat keine eigene Fläche im Netz (er wirkt als poröse
        # Zone). Ein Rauheitseintrag für seinen Patch ginge ins Leere und
        # stünde als Geisterrandbedingung in 0/nut.
        if st.type == "screen":
            continue
        ks = (getattr(st, "material_ks", None)
              or MATERIAL_KS.get(getattr(st, "material", None) or ""))
        if ks:
            nut_f[st.patch] = _rough_nut(ks)
    if spec.terrain is not None:
        t_ks = (spec.terrain.material_ks
                or MATERIAL_KS.get(spec.terrain.material or ""))
        if t_ks:
            nut_f["terrain"] = _rough_nut(t_ks)

    felder = {
        "U": _field_file("U", "[0 1 -1 0 0 0 0]", "uniform (0 0 0)", u, wall_u),
        "alpha.water": _field_file("alpha.water", "[0 0 0 0 0 0 0]", "uniform 0",
                                   alpha, wall_alpha),
        "p_rgh": _field_file("p_rgh", "[1 -1 -2 0 0 0 0]", "uniform 0", p, wall_p),
        "k": _field_file("k", "[0 2 -2 0 0 0 0]", "uniform 1e-4", k_f, wall_k),
        "omega": _field_file("omega", "[0 0 -1 0 0 0 0]", "uniform 1",
                             omega_f, wall_omega),
        "nut": _field_file("nut", "[0 2 -1 0 0 0 0]", "uniform 0", nut_f, wall_nut),
    }
    if spec.solver.turbulence == "kEpsilon":
        # kEpsilon rechnet mit epsilon statt omega. Ohne dieses Feld startet
        # der Solver gar nicht — das Modell war im Schema wählbar und
        # erzeugte einen unvollständigen Fall.
        eps_f = {pt: eintrag.replace("omega", "epsilon")
                 for pt, eintrag in omega_f.items()}
        wall_eps = ("        type            epsilonWallFunction;\n"
                    "        value           uniform 1;\n")
        felder["epsilon"] = _field_file("epsilon", "[0 2 -3 0 0 0 0]",
                                        "uniform 1", eps_f, wall_eps)
    if spec.evaluation.verweilzeit:
        # Markierungsstoff: das Gebiet startet unmarkiert, ab t = 0 tritt
        # markiertes Wasser ein. Am Ablauf abgelesen ergibt das die
        # Durchbruchskurve, aus der Verweilzeit und Kurzschluss folgen.
        t_bc = {}
        for b in inflows:
            t_bc[b.patch] = ("        type            fixedValue;\n"
                             "        value           uniform 1;\n")
        for b in outflows + atmos:
            t_bc[b.patch] = ("        type            inletOutlet;\n"
                             "        inletValue      uniform 0;\n"
                             "        value           uniform 0;\n")
        felder["T"] = _field_file("T", "[0 0 0 0 0 0 0]", "uniform 0", t_bc,
                                  "        type            zeroGradient;\n")
    return felder


# --------------------------------------------------------------------------
# constant/
# --------------------------------------------------------------------------

_TRANSPORT = """phases (water air);

water
{
    transportModel  Newtonian;
    nu              1e-06;
    rho             1000;
}

air
{
    transportModel  Newtonian;
    nu              1.48e-05;
    rho             1;
}

sigma           0.07;"""


def turbulence_properties(spec: CaseSpec) -> str:
    if spec.solver.turbulence == "laminar":
        body = "simulationType  laminar;"
    else:
        body = (f"simulationType  RAS;\n\nRAS\n{{\n"
                f"    RASModel        {spec.solver.turbulence};\n"
                "    turbulence      on;\n    printCoeffs     on;\n}")
    return foam_file("turbulenceProperties", body, location="constant")


_ALLRUN = """#!/bin/sh
# Erzeugt vom flood3D casebuilder — Netz, Initialisierung, Rechenlauf.
cd "$(dirname "$0")" || exit 1

blockMesh > log.blockMesh 2>&1 || {{ echo "blockMesh fehlgeschlagen"; exit 1; }}
{features}snappyHexMesh -overwrite > log.snappyHexMesh 2>&1 || {{ echo "snappyHexMesh fehlgeschlagen"; exit 1; }}
{toposet}checkMesh > log.checkMesh 2>&1
{setfields}{application} > log.{application} 2>&1
"""


# --------------------------------------------------------------------------
# Gesamtaufbau
# --------------------------------------------------------------------------

def build_case(spec: CaseSpec, out_dir: str | Path,
               base_dir: str | Path = ".") -> dict:
    if spec.domain is None or spec.mesh is None:
        raise ValueError("casespec ohne domain/mesh — für den Fallaufbau "
                         "sind Modellgebiet und Netzangaben erforderlich")
    out = Path(out_dir)
    base_dir = Path(base_dir)
    (out / "system").mkdir(parents=True, exist_ok=True)
    (out / "constant" / "triSurface").mkdir(parents=True, exist_ok=True)
    (out / "0").mkdir(exist_ok=True)

    problems: list[str] = []

    # Gelände und Bauwerke (maßgebliche Geometrie entsteht hier, Spez. Kap. 3)
    terrain = None
    if spec.terrain is not None:
        terrain = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
        # Regelfall: das Gelände ist eine offene Höhenfläche. Ein
        # importierter Geländekörper oder ein Rohr, das WIRKLICH durch den
        # Damm gehen soll, verlangen dagegen einen Volumenkörper — ein
        # Höhenfeld kann keinen Hohlraum haben (ein z je x/y).
        gebohrt = gelaende_koerper_bauen(terrain, spec, hinweise=problems,
                                            base_dir=base_dir)
        if gebohrt is not None:
            gebohrt.export(out / "constant" / "triSurface" / "terrain.stl")
        else:
            terrain.to_stl(out / "constant" / "triSurface" / "terrain.stl")
    # Sich durchdringende Körper werden hier entflochten (gleiche
    # Wasserberandung, aber keine doppelt belegten Flächen für snappy) —
    # was dabei passiert ist, steht als Notiz im Ergebnis.
    notizen: list[str] = []
    solids = build_solids(spec, base_dir, hinweise=notizen)
    problems += export_solids(solids, out / "constant" / "triSurface")

    # system/
    (out / "system" / "blockMeshDict").write_text(blockmesh_dict(spec))
    loc = location_in_mesh(spec, terrain.sample if terrain else None)
    (out / "system" / "snappyHexMeshDict").write_text(
        snappy_dict(spec, sorted(solids), terrain is not None, loc))
    # Kanten der Bauwerksflächen vorab herausziehen — ohne sie fängt
    # snappyHexMesh eine Wehrkrone nur zufällig über den Winkel
    kanten = feature_flaechen(spec, sorted(solids), terrain is not None)
    sfe = surface_feature_dict(kanten)
    if sfe is not None:
        (out / "system" / "surfaceFeatureExtractDict").write_text(sfe)
    (out / "system" / "controlDict").write_text(
        control_dict(spec, base_dir, solids))
    (out / "system" / "fvSchemes").write_text(
        foam_file("fvSchemes", _FV_SCHEMES, location="system"))
    (out / "system" / "fvSolution").write_text(
        foam_file("fvSolution", _FV_SOLUTION, location="system"))
    (out / "system" / "decomposeParDict").write_text(foam_file(
        "decomposeParDict",
        "numberOfSubdomains 4;\n\nmethod          scotch;", location="system"))

    sf = set_fields_dict(spec, out)
    if sf:
        (out / "system" / "setFieldsDict").write_text(sf)
    ts = topo_set_dict(spec)
    if ts:
        (out / "system" / "topoSetDict").write_text(ts)
    cp = create_patch_dict(spec)
    if cp:
        (out / "system" / "createPatchDict").write_text(cp)
    fv = fv_options(spec)
    if fv:
        (out / "constant" / "fvOptions").write_text(fv)

    # constant/
    (out / "constant" / "hRef").write_text(foam_file(
        "hRef", f"dimensions      [0 1 0 0 0 0 0];\nvalue           "
                f"{h_ref(spec):.6g};",
        class_="uniformDimensionedScalarField", location="constant"))
    (out / "constant" / "g").write_text(foam_file(
        "g", "dimensions      [0 1 -2 0 0 0 0];\nvalue           (0 0 -9.81);",
        class_="uniformDimensionedVectorField", location="constant"))
    (out / "constant" / "transportProperties").write_text(
        foam_file("transportProperties", _TRANSPORT, location="constant"))
    (out / "constant" / "turbulenceProperties").write_text(
        turbulence_properties(spec))

    # 0/
    for name, content in initial_fields(spec, base_dir).items():
        (out / "0" / name).write_text(content)

    # Allrun
    mesh_steps = ""
    if ts:
        mesh_steps += "topoSet > log.topoSet 2>&1\n"
    if cp:
        mesh_steps += "createPatch -overwrite > log.createPatch 2>&1\n"
    allrun = _ALLRUN.format(
        application=spec.solver.application,
        toposet=mesh_steps,
        features=("surfaceFeatureExtract > log.surfaceFeatureExtract 2>&1\n"
                  if sfe is not None else ""),
        setfields="setFields > log.setFields 2>&1\n" if sf else "")
    allrun_path = out / "Allrun"
    allrun_path.write_text(allrun)
    allrun_path.chmod(allrun_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP)

    return {
        "case_dir": str(out),
        "case_hash": spec.case_hash(),
        # getrennt, weil die Netzvorschau nur hierauf reagieren darf
        "netz_hash": spec.netz_hash(),
        "terrain": terrain is not None,
        "solids": sorted(solids),
        "screens": [s.id for s in spec.structures if s.type == "screen"],
        "faces": {f: p for f, (p, _) in assign_faces(spec).items()},
        "location_in_mesh": loc,
        "problems": problems,
        "notes": notizen,
    }
