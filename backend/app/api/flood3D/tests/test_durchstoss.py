"""
Tests „Rohr durch den Damm": ein Höhenfeld hat ein z je x/y und kann keinen
Tunnel haben — ein vergrabenes Rohr wird beim Vernetzen zugeschüttet. Mit
`durchstoesst_gelaende` entsteht stattdessen ein Erdkörper mit
ausgeschnittener Bohrung.
"""
from __future__ import annotations

import numpy as np
import pytest
import trimesh

from ..core import casespec as cs
from ..core.casebuilder import build_case
from ..core.solids import bohrkoerper, gelaende_koerper_bauen
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _damm_fall(bohren: bool) -> cs.CaseSpec:
    """Flaches Gelände auf 96 m, Rohr auf 94,5 m quer hindurch."""
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.structures = [cs.StructCulvert(
        id="dn800", type="culvert", patch="dn800",
        axis=[(12.0, 9.0, 94.5), (-0.5, 9.0, 94.5)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8),
        durchstoesst_gelaende=bohren)]
    spec.mesh.refinements = []
    spec.evaluation = cs.Evaluation()
    return spec


def _feld(spec) -> TerrainField:
    return TerrainField.from_spec(spec.terrain, spec.domain, ".")


def test_geländekörper_ist_dicht_und_ragt_über_das_gebiet():
    f = TerrainField(x0=0.0, y0=0.0, resolution=1.0,
                     z=np.array([[1.0, 2.0, 3.0], [1.0, 2.0, 3.0],
                                 [1.0, 2.0, 4.0]]))
    m = f.to_solid(-1.0, ueberstand=0.5)
    assert m.is_watertight and m.volume > 0
    # die senkrechten Wände dürfen nicht auf den Gebietsflächen liegen
    assert m.bounds[0][0] < 0.0 and m.bounds[1][0] > 2.0


def test_bohrkoerper_verlaengert_die_achse_in_ihrer_richtung():
    s = _damm_fall(True).structures[0]
    b = bohrkoerper(s, ueberstand=1.0)
    # Achse läuft in -x von 12.0 bis -0.5, also 13.0 bis -1.5 mit Überstand
    assert b.bounds[0][0] < -1.4 and b.bounds[1][0] > 12.9
    # Durchmesser = lichte Weite + 2x Wandstärke = 0.8 + 0.3
    assert b.bounds[1][1] - b.bounds[0][1] == pytest.approx(1.1, abs=0.02)


def test_bohrung_macht_ein_echtes_loch_im_erdkoerper():
    """
    Geprüft wird über das Volumen: dem Erdkörper muss genau der Rohrraum
    fehlen (Zylinder mit Außenradius über die Strecke im Erdreich).
    """
    spec = _damm_fall(True)
    feld = _feld(spec)
    zelle = spec.mesh.base_cell
    unterkante = min(float(np.min(feld.z)), spec.domain.z_min) - max(4 * zelle, 1.0)
    voll = feld.to_solid(unterkante, ueberstand=2 * zelle)
    gebohrt = gelaende_koerper_bauen(feld, spec)
    assert gebohrt is not None and gebohrt.is_watertight

    r = 0.4 + 0.15
    # Erdkörper reicht von x = -1 (Überstand) bis zum Bohrende: das INNERE
    # Achsende (x = 12) bekommt nur 5 cm Epsilon statt des vollen
    # Überstands — sonst fräste die Bohrung einen offenen Graben über das
    # Rohrende hinaus ins Simulationsgebiet (B1)
    laenge_im_erdreich = 12.05 - (-2 * zelle)
    erwartet = np.pi * r ** 2 * laenge_im_erdreich
    assert voll.volume - gebohrt.volume == pytest.approx(erwartet, rel=0.03)
    # die Bohrung darf nie Material HINZUFÜGEN (B2: invertierter Schnitt)
    assert gebohrt.volume < voll.volume


def test_muendungsende_behaelt_den_vollen_ueberstand():
    """B1: nur das innere Ende wird geklemmt, die Mündung durchstößt weiter."""
    spec = _damm_fall(True)
    s = spec.structures[0]
    zelle = spec.mesh.base_cell
    b = bohrkoerper(s, ueberstand=max(4 * zelle, 1.0),
                    domain=spec.domain, zelle=zelle)
    # Mündung bei x = -0.5 (außerhalb): voll verlängert auf -2.5
    assert b.bounds[0][0] == pytest.approx(-2.5, abs=0.02)
    # inneres Ende bei x = 12: nur 5 cm Epsilon
    assert b.bounds[1][0] == pytest.approx(12.05, abs=0.02)


def test_kaputter_erdkoerper_wird_gemeldet_statt_geschnitten():
    """B2: nicht wasserdichter Geländekörper → klare Meldung, kein Roulette."""
    spec = _damm_fall(True)
    # ein importierter, absichtlich offener Körper (eine einzelne Platte)
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        platte = trimesh.Trimesh(
            vertices=[(0, 0, 96), (24, 0, 96), (24, 18, 96), (0, 18, 96)],
            faces=[(0, 1, 2), (0, 2, 3)])
        stl = f"{td}/koerper.stl"
        platte.export(stl)
        spec.terrain.base.koerper = "koerper.stl"
        hinweise: list[str] = []
        gelaende_koerper_bauen(_feld(spec), spec, hinweise=hinweise,
                               base_dir=td)
        assert any("nicht wasserdicht" in h for h in hinweise)


def test_ohne_schalter_bleibt_das_gelaende_die_hoehenflaeche():
    spec = _damm_fall(False)
    assert gelaende_koerper_bauen(_feld(spec), spec) is None


def test_pruefung_meldet_das_vergrabene_rohr():
    spec = _damm_fall(False)
    befunde = [f for f in validate_case(spec, ".") if f["object_id"] == "dn800"]
    assert befunde and "unter dem Gelände" in befunde[0]["message"]
    # mit Schalter ist Ruhe
    spec = _damm_fall(True)
    assert not [f for f in validate_case(spec, ".")
                if f["object_id"] == "dn800" and "Gelände" in f["message"]]


def test_build_case_schreibt_den_gebohrten_koerper(tmp_path):
    spec = _damm_fall(True)
    build_case(spec, tmp_path, ".")
    m = trimesh.load(tmp_path / "constant" / "triSurface" / "terrain.stl")
    assert m.is_watertight, "der Erdkörper muss geschlossen sein"
    # ohne Bohrung wäre die Fläche eine offene Höhenfläche ohne Volumen
    assert m.volume > 0

    ohne = _damm_fall(False)
    build_case(ohne, tmp_path / "ohne", ".")
    flaeche = trimesh.load(tmp_path / "ohne" / "constant" / "triSurface"
                           / "terrain.stl")
    assert not flaeche.is_watertight


def test_seitenwaende_sind_richtig_gewickelt():
    """
    Der Erdkörper muss OHNE fix_normals() ein gültiger Volumenkörper sein.
    Die nachträgliche Reparatur traversiert den ganzen Flächengraphen und
    kostet bei einem 100-x-100-m-Gelände 90 Sekunden statt 0,4 — und der
    Körper wird bei jedem Geometrieabruf neu gebaut.
    """
    z = 100 + np.add.outer(np.arange(12) * 0.05, np.arange(9) * 0.02)
    f = TerrainField(x0=0.0, y0=0.0, resolution=0.5, z=z)
    m = f.to_solid(95.0, ueberstand=0.25)
    assert m.is_watertight and m.is_winding_consistent and m.is_volume
    assert m.volume > 0
    # jede Seitenwand zeigt nach außen: die Summe der Flächennormalen mal
    # Fläche verschwindet bei einem geschlossenen Körper
    gewicht = (m.face_normals * m.area_faces[:, None]).sum(axis=0)
    assert np.allclose(gewicht, 0.0, atol=1e-6)


def test_grundriss_auch_bei_zusammengesetzten_koerpern():
    """
    Ein Becken besteht aus Sohlplatte UND Ringwand. Der frühere Weg über
    trimesh.path.polygons.projected brauchte dafür `rtree` und lieferte
    ohne die Bibliothek still None — damit wirkte die Bearbeitung
    „Gelände" am Becken gar nicht und zwei Prüfregeln feuerten nie.
    """
    from ..core.solids import build_basin, grundriss, umriss_teile

    b = cs.StructBasin(id="b", type="basin", patch="b",
                       footprint=[(10, 10), (18, 10), (18, 16), (10, 16)],
                       invert_level=94.0, wall_height=2.0,
                       wall_thickness=0.3)
    m = build_basin(b)
    assert len(m.split(only_watertight=False)) == 2, "zusammengesetzt"
    g = grundriss(m)
    assert g is not None
    # Außenkontur = Grundriss + beidseits die Wanddicke
    assert g.area == pytest.approx((8 + 0.6) * (6 + 0.6), rel=0.01)
    assert len(umriss_teile(g)) == 1


def test_gelaende_anschluss_wirkt_am_becken():
    """Der Sockel muss den Körper bis unter das Gelände führen."""
    from ..core.solids import build_basin
    from ..core.solids import apply_edits

    spec = build_spec_stage3()
    spec.terrain.operations = []
    feld = _feld(spec)                       # flaches Gelände auf 96 m
    b = cs.StructBasin(id="b", type="basin", patch="b",
                       footprint=[(10, 10), (18, 10), (18, 16), (10, 16)],
                       invert_level=96.5, wall_height=2.0,
                       wall_thickness=0.3,
                       edits=[cs.EditGelaende(id="g", modus="einbinden",
                                              einbindetiefe=0.3)])
    roh = build_basin(b)
    assert roh.bounds[0][2] > 96.0, "Becken hängt zunächst über dem Gelände"
    mit = apply_edits(build_basin(b), b, spec.domain, feld)
    assert mit.bounds[0][2] == pytest.approx(96.0 - 0.3, abs=0.05)


def test_rechteckdurchlass_behaelt_breite_und_hoehe():
    """
    Die kürzeste Drehung von +z auf die Achse lässt offen, wie der
    Querschnitt um die Achse verdreht wird. Beim Kreis egal, beim Rechteck
    nicht: ein Durchlass 2,0 m breit und 1,0 m hoch kam in y-Richtung als
    1,0 m breit und 2,0 m hoch heraus.
    """
    from ..core.solids import build_culvert

    for achse in ([(0, 0, 95.0), (10, 0, 95.0)], [(0, 0, 95.0), (0, 10, 95.0)]):
        cv = cs.StructCulvert(
            id="c", type="culvert", patch="c", axis=achse,
            profile=cs.CulvertProfile(kind="rectangular", width=2.0,
                                      height=1.0))
        d = build_culvert(cv).extents
        # lichte Weite + beidseits 0,15 m Wand, Höhe entsprechend
        assert sorted(np.round(d, 2))[:2] == [1.3, 2.3]
        assert d[2] == pytest.approx(1.3, abs=0.01), "Höhe bleibt Höhe"


def test_maulprofil_wird_gebaut():
    """`arch` war im Schema zulässig und warf beim Bau."""
    from ..core.solids import bohrkoerper, build_culvert

    cv = cs.StructCulvert(
        id="maul", type="culvert", patch="maul",
        axis=[(0, 0, 95.0), (8, 0, 95.0)],
        profile=cs.CulvertProfile(kind="arch", width=2.0, height=1.6))
    m = build_culvert(cv)
    assert m.is_watertight and m.volume > 0
    # Scheitel als Halbkreis: Höhe 1,6 m + 2 x 0,15 m Wand
    assert m.extents[2] == pytest.approx(1.9, abs=0.02)
    assert bohrkoerper(cv, ueberstand=0.5) is not None


def test_erdkoerper_schalter_traegt_sohle_und_ueberstand():
    """
    Der Erdkörper ist eine EIGENSCHAFT des Geländes (kein Stapeleintrag):
    der Schalter macht ihn an, Sohle und Überstand stehen daneben. Die
    frühere Pseudo-Operation „Berechnungskörper" ist aufgelöst.
    """
    from ..core.solids import gelaende_koerper_bauen

    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.structures = []
    feld = _feld(spec)
    assert gelaende_koerper_bauen(feld, spec) is None, "ohne Angabe Fläche"

    spec.terrain.erdkoerper = "an"
    spec.terrain.erdkoerper_unterkante = 90.0
    spec.terrain.erdkoerper_ueberstand = 1.5
    k = gelaende_koerper_bauen(_feld(spec), spec)
    assert k is not None and k.is_watertight and k.volume > 0
    assert k.bounds[0][2] == pytest.approx(90.0, abs=0.01), "Sohle wie angegeben"
    x0, y0, x1, y1 = spec.domain.extent
    assert k.bounds[0][0] == pytest.approx(x0 - 1.5, abs=0.01)
    assert k.bounds[1][1] == pytest.approx(y1 + 1.5, abs=0.01)


def test_erdkoerper_ohne_masse_nimmt_sinnvolle_vorbelegung():
    from ..core.solids import gelaende_koerper_bauen

    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.terrain.erdkoerper = "an"
    spec.structures = []
    feld = _feld(spec)
    k = gelaende_koerper_bauen(feld, spec)
    # vier Zellhöhen (mindestens 1 m) unter dem tiefsten Punkt von
    # Gelände und Modellgebiet
    tief = min(float(feld.z.min()), spec.domain.z_min)
    luft = max(4 * spec.mesh.base_cell, 1.0)
    assert k.bounds[0][2] == pytest.approx(tief - luft, abs=0.05)


def test_migration_loest_berechnungskoerper_auf():
    """Alte Fälle mit der Pseudo-Operation laden sauber: die Operation
    verschwindet, Schalter und Maße wandern ans Gelände."""
    spec = build_spec_stage3()
    daten = spec.model_dump(mode="json", exclude_none=True)
    daten["terrain"]["operations"].append({
        "id": "koerper", "type": "berechnungskoerper",
        "unterkante": 91.0, "ueberstand": 2.5})
    neu = cs.CaseSpec.model_validate(cs.migriere(daten))
    assert not any(o.type == "berechnungskoerper"
                   for o in neu.terrain.operations
                   if hasattr(o, "type"))
    assert neu.terrain.erdkoerper == "an"
    assert neu.terrain.erdkoerper_unterkante == 91.0
    assert neu.terrain.erdkoerper_ueberstand == 2.5
