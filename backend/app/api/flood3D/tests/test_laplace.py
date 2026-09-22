"""
Stufenfreie Ergänzung (terrain.laplace_fuellen) — Etappe E6a (Audit G2/I4).

Bis 2026-09-22 liefen fest 400 Jacobi-Schritte, egal wie groß die Lücke:
12 m Fehler 0,000 m · 50 m 0,17 m · 100 m 0,59 m · 300 m 2,49 m — und der
Bericht sagte immer „stufenfrei ergänzt". Jetzt Rot-Schwarz-SOR mit
gitterabhängiger Relaxation, Schrittzahl nach Fenstergröße und ein
ehrlicher Konvergenzbericht. Die exakte Lösung zwischen zwei festen Reihen
ist die Gerade — daran wird gemessen.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.terrain import laplace_fuellen


def _luecke(n_frei: int, breite: int = 12):
    """Feste Reihe 0 m, n_frei freie Reihen, feste Reihe 10 m."""
    z = np.zeros((n_frei + 2, breite))
    z[-1, :] = 10.0
    fest = np.zeros_like(z, dtype=bool)
    fest[0, :] = fest[-1, :] = True
    soll = np.linspace(0.0, 10.0, n_frei + 2)[:, None] * np.ones((1, breite))
    return z, fest, soll


@pytest.mark.parametrize("n_frei", [20, 100, 300])
def test_lineare_luecke_wird_auf_unter_einen_zentimeter_geschlossen(n_frei):
    z, fest, soll = _luecke(n_frei)
    info: dict = {}
    aus = laplace_fuellen(z, fest, info=info)
    fehler = float(np.max(np.abs(aus - soll)))
    assert fehler < 0.01, (n_frei, fehler, info)        # vorher: 300 → 2,49 m
    assert info["konvergiert"] is True and info["schritte"] > 0
    assert info["relaxation"] > 1.5                       # SOR, nicht Jacobi
    np.testing.assert_allclose(aus[fest], z[fest])        # feste Knoten exakt


def test_zu_wenige_schritte_werden_ehrlich_gemeldet():
    z, fest, _ = _luecke(200)
    info: dict = {}
    laplace_fuellen(z, fest, schritte=5, info=info)
    assert info["konvergiert"] is False and info["schritte"] == 5
    assert info["restaenderung"] > 1e-4


def test_ohne_freie_oder_ohne_feste_knoten_passiert_nichts():
    z = np.arange(12.0).reshape(3, 4)
    info: dict = {}
    assert np.array_equal(laplace_fuellen(z, np.ones_like(z, bool), info=info), z)
    assert info["konvergiert"] is True and info["schritte"] == 0
    assert np.array_equal(laplace_fuellen(z, np.zeros_like(z, bool)), z)
