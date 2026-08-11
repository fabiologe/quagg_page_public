#!/usr/bin/env python3
"""
quagg Local Companion — lokaler Solver-Dienst fuer quagg-engineering.org.

Rechnet Flood2D-Laeufe auf DIESEM Rechner (Docker Desktop noetig) statt in der
Cloud. Die Web-App erkennt den laufenden Companion automatisch und bietet
"Lokal (dieser PC)" als Rechenort an. Ergebnisse bleiben lokal auf der Platte.

Voraussetzungen:
    1. Docker Desktop (Windows/macOS) oder Docker Engine (Linux) — LAUFEND.
    2. Python 3.9+ (keine Zusatzpakete, nur Standardbibliothek).

Start:
    python quagg_local_companion.py
    # dann im Browser quagg-engineering.org -> Flood2D -> Solver "RUNPOD Remote"
    # -> Rechenort "Lokal (dieser PC)"

Optionen (Umgebungsvariablen):
    QUAGG_COMPANION_PORT   Port (default 8642)
    QUAGG_COMPANION_IMAGE  Solver-Image (default fabiologe/lisflood_acc_modi:local)
    QUAGG_COMPANION_DATA   Datenordner (default: OS-ueblicher Nutzer-Datenordner)
    QUAGG_COMPANION_KEEP   aufbewahrte Laeufe (default 10; aeltere werden geloescht)
    QUAGG_MIN_FREE_GB      Mindest-Speicherplatz vor Laufstart (default 2)

Protokoll: identisch zum quagg-Backend (/v2/{id}/run|status|stream|cancel,
/files/{job}/{datei}, /health) — die Web-App nutzt denselben Transport wie
fuer die Cloud, nur mit http://127.0.0.1:{port} als Basis.

ARCHITEKTUR-HINWEIS: Eine Web-Seite kann nicht selbst "docker info" ausfuehren
oder Container starten — genau dafuer existiert dieser Dienst: er ist die
Bruecke zwischen Browser (HTTP auf localhost) und der lokalen Docker-Engine.
"""
import base64
import gzip
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.5.1"
PORT = int(os.environ.get("QUAGG_COMPANION_PORT", "8642"))
IMAGE = os.environ.get("QUAGG_COMPANION_IMAGE", "fabiologe/quagg-lisflood:local")
# Zweites Engine-Image: flood3D/OpenFOAM (Fall kommt fertig gebaut vom Server)
FOAM_IMAGE = os.environ.get("QUAGG_COMPANION_FOAM_IMAGE",
                            "fabiologe/quagg-foam-local:latest")
ENGINES = ("lisflood", "openfoam")
KEEP_RUNS = int(os.environ.get("QUAGG_COMPANION_KEEP", "10"))
MIN_FREE_BYTES = float(os.environ.get("QUAGG_MIN_FREE_GB", "2")) * 1024 ** 3

# Sibling-Modus (Companion läuft SELBST im Container, Windows-freundlich:
# kein Python auf dem Host nötig, nur Docker Desktop): der Solver-Container
# wird über den gemounteten Docker-Socket als Geschwister gestartet. Dessen
# -v-Pfade interpretiert der HOST-Daemon — Container-Pfade des Companions
# wären dort bedeutungslos. Deshalb teilen sich beide ein benanntes Volume
# (QUAGG_SIBLING_VOLUME, im Companion unter /data gemountet) und der Solver
# bekommt --job /data/runs/<id> statt eines /job-Bind-Mounts.
SIBLING_VOLUME = os.environ.get("QUAGG_SIBLING_VOLUME", "")
# OpenFOAM-Laeufe sind eine andere Groessenordnung als LISFLOOD (Netz plus
# Zeitschritte gehen leicht in die GB) und werden deshalb GETRENNT abgelegt:
# eigenes Volume, eigener Ordner, eigene Aufraeumlogik. Ohne gesetztes
# Volume faellt der OpenFOAM-Weg auf das Flood2D-Volume zurueck.
SIBLING_VOLUME_OPENFOAM = os.environ.get("QUAGG_SIBLING_VOLUME_OPENFOAM", "")

# Browser-Zugriff nur von der quagg-Seite (und lokaler Entwicklung) aus.
ALLOWED_ORIGINS = {
    "https://quagg-engineering.org", "https://www.quagg-engineering.org",
    "http://localhost:3000", "http://localhost:3001",
    "http://127.0.0.1:3000", "http://127.0.0.1:3001",
}
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def default_data_dir() -> Path:
    """OS-ueblicher Nutzer-Datenordner (Phase-2-Spec: pro Betriebssystem)."""
    override = os.environ.get("QUAGG_COMPANION_DATA")
    if override:
        return Path(override)
    home = Path.home()
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", home / "AppData/Local"))
        return base / "quagg" / "flood2d"
    if system == "Darwin":
        return home / "Library" / "Application Support" / "quagg" / "flood2d"
    return home / ".local" / "share" / "quagg" / "flood2d"


DATA_DIR = default_data_dir()
RUNS_DIR = DATA_DIR / "runs"

# Zweiter Datenort fuer OpenFOAM. Im Container zeigt QUAGG_COMPANION_DATA_3D
# auf den Mountpunkt des eigenen Volumes; nativ liegt der Ordner neben dem
# Flood2D-Ordner (…/quagg/flood3d). Bestehende Flood2D-Laeufe bleiben, wo
# sie sind — an ihrem Pfad aendert sich nichts.
def default_data_dir_3d() -> Path:
    override = os.environ.get("QUAGG_COMPANION_DATA_3D")
    if override:
        return Path(override)
    return DATA_DIR.parent / "flood3d"


DATA_DIR_3D = default_data_dir_3d()
RUNS_DIR_3D = DATA_DIR_3D / "runs"

# Engine -> (Datenordner, Laufordner, Sibling-Volume)
def engine_paths(engine: str) -> tuple[Path, Path, str]:
    if engine.startswith("openfoam"):
        return (DATA_DIR_3D, RUNS_DIR_3D,
                SIBLING_VOLUME_OPENFOAM or SIBLING_VOLUME)
    return DATA_DIR, RUNS_DIR, SIBLING_VOLUME


def all_runs_dirs() -> list[tuple[str, Path]]:
    """Beide Laufordner; Reihenfolge = Suchreihenfolge fuer Dateien."""
    out = [("lisflood", RUNS_DIR)]
    if RUNS_DIR_3D != RUNS_DIR:
        out.append(("openfoam", RUNS_DIR_3D))
    return out


def log(msg: str) -> None:
    print(f"[companion] {msg}", flush=True)


# ── Docker-Erkennung ─────────────────────────────────────────────────────────
def docker_info() -> dict:
    """docker version — laeuft die Engine? (Phase-2-Spec: Docker-Erkennung)."""
    try:
        out = subprocess.run(
            ["docker", "version", "--format", "{{.Server.Version}}"],
            capture_output=True, text=True, timeout=8)
        if out.returncode == 0 and out.stdout.strip():
            return {"available": True, "version": out.stdout.strip()}
        return {"available": False,
                "error": (out.stderr.strip() or "Docker-Daemon antwortet nicht")[:200]}
    except FileNotFoundError:
        return {"available": False, "error": "docker-Kommando nicht gefunden — Docker Desktop installiert?"}
    except subprocess.TimeoutExpired:
        return {"available": False, "error": "docker version haengt — Docker Desktop gestartet?"}


def image_present(image: str) -> bool:
    try:
        return subprocess.run(["docker", "image", "inspect", image],
                              capture_output=True, timeout=10).returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ── Job-Verwaltung (ein Lauf gleichzeitig — lokaler Rechner) ─────────────────
class Job:
    def __init__(self, job_id: str, files: dict, engine: str = "lisflood",
                 resume: bool = False):
        self.id = job_id
        self.engine = engine
        self.resume = resume
        self.status = "IN_QUEUE"
        self.paused = False
        self.error = None
        self.created = time.time()
        self.data_dir, runs_dir, self.sibling_volume = engine_paths(engine)
        self.dir = runs_dir / job_id
        self.events = []
        self.manifest_events = []
        self.lock = threading.Lock()
        self.container = f"quagg-local-{job_id}"
        if resume:
            # Vorhandenen Ordner weiterverwenden: Netz und bereits
            # gerechnete Zeitschritte bleiben liegen, die Eingaben stehen
            # schon drin. NICHT neu schreiben, sonst ist der Fortschritt weg.
            (self.dir / "results").mkdir(parents=True, exist_ok=True)
        else:
            self._write_inputs(files)

    def _write_inputs(self, files: dict) -> None:
        inputs = self.dir / "inputs"
        inputs.mkdir(parents=True, exist_ok=True)
        (self.dir / "results").mkdir(exist_ok=True)
        for name, entry in files.items():
            if not SAFE_NAME.match(name):
                raise ValueError(f"Unsicherer Dateiname: {name!r}")
            if isinstance(entry, str):
                (inputs / name).write_text(entry, encoding="utf-8")
            elif entry.get("encoding") == "gzip+base64":
                text = gzip.decompress(base64.b64decode(entry["data"])).decode("utf-8")
                (inputs / name).write_text(text, encoding="utf-8")
            elif entry.get("encoding") == "base64":
                # binär (z. B. flood3D case.zip)
                (inputs / name).write_bytes(base64.b64decode(entry["data"]))
            else:
                (inputs / name).write_text(entry.get("data", ""), encoding="utf-8")

    def emit(self, ev: dict) -> None:
        with self.lock:
            self.events.append(ev)
        # Ergebnis-relevante Events zusätzlich ins Lauf-Manifest schreiben —
        # damit der 3D-Ergebnis-Viewer den Lauf auch NACH Browser-Reload oder
        # Companion-Neustart von der Platte laden kann (GET /runs/{id}/manifest).
        if ev.get("event") in ("frame", "done", "warning"):
            self.manifest_events.append(ev)
            self.save_manifest()

    def save_manifest(self) -> None:
        data = {"id": self.id, "created": self.created, "status": self.status,
                "error": self.error, "events": self.manifest_events}
        tmp = self.dir / "manifest.json.tmp"
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(self.dir / "manifest.json")  # atomar — halbes JSON gibt es nie

    def drain(self) -> list:
        with self.lock:
            evs, self.events = self.events, []
            return evs


JOBS: dict = {}
JOBS_LOCK = threading.Lock()


def prune_old_runs(runs_dir: Path | None = None) -> None:
    """
    Aufraeumlogik: je Laufordner nur die letzten KEEP_RUNS behalten.
    Getrennte Ordner heisst getrennte Kontingente — ein Schwung
    OpenFOAM-Laeufe raeumt also keine Flood2D-Ergebnisse weg.
    """
    if runs_dir is None:
        for _engine, d in all_runs_dirs():
            prune_old_runs(d)
        return
    if not runs_dir.exists():
        return
    dirs = sorted((d for d in runs_dir.iterdir() if d.is_dir()),
                  key=lambda d: d.stat().st_mtime, reverse=True)
    for old in dirs[KEEP_RUNS:]:
        with JOBS_LOCK:
            active = any(j.status in ("IN_QUEUE", "IN_PROGRESS") and j.dir == old
                         for j in JOBS.values())
        if active:
            continue
        shutil.rmtree(old, ignore_errors=True)
        log(f"alter Lauf geloescht: {old.name}")


def run_job(job: Job) -> None:
    """Solver-Container fahren, NDJSON-Events uebersetzen (wie docker_engine.py)."""
    try:
        image = FOAM_IMAGE if job.engine == "openfoam" else IMAGE
        if not image_present(image):
            job.emit({"event": "log", "text": f"Lade Solver-Image {image} (einmalig) ..."})
            pull = subprocess.run(["docker", "pull", image], capture_output=True, text=True,
                                  timeout=3600)
            if pull.returncode != 0:
                raise RuntimeError(f"docker pull fehlgeschlagen: {pull.stderr[-300:]}")
            job.emit({"event": "log", "text": "Image geladen."})

        job.status = "IN_PROGRESS"
        engine_name = ("OpenFOAM" if job.engine == "openfoam"
                       else "LISFLOOD-FP")
        job.emit({"event": "log",
                  "text": f"Companion: starte {engine_name} lokal ({image}), "
                          f"Ergebnisse unter {job.dir}"})
        if job.sibling_volume:
            # Sibling-Modus: gemeinsames Volume statt Bind-Mount (s. Kopfkommentar).
            # Je Engine ein eigenes Volume -> OpenFOAM-Daten liegen getrennt.
            mount = ["-v", f"{job.sibling_volume}:/data"]
            job_arg = f"/data/runs/{job.id}"
        else:
            mount = ["-v", f"{job.dir}:/job"]
            job_arg = "/job"
        # LISFLOOD kennt --heartbeat, der Foam-Runner nicht
        args = (["--job", job_arg] if job.engine.startswith("openfoam")
                else ["--job", job_arg, "--heartbeat", "2"])
        if job.engine.startswith("openfoam") and job.resume:
            args.append("--resume")
        # Kernzahl-Vorgabe an den Container durchreichen: der Runner
        # kennt FLOOD3D_CORES (Altname QUAGG_FOAM_CORES), `docker run`
        # vererbt die Umgebung des Daemons aber NICHT — die dokumentierte
        # Einstellmöglichkeit war lokal deshalb wirkungslos.
        umgebung = []
        for name in ("FLOOD3D_CORES", "QUAGG_FOAM_CORES"):
            wert = os.environ.get(name, "").strip()
            if wert:
                umgebung += ["-e", f"{name}={wert}"]
        proc = subprocess.Popen(
            ["docker", "run", "--rm", "--name", job.container,
             *umgebung, *mount, image, *args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace")
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                job.emit({"event": "log", "text": line})
                continue
            # Datei-Referenzen -> Companion-URLs (Client loest sie gegen
            # http://127.0.0.1:PORT auf; Muster wie docker_engine._consume).
            if ev.get("event") == "frame" and "file" in ev:
                ev["url"] = f"/files/{job.id}/{ev.pop('file')}"
            if ev.get("event") == "done":
                for key in [k for k in ev if k.endswith("File")]:
                    ev[key[:-4] + "Url"] = f"/files/{job.id}/{ev.pop(key)}"
            job.emit(ev)
        proc.wait()
        err_tail = proc.stderr.read()[-400:] if proc.stderr else ""
        if job.status == "CANCELLED":
            return
        if proc.returncode != 0:
            raise RuntimeError(f"Solver-Exit {proc.returncode}: {err_tail}")
        job.status = "COMPLETED"
    except Exception as e:  # noqa: BLE001 — Fehler gehoert in den Job-Status
        job.status = "FAILED"
        job.error = f"{type(e).__name__}: {str(e)[:300]}"
        job.emit({"event": "log", "text": f"COMPANION-FEHLER: {job.error}"})
    finally:
        job.save_manifest()  # finaler Status (COMPLETED/FAILED/CANCELLED) auf Platte
        prune_old_runs()


# ── HTTP-Server ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # -- Hilfen ---------------------------------------------------------------
    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Max-Age", "3600")

    def _json(self, obj, code=200) -> None:
        data = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):  # CORS-Preflight (POST mit JSON-Body loest ihn aus)
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, fmt, *args):  # eigenes, ruhigeres Log
        pass

    # -- Routen ---------------------------------------------------------------
    def do_GET(self):
        parts = [p for p in self.path.split("?")[0].split("/") if p]
        if self.path == "/health" or self.path == "/":
            du = shutil.disk_usage(str(DATA_DIR if DATA_DIR.exists() else Path.home()))
            # Fuer den Nutzer verstaendliche Ortsangabe: im Docker-Modus ist
            # "/data" bedeutungslos — dort liegt alles im benannten Volume.
            def describe(vol: str, folder: Path) -> str:
                if vol:
                    return (f"Docker-Volume '{vol}' (Docker Desktop → Volumes; "
                            "Laeufe hier in der App laden/exportieren)")
                return str(folder)

            location = describe(SIBLING_VOLUME, DATA_DIR)
            # Belegung je Datenort — OpenFOAM-Laeufe sind gross genug, dass
            # der Nutzer sie getrennt sehen und aufraeumen koennen muss.
            storage = []
            for engine, runs_dir in all_runs_dirs():
                folder = DATA_DIR_3D if engine == "openfoam" else DATA_DIR
                vol = (SIBLING_VOLUME_OPENFOAM or SIBLING_VOLUME) \
                    if engine == "openfoam" else SIBLING_VOLUME
                used = 0
                count = 0
                if runs_dir.exists():
                    for d in runs_dir.iterdir():
                        if not d.is_dir():
                            continue
                        count += 1
                        used += sum(f.stat().st_size
                                    for f in d.rglob("*") if f.is_file())
                storage.append({"engine": engine, "volume": vol,
                                "dataDir": str(folder),
                                "location": describe(vol, folder),
                                "runs": count, "usedBytes": used})
            return self._json({
                "status": "ok", "service": "quagg-local-companion", "version": VERSION,
                "docker": docker_info(),
                "image": {"name": IMAGE, "present": image_present(IMAGE)},
                "foamImage": {"name": FOAM_IMAGE, "present": image_present(FOAM_IMAGE)},
                "engines": list(ENGINES),
                "disk": {"freeBytes": du.free, "totalBytes": du.total,
                         "dataDir": str(DATA_DIR), "location": location,
                         "minFreeBytes": int(MIN_FREE_BYTES)},
                "storage": storage,
                "runs": {"kept": KEEP_RUNS,
                         "count": sum(1 for d in RUNS_DIR.iterdir() if d.is_dir())
                                  if RUNS_DIR.exists() else 0},
            })
        if len(parts) == 4 and parts[0] == "v2" and parts[2] == "status":
            job = JOBS.get(parts[3])
            if not job:
                return self._json({"error": "Job unbekannt"}, 404)
            return self._json({"id": job.id, "status": job.status, "error": job.error})
        if len(parts) == 4 and parts[0] == "v2" and parts[2] == "stream":
            job = JOBS.get(parts[3])
            if not job:
                return self._json({"error": "Job unbekannt"}, 404)
            return self._json({"status": job.status,
                               "stream": [{"output": e} for e in job.drain()]})
        if len(parts) == 3 and parts[0] == "files":
            # Bewusst OHNE JOBS-Lookup: Ergebnisse liegen auf der Platte und
            # muessen auch nach Companion-Neustart ladbar sein (Viewer-Reload).
            if not SAFE_NAME.match(parts[1]) or not SAFE_NAME.match(parts[2]):
                return self._json({"error": "unbekannt"}, 404)
            path = next((d / parts[1] / "results" / parts[2]
                         for _e, d in all_runs_dirs()
                         if (d / parts[1] / "results" / parts[2]).is_file()),
                        RUNS_DIR / parts[1] / "results" / parts[2])
            if not path.is_file():
                return self._json({"error": f"{parts[2]} (noch) nicht vorhanden"}, 404)
            data = path.read_bytes()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if parts == ["runs"]:
            # Fruehere Laeufe auf diesem PC — Grundlage fuer "im Viewer laden".
            runs = []
            for engine, runs_dir in all_runs_dirs():
                if not runs_dir.exists():
                    continue
                for d in runs_dir.iterdir():
                    if not d.is_dir():
                        continue
                    mf = d / "manifest.json"
                    entry = {"id": d.name, "engine": engine,
                             "mtime": d.stat().st_mtime,
                             "sizeBytes": sum(f.stat().st_size
                                              for f in d.rglob("*") if f.is_file())}
                    if mf.exists():
                        try:
                            m = json.loads(mf.read_text(encoding="utf-8"))
                            entry["status"] = m.get("status")
                            entry["frames"] = sum(1 for e in m.get("events", [])
                                                  if e.get("event") == "frame")
                        except (json.JSONDecodeError, OSError):
                            entry["status"] = "UNBEKANNT"
                    else:
                        entry["status"] = "UNBEKANNT"
                    runs.append(entry)
            runs.sort(key=lambda r: r["mtime"], reverse=True)
            return self._json({"runs": runs})
        if len(parts) == 3 and parts[0] == "runs" and parts[2] == "manifest":
            if not SAFE_NAME.match(parts[1]):
                return self._json({"error": "unbekannt"}, 404)
            mf = next((d / parts[1] / "manifest.json" for _e, d in all_runs_dirs()
                       if (d / parts[1] / "manifest.json").is_file()),
                      RUNS_DIR / parts[1] / "manifest.json")
            if not mf.is_file():
                return self._json({"error": "kein Manifest fuer diesen Lauf"}, 404)
            self.send_response(200)
            self._cors()
            data = mf.read_bytes()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json({"error": "unbekannter Pfad"}, 404)

    def do_POST(self):
        parts = [p for p in self.path.split("?")[0].split("/") if p]
        if len(parts) == 3 and parts[0] == "v2" and parts[2] == "run":
            body = self.rfile.read(int(self.headers.get("Content-Length", 0) or 0))
            try:
                payload = json.loads(body or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "ungueltiges JSON"}, 400)
            files = (payload.get("input") or {}).get("files") or {}
            engine = (payload.get("input") or {}).get("engine", "lisflood")
            if engine not in ENGINES:
                return self._json({"error": f"Unbekannte Engine: {engine}"}, 422)
            if not files:
                return self._json({"error": "input.files ist leer"}, 422)

            # Speicherplatzpruefung vor Laufstart (Phase-2-Spec) — im
            # Datenordner DIESER Engine.
            data_dir, _runs, _vol = engine_paths(engine)
            data_dir.mkdir(parents=True, exist_ok=True)
            free = shutil.disk_usage(str(data_dir)).free
            if free < MIN_FREE_BYTES:
                return self._json(
                    {"error": f"Zu wenig Speicherplatz: {free / 1e9:.1f} GB frei, "
                              f"Minimum {MIN_FREE_BYTES / 1e9:.1f} GB "
                              f"(Datenordner: {data_dir})"}, 507)
            d = docker_info()
            if not d["available"]:
                return self._json({"error": f"Docker nicht verfuegbar: {d.get('error')}"}, 503)
            resume_id = (payload.get("input") or {}).get("resume_job")
            if resume_id:
                _d, runs_dir, _v = engine_paths(engine)
                if not SAFE_NAME.match(resume_id) or \
                        not (runs_dir / resume_id / "case").is_dir():
                    return self._json({"error": f"Kein fortsetzbarer Lauf "
                                                f"{resume_id}"}, 404)
            with JOBS_LOCK:
                if any(j.status in ("IN_QUEUE", "IN_PROGRESS") for j in JOBS.values()):
                    return self._json({"error": "Es laeuft bereits ein lokaler Job."}, 409)
                try:
                    job = Job(resume_id or f"local-{uuid.uuid4().hex[:10]}",
                              files, engine, resume=bool(resume_id))
                except ValueError as e:
                    return self._json({"error": str(e)}, 422)
                JOBS[job.id] = job
            threading.Thread(target=run_job, args=(job,), daemon=True).start()
            # Antwort für LISFLOOD bewusst UNVERÄNDERT ("local") — der
            # Flood2D-Runner wertet dieses Feld aus; nur der neue
            # OpenFOAM-Weg bekommt eine eigene Kennung.
            return self._json({"id": job.id, "status": "IN_QUEUE",
                               "engine": "local" if engine == "lisflood"
                               else f"local-{engine}"})
        if len(parts) == 4 and parts[0] == "v2" and parts[2] == "pause":
            # OpenFOAM liest die controlDict bei runTimeModifiable=yes in
            # jedem Zeitschritt neu: stopAt writeNow haelt den Solver an
            # und schreibt vorher den aktuellen Stand. Kein kill -> kein
            # Datenverlust, der Lauf ist danach fortsetzbar.
            job = JOBS.get(parts[3])
            if not job:
                return self._json({"error": "Job unbekannt"}, 404)
            cd = job.dir / "case" / "system" / "controlDict"
            if not cd.is_file():
                return self._json({"error": "Kein laufender OpenFOAM-Fall"}, 409)
            try:
                txt = cd.read_text(errors="replace")
                cd.write_text(re.sub(r"stopAt\s+\w+;", "stopAt          writeNow;", txt))
            except OSError as e:
                return self._json({"error": f"controlDict: {e}"}, 500)
            job.emit({"event": "log", "text": "Pause angefordert — der Solver "
                      "schreibt den aktuellen Zeitschritt und haelt dann an."})
            job.paused = True
            return self._json({"id": job.id, "status": "PAUSING"})
        if len(parts) == 4 and parts[0] == "v2" and parts[2] == "cancel":
            job = JOBS.get(parts[3])
            if not job:
                return self._json({"error": "Job unbekannt"}, 404)
            job.status = "CANCELLED"
            subprocess.run(["docker", "kill", job.container], capture_output=True, timeout=20)
            return self._json({"id": job.id, "status": "CANCELLED"})
        self._json({"error": "unbekannter Pfad"}, 404)


def main() -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR_3D.mkdir(parents=True, exist_ok=True)
    d = docker_info()
    log(f"quagg Local Companion v{VERSION}")
    log(f"Datenordner LISFLOOD : {DATA_DIR}"
        + (f"  (Volume {SIBLING_VOLUME})" if SIBLING_VOLUME else ""))
    log(f"Datenordner OpenFOAM : {DATA_DIR_3D}"
        + (f"  (Volume {SIBLING_VOLUME_OPENFOAM})" if SIBLING_VOLUME_OPENFOAM else ""))
    log(f"Solver-Image: {IMAGE} ({'vorhanden' if image_present(IMAGE) else 'wird beim ersten Lauf geladen'})")
    log(f"Docker      : {'OK, Version ' + d['version'] if d['available'] else 'NICHT VERFUEGBAR — ' + str(d.get('error'))}")
    # Nativ: nur Loopback. Im Container (Dockerfile setzt BIND=0.0.0.0) begrenzt
    # das -p 127.0.0.1:8642:8642 des Nutzers den Zugriff von außen.
    bind = os.environ.get("QUAGG_COMPANION_BIND", "127.0.0.1")
    log(f"Lausche auf http://{bind}:{PORT}  (Strg+C beendet)")
    server = ThreadingHTTPServer((bind, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("beendet.")
        sys.exit(0)


if __name__ == "__main__":
    main()
