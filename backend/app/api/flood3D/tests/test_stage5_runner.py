"""
Tests Stufe 5 (ohne Docker): checkMesh-Parser, Kostenschätzung und der
OpenFOAM-ASCII-Feldparser. Die Containerläufe selbst werden am echten Fall
verifiziert (checkMesh-Prüfung laut Spez Stufe 3/5), nicht im CI.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.foamfields import parse_internal_field, viz_grid_for
from ..core.runner import estimate_run, parse_checkmesh
from .synthetic_case import build_spec_stage3

CHECKMESH_OK = """
Mesh stats
    points:           123456
    faces:            7890
    cells:            54321
Checking geometry...
    Mesh non-orthogonality Max: 42.7 average: 8.1
    Max skewness = 2.1 OK.
Mesh OK.
End
"""

CHECKMESH_BAD = """
    cells:            100
 ***Max skewness = 8.5, 12 highly skew faces detected
Failed 2 mesh checks.
End
"""


def test_parse_checkmesh_ok():
    cm = parse_checkmesh(CHECKMESH_OK)
    assert cm["cells"] == 54321
    assert cm["max_non_ortho"] == pytest.approx(42.7)
    assert cm["max_skewness"] == pytest.approx(2.1)
    assert cm["checkmesh_ok"] is True


def test_parse_checkmesh_failed():
    cm = parse_checkmesh(CHECKMESH_BAD)
    assert cm["checkmesh_ok"] is False
    assert cm["failed_checks"] == 2


def test_estimate_plausibel():
    spec = build_spec_stage3()
    est = estimate_run(spec, cells=200_000, cores=4)
    assert est["cells"] == 200_000
    # feinste Zelle 0.5/2^3, alphaCo 0.3, Signal 6 m/s (kalibriert an r001)
    assert est["dt_estimate_s"] == pytest.approx(0.3 * 0.0625 / 6.0)
    assert est["wall_time_estimate_h"] > 0
    assert est["cost_estimate_eur"] >= 0


def test_estimate_trifft_referenzlauf():
    """Kalibrierprobe: Schätzung gegen den gemessenen Lauf demo-stufe3_r001
    (2386 s auf 1 Kern für 6 s Simulationszeit, 117.596 Zellen)."""
    spec = build_spec_stage3()
    spec.solver.end_time = 6.0
    est = estimate_run(spec, cells=117_596, cores=1)
    gemessen_h = 2386 / 3600
    assert est["wall_time_estimate_h"] == pytest.approx(gemessen_h, rel=0.15)


FIELD_SCALAR = """FoamFile{}
dimensions [0 0 0 0 0 0 0];
internalField   nonuniform List<scalar>
4
(
0.5
1
0
0.25
)
;
boundaryField {}
"""

FIELD_VECTOR = """FoamFile{}
internalField   nonuniform List<vector>
2
(
(1 2 3)
(4 5 6)
)
;
"""

FIELD_UNIFORM = "internalField   uniform 0.75;\nboundaryField{}"
FIELD_UNIFORM_VEC = "internalField   uniform (1 0 0);\n"


def test_liest_auch_gzip(tmp_path):
    """writeCompression on -> OpenFOAM schreibt alpha.water.gz."""
    import gzip
    from ..core.foamfields import foam_exists, foam_text
    p = tmp_path / "alpha.water"
    with gzip.open(f"{p}.gz", "wt") as f:
        f.write(FIELD_SCALAR)
    assert foam_exists(p), "gz-Variante muss gefunden werden"
    assert "internalField" in foam_text(p)
    np.testing.assert_allclose(parse_internal_field(p, 4), [0.5, 1, 0, 0.25])
    # unkomprimiert gewinnt, wenn beides daliegt
    p.write_text(FIELD_UNIFORM)
    np.testing.assert_allclose(parse_internal_field(p, 2), [0.75, 0.75])


def test_gz_patchwerte(tmp_path):
    import gzip
    from ..core.foamfields import parse_patch_values
    p = tmp_path / "wallShearStress"
    with gzip.open(f"{p}.gz", "wt") as f:
        f.write(BOUNDARY_FIELD)
    v = parse_patch_values(p, "terrain")
    assert v.shape == (3, 3)
    np.testing.assert_allclose(v[1], [0, 0.2, 0])


def test_parse_scalar_nonuniform(tmp_path):
    p = tmp_path / "alpha.water"
    p.write_text(FIELD_SCALAR)
    v = parse_internal_field(p, 4)
    np.testing.assert_allclose(v, [0.5, 1, 0, 0.25])


def test_parse_vector_nonuniform(tmp_path):
    p = tmp_path / "U"
    p.write_text(FIELD_VECTOR)
    v = parse_internal_field(p, 2)
    assert v.shape == (2, 3)
    np.testing.assert_allclose(v[1], [4, 5, 6])


def test_parse_uniform(tmp_path):
    p = tmp_path / "p_rgh"
    p.write_text(FIELD_UNIFORM)
    np.testing.assert_allclose(parse_internal_field(p, 3), [0.75] * 3)
    p2 = tmp_path / "U"
    p2.write_text(FIELD_UNIFORM_VEC)
    v = parse_internal_field(p2, 2)
    assert v.shape == (2, 3)
    np.testing.assert_allclose(v[0], [1, 0, 0])


BOUNDARY_FIELD = """FoamFile{}
dimensions [0 2 -2 0 0 0 0];
internalField   uniform (0 0 0);
boundaryField
{
    terrain
    {
        type            calculated;
        value           nonuniform List<vector>
3
(
(0.1 0 0)
(0 0.2 0)
(0 0 0.3)
)
;
    }
    farfield
    {
        type            calculated;
        value           uniform (0 0 0);
    }
}
"""


def test_parse_patch_values(tmp_path):
    from ..core.foamfields import parse_patch_values
    p = tmp_path / "wallShearStress"
    p.write_text(BOUNDARY_FIELD)
    v = parse_patch_values(p, "terrain")
    assert v.shape == (3, 3)
    np.testing.assert_allclose(v[1], [0, 0.2, 0])
    u = parse_patch_values(p, "farfield")
    assert u.shape == (1, 3)
    assert parse_patch_values(p, "gibtsnicht") is None


def test_bin2d_mittelt():
    from ..core.fields import VolumeGrid
    from ..core.foamfields import _bin2d
    grid = VolumeGrid(origin=(0, 0, 0), spacing=(1, 1, 1), dims=(2, 2, 1))
    x = np.array([0.5, 0.4, 1.5])
    y = np.array([0.5, 0.5, 1.5])
    v = np.array([2.0, 4.0, 7.0])
    out = _bin2d(x, y, v, grid)
    assert out.shape == (2, 2)
    assert out[0, 0] == pytest.approx(3.0)   # Mittel aus 2 und 4
    assert out[1, 1] == pytest.approx(7.0)
    assert out[0, 1] == 0.0                  # Loch


def test_bed_shear_series_aus_feldern(tmp_path):
    from ..core.foamfields import bed_shear_series
    from .synthetic_fields import build_fields
    spec = build_spec_stage3()
    build_fields(tmp_path)
    rows = bed_shear_series(spec, tmp_path, "r001")
    assert rows, "keine Sohlschubreihen erzeugt"
    assert {r["location_id"] for r in rows} == {"r01"}
    assert all(r["value"] > 0 for r in rows)
    # je Ausgabezeitpunkt zwei Werte: component "" = min (Räumbarkeit),
    # component "max" = max (Sohlensicherung, max_bed_shear-Target)
    assert len(rows) == 10
    assert {r["component"] for r in rows} == {"", "max"}
    mins = [r["value"] for r in rows if r["component"] == ""]
    maxs = [r["value"] for r in rows if r["component"] == "max"]
    assert all(lo <= hi for lo, hi in zip(mins, maxs))


MULTI_STL = """solid terrain
 facet normal 0 0 1
  outer loop
   vertex 0 0 96
   vertex 1 0 96
   vertex 1 1 96
  endloop
 endfacet
endsolid terrain
solid wand
 facet normal 1 0 0
  outer loop
   vertex 5 0 96
   vertex 5 1 96
   vertex 5 1 98
  endloop
 endfacet
 facet normal 1 0 0
  outer loop
   vertex 5 0 96
   vertex 5 1 98
   vertex 5 0 98
  endloop
 endfacet
endsolid wand
"""


def test_mesh_surface_parsen_und_packen(tmp_path):
    import struct
    from ..core.meshsurface import (mesh_surface_patches,
                                    parse_multi_solid_stl, to_binary_stl)
    p = tmp_path / "meshSurface_0.stl"
    p.write_text(MULTI_STL)
    patches = parse_multi_solid_stl(p)
    assert set(patches) == {"terrain", "wand"}
    assert patches["wand"].shape == (2, 3, 3)
    blob = to_binary_stl(patches["wand"])
    (n,) = struct.unpack("<I", blob[80:84])
    assert n == 2
    assert len(blob) == 84 + n * 50
    out = mesh_surface_patches(tmp_path)
    assert [e["patch"] for e in out] == ["terrain", "wand"]


def test_viz_grid_deckelung():
    spec = build_spec_stage3()
    grid = viz_grid_for(spec)
    assert np.prod(grid.dims) <= 1_500_000
    # kleines Gebiet: Grundriss bleibt bei der Basiszelle …
    assert grid.spacing[0] == pytest.approx(0.5)
    assert grid.dims[:2] == (48, 36)
    # … in der Höhe wird feiner aufgelöst, sonst ist die Wasseroberfläche
    # nicht darstellbar (16 Schichten reichten dafür nicht)
    assert grid.dims[2] >= 40
    assert grid.spacing[2] < grid.spacing[0]


def test_fehlender_patch_wird_sofort_gemeldet(tmp_path):
    """
    Ein Fenster, das komplett im Erdreich liegt, erzeugt null Flächen —
    createPatch verwirft den Patch und interFoam stirbt erst Stunden später.
    Die Prüfung nach dem Vernetzen bricht sofort ab.
    """
    from ..core.runner import _mesh_patches, _pruefe_patches
    from .synthetic_case import build_spec_stage3

    mesh = tmp_path / "constant" / "polyMesh"
    mesh.mkdir(parents=True)
    (mesh / "boundary").write_text(
        "4\n(\n"
        "    inlet\n    {\n        type patch;\n    }\n"
        "    atmosphere\n    {\n        type patch;\n    }\n"
        "    terrain\n    {\n        type wall;\n    }\n"
        "    randwand_outlet\n    {\n        type wall;\n    }\n"
        ")\n")
    assert _mesh_patches(tmp_path) == {"inlet", "atmosphere", "terrain",
                                       "randwand_outlet"}
    spec = build_spec_stage3()
    with pytest.raises(RuntimeError, match="keine einzige Fläche"):
        _pruefe_patches(tmp_path, spec)
