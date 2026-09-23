"""
casebuilder — vollständige OpenFOAM-Fallstruktur aus der casespec
(Spez. Kap. 3, Stufe 3). Ziel-Dialekt ist die ESI-Variante (openfoam.com),
weil deren Docker-Images das spätere Runner-Muster (Stufe 5) tragen; die
Leser in extract verstehen beide Dialekte.

Der Namenskontrakt der functionObjects ist in extract/readers.py festgelegt
und wird hier erzeugt — forces_<patch>, discharge_<section>, gauge_<gauge>,
water_volume, residuals. Bricht man ihn, findet das PostProzessing die
Ergebnisse nicht mehr; test_stage3 prüft die Kopplung.

Ablaufdruck (E7, Audit G1): ein freier Ablauf ist ein Freistrahl — auf
jeder Wasserfläche des Patches herrscht Luftdruck (prghTotalPressure p0 0),
unabhängig von hRef und von der absoluten Höhenlage. Bis 2026-09-22 stand
dort totalPressure p0 0 mit hRef = 0: p_rgh = 0 hieß „Unterwasser auf
0 m NHN", und der Rand sog mit der ganzen Höhenlage (Gegenlauf: 33 m/s bei
z = 96, 57 m/s bei z = 296, Zahlen in docs/AUDIT_FLOOD3D_FALLSPEZIFISCH.md).
Der feste Unterwasserstand bleibt fixedValue rho*g*(L - hRef) mit hRef = L.
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


def _solver_info_takt(spec: CaseSpec) -> str:
    """
    solverInfo schreibt bei JEDER Ausführung eine Zeile — und ohne
    ``executeControl`` führt OpenFOAM ein Funktionsobjekt jeden Zeitschritt
    aus. Bei Rentrich_BetaTest08_r004 (760.881 Zeitschritte) waren das
    3,0 Mio Zeilen Residuen allein, 40 % der ganzen Zwischendatei — für
    eine Größe, von der die Bewertung nur den LETZTEN Wert liest und das
    Diagramm ein paar hundert Punkte zeigt. Mit demselben Takt wie alle
    anderen Reihen entstehen sie gar nicht erst.
    """
    return (f"        executeControl  runTime;\n"
            f"        executeInterval {spec.solver.write_interval_series:g};\n")


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
        # Ohne bounds integriert die Ebene ueber das GANZE Modellgebiet —
        # der Querschnitt misst dann auch Wasser, das die gezeichnete Linie
        # nie kreuzt (Audit P1-1). Die Box umfasst ALLE Polylinienpunkte
        # (nicht nur die Endpunkte) plus ein Zellpolster, damit die
        # angeschnittenen Facetten sicher innerhalb liegen; vertikal die
        # volle Gebietshoehe. OpenFOAM.com (v2406) liest `bounds` am
        # sampledPlane; ohne Gebietsangabe bleibt die alte, unbegrenzte Ebene.
        bounds = ""
        if spec.domain is not None:
            xs = [float(p[0]) for p in sec.polyline]
            ys = [float(p[1]) for p in sec.polyline]
            pad = spec.mesh.base_cell if spec.mesh is not None else 0.5
            bounds = (f"            bounds          "
                      f"({min(xs) - pad:g} {min(ys) - pad:g} "
                      f"{spec.domain.z_min - pad:g}) "
                      f"({max(xs) + pad:g} {max(ys) + pad:g} "
                      f"{spec.domain.z_max + pad:g});\n")
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
{bounds}            pointAndNormalDict
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
    # sofort, ob ein Lauf noch am Auffuellen ist. Seit 2026-09-23 auch über
    # die ATMOSPHÄRE: Wasser, das oben hinausspritzt, war bis dahin eine
    # unerklärte Bilanzlücke (Fall A, Fahrplan A1: 2,4 %). Die Auswertung
    # (extract_case) liest ihn bewusst nicht als Ablauf — er dient der
    # Bilanzprüfung (probe/probe_lauf.py).
    face_of = {patch: face for face, (patch, _) in assign_faces(spec).items()}
    for b in spec.boundaries:
        if b.patch not in face_of:
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
        # Auch die Belag-Patches: sonst faellt genau die Flaeche aus der
        # tau-Auswertung, die einen eigenen Belag bekommen hat. Die
        # Musterform deckt sie mit ab, ohne dass die Kartendatei hier
        # gelesen werden muesste.
        patches = " ".join(['terrain', '"terrain_belag.*"']
                           + [s.patch for s in spec.structures
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
        // an die Wasserphase gebunden (Fahrplan A3, Audit F6): ohne
        // `phase` transportierte der Gesamtfluss phi den Stoff auch in die
        // Luft und über die Atmosphäre hinaus (Fall K: 19 % in der Luft)
        phase           alpha.water;
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
{ctl}{_solver_info_takt(spec)}    }}
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


def set_fields_dict(spec: CaseSpec, out: Path | None = None,
                    location=None, terrain=None, base_dir=None) -> str | None:
    """
    Anfangszustand: global `initial_level` (boxToCell), darüber je
    Vorfüllung ein Teilbereich mit EIGENEM Spiegel — das Polygon wird als
    Prisma extrudiert (STL neben den Fall) und surfaceToCell setzt alpha.
    Reihenfolge: Vorfüllungen NACH der Box, spätere überschreiben frühere,
    zuletzt das Startwasser vor trockenen Freispiegel-Zuläufen (zulauf_lage).
    """
    vorf = spec.solver.vorfuellungen
    streifen = []
    for b in spec.boundaries:
        lage = zulauf_lage(spec, b, terrain, base_dir)
        if lage is not None and lage["art"] == "freispiegel" \
                and lage["startwasser"] == "streifen":
            streifen.append((b, lage))
    if spec.solver.initial_level is None and not vorf and not streifen:
        return None
    x0, y0, x1, y1 = spec.domain.extent
    # `outsidePoints` markiert für surfaceToCell das AUSSEN des Prismas —
    # OpenFOAM verlangt dafür einen Punkt, der IN EINER ZELLE liegt. Der
    # frühere Punkt lag 0,5 m diagonal ausserhalb des Gebiets und damit in
    # gar keiner Zelle: JEDER Fall mit Vorfüllung starb in setFields mit
    # „outsidePoint … is not inside any cell" (2026-08-11 an
    # Rentrisch_BetaTest06 aufgetreten; die Wörterbuch-Tests konnten das
    # nicht sehen, weil sie den Text prüfen, nicht den Lauf).
    # Jetzt: der Punkt des Strömungsgebiets (locationInMesh — seit R1 auch
    # garantiert frei von Bauwerken) auf halber Höhe zwischen dem höchsten
    # Füllstand und dem Gebietsdeckel: im Netz und über allen Prismen.
    # Der Punkt muss über DREI Dingen liegen: über dem Gelände (sonst
    # steckt er im Erdreich und es gibt dort keine Zelle — genau daran
    # scheiterte der erste Reparaturversuch), über allen Füllprismen und
    # unter dem Gebietsdeckel. Genommen wird deshalb der Saatpunkt von
    # snappyHexMesh selbst — dort MUSS eine Zelle sein, sonst hätte der
    # Vernetzer gar nicht gearbeitet —, angehoben, falls Wasser darüber
    # steht.
    hoch = [float(v.level) for v in vorf]
    if spec.solver.initial_level is not None:
        hoch.append(float(spec.solver.initial_level))
    oberkante = max(hoch) if hoch else spec.domain.z_min
    px, py = ((location[0], location[1]) if location is not None
              else ((x0 + x1) / 2.0, (y0 + y1) / 2.0))
    z_boden = spec.domain.z_min
    if terrain is not None:
        try:
            z_boden = float(terrain.sample(px, py))
        except Exception:                    # noqa: BLE001
            pass
    untergrenze = max(z_boden, oberkante)
    z_aussen = (untergrenze + spec.domain.z_max) / 2.0
    if location is not None and location[2] > untergrenze:
        z_aussen = max(z_aussen, float(location[2]))
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
        aussen = vec((px, py, z_aussen))
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
    for b, lage in streifen:
        lo_, hi_ = _startstreifen(spec, lage)
        regionen.append(f"""    // Startwasser vor Zulauf {b.id} (trockener Freispiegel-Rand)
    boxToCell
    {{
        box {vec(lo_)} {vec(hi_)};
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
    """
    Gebietsrand der Randbedingung (inkl. Vorbelegungslogik).

    Bewusst OHNE assign_faces: das wirft bei doppelt belegter Seite einen
    ValueError — die Frage nach der Seite EINER Randbedingung darf aber
    nie am Konflikt zweier anderer scheitern. Genau das riss am
    2026-08-06 PUT und Preview mit 500 um (validate rief _bc_face
    ungeschützt, der Fall saß mit dem Konflikt auf der Platte fest).
    Den Konflikt selbst meldet die Prüfung als Befund mit Kur.
    """
    if b.face:
        return b.face
    if b.type in ("inflow_hydrograph", "inflow_constant"):
        return "x_min"
    if b.type.startswith("outflow"):
        return "x_max"
    return "z_max"


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


# ---- Wie ein Zulauf ins Gebiet kommt (Fahrplan A1, Audit F1) -------------

ZULAUF_ARTEN = ("freispiegel", "strahl", "rohr")
# Tiefe des Startwasser-Streifens vor einem trockenen Freispiegel-Zulauf
ZULAUF_STREIFEN_ZELLEN = 2


def _zulauf_q(b, base_dir) -> float:
    """Bemessungs-Q eines Zulaufs: konstant, oder die Spitze der Ganglinie."""
    if b.type == "inflow_constant":
        return float(b.q or 0.0)
    if base_dir is None:
        return 0.0
    try:
        df = pd.read_csv(Path(base_dir) / b.source)
        return float(df[b.column_q].to_numpy(float).max())
    except Exception:                        # noqa: BLE001 — die Prüfung meldet die Datei
        return 0.0


def _boden_an_flaeche(spec: CaseSpec, face: str, lo: float, hi: float,
                      terrain) -> tuple[np.ndarray, np.ndarray]:
    """(s, Geländehöhe) entlang der Randfläche zwischen lo und hi."""
    x0, y0, x1, y1 = spec.domain.extent
    zelle = spec.mesh.base_cell if spec.mesh else 1.0
    n = max(2, int(math.ceil((hi - lo) / (zelle / 2))) + 1)
    s = np.linspace(lo, hi, n)
    if terrain is None:
        return s, np.full(n, spec.domain.z_min)
    # eine halbe Zelle innen: dort liegen die Zellen, die der Rand speist
    innen = {"x_min": x0 + zelle / 2, "x_max": x1 - zelle / 2,
             "y_min": y0 + zelle / 2, "y_max": y1 - zelle / 2}[face]
    xs, ys = ((np.full(n, innen), s) if face.startswith("x")
              else (s, np.full(n, innen)))
    boden = np.asarray(terrain.sample(xs, ys), dtype=float)
    return s, np.clip(boden, spec.domain.z_min, spec.domain.z_max)


def zulauf_lage(spec: CaseSpec, b, terrain=None, base_dir=None) -> dict | None:
    """
    Wie ein Zulauf ins Gebiet kommt — die EINE Stelle, an der Randbedingung
    (initial_fields), Startwasser (set_fields_dict), Fläche (fenster_flaeche)
    und Prüfung (validate) das ablesen.

      rohr         Kreisfenster oder an einen Durchlass gekoppelt: der
                   Querschnitt ist voll, Q wird gleichmäßig hindurchgedrückt
                   (flowRateInletVelocity, alpha = 1).
      strahl       Fenster, dessen Unterkante mehr als eine Zelle über dem
                   Gelände liegt: eine Öffnung in der Wand, aus der Wasser
                   fällt — ebenfalls voller Querschnitt.
      freispiegel  alles, was bis auf die Sohle reicht (kein Fenster,
                   Rechteck, Trapez, Polygon, an ein Gerinne gekoppelt):
                   der Wasserstand am Rand folgt dem Gebiet
                   (variableHeightFlowRateInletVelocity). Bis 2026-09-23
                   stand hier alpha = 1 über der GANZEN Fläche — ohne
                   Fenster trat das Wasser von der Sohle bis z_max ein und
                   fiel als Vorhang ins Gebiet (Audit F1).

    Für freispiegel zusätzlich das Startwasser: die BC verteilt Q auf die
    NASSE Randfläche, ein trockener Rand hieße Division durch null. z_start
    = Sohle + max(2 Zellen, kritische Tiefe (Q²/(g·b²))^(1/3)), bei einem
    gekoppelten Gerinne dessen Einschnittkante, nie über der Fensteroberkante.
    """
    if b.type not in ("inflow_hydrograph", "inflow_constant"):
        return None
    face = _bc_face(spec, b)
    if spec.domain is None or face is None or face == "z_max":
        return {"art": "strahl", "face": face}
    x0, y0, x1, y1 = spec.domain.extent
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
    zelle = spec.mesh.base_cell if spec.mesh else 1.0
    w = getattr(b, "window", None)
    r = resolve_window(spec, b)
    if (r is not None and r["shape"] == "kreis") or (
            w is not None and w.follow and _follow_culvert(spec, w) is not None):
        return {"art": "rohr", "face": face}
    lo, hi = (max(r["lo"], e0), min(r["hi"], e1)) if r is not None else (e0, e1)
    s, boden = _boden_an_flaeche(spec, face, lo, hi, terrain)
    sohle = float(boden.min())
    zlo = r.get("zlo") if r is not None else None
    if zlo is not None and zlo > sohle + zelle:
        return {"art": "strahl", "face": face, "lo": lo, "hi": hi,
                "sohle": sohle, "zlo": float(zlo)}
    q = _zulauf_q(b, base_dir)
    breite = float(r["bw"]) if r is not None and r["shape"] == "trapez" else hi - lo
    h_c = (q * q / (9.81 * breite * breite)) ** (1 / 3) if q > 0 and breite > 0 else 0.0
    ch = _follow_channel(spec, w) if w is not None else None
    if ch is not None and r is not None and "z_w1" in r:
        z_start = float(r["z_w1"])
    else:
        z_start = sohle + max(ZULAUF_STREIFEN_ZELLEN * zelle, h_c)
    # Steht bei t = 0 schon Wasser vor der Fläche (Anfangswasserspiegel,
    # Vorfüllung), ist DAS der Startwasserstand — kein Streifen nötig
    startwasser = "streifen"
    vorhanden = _wasser_vor_flaeche(spec, face, lo, hi, sohle + zelle)
    if vorhanden is not None:
        z_start, startwasser = vorhanden
    zhi = r.get("zhi") if r is not None else None
    if zhi is not None:
        z_start = min(z_start, float(zhi))
    z_start = min(z_start, spec.domain.z_max - zelle)
    a_nass = float(np.trapezoid(np.clip(z_start - boden, 0.0, None), s))
    return {"art": "freispiegel", "face": face, "lo": lo, "hi": hi,
            "sohle": sohle, "z_start": z_start, "h_start": z_start - sohle,
            "startwasser": startwasser,
            "h_c": h_c, "q": q, "a_nass": a_nass,
            "u_mittel": q / a_nass if a_nass > 0 else None}


def _streifen_grundriss(spec: CaseSpec, face: str, lo: float, hi: float):
    """(x0, y0, x1, y1) des Streifens vor der Fläche, ZULAUF_STREIFEN_ZELLEN tief."""
    x0, y0, x1, y1 = spec.domain.extent
    tiefe = ZULAUF_STREIFEN_ZELLEN * (spec.mesh.base_cell if spec.mesh else 1.0)
    return {"x_min": (x0 - 1.0, lo, x0 + tiefe, hi),
            "x_max": (x1 - tiefe, lo, x1 + 1.0, hi),
            "y_min": (lo, y0 - 1.0, hi, y0 + tiefe),
            "y_max": (lo, y1 - tiefe, hi, y1 + 1.0)}[face]


def _wasser_vor_flaeche(spec: CaseSpec, face: str, lo: float, hi: float,
                        mindestens: float) -> tuple[float, str] | None:
    """
    Wasserspiegel, der bei t = 0 schon vor der Zulauffläche steht — aus dem
    Anfangswasserspiegel oder einer Vorfüllung, die den Streifen berührt —,
    wenn er mindestens `mindestens` erreicht (eine Zelle über der Sohle).
    """
    import shapely as _sh
    kandidaten = []
    lvl = spec.solver.initial_level
    if lvl is not None and lvl >= mindestens:
        kandidaten.append((float(lvl), "anfangswasser"))
    streifen = _sh.box(*_streifen_grundriss(spec, face, lo, hi))
    for v in spec.solver.vorfuellungen:
        if v.level >= mindestens and _sh.Polygon(v.polygon).intersects(streifen):
            kandidaten.append((float(v.level), "vorfuellung"))
    return max(kandidaten) if kandidaten else None


def _startstreifen(spec: CaseSpec, lage: dict) -> tuple[tuple, tuple]:
    """boxToCell-Quader des Startwassers vor einer Freispiegel-Zulauffläche."""
    x0, y0, x1, y1 = spec.domain.extent
    tiefe = ZULAUF_STREIFEN_ZELLEN * (spec.mesh.base_cell if spec.mesh else 1.0)
    zu, zo = spec.domain.z_min - 1.0, lage["z_start"]
    lo, hi = lage["lo"], lage["hi"]
    return {
        "x_min": ((x0 - 1.0, lo, zu), (x0 + tiefe, hi, zo)),
        "x_max": ((x1 - tiefe, lo, zu), (x1 + 1.0, hi, zo)),
        "y_min": ((lo, y0 - 1.0, zu), (hi, y0 + tiefe, zo)),
        "y_max": ((lo, y1 - tiefe, zu), (hi, y1 + 1.0, zo)),
    }[lage["face"]]


def fenster_mitte(spec: CaseSpec, b) -> tuple[float, float, float] | None:
    """
    Mitte der Öffnung auf der Randfläche — der EINE Ort, an dem die Regel
    („weniger als 2 Zellen") und die Kur („Quader ans Fenster") die
    örtliche Zellgröße messen (E5a, Audit P8). None ohne Fenster oder auf
    der Deckelfläche.
    """
    face = _bc_face(spec, b)
    r = resolve_window(spec, b)
    if face is None or r is None or spec.domain is None or face == "z_max":
        return None
    x0, y0, x1, y1 = spec.domain.extent
    lo, hi = float(r["lo"]), float(r["hi"])
    zlo, zhi = r.get("zlo"), r.get("zhi")
    mitte_e = (lo + hi) / 2
    mitte_z = ((float(zlo) + float(zhi)) / 2 if zlo is not None and zhi is not None
               else (spec.domain.z_min + spec.domain.z_max) / 2)
    if face.startswith("x"):
        return (x0 if face == "x_min" else x1, mitte_e, mitte_z)
    return (mitte_e, y0 if face == "y_min" else y1, mitte_z)


def fenster_flaeche(spec: CaseSpec, b, terrain=None) -> float | None:
    """
    Analytische Fläche in m², auf die flowRateInletVelocity den
    Volumenstrom verteilt: das Fenster der Randbedingung, ohne Fenster die
    Gebietsseite ÜBER dem Gelände (mit `terrain`, einem TerrainField) —
    das ist die Fläche, die der Vernetzer als Patch übrig lässt; bis
    2026-09-22 zählte die volle Seite bis z_min, bei einem Betriebsfall
    371 m² statt der Fläche über der Ebene (Audit G3). Die vernetzte Fläche
    ist eine Treppe aus ganzen Randflächen und kann davon abweichen — als
    Näherung für die resultierende Eintrittsgeschwindigkeit reicht die
    analytische Form (Audit P1-5: Q/A war vorher nirgends ausgewiesen).
    """
    face = _bc_face(spec, b)
    if face is None or spec.domain is None:
        return None
    # Freispiegel-Zulauf: Q verteilt sich auf die NASSE Fläche (seit A1,
    # 2026-09-23) — zu Beginn die des Startwassers
    lage = zulauf_lage(spec, b, terrain)
    if lage is not None and lage["art"] == "freispiegel":
        return lage["a_nass"]
    x0, y0, x1, y1 = spec.domain.extent
    e0, e1 = (y0, y1) if face.startswith("x") else (x0, x1)
    r = resolve_window(spec, b)
    if r is None:
        if terrain is None or face == "z_max":
            return (e1 - e0) * (spec.domain.z_max - spec.domain.z_min)
        zelle = spec.mesh.base_cell if spec.mesh else 1.0
        n = max(2, int(math.ceil((e1 - e0) / zelle)) + 1)
        s = np.linspace(e0, e1, n)
        if face.startswith("x"):
            xs = np.full(n, x0 if face == "x_min" else x1)
            ys = s
        else:
            xs = s
            ys = np.full(n, y0 if face == "y_min" else y1)
        boden = np.clip(np.asarray(terrain.sample(xs, ys), dtype=float),
                        spec.domain.z_min, spec.domain.z_max)
        return float(np.trapezoid(spec.domain.z_max - boden, s))
    if r["shape"] == "kreis":
        return math.pi * r["d"] ** 2 / 4
    if r["shape"] == "polygon":
        pts = r["points"]
        n = len(pts)
        doppelt = sum(pts[i][0] * pts[(i + 1) % n][1]
                      - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        return abs(doppelt) / 2
    zlo = r["zlo"] if r["zlo"] is not None else spec.domain.z_min
    zhi = r["zhi"] if r["zhi"] is not None else spec.domain.z_max
    if r["shape"] == "trapez":
        # Breite läuft linear zwischen z_w0 und z_w1, außerhalb geklemmt —
        # numerisch integriert, weil zlo/zhi das Profil beschneiden können
        span_w = r["z_w1"] - r["z_w0"]
        zz = np.linspace(zlo, zhi, 101)
        tt = (np.clip((zz - r["z_w0"]) / span_w, 0.0, 1.0) if span_w > 0
              else np.zeros_like(zz))
        breite = np.clip(r["bw"] + (r["tw"] - r["bw"]) * tt, 0.0, e1 - e0)
        return float(np.trapezoid(breite, zz))
    lo = max(r["lo"], e0)
    hi = min(r["hi"], e1)
    return max(hi - lo, 0.0) * max(zhi - zlo, 0.0)


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


def belag_patch(b) -> str:
    """Patchname eines Belags — aus der Kennung, nicht aus dem Namen.

    Der Name ist frei gewählt („Rasen 2", „Beton (alt)") und taugt nicht
    als OpenFOAM-Wort. Die Kennung ist eindeutig und stabil."""
    return f"terrain_belag{b.id}"


def _belaege(spec: CaseSpec, base_dir: Path | None) -> list:
    """
    Die Beläge, die wirklich eine Fläche im Gebiet haben — mit ihrem
    Suchkörper. Leere Einträge (gemalt, dann übermalt) fallen heraus:
    ein Patch ohne Flächen bricht createPatch ab.
    """
    if spec.terrain is None or spec.terrain.belagskarte is None:
        return []
    if base_dir is None or spec.domain is None:
        return []
    from .belag import belag_koerper, belag_polygone, lade_belagskarte

    karte = spec.terrain.belagskarte
    pfad = Path(base_dir) / karte.source
    if not pfad.is_file():
        return []
    try:
        ids, x0, y0, zelle = lade_belagskarte(pfad)
    except Exception:      # noqa: BLE001 — kaputte Karte heisst: kein Belag
        return []
    flaechen = belag_polygone(ids, x0, y0, zelle)

    # Prisma von unter der Gebietssohle bis darüber: die Geländeflächen
    # liegen irgendwo dazwischen, auch an steilen Böschungen
    z_lo = spec.domain.z_min - 1.0
    z_hi = spec.domain.z_max + 1.0
    aus = []
    for b in karte.belaege:
        flaeche = flaechen.get(b.id)
        if flaeche is None:
            continue
        koerper = belag_koerper(flaeche, z_lo, z_hi)
        if koerper is not None:
            aus.append((b, koerper))
    return aus


def topo_set_dict(spec: CaseSpec,
                  base_dir: Path | None = None) -> str | None:
    screens = [s for s in spec.structures if s.type == "screen"]
    windows = _windowed_bcs(spec)
    belaege = _belaege(spec, base_dir)
    if not screens and not windows and not belaege:
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
            # Zonentiefe in Anströmrichtung — dieselbe Länge, auf die
            # _screen_resistance den f-Beiwert normiert (sonst stimmt Δp nicht)
            k_vec = k_vec / k_norm * _zonen_tiefe(s)
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
    # Beläge: erst alle Geländeflächen sammeln, dann auf die unter dem
    # Suchkörper einschränken. An OpenFOAM v2406 gegengeprüft — 400
    # Bodenflächen, nach dem Subset exakt die 160 unter dem Prisma.
    for b, _ in belaege:
        actions += f"""    {{
        name    belag{b.id}Faces;
        type    faceSet;
        action  new;
        source  patchToFace;
        patch   terrain;
    }}
    {{
        name    belag{b.id}Faces;
        type    faceSet;
        action  subset;
        source  searchableSurfaceToFace;
        surface triSurfaceMesh;
        file    "belag{b.id}.stl";
    }}
"""
    return foam_file("topoSetDict", f"actions\n(\n{actions});", location="system")


def create_patch_dict(spec: CaseSpec,
                      base_dir: Path | None = None) -> str | None:
    """
    Restfläche jedes Fenster-Randpatches wird zur Wand randwand_<id>;
    jeder Belag bekommt seinen eigenen Wandpatch aus dem Gelände.
    """
    windows = _windowed_bcs(spec)
    belaege = _belaege(spec, base_dir)
    if not windows and not belaege:
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
    for b, _ in belaege:
        patches += f"""    {{
        name            {belag_patch(b)};
        patchInfo
        {{
            type            wall;
        }}
        constructFrom   set;
        set             belag{b.id}Faces;
    }}
"""
    body = f"pointSync       false;\n\npatches\n(\n{patches});"
    return foam_file("createPatchDict", body, location="system")


# Kirschmer-Formbeiwerte β je Stabform (DWA/klassisch): Verlust
# ζ = β (Stabdicke / lichte Weite)^(4/3) · sin α
_KIRSCHMER_BETA = {"rechteck": 2.42, "rund": 1.79, "tropfen": 0.76}

# Tiefe der porösen Zellzone in Anströmrichtung, wenn der Fall keine
# angibt. Der Darcy-Forchheimer-Beiwert des RECHENS muss auf DIESE Länge
# normiert sein: Δp = ½ρu²·f·L_Zone — nur mit f = ζ/L_Zone kommt der
# Kirschmer-Verlust ζ·½ρu² heraus. Vorher wurde auf die STABTIEFE
# normiert (Vorbelegung 0,06 m) und der Verlust damit um den Faktor
# L_Zone/bar_depth (2,5× bei Vorbelegung) überschätzt.
_SCREEN_ZONE_TIEFE = 0.15

# Vorbelegung des Stamm-Widerstandsbeiwerts bei Bewuchs. 1,2 ist der
# übliche Ansatz für zylindrische Halme/Stämme im Bereich Re 10³…10⁵
# (Lindner, DVWK-M 220) — Kreiszylinder liegen bei 1,0…1,2.
_BEWUCHS_CW = 1.2


def _zonen_tiefe(s) -> float:
    """Tiefe der Widerstandszone in Anströmrichtung (m)."""
    return float(s.zonen_tiefe or _SCREEN_ZONE_TIEFE)


def _screen_resistance(s) -> tuple[tuple, tuple]:
    """
    Die Darcy-Forchheimer-Beiwerte einer Widerstandszone.

    OpenFOAM rechnet S = −(μ·d + ½ρ|u|·f)·u je Volumen; über die Zonentiefe
    L folgt daraus Δp = (μ·d + ½ρ|u|·f)·|u|·L. Genau daran hängt der
    Unterschied zwischen den Arten, und er ist der Grund, warum hier nicht
    eine Formel für alle steht:

      * Der RECHEN ist ein Flächenverlust. ζ gilt für die Ebene, nicht für
        eine Länge — er muss auf die Zonentiefe verteilt werden (f = ζ/L),
        sonst hängt der Verlust an einer Netzgröße. Und er wirkt nur
        SENKRECHT zur Rechenebene; längs der Ebene steht nichts im Weg.
      * Steinschüttung und Bewuchs sind Volumenwiderstände. Ihre Beiwerte
        sind schon „je Meter" und dürfen NICHT durch L geteilt werden —
        ein doppelt so dicker Steinwall bremst doppelt so stark, und genau
        das kommt so heraus. Sie wirken in alle Richtungen gleich.

    Explizit gesetzte d/f haben immer Vorrang.
    """
    d = tuple(s.resistance.d)
    f = tuple(s.resistance.f)
    if any(d) or any(f):
        return d, f

    art = s.resistance.kind
    if art == "steinschuettung":
        # Ergun (Haufwerk): Δp/L = 150·μ(1−ε)²/(ε³d_p²)·u
        #                        + 1,75·ρ(1−ε)/(ε³d_p)·u²
        # Der zweite Term ist ½ρ·f·u², also f = 2·1,75·(1−ε)/(ε³d_p).
        eps = float(s.resistance.porositaet)
        dp = float(s.resistance.korngroesse)
        rest = 1.0 - eps
        d_val = 150.0 * rest ** 2 / (eps ** 3 * dp ** 2)
        f_val = 3.5 * rest / (eps ** 3 * dp)
        return (d_val, d_val, d_val), (f_val, f_val, f_val)

    if art == "bewuchs":
        # Formwiderstand durchströmter Halme/Stämme: F/V = ½ρ·c_w·a·u²,
        # mit a = angeströmte Fläche je Volumen (Stämme/m² × Durchmesser).
        # Der zähe Anteil ist gegen den Formwiderstand bedeutungslos.
        a = float(s.resistance.flaechendichte)
        cw = float(s.resistance.cw or _BEWUCHS_CW)
        f_val = cw * a
        return d, (f_val, f_val, f_val)

    if art == "manuell":
        # Nichts abzuleiten — wer „manuell" wählt und nichts einträgt,
        # bekommt eine wirkungslose Zone. Das meldet die Prüfung.
        return d, f

    # Rechen (Vorbelegung): Kirschmer, gerichtet
    clear = max((s.bar_spacing or 0.0) - (s.bar_thickness or 0.0), 1e-4)
    beta = _KIRSCHMER_BETA.get(s.bar_shape, 2.42)
    zeta = beta * ((s.bar_thickness or 0.0) / clear) ** (4 / 3) \
        * math.sin(math.radians(s.approach_angle_deg))
    return d, (zeta / _zonen_tiefe(s), 0.0, 0.0)


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
    Bezugshöhe für p_rgh = p - rho*g*(z - hRef). Sie liegt IMMER im Gebiet:

    * auf dem ERSTEN festen Ablaufpegel — dann ist der dort vorzuschreibende
      Druck exakt null und gilt für Wasser UND Luft gleichermaßen;
    * sonst auf der Gebietsunterkante. Der freie Ablauf (prghTotalPressure)
      braucht hRef für das Wasser nicht — nur die Luft auf offenen Flächen
      spürt rho_Luft*g*(z - hRef), und das bleibt so unter 100 Pa.

    Der alte Rückfall 0.0 war der Audit-Fund G1: bei z = 96 m sog der freie
    Ablauf mit 96 m Fallhöhe.
    """
    for b in spec.boundaries:
        if b.type == "outflow_fixed_level":
            return float(b.level)
    if spec.domain is not None:
        return float(spec.domain.z_min)
    return 0.0


# ---- Turbulenz-Anfangs- und Randwerte (Fahrplan A2, Audit F7) ----------
# Bis 2026-09-23 standen hier Literale (k = 1e-4, omega = 1) und ein
# epsilon, das per replace("omega", "epsilon") aus Einträgen entstand, die
# das Wort gar nicht enthielten — epsilon = 1, nu_t(0) ≈ 1e-9: kEpsilon
# startete laminar. Jetzt die übliche Herleitung aus Geschwindigkeit U und
# Längenmaß L = 0,07·D_h am Zulauf (Intensität 5 %).
TURB_INTENSITAET = 0.05
TURB_LAENGE_ANTEIL = 0.07
C_MU = 0.09
# Ohne Zulauf (Leerlauf) gibt es keine Einströmung, aus der sich U ergäbe:
# ruhiges Wasser, L = Basiszelle
TURB_U_RUHE = 0.1


def turbulenz_randwerte(u: float, laenge: float) -> dict[str, float]:
    """k, omega, epsilon aus Geschwindigkeit u (m/s) und Längenmaß L (m)."""
    u = max(float(u), TURB_U_RUHE)
    laenge = max(float(laenge), 1e-3)
    k = 1.5 * (u * TURB_INTENSITAET) ** 2
    return {"k": k,
            "omega": math.sqrt(k) / (C_MU ** 0.25 * laenge),
            "epsilon": C_MU ** 0.75 * k ** 1.5 / laenge,
            "u": u, "l": laenge}


def zulauf_turbulenz(spec: CaseSpec, b, terrain=None, base_dir=None) -> dict:
    """
    Turbulenzwerte eines Zulaufs: U = Q/A über die Fläche, auf die Q
    verteilt wird (fenster_flaeche — bei Freispiegel die nasse Startfläche),
    L = 0,07·D_h mit D_h = 4A/P des Querschnitts (Kreis: d).
    """
    q = _zulauf_q(b, base_dir)
    lage = zulauf_lage(spec, b, terrain, base_dir) or {}
    zelle = spec.mesh.base_cell if spec.mesh else 1.0
    if lage.get("art") == "freispiegel":
        a = lage["a_nass"]
        breite = lage["hi"] - lage["lo"]
        d_h = 4 * a / (breite + 2 * lage["h_start"]) if a > 0 else zelle
    else:
        a = fenster_flaeche(spec, b, terrain) or 0.0
        r = resolve_window(spec, b)
        if r is not None and r["shape"] == "kreis":
            d_h = float(r["d"])
        elif r is not None and r.get("zlo") is not None and r.get("zhi") is not None:
            umfang = 2 * ((r["hi"] - r["lo"]) + (r["zhi"] - r["zlo"]))
            d_h = 4 * a / umfang if umfang > 0 else zelle
        else:
            d_h = zelle
    u = q / a if a > 0 else TURB_U_RUHE
    return {**turbulenz_randwerte(u, TURB_LAENGE_ANTEIL * d_h), "q": q, "d_h": d_h}


def _rough_nut(ks: float) -> str:
    return (f"        type            nutkRoughWallFunction;\n"
            f"        Ks              uniform {ks:g};\n"
            f"        Cs              uniform 0.5;\n"
            f"        value           uniform 0;\n")


def initial_fields(spec: CaseSpec, base_dir: Path,
                   terrain=None) -> dict[str, str]:
    inflows = [b for b in spec.boundaries
               if b.type in ("inflow_hydrograph", "inflow_constant")]
    outflows = [b for b in spec.boundaries
                if b.type.startswith("outflow")]
    atmos = [b for b in spec.boundaries if b.type == "atmosphere"]

    u, alpha, p = {}, {}, {}
    k_f, omega_f, eps_f, nut_f = {}, {}, {}, {}

    if terrain is None and spec.terrain is not None and spec.domain is not None:
        terrain = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
    turb = {b.patch: zulauf_turbulenz(spec, b, terrain, base_dir) for b in inflows}
    # Innenfeld und einströmende Luft/Wasser an offenen Rändern: die Werte
    # des stärksten Zulaufs; ohne Zulauf ruhiges Wasser auf Zellmaß
    ref = (max(turb.values(), key=lambda t: t["q"]) if turb else
           turbulenz_randwerte(TURB_U_RUHE,
                               spec.mesh.base_cell if spec.mesh else 1.0))

    def _fest(wert: float) -> str:
        return f"        type            fixedValue;\n        value           uniform {wert:.6g};\n"

    def _io(wert: float) -> str:
        return (f"        type            inletOutlet;\n"
                f"        inletValue      uniform {wert:.6g};\n"
                f"        value           uniform {wert:.6g};\n")

    for b in inflows:
        rate = _inflow_rate_entry(b, base_dir)
        lage = zulauf_lage(spec, b, terrain, base_dir)
        if lage["art"] == "freispiegel":
            # Wasserstand am Rand folgt dem Gebiet; Q wird als GEMISCHstrom
            # auf die Randflächen im Verhältnis ihres Wasseranteils verteilt,
            # alpha dort aus der Nachbarzelle, ab upperBound → 1. Das
            # Tutorial (interFoam/RAS/waterChannel) nimmt 0,9 — dann tragen
            # teilnasse Flächen Luft mit, und das Wasser blieb am Probefall K
            # bis 4 % unter Q (0,269 statt 0,28 m³/s bei 15 s). Mit 0,5 kam
            # Q über den ganzen Lauf exakt an (a5b_k, 2026-09-23, PROTOKOLL_A).
            u[b.patch] = (f"        type            variableHeightFlowRateInletVelocity;\n"
                          f"        flowRate        {rate};\n"
                          f"        alpha           alpha.water;\n"
                          f"        value           uniform (0 0 0);\n")
            alpha[b.patch] = ("        type            variableHeightFlowRate;\n"
                              "        lowerBound      0;\n"
                              "        upperBound      0.5;\n"
                              "        value           uniform 0;\n")
        else:
            u[b.patch] = (f"        type            flowRateInletVelocity;\n"
                          f"        volumetricFlowRate {rate};\n"
                          f"        value           uniform (0 0 0);\n")
            alpha[b.patch] = "        type            fixedValue;\n        value           uniform 1;\n"
        p[b.patch] = "        type            fixedFluxPressure;\n        value           uniform 0;\n"
        tb = turb[b.patch]
        k_f[b.patch] = _fest(tb["k"])
        omega_f[b.patch] = _fest(tb["omega"])
        eps_f[b.patch] = _fest(tb["epsilon"])
        nut_f[b.patch] = "        type            calculated;\n        value           uniform 0;\n"

    href = h_ref(spec)
    for b in outflows + atmos:
        u[b.patch] = ("        type            pressureInletOutletVelocity;\n"
                      "        value           uniform (0 0 0);\n")
        alpha[b.patch] = ("        type            inletOutlet;\n"
                          "        inletValue      uniform 0;\n"
                          "        value           uniform 0;\n")
        # Atmosphäre: p_rgh = 0 — für die Luft exakt hydrostatisch.
        # Freier Ablauf: Luftdruck p = 0 auf JEDER Fläche des Patches
        # (Freistrahl), p_rgh = -rho_Fläche*(g·h - g·hRef) rechnet OpenFOAM
        # je Fläche selbst. Mit totalPressure stand hier p_rgh = 0 auch auf
        # den Wasserflächen, und das hieß Unterwasser auf hRef (Audit G1).
        art = "totalPressure" if b.type == "atmosphere" else "prghTotalPressure"
        p[b.patch] = (f"        type            {art};\n"
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
        k_f[b.patch] = _io(ref["k"])
        omega_f[b.patch] = _io(ref["omega"])
        eps_f[b.patch] = _io(ref["epsilon"])
        nut_f[b.patch] = "        type            calculated;\n        value           uniform 0;\n"

    wall_u = "        type            noSlip;\n"
    wall_alpha = "        type            zeroGradient;\n"
    wall_p = "        type            fixedFluxPressure;\n        value           uniform 0;\n"
    wall_k = f"        type            kqRWallFunction;\n        value           uniform {ref['k']:.6g};\n"
    wall_omega = f"        type            omegaWallFunction;\n        value           uniform {ref['omega']:.6g};\n"
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
        # Beläge: jeder bekommt seinen eigenen Patch (topoSet/createPatch)
        # und darauf seine eigene Rauheit. Das ist der einzige Weg, auf dem
        # das Gelände örtlich verschiedene Materialien tragen kann — in
        # OpenFOAM ist Ks eine Zahl JE PATCH, nicht je Zelle.
        for b, _ in _belaege(spec, base_dir):
            nut_f[belag_patch(b)] = _rough_nut(b.ks)

    felder = {
        "U": _field_file("U", "[0 1 -1 0 0 0 0]", "uniform (0 0 0)", u, wall_u),
        "alpha.water": _field_file("alpha.water", "[0 0 0 0 0 0 0]", "uniform 0",
                                   alpha, wall_alpha),
        "p_rgh": _field_file("p_rgh", "[1 -1 -2 0 0 0 0]", "uniform 0", p, wall_p),
        "k": _field_file("k", "[0 2 -2 0 0 0 0]", f"uniform {ref['k']:.6g}",
                         k_f, wall_k),
        "omega": _field_file("omega", "[0 0 -1 0 0 0 0]",
                             f"uniform {ref['omega']:.6g}", omega_f, wall_omega),
        "nut": _field_file("nut", "[0 2 -1 0 0 0 0]", "uniform 0", nut_f, wall_nut),
    }
    if spec.solver.turbulence == "kEpsilon":
        # kEpsilon rechnet mit epsilon statt omega. Ohne dieses Feld startet
        # der Solver gar nicht — das Modell war im Schema wählbar und
        # erzeugte einen unvollständigen Fall.
        wall_eps = ("        type            epsilonWallFunction;\n"
                    f"        value           uniform {ref['epsilon']:.6g};\n")
        felder["epsilon"] = _field_file("epsilon", "[0 2 -3 0 0 0 0]",
                                        f"uniform {ref['epsilon']:.6g}",
                                        eps_f, wall_eps)
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

// Oberflächenspannung aus (Fahrplan A4, 2026-09-23): bei Zellen ab 0,1 m
// ist die Weber-Zahl riesig, Kapillarität spielt keine Rolle — die
// CSF-Krümmung aus so groben Zellen erzeugte nur Scheinströmungen an der
// Grenzfläche. Vorher 0.07 N/m.
sigma           0;"""


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

def _gebiet_sichern(spec: CaseSpec) -> tuple[CaseSpec, list[str]]:
    """
    Letzte Verteidigungslinie vor dem Solver: Geometrie außerhalb des
    Modellgebiets darf ihn nie erreichen (ein Rechen außerhalb erzeugt eine
    leere Porositätszone, an der interFoam stirbt; eine Vorfüllung außerhalb
    kippt den inside/outside-Test von surfaceToCell). Die Prüfung meldet das
    vorher — aber Punkte kommen auch aus Import, Rezepten und von Hand
    editierten case.yaml, deshalb wird hier NOCHMAL gemessen (mit derselben
    Funktion `gebietslage`) und auf einer Kopie gearbeitet: der gespeicherte
    Fall bleibt unangetastet, der Bearbeiter behält seinen Stand.
    """
    from .anschluss import _flaeche_kappen, _gebiet_box, gebietslage

    meldungen: list[str] = []
    lagen = gebietslage(spec)
    if not lagen:
        return spec, meldungen
    voll = {l["id"] for l in lagen if l["voll"]}
    teil = {l["id"] for l in lagen if not l["voll"]}
    spec = spec.model_copy(deep=True)

    if voll & {s.id for s in spec.structures}:
        rest = []
        for s in spec.structures:
            if s.id in voll:
                meldungen.append(
                    f"Bauwerk „{s.id}“ liegt vollständig außerhalb des "
                    "Modellgebiets — nicht an den Solver übergeben")
            else:
                rest.append(s)
        spec.structures = rest

    if spec.solver is not None and spec.solver.vorfuellungen:
        gebiet = _gebiet_box(spec)
        rest = []
        for v in spec.solver.vorfuellungen:
            if v.id in voll:
                meldungen.append(
                    f"Vorfüllung „{v.id}“ liegt vollständig außerhalb des "
                    "Modellgebiets — für den Anfangszustand übergangen")
                continue
            if v.id in teil:
                neu = _flaeche_kappen(v.polygon, gebiet)
                if neu is None:
                    meldungen.append(
                        f"Vorfüllung „{v.id}“ ließ sich nicht auf das Gebiet "
                        "beschneiden — für den Anfangszustand übergangen")
                    continue
                v.polygon = neu
                meldungen.append(f"Vorfüllung „{v.id}“ für den Anfangszustand "
                                 "auf das Gebiet beschnitten")
            rest.append(v)
        spec.solver.vorfuellungen = rest
    return spec, meldungen


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

    # Die Hashes MÜSSEN vom unveränderten Spec kommen: die Netzvorschau
    # vergleicht sie mit dem gespeicherten Fall — hashte man die gesäuberte
    # Kopie, gälte die Vorschau nach jedem Säubern für immer als veraltet.
    orig = spec
    spec, gesaeubert = _gebiet_sichern(spec)
    problems += gesaeubert

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
        # Suchkörper der Beläge: topoSet schneidet damit die
        # Geländeflächen je Belag heraus (core/belag.py).
        for b, koerper in _belaege(spec, base_dir):
            koerper.export(out / "constant" / "triSurface" / f"belag{b.id}.stl")
    # Sich durchdringende Körper werden hier entflochten (gleiche
    # Wasserberandung, aber keine doppelt belegten Flächen für snappy) —
    # was dabei passiert ist, steht als Notiz im Ergebnis.
    notizen: list[str] = []
    # Ausfälle einzelner Bauwerke sind hier PROBLEME, keine Notizen: ein
    # Netz ohne das Bauwerk sähe nach einem vollständigen Fall aus
    ausfaelle: list[dict] = []
    solids = build_solids(spec, base_dir, hinweise=notizen,
                          ausfaelle=ausfaelle)
    problems += [a["meldung"] for a in ausfaelle]
    # Importierte Körper tragen ihre Lage im STL — `gebietslage` sieht sie
    # nicht. Am gebauten Körper nachgemessen: was in der Draufsicht ganz
    # außerhalb liegt, bekommt der Vernetzer nicht.
    x0, y0, x1, y1 = spec.domain.extent
    for name in sorted(solids):
        grenzen = solids[name].bounds
        if grenzen is None:
            continue
        if (grenzen[1][0] < x0 or grenzen[0][0] > x1
                or grenzen[1][1] < y0 or grenzen[0][1] > y1):
            problems.append(f"Körper „{name}“ liegt vollständig außerhalb "
                            "des Modellgebiets — nicht an den Vernetzer "
                            "übergeben")
            del solids[name]
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

    sf = set_fields_dict(spec, out, location=loc, terrain=terrain,
                         base_dir=base_dir)
    if sf:
        (out / "system" / "setFieldsDict").write_text(sf)
    ts = topo_set_dict(spec, base_dir)
    if ts:
        (out / "system" / "topoSetDict").write_text(ts)
    cp = create_patch_dict(spec, base_dir)
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
    for name, content in initial_fields(spec, base_dir, terrain).items():
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
        "case_hash": orig.case_hash(),
        # getrennt, weil die Netzvorschau nur hierauf reagieren darf
        "netz_hash": orig.netz_hash(),
        "terrain": terrain is not None,
        "solids": sorted(solids),
        "screens": [s.id for s in spec.structures if s.type == "screen"],
        "faces": {f: p for f, (p, _) in assign_faces(spec).items()},
        "location_in_mesh": loc,
        "problems": problems,
        "notes": notizen,
    }
