"""
Modellfehler muessen lesbar sein.

Auslöser (Testrunde 2026-08-16): beim Speichern eines Durchlasses mit
Maulprofil stand in der Meldungsleiste woertlich

    Speichern fehlgeschlagen: 1 validation error for CaseSpec
    structures.0.culvert.profile Value error, arch-Profil braucht width und
    height [type=value_error, input_value={'kind': 'arch', 'diamete...},
    input_type=dict] For further information visit
    https://errors.pydantic.dev/2.12/v/value_error

Richtig war, DASS der Fehler kam. Falsch war, wie er aussah: der Nutzer
braucht die Fundstelle und den Grund — nicht den Eingabewert, den er
selbst gerade getippt hat, und keine Verweis-URL auf die Bibliothek.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core.casespec import CaseSpec, CulvertProfile, GrabenProfil
from ..router import _lesbar, router
from .synthetic_case import build_spec_stage3


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _maulfall() -> dict:
    """Ein Fall mit dem Fehler, den Fabio ausgeloest hat: Profilart auf
    Maul gestellt, aber nur der Durchmesser des Kreises gesetzt."""
    spec = build_spec_stage3().model_dump(mode="json")
    spec["structures"].append({
        "id": "d1", "type": "culvert", "patch": "d1",
        "axis": [[0, 0, 100], [5, 0, 100]],
        "profile": {"kind": "arch", "diameter": 0.8, "wandstaerke": 0.1}})
    return spec


def test_meldung_nennt_ort_und_grund_ohne_bibliotheksballast():
    try:
        CaseSpec.model_validate(_maulfall())
        pytest.fail("haette scheitern muessen")
    except Exception as e:
        text = _lesbar(e)

    assert "Bauwerk" in text and "Durchlass" in text and "Profil" in text
    assert "Breite und Höhe" in text
    # das, was den Text bisher unlesbar machte
    assert "input_value" not in text
    assert "pydantic.dev" not in text
    assert "type=value_error" not in text
    assert "\n" not in text                    # eine Zeile, passt in die Leiste


def test_speichern_liefert_denselben_lesbaren_text(client):
    res = client.put("/cases/demo", json=_maulfall())
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert "Bauwerk" in detail and "Breite und Höhe" in detail
    assert "pydantic.dev" not in detail


def test_entwurf_meldet_lesbar_statt_zu_scheitern(client):
    """Die Vorschau antwortet bewusst mit 200 und einem Befund — der Text
    darin ist derselbe."""
    res = client.post("/cases/demo/preview", json=_maulfall())
    assert res.status_code == 200
    meldung = res.json()["validation"][0]["message"]
    assert "Breite und Höhe" in meldung and "pydantic.dev" not in meldung


def test_profilmeldungen_sprechen_die_sprache_des_panels():
    """Die Modelltexte selbst — sie stehen unveraendert vor dem Nutzer."""
    for kind, erwartet in (("rectangular", "Rechteckprofil"),
                           ("arch", "Maulprofil"),
                           ("circular", "Durchmesser")):
        with pytest.raises(Exception) as ex:
            CulvertProfile(kind=kind)
        assert erwartet in str(ex.value)
        assert "width" not in str(ex.value) and "height" not in str(ex.value)

    with pytest.raises(Exception) as ex:
        GrabenProfil(kind="trapez", width=1.0)
    assert "Trapezprofil" in str(ex.value) and "Höhe" in str(ex.value)


def test_ein_fremder_fehler_bleibt_unveraendert():
    """`_lesbar` ist fuer Modellfehler da — alles andere darf es nicht
    verschlucken."""
    assert _lesbar(ValueError("Datei fehlt")) == "Datei fehlt"
