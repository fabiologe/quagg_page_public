"""
Tests Stufe 2b, Datenaufbereitung: npz-Zwischenformat, Binärpaket und
Binning-Resampler. Erwartungswerte analytisch aus synthetic_fields.py.
"""
from __future__ import annotations

import json
import struct

import numpy as np
import pytest

from ..core.fields import (VolumeGrid, pack_volume, read_geometry, read_index,
                           read_timestep, resample_points)
from . import synthetic_fields as syf


@pytest.fixture(scope="module")
def run_root(tmp_path_factory):
    d = tmp_path_factory.mktemp("fields_run")
    syf.build_fields(d)
    return d


def _cell_index(x, y, z):
    g = syf.GRID
    return tuple(int((c - o) // s) for c, o, s in
                 zip((z, y, x), reversed(g.origin), reversed(g.spacing)))


def test_index_und_geometrie(run_root):
    index = read_index(run_root)
    assert index["grid"]["dims"] == [64, 48, 32]
    assert [e["time"] for e in index["timesteps"]] == syf.FIELD_TIMES
    assert all(e["size_bytes"] > 0 for e in index["timesteps"])
    terrain = read_geometry(run_root)
    assert terrain.shape == (48, 64)
    # Muldenzentrum liegt tiefer als der Rand
    assert terrain[24, 32] < terrain[0, 0]


def test_alpha_analytisch(run_root):
    time, data = read_timestep(run_root, 2)   # t = 0.5, Spiegel bei 99.5
    assert time == 0.5
    alpha = data["alpha"]
    k_wet, j, i = _cell_index(48.0, 36.0, 96.0)    # im Wasser über der Mulde
    k_air, _, _ = _cell_index(48.0, 36.0, 99.9)    # über dem Spiegel
    assert alpha[k_wet, j, i] == 1.0
    assert alpha[k_air, j, i] == 0.0
    k_ground, _, _ = _cell_index(48.0, 36.0, 93.0)  # unter der Geländesohle
    assert alpha[k_ground, j, i] == 0.0


def test_geschwindigkeit_und_druck(run_root):
    _, data = read_timestep(run_root, 2)
    U, p = data["U"], data["p_rgh"]
    assert U.shape == (3, 32, 48, 64)
    mag = np.sqrt((U**2).sum(axis=0))
    assert 0 < mag.max() <= syf.U_MAX * 1.01
    k, j, i = _cell_index(48.0, 36.0, 96.0)
    erwartet = syf.RHO * syf.G * (99.5 - (92.0 + (k + 0.5) * 0.25))
    assert p[k, j, i] == pytest.approx(erwartet, rel=1e-3)


def test_pack_volume_roundtrip(run_root):
    index = read_index(run_root)
    time, data = read_timestep(run_root, 2)
    blob = pack_volume(time, index["grid"], data, wanted=["alpha", "U"])
    assert blob[:4] == b"F3DV"
    (hlen,) = struct.unpack("<I", blob[4:8])
    header = json.loads(blob[8:8 + hlen])
    assert header["time"] == 0.5
    names = [f["name"] for f in header["fields"]]
    assert names == ["alpha", "U"]
    f_alpha = header["fields"][0]
    raw = blob[8 + hlen + f_alpha["offset"]:
               8 + hlen + f_alpha["offset"] + f_alpha["length_bytes"]]
    alpha = np.frombuffer(raw, dtype="<f4").reshape(f_alpha["dims"])
    np.testing.assert_array_equal(alpha, data["alpha"])


def test_resampler_binning_und_fill():
    grid = VolumeGrid(origin=(0, 0, 0), spacing=(1, 1, 1), dims=(2, 2, 1))
    pts = np.array([[0.5, 0.5, 0.5], [0.4, 0.6, 0.5],   # beide in Zelle (0,0)
                    [1.5, 0.5, 0.5],                     # Zelle (1,0)
                    [5.0, 5.0, 5.0]])                    # außerhalb
    vals = np.array([1.0, 3.0, 10.0, 99.0])
    out = resample_points(pts, vals, grid, fill=-1.0)
    assert out.shape == (1, 2, 2)
    assert out[0, 0, 0] == pytest.approx(2.0)   # Mittel aus 1 und 3
    assert out[0, 0, 1] == pytest.approx(10.0)
    assert out[0, 1, 0] == -1.0                 # Loch -> fill
    assert out[0, 1, 1] == -1.0
