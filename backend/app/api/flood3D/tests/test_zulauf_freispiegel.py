"""
Fahrplan A1 (Audit F1): wie ein Zulauf ins Gebiet kommt.

Bis 2026-09-23 bekam JEDER Zulauf flowRateInletVelocity + alpha = 1 auf
dem ganzen Patch — ohne Fenster trat Wasser von der Sohle bis z_max ein
und fiel als Vorhang. Jetzt entscheidet casebuilder.zulauf_lage: Rohr und
Strahl (Öffnung über Gelände) behalten den vollen Querschnitt,
Freispiegel-Zuläufe bekommen variableHeightFlowRate(InletVelocity) und,
wenn der Rand trocken beginnt, einen Startwasser-Streifen.
Ob die Randbedingung im LAUF tut, was sie soll, misst die Harness-Probe
(probe/probe_lauf.py, Fall K) — hier steht der Vertrag der Dateien.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from ..core import casespec as cs
from ..core.casebuilder import (build_case, fenster_flaeche, initial_fields,
                                set_fields_dict, zulauf_lage)
from ..core.terrain import TerrainField
from ..probe.faelle import K_Q, K_SOHLE, fall_k


def _block(text: str, patch: str) -> str:
    i = text.index(f"    {patch}\n")
    return text[i:text.index("}", i)]


def _zulauf(spec):
    return next(b for b in spec.boundaries if b.type.startswith("inflow"))


def _feld(spec):
    return TerrainField.from_spec(spec.terrain, spec.domain, Path("."))


def test_ohne_fenster_ist_freispiegel():
    spec = fall_k()
    f = initial_fields(spec, Path("."))
    u, a = _block(f["U"], "inlet"), _block(f["alpha.water"], "inlet")
    assert "variableHeightFlowRateInletVelocity" in u
    assert "flowRate        constant 0.28" in u
    assert "alpha           alpha.water" in u
    assert "variableHeightFlowRate" in a and "upperBound      0.5" in a
    assert "fixedValue" not in a                     # kein Vorhang mehr


def test_kreisfenster_bleibt_rohr():
    spec = fall_k()
    _zulauf(spec).window = cs.BcWindow(shape="kreis", center=0.5,
                                       z_center=K_SOHLE + 0.3, diameter=0.3)
    assert zulauf_lage(spec, _zulauf(spec), _feld(spec))["art"] == "rohr"
    f = initial_fields(spec, Path("."))
    assert "flowRateInletVelocity" in _block(f["U"], "inlet")
    assert "variableHeight" not in _block(f["U"], "inlet")
    assert "fixedValue" in _block(f["alpha.water"], "inlet")


def test_fenster_ueber_dem_gelaende_ist_strahl():
    spec = fall_k()
    _zulauf(spec).window = cs.BcWindow(span=(0.2, 0.8), z_min=K_SOHLE + 0.5,
                                       z_max=K_SOHLE + 0.8)
    lage = zulauf_lage(spec, _zulauf(spec), _feld(spec))
    assert lage["art"] == "strahl"
    assert "flowRateInletVelocity" in _block(initial_fields(spec, Path("."))["U"], "inlet")


def test_fenster_bis_zur_sohle_ist_freispiegel_und_kappt_das_startwasser():
    spec = fall_k()
    oben = K_SOHLE + 0.02 + 0.15                     # Fensteroberkante
    _zulauf(spec).window = cs.BcWindow(span=(0.2, 0.8), z_min=K_SOHLE - 0.2,
                                       z_max=oben)
    lage = zulauf_lage(spec, _zulauf(spec), _feld(spec))
    assert lage["art"] == "freispiegel"
    assert lage["lo"] == pytest.approx(0.2) and lage["hi"] == pytest.approx(0.8)
    assert lage["z_start"] == pytest.approx(oben)    # nie über dem Fenster
    assert "variableHeightFlowRateInletVelocity" in _block(
        initial_fields(spec, Path("."))["U"], "inlet")


def test_startwasser_hoehe_ist_kritische_tiefe_mindestens_zwei_zellen():
    spec = fall_k()
    lage = zulauf_lage(spec, _zulauf(spec), _feld(spec))
    h_c = (K_Q ** 2 / 9.81) ** (1 / 3)               # b = 1 m
    assert lage["h_c"] == pytest.approx(h_c)
    assert lage["h_start"] == pytest.approx(max(2 * spec.mesh.base_cell, h_c))
    assert lage["sohle"] == pytest.approx(K_SOHLE + 0.02, abs=0.01)
    # dieselbe Fläche, mit der die Prüfung Q/A ausweist
    assert fenster_flaeche(spec, _zulauf(spec), _feld(spec)) == pytest.approx(lage["a_nass"])
    assert lage["a_nass"] == pytest.approx(1.0 * lage["h_start"], rel=0.05)


def test_trockener_rand_bekommt_startstreifen_nasser_nicht():
    spec = fall_k()
    feld = _feld(spec)
    sf = set_fields_dict(spec, terrain=feld)
    assert sf is not None and "Startwasser vor Zulauf zulauf" in sf
    lage = zulauf_lage(spec, _zulauf(spec), feld)
    assert f"{lage['z_start']:.6g})" in sf           # Oberkante = z_start
    assert lage["startwasser"] == "streifen"
    # Anfangswasserspiegel macht den Rand schon nass → kein Streifen, und
    # DIESER Spiegel ist der Startwasserstand (Q/A, Turbulenz-Init)
    spec.solver.initial_level = K_SOHLE + 0.3
    sf = set_fields_dict(spec, terrain=feld)
    assert "Startwasser" not in sf
    lage = zulauf_lage(spec, _zulauf(spec), feld)
    assert lage["startwasser"] == "anfangswasser"
    assert lage["z_start"] == pytest.approx(K_SOHLE + 0.3)
    # eine Vorfüllung, die die Zulauffläche berührt, genauso
    spec.solver.initial_level = None
    spec.solver.vorfuellungen = [cs.Vorfuellung(
        id="v", polygon=[(0, 0), (2, 0), (2, 1), (0, 1)], level=K_SOHLE + 0.3)]
    assert "Startwasser" not in set_fields_dict(spec, terrain=feld)


def test_ganglinie_wird_flowrate_table(tmp_path):
    (tmp_path / "q.csv").write_text("t,q\n0,0\n10,0.5\n20,0.2\n")
    spec = fall_k()
    spec.boundaries[0] = cs.BcInflowHydrograph(
        id="zulauf", patch="inlet", type="inflow_hydrograph", face="x_min",
        source="q.csv", column_time="t", column_q="q")
    lage = zulauf_lage(spec, spec.boundaries[0], _feld(spec), tmp_path)
    assert lage["q"] == pytest.approx(0.5)           # Spitze bemisst das Startwasser
    u = _block(initial_fields(spec, tmp_path)["U"], "inlet")
    assert "variableHeightFlowRateInletVelocity" in u
    assert "flowRate        table" in u


def test_fall_ohne_anfangswasser_ruft_setfields(tmp_path):
    spec = fall_k()
    assert spec.solver.initial_level is None and not spec.solver.vorfuellungen
    build_case(spec, tmp_path / "c", tmp_path)
    assert (tmp_path / "c" / "system" / "setFieldsDict").is_file()
    assert "setFields" in (tmp_path / "c" / "Allrun").read_text()


def test_tracer_ist_an_die_wasserphase_gebunden():
    # Fahrplan A3: der Verweilzeit-Stoff lebt nur im Wasser
    from ..core.casebuilder import function_objects
    fo = function_objects(fall_k())
    block = fo[fo.index("verweilzeit"):fo.index("tracer_")]
    assert "scalarTransport" in block
    assert "phase           alpha.water;" in block


def test_keine_oberflaechenspannung(tmp_path):
    # Fahrplan A4: sigma 0 für hydraulische Maßstäbe
    build_case(fall_k(), tmp_path / "c", tmp_path)
    tp = (tmp_path / "c" / "constant" / "transportProperties").read_text()
    assert "sigma           0;" in tp and "0.07" not in tp.split("sigma")[-1]
