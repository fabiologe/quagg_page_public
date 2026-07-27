#!/usr/bin/env python3
"""
Regressionstest am ECHTEN LISFLOOD-Binary: eine Brücke (EB) hängt an genau den
zwei SGC-Kanalzellen, über denen sie selbst liegt -- der Kanal reicht aber NICHT
zwei weitere Zellen über die Brücke hinaus nach Osten. Diese Konfiguration ist
geometrisch vollkommen gültig (durchgehender Kanal unter der Brücke), löste vor
diesem Fix aber trotzdem "Invalid bridge cell. Bridge must have sub grid flows
on either side." + Exit 255 aus (2026-07-25, gefunden an einem echten
Kundenprojekt mit diagonal verlaufendem Kanal).

Gate für QUAGG-FIX quagg-bridge-flow-index.patch (lisflood2/lisflood_processing.cpp
+ lisflood2/sgm_fast.cpp). Baut absichtlich eine MINIMALE Kanalbreite (Kanal endet
direkt hinter der Brücke) statt eines langen durchgehenden Kanals, um genau die
frühere asymmetrische Anforderung ("2 Zellen extra Richtung Osten") zu treffen.

Aufruf (aus beliebigem Verzeichnis):
    python3 test_bridge_asymmetric_sgc.py [IMAGE]      # default: lisflood-fp:latest
Exit-Code 0 = bestanden.
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"
NCOLS, NROWS, CS = 20, 8, 1.0
CH_ROW = 4               # Kanal-Zeile (file row, top-down)
BRIDGE_COL = 10          # Brücke bei x≈10.5
CH_END_COL = 11          # Kanal endet unmittelbar hinter der Brücke (nur 1 Zelle Puffer)
BED_WIDTH = 2.0
DEM_Z = 10.0


def write_asc(path: Path, header: str, rows):
    path.write_text(header + "\n".join(" ".join(f"{v:.3f}" for v in row) for row in rows) + "\n")


def write_scenario(inp: Path):
    header = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {CS}\nNODATA_value -9999\n")

    dem_rows = [[DEM_Z] * NCOLS for _ in range(NROWS)]
    write_asc(inp / "terrain.asc", header, dem_rows)

    # Kanal deckt Spalten 5..CH_END_COL ab -- endet absichtlich nur 1 Zelle hinter
    # der Brücke (Spalte BRIDGE_COL+1), NICHT 2 Zellen wie die frühere (überholte)
    # Solver-Anforderung verlangte.
    width_rows, bed_rows, bank_rows, group_rows = [], [], [], []
    for r in range(NROWS):
        if r == CH_ROW:
            row_w, row_b, row_bk, row_g = [], [], [], []
            for c in range(NCOLS):
                if 5 <= c <= CH_END_COL:
                    row_w.append(BED_WIDTH); row_b.append(DEM_Z - 1.0); row_bk.append(DEM_Z); row_g.append(0)
                else:
                    row_w.append(0.0); row_b.append(-9999.0); row_bk.append(-9999.0); row_g.append(-1)
            width_rows.append(row_w); bed_rows.append(row_b); bank_rows.append(row_bk); group_rows.append(row_g)
        else:
            width_rows.append([0.0] * NCOLS)
            bed_rows.append([-9999.0] * NCOLS)
            bank_rows.append([-9999.0] * NCOLS)
            group_rows.append([-1] * NCOLS)
    write_asc(inp / "sgc.width.asc", header, width_rows)
    write_asc(inp / "sgc.bed.asc", header, bed_rows)
    write_asc(inp / "sgc.bank.asc", header, bank_rows)
    write_asc(inp / "sgc.group.asc", header, group_rows)

    (inp / "sgc.chanprams.txt").write_text("1\n0 1 0.78 0.12 1.5 0.03 1 -1\n")

    ch_y = (NROWS - 1 - CH_ROW + 0.5) * CS

    (inp / "flow.bci").write_text(
        f"P {5.5} {ch_y:.2f} QFIX 0.1\n"
        f"E 0 {NROWS} FREE\n"
    )

    soffit = DEM_Z + 1.2
    (inp / "flow.weir").write_text(
        "1\n"
        f"{BRIDGE_COL + 0.5:.2f} {ch_y:.2f} EB 0.8 {soffit:.4f} 1.5 1.0\n"
    )

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 20\ninitial_tstep 1\nsaveint 5\nmassint 5\n"
        "fpfric 0.03\nbcifile flow.bci\nweirfile flow.weir\nacceleration\n"
        "SGCwidth sgc.width.asc\nSGCbed sgc.bed.asc\nSGCbank sgc.bank.asc\n"
        "SGCchangroup sgc.group.asc\nSGCchanprams sgc.chanprams.txt\nSGCn 0.0300\n"
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
    flood2d_dir = Path(__file__).resolve().parents[2]   # …/flood2D
    job = flood2d_dir / "data" / "regression_bridge_asymmetric_sgc"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    try:
        print(f"[regression] Image={IMAGE}  Szenario: Brücke direkt am Kanalende "
              f"(1 statt 2 Zellen Puffer Richtung Osten)")
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job", IMAGE,
             "--job", "/job", "--heartbeat", "5"],
            capture_output=True, text=True, timeout=120,
        )
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

        ok = True
        combined_out = proc.stdout + proc.stderr

        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-2000:]}\n{proc.stderr[-1000:]}")
            ok = False
        if not any(e.get("event") == "done" for e in events):
            print("❌ kein 'done'-Event (Lauf nicht sauber beendet)")
            ok = False
        else:
            print("✅ Lauf beendet ('done'-Event, kein Crash)")

        if "Invalid bridge cell" in combined_out:
            print("❌ 'Invalid bridge cell' weiterhin ausgelöst -- Fix nicht wirksam")
            ok = False
        else:
            print("✅ keine 'Invalid bridge cell'-Ausgabe")

        maxf = job / "results" / "res.max"
        if maxf.exists():
            vals = parse_asc_values(maxf)
            bad = [v for v in vals if not math.isfinite(v) or v > 1e6]
            wet = [v for v in vals if math.isfinite(v) and 0.0 < v < 1e6]
            if bad:
                print(f"❌ res.max enthält {len(bad)} nicht-endliche/absurde Werte")
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
