#!/usr/bin/env python3
"""
Regressionstest am ECHTEN LISFLOOD-Binary: SGC-Rechteckkanal (Typ 1, Gruppen-
Modus) MIT einer Brücke darüber, acceleration-Schema -- die Kombination, die
unabhängig vom Trapez-Patch eine katastrophale, stille Massebilanz-Explosion
auslöste, sobald die Benetzungsfront die Brückenzelle erreicht (2026-07-25,
gefunden beim Verifizieren von quagg-sgc-trapezoid.patch, reproduziert
identisch mit unverändertem Rechteck-Kanal -- also kein Trapez-Problem).

Gate für QUAGG-FIX quagg-sgc-bridge-blowup.patch (lisflood2/sgm_fast.cpp,
CalcBridgeQ). Baut ein feines 1x1m-Raster mit geneigter Kanalsohle (damit eine
echte Benetzungsfront über die Brückenzelle wandert, statt sofort überall nass
zu sein) und prüft über res.mass (nicht nur res.max!), dass die Massebilanz
sauber bleibt -- das ist der schärfere Test: der Bug produzierte vorher
endliche, aber um viele Größenordnungen falsche Werte (z.B. Vol 2.5 -> 50734
m³ innerhalb eines Zeitschritts), die ein reiner "ist res.max endlich"-Check
nicht zuverlässig gefangen hätte.

Aufruf (aus beliebigem Verzeichnis):
    python3 test_sgc_bridge_blowup.py [IMAGE]      # default: lisflood-fp:latest
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
CH_ROWS = (5, 6)
BRIDGE_COL = 15
BED_WIDTH = 2.0
DEM_Z = 10.0
SIM_TIME = 35   # Fenster, in dem die Benetzungsfront nachweislich die Brücke erreicht


def bed_z(col):
    """Geneigte Kanalsohle (8.5 -> 7.5) -- treibt eine echte, langsam wandernde
    Benetzungsfront statt eines sofort überall nassen Kanals (letzteres hätte
    den Bug nie ausgelöst, da er genau am Ankunftsmoment der Front sitzt)."""
    return 8.5 - (col / (NCOLS - 1)) * 1.0


def write_asc(path: Path, header: str, rows):
    path.write_text(header + "\n".join(" ".join(f"{v:.3f}" for v in row) for row in rows) + "\n")


def write_scenario(inp: Path):
    header = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {CS}\nNODATA_value -9999\n")

    dem_rows = [[DEM_Z] * NCOLS for _ in range(NROWS)]
    write_asc(inp / "terrain.asc", header, dem_rows)

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

    # 1 Kanal, Typ 1 (Rechteck) -- bewusst NICHT Typ 7, um den Bridge-Blowup-Bug
    # isoliert vom Trapez-Patch zu testen (er reproduziert identisch mit beiden Typen).
    (inp / "sgc.chanprams.txt").write_text("1\n0 1 0.78 0.12 1.5 0.03 1 -1\n")

    ch_y = (NROWS - 1 - CH_ROWS[1] + 0.5) * CS

    (inp / "flow.bci").write_text(
        f"P 0.5 {ch_y:.2f} QFIX 0.1\n"
        f"E 0 {NROWS} FREE\n"
    )

    soffit = DEM_Z + 1.2
    (inp / "flow.weir").write_text(
        "1\n"
        f"{BRIDGE_COL + 0.5:.2f} {ch_y:.2f} EB 0.8 {soffit:.4f} 1.5 1.0\n"
    )

    # saveint/massint fein genug, um die Benetzungsfront-Ankunft an der Brücke aufzulösen.
    (inp / "run.par").write_text(
        f"DEMfile terrain.asc\nresroot res\ndirroot results\n"
        f"sim_time {SIM_TIME}\ninitial_tstep 1\nsaveint 1\nmassint 1\n"
        "fpfric 0.03\nbcifile flow.bci\nweirfile flow.weir\nacceleration\n"
        "SGCwidth sgc.width.asc\nSGCbed sgc.bed.asc\nSGCbank sgc.bank.asc\n"
        "SGCchangroup sgc.group.asc\nSGCchanprams sgc.chanprams.txt\nSGCn 0.0300\n"
    )


def parse_mass(path: Path):
    """Gibt (letzte Zeile als dict, alle Zeilen) aus res.mass zurück."""
    lines = [ln for ln in path.read_text(errors="replace").splitlines() if ln.strip()]
    rows = []
    for ln in lines[1:]:  # erste Zeile = Header
        p = ln.split()
        if len(p) < 11:
            continue
        rows.append({
            "t": float(p[0]), "vol": float(p[5]), "qin": float(p[6]),
            "qout": float(p[8]), "verror": float(p[10]),
        })
    return rows


def main():
    flood2d_dir = Path(__file__).resolve().parents[2]   # …/flood2D
    job = flood2d_dir / "data" / "regression_sgc_bridge_blowup"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    try:
        print(f"[regression] Image={IMAGE}  Szenario: SGC-Rechteckkanal (Typ 1, Gruppen-Modus) "
              f"+ Brücke darüber, {SIM_TIME}s")
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job", IMAGE,
             "--job", "/job", "--heartbeat", "5"],
            capture_output=True, text=True, timeout=180,
        )
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

        ok = True

        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-2000:]}\n{proc.stderr[-1000:]}")
            ok = False
        if not any(e.get("event") == "done" for e in events):
            print("❌ kein 'done'-Event (Lauf nicht sauber beendet -- ggf. in Divergenz hängen geblieben)")
            ok = False
        else:
            print("✅ Lauf beendet ('done'-Event, kein Crash/Hang)")

        massf = job / "results" / "res.mass"
        if not massf.exists():
            print("❌ res.mass nicht erzeugt")
            ok = False
        else:
            rows = parse_mass(massf)
            if not rows:
                print("❌ res.mass leer/unparsbar")
                ok = False
            else:
                last = rows[-1]
                expected_vol = 0.1 * SIM_TIME  # QFIX 0.1 m3/s, kein Qout in diesem kurzen Fenster erwartet
                rel_verror = abs(last["verror"]) / max(abs(last["vol"]), 1.0)
                max_rel_verror = max(abs(r["verror"]) / max(abs(r["vol"]), 1.0) for r in rows)
                if max_rel_verror > 0.01 or not math.isfinite(last["vol"]) or last["vol"] > expected_vol * 10:
                    print(f"❌ Massebilanz-Explosion erkannt: Vol(t={last['t']:.1f})={last['vol']:.3f} "
                          f"(erwartet ~{expected_vol:.3f}), max |Verror/Vol|={max_rel_verror:.4f}")
                    ok = False
                else:
                    print(f"✅ Massebilanz sauber: Vol(t={last['t']:.1f})={last['vol']:.4f} "
                          f"(erwartet ~{expected_vol:.3f}), max |Verror/Vol|={max_rel_verror:.2e}")

        print("\n" + ("✅ REGRESSION BESTANDEN" if ok else "❌ REGRESSION FEHLGESCHLAGEN"))
    except subprocess.TimeoutExpired:
        print("❌ Container-Timeout (180s) -- vermutlich in Divergenz-Zeitschritten hängen geblieben")
        ok = False
        print("\n❌ REGRESSION FEHLGESCHLAGEN")
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
