"""
Tests Stufe B: Aushub statt Fläche.

Seit das Gelände ein geschlossener Erdkörper sein kann, ist jedes Bauwerk
eine Kombination aus Aushub und Bauteil — Beton ist, was übrig bleibt;
Wasser ist, was ausgehoben wurde. Die tragende Invariante dieser Stufe:

    Aushubkörper − Bauteilkörper = der lichte Raum, exakt.

Sie wird hier für alle drei Grundtypen analytisch nachgerechnet, weil
`trimesh.contains()` in dieser Umgebung nicht zur Verfügung steht (rtree
fehlt) und ein Punkt-in-Körper-Test damit ausscheidet.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from ..core import casespec as cs
from ..core import solids
from ..core.solids import gelaende_koerper_bauen
from ..core.terrain import TerrainField
from ..core.validate import validate_case


def _fall(strukturen, koerper: bool = True) -> cs.CaseSpec:
    ops = [cs.OpBerechnungskoerper(id="kb", type="berechnungskoerper")] \
        if koerper else []
    return cs.CaseSpec(
        meta=cs.Meta(id="aushub"),
        domain=cs.Domain(extent=(0.0, 0.0, 20.0, 20.0), z_min=90.0, z_max=102.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source="flat:96.0", resolution=0.5),
            operations=ops),
        structures=strukturen,
        mesh=cs.Mesh(base_cell=0.5),
        solver=cs.Solver(application="interFoam", end_time=60.0,
                         initial_level=94.0,
                         write_interval_fields=10.0, write_interval_series=0.1),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=0.1),
            cs.BcOutflowFree(id="ablauf", patch="outlet", type="outflow_free"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ])


def _schacht(**kw) -> cs.StructSchacht:
    args = dict(id="sch", type="schacht", patch="sch", shape="rund",
                center=(10.0, 10.0), width=1.0, invert_level=92.0,
                top_level=96.5, wall_thickness=0.2, wirkung="aushub")
    args.update(kw)
    return cs.StructSchacht(**args)


def _kammer(**kw) -> cs.StructKammer:
    args = dict(id="kam", type="kammer", patch="kam",
                footprint=[(8.0, 8.0), (12.0, 8.0), (12.0, 12.0), (8.0, 12.0)],
                invert_level=92.0, top_level=96.5, wall_thickness=0.3,
                wirkung="aushub")
    args.update(kw)
    return cs.StructKammer(**args)


def _graben(**kw) -> cs.StructGraben:
    args = dict(id="grb", type="graben", patch="grb",
                axis=[(2.0, 10.0, 93.0), (18.0, 10.0, 92.8)],
                profile=cs.GrabenProfil(kind="trapez", width=2.0, height=1.5,
                                        side_slope=1.5),
                wall_thickness=0.25, wirkung="aushub")
    args.update(kw)
    return cs.StructGraben(**args)


# ---- Die tragende Invariante ---------------------------------------------

@pytest.mark.parametrize("bau,lichter_raum", [
    (_schacht, math.pi * 0.5 ** 2 * (96.5 - 92.0)),
    (_kammer, 4.0 * 4.0 * (96.5 - 92.0)),
    # Trapez: Sohle 2,0, Krone 2,0 + 2·1,5·1,5 = 6,5, Höhe 1,5 -> 6,375 m²
    (_graben, 6.375 * 16.0),
])
def test_aushub_minus_bauteil_ist_der_lichte_raum(bau, lichter_raum):
    aushub = solids.koerper_von(bau(wirkung="aushub"))
    bauteil = solids.koerper_von(bau(wirkung="bauteil"))
    assert aushub.is_watertight and bauteil.is_watertight
    assert aushub.volume - bauteil.volume == pytest.approx(lichter_raum, rel=2e-3)


def test_ohne_wandstaerke_ist_bauteil_gleich_aushub():
    a = solids.koerper_von(_kammer(wall_thickness=0.0, wirkung="aushub"))
    b = solids.koerper_von(_kammer(wall_thickness=0.0, wirkung="bauteil"))
    assert a.volume == pytest.approx(b.volume, rel=1e-9)


def test_aushub_greift_eine_wandstaerke_tiefer():
    """
    Der Bagger nimmt die Wand mit: läge die Aushubsohle auf der lichten
    Sohle, stünde die Sohlplatte des Bauteils im gewachsenen Boden.
    """
    a = solids.koerper_von(_kammer(wirkung="aushub"))
    assert float(a.bounds[0][2]) == pytest.approx(92.0 - 0.3, abs=1e-6)


# ---- Wirkung auf Netz und Gelände ----------------------------------------

def test_aushub_wird_aus_dem_erdkoerper_geschnitten():
    leer, voll = _fall([]), _fall([_kammer()])
    ohne = gelaende_koerper_bauen(
        TerrainField.from_spec(leer.terrain, leer.domain, "."), leer, base_dir=".")
    mit = gelaende_koerper_bauen(
        TerrainField.from_spec(voll.terrain, voll.domain, "."), voll,
        hinweise=[], base_dir=".")
    # ausgehoben wird nur, was UNTER dem Gelände liegt (96,0), von der
    # Aushubsohle 91,7 an
    assert ohne.volume - mit.volume == pytest.approx(4.6 * 4.6 * 4.3, rel=1e-3)
    assert mit.is_watertight


def test_aushub_bekommt_keinen_eigenen_patch():
    spec = _fall([_kammer(), _schacht(wirkung="bauteil")])
    patches = solids.build_solids(spec, ".")
    assert "kam" not in patches, "Hohlraum ist keine eigene Fläche"
    assert "sch" in patches


def test_aushub_erzwingt_den_erdkoerper():
    """Ohne Körper kann ein Höhenfeld den Hohlraum gar nicht tragen."""
    spec = _fall([_kammer()], koerper=False)
    assert solids.braucht_erdkoerper(spec)
    feld = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    assert gelaende_koerper_bauen(feld, spec, hinweise=[], base_dir=".") is not None


def test_ohne_aushub_bleibt_die_hoehenflaeche():
    spec = _fall([_kammer(wirkung="bauteil")], koerper=False)
    assert not solids.braucht_erdkoerper(spec)


# ---- wirkung: auto — der Aushub ergibt sich aus der Lage -----------------

def _feld(spec):
    return TerrainField.from_spec(spec.terrain, spec.domain, ".")


@pytest.mark.parametrize("sohle,oben,erwartet", [
    (96.0, 98.0, "bauteil"),    # frisch abgesetzt: Sohle auf dem Gelände
    (95.0, 97.0, "bauteil"),    # halb versenkt, ragt noch heraus
    (94.5, 96.02, "aushub"),    # fast bündig — Deckel schließt ab
    (94.0, 96.0, "aushub"),     # bündig eingebaut
    (93.0, 95.0, "aushub"),     # ganz im Boden
])
def test_lage_entscheidet_ueber_aushub(sohle, oben, erwartet):
    """
    Gelände auf 96,00 m. Ein neu abgesetzter Schacht steht darauf und ist
    ein Bauteil; erst wenn er so weit hineingeschoben wird, dass die
    Oberkante bündig oder darunter liegt, wird er zur Grube.
    """
    spec = _fall([_schacht(invert_level=sohle, top_level=oben, wirkung="auto")])
    st = spec.structures[0]
    assert solids.wirkung_von(st, _feld(spec)) == erwartet


@pytest.mark.parametrize("gesetzt", ["bauteil", "aushub"])
def test_feste_einstellung_schlaegt_die_lage(gesetzt):
    # auf dem Gelände abgesetzt, aber ausdrücklich anders eingestellt
    spec = _fall([_schacht(invert_level=96.0, top_level=98.0, wirkung=gesetzt)])
    assert solids.wirkung_von(spec.structures[0], _feld(spec)) == gesetzt


def test_eingegrabene_wand_wird_keine_grube():
    """
    Nur Schacht, Kammer und Graben erkennen sich selbst als Aushub. Eine in
    den Boden geschobene Wand soll eine eingegrabene Wand bleiben — sie
    stillschweigend in einen Hohlraum umzudeuten hieße, Beton durch Wasser
    zu ersetzen.
    """
    spec = _fall([cs.StructWall(
        id="wand", type="wall", patch="wand",
        alignment=cs.Alignment(points=[(8.0, 8.0, 94.0), (12.0, 8.0, 94.0)]),
        height=2.0, thickness=0.4)])
    assert solids.wirkung_von(spec.structures[0], _feld(spec)) == "bauteil"


def test_auto_auf_dem_gelaende_braucht_keinen_erdkoerper():
    spec = _fall([_schacht(invert_level=96.0, top_level=98.0, wirkung="auto")],
                 koerper=False)
    assert not solids.braucht_erdkoerper(spec, _feld(spec))
    assert "sch" in solids.build_solids(spec, "."), "steht als Bauteil im Netz"


def test_auto_eingegraben_wird_ausgeschnitten():
    spec = _fall([_schacht(invert_level=93.0, top_level=95.0, wirkung="auto")],
                 koerper=False)
    feld = _feld(spec)
    assert solids.braucht_erdkoerper(spec, feld)
    assert "sch" not in solids.build_solids(spec, "."), "Hohlraum, keine Fläche"
    assert gelaende_koerper_bauen(feld, spec, hinweise=[], base_dir=".") is not None


def test_ohne_gelaende_bleibt_auto_ein_bauteil():
    """Ohne Höhenfeld gibt es nichts, wogegen sich „eingegraben" messen ließe."""
    spec = _fall([_schacht(wirkung="auto")])
    spec.terrain = None
    assert solids.wirkung_von(spec.structures[0], None) == "bauteil"


# ---- Prüfregeln ----------------------------------------------------------

def _messages(spec, obj_id):
    return [b["message"] for b in validate_case(spec)
            if b["object_id"] == obj_id]


def test_geschlossener_hohlraum_wird_gemeldet():
    """
    Der Vernetzer behält nur, was mit dem Strömungsgebiet zusammenhängt —
    ein rundum verschlossener Kasten im Erdreich fällt ersatzlos weg. Genau
    hier versagt der locationInMesh-Automatismus.
    """
    spec = _fall([_kammer(top_level=95.0)])      # Gelände liegt auf 96,0
    assert any("rundum verschlossener Hohlraum" in m
               for m in _messages(spec, "kam"))


def test_bis_an_die_oberflaeche_gefuehrt_ist_kein_befund():
    spec = _fall([_kammer(top_level=96.5)])
    assert not any("Hohlraum" in m for m in _messages(spec, "kam"))


def test_aushub_ohne_gelaende_ist_ein_fehler():
    spec = _fall([_kammer()])
    spec.terrain = None
    assert any("nur aus einem Gelände" in m for m in _messages(spec, "kam"))


def test_verweis_auf_den_aushub_patch_wird_gemeldet():
    spec = _fall([_kammer()])
    spec.evaluation.force_patches.append("kam")
    spec.mesh.refinements.append(
        cs.RefineSurface(id="r1", type="surface", target="kam", level=2))
    m = " ".join(_messages(spec, "kam"))
    assert "Kraftauswertung" in m and "Flächenverfeinerung" in m
    assert "terrain" in m


def test_verfeinerung_des_hohlraums_zielt_auf_das_gelaende():
    """
    Die Wandungen des Hohlraums gehören zur Geländefläche — die Kur muss
    deshalb `terrain` verfeinern, nicht den nicht existierenden Patch.
    """
    spec = _fall([_schacht(width=0.3)])           # kleiner als 4 Zellen
    b = next(x for x in validate_case(spec)
             if x["object_id"] == "sch" and "aufgelöst" in x["message"])
    assert "Hohlraum im Gelände" in b["message"]
    assert b["fix"]["args"]["patch"] == "terrain"
