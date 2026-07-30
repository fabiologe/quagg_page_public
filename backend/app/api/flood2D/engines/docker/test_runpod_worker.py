#!/usr/bin/env python3
"""
Unit-Tests fuer runpod_worker.py — laufen OHNE Docker, ohne runpod-SDK, ohne boto3
(lazy imports im Worker). Prueft:

  1. decode_input_entry: text / gzip+base64 / s3 (Fake-Store)
  2. write_inputs: Dateien landen in inputs/, Path-Traversal wird abgelehnt
  3. process_events: frame.file -> url, done.*File -> *Url, Nicht-JSON -> log-Event,
     Ergebnisdatei wird nach Ablage geloescht (Container-Disk-Hygiene)
  4. InlineStore: data:-URL-Roundtrip + Groessenlimit
  5. gzip-Transportkette: encode_frame -> gzip (Upload) -> gunzip (Browser-fetch)
     -> decode_frame ist bitidentisch (simuliert R2 mit ContentEncoding=gzip)
  6. handler()-Generator end-to-end mit Stub-handler.py (Erfolg + Fehlerpfad,
     Job-Verzeichnis wird aufgeraeumt)

Aufruf:  python3 test_runpod_worker.py     Exit 0 = bestanden.
"""
import base64
import gzip
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))            # runpod_worker
sys.path.insert(0, str(HERE.parents[1]))  # codec (backend/app/api/flood2D)

import runpod_worker as rw  # noqa: E402
from codec import encode_frame, decode_frame  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    status = "OK " if cond else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


class FakeStore:
    """Zeichnet store_result-Aufrufe auf und loescht wie die echten Stores."""
    def __init__(self):
        self.stored = {}

    def store_result(self, path: Path, job_id: str) -> str:
        self.stored[path.name] = path.read_bytes()
        path.unlink()
        return f"fake://{job_id}/{path.name}"

    def get_text(self, key: str) -> str:
        return f"S3-INHALT:{key}"


# ── 1. decode_input_entry ────────────────────────────────────────────────────
print("1. decode_input_entry")
store = FakeStore()
check("nackter String", rw.decode_input_entry("hallo", store) == "hallo")
check("dict text", rw.decode_input_entry({"encoding": "text", "data": "abc"}, store) == "abc")
payload = base64.b64encode(gzip.compress("Zeile1\nZeile2".encode())).decode()
check("gzip+base64", rw.decode_input_entry(
    {"encoding": "gzip+base64", "data": payload}, store) == "Zeile1\nZeile2")
check("s3-Key", rw.decode_input_entry(
    {"encoding": "s3", "key": "jobs/x/dem.asc"}, store) == "S3-INHALT:jobs/x/dem.asc")

# ── 2. write_inputs ──────────────────────────────────────────────────────────
print("2. write_inputs")
tmp = Path(tempfile.mkdtemp(prefix="rwtest-"))
rw.write_inputs(tmp / "inputs", {"run.par": "DEMfile terrain.asc",
                                 "terrain.asc": {"encoding": "text", "data": "ncols 2"}}, store)
check("Dateien geschrieben",
      (tmp / "inputs/run.par").read_text() == "DEMfile terrain.asc"
      and (tmp / "inputs/terrain.asc").read_text() == "ncols 2")
try:
    rw.write_inputs(tmp / "inputs", {"../evil.sh": "x"}, store)
    check("Path-Traversal abgelehnt", False)
except ValueError:
    check("Path-Traversal abgelehnt", True)

# ── 3. process_events ────────────────────────────────────────────────────────
print("3. process_events")
results = tmp / "results"
results.mkdir()
(results / "frame-0000.bin").write_bytes(b"FRAME0")
(results / "max-depth.bin").write_bytes(b"MAXD")
(results / "network-results.json").write_bytes(b"{}")
lines = [
    json.dumps({"event": "log", "text": "start"}),
    "GARBAGE nicht-json",
    json.dumps({"event": "progress", "time": 60, "mass": {"Verror": 0}}),
    json.dumps({"event": "frame", "frame": 0, "file": "frame-0000.bin",
                "min": 0.0, "max": 1.5, "time": 60}),
    json.dumps({"event": "done", "maxDepthFile": "max-depth.bin",
                "networkResultsFile": "network-results.json",
                "massReport": {"ok": True}}),
]
store3 = FakeStore()
evs = list(rw.process_events(lines, results, store3, "job42"))
check("5 Events", len(evs) == 5, f"{len(evs)}")
check("Nicht-JSON -> log", evs[1] == {"event": "log", "text": "GARBAGE nicht-json"})
fr = evs[3]
check("frame: url gesetzt, file weg",
      fr.get("url") == "fake://job42/frame-0000.bin" and "file" not in fr)
check("frame: Metadaten unveraendert", fr["min"] == 0.0 and fr["max"] == 1.5 and fr["time"] == 60)
dn = evs[4]
check("done: *File -> *Url",
      dn.get("maxDepthUrl") == "fake://job42/max-depth.bin"
      and dn.get("networkResultsUrl") == "fake://job42/network-results.json"
      and "maxDepthFile" not in dn and "networkResultsFile" not in dn)
check("done: Rest unveraendert", dn["massReport"] == {"ok": True})
check("Dateien nach Ablage geloescht",
      not (results / "frame-0000.bin").exists() and not (results / "max-depth.bin").exists())
check("Inhalte korrekt abgelegt",
      store3.stored["frame-0000.bin"] == b"FRAME0" and store3.stored["max-depth.bin"] == b"MAXD")

# ── 4. InlineStore ───────────────────────────────────────────────────────────
print("4. InlineStore")
inline = rw.InlineStore()
p = results / "klein.bin"
p.write_bytes(b"\x01\x02\x03")
url = inline.store_result(p, "j")
check("data:-URL", url.startswith("data:application/octet-stream;base64,"))
check("Roundtrip", base64.b64decode(url.split(",", 1)[1]) == b"\x01\x02\x03")
check("Datei geloescht", not p.exists())
big = results / "gross.bin"
big.write_bytes(b"\x00" * (rw.INLINE_MAX_BYTES + 1))
try:
    inline.store_result(big, "j")
    check("Groessenlimit", False)
except RuntimeError:
    check("Groessenlimit", True)
big.unlink(missing_ok=True)

# ── 5. gzip-Transportkette (R2 ContentEncoding=gzip simuliert) ───────────────
print("5. gzip-Transportkette")
meta = {"frame": 3, "time": 180, "ncols": 4, "nrows": 3, "cellsize": 5.0,
        "xllcorner": 0.0, "yllcorner": 0.0, "min": 0.0, "max": 2.0}
channels = {"depth": [0.0, 0.1, 0.2, 0.3, 0.0, 1.1, 1.2, 1.3, 0.0, 2.1, 2.2, 2.3],
            "elev": [10.0] * 12}
raw = encode_frame(meta, channels)
transported = gzip.decompress(gzip.compress(raw, 4))  # Upload + Browser-Decode
m2, ch2 = decode_frame(transported)
check("bitidentisch", transported == raw)
check("decode_frame meta", m2["frame"] == 3 and m2["ncols"] == 4)
check("decode_frame Kanaele", abs(ch2["depth"][5] - 1.1) < 1e-6 and abs(ch2["elev"][0] - 10.0) < 1e-6)

# ── 6. handler()-Generator mit Stub-handler.py ───────────────────────────────
print("6. handler() end-to-end (Stub)")
stub = tmp / "stub_handler.py"
stub.write_text('''#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
ap = argparse.ArgumentParser()
ap.add_argument("--job"); ap.add_argument("--heartbeat")
a = ap.parse_args()
job = Path(a.job)
assert (job / "inputs/terrain.asc").read_text() == "ncols 2\\nnrows 1", "Input fehlt/falsch"
res = job / "results"; res.mkdir(exist_ok=True)
(res / "frame-0000.bin").write_bytes(b"BINFRAME")
(res / "max-depth.bin").write_bytes(b"MAXDEPTH")
for ev in [{"event": "log", "text": "stub laeuft"},
           {"event": "progress", "time": 30},
           {"event": "frame", "frame": 0, "file": "frame-0000.bin", "min": 0, "max": 1, "time": 30},
           {"event": "done", "maxDepthFile": "max-depth.bin", "massReport": {}}]:
    print(json.dumps(ev), flush=True)
if a.heartbeat == "FAIL":
    print("Traceback: kaboom", file=sys.stderr); sys.exit(3)
''', encoding="utf-8")

job_root = tmp / "jobroot"
env_backup = dict(os.environ)
for k in ("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
          "QUAGG_KEEP_JOBDIR"):
    os.environ.pop(k, None)
os.environ["QUAGG_HANDLER"] = str(stub)
os.environ["QUAGG_JOB_ROOT"] = str(job_root)

tfile = base64.b64encode(gzip.compress(b"ncols 2\nnrows 1")).decode()
job_input = {"files": {"terrain.asc": {"encoding": "gzip+base64", "data": tfile}},
             "maxTime": 60, "deliver": "urls"}
evs = list(rw.handler({"id": "e2e-1", "input": job_input}))
kinds = [e.get("event") for e in evs]
check("Eventfolge", kinds == ["log", "log", "progress", "frame", "done"], f"{kinds}")
fr = next(e for e in evs if e.get("event") == "frame")
check("frame inline-URL dekodiert",
      base64.b64decode(fr["url"].split(",", 1)[1]) == b"BINFRAME")
dn = next(e for e in evs if e.get("event") == "done")
check("done maxDepthUrl inline",
      base64.b64decode(dn["maxDepthUrl"].split(",", 1)[1]) == b"MAXDEPTH")
check("Job-Verzeichnis aufgeraeumt", not (job_root / "e2e-1").exists())

# Fehlerpfad: Stub exit 3 + stderr-Traceback
os.environ["QUAGG_HEARTBEAT"] = "FAIL"
evs, raised = [], False
try:
    for e in rw.handler({"id": "e2e-2", "input": job_input}):
        evs.append(e)
except RuntimeError:
    raised = True
err = next((e for e in evs if e.get("event") == "error"), None)
check("Fehlerpfad: error-Event + Exception",
      raised and err is not None and "Exit-Code 3" in err["text"] and "kaboom" in err["text"],
      f"raised={raised} err={err}")
check("Fehlerpfad: aufgeraeumt", not (job_root / "e2e-2").exists())

os.environ.clear()
os.environ.update(env_backup)
shutil.rmtree(tmp, ignore_errors=True)

print()
if FAILURES:
    print(f"FEHLGESCHLAGEN: {len(FAILURES)} — {FAILURES}")
    sys.exit(1)
print("Alle Tests bestanden.")
