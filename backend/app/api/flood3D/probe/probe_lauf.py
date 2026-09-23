"""
Probelauf der Hülle: Fall bauen → im Server-Docker rechnen → messen.

Derselbe Weg wie ein echter Lauf (bundle_bauen → case.zip → local_runner
im OpenFOAM-Image), dieselben Leser wie die Auswertung (extract_case) —
gemessen wird also, was ein Nutzer bekäme. Nur der Rechenort ist der
Server, ohne Relay, ohne Kosten (Fabio, 2026-09-23: nichts auf RunPod).

    cd backend
    venv/bin/python -m app.api.flood3D.probe.probe_lauf --fall k --name a0_k
    venv/bin/python -m app.api.flood3D.probe.probe_lauf \
        --fall ordner:app/api/flood3D/data/cases/Rentrich_BetaTest08 \
        --name a0_a --ende 10 --felder 0.5
    venv/bin/python -m app.api.flood3D.probe.probe_lauf --nur-auswerten a0_k

Ablage: flood3D/data/probe_a/<name>/ — NIE unter /tmp (Snap-Docker mountet
/tmp-Pfade leer in den Container). Nach der Messung werden die
Zeitschritt-Ordner gelöscht (Platte!); postProcessing, Logs und probe.json
bleiben. `--behalten` lässt alles liegen.

Gemessen (probe.json), je Größe EINE Zahl, damit vorher/nachher
vergleichbar ist:
  z_zulauf_max_1s   höchste nasse Zelle (α > 0,5) in den ersten zwei
                    Zellreihen vor der Zulauffläche, t ≤ 1 s — der Vorhang
  u_max_2s          max |U| in nassen Zellen, t ≤ 2 s
  massenfehler      |ΔV − ∫(Zu − Ab) dt| / ∫Zu dt
  q_querschnitt     Q am ersten Querschnitt, Mittel der letzten Sekunde
  wsp_pegel         Wasserspiegel am ersten Pegel, Mittel der letzten Sekunde
  co_max            Courant-Spitze aus dem Solver-Log
  y_plus            je Patch min/max zum letzten Zeitpunkt
  tracer_verlust    (∫Zu − ∫Ab·T_ab − Σ α·T·V) / ∫Zu   (nur mit Verweilzeit)
  tracer_in_luft    Σ (1 − α)·T·V / ∫Zu               (nur mit Verweilzeit)
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

from ..core.casespec import CaseSpec
from ..core.conventions import Quantity
from ..core.normalize import get_series

HIER = Path(__file__).resolve().parent
WURZEL = HIER.parent / "data" / "probe_a"
IMAGE = "fabiologe/quagg-foam-local:latest"
BASHRC = "/usr/lib/openfoam/openfoam2406/etc/bashrc"
PLATTE_MIN_GB = 3.0


# --------------------------------------------------------------------------
# Bauen
# --------------------------------------------------------------------------

def bauen(fall: str, job: Path, ende: float | None, felder: float | None,
          trotz_fehler: bool = False) -> CaseSpec:
    from ..core.bundle import bundle_bauen
    from ..core.validate import validate_case
    from . import faelle

    fall_dir = job / "fall"
    if fall == "k":
        spec = faelle.fall_k(**({"ende": ende} if ende else {}))
        fall_dir.mkdir(parents=True, exist_ok=True)
    elif fall == "wehr":
        spec = faelle.wehr()
        fall_dir.mkdir(parents=True, exist_ok=True)
    elif fall.startswith("ordner:"):
        spec = faelle.fall_aus_ordner(Path(fall[7:]), fall_dir, ende, felder)
    else:
        raise SystemExit(f"unbekannter Fall {fall!r} (k | wehr | ordner:<pfad>)")
    if fall in ("k", "wehr"):
        if ende:
            spec.solver.end_time = ende
        if felder:
            spec.solver.write_interval_fields = felder
    spec.to_yaml(fall_dir / "case.yaml")

    befunde = validate_case(spec, fall_dir)
    for b in befunde:
        print(f"  [{b['severity']}] {b['object_id']}: {b['message'][:160]}")
    if any(b["severity"] == "fehler" for b in befunde) and not trotz_fehler:
        raise SystemExit("Prüfung meldet Fehler — kein Lauf (--trotz-fehler übersteuert)")

    (job / "inputs").mkdir(parents=True, exist_ok=True)
    (job / "inputs" / "case.zip").write_bytes(bundle_bauen(spec, fall_dir, job.name))
    return spec


# --------------------------------------------------------------------------
# Rechnen
# --------------------------------------------------------------------------

def _platte_pruefen() -> None:
    frei = shutil.disk_usage("/").free / 1e9
    if frei < PLATTE_MIN_GB:
        raise SystemExit(f"nur {frei:.1f} GB frei — mindestens {PLATTE_MIN_GB:g} GB "
                         "nötig; alte Probe-Ordner löschen")


def rechnen(job: Path, kerne: int, speicher: str, timeout_s: int) -> float:
    _platte_pruefen()
    name = f"f3d_probe_{job.name}"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    cmd = ["docker", "run", "--rm", "--name", name,
           "--cpus", str(kerne), "--memory", speicher, "--shm-size=2g",
           "-e", f"FLOOD3D_CORES={kerne}", "-v", f"{job}:/job", IMAGE,
           "--job", "/job"]
    t0 = time.time()
    letzte = 0.0
    with open(job / "runner.ndjson", "w") as log:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True)
        try:
            for zeile in proc.stdout:
                log.write(zeile)
                if time.time() - letzte > 30 or '"error"' in zeile or '"done"' in zeile:
                    letzte = time.time()
                    print(f"  {time.time() - t0:6.0f} s  {zeile.strip()[:150]}", flush=True)
                if time.time() - t0 > timeout_s:
                    raise TimeoutError
            proc.wait()
        except TimeoutError:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
            raise SystemExit(f"Zeitdeckel {timeout_s} s erreicht — Container entfernt")
    dauer = time.time() - t0
    if proc.returncode != 0:
        raise SystemExit(f"Runner endete mit {proc.returncode} — siehe {job}/runner.ndjson")
    return dauer


def zellvolumen(job: Path) -> None:
    """0/V schreiben (die Tracer- und Volumenbilanz braucht Zellvolumen)."""
    if list((job / "case" / "0").glob("V*")):
        return
    subprocess.run(
        ["docker", "run", "--rm", "--cpus", "1", "-v", f"{job}:/job",
         "--entrypoint", "bash", IMAGE, "-lc",
         f"source {BASHRC} && cd /job/case && postProcess -noFunctionObjects "
         "-func writeCellVolumes -time 0 > log.writeCellVolumes 2>&1"],
        check=True)


# --------------------------------------------------------------------------
# Messen
# --------------------------------------------------------------------------

def _feld(pfad: Path, n: int | None = None) -> np.ndarray | None:
    gz = pfad.with_name(pfad.name + ".gz")
    if gz.is_file():
        t = gzip.decompress(gz.read_bytes()).decode()
    elif pfad.is_file():
        t = pfad.read_text()
    else:
        return None
    m = re.search(r"internalField\s+nonuniform\s+List<(vector|scalar)>\s*\n?(\d+)\s*\n?\(\s*(.*?)\)\s*;", t, re.S)
    if m:
        if m.group(1) == "vector":
            return np.array([[float(x) for x in z.split()]
                             for z in re.findall(r"\(([^()]*)\)", "(" + m.group(3) + ")")
                             if z.strip()], dtype=float).reshape(-1, 3)
        return np.array(m.group(3).split(), dtype=float)
    m = re.search(r"internalField\s+uniform\s+(\([^)]*\)|[-+\d.eE]+)\s*;", t)
    if m and n:
        v = m.group(1)
        if v.startswith("("):
            return np.tile(np.array(v.strip("()").split(), dtype=float), (n, 1))
        return np.full(n, float(v))
    return None


def _zeiten(case: Path) -> list[tuple[float, Path]]:
    out = []
    for d in case.iterdir():
        if d.is_dir() and re.fullmatch(r"\d+(\.\d+)?(e[-+]?\d+)?", d.name) and d.name != "0":
            out.append((float(d.name), d))
    return sorted(out)


def _integral(t, q, t0=None, t1=None) -> float:
    if len(t) < 2:
        return 0.0
    m = np.ones_like(t, dtype=bool)
    if t0 is not None:
        m &= t >= t0
    if t1 is not None:
        m &= t <= t1
    return float(np.trapezoid(q[m], t[m])) if m.sum() > 1 else 0.0


def _mittel_ende(t, v, fenster=1.0):
    if not len(t):
        return None
    m = t >= t[-1] - fenster
    return float(np.mean(v[m]))


def _y_plus(case: Path) -> dict:
    out = {}
    for dat in sorted((case / "postProcessing" / "y_plus").rglob("yPlus.dat")):
        kopf = [z for z in dat.read_text(errors="replace").splitlines() if z.startswith("#")]
        out["_kopf"] = kopf[-1] if kopf else ""
        for z in dat.read_text(errors="replace").splitlines():
            if z.startswith("#") or not z.strip():
                continue
            p = z.split()
            if len(p) >= 5:
                try:
                    out[p[1]] = {"t": float(p[0]), "min": float(p[2]),
                                 "max": float(p[3]), "mittel": float(p[4])}
                except ValueError:
                    continue
    return out


def _log(case: Path, app: str) -> dict:
    p = case / f"log.{app}"
    if not p.is_file():
        return {}
    co_max, schritte, clock, fatal = 0.0, 0, None, False
    with open(p, errors="replace") as f:
        for z in f:
            if z.startswith("Courant Number mean"):
                try:
                    co_max = max(co_max, float(z.split("max:")[1]))
                except (IndexError, ValueError):
                    pass
            elif z.startswith("Time = "):
                schritte += 1
            elif "ClockTime" in z:
                m = re.search(r"ClockTime = ([\d.]+)", z)
                if m:
                    clock = float(m.group(1))
            elif "FOAM FATAL" in z:
                fatal = True
    return {"co_max": co_max, "schritte": schritte, "clock_s": clock, "fatal": fatal}


def auswerten(job: Path) -> dict:
    from ..core.casebuilder import _bc_face, resolve_window
    from ..core.extract.case_reader import extract_case

    case = job / "case"
    spec = CaseSpec.from_yaml(job / "fall" / "case.yaml")
    df, fehlend = extract_case(case, spec, job.name)
    erg: dict = {"name": job.name, "fall": spec.meta.id, "fehlende_quellen": fehlend}

    # --- Ränder und Massenbilanz (positiv = verlässt das Gebiet) ----------
    zu, ab = {}, {}
    for b in spec.boundaries:
        if b.type == "atmosphere":
            continue
        t, q = get_series(df, Quantity.DISCHARGE, b.patch)
        if len(t):
            (zu if b.type.startswith("inflow") else ab)[b.patch] = (t, q)
    tv, v = get_series(df, Quantity.VOLUME, "domain")
    if len(tv) > 1 and zu:
        t0, t1 = tv[0], tv[-1]
        rein = -sum(_integral(t, q, t0, t1) for t, q in zu.values())
        raus = sum(_integral(t, q, t0, t1) for t, q in ab.values())
        dv = float(v[-1] - v[0])
        erg.update(v_start=float(v[0]), v_ende=float(v[-1]), zufluss_m3=rein,
                   abfluss_m3=raus,
                   massenfehler=abs(dv - (rein - raus)) / max(rein, 1e-12))
        erg["q_zu_ende"] = {p: _mittel_ende(t, -q) for p, (t, q) in zu.items()}
        erg["q_ab_ende"] = {p: _mittel_ende(t, q) for p, (t, q) in ab.items()}
    if spec.evaluation.sections:
        t, q = get_series(df, Quantity.DISCHARGE, spec.evaluation.sections[0].id)
        erg["q_querschnitt"] = _mittel_ende(t, q)
    if spec.evaluation.gauges:
        t, lv = get_series(df, Quantity.LEVEL, spec.evaluation.gauges[0].id)
        erg["wsp_pegel"] = _mittel_ende(t, lv)
    erg.update(_log(case, spec.solver.application))
    erg["y_plus"] = _y_plus(case)

    # --- Felder: Vorhang am Zulauf, Geschwindigkeiten, Tracer -------------
    C = _feld(case / "0" / "C")
    V = _feld(case / "0" / "V", len(C) if C is not None else None)
    if C is None:
        erg["felder"] = "0/C fehlt"
        return erg
    x0, y0, x1, y1 = spec.domain.extent
    dz = spec.mesh.base_cell
    spalten = {}
    for b in spec.boundaries:
        if not b.type.startswith("inflow"):
            continue
        face = _bc_face(spec, b)
        rand = {"x_min": C[:, 0] < x0 + 2 * dz, "x_max": C[:, 0] > x1 - 2 * dz,
                "y_min": C[:, 1] < y0 + 2 * dz, "y_max": C[:, 1] > y1 - 2 * dz}[face]
        r = resolve_window(spec, b)
        if r is not None:
            quer = C[:, 1] if face.startswith("x") else C[:, 0]
            rand &= (quer >= r["lo"] - dz) & (quer <= r["hi"] + dz)
        spalten[b.patch] = rand
    zeiten = _zeiten(case)
    u_max_2s, z_zulauf, verlauf = 0.0, {}, []
    for t, d in zeiten:
        a = _feld(d / "alpha.water", len(C))
        U = _feld(d / "U", len(C))
        if a is None or U is None:
            continue
        nass = a > 0.5
        mag = np.linalg.norm(U, axis=1)
        u = float(mag[nass].max()) if nass.any() else 0.0
        eintrag = {"t": t, "u_max_nass": u,
                   "v_felder": float((a * V).sum()) if V is not None else None}
        for p, s in spalten.items():
            w = s & nass
            eintrag[f"z_nass_max_{p}"] = float(C[w, 2].max()) if w.any() else None
        verlauf.append(eintrag)
        if t <= 2.0 + 1e-9:
            u_max_2s = max(u_max_2s, u)
        if t <= 1.0 + 1e-9:
            for p in spalten:
                z = eintrag[f"z_nass_max_{p}"]
                if z is not None:
                    z_zulauf[p] = max(z_zulauf.get(p, -math.inf), z)
    erg["u_max_2s"] = u_max_2s
    erg["z_zulauf_max_1s"] = z_zulauf
    erg["verlauf"] = verlauf

    if spec.evaluation.verweilzeit and zeiten and V is not None and zu:
        t_end, d_end = zeiten[-1]
        a = _feld(d_end / "alpha.water", len(C))
        T = _feld(d_end / "T", len(C))
        if a is not None and T is not None:
            t0 = 0.0
            rein = -sum(_integral(t, q, t0, t_end) for t, q in zu.values())
            raus_T = 0.0
            for b in spec.boundaries:
                if b.type.startswith("outflow") and b.patch in ab:
                    tq, q = ab[b.patch]
                    tt, tr = get_series(df, Quantity.TRACER, b.patch)
                    if len(tt):
                        tr_i = np.interp(tq, tt, tr)
                        raus_T += _integral(tq, q * tr_i, t0, t_end)
            im_wasser = float((a * T * V).sum())
            in_luft = float(((1 - a) * T * V).sum())
            erg.update(tracer_zu=rein, tracer_ab=raus_T, tracer_im_wasser=im_wasser,
                       tracer_verlust=(rein - raus_T - im_wasser) / max(rein, 1e-12),
                       tracer_in_luft=in_luft / max(rein, 1e-12))
    return erg


def aufraeumen(job: Path) -> None:
    case = job / "case"
    for _, d in _zeiten(case):
        shutil.rmtree(d, ignore_errors=True)
    for d in list(case.glob("processor*")) + [job / "fields", job / "results"]:
        shutil.rmtree(d, ignore_errors=True)


def zeile(e: dict) -> str:
    def f(x, fmt="{:.3g}"):
        return "–" if x is None else fmt.format(x)
    zz = ", ".join(f"{p} {f(z, '{:.2f}')}" for p, z in (e.get("z_zulauf_max_1s") or {}).items())
    return (f"| {e['name']} | {zz or '–'} | {f(e.get('u_max_2s'))} | "
            f"{f(e.get('massenfehler'), '{:.2%}')} | {f(e.get('q_querschnitt'))} | "
            f"{f(e.get('wsp_pegel'), '{:.3f}')} | {f(e.get('co_max'))} | "
            f"{f(e.get('tracer_verlust'), '{:.1%}')} | {f(e.get('tracer_in_luft'), '{:.1%}')} | "
            f"{f(e.get('clock_s'), '{:.0f}')} |")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--fall", help="k | wehr | ordner:<pfad>")
    ap.add_argument("--name", help="Job-Name (Ordner unter data/probe_a/)")
    ap.add_argument("--ende", type=float, help="Simulationsdauer übersteuern (s)")
    ap.add_argument("--felder", type=float, help="Feld-Schreibtakt übersteuern (s)")
    ap.add_argument("--kerne", type=int, default=3)
    ap.add_argument("--speicher", default="1500m")
    ap.add_argument("--timeout", type=int, default=3 * 3600)
    ap.add_argument("--behalten", action="store_true")
    ap.add_argument("--trotz-fehler", action="store_true")
    ap.add_argument("--nur-bauen", action="store_true")
    ap.add_argument("--nur-auswerten", metavar="NAME")
    ap.add_argument("--nur-rechnen", metavar="NAME",
                    help="schon gebauten Job rechnen (z. B. mit altem Code gebaut)")
    a = ap.parse_args(argv)

    if a.nur_auswerten:
        job = WURZEL / a.nur_auswerten
    elif a.nur_rechnen:
        job = WURZEL / a.nur_rechnen
        print(f"== {job.name}: rechnen ({a.kerne} Kerne)")
        print(f"   fertig nach {rechnen(job, a.kerne, a.speicher, a.timeout):.0f} s")
    else:
        if not a.fall or not a.name:
            ap.error("--fall und --name sind nötig")
        job = WURZEL / a.name
        if job.exists():
            shutil.rmtree(job)
        job.mkdir(parents=True)
        print(f"== {a.name}: bauen")
        bauen(a.fall, job, a.ende, a.felder, a.trotz_fehler)
        if a.nur_bauen:
            return
        print(f"== {a.name}: rechnen ({a.kerne} Kerne)")
        dauer = rechnen(job, a.kerne, a.speicher, a.timeout)
        print(f"   fertig nach {dauer:.0f} s")
    zellvolumen(job)
    erg = auswerten(job)
    cm = job / "case" / "log.checkMesh"
    if cm.is_file():
        m = re.search(r"cells:\s+(\d+)", cm.read_text(errors="replace"))
        erg["zellen"] = int(m.group(1)) if m else None
    (job / "probe.json").write_text(json.dumps(erg, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in erg.items() if k != "verlauf"},
                     indent=1, ensure_ascii=False))
    print("| Lauf | z nass max am Zulauf t≤1 s | max|U| t≤2 s | Massenfehler | Q Querschnitt "
          "| WSP Pegel | Co_max | Tracer-Verlust | Tracer in Luft | Clock s |")
    print(zeile(erg))
    if not a.behalten and not a.nur_auswerten:
        aufraeumen(job)


if __name__ == "__main__":
    sys.exit(main())
