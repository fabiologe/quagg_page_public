#!/usr/bin/env python3
"""
Regressionstest für den SWMM-.out-Binär-Reader in handler.py (Phase R der
1D-Ergebnis-Pipeline): erzeugt mit dem NATIVEN Container-SWMM eine echte .out
(dasselbe Mini-Netz wie test_swmm_native.py) und prüft, dass read_swmm_out()
daraus plausible Zeitreihen dekodiert:

  1. Struktur: Knoten J1/OUT + Haltung C1 mit korrekten Typen/Properties,
  2. Zeitachse: 12 Perioden à REPORT_STEP=300 s, streng monoton,
  3. Physik: C1-Spitzenabfluss ≈ Zufluss-Plateau 0.5 m³/s, J1 staut ein,
     Outfall bekommt totalInflow, System-Serien gleich lang,
  4. coupling_budget(): [COUPLE]-Finalize-Zeilen → strukturiertes Budget.

Aufruf:
    python3 test_swmm_out_reader.py [IMAGE]     # default: lisflood-fp:latest
Exit-Code 0 = bestanden.
"""
import shutil
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE.parents[1]))   # …/flood2D — handler importiert dort codec.py
from handler import coupling_budget, read_swmm_out  # noqa: E402
from test_swmm_native import INP, SWMM_BIN  # noqa: E402

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"


def check(cond, msg):
    print(("✅ " if cond else "❌ ") + msg)
    return cond


def main():
    # Job-Dir unter backend/data/ (NICHT /tmp): Snap-Docker mountet keine /tmp-Host-Pfade.
    backend_dir = Path(__file__).resolve().parents[3]   # …/flood2D
    job = backend_dir / "data" / "regression_swmm_out_reader"
    if job.exists():
        shutil.rmtree(job)
    job.mkdir(parents=True)
    # NODES/LINKS ALL wie im SwmmBuilder: ohne Reporting-Flag landen KEINE
    # Knoten-/Link-Serien in der Binärausgabe (SWMM-Default ist NONE).
    (job / "network.inp").write_text(
        INP.replace("CONTINUITY  YES", "CONTINUITY  YES\nNODES       ALL\nLINKS       ALL"))

    ok = True
    try:
        print(f"[regression] Image={IMAGE}  Szenario: .out-Reader am Mini-Netz")
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job",
             "--entrypoint", SWMM_BIN, IMAGE,
             "/job/network.inp", "/job/report.rpt", "/job/out.out"],
            capture_output=True, text=True, timeout=300,
        )
        if not check(proc.returncode == 0, f"swmm5 Exit {proc.returncode}"):
            print(proc.stdout[-1500:], proc.stderr[-800:])
            sys.exit(1)

        net = read_swmm_out(job / "out.out")

        # 1. Struktur
        ok &= check(set(net["nodes"]) == {"J1", "OUT"}, f"Knoten-IDs: {sorted(net['nodes'])}")
        ok &= check(set(net["links"]) == {"C1"}, f"Link-IDs: {sorted(net['links'])}")
        ok &= check(net["nodes"]["J1"]["type"] == "junction"
                    and net["nodes"]["OUT"]["type"] == "outfall",
                    f"Knoten-Typen: J1={net['nodes']['J1']['type']}, "
                    f"OUT={net['nodes']['OUT']['type']}")
        c1 = net["links"]["C1"]
        ok &= check(c1["type"] == "conduit" and abs(c1["length"] - 100.0) < 0.01
                    and abs(c1["maxDepth"] - 1.0) < 0.01,
                    f"C1-Properties: type={c1['type']}, L={c1['length']}, D={c1['maxDepth']}")
        ok &= check(abs(net["nodes"]["J1"]["invert"] - 10.0) < 0.01
                    and abs(net["nodes"]["J1"]["maxDepth"] - 3.0) < 0.01,
                    f"J1-Properties: invert={net['nodes']['J1']['invert']}, "
                    f"maxDepth={net['nodes']['J1']['maxDepth']}")

        # 2. Zeitachse (1 h Lauf, REPORT_STEP 5 min → 11–12 Perioden; ob SWMM die
        #    End-Periode t=3600 noch schreibt, hängt vom Routing-Step-Runden ab)
        t = net["times"]
        ok &= check(net["reportStep"] == 300, f"reportStep={net['reportStep']} s")
        ok &= check(len(t) in (11, 12), f"{len(t)} Perioden (erwartet 11–12)")
        ok &= check(all(b > a for a, b in zip(t, t[1:])) and t[0] == 300 and t[-1] >= 3300,
                    f"Zeitachse monoton, t0={t[0]} s, tEnd={t[-1]} s")

        # 3. Physik: Zufluss-Plateau 0.5 m³/s (0:10–0:30) muss als C1-Spitze ankommen
        qmax = max(c1["flow"])
        ok &= check(0.4 < qmax < 0.6, f"C1-Spitzenabfluss {qmax:.3f} m³/s (~0.5 erwartet)")
        ok &= check(max(net["nodes"]["J1"]["depth"]) > 0.05,
                    f"J1 staut ein (max depth {max(net['nodes']['J1']['depth']):.3f} m)")
        ok &= check(max(net["nodes"]["OUT"]["totalInflow"]) > 0.3,
                    f"OUT erhält Zufluss (max {max(net['nodes']['OUT']['totalInflow']):.3f} m³/s)")
        ok &= check(all(v >= 0 for v in c1["volume"]) and max(c1["volume"]) > 0,
                    f"C1-Volumen-Serie plausibel (max {max(c1['volume']):.2f} m³)")
        nsys = len(net["system"]["storedVolume"])
        ok &= check(nsys == len(t) and max(net["system"]["storedVolume"]) > 0,
                    f"System-Serien: {nsys} Werte, max gespeichert "
                    f"{max(net['system']['storedVolume']):.2f} m³")
        ok &= check(all(len(c1[k]) == len(t)
                        for k in ("flow", "depth", "velocity", "volume", "capacity")),
                    "alle Link-Serien gleich lang wie die Zeitachse")

        # 4. Kopplungsbudget aus [COUPLE]-Finalize-Zeilen
        budget = coupling_budget([
            "[COUPLE]   J1               JUNCTION Sum 1D->2D 12.34 m3 | 2D->1D 56.78 m3",
            "[COUPLE]   OUT              OUTFALL  Sum 1D->2D 40.00 m3 | 2D->1D 0.00 m3",
            "[COUPLE] Ende: 1D->2D gesamt 52.34 m3 | 2D->1D gesamt 56.78 m3 "
            "| unverrechnete Bilanz-Schuld 0.012 m3",
        ])
        ok &= check(budget is not None and budget["to2d"] == 52.34
                    and budget["to1d"] == 56.78 and budget["debt"] == 0.012,
                    f"Budget-Summen: {budget}")
        ok &= check(budget["nodes"]["J1"] == {"kind": "junction", "to2d": 12.34, "to1d": 56.78}
                    and budget["nodes"]["OUT"]["kind"] == "outfall",
                    f"Budget-Knoten: {budget['nodes']}")

        print("\n" + ("✅ REGRESSION BESTANDEN" if ok else "❌ REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
