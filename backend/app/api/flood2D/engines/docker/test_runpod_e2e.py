#!/usr/bin/env python3
"""
E2E-Test fuer das RunPod-Worker-Image (Dockerfile-Stage 'runpod').

Szenario: 12x10-Raster (5 m), Gelaende 10.0 mNN mit 3x3-Senke (9.5 mNN), 0.3 m
Anfangswasser in der Senke (startfile), geschlossene Raender, 60 s Simulation,
saveint 30. Unkoppelt, winzig — Frames passen in den Inline-Fallback (data:-URLs),
daher braucht der Test WEDER Volume-Mount (Snap-Docker-/tmp-Falle!) NOCH S3.

Teil A — Worker-Handler direkt (python3 -c im Container): Input-JSON via stdin
  (exakt das JobInput-Format des Backends, Dateien gzip+base64), Events als
  NDJSON auf stdout. Prueft: Eventfolge, Frame-Dekodierung (codec-Roundtrip
  durch die data:-URL), done mit maxDepthUrl, Wasser vorhanden.

Teil B — Entrypoint mit --test_input: beweist, dass das runpod-SDK den
  Generator-Handler faehrt (Smoke: Exit 0, kein Traceback, 'Job result').

Aufruf:  python3 test_runpod_e2e.py [IMAGE]    # default lisflood-fp:runpod
Exit 0 = bestanden.
"""
import base64
import gzip
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))  # codec (backend/app/api/flood2D)
from codec import decode_frame  # noqa: E402

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "lisflood-fp:runpod"
NCOLS, NROWS, CS = 12, 10, 5.0
GROUND, DIP_Z, H0 = 10.0, 9.5, 0.3
FAILURES = []


def check(name, cond, detail=""):
    print(f"  [{'OK ' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def asc_grid(vals):
    head = (f"ncols {NCOLS}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
            f"cellsize {CS}\nNODATA_value -9999\n")
    return head + "\n".join(" ".join(f"{v:.3f}" for v in row) for row in vals) + "\n"


terrain, start = [], []
for r in range(NROWS):
    trow, srow = [], []
    for c in range(NCOLS):
        in_dip = 4 <= c <= 6 and 4 <= r <= 6
        trow.append(DIP_Z if in_dip else GROUND)
        srow.append(H0 if in_dip else 0.0)
    terrain.append(trow)
    start.append(srow)

par = ("DEMfile terrain.asc\nresroot res\ndirroot results\n"
       "sim_time 60\ninitial_tstep 1\nsaveint 30\nmassint 10\n"
       "fpfric 0.05\nacceleration\nstartfile start.asc\n")


def enc(text):
    return {"encoding": "gzip+base64",
            "data": base64.b64encode(gzip.compress(text.encode())).decode()}


job = {"id": "e2e-docker", "input": {
    "files": {"run.par": enc(par), "terrain.asc": enc(asc_grid(terrain)),
              "start.asc": enc(asc_grid(start))},
    "maxTime": 120, "deliver": "urls"}}

# ── Teil A: handler() direkt im Container ────────────────────────────────────
print(f"Teil A: handler() im Image {IMAGE}")
driver = ("import json,sys; sys.path.insert(0,'/opt/lisflood');"
          "import runpod_worker as rw;"
          "job=json.load(sys.stdin);"
          "[print(json.dumps(ev), flush=True) for ev in rw.handler(job)]")
res = subprocess.run(
    ["docker", "run", "--rm", "-i", "--entrypoint", "python3", IMAGE, "-c", driver],
    input=json.dumps(job), capture_output=True, text=True, timeout=600)
check("Exit 0", res.returncode == 0, f"rc={res.returncode} stderr={res.stderr[-800:]}")

events = []
for line in res.stdout.splitlines():
    try:
        events.append(json.loads(line))
    except json.JSONDecodeError:
        pass
kinds = [e.get("event") for e in events]
frames = [e for e in events if e.get("event") == "frame"]
done = next((e for e in events if e.get("event") == "done"), None)
check("progress-Events", "progress" in kinds)
check("mind. 1 frame-Event", len(frames) >= 1, f"kinds={kinds}")
check("done-Event", done is not None)
check("kein error-Event", "error" not in kinds,
      str(next((e for e in events if e.get("event") == "error"), "")))

if frames:
    fr = frames[-1]
    check("frame: url statt file", "url" in fr and "file" not in fr)
    buf = base64.b64decode(fr["url"].split(",", 1)[1])
    meta, channels = decode_frame(buf)
    check("Frame dekodierbar, Raster passt",
          meta["ncols"] == NCOLS and meta["nrows"] == NROWS)
    check("Wasser in der Senke", max(channels["depth"]) > 0.05,
          f"max depth={max(channels['depth']):.4f}")
    check("Kanaele vollstaendig",
          all(k in channels for k in ("depth", "elev", "vx", "vy", "qx", "qy")),
          f"{sorted(channels)}")
if done:
    check("done: maxDepthUrl inline", str(done.get("maxDepthUrl", "")).startswith("data:"))
    check("done: keine *File-Reste", not any(k.endswith("File") for k in done))

# ── Teil B: runpod-SDK via --test_input (Smoke) ──────────────────────────────
print("Teil B: Entrypoint --test_input (runpod-SDK)")
res_b = subprocess.run(
    ["docker", "run", "--rm", IMAGE, "--test_input", json.dumps({"input": job["input"]})],
    capture_output=True, text=True, timeout=600)
out_b = res_b.stdout + res_b.stderr
check("SDK Exit 0", res_b.returncode == 0, f"rc={res_b.returncode} tail={out_b[-800:]}")
check("SDK kein Traceback", "Traceback" not in out_b, out_b[-800:])
check("SDK Job abgeschlossen", "result" in out_b.lower() or "completed" in out_b.lower(),
      out_b[-400:])

print()
if FAILURES:
    print(f"FEHLGESCHLAGEN: {len(FAILURES)} — {FAILURES}")
    sys.exit(1)
print("E2E bestanden.")
