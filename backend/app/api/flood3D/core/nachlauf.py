"""
Nachlauf eines gerechneten Falls — die EINE Kette (Fahrplan B2, 2026-09-23).

Bis dahin stand sie zweimal: vollständig im Runner (engines/local/
local_runner.py, im Container) und abgedriftet in `cli all` (ohne Felder,
Sohlschub, Energiehöhe und Überfallbeiwert — ein CLI-Lauf meldete die
zugehörigen Nachweise still „nicht_auswertbar"). Beide rufen jetzt diese
Funktion; OpenFOAM-Schritte kommen als Parameter herein (im Container
direkt, in der CLI keine).

Reihenfolge: Netzoberfläche → Zellzentren → 3D-Felder → Zeitreihen →
Sohlschub/Energiehöhe/Überfallbeiwert → Zwischendatei → y+ → Viz-Selbsttest
→ Bewertung → Befunde → Abbildungen. Fehler in den Feldern beenden den
Nachlauf nicht: Zeitreihen und Nachweise bleiben nutzbar, das Manifest sagt,
was fehlt.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

import pandas as pd

from .casespec import CaseSpec
from .conventions import NUMERIK_VERSION


def nachlauf(case: Path, job: Path, spec: CaseSpec, run_id: str,
             manifest: dict,
             foam: Callable[[str, str], None] | None = None,
             melde: Callable[[str], None] = lambda text: None) -> dict:
    """
    Wertet `case` (OpenFOAM-Fallordner) nach `job` aus: normalized.parquet,
    fields/, result.json, figures/. `manifest` wird ergänzt und
    zurückgegeben (geschrieben wird es vom Aufrufer — er ist der einzige
    Schreiber seines Orts). `foam(befehl, logname)` führt einen
    OpenFOAM-Schritt aus und wirft RuntimeError; ohne `foam` entfallen
    Netzoberfläche und Zellzentren, die Felder nur, wenn 0/C fehlt.
    """
    from .evaluate import befunde_ableiten, evaluate_run, overfall_cd_rows
    from .extract import extract_case
    from .foam import foam_abweichung, foam_version_aus_log
    from .foamfields import (bed_shear_series, convert_case_fields,
                             energy_head_series, viz_volume_check)
    from .meshsurface import find_mesh_surface
    from .normalize import write_normalized
    from .render import render_run
    from .runner import _y_plus_je_patch, _y_plus_range

    case, job = Path(case), Path(job)

    # Tatsächlich vernetzte Oberfläche — ohne sie kann der Viewer weder
    # Bauwerke noch das Solver-Netz einblenden. surfaceMeshExtract endet
    # auch bei Erfolg mit rc != 0, deshalb ohne Abbruch.
    patches = (["terrain"] if spec.terrain is not None else []) \
        + [st.patch for st in spec.structures if st.type != "screen"]
    if foam is not None and patches:
        try:
            foam("surfaceMeshExtract meshSurface.stl "
                 f"-time 0 -patches '({' '.join(patches)})'",
                 "log.surfaceMeshExtract")
        except RuntimeError:
            pass
        if find_mesh_surface(case) is None:
            melde("WARNUNG: Solver-Netzoberflaeche nicht extrahiert — "
                  "Bauwerke/Netz fehlen im Viewer")

    # Felder: scheitert die Konvertierung, stirbt NICHT der ganze Lauf nach
    # Stunden Rechenzeit (F12-Drift)
    conv, fields_error = {}, None
    try:
        if foam is not None:
            foam("postProcess -noFunctionObjects -func writeCellCentres -time 0",
                 "log.writeCellCentres")
        if (case / "0" / "C").exists() or (case / "0" / "C.gz").exists():
            conv = convert_case_fields(spec, case, job)
        else:
            fields_error = "0/C fehlt (Zellzentren nicht geschrieben)"
    except Exception as e:                   # noqa: BLE001
        fields_error = str(e)
    if fields_error:
        melde("WARNUNG: 3D-Felder nicht konvertiert — " + fields_error
              + " (Zeitreihen und Nachweise bleiben nutzbar)")
    if conv.get("terrain_error"):
        melde("WARNUNG: Geländeschicht nicht erzeugt — " + conv["terrain_error"]
              + " (Ergebnisse bleiben nutzbar, im Viewer fehlt nur das Gelände)")

    df, missing = extract_case(case, spec, run_id)
    rows = bed_shear_series(spec, job, run_id) + energy_head_series(spec, job, run_id)
    if rows:
        df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
    cd_rows = overfall_cd_rows(df, spec, run_id)
    if cd_rows:
        df = pd.concat([df, pd.DataFrame(cd_rows)], ignore_index=True)
    write_normalized(df, job / "normalized.parquet")

    foam_v = foam_version_aus_log(case)
    foam_hinweis = foam_abweichung(foam_v)
    if foam_hinweis:
        melde(f"WARNUNG: {foam_hinweis}")
    manifest.update({"foam": foam_v, "foam_hinweis": foam_hinweis,
                     "numerik_version": NUMERIK_VERSION,
                     "missing_sources": missing})
    if conv.get("terrain_error"):
        # die Warnung im Logstrom ist nach dem Schließen des Fensters weg
        manifest["terrain_error"] = conv["terrain_error"]
    if fields_error:
        manifest["fields_error"] = fields_error
    ypr = _y_plus_range(case)
    if ypr:
        manifest["y_plus_range"] = [round(ypr[0], 2), round(ypr[1], 2)]
    ypp = _y_plus_je_patch(case)
    if ypp:
        manifest["y_plus_je_patch"] = {p: [round(a, 2), round(b, 2)]
                                       for p, (a, b) in ypp.items()}
    vol_check = viz_volume_check(job, df)
    if vol_check:
        manifest.update(vol_check)

    result = evaluate_run(df, spec, run_id, manifest)
    manifest.setdefault("befunde", []).extend(
        befunde_ableiten(result.get("quality") or {}, manifest))
    render_run(result, df, spec, job)
    return manifest
