"""
Gelände-Sculpting: Pinsel-Patches als Delta-Ebene (core/sculpt.py).

Alle Pinsel erzeugen dasselbe — ein dz-Teilfeld in Gitterindizes. Die
Ebene ist Primärdatum im Fallordner, wirkt nach dem Operationsstapel,
trägt einen Stand-Stempel (case_hash/Netzvorschau) und dreht mit.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.casespec import CaseSpec
from ..core.sculpt import SCULPT_DATEI, patch_anwenden
from ..core.terrain import TerrainField
from .synthetic_case import build_spec_stage3


@pytest.fixture()
def spec():
    s = build_spec_stage3()
    s.terrain.operations = []
    return s


def _feld(spec, d):
    return TerrainField.from_spec(spec.terrain, spec.domain, d)


def test_patch_hebt_das_gelaende(spec, tmp_path):
    vorher = _feld(spec, tmp_path).z.copy()
    dz = np.full((5, 5), 0.8)
    patch_anwenden(spec, tmp_path, [{"i0": 4, "j0": 4, "dz": dz.tolist()}])
    assert spec.terrain.sculpt == SCULPT_DATEI
    assert (tmp_path / SCULPT_DATEI).exists()
    nachher = _feld(spec, tmp_path).z
    assert nachher[6, 6] == pytest.approx(vorher[6, 6] + 0.8)
    assert nachher[0, 0] == pytest.approx(vorher[0, 0])       # außerhalb


def test_inverses_patch_ist_rueckgaengig(spec, tmp_path):
    vorher = _feld(spec, tmp_path).z.copy()
    dz = np.full((3, 4), 1.5)
    patch_anwenden(spec, tmp_path, [{"i0": 2, "j0": 3, "dz": dz.tolist()}])
    stand1 = spec.terrain.sculpt_stand
    patch_anwenden(spec, tmp_path, [{"i0": 2, "j0": 3, "dz": (-dz).tolist()}])
    assert spec.terrain.sculpt_stand != stand1
    np.testing.assert_allclose(_feld(spec, tmp_path).z, vorher, atol=1e-6)


def test_stand_stempel_aendert_case_hash(spec, tmp_path):
    h0 = spec.case_hash()
    patch_anwenden(spec, tmp_path,
                   [{"i0": 0, "j0": 0, "dz": [[0.5]]}])
    h1 = spec.case_hash()
    assert h0 != h1
    # Roundtrip über YAML hält die Felder
    p = tmp_path / "case.yaml"
    spec.to_yaml(p)
    wieder = CaseSpec.from_yaml(p)
    assert wieder.terrain.sculpt == SCULPT_DATEI
    assert wieder.terrain.sculpt_stand == spec.terrain.sculpt_stand


def test_patch_ausserhalb_und_unsinn_werden_abgelehnt(spec, tmp_path):
    with pytest.raises(ValueError, match="außerhalb"):
        patch_anwenden(spec, tmp_path,
                       [{"i0": 10_000, "j0": 0, "dz": [[0.1]]}])
    with pytest.raises(ValueError, match="NaN"):
        patch_anwenden(spec, tmp_path,
                       [{"i0": 0, "j0": 0, "dz": [[float("nan")]]}])
    with pytest.raises(ValueError, match="Pinselstrich"):
        patch_anwenden(spec, tmp_path,
                       [{"i0": 0, "j0": 0, "dz": [[500.0]]}])


def test_operationen_behalten_ihre_sollhoehen(tmp_path):
    """
    Der Pinsel formt das GEWACHSENE Gelände — die deklarierten
    Operationen (hier: das Gerinne) behalten ihre Sollhöhen obendrauf.
    Vorher wirkte die Ebene NACH dem Stapel und hob die Gerinne-Sohle an.
    """
    voll = build_spec_stage3()             # mit Gerinne-Operation
    feld_vor = TerrainField.from_spec(voll.terrain, voll.domain, tmp_path)
    gerinne = next(o for o in voll.terrain.operations
                   if o.type == "channel_carve")
    mx, my = gerinne.polyline[len(gerinne.polyline) // 2][:2]
    sohle_vor = float(feld_vor.sample([mx], [my])[0])
    # Fläche großflächig anheben — auch über dem Gerinne
    g = feld_vor.z.shape
    meldung = patch_anwenden(voll, tmp_path, [
        {"i0": 0, "j0": 0, "dz": np.full(g, 1.0).tolist()}])
    feld = TerrainField.from_spec(voll.terrain, voll.domain, tmp_path)
    # Sohle unverändert (Sollhöhe), freies Gelände um 1 m gehoben
    assert float(feld.sample([mx], [my])[0]) == pytest.approx(sohle_vor,
                                                              abs=0.02)
    x0, y0, x1, y1 = voll.domain.extent
    ecke_vor = float(feld_vor.sample([x0], [y0])[0])
    assert float(feld.sample([x0], [y0])[0]) == pytest.approx(
        ecke_vor + 1.0, abs=0.02)
    # und der Hinweis benennt die überlappte Operation
    assert "Sollhöhen" in meldung and gerinne.id in meldung


def test_sculpt_dreht_mit(spec, tmp_path):
    """Nach 90°-Drehung sitzt die Formung am gedrehten Ort."""
    from ..core.rotate import rotate_case
    patch_anwenden(spec, tmp_path,
                   [{"i0": 2, "j0": 6, "dz": np.full((3, 3), 2.0).tolist()}])
    feld_vor = _feld(spec, tmp_path)
    x0, y0, x1, y1 = spec.domain.extent
    mitte = ((x0 + x1) / 2, (y0 + y1) / 2)
    # Weltpunkt der Patch-Mitte vor der Drehung
    px = feld_vor.x0 + 3 * feld_vor.resolution
    py = feld_vor.y0 + 7 * feld_vor.resolution
    z_vor = float(feld_vor.sample([px], [py])[0])
    info = rotate_case(spec, 90.0, tmp_path)
    assert any("Sculpt" in h for h in info["hinweise"])
    feld_nach = _feld(spec, tmp_path)
    # p_neu = R(p_alt - mitte) + mitte, 90° ccw: (x,y)->(-y+cx+cy, x-cx+cy)
    qx = mitte[0] - (py - mitte[1])
    qy = mitte[1] + (px - mitte[0])
    z_nach = float(feld_nach.sample([qx], [qy])[0])
    assert z_nach == pytest.approx(z_vor, abs=0.05)


def test_koerper_gelaende_ist_nicht_formbar(spec, tmp_path):
    spec.terrain.base.koerper = "koerper.stl"
    with pytest.raises(ValueError, match="Geländekörper"):
        patch_anwenden(spec, tmp_path, [{"i0": 0, "j0": 0, "dz": [[0.1]]}])
