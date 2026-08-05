"""
Tests Falldrehung: das Modell dreht sich, das Rechengebiet bleibt
achsparallel. Geprüft wird, dass jede Koordinate mitgeht, dass ein
Vielfaches von 90° verlustfrei ist und dass vier Vierteldrehungen wieder
den Ausgangszustand ergeben.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.rotate import rotate_case
from ..core.terrain import TerrainField
from .synthetic_case import build_spec_stage3


def _mitte(spec):
    x0, y0, x1, y1 = spec.domain.extent
    return np.array([(x0 + x1) / 2, (y0 + y1) / 2])


def _erwartet(p, grad, mitte):
    r = math.radians(grad)
    c, s = math.cos(r), math.sin(r)
    dx, dy = p[0] - mitte[0], p[1] - mitte[1]
    return (mitte[0] + c * dx - s * dy, mitte[1] + s * dx + c * dy)


def test_90_grad_dreht_gebiet_und_geometrie(tmp_path):
    spec = build_spec_stage3()
    m = _mitte(spec)
    pfeiler_alt = list(spec.structures[3].footprint)
    pegel_alt = spec.evaluation.gauges[0].point

    info = rotate_case(spec, 90.0, tmp_path)

    # 24 x 18 wird zu 18 x 24, um die Mitte gedreht
    x0, y0, x1, y1 = spec.domain.extent
    assert (round(x1 - x0, 3), round(y1 - y0, 3)) == (18.0, 24.0)
    assert np.allclose(_mitte(spec), m)
    assert info["rotation_deg"] == 90.0

    for alt, neu in zip(pfeiler_alt, spec.structures[3].footprint):
        assert np.allclose(neu, _erwartet(alt, 90.0, m), atol=1e-3)
    assert np.allclose(spec.evaluation.gauges[0].point,
                       _erwartet(pegel_alt, 90.0, m), atol=1e-3)
    # z bleibt unberührt
    assert spec.structures[0].alignment.points[0][2] == 98.0


def test_vier_vierteldrehungen_sind_die_identitaet(tmp_path):
    spec = build_spec_stage3()
    original = spec.model_dump(mode="json")
    for _ in range(4):
        rotate_case(spec, 90.0, tmp_path)
    jetzt = spec.model_dump(mode="json")
    assert jetzt["domain"] == original["domain"]
    assert jetzt["structures"] == original["structures"]
    assert jetzt["evaluation"] == original["evaluation"]
    assert jetzt["terrain"]["operations"] == original["terrain"]["operations"]
    # 4 × 90° um dieselbe Mitte ist wieder die Identität
    assert spec.meta.transform.rotation_deg == pytest.approx(0.0)
    assert spec.meta.transform.translation[0] == pytest.approx(0.0, abs=1e-9)
    assert spec.meta.transform.translation[1] == pytest.approx(0.0, abs=1e-9)


def test_randfenster_wandert_auf_die_neue_flaeche(tmp_path):
    spec = build_spec_stage3()
    zulauf = next(b for b in spec.boundaries if b.id == "zulauf")
    zulauf.face = "x_min"
    zulauf.window = cs.BcWindow(span=(6.0, 12.0), z_min=94.0, z_max=97.0)

    rotate_case(spec, 90.0, tmp_path)

    # x_min zeigt nach -x; 90° gegen den Uhrzeigersinn dreht das auf y_min
    assert zulauf.face == "y_min"
    # Fenstermitte lag bei y=9 (Gebietsmitte) -> bleibt in der Mitte
    x0, _, x1, _ = spec.domain.extent
    assert zulauf.window.span == pytest.approx(((x0 + x1) / 2 - 3,
                                                (x0 + x1) / 2 + 3), abs=1e-3)
    # Höhen bleiben, die sind von der Drehung unabhängig
    assert zulauf.window.z_min == 94.0


def test_schiefe_drehung_meldet_naeherung(tmp_path):
    spec = build_spec_stage3()
    info = rotate_case(spec, 37.0, tmp_path)
    assert any("90" in h for h in info["hinweise"])
    assert any("Verfeinerungsquader" in h for h in info["hinweise"])
    # umschriebenes Rechteck ist größer als das Original
    x0, y0, x1, y1 = spec.domain.extent
    assert (x1 - x0) * (y1 - y0) > 24 * 18


def test_gelaende_wird_neu_abgetastet(tmp_path):
    """Ein schräger Hang muss nach der Drehung an der gedrehten Stelle
    dieselbe Höhe haben."""
    spec = build_spec_stage3()
    spec.terrain.operations = []
    # Rampe schreiben: z = 90 + x/10
    res = 0.5
    nx, ny = 49, 37
    zeilen = [f"ncols {nx}", f"nrows {ny}", "xllcorner -0.25",
              "yllcorner -0.25", f"cellsize {res}", "nodata_value -9999"]
    for _ in range(ny):
        zeilen.append(" ".join(f"{90 + (i * res) / 10:.4f}" for i in range(nx)))
    (tmp_path / "hang.asc").write_text("\n".join(zeilen))
    spec.terrain.base = cs.TerrainBase(source="hang.asc", resolution=res)

    alt = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    m = _mitte(spec)
    probe = (8.0, 5.0)
    z_alt = float(alt.sample(np.array(probe[0]), np.array(probe[1])))

    info = rotate_case(spec, 90.0, tmp_path)
    assert info["terrain"] and (tmp_path / info["terrain"]).exists()
    neu = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    p = _erwartet(probe, 90.0, m)
    z_neu = float(neu.sample(np.array(p[0]), np.array(p[1])))
    assert z_neu == pytest.approx(z_alt, abs=0.02)


def test_transform_edit_bleibt_wirkungsgleich(tmp_path):
    """
    Eine Verschiebung ist im Weltsystem angegeben — nach der Drehung muss
    der Körper an derselben (mitgedrehten) Stelle landen.
    """
    spec = build_spec_stage3()
    pier = spec.structures[3]
    pier.edits = [cs.EditTransform(id="e1", verschieben=(2.0, 0.0, 0.0))]
    m = _mitte(spec)
    ziel_alt = np.array(pier.footprint[0]) + np.array([2.0, 0.0])

    rotate_case(spec, 90.0, tmp_path)

    e = pier.edits[0]
    ziel_neu = np.array(pier.footprint[0]) + np.array(e.verschieben[:2])
    assert np.allclose(ziel_neu, _erwartet(ziel_alt, 90.0, m), atol=1e-3)
