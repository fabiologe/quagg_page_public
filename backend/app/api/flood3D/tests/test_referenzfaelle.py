"""
Die Messlatte und der zweite Referenzfall (Etappe E0 der Sanierung).

Diese Tests prüfen die WERKZEUGE der Sanierung, nicht das Werkzeug
flood-3D: dass die DXF-Fabriken wirklich die Formen liefern, an denen der
Import im Betrieb gescheitert ist, dass der Referenzfall B lädt und ein
Gelände ergibt, und dass die Messlatte an ihm die Kennzahlen liefert, an
denen die nächsten Etappen gemessen werden. Was das Werkzeug mit diesen
Formen heute FALSCH macht, steht im Audit und wird in E1/E2 zu Tests.
"""
from __future__ import annotations

import math

import numpy as np

from ..core.casespec import CaseSpec
from ..core.terrain import TerrainField
from . import dxf_fabrik as fx
from .messlatte import messe_fall, pinsel_wirkung
from .synthetic_case import TAL_EXTENT, TAL_RASTER, build_spec_tal, tal_hoehe


# ---- Fabrik „nacktes Becken" ---------------------------------------------

def test_nacktes_becken_schreibt_bricscad_dreiecke():
    b = fx.nacktes_becken()
    doc = fx.lese_dxf(b["dxf"])
    faces = [e for e in doc.modelspace() if e.dxftype() == "3DFACE"]
    assert len(faces) == b["n_faces"] == 2 * 9 * 9
    # BricsCAD schreibt ein Dreieck als 3DFACE mit vtx3 == vtx0 — nie vtx2
    assert all(tuple(f.dxf.vtx3) == tuple(f.dxf.vtx0) for f in faces)
    assert all(tuple(f.dxf.vtx3) != tuple(f.dxf.vtx2) for f in faces)
    assert doc.header["$INSUNITS"] == 6


def test_nacktes_becken_liegt_in_landeskoordinaten():
    b = fx.nacktes_becken()
    (x0, y0), (x1, y1) = b["bbox"]
    assert x0 > 2.4e6 and y0 > 5.3e6
    # gedrehtes Quadrat: der Hüllquader ist deutlich größer als die Kante
    assert 11.5 < x1 - x0 < 12.5 and 11.5 < y1 - y0 < 12.5
    # in dieser Größenordnung ist float32 0,25 m (x) / 0,5 m (y) grob
    assert np.spacing(np.float32(x0)) == 0.25
    assert np.spacing(np.float32(y0)) == 0.5


def test_nacktes_becken_hat_offenen_tiefen_rand():
    b = fx.nacktes_becken()
    z = b["rand"][:, 2]
    # der Rand ist keine Krone: die Scharte liegt fast auf Sohlhöhe
    assert z.max() > b["krone"] - 0.01
    assert z.min() < b["sohle"] + 0.3
    assert (z < b["krone"] - 0.1).sum() >= 3


def test_nacktes_becken_rohrkreis_liegt_waagerecht():
    b = fx.nacktes_becken()
    doc = fx.lese_dxf(b["dxf"])
    kreise = [e for e in doc.modelspace() if e.dxftype() == "CIRCLE"]
    assert len(kreise) == 1
    k = kreise[0]
    assert k.dxf.layer == "AUSLAUF"
    assert k.dxf.radius == 0.8                    # r = 0,8 -> d = 1,6
    assert abs(k.dxf.extrusion.z) < 1e-9          # Achse waagerecht
    mitte = k.ocs().to_wcs(k.dxf.center)
    assert math.dist(tuple(mitte), b["rohr"]["mitte"]) < 1e-6


# ---- Fabrik „neun Linien" -------------------------------------------------

def test_neun_linien_beckenrand_ist_geschlossen_aber_offen():
    n = fx.neun_linien()
    doc = fx.lese_dxf(n["dxf"])
    linien = {e.dxf.layer: e for e in doc.modelspace()
              if e.dxftype() == "POLYLINE"}
    assert len(linien) == n["n_linien"]
    rand = linien["Bruchkanten_linie_3"]
    assert rand.is_closed                          # das Flag ist gesetzt …
    pts = [tuple(v.dxf.location) for v in rand.vertices]
    assert math.dist(pts[0][:2], pts[-1][:2]) > 1.0   # … der Anfang wird nicht wiederholt
    assert n["rand_luecke"] > 1.0
    sohle = [tuple(v.dxf.location) for v in linien["Bruchkanten_linie_1"].vertices]
    assert sohle[0] == sohle[-1]                   # die Sohle dagegen schon
    # Höhe je Stützpunkt bleibt in der 3D-Polylinie erhalten
    zs = {round(p[2], 2) for p in pts}
    assert len(zs) > 1


# ---- Referenzfall B -------------------------------------------------------

def test_tal_laedt_und_ergibt_gelaende(tmp_path):
    spec = build_spec_tal(tmp_path)
    spec.to_yaml(tmp_path / "case.yaml")
    spec2 = CaseSpec.from_yaml(tmp_path / "case.yaml")
    feld = TerrainField.from_spec(spec2.terrain, spec2.domain, tmp_path)
    x0, y0, x1, y1 = TAL_EXTENT
    assert feld.z.shape == (int(round((y1 - y0) / 1.0)) + 1,
                            int(round((x1 - x0) / 1.0)) + 1)
    # innerhalb des Rasters stimmt das Feld mit der Formel überein
    x, y = 50.35, 40.15
    assert abs(float(feld.sample(x, y)) - float(tal_hoehe(x, y))) < 0.02
    assert len(spec2.boundaries) == 4
    assert {b.face for b in spec2.boundaries if b.type.startswith("inflow")} \
        == {"x_min", "y_max"}


def test_tal_raster_deckt_das_gebiet_nur_zum_teil(tmp_path):
    build_spec_tal(tmp_path)
    r = TAL_RASTER
    x0, y0, x1, y1 = TAL_EXTENT
    raster_m2 = r["ncols"] * r["nrows"] * r["res"] ** 2
    assert raster_m2 / ((x1 - x0) * (y1 - y0)) < 0.5
    # und liegt ganz im Gebiet — das Gebiet ist auf allen Seiten größer
    assert x0 < r["x0"] and y0 < r["y0"]
    assert x1 > r["x0"] + r["ncols"] * r["res"]
    assert y1 > r["y0"] + r["nrows"] * r["res"]


# ---- Messlatte ------------------------------------------------------------

def test_messlatte_misst_den_referenzfall(tmp_path):
    spec = build_spec_tal(tmp_path)
    spec.to_yaml(tmp_path / "case.yaml")
    m = messe_fall(tmp_path)
    assert m["fall"] == tmp_path.name
    assert not [k for k in m if k.endswith("_fehler")], m
    assert 0.5 < m["anteil_ausserhalb"] < 0.7
    assert m["ueberlappt"] is True
    assert m["nodata_zellen"] == 0
    assert m["randspanne"] > 2.0          # geneigtes Tal: der Rand ist keine Ebene
    assert m["phantom_knoten"] >= 0 and m["phantom_m3"] >= 0.0
    assert m["ops"] == 0
    assert m["pinsel_wirkungslos_vorher"] == 0.0
    assert m["pinsel_wirkungslos_jetzt"] == 0.0


def test_messlatte_sieht_sollhoehen_operationen(tmp_path):
    from ..core import casespec as cs
    spec = build_spec_tal(tmp_path)
    # ein Planum von Hand: dort ist der Pinsel heute wie geplant wirkungslos
    spec.terrain.operations = [cs.OpPad(id="p1", type="pad", level=52.0,
                                        polygon=[(40, 30), (60, 30),
                                                 (60, 50), (40, 50)])]
    m = pinsel_wirkung(spec, tmp_path)
    assert m["ops_eigene_sollhoehe"] == 1
    flaeche_gebiet = (TAL_EXTENT[2] - TAL_EXTENT[0]) * (TAL_EXTENT[3] - TAL_EXTENT[1])
    erwartet = 20 * 20 / flaeche_gebiet
    assert abs(m["pinsel_wirkungslos_vorher"] - erwartet) < 0.01
    assert abs(m["pinsel_wirkungslos_jetzt"] - erwartet) < 0.01
