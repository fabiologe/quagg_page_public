"""
Räumliche Felddaten für die 3D-Auswertung (Spez. Stufe 2b, Kap. 9 und 11).

Zwischenformat: ein uniformes Visualisierungsgitter je Lauf. Die Reduktion
gegenüber dem Rechennetz ist die Gitterauflösung — die Rohdaten der Rechnung
bleiben unangetastet (Spez. Kap. 9). Ablage im Laufordner:

    fields/index.json          Gitter, Zeitpunkte, Feldliste, Dateigrößen
    fields/geometry.npz        Gelände-Höhenfeld (ny, nx) auf dem xy-Gitter
    fields/t_<idx>.npz         Felder eines Ausgabezeitpunkts, float32:
                               alpha (nz,ny,nx), U (3,nz,ny,nx), p_rgh …,
                               bed_shear (ny,nx) als Flächengröße

Der Weg vom OpenFOAM-Fall hierher: der Runner schreibt mit foamToVTK ein
VTU je Zeitpunkt, resample_points() bringt die Zellwerte per Binning auf
das uniforme Gitter. Für Tests und Demos erzeugt synthetic_fields.py die
npz-Dateien direkt.

Übertragung an den Browser als ein Binärblock je Zeitpunkt:
    b"F3DV" | uint32 Headerlänge | Header-JSON (utf-8) | Rohdaten (LE float32)
Der Header beschreibt je Feld Offset/Länge/Komponenten im Rohdatenteil.
"""
from __future__ import annotations

import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

MAGIC = b"F3DV"


@dataclass(frozen=True)
class VolumeGrid:
    """Uniformes Gitter; dims = (nx, ny, nz), Reihenfolge der Arrays (nz,ny,nx)."""
    origin: tuple[float, float, float]
    spacing: tuple[float, float, float]
    dims: tuple[int, int, int]

    @property
    def shape_zyx(self) -> tuple[int, int, int]:
        return (self.dims[2], self.dims[1], self.dims[0])

    def cell_count(self) -> int:
        return self.dims[0] * self.dims[1] * self.dims[2]


def fields_dir(run_root: Path) -> Path:
    return run_root / "fields"


# --------------------------------------------------------------------------
# Schreiben (Konverter / Synthetik)
# --------------------------------------------------------------------------

def write_geometry(run_root: Path, grid: VolumeGrid, terrain_z: np.ndarray) -> None:
    d = fields_dir(run_root)
    d.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(d / "geometry.npz",
                        terrain_z=terrain_z.astype(np.float32))


def write_timestep(run_root: Path, idx: int, time: float,
                   fields: dict[str, np.ndarray]) -> Path:
    d = fields_dir(run_root)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"t_{idx:04d}.npz"
    np.savez_compressed(path, __time=np.float64(time),
                        **{k: v.astype(np.float32) for k, v in fields.items()})
    return path


def write_index(run_root: Path, grid: VolumeGrid, times: list[float],
                field_names: list[str]) -> None:
    d = fields_dir(run_root)
    entries = []
    for i, t in enumerate(times):
        f = d / f"t_{i:04d}.npz"
        entries.append({"index": i, "time": t,
                        "size_bytes": f.stat().st_size if f.exists() else 0})
    index = {"grid": asdict(grid), "fields": field_names, "timesteps": entries}
    (d / "index.json").write_text(json.dumps(index, indent=2))


# --------------------------------------------------------------------------
# Lesen (API)
# --------------------------------------------------------------------------

def read_index(run_root: Path) -> dict | None:
    p = fields_dir(run_root) / "index.json"
    return json.loads(p.read_text()) if p.exists() else None


def read_geometry(run_root: Path) -> np.ndarray | None:
    p = fields_dir(run_root) / "geometry.npz"
    if not p.exists():
        return None
    with np.load(p) as z:
        return z["terrain_z"]


def read_timestep(run_root: Path, idx: int) -> tuple[float, dict[str, np.ndarray]]:
    p = fields_dir(run_root) / f"t_{idx:04d}.npz"
    with np.load(p) as z:
        time = float(z["__time"])
        return time, {k: z[k] for k in z.files if k != "__time"}


def nearest_timestep(index: dict, time: float) -> dict:
    return min(index["timesteps"], key=lambda e: abs(e["time"] - time))


# --------------------------------------------------------------------------
# Binärpaket für den Browser
# --------------------------------------------------------------------------

def pack_volume(time: float, grid_meta: dict, fields: dict[str, np.ndarray],
                wanted: list[str] | None = None) -> bytes:
    """
    Ein Zeitpunkt als Binärblock. wanted filtert die Felder (Spez. Kap. 9:
    feldweise abrufbar); None liefert alle.
    """
    payload = bytearray()
    entries = []
    for name, arr in fields.items():
        if wanted and name not in wanted:
            continue
        raw = np.ascontiguousarray(arr, dtype="<f4").tobytes()
        components = arr.shape[0] if arr.ndim == 4 else 1
        entries.append({"name": name, "components": components,
                        "dims": list(arr.shape), "dtype": "f32",
                        "offset": len(payload), "length_bytes": len(raw)})
        payload.extend(raw)

    header = json.dumps({"time": time, "grid": grid_meta,
                         "fields": entries}).encode()
    # Header auf 4 Bytes auffüllen: Magic+Länge sind 8 Bytes, die float32-
    # Arrays dahinter müssen im Browser 4-Byte-aligned liegen (zero-copy).
    header += b" " * (-len(header) % 4)
    return MAGIC + struct.pack("<I", len(header)) + header + bytes(payload)


# --------------------------------------------------------------------------
# Resampling unstrukturiert -> uniform (Andockpunkt für foamToVTK-Ausgaben)
# --------------------------------------------------------------------------

def resample_points(points: np.ndarray, values: np.ndarray,
                    grid: VolumeGrid, fill: float = np.nan) -> np.ndarray:
    """
    Zellmittelwerte per Binning auf das uniforme Gitter. points (n,3),
    values (n,) oder (n,c). Zellen ohne Quellpunkt erhalten fill — für
    alpha ist fill=0.0 (Luft) die richtige Wahl, für Geschwindigkeit NaN.
    O(n), ausreichend für die einstellbare Reduktion; kein KDTree nötig.
    """
    o = np.asarray(grid.origin)
    s = np.asarray(grid.spacing)
    idx = np.floor((points - o) / s).astype(np.int64)
    ok = np.all((idx >= 0) & (idx < np.asarray(grid.dims)), axis=1)
    idx = idx[ok]
    vals = np.atleast_2d(values.T).T[ok]

    flat = (idx[:, 2] * grid.dims[1] + idx[:, 1]) * grid.dims[0] + idx[:, 0]
    n_cells = grid.cell_count()
    counts = np.bincount(flat, minlength=n_cells).astype(np.float64)

    n_comp = vals.shape[1] if vals.ndim > 1 else 1
    out = np.full((n_comp, n_cells), fill, dtype=np.float64)
    filled = counts > 0
    for c in range(n_comp):
        sums = np.bincount(flat, weights=vals[:, c], minlength=n_cells)
        out[c, filled] = sums[filled] / counts[filled]

    shaped = out.reshape((n_comp, *grid.shape_zyx)).astype(np.float32)
    return shaped[0] if n_comp == 1 else shaped
