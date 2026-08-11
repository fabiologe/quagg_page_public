#!/usr/bin/env python3
"""
E2E-Test des Local Companion: echter Solver-Lauf durch die localhost-API.

Startet quagg_local_companion.py als Subprozess (eigener Datenordner, lokales
Image) und prueft die komplette Kette, die spaeter auf dem Nutzer-PC laeuft:

  1. /health: Docker-Erkennung, Image-Status, Disk-Info, Datenordner
  2. CORS: Preflight (OPTIONS) + Origin-Header fuer quagg-engineering.org;
     fremde Origin bekommt KEINE Freigabe
  3. /run -> /stream-Poll -> COMPLETED: echter LISFLOOD-Lauf im Container
  4. Frame-Download ueber /files + codec-Dekodierung (Wasser in der Senke)
  5. 409 bei parallelem zweiten Job
  6. 507 bei zu wenig Speicherplatz (QUAGG_MIN_FREE_GB hoch)
  7. Ergebnisse liegen im Laufordner auf der Platte (lokaler Pfad!)

Aufruf:  python3 test_companion_e2e.py [IMAGE]   # default fabiologe/quagg-lisflood:latest
Exit 0 = bestanden.
"""
import base64
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
# codec (Frame-Decoder) gehört zum Flood2D-Feature und bleibt dort;
# dieser Test prüft ja genau den LISFLOOD-Weg.
sys.path.insert(0, str(HERE.parent / "app" / "api" / "flood2D"))
from codec import decode_frame  # noqa: E402

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "fabiologe/quagg-lisflood:latest"
PORT = 8653
BASE = f"http://127.0.0.1:{PORT}"
ORIGIN = "https://quagg-engineering.org"
FAILURES = []


def check(name, cond, detail=""):
    print(f"  [{'OK ' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def req(method, path, body=None, headers=None, raw=False):
    r = urllib.request.Request(BASE + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            data = res.read()
            return res.status, dict(res.headers), (data if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        return e.code, dict(e.headers), (data if raw else json.loads(data or b"{}"))


# ── Companion starten ────────────────────────────────────────────────────────
# NICHT unter /tmp: Snap-Docker auf diesem Server sieht Host-/tmp nicht
# (Mount erscheint im Container leer -> "keine .par-Datei"). backend/data/
# funktioniert — wie bei allen anderen Docker-Tests. Auf Nutzer-PCs liegt der
# Companion-Datenordner ohnehin im Home (Docker-Desktop-Standard-Freigabe).
tmp = Path(tempfile.mkdtemp(prefix="companion-e2e-",
                            dir=HERE.parent / "data"))
env = {**os.environ, "QUAGG_COMPANION_PORT": str(PORT), "QUAGG_COMPANION_IMAGE": IMAGE,
       "QUAGG_COMPANION_DATA": str(tmp / "data"), "QUAGG_COMPANION_KEEP": "5"}
proc = subprocess.Popen([sys.executable, str(HERE / "quagg_local_companion.py")],
                       env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(40):
    time.sleep(0.25)
    try:
        code, _, health = req("GET", "/health")
        if code == 200:
            break
    except OSError:
        continue
else:
    print("Companion startet nicht"); proc.kill(); sys.exit(1)

try:
    print("1. /health")
    check("Docker erkannt", health["docker"]["available"] is True, json.dumps(health["docker"]))
    check("Image-Status gemeldet", health["image"]["name"] == IMAGE
          and isinstance(health["image"]["present"], bool))
    check("Disk-Info + Datenordner", health["disk"]["freeBytes"] > 0
          and str(tmp) in health["disk"]["dataDir"])

    print("2. CORS")
    code, hdr, _ = req("OPTIONS", "/v2/pod/run", headers={"Origin": ORIGIN})
    check("Preflight 204 + ACAO", code == 204
          and hdr.get("Access-Control-Allow-Origin") == ORIGIN, f"{code} {hdr}")
    code, hdr, _ = req("GET", "/health", headers={"Origin": ORIGIN})
    check("GET mit Origin -> ACAO", hdr.get("Access-Control-Allow-Origin") == ORIGIN)
    code, hdr, _ = req("GET", "/health", headers={"Origin": "https://evil.example.com"})
    check("fremde Origin: kein ACAO", "Access-Control-Allow-Origin" not in hdr)

    print("3. Echter Solver-Lauf")
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
    code, _, run = req("POST", "/v2/pod/run", body={"input": {"files": {
        "run.par": enc(par), "terrain.asc": enc(asc(terr)), "start.asc": enc(asc(start))}}})
    check("Job angenommen (engine=local)", code == 200 and run.get("engine") == "local",
          json.dumps(run))
    job_id = run["id"]

    print("   (5a. 409 waehrend der Lauf laeuft)")
    code2, _, r2 = req("POST", "/v2/pod/run", body={"input": {"files": {"run.par": "x"}}})
    check("zweiter Job -> 409", code2 == 409, f"{code2}: {json.dumps(r2)}")

    events, status = [], "IN_QUEUE"
    t0 = time.time()
    while status not in ("COMPLETED", "FAILED", "CANCELLED"):
        if time.time() - t0 > 300:
            check("Lauf endet rechtzeitig", False, f"haengt bei {status}"); break
        time.sleep(1)
        _, _, s = req("GET", f"/v2/pod/stream/{job_id}")
        events += [it["output"] for it in s.get("stream", [])]
        status = s.get("status", status)
    kinds = [e.get("event") for e in events]
    check("COMPLETED", status == "COMPLETED",
          f"{status}; letzte Events: {[e for e in events if e.get('event')=='log'][-3:]}")
    frames = [e for e in events if e.get("event") == "frame"]
    done = next((e for e in events if e.get("event") == "done"), None)
    check("Frames + done im Stream", len(frames) >= 1 and done is not None, f"{kinds[:20]}")

    print("4. Frame via /files + Dekodierung")
    fr = frames[-1]
    check("frame.url zeigt auf /files", fr.get("url", "").startswith("/files/"))
    _, _, buf = req("GET", fr["url"], raw=True)
    meta, channels = decode_frame(bytes(buf))
    check("Raster passt", meta["ncols"] == NC and meta["nrows"] == NR)
    check("Wasser in der Senke", max(channels["depth"]) > 0.05,
          f"max={max(channels['depth']):.3f}")

    print("7. Ergebnisse lokal auf der Platte")
    run_dir = tmp / "data" / "runs" / job_id
    n_results = len(list((run_dir / "results").glob("*.bin")))
    check("Laufordner existiert mit .bin-Ergebnissen", n_results >= 3,
          f"{run_dir}: {n_results} .bin")

    print("8. Persistenz: Companion-NEUSTART -> Lauf bleibt ladbar (Viewer-Reload)")
    proc.terminate()
    proc.wait(timeout=10)
    proc = subprocess.Popen([sys.executable, str(HERE / "quagg_local_companion.py")],
                           env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(40):
        time.sleep(0.25)
        try:
            if req("GET", "/health")[0] == 200:
                break
        except OSError:
            continue
    _, _, runs = req("GET", "/runs")
    entry = next((r for r in runs.get("runs", []) if r["id"] == job_id), None)
    check("/runs listet den Lauf nach Neustart",
          entry is not None and entry.get("status") == "COMPLETED"
          and entry.get("frames", 0) >= 1, json.dumps(runs)[:300])
    code, _, manifest = req("GET", f"/runs/{job_id}/manifest")
    m_frames = [e for e in manifest.get("events", []) if e.get("event") == "frame"]
    m_done = next((e for e in manifest.get("events", []) if e.get("event") == "done"), None)
    check("Manifest: Frames + done + Status final",
          code == 200 and manifest.get("status") == "COMPLETED"
          and len(m_frames) >= 1 and m_done is not None
          and "maxDepthUrl" in m_done, json.dumps(manifest)[:300])
    code, _, buf = req("GET", m_frames[-1]["url"], raw=True)
    meta2, ch2 = decode_frame(bytes(buf))
    check("/files nach Neustart dekodierbar (ohne In-Memory-Job)",
          code == 200 and meta2["ncols"] == NC and max(ch2["depth"]) > 0.05)

finally:
    proc.terminate()
    proc.wait(timeout=10)

print("6. 507 bei zu wenig Speicherplatz")
env507 = {**env, "QUAGG_MIN_FREE_GB": "999999"}
proc2 = subprocess.Popen([sys.executable, str(HERE / "quagg_local_companion.py")],
                        env=env507, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
try:
    for _ in range(40):
        time.sleep(0.25)
        try:
            if req("GET", "/health")[0] == 200:
                break
        except OSError:
            continue
    code, _, body = req("POST", "/v2/pod/run", body={"input": {"files": {"run.par": "x"}}})
    check("507 + klare Meldung", code == 507 and "Speicherplatz" in body.get("error", ""),
          f"{code}: {json.dumps(body)}")
finally:
    proc2.terminate()
    proc2.wait(timeout=10)
    shutil.rmtree(tmp, ignore_errors=True)

print()
if FAILURES:
    print(f"FEHLGESCHLAGEN: {len(FAILURES)} — {FAILURES}")
    sys.exit(1)
print("E2E bestanden.")
