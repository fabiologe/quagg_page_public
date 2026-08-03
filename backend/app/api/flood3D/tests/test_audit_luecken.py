"""
Die im Audit gefundenen Sackgassen — jede hier mit dem Nachweis, dass sie
jetzt wirkt. Ohne diese Tests wäre der nächste Umbau frei, sie wieder
stillzulegen: alle vier Felder ließen sich vorher eingeben, ohne dass
irgendetwas darauf reagierte.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.casebuilder import RHO_WASSER, h_ref, initial_fields
from ..core.solids import build_basin, build_wall
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


# ---- Fester Ablaufpegel --------------------------------------------------

def _spec_mit_pegel(level=95.4):
    spec = build_spec_stage3()
    ab = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    i = spec.boundaries.index(ab)
    spec.boundaries[i] = cs.BcOutflowFixedLevel(
        id=ab.id, type="outflow_fixed_level", patch=ab.patch,
        face=getattr(ab, "face", None), level=level)
    return spec, spec.boundaries[i]


def test_ablaufpegel_setzt_bezugshoehe_und_druck():
    spec, ab = _spec_mit_pegel(95.4)
    assert h_ref(spec) == pytest.approx(95.4)
    f = initial_fields(spec, Path("."))
    prgh = f["p_rgh"]
    block = prgh[prgh.index(ab.patch):]
    # p_rgh ist für eine ruhende Wassersäule konstant; mit hRef = Pegel null
    assert "fixedValue" in block[:200]
    assert "uniform 0" in block[:200]
    # Wasser muss zurückströmen können — inletOutlet zöge nur Luft nach
    alpha = f["alpha.water"]
    assert "variableHeightFlowRate" in alpha[alpha.index(ab.patch):][:220]


def test_zweiter_pegel_bekommt_den_hydrostatischen_versatz():
    spec, ab = _spec_mit_pegel(95.4)
    spec.boundaries.append(cs.BcOutflowFixedLevel(
        id="ablauf2", type="outflow_fixed_level", patch="ablauf2",
        face="y_max", level=96.4))
    f = initial_fields(spec, Path("."))
    block = f["p_rgh"]
    zweiter = block[block.index("ablauf2"):][:220]
    soll = RHO_WASSER * 9.81 * (96.4 - 95.4)
    assert f"{soll:.6g}" in zweiter


def test_freier_ablauf_bleibt_unveraendert():
    spec = build_spec_stage3()
    ab = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    i = spec.boundaries.index(ab)
    spec.boundaries[i] = cs.BcOutflowFree(
        id=ab.id, type="outflow_free", patch=ab.patch,
        face=getattr(ab, "face", None))
    ab = spec.boundaries[i]
    f = initial_fields(spec, Path("."))
    assert "totalPressure" in f["p_rgh"][f["p_rgh"].index(ab.patch):][:200]
    assert h_ref(spec) == 0.0


# ---- Wandanlauf ----------------------------------------------------------

def _wand(**kw):
    return cs.StructWall(id="w", type="wall", patch="w",
        alignment=cs.Alignment(points=[(0, 0, 10.0), (10, 0, 10.0)]),
        height=3.0, thickness=0.5, **kw)


def test_anlauf_verbreitert_den_wandfuss():
    gerade = build_wall(_wand())
    schraeg = build_wall(_wand(batter_deg=10.0))
    zulage = 3.0 * math.tan(math.radians(10.0))
    trapez = 10.0 * 3.0 * (0.5 + (0.5 + 2 * zulage)) / 2
    assert gerade.volume == pytest.approx(15.0, rel=1e-6)
    assert schraeg.is_watertight
    assert schraeg.volume == pytest.approx(trapez, rel=1e-3)


def test_anlauf_null_bleibt_die_gerade_wand():
    assert build_wall(_wand(batter_deg=0.0)).volume == pytest.approx(15.0)


# ---- Sohlgefälle ---------------------------------------------------------

def _becken(**kw):
    return cs.StructBasin(id="b", type="basin", patch="b",
        footprint=[(0, 0), (10, 0), (10, 6), (0, 6)], invert_level=5.0,
        wall_height=2.0, wall_thickness=0.3, **kw)


def _sohl_z(mesh, achse, wert, tol=0.3):
    sohle = min(mesh.split(only_watertight=False),
                key=lambda t: t.bounds[1][2])
    v = sohle.vertices
    nah = v[np.abs(v[:, achse] - wert) < tol]
    return float(nah[:, 2].max())


def test_sohlgefaelle_neigt_die_sohle_und_bleibt_dicht():
    m = build_basin(_becken(invert_slope=0.02))
    assert m.is_watertight
    hoch, tief = _sohl_z(m, 0, 10.0), _sohl_z(m, 0, 0.0)
    assert hoch - tief == pytest.approx(0.02 * 10, abs=1e-3)


def test_gefaellerichtung_ist_waehlbar():
    m = build_basin(_becken(invert_slope=0.02, invert_slope_dir=(0.0, 1.0)))
    assert _sohl_z(m, 1, 6.0) - _sohl_z(m, 1, 0.0) == pytest.approx(0.12,
                                                                    abs=1e-3)


def test_wand_reicht_unter_den_tiefsten_sohlpunkt():
    """Sonst klafft an der Gefälleseite ein Spalt und das Becken läuft aus."""
    m = build_basin(_becken(invert_slope=0.02))
    ring = max(m.split(only_watertight=False), key=lambda t: t.bounds[1][2])
    assert ring.bounds[0][2] <= 5.0 - 0.02 * 5 + 1e-6


# ---- Entfallene Felder ---------------------------------------------------

def test_alte_faelle_mit_cutwater_bleiben_lesbar():
    from ..core.casespec import migriere
    daten = {"structures": [{"id": "p", "type": "pier", "patch": "p",
                             "shape": "rund", "center": [1, 1], "width": 1.0,
                             "base_level": 0.0, "top_level": 2.0,
                             "cutwater": True}],
             "meta": {"id": "x", "crs": {"epsg": 25832, "origin": [1, 2],
                                         "rotation_deg": 3.0}}}
    sauber = migriere(daten)
    assert "cutwater" not in sauber["structures"][0]
    assert sauber["meta"]["crs"] == {"epsg": 25832}
    assert cs.StructPier(**sauber["structures"][0]).shape == "rund"


# ---- Prüfregeln ----------------------------------------------------------

def test_bearbeitung_am_rechen_wird_gemeldet():
    spec = build_spec_stage3()
    rechen = next(s for s in spec.structures if s.type == "screen")
    rechen.edits = [cs.EditHeilen(id="h", type="heilen")]
    msgs = [x["message"] for x in validate_case(spec)
            if x["object_id"] == rechen.id]
    assert any("ohne Wirkung" in m for m in msgs), msgs


def test_bereich_ersetzen_ohne_quelle_ist_ein_fehler():
    spec = build_spec_stage3()
    spec.terrain.operations = [cs.OpReplaceRegion(
        id="ersatz", type="replace_region",
        polygon=[(2, 2), (6, 2), (6, 6)], source="")]
    befunde = [x for x in validate_case(spec) if x["object_id"] == "ersatz"]
    assert befunde and befunde[0]["severity"] == "fehler"


def test_bereich_ersetzen_mit_fehlender_datei():
    spec = build_spec_stage3()
    spec.terrain.operations = [cs.OpReplaceRegion(
        id="ersatz", type="replace_region",
        polygon=[(2, 2), (6, 2), (6, 6)], source="gibtsnicht.asc")]
    msgs = [x["message"] for x in validate_case(spec)
            if x["object_id"] == "ersatz"]
    assert any("liegt nicht beim Fall" in m for m in msgs), msgs


# ---- Ablauf mit vorgegebenem Drosselabfluss ------------------------------

def test_drosselablauf_schreibt_flowRateOutletVelocity():
    spec = build_spec_stage3()
    ab = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    i = spec.boundaries.index(ab)
    spec.boundaries[i] = cs.BcOutflowConstant(
        id=ab.id, type="outflow_constant", patch=ab.patch,
        face=getattr(ab, "face", None), q=0.03)
    ab = spec.boundaries[i]
    fel = initial_fields(spec, Path("."))
    u = fel["U"][fel["U"].index(ab.patch):][:220]
    assert "flowRateOutletVelocity" in u
    assert "volumetricFlowRate 0.03" in u
    # Der Druck stellt sich zum vorgegebenen Fluss ein
    assert "fixedFluxPressure" in fel["p_rgh"][fel["p_rgh"].index(ab.patch):][:200]


def test_drossel_ohne_einstau_wird_gemeldet():
    spec = build_spec_stage3()
    ab = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    i = spec.boundaries.index(ab)
    spec.boundaries[i] = cs.BcOutflowConstant(
        id=ab.id, type="outflow_constant", patch=ab.patch, face="x_max", q=0.03,
        window=cs.BcWindow(shape="kreis", center=8.0, z_center=97.0,
                           diameter=0.6))
    spec.solver.initial_level = 96.0        # unter der Rohroberkante
    msgs = [x["message"] for x in validate_case(spec)
            if x["object_id"] == spec.boundaries[i].id]
    assert any("nicht eingestaut" in m for m in msgs), msgs


def test_drossel_mit_null_ist_ein_fehler():
    spec = build_spec_stage3()
    ab = next(b for b in spec.boundaries if b.type.startswith("outflow"))
    i = spec.boundaries.index(ab)
    spec.boundaries[i] = cs.BcOutflowConstant(
        id=ab.id, type="outflow_constant", patch=ab.patch,
        face=getattr(ab, "face", None), q=0.0)
    befunde = [x for x in validate_case(spec)
               if x["object_id"] == spec.boundaries[i].id
               and x["severity"] == "fehler"]
    assert befunde
