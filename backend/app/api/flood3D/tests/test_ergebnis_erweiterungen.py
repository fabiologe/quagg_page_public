"""
Tests der Ergebnis-Nachrüstungen: Überfallbeiwert, max_bed_shear,
Energiehöhen aus den Feldern (head_difference real auswertbar) und die
stat-Spalte der Extremwerttabelle.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ..core import casespec as cs
from ..core.conventions import Quantity
from ..core.evaluate import _eval_target, _extremes, overfall_cd_rows
from ..core.fields import VolumeGrid, write_index, write_timestep
from ..core.foamfields import energy_head_series
from .synthetic_case import build_spec_stage3


def _rows(quantity, location, values, comp=""):
    return [{"run_id": "r", "time": float(t), "quantity": quantity,
             "location_id": location, "component": comp, "value": float(v),
             "unit": "x", "source": "test"} for t, v in values]


def _spec_mit_wehr():
    spec = build_spec_stage3()
    spec.structures.append(cs.StructWeir(
        id="wehr_1", type="weir", patch="wehr_1",
        crest_polyline=[(10, 4, 95.0), (10, 8, 95.0)],
        crest_width=0.8, slope_upstream=2.0, slope_downstream=2.0))
    spec.evaluation.targets.append(cs.TargetOverfallCd(
        id="cd_wehr", kind="overfall_cd", weir="wehr_1",
        section="qs_zulauf", gauge="pegel_becken"))
    return spec


def test_ueberfallbeiwert_aus_q_und_h():
    spec = _spec_mit_wehr()
    # Kronenlänge b=4, Krone 95.0, h=0.5 -> Q für Cd=0.65 rückgerechnet
    q_soll = 0.65 * (2 / 3) * np.sqrt(2 * 9.81) * 4.0 * 0.5 ** 1.5
    df = pd.DataFrame(
        _rows("discharge", "qs_zulauf", [(t, q_soll) for t in range(0, 30, 5)])
        + _rows("level", "pegel_becken", [(t, 95.5) for t in range(0, 30, 5)]))
    rows = overfall_cd_rows(df, spec, "r")
    assert rows, "keine Cd-Reihe erzeugt"
    cds = [r["value"] for r in rows]
    assert np.median(cds) == pytest.approx(0.65, abs=1e-3)

    df2 = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
    tgt = next(t for t in spec.evaluation.targets if t.id == "cd_wehr")
    out = _eval_target(df2, tgt)
    assert out["result"] == "informativ"
    assert out["value"] == pytest.approx(0.65, abs=1e-3)


def test_ueberfallbeiwert_trockene_krone():
    spec = _spec_mit_wehr()
    df = pd.DataFrame(
        _rows("discharge", "qs_zulauf", [(t, 0.5) for t in range(0, 30, 5)])
        + _rows("level", "pegel_becken", [(t, 94.5) for t in range(0, 30, 5)]))
    assert overfall_cd_rows(df, spec, "r") == []
    tgt = next(t for t in spec.evaluation.targets if t.id == "cd_wehr")
    assert _eval_target(df, tgt)["result"] == "nicht_auswertbar"


def test_max_bed_shear_target():
    spec = build_spec_stage3()
    spec.evaluation.targets.append(cs.TargetMaxBedShear(
        id="sicherung", kind="max_bed_shear", region="r01", limit_max=20.0))
    df = pd.DataFrame(_rows("bed_shear", "r01",
                            [(0, 5.0), (10, 25.0), (20, 12.0)], comp="max"))
    tgt = next(t for t in spec.evaluation.targets if t.id == "sicherung")
    out = _eval_target(df, tgt)
    assert out["result"] == "nicht_erfuellt"
    assert out["value"] == pytest.approx(25.0)
    assert out["time_of_occurrence"] == pytest.approx(10.0)


def test_energiehoehen_aus_feldern(tmp_path):
    spec = build_spec_stage3()
    spec.evaluation.targets.append(cs.TargetHeadDifference(
        id="verlust", kind="head_difference",
        upstream="qs_zulauf", downstream="qs_ablauf", limit_max=1.0))
    # Mini-Feld: Wasser bis z=92, U überall (1,0,0) -> E = 92 + 1/(2g)
    grid = VolumeGrid(origin=(0, 0, 90), spacing=(1, 1, 0.5), dims=(4, 4, 8))
    alpha = np.zeros((8, 4, 4), dtype=np.float32)
    alpha[:4] = 1.0
    u = np.zeros((3, 8, 4, 4), dtype=np.float32)
    u[0] = 1.0
    write_timestep(tmp_path, 0, 10.0, {"alpha": alpha, "U": u})
    write_index(tmp_path, grid, [10.0], ["alpha", "U"])

    rows = energy_head_series(spec, tmp_path, "r")
    assert {r["location_id"] for r in rows} == {"qs_zulauf", "qs_ablauf"}
    e_soll = 92.0 + 1.0 / (2 * 9.81)
    for r in rows:
        assert r["value"] == pytest.approx(e_soll, abs=1e-6)

    df = pd.DataFrame(rows)
    tgt = next(t for t in spec.evaluation.targets if t.id == "verlust")
    out = _eval_target(df, tgt)
    assert out["result"] == "erfuellt"
    assert out["value"] == pytest.approx(0.0, abs=1e-9)


def test_extremwerte_mit_stat():
    df = pd.DataFrame(
        _rows("bed_shear", "r01", [(0, 3.0), (10, 1.0), (20, 2.0)])
        + _rows("bed_shear", "r01", [(0, 8.0), (10, 30.0)], comp="max")
        + _rows("level", "pegel", [(0, 94.0), (10, 95.5)]))
    ex = {(e["quantity"], e["component"]): e for e in _extremes(df)}
    assert ex[("bed_shear", "")]["value"] == pytest.approx(1.0)
    assert ex[("bed_shear", "")]["stat"] == "min"
    assert ex[("bed_shear", "max")]["value"] == pytest.approx(30.0)
    assert ex[("bed_shear", "max")]["stat"] == "max"
    assert ex[("level", "")]["stat"] == "max"
    assert ex[("level", "")]["value"] == pytest.approx(95.5)
