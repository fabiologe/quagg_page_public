#!/usr/bin/env python3
"""
Regressionstest: 1D/2D-Kopplung AUF SGC-GERINNEZELLEN (quagg-coupling-sgc-hook.patch).

HISTORIE
    Bis 2026-07-28 dokumentierte dieser Test die Grenze "SGC und Kopplung schliessen sich
    aus": lisflood.cpp verzweigt bei SGC == ON in den lisflood2-Fast-Pfad (Fast_MainStart),
    und Coupling_Update hing nur in IterateQ -- der Lauf meldete "[COUPLE] aktiv", tauschte
    aber 0.00 m3. Der Hook-Patch ruestet den Austausch in der Fast-Zeitschleife nach
    (Coupling_RegisterFastGrid/Coupling_UpdateFast; Buchung ueber volume_grid).

SZENARIO (ein Lauf, drei Physik-Gates)
    Flaches Gelaende auf 10.0 m, SGC-Gerinne (Sohle 8.5 m, Breite 3 m) ueber Spalte 10,
    Wassertiefe im Gerinne 0.5 m -> Wasserspiegel 9.0 m. Drei Kopplungsknoten:

      J1 (Junction) auf Gerinnezelle (10,10), Deckel = 10.0 m (Gelaende)
         -> WSP 9.0 liegt 1.0 m UNTER dem Deckel: J1 darf NICHTS einziehen.
            DATUMS-BEWEIS: ohne SGCz-Datum waere wse = DEM+H = 10.5 > 10.0 -> Dauereinzug.
      J2 (Junction) auf Gerinnezelle (10,15), Deckel = 8.8 m (unter dem WSP!)
         -> Gerinnewasser MUSS einziehen (2D->1D > 0).
      OUT (Outfall) auf Gerinnezelle (10,2)
         -> bekommt J2s Wasser durchs Rohr und liefert es zurueck ins Gerinne
            (1D->2D > 0). Kreislauf: entnommen ~= zurueckgeliefert (+ Rohrspeicher).

    python3 test_coupling_sgc.py [IMAGE]        # default: fabiologe/quagg-lisflood:latest
Exit 0 = bestanden.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
NCOLS, NROWS, CS = 20, 20, 5.0
GROUND = 10.0
BED_Z = 8.5          # Kanalsohle -> Bankfull-Tiefe 1.5 m
CH_COL = 10          # Gerinne laeuft ueber diese Spalte
CH_WIDTH = 3.0
H_CHAN = 0.5         # Wassertiefe im Gerinne -> WSP 9.0 m
J1_ROW, J2_ROW, OUT_ROW = 10, 15, 2
J2_RIM = 8.8         # unter dem WSP 9.0 -> Einzug


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
    n = NCOLS * NROWS
    dem = [GROUND] * n
    width = [0.0] * n          # 0 = keine Gerinnezelle
    bed = [GROUND] * n         # ausserhalb des Gerinnes = DEM
    bank = [GROUND] * n
    start = [0.0] * n          # H ist in Gerinnezellen relativ zur SOHLE

    for r in range(NROWS):
        i = r * NCOLS + CH_COL
        width[i] = CH_WIDTH
        bed[i] = BED_Z
        start[i] = H_CHAN

    write_asc(inp / "terrain.asc", dem)
    write_asc(inp / "start.asc", start)
    write_asc(inp / "sgc.width.asc", width)
    write_asc(inp / "sgc.bed.asc", bed)
    write_asc(inp / "sgc.bank.asc", bank)

    j1x, j1y = cell_xy(CH_COL, J1_ROW)
    j2x, j2y = cell_xy(CH_COL, J2_ROW)
    ox, oy = cell_xy(CH_COL, OUT_ROW)

    # J2 zieht Gerinnewasser (Deckel unter WSP) und gibt es durch C1 an OUT zurueck ins
    # Gerinne (Kreislauf). J1 haengt ueber C2 an J2 (SWMM: ein Outfall darf nur EINEN
    # Zulauf haben, ERROR 141), bleibt aber trocken -- Deckel ueber dem Wasserspiegel.
    (inp / "network.inp").write_text(f"""\
[TITLE]
QUAGG coupling on SGC channel cells (hook regression)
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
J1     6.6  4.0      0         999      0
J2     6.5  2.5      0         999      0
[OUTFALLS]
;;Name Elev Type Stage Gated
OUT    5.9  FREE       NO
[CONDUITS]
;;Name From To  Length Roughness InOffset OutOffset InitFlow MaxFlow
C1     J2   OUT 65     0.013     0        0         0        0
C2     J1   J2  25     0.013     0        0         0        0
[XSECTIONS]
;;Link Shape    Geom1 Geom2 Geom3 Geom4 Barrels
C1     CIRCULAR 0.4   0     0     0     1
C2     CIRCULAR 0.4   0     0     0     1
[REPORT]
INPUT      NO
CONTINUITY YES
NODES      ALL
LINKS      ALL
""")

    (inp / "flow.coupling").write_text(
        f"network.inp 2.0 3\n"
        f"J1 {j1x} {j1y} {GROUND} 1.5 0.0\n"
        f"J2 {j2x} {j2y} {J2_RIM} 1.5 0.0\n"
        f"OUT {ox} {oy} {GROUND} 1.5 0.0\n"
    )

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nstartfile start.asc\nresroot res\ndirroot results\n"
        "sim_time 900\ninitial_tstep 1\nsaveint 900\nmassint 15\n"
        "fpfric 0.03\n"
        "SGCwidth sgc.width.asc\nSGCbed sgc.bed.asc\nSGCbank sgc.bank.asc\nSGCn 0.035\n"
        "couplingfile flow.coupling\nacceleration\n"
    )


# Finalize-Zeile je Knoten: "[COUPLE]   J2   JUNCTION Sum 1D->2D 0.00 m3 | 2D->1D 3.21 m3"
NODE_SUM_RE = re.compile(
    r"\[COUPLE\]\s+(\S+)\s+(OUTFALL|JUNCTION)\s+Sum 1D->2D\s+([-\d.]+)\s*m3\s*\|\s*2D->1D\s+([-\d.]+)\s*m3")


def main():
    # Job-Verzeichnis bewusst NICHT unter /tmp: das Docker dieser Maschine laeuft als
    # Snap und sieht das /tmp des Hosts nicht (eigener Mount-Namespace).
    backend_dir = Path(__file__).resolve().parents[3]
    work = backend_dir / "data" / "regression_coupling_sgc"
    if work.exists():
        shutil.rmtree(work)
    inp = work / "inputs"
    inp.mkdir(parents=True)
    (work / "results").mkdir()
    write_scenario(inp)

    print(f"[sgc-couple] Image={IMAGE}  Szenario: 3 Knoten auf Gerinnezellen, "
          f"WSP {BED_Z + H_CHAN:.1f} m | J1-Deckel {GROUND:.1f} (drueber) | J2-Deckel {J2_RIM:.1f} (drunter)")

    proc = subprocess.run(
        ["docker", "run", "--rm", "-v", f"{work}:/job", IMAGE,
         "--job", "/job", "--heartbeat", "5"],
        capture_output=True, text=True, timeout=900)
    out = proc.stdout

    failed = 0

    def check(cond, msg):
        nonlocal failed
        print(("  ✅ " if cond else "  ❌ ") + msg)
        if not cond:
            failed += 1

    done = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("{") and '"done"' in line:
            try:
                done = json.loads(line)
            except json.JSONDecodeError:
                pass
    check(done is not None, "Lauf sauber beendet ('done'-Event)")
    if done is None:
        print(out[-3000:])
        return 1

    couple_lines = [l for l in out.splitlines() if "[COUPLE]" in l]

    # 1) Hook aktiv: Fast-Pfad-Registrierung + Schacht-Diagnosetabelle (refresh_rates
    #    lief) -- vor dem Patch fehlte beides.
    check(any("Fast-Pfad (SGC) registriert" in l for l in couple_lines),
          "Fast-Pfad-Registrierung gemeldet (Hook ist im Build)")
    j2_diag = next((l for l in couple_lines if "Schacht 'J2'" in l), "")
    check(bool(j2_diag), "Schacht-Diagnosetabelle vorhanden (refresh_rates laeuft im SGC-Pfad)")

    # 2) Datum: Diagnose zeigt die KANALSOHLE als Bezugshoehe, nicht die Bankoberkante.
    check(f"Sohle={BED_Z:.2f}" in j2_diag,
          f"Bezugshoehe ist die Kanalsohle {BED_Z:.2f} (nicht Bank {GROUND:.2f}): {j2_diag.strip()[-60:]}")

    # 3) Knoten-Bilanzen aus den Finalize-Zeilen.
    sums = {}
    for l in couple_lines:
        m = NODE_SUM_RE.search(l)
        if m:
            sums[m.group(1)] = (float(m.group(3)), float(m.group(4)))  # (1D->2D, 2D->1D)
    j1_in = sums.get("J1", (0.0, 0.0))[1]
    j2_in = sums.get("J2", (0.0, 0.0))[1]
    out_del = sums.get("OUT", (0.0, 0.0))[0]

    # DATUMS-BEWEIS: J1-Deckel (10.0) liegt 1 m ueber dem WSP (9.0) -> kein Einzug.
    # Ohne SGCz-Datum waere wse = DEM+H = 10.5 > 10.0 und J1 wuerde dauerhaft saugen.
    check(j1_in < 0.05,
          f"J1 (Deckel ueber WSP) zieht NICHT ({j1_in:.3f} m3) -- SGC-Datum korrekt")

    # Einzug: J2-Deckel (8.8) liegt unter dem WSP (9.0) -> Gerinnewasser stroemt ein.
    check(j2_in > 0.5,
          f"J2 (Deckel unter WSP) zieht Gerinnewasser ein ({j2_in:.2f} m3)")

    # Lieferung: OUT gibt J2s Wasser zurueck ins Gerinne.
    check(out_del > 0.2,
          f"OUT liefert Netz-Wasser zurueck ins Gerinne ({out_del:.2f} m3)")

    # 4) Massenerhaltung des Kreislaufs: entnommen ~= geliefert + Rohr-/Schachtspeicher.
    #    Toleranz grosszuegig (Speicher im Netz + Relaxations-Schwaenze), aber ein
    #    Phantom-Faktor (x2) oder Totalverlust wuerde sicher reissen.
    total_in2d = sum(v[0] for v in sums.values())
    total_out2d = sum(v[1] for v in sums.values())
    check(total_in2d <= total_out2d + 0.1,
          f"kein Phantom-Wasser: 1D->2D {total_in2d:.2f} <= 2D->1D {total_out2d:.2f} m3 (+Toleranz)")
    check(total_in2d > 0.5 * total_out2d - 1.0,
          f"Kreislauf schliesst sich grob: geliefert {total_in2d:.2f} vs. entnommen {total_out2d:.2f} m3")

    # 5) Numerik gesund: res.max endlich, Verror klein.
    res = work / "results" / "res.max"
    if res.exists():
        vals = []
        for line in res.read_text().splitlines():
            parts = line.split()
            if len(parts) == NCOLS:
                try:
                    vals.append([float(v) for v in parts])
                except ValueError:
                    pass
        finite = vals and all(all(abs(v) < 1e6 for v in row) for row in vals)
        check(finite, "res.max endlich (keine numerischen Schocks)")
    else:
        check(False, "res.max nicht gefunden")

    mass = done.get("payload", {}).get("mass") or done.get("mass")
    if isinstance(mass, dict) and mass.get("summary"):
        verr = abs(float(mass["summary"].get("Verror", 0.0)))
        check(verr < 5.0, f"Massenbilanz sauber: |Verror| = {verr:.2f} m3")
    else:
        # mass steckt je nach handler-Version an anderer Stelle -- kein hartes Gate.
        print("  ℹ️  mass-Summary nicht im done-Payload gefunden (kein Gate)")

    print("\n" + ("✅ SGC-KOPPLUNG BESTANDEN" if failed == 0 else f"❌ {failed} FEHLER"))
    if failed:
        print("\n--- [COUPLE]-Zeilen ---")
        for l in couple_lines[-25:]:
            print(l.strip()[:160])
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
