#!/usr/bin/env python3
"""
Regressionstest am ECHTEN LISFLOOD-Binary: SGC-Trapezkanal (SGCchan_type 7,
Gruppen-Modus) MIT einer Brücke darüber -- genau die Kombination, die den
ursprünglichen Absturz ausgelöst hat (2026-07-25: "Should not be here! ...
in CalcSGCz" -> korrumpierte Kanalgeometrie -> "Bridge must have sub grid
flows on either side" -> Exit 255).

Gate für den QUAGG-FIX quagg-sgc-trapezoid.patch (sgc.cpp + lisflood2/
sgm_fast.cpp). Baut ein Mini-Szenario mit einem SGC-Trapezkanal über
SGCchangroup/SGCchanprams (derselbe Mehrfachkanal-Exportpfad, den das
Channel-Tool im Client tatsächlich nutzt) UND einer Brücke quer über den
Kanal, lässt es im Container laufen und prüft:
  1. Container-Exit 0 + "done"-Event (kein Crash),
  2. keine "Should not be here"-Ausgabe (Case-7-Fallback getroffen),
  3. res.max enthält nur endliche Werte (kein NaN/Inf-Befall),
  4. Wasser erreicht den Kanal (Info, kein hartes Gate).

Aufruf (aus beliebigem Verzeichnis):
    python3 test_sgc_trapezoid.py [IMAGE]      # default: fabiologe/quagg-lisflood:latest
Exit-Code 0 = bestanden.
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
NCOLS, NROWS, CS = 30, 12, 1.0
CH_ROWS = (5, 6)            # Kanal-Zeilen (file row, top-down), wie test_bridge_no_sgc.py
BRIDGE_COL = 15             # Brücke quer über den Kanal bei x≈15.5
BED_WIDTH = 2.0             # Sohlbreite [m]
SIDE_SLOPE = 1.5            # Böschungsneigung 1:m
DEM_Z = 10.0                # flaches Gelände (Kanal existiert NUR als SGC, nicht im DGM)


def bed_z(col):
    """Kanal-Sohle fällt nach Osten (8.5 → 7.5), wie test_bridge_no_sgc.py -- Gefälle
    treibt den Abfluss zur freien Ostkante, statt sich hinter einer flachen Sohle
    aufzustauen (rein Randbedingungs-getriebene Entwässerung wäre ein deutlich
    schlechter konditioniertes, langsameres Testszenario)."""
    return 8.5 - (col / (NCOLS - 1)) * 1.0


def write_asc(path: Path, header: str, rows):
    (path).write_text(header + "\n".join(" ".join(f"{v:.3f}" for v in row) for row in rows) + "\n")


def write_scenario(inp: Path):
    header = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {CS}\nNODATA_value -9999\n")

    # Flaches DGM -- der Kanal existiert NUR als SGC-Sub-Grid, nicht im Terrain selbst
    # (anders als test_bridge_no_sgc.py, das den Kanal geometrisch ins DGM einbrennt).
    dem_rows = [[DEM_Z] * NCOLS for _ in range(NROWS)]
    write_asc(inp / "terrain.asc", header, dem_rows)

    # SGC-Raster: Kanalzeilen CH_ROWS bekommen Breite/Sohle/Böschung, sonst 0/-9999.
    width_rows, bed_rows, bank_rows, group_rows = [], [], [], []
    for r in range(NROWS):
        if r in CH_ROWS:
            width_rows.append([BED_WIDTH] * NCOLS)
            bed_rows.append([bed_z(c) for c in range(NCOLS)])
            bank_rows.append([DEM_Z] * NCOLS)
            group_rows.append([0] * NCOLS)
        else:
            width_rows.append([0.0] * NCOLS)
            bed_rows.append([-9999.0] * NCOLS)
            bank_rows.append([-9999.0] * NCOLS)
            group_rows.append([-1] * NCOLS)
    write_asc(inp / "sgc.width.asc", header, width_rows)
    write_asc(inp / "sgc.bed.asc", header, bed_rows)
    write_asc(inp / "sgc.bank.asc", header, bank_rows)
    write_asc(inp / "sgc.group.asc", header, group_rows)

    # 1 Kanal, Typ 7 (Trapez), Neigung SIDE_SLOPE, Manning 0.03 -- exaktes Format wie
    # SgcGenerator.buildSgcChanPramsFile() im Client.
    (inp / "sgc.chanprams.txt").write_text(f"1\n0 7 0.78 0.12 {SIDE_SLOPE} 0.03 1 -1\n")

    ch_y = (NROWS - 1 - CH_ROWS[1] + 0.5) * CS  # ≈ 5.5, wie test_bridge_no_sgc.py

    # Zufluss am Westende des Kanals + freier Ostrand (deutlich kleiner als
    # test_bridge_no_sgc.py's 0.8, damit der schmale Trapezkanal nicht überläuft).
    (inp / "flow.bci").write_text(
        f"P 0.5 {ch_y:.2f} QFIX 0.1\n"
        f"E 0 {NROWS} FREE\n"
    )

    # EINE Brücke quer über den Kanal (EB), soffit über dem Bankniveau (DEM_Z).
    soffit = DEM_Z + 1.2
    (inp / "flow.weir").write_text(
        "1\n"
        f"{BRIDGE_COL + 0.5:.2f} {ch_y:.2f} EB 0.8 {soffit:.4f} 1.5 1.0\n"
    )

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 120\ninitial_tstep 1\nsaveint 30\nmassint 10\n"
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
    job = flood2d_dir / "data" / "regression_sgc_trapezoid"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    try:
        print(f"[regression] Image={IMAGE}  Szenario: SGC-Trapezkanal (Typ 7, Gruppen-Modus) + Brücke darüber")
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
        combined_out = proc.stdout + proc.stderr

        # 1. kein Crash
        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-2000:]}\n{proc.stderr[-1000:]}")
            ok = False
        if not any(e.get("event") == "done" for e in events):
            print("❌ kein 'done'-Event (Lauf nicht sauber beendet)")
            ok = False
        else:
            print("✅ Lauf beendet ('done'-Event, kein Crash/Segfault)")

        # 2. kein "Should not be here" (Case-7-Fallback getroffen statt vervollständigt)
        if "hould not be here" in combined_out:
            print("❌ 'Should not be here' in der Ausgabe -- SGCchan_type 7 fällt noch in den default-Zweig")
            ok = False
        else:
            print("✅ keine 'Should not be here'-Ausgabe (Case 7 wird sauber bedient)")

        # 3. res.max endlich?
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
