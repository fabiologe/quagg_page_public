"""
Sammelt alle Ergebnisquellen eines gerechneten OpenFOAM-Falls anhand der
casespec ein und liefert die normalisierte Langformat-Tabelle als DataFrame.

Fehlende Quellen sind kein Fehler, sondern werden als Liste zurückgegeben —
ob eine fehlende Quelle den Nachweis verhindert, entscheidet evaluate anhand
der Targets, nicht der Extraktor.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..casespec import CaseSpec
from ..conventions import Component, NORMALIZED_COLUMNS, section_normal
from . import readers


def extract_case(case_dir: str | Path, spec: CaseSpec, run_id: str,
                 ) -> tuple[pd.DataFrame, list[str]]:
    case_dir = Path(case_dir)
    pp = case_dir / "postProcessing"
    rows: list[dict] = []
    missing: list[str] = []

    def collect(fo_name: str, fn, *args):
        fo_dir = pp / fo_name
        got = fn(fo_dir, *args, run_id) if fo_dir.is_dir() else []
        if got:
            rows.extend(got)
        else:
            missing.append(fo_name)

    for patch in spec.evaluation.force_patches:
        collect(f"forces_{patch}", readers.read_forces, patch)
    from ..conventions import FACE_NORMALS
    from ..meshgen import assign_faces
    face_of = {patch: face for face, (patch, _) in assign_faces(spec).items()}
    for b in spec.boundaries:
        n = FACE_NORMALS.get(face_of.get(b.patch))
        if b.type == "atmosphere" or n is None:
            continue
        collect(f"patchflow_{b.patch}", readers.read_discharge, b.patch, n)

    if spec.terrain is not None:
        for st in spec.structures:
            if st.type == "screen":
                continue
            collect(f"shear_{st.patch}", readers.read_wall_shear, st.patch,
                    Component.MAX)
            collect(f"shearmean_{st.patch}", readers.read_wall_shear,
                    st.patch, Component.MEAN)

    if spec.evaluation.verweilzeit:
        for b in spec.boundaries:
            if b.type.startswith("outflow"):
                collect(f"tracer_{b.patch}", readers.read_tracer, b.patch)

    for sec in spec.evaluation.sections:
        collect(f"discharge_{sec.id}", readers.read_discharge, sec.id,
                section_normal(sec.polyline))
    for gauge in spec.evaluation.gauges:
        collect(f"gauge_{gauge.id}", readers.read_gauge, gauge.id)
    collect("water_volume", readers.read_volume)
    collect("residuals", readers.read_residuals)

    log_rows = readers.merge_log_restarts(case_dir, spec.solver.application, run_id)
    if log_rows:
        rows.extend(log_rows)
    else:
        missing.append(f"log.{spec.solver.application}")

    df = pd.DataFrame(rows, columns=NORMALIZED_COLUMNS)
    df = df.sort_values(["quantity", "location_id", "component", "time"],
                        kind="stable").reset_index(drop=True)
    return df, missing
