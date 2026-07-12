#!/usr/bin/env python3
"""
Roundtrip-Regressionstest der QUAGG 1D/2D-Kopplung: 2D -> 1D -> Outfall -> 2D.

Szenario: 20x20-Raster (5 m), Gelaende 10.0 mNN, geschlossene Raender. Eine 3x3-Senke
(9.6 mNN) haelt 0.3 m Anfangswasser (67.5 m3) ueber Schacht J1 (rim=Senkensohle).
J1 -> Haltung C1 -> Outfall OUT an anderer Stelle des Rasters.

Prueft die drei Kopplungs-Bugs von 2026-07 (Instabilitaet, Phantom-Wasser, tote Outfalls):
  1. Lauf endet sauber, res.max endlich (keine numerischen Schocks durch Slug-Injektion),
  2. die Senke entleert sich (2D->1D Einzug wirkt),
  3. am Outfall kommt Wasser im Raster an (1D->2D via NODE_INFLOW — vorher ging
     Auslass-Wasser komplett verloren, NODE_OVERFLOW ist an Outfalls immer 0),
  4. Massenbilanz: |Verror| in res.mass bleibt klein (Kopplungsvolumen wird in
     VolInMT/VolOutMT eingebucht — vorher zaehlte es als Massenfehler),
  5. [COUPLE]-Logzeilen erscheinen in den log-Events (Diagnose-Kanal funktioniert).

Aufruf:
    python3 test_coupling_roundtrip.py [IMAGE]     # default: lisflood-fp:latest
Exit 0 = bestanden.
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"
NCOLS, NROWS, CS = 20, 20, 5.0
GROUND = 10.0
DIP_Z = 9.6
DIP_C, DIP_R = 5, 5            # Senken-Zentrum (col,row top-down)
OUT_C, OUT_R = 14, 14          # Outfall-Zelle
H0 = 0.3                       # Anfangstiefe in der Senke [m]


def cell_xy(col, row):
    """Weltkoordinate des Zellmittelpunkts (row top-down)."""
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

    (inp / "network.inp").write_text(f"""\
[TITLE]
QUAGG coupling roundtrip test
[OPTIONS]
FLOW_UNITS           CMS
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2020
START_TIME           00:00:00
END_DATE             01/01/2020
END_TIME             00:20:00
REPORT_STEP          00:00:30
ROUTING_STEP         0.5
VARIABLE_STEP        0.75
MINIMUM_STEP         0.05
SURCHARGE_METHOD     SLOT
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
[JUNCTIONS]
;;Name Elev MaxDepth InitDepth SurDepth Aponded
J1     7.6  2.0      0         999      0
[OUTFALLS]
;;Name Elev Type Stage Gated
OUT    7.4  FREE       NO
[CONDUITS]
;;Name From To  Length Roughness InOffset OutOffset InitFlow MaxFlow
C1     J1   OUT 50     0.013     0        0         0        0
[XSECTIONS]
;;Link Shape    Geom1 Geom2 Geom3 Geom4 Barrels
C1     CIRCULAR 0.4   0     0     0     1
[REPORT]
INPUT      NO
CONTINUITY YES
NODES      ALL
LINKS      ALL
""")

    # rim J1 = Senkensohle (Deckel in der Senke), rim OUT = Gelaende.
    (inp / "flow.coupling").write_text(
        f"network.inp 2.0 2\n"
        f"J1 {jx} {jy} {DIP_Z} 1.5 0.0\n"
        f"OUT {ox} {oy} {GROUND} 1.5 0.0\n"
    )

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nstartfile start.asc\nresroot res\ndirroot results\n"
        "sim_time 900\ninitial_tstep 1\nsaveint 90\nmassint 15\n"
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
    job = backend_dir / "data" / "regression_coupling_roundtrip"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    write_scenario(inp)

    v0 = 9 * CS * CS * H0
    ok = True
    try:
        print(f"[roundtrip] Image={IMAGE}  Szenario: Senke->J1->C1->OUT->Raster ({v0:.1f} m3 Anfangswasser)")
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

        if proc.returncode != 0 or not any(e.get("event") == "done" for e in events):
            print(f"❌ Lauf nicht sauber beendet (exit={proc.returncode})\n{proc.stdout[-1200:]}\n{proc.stderr[-600:]}")
            ok = False
        else:
            print("✅ Lauf sauber beendet ('done'-Event)")

        # 1) res.max endlich
        vals = parse_asc(job / "results" / "res.max")
        bad = [v for v in vals if not math.isfinite(v) or v > 1e6]
        if bad:
            print(f"❌ res.max: {len(bad)} nicht-endliche/absurde Werte")
            ok = False
        else:
            print("✅ res.max endlich (keine numerischen Schocks)")

        # 2) Senke entleert: letzte .wd-Datei, Tiefe im Senkenzentrum
        wds = sorted((job / "results").glob("res-*.wd"))
        last = parse_asc(wds[-1]) if wds else None
        if last is None:
            print("❌ keine .wd-Frames")
            ok = False
        else:
            h_dip = last[DIP_R * NCOLS + DIP_C]
            if h_dip < H0 * 0.5:
                print(f"✅ Senke entleert sich: Endtiefe {h_dip:.3f} m (< {H0 * 0.5:.2f})")
            else:
                print(f"❌ Senke entleert sich NICHT (Endtiefe {h_dip:.3f} m) — 2D->1D-Einzug wirkungslos?")
                ok = False

            # 3) Wasser am Outfall (max-Raster, 3-Zellen-Radius)
            near_out = max(
                parse_asc(job / "results" / "res.max")[r * NCOLS + c]
                for r in range(OUT_R - 3, OUT_R + 4) for c in range(OUT_C - 3, OUT_C + 4)
            )
            if near_out > 0.005:
                print(f"✅ Outfall liefert ins Raster: max {near_out:.3f} m nahe OUT")
            else:
                print("❌ KEIN Wasser am Outfall im Raster — 1D->2D-Auslasspfad tot")
                ok = False

        # 4) Massenbilanz: res.mass, |Verror| je Intervall klein gegen Anfangsvolumen
        massf = job / "results" / "res.mass"
        if massf.exists():
            rows = [ln.split() for ln in massf.read_text().splitlines()[1:] if ln.split()]
            verrs = [abs(float(r[10])) for r in rows if len(r) > 10]
            vmax = max(verrs) if verrs else 0.0
            if vmax < 0.05 * v0:
                print(f"✅ Massenbilanz sauber: max |Verror| = {vmax:.2f} m3 (< 5% von {v0:.1f} m3)")
            else:
                print(f"❌ Massenbilanz verletzt: max |Verror| = {vmax:.2f} m3 — Kopplung nicht eingebucht?")
                ok = False
        else:
            print("❌ res.mass fehlt")
            ok = False

        # 5) [COUPLE]-Logzeilen in den log-Events
        logs = [e.get("text", "") for e in events if e.get("event") == "log"]
        couple = [t for t in logs if "[COUPLE]" in t]
        if couple:
            print(f"✅ {len(couple)} [COUPLE]-Logzeilen durchgereicht, z. B.:")
            for t in couple[:4]:
                print(f"     {t}")
        else:
            print("❌ keine [COUPLE]-Logzeilen in den log-Events")
            ok = False

        # 6) Systemuebergreifende Erhaltung: das Netz kann nicht mehr abgeben, als es
        #    bekommen hat (Speicher subtrahiert nur). Endsummen aus der Ende-Zeile.
        import re as _re
        ende = [t for t in couple if "Ende:" in t]
        if ende:
            m = _re.search(r"1D->2D gesamt ([\d.]+) m3 \| 2D->1D gesamt ([\d.]+) m3", ende[-1])
            if m:
                v_out, v_in = float(m.group(1)), float(m.group(2))
                if v_out <= v_in + 0.02 * v0:
                    print(f"✅ Erhaltung 1D↔2D: Netz gab {v_out:.2f} m3 ab, bekam {v_in:.2f} m3 (kein Phantom-Wasser)")
                else:
                    print(f"❌ Netz gab {v_out:.2f} m3 ab, bekam aber nur {v_in:.2f} m3 — Wasser wird ERZEUGT")
                    ok = False
        else:
            print("❌ keine [COUPLE] Ende-Bilanzzeile gefunden")
            ok = False

        # 7) 1D-Ergebnis-Pipeline: done-Event trägt networkResultsFile + couplingBudget,
        #    die JSON enthält Serien für J1/OUT/C1 (Phase R, 2026-07).
        done_ev = next((e for e in events if e.get("event") == "done"), {})
        nrf = done_ev.get("networkResultsFile")
        if nrf and (job / "results" / nrf).exists():
            net = json.loads((job / "results" / nrf).read_text())
            n_t = len(net.get("times", []))
            j1 = net.get("nodes", {}).get("J1", {})
            c1 = net.get("links", {}).get("C1", {})
            if n_t > 0 and len(j1.get("depth", [])) == n_t and len(c1.get("flow", [])) == n_t:
                print(f"✅ 1D-Ergebnisse im done-Payload: {n_t} Zeitschritte, "
                      f"J1 max depth {max(j1['depth']):.3f} m, C1 max Q {max(c1['flow']):.4f} m3/s")
            else:
                print(f"❌ network-results.json unvollständig (times={n_t}, "
                      f"J1-depth={len(j1.get('depth', []))}, C1-flow={len(c1.get('flow', []))})")
                ok = False
            if max(c1.get("flow", [0])) <= 0.0:
                print("❌ C1 führt laut 1D-Serie NIE Wasser — Kopplung kam nicht im Netz an?")
                ok = False
        else:
            print(f"❌ kein networkResultsFile im done-Event (done={ {k: v for k, v in done_ev.items() if k != 'massReport'} })")
            ok = False
        budget = done_ev.get("couplingBudget")
        if budget and "to2d" in budget and "to1d" in budget and budget.get("nodes"):
            print(f"✅ couplingBudget strukturiert: 1D->2D {budget['to2d']:.2f} m3, "
                  f"2D->1D {budget['to1d']:.2f} m3, Schuld {budget['debt']:.3f} m3, "
                  f"{len(budget['nodes'])} Knoten")
        else:
            print("❌ kein/unvollständiges couplingBudget im done-Event")
            ok = False

        print("\n" + ("✅ ROUNDTRIP-REGRESSION BESTANDEN" if ok else "❌ ROUNDTRIP-REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
