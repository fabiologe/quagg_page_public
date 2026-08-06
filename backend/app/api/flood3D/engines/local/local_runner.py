#!/usr/bin/env python3
"""
flood3D Local Runner — läuft IM OpenFOAM-Container auf der Nutzer-Maschine.

Der quagg Local Companion startet diesen Container mit dem Job-Ordner unter
/job. Erwartet wird /job/inputs/case.zip mit dem SERVERSEITIG gebauten Fall
(system/, constant/, 0/, Allrun) plus case.yaml und run_id.txt im Wurzel-
verzeichnis des Archivs. Ausgang: /job/results/artifacts.zip mit exakt den
Artefakten, die auch der Server-Runner erzeugt (manifest.json, result.json,
normalized.parquet, figures/, fields/) — der Import-Endpoint legt sie
unverändert in die Laufablage, die Ergebnis-Phase merkt keinen Unterschied.

Fortschritt als NDJSON auf stdout (Companion-Protokoll wie beim
Flood2D-Solver): {"event":"log"|"progress"|"done"|"error", ...}.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

FOAM_BASHRC = os.environ.get(
    "FOAM_BASHRC", "/usr/lib/openfoam/openfoam2406/etc/bashrc")
SAFE_MEMBER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
# Kerne für den Rechenlauf. 0/leer = automatisch (alle sichtbaren Kerne,
# gedeckelt). Der Server-Runner macht das schon lange; lokal lief bisher
# alles seriell — bei 724k Zellen ist das der Unterschied zwischen
# 9 Stunden und gut einer.
def _cores() -> int:
    env = os.environ.get("QUAGG_FOAM_CORES", "").strip()
    if env.isdigit() and int(env) > 0:
        return int(env)
    return max(1, min(os.cpu_count() or 1, 8))


def emit(**ev) -> None:
    print(json.dumps(ev), flush=True)


def unpack_case(job: Path) -> Path:
    src = job / "inputs" / "case.zip"
    case = job / "case"
    if case.exists():
        shutil.rmtree(case)
    case.mkdir(parents=True)
    with zipfile.ZipFile(src) as z:
        for m in z.namelist():
            # Zip-Slip-Schutz: nur harmlose relative Pfade entpacken
            if not SAFE_MEMBER.match(m) or ".." in m:
                raise ValueError(f"Unsicherer Archivpfad: {m!r}")
        z.extractall(case)
    return case


def _mitgelieferter_core(job: Path, case: Path) -> str | None:
    """
    Das Bundle bringt den Core des Servers mit, der den Fall gebaut hat.
    Diese Kopie schlägt die ins Image gebackene — sonst kippt JEDE neue
    Angabe in der Spezifikation den lokalen Lauf mit „Extra inputs are not
    permitted", solange der Nutzer sein Image nicht neu zieht.
    """
    mit = case / "quagg_runtime"
    ziel = job / "quagg_runtime"
    if mit.is_dir():
        # aus dem Fallordner heraus, damit OpenFOAM und artifacts.zip
        # nichts davon mitbekommen
        if ziel.exists():
            shutil.rmtree(ziel)
        shutil.move(str(mit), str(ziel))
    if (ziel / "flood3D" / "core" / "casespec.py").is_file():
        return str(ziel)
    return None


def _runner_uebergabe(eigen: str | None) -> None:
    """
    Die ins Image gebackene Runner-Kopie übergibt an die aus dem Bundle —
    dieselbe Logik wie beim Core: das Bundle stammt vom Server, der den
    Fall gebaut hat, und kennt jeden neuen Pipeline-Schritt. Ohne die
    Übergabe fehlte z. B. surfaceFeatureExtract (2026-08-06), und snappy
    brach ohne .eMesh-Kanten ab. Der Umgebungswächter verhindert Schleifen.
    """
    if not eigen or os.environ.get("QUAGG_RUNNER_UEBERGEBEN"):
        return
    neu = Path(eigen) / "flood3D" / "engines" / "local" / "local_runner.py"
    try:
        selbst = Path(__file__).resolve()
    except OSError:
        return
    if not neu.is_file() or neu.resolve() == selbst:
        return
    emit(event="log", text="Runner: aus dem Bundle")
    os.environ["QUAGG_RUNNER_UEBERGEBEN"] = "1"
    os.execv(sys.executable, [sys.executable, str(neu)] + sys.argv[1:])


def run_foam_step(case: Path, command: str, log_name: str,
                  end_time: float | None = None) -> None:
    """
    Ein OpenFOAM-Kommando DIREKT (wir sind schon im Foam-Container).
    Beim Solver wird das Log live auf `Time = X` beobachtet und als
    Fortschritt gemeldet.
    """
    emit(event="log", text=f"▶ {command}")
    log_path = case / log_name
    with open(log_path, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            ["bash", "-lc", f"source {FOAM_BASHRC} >/dev/null 2>&1; "
                            f"cd '{case}' && {command}"],
            stdout=lf, stderr=subprocess.STDOUT)
        pos = 0
        letzte_meldung = 0.0
        letzte_zeit = None
        start = time.time()
        while proc.poll() is None:
            time.sleep(2)
            if not end_time:
                continue
            try:
                with open(log_path, encoding="utf-8", errors="replace") as f:
                    f.seek(pos)
                    chunk = f.read()
                    pos = f.tell()
                for m in re.finditer(r"^Time = ([0-9.eE+-]+)", chunk, re.M):
                    letzte_zeit = float(m.group(1))
                # alle 15 s Wanduhr melden — nicht erst ab end_time/50.
                # Sonst sieht der Nutzer bei langen Läufen minutenlang
                # nichts und hält den Lauf für hängengeblieben.
                if time.time() - letzte_meldung >= 15 and letzte_zeit is not None:
                    letzte_meldung = time.time()
                    frac = min(letzte_zeit / end_time, 1.0)
                    verstrichen = time.time() - start
                    rest = (verstrichen / frac - verstrichen) if frac > 0.001 else None
                    emit(event="progress", phase="solving", time=letzte_zeit,
                         end_time=end_time, fraction=round(frac, 4),
                         elapsed_s=round(verstrichen),
                         eta_s=round(rest) if rest else None)
            except OSError:
                pass
        if proc.returncode != 0:
            text = log_path.read_text(errors="replace")
            # OpenFOAM/MPI schreiben die eigentliche Ursache als
            # "--> FOAM FATAL ..." oder "Error"; die reine Schwanzausgabe
            # erwischt sonst nur Hilfetexte.
            kern = ""
            for marke in ("--> FOAM FATAL", "FOAM FATAL", "Error:",
                          "not enough slots", "No times selected",
                          "--> FOAM Warning"):
                i = text.find(marke)
                if i >= 0:
                    kern = text[i:i + 500].strip()
                    break
            raise RuntimeError(f"{command} fehlgeschlagen "
                               f"(Exit {proc.returncode}):\n"
                               f"{kern or text[-500:]}")


MPI = ("mpirun --allow-run-as-root --use-hwthread-cpus --oversubscribe")


def _decompose_dict(case: Path, cores: int) -> None:
    (case / "system" / "decomposeParDict").write_text(
        "FoamFile{version 2.0;format ascii;class dictionary;"
        'location "system";object decomposeParDict;}\n'
        f"numberOfSubdomains {cores};\n\nmethod scotch;\n")


def _zeit_ordner(case: Path) -> list[float]:
    """Vorhandene Ausgabezeitpunkte (> 0) eines Falls."""
    out = []
    if not case.is_dir():
        return out
    for d in case.iterdir():
        if not d.is_dir():
            continue
        try:
            t = float(d.name)
        except ValueError:
            continue
        if t > 0:
            out.append(t)
    return sorted(out)


def _letzte_zeit(case: Path) -> float | None:
    ts = _zeit_ordner(case)
    return ts[-1] if ts else None


def _setze_start(case: Path, wert: str) -> None:
    """startFrom in der controlDict umstellen (für die Wiederaufnahme)."""
    cd = case / "system" / "controlDict"
    txt = cd.read_text(errors="replace")
    cd.write_text(re.sub(r"startFrom\s+\w+;", f"startFrom       {wert};", txt))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True)
    ap.add_argument("--resume", action="store_true",
                    help="angefangenen Lauf fortsetzen statt neu aufsetzen")
    args = ap.parse_args()
    job = Path(args.job)
    results = job / "results"
    results.mkdir(parents=True, exist_ok=True)

    try:
        import yaml

        # Wiederaufnahme: liegt schon ein vernetzter Fall mit
        # Zwischenergebnissen im Job-Ordner, wird NICHT neu vernetzt —
        # sonst wäre nach einem Absturz die gesamte Rechenzeit verloren.
        cores = _cores()
        case = job / "case"
        fortsetzen = args.resume and _letzte_zeit(case) is not None
        if not fortsetzen:
            case = unpack_case(job)

        eigen = _mitgelieferter_core(job, case)
        _runner_uebergabe(eigen)
        sys.path.insert(0, "/opt/quagg")
        if eigen:
            sys.path.insert(0, eigen)
        emit(event="log",
             text=f"Core: {'aus dem Bundle' if eigen else 'aus dem Image'}")
        from flood3D.core.casespec import CaseSpec, migriere
        from flood3D.core.evaluate import evaluate_run, overfall_cd_rows
        from flood3D.core.extract import extract_case
        from flood3D.core.foamfields import (bed_shear_series,
                                             convert_case_fields,
                                             energy_head_series)
        from flood3D.core.normalize import write_normalized
        from flood3D.core.render import render_run
        from flood3D.core.runner import (_pruefe_patches, _y_plus_range,
                                         parse_checkmesh)

        spec = CaseSpec.model_validate(
            migriere(yaml.safe_load((case / "case.yaml").read_text())))
        run_id = (case / "run_id.txt").read_text().strip()

        if fortsetzen:
            t0 = _letzte_zeit(case)
            emit(event="log", text=f"Lauf {run_id} wird bei t = {t0} s "
                                   "fortgesetzt (Netz bleibt stehen)")
            _setze_start(case, "latestTime")
        else:
            emit(event="log", text=f"Fall entpackt, Lauf {run_id} "
                                   f"({spec.meta.title or spec.meta.id})")

        # ---- Netz + Initialisierung (Reihenfolge wie Server-Runner) ------
        if not fortsetzen:
            emit(event="progress", phase="meshing", fraction=0.0)
            run_foam_step(case, "blockMesh", "log.blockMesh")
            # Kanten der Bauwerksflächen herausziehen — das
            # snappyHexMeshDict verweist unter `features` darauf, ohne die
            # .eMesh-Dateien bricht snappyHexMesh sofort ab
            if (case / "system" / "surfaceFeatureExtractDict").exists():
                run_foam_step(case, "surfaceFeatureExtract",
                              "log.surfaceFeatureExtract")
            # snappyHexMesh ist bei feinen Netzen der teuerste Schritt und
            # laeuft ebenfalls parallel — sonst haengt der Lauf minutenlang
            # auf einem Kern, waehrend elf danebenstehen.
            if cores > 1:
                _decompose_dict(case, cores)
                run_foam_step(case, "decomposePar -force -copyZero",
                              "log.decomposePar_mesh")
                emit(event="log", text=f"Vernetze auf {cores} Kernen")
                run_foam_step(case,
                              f"{MPI} -np {cores} "
                              "snappyHexMesh -overwrite -parallel",
                              "log.snappyHexMesh")
                run_foam_step(case, "reconstructParMesh -constant",
                              "log.reconstructParMesh")
                shutil.rmtree(case / "processor0", ignore_errors=True)
                for d in case.glob("processor*"):
                    shutil.rmtree(d, ignore_errors=True)
            else:
                run_foam_step(case, "snappyHexMesh -overwrite",
                              "log.snappyHexMesh")
            if (case / "system" / "topoSetDict").exists():
                run_foam_step(case, "topoSet", "log.topoSet")
            if (case / "system" / "createPatchDict").exists():
                run_foam_step(case, "createPatch -overwrite", "log.createPatch")
            _pruefe_patches(case, spec)
            run_foam_step(case, "checkMesh", "log.checkMesh")
            if (case / "system" / "setFieldsDict").exists():
                run_foam_step(case, "setFields", "log.setFields")
        cm = parse_checkmesh(
            (case / "log.checkMesh").read_text(errors="replace")
            if (case / "log.checkMesh").exists() else "")
        if not fortsetzen:
            emit(event="log",
                 text=f"checkMesh: {'OK' if cm.get('checkmesh_ok') else 'mit Befunden'}"
                      f" · {cm.get('cells', '?')} Zellen")

        # ---- Rechenlauf ---------------------------------------------------
        app_name = spec.solver.application
        if cores > 1:
            _decompose_dict(case, cores)
            run_foam_step(case, "decomposePar -force", "log.decomposePar")
            emit(event="log", text=f"Rechne auf {cores} Kernen")
            run_foam_step(case,
                          f"{MPI} -np {cores} {app_name} -parallel",
                          f"log.{app_name}", end_time=spec.solver.end_time)
            try:
                run_foam_step(case, "reconstructPar -newTimes",
                              "log.reconstructPar")
            except RuntimeError as e:
                # "No times selected" heisst: der Solver hat keinen
                # Ausgabezeitpunkt geschrieben. Das ist kein Absturz,
                # aber ohne Felder gibt es nichts auszuwerten.
                if "No times selected" in str(e):
                    raise RuntimeError(
                        "Der Lauf hat keinen Ausgabezeitpunkt geschrieben — "
                        "die Feldausgabe ist groesser als die "
                        "Simulationsdauer. Schreibintervall verkleinern "
                        "oder laenger rechnen.") from None
                raise
        else:
            run_foam_step(case, app_name, f"log.{app_name}",
                          end_time=spec.solver.end_time)

        # ---- Nachlauf: exakt die Server-Kette -----------------------------
        emit(event="progress", phase="postprocessing", fraction=1.0)

        # Tatsaechlich vernetzte Oberflaeche — ohne sie kann der Viewer
        # weder Bauwerke noch das Solver-Netz einblenden. surfaceMeshExtract
        # endet auch bei Erfolg mit rc != 0, deshalb ohne Abbruch.
        patches = (["terrain"] if spec.terrain is not None else []) \
            + [st.patch for st in spec.structures if st.type != "screen"]
        if patches:
            try:
                run_foam_step(case, "surfaceMeshExtract meshSurface.stl "
                              f"-time 0 -patches '({' '.join(patches)})'",
                              "log.surfaceMeshExtract")
            except RuntimeError:
                pass
            from flood3D.core.meshsurface import find_mesh_surface
            if find_mesh_surface(case) is None:
                emit(event="log", text="WARNUNG: Solver-Netzoberflaeche nicht "
                     "extrahiert — Bauwerke/Netz fehlen im Viewer")

        ypr = _y_plus_range(case)
        run_foam_step(case,
                      "postProcess -noFunctionObjects -func writeCellCentres -time 0",
                      "log.writeCellCentres")
        conv = convert_case_fields(spec, case, job)
        if conv.get("terrain_error"):
            emit(event="log", text="WARNUNG: Geländeschicht nicht erzeugt — "
                 + conv["terrain_error"] + " (Ergebnisse bleiben nutzbar, "
                 "im Viewer fehlt nur das Gelände)")
        df, missing = extract_case(case, spec, run_id)

        import pandas as pd
        rows = (bed_shear_series(spec, job, run_id)
                + energy_head_series(spec, job, run_id))
        if rows:
            df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
        cd_rows = overfall_cd_rows(df, spec, run_id)
        if cd_rows:
            df = pd.concat([df, pd.DataFrame(cd_rows)], ignore_index=True)
        write_normalized(df, job / "normalized.parquet")

        manifest = {"status": "completed", "origin": "companion",
                    "title": spec.meta.title, "checkmesh": cm,
                    "checkmesh_ok": cm.get("checkmesh_ok"),
                    "missing_sources": missing, "finished": time.time()}
        if ypr:
            manifest["y_plus_range"] = [round(ypr[0], 2), round(ypr[1], 2)]
        result = evaluate_run(df, spec, run_id, manifest)
        render_run(result, df, spec, job)
        (job / "manifest.json").write_text(json.dumps(manifest))

        # ---- Artefakte paketieren ----------------------------------------
        art = results / "artifacts.zip"
        with zipfile.ZipFile(art, "w", zipfile.ZIP_DEFLATED) as z:
            for name in ("manifest.json", "result.json", "normalized.parquet"):
                p = job / name
                if p.exists():
                    z.write(p, name)
            for sub in ("figures", "fields"):
                d = job / sub
                if d.is_dir():
                    for f in sorted(d.rglob("*")):
                        if f.is_file():
                            z.write(f, f"{sub}/{f.relative_to(d)}")
            # Szenengeometrie fuer den Viewer: Eingabe-Bauwerke und die
            # vernetzte Solver-Oberflaeche. Der Server erwartet sie unter
            # case/ (dort sucht /runs/{id}/geometry).
            tri = case / "constant" / "triSurface"
            if tri.is_dir():
                for f in sorted(tri.glob("*.stl")):
                    z.write(f, f"case/constant/triSurface/{f.name}")
            for f in sorted(case.glob("meshSurface*.stl")):
                z.write(f, f"case/{f.name}")
        emit(event="done", artifactsFile="artifacts.zip", run_id=run_id,
             sizeBytes=art.stat().st_size)
        return 0
    except Exception as e:  # noqa: BLE001 — Fehler gehört als Event zum Companion
        emit(event="error", text=f"{type(e).__name__}: {str(e)[:500]}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
