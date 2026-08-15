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

import struct
from pathlib import Path

import numpy as np


def parse_multi_solid_stl(path: str | Path) -> dict[str, np.ndarray]:
    """
    ASCII-STL mit mehreren solid-Blöcken -> je Patch Dreiecke (n, 3, 3).

    ZEILENWEISE, nicht am Stück: die Dateien werden bis 96 MB groß
    (Rentrisch_BetaTest06_r004 mit 1,5 Mio vertex-Zeilen). Die alte
    Fassung hielt gleichzeitig den ganzen Text, eine Blockkopie UND die
    1,5 Mio Zahlen-Tripel als Python-Objekte — gemessen 595 MB Spitze für
    ein Ergebnis von 26 MB, im Serverprozess mit 1 GiB Deckel und ohne
    Passwortschutz (GET). Die Zahlen landen jetzt direkt in einem
    kompakten float-Puffer: 4 Byte je Wert statt eines str-Objekts.
    """
    from array import array

    puffer: dict[str, array] = {}
    werte: array | None = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for zeile in f:
            zeile = zeile.strip()
            if zeile.startswith("vertex"):
                if werte is not None:
                    _, x, y, z = zeile.split(maxsplit=3)
                    werte.extend((float(x), float(y), float(z)))
            elif zeile.startswith("solid"):
                teile = zeile.split(maxsplit=1)
                name = teile[1].strip() if len(teile) > 1 else "solid"
                werte = puffer.setdefault(name, array("f"))
            elif zeile.startswith("endsolid"):
                werte = None

    out: dict[str, np.ndarray] = {}
    for name, w in puffer.items():
        n = len(w) // 9              # 3 Ecken je Dreieck, 3 Zahlen je Ecke
        if n:
            out[name] = np.frombuffer(w, dtype=np.float32,
                                      count=n * 9).reshape(-1, 3, 3)
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
