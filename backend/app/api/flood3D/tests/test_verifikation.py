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
    # NICHT tmp_path: das liegt unter /tmp, und Snap-Docker mountet
    # /tmp-Pfade leer in den Container (die dokumentierte Falle) — der
    # Arbeitsordner liegt deshalb neben den Verifikationsergebnissen
    daten = Path(__file__).resolve().parents[1] / "data" / "verifikation"
    arbeit = daten / "_arbeit"
    if arbeit.exists():
        import shutil
        shutil.rmtree(arbeit)
    arbeit.mkdir(parents=True, exist_ok=True)
    ergebnis = verifikation_rechnen(arbeit, daten / "wehr_ueberfall.json")
    assert ergebnis["bestanden"], (
        f"C_d = {ergebnis['cd_sim']} außerhalb {ergebnis['band']} "
        f"({ergebnis['band_art']})")
