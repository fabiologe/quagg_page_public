"""
R0-Lauf-Fixes (PostProcessing-Audit 2026-08-05): Reihenfolge der
Funktionsobjekte, einheitlicher utilisation-Schlüssel und das
Validierungs-Tor vor dem Laufstart.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import casespec as cs
from ..core.casebuilder import function_objects
from ..core.evaluate import evaluate_run
from ..router import router
from .synthetic_case import build_spec_stage3


def test_wall_shear_vor_seinen_lesern():
    """wall_shear muss VOR tau_betrag/shear_* deklariert sein — OpenFOAM
    arbeitet functions in Reihenfolge ab; sonst ist der erste Messwert
    kaputt und jeder weitere einen Schreibschritt alt."""
    spec = build_spec_stage3()
    out = function_objects(spec)
    assert "wall_shear" in out and "tau_betrag" in out
    assert out.index("wall_shear") < out.index("tau_betrag")
    assert out.index("tau_betrag") < out.index("shear_")


def test_c2_targets_schreiben_utilisation():
    """Ein Schluessel fuer alle Targets — der TargetsPanel-Leser kennt
    nur 'utilisation'."""
    spec = build_spec_stage3()
    for b in spec.boundaries:
        if b.type == "inflow_constant":
            b.q = 2.0
    t = np.linspace(0, 100, 101)
    zeilen = [{"run_id": "r", "time": float(ti), "quantity": "volume",
               "location_id": "domain", "component": "", "value": 100 + 0.5 * ti,
               "unit": "", "source": "test"} for ti in t]
    df = pd.DataFrame(zeilen)
    spec.evaluation.targets = [cs.TargetMassenbilanz(
        id="nw_b", kind="massenbilanz", limit_max=0.02)]
    ziel = evaluate_run(df, spec, "r")["targets"][0]
    assert "utilization" not in ziel
    assert ziel["utilisation"] is not None
    assert ziel["unit"] == "-"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path))
    (tmp_path / "kaputt").mkdir()
    spec = build_spec_stage3()
    # Vorfuellungs-Spiegel weit ausserhalb des Gebiets -> Fehler-Befund
    spec.solver.vorfuellungen = [cs.Vorfuellung(
        id="v", polygon=[[4, 4], [8, 4], [8, 8], [4, 8]], level=999.0)]
    spec.to_yaml(tmp_path / "kaputt" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_laufstart_verweigert_fehlerfall(client):
    """Ein Fall mit Fehler-Befund darf keinen Lauf starten — der stirbt
    sonst erst im Container, nach bezahlter Vorlaufzeit."""
    r = client.post("/runs", json={"case_id": "kaputt"})
    assert r.status_code == 422
    assert "Fehler-Befunde" in r.json()["detail"]


def test_doppelbelegte_seite_ist_befund_kein_absturz(tmp_path):
    """
    Zulauf und Ablauf auf derselben Gebietsseite („Seite wechseln"): die
    Prüfung muss das als Befund melden — nicht als ValueError, der PUT
    und Preview mit 500 umreißt und den Fall auf der Platte festsetzt.
    """
    from ..core.casebuilder import _bc_face
    from ..core.validate import validate_case

    spec = build_spec_stage3()
    ablauf = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    zulauf = next(b for b in spec.boundaries if b.type.startswith("inflow"))
    ablauf.face = "x_min"
    zulauf.face = "x_min"
    befunde = validate_case(spec, tmp_path)         # darf nicht werfen
    assert any(b["severity"] == "fehler" and "belegt" in b["message"]
               for b in befunde)
    assert _bc_face(spec, ablauf) == "x_min"
