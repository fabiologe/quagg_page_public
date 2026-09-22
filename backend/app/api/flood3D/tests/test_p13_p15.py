"""
Etappe E6f (Audit P13, P15): Wassertiefe aus der Speicherkurve, ehrliche
Regeln.

P13: die erwartete Wassertiefe war Zulaufvolumen / GANZE Gebietsfläche —
ein waagerechter Wasserfilm statt eines Spiegels in der Senke; Ganglinien
zählten nicht; ein Anfangsspiegel unter dem tiefsten Gelände blieb stumm.
P15: ein gebohrtes Rohr irgendwo im Fall stufte JEDEN verschlossenen
Hohlraum herab; der y⁺-Hinweis stand in jedem Fall.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.terrain import TerrainField
from ..core.validate import (_tiefe_aus_speicherkurve, _zulauf_volumen,
                             validate_case)
from .synthetic_case import build_spec_stage3


def _meld(spec, obj, base_dir="."):
    return [b["message"] for b in validate_case(spec, base_dir)
            if b["object_id"] == obj]


# ---- P13 ------------------------------------------------------------------

def test_spiegel_sammelt_sich_in_der_senke():
    # Mulde: 20 × 20 m, in der Mitte 1 m tief (Trichter), Auflösung 1 m
    yy, xx = np.mgrid[0:21, 0:21].astype(float)
    z = 100.0 - np.clip(1.0 - np.hypot(xx - 10, yy - 10) / 5.0, 0.0, 1.0)
    feld = TerrainField(x0=0.0, y0=0.0, resolution=1.0, z=z)
    v_film = 10.0 / (20 * 20)                            # alte Rechnung: 0,025 m
    tiefe = _tiefe_aus_speicherkurve(feld, None, 10.0)
    assert tiefe > 4 * v_film                            # der Spiegel steht in der Mulde
    # mit Startwasser bis 99,5 m obenauf
    assert _tiefe_aus_speicherkurve(feld, 99.5, 10.0) > 0.5


def test_ganglinie_zaehlt_zum_zulaufvolumen(tmp_path):
    spec = build_spec_stage3()
    (tmp_path / "gang.csv").write_text("t,Q\n0,0\n30,2\n60,0\n")
    spec.boundaries = [b for b in spec.boundaries if b.id != "zulauf"] + [
        cs.BcInflowHydrograph(id="zulauf", patch="inlet", type="inflow_hydrograph",
                              source="gang.csv")]
    assert _zulauf_volumen(spec, tmp_path) == pytest.approx(60.0)   # Dreieck 60 s × 2 / 2
    spec.solver.end_time = 30.0
    assert _zulauf_volumen(spec, tmp_path) == pytest.approx(30.0)   # bis end_time


def test_anfangsspiegel_unter_dem_gelaende_wird_genannt():
    spec = build_spec_stage3()
    spec.terrain.operations = []                          # flach 96 m
    spec.solver.initial_level = 95.0
    assert any("unter dem tiefsten Gelände" in m for m in _meld(spec, "solver"))
    spec.solver.initial_level = 96.5
    assert not any("unter dem tiefsten Gelände" in m for m in _meld(spec, "solver"))


def test_wassertiefe_wird_aus_der_speicherkurve_gemeldet():
    spec = build_spec_stage3()
    spec.solver.initial_level = None
    spec.solver.end_time = 2.0                            # 1 m³ auf 432 m²: Film 2 mm
    m = [x for x in _meld(spec, "solver") if "Wassertiefe" in x]
    assert m and "Speicherkurve" in m[0]


# ---- P15 ------------------------------------------------------------------

def _mit_kammer_und_rohr(rohr_x: float) -> cs.CaseSpec:
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.structures = [
        cs.StructKammer(id="kasten", type="kammer", patch="kasten",
                        footprint=[(10, 10), (14, 10), (14, 14), (10, 14)],
                        invert_level=93.0, top_level=95.0, wirkung="aushub"),
        cs.StructCulvert(id="rohr", type="culvert", patch="rohr",
                         axis=[(rohr_x, 12.0, 94.0), (rohr_x + 3.0, 12.0, 94.0)],
                         profile=cs.CulvertProfile(kind="circular", diameter=0.5),
                         durchstoesst_gelaende=True)]
    spec.mesh.refinements = []
    spec.evaluation = cs.Evaluation()
    return spec


def _hohlraum_schwere(spec) -> str | None:
    b = [x for x in validate_case(spec, ".") if x["object_id"] == "kasten"
         and "Hohlraum" in x["message"]]
    return b[0]["severity"] if b else None


def test_gebohrtes_rohr_zaehlt_nur_wenn_es_den_hohlraum_erreicht():
    # Rohr endet 6,5 m vor dem Kasten: der Hohlraum bleibt verschlossen —
    # vorher galt JEDES gebohrte Rohr im Fall als Anschluss (nur Warnung)
    assert _hohlraum_schwere(_mit_kammer_und_rohr(0.5)) == "fehler"
    # Rohr endet 0,5 m vor dem Kasten (binnen zwei Zellen): angeschlossen
    assert _hohlraum_schwere(_mit_kammer_und_rohr(6.5)) == "warnung"


def test_yplus_hinweis_nur_mit_sohlschubkriterium():
    spec = build_spec_stage3()
    spec.evaluation.targets = [t for t in spec.evaluation.targets
                               if t.kind not in ("max_bed_shear", "min_bed_shear")]
    assert not any("Wandauflösung" in m for m in _meld(spec, "mesh"))
    spec.evaluation.targets.append(cs.TargetMaxBedShear(
        id="sohl", kind="max_bed_shear", region="r01", limit_max=25.0))
    assert any("Wandauflösung" in m for m in _meld(spec, "mesh"))
