"""
runner — Ausführung des OpenFOAM-Falls (Spez. Kap. 3, Stufe 5).

Lokaler Docker-Runner nach dem LISFLOOD-Muster (flood2D): das ESI-Image
opencfd/openfoam-run enthält Solver und Utilities ohne Dev-Werkzeuge.
RunPod dockt später hinter demselben Interface an (run_foam austauschen).

Jeder Schritt schreibt sein Log in den Fallordner, das Laufmanifest
(Spez. 4.4) wird fortlaufend aktualisiert — der PostViewer pollt es.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path

OF_IMAGE = os.environ.get("FLOOD3D_OF_IMAGE", "opencfd/openfoam-run:2406")
OF_BASHRC = os.environ.get("FLOOD3D_OF_BASHRC",
                           "/usr/lib/openfoam/openfoam2406/etc/bashrc")
SOLVE_TIMEOUT = int(os.environ.get("FLOOD3D_SOLVE_TIMEOUT", "7200"))
MESH_TIMEOUT = int(os.environ.get("FLOOD3D_MESH_TIMEOUT", "1200"))
CORE_PRICE_EUR_H = float(os.environ.get("FLOOD3D_CORE_PRICE", "0.05"))
CORES = max(1, min(int(os.environ.get("FLOOD3D_CORES", "4")),
                   os.cpu_count() or 1))
# interFoam-Durchsatz je Kern — kalibriert am Lauf demo-stufe3_r001:
# 2032 Schritte x 117.596 Zellen in 2386 s => ~100k Aktualisierungen/Kern-s
CELL_UPDATES_PER_CORE_S = 100_000.0
# Signalgeschwindigkeit fürs Zeitschritt-Kriterium, ebenfalls aus r001
# rückgerechnet (realer mittlerer dt 2.95e-3 s bei alphaCo 0.3, Zelle 6.25 cm)
SIGNAL_SPEED_M_S = 6.0


class FoamError(RuntimeError):
    pass


def _kanten_ziehen(case: Path, name_suffix: str) -> None:
    """
    surfaceFeatureExtract vor dem Vernetzen. Die Kantendateien (.eMesh)
    stehen im snappyHexMeshDict unter `features`; fehlen sie, bricht
    snappyHexMesh mit „Could not open …eMesh" ab. Der Schritt gehört
    deshalb in JEDEN Pfad, nicht nur in die Allrun-Kette.
    """
    if not (case / "system" / "surfaceFeatureExtractDict").exists():
        return
    run_foam(case, "surfaceFeatureExtract", "log.surfaceFeatureExtract",
             name_suffix=name_suffix)


def _mesh_patches(case: Path) -> set:
    """Patchnamen aus constant/polyMesh/boundary."""
    p = case / "constant" / "polyMesh" / "boundary"
    if not p.is_file():
        return set()
    text = p.read_text(errors="replace")
    # Einträge sehen so aus:  name\n{ ... type patch; ... }
    return set(re.findall(r"^\s{4}(\w+)\s*$", text, re.M))


def _pruefe_patches(case: Path, spec) -> None:
    """
    Nach createPatch: hat das Netz jeden Patch, den die Auswertung erwartet?

    Ein Fenster, dessen Fläche vollständig im Erdreich liegt (typisch: ein
    Rohr, das unter dem Gelände verläuft — snappyHexMesh entfernt dessen
    Inneres), erzeugt NULL Flächen. createPatch verwirft den leeren Patch,
    und interFoam stirbt erst Stunden später beim ersten Auswerteschritt.
    Hier bricht es sofort ab und sagt, was fehlt.
    """
    vorhanden = _mesh_patches(case)
    if not vorhanden:
        return
    fehlend = [b.patch for b in spec.boundaries if b.patch not in vorhanden]
    if not fehlend:
        return
    raise RuntimeError(
        "Diese Randbedingungen haben im fertigen Netz keine einzige Fläche: "
        + ", ".join(fehlend)
        + ". Das passiert, wenn das Fenster vollständig im Gelände oder in "
          "einem Bauwerk liegt — etwa bei einem Rohr, das unter dem Gelände "
          "verläuft: dessen Inneres wird beim Vernetzen entfernt. Vorhandene "
          "Patches: " + ", ".join(sorted(vorhanden)))


def run_foam(case_dir: str | Path, command: str, log_name: str,
             timeout: int = MESH_TIMEOUT, name_suffix: str = "") -> Path:
    """
    Ein OpenFOAM-Kommando im Container, Log nach case_dir/log_name.
    Bei Timeout wird der Container hart entfernt (docker rm -f), weil das
    Beenden der CLI allein den Solver weiterlaufen ließe.
    """
    case_dir = Path(case_dir).resolve()
    container = f"f3d_{case_dir.name}_{name_suffix or log_name}".replace(".", "_")
    log_path = case_dir / log_name
    cmd = ["docker", "run", "--rm", "--name", container,
           "-v", f"{case_dir}:/case", "-w", "/case",
           "--entrypoint", "/bin/bash", OF_IMAGE,
           "-c", f"source {OF_BASHRC} && {command}"]
    with open(log_path, "w") as log:
        try:
            proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT,
                                  timeout=timeout)
        except subprocess.TimeoutExpired:
            subprocess.run(["docker", "rm", "-f", container],
                           capture_output=True)
            raise FoamError(
                f"{command.split()[0]} nach {timeout} s abgebrochen — "
                f"Log: {log_name}")
    if proc.returncode != 0:
        tail = "\n".join(log_path.read_text(errors="replace").splitlines()[-15:])
        raise FoamError(f"{command.split()[0]} fehlgeschlagen "
                        f"(Log {log_name}):\n{tail}")
    return log_path


# --------------------------------------------------------------------------
# checkMesh-Auswertung und Schätzung
# --------------------------------------------------------------------------

_CM_PATTERNS = {
    "cells": re.compile(r"^\s*cells:\s+(\d+)", re.M),
    "points": re.compile(r"^\s*points:\s+(\d+)", re.M),
    "max_non_ortho": re.compile(r"Mesh non-orthogonality Max:\s*([\d.eE+-]+)"),
    "max_skewness": re.compile(r"Max skewness =\s*([\d.eE+-]+)"),
}


def parse_checkmesh(text: str) -> dict:
    out: dict = {}
    for key, pat in _CM_PATTERNS.items():
        m = pat.search(text)
        if m:
            out[key] = float(m.group(1)) if "." in m.group(1) or "e" in m.group(1) \
                else int(m.group(1))
    failed = re.search(r"Failed (\d+) mesh checks", text)
    out["checkmesh_ok"] = failed is None and "Mesh OK" in text
    if failed:
        out["failed_checks"] = int(failed.group(1))
    return out


def estimate_run(spec, cells: int, cores: int = CORES) -> dict:
    """
    Laufzeit- und Kostenschätzung (Spez. Kap. 6.1, Netz- und Kostenvorschau).
    Maßgeblich ist das Alpha-Courant-Kriterium auf der feinsten Zellstufe —
    beide Konstanten sind am Referenzlauf kalibriert (Abweichung dort < 5 %).
    """
    max_level = max([r.level for r in spec.mesh.refinements] + [0])
    finest = spec.mesh.base_cell / 2 ** max_level
    dt = spec.solver.max_alpha_co * finest / SIGNAL_SPEED_M_S
    steps = spec.solver.end_time / max(dt, 1e-6)
    core_seconds = cells * steps / CELL_UPDATES_PER_CORE_S
    wall_h = core_seconds / cores / 3600.0
    return {
        "cells": cells,
        "cores": cores,
        "dt_estimate_s": dt,
        "steps_estimate": int(steps),
        "wall_time_estimate_h": round(wall_h, 3),
        "cost_estimate_eur": round(core_seconds / 3600.0 * CORE_PRICE_EUR_H, 2),
        "hinweis": "Schätzung, wird nach den ersten Läufen kalibriert",
    }


# --------------------------------------------------------------------------
# Netzvorschau
# --------------------------------------------------------------------------

def extract_mesh_surface(spec, case_dir: Path) -> bool:
    """
    Tatsächlich vernetzte Oberfläche (Gelände + Bauwerke) als STL neben den
    Fall legen — die Solver-Netz-Ansicht im Viewer. Fehlschlag ist kein
    Abbruchgrund (surfaceMeshExtract endet auch bei Erfolg mit rc != 0).
    """
    patches = (["terrain"] if spec.terrain is not None else []) \
        + [s.patch for s in spec.structures if s.type != "screen"]
    if not patches:
        return False
    try:
        run_foam(case_dir,
                 f"surfaceMeshExtract meshSurface.stl -time 0 "
                 f"-patches '({' '.join(patches)})'",
                 "log.surfaceMeshExtract", name_suffix="sme")
    except FoamError:
        pass
    from .meshsurface import find_mesh_surface
    return find_mesh_surface(case_dir) is not None


def mesh_preview(spec, case_dir: str | Path) -> dict:
    """blockMesh + snappyHexMesh + checkMesh auf einem fertig gebauten Fall."""
    case_dir = Path(case_dir)
    run_foam(case_dir, "blockMesh", "log.blockMesh", name_suffix="bm")
    _kanten_ziehen(case_dir, "sfe")
    run_foam(case_dir, "snappyHexMesh -overwrite", "log.snappyHexMesh",
             name_suffix="shm")
    # Fenster ausschneiden wie im echten Lauf. Ohne diesen Schritt kann die
    # Vorschau „in Ordnung" melden, obwohl eine Randbedingung im fertigen
    # Netz keine einzige Fläche hat (Rohr unter Gelände, Fenster im
    # Bauwerk) — das fiel bisher erst nach Stunden Rechenzeit auf.
    if (case_dir / "system" / "topoSetDict").exists():
        run_foam(case_dir, "topoSet", "log.topoSet", name_suffix="ts")
    if (case_dir / "system" / "createPatchDict").exists():
        run_foam(case_dir, "createPatch -overwrite", "log.createPatch",
                 name_suffix="cp")
    _pruefe_patches(case_dir, spec)
    run_foam(case_dir, "checkMesh", "log.checkMesh", name_suffix="cm")
    cm = parse_checkmesh((case_dir / "log.checkMesh").read_text(errors="replace"))
    extract_mesh_surface(spec, case_dir)
    # Zwei Hashes, weil zwei Fragen: `case_hash` beantwortet „ist das noch
    # derselbe Fall?" (Laufmanifest), `netz_hash` „steht dieses Netz noch?".
    # Nur der zweite darf die Vorschau entwerten — sonst meldet sie sich
    # nach jedem geänderten Grenzwert als veraltet, obwohl kein Netzelement
    # anders ist.
    result = {**cm, **estimate_run(spec, cm.get("cells", 0)),
              "case_hash": spec.case_hash(),
              "netz_hash": spec.netz_hash()}
    (case_dir / "mesh_preview.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False))
    return result


# --------------------------------------------------------------------------
# Vollständiger Lauf
# --------------------------------------------------------------------------

def _write_manifest(run_root: Path, **updates) -> dict:
    path = run_root / "manifest.json"
    manifest = json.loads(path.read_text()) if path.exists() else {}
    manifest.update(updates)
    run_root.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return manifest


def _y_plus_range(case_dir: Path) -> list[float] | None:
    """Globale y+-Spanne aus postProcessing/y_plus (Zeilen: t patch min max avg)."""
    out = None
    root = case_dir / "postProcessing" / "y_plus"
    if not root.is_dir():
        return None
    for dat in sorted(root.rglob("yPlus.dat")):
        for line in dat.read_text(errors="replace").splitlines():
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                lo, hi = float(parts[2]), float(parts[3])
            except ValueError:
                continue
            out = ([lo, hi] if out is None
                   else [min(out[0], lo), max(out[1], hi)])
    return out


def run_pipeline(spec, case_source_dir: Path, run_root: Path,
                 run_id: str) -> dict:
    """
    Kompletter Lauf: Fall bauen -> Netz -> Initialisierung -> interFoam ->
    Extraktion/Bewertung/Abbildungen -> Felddaten fürs 3D. Das Manifest
    spiegelt jeden Schritt; Fehler beenden den Lauf mit status=failed.
    """
    from .casebuilder import build_case
    from .evaluate import evaluate_run
    from .extract import extract_case
    from .foamfields import convert_case_fields
    from .normalize import write_normalized
    from .render import render_run

    case_dir = run_root / "case"
    t0 = time.time()
    _write_manifest(run_root, run_id=run_id, status="building",
                    of_image=OF_IMAGE, started=t0,
                    case_hash=spec.case_hash(), cores=1)
    try:
        info = build_case(spec, case_dir, case_source_dir)
        if info["problems"]:
            raise FoamError("Geometrieprobleme: " + "; ".join(info["problems"]))

        _write_manifest(run_root, status="meshing")
        run_foam(case_dir, "blockMesh", "log.blockMesh", name_suffix="bm")
        _kanten_ziehen(case_dir, "sfe")
        run_foam(case_dir, "snappyHexMesh -overwrite", "log.snappyHexMesh",
                 name_suffix="shm")
        if (case_dir / "system" / "topoSetDict").exists():
            run_foam(case_dir, "topoSet", "log.topoSet", name_suffix="ts")
        if (case_dir / "system" / "createPatchDict").exists():
            # Zu-/Ablauf-Fenster: Restflächen der Randpatches werden Wand
            run_foam(case_dir, "createPatch -overwrite", "log.createPatch",
                     name_suffix="cp")
        _pruefe_patches(case_dir, spec)
        run_foam(case_dir, "checkMesh", "log.checkMesh", name_suffix="cm")
        cm = parse_checkmesh((case_dir / "log.checkMesh")
                             .read_text(errors="replace"))
        _write_manifest(run_root, checkmesh=cm,
                        checkmesh_ok=cm.get("checkmesh_ok"))
        extract_mesh_surface(spec, case_dir)
        if (case_dir / "system" / "setFieldsDict").exists():
            run_foam(case_dir, "setFields", "log.setFields", name_suffix="sf")

        _write_manifest(run_root, status="solving", cores=CORES)
        app = spec.solver.application
        if CORES > 1:
            from .foam import foam_file
            (case_dir / "system" / "decomposeParDict").write_text(foam_file(
                "decomposeParDict",
                f"numberOfSubdomains {CORES};\n\nmethod          scotch;",
                location="system"))
            run_foam(case_dir, "decomposePar -force", "log.decomposePar",
                     name_suffix="dp")
            run_foam(case_dir,
                     f"mpirun --allow-run-as-root -np {CORES} {app} -parallel",
                     f"log.{app}", timeout=SOLVE_TIMEOUT, name_suffix="solve")
            run_foam(case_dir, "reconstructPar -newTimes",
                     "log.reconstructPar", name_suffix="rp")
            import shutil
            for p in case_dir.glob("processor*"):
                shutil.rmtree(p, ignore_errors=True)
        else:
            run_foam(case_dir, app, f"log.{app}", timeout=SOLVE_TIMEOUT,
                     name_suffix="solve")

        # Felder VOR der Bewertung konvertieren — die Sohlschubspannungs-
        # y+-Spanne der Wandfunktionen ins Manifest (Qualitätsansicht) —
        # nach Material/Rauheit der Gültigkeitsnachweis der Wandbehandlung
        ypr = _y_plus_range(case_dir)
        if ypr:
            _write_manifest(run_root,
                            y_plus_range=[round(ypr[0], 2), round(ypr[1], 2)])

        # Zeitreihen (min_bed_shear-Target) entstehen aus den Feldern.
        _write_manifest(run_root, status="converting_fields")
        try:
            run_foam(case_dir,
                     "postProcess -noFunctionObjects -func writeCellCentres -time 0",
                     "log.writeCellCentres", name_suffix="cc")
            convert_case_fields(spec, case_dir, run_root)
        except Exception as e:
            _write_manifest(run_root, fields_error=str(e))

        _write_manifest(run_root, status="extracting")
        df, missing = extract_case(case_dir, spec, run_id)
        from .evaluate import overfall_cd_rows
        from .foamfields import bed_shear_series, energy_head_series
        import pandas as pd
        rows = (bed_shear_series(spec, run_root, run_id)
                + energy_head_series(spec, run_root, run_id))
        if rows:
            df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
        # Überfallbeiwert braucht die Basisreihen (Q, Pegel) aus df
        cd_rows = overfall_cd_rows(df, spec, run_id)
        if cd_rows:
            df = pd.concat([df, pd.DataFrame(cd_rows)], ignore_index=True)
        write_normalized(df, run_root / "normalized.parquet")
        manifest = _write_manifest(run_root, missing_sources=missing)
        # Ergebnis-JSON trägt den Endzustand, nicht den Zwischenschritt
        result = evaluate_run(df, spec, run_id,
                              {**manifest, "status": "completed"})
        render_run(result, df, spec, run_root)

        _write_manifest(run_root, status="completed", finished=time.time(),
                        duration_s=round(time.time() - t0, 1))
    except Exception as e:
        _write_manifest(run_root, status="failed", error=str(e),
                        finished=time.time(),
                        duration_s=round(time.time() - t0, 1))
        raise
    return json.loads((run_root / "manifest.json").read_text())
