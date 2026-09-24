"""
Überfallbeiwert, Fahrplan C4 — eine Definition:
  Paare nur ausdrücklich (oder eindeutig: 1 Wehr, 1 Querschnitt, 1 Pegel),
  Krone = tiefster Punkt, H = h + ū²/2g aus den Planrastern,
  Median ab Beharrung (sonst letztes Drittel, ausgewiesen),
  Rückstaukontrolle über das Unterwasser neben der Krone.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ..core import casespec as cs
from ..core import evaluate as ev
from ..core.fields import VolumeGrid, write_index, write_timestep
from ..core.planfelder import PLAN_FELDER
from .synthetic_case import build_spec_stage3
from .test_ergebnis_erweiterungen import _rows

G = 9.81


def _wehr(id_, z=(95.0, 95.0), x=10):
    return cs.StructWeir(id=id_, type="weir", patch=id_,
                         crest_polyline=[(x, 4, z[0]), (x, 8, z[1])],
                         crest_width=0.8, slope_upstream=2.0, slope_downstream=2.0)


def _spec(*wehre, ziel=True):
    spec = build_spec_stage3()
    spec.structures.extend(wehre)
    if ziel:
        spec.evaluation.targets.append(cs.TargetOverfallCd(
            id="cd", kind="overfall_cd", weir=wehre[0].id,
            section=spec.evaluation.sections[0].id,
            gauge=spec.evaluation.gauges[0].id))
    return spec


def _q(cd, h, b=4.0):
    return cd * (2 / 3) * np.sqrt(2 * G) * b * h ** 1.5


def _df(spec, q, lv, zeiten=range(0, 30)):
    sec, gau = spec.evaluation.sections[0].id, spec.evaluation.gauges[0].id
    q = q if callable(q) else (lambda t, q=q: q)
    return pd.DataFrame(_rows("discharge", sec, [(t, q(t)) for t in zeiten])
                        + _rows("level", gau, [(t, lv) for t in zeiten]))


def test_paare_nur_eindeutig():
    def ein_querschnitt(spec):
        spec.evaluation.sections = spec.evaluation.sections[:1]
        return spec
    ein = ein_querschnitt(_spec(_wehr("w1"), ziel=False))
    assert [p[0] for p in ev.ueberfall_paare(ein)] == ["w1"]
    # zwei Wehre, ein Querschnitt: vorher bekamen BEIDE denselben Q
    zwei = ein_querschnitt(_spec(_wehr("w1"), _wehr("w2", x=20), ziel=False))
    assert ev.ueberfall_paare(zwei) == []
    # zwei Querschnitte: welcher gehört zum Wehr? Nur über ein Kriterium
    assert ev.ueberfall_paare(_spec(_wehr("w1"), ziel=False)) == []


def test_krone_ist_der_tiefste_punkt():
    spec = _spec(_wehr("w1", z=(95.0, 95.2)))
    df = _df(spec, _q(0.6, 0.5), 95.5)                 # h = 0,5 über dem TIEFSTEN
    cd = [r["value"] for r in ev.overfall_cd_rows(df, spec, "r")]
    assert np.median(cd) == pytest.approx(0.6, abs=1e-3)


def test_energiehoehe_aus_den_planrastern(tmp_path):
    spec = _spec(_wehr("w1"))
    gau = spec.evaluation.gauges[0]
    # Planraster mit ū = 1 m/s an der Pegelsäule → ū²/2g = 5,1 cm
    grid = VolumeGrid(origin=(gau.point[0] - 0.5, gau.point[1] - 0.5, 90),
                      spacing=(1, 1, 1), dims=(1, 1, 1))
    for i, t in enumerate((0.0, 30.0)):
        felder = {k: np.zeros((1, 1), np.float32) for k in PLAN_FELDER}
        felder["plan_ux"][:] = 1.0
        felder["plan_wsp"][:] = np.nan
        write_timestep(tmp_path, i, t, felder)
    write_index(tmp_path, grid, [0.0, 30.0], list(PLAN_FELDER))
    H = 0.5 + 1.0 / (2 * G)
    df = _df(spec, _q(0.6, H), 95.5)
    ohne = np.median([r["value"] for r in ev.overfall_cd_rows(df, spec, "r")])
    mit = np.median([r["value"] for r in ev.overfall_cd_rows(df, spec, "r", tmp_path)
                     if r["quantity"] == "overfall_cd"])
    assert mit == pytest.approx(0.6, abs=1e-3)
    assert ohne > mit                                  # h statt H überschätzt C_d


def _mit_reihe(spec, df):
    return pd.concat([df, pd.DataFrame(ev.overfall_cd_rows(df, spec, "r"))],
                     ignore_index=True)


def test_fenster_ab_beharrung(monkeypatch):
    spec = _spec(_wehr("w1"))
    # Anlauf bis 12 s mit C_d 0,4, danach 0,6 — der Median der ganzen Reihe
    # (bisheriger Nachweis) läge dazwischen
    df = _mit_reihe(spec, _df(spec, lambda t: _q(0.4 if t < 12 else 0.6, 0.5), 95.5))
    monkeypatch.setattr(ev, "kennwerte", lambda df, spec: {"bilanz": {"beharrung_ab": 12.0}})
    cd = ev.ueberfall_beiwert(df, spec, "w1")
    assert cd["wert"] == pytest.approx(0.6, abs=1e-3)
    assert cd["eingeschwungen"] and cd["fenster_ab"] == 12.0
    out = ev._eval_target(df, spec.evaluation.targets[-1], spec)
    assert out["value"] == pytest.approx(0.6, abs=1e-3)
    assert "Beharrung" in out["message"]


def test_nicht_eingeschwungen_letztes_drittel(monkeypatch):
    spec = _spec(_wehr("w1"))
    df = _mit_reihe(spec, _df(spec, lambda t: _q(0.4 if t < 20 else 0.6, 0.5), 95.5))
    monkeypatch.setattr(ev, "kennwerte", lambda df, spec: {"bilanz": {"beharrung_ab": None}})
    cd = ev.ueberfall_beiwert(df, spec, "w1")
    assert not cd["eingeschwungen"] and cd["fenster_ab"] >= 19.3
    assert "nicht eingeschwungen" in ev._eval_target(
        df, spec.evaluation.targets[-1], spec)["message"]


def test_rueckstau_unterwasser_ueber_krone(monkeypatch):
    spec = _spec(_wehr("w1"))
    df = _mit_reihe(spec, _df(spec, _q(0.6, 0.5), 95.5))
    df = pd.concat([df, pd.DataFrame(_rows("level", "w1_unterwasser",
                                           [(t, 95.2) for t in range(0, 30)]))],
                   ignore_index=True)
    monkeypatch.setattr(ev, "kennwerte", lambda df, spec: {"bilanz": {}})
    cd = ev.ueberfall_beiwert(df, spec, "w1")
    assert cd["frei"] is False and cd["unterwasser_ueber_krone"] == pytest.approx(0.2)
    assert "nicht frei" in ev._eval_target(df, spec.evaluation.targets[-1], spec)["message"]


def _wsp_raster(tmp_path, stromab):
    """Krone bei x = 2,5 (Höhe 0,6); stromauf 1,0; stromab je Abstand."""
    nx, ny, s = 20, 4, 0.25
    grid = VolumeGrid(origin=(0, 0, 0), spacing=(s, s, s), dims=(nx, ny, 1))
    wsp = np.full((ny, nx), 1.0, np.float32)
    for i in range(nx):
        x = (i + 0.5) * s
        if x > 2.5:
            wsp[:, i] = stromab(x - 2.5)
    felder = {k: np.zeros((ny, nx), np.float32) for k in PLAN_FELDER}
    felder["plan_wsp"] = wsp
    write_timestep(tmp_path, 0, 1.0, felder)
    write_index(tmp_path, grid, [1.0], list(PLAN_FELDER))
    return [(2.5, 0.1, 0.6), (2.5, 0.9, 0.6)]


def test_unterwasser_frei_trotz_strahl_auf_dem_wehrkoerper(tmp_path):
    """
    Direkt hinter der Kronenlinie liegt der Strahl noch 2 cm über der Krone
    (breite Krone, geneigte Flanke) — der erste Entwurf maß dort und meldete
    Rückstau (c5_wehr). Weiter stromab fällt der Spiegel unter die Krone.
    """
    from ..core.foamfields import unterwasser_an_linie
    krone = _wsp_raster(tmp_path, lambda d: 0.62 if d < 0.6 else 0.30)
    _, uw = unterwasser_an_linie(tmp_path, krone)
    assert uw[0] == pytest.approx(0.30)                  # < Krone 0,6: frei


def test_unterwasser_eingestaut(tmp_path):
    from ..core.foamfields import unterwasser_an_linie
    krone = _wsp_raster(tmp_path, lambda d: 0.70)
    _, uw = unterwasser_an_linie(tmp_path, krone)
    assert uw[0] == pytest.approx(0.70)                  # > Krone: nicht frei
