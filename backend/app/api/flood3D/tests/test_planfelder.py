"""
Planraster aus den echten Zellen (Fahrplan C2): Tiefe volumentreu,
Wasserspiegel mit einer Definition, Geschwindigkeiten und Froude.

Die Zahl, an der C2 gemessen wird: Σ h·A = Σ α·V. Das Voxel-Raster
verfehlte sie um 34–100 % (Audit F4).
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.fields import VolumeGrid
from ..core.planfelder import PlanNetz, zellmasse


def _saeulen(nx, ny, nz, kante, alpha_je_k, u=(0.0, 0.0, 0.0), z0=0.0):
    """Würfelzellen der Kante `kante`, nx × ny × nz, α je Schicht."""
    c, a, U = [], [], []
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                c.append(((i + 0.5) * kante, (j + 0.5) * kante,
                          z0 + (k + 0.5) * kante))
                a.append(alpha_je_k[k])
                U.append(u)
    c = np.array(c)
    return c, np.full(len(c), kante ** 3), np.array(a), np.array(U, dtype=float)


def _gitter(n, s):
    return VolumeGrid(origin=(0.0, 0.0, 0.0), spacing=(s, s, s), dims=(n, n, 4))


def test_tiefe_und_wasserspiegel_einer_schicht():
    c, v, a, U = _saeulen(2, 2, 4, 0.5, [1, 1, 0.4, 0], z0=10.0)
    netz = PlanNetz(c, v, _gitter(2, 0.5))
    f, info = netz.raster(a, U)
    assert f["plan_h"] == pytest.approx(np.full((2, 2), 1.2), abs=1e-6)
    assert f["plan_wsp"] == pytest.approx(np.full((2, 2), 11.2), abs=1e-5)
    assert info["teil_saeulen"] == 0


def test_volumentreu_auch_auf_schiefem_groeberem_raster():
    """Raster 1,26 × Zelle, nicht bündig — trotzdem Σ h·A = Σ α·V."""
    rng = np.random.default_rng(1)
    c, v, _, U = _saeulen(10, 10, 4, 0.5, [0, 0, 0, 0])
    a = rng.uniform(0, 1, len(c))
    g = VolumeGrid(origin=(0.0, 0.0, 0.0), spacing=(0.63, 0.63, 0.5),
                   dims=(8, 8, 4))          # deckt 5,04 m ab, Zellen 5,0 m
    f, info = PlanNetz(c, v, g).raster(a, U)
    soll = float((a * v).sum())
    assert info["volumen_raster"] == pytest.approx(soll, rel=1e-9)
    assert float(f["plan_h"].sum()) * 0.63 ** 2 == pytest.approx(soll, rel=1e-5)


def test_feine_zellen_zaehlen_nach_ihrem_volumen():
    """Eine Säule aus 8 Zellen halber Kante: dieselbe Tiefe wie 1 große."""
    grob = PlanNetz(np.array([[0.5, 0.5, 0.5]]), np.array([1.0]), _gitter(1, 1.0))
    c, v, a, U = _saeulen(2, 2, 2, 0.5, [1, 0.2])
    fein = PlanNetz(c, v, _gitter(1, 1.0))
    h_fein = fein.raster(a, U)[0]["plan_h"][0, 0]
    h_grob = grob.raster(np.array([0.6]))[0]["plan_h"][0, 0]
    assert h_fein == pytest.approx(h_grob) == pytest.approx(0.6)


def test_luftpolster_nimmt_den_sichtbaren_spiegel():
    """Wasser unten, Luft, Wasser oben (Überfallstrahl): Oberkante oben."""
    c, v, a, U = _saeulen(1, 1, 6, 0.5, [1, 1, 0, 0, 1, 0])
    f, info = PlanNetz(c, v, _gitter(1, 0.5)).raster(a, U)
    assert f["plan_h"][0, 0] == pytest.approx(1.5)
    assert f["plan_wsp"][0, 0] == pytest.approx(2.5)     # Oberkante Zelle 5
    assert info["teil_saeulen"] == 1


def test_boeschung_in_der_saeule_spiegel_an_der_grenzflaeche():
    """
    Säule 1 × 1 m, links Sohle 0 (zwei nasse Zellen), rechts Sohle 0,5
    (eine nasse Zelle): Spiegel überall 1,0. Sohle + h ergäbe 0,75 —
    in Fall A lag das im Median 0,15 m zu tief (c2_a, 2026-09-24).
    """
    c, v, a = [], [], []
    for j in range(2):
        for k in range(2):                      # links: x 0–0,5
            c.append((0.25, 0.25 + 0.5 * j, 0.25 + 0.5 * k))
            a.append(1.0)
        c.append((0.75, 0.25 + 0.5 * j, 0.75))  # rechts: nur oben
        a.append(1.0)
    c, a = np.array(c), np.array(a)
    f, info = PlanNetz(c, np.full(len(c), 0.125), _gitter(1, 1.0)).raster(a)
    assert f["plan_h"][0, 0] == pytest.approx(0.75)        # volumentreu
    assert f["plan_wsp"][0, 0] == pytest.approx(1.0)       # Grenzfläche


def test_geschwindigkeiten_tiefengemittelt_und_oben():
    c, v, _, _ = _saeulen(1, 1, 4, 0.5, [0, 0, 0, 0])
    a = np.array([1.0, 1.0, 0.5, 0.0])
    U = np.array([[1.0, 0, 0], [2.0, 0, 0], [4.0, 0, 0], [9.0, 0, 0]])
    f, _ = PlanNetz(c, v, _gitter(1, 0.5)).raster(a, U)
    # Σ α·U / Σ α = (1 + 2 + 2) / 2,5
    assert f["plan_ux"][0, 0] == pytest.approx(2.0)
    assert f["plan_uox"][0, 0] == pytest.approx(4.0)     # oberste nasse Zelle
    assert f["plan_uo"][0, 0] == pytest.approx(4.0)


def test_froude_nur_ab_zwei_zellen_tiefe():
    c, v, a, U = _saeulen(2, 1, 4, 0.5, [1, 1, 0, 0], u=(2.0, 0, 0))
    netz = PlanNetz(c, v, VolumeGrid((0, 0, 0), (0.5, 0.5, 0.5), (2, 1, 4)))
    f, _ = netz.raster(a, U)
    assert f["plan_fr"][0, 0] == pytest.approx(2.0 / np.sqrt(9.81 * 1.0))
    f, _ = netz.raster(np.array([0.5, 0.5] + [0] * 6), U)   # 0,25 m < 2 Zellen
    assert np.isnan(f["plan_fr"][0, 0])


def test_trockene_saeule_ohne_spiegel_und_geschwindigkeit():
    c, v, a, U = _saeulen(1, 1, 4, 0.5, [0.001, 0, 0, 0], u=(3.0, 0, 0))
    f, _ = PlanNetz(c, v, _gitter(1, 0.5)).raster(a, U)
    assert np.isnan(f["plan_wsp"][0, 0])
    assert f["plan_ux"][0, 0] == 0 and f["plan_uo"][0, 0] == 0


def test_zellmasse_aus_blockzelle_und_stufe():
    """Flache Zellen (Fall K: 0,05 × 0,05 × 0,047 m) — ∛V läge daneben."""
    v = np.array([0.1 * 0.1 * 0.094, 0.05 * 0.05 * 0.047, 0.05 * 0.05 * 0.02])
    dx, dy, hz = zellmasse(v, (0.1, 0.1, 0.094), max_stufe=1)
    assert dx == pytest.approx([0.1, 0.05, 0.05])
    assert hz == pytest.approx([0.094, 0.047, 0.02])   # angeschnitten: volumentreu
    assert dx[2] == 0.05                               # Deckel Stufe 1


def test_feine_zellen_nebeneinander_zaehlen_als_flaeche():
    """
    Säule 0,1 m: oben eine grobe Zelle, darunter vier feine nebeneinander,
    die oberste feine Schicht halb voll. Die feinen Nachbarn liegen in
    DERSELBEN Schicht — übereinander gezählt lag der Spiegel in Fall K
    6 cm zu hoch (c2_k, 3,5 s).
    """
    c, v, a = [], [], []
    for k, alpha in enumerate([1.0, 0.5]):           # zwei feine Schichten
        for x in (0.025, 0.075):
            for y in (0.025, 0.075):
                c.append((x, y, 0.025 + 0.05 * k))
                v.append(0.05 ** 3)
                a.append(alpha)
    c.append((0.05, 0.05, 0.15))                     # grob darüber, trocken
    v.append(0.1 ** 3)
    a.append(0.0)
    netz = PlanNetz(np.array(c), np.array(v), _gitter(1, 0.1),
                    block=(0.1, 0.1, 0.1), max_stufe=1)
    f, info = netz.raster(np.array(a))
    assert f["plan_h"][0, 0] == pytest.approx(0.075)
    assert f["plan_wsp"][0, 0] == pytest.approx(0.075)
    assert info["teil_saeulen"] == 0


# ---- Durchstich: convert_case_fields mit 0/V -----------------------------

def _foamfeld(pfad, werte, vektor=False):
    n = len(werte)
    zeilen = ("\n".join(f"({x} {y} {z})" for x, y, z in werte) if vektor
              else "\n".join(repr(float(w)) for w in werte))
    pfad.write_text(
        f"dimensions [0 0 0 0 0 0 0];\ninternalField nonuniform "
        f"List<{'vector' if vektor else 'scalar'}>\n{n}\n(\n{zeilen}\n)\n;\n"
        "boundaryField {}\n")


def _fall(tmp_path, mit_volumen=True):
    from .synthetic_case import build_spec_stage3
    spec = build_spec_stage3()
    x0, y0, _, _ = spec.domain.extent
    s = spec.mesh.base_cell
    c, v, a, U = _saeulen(3, 2, 4, s, [1, 1, 0.5, 0], u=(1.5, 0, 0),
                          z0=spec.domain.z_min)
    c[:, 0] += x0
    c[:, 1] += y0
    case = tmp_path / "case"
    (case / "0").mkdir(parents=True)
    _foamfeld(case / "0" / "C", c, vektor=True)
    if mit_volumen:
        _foamfeld(case / "0" / "V", v)
    t = case / "2"
    t.mkdir()
    _foamfeld(t / "alpha.water", a)
    _foamfeld(t / "U", U, vektor=True)
    return spec, case, float((a * v).sum()), s


def test_konvertierung_legt_planraster_neben_die_voxel(tmp_path):
    from ..core.fields import read_index, read_timestep
    from ..core.foamfields import convert_case_fields
    from ..core.planfelder import PLAN_FELDER
    spec, case, wasser, s = _fall(tmp_path)
    out = convert_case_fields(spec, case, tmp_path / "run")
    assert set(PLAN_FELDER) <= set(read_index(tmp_path / "run")["fields"])
    _, felder = read_timestep(tmp_path / "run", 0)
    nx, ny, _ = read_index(tmp_path / "run")["grid"]["dims"]
    assert felder["plan_h"].shape == (ny, nx)
    assert float(felder["plan_h"].sum()) * s * s == pytest.approx(wasser, rel=1e-5)
    (t, info), = out["plan_infos"]
    assert t == 2.0 and info["volumen_raster"] == pytest.approx(wasser)


def test_ohne_zellvolumen_keine_planraster(tmp_path):
    """Alte Läufe haben kein 0/V — dann rechnet der Client wie bisher."""
    from ..core.fields import read_index
    from ..core.foamfields import convert_case_fields
    spec, case, _, _ = _fall(tmp_path, mit_volumen=False)
    convert_case_fields(spec, case, tmp_path / "run")
    assert "plan_h" not in read_index(tmp_path / "run")["fields"]


def test_energiehoehe_aus_den_planrastern(tmp_path):
    from ..core import casespec as cs
    from ..core.foamfields import convert_case_fields, energy_head_series
    spec, case, _, s = _fall(tmp_path)
    x0, y0, _, _ = spec.domain.extent
    spec.evaluation.sections = [cs.Section(
        id="qs", polyline=[(x0 + 0.1 * s, y0 + 0.5 * s),
                           (x0 + 2.9 * s, y0 + 0.5 * s)])]
    convert_case_fields(spec, case, tmp_path / "run")
    rows = energy_head_series(spec, tmp_path / "run", "r")
    assert rows and rows[0]["source"] == "fields/plan"
    h = 2.5 * s
    assert rows[0]["value"] == pytest.approx(spec.domain.z_min + h + 1.5 ** 2 / (2 * 9.81),
                                             rel=1e-4)
