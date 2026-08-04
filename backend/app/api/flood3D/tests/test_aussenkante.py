"""
Tests Außenkante: außerhalb der äußersten Vermessungslinie führt der Import
die nächstgelegene gemessene Höhe fort — die Außenkante wellt sich dadurch
mit der Oberkante mit. Die Operation „aussenkante" setzt an ihre Stelle eine
bestimmte Kante und blendet linear dorthin über.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.terrain import TerrainField


def _fall(rahmen_z: float | list, innen_z: float = 100.0) -> cs.CaseSpec:
    """Rundes Plateau auf innen_z, Rahmen am Gebietsrand auf rahmen_z."""
    ring = [(4.0, 4.0, innen_z), (16.0, 4.0, innen_z),
            (16.0, 16.0, innen_z), (4.0, 16.0, innen_z), (4.0, 4.0, innen_z)]
    zs = rahmen_z if isinstance(rahmen_z, list) else [rahmen_z] * 4
    rahmen = [(0.0, 0.0, zs[0]), (20.0, 0.0, zs[1]),
              (20.0, 20.0, zs[2]), (0.0, 20.0, zs[3])]
    return cs.CaseSpec(
        meta=cs.Meta(id="aussen"),
        domain=cs.Domain(extent=(0.0, 0.0, 20.0, 20.0), z_min=90.0, z_max=110.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source="flat:95.0", resolution=1.0),
            operations=[
                cs.OpBoeschung(id="becken", type="boeschung",
                               oberkante=ring,
                               unterkante=[(7.0, 7.0, 97.0), (13.0, 7.0, 97.0),
                                           (13.0, 13.0, 97.0), (7.0, 13.0, 97.0),
                                           (7.0, 7.0, 97.0)]),
                cs.OpAussenkante(id="rand", type="aussenkante",
                                 polygon=rahmen, innen="becken"),
            ]),
        mesh=cs.Mesh(base_cell=1.0),
        solver=cs.Solver(application="interFoam", end_time=1.0))


def test_aussen_wird_zur_rahmenhoehe_gezogen():
    spec = _fall(rahmen_z=104.0)
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    # direkt am Gebietsrand gilt die Rahmenhöhe
    assert float(f.sample(np.array(0.0), np.array(10.0))) == pytest.approx(104.0, abs=0.2)
    # auf halbem Weg zwischen Oberkante (100) und Rahmen (104)
    assert float(f.sample(np.array(2.0), np.array(10.0))) == pytest.approx(102.0, abs=0.5)
    # innerhalb der Oberkante bleibt die Vermessung unangetastet
    innen = float(f.sample(np.array(10.0), np.array(10.0)))
    assert innen < 98.0


def test_jede_ecke_traegt_ihre_eigene_hoehe():
    spec = _fall(rahmen_z=[102.0, 106.0, 106.0, 102.0])
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    links = float(f.sample(np.array(0.0), np.array(0.0)))
    rechts = float(f.sample(np.array(20.0), np.array(0.0)))
    assert links == pytest.approx(102.0, abs=0.3)
    assert rechts == pytest.approx(106.0, abs=0.3)


def test_ohne_bezugskante_passiert_nichts():
    spec = _fall(rahmen_z=104.0)
    spec.terrain.operations[1].innen = "gibtsnicht"
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    # Basisgelände bleibt stehen, statt eine Kante zu erfinden
    assert float(f.sample(np.array(0.0), np.array(10.0))) == pytest.approx(95.0, abs=0.1)


def test_ohne_aussenkante_bleibt_die_alte_fortfuehrung():
    spec = _fall(rahmen_z=104.0)
    spec.terrain.operations = spec.terrain.operations[:1]
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    assert float(f.sample(np.array(0.0), np.array(10.0))) == pytest.approx(95.0, abs=0.1)


def test_adaptiv_ohne_rahmen_fuehrt_die_kante_fort():
    """
    Der Regelfall: kein Rahmen, das Gelände läuft von der Bezugskante mit
    dem angegebenen Gefälle bis an den Gebietsrand. Ohne diese Operation
    steht dort, was der Import aus der NÄCHSTEN gemessenen Höhe
    fortgeführt hat — im echten Fall bis 0,5 m über die höchste gemessene
    Oberkante und über den Gebietsdeckel hinaus.
    """
    spec = _fall(rahmen_z=0.0)          # Rahmen wird gleich entfernt
    aussen = spec.terrain.operations[1]
    aussen.polygon = None
    aussen.gefaelle = 0.0
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    # Oberkante liegt auf 100,0 — außerhalb bleibt es dabei, bis an den Rand
    for x, y in [(0.0, 10.0), (20.0, 10.0), (10.0, 0.0), (0.0, 0.0)]:
        z = float(f.sample(np.array(x), np.array(y)))
        assert z == pytest.approx(100.0, abs=0.05), (x, y, z)
    # innerhalb unangetastet
    assert float(f.sample(np.array(10.0), np.array(10.0))) < 98.0


def test_gefaelle_laesst_das_gelaende_nach_aussen_abfallen():
    spec = _fall(rahmen_z=0.0)
    aussen = spec.terrain.operations[1]
    aussen.polygon = None
    aussen.gefaelle = -0.1                     # 10 % Gefälle nach außen
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    # 4 m außerhalb der Oberkante (x = 0 gegen Kante bei x = 4)
    assert float(f.sample(np.array(0.0), np.array(10.0))) == pytest.approx(
        100.0 - 0.4, abs=0.06)


def test_rahmen_bleibt_moeglich():
    """Wer die Ecken von Hand setzt, bekommt weiter die Überblendung."""
    spec = _fall(rahmen_z=104.0)
    f = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    assert float(f.sample(np.array(0.0), np.array(10.0))) == pytest.approx(
        104.0, abs=0.2)


def test_gelaende_ueber_dem_gebietsdeckel_wird_gemeldet_und_gerichtet(tmp_path):
    """
    Hinter der letzten Vermessungslinie führt der Import die nächste
    gemessene Höhe fort — die kann höher liegen als jede Oberkante und über
    den Gebietsdeckel hinauswachsen. Dann schneidet die Gebietsgrenze in
    den Berg und die Atmosphärenfläche liegt im Erdreich.
    """
    from ..core.kur import anwenden
    from ..core.validate import validate_case

    spec = _fall(rahmen_z=104.0)
    spec.domain.z_max = 102.0            # Rahmen auf 104 ragt darüber
    befunde = [b for b in validate_case(spec, tmp_path)
               if b["object_id"] == "domain"]
    assert befunde and "über den Gebietsdeckel" in befunde[0]["message"]
    fix = befunde[0]["fix"]
    assert fix["aktion"] == "gebiet_hoehe_anpassen"

    anwenden(spec, fix["aktion"], {"base_dir": str(tmp_path)})
    assert spec.domain.z_max > 104.0
    assert not [b for b in validate_case(spec, tmp_path)
                if b["object_id"] == "domain"
                and "Gebietsdeckel" in b["message"]]
