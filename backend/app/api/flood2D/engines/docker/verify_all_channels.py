#!/usr/bin/env python3
"""
Verifikation: liefert die Pipeline ALLE Ergebnis-Kanäle/-Raster?

Läuft ein Mini-Szenario im echten Container und prüft:
  Frame:  channels depth + vx + vy + elev vorhanden & dekodierbar
  done:   maxDepthFile + maxElevFile + maxHazardFile + maxVelocityFile
          + arrivalTimeFile + durationFile  (handler liefert *File, das
          DockerEngine macht daraus *Url — hier prüfen wir den handler-Output)

Aufruf:  python3 verify_all_channels.py [IMAGE]   (default lisflood-fp:latest)
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # …/flood2D
from codec import decode_frame  # noqa: E402

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:latest"


def main():
    backend_dir = Path(__file__).resolve().parents[3]  # …/flood2D
    job = backend_dir / "data" / "verify_all_channels"
    if job.exists():
        shutil.rmtree(job)
    inp = job / "inputs"
    inp.mkdir(parents=True)
    (job / "results").mkdir()

    NC, NR = 20, 8
    rows = []
    for r in range(NR):
        rows.append(" ".join(f"{(3.0 - c*0.05 if r in (3, 4) else 8.0):.3f}" for c in range(NC)))
    (inp / "terrain.asc").write_text(
        f"ncols {NC}\nnrows {NR}\nxllcorner 0\nyllcorner 0\ncellsize 1.0\n"
        f"NODATA_value -9999\n" + "\n".join(rows) + "\n")
    (inp / "flow.bci").write_text("P 0.5 3.5 QFIX 1.0\nE 0 8 FREE\n")
    # KEIN voutput/hazard in der .par — der handler MUSS sie selbst erzwingen.
    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        "sim_time 120\ninitial_tstep 1\nsaveint 30\nmassint 10\n"
        "fpfric 0.03\nbcifile flow.bci\nacceleration\n")

    ok = True
    try:
        proc = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{job}:/job", IMAGE,
             "--job", "/job", "--heartbeat", "5"],
            capture_output=True, text=True, timeout=300)
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

        if proc.returncode != 0:
            print(f"❌ Container-Exit {proc.returncode}\n{proc.stderr[-800:]}")
            return False

        # ── Frame-Kanäle ──
        frames = [e for e in events if e.get("event") == "frame"]
        if not frames:
            print("❌ keine frame-Events")
            return False
        fpath = job / "results" / frames[len(frames) // 2]["file"]
        meta, channels = decode_frame(fpath.read_bytes())
        names = meta.get("channels", [])
        print(f"   Frame {fpath.name}: Kanäle = {names}")
        for ch in ("depth", "vx", "vy", "elev"):
            present = ch in channels and len(channels[ch]) == NC * NR
            print(f"  {'✅' if present else '❌'} Frame-Kanal '{ch}'")
            ok = ok and present

        # ── done-Endraster ──
        done = next((e for e in events if e.get("event") == "done"), {})
        print(f"   done keys = {sorted(done.keys())}")
        for key in ("maxDepthFile", "maxElevFile", "maxHazardFile",
                    "maxVelocityFile", "arrivalTimeFile", "durationFile"):
            f = done.get(key)
            present = bool(f) and (job / "results" / f).exists()
            if present:
                m, c = decode_frame((job / "results" / f).read_bytes())
                present = "depth" in c and len(c["depth"]) == NC * NR
            print(f"  {'✅' if present else '❌'} done['{key}'] → dekodierbares Raster")
            ok = ok and present

        print("\n" + ("✅ ALLE KANÄLE/RASTER VORHANDEN" if ok else "❌ ES FEHLEN KANÄLE/RASTER"))
    finally:
        shutil.rmtree(job, ignore_errors=True)
    return ok


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
