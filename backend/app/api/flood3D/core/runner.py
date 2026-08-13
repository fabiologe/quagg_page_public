"""
runner — Docker-Werkzeuge des Servers: NETZVORSCHAU und Schätzung.

Gerechnet wird seit Stage B (2026-08-13) NICHT mehr hier — Läufe fahren
über den RunPod-Relay oder den Local Companion, beide mit
engines/local/local_runner.py. Dieses Modul behält, was der Server
selbst braucht: run_foam im Docker-Container (Netzvorschau, 2 Ränge),
checkMesh-Auswertung, Laufzeit-/Kostenschätzung und das Aufräumen
verwaister f3d_*-Container. local_runner leiht sich von hier
_pruefe_patches, _y_plus_range und parse_checkmesh.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import uuid
from pathlib import Path

OF_IMAGE = os.environ.get("FLOOD3D_OF_IMAGE", "opencfd/openfoam-run:2406")
OF_BASHRC = os.environ.get("FLOOD3D_OF_BASHRC",
                           "/usr/lib/openfoam/openfoam2406/etc/bashrc")
MESH_TIMEOUT = int(os.environ.get("FLOOD3D_MESH_TIMEOUT", "1200"))
# Cloud-Satz aus der RunPod-Preisliste (2026-08-12): jede CPU-Stufe kostet
# 0,036 $ je vCPU-Stunde — 2, 4, 8, 16 und 32 vCPU liegen exakt auf derselben
# Geraden. Mehr Kerne kosten also nicht mehr, SOLANGE der Solver sie ausnutzt;
# teuer wird nur schlechte Skalierung (Faustregel interFoam: 20-50k Zellen je
# Kern). Umgerechnet mit 0,92 EUR/USD.
POD_PRICE_EUR_H = float(os.environ.get("FLOOD3D_POD_CORE_PRICE", "0.033"))
# interFoam-Durchsatz je Kern. Erst am kleinen Lauf demo-stufe3_r001
# geeicht (117.596 Zellen => ~100k Aktualisierungen/Kern-s) — an einem
# ECHTEN Fall gemessen ist das um ein Vielfaches zu optimistisch:
# Rentrisch_BetaTest06, 943.370 Zellen (2026-08-12)
#   Server,  4 Kerne: 5,66 s je Zeitschritt => 42.000 /Kern-s
#   RunPod, 16 vCPU:  4,51 s je Zeitschritt => 13.000 /Kern-s
# Grosse Netze fallen also deutlich ab (Speicherbandbreite, Austausch
# zwischen den Raengen). 20.000 ist der vorsichtige Mittelwert; lieber zu
# lang geschaetzt als jemanden in einen 47-Stunden-Lauf laufen lassen.
CELL_UPDATES_PER_CORE_S = float(
    os.environ.get("FLOOD3D_CELL_UPDATES_PER_CORE_S", "100000"))
# Der Durchsatz ist keine Konstante: er faellt mit der Netzgroesse
# (Speicherbandbreite, Austausch zwischen den Raengen). Zwei Messpunkte auf
# DERSELBEN Maschine:
#   demo-stufe3_r001      117.596 Zellen -> 100.000 /Kern-s
#   Rentrisch_BetaTest06  943.370 Zellen ->  42.000 /Kern-s
# Das ist ein Potenzgesetz mit Exponent ln(100/42)/ln(943/118) = 0,42.
GROSSNETZ_ABFALL = 0.42
REFERENZ_ZELLEN = 117_596.0


def durchsatz_je_kern(cells: int) -> float:
    """Zellaktualisierungen je Kern und Sekunde fuer ein Netz dieser Groesse."""
    if cells <= 0:
        return CELL_UPDATES_PER_CORE_S
    wert = CELL_UPDATES_PER_CORE_S * (cells / REFERENZ_ZELLEN) ** -GROSSNETZ_ABFALL
    return max(8_000.0, min(CELL_UPDATES_PER_CORE_S, wert))
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


# Welcher Container gerade für welches Arbeitsverzeichnis rechnet — die
# Namen tragen seit dem Kollisions-Fix einen Zufallsanteil, ohne Registry
# könnte ein Abbruch-Endpunkt sie nicht finden (Audit H3)
_container_je_dir: dict[str, str] = {}


def laufende_container_stoppen(wurzel: str | Path) -> list[str]:
    """
    Alle registrierten Container stoppen, deren Arbeitsverzeichnis unter
    `wurzel` liegt. Rückgabe: die gestoppten Namen. Der zugehörige
    `subprocess.run` in run_foam endet dadurch mit Rückgabewert != 0 —
    der Lauf bricht am aktuellen Schritt ab.
    """
    wurzel = str(Path(wurzel).resolve())
    gestoppt = []
    for verz, name in list(_container_je_dir.items()):
        if verz.startswith(wurzel):
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
            gestoppt.append(name)
    return gestoppt


def verwaiste_container_entfernen() -> list[str]:
    """
    VERWAISTE f3d_*-Container abräumen (API-Start): entfernt wird nur, was
    keinen lebenden Erzeuger-Prozess mehr hat (Label quagg.pid). API-Läufe
    sterben mit dem API-Prozess — ihre Container rechnen nach einem
    Neustart ins Leere. Ein PARALLEL laufender Verifikationslauf (pytest,
    eigener Prozess) bleibt dagegen unangetastet — der Wächter hat am
    2026-08-11 genau so einen erschossen. Rückgabe: entfernte Namen.
    """
    try:
        out = subprocess.run(
            ["docker", "ps", "-a", "--filter", "name=f3d_",
             "--format", '{{.Names}}\t{{.Label "quagg.pid"}}'],
            capture_output=True, text=True, timeout=20)
    except Exception:                          # noqa: BLE001 — kein Docker,
        return []                              # kein Problem
    entfernt = []
    for zeile in out.stdout.splitlines():
        teile = zeile.split("\t")
        name = teile[0].strip()
        pid = teile[1].strip() if len(teile) > 1 else ""
        if not name.startswith("f3d_"):
            continue
        # lebender Erzeuger (z. B. pytest-Verifikation) -> in Ruhe lassen;
        # Container ohne Label stammen von vor dem Fix und sind verwaist
        if pid.isdigit() and Path(f"/proc/{pid}").exists():
            continue
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        entfernt.append(name)
    return entfernt


def run_foam(case_dir: str | Path, command: str, log_name: str,
             timeout: int = MESH_TIMEOUT, name_suffix: str = "") -> Path:
    """
    Ein OpenFOAM-Kommando im Container, Log nach case_dir/log_name.
    Bei Timeout wird der Container hart entfernt (docker rm -f), weil das
    Beenden der CLI allein den Solver weiterlaufen ließe.
    """
    case_dir = Path(case_dir).resolve()
    # Eindeutiger Zusatz je Aufruf: der Verzeichnisname allein ist NICHT
    # eindeutig — jede Netzvorschau heißt `derived/mesh_preview`, egal zu
    # welchem Fall. Zwei Vorschauen (Doppelklick, zweiter Fall) kollidierten
    # sonst am Containernamen („Conflict. The container name … is already
    # in use") und der zweite Lauf starb mit 422.
    eindeutig = uuid.uuid4().hex[:8]
    container = (f"f3d_{case_dir.name}_{name_suffix or log_name}_{eindeutig}"
                 .replace(".", "_"))
    log_path = case_dir / log_name
    cmd = ["docker", "run", "--rm", "--name", container,
           # PID des Erzeugers als Label: der Start-Wächter räumt nur
           # Container, deren Erzeuger-Prozess tot ist — sonst erschießt
           # ein API-Neustart einen parallel laufenden pytest-
           # Verifikationslauf (2026-08-11 real passiert)
           "--label", f"quagg.pid={os.getpid()}",
           "-v", f"{case_dir}:/case", "-w", "/case",
           "--entrypoint", "/bin/bash", OF_IMAGE,
           "-c", f"source {OF_BASHRC} && {command}"]
    _container_je_dir[str(case_dir)] = container
    try:
        with open(log_path, "w") as log:
            try:
                proc = subprocess.run(cmd, stdout=log,
                                      stderr=subprocess.STDOUT,
                                      timeout=timeout)
            except subprocess.TimeoutExpired:
                subprocess.run(["docker", "rm", "-f", container],
                               capture_output=True)
                raise FoamError(
                    f"{command.split()[0]} nach {timeout} s abgebrochen — "
                    f"Log: {log_name}")
    finally:
        _container_je_dir.pop(str(case_dir), None)
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


def estimate_run(spec, cells: int, cores: int = 16,
                 satz: float | None = None) -> dict:
    """
    Laufzeit- und Kostenschätzung (Spez. Kap. 6.1, Netz- und Kostenvorschau).
    Maßgeblich ist das Alpha-Courant-Kriterium auf der feinsten Zellstufe —
    beide Konstanten sind am Referenzlauf kalibriert (Abweichung dort < 5 %).
    """
    max_level = max([r.level for r in spec.mesh.refinements] + [0])
    finest = spec.mesh.base_cell / 2 ** max_level
    dt = spec.solver.max_alpha_co * finest / SIGNAL_SPEED_M_S
    steps = spec.solver.end_time / max(dt, 1e-6)
    core_seconds = cells * steps / durchsatz_je_kern(cells)
    wall_h = core_seconds / cores / 3600.0
    return {
        "cells": cells,
        "cores": cores,
        "dt_estimate_s": dt,
        "steps_estimate": int(steps),
        "wall_time_estimate_h": round(wall_h, 3),
        "cost_estimate_eur": round(core_seconds / 3600.0
                                   * (POD_PRICE_EUR_H if satz is None else satz), 2),
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


def _snappy(case_dir: Path, ranks: int | None = None) -> None:
    """
    snappyHexMesh — parallel mit FESTER Rangzahl und hierarchischer
    Zerlegung. Das Netz haengt sonst an der Maschine: scotch partitioniert
    je Rangzahl anders, und mit der Partition aendert sich das parallele
    snappy-Ergebnis (r007: 16 Raenge -> 60 % weniger Zellen, Schiefe 7,2,
    checkMesh durchgefallen). Feste Raenge + hierarchical = identisches
    Netz auf Server, Nutzer-Maschine und RunPod. Der SOLVER dekomponiert
    danach separat mit den Raengen der Maschine (scotch, unveraendert).
    """
    from .meshgen import MESH_RANKS, netz_zerlegung_dict

    ranks = MESH_RANKS if ranks is None else max(1, int(ranks))
    if ranks > 1:
        (case_dir / "system" / "decomposeParDict").write_text(
            netz_zerlegung_dict(ranks))
        run_foam(case_dir, "decomposePar -force -copyZero",
                 "log.decomposePar_mesh", name_suffix="dpm")
        # --oversubscribe: die festen Raenge duerfen ueber den Kernen der
        # Maschine liegen (8 auf dem 4-Kern-Server) — Minuten Vernetzung
        # sind der Preis fuer ein ueberall identisches Netz
        run_foam(case_dir,
                 f"mpirun --allow-run-as-root --oversubscribe -np {ranks} "
                 "snappyHexMesh -overwrite -parallel",
                 "log.snappyHexMesh", name_suffix="shm")
        run_foam(case_dir, "reconstructParMesh -constant",
                 "log.reconstructParMesh", name_suffix="rpm")
        import shutil
        for p in case_dir.glob("processor*"):
            shutil.rmtree(p, ignore_errors=True)
    else:
        run_foam(case_dir, "snappyHexMesh -overwrite", "log.snappyHexMesh",
                 name_suffix="shm")


def mesh_preview(spec, case_dir: str | Path) -> dict:
    """blockMesh + snappyHexMesh + checkMesh auf einem fertig gebauten Fall."""
    case_dir = Path(case_dir)
    run_foam(case_dir, "blockMesh", "log.blockMesh", name_suffix="bm")
    _kanten_ziehen(case_dir, "sfe")
    from .meshgen import PREVIEW_RANKS
    _snappy(case_dir, ranks=PREVIEW_RANKS)
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
    # Schaetzung auf RunPod-Basis (16 Threads, Cloud-Satz): der Server
    # rechnet keine Laeufe mehr — die Zahl soll zum echten Rechenort passen.
    # Lokal variiert je nach Rechner; das sagt der Client dazu.
    result = {**cm,
              **estimate_run(spec, cm.get("cells", 0), cores=16,
                             satz=POD_PRICE_EUR_H),
              "schaetzung_basis": "RunPod, 16 Threads",
              "case_hash": spec.case_hash(),
              "netz_hash": spec.netz_hash()}
    (case_dir / "mesh_preview.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False))
    return result


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
