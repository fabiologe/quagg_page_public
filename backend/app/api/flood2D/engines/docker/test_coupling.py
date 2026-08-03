#!/usr/bin/env python3
"""
Regressionstest der QUAGG 1D/2D-Kopplung (EPA-SWMM <-> LISFLOOD-FP) am ECHTEN Binary.

Szenario: flaches, anfangs trockenes 2D-Becken; EIN SWMM-Schacht (J1) bekommt einen
kräftigen Zufluss ohne Auslauf -> er läuft über (Ueberstau/Flooding). Der Kopplungs-Hook
in IterateQ soll diesen Ueberstau als Wasser in die zugeordnete 2D-Zelle geben.

Prüft:
  1. Container-Exit 0 + "done"-Event (Kopplung crasht nicht),
  2. res.max endlich (kein NaN/Inf),
  3. an/um die Kopplungszelle steht am Ende Wasser (Ueberstau ist ins 2D geflossen)
     -> der eigentliche Kopplungsnachweis (ohne Kopplung bliebe das Becken trocken).

Aufruf:
    python3 test_coupling.py [IMAGE]        # default: fabiologe/quagg-lisflood:latest
Exit 0 = bestanden.
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
NCOLS, NROWS, CS = 20, 20, 5.0        # 100 m x 100 m, Zelle 5 m
GROUND = 10.0                          # flaches Gelaende (mNN)
NODE_X, NODE_Y = 52.5, 52.5           # ~Mitte -> Zelle (10, 9 top-down)


def write_scenario(inp: Path):
    # flaches DGM
    row = " ".join(f"{GROUND:.2f}" for _ in range(NCOLS))
    asc = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
           f"cellsize {CS}\nNODATA_value -9999\n"
           + "\n".join(row for _ in range(NROWS)) + "\n")
    (inp / "terrain.asc").write_text(asc)

    # freie Raender, damit sich Wasser ausbreiten/abfliessen kann (kein Aufstau-Artefakt)
    (inp / "flow.bci").write_text(
        "N 0 100 FREE\nS 0 100 FREE\nE 0 100 FREE\nW 0 100 FREE\n"
    )

    # SWMM-Netz: J1 mit grossem Zufluss, kleiner Auslauf -> Schacht laeuft ueber.
    # Deckel (rim) = Gelaende 10.0; Sohle 8.0. ALLOW_PONDING aus (Default) -> Ueberstau
    # verlaesst SWMM und wird vom Kopplungs-Hook ins 2D gegeben.
    (inp / "network.inp").write_text(f"""\
[TITLE]
QUAGG coupling smoke test
[OPTIONS]
FLOW_UNITS           CMS
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2020
START_TIME           00:00:00
END_DATE             01/01/2020
END_TIME             00:10:00
REPORT_STEP          00:00:30
ROUTING_STEP         2
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
[JUNCTIONS]
;;Name Elev MaxDepth InitDepth SurDepth Aponded
J1     8.0  2.0      0         0        0
[OUTFALLS]
;;Name Elev Type Stage Gated
OUT    7.5  FREE       NO
[CONDUITS]
;;Name From To  Length Roughness InOffset OutOffset InitFlow MaxFlow
C1     J1   OUT 50     0.013     0        0         0        0
[XSECTIONS]
;;Link Shape    Geom1 Geom2 Geom3 Geom4 Barrels
C1     CIRCULAR 0.3   0     0     0     1
[INFLOWS]
;;Node Constituent TimeSeries
J1     FLOW        IN1
[TIMESERIES]
;;Name Time  Value
IN1    0:00  0
IN1    0:01  2.0
IN1    0:10  2.0
[REPORT]
INPUT      NO
CONTINUITY YES
""")

    # flow.coupling: <inp> <dt_c> <n> ; dann: <node> <x> <y> <rim> <Cw> <Amax>
    (inp / "flow.coupling").write_text(
        f"network.inp 2.0 1\nJ1 {NODE_X} {NODE_Y} {GROUND} 1.0 0.0\n"
    )

    # run.par — acceleration + couplingfile
    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 600\ninitial_tstep 1\nsaveint 60\nmassint 30\n"
        "fpfric 0.03\nbcifile flow.bci\ncouplingfile flow.coupling\nacceleration\n"
    )


def parse_asc(path: Path):
    lines = path.read_text(errors="replace").splitlines()
    hdr = 0
    for i, ln in enumerate(lines):
        p = ln.split()
        if len(p) == 2 and p[0][0].isalpha():
            hdr = i + 1
        else:
            break
    vals = [float(x) for x in " ".join(lines[hdr:]).split()]
    return vals


def main():
    backend_dir = Path(__file__).resolve().parents[3]
    job = backend_dir / "data" / "regression_coupling"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    ok = True
    try:
        print(f"[regression] Image={IMAGE}  Szenario: SWMM-Ueberstau -> 2D (Kopplung)")
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

        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-1500:]}\n{proc.stderr[-800:]}")
            ok = False
        if not any(e.get("event") == "done" for e in events):
            print("❌ kein 'done'-Event (Kopplungslauf nicht sauber beendet)")
            ok = False
        else:
            print("✅ Kopplungslauf beendet ('done'-Event, kein Crash)")

        maxf = job / "results" / "res.max"
        if maxf.exists():
            vals = parse_asc(maxf)
            bad = [v for v in vals if not math.isfinite(v) or v > 1e6]
            wet = [v for v in vals if math.isfinite(v) and v > 0.001]
            if bad:
                print(f"❌ res.max: {len(bad)} nicht-endliche Werte (NaN/Inf)")
                ok = False
            elif not wet:
                print("❌ res.max komplett trocken — Ueberstau kam NICHT im 2D an (Kopplung wirkungslos)")
                ok = False
            else:
                print(f"✅ Kopplung wirkt: {len(wet)} nasse 2D-Zellen, max Tiefe {max(wet):.3f} m "
                      f"(SWMM-Ueberstau ist ins 2D geflossen)")
        else:
            print("❌ res.max nicht erzeugt")
            ok = False

        print("\n" + ("✅ KOPPLUNGS-REGRESSION BESTANDEN" if ok else "❌ KOPPLUNGS-REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
