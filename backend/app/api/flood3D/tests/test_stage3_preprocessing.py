"""
Tests Stufe 3 (Spez. Kap. 13): Geländeoperationen analytisch, Körper auf
Invarianten (wasserdicht, Volumen analytisch nachgerechnet), Dictionaries
inhaltlich, und der Namenskontrakt casebuilder <-> extract.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest

from ..cli import main as cli_main
from ..core import casespec as cs
from ..core.casebuilder import build_case
from ..core.meshgen import assign_faces, cell_counts
from ..core.solids import (build_basin, build_culvert, build_pier,
                           build_solids, build_wall, check_solid)
from ..core.terrain import TerrainField
from .synthetic_case import build_spec_stage3


def _flat_terrain(level=96.0, resolution=0.5, extent=(0, 0, 24, 18),
                  operations=()):
    return TerrainField.from_spec(
        cs.Terrain(base=cs.TerrainBase(source=f"flat:{level}",
                                       resolution=resolution),
                   operations=list(operations)),
        cs.Domain(extent=extent, z_min=92, z_max=100))


# --------------------------------------------------------------------------
# Gelände
# --------------------------------------------------------------------------

def test_pad_setzt_planum():
    t = _flat_terrain(operations=[cs.OpPad(
        id="p", type="pad", polygon=[(4, 4), (8, 4), (8, 8), (4, 8)], level=97.5)])
    assert t.sample(6, 6) == pytest.approx(97.5)
    assert t.sample(2, 2) == pytest.approx(96.0)


def test_channel_carve_sohle_und_boeschung():
    op = cs.OpChannelCarve(id="c", type="channel_carve",
                           polyline=[(2, 9), (22, 9)],
                           invert_start=94.8, invert_end=94.6,
                           bottom_width=2.0, depth=1.5, side_slope=1.5)
    t = _flat_terrain(operations=[op])
    # Sohlhöhe entlang der Achse interpoliert
    assert t.sample(2, 9) == pytest.approx(94.8, abs=0.02)
    assert t.sample(12, 9) == pytest.approx(94.7, abs=0.02)
    assert t.sample(22, 9) == pytest.approx(94.6, abs=0.02)
    # Böschung: 1 m neben der Sohlkante liegt die Höhe 1/1.5 m über der Sohle
    mitte = t.sample(12, 9)
    assert t.sample(12, 9 + 1.0 + 1.0) == pytest.approx(mitte + 1.0 / 1.5, abs=0.05)
    # außerhalb des Einflussbereichs unverändert
    assert t.sample(12, 3) == pytest.approx(96.0)


def test_embankment_krone():
    t = _flat_terrain(operations=[cs.OpEmbankment(
        id="d", type="embankment", polyline=[(4, 4), (20, 4)],
        crest_level=97.5, crest_width=2.0, side_slope=2.0)])
    assert t.sample(12, 4) == pytest.approx(97.5)
    # 1 m neben der Kronenkante: 0.5 m tiefer (Neigung 1:2)
    assert t.sample(12, 4 + 1.0 + 1.0) == pytest.approx(97.0, abs=0.05)


def test_ramp_interpoliert():
    t = _flat_terrain(operations=[cs.OpRamp(
        id="r", type="ramp", polygon=[(4, 4), (12, 4), (12, 8), (4, 8)],
        level_start=95.0, level_end=96.0, direction=(1, 0))])
    assert t.sample(4, 6) == pytest.approx(95.0, abs=0.05)
    assert t.sample(12, 6) == pytest.approx(96.0, abs=0.05)
    assert t.sample(8, 6) == pytest.approx(95.5, abs=0.05)


def test_raise_lower_und_smooth():
    t = _flat_terrain(operations=[cs.OpRaiseLower(
        id="h", type="raise_lower", center=(12, 9), radius=4, strength=1.0)])
    assert t.sample(12, 9) == pytest.approx(97.0)
    rough_var = t.z.var()
    t.apply(cs.OpSmooth(id="s", type="smooth", center=(12, 9), radius=4,
                        strength=1.0))
    assert t.z.var() < rough_var


def test_set_level_mit_uebergang():
    t = _flat_terrain(operations=[cs.OpSetLevel(
        id="l", type="set_level", polygon=[(8, 6), (16, 6), (16, 12), (8, 12)],
        level=94.0, blend_width=2.0)])
    assert t.sample(12, 9) == pytest.approx(94.0)
    inner, mid, outer = t.sample(12, 12.5), t.sample(12, 13.0), t.sample(12, 14.5)
    assert 94.0 < inner < mid < outer <= 96.0


def test_terrain_stl(tmp_path):
    t = _flat_terrain()
    mesh = t.to_trimesh()
    ny, nx = t.z.shape
    assert len(mesh.vertices) == nx * ny
    assert len(mesh.faces) == 2 * (nx - 1) * (ny - 1)
    t.to_stl(tmp_path / "terrain.stl")
    assert (tmp_path / "terrain.stl").stat().st_size > 1000


# --------------------------------------------------------------------------
# Bauwerke: Invarianten mit analytischem Volumen (Spez. Kap. 13)
# --------------------------------------------------------------------------

def test_wand_volumen_analytisch():
    s = cs.StructWall(id="w", type="wall", patch="w",
                      alignment=cs.Alignment(points=[(0, 0, 98.0), (10, 0, 98.0)]),
                      height=2.0, thickness=0.5)
    mesh = build_wall(s)
    assert check_solid("w", mesh) == []
    assert mesh.volume == pytest.approx(10 * 0.5 * 2.0, rel=1e-6)


def test_wand_oberkante_folgt_den_stuetzpunkten():
    """
    B3: die Oberkante folgt points[i].z je Stützpunkt — vorher kollabierte
    der Bau alle z auf max/min, das Ziehen EINER Ecke hob die ganze Wand.
    """
    s = cs.StructWall(id="w", type="wall", patch="w",
                      alignment=cs.Alignment(points=[(0, 0, 98.0),
                                                     (10, 0, 99.0)]),
                      height=2.0, thickness=0.5)
    mesh = build_wall(s)
    assert check_solid("w", mesh) == []
    # Fuß: min(z) - height = 96.0; Deckel läuft von 98 auf 99
    assert mesh.bounds[0][2] == pytest.approx(96.0)
    assert mesh.bounds[1][2] == pytest.approx(99.0)
    # Trapez-Längsschnitt: Breite · Länge · mittlere Höhe
    assert mesh.volume == pytest.approx(0.5 * 10 * (2.0 + 3.0) / 2, rel=1e-6)
    # Oberkante am ersten Ende bleibt bei 98 m (nicht auf 99 gezogen)
    ecken_x0 = mesh.vertices[np.isclose(mesh.vertices[:, 0], 0.0)]
    assert ecken_x0[:, 2].max() == pytest.approx(98.0)


def test_wand_doppelte_stuetzpunkte_werden_gefiltert():
    s = cs.StructWall(id="w", type="wall", patch="w",
                      alignment=cs.Alignment(points=[(0, 0, 98.0), (0, 0, 98.0),
                                                     (10, 0, 98.0)]),
                      height=2.0, thickness=0.5)
    mesh = build_wall(s)
    assert check_solid("w", mesh) == []
    assert mesh.volume == pytest.approx(10 * 0.5 * 2.0, rel=1e-6)


def test_pfeiler_volumen_analytisch():
    s = cs.StructPier(id="p", type="pier", patch="p",
                      footprint=[(0, 0), (2, 0), (2, 3), (0, 3)],
                      base_level=90.0, top_level=95.0)
    mesh = build_pier(s)
    assert check_solid("p", mesh) == []
    assert mesh.volume == pytest.approx(2 * 3 * 5, rel=1e-6)


def test_becken_volumen_analytisch():
    s = cs.StructBasin(id="b", type="basin", patch="b",
                       footprint=[(0, 0), (4, 0), (4, 6), (0, 6)],
                       invert_level=95.0, wall_height=2.0, wall_thickness=0.3)
    mesh = build_basin(s)
    assert check_solid("b", mesh) == []
    floor = 4 * 6 * 0.3
    ring = (4.6 * 6.6 - 4 * 6) * 2.0
    assert mesh.volume == pytest.approx(floor + ring, rel=1e-6)


def test_durchlass_volumen_ringquerschnitt():
    s = cs.StructCulvert(id="d", type="culvert", patch="d",
                         axis=[(0, 0, 94.0), (10, 0, 94.0)],
                         profile=cs.CulvertProfile(kind="circular", diameter=1.2))
    mesh = build_culvert(s)
    assert check_solid("d", mesh) == []
    exakt = math.pi * (0.75**2 - 0.6**2) * 10
    assert mesh.volume == pytest.approx(exakt, rel=0.02)  # 48-Eck-Näherung


def _wehr(profile, cw=0.5, su=2.0, sd=2.0, base=94.0):
    from ..core.solids import build_weir
    return build_weir(cs.StructWeir(
        id="w", type="weir", patch="w",
        crest_polyline=[(2, 2, 96.0), (12, 2, 96.0)],
        crest_width=cw, slope_upstream=su, slope_downstream=sd,
        profile_type=profile, base_level=base))


def test_wehr_trapez_volumen_analytisch():
    mesh = _wehr("trapez")
    assert check_solid("w", mesh) == []
    h, L = 2.0, 10.0
    flaeche = 0.5 * h + h * h * (2.0 + 2.0) / 2
    assert mesh.volume == pytest.approx(flaeche * L, rel=1e-6)


def test_wehr_breitkronig_volumen_analytisch():
    mesh = _wehr("breitkronig", cw=1.2)
    assert check_solid("w", mesh) == []
    assert mesh.volume == pytest.approx(1.2 * 2.0 * 10.0, rel=1e-6)


def test_wehr_scharfkantig_und_rundkronig():
    platte = _wehr("scharfkantig", cw=0.05)
    assert check_solid("w", platte) == []
    assert platte.volume == pytest.approx(0.05 * 2.0 * 10.0, rel=1e-6)
    rund = _wehr("rundkronig", cw=0.8)
    assert check_solid("w", rund) == []
    # Kronenscheitel liegt exakt auf Kronenhöhe
    assert rund.bounds[1][2] == pytest.approx(96.0, abs=1e-6)


def test_pfeiler_formen_analytisch():
    from ..core.solids import build_pier
    rund = build_pier(cs.StructPier(
        id="p", type="pier", patch="p", shape="rund", center=(5, 5),
        width=1.0, base_level=90.0, top_level=95.0))
    assert check_solid("p", rund) == []
    assert rund.volume == pytest.approx(math.pi * 0.25 * 5.0, rel=0.01)

    tropfen = build_pier(cs.StructPier(
        id="t", type="pier", patch="t", shape="tropfen", center=(5, 5),
        width=1.0, length=3.0, rotation_deg=30.0,
        base_level=90.0, top_level=95.0))
    assert check_solid("t", tropfen) == []
    erwartet = (math.pi * 0.25 / 2 + 3.0 * 0.5) * 5.0
    assert tropfen.volume == pytest.approx(erwartet, rel=0.02)


def test_rechen_staebe_vorschau():
    from ..core.solids import build_screen_bars
    s = cs.StructScreen(
        id="r", type="screen", patch="r",
        plane_polygon=[(6, 8.0, 94.0), (6, 10.0, 94.0),
                       (6, 10.0, 96.0), (6, 8.0, 96.0)],
        bar_spacing=0.1, bar_thickness=0.01, bar_depth=0.06,
        bar_shape="rechteck",
        resistance=cs.ScreenResistance())
    mesh = build_screen_bars(s)
    n_bars = 21                       # 2 m Breite / 0.1 m Teilung + 1
    stab = 0.01 * 0.06 * 2.0
    assert mesh.volume == pytest.approx(n_bars * stab, rel=1e-3)


def test_kirschmer_ableitung():
    from ..core.casebuilder import _SCREEN_ZONE_TIEFE, _screen_resistance
    s = cs.StructScreen(
        id="r", type="screen", patch="r",
        plane_polygon=[(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)],
        bar_spacing=0.02, bar_thickness=0.008, bar_depth=0.06,
        bar_shape="rechteck", approach_angle_deg=90.0,
        resistance=cs.ScreenResistance())      # d = f = 0 -> Kirschmer
    _, f = _screen_resistance(s)
    zeta = 2.42 * (0.008 / 0.012) ** (4 / 3)
    # f ist auf die ZONENTIEFE normiert, nicht auf die Stabtiefe: der
    # Solver integriert Δp = ½ρu²·f·L über die Zone — nur f = ζ/L_Zone
    # liefert den Kirschmer-Verlust ζ·½ρu². Die frühere Normierung auf
    # bar_depth überschätzte den Verlust um L_Zone/bar_depth (2,5×).
    assert f[0] == pytest.approx(zeta / _SCREEN_ZONE_TIEFE, rel=1e-6)
    assert f[0] * _SCREEN_ZONE_TIEFE == pytest.approx(zeta, rel=1e-6)

    explizit = cs.StructScreen(
        id="r2", type="screen", patch="r2",
        plane_polygon=[(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)],
        bar_spacing=0.02, bar_thickness=0.008,
        resistance=cs.ScreenResistance(f=(120.0, 0, 0)))
    _, f2 = _screen_resistance(explizit)
    assert f2 == (120.0, 0, 0)                 # explizite Vorgabe gewinnt


# --------------------------------------------------------------------------
# meshgen
# --------------------------------------------------------------------------

def test_zellzahlen_und_randzuordnung():
    spec = build_spec_stage3()
    assert cell_counts(spec) == (48, 36, 16)
    faces = assign_faces(spec)
    assert faces["x_min"] == ("inlet", "patch")
    assert faces["x_max"] == ("outlet", "patch")
    assert faces["z_max"] == ("atmosphere", "patch")
    assert faces["z_min"] == ("bottom", "wall")
    assert faces["y_min"] == ("farfield", "wall")


def test_doppelbelegung_wird_abgelehnt():
    spec = build_spec_stage3()
    spec.boundaries[1].face = "x_min"    # Ablauf auf den Zulaufrand legen
    with pytest.raises(ValueError, match="bereits durch"):
        assign_faces(spec)


# --------------------------------------------------------------------------
# casebuilder: Fallstruktur und Namenskontrakt
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def built_case(tmp_path_factory):
    out = tmp_path_factory.mktemp("of_case_build")
    spec = build_spec_stage3()
    info = build_case(spec, out)
    return spec, out, info


def test_fallstruktur_vollstaendig(built_case):
    _, out, info = built_case
    assert info["problems"] == []
    erwartet = [
        "system/controlDict", "system/blockMeshDict", "system/snappyHexMeshDict",
        "system/fvSchemes", "system/fvSolution", "system/setFieldsDict",
        "system/topoSetDict", "system/decomposeParDict",
        "constant/g", "constant/transportProperties",
        "constant/turbulenceProperties", "constant/fvOptions",
        "constant/triSurface/terrain.stl", "constant/triSurface/wand_becken.stl",
        "constant/triSurface/becken_1.stl", "constant/triSurface/dl_1.stl",
        "constant/triSurface/pfeiler_1.stl",
        "0/U", "0/alpha.water", "0/p_rgh", "0/k", "0/omega", "0/nut",
        "Allrun",
    ]
    for rel in erwartet:
        assert (out / rel).exists(), f"fehlt: {rel}"
    # Rechen erzeugt keinen Körper, nur die poröse Zone
    assert not (out / "constant/triSurface/rechen_1.stl").exists()
    assert info["screens"] == ["rechen_1"]


def test_namenskontrakt_casebuilder_extract(built_case):
    """
    Kopplungstest Stufe 3 <-> Stufe 1: die functionObject-Namen im
    controlDict müssen exakt die postProcessing-Ordnernamen sein, die
    extract/case_reader.py einsammelt.
    """
    spec, out, _ = built_case
    control = (out / "system/controlDict").read_text()
    erwartete_fo = (
        [f"forces_{p}" for p in spec.evaluation.force_patches]
        + [f"discharge_{s.id}" for s in spec.evaluation.sections]
        + [f"gauge_{g.id}" for g in spec.evaluation.gauges]
        + ["water_volume", "residuals"]
    )
    for name in erwartete_fo:
        assert f"    {name}\n" in control, f"functionObject fehlt: {name}"


def test_randbedingungen_inhaltlich(built_case):
    _, out, _ = built_case
    u = (out / "0/U").read_text()
    assert "flowRateInletVelocity" in u
    assert "constant 0.5" in u
    alpha = (out / "0/alpha.water").read_text()
    assert "fixedValue" in alpha            # Zulauf voll Wasser
    assert '".*"' in alpha                  # Wand-Sammelregel
    setf = (out / "system/setFieldsDict").read_text()
    assert "94.9" in setf                   # Anfangswasserspiegel

    fv = (out / "constant/fvOptions").read_text()
    # Verlegungsgrad 0.3 -> Faktor 1/0.49: f_x = 120/0.49
    assert f"{120 / 0.49:.6g}"[:6] in fv.replace("(", " ")


def test_location_in_mesh_liegt_im_stroemungsraum(built_case):
    spec, _, info = built_case
    x, y, z = info["location_in_mesh"]
    x0, y0, x1, y1 = spec.domain.extent
    assert x0 < x < x1 and y0 < y < y1
    assert spec.domain.z_min < z < spec.domain.z_max
    # über dem eingeschnittenen Gerinne, unter der Gebietsoberkante
    assert z > 94.0


GOLDEN = ["system/controlDict", "system/blockMeshDict",
          "system/snappyHexMeshDict", "constant/fvOptions"]


@pytest.mark.parametrize("rel", GOLDEN)
def test_dictionaries_gegen_referenz(built_case, rel):
    """
    Eingefrorene Dictionaries (Spez. Kap. 13). Bei gewollten Änderungen am
    casebuilder die Referenz bewusst neu erzeugen:
        cli build --spec <stage3.yaml> --out /tmp/fall && cp ... tests/golden/
    """
    _, out, _ = built_case
    golden = Path(__file__).parent / "golden" / Path(rel).name
    assert (out / rel).read_text() == golden.read_text(), \
        f"{rel} weicht von der eingefrorenen Referenz ab"


def test_cli_build_smoke(tmp_path):
    spec = build_spec_stage3()
    spec_path = tmp_path / "case.yaml"
    spec.to_yaml(spec_path)
    cli_main(["build", "--spec", str(spec_path), "--out", str(tmp_path / "case")])
    assert (tmp_path / "case/system/controlDict").exists()


def test_casespec_stage3_yaml_roundtrip(tmp_path):
    spec = build_spec_stage3()
    p = tmp_path / "case.yaml"
    spec.to_yaml(p)
    again = cs.CaseSpec.from_yaml(p)
    assert again.case_hash() == spec.case_hash()
    assert len(again.structures) == 5
    assert again.mesh.base_cell == 0.5


def test_kepsilon_schreibt_das_epsilon_feld(tmp_path):
    """
    kEpsilon war im Schema wählbar, ohne dass ein epsilon-Feld entstand —
    der Solver wäre damit gar nicht gestartet.
    """
    spec = build_spec_stage3()
    spec.solver.turbulence = "kEpsilon"
    build_case(spec, tmp_path, ".")
    text = (tmp_path / "0" / "epsilon").read_text()
    assert "epsilonWallFunction" in text
    assert "div(phi,epsilon)" in (tmp_path / "system" / "fvSchemes").read_text()
    assert "epsilon" in (tmp_path / "system" / "fvSolution").read_text()


def test_lts_wird_als_nicht_lauffaehig_gemeldet():
    from ..core.validate import validate_case

    spec = build_spec_stage3()
    spec.solver.application = "LTSInterFoam"
    befunde = [f for f in validate_case(spec, ".")
               if f["object_id"] == "solver" and f["severity"] == "fehler"]
    assert befunde and "localEuler" in befunde[0]["message"]


def test_kraftkriterium_ohne_kraftauswertung_wird_gemeldet():
    """
    Ein max_force-Kriterium auf einem Patch ohne eingeschaltete
    Kraftauswertung liefert keine Zeitreihe — das fiel bisher erst nach dem
    bezahlten Lauf als „nicht auswertbar" auf.
    """
    from ..core.validate import validate_case

    spec = build_spec_stage3()
    spec.evaluation.targets.append(cs.TargetMaxForce(
        id="last", kind="max_force", at="becken_1", component="magnitude"))
    befunde = [f for f in validate_case(spec, ".") if f["object_id"] == "last"]
    assert befunde and "Kraftauswertung" in befunde[0]["message"]

    spec.evaluation.force_patches.append("becken_1")
    assert not [f for f in validate_case(spec, ".") if f["object_id"] == "last"]


def test_kanten_werden_erfasst_und_in_jedem_pfad_gezogen(tmp_path):
    """
    Ohne surfaceFeatureExtract findet snappyHexMesh scharfe Kanten nur
    zufällig über den Winkel — Wehrkrone, Rohrmündung und Beckenoberkante
    sind aber genau die Stellen, an denen der Nachweis hängt. Und der
    Schritt muss in JEDEN Ablauf: die Netzvorschau lief an der Allrun-Kette
    vorbei und brach mit „Could not open …eMesh" ab.
    """
    spec = build_spec_stage3()
    build_case(spec, tmp_path, ".")
    sfe = (tmp_path / "system" / "surfaceFeatureExtractDict").read_text()
    assert "extractFromSurface" in sfe and "wand_becken.stl" in sfe
    # der Rechen erzeugt keinen Körper und darf keine Kantendatei bekommen
    assert "rechen_1" not in sfe
    snappy = (tmp_path / "system" / "snappyHexMeshDict").read_text()
    assert 'file "wand_becken.eMesh"' in snappy
    allrun = (tmp_path / "Allrun").read_text()
    assert allrun.index("surfaceFeatureExtract") < allrun.index("snappyHexMesh")

    import inspect

    from ..core import runner
    quelle = inspect.getsource(runner.mesh_preview)
    assert "_kanten_ziehen" in quelle, "Netzvorschau zieht die Kanten nicht"


def test_randabstand_meldet_nur_sperrende_bauwerke():
    """
    Ein quer zur Strömung stehendes Bauwerk am Zuflussrand lässt die
    Randbedingung auf die eigene Umströmung zurückwirken. Eine Mauer
    PARALLEL zur Strömung verdrängt dagegen nichts — Maßstab ist die
    Sperrbreite quer zur Randfläche.
    """
    from ..core.validate import validate_case

    def wand(punkte):
        spec = build_spec_stage3()
        spec.terrain = None
        spec.structures = [cs.StructWall(
            id="w", type="wall", patch="w",
            alignment=cs.Alignment(points=punkte), height=2.0, thickness=0.4)]
        spec.mesh.refinements = []
        spec.mesh.boundary_layers = None
        spec.evaluation.force_patches = []
        spec.evaluation.targets = []
        return [x["message"] for x in validate_case(spec, ".")
                if x["object_id"] == "w" and "bis zum Rand" in x["message"]]

    # quer zum Zuflussrand x_min, 12 m breit, nur 2 m entfernt
    assert wand([(2, 3, 97.0), (2, 15, 97.0)])
    # parallel zur Strömung: keine Sperrbreite, kein Befund
    assert not wand([(2, 9, 97.0), (14, 9, 97.0)])


def test_ganglinienluecke_wird_gemeldet(tmp_path):
    """
    Der Solver interpoliert zwischen den Stützstellen linear — eine Lücke
    schneidet die Spitze still ab.
    """
    from ..core.validate import validate_case

    spec = build_spec_stage3()
    spec.solver.end_time = 60.0
    csv = tmp_path / "zufluss.csv"
    zeilen = ["t,Q"] + [f"{t},0.5" for t in range(0, 21, 2)] + ["55,2.0", "60,0.5"]
    csv.write_text("\n".join(zeilen))
    spec.boundaries[0] = cs.BcInflowHydrograph(
        id="zulauf", patch="inlet", type="inflow_hydrograph",
        source="zufluss.csv", column_time="t", column_q="Q")
    msgs = [x["message"] for x in validate_case(spec, tmp_path)
            if x["object_id"] == "zulauf"]
    assert any("Lücke" in m for m in msgs), msgs


def _kuren_im_fall(spec, base=".") -> list[dict]:
    from ..core.validate import validate_case

    return [b["fix"] for b in validate_case(spec, base) if b.get("fix")]


def test_jede_kur_beseitigt_ihren_eigenen_befund(tmp_path):
    """
    Der Kern des Kur-Systems: was die Prüfung vorschlägt, muss den Befund
    auch wirklich abstellen — sonst ist der Knopf eine Behauptung.
    """
    from ..core.kur import anwenden
    from ..core.validate import validate_case

    def probe(bauen, erwartet: str) -> str:
        """Kur `erwartet` anwenden und melden, was von ihrem Befund übrig bleibt."""
        spec = bauen()
        fix = next((k for k in _kuren_im_fall(spec, tmp_path)
                    if k["aktion"] == erwartet), None)
        assert fix is not None, f"kein Befund mit Kur {erwartet}"
        anwenden(spec, fix["aktion"], fix["args"])
        # Fall muss danach noch gültig sein
        cs.CaseSpec.model_validate(spec.model_dump(mode="json"))
        offen = [b["message"] for b in validate_case(spec, tmp_path)
                 if b.get("fix", {}).get("aktion") == erwartet
                 and b.get("fix", {}).get("args") == fix["args"]]
        return offen[0] if offen else ""

    # 1) zu dünne Wand gegen die Zellgröße
    def duenn():
        spec = build_spec_stage3()
        spec.terrain = None
        spec.mesh.base_cell = 1.0
        spec.mesh.refinements = []
        spec.mesh.boundary_layers = None
        spec.evaluation.force_patches = []
        spec.evaluation.targets = []
        spec.structures = [cs.StructWall(
            id="w", type="wall", patch="w",
            alignment=cs.Alignment(points=[(8, 9, 97.0), (16, 9, 97.0)]),
            height=2.0, thickness=0.4)]
        return spec

    assert not probe(duenn, "verfeinerung_erhoehen")

    # 2) Kraftkriterium ohne Kraftauswertung
    def kraft():
        spec = build_spec_stage3()
        spec.terrain = None
        spec.evaluation.force_patches = []
        spec.evaluation.targets = [cs.TargetMaxForce(
            id="last", kind="max_force", at="becken_1")]
        return spec

    assert not probe(kraft, "kraftauswertung_ein")

    # 3) Verfeinerungsbox verfehlt den Wasserspiegel
    def spiegel():
        spec = build_spec_stage3()
        spec.terrain = None
        spec.evaluation.force_patches = []
        spec.evaluation.targets = []
        spec.mesh.refinements = [cs.RefineBox(
            id="r", type="box", extent=(4, 6, 93.0, 12, 12, 94.0), level=2)]
        spec.solver.initial_level = 96.0
        return spec

    assert not probe(spiegel, "box_auf_spiegel")


def test_kur_bindet_koerper_ins_gelaende_ein(tmp_path):
    from ..core.kur import anwenden
    from ..core.validate import validate_case

    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.evaluation.force_patches = []
    spec.evaluation.targets = []
    spec.mesh.refinements = []
    spec.structures = [cs.StructBasin(
        id="b", type="basin", patch="b",
        footprint=[(10, 10), (16, 10), (16, 15), (10, 15)],
        invert_level=97.5, wall_height=2.0, wall_thickness=0.3)]
    fix = next(b["fix"] for b in validate_case(spec, tmp_path)
               if b.get("fix", {}).get("aktion") == "gelaende_einbinden")
    anwenden(spec, fix["aktion"], fix["args"])
    assert any(e.type == "gelaende" for e in spec.structures[0].edits)
    assert not [b for b in validate_case(spec, tmp_path)
                if b.get("fix", {}).get("aktion") == "gelaende_einbinden"]
