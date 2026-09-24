"""
Harness-Probe (Fahrplan A6): Fall K einmal wirklich rechnen — im Server-
Docker, 7–10 min, 0 € — und die Hülle an fünf Zahlen messen. Der Solver
bleibt unverändert; was hier bricht, haben WIR gebaut (Randbedingung,
Anfangsfeld, functionObject). Nicht in der Standard-Suite:

    cd backend
    FLOOD3D_PROBE=1 venv/bin/python -m pytest app/api/flood3D/tests/test_harness_probe.py -q

Regel (BETRIEB): nach jeder Änderung an casebuilder, meshgen oder den
Schemata ausführen. Die Zahlen stehen danach in data/probe_a/test_k/probe.json.
"""
from __future__ import annotations

import json
import os
import shutil

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("FLOOD3D_PROBE"),
    reason="rechnet OpenFOAM im Docker (7–10 min) — FLOOD3D_PROBE=1 setzen")


@pytest.fixture(scope="module")
def probe():
    if shutil.which("docker") is None:
        pytest.skip("kein docker")
    from ..probe import probe_lauf
    probe_lauf.main(["--fall", "k", "--name", "test_k"])
    return json.loads((probe_lauf.WURZEL / "test_k" / "probe.json").read_text())


def test_kein_wasservorhang_am_zulauf(probe):
    from pathlib import Path

    from ..core.casebuilder import zulauf_lage
    from ..core.terrain import TerrainField
    from ..probe.faelle import fall_k
    spec = fall_k()
    lage = zulauf_lage(spec, spec.boundaries[0],
                       TerrainField.from_spec(spec.terrain, spec.domain, Path(".")))
    assert probe["z_zulauf_max_1s"]["inlet"] <= lage["z_start"] + spec.mesh.base_cell


def test_massenbilanz_schliesst(probe):
    assert probe["massenfehler"] < 0.01


def test_zulauf_liefert_das_vorgegebene_q(probe):
    from ..probe.faelle import K_Q
    # Wasser, nicht Gemisch: mit upperBound 0,9 fehlten bei 15 s 4 %
    assert probe["q_zu_ende"]["inlet"] == pytest.approx(K_Q, rel=0.01)


def test_tracer_bilanz(probe):
    # Zufluss − Ablauf − Σ α·T·V am Ende. Ohne Phasenbindung 50 % (a2_k),
    # mit 6,6 % (a3_k) bzw. 8,8 % mit upperBound 0,5 (a5b_k, 2026-09-23). Der Rest liegt vermutlich an der
    # flächengewichteten Ablauf-Konzentration (weightedAverage) — eine
    # Definitionsfrage für Stufe B. Die Schwelle hält den Stand fest.
    assert probe["tracer_verlust"] < 0.10


def test_planraster_volumentreu(probe):
    # Fahrplan C2: Σ h·A aus den echten Zellen gegen die Volumenreihe des
    # Solvers. Das Voxel-Raster lag bei 34–100 % daneben (Audit F4).
    assert probe["plan_volume_error_rel_max"] < 0.01
