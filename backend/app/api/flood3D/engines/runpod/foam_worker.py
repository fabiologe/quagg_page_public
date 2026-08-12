#!/usr/bin/env python3
"""
RunPod-Serverless-Worker um den bestehenden local_runner.py.

Dritter Rechenort neben Server und Nutzer-Maschine — und der billigste zu
bauen, weil flood-3D das passende Protokoll schon hat: Der Server packt
einen Fall als ``case.zip`` (Bundle), der Läufer macht daraus
``results/artifacts.zip``, der Server nimmt das Archiv über den
vorhandenen Import wieder auf. Der Companion tut genau das auf Fabios
Rechner; dieser Worker tut es in der Cloud. Der Läufer selbst ist
UNVERÄNDERT derselbe (er kommt sogar aus dem Bundle, s.
local_runner._runner_uebergabe).

    quagg-Backend  ->  RunPod /v2/{endpoint}/run  ->  DIESER Worker
        ->  subprocess: local_runner.py --job <dir>
        ->  NDJSON-Events durchreichen, artifacts.zip nach S3/R2

Input (job["input"]):
    {"case_zip": {"encoding": "s3", "key": "..."}       # Regelfall
                 | {"encoding": "base64", "data": "..."} ,  # kleine Faelle
     "run_id": "fall_r007",        # nur fuer Ablage/Protokoll
     "cores": 16}                  # optional, sonst alle des Workers

Ausgang: die Events des Laeufers 1:1, nur ``done`` traegt statt
``artifactsFile`` eine ``artifactsUrl`` (presigned, S3/R2).

Warum artifacts.zip NICHT zusaetzlich gzip-verpackt wird (anders als die
Frames beim 2D-Worker): ein Zip ist schon komprimiert — ein zweiter Durchlauf
kostet Zeit und Speicher und bringt nichts.

Env:
    S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
    S3_PREFIX             Key-Praefix (default "flood3d")
    S3_URL_EXPIRY         Presign-Gueltigkeit in s (default 86400)
    FLOOD3D_CORES         Kernzahl; ohne Angabe nimmt der Laeufer alle
    QUAGG_RUNNER          Pfad zu local_runner.py (default /opt/quagg/local_runner.py;
                          Tests setzen hier einen Stub)
    QUAGG_JOB_ROOT        Wurzel der Job-Verzeichnisse (default /job)
    QUAGG_KEEP_JOBDIR=1   Job-Verzeichnis nach Lauf behalten (Debug)

Nur stdlib beim Import — boto3/runpod werden lazy geladen, damit die
Unit-Tests das Modul ohne beide Pakete importieren koennen (Muster vom
2D-Worker, engines/docker/runpod_worker.py).
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

# Ein Fall ohne S3 muss durch das /run-Fenster von RunPod passen (10 MB).
# Darueber ist S3/R2 Pflicht — ein Bundle mit Gelaenderaster ist schnell
# groesser.
INLINE_MAX_BYTES = 8 * 1024 * 1024


# ── Ablage ───────────────────────────────────────────────────────────────────
class S3Store:
    """S3-kompatibler Speicher (Cloudflare R2) + presigned GET-URLs."""

    def __init__(self):
        import boto3  # lazy: nur im runpod-Image vorhanden
        from botocore.config import Config

        self.bucket = os.environ["S3_BUCKET"]
        self.prefix = os.environ.get("S3_PREFIX", "flood3d").strip("/")
        self.expiry = int(os.environ.get("S3_URL_EXPIRY", "86400"))
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
                   ("S3_ENDPOINT", "S3_BUCKET",
                    "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"))

    def store_result(self, path: Path, job_id: str) -> str:
        key = f"{self.prefix}/{job_id}/{path.name}"
        # upload_file statt put_object: teilt grosse Archive selbst in
        # Stuecke (ein Lauf mit Feldern sprengt sonst die 5-GB-Grenze
        # eines einzelnen PUT).
        self.client.upload_file(str(path), self.bucket, key,
                                ExtraArgs={"ContentType": "application/zip"})
        url = self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.expiry)
        path.unlink()  # Container-Disk sofort freigeben
        return url

    def get_bytes(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()


class InlineStore:
    """Fallback ohne S3: data:-URL. Nur fuer kleine Testlaeufe."""

    def store_result(self, path: Path, job_id: str) -> str:
        data = path.read_bytes()
        if len(data) > INLINE_MAX_BYTES:
            raise RuntimeError(
                f"{path.name}: {len(data)} Bytes ohne S3-Konfiguration — "
                "S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/"
                "S3_SECRET_ACCESS_KEY setzen.")
        path.unlink()
        return "data:application/zip;base64," + base64.b64encode(data).decode("ascii")

    def get_bytes(self, key: str) -> bytes:
        raise RuntimeError("encoding 's3' im Input, aber kein S3 konfiguriert.")


# ── Eingang ──────────────────────────────────────────────────────────────────
def hole_case_zip(eintrag, store) -> bytes:
    """``{"encoding": "s3", "key": …}`` oder ``{"encoding": "base64", …}``."""
    if not isinstance(eintrag, dict):
        raise ValueError("case_zip fehlt oder ist kein Objekt")
    enc = eintrag.get("encoding", "base64")
    if enc == "s3":
        schluessel = eintrag.get("key")
        if not schluessel:
            raise ValueError("case_zip: encoding 's3' ohne 'key'")
        return store.get_bytes(schluessel)
    if enc == "base64":
        roh = base64.b64decode(eintrag.get("data") or "")
        if len(roh) > INLINE_MAX_BYTES:
            raise ValueError(
                f"case.zip inline mit {len(roh)} Bytes — ueber "
                f"{INLINE_MAX_BYTES} Bytes bitte ueber S3 (encoding 's3').")
        return roh
    raise ValueError(f"case_zip: unbekanntes encoding {enc!r}")


# ── Ereignisstrom ────────────────────────────────────────────────────────────
def process_events(lines, results_dir: Path, store, job_id: str):
    """NDJSON des Laeufers -> Events mit URL statt Datei-Referenz.

    Dieselbe Uebersetzung wie beim 2D-Worker: ``done.artifactsFile`` wird
    hochgeladen und als ``artifactsUrl`` weitergereicht. Nicht-JSON-Zeilen
    (Schrott auf stdout) werden als log-Event verpackt, damit der Strom
    nicht abreisst.
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
        if ev.get("event") == "done":
            for key in [k for k in ev if k.endswith("File")]:
                ev[key[:-4] + "Url"] = store.store_result(
                    results_dir / ev.pop(key), job_id)
        yield ev


# ── RunPod-Handler (Generator) ───────────────────────────────────────────────
def handler(job):
    job_id = str(job.get("id", "local"))
    job_input = job.get("input") or {}
    store = S3Store() if S3Store.configured() else InlineStore()

    workdir = Path(os.environ.get("QUAGG_JOB_ROOT", "/job")) / job_id
    (workdir / "inputs").mkdir(parents=True, exist_ok=True)
    results_dir = workdir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    (workdir / "inputs" / "case.zip").write_bytes(
        hole_case_zip(job_input.get("case_zip"), store))

    umgebung = dict(os.environ)
    kerne = job_input.get("cores")
    if kerne:
        umgebung["FLOOD3D_CORES"] = str(int(kerne))

    yield {"event": "log",
           "text": f"RunPod-Worker: starte OpenFOAM für "
                   f"{job_input.get('run_id') or job_id} (Ablage: "
                   f"{'S3' if isinstance(store, S3Store) else 'inline'})."}

    cmd = [sys.executable, "-u",
           os.environ.get("QUAGG_RUNNER", "/opt/quagg/local_runner.py"),
           "--job", str(workdir)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding="utf-8", errors="replace",
                            env=umgebung)

    # stderr nebenlaeufig puffern (Python-Tracebacks landen dort, nicht im
    # Ereignisstrom — ohne das stuende am Ende nur ein nackter Exit-Code).
    err_tail = []

    def _drain_stderr():
        for line in proc.stderr:
            err_tail.append(line.rstrip())
            del err_tail[:-50]

    t = threading.Thread(target=_drain_stderr, daemon=True)
    t.start()

    try:
        yield from process_events(proc.stdout, results_dir, store, job_id)
        proc.wait()
        t.join(timeout=5)
        if proc.returncode != 0:
            tail = "\n".join(err_tail[-15:])
            yield {"event": "error",
                   "text": f"local_runner.py Exit-Code {proc.returncode}."
                           + (f"\n{tail}" if tail else "")}
            raise RuntimeError(f"local_runner.py Exit-Code {proc.returncode}")
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
