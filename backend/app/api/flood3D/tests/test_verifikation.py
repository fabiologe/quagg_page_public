"""
Physikalische Verifikation (Spez. Kap. 13) — läuft NICHT in der
Standard-Suite (braucht Docker/OpenFOAM und Minuten Rechenzeit):

    FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest \
        app/api/flood3D/tests/test_verifikation.py -q

Nach jeder Änderung an casebuilder/meshgen/solids und vor jedem Release
ausführen. Das Ergebnis landet in data/verifikation/ und wird im Client
(Phase „Simulation") angezeigt.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from .verifikation_wehr import verifikation_rechnen

pytestmark = pytest.mark.skipif(
    not os.environ.get("FLOOD3D_VERIFIKATION"),
    reason="Verifikationslauf nur mit FLOOD3D_VERIFIKATION=1 "
           "(Docker + Minuten Rechenzeit)")


def test_wehr_ueberfall_gegen_ueberfallformel():
    # Fall und Lauf landen in den NORMALEN Ablagen (data/cases, data/runs)
    # — nicht unter /tmp (Snap-Docker mountet /tmp-Pfade leer in den
    # Container, die dokumentierte Falle) und im Werkzeug anwählbar
    daten = Path(__file__).resolve().parents[1] / "data" / "verifikation"
    ergebnis = verifikation_rechnen(daten / "wehr_ueberfall.json")
    assert ergebnis["bestanden"], (
        f"C_d = {ergebnis['cd_sim']} außerhalb {ergebnis['band']} "
        f"({ergebnis['band_art']})")
