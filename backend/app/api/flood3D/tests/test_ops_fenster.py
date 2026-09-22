"""
Geländeoperationen rechnen im Fenster (Etappe E6c, Audit G12).

Bis 2026-09-22 rechnete jede Operation über das GANZE Raster — 500 m
Gebiet: 9,6 s je Operation, bei jeder Entwurfsvorschau. Jetzt nur im
Fenster um ihre Geometrie; das Ergebnis muss dasselbe sein wie über das
ganze Raster. Gemessen wird gegen eine Rechnung über alle Knoten, die hier
im Test steht (die Formeln der Operationen), nicht gegen die Operation
selbst.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.terrain import (TerrainField, _box_blur, _dist_and_param_to_polyline,
                            _polygon_mask)


def _feld(n: int = 81, res: float = 0.5) -> TerrainField:
    yy, xx = np.mgrid[0:n, 0:n] * res
    z = 100.0 + 0.01 * xx + 0.02 * yy            # leicht geneigt, nicht eben
    return TerrainField(x0=0.0, y0=0.0, resolution=res, z=z)


def test_channel_carve_im_fenster_gleicht_der_rechnung_ueber_alles():
    f = _feld()
    op = cs.OpChannelCarve(id="g", type="channel_carve",
                           polyline=[(10.0, 20.0), (25.0, 22.0)],
                           invert_start=98.0, invert_end=97.5,
                           bottom_width=2.0, depth=1.5, side_slope=1.5)
    z0 = f.z.copy()
    f.apply(op)
    xx, yy = f.mesh_xy()
    dist, s = _dist_and_param_to_polyline(xx, yy, op.polyline)
    invert = op.invert_start + (op.invert_end - op.invert_start) * s
    ziel = invert + np.maximum(0.0, dist - 1.0) / 1.5
    soll = np.where(dist <= 1.0 + 1.5 * 1.5, np.minimum(z0, ziel), z0)
    np.testing.assert_allclose(f.z, soll)
    assert (f.z != z0).sum() > 100


def test_pad_und_raise_lower_und_embankment_gleichen_der_rechnung_ueber_alles():
    f = _feld()
    z0 = f.z.copy()
    xx, yy = f.mesh_xy()
    pad = cs.OpPad(id="p", type="pad", polygon=[(5, 5), (12, 5), (12, 11), (5, 11)],
                   level=101.0)
    f.apply(pad)
    np.testing.assert_allclose(f.z, np.where(_polygon_mask(xx, yy, pad.polygon),
                                             101.0, z0))
    z1 = f.z.copy()
    rl = cs.OpRaiseLower(id="r", type="raise_lower", center=(30.0, 30.0),
                         radius=4.0, strength=0.7, falloff="smooth")
    f.apply(rl)
    r = np.hypot(xx - 30.0, yy - 30.0) / 4.0
    np.testing.assert_allclose(f.z, z1 + 0.7 * np.clip(1 - r**2, 0, 1) ** 2)
    z2 = f.z.copy()
    emb = cs.OpEmbankment(id="e", type="embankment", polyline=[(2.0, 35.0), (38.0, 35.0)],
                          crest_level=101.5, crest_width=2.0, side_slope=2.0)
    f.apply(emb)
    dist, _ = _dist_and_param_to_polyline(xx, yy, emb.polyline)
    np.testing.assert_allclose(
        f.z, np.maximum(z2, 101.5 - np.maximum(0.0, dist - 1.0) / 2.0))


def test_glaettung_im_fenster_gleicht_der_glaettung_ueber_alles():
    f = _feld()
    f.z = f.z + np.random.default_rng(3).normal(0, 0.05, f.z.shape)   # rau
    z0 = f.z.copy()
    op = cs.OpSmooth(id="s", type="smooth", center=(20.0, 20.0), radius=5.0,
                     strength=1.0)
    f.apply(op)
    xx, yy = f.mesh_xy()
    k = max(1, int(round(5.0 / 0.5 / 2)))
    mask = np.hypot(xx - 20.0, yy - 20.0) <= 5.0
    soll = np.where(mask, _box_blur(z0, k), z0)
    np.testing.assert_allclose(f.z, soll)


def test_operation_ausserhalb_des_rasters_laesst_es_unberuehrt():
    f = _feld()
    z0 = f.z.copy()
    f.apply(cs.OpPad(id="p", type="pad",
                     polygon=[(500, 500), (510, 500), (510, 510), (500, 510)],
                     level=120.0))
    f.apply(cs.OpChannelCarve(id="g", type="channel_carve",
                              polyline=[(600.0, 0.0), (600.0, 40.0)],
                              invert_start=90.0, invert_end=90.0,
                              bottom_width=2.0, depth=1.0, side_slope=1.0))
    np.testing.assert_array_equal(f.z, z0)


def test_bruchkante_und_ebnen_im_fenster():
    f = _feld()
    z0 = f.z.copy()
    ring = [(10.0, 10.0, 99.0), (20.0, 10.0, 99.0), (20.0, 18.0, 99.0),
            (10.0, 18.0, 99.0), (10.0, 10.0, 99.0)]
    f.apply(cs.OpBruchkante(id="b", type="bruchkante", polyline=ring,
                            breite=1.0, modus="ebnen"))
    xx, yy = f.mesh_xy()
    innen = _polygon_mask(xx, yy, [p[:2] for p in ring])
    assert np.allclose(f.z[innen], 99.0)                    # innen eben
    weit = np.hypot(xx - 15.0, yy - 14.0) > 12.0
    np.testing.assert_array_equal(f.z[weit], z0[weit])      # weit weg unberührt
