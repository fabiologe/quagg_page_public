"""
Wasseroberfläche aus dem Rechennetz (Fahrplan C3): functionObject im
controlDict, Leser für OpenFOAMs Legacy-VTK, Ablage und Binärpaket.
Das Format ist am echten Lauf abgelesen (c3_k, 2026-09-24): Vielecke über
Zeilen umbrochen, POINT_DATA als FIELD mit U.
"""
from __future__ import annotations

import json
import struct

import numpy as np
import pytest

from ..core.oberflaeche import (lies_oberflaeche, lies_vtk, oberflaechen_umwandeln,
                                pack_oberflaeche)

# ein Viereck und ein Dreieck, Werte wie OpenFOAM über Zeilen umbrochen
VTK = """# vtk DataFile Version 2.0
time='2'
ASCII
DATASET POLYDATA
FIELD FieldData 1
TimeValue 1 1 float
2

POINTS 5 float
0 0 100.1 1 0 100.1 1 1 100.2
0 1 100.2 2 0 100.0
POLYGONS 2 9
4 0 1 2 3 3 1
4 2
POINT_DATA 5
FIELD FieldData 1
U 3 5 float
1 0 0 1 0 0 2 0 0
2 0 0 3 0 0
"""


def _fall(tmp_path, zeiten=(1.0, 2.0)):
    case = tmp_path / "case"
    for t in zeiten:
        d = case / "postProcessing" / "wasseroberflaeche" / f"{t:g}"
        d.mkdir(parents=True)
        (d / "alpha05.vtk").write_text(VTK)
    return case


def test_leser_zerlegt_vielecke_in_dreiecke():
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "a.vtk"
        p.write_text(VTK)
        d = lies_vtk(p)
    assert d["punkte"].shape == (5, 3)
    assert d["punkte"][2].tolist() == pytest.approx([1, 1, 100.2])
    assert d["dreiecke"].tolist() == [[0, 1, 2], [0, 2, 3], [1, 4, 2]]
    assert d["felder"]["U"][:, 0].tolist() == [1, 1, 2, 2, 3]


def test_functionobject_im_controldict():
    from ..core.casebuilder import control_dict
    from .synthetic_case import build_spec_stage3
    text = control_dict(build_spec_stage3())
    block = text[text.index("wasseroberflaeche"):]
    for teil in ("type            surfaces;", "writeControl    writeTime;",
                 "legacy      true;", "format      ascii;",
                 "isoMethod   topo;", "isoField    alpha.water;",
                 "isoValue    0.5;", "fields          (U);", "alpha05"):
        assert teil in block, teil


def test_umwandeln_und_paket_rundreise(tmp_path):
    case = _fall(tmp_path)
    run = tmp_path / "run"
    assert oberflaechen_umwandeln(case, run) == [1.0, 2.0]
    t, daten = lies_oberflaeche(run, [1.0, 2.0], 1.8)
    assert t == 2.0
    blob = pack_oberflaeche(t, daten)
    assert blob[:4] == b"F3DS"
    (hlen,) = struct.unpack("<I", blob[4:8])
    kopf = json.loads(blob[8:8 + hlen])
    assert (kopf["punkte"], kopf["dreiecke"]) == (5, 3)
    assert kopf["felder"] == [{"name": "U", "components": 3}]
    start = 8 + hlen
    assert start % 4 == 0                               # Float32Array im Browser
    punkte = np.frombuffer(blob, "<f4", 15, start).reshape(5, 3)
    dreiecke = np.frombuffer(blob, "<u4", 9, start + 60).reshape(3, 3)
    assert punkte[4].tolist() == pytest.approx([2, 0, 100.0])
    assert dreiecke[2].tolist() == [1, 4, 2]


def test_ohne_functionobject_keine_oberflaeche(tmp_path):
    (tmp_path / "case").mkdir()
    assert oberflaechen_umwandeln(tmp_path / "case", tmp_path / "run") == []
