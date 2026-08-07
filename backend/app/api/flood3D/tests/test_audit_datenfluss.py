"""
Audit Datenfluss (2026-08-07): Preprocessing → Solver → Ergebnis → Anzeige.

Jeder Test friert einen der Audit-Fixes ein:
  P1-1  discharge-Ebene auf die gezeichnete Linie begrenzt (bounds)
  P1-2  height.dat-Fallback liefert wieder ABSOLUTE Pegel
  P1-3  ρ-Umrechnung der Schubspannungs-Zeitreihe folgt den Dimensionen
  P1-4  Massenbilanz kennt Hydrographen (gemessener patchflow)
  P2-6  fill=NaN statt 0 für Nicht-Alpha-Felder
  P3-12 Volumen-Selbsttest Visualisierungsgitter vs. Solver
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ..core import casespec as cs
from ..core.casebuilder import fenster_flaeche, function_objects
from ..core.evaluate import _zufluss_reihe, kennwerte
from ..core.extract.readers import read_gauge, wall_shear_rho_factor
from ..core.fields import VolumeGrid, resample_points, write_index, write_timestep
from ..core.foamfields import viz_volume_check
from .synthetic_case import build_spec_stage3


# --------------------------------------------------------------------------
# P1-1: discharge-bounds
# --------------------------------------------------------------------------

def test_discharge_ebene_umfasst_alle_polylinienpunkte():
    """Die bounds-Box muss auch ZWISCHENPUNKTE der Polylinie einschließen —
    Mitte/Normale kommen weiterhin aus den Endpunkten."""
    spec = build_spec_stage3()
    spec.evaluation.sections = [cs.Section(
        id="knick", polyline=[(4, 2), (15, 9), (4, 16)])]
    out = function_objects(spec)
    zeile = next(line for line in out.splitlines() if "bounds" in line)
    pad = spec.mesh.base_cell
    # x reicht bis zum Zwischenpunkt x=15 plus Polster, nicht nur bis 4
    assert f"({4 - pad:g} {2 - pad:g}" in zeile
    assert f"({15 + pad:g} {16 + pad:g}" in zeile


def test_discharge_ohne_domain_bleibt_unbegrenzt():
    spec = build_spec_stage3()
    spec.domain = None
    out = function_objects(spec)
    assert "discharge_qs_zulauf" in out
    assert "bounds" not in out


# --------------------------------------------------------------------------
# P1-2: height.dat-Fallback
# --------------------------------------------------------------------------

def test_height_dat_fallback_addiert_bezugshoehe(tmp_path):
    fo = tmp_path / "gauge_p1" / "0"
    fo.mkdir(parents=True)
    (fo / "height.dat").write_text("# Time height\n0 0.4\n1 0.5\n")
    rows = read_gauge(tmp_path / "gauge_p1", "p1", 96.0, "r")
    assert [r["value"] for r in rows] == pytest.approx([96.4, 96.5])


def test_position_dat_bleibt_absolut(tmp_path):
    fo = tmp_path / "gauge_p1" / "0"
    fo.mkdir(parents=True)
    (fo / "position.dat").write_text("# Time x y z\n0 4 8 97.3\n")
    rows = read_gauge(tmp_path / "gauge_p1", "p1", 96.0, "r")
    # z-Spalte ist bereits absolut — z_ref darf NICHT addiert werden
    assert rows[0]["value"] == pytest.approx(97.3)


# --------------------------------------------------------------------------
# P1-3: ρ-Faktor aus den Felddimensionen
# --------------------------------------------------------------------------

def _case_mit_wss(tmp_path, dimensions):
    d = tmp_path / "1"
    d.mkdir()
    (d / "wallShearStress").write_text(
        f"FoamFile\n{{}}\ndimensions      [{dimensions}];\n"
        "internalField   uniform (0 0 0);\n")
    return tmp_path


def test_rho_faktor_kinematisch(tmp_path):
    case = _case_mit_wss(tmp_path, "0 2 -2 0 0 0 0")
    assert wall_shear_rho_factor(case) == pytest.approx(1000.0)


def test_rho_faktor_dynamisch(tmp_path):
    case = _case_mit_wss(tmp_path, "1 -1 -2 0 0 0 0")
    assert wall_shear_rho_factor(case) == pytest.approx(1.0)


def test_rho_faktor_ohne_felddatei_bleibt_interfoam_annahme(tmp_path):
    assert wall_shear_rho_factor(tmp_path) == pytest.approx(1000.0)


# --------------------------------------------------------------------------
# P1-4: Hydrograph in der Massenbilanz
# --------------------------------------------------------------------------

def _df(reihen):
    zeilen = []
    for (quantity, ort, comp), (t, v) in reihen.items():
        for ti, vi in zip(t, v):
            zeilen.append({"run_id": "r", "time": float(ti),
                           "quantity": quantity, "location_id": ort,
                           "component": comp, "value": float(vi),
                           "unit": "", "source": "test"})
    return pd.DataFrame(zeilen)


def _spec_mit_hydrograph():
    spec = build_spec_stage3()
    for i, b in enumerate(spec.boundaries):
        if b.type == "inflow_constant":
            spec.boundaries[i] = cs.BcInflowHydrograph(
                id=b.id, type="inflow_hydrograph", patch=b.patch,
                source="ganglinie.csv")
    return spec


def test_zufluss_reihe_nimmt_gemessenen_patchflow():
    spec = _spec_mit_hydrograph()
    patch = next(b.patch for b in spec.boundaries
                 if b.type == "inflow_hydrograph")
    t = np.linspace(0, 100, 11)
    # patchflow: positiv = verlässt das Gebiet → Zufluss steht negativ drin
    df = _df({("discharge", patch, ""): (t, -2.0 * np.ones_like(t))})
    reihe, fehlt = _zufluss_reihe(df, spec, t)
    assert not fehlt
    assert reihe == pytest.approx(2.0 * np.ones_like(t))


def test_massenbilanz_mit_hydrograph_nicht_mehr_stumm():
    """Vorher: zufluss = 0 → anteil None → Target still nicht_auswertbar."""
    spec = _spec_mit_hydrograph()
    patch = next(b.patch for b in spec.boundaries
                 if b.type == "inflow_hydrograph")
    t = np.linspace(0, 120, 121)
    vol = np.where(t < 60, 100 + 2.0 * t, 220.0)
    df = _df({("volume", "domain", ""): (t, vol),
              ("discharge", patch, ""): (t, -2.0 * np.ones_like(t))})
    b = kennwerte(df, spec)["bilanz"]
    assert b["zufluss"] == pytest.approx(2.0)
    assert b["anteil"] is not None
    assert "zufluss_unvollstaendig" not in b


def test_hydrograph_ohne_messreihe_wird_gekennzeichnet():
    spec = _spec_mit_hydrograph()
    t = np.linspace(0, 120, 121)
    df = _df({("volume", "domain", ""): (t, 100 + 2.0 * t)})
    b = kennwerte(df, spec)["bilanz"]
    assert b["zufluss_unvollstaendig"]


# --------------------------------------------------------------------------
# P1-5: Fensterfläche (Grundlage der Q→U-Ausweisung)
# --------------------------------------------------------------------------

def test_fenster_flaeche_ohne_fenster_ist_die_gebietsseite():
    spec = build_spec_stage3()
    zufluss = next(b for b in spec.boundaries if b.type == "inflow_constant")
    x0, y0, x1, y1 = spec.domain.extent
    erwartet = (y1 - y0) * (spec.domain.z_max - spec.domain.z_min)
    assert fenster_flaeche(spec, zufluss) == pytest.approx(erwartet)


# --------------------------------------------------------------------------
# P2-6: fill=NaN
# --------------------------------------------------------------------------

def test_resample_fill_nan_bleibt_von_echten_nullen_unterscheidbar():
    grid = VolumeGrid(origin=(0, 0, 0), spacing=(1, 1, 1), dims=(2, 1, 1))
    punkte = np.array([[0.5, 0.5, 0.5]])       # nur die erste Zelle belegt
    werte = np.array([0.0])                     # eine ECHTE Null
    aus = resample_points(punkte, werte, grid, fill=np.nan)
    flach = aus.ravel()
    assert flach[0] == 0.0                      # gerechnete Null bleibt Null
    assert np.isnan(flach[1])                   # Füllwert ist NaN, nicht 0


# --------------------------------------------------------------------------
# P3-12: Volumen-Selbsttest
# --------------------------------------------------------------------------

def test_viz_volume_check_misst_die_abweichung(tmp_path):
    grid = VolumeGrid(origin=(0, 0, 0), spacing=(1, 1, 1), dims=(2, 2, 2))
    # α-Summe 4 → 4 m³ im Visualisierungsgitter
    alpha = np.zeros(grid.shape_zyx, dtype=np.float32)
    alpha[0, :, :] = 1.0
    write_timestep(tmp_path, 0, 10.0, {"alpha": alpha})
    write_index(tmp_path, grid, [10.0], ["alpha"])
    # Solver sagt 5 m³ → 20 % Abweichung
    df = _df({("volume", "domain", ""): ([0.0, 20.0], [5.0, 5.0])})
    check = viz_volume_check(tmp_path, df)
    assert check["viz_volume_error_rel_max"] == pytest.approx(0.2)


def test_viz_volume_check_ohne_felder_ist_none(tmp_path):
    df = _df({("volume", "domain", ""): ([0.0], [5.0])})
    assert viz_volume_check(tmp_path, df) is None
