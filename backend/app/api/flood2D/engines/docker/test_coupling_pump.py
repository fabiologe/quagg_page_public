#!/usr/bin/env python3
"""
QA-Edge-Case (Kampagne Q, 2026-07): PUMPE im gekoppelten 1D/2D-Lauf.

Szenario: 20x20-Raster (5 m), Gelaende 10.0 mNN, geschlossene Raender. Eine 3x3-Senke
(9.6 mNN) haelt 0.3 m Anfangswasser ueber Pumpen-Schacht J1. Von J1 (STORAGE-
Pumpensumpf, 8 m2 — Junction wuerde einfrieren, siehe [STORAGE]-Kommentar) fuehrt eine
DRUCKLEITUNG BERGAUF (OUT-Sohle 10.2 > J1-Sohle 7.6) zum Outfall an anderer Stelle.
Ohne Pumpe kann das Wasser physikalisch NICHT zum Outfall — jeder Tropfen dort ist
Pumpen-Foerderung. Prueft damit end-to-end:

  1. gekoppelter Lauf mit [PUMPS]+[CURVES] endet sauber ('done'),
  2. die Senke wird leergepumpt (2D->1D Einzug + Pumpe wirken),
  3. Wasser erscheint BERGAUF am Outfall im 2D-Raster (nur via Pumpe moeglich),
  4. 1D-Ergebnisse (networkResultsFile): Pumpen-Link P1 mit type='pump' und Q>0,
  5. couplingBudget: J1 hat 2D->1D-Volumen aufgenommen.

Aufruf:
    python3 test_coupling_pump.py [IMAGE]     # default: lisflood-fp:latest
Exit 0 = bestanden.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"
NCOLS, NROWS, CS = 20, 20, 5.0
GROUND = 10.0
DIP_Z = 9.6
DIP_C, DIP_R = 5, 5
OUT_C, OUT_R = 14, 14
H0 = 0.3


def cell_xy(col, row):
    return (col + 0.5) * CS, (NROWS - row - 0.5) * CS


def write_asc(path, grid):
    rows = ["ncols %d" % NCOLS, "nrows %d" % NROWS, "xllcorner 0", "yllcorner 0",
            "cellsize %g" % CS, "NODATA_value -9999"]
    for r in range(NROWS):
        rows.append(" ".join("%.3f" % grid[r * NCOLS + c] for c in range(NCOLS)))
    path.write_text("\n".join(rows) + "\n")


def write_scenario(inp: Path):
    dem = [GROUND] * (NCOLS * NROWS)
    start = [0.0] * (NCOLS * NROWS)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            i = (DIP_R + dr) * NCOLS + (DIP_C + dc)
            dem[i] = DIP_Z
            start[i] = H0
    write_asc(inp / "terrain.asc", dem)
    write_asc(inp / "start.asc", start)

    jx, jy = cell_xy(DIP_C, DIP_R)
    ox, oy = cell_xy(OUT_C, OUT_R)

    # OUT-Sohle 10.2 mNN > J1-Sohle 7.6 mNN → reine Pumpfoerderung, kein Gefaelle-Weg.
    # PUMP2-Kennlinie (Q ueber Wasserstand im Saugschacht): ab 0.05 m 15 l/s, ab 0.5 m 30 l/s.
    (inp / "network.inp").write_text("""\
[TITLE]
QUAGG coupling pump edge-case
[OPTIONS]
FLOW_UNITS           CMS
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2020
START_TIME           00:00:00
END_DATE             01/01/2020
END_TIME             00:35:00
REPORT_STEP          00:00:30
ROUTING_STEP         0.5
VARIABLE_STEP        0.75
MINIMUM_STEP         0.05
SURCHARGE_METHOD     SLOT
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
[STORAGE]
;;PUMPENSUMPF-REGEL: Pumpe an JUNCTION friert bei Zufluss-Slug > Foerderleistung
;;dauerhaft ein (SLOT pressurisiert, standalone reproduziert) — Sumpf MUSS Storage sein.
;;Name Elev MaxDepth InitDepth Shape      A1 A2 A0
J1     7.6  2.0      0         FUNCTIONAL 8  0  0
[OUTFALLS]
;;Name Elev  Type Stage Gated
OUT    10.2  FREE       NO
[PUMPS]
;;Name Node1 Node2 PumpCurve InitStatus Startup Shutoff
P1     J1    OUT   CRV1      ON         0.10    0.03
[CURVES]
;;Name Type  X-Value Y-Value
CRV1   PUMP2 0.05    0.050
CRV1         0.5     0.080
[REPORT]
INPUT      NO
CONTINUITY YES
NODES      ALL
LINKS      ALL
""")

    (inp / "flow.coupling").write_text(
        f"network.inp 2.0 2\n"
        f"J1 {jx} {jy} {DIP_Z} 1.5 0.0\n"
        f"OUT {ox} {oy} {GROUND} 1.5 0.0\n"
    )

    # sim_time so bemessen, dass die Pumpe (50–80 l/s) die 67.5 m³ sicher schafft.
    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nstartfile start.asc\nresroot res\ndirroot results\n"
        "sim_time 1800\ninitial_tstep 1\nsaveint 180\nmassint 15\n"
        "fpfric 0.03\ncouplingfile flow.coupling\nacceleration\n"
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
    return [float(x) for x in " ".join(lines[hdr:]).split()]


def main():
    backend_dir = Path(__file__).resolve().parents[3]
    job = backend_dir / "data" / "regression_coupling_pump"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    v0 = 9 * CS * CS * H0
    ok = True
    try:
        print(f"[pump] Image={IMAGE}  Szenario: Senke->Pumpe P1->BERGAUF->OUT ({v0:.1f} m3)")
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
        done_ev = next((e for e in events if e.get("event") == "done"), None)

        if proc.returncode != 0 or done_ev is None:
            print(f"❌ Lauf nicht sauber beendet (exit={proc.returncode})\n{proc.stdout[-1200:]}\n{proc.stderr[-600:]}")
            print("\n❌ PUMPEN-REGRESSION FEHLGESCHLAGEN")
            sys.exit(1)
        print("✅ Lauf sauber beendet ('done'-Event)")

        # 2) Senke leergepumpt
        wds = sorted((job / "results").glob("res-*.wd"))
        last = parse_asc(wds[-1]) if wds else None
        if last is None:
            print("❌ keine .wd-Frames")
            ok = False
        else:
            h_dip = last[DIP_R * NCOLS + DIP_C]
            if h_dip < H0 * 0.5:
                print(f"✅ Senke wird leergepumpt: Endtiefe {h_dip:.3f} m (< {H0 * 0.5:.2f})")
            else:
                print(f"❌ Senke bleibt voll (Endtiefe {h_dip:.3f} m) — Pumpe wirkungslos?")
                ok = False

            # 3) Wasser BERGAUF am Outfall (nur via Pumpe moeglich)
            mx = parse_asc(job / "results" / "res.max")
            near_out = max(mx[r * NCOLS + c]
                           for r in range(OUT_R - 3, OUT_R + 4) for c in range(OUT_C - 3, OUT_C + 4))
            if near_out > 0.005:
                print(f"✅ Pumpe foerdert BERGAUF ins Raster: max {near_out:.3f} m nahe OUT")
            else:
                print("❌ KEIN Wasser am bergauf gelegenen Outfall — Pumpfoerderung kommt nicht an")
                ok = False

        # 4) 1D-Ergebnisse: P1 als Pumpe erkannt; Förderung über SNAPSHOT-Q (taktende
        #    Pumpe wird vom Report-Step oft bei Q=0 erwischt) ODER integriertes Budget.
        budget = done_ev.get("couplingBudget") or {}
        out_delivered = (budget.get("nodes") or {}).get("OUT", {}).get("to2d", 0)
        nrf = done_ev.get("networkResultsFile")
        if nrf and (job / "results" / nrf).exists():
            net = json.loads((job / "results" / nrf).read_text())
            p1 = net.get("links", {}).get("P1", {})
            qmax = max(p1.get("flow", [0.0]) or [0.0])
            if p1.get("type") == "pump" and (qmax > 0.002 or out_delivered > 1.0):
                print(f"✅ 1D-Serie: P1 type='pump', Snapshot-Qmax {qmax * 1000:.1f} l/s, "
                      f"integriert {out_delivered:.1f} m3 am OUT "
                      f"({len(net.get('times', []))} Zeitschritte)")
            else:
                print(f"❌ P1 in 1D-Serie falsch/leer (type={p1.get('type')}, Qmax={qmax}, "
                      f"OUT to2d={out_delivered})")
                ok = False
        else:
            print("❌ kein networkResultsFile im done-Event")
            ok = False

        # 5) Kopplungsbudget: J1 nimmt 2D-Wasser auf, OUT liefert es bergauf ab
        j1 = (budget.get("nodes") or {}).get("J1", {})
        if j1.get("to1d", 0) > 0.3 * v0 and out_delivered > 0.25 * v0:
            print(f"✅ Budget: J1 nahm {j1['to1d']:.1f} m3 auf, OUT lieferte "
                  f"{out_delivered:.1f} m3 bergauf (gesamt 2D->1D {budget.get('to1d', 0):.1f} m3)")
        else:
            print(f"❌ Budget unplausibel: J1 to1d={j1.get('to1d')}, OUT to2d={out_delivered} "
                  f"(erwartet > {0.3 * v0:.0f}/{0.25 * v0:.0f} m3)")
            ok = False

        print("\n" + ("✅ PUMPEN-REGRESSION BESTANDEN" if ok else "❌ PUMPEN-REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
