"""
meshsurface — die tatsächlich vernetzte Oberfläche des Solvers.

surfaceMeshExtract (im Runner nach checkMesh aufgerufen) schreibt ein
Multi-Solid-ASCII-STL mit einem `solid <patchname>`-Block je Patch — das ist
die Geometrie, wie snappyHexMesh sie wirklich gebaut hat, inklusive
Zellfacetten und Verfeinerungsstufen. Hier wird sie je Patch in kompaktes
Binär-STL umgepackt (~6x kleiner), damit der Browser sie als
Solver-Netz-Ansicht rendern kann.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

import numpy as np

_VERTEX_RE = re.compile(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)")


def parse_multi_solid_stl(path: str | Path) -> dict[str, np.ndarray]:
    """ASCII-STL mit mehreren solid-Blöcken -> je Patch Dreiecke (n, 3, 3)."""
    text = Path(path).read_text(errors="replace")
    out: dict[str, np.ndarray] = {}
    for m in re.finditer(r"solid\s+(\S+)(.*?)endsolid", text, re.S):
        name, block = m.group(1), m.group(2)
        coords = np.array(_VERTEX_RE.findall(block), dtype=np.float32)
        if len(coords) < 3:
            continue
        out[name] = coords[: len(coords) // 3 * 3].reshape(-1, 3, 3)
    return out


def to_binary_stl(triangles: np.ndarray) -> bytes:
    """Dreiecke (n, 3, 3) -> Binär-STL (Normalen aus den Dreiecken)."""
    n = len(triangles)
    v1 = triangles[:, 1] - triangles[:, 0]
    v2 = triangles[:, 2] - triangles[:, 0]
    normals = np.cross(v1, v2)
    lens = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = (normals / np.where(lens == 0, 1, lens)).astype("<f4")

    record = np.zeros(n, dtype=np.dtype([
        ("normal", "<f4", 3), ("verts", "<f4", (3, 3)), ("attr", "<u2")]))
    record["normal"] = normals
    record["verts"] = triangles.astype("<f4")
    return b"flood3D solver surface" + b"\0" * 58 + struct.pack("<I", n) \
        + record.tobytes()


def find_mesh_surface(case_dir: str | Path) -> Path | None:
    """Ausgabe von surfaceMeshExtract (Zeit-Suffix _0 o. ä.)."""
    hits = sorted(Path(case_dir).glob("meshSurface*.stl"))
    return hits[0] if hits else None


def mesh_surface_patches(case_dir: str | Path) -> list[dict] | None:
    """[{patch, stl(bytes binär)}] oder None, wenn keine Extraktion vorliegt."""
    src = find_mesh_surface(case_dir)
    if src is None:
        return None
    return [{"patch": name, "stl": to_binary_stl(tris)}
            for name, tris in parse_multi_solid_stl(src).items()]
