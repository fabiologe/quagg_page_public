"""
Wasseroberfläche aus dem Rechennetz (Fahrplan C3, 2026-09-24).

Das functionObject `wasseroberflaeche` (casebuilder._wasseroberflaeche)
schreibt zu jeder Feld-Ausgabe die Isofläche α = 0,5 auf dem echten Netz
als Legacy-VTK (ASCII) mit U auf den Knoten:

    postProcessing/wasseroberflaeche/<Zeit>/alpha05.vtk

Der Nachlauf bringt sie in die Ablage des Laufs:

    fields/oberflaeche/t_<idx>.npz   punkte (n,3) f32, dreiecke (m,3) i32,
                                     U (n,3) f32, __time
    fields/index.json                Schlüssel "oberflaeche": [Zeiten]

Übertragung an den Browser als ein Binärblock je Zeitpunkt:
    b"F3DS" | uint32 Headerlänge | Header-JSON | Punkte (f32) | Dreiecke (u32)
    | Knotenfelder (f32)
Raum3D zeichnet sie statt Marching Cubes auf dem Voxel-Raster.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

from .conventions import OBERFLAECHE_FLAECHE, OBERFLAECHE_FO
from .fields import fields_dir

MAGIC = b"F3DS"


def lies_vtk(pfad: str | Path) -> dict:
    """
    Legacy-VTK POLYDATA (ASCII), wie OpenFOAMs vtk-Oberflächenschreiber es
    schreibt: POINTS, POLYGONS (Vielecke, über Zeilen umbrochen), POINT_DATA
    mit FIELD-Einträgen. Vielecke werden als Fächer in Dreiecke zerlegt.
    """
    tokens = Path(pfad).read_text().split()
    i = 0
    punkte = np.zeros((0, 3), np.float32)
    dreiecke = np.zeros((0, 3), np.int32)
    felder: dict[str, np.ndarray] = {}
    n_punkte = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "POINTS":
            n_punkte = int(tokens[i + 1])
            werte = np.array(tokens[i + 3:i + 3 + 3 * n_punkte], dtype=np.float64)
            punkte = werte.reshape(-1, 3).astype(np.float32)
            i += 3 + 3 * n_punkte
        elif t == "POLYGONS":
            n_poly, n_werte = int(tokens[i + 1]), int(tokens[i + 2])
            werte = np.array(tokens[i + 3:i + 3 + n_werte], dtype=np.int64)
            dreiecke = _faecher(werte, n_poly)
            i += 3 + n_werte
        elif t == "POINT_DATA":
            n = int(tokens[i + 1])
            i += 2
            if i < len(tokens) and tokens[i] == "FIELD":
                n_felder = int(tokens[i + 2])
                i += 3
                for _ in range(n_felder):
                    name, komp, tupel = tokens[i], int(tokens[i + 1]), int(tokens[i + 2])
                    anz = komp * tupel
                    werte = np.array(tokens[i + 4:i + 4 + anz], dtype=np.float64)
                    felder[name] = werte.reshape(tupel, komp).astype(np.float32) \
                        if komp > 1 else werte.astype(np.float32)
                    i += 4 + anz
            if n != n_punkte:
                raise ValueError(f"{pfad}: POINT_DATA {n} ≠ POINTS {n_punkte}")
        else:
            i += 1
    return {"punkte": punkte, "dreiecke": dreiecke, "felder": felder}


def _faecher(werte: np.ndarray, n_poly: int) -> np.ndarray:
    """[n, a, b, c, …] je Vieleck → Dreiecke (a, b, c), (a, c, d), …"""
    out = []
    i = 0
    for _ in range(n_poly):
        n = int(werte[i])
        ecken = werte[i + 1:i + 1 + n]
        for k in range(1, n - 1):
            out.append((ecken[0], ecken[k], ecken[k + 1]))
        i += 1 + n
    if i != len(werte):
        raise ValueError(f"POLYGONS: {i} von {len(werte)} Werten gelesen")
    return np.array(out, dtype=np.int32).reshape(-1, 3)


def _zeitordner(case_dir: Path) -> list[tuple[float, Path]]:
    wurzel = case_dir / "postProcessing" / OBERFLAECHE_FO
    if not wurzel.is_dir():
        return []
    out = []
    for d in wurzel.iterdir():
        try:
            t = float(d.name)
        except ValueError:
            continue
        f = d / f"{OBERFLAECHE_FLAECHE}.vtk"
        if f.is_file():
            out.append((t, f))
    return sorted(out)


def oberflaechen_umwandeln(case_dir: str | Path, run_root: str | Path) -> list[float]:
    """
    Alle geschriebenen Oberflächen in fields/oberflaeche/. Liefert die
    Zeiten (leer: der Lauf hat keine — vor C3 gerechnet).
    """
    ziel = fields_dir(Path(run_root)) / "oberflaeche"
    zeiten = []
    for t, f in _zeitordner(Path(case_dir)):
        d = lies_vtk(f)
        ziel.mkdir(parents=True, exist_ok=True)
        extra = {"U": d["felder"]["U"]} if "U" in d["felder"] else {}
        np.savez_compressed(ziel / f"t_{len(zeiten):04d}.npz",
                            __time=np.float64(t), punkte=d["punkte"],
                            dreiecke=d["dreiecke"], **extra)
        zeiten.append(t)
    return zeiten


def lies_oberflaeche(run_root: Path, zeiten: list[float], time: float
                     ) -> tuple[float, dict[str, np.ndarray]]:
    """Die Oberfläche zum nächstgelegenen Zeitpunkt."""
    idx = int(np.argmin([abs(t - time) for t in zeiten]))
    with np.load(fields_dir(Path(run_root)) / "oberflaeche" / f"t_{idx:04d}.npz") as z:
        return float(z["__time"]), {k: z[k] for k in z.files if k != "__time"}


def pack_oberflaeche(time: float, daten: dict[str, np.ndarray]) -> bytes:
    punkte = np.ascontiguousarray(daten["punkte"], dtype="<f4")
    dreiecke = np.ascontiguousarray(daten["dreiecke"], dtype="<u4")
    felder = {k: np.ascontiguousarray(v, dtype="<f4") for k, v in daten.items()
              if k not in ("punkte", "dreiecke")}
    header = json.dumps({
        "time": time, "punkte": len(punkte), "dreiecke": len(dreiecke),
        "felder": [{"name": k, "components": v.shape[1] if v.ndim > 1 else 1}
                   for k, v in felder.items()]}).encode()
    header += b" " * (-len(header) % 4)      # Arrays 4-Byte-ausgerichtet
    teile = [punkte.tobytes(), dreiecke.tobytes()] + [v.tobytes() for v in felder.values()]
    return MAGIC + struct.pack("<I", len(header)) + header + b"".join(teile)
