#!/usr/bin/env python3
"""
RunPod-Serverless-Worker um den bestehenden handler.py.

Architektur (Engine-Tausch hinter bestehender Schnittstelle):

    Client (RunpodBackend.js)  ->  quagg-Backend (/flood2dpod/v2/...)
        ->  RunPod /v2/{endpoint}/run  ->  DIESER Worker (Container-Stage 'runpod')
        ->  subprocess: /opt/lisflood/handler.py --job <dir>   (unveraendert!)
        ->  NDJSON-Events durchreichen, Binaer-Ergebnisse nach S3/R2

Input (job["input"]) ist EXAKT das JobInput des quagg-Backends (schemas.py):
    {"files": {name: "text" | {"encoding": "text|gzip+base64|s3", "data"|"key": ...}},
     "maxTime": 3600, "deliver": "urls", "clientJobToken": ...}

Event-Umschreibung (Vertrag mit RunpodBackend.js, identisch zu docker_engine.py):
    {"event":"frame", "file":"frame-0000.bin", ...} -> {"event":"frame", "url":..., ...}
    {"event":"done",  "maxDepthFile":..., ...}      -> {"event":"done", "maxDepthUrl":..., ...}

Ergebnis-Ablage:
    - S3/R2 konfiguriert (S3_ENDPOINT+S3_BUCKET+Keys): Datei wird GZIP-komprimiert
      hochgeladen mit ContentEncoding=gzip -> der Browser-fetch() dekomprimiert
      transparent, decodeFrame() im Client bleibt unveraendert. Lokale Datei wird
      sofort geloescht (Container-Disk bleibt klein, s. Plan 2026-07-29).
    - Kein S3 (lokaler Test / --test_input): kleine Dateien als data:-URL inline
      (fetch() im Browser und in Tests kann data:-URLs laden).

Env:
    S3_ENDPOINT           z.B. https://<account>.r2.cloudflarestorage.com
    S3_BUCKET             Bucket-Name
    S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY   (R2-API-Token)
    S3_PREFIX             Key-Praefix (default "jobs")
    S3_URL_EXPIRY         Presign-Gueltigkeit in s (default 86400)
    QUAGG_GZIP_LEVEL      gzip-Stufe fuer Uploads (default 4; Frames sind nullenreich)
    QUAGG_HEARTBEAT       --heartbeat fuer handler.py (default 2, wie docker_engine)
    QUAGG_HANDLER         Pfad zu handler.py (default /opt/lisflood/handler.py;
                          Tests setzen hier einen Stub)
    QUAGG_JOB_ROOT        Wurzel der Job-Verzeichnisse (default /job)
    QUAGG_KEEP_JOBDIR=1   Job-Verzeichnis nach Lauf behalten (Debug)

Nur stdlib beim Import — boto3/runpod werden lazy geladen, damit die Unit-Tests
(test_runpod_worker.py) das Modul ohne beide Pakete importieren koennen.
"""
import base64
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")  # wie job_manager.py

CONTENT_TYPES = {
    ".bin": "application/octet-stream",
    ".json": "application/json",
    ".rpt": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}

# Oberhalb dieser Groesse wird der Inline-Fallback (data:-URL) verweigert —
# er ist nur fuer kleine Testszenarien gedacht, echte Frames (60+ MB) MUESSEN
# ueber S3/R2 laufen.
INLINE_MAX_BYTES = 8 * 1024 * 1024


# ── Ergebnis-Ablagen ─────────────────────────────────────────────────────────
class S3Store:
    """GZIP-Upload nach S3-kompatiblem Speicher (R2) + presigned GET-URLs."""

    def __init__(self):
        import boto3  # lazy: nur im runpod-Image vorhanden
        from botocore.config import Config

        self.bucket = os.environ["S3_BUCKET"]
        self.prefix = os.environ.get("S3_PREFIX", "jobs").strip("/")
        self.expiry = int(os.environ.get("S3_URL_EXPIRY", "86400"))
        self.level = int(os.environ.get("QUAGG_GZIP_LEVEL", "4"))
        self.client = boto3.client(
            "s3",
            endpoint_url=os.environ["S3_ENDPOINT"],
            aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
            region_name=os.environ.get("S3_REGION", "auto"),
            config=Config(signature_version="s3v4"),
        )

    @staticmethod
    def configured() -> bool:
        return all(os.environ.get(k) for k in
                   ("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"))

    def store_result(self, path: Path, job_id: str) -> str:
        data = path.read_bytes()
        key = f"{self.prefix}/{job_id}/{path.name}"
        # ContentEncoding=gzip: der Browser dekomprimiert beim fetch() selbst,
        # der Client-Codec sieht weiterhin rohe float32-Frames.
        self.client.put_object(
            Bucket=self.bucket, Key=key,
            Body=gzip.compress(data, self.level),
            ContentEncoding="gzip",
            ContentType=CONTENT_TYPES.get(path.suffix, "application/octet-stream"),
        )
        url = self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.expiry)
        path.unlink()  # Container-Disk sofort freigeben
        return url

    def get_text(self, key: str) -> str:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        raw = obj["Body"].read()
        if obj.get("ContentEncoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8")


class InlineStore:
    """Fallback ohne S3: data:-URL. Nur fuer kleine Test-Laeufe."""

    def store_result(self, path: Path, job_id: str) -> str:
        data = path.read_bytes()
        if len(data) > INLINE_MAX_BYTES:
            raise RuntimeError(
                f"{path.name}: {len(data)} Bytes ohne S3-Konfiguration — "
                "S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY setzen.")
        path.unlink()
        return ("data:" + CONTENT_TYPES.get(path.suffix, "application/octet-stream")
                + ";base64," + base64.b64encode(data).decode("ascii"))

    def get_text(self, key: str) -> str:
        raise RuntimeError("encoding 's3' im Input, aber kein S3 konfiguriert.")


# ── Input-Dateien ────────────────────────────────────────────────────────────
def decode_input_entry(entry, store) -> str:
    """'text' | 'gzip+base64' (wie job_manager.decode_input_file) | 's3' (Key)."""
    if isinstance(entry, str):
        return entry
    enc = entry.get("encoding", "text")
    if enc == "gzip+base64":
        return gzip.decompress(base64.b64decode(entry["data"])).decode("utf-8")
    if enc == "s3":
        return store.get_text(entry["key"])
    return entry["data"]


def write_inputs(input_dir: Path, files: dict, store) -> None:
    input_dir.mkdir(parents=True, exist_ok=True)
    for name, entry in files.items():
        if not SAFE_NAME.match(name):
            raise ValueError(f"Unsicherer Dateiname: {name!r}")
        (input_dir / name).write_text(decode_input_entry(entry, store), encoding="utf-8")


# ── Event-Strom ──────────────────────────────────────────────────────────────
def process_events(lines, results_dir: Path, store, job_id: str):
    """NDJSON-Zeilen des handlers -> Events mit URLs statt Datei-Referenzen.

    Exakt die Uebersetzung von docker_engine._consume(): frame.file -> url,
    done.*File -> *Url. Nicht-JSON-Zeilen werden als log-Event verpackt.
    """
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            yield {"event": "log", "text": line}
            continue
        if ev.get("event") == "frame" and "file" in ev:
            ev["url"] = store.store_result(results_dir / ev.pop("file"), job_id)
        if ev.get("event") == "done":
            for key in [k for k in ev if k.endswith("File")]:
                ev[key[:-4] + "Url"] = store.store_result(
                    results_dir / ev.pop(key), job_id)
        yield ev


# ── RunPod-Handler (Generator) ───────────────────────────────────────────────
def handler(job):
    job_id = job.get("id", "local")
    job_input = job.get("input") or {}
    store = S3Store() if S3Store.configured() else InlineStore()

    workdir = Path(os.environ.get("QUAGG_JOB_ROOT", "/job")) / str(job_id)
    results_dir = workdir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    write_inputs(workdir / "inputs", job_input.get("files") or {}, store)

    yield {"event": "log",
           "text": f"RunPod-Worker: starte LISFLOOD-FP (Ablage: "
                   f"{'S3' if isinstance(store, S3Store) else 'inline'})."}

    cmd = [sys.executable, "-u",
           os.environ.get("QUAGG_HANDLER", "/opt/lisflood/handler.py"),
           "--job", str(workdir),
           "--heartbeat", os.environ.get("QUAGG_HEARTBEAT", "2")]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding="utf-8", errors="replace")

    # stderr nebenlaeufig puffern (Python-Tracebacks des handlers landen dort).
    err_tail = []
    def _drain_stderr():
        for line in proc.stderr:
            err_tail.append(line.rstrip())
            del err_tail[:-50]
    t = threading.Thread(target=_drain_stderr, daemon=True)
    t.start()

    try:
        yield from process_events(proc.stdout, results_dir, store, str(job_id))
        proc.wait()
        t.join(timeout=5)
        if proc.returncode != 0:
            tail = "\n".join(err_tail[-15:])
            yield {"event": "error",
                   "text": f"handler.py Exit-Code {proc.returncode}."
                           + (f"\n{tail}" if tail else "")}
            raise RuntimeError(f"handler.py Exit-Code {proc.returncode}")
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        if os.environ.get("QUAGG_KEEP_JOBDIR") != "1":
            shutil.rmtree(workdir, ignore_errors=True)


def main():
    import runpod  # lazy: nur im runpod-Image vorhanden
    runpod.serverless.start({"handler": handler, "return_aggregate_stream": True})


if __name__ == "__main__":
    main()
