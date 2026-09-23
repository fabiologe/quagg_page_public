"""
Etappe E7 (Audit G1): der freie Ablauf hängt nicht an der absoluten
Höhenlage.

Gegenlauf 2026-09-22 (sechs interFoam-Läufe im Docker `quagg-foam-local`,
Becken 8 × 3 m mit 0,6 m Startwasser, Zahlen in
docs/AUDIT_FLOOD3D_FALLSPEZIFISCH.md): mit `totalPressure p0 0` und
`hRef 0` sog der Rand bei z = 96 m mit 33 m/s, bei z = 296 m mit 57 m/s,
die Ablaufganglinien unterschieden sich um 7 %, 0,6 m³ verschwanden in den
ersten 50 ms. Mit `prghTotalPressure` und hRef im Gebiet: beide Höhen auf
die letzte Stelle gleich, 5 m/s am Rand, kein Anfangsstoß.

Ein interFoam-Lauf gehört nicht in die Suite. Gemessen wird deshalb die
ECHTE Schnittstelle des Fallbaus — 0/p_rgh und constant/hRef — an genau dem
Fall des Gegenlaufs, einmal bei 96 m und einmal 200 m höher.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from ..core import casespec as cs
from ..core.casebuilder import build_case, h_ref, initial_fields
from ..core.evaluate import ABLAUFDRUCK_KORRIGIERT, altlauf_hinweise


def becken(T: float) -> cs.CaseSpec:
    """Der Fall des Gegenlaufs: flaches Gelände auf T, Ablauf über x_max."""
    return cs.CaseSpec(
        meta=cs.Meta(id=f"e7-{int(T)}"),
        domain=cs.Domain(extent=(0.0, 0.0, 8.0, 3.0), z_min=T - 0.5, z_max=T + 2.0),
        terrain=cs.Terrain(base=cs.TerrainBase(source=f"flat:{T}", resolution=0.5),
                           operations=[], erdkoerper="an"),
        structures=[],
        mesh=cs.Mesh(base_cell=0.25),
        solver=cs.Solver(application="interFoam", end_time=6.0,
                         initial_level=T + 0.6, write_interval_fields=1.0,
                         write_interval_series=0.05),
        boundaries=[
            cs.BcOutflowFree(id="ablauf", patch="outlet", type="outflow_free",
                             face="x_max"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ])


def _block(text: str, patch: str) -> str:
    m = re.search(rf"\n    {patch}\n    \{{\n(.*?)\n    \}}", text, re.S)
    assert m, f"Patch {patch} fehlt"
    return m.group(1)


def test_ablaufrand_ist_bei_96_und_296_derselbe():
    tief, hoch = becken(96.0), becken(296.0)
    a = _block(initial_fields(tief, Path("."))["p_rgh"], "outlet")
    b = _block(initial_fields(hoch, Path("."))["p_rgh"], "outlet")
    assert a == b
    assert "prghTotalPressure" in a
    assert not re.search(r"\d{2,}", a), "keine Höhenlage im Randblock"
    # hRef liegt im Gebiet, in beiden Fällen gleich weit unter dem Gelände
    assert h_ref(tief) - tief.domain.z_min == pytest.approx(0.0)
    assert h_ref(hoch) - hoch.domain.z_min == pytest.approx(0.0)
    assert h_ref(tief) != 0.0                       # der alte Rückfall


def test_atmosphaere_bleibt_hydrostatisch_fuer_die_luft():
    p = initial_fields(becken(96.0), Path("."))["p_rgh"]
    assert "totalPressure" in _block(p, "atmosphere")
    assert "prghTotalPressure" not in _block(p, "atmosphere")


def test_fallbau_schreibt_hRef_im_gebiet(tmp_path):
    spec = becken(96.0)
    spec.to_yaml(tmp_path / "case.yaml")
    info = build_case(spec, tmp_path / "case", tmp_path)
    assert not info["problems"]
    href = (tmp_path / "case" / "constant" / "hRef").read_text()
    assert re.search(r"value\s+95\.5;", href), href
    p = (tmp_path / "case" / "0" / "p_rgh").read_text()
    assert "prghTotalPressure" in _block(p, "outlet")


def test_fester_pegel_setzt_hRef_der_freie_ablauf_bleibt_freistrahl():
    spec = becken(96.0)
    spec.boundaries.append(cs.BcOutflowFixedLevel(
        id="unterwasser", patch="unterwasser", type="outflow_fixed_level",
        face="y_max", level=96.3))
    assert h_ref(spec) == pytest.approx(96.3)
    p = initial_fields(spec, Path("."))["p_rgh"]
    fest = _block(p, "unterwasser")
    assert "fixedValue" in fest and "uniform 0" in fest   # rho*g*(L - hRef) = 0
    assert "prghTotalPressure" in _block(p, "outlet")


# ---- Altläufe -------------------------------------------------------------

def test_altlauf_vor_der_korrektur_traegt_den_vorbehalt():
    alt = altlauf_hinweise({"finished": 1786735147.0})   # 2026-08-14
    assert len(alt) == 1 and alt[0]["severity"] == "hinweis"
    assert alt[0]["quelle"] == "ablaufdruck"
    assert altlauf_hinweise({"finished": ABLAUFDRUCK_KORRIGIERT + 60}) == []
    assert altlauf_hinweise({}) == []
    # Reservierung ohne Ende: das Anlegedatum zählt
    assert altlauf_hinweise({"created": 1786735147.0})


def test_laufendpunkt_ergaenzt_den_vorbehalt_ohne_zu_speichern(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from .. import router as router_mod

    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    alt = tmp_path / "runs" / "alt_r001"
    alt.mkdir(parents=True)
    manifest_alt = {"status": "completed", "finished": 1786735147.0,
                    "befunde": [{"object_id": "qualitaet", "severity": "warnung",
                                 "message": "y+ bis 53.360"}]}
    (alt / "manifest.json").write_text(json.dumps(manifest_alt))
    neu = tmp_path / "runs" / "neu_r001"
    neu.mkdir()
    from ..core.conventions import NUMERIK_VERSION
    (neu / "manifest.json").write_text(json.dumps(
        {"status": "completed", "finished": ABLAUFDRUCK_KORRIGIERT + 60,
         "numerik_version": NUMERIK_VERSION}))
    # der verifizierte Stand kommt sonst aus data/verifikation (echte Ablage)
    monkeypatch.setattr(router_mod, "_verifizierte_numerik", lambda: NUMERIK_VERSION)

    app = FastAPI(); app.include_router(router_mod.router)
    client = TestClient(app)
    b_alt = client.get("/runs/alt_r001").json()["manifest"]["befunde"]
    assert [b["severity"] for b in b_alt] == ["warnung", "hinweis", "hinweis"]
    assert [b.get("quelle") for b in b_alt[1:]] == ["ablaufdruck", "numerik"]
    b_neu = client.get("/runs/neu_r001").json()["manifest"].get("befunde") or []
    assert b_neu == []
    # das Manifest auf der Platte bleibt, wie es war
    assert json.loads((alt / "manifest.json").read_text()) == manifest_alt
