"""
Tests K1: Geometrie außerhalb des Modellgebiets darf den Solver nie
erreichen. Drei Schichten mit EINER Messung (`gebietslage`):

* die Prüfregel meldet (warnung mit Kur bei kappbar, fehler bei ganz
  draußen),
* die Kur `ins_gebiet` kappt — und der Befund verschwindet danach
  (Regel und Kur messen dieselbe Größe),
* `build_case` säubert defensiv, ohne den gespeicherten Fall anzufassen.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import casespec as cs
from ..core.anschluss import gebietslage, ins_gebiet
from ..core.kur import anwenden
from ..core.solids import build_solids
from ..core.validate import validate_case
from ..router import router
from .synthetic_case import build_spec_stage3


def _lage(spec, obj_id):
    return next((l for l in gebietslage(spec) if l["id"] == obj_id), None)


def _befunde(spec, obj_id, base_dir="."):
    return [b for b in validate_case(spec, base_dir)
            if b["object_id"] == obj_id
            and "Modellgebiet" in b["message"]]


# ---- Messung -------------------------------------------------------------

def test_alles_im_gebiet_liefert_keine_lagen():
    assert gebietslage(build_spec_stage3()) == []


def test_wand_teilweise_draussen_ist_kappbar():
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    # Gebiet ist 24 x 18 — das zweite Ende weit über den Rand hinaus
    wand.alignment.points = [(8, 3, 98.0), (8, 30, 98.0)]
    lage = _lage(spec, "wand_becken")
    assert lage is not None and lage["klippbar"] and not lage["voll"]
    assert 0.4 < lage["anteil"] < 0.6


def test_rechen_ganz_draussen_ist_voll_und_nicht_kappbar():
    spec = build_spec_stage3()
    r = next(s for s in spec.structures if s.id == "rechen_1")
    r.plane_polygon = [(30, 8.0, 94.6), (30, 10.0, 94.6),
                       (30, 10.0, 96.6), (30, 8.0, 96.6)]
    lage = _lage(spec, "rechen_1")
    assert lage is not None and lage["voll"] and not lage["klippbar"]


def test_muendungs_ueberstand_des_durchlasses_ist_kein_befund():
    spec = build_spec_stage3()
    dl = next(s for s in spec.structures if s.id == "dl_1")
    # 1 m über den Rand — genau der gewollte Mündungs-Überstand
    dl.axis = [(4.0, -1.0, 94.5), (4.0, 14.0, 94.3)]
    assert _lage(spec, "dl_1") is None
    # erst deutlich darüber hinaus wird gemessen
    dl.axis = [(4.0, -8.0, 94.5), (4.0, 14.0, 94.3)]
    assert _lage(spec, "dl_1") is not None


# ---- Regel-und-Kur-Invariante --------------------------------------------

def test_kur_kappt_die_wand_und_der_befund_verschwindet():
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(8, 3, 98.0), (8, 30, 97.0)]
    befunde = _befunde(spec, "wand_becken")
    assert befunde and befunde[0]["severity"] == "warnung"
    fix = befunde[0].get("fix")
    assert fix and fix["aktion"] == "ins_gebiet"
    anwenden(spec, fix["aktion"], fix.get("args"))
    assert _befunde(spec, "wand_becken") == []
    # gekappt am Gebietsrand, z entlang der Linie interpoliert
    y_werte = [p[1] for p in wand.alignment.points]
    assert max(y_werte) == pytest.approx(18.0)
    z_ende = next(p[2] for p in wand.alignment.points
                  if p[1] == pytest.approx(18.0))
    assert z_ende == pytest.approx(98.0 + (97.0 - 98.0) * 15 / 27, abs=1e-3)


def test_kur_kappt_die_vorfuellung():
    spec = build_spec_stage3()
    spec.solver.vorfuellungen = [cs.Vorfuellung(
        id="vf1", type="vorfuellung",
        polygon=[(20, 4), (30, 4), (30, 8), (20, 8)], level=95.5)]
    lage = _lage(spec, "vf1")
    assert lage is not None and lage["klippbar"]
    ins_gebiet(spec)
    assert _lage(spec, "vf1") is None
    assert max(p[0] for p in spec.solver.vorfuellungen[0].polygon) \
        == pytest.approx(24.0)


def test_ganz_draussen_meldet_fehler_ohne_loesch_kur():
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(30, 3, 98.0), (30, 8, 98.0)]
    befunde = _befunde(spec, "wand_becken")
    assert befunde and befunde[0]["severity"] == "fehler"
    assert "fix" not in befunde[0]
    # die Kur löscht NICHT automatisch — sie meldet nur
    ins_gebiet(spec)
    assert any(s.id == "wand_becken" for s in spec.structures)


# ---- build_case-Chokepoint -----------------------------------------------

def test_build_case_laesst_draussen_liegendes_nicht_zum_solver(tmp_path):
    from ..core.casebuilder import build_case

    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(30, 3, 98.0), (30, 8, 98.0)]
    r = next(s for s in spec.structures if s.id == "rechen_1")
    r.plane_polygon = [(30, 8.0, 94.6), (30, 10.0, 94.6),
                       (30, 10.0, 96.6), (30, 8.0, 96.6)]
    info = build_case(spec, tmp_path / "fall", tmp_path)
    assert any("wand_becken" in p for p in info["problems"])
    assert any("rechen_1" in p for p in info["problems"])
    assert "wand_becken" not in info["solids"]
    assert "rechen_1" not in info["screens"]
    # der Rechen erzeugt weder Zone noch Porositätsquelle
    ts = tmp_path / "fall" / "system" / "topoSetDict"
    if ts.exists():
        assert "rechen_1" not in ts.read_text()
    assert not (tmp_path / "fall" / "constant" / "fvOptions").exists()
    # der übergebene Fall bleibt unangetastet (Kopie-Semantik)
    assert any(s.id == "wand_becken" for s in spec.structures)
    # und die Hashes stammen vom UNVERÄNDERTEN Spec
    assert info["netz_hash"] == spec.netz_hash()


# ---- B4: ein kaputtes Bauwerk frisst nicht die anderen -------------------

def test_build_solids_isoliert_ein_kaputtes_bauwerk():
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    # entartete Wand: alle Stützpunkte identisch → Körperbau wirft
    wand.alignment.points = [(8, 3, 98.0), (8, 3, 98.0)]
    ausfaelle: list[dict] = []
    solids = build_solids(spec, ausfaelle=ausfaelle)
    assert [a["id"] for a in ausfaelle] == ["wand_becken"]
    assert "becken_1" in solids and "pfeiler_1" in solids
    # ohne Auffangliste wirft der erste Fehler wie bisher
    with pytest.raises(Exception):
        build_solids(spec)


# ---- Endpunkt-Tor ---------------------------------------------------------

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path))
    (tmp_path / "demo").mkdir()
    spec = build_spec_stage3()
    wand = next(s for s in spec.structures if s.id == "wand_becken")
    wand.alignment.points = [(30, 3, 98.0), (30, 8, 98.0)]
    spec.to_yaml(tmp_path / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_mesh_preview_blockt_bei_fehler_befund(client):
    r = client.post("/cases/demo/mesh-preview")
    assert r.status_code == 422
    assert "Fehler-Befunde" in r.json()["detail"]
