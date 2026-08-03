"""
Tests Zu-/Ablauf-Fenster (Stufe A): eine Randbedingung wirkt nur auf einem
Rechteck ihrer Gebietsseite. topoSet sammelt die Flächen AUSSERHALB des
Fensters, createPatch macht daraus die Wand randwand_<id>.
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core.casebuilder import (_window_active, build_case,
                                create_patch_dict, topo_set_dict)
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _spec_mit_fenster(bc_id="zulauf", **kw):
    spec = build_spec_stage3()
    bc = next(b for b in spec.boundaries if b.id == bc_id)
    bc.window = cs.BcWindow(**kw)
    return spec


def test_fenster_erzeugt_toposet_und_createpatch():
    # zulauf liegt auf x_min, Kante läuft in y (0..18)
    spec = _spec_mit_fenster(span=(6.0, 12.0))
    ts = topo_set_dict(spec)
    assert ts is not None
    assert "zulaufWinOut" in ts
    assert "patchToFace" in ts and "inlet" in ts
    assert "boxToFace" in ts
    cp = create_patch_dict(spec)
    assert cp is not None
    assert "randwand_zulauf" in cp
    assert "wall" in cp and "constructFrom   set" in cp


def test_fensterbox_liegt_auf_der_richtigen_flaeche():
    spec = _spec_mit_fenster(span=(6.0, 12.0), z_min=94.0, z_max=97.0)
    ts = topo_set_dict(spec)
    # x_min bei x=0: Box quer zur Fläche gepolstert, span/z exakt
    assert "(-0.5 6 94)" in ts and "(0.5 12 97)" in ts


def test_fenster_volle_flaeche_ist_noop():
    spec = _spec_mit_fenster(span=(0.0, 18.0))
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    assert not _window_active(spec, bc)
    assert create_patch_dict(spec) is None
    # topoSet enthält dann nur die Rechen-Zonen, keine Fenster-Sets
    assert "WinOut" not in (topo_set_dict(spec) or "")


def test_build_case_schreibt_dict_und_allrun(tmp_path):
    spec = _spec_mit_fenster(span=(6.0, 12.0))
    build_case(spec, tmp_path)
    assert (tmp_path / "system" / "createPatchDict").exists()
    allrun = (tmp_path / "Allrun").read_text()
    assert "createPatch -overwrite" in allrun
    # createPatch muss NACH topoSet laufen
    assert allrun.index("topoSet") < allrun.index("createPatch")


def test_ohne_fenster_kein_createpatch(tmp_path):
    spec = build_spec_stage3()
    build_case(spec, tmp_path)
    assert not (tmp_path / "system" / "createPatchDict").exists()
    assert "createPatch" not in (tmp_path / "Allrun").read_text()


# ---- Prüfregeln ----------------------------------------------------------

def _messages(spec, bc_id):
    return [x["message"] for x in validate_case(spec)
            if x["object_id"] == bc_id]


def test_validate_fenster_ausserhalb_der_kante():
    spec = _spec_mit_fenster(span=(10.0, 25.0))
    assert any("ragt über" in m for m in _messages(spec, "zulauf"))


def test_validate_fenster_zu_schmal():
    spec = _spec_mit_fenster(span=(6.0, 6.4))
    assert any("weniger als" in m for m in _messages(spec, "zulauf"))


def test_validate_fenster_auf_atmosphaere():
    spec = _spec_mit_fenster(bc_id="atmo", span=(6.0, 12.0))
    assert any("Atmosphärenfläche" in m for m in _messages(spec, "atmo"))


def test_validate_fenster_z_verkehrt():
    spec = _spec_mit_fenster(span=(6.0, 12.0), z_min=97.0, z_max=95.0)
    assert any("Unterkante" in m for m in _messages(spec, "zulauf"))


def test_gueltiges_fenster_ohne_befund():
    spec = _spec_mit_fenster(span=(6.0, 12.0), z_min=94.0, z_max=97.0)
    assert not _messages(spec, "zulauf")


# ---- Stufe B: Fenster folgt Gerinne --------------------------------------

def _spec_mit_gerinne_bis_rand(end=(0.0, 9.0), **kw):
    """t01 endet an der x_min-Kante; zulauf-Fenster koppelt daran."""
    spec = _spec_mit_fenster(follow="t01", **kw)
    ch = next(op for op in spec.terrain.operations if op.id == "t01")
    ch.polyline = [end, ch.polyline[-1]]
    return spec


def test_follow_leitet_fenster_aus_querschnitt_ab():
    from ..core.casebuilder import resolve_window
    spec = _spec_mit_gerinne_bis_rand()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    r = resolve_window(spec, bc)
    # Trapez: Sohle 2 m, oben Sohle + 2 Böschungen 1.5*1.5 m, zentriert
    # auf y=9; Sohlhöhe invert_start 94.8 - 0.2 Reserve, oben Einschnittkante
    assert r["shape"] == "trapez"
    assert (r["lo"], r["hi"]) == (pytest.approx(5.75), pytest.approx(12.25))
    assert r["bw"] == pytest.approx(2.0)
    assert r["tw"] == pytest.approx(6.5)
    assert r["zlo"] == pytest.approx(94.6)
    assert r["zhi"] == pytest.approx(96.3)
    assert "randwand_zulauf" in (create_patch_dict(spec) or "")


def test_follow_fenster_wandert_mit_dem_gerinne():
    from ..core.casebuilder import resolve_window
    spec = _spec_mit_gerinne_bis_rand(end=(0.0, 12.0))
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    r = resolve_window(spec, bc)
    assert (r["lo"], r["hi"]) == (pytest.approx(8.75), pytest.approx(15.25))


def test_follow_gueltig_ohne_befund():
    spec = _spec_mit_gerinne_bis_rand()
    assert not _messages(spec, "zulauf")


def test_validate_follow_und_span_gleichzeitig():
    spec = _spec_mit_gerinne_bis_rand(span=(6.0, 12.0))
    assert any("nicht beides" in m for m in _messages(spec, "zulauf"))


def test_validate_follow_unbekannte_id():
    spec = _spec_mit_fenster(follow="gibtsnicht")
    assert any("weder Gerinne" in m and "gibtsnicht" in m
               for m in _messages(spec, "zulauf"))


def test_validate_gerinne_endet_vor_dem_rand():
    # Original-Fixture: t01 beginnt bei x=2 — 2 m vor x_min (> 2 Zellen)
    spec = _spec_mit_fenster(follow="t01")
    assert any("endet" in m and "vor dem" in m
               for m in _messages(spec, "zulauf"))
    assert create_patch_dict(spec) is None


def test_validate_fenster_ganz_ohne_lage():
    spec = _spec_mit_fenster()
    assert any("ohne span und ohne follow" in m
               for m in _messages(spec, "zulauf"))


# ---- Formen: Kreis (Rohrmündung) und Trapez ------------------------------

def test_kreis_erzeugt_zylinderauswahl():
    spec = _spec_mit_fenster(shape="kreis", center=9.0, z_center=97.0,
                             diameter=2.0)
    ts = topo_set_dict(spec)
    assert "cylinderToFace" in ts
    assert "p1      (-0.5 9 97)" in ts
    assert "p2      (0.5 9 97)" in ts
    assert "radius  1" in ts
    assert "randwand_zulauf" in (create_patch_dict(spec) or "")


def test_kreis_frei_ueber_dem_gelaende_ist_gueltig():
    # Rohrmündung 1 m über dem Planum (Gelände 96) — Freistrahl
    spec = _spec_mit_fenster(shape="kreis", center=9.0, z_center=97.5,
                             diameter=1.5)
    assert not _messages(spec, "zulauf")


def test_kreis_fehlende_angaben():
    spec = _spec_mit_fenster(shape="kreis", center=9.0)
    msgs = _messages(spec, "zulauf")
    assert any("z_center" in m and "diameter" in m for m in msgs)


def test_kreis_ausserhalb_der_gebietshoehe():
    spec = _spec_mit_fenster(shape="kreis", center=9.0, z_center=99.5,
                             diameter=2.0)
    assert any("außerhalb der Gebietshöhe" in m
               for m in _messages(spec, "zulauf"))


def test_kreis_zu_klein_warnung():
    spec = _spec_mit_fenster(shape="kreis", center=9.0, z_center=95.0,
                             diameter=0.6)
    assert any("kaum aufgelöst" in m for m in _messages(spec, "zulauf"))


def test_trapez_streifen_folgen_der_boeschung():
    spec = _spec_mit_fenster(shape="trapez", center=9.0, bottom_width=2.0,
                             top_width=6.0, z_min=94.0, z_max=96.0)
    ts = topo_set_dict(spec)
    # 4 Zellstreifen à 0.5 m; Breite wächst linear von Sohle zu Oberkante
    assert "(-0.5 7.75 94) (0.5 10.25 94.5)" in ts
    assert "(-0.5 6.25 95.5) (0.5 11.75 96)" in ts
    assert ts.count("action  delete") == 4


def test_trapez_fehlende_angaben():
    spec = _spec_mit_fenster(shape="trapez", center=9.0)
    assert any("bottom_width" in m for m in _messages(spec, "zulauf"))


def test_follow_erzeugt_trapez_streifen():
    spec = _spec_mit_gerinne_bis_rand()
    ts = topo_set_dict(spec)
    # Querschnitt 94.6–96.3 → Zellschichten, mehrere Streifen statt einer Box
    assert ts.count("action  delete") >= 3


# ---- Stufe C: Stutzen (follow auf Durchlass) -----------------------------

def _spec_mit_stutzen(axis=((0.0, 9.0, 96.6), (6.0, 9.0, 96.4)),
                      profile=None):
    spec = _spec_mit_fenster(follow="stutzen_1")
    spec.structures.append(cs.StructCulvert(
        id="stutzen_1", type="culvert", patch="stutzen_1",
        axis=[list(p) for p in axis],
        profile=profile or cs.CulvertProfile(kind="circular", diameter=2.5)))
    return spec


def test_stutzen_fenster_ist_rohrquerschnitt():
    from ..core.casebuilder import resolve_window
    spec = _spec_mit_stutzen()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    r = resolve_window(spec, bc)
    assert r["shape"] == "kreis"
    assert r["center"] == pytest.approx(9.0)
    assert r["zc"] == pytest.approx(96.6)      # Achshöhe am Anschlussende
    assert r["d"] == pytest.approx(2.5)
    ts = topo_set_dict(spec)
    assert "cylinderToFace" in ts and "radius  1.25" in ts


def test_stutzen_rechteckprofil_wird_rechteckfenster():
    from ..core.casebuilder import resolve_window
    spec = _spec_mit_stutzen(profile=cs.CulvertProfile(
        kind="rectangular", width=2.0, height=1.0))
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    r = resolve_window(spec, bc)
    assert r["shape"] == "rechteck"
    assert (r["lo"], r["hi"]) == (pytest.approx(8.0), pytest.approx(10.0))
    assert (r["zlo"], r["zhi"]) == (pytest.approx(96.1), pytest.approx(97.1))


def test_stutzen_ueber_gelaende_ohne_befund():
    # Rohr ragt frei über dem Planum — die „hängt in der Luft"-Regel
    # gilt für Stutzen bestimmungsgemäß nicht
    spec = _spec_mit_stutzen()
    assert not _messages(spec, "zulauf")
    assert not _messages(spec, "stutzen_1")


def test_stutzen_endet_vor_dem_rand():
    spec = _spec_mit_stutzen(axis=((2.5, 9.0, 96.6), (6.0, 9.0, 96.4)))
    assert any("Stutzen" in m and "vor dem" in m
               for m in _messages(spec, "zulauf"))


def test_stutzen_kleines_rohr_warnung():
    spec = _spec_mit_stutzen(profile=cs.CulvertProfile(
        kind="circular", diameter=1.2))
    assert any("Verfeinerungsbox um den Stutzen" in m
               for m in _messages(spec, "zulauf"))


# ---- Polygon-Fenster (frei gezeichneter Querschnitt) ---------------------

def test_polygon_scanline_konkav():
    from ..core.casebuilder import _poly_intervals
    # U-Profil (konkav): zwei getrennte Intervalle in der oberen Hälfte
    pts = [(0, 0), (6, 0), (6, 4), (4, 4), (4, 2), (2, 2), (2, 4), (0, 4)]
    assert _poly_intervals(pts, 1.0) == [(0.0, 6.0)]
    assert _poly_intervals(pts, 3.0) == [(0.0, 2.0), (4.0, 6.0)]


def test_polygon_fenster_erzeugt_streifen():
    spec = _spec_mit_fenster(shape="polygon", points=[
        (7.0, 94.0), (11.0, 94.0), (9.0, 96.0)])   # Dreieck
    ts = topo_set_dict(spec)
    assert ts.count("action  delete") == 4          # 2 m Höhe / 0.5er-Zellen
    assert "randwand_zulauf" in (create_patch_dict(spec) or "")
    assert not _messages(spec, "zulauf")


def test_polygon_zu_wenig_punkte():
    spec = _spec_mit_fenster(shape="polygon", points=[(7.0, 94.0), (11.0, 94.0)])
    assert any("mindestens 3 Eckpunkte" in m for m in _messages(spec, "zulauf"))


# ---- Material / Rauheit --------------------------------------------------

def test_material_setzt_raue_wandfunktion():
    from ..core.casebuilder import initial_fields
    spec = build_spec_stage3()
    spec.structures[0].material = "beton"      # wand_becken
    spec.structures[1].material = "stahl"      # becken_1
    nut = initial_fields(spec, __import__("pathlib").Path("."))["nut"]
    assert nut.count("nutkRoughWallFunction") >= 3   # 2 Bauwerke + Gelände
    assert "Ks              uniform 0.002" in nut    # Beton
    assert "Ks              uniform 0.0001" in nut   # Stahl
    assert "Ks              uniform 0.03" in nut     # Gelände erde


def test_material_am_rechen_erzeugt_keinen_geisterpatch():
    """
    Der Rechen wird nicht als Fläche vernetzt (poröse Zone). Ein
    Rauheitseintrag für seinen Patch stünde in 0/nut, ohne dass es den
    Patch im Netz gibt.
    """
    from ..core.casebuilder import initial_fields
    spec = build_spec_stage3()
    rechen = next(s for s in spec.structures if s.type == "screen")
    rechen.material = "stahl"
    nut = initial_fields(spec, __import__("pathlib").Path("."))["nut"]
    assert rechen.patch not in nut


def test_material_ks_ueberschreibt_katalog():
    from ..core.casebuilder import initial_fields
    spec = build_spec_stage3()
    spec.structures[0].material = "beton"
    spec.structures[0].material_ks = 0.007
    nut = initial_fields(spec, __import__("pathlib").Path("."))["nut"]
    assert "Ks              uniform 0.007" in nut
    assert "Ks              uniform 0.002" not in nut


def test_ohne_material_glatte_wand():
    from ..core.casebuilder import initial_fields
    spec = build_spec_stage3()
    spec.terrain.material = None
    nut = initial_fields(spec, __import__("pathlib").Path("."))["nut"]
    assert "nutkRoughWallFunction" not in nut


def test_rechen_stab_drehung_anstroemwinkel():
    from ..core.solids import build_screen_bars
    s = cs.StructScreen(
        id="r", type="screen", patch="r",
        plane_polygon=[(6, 8, 94.6), (6, 10, 94.6), (6, 10, 96.6), (6, 8, 96.6)],
        bar_spacing=0.5, bar_thickness=0.01, bar_depth=0.2,
        resistance=cs.ScreenResistance())
    gerade = build_screen_bars(s)
    s45 = s.model_copy(update={"approach_angle_deg": 45.0})
    schraeg = build_screen_bars(s45)
    # Stabtiefe dreht aus der Ebenen-Normalen (x) in die Ebene (y):
    # x-Ausdehnung schrumpft (cos 45°), y-Ausdehnung wächst
    assert (schraeg.bounds[1][0] - schraeg.bounds[0][0]) < \
        (gerade.bounds[1][0] - gerade.bounds[0][0]) - 0.03
    assert (schraeg.bounds[1][1] - schraeg.bounds[0][1]) > \
        (gerade.bounds[1][1] - gerade.bounds[0][1]) + 0.1
