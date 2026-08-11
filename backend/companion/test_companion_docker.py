#!/usr/bin/env python3
"""
E2E-Test der Docker-Verteilung des Companions (Windows-Pfad: kein Host-Python).

Startet fabiologe/quagg-companion:latest mit gemountetem Docker-Socket +
benanntem Volume (exakt das dokumentierte Nutzer-Kommando) und prueft:

  1. /health aus dem Container heraus (Docker-Erkennung via Socket)
  2. echter Solver-Lauf als GESCHWISTER-Container (Sibling-Volume-Modus)
  3. Frames via /files dekodierbar
  4. /runs + Manifest nach COMPANION-CONTAINER-NEUSTART (Volume-Persistenz)

Aufruf:  python3 test_companion_docker.py [SOLVER_IMAGE]
         (default fabiologe/quagg-lisflood:latest — lokal vorhanden, kein Pull)
Exit 0 = bestanden.  Raeumt Container + Volume wieder ab.
"""
import base64
import gzip
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "app" / "api" / "flood2D"))
from codec import decode_frame  # noqa: E402

SOLVER_IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
CONTAINER = "quagg-companion-e2e"
VOLUME = "quagg-companion-e2e-data"
PORT = 8663
BASE = f"http://127.0.0.1:{PORT}"
FAILURES = []


def check(name, cond, detail=""):
    print(f"  [{'OK ' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def req(method, path, body=None, raw=False, timeout=30):
    r = urllib.request.Request(BASE + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            data = res.read()
            return res.status, (data if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def cleanup():
    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)
    subprocess.run(["docker", "volume", "rm", "-f", VOLUME], capture_output=True)


def start_companion():
    r = subprocess.run(
        ["docker", "run", "-d", "--name", CONTAINER,
         "-p", f"127.0.0.1:{PORT}:8642",
         "-v", "/var/run/docker.sock:/var/run/docker.sock",
         "-v", f"{VOLUME}:/data",
         "-e", f"QUAGG_SIBLING_VOLUME={VOLUME}",
         "-e", f"QUAGG_COMPANION_IMAGE={SOLVER_IMAGE}",
         "fabiologe/quagg-companion:latest"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("Companion-Container startet nicht:", r.stderr)
        sys.exit(1)
    for _ in range(60):
        time.sleep(0.5)
        try:
            if req("GET", "/health")[0] == 200:
                return
        except OSError:
            continue
    print("Companion antwortet nicht")
    subprocess.run(["docker", "logs", CONTAINER], timeout=20)
    cleanup()
    sys.exit(1)


cleanup()
start_companion()
try:
    print("1. /health im Docker-Modus")
    _, health = req("GET", "/health")
    check("Docker via Socket erkannt", health["docker"]["available"] is True,
          json.dumps(health["docker"]))
    check("Datenordner = /data (Volume)", health["disk"]["dataDir"] == "/data")

    print("2. Echter Sibling-Solver-Lauf")
    NC, NR, CS = 12, 10, 5.0
    def asc(vals):
        h = f"ncols {NC}\nnrows {NR}\nxllcorner 0\nyllcorner 0\ncellsize {CS}\nNODATA_value -9999\n"
        return h + "\n".join(" ".join(f"{v:.3f}" for v in r) for r in vals) + "\n"
    terr = [[9.5 if (4 <= c <= 6 and 4 <= r <= 6) else 10.0 for c in range(NC)] for r in range(NR)]
    start = [[0.3 if (4 <= c <= 6 and 4 <= r <= 6) else 0.0 for c in range(NC)] for r in range(NR)]
    par = ("DEMfile terrain.asc\nresroot res\ndirroot results\nsim_time 60\ninitial_tstep 1\n"
           "saveint 30\nmassint 10\nfpfric 0.05\nacceleration\nstartfile start.asc\n")
    enc = lambda t: {"encoding": "gzip+base64",
                     "data": base64.b64encode(gzip.compress(t.encode())).decode()}
    code, run = req("POST", "/v2/pod/run", body={"input": {"files": {
        "run.par": enc(par), "terrain.asc": enc(asc(terr)), "start.asc": enc(asc(start))}}})
    check("Job angenommen", code == 200, json.dumps(run))
    job_id = run["id"]

    events, status, t0 = [], "IN_QUEUE", time.time()
    while status not in ("COMPLETED", "FAILED", "CANCELLED"):
        if time.time() - t0 > 300:
            break
        time.sleep(1)
        _, s = req("GET", f"/v2/pod/stream/{job_id}")
        events += [it["output"] for it in s.get("stream", [])]
        status = s.get("status", status)
    check("COMPLETED (Sibling-Lauf)", status == "COMPLETED",
          f"{status}; logs: {[e.get('text') for e in events if e.get('event')=='log'][-3:]}")
    frames = [e for e in events if e.get("event") == "frame"]
    check("Frames da", len(frames) >= 1)

    print("3. Frame dekodierbar")
    code, buf = req("GET", frames[-1]["url"], raw=True)
    meta, channels = decode_frame(bytes(buf))
    check("Raster + Wasser", meta["ncols"] == NC and max(channels["depth"]) > 0.05)

    print("4. Container-Neustart -> Volume-Persistenz")
    subprocess.run(["docker", "restart", CONTAINER], capture_output=True, timeout=60)
    for _ in range(60):
        time.sleep(0.5)
        try:
            if req("GET", "/health")[0] == 200:
                break
        except OSError:
            continue
    _, runs = req("GET", "/runs")
    entry = next((r for r in runs.get("runs", []) if r["id"] == job_id), None)
    check("/runs nach Neustart", entry is not None and entry.get("status") == "COMPLETED",
          json.dumps(runs)[:200])
    code, buf = req("GET", frames[-1]["url"], raw=True)
    check("/files nach Neustart", code == 200 and len(bytes(buf)) > 100)

finally:
    cleanup()

print()
if FAILURES:
    print(f"FEHLGESCHLAGEN: {len(FAILURES)} — {FAILURES}")
    sys.exit(1)
print("E2E (Docker-Modus) bestanden.")
