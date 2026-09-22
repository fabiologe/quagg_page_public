"""
EINE Rasterweite (Etappe E6b, Audit I11).

Bis 2026-09-22 gab es vier Rückfallwerte für dieselbe Größe — 0,5 (Router,
Linienimport), 1,0 (TIN-Import), 0,25 (Schema) —, die Zellgröße einer
Rasterdatei wurde ignoriert, und ein 0,1-m-Scan wurde auf 0,5 m ausgedünnt.
Jetzt: terrain.RASTERWEITE_VORGABE ist der eine Rückfall, und der Import
leitet die Weite aus den DATEN ab (halber Stützpunktabstand, Zellgröße der
Datei), gedeckelt über MAX_GELAENDE_KNOTEN.
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core.importer import analyze_file, apply_import
from ..core.terrain import (MAX_GELAENDE_KNOTEN, RASTERWEITE_VORGABE,
                            rasterweite_aus_daten)
from . import dxf_fabrik as fx
from .synthetic_case import build_spec_stage3


def test_schema_und_kern_nennen_dieselbe_vorgabe():
    assert cs.TerrainBase.model_fields["resolution"].default == RASTERWEITE_VORGABE


def test_rasterweite_folgt_den_daten_und_dem_deckel():
    assert rasterweite_aus_daten(None, None) == RASTERWEITE_VORGABE
    assert rasterweite_aus_daten(0.47, (12.0, 12.0)) == pytest.approx(0.47)
    # 0,1-m-Scan über 500 m: 25 Mio Knoten → vergröbert auf den Deckel
    r = rasterweite_aus_daten(0.1, (500.0, 500.0))
    assert r > 0.1
    assert (500.0 / r + 1) * (500.0 / r + 1) <= MAX_GELAENDE_KNOTEN * 1.01
    # ein 2-m-Raster bleibt bei 2 m (vorher: 0,5 m = 16-fach überabgetastet)
    assert rasterweite_aus_daten(2.0, (100.0, 100.0)) == pytest.approx(2.0)


def _fall():
    spec = build_spec_stage3()
    spec.terrain.operations = []
    return spec


def test_tin_import_nimmt_die_halbe_dreieckskante(tmp_path):
    b = fx.nacktes_becken()                       # Gitter 8,5 m / 9 = 0,944 m
    spec = _fall()
    m = analyze_file(b["dxf"], "becken.dxf", tmp_path)
    tin = next(c for c in m["candidates"] if c["kind"] == "mesh")
    info = apply_import(spec, tmp_path, m["import_id"],
                        [{"candidate": tin["id"], "role": "gelaende"}],
                        offset=list(m["offset_suggest"]), derive_domain=True)
    assert spec.terrain.base.resolution == pytest.approx(0.944 / 2, abs=0.01)
    assert any("Rasterweite" in r and "Dreieckskante" in r for r in info["report"])


def test_linienimport_nimmt_den_halben_stuetzpunktabstand(tmp_path):
    n = fx.neun_linien()
    spec = _fall()
    m = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    dec = [{"candidate": c["id"],
            "role": ("querschnitt" if c["name"].startswith("AUSLAUF_linie")
                     else "bruchkante" if c["kind"] == "polyline" else "ignorieren")}
           for c in m["candidates"]]
    info = apply_import(spec, tmp_path, m["import_id"], dec,
                        offset=list(fx.GK_URSPRUNG), terrain_from_lines=True)
    res = spec.terrain.base.resolution
    assert 0.9 <= res <= 1.4, res                     # Median-Segment ~2,3 m / 2
    assert any("Rasterweite" in r and "Stützpunktabstand" in r for r in info["report"])
    assert not any("NICHT konvergiert" in r for r in info["report"])
