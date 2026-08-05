"""
Tests: aus Vermessungskanten wird Gelände.

Bisher wurde eine importierte Linie sofort zu einer Geländeoperation —
Zeichnungselement und Wirkung waren dasselbe Objekt, die Bedeutung („das
ist die Beckensohle") stand nirgends. Die Böschung entstand nur, wenn Ober-
und Unterkante zufällig passend BENANNT waren: gepaart wurde über den
Layernamen. Hießen die Layer „BK_oben" und „Boeschung_unten", fiel die
Paarung aus und beide wurden einzelne Bruchkanten.

Jetzt behält die Kante ihre Rolle, und was für das Gelände folgt, ergibt
sich aus Rolle UND Lage.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.kanten import ableiten, verknuepfen

RAND = [(4.0, 4.0), (16.0, 4.0), (16.0, 16.0), (4.0, 16.0)]
SOHLE = [(7.0, 7.0), (13.0, 7.0), (13.0, 13.0), (7.0, 13.0)]


def _ring(pts, z):
    return [(x, y, z) for x, y in pts] + [(pts[0][0], pts[0][1], z)]


def _kante(kid, poly, rolle):
    return cs.Vermessungskante(id=kid, polyline=poly, rolle=rolle)


def _fall(kanten, ops=None) -> cs.CaseSpec:
    return cs.CaseSpec(
        meta=cs.Meta(id="k"),
        domain=cs.Domain(extent=(0.0, 0.0, 25.0, 25.0), z_min=90.0, z_max=105.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source="flat:98.0", resolution=0.5),
            kanten=kanten, operations=ops or []),
        solver=cs.Solver(application="interFoam", end_time=1.0))


def _typen(spec):
    return [(o.id, o.type, getattr(o, "modus", None))
            for o in spec.terrain.operations]


# ---- Die Beziehung, um die es geht ---------------------------------------

def test_sohle_in_beckenrand_ergibt_boeschung_und_ebene_sohle():
    """
    Genau der Fall aus der Aufgabenstellung: die Sohle ist eine
    Ankerfläche — liegt sie innerhalb eines Beckenrands, entsteht die
    Fläche zwischen Sohle und Beckenrand.
    """
    spec = _fall([_kante("becken_rand", _ring(RAND, 100.0), "beckenrand"),
                  _kante("becken_sohle", _ring(SOHLE, 97.0), "sohle")])
    meldungen = verknuepfen(spec)

    arten = [t for _, t, _ in _typen(spec)]
    assert arten.count("boeschung") == 1
    assert ("eben_becken_sohle", "bruchkante", "ebnen") in _typen(spec)
    assert any("liegt in" in m for m in meldungen)

    boe = next(o for o in spec.terrain.operations if o.type == "boeschung")
    assert boe.oberkante[0][2] == pytest.approx(100.0), "Rand ist oben"
    assert boe.unterkante[0][2] == pytest.approx(97.0), "Sohle ist unten"


def test_ober_und_unterkante_werden_ueber_die_lage_gepaart():
    """
    Der Kern der Änderung: die Kennungen geben KEINEN Hinweis auf
    Zusammengehörigkeit. Früher blieben beide einzelne Bruchkanten.
    """
    ok = [(0.0, 20.0, 101.0), (20.0, 20.0, 101.0)]
    uk = [(0.0, 22.0, 99.0), (20.0, 22.0, 99.0)]
    spec = _fall([_kante("BK_oben", ok, "boeschung_ok"),
                  _kante("voellig_anderer_name", uk, "boeschung_uk")])
    meldungen = verknuepfen(spec)
    assert [t for _, t, _ in _typen(spec)] == ["boeschung"]
    assert any("über die Lage" in m for m in meldungen)


def test_die_richtige_gegenkante_wird_gewaehlt():
    """Bei mehreren Unterkanten gewinnt die, die wirklich daneben läuft."""
    ok = [(0.0, 20.0, 101.0), (20.0, 20.0, 101.0)]
    nah = [(0.0, 22.0, 99.0), (20.0, 22.0, 99.0)]
    fern = [(0.0, 200.0, 99.0), (20.0, 200.0, 99.0)]
    spec = _fall([_kante("ok", ok, "boeschung_ok"),
                  _kante("uk_fern", fern, "boeschung_uk"),
                  _kante("uk_nah", nah, "boeschung_uk")])
    verknuepfen(spec)
    boe = next(o for o in spec.terrain.operations if o.type == "boeschung")
    assert "uk_nah" in boe.aus_kanten and "uk_fern" not in boe.aus_kanten


def test_sohle_ohne_rand_wird_nur_geebnet():
    spec = _fall([_kante("planum", _ring(SOHLE, 97.0), "sohle")])
    verknuepfen(spec)
    assert _typen(spec) == [("eben_planum", "bruchkante", "ebnen")]


def test_offene_sohle_kann_keine_flaeche_bilden():
    """Eine Fläche braucht eine geschlossene Linie — das wird gesagt."""
    spec = _fall([_kante("rinne", [(0.0, 5.0, 97.0), (20.0, 5.0, 96.5)],
                         "sohle")])
    meldungen = verknuepfen(spec)
    assert _typen(spec)[0][2] == "ziehen", "als Bruchkante übernommen"
    assert any("nicht geschlossen" in m for m in meldungen)


def test_freie_kante_bleibt_bruchkante():
    spec = _fall([_kante("weg", [(0.0, 2.0, 98.5), (25.0, 2.0, 98.4)], "frei")])
    verknuepfen(spec)
    assert _typen(spec) == [("kante_weg", "bruchkante", "ziehen")]


def test_einzelne_oberkante_wird_gemeldet():
    spec = _fall([_kante("nur_ok", [(0.0, 9.0, 101.0), (9.0, 9.0, 101.0)],
                         "boeschung_ok")])
    meldungen = verknuepfen(spec)
    assert any("keine Gegenkante" in m for m in meldungen)


# ---- Was abgeleitet ist und was nicht ------------------------------------

def test_eigene_operationen_bleiben_unangetastet():
    eigen = cs.OpSetLevel(id="planum", type="set_level",
                          polygon=[(20.0, 20.0), (24.0, 20.0), (24.0, 24.0),
                                   (20.0, 24.0)], level=99.0)
    spec = _fall([_kante("weg", [(0.0, 2.0, 98.5), (25.0, 2.0, 98.4)], "frei")],
                 ops=[eigen])
    meldungen = verknuepfen(spec)
    ids = [o.id for o in spec.terrain.operations]
    assert "planum" in ids
    # `aus_kanten` tragen nur die Operationen, die überhaupt abgeleitet
    # werden können — set_level gehört nicht dazu und gilt damit als eigen
    assert getattr(next(o for o in spec.terrain.operations
                        if o.id == "planum"), "aus_kanten", []) == []
    assert any("unangetastet" in m for m in meldungen)


def test_zweimal_verknuepfen_verdoppelt_nichts():
    spec = _fall([_kante("becken_rand", _ring(RAND, 100.0), "beckenrand"),
                  _kante("becken_sohle", _ring(SOHLE, 97.0), "sohle")])
    verknuepfen(spec)
    erste = _typen(spec)
    verknuepfen(spec)
    assert _typen(spec) == erste


def test_geaenderte_rolle_erzeugt_ein_anderes_gelaende():
    """Die Rolle bleibt am Objekt — sie ist nachträglich änderbar."""
    spec = _fall([_kante("becken_rand", _ring(RAND, 100.0), "beckenrand"),
                  _kante("becken_sohle", _ring(SOHLE, 97.0), "sohle")])
    verknuepfen(spec)
    assert any(o.type == "boeschung" for o in spec.terrain.operations)

    spec.terrain.kanten[0].rolle = "frei"
    verknuepfen(spec)
    assert not any(o.type == "boeschung" for o in spec.terrain.operations)


def test_abgeleitetes_steht_vor_dem_eigenen():
    """
    Die Kanten formen das Gelände, von Hand Angelegtes wirkt darauf — die
    Reihenfolge im Stapel entscheidet über das Ergebnis.
    """
    eigen = cs.OpSetLevel(id="planum", type="set_level",
                          polygon=[(20.0, 20.0), (24.0, 20.0), (24.0, 24.0),
                                   (20.0, 24.0)], level=99.0)
    spec = _fall([_kante("weg", [(0.0, 2.0, 98.5), (25.0, 2.0, 98.4)], "frei")],
                 ops=[eigen])
    verknuepfen(spec)
    assert [o.id for o in spec.terrain.operations] == ["kante_weg", "planum"]


def test_ableiten_aendert_den_fall_nicht():
    spec = _fall([_kante("weg", [(0.0, 2.0, 98.5), (25.0, 2.0, 98.4)], "frei")])
    ops, bauteile, _ = ableiten(spec)
    assert ops and spec.terrain.operations == [] and bauteile == []


def test_ohne_kanten_passiert_nichts():
    assert "Keine Vermessungskanten" in verknuepfen(_fall([]))[0]


def test_kanten_ueberleben_das_speichern():
    spec = _fall([_kante("becken_sohle", _ring(SOHLE, 97.0), "sohle")])
    verknuepfen(spec)
    wieder = cs.CaseSpec.model_validate(spec.model_dump(mode="json"))
    assert len(wieder.terrain.kanten) == 1
    assert wieder.terrain.kanten[0].rolle == "sohle"
    assert wieder.terrain.operations[0].aus_kanten == ["becken_sohle"]


# ---- Stufe G2: mehr Beziehungen im Gelände -------------------------------

def _lin(y, z, x0=0.0, x1=20.0):
    return [(x0, y, z), (x1, y, z)]


def test_gerinnesohle_zwischen_zwei_boeschungen():
    """
    Vier Vermessungslinien sind das übliche Aufmaß eines Gerinnes. Bisher
    entstanden daraus zwei Böschungen und dazwischen ein Loch.

    Die Sohlbreite wird dabei NICHT geschätzt: beide Unterkanten sind
    vermessen, die Fläche dazwischen ist damit bestimmt.
    """
    spec = _fall([_kante("ok_links", _lin(10.0, 100.0), "boeschung_ok"),
                  _kante("uk_links", _lin(14.0, 97.0), "boeschung_uk"),
                  _kante("uk_rechts", _lin(18.0, 97.0), "boeschung_uk"),
                  _kante("ok_rechts", _lin(22.0, 100.0), "boeschung_ok")])
    meldungen = verknuepfen(spec)
    assert [t for _, t, _ in _typen(spec)] == ["boeschung"] * 3
    assert any("Gerinnesohle" in m for m in meldungen)

    sohle = next(o for o in spec.terrain.operations
                 if set(o.aus_kanten) == {"uk_links", "uk_rechts"})
    assert sohle.oberkante[0][2] == pytest.approx(97.0)


def test_dammkrone_zwischen_zwei_boeschungen():
    """
    Dieselbe Anordnung umgekehrt — und genau daran ist sie zu erkennen:
    beim Damm liegen die OBEREN Kanten innen.
    """
    spec = _fall([_kante("uk_west", _lin(10.0, 98.0), "boeschung_uk"),
                  _kante("ok_west", _lin(14.0, 103.0), "boeschung_ok"),
                  _kante("ok_ost", _lin(18.0, 103.0), "boeschung_ok"),
                  _kante("uk_ost", _lin(22.0, 98.0), "boeschung_uk")])
    meldungen = verknuepfen(spec)
    assert [t for _, t, _ in _typen(spec)] == ["boeschung"] * 3
    assert any("Dammkrone" in m for m in meldungen)


def test_eine_krone_traegt_boeschungen_auf_beiden_seiten():
    """Eine Böschungsoberkante gehört zu einer Böschung, eine Krone zu zwei."""
    spec = _fall([_kante("uk_west", _lin(10.0, 98.0), "boeschung_uk"),
                  _kante("krone", _lin(16.0, 103.0), "krone"),
                  _kante("uk_ost", _lin(22.0, 98.0), "boeschung_uk")])
    verknuepfen(spec)
    boeschungen = [o for o in spec.terrain.operations if o.type == "boeschung"]
    assert len(boeschungen) == 2
    assert all("krone" in o.aus_kanten for o in boeschungen)


def test_gestuftes_becken_paart_mit_dem_naechstgroesseren_ring():
    """
    Rand, Berme und Sohle: zöge die Sohle zum äußersten Ring, spannte die
    Böschung über die Berme hinweg und die Stufe verschwände.
    """
    # zwischen RAND (4…16) und SOHLE (7…13)
    berme = [(5.5, 5.5), (14.5, 5.5), (14.5, 14.5), (5.5, 14.5)]
    spec = _fall([_kante("rand", _ring(RAND, 100.0), "beckenrand"),
                  _kante("berme", _ring(berme, 98.0), "beckenrand"),
                  _kante("sohle", _ring(SOHLE, 95.0), "sohle")])
    verknuepfen(spec)
    paare = {frozenset(o.aus_kanten) for o in spec.terrain.operations
             if o.type == "boeschung"}
    assert paare == {frozenset({"berme", "rand"}),
                     frozenset({"sohle", "berme"})}


def test_die_innere_flaeche_wird_nicht_zusaetzlich_bruchkante():
    """
    Sonst stünde neben der erzeugten Fläche die Meldung, aus dieser Kante
    lasse sich keine Fläche bilden.
    """
    spec = _fall([_kante("uk_west", _lin(10.0, 98.0), "boeschung_uk"),
                  _kante("krone_a", _lin(14.0, 103.0), "krone"),
                  _kante("krone_b", _lin(18.0, 103.0), "krone"),
                  _kante("uk_ost", _lin(22.0, 98.0), "boeschung_uk")])
    meldungen = verknuepfen(spec)
    assert not any(t == "bruchkante" for _, t, _ in _typen(spec))
    assert not any("lässt sich daraus nicht bilden" in m for m in meldungen)


# ---- Stufe G4: aus einer Kante wird ein BAUTEIL --------------------------

class _EbenesGelaende:
    """Höhenfeld-Ersatz: überall dieselbe Höhe."""

    def __init__(self, z):
        self.z = z

    def sample(self, xs, ys):
        return np.full(np.shape(xs), self.z, dtype=float)


def test_mauerkrone_wird_eine_wand_und_kein_gelaendeknick():
    """
    Als Bruchkante gezeichnet zöge eine Mauerkrone den Boden nach oben.
    Eine Mauer wird aber UMSTRÖMT — ohne eigene Fläche gäbe es weder
    Kraft noch Patch.
    """
    spec = _fall([_kante("beckenwand", [(4.0, 4.0, 102.0), (16.0, 4.0, 102.0)],
                         "mauer")])
    spec.terrain.kanten[0].breite = 0.4
    meldungen = verknuepfen(spec, _EbenesGelaende(98.0))

    assert spec.terrain.operations == [], "kein Geländeeingriff"
    wand = spec.structures[0]
    assert wand.type == "wall" and wand.thickness == pytest.approx(0.4)
    assert wand.aus_kanten == ["beckenwand"]
    assert any("wird umströmt" in m for m in meldungen)


def test_die_gemeldete_fusshoehe_ist_die_gebaute():
    """
    Die Zeichnung gibt nur die Krone her; wie tief das Bauteil gründet,
    steht im Gelände darunter. Meldung und Geometrie müssen dasselbe
    sagen — sonst ist die Begründung eine Behauptung.
    """
    from ..core.solids import build_wall, build_weir

    spec = _fall([_kante("mauer", [(4.0, 4.0, 102.0), (16.0, 4.0, 102.0)],
                         "mauer"),
                  _kante("wehr", [(4.0, 9.0, 101.0), (16.0, 9.0, 101.0)],
                         "wehrkrone")])
    verknuepfen(spec, _EbenesGelaende(98.0))
    soll = 98.0 - 0.3
    wand = next(s for s in spec.structures if s.type == "wall")
    wehr = next(s for s in spec.structures if s.type == "weir")
    assert build_wall(wand).bounds[0][2] == pytest.approx(soll)
    assert build_weir(wehr).bounds[0][2] == pytest.approx(soll)


def test_ohne_gelaende_wird_die_gruendung_als_vorbelegung_gemeldet():
    spec = _fall([_kante("wehr", [(4.0, 9.0, 101.0), (16.0, 9.0, 101.0)],
                         "wehrkrone")])
    meldungen = verknuepfen(spec)
    assert any("vorbelegt" in m for m in meldungen)
    assert spec.structures[0].base_level is None


def test_abgeleitetes_bauteil_behaelt_seine_kennung():
    """
    An einem Bauwerk hängen Patchname, Kraftauswertung, Verfeinerung und
    Kriterien. Eine wechselnde Kennung ließe all diese Verweise ins Leere
    zeigen — anders als bei einer Geländeoperation, auf die nichts zeigt.
    """
    spec = _fall([_kante("wehr", [(4.0, 9.0, 101.0), (16.0, 9.0, 101.0)],
                         "wehrkrone")])
    verknuepfen(spec, _EbenesGelaende(98.0))
    kennung, patch = spec.structures[0].id, spec.structures[0].patch
    for _ in range(3):
        verknuepfen(spec, _EbenesGelaende(98.0))
    assert len(spec.structures) == 1
    assert (spec.structures[0].id, spec.structures[0].patch) == (kennung, patch)


def test_eigenes_bauwerk_bleibt_unangetastet():
    spec = _fall([_kante("wehr", [(4.0, 9.0, 101.0), (16.0, 9.0, 101.0)],
                         "wehrkrone")])
    spec.structures.append(cs.StructPier(
        id="pfeiler", type="pier", patch="pfeiler", shape="rund",
        center=(10.0, 20.0), width=1.0, base_level=95.0, top_level=99.0))
    verknuepfen(spec, _EbenesGelaende(98.0))
    assert {s.id for s in spec.structures} == {"pfeiler", "wehr"}


def test_geleertes_aus_kanten_loest_das_bauteil_ab():
    """Der Ablösemechanismus gilt für Bauteile wie für Operationen."""
    spec = _fall([_kante("wehr", [(4.0, 9.0, 101.0), (16.0, 9.0, 101.0)],
                         "wehrkrone")])
    verknuepfen(spec, _EbenesGelaende(98.0))
    spec.structures[0].aus_kanten = []
    spec.structures[0].crest_width = 2.5      # von Hand geändert
    spec.terrain.kanten[0].rolle = "frei"
    verknuepfen(spec, _EbenesGelaende(98.0))
    assert len(spec.structures) == 1
    assert spec.structures[0].crest_width == pytest.approx(2.5)


def test_bauteilkanten_nehmen_nicht_an_gelaendebeziehungen_teil():
    """Eine Mauerkrone ist keine Böschungsoberkante."""
    spec = _fall([_kante("mauer", [(0.0, 10.0, 102.0), (20.0, 10.0, 102.0)],
                         "mauer"),
                  _kante("uk", [(0.0, 13.0, 98.0), (20.0, 13.0, 98.0)],
                         "boeschung_uk")])
    verknuepfen(spec, _EbenesGelaende(98.0))
    assert not any(o.type == "boeschung" for o in spec.terrain.operations)
