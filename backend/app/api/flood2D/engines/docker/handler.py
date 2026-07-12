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
import struct
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
# Zahlen-Regex für die tolerante Token-Reparatur: LISFLOOD schreibt Fixed-Width; bei
# numerischer Instabilität (sehr große/negative Werte) laufen zwei Felder OHNE Trennzeichen
# zusammen (z.B. '0.0000.000'). Dann zerlegen wir das Token wieder in seine Zahlen, statt
# den ganzen Frame (und in der Folge ganze Spätframes/Max-Raster) zu verwerfen.
_NUM_RE = re.compile(r'-?\d+\.\d+(?:[eE][-+]?\d+)?|-?\d+(?:[eE][-+]?\d+)?|-?\.\d+')


def _floats_tolerant(tokens):
    """float() je Token; nicht-parsbare (zusammengelaufene) Tokens werden per Regex
    re-getrennt, Unreparierbares → NoData(-9999). → (array('f'), anzahl_reparierter_tokens)."""
    out = array("f")
    repaired = 0
    for tok in tokens:
        try:
            out.append(float(tok))
        except (ValueError, OverflowError):
            nums = _NUM_RE.findall(tok)
            if nums:
                for nstr in nums:
                    try:
                        out.append(float(nstr))
                    except (ValueError, OverflowError):
                        out.append(-9999.0)
            else:
                out.append(-9999.0)
            repaired += 1
    return out, repaired


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
    data, repaired = _floats_tolerant(" ".join(lines[data_start:]).split())
    ncols, nrows = int(header.get("ncols", 0)), int(header.get("nrows", 0))
    if ncols * nrows != len(data) or ncols == 0:
        raise ValueError(f"{path.name}: {ncols}×{nrows} ≠ {len(data)} Werte")
    if repaired:
        print(f"[handler] {path.name}: {repaired} korrupte(s) Token (Solver-Format-Überlauf, "
              f"z.B. '0.0000.000') repariert — Frame gerettet.", flush=True)
    return header, data


def _load_grid(path, kind="depth"):
    """parse_asc + Bereinigung. kind:
         'depth'  Tiefe — NoData & Negativwerte → 0
         'signed' Geschwindigkeit (Vx/Vy) — Vorzeichen behalten, NoData → 0
         'edge'   gestaggerte Kanten-Geschwindigkeit/-Fluss (Vx/Vy/Qx/Qy) — NoData
                  (≤ thr) als SENTINEL BEHALTEN, damit der De-Stagger Wände erkennt
                  und die wandtangentiale Geschwindigkeit nicht halbiert (→ kein
                  „gegen 0"-Verblassen der Strömung an Gebäude-/Brennkanten).
         'level'  Höhe/Zeit/Hazard (elev/inittm/maxHaz…) — Werte behalten, NoData → 0
       → (header, array, max-Betrag)."""
    header, data = parse_asc(path)
    mx = 0.0
    for i, v in enumerate(data):
        if v <= NODATA_THRESHOLD:
            if kind != "edge":
                data[i] = 0.0   # 'edge' behält den NoData-Sentinel für den De-Stagger
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


def _mid(a, b):
    """Kantenmittel mit NoData-Bewusstsein: an einer Wand (eine Kante = NoData-Sentinel
    ≤ thr) wird NICHT mit 0 gemittelt (das halbierte die wandtangentiale Geschwindigkeit
    und ließ die Strömung an Gebäude-/Brennkanten optisch gegen 0 gehen), sondern die
    gültige Kante allein genommen. Beide NoData → 0 (Zelle liegt in der Wand)."""
    va = a > NODATA_THRESHOLD
    vb = b > NODATA_THRESHOLD
    if va and vb:
        return 0.5 * (a + b)
    if va:
        return a
    if vb:
        return b
    return 0.0


def _zero_nodata_inplace(arr):
    for i in range(len(arr)):
        if arr[i] <= NODATA_THRESHOLD:
            arr[i] = 0.0
    return arr


def _destagger_x(vx, h, ncols, nrows):
    """Vx liegt auf den x-Zellkanten ((ncols+1)×nrows) → Zellzentrum (ncols×nrows)
    durch (NoData-bewusste) Mittelung der beiden x-Kanten je Zelle. Akzeptiert auch
    bereits zentrierte Raster (ncols×nrows); sonst None."""
    sc, sr = int(h["ncols"]), int(h["nrows"])
    if sc == ncols and sr == nrows:
        return _zero_nodata_inplace(vx)
    if not (sc == ncols + 1 and sr == nrows):
        return None
    out = array("f", bytes(4 * ncols * nrows))
    for r in range(nrows):
        base = r * sc
        for c in range(ncols):
            out[r * ncols + c] = _mid(vx[base + c], vx[base + c + 1])
    return out


def _destagger_y(vy, h, ncols, nrows):
    """Vy liegt auf den y-Zellkanten (ncols×(nrows+1)) → Zellzentrum (NoData-bewusst)."""
    sc, sr = int(h["ncols"]), int(h["nrows"])
    if sc == ncols and sr == nrows:
        return _zero_nodata_inplace(vy)
    if not (sc == ncols and sr == nrows + 1):
        return None
    out = array("f", bytes(4 * ncols * nrows))
    for r in range(nrows):
        for c in range(ncols):
            out[r * ncols + c] = _mid(vy[r * ncols + c], vy[(r + 1) * ncols + c])
    return out


def encode_wd(path, frame_no, sim_time=None, results=None, resroot="res"):
    """res-XXXX.wd → (frame-bytes, min, max). NoData (-9999) → 0 (trocken).
    Hängt — falls vorhanden — die Geschwindigkeits- (.Vx/.Vy → vx/vy, auf
    Zellzentren ent-staggert), Wasserspiegel- (.elev → elev) und Kantenfluss-Kanäle
    (.Qx/.Qy → qx/qy, ebenfalls ent-staggert) DESSELBEN Frames an, damit
    Fließpfeile/Geschwindigkeit/Wasserspiegel/Wehr-Durchfluss direkt ankommen."""
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
                hx, ax, _ = _load_grid(vxp, "edge")
                hy, ay, _ = _load_grid(vyp, "edge")
                vx = _destagger_x(ax, hx, ncols, nrows)
                vy = _destagger_y(ay, hy, ncols, nrows)
            except Exception:  # noqa: BLE001
                vx = vy = None
        if vx is not None and vy is not None:
            channels["vx"], channels["vy"] = vx, vy
            # SGC-KANALGESCHWINDIGKEIT (.SGCVx/.SGCVy gerichtet, .SGCVc Betrag): die ECHTE
            # Durchström-Geschwindigkeit in Gerinne/Brücke. Das normale .Vx/.Vy ist nur die
            # VORLAND-Geschwindigkeit (out-of-bank, = (Q−Qc)/(dx−we)/hflow, sgc.cpp) und
            # springt an Bauwerken abrupt bzw. wird 0. Hier wird der Kanalwert dort
            # eingesetzt, wo ein Gerinne aktiv ist (|v_sgc|>eps) → die visualisierte
            # Strömung (Pfeile/Linien/Heatmap) läuft physikalisch korrekt DURCH die Brücke.
            sxp = results / f"{resroot}-{frame_no:04d}.SGCVx"
            syp = results / f"{resroot}-{frame_no:04d}.SGCVy"
            scp = results / f"{resroot}-{frame_no:04d}.SGCVc"
            if sxp.exists() and syp.exists():
                try:
                    hsx, asx, _ = _load_grid(sxp, "edge")
                    hsy, asy, _ = _load_grid(syp, "edge")
                    sgcvx = _destagger_x(asx, hsx, ncols, nrows)
                    sgcvy = _destagger_y(asy, hsy, ncols, nrows)
                    sgcvc = None
                    if scp.exists():
                        _, sgcvc, _ = _load_grid(scp, "level")
                        if len(sgcvc) != ncols * nrows:
                            sgcvc = None
                    if sgcvx is not None and sgcvy is not None:
                        EPS = 1e-4
                        for k in range(ncols * nrows):
                            mag = sgcvc[k] if sgcvc is not None else (sgcvx[k] * sgcvx[k] + sgcvy[k] * sgcvy[k]) ** 0.5
                            if mag > EPS:           # Gerinne-/Brückenzelle → Kanalwert nehmen
                                vx[k] = sgcvx[k]
                                vy[k] = sgcvy[k]
                        channels["vx"], channels["vy"] = vx, vy
                except Exception:  # noqa: BLE001
                    pass
        # Kantenflüsse .Qx/.Qy (gleiche Staggerung wie .Vx/.Vy) → qx/qy auf
        # Zellzentren. Damit kann der Client den Durchfluss über jedes Wehr durch
        # Aufsummieren der Normalkomponente über die Wehrzellen rekonstruieren.
        qxp = results / f"{resroot}-{frame_no:04d}.Qx"
        qyp = results / f"{resroot}-{frame_no:04d}.Qy"
        qx = qy = None
        if qxp.exists() and qyp.exists():
            try:
                hqx, aqx, _ = _load_grid(qxp, "edge")
                hqy, aqy, _ = _load_grid(qyp, "edge")
                qx = _destagger_x(aqx, hqx, ncols, nrows)
                qy = _destagger_y(aqy, hqy, ncols, nrows)
            except Exception:  # noqa: BLE001
                qx = qy = None
        if qx is not None and qy is not None:
            channels["qx"], channels["qy"] = qx, qy
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
    hx, ax, _ = _load_grid(vx_path, "edge")
    hy, ay, _ = _load_grid(vy_path, "edge")
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


# ── SWMM-Binärausgabe (.out) → 1D-Ergebnis-Serien ───────────────────────────
# Format: EPA-SWMM 5 "binary output file" (output.c) — stabil seit 5.0.
# Aufbau: Header (7×int32) · ID-Namen · Objekt-Properties · Variablen-Codes ·
# Startdatum/Report-Step · pro Periode ein Record · Closing (6×int32 am Ende
# mit Offsets, Periodenzahl, Fehlercode, Magic). Wir lesen die Offsets vom
# Dateiende und springen direkt — kein SWMM-Toolkit nötig (stdlib struct).
SWMM_MAGIC = 516114522
SWMM_NODE_TYPES = ["junction", "outfall", "storage", "divider"]
SWMM_LINK_TYPES = ["conduit", "pump", "orifice", "weir", "outlet"]
# Variablen-Indizes (npolluts hängen hinten dran, stören die Hydraulik-Indizes nicht):
# Node: 0 depth, 1 head, 2 volume, 3 latflow, 4 totalInflow, 5 flooding
# Link: 0 flow, 1 depth, 2 velocity, 3 volume, 4 capacity
# System: 9 inflow, 10 flooding, 11 outflow, 12 storedVolume (MAX_SYS_RESULTS=15)


def read_swmm_out(path, max_values=6_000_000):
    """SWMM-.out → {reportStep, times[s], nodes{id:{…}}, links{id:{…}}, system{…}}.
    Bei sehr großen Läufen werden Perioden per Stride ausgedünnt (max_values kappt
    die Gesamtzahl gelesener Node+Link-Werte); die letzte Periode bleibt immer drin."""
    data = path.read_bytes()
    if len(data) < 100:
        raise ValueError(f"{path.name}: zu kurz ({len(data)} B)")
    pos_ids, pos_props, pos_results, n_periods, err_code, magic2 = \
        struct.unpack_from("<6i", data, len(data) - 24)
    if struct.unpack_from("<i", data, 0)[0] != SWMM_MAGIC or magic2 != SWMM_MAGIC:
        raise ValueError(f"{path.name}: kein SWMM-Binärformat (Magic fehlt)")
    if err_code != 0:
        raise ValueError(f"{path.name}: SWMM meldet Fehlercode {err_code}")
    _version, _flow_units, n_sub, n_node, n_link, _n_pollut = \
        struct.unpack_from("<6i", data, 4)

    off = pos_ids

    def read_ids(count):
        nonlocal off
        ids = []
        for _ in range(count):
            (ln,) = struct.unpack_from("<i", data, off)
            off += 4
            ids.append(data[off:off + ln].decode("utf-8", "replace"))
            off += ln
        return ids

    read_ids(n_sub)
    node_ids = read_ids(n_node)
    link_ids = read_ids(n_link)

    # Objekt-Properties (Anzahl+Codes, dann je Objekt ein Record). ACHTUNG
    # Mischformat (output.c): der Typ-Code ist int32, die Werte float32 —
    # Node = <type:i, invert:f, maxDepth:f>, Link = <type:i, off1:f, off2:f,
    # maxDepth:f, length:f>. Alles als float lesen macht aus Typ 1 (outfall)
    # ein Denormal ≈1.4e-45 → int() = 0 = junction.
    off = pos_props
    (nsp,) = struct.unpack_from("<i", data, off)
    off += 4 + 4 * nsp + 4 * nsp * n_sub                       # Subcatch überspringen
    (nnp,) = struct.unpack_from("<i", data, off)
    off += 4 + 4 * nnp
    node_props = [struct.unpack_from("<i" + "f" * (nnp - 1), data, off + 4 * nnp * j)
                  for j in range(n_node)]                      # (type, invert, maxDepth)
    off += 4 * nnp * n_node
    (nlp,) = struct.unpack_from("<i", data, off)
    off += 4 + 4 * nlp
    link_props = [struct.unpack_from("<i" + "f" * (nlp - 1), data, off + 4 * nlp * j)
                  for j in range(n_link)]                      # (type, off1, off2, maxDepth, length)
    off += 4 * nlp * n_link

    counts = []
    for _ in range(4):  # Subcatch-, Node-, Link-, System-Variablenzahl + Codes
        (n,) = struct.unpack_from("<i", data, off)
        counts.append(n)
        off += 4 + 4 * n
    n_sub_vars, n_node_vars, n_link_vars, n_sys_vars = counts
    (start_date,) = struct.unpack_from("<d", data, off)        # Tage seit 30.12.1899
    off += 8
    (report_step,) = struct.unpack_from("<i", data, off)

    rec = 8 + 4 * (n_sub * n_sub_vars + n_node * n_node_vars
                   + n_link * n_link_vars + n_sys_vars)
    total = n_periods * (n_node * 5 + n_link * 5 + 4)
    stride = max(1, -(-total // max_values))                    # ceil
    periods = list(range(0, n_periods, stride))
    if periods and periods[-1] != n_periods - 1:
        periods.append(n_periods - 1)

    r4 = lambda v: round(v, 4)  # noqa: E731 — JSON-Größe
    nodes = {nid: {"type": SWMM_NODE_TYPES[node_props[j][0]]
                   if 0 <= node_props[j][0] < len(SWMM_NODE_TYPES) else "junction",
                   "invert": r4(node_props[j][1]),
                   "maxDepth": r4(node_props[j][2]),
                   "depth": [], "head": [], "volume": [], "totalInflow": [], "flooding": []}
             for j, nid in enumerate(node_ids)}
    links = {lid: {"type": SWMM_LINK_TYPES[link_props[j][0]]
                   if 0 <= link_props[j][0] < len(SWMM_LINK_TYPES) else "conduit",
                   "maxDepth": r4(link_props[j][3]),
                   "length": r4(link_props[j][4]),
                   "flow": [], "depth": [], "velocity": [], "volume": [], "capacity": []}
             for j, lid in enumerate(link_ids)}
    system = {"inflow": [], "flooding": [], "outflow": [], "storedVolume": []}
    times = []

    node_base = 8 + 4 * n_sub * n_sub_vars
    link_base = node_base + 4 * n_node * n_node_vars
    sys_base = link_base + 4 * n_link * n_link_vars
    NODE_KEYS = ("depth", "head", "volume", None, "totalInflow", "flooding")
    LINK_KEYS = ("flow", "depth", "velocity", "volume", "capacity")
    for p in periods:
        base = pos_results + p * rec
        if base + rec > len(data):
            break
        # Jeder Record beginnt mit dem Zeitstempel (float64, Tage seit 30.12.1899)
        # → Sim-Sekunden relativ zum Report-Start.
        (date,) = struct.unpack_from("<d", data, base)
        times.append(round((date - start_date) * 86400.0))
        for j, nid in enumerate(node_ids):
            vals = struct.unpack_from("<6f", data, base + node_base + 4 * j * n_node_vars)
            d = nodes[nid]
            for k, key in enumerate(NODE_KEYS):
                if key:
                    d[key].append(r4(vals[k]))
        for j, lid in enumerate(link_ids):
            vals = struct.unpack_from("<5f", data, base + link_base + 4 * j * n_link_vars)
            d = links[lid]
            for k, key in enumerate(LINK_KEYS):
                d[key].append(r4(vals[k]))
        if n_sys_vars >= 13:
            sv = struct.unpack_from(f"<{n_sys_vars}f", data, base + sys_base)
            system["inflow"].append(r4(sv[9]))
            system["flooding"].append(r4(sv[10]))
            system["outflow"].append(r4(sv[11]))
            system["storedVolume"].append(r4(sv[12]))
    return {"reportStep": report_step, "stride": stride, "flowUnits": "CMS",
            "times": times, "nodes": nodes, "links": links, "system": system}


# ── [COUPLE]-Loglzeilen → strukturiertes Kopplungsbudget ────────────────────
COUPLE_END_RE = re.compile(
    r"\[COUPLE\] Ende: 1D->2D gesamt ([-\d.]+) m3 \| 2D->1D gesamt ([-\d.]+) m3 "
    r"\| unverrechnete Bilanz-Schuld ([-\d.]+) m3")
COUPLE_NODE_RE = re.compile(
    r"\[COUPLE\]\s+(\S+)\s+(JUNCTION|OUTFALL)\s+Sum 1D->2D ([-\d.]+) m3 \| 2D->1D ([-\d.]+) m3")


def coupling_budget(couple_lines):
    """Finalize-Zeilen aus coupling.cpp → {to2d, to1d, debt, nodes:{id:{to2d,to1d,kind}}}."""
    budget = None
    nodes = {}
    for line in couple_lines:
        m = COUPLE_END_RE.match(line)
        if m:
            budget = {"to2d": float(m.group(1)), "to1d": float(m.group(2)),
                      "debt": float(m.group(3))}
            continue
        m = COUPLE_NODE_RE.match(line)
        if m:
            nodes[m.group(1)] = {"kind": m.group(2).lower(),
                                 "to2d": float(m.group(3)), "to1d": float(m.group(4))}
    if budget is None:
        return None
    budget["nodes"] = nodes
    return budget


# ── Solver-stdout drosselnd weiterleiten ────────────────────────────────────
def pump_stdout(proc, tail_buffer, couple_lines):
    count = 0
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        count += 1
        tail_buffer.append(line)
        del tail_buffer[:-30]
        # [COUPLE]-Zeilen (1D/2D-Massenbilanz, coupling.cpp) IMMER durchreichen —
        # die Drossel würde sonst genau die Bilanz-Diagnose verschlucken. Zusätzlich
        # sammeln für das strukturierte Kopplungsbudget im done-Payload.
        if line.startswith("[COUPLE]"):
            couple_lines.append(line)
            emit("log", text=line)
            # END_TIME-Falle als echte Warnung heben: ab hier rechnet 2D OHNE Netz —
            # das Ergebnis sieht plausibel aus, ist aber ab diesem Zeitpunkt falsch.
            # (Client synct die SWMM-Dauer inzwischen automatisch auf sim_time;
            # das hier fängt alte/fremde network.inp ab.)
            if "SWMM-Simulationsdauer zu Ende" in line:
                emit("warning", text=(
                    "Kanalnetz-Simulation endete VOR der 2D-Simulation ("
                    + line.split("]", 1)[-1].strip().split(":", 1)[0]
                    + ") — ab da lief die 2D-Rechnung ohne 1D-Austausch. "
                    "END_TIME der network.inp prüfen."))
        elif count <= LOG_HEAD_LINES or count % LOG_EVERY_NTH == 0:
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
    # Ergebnis-Kanäle aktivieren: voutput (.Vx/.Vy/.maxVx/.maxVy), hazard
    # (.maxVc/.maxHaz) und qoutput (.Qx/.Qy — Kantenflüsse, Basis für den
    # Wehr-Durchfluss im ErgebnisViewer) — unabhängig davon, was der Client in die
    # .par geschrieben hat.
    updates = {"dirroot": str(results)}
    massint = float(par.get("massint", 0) or 0)
    if massint <= 0 or massint > args.heartbeat:
        updates["massint"] = str(args.heartbeat)
    if "voutput" not in par:
        updates["voutput"] = ""
    if "hazard" not in par:
        updates["hazard"] = ""
    if "qoutput" not in par:
        updates["qoutput"] = ""
    if "SGCvoutput" not in par:
        updates["SGCvoutput"] = ""   # → .SGCVx/.SGCVy/.SGCVc (Kanal-/Brücken-Geschwindigkeit;
                                     # nur wirksam wenn SGC an, sonst vom Solver ignoriert)
    patch_par(par_path, updates)
    par = read_par(par_path)

    resroot = par.get("resroot", "res")
    sim_time = float(par.get("sim_time", 0) or 0)
    # SGC aktiv? → dann gibt es .SGCVx/.SGCVy (Kanalgeschwindigkeit) und der Frame-
    # Race-Guard wartet auch darauf. Ohne SGC entstehen diese Dateien nie → NICHT warten.
    sgc_on = bool(par.get("SGCwidth"))
    emit("log", text=f"LISFLOOD-FP startet: {par_path.name}, sim_time={sim_time:.0f}s, "
                     f"saveint={par.get('saveint', '?')}s, massint={par.get('massint', '?')}s")

    # ── Regen-Vorflug-Diagnose ──────────────────────────────────────────────
    # Häufige Fehlerquelle: `rainfall <file>` steht in der .par, aber die Datei
    # fehlt im Job-Input oder ist leer → der Solver liefert dann Netto-Regen 0.
    # Diese Zeile macht sofort sichtbar, ob & wie viel Regen tatsächlich anliegt
    # (vgl. später die res.mass-Spalte 'Rain-(Inf+Evap)'). Bleibt der Regen trotz
    # gültiger Datei 0, ist meist das Solver-Image veraltet → neu bauen.
    rain_ref = par.get("rainfall", "")
    if rain_ref:
        rain_path = inputs / rain_ref
        if not rain_path.exists():
            emit("log", text=f"⚠️ REGEN: .par referenziert '{rain_ref}', aber Datei fehlt im "
                             f"Input — Solver bricht beim Laden ab.")
        else:
            try:
                lines = [l for l in rain_path.read_text(errors="replace").splitlines()
                         if l.strip() and not l.lstrip().startswith("#")]
                # Format: [Kommentar] / [N Einheit] / N×[Rate_mm_h  Zeit]
                npts = int(lines[1].split()[0]) if len(lines) > 1 else 0
                rows = [ln.split() for ln in lines[2:2 + npts] if len(ln.split()) >= 2]
                peak = max((float(r[0]) for r in rows), default=0.0)
                t_end = max((float(r[1]) for r in rows), default=0.0)
                # grobe Niederschlagshöhe (Trapez über mm/h × s → mm)
                depth_mm = 0.0
                for a, b in zip(rows, rows[1:]):
                    depth_mm += (float(a[0]) + float(b[0])) / 2.0 * (float(b[1]) - float(a[1])) / 3600.0
                tail = float(rows[-1][0]) if rows else 0.0
                emit("log", text=f"🌧️ REGEN aktiv: {rain_ref}, {npts} Stützstellen, "
                                 f"Peak {peak:.1f} mm/h, ~{depth_mm:.1f} mm bis t={t_end:.0f}s, "
                                 f"Endwert {tail:.1f} mm/h"
                                 + ("" if tail == 0 else " (≠0 → hält bis sim_time!)"))
                if t_end + 1 < sim_time and tail != 0:
                    emit("log", text=f"⚠️ REGEN: Reihe endet bei t={t_end:.0f}s mit {tail:.1f} mm/h, "
                                     f"sim_time={sim_time:.0f}s → Dauerregen bis Ende ('Sintflut').")
            except Exception as e:  # Diagnose darf den Lauf nie killen
                emit("log", text=f"🌧️ REGEN: {rain_ref} vorhanden (Vorflug-Parse übersprungen: {e}).")

    proc = subprocess.Popen(
        [LISFLOOD_BIN, par_path.name],
        cwd=inputs, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, errors="replace", bufsize=1,
    )
    signal.signal(signal.SIGTERM, lambda *_: proc.terminate())

    tail_buffer = []
    couple_lines = []
    pump = threading.Thread(target=pump_stdout, args=(proc, tail_buffer, couple_lines),
                            daemon=True)
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
                qxp = results / f"{resroot}-{frame_no:04d}.Qx"
                qyp = results / f"{resroot}-{frame_no:04d}.Qy"
                if not (vxp.exists() and vyp.exists() and qxp.exists() and qyp.exists()):
                    continue
                # Bei SGC zusätzlich auf die Kanalgeschwindigkeit warten, damit der
                # Brücken-/Gerinnewert nicht erst im Folge-Frame ankommt.
                if sgc_on:
                    sxp = results / f"{resroot}-{frame_no:04d}.SGCVx"
                    syp = results / f"{resroot}-{frame_no:04d}.SGCVy"
                    if not (sxp.exists() and syp.exists()):
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
    # Hazard Rating HR = d·(v+1.5) (DEFRA 2006, ALD; util.cpp:211 `Haz = H*(Vc+1.5)`),
    # NICHT d·v. Debris-Faktor DF=0. Einheit m²/s, i.d.R. als Gefahrenklasse gelesen.
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

    # ── 1D-Kanalnetz-Ergebnisse (gekoppelter Lauf): SWMM schreibt <inp>.out
    #    neben die network.inp (coupling.cpp nutzt den absoluten inp-Pfad, cwd=inputs).
    #    Serien für alle Knoten/Haltungen + Systembilanz → network-results.json.
    couplefile = par.get("couplingfile", "")
    if couplefile:
        out_path = None
        cf = inputs / couplefile
        if cf.exists():
            try:
                inp_name = cf.read_text(errors="replace").split()[0]
                cand = inputs / f"{inp_name}.out"
                out_path = cand if cand.exists() else None
            except Exception:  # noqa: BLE001
                out_path = None
        if out_path is None:
            out_path = next(inputs.glob("*.inp.out"), None)
        if out_path is None:
            emit("warning", text="Kopplung aktiv, aber keine SWMM-.out gefunden — "
                                 "keine 1D-Ergebnisse.")
        else:
            try:
                net = read_swmm_out(out_path)
                (results / "network-results.json").write_text(
                    json.dumps(net, ensure_ascii=False), encoding="utf-8")
                done_payload["networkResultsFile"] = "network-results.json"
                emit("log", text=f"1D-Ergebnisse: {len(net['nodes'])} Knoten, "
                                 f"{len(net['links'])} Haltungen, {len(net['times'])} "
                                 f"Zeitschritte (Report-Step {net['reportStep']}s"
                                 + (f", Stride {net['stride']}" if net["stride"] > 1 else "")
                                 + ").")
            except Exception as e:  # noqa: BLE001
                emit("warning", text=f"SWMM-.out nicht lesbar: {e}")
        budget = coupling_budget(couple_lines)
        if budget:
            done_payload["couplingBudget"] = budget

    report = mass.report()
    if report:
        done_payload["massReport"] = report
    emit("done", **done_payload)


if __name__ == "__main__":
    main()
