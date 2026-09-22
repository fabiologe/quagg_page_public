"""
Import-Treue — Etappe E1b der Sanierung (docs/AUDIT_FLOOD3D_FALLSPEZIFISCH.md
I3, I14, I5).

Vor dem 2026-09-22 legte der Import jedes Netz als float32-STL in
Landeskoordinaten ab: bei 2,58 Mio / 5,46 Mio ist ein float32-Schritt 0,25
bzw. 0,5 m, ein 12-m-Becken-TIN verlor so 25 cm Lage und bis 76 cm Höhe.
BricsCAD-Dreiecke (3DFACE mit vtx3 == vtx0) wurden verdoppelt, die Hälfte
entartet, und die Prüfung meldete „Beckenwände". Ein Reapply warf die
Drehung des Geländes weg. Gemessen wird hier am nackten Becken der
DXF-Fabrik, nicht am Abnahmefall.
"""
from __future__ import annotations

import json

import numpy as np
import pytest
import trimesh

from ..core import kur
from ..core.importer import analyze_file, apply_import, import_neu_ableiten
from ..core.rotate import rotate_case
from ..core.validate import validate_case
from . import dxf_fabrik as fx
from .synthetic_case import build_spec_stage3


def _importieren(d, b):
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.to_yaml(d / "case.yaml")
    m = analyze_file(b["dxf"], "becken.dxf", d)
    tin = next(c for c in m["candidates"] if c["kind"] == "mesh")
    info = apply_import(spec, d, m["import_id"],
                        decisions=[{"candidate": tin["id"], "role": "gelaende"}],
                        offset=list(m["offset_suggest"]), derive_domain=True)
    return spec, m, tin, info


def _dxf_punkte(b, offset) -> np.ndarray:
    """Alle Dreiecksecken der Zeichnung, ins lokale System verschoben."""
    doc = fx.lese_dxf(b["dxf"])
    pts = []
    for e in doc.modelspace():
        if e.dxftype() == "3DFACE":
            pts += [tuple(e.dxf.vtx0), tuple(e.dxf.vtx1), tuple(e.dxf.vtx2)]
    return np.array(pts, dtype=float) - np.array([offset[0], offset[1], 0.0])


def _max_abweichung(mesh: trimesh.Trimesh, ziel: np.ndarray) -> float:
    """Größter Abstand eines Netzknotens zum nächsten Zeichnungspunkt."""
    v = np.asarray(mesh.vertices, dtype=float)
    d = np.linalg.norm(v[:, None, :] - ziel[None, :, :], axis=2).min(axis=1)
    return float(d.max())


def test_bricscad_dreiecke_bleiben_dreiecke(tmp_path):
    b = fx.nacktes_becken()
    m = analyze_file(b["dxf"], "becken.dxf", tmp_path)
    tin = next(c for c in m["candidates"] if c["kind"] == "mesh")
    assert tin["stats"]["n_triangles"] == b["n_faces"]     # 162, nicht 324
    d = tmp_path / "fall"
    d.mkdir()
    _, _, _, info = _importieren(d, b)
    assert not any("senkrecht" in r for r in info["report"]), info["report"]


def test_landeskoordinaten_verlieren_keine_genauigkeit(tmp_path):
    b = fx.nacktes_becken()
    d = tmp_path / "fall"
    d.mkdir()
    spec, m, tin, info = _importieren(d, b)
    # gemeinsamer ganzzahliger Ursprung, das abgelegte Netz ist klein
    (bx0, by0), _ = b["bbox"]
    assert m["stl_ursprung"] == [float(np.floor(bx0)), float(np.floor(by0))]
    assert m["stl_ursprung"][0] > 2.4e6
    k = trimesh.load(d / "imports" / m["import_id"] / f"{tin['id']}.stl",
                     force="mesh")
    assert float(np.abs(k.vertices[:, :2]).max()) < 100.0
    # das abgeleitete TIN misst, was gezeichnet wurde — auf den Millimeter
    tin_stl = trimesh.load(d / "derived" / f"gelaende_{m['import_id']}_tin.stl",
                           force="mesh")
    (bx0, by0), (bx1, by1) = b["bbox"]
    ext = tin_stl.bounds[1] - tin_stl.bounds[0]
    assert ext[0] == pytest.approx(bx1 - bx0, abs=0.002)
    assert ext[1] == pytest.approx(by1 - by0, abs=0.002)
    assert _max_abweichung(tin_stl, _dxf_punkte(b, m["offset_suggest"])) < 0.002


def test_alter_import_wird_aus_der_rohdatei_geheilt(tmp_path):
    b = fx.nacktes_becken()
    d = tmp_path / "fall"
    d.mkdir()
    spec, m, tin, _ = _importieren(d, b)
    imp = d / "imports" / m["import_id"]
    ziel = _dxf_punkte(b, m["offset_suggest"])

    # so lag es vor dem 22.09.2026: Netz in Landeskoordinaten (float32),
    # kein Ursprung im Manifest
    k = trimesh.load(imp / f"{tin['id']}.stl", force="mesh")
    k.apply_translation([m["stl_ursprung"][0], m["stl_ursprung"][1], 0.0])
    k.export(imp / f"{tin['id']}.stl")
    mf = json.loads((imp / "manifest.json").read_text())
    del mf["stl_ursprung"]
    (imp / "manifest.json").write_text(json.dumps(mf))
    import_neu_ableiten(spec, d, m["import_id"])
    grob = trimesh.load(d / "derived" / f"gelaende_{m['import_id']}_tin.stl",
                        force="mesh")
    assert _max_abweichung(grob, ziel) > 0.1, "der alte Fehler ist da"

    # der Fall wurde inzwischen gedreht
    rotate_case(spec, 37.0, d)
    assert spec.terrain.base.original_abbildung.rotation_deg == pytest.approx(37.0)

    def kur_angeboten():
        return [x for x in validate_case(spec, d)
                if (x.get("fix") or {}).get("aktion") == "import_neu_ableiten_roh"]

    hin = kur_angeboten()
    assert len(hin) == 1 and hin[0]["fix"]["args"]["import_id"] == m["import_id"]
    text = kur.anwenden(spec, "import_neu_ableiten_roh",
                        {"import_id": m["import_id"]}, d)
    assert "neu abgeleitet" in text
    fein = trimesh.load(d / "derived" / f"gelaende_{m['import_id']}_tin.stl",
                        force="mesh")
    assert _max_abweichung(fein, ziel) < 0.002
    # die Drehung überlebt: Abbildung bleibt, das gedrehte Raster ist neu
    assert spec.terrain.base.original_abbildung.rotation_deg == pytest.approx(37.0)
    assert "gedreht" in spec.terrain.base.source
    assert (d / spec.terrain.base.source).is_file()
    assert not kur_angeboten()
