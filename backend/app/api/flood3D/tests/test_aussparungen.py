"""
Tests der Aussparungen in Wand und Becken (Rohrdurchführung, Schütz-
öffnung, Entleerung): Geometrie analytisch nachgerechnet, Wasserdichtheit
und die Prüfregeln.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.solids import (apply_edits, build_basin, build_wall,
                           check_solid)
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _wand(openings=(), laenge=10.0, dicke=0.5, hoehe=3.0, z_ok=100.0):
    return cs.StructWall(
        id="wand_1", type="wall", patch="wand_1",
        # bewusst mitten im Gebiet: auf dem Gebietsrand stehend meldet die
        # Randabstandsregel zu Recht die Rückwirkung der Randbedingung
        alignment=cs.Alignment(points=[(6, 9, z_ok), (6 + laenge, 9, z_ok)]),
        height=hoehe, thickness=dicke, edits=list(openings))


def test_wand_ohne_aussparung_unveraendert():
    m = build_wall(_wand())
    assert m.is_watertight
    assert m.volume == pytest.approx(10.0 * 0.5 * 3.0, rel=1e-6)


def test_kreisaussparung_volumen():
    d = 0.8
    op = cs.EditAussparung(id="rohr", shape="kreis", station=5.0, z=98.5, diameter=d)
    m = apply_edits(build_wall(_wand([op])), _wand([op]))
    assert m.is_watertight, "Wand mit Loch muss geschlossen bleiben"
    loch = math.pi * (d / 2) ** 2 * 0.5          # Zylinder durch die Dicke
    assert m.volume == pytest.approx(10.0 * 0.5 * 3.0 - loch, rel=0.01)
    assert not check_solid("wand_1", m)


def test_rechteckaussparung_volumen():
    op = cs.EditAussparung(id="schuetz", shape="rechteck", station=5.0, z=98.5,
                    width=1.2, height=0.9)
    m = apply_edits(build_wall(_wand([op])), _wand([op]))
    assert m.is_watertight
    loch = 1.2 * 0.9 * 0.5
    assert m.volume == pytest.approx(10.0 * 0.5 * 3.0 - loch, rel=1e-3)


def test_mehrere_aussparungen():
    ops = [cs.EditAussparung(id=f"o{i}", shape="kreis", station=st, z=98.5,
                      diameter=0.6) for i, st in enumerate((2.5, 5.0, 7.5))]
    m = apply_edits(build_wall(_wand(ops)), _wand(ops))
    assert m.is_watertight
    loch = 3 * math.pi * 0.09 * 0.5
    assert m.volume == pytest.approx(10.0 * 0.5 * 3.0 - loch, rel=0.02)


def test_aussparung_folgt_der_achsrichtung():
    """Bei schräger Wand muss der Schnitt quer zur Wand liegen, nicht global."""
    schraeg = cs.StructWall(
        id="w", type="wall", patch="w",
        alignment=cs.Alignment(points=[(0, 0, 100.0), (7.07, 7.07, 100.0)]),
        height=3.0, thickness=0.5,
        edits=[cs.EditAussparung(id="r", shape="kreis", station=5.0, z=98.5,
                             diameter=0.8)])
    m = apply_edits(build_wall(schraeg), schraeg)
    assert m.is_watertight
    voll = 10.0 * 0.5 * 3.0
    loch = math.pi * 0.16 * 0.5
    # Läge der Schnitt falsch herum, wäre deutlich mehr/weniger weg
    assert m.volume == pytest.approx(voll - loch, rel=0.03)


def test_becken_mit_entleerung():
    b = cs.StructBasin(
        id="becken", type="basin", patch="becken",
        footprint=[(0, 0), (6, 0), (6, 6), (0, 6)],
        invert_level=95.0, wall_height=2.0, wall_thickness=0.3,
        edits=[cs.EditAussparung(id="entleerung", shape="kreis", station=3.0,
                             z=95.4, diameter=0.4)])
    ohne = build_basin(b)
    mit = apply_edits(build_basin(b), b)
    assert mit.is_watertight
    loch = math.pi * 0.04 * 0.3
    assert (ohne.volume - mit.volume) == pytest.approx(loch, rel=0.05)


# ---- Prüfregeln ----------------------------------------------------------

def _befunde(struct, mesh_cell=0.25):
    spec = build_spec_stage3()
    # Gelände ausklammern — sonst meldet die Einbindungsregel die frei
    # stehende Testwand, was mit Aussparungen nichts zu tun hat
    spec.terrain = None
    spec.structures = [struct]
    spec.mesh.refinements = []
    spec.mesh.boundary_layers = None
    spec.mesh.base_cell = mesh_cell
    spec.evaluation.force_patches = []
    return [x for x in validate_case(spec) if x["object_id"] == struct.id]


def test_warnt_bei_zu_kleiner_aussparung():
    op = cs.EditAussparung(id="klein", shape="kreis", station=5.0, z=98.5,
                    diameter=0.3)
    msgs = [b["message"] for b in _befunde(_wand([op]), mesh_cell=0.5)]
    assert any("kaum aufgelöst" in m for m in msgs), msgs


def test_fehler_wenn_aussparung_ueber_das_bauteil_ragt():
    # Wand 97…100, Öffnung um z=100 mit 1 m Höhe ragt oben heraus
    op = cs.EditAussparung(id="zuhoch", shape="rechteck", station=5.0, z=100.0,
                    width=0.5, height=1.0)
    msgs = [b["message"] for b in _befunde(_wand([op]))]
    assert any("über das Bauteil hinaus" in m for m in msgs), msgs


def test_fehler_bei_station_ausserhalb():
    op = cs.EditAussparung(id="weg", shape="kreis", station=25.0, z=98.5,
                    diameter=0.4)
    msgs = [b["message"] for b in _befunde(_wand([op]))]
    assert any("außerhalb der Achse" in m for m in msgs), msgs


def test_gueltige_aussparung_ohne_befund():
    op = cs.EditAussparung(id="ok", shape="kreis", station=5.0, z=98.5, diameter=0.8)
    assert _befunde(_wand([op])) == []


def test_masse_werden_erzwungen():
    with pytest.raises(ValueError, match="Kreis braucht diameter"):
        cs.EditAussparung(id="x", shape="kreis", station=1.0, z=98.0)
    with pytest.raises(ValueError, match="width und height"):
        cs.EditAussparung(id="y", shape="rechteck", station=1.0, z=98.0, width=1.0)


# ---- Bearbeitungen jenseits der Aussparung -------------------------------

def test_abschneiden_an_ebene():
    import trimesh
    from ..core.solids import apply_edits
    imp = cs.StructImported(id="i", type="imported", patch="i", source="x.stl",
        edits=[cs.EditSchnitt(id="kappen", achse="z", position=0.5,
                              behalten="unter")])
    m = apply_edits(trimesh.creation.box(extents=(4, 1, 3)), imp)
    assert m.is_watertight
    assert m.volume == pytest.approx(4 * 1 * 2.0, rel=1e-3)


def test_auf_gebiet_zuschneiden():
    import trimesh
    from ..core.solids import apply_edits
    dom = cs.Domain(extent=(0, 0, 10, 10), z_min=0, z_max=5)
    gross = trimesh.creation.box(extents=(30, 30, 30))
    gross.apply_translation([5, 5, 2.5])
    imp = cs.StructImported(id="i", type="imported", patch="i", source="x.stl",
        edits=[cs.EditAufGebiet(id="clip")])
    m = apply_edits(gross, imp, dom)
    lo, hi = m.bounds
    assert m.is_watertight
    np.testing.assert_allclose(lo, [0, 0, 0], atol=1e-6)
    np.testing.assert_allclose(hi, [10, 10, 5], atol=1e-6)


def test_transform_verschiebt_dreht_skaliert():
    import trimesh
    from ..core.solids import apply_edits
    imp = cs.StructImported(id="i", type="imported", patch="i", source="x.stl",
        edits=[cs.EditTransform(id="t", verschieben=(1, 2, 3),
                                drehen_deg=90, skalieren=2.0)])
    m = apply_edits(trimesh.creation.box(extents=(1, 1, 1)), imp)
    assert m.volume == pytest.approx(8.0, rel=1e-6)
    np.testing.assert_allclose(m.bounds.mean(axis=0), [1, 2, 3], atol=1e-6)


def test_aussparung_im_import_ueber_punkt():
    """Importe haben keine Achse — Lage über point + Bohrrichtung."""
    import math
    import trimesh
    from ..core.solids import apply_edits
    imp = cs.StructImported(id="i", type="imported", patch="i", source="x.stl",
        edits=[cs.EditAussparung(id="loch", shape="kreis", point=(0.0, 0.0),
                                 direction=(0, 1), z=0.0, diameter=0.6)])
    m = apply_edits(trimesh.creation.box(extents=(4, 1, 3)), imp)
    assert m.is_watertight
    # quer gebohrt: Weg durch die Dicke 1, nicht durch die Länge 4
    assert m.volume == pytest.approx(12 - math.pi * 0.09 * 1, rel=0.01)


def test_stapel_wirkt_der_reihe_nach():
    import trimesh
    from ..core.solids import apply_edits
    imp = cs.StructImported(id="i", type="imported", patch="i", source="x.stl",
        edits=[cs.EditSchnitt(id="s", achse="z", position=0.0, behalten="unter"),
               cs.EditTransform(id="t", verschieben=(0, 0, 10))])
    m = apply_edits(trimesh.creation.box(extents=(2, 2, 2)), imp)
    # erst halbiert (Volumen 4), dann angehoben
    assert m.volume == pytest.approx(4.0, rel=1e-3)
    assert m.bounds[0][2] == pytest.approx(9.0, abs=1e-6)


def test_skalierung_null_wird_gemeldet():
    spec = build_spec_stage3()
    spec.terrain = None
    spec.structures = [cs.StructImported(id="i", type="imported", patch="i",
        source="x.stl",
        edits=[cs.EditTransform(id="t", skalieren=0.0)])]
    spec.evaluation.force_patches = []
    msgs = [x["message"] for x in validate_case(spec) if x["object_id"] == "i"]
    assert any("größer 0" in m for m in msgs), msgs


# ---- Gelaendeanschluss, Verrundung, Durchdringung -----------------------

class _FlachesGelaende:
    def __init__(self, hoehe=10.0):
        self.hoehe = hoehe

    def sample(self, x, y):
        return np.full(np.shape(x), self.hoehe)


def test_gelaende_setzt_schwebenden_koerper_auf():
    import trimesh
    from ..core.solids import gelaende_anschluss
    schwebt = trimesh.creation.box(extents=(2, 2, 2))
    schwebt.apply_translation([0, 0, 12])       # Unterkante 11, Gelände 10
    m = gelaende_anschluss(schwebt, cs.EditGelaende(id="g", einbindetiefe=0.5),
                           _FlachesGelaende())
    assert m.is_watertight
    assert m.bounds[0][2] == pytest.approx(9.5, abs=1e-6)
    assert m.bounds[1][2] == pytest.approx(13.0, abs=1e-6)   # Oberkante bleibt


def test_gelaende_kappt_uebertiefe():
    import trimesh
    from ..core.solids import gelaende_anschluss
    tief = trimesh.creation.box(extents=(2, 2, 20))
    tief.apply_translation([0, 0, 10])          # reicht von 0 bis 20
    m = gelaende_anschluss(tief, cs.EditGelaende(id="g", einbindetiefe=0.5),
                           _FlachesGelaende())
    assert m.bounds[0][2] == pytest.approx(9.5, abs=1e-6)
    assert m.bounds[1][2] == pytest.approx(20.0, abs=1e-6)


def test_gelaende_modus_einbinden_kappt_nicht():
    import trimesh
    from ..core.solids import gelaende_anschluss
    tief = trimesh.creation.box(extents=(2, 2, 20))
    tief.apply_translation([0, 0, 10])
    m = gelaende_anschluss(tief, cs.EditGelaende(id="g", modus="einbinden"),
                           _FlachesGelaende())
    assert m.bounds[0][2] == pytest.approx(0.0, abs=1e-6)


def test_verrundete_oeffnung_laesst_ecken_stehen():
    import math
    import trimesh
    from ..core.solids import apply_edits

    def volumen(radius):
        st = cs.StructImported(id="i", type="imported", patch="i",
            source="x.stl",
            edits=[cs.EditAussparung(id="o", shape="rechteck", point=(0, 0),
                                     direction=(0, 1), z=0.0, width=2.0,
                                     height=1.0, radius=radius)])
        m = apply_edits(trimesh.creation.box(extents=(6, 1, 4)), st)
        assert m.is_watertight
        return m.volume

    scharf, rund = volumen(0.0), volumen(0.3)
    assert scharf == pytest.approx(24 - 2 * 1 * 1, rel=1e-4)
    # vier Viertelkreise bleiben stehen, Wanddicke 1 m
    ecken = 4 * (0.3 ** 2 - math.pi * 0.3 ** 2 / 4) * 1.0
    assert rund - scharf == pytest.approx(ecken, rel=0.05)


def test_durchdringende_koerper_werden_entflochten():
    import trimesh
    from ..core.solids import entflechten, ueberschneidungen
    a = trimesh.creation.box(extents=(4, 4, 4))
    b = trimesh.creation.box(extents=(4, 4, 4))
    b.apply_translation([2, 0, 0])
    solids = {"a": a, "b": b}
    assert [(x, y, round(v, 3)) for x, y, v in ueberschneidungen(solids)] \
        == [("a", "b", 32.0)]
    notizen = entflechten(solids)
    assert "durchdrang" in notizen[0]
    # Vereinigung unveraendert: das Wasser sieht dieselbe Berandung
    assert solids["a"].volume == pytest.approx(64.0, rel=1e-6)
    assert solids["b"].volume == pytest.approx(32.0, rel=1e-6)
    assert not ueberschneidungen(solids)


def test_stutzen_bleibt_von_der_entflechtung_verschont():
    from ..core.solids import gewollt_verschnitten
    spec = build_spec_stage3()
    spec.structures.append(cs.StructCulvert(
        id="dl_x", type="culvert", patch="dl_x",
        axis=((1.0, 5.0, 96.0), (4.0, 5.0, 96.0)),
        profile=cs.CulvertProfile(kind="circular", diameter=1.0)))
    assert "dl_x" in gewollt_verschnitten(spec)


def test_spalt_unter_dem_koerper_wird_gemeldet():
    spec = build_spec_stage3()
    for st in spec.structures:
        if st.type == "pier":
            st.base_level += 3.0                  # Pfeiler schwebt
            st.top_level += 3.0
            break
    msgs = [x["message"] for x in validate_case(spec)]
    assert any("klafft" in m for m in msgs), msgs


# ---- Heilen: Regel UND Kur (2026-08-11) ----------------------------------

def test_loechriger_koerper_wird_gemeldet_und_geheilt(tmp_path):
    """
    Die Dichtheitsregel konnte nie anschlagen: `split()` repariert in
    trimesh stillschweigend, geprüft wurde der reparierte Zustand. Jetzt
    meldet sie — und die Kur „Heilen" beseitigt den Befund wirklich.
    """
    import trimesh

    from ..core.kur import anwenden
    from ..core.solids import apply_edits, check_solid

    box = trimesh.creation.box((2, 2, 2))
    loechrig = trimesh.Trimesh(vertices=box.vertices, faces=box.faces[2:])
    assert not loechrig.is_watertight

    befunde = check_solid("imp", loechrig)
    assert befunde and "nicht wasserdicht" in befunde[0]

    st = cs.StructImported(id="imp", type="imported", patch="imp",
                           source="x.stl")
    spec = cs.CaseSpec(
        meta=cs.Meta(id="t", title="t"),
        domain=cs.Domain(extent=(0, 0, 10, 10), z_min=0, z_max=5),
        mesh=cs.Mesh(base_cell=0.5), structures=[st],
        solver=cs.Solver(application="interFoam", end_time=1.0))
    meldung = anwenden(spec, "heilen_anhaengen", {"patch": "imp"})
    assert "Heilen" in meldung
    assert [e.type for e in spec.structures[0].edits] == ["heilen"]

    geheilt = apply_edits(loechrig.copy(), spec.structures[0])
    assert geheilt.is_watertight, "Kur gelaufen, Körper immer noch offen"
    assert geheilt.volume == pytest.approx(8.0, rel=1e-6)
    assert check_solid("imp", geheilt) == []

    # zweimal anwenden ändert nichts (die Kur meldet das ehrlich)
    assert "bereits" in anwenden(spec, "heilen_anhaengen", {"patch": "imp"})
