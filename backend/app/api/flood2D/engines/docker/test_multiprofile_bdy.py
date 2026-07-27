#!/usr/bin/env python3
"""
Regressionstest am ECHTEN LISFLOOD-Binary: mehrere (2+) referenzierte .bdy-Zeitreihen-
Profile (QVAR-Punktquellen) in einem Lauf. Ein Original-Vendor-Bug (nicht durch einen
QUAGG-Patch verursacht) konnte hier sporadisch mit SIGSEGV abstürzen (2026-07-25,
gefunden an einem echten Kundenprojekt: Exit -11/245, keine stderr-Ausgabe).

Root Cause: input.cpp's LoadBCVar() nimmt pro .bdy-Profil eine Referenz auf das gerade
per push_back() angehängte Element von BCptr->allTimeSeries (damals std::vector<TimeSeries>)
und speichert deren Adresse dauerhaft für jeden Zeitschritt -- ein vector kann aber bei
push_back() seinen ganzen Speicherblock verschieben und macht so jede ältere Referenz
ungültig. Zusätzlich überschrieb lisflood.cpp ("memset(&Bounds, 0, sizeof(BoundCs));")
den bereits konstruierten Container mit Nullbytes (undefined behavior für nicht-POD-
Member) -- bei std::vector "funktionierte" das meist zufällig, bei der Korrektur auf
std::deque (stabile Referenzen) musste das separat mit einem placement-new behoben werden.

Gate für QUAGG-FIX quagg-timeseries-memset.patch (lisflood.h + lisflood.cpp). Baut ein
Mini-Szenario mit 10 unabhängigen QVAR-Punktquellen (10 .bdy-Profile) -- deutlich mehr
als die 2, die am echten Kundenprojekt schon reichten -- und prüft:
  1. Container-Exit 0 + "done"-Event (kein Crash/Segfault),
  2. alle 10 Profile wurden tatsächlich mit ihrem jeweils EIGENEN Wert angewendet
     (Qin zu Beginn muss der Summe aller 10 Profilwerte entsprechen -- eine dangling-
     pointer-Korruption würde falsche/vertauschte Werte liefern, nicht nur crashen).

Aufruf (aus beliebigem Verzeichnis):
    python3 test_multiprofile_bdy.py [IMAGE]      # default: lisflood-fp:latest
Exit-Code 0 = bestanden.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"
NCOLS, NROWS, CS = 15, 15, 1.0
DEM_Z = 10.0
N_PROFILES = 10


def write_scenario(inp: Path):
    header = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {CS}\nNODATA_value -9999\n")
    (inp / "terrain.asc").write_text(
        header + "\n".join(" ".join(f"{DEM_Z:.3f}" for _ in range(NCOLS)) for _ in range(NROWS)) + "\n"
    )

    bci_lines = []
    bdy_lines = ["LISFLOOD boundary conditions"]
    values = []
    for i in range(N_PROFILES):
        x, y = 2.5 + i * 0.1, 7.5  # eng beieinander, alle in Zeile 7
        name = f"prof{i}"
        val = 0.01 * (i + 1)
        values.append(val)
        bci_lines.append(f"P {x:.2f} {y:.2f} QVAR {name}")
        bdy_lines += [name, "2 seconds", f"{val:.4f} 0", f"{val:.4f} 200"]
    (inp / "flow.bci").write_text(f"{N_PROFILES}\n" + "\n".join(bci_lines) + "\n")
    (inp / "profiles.bdy").write_text("\n".join(bdy_lines) + "\n")

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 10\ninitial_tstep 1\nsaveint 5\nmassint 5\n"
        "fpfric 0.03\nbcifile flow.bci\nbdyfile profiles.bdy\nacceleration\n"
    )
    return sum(values)


def main():
    flood2d_dir = Path(__file__).resolve().parents[2]   # …/flood2D
    job = flood2d_dir / "data" / "regression_multiprofile_bdy"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()
    expected_qin = write_scenario(inp)

    try:
        print(f"[regression] Image={IMAGE}  Szenario: {N_PROFILES} unabhängige QVAR-Profile (.bdy)")
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
        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-2000:]}\n{proc.stderr[-1000:]}")
            ok = False
        done = next((e for e in events if e.get("event") == "done"), None)
        if not done:
            print("❌ kein 'done'-Event (Lauf nicht sauber beendet -- ggf. Segfault)")
            ok = False
        else:
            print("✅ Lauf beendet ('done'-Event, kein Crash/Segfault)")
            rows = done.get("massReport", {}).get("rows", [])
            first_qin = rows[0]["Qin"] if rows else None
            if first_qin is None or abs(first_qin - expected_qin) > 1e-3:
                print(f"❌ Qin am ersten Zeitschritt = {first_qin}, erwartet Summe aller {N_PROFILES} "
                      f"Profile = {expected_qin:.4f} (dangling-pointer-Korruption?)")
                ok = False
            else:
                print(f"✅ Qin = Summe aller {N_PROFILES} Profile ({expected_qin:.4f}) -- keine Korruption")

        print("\n" + ("✅ REGRESSION BESTANDEN" if ok else "❌ REGRESSION FEHLGESCHLAGEN"))
    except subprocess.TimeoutExpired:
        print("❌ Container-Timeout -- vermutlich Segfault/Hang")
        ok = False
        print("\n❌ REGRESSION FEHLGESCHLAGEN")
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
