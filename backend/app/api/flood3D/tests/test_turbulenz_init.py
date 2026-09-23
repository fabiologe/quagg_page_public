"""
Fahrplan A2 (Audit F7): Turbulenz-Anfangs- und Randwerte aus Q und Fläche.

Bis 2026-09-23: k = 1e-4, omega = 1 als Literale, epsilon = 1 durch ein
wirkungsloses replace — kEpsilon startete mit nu_t ≈ 1e-9 (laminar),
kOmegaSST mit 1e-4, unabhängig vom Fall.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from ..core.casebuilder import (initial_fields, turbulenz_randwerte,
                                zulauf_lage, zulauf_turbulenz)
from ..core.terrain import TerrainField
from ..probe.faelle import K_Q, fall_k


def _uniform(text: str, patch: str | None = None) -> float:
    if patch is None:
        m = re.search(r"internalField\s+uniform\s+([-+\d.eE]+);", text)
    else:
        i = text.index(f"    {patch}\n")
        m = re.search(r"value\s+uniform\s+([-+\d.eE]+);", text[i:])
    return float(m.group(1))


def test_rechenbeispiel():
    # Q = 1 m³/s auf b = 2 m, h = 1 m: U = 0,5; D_h = 4·2/(2+2) = 2; L = 0,14
    t = turbulenz_randwerte(0.5, 0.07 * 2.0)
    assert t["k"] == pytest.approx(1.5 * (0.5 * 0.05) ** 2)          # 9,375e-4
    assert t["omega"] == pytest.approx(0.3993, rel=1e-3)
    assert t["epsilon"] == pytest.approx(3.369e-5, rel=1e-3)


def test_beide_modelle_starten_mit_derselben_wirbelviskositaet():
    t = turbulenz_randwerte(1.4, 0.04)
    nut_sst = t["k"] / t["omega"]
    nut_keps = 0.09 * t["k"] ** 2 / t["epsilon"]
    assert nut_sst == pytest.approx(nut_keps, rel=1e-9)
    assert nut_keps > 1e-5                           # alt: 9e-10 (laminar)


def test_fall_k_zulauf_aus_q_und_nasser_flaeche():
    spec = fall_k()
    feld = TerrainField.from_spec(spec.terrain, spec.domain, Path("."))
    b = spec.boundaries[0]
    lage = zulauf_lage(spec, b, feld)
    t = zulauf_turbulenz(spec, b, feld)
    assert t["u"] == pytest.approx(K_Q / lage["a_nass"])
    d_h = 4 * lage["a_nass"] / (1.0 + 2 * lage["h_start"])
    assert t["l"] == pytest.approx(0.07 * d_h)
    f = initial_fields(spec, Path("."))
    assert _uniform(f["k"], "inlet") == pytest.approx(t["k"], rel=1e-5)
    assert _uniform(f["omega"], "inlet") == pytest.approx(t["omega"], rel=1e-5)
    assert _uniform(f["k"]) == pytest.approx(t["k"], rel=1e-5)       # Innenfeld


def test_kepsilon_bekommt_eigene_epsilon_werte():
    spec = fall_k()
    spec.solver.turbulence = "kEpsilon"
    f = initial_fields(spec, Path("."))
    k, eps = _uniform(f["k"], "inlet"), _uniform(f["epsilon"], "inlet")
    assert eps != pytest.approx(_uniform(f["omega"], "inlet"))       # kein Omega-Abklatsch
    assert 0.09 * k * k / eps > 1e-5
    assert "epsilonWallFunction" in f["epsilon"]


def test_leerlauf_ohne_zulauf_ruhiges_wasser():
    spec = fall_k()
    spec.boundaries = [b for b in spec.boundaries if not b.type.startswith("inflow")]
    spec.solver.initial_level = 100.3
    f = initial_fields(spec, Path("."))
    t = turbulenz_randwerte(0.1, spec.mesh.base_cell)
    assert _uniform(f["k"]) == pytest.approx(t["k"], rel=1e-5)
