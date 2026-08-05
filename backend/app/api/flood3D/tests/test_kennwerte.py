"""
Stufe C2: die Browser-Kennwerte leben jetzt im Backend — Bilanz,
Verweilzeit und Hebelarm stehen in result.json und sind als benannte
Nachweise (massenbilanz, kurzschluss, verweilzeit_min) prüfbar.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ..core import casespec as cs
from ..core.evaluate import evaluate_run, kennwerte
from .synthetic_case import build_spec_stage3


def _df(reihen):
    zeilen = []
    for (quantity, ort, comp), (t, v) in reihen.items():
        for ti, vi in zip(t, v):
            zeilen.append({"run_id": "r", "time": float(ti),
                           "quantity": quantity, "location_id": ort,
                           "component": comp, "value": float(vi),
                           "unit": "", "source": "test"})
    return pd.DataFrame(zeilen)


@pytest.fixture()
def spec():
    s = build_spec_stage3()
    for b in s.boundaries:
        if b.type == "inflow_constant":
            b.q = 2.0
    s.evaluation.force_patches = ["wand_becken"]
    return s


def test_bilanz_und_beharrung(spec):
    t = np.linspace(0, 120, 121)
    vol = np.where(t < 60, 100 + 2.0 * t, 220.0)
    df = _df({("volume", "domain", ""): (t, vol)})
    kw = kennwerte(df, spec)
    b = kw["bilanz"]
    assert b["zufluss"] == 2.0
    assert b["anteil"] == pytest.approx(0.0, abs=1e-6)
    assert b["beharrung_ab"] is not None and 55 <= b["beharrung_ab"] <= 70
    assert b["austausch"] == pytest.approx(2.0 * 120 / 220, abs=0.01)


def test_verweilzeit_und_kurzschluss(spec):
    t = np.linspace(0, 200, 201)
    vol = np.full_like(t, 300.0)
    tracer = np.clip((t - 20) / 120, 0, 1)
    df = _df({("volume", "domain", ""): (t, vol),
              ("tracer", "ablauf", ""): (t, tracer)})
    kw = kennwerte(df, spec)
    v = kw["verweilzeit"]
    assert v["tau"] == pytest.approx(150.0)
    assert v["t10"] == pytest.approx(32.0, abs=0.5)
    assert v["kurzschluss"] == pytest.approx(32 / 150, abs=0.01)

    spec.evaluation.targets = [cs.TargetKurzschluss(
        id="nw_k", kind="kurzschluss", limit_min=0.3)]
    res = evaluate_run(df, spec, "r")
    ziel = res["targets"][0]
    assert ziel["result"] == "nicht_erfuellt"
    assert res["kennwerte"]["verweilzeit"]["kurzschluss"] == ziel["value"]


def test_hebelarm_der_resultierenden(spec):
    t = np.array([0.0, 10.0])
    df = _df({("volume", "domain", ""): (t, [100, 100]),
              ("force", "wand_becken", "x"): (t, [0, 3000.0]),
              ("force", "wand_becken", "y"): (t, [0, 4000.0]),
              ("moment", "wand_becken", "magnitude"): (t, [0, 10000.0])})
    kw = kennwerte(df, spec)
    b = kw["bauwerke"]["wand_becken"]
    assert b["horizontalkraft"] == pytest.approx(5000.0)
    assert b["hebelarm"] == pytest.approx(2.0)


def test_massenbilanz_als_nachweis(spec):
    t = np.linspace(0, 100, 101)
    vol = 100 + 0.5 * t
    df = _df({("volume", "domain", ""): (t, vol)})
    spec.evaluation.targets = [cs.TargetMassenbilanz(
        id="nw_b", kind="massenbilanz", limit_max=0.02)]
    res = evaluate_run(df, spec, "r")
    ziel = res["targets"][0]
    assert ziel["value"] == pytest.approx(0.25, abs=0.01)
    assert ziel["result"] == "nicht_erfuellt"
