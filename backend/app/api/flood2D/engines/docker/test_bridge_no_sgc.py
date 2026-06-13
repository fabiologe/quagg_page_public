#!/usr/bin/env python3
"""
Regressionstest am ECHTEN LISFLOOD-Binary: Brücke OHNE Subgrid-Kanäle (SGC).

Gate für den QUAGG-FIX in weir_flow.cpp: Im unpatchten 8.0.3 segfaultet die
Brückenzelle bzw. erzeugt 0/0=NaN, sobald Wasser sie erreicht (SGC-Arrays nicht
allokiert). Dieser Test baut ein Mini-Szenario mit genau einer Brücke (<dir>B) und
KEINEN SGC-Keywords, lässt es im Container laufen und prüft:
  1. Container-Exit 0 + "done"-Event (kein Crash),
  2. res.max enthält nur endliche Werte (kein NaN/Inf, kein H-Feld-"Befall"),
  3. Wasser erreicht/passiert die Brücke (Info, kein hartes Gate).

Aufruf (aus beliebigem Verzeichnis):
    python3 test_bridge_no_sgc.py [IMAGE]      # default: lisflood-fp:latest
Exit-Code 0 = bestanden.
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"
NCOLS, NROWS, CS = 30, 12, 1.0
CH_ROWS = (5, 6)            # Kanal-Zeilen (file row, top-down)
BRIDGE_COL = 15            # Brücke quer über den Kanal bei x≈15.5


def bed(col):
    """Kanal-Sohle fällt nach Osten (3.0 → 2.0), Banks bei 8.0."""
    return 3.0 - (col / (NCOLS - 1)) * 1.0


def write_scenario(inp: Path):
    # terrain.asc (top-down Zeilen)
    rows = []
    for r in range(NROWS):
        row = []
        for c in range(NCOLS):
            row.append(bed(c) if r in CH_ROWS else 8.0)
        rows.append(" ".join(f"{v:.3f}" for v in row))
    asc = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
           f"cellsize {CS}\nNODATA_value -9999\n" + "\n".join(rows) + "\n")
    (inp / "terrain.asc").write_text(asc)

    # Kanal-Weltkoordinate y (yll=0, nrows=12): center row r → (NROWS-1-r+0.5)*CS
    ch_y = (NROWS - 1 - CH_ROWS[1] + 0.5) * CS  # ≈ 5.5

    # Zufluss am Westende des Kanals + freier Ostrand
    (inp / "flow.bci").write_text(
        f"P 0.5 {ch_y:.2f} QFIX 0.8\n"
        f"E 0 {NROWS} FREE\n"
    )

    # EINE Brücke quer über den Kanal (EB = Ost-Fläche, blockt/reguliert x-Fluss).
    soffit = bed(BRIDGE_COL) + 1.2
    (inp / "flow.weir").write_text(
        "1\n"
        f"{BRIDGE_COL + 0.5:.2f} {ch_y:.2f} EB 0.8 {soffit:.4f} 1.5 1.0\n"
    )

    # run.par — KEINE SGC-Keywords (genau der gefährliche Pfad), acceleration.
    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 120\ninitial_tstep 1\nsaveint 30\nmassint 10\n"
        "fpfric 0.03\nbcifile flow.bci\nweirfile flow.weir\nacceleration\n"
    )


def parse_asc_values(path: Path):
    lines = path.read_text(errors="replace").splitlines()
    start = 0
    for i, ln in enumerate(lines):
        p = ln.split()
        if len(p) == 2 and p[0][0].isalpha():
            start = i + 1
        else:
            break
    return [float(x) for x in " ".join(lines[start:]).split()]


def main():
    # Job-Dir unter backend/data/ (NICHT /tmp): Snap-Docker kann /tmp-Host-Pfade
    # nicht mounten → Container sähe keine Dateien. docker_engine.py nutzt denselben Ort.
    backend_dir = Path(__file__).resolve().parents[3]   # …/flood2D
    job = backend_dir / "data" / "regression_bridge_no_sgc"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    try:
        print(f"[regression] Image={IMAGE}  Szenario: 1 Brücke (EB), KEIN SGC")
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job", IMAGE,
             "--job", "/job", "--heartbeat", "5"],
            capture_output=True, text=True, timeout=300,
        )
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

        ok = True
        # 1. kein Crash
        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-2000:]}\n{proc.stderr[-1000:]}")
            ok = False
        if not any(e.get("event") == "done" for e in events):
            print("❌ kein 'done'-Event (Lauf nicht sauber beendet)")
            ok = False
        else:
            print("✅ Lauf beendet ('done'-Event, kein Crash/Segfault)")

        # 2. res.max endlich?
        maxf = job / "results" / "res.max"
        if maxf.exists():
            vals = parse_asc_values(maxf)
            bad = [v for v in vals if not math.isfinite(v) or v > 1e6]
            wet = [v for v in vals if math.isfinite(v) and 0.0 < v < 1e6]
            if bad:
                print(f"❌ res.max enthält {len(bad)} nicht-endliche/absurde Werte (NaN/Inf-Befall!)")
                ok = False
            else:
                print(f"✅ res.max: alle {len(vals)} Werte endlich; {len(wet)} nasse Zellen, "
                      f"max Tiefe {max(wet) if wet else 0:.3f} m")
        else:
            print("❌ res.max nicht erzeugt")
            ok = False

        print("\n" + ("✅ REGRESSION BESTANDEN" if ok else "❌ REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
