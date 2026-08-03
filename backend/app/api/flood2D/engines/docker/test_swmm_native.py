#!/usr/bin/env python3
"""
Regressionstest am NATIV gebauten EPA-SWMM-5.2.4-Binary im Container.

Gate für den SWMM-Build-Stage im Dockerfile (`swmm-build` → /opt/swmm/swmm5 +
libswmm5.so). Baut ein minimales, sauberes 1D-Netz (ein Zulauf-Schacht → Rohr →
Auslauf) und prüft, dass der native Solver im Container:
  1. mit Exit 0 durchläuft (Build ok, keine fehlenden .so),
  2. DYNWAVE routet (der für die 1D/2D-Kopplung nötige dynamische Wellenansatz),
  3. eine niedrige Flow-Routing-Kontinuitätsfehler-Marge hält (sauberes Netz → ~0 %).

Der native Solver ist byte-gleich zum Browser-WASM (identische C-Quellen aus
client/.../isybau/solver) — ein Abweichen hier = Build-/Flag-Problem, nicht Physik.

Aufruf (aus beliebigem Verzeichnis):
    python3 test_swmm_native.py [IMAGE]     # default: fabiologe/quagg-lisflood:latest
Exit-Code 0 = bestanden.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
SWMM_BIN = "/opt/swmm/swmm5"   # Runtime-Stage; im swmm-build-Stage-Image: /swmm/swmm5

INP = """\
[TITLE]
QUAGG SWMM native regression (minimal J1 -> C1 -> OUT)

[OPTIONS]
FLOW_UNITS           CMS
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2020
START_TIME           00:00:00
END_DATE             01/01/2020
END_TIME             01:00:00
REPORT_STEP          00:05:00
ROUTING_STEP         5
LINK_OFFSETS         DEPTH
MIN_SLOPE            0

[JUNCTIONS]
;;Name  Elev  MaxDepth  InitDepth  SurDepth  Aponded
J1      10    3         0          0         0

[OUTFALLS]
;;Name  Elev  Type  Stage  Gated
OUT     8     FREE         NO

[CONDUITS]
;;Name  From  To   Length  Roughness  InOffset  OutOffset  InitFlow  MaxFlow
C1      J1    OUT  100     0.013      0         0          0         0

[XSECTIONS]
;;Link  Shape     Geom1  Geom2  Geom3  Geom4  Barrels
C1      CIRCULAR  1.0    0      0      0      1

[INFLOWS]
;;Node  Constituent  TimeSeries
J1      FLOW         INFLOW1

[TIMESERIES]
;;Name    Time   Value
INFLOW1   0:00   0
INFLOW1   0:10   0.5
INFLOW1   0:30   0.5
INFLOW1   1:00   0

[REPORT]
INPUT       NO
CONTINUITY  YES
FLOWSTATS   YES
"""


def main():
    # Job-Dir unter backend/data/ (NICHT /tmp): Snap-Docker mountet keine /tmp-Host-Pfade.
    backend_dir = Path(__file__).resolve().parents[3]   # …/flood2D
    job = backend_dir / "data" / "regression_swmm_native"
    if job.exists():
        shutil.rmtree(job)
    job.mkdir(parents=True)
    (job / "network.inp").write_text(INP)

    ok = True
    try:
        print(f"[regression] Image={IMAGE}  Szenario: minimales SWMM-Netz (DYNWAVE)")
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job",
             "--entrypoint", SWMM_BIN, IMAGE,
             "/job/network.inp", "/job/report.rpt", "/job/out.out"],
            capture_output=True, text=True, timeout=300,
        )
        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stdout[-1500:]}\n{proc.stderr[-800:]}")
            ok = False
        else:
            print("✅ swmm5 lief mit Exit 0 (Build ok, libswmm5-Deps vorhanden)")

        rpt = job / "report.rpt"
        text = rpt.read_text(errors="replace") if rpt.exists() else ""
        if not text:
            print("❌ kein report.rpt erzeugt")
            ok = False

        if "DYNWAVE" in text:
            print("✅ Flow Routing = DYNWAVE")
        else:
            print("❌ DYNWAVE nicht im Report (falscher Routing-Modus?)")
            ok = False

        # Flow-Routing-Kontinuitätsfehler: letzte "Continuity Error (%)" ist die des Routings.
        errs = re.findall(r"Continuity Error \(%\)\s*\.*\s*(-?\d+\.\d+)", text)
        if errs:
            routing_err = abs(float(errs[-1]))
            if routing_err < 5.0:
                print(f"✅ Flow-Routing-Kontinuitätsfehler {routing_err:.3f} % (< 5 %)")
            else:
                print(f"❌ Flow-Routing-Kontinuitätsfehler {routing_err:.3f} % zu hoch")
                ok = False
        else:
            print("❌ keine Continuity-Error-Zeile im Report")
            ok = False

        print("\n" + ("✅ REGRESSION BESTANDEN" if ok else "❌ REGRESSION FEHLGESCHLAGEN"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
