#!/usr/bin/env python3
"""
LISFLOOD-FP Heartbeat-Handler — läuft IM Container, spricht JSONL auf stdout.

Protokoll (eine JSON-Zeile pro Event, vom DockerEngine im Backend konsumiert):

    {"event": "log",      "text": ...}
    {"event": "warning",  "text": ...}
    {"event": "progress", "time": <Sim-Sekunden>, "mass": {...}}      ← Heartbeat
    {"event": "frame",    "frame": n, "file": "frame-0000.bin", "min":, "max":, "time":}
    {"event": "done",     "massReport": {...}, "maxDepthFile": "max-depth.bin"}

Heartbeat: der Solver schreibt alle `massint` Sekunden eine Zeile in res.mass
und alle `saveint` Sekunden ein res-XXXX.wd-Raster. Der Handler tailt beides
und macht daraus progress- bzw. frame-Events — massint wird auf --heartbeat
gedrückt, damit die Lebenszeichen dicht genug kommen.

1D-Kopplung (geplant): LISFLOOD-FP unterstützt Checkpointing ('checkpoint' /
'loadstate'). Der Weg für die Kanal-Kopplung: Lauf in Etappen, zwischen den
Etappen schreibt das Backend aktualisierte .bdy-Randbedingungen aus der
1D-Simulation und startet vom Checkpoint weiter. Einstiegspunkt dafür ist
dieser Handler (Etappen-Loop statt Einmal-Lauf) — bewusst noch nicht gebaut.

Läuft mit python3-minimal (nur stdlib).
"""
import argparse
import json
import re
import signal
import subprocess
import sys
import threading
import time
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from codec import encode_frame  # noqa: E402

LISFLOOD_BIN = "/opt/lisflood/lisflood"
NODATA_THRESHOLD = -9000.0
POLL_S = 0.5
LOG_HEAD_LINES = 200   # Solver-stdout: erste N Zeilen komplett...
LOG_EVERY_NTH = 50     # ...danach nur jede N-te (gegen Event-Flut)


def emit(event, **kw):
    print(json.dumps({"event": event, **kw}, ensure_ascii=False), flush=True)


# ── run.par lesen/patchen ───────────────────────────────────────────────────
def read_par(path):
    par = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split(None, 1)
        if parts and not parts[0].startswith("#"):
            par[parts[0]] = parts[1].strip() if len(parts) > 1 else ""
    return par


def patch_par(path, updates):
    """Keys ersetzen oder anhängen — Reihenfolge/Kommentare bleiben erhalten."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    pending = dict(updates)
    out = []
    for line in lines:
        key = line.split(None, 1)[0] if line.split() else ""
        if key in pending:
            out.append(f"{key.ljust(20)} {pending.pop(key)}")
        else:
            out.append(line)
    for key, val in pending.items():
        out.append(f"{key.ljust(20)} {val}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


# ── ASC-Raster (.wd/.max) → Frame-Binär ─────────────────────────────────────
def parse_asc(path):
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    header, data_start = {}, 0
    for i, line in enumerate(lines):
        parts = line.split()
        if len(parts) == 2 and parts[0][0].isalpha():
            header[parts[0].lower()] = float(parts[1])
            data_start = i + 1
        else:
            break
    data = array("f", map(float, " ".join(lines[data_start:]).split()))
    ncols, nrows = int(header.get("ncols", 0)), int(header.get("nrows", 0))
    if ncols * nrows != len(data) or ncols == 0:
        raise ValueError(f"{path.name}: {ncols}×{nrows} ≠ {len(data)} Werte")
    return header, data


def _load_grid(path, kind="depth"):
    """parse_asc + Bereinigung. kind:
         'depth'  Tiefe — NoData & Negativwerte → 0
         'signed' Geschwindigkeit (Vx/Vy) — Vorzeichen behalten, NoData → 0
         'level'  Höhe/Zeit/Hazard (elev/inittm/maxHaz…) — Werte behalten, NoData → 0
       → (header, array, max-Betrag)."""
    header, data = parse_asc(path)
    mx = 0.0
    for i, v in enumerate(data):
        if v <= NODATA_THRESHOLD:
            data[i] = 0.0
            continue
        if kind == "depth" and v < 0.0:
            data[i] = 0.0
            continue
        a = v if v >= 0.0 else -v
        if a > mx:
            mx = a
    return header, data, mx


def _meta(header, **extra):
    return {
        "ncols": int(header["ncols"]), "nrows": int(header["nrows"]),
        "cellsize": header.get("cellsize", 1.0),
        "xllcorner": header.get("xllcorner", 0.0),
        "yllcorner": header.get("yllcorner", 0.0),
        "NODATA_value": -9999, **extra,
    }


def _destagger_x(vx, h, ncols, nrows):
    """Vx liegt auf den x-Zellkanten ((ncols+1)×nrows) → Zellzentrum (ncols×nrows)
    durch Mittelung der beiden x-Kanten je Zelle. Akzeptiert auch bereits
    zentrierte Raster (ncols×nrows) unverändert; sonst None."""
    sc, sr = int(h["ncols"]), int(h["nrows"])
    if sc == ncols and sr == nrows:
        return vx
    if not (sc == ncols + 1 and sr == nrows):
        return None
    out = array("f", bytes(4 * ncols * nrows))
    for r in range(nrows):
        base = r * sc
        for c in range(ncols):
            out[r * ncols + c] = 0.5 * (vx[base + c] + vx[base + c + 1])
    return out


def _destagger_y(vy, h, ncols, nrows):
    """Vy liegt auf den y-Zellkanten (ncols×(nrows+1)) → Zellzentrum."""
    sc, sr = int(h["ncols"]), int(h["nrows"])
    if sc == ncols and sr == nrows:
        return vy
    if not (sc == ncols and sr == nrows + 1):
        return None
    out = array("f", bytes(4 * ncols * nrows))
    for r in range(nrows):
        for c in range(ncols):
            out[r * ncols + c] = 0.5 * (vy[r * ncols + c] + vy[(r + 1) * ncols + c])
    return out


def encode_wd(path, frame_no, sim_time=None, results=None, resroot="res"):
    """res-XXXX.wd → (frame-bytes, min, max). NoData (-9999) → 0 (trocken).
    Hängt — falls vorhanden — die Geschwindigkeits- (.Vx/.Vy → vx/vy, auf
    Zellzentren ent-staggert) und Wasserspiegel-Kanäle (.elev → elev) DESSELBEN
    Frames an, damit Fließpfeile/Geschwindigkeit/Wasserspiegel direkt ankommen."""
    header, depth, dmax = _load_grid(path, "depth")
    ncols, nrows = int(header["ncols"]), int(header["nrows"])
    channels = {"depth": depth}
    if results is not None:
        sib = results / f"{resroot}-{frame_no:04d}.elev"
        if sib.exists():
            try:
                h2, arr, _ = _load_grid(sib, "level")
                if len(arr) == ncols * nrows:
                    channels["elev"] = arr
            except Exception:  # noqa: BLE001
                pass
        vxp = results / f"{resroot}-{frame_no:04d}.Vx"
        vyp = results / f"{resroot}-{frame_no:04d}.Vy"
        vx = vy = None
        if vxp.exists() and vyp.exists():
            try:
                hx, ax, _ = _load_grid(vxp, "signed")
                hy, ay, _ = _load_grid(vyp, "signed")
                vx = _destagger_x(ax, hx, ncols, nrows)
                vy = _destagger_y(ay, hy, ncols, nrows)
            except Exception:  # noqa: BLE001
                vx = vy = None
        if vx is not None and vy is not None:
            channels["vx"], channels["vy"] = vx, vy
    meta = _meta(header, frame=frame_no, min=0.0, max=dmax)
    if sim_time is not None:
        meta["time"] = sim_time
    return encode_frame(meta, channels), 0.0, dmax


def encode_grid_file(path, kind="level", channel="depth"):
    """Einkanal-Endraster (Max-Tiefe/Hazard/Wasserspiegel/Ankunftszeit/Dauer) →
    Frame-Bytes. channel='depth', weil der Client-Decoder die Summenraster aus
    channels.depth liest (resultCodec.js / RunpodBackend)."""
    header, arr, _ = _load_grid(path, kind)
    return encode_frame(_meta(header, frame=-1), {channel: arr})


def encode_velocity_magnitude(vx_path, vy_path, ref_header):
    """maxVx/maxVy (kantenzentriert) → |v|-Raster auf dem Zell-Grid von
    ref_header (= Tiefen-Grid res.max), Einkanal 'depth'."""
    ncols, nrows = int(ref_header["ncols"]), int(ref_header["nrows"])
    hx, ax, _ = _load_grid(vx_path, "signed")
    hy, ay, _ = _load_grid(vy_path, "signed")
    vx = _destagger_x(ax, hx, ncols, nrows)
    vy = _destagger_y(ay, hy, ncols, nrows)
    if vx is None or vy is None:
        raise ValueError("maxVx/maxVy passen nicht zum Tiefen-Grid")
    mag = array("f", bytes(4 * ncols * nrows))
    for i in range(ncols * nrows):
        mag[i] = (vx[i] * vx[i] + vy[i] * vy[i]) ** 0.5
    return encode_frame(_meta(ref_header, frame=-1), {"depth": mag})


# ── res.mass tailen (Heartbeat + Massenbilanz) ──────────────────────────────
MASS_HEADER_RE = re.compile(r"Rain-?\(?Inf\+Evap\)?", re.IGNORECASE)


class MassTail:
    def __init__(self, path):
        self.path = path
        self.pos = 0
        self.headers = None
        self.rows = []

    def poll(self):
        """Neue Zeilen lesen → Liste neuer row-dicts."""
        if not self.path.exists():
            return []
        new = []
        with self.path.open("r", encoding="utf-8", errors="replace") as f:
            f.seek(self.pos)
            chunk = f.read()
            self.pos = f.tell()
        for line in chunk.splitlines():
            parts = line.split()
            if not parts:
                continue
            if self.headers is None and not _is_float(parts[0]):
                self.headers = [MASS_HEADER_RE.sub("Rain-Inf+Evap", h) for h in parts]
                continue
            if self.headers and _is_float(parts[0]):
                row = {h: _to_float(v) for h, v in zip(self.headers, parts)}
                self.rows.append(row)
                new.append(row)
        return new

    def report(self):
        if not self.rows:
            return None
        max_err = max(abs(r.get("Verror", 0.0)) for r in self.rows)
        return {
            "headers": self.headers,
            "rows": self.rows[-500:],   # JSON-Größe kappen
            "summary": self.rows[-1],
            "maxError": max_err,
        }


def _is_float(s):
    try:
        float(s)
        return True
    except ValueError:
        return False


def _to_float(s):
    try:
        return float(s)
    except ValueError:
        return s


# ── Solver-stdout drosselnd weiterleiten ────────────────────────────────────
def pump_stdout(proc, tail_buffer):
    count = 0
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        count += 1
        tail_buffer.append(line)
        del tail_buffer[:-30]
        if count <= LOG_HEAD_LINES or count % LOG_EVERY_NTH == 0:
            emit("log", text=line)


# ── Hauptlauf ───────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="/job", help="Job-Verzeichnis (inputs/ + results/)")
    ap.add_argument("--heartbeat", type=float, default=2.0,
                    help="max. massint in Sim-Sekunden (Progress-Dichte)")
    args = ap.parse_args()

    job = Path(args.job)
    inputs = job / "inputs"
    results = job / "results"
    results.mkdir(parents=True, exist_ok=True)

    par_files = sorted(inputs.glob("*.par"))
    if not par_files:
        emit("log", text="HANDLER-FEHLER: keine .par-Datei in inputs/.")
        sys.exit(2)
    par_path = par_files[0]
    par = read_par(par_path)

    # Outputs in /job/results zwingen + Heartbeat-Dichte sichern + ALLE
    # Ergebnis-Kanäle aktivieren: voutput (.Vx/.Vy/.maxVx/.maxVy) und hazard
    # (.maxVc/.maxHaz) unabhängig davon, was der Client in die .par geschrieben hat.
    updates = {"dirroot": str(results)}
    massint = float(par.get("massint", 0) or 0)
    if massint <= 0 or massint > args.heartbeat:
        updates["massint"] = str(args.heartbeat)
    if "voutput" not in par:
        updates["voutput"] = ""
    if "hazard" not in par:
        updates["hazard"] = ""
    patch_par(par_path, updates)
    par = read_par(par_path)

    resroot = par.get("resroot", "res")
    sim_time = float(par.get("sim_time", 0) or 0)
    emit("log", text=f"LISFLOOD-FP startet: {par_path.name}, sim_time={sim_time:.0f}s, "
                     f"saveint={par.get('saveint', '?')}s, massint={par.get('massint', '?')}s")

    proc = subprocess.Popen(
        [LISFLOOD_BIN, par_path.name],
        cwd=inputs, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, errors="replace", bufsize=1,
    )
    signal.signal(signal.SIGTERM, lambda *_: proc.terminate())

    tail_buffer = []
    pump = threading.Thread(target=pump_stdout, args=(proc, tail_buffer), daemon=True)
    pump.start()

    mass = MassTail(results / f"{resroot}.mass")
    wd_re = re.compile(re.escape(resroot) + r"-(\d{4})\.wd$")
    processed = set()
    last_time = None
    saveint = float(par.get("saveint", 0) or 0)

    def scan_frames(final=False):
        """Fertige .wd-Raster encodieren; unvollständige im nächsten Tick erneut."""
        nonlocal last_time
        for path in sorted(results.iterdir()):
            m = wd_re.match(path.name)
            if not m or path.name in processed:
                continue
            frame_no = int(m.group(1))
            # Race vermeiden: LISFLOOD schreibt je Speicherschritt .wd → .elev →
            # … → .Vx/.Vy. Würden wir die .wd sofort greifen, fehlten vx/vy im
            # Frame (und der Frame gilt dann als 'processed'). Da wir voutput
            # erzwingen, warten wir, bis .Vx/.Vy da sind — außer im final-Pass.
            if not final:
                vxp = results / f"{resroot}-{frame_no:04d}.Vx"
                vyp = results / f"{resroot}-{frame_no:04d}.Vy"
                if not (vxp.exists() and vyp.exists()):
                    continue
            frame_time = frame_no * saveint if saveint > 0 else last_time
            try:
                buf, dmin, dmax = encode_wd(path, frame_no, frame_time, results, resroot)
            except Exception as e:  # noqa: BLE001 — Datei evtl. noch im Schreiben
                if final:
                    emit("warning", text=f"{path.name} nicht lesbar: {e}")
                    processed.add(path.name)
                continue
            out = results / f"frame-{frame_no:04d}.bin"
            out.write_bytes(buf)
            processed.add(path.name)
            emit("frame", frame=frame_no, file=out.name, min=dmin, max=dmax, time=frame_time)

    while proc.poll() is None:
        time.sleep(POLL_S)
        for row in mass.poll():
            last_time = row.get("Time", last_time)
            emit("progress", time=last_time)
        scan_frames()

    pump.join(timeout=5)
    for row in mass.poll():
        last_time = row.get("Time", last_time)
        emit("progress", time=last_time)
    scan_frames(final=True)

    if proc.returncode != 0:
        emit("log", text=f"LISFLOOD-FP Exit-Code {proc.returncode}. Letzte Ausgaben: "
                         + " | ".join(tail_buffer[-10:]))
        sys.exit(proc.returncode)

    # ── Summen-/Max-Raster: Tiefe, Wasserspiegel, Hazard, Ankunftszeit, Dauer,
    #    Max-Geschwindigkeit + Massenbilanz. Jede *File-Referenz wird vom
    #    DockerEngine in eine *Url übersetzt (z.B. maxDepthFile → maxDepthUrl).
    done_payload = {}

    def deliver(src_name, out_name, builder, key):
        src = results / src_name
        if not src.exists():
            return
        try:
            (results / out_name).write_bytes(builder(src))
            done_payload[key] = out_name
        except Exception as e:  # noqa: BLE001
            emit("warning", text=f"{src_name} nicht lesbar: {e}")

    deliver(f"{resroot}.max",     "max-depth.bin",
            lambda p: encode_grid_file(p, "depth"), "maxDepthFile")
    deliver(f"{resroot}.mxe",     "max-elev.bin",
            lambda p: encode_grid_file(p, "level"), "maxElevFile")
    deliver(f"{resroot}.maxHaz",  "max-hazard.bin",
            lambda p: encode_grid_file(p, "level"), "maxHazardFile")
    deliver(f"{resroot}.inittm",  "arrival-time.bin",
            lambda p: encode_grid_file(p, "level"), "arrivalTimeFile")
    deliver(f"{resroot}.totaltm", "duration.bin",
            lambda p: encode_grid_file(p, "level"), "durationFile")

    # Max-Geschwindigkeit = |(.maxVx, .maxVy)| (kantenzentriert → Tiefen-Grid)
    mvx, mvy = results / f"{resroot}.maxVx", results / f"{resroot}.maxVy"
    max_depth_src = results / f"{resroot}.max"
    if mvx.exists() and mvy.exists() and max_depth_src.exists():
        try:
            ref_header, _ = parse_asc(max_depth_src)
            (results / "max-velocity.bin").write_bytes(
                encode_velocity_magnitude(mvx, mvy, ref_header))
            done_payload["maxVelocityFile"] = "max-velocity.bin"
        except Exception as e:  # noqa: BLE001
            emit("warning", text=f"Max-Geschwindigkeit nicht lesbar: {e}")

    report = mass.report()
    if report:
        done_payload["massReport"] = report
    emit("done", **done_payload)


if __name__ == "__main__":
    main()
