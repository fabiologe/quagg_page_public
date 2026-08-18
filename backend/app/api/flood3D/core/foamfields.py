"""
foamfields — OpenFOAM-Ergebnisfelder auf das Visualisierungsgitter
(Spez. Stufe 2b Datenaufbereitung, gefüttert aus Stufe 5).

Kein VTK-Umweg: die Felddateien liegen als ASCII vor (writeFormat ascii im
controlDict), die Zellzentren schreibt `postProcess -func writeCellCentres`
als gewöhnliches Vektorfeld 0/C. Von dort übernimmt resample_points()
(Binning) aus fields.py — dieselbe Codestelle wie für die Synthetik.
"""
from __future__ import annotations

import gzip
import re
from pathlib import Path

import numpy as np

from .fields import (VolumeGrid, resample_points, write_geometry, write_index,
                     write_timestep)
from .terrain import TerrainField

def foam_text(path: str | Path) -> str:
    """
    Feldtext lesen. Bei `writeCompression on` legt OpenFOAM die Dateien
    gzip-komprimiert mit angehängtem .gz ab (also `alpha.water.gz`) —
    beide Formen müssen gelesen werden, auch gemischt in einem Fall.
    """
    p = Path(path)
    if p.is_file():
        return p.read_text(errors="replace")
    gz = Path(f"{p}.gz")
    if gz.is_file():
        with gzip.open(gz, "rt", errors="replace") as f:
            return f.read()
    raise FileNotFoundError(str(p))


def foam_exists(path: str | Path) -> bool:
    p = Path(path)
    return p.is_file() or Path(f"{p}.gz").is_file()


_UNIFORM_RE = re.compile(
    r"internalField\s+uniform\s+(\(([^)]+)\)|[-+0-9.eE]+)\s*;")
_NONUNIFORM_RE = re.compile(
    r"internalField\s+nonuniform\s+List<(scalar|vector)>\s*\n(\d+)\s*\n\(")

# Obergrenze des Visualisierungsgitters je Zeitpunkt.
MAX_VIZ_CELLS = 1_500_000

# Gesamtbudget aller Feldausgaben eines Laufs. Die Artefakte gehen als
# EIN Paket zum Server; ohne Deckel entstehen aus vielen Zeitpunkten mal
# vielen Feldern schnell Gigabyte (gemessen: 1,44 Mio. Zellen x 9
# Komponenten x 61 Zeitpunkte = 3,2 GB). Das Gitter wird deshalb so weit
# vergroebert, dass der GESAMTE Lauf unter dieses Budget passt.
# Budget fuer die Darstellungsfelder EINES Laufs. Der Wert begrenzt nicht
# die Rechnung, sondern nur die Aufloesung, mit der die Felder fuer den
# Viewer auf ein regelmaessiges Gitter umgeschrieben werden — geteilt durch
# die Zahl der Ausgabezeitpunkte. Wer alle 0,2 s schreibt, nimmt dem Raster
# also selbst die Schaerfe weg.
MAX_VIZ_BYTES = 4_000_000_000
_KOMPONENTEN = 9        # alpha, U(3), p_rgh, p, k, omega, nut


def parse_internal_field(path: str | Path, n_cells: int) -> np.ndarray:
    """internalField einer Felddatei als (n,) bzw. (n,3); auch .gz."""
    text = foam_text(path)
    m = _UNIFORM_RE.search(text)
    if m:
        if m.group(2) is not None:
            vec = np.fromstring(m.group(2), sep=" ")
            return np.tile(vec, (n_cells, 1))
        return np.full(n_cells, float(m.group(1)))
    m = _NONUNIFORM_RE.search(text)
    if not m:
        raise ValueError(f"{path}: internalField nicht gefunden")
    kind, count = m.group(1), int(m.group(2))
    start = m.end()
    end = text.index(")", _skip_values_block(text, start, count, kind))
    block = text[start:end].replace("(", " ").replace(")", " ")
    values = np.fromstring(block, sep=" ")
    if kind == "vector":
        values = values.reshape(-1, 3)
    if len(values) != count:
        raise ValueError(f"{path}: {len(values)} statt {count} Werte gelesen")
    return values


def _skip_values_block(text: str, start: int, count: int, kind: str) -> int:
    """Konservative Endsuche: springt hinter die erwartete Werteanzahl."""
    pos = start
    seen = 0
    while seen < count:
        nl = text.find("\n", pos)
        if nl < 0:
            break
        pos = nl + 1
        seen += 1
    return pos


_PATCH_VALUE_RE = re.compile(
    r"value\s+(uniform\s+(\(([^)]+)\)|[-+0-9.eE]+)|"
    r"nonuniform\s+List<(scalar|vector)>\s*\n(\d+)\s*\n\()")


def _gelaende_patches(case_dir: Path) -> list[str]:
    """
    Alle Patches, die zum Gelaende gehoeren — `terrain` und die
    Belag-Patches, die createPatch daraus geschnitten hat.

    Gelesen wird die Patchliste des NETZES, nicht der Fall: nur dort steht,
    was wirklich entstanden ist (ein leerer Belag faellt heraus, und ein
    vollstaendig ueberdecktes `terrain` ist weg).
    """
    grenze = case_dir / "constant" / "polyMesh" / "boundary"
    if not grenze.is_file():
        return ["terrain"]
    try:
        text = grenze.read_text(errors="replace")
    except OSError:
        return ["terrain"]
    namen = re.findall(r"^\s{4}(terrain(?:_belag\d+)?)\s*$", text,
                       flags=re.MULTILINE)
    # Reihenfolge stabil halten und Doppelte raus
    return list(dict.fromkeys(namen)) or ["terrain"]


def _patches_verketten(pfad: Path, patches: list[str]) -> np.ndarray | None:
    """Werte mehrerer Patches hintereinander — in der Reihenfolge von
    `patches`, damit Zentren und Werte zueinander passen."""
    teile = [w for w in (parse_patch_values(pfad, p) for p in patches)
             if w is not None and len(w)]
    if not teile:
        return None
    return np.concatenate(teile, axis=0)


def parse_patch_values(path: str | Path, patch: str) -> np.ndarray | None:
    """
    Randwerte eines Patches aus dem boundaryField einer ASCII-Felddatei —
    z. B. Face-Zentren aus 0/C oder wallShearStress auf dem Gelände.
    """
    text = foam_text(path)
    b = text.find("boundaryField")
    if b < 0:
        return None
    m = re.search(rf"\n\s+{re.escape(patch)}\s*\n\s*\{{", text[b:])
    if not m:
        return None
    start = b + m.end()
    vm = _PATCH_VALUE_RE.search(text, start)
    if not vm:
        return None
    if vm.group(1).startswith("uniform"):
        if vm.group(3) is not None:
            return np.fromstring(vm.group(3), sep=" ")[None, :]
        return np.array([float(vm.group(2))])
    kind, count = vm.group(4), int(vm.group(5))
    vstart = vm.end()
    end = text.index(")", _skip_values_block(text, vstart, count, kind))
    block = text[vstart:end].replace("(", " ").replace(")", " ")
    values = np.fromstring(block, sep=" ")
    if kind == "vector":
        values = values.reshape(-1, 3)
    if len(values) != count:
        raise ValueError(f"{path}/{patch}: {len(values)} statt {count} Werte")
    return values


def _bin2d(x: np.ndarray, y: np.ndarray, values: np.ndarray,
           grid: VolumeGrid) -> np.ndarray:
    """Flächenwerte (z. B. Sohlschubspannung) aufs xy-Gitter mitteln."""
    nx, ny = grid.dims[0], grid.dims[1]
    i = np.floor((x - grid.origin[0]) / grid.spacing[0]).astype(np.int64)
    j = np.floor((y - grid.origin[1]) / grid.spacing[1]).astype(np.int64)
    ok = (i >= 0) & (i < nx) & (j >= 0) & (j < ny)
    flat = j[ok] * nx + i[ok]
    counts = np.bincount(flat, minlength=nx * ny)
    sums = np.bincount(flat, weights=values[ok], minlength=nx * ny)
    out = np.zeros(nx * ny)
    filled = counts > 0
    out[filled] = sums[filled] / counts[filled]
    return out.reshape(ny, nx).astype(np.float32)


def _time_dirs(case_dir: Path) -> list[tuple[float, Path]]:
    out = []
    for d in case_dir.iterdir():
        if not d.is_dir():
            continue
        try:
            t = float(d.name)
        except ValueError:
            continue
        if foam_exists(d / "alpha.water"):
            out.append((t, d))
    return sorted(out)


# Mindestzahl vertikaler Schichten im Visualisierungsgitter. Eine
# Wasseroberflaeche laesst sich aus 5 Schichten nicht zeichnen — genau das
# war der Grund, warum im ersten echten Lauf ausser der Sohlschubspannung
# nichts zu sehen war.
MIN_VIZ_Z_LAYERS = 40


def schaetzdauer(spec) -> float:
    """
    Die Dauer, mit der GESCHAETZT wird (Ausgabebudget, Laufzeit, Kosten).

    Ein Leerlauf bekommt eine grosszuegige `end_time` als blosse Obergrenze
    und endet in Wahrheit viel frueher. Rechnet man das Budget aus dieser
    Obergrenze, wird das Ausgabegitter unnoetig vergroebert — ausgerechnet
    dort, wo die Laubkarten Aufloesung brauchen. Ist eine erwartete Dauer
    angegeben, gilt die; sonst bleibt alles wie bisher.
    """
    a = getattr(spec.solver, "abbruch", None)
    erwartet = getattr(a, "erwartete_dauer_s", None) if a is not None else None
    if erwartet and erwartet > 0:
        return min(float(erwartet), float(spec.solver.end_time))
    return float(spec.solver.end_time)


def viz_grid_for(spec) -> VolumeGrid:
    x0, y0, x1, y1 = spec.domain.extent
    zr = spec.domain.z_max - spec.domain.z_min
    # Zielweite bleibt die BASISZELLE, auch wenn oertlich feiner vernetzt
    # wurde: resample_points mittelt die Solverzellen in die Rasterzellen —
    # ein feineres Raster haette ausserhalb der Verfeinerungsboxen Zellen
    # OHNE Solverzelle darin, die mit 0 gefuellt wuerden. Das riss Loecher
    # in die Wasseroberflaeche statt sie zu schaerfen.
    s = spec.mesh.base_cell
    # in der Hoehe feiner aufloesen als im Grundriss: dort spielt sich die
    # freie Oberflaeche ab, waehrend die Flaeche schnell teuer wird
    sz = min(s, zr / MIN_VIZ_Z_LAYERS) if zr > 0 else s

    # Wie viele Ausgabezeitpunkte werden erwartet? Daraus folgt, wie fein
    # das Gitter sein darf, ohne das Gesamtbudget zu sprengen.
    n_zeit = 1
    if spec.solver.write_interval_fields > 0:
        n_zeit = max(1, int(schaetzdauer(spec)
                            / spec.solver.write_interval_fields) + 1)
    max_zellen = min(MAX_VIZ_CELLS,
                     max(20_000, int(MAX_VIZ_BYTES
                                     / (_KOMPONENTEN * 4 * n_zeit))))

    def dims(sp, spz):
        return (max(1, int(round((x1 - x0) / sp))),
                max(1, int(round((y1 - y0) / sp))),
                max(1, int(round(zr / spz))))

    d = dims(s, sz)
    while d[0] * d[1] * d[2] > max_zellen:
        s *= 1.26           # ~Halbierung der Zellzahl je Schritt
        sz *= 1.26
        d = dims(s, sz)
    return VolumeGrid(origin=(x0, y0, spec.domain.z_min),
                      spacing=(s, s, sz), dims=d)


def convert_case_fields(spec, case_dir: str | Path, run_root: str | Path,
                        ) -> dict:
    """Alle Ausgabezeitpunkte des Falls in die fields/-Ablage des Laufs."""
    case_dir = Path(case_dir)
    run_root = Path(run_root)
    centres_path = case_dir / "0" / "C"
    if not foam_exists(centres_path):
        raise FileNotFoundError(
            "0/C fehlt — vorher `postProcess -func writeCellCentres -time 0`")
    # Anzahl aus der Datei selbst (nonuniform-Header)
    header = _NONUNIFORM_RE.search(foam_text(centres_path))
    n_cells = int(header.group(2))
    centres = parse_internal_field(centres_path, n_cells)

    grid = viz_grid_for(spec)
    times = _time_dirs(case_dir)
    if not times:
        raise FileNotFoundError("Keine Ausgabezeitpunkte mit alpha.water")

    # Alles einsammeln, was interFoam schreibt — fehlende Felder werden
    # unten uebersprungen (laminar hat kein k/omega/nut). fill je Feld:
    # alpha 0.0 (Rasterzelle ohne Solverzelle = Luft/Gelaende), alles
    # andere NaN — eine Fuell-0 waere von einer echt gerechneten 0 nicht
    # unterscheidbar und erzeugte scharfe Nullkanten am Gelaende
    # (Audit P2-6; der Docstring von resample_points forderte das schon).
    nan = float("nan")
    field_specs = [("alpha", "alpha.water", 0.0),
                   ("U", "U", nan),
                   ("p_rgh", "p_rgh", nan),
                   ("p", "p", nan),
                   ("k", "k", nan),
                   ("omega", "omega", nan),
                   ("nut", "nut", nan),
                   # Markierungsstoff der Verweilzeit — als Feld sieht man,
                   # WO das frische Wasser laeuft und welche Ecken es nie
                   # erreicht (totes Volumen)
                   ("T", "T", nan)]
    # Die Sohlschubspannung kommt von den GELAENDE-Patches. Traegt der Fall
    # eine Belagskarte, ist das nicht mehr nur `terrain`: createPatch hat
    # daraus terrain_belag1, terrain_belag2 … gemacht, und deckt die Karte
    # das ganze Gebiet ab, verschwindet `terrain` sogar ganz. Wer nur nach
    # dem einen Namen sucht, bekaeme dann eine LEERE tau-Karte.
    gelaende_patches = _gelaende_patches(case_dir)
    face_centres = _patches_verketten(case_dir / "0" / "C", gelaende_patches)
    written = []
    written_fields: set[str] = set()
    has_shear = False
    for idx, (t, d) in enumerate(times):
        fields = {}
        for name, fname, fill in field_specs:
            f = d / fname
            if not foam_exists(f):
                continue
            vals = parse_internal_field(f, n_cells)
            fields[name] = resample_points(centres, vals, grid, fill=fill)
            written_fields.add(name)
        ws = d / "wallShearStress"
        if foam_exists(ws) and face_centres is not None \
                and face_centres.ndim == 2:
            tau_vec = _patches_verketten(ws, gelaende_patches)
            if tau_vec is not None and tau_vec.ndim == 2 \
                    and len(tau_vec) == len(face_centres):
                tau = np.linalg.norm(tau_vec, axis=1)
                # kinematische Ausgabe (m²/s²) an den Dimensionen erkennen
                dims_m = re.search(r"dimensions\s+\[([^\]]+)\]",
                                   foam_text(ws)[:2000])
                if dims_m and dims_m.group(1).split()[0] == "0":
                    tau = tau * 1000.0          # rho Wasser
                fields["bed_shear"] = _bin2d(face_centres[:, 0],
                                             face_centres[:, 1], tau, grid)
                has_shear = True
        write_timestep(run_root, idx, t, fields)
        written.append(t)

    # Die Geländeschicht ist Beiwerk — sie darf einen fertig gerechneten
    # Lauf nicht vernichten. Fehlt die Rasterdatei (z. B. weil sie beim
    # lokalen Rechnen nicht mitpaketiert wurde), wird der Fehler gemeldet
    # und der Rest trotzdem geschrieben; sonst wäre die gesamte
    # Rechenzeit verloren.
    terrain_error = None
    if spec.terrain is not None:
        try:
            terrain = TerrainField.from_spec(spec.terrain, spec.domain, case_dir)
            nx, ny = grid.dims[0], grid.dims[1]
            xs = grid.origin[0] + (np.arange(nx) + 0.5) * grid.spacing[0]
            ys = grid.origin[1] + (np.arange(ny) + 0.5) * grid.spacing[1]
            xx, yy = np.meshgrid(xs, ys)
            write_geometry(run_root, grid, terrain.sample(xx, yy))
        except Exception as e:                      # noqa: BLE001
            terrain_error = f"{type(e).__name__}: {e}"

    names = sorted(written_fields) + (["bed_shear"] if has_shear else [])
    write_index(run_root, grid, written, names)
    out = {"times": written, "grid_dims": list(grid.dims), "cells": n_cells}
    if terrain_error:
        out["terrain_error"] = terrain_error
    return out


def bed_shear_series(spec, run_root: str | Path, run_id: str) -> list[dict]:
    """
    Zeitreihen der minimalen Sohlschubspannung je Nachweisregion
    (Spez. Kap. 2: Sedimentationsverhalten und Räumbarkeit) — macht das
    min_bed_shear-Target auswertbar. Region = Verfeinerungsbox gleicher ID,
    Minimum über benetzte Zellen (τ > 0) im Grundriss der Box.
    """
    from .conventions import UNITS, Quantity
    from .fields import read_index, read_timestep

    run_root = Path(run_root)
    index = read_index(run_root)
    if index is None or "bed_shear" not in index.get("fields", []):
        return []
    regions = {}
    for t in spec.evaluation.targets:
        if t.kind not in ("min_bed_shear", "max_bed_shear"):
            continue
        box = next((r for r in (spec.mesh.refinements if spec.mesh else [])
                    if r.id == t.region and r.type == "box"), None)
        if box:
            regions[t.region] = box.extent
    if not regions:
        return []

    g = index["grid"]
    nx, ny = g["dims"][0], g["dims"][1]
    xs = g["origin"][0] + (np.arange(nx) + 0.5) * g["spacing"][0]
    ys = g["origin"][1] + (np.arange(ny) + 0.5) * g["spacing"][1]
    xx, yy = np.meshgrid(xs, ys)

    rows = []
    for entry in index["timesteps"]:
        time, fields = read_timestep(run_root, entry["index"])
        tau = fields.get("bed_shear")
        if tau is None:
            continue
        for region, (x0, y0, _, x1, y1, _) in regions.items():
            mask = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (tau > 1e-9)
            if not mask.any():
                continue
            # component "" = Minimum (Räumbarkeit, bestehender Vertrag),
            # component "max" = Maximum (Sohlensicherung, max_bed_shear)
            for comp, val in (("", float(tau[mask].min())),
                              ("max", float(tau[mask].max()))):
                rows.append({
                    "run_id": run_id, "time": float(time),
                    "quantity": Quantity.BED_SHEAR.value, "location_id": region,
                    "component": comp, "value": val,
                    "unit": UNITS[Quantity.BED_SHEAR],
                    "source": "fields/bed_shear",
                })
    return rows


def viz_volume_check(run_root: str | Path, df) -> dict | None:
    """
    Selbsttest (Audit P3-12): Σ α · Rasterzellvolumen aus fields/ gegen die
    volFieldValue-Volumenreihe des Solvers, je Ausgabezeitpunkt. Das
    quantifiziert die Verluste des Visualisierungsgitters (ungewichtetes
    Binning, base_cell-Raster, Teilfuellung am Gelaende) an genau der
    Groesse, die der Betrachter sieht — eine grosse Abweichung heisst: das
    Bild zeigt spuerbar anderes Wasservolumen als gerechnet. Ergebnis geht
    ins Manifest; None, wenn Felder oder Volumenreihe fehlen.
    """
    from .conventions import Quantity
    from .fields import read_index, read_timestep
    run_root = Path(run_root)
    index = read_index(run_root)
    if not index or not index.get("timesteps"):
        return None
    sub = df[(df["quantity"] == Quantity.VOLUME.value)
             & (df["location_id"] == "domain")]
    if sub.empty:
        return None
    t_ref = sub["time"].to_numpy(float)
    v_ref = sub["value"].to_numpy(float)
    sx, sy, sz = index["grid"]["spacing"]
    zellvol = sx * sy * sz
    rel = []
    for entry in index["timesteps"]:
        try:
            time, fields = read_timestep(run_root, entry["index"])
        except Exception:
            continue
        alpha = fields.get("alpha")
        if alpha is None:
            continue
        viz = float(np.clip(alpha, 0.0, 1.0).sum()) * zellvol
        soll = float(np.interp(time, t_ref, v_ref))
        if soll > 1e-9:
            rel.append(abs(viz - soll) / soll)
    if not rel:
        return None
    return {"viz_volume_error_rel_max": round(float(max(rel)), 4),
            "viz_volume_error_rel_mean": round(float(np.mean(rel)), 4)}


def energy_head_series(spec, run_root: str | Path, run_id: str) -> list[dict]:
    """
    Energiehöhe je Querschnitt aus den Feldern: E = WSP + v²/2g, v als
    tiefengemitteltes |U| der benetzten Zellen, gemittelt über die
    benetzten Abtastpunkte der Querschnittslinie — macht das
    head_difference-Target auswertbar (örtliche Verlusthöhe).
    """
    from .conventions import UNITS, Quantity
    from .fields import read_index, read_timestep

    run_root = Path(run_root)
    index = read_index(run_root)
    if index is None or "alpha" not in index.get("fields", []):
        return []
    # Von der Target-Kopplung gelöst (Audit U12): die Energiehöhe entsteht
    # für JEDEN Querschnitt — das Diagramm dafür existiert, und vorher gab
    # es die Reihe nur, wenn zufällig ein head_difference-Kriterium
    # angelegt war (Plan-Befund L2).
    sections = list(spec.evaluation.sections)
    if not sections:
        return []

    g = index["grid"]
    nx, ny, nz = g["dims"]
    ox, oy, oz = g["origin"]
    sx, sy, sz = g["spacing"]
    z_cells = oz + (np.arange(nz) + 0.5) * sz

    # Abtastpunkte je Querschnitt -> Zellindizes (einmalig)
    samples = {}
    for sec in sections:
        pl = np.asarray(sec.polyline, dtype=float)
        seg = np.diff(pl, axis=0)
        seg_len = np.linalg.norm(seg, axis=1)
        n_pts = max(8, int(seg_len.sum() / max(sx, 1e-9)))
        stations = np.linspace(0, seg_len.sum(), n_pts)
        cum = np.concatenate([[0], np.cumsum(seg_len)])
        pts = []
        for st in stations:
            k = min(np.searchsorted(cum, st, side="right") - 1, len(seg) - 1)
            f = 0.0 if seg_len[k] == 0 else (st - cum[k]) / seg_len[k]
            pts.append(pl[k] + f * seg[k])
        pts = np.asarray(pts)
        ix = np.clip(((pts[:, 0] - ox) / sx).astype(int), 0, nx - 1)
        iy = np.clip(((pts[:, 1] - oy) / sy).astype(int), 0, ny - 1)
        samples[sec.id] = (ix, iy)

    rows = []
    for entry in index["timesteps"]:
        time, fields = read_timestep(run_root, entry["index"])
        alpha = fields.get("alpha")
        u = fields.get("U")
        if alpha is None or u is None:
            continue
        # Vektorfelder liegen als (3, nz, ny, nx) — Komponenten vorne
        umag = np.linalg.norm(u, axis=0) if u.ndim == 4 else np.abs(u)
        for sec_id, (ix, iy) in samples.items():
            heads = []
            for cx, cy in zip(ix, iy):
                col = alpha[:, cy, cx]
                wet = col > 0.5
                if not wet.any():
                    continue
                wsp = float(z_cells[np.max(np.nonzero(wet))]) + sz / 2
                v = float(umag[:, cy, cx][wet].mean())
                heads.append(wsp + v * v / (2 * 9.81))
            if not heads:
                continue
            rows.append({
                "run_id": run_id, "time": float(time),
                "quantity": Quantity.ENERGY_HEAD.value, "location_id": sec_id,
                "component": "", "value": float(np.mean(heads)),
                "unit": UNITS[Quantity.ENERGY_HEAD],
                "source": "fields/energy_head",
            })
    return rows
