"""
Tests Stufe B3/B4: Rezepte.

Ein Rezept ist erst dann eines Knopfes wert, wenn das Ergebnis OHNE
Nacharbeit trägt. Diese Tests halten genau das fest — jedes Rezept muss
speicherbar und befundfrei einsetzen — und sichern die vier Fehler ab, die
beim Bauen aufgefallen sind:

  * Kriterien mit leerem Verweis blockieren das Speichern (das Rezept legt
    seinen Pegel bzw. seine Querschnitte deshalb selbst an),
  * Bauteile müssen auf der AUSHUBSOHLE stehen, nicht auf der lichten
    Sohle — sonst klafft darunter eine Fuge von einer Wandstärke,
  * eine Kaskade ist eine Rinne mit Stufen, kein Tunnel,
  * ein Bauteil über die volle Aushubbreite hat seine Eckpunkte genau auf
    der Kante des Aushubs.
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core import rezepte
from ..core.validate import validate_case


def _fall() -> cs.CaseSpec:
    return cs.CaseSpec(
        meta=cs.Meta(id="rezept"),
        domain=cs.Domain(extent=(0.0, 0.0, 30.0, 30.0), z_min=90.0, z_max=102.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source="flat:96.0", resolution=0.5),
            operations=[cs.OpBerechnungskoerper(id="kb",
                                                type="berechnungskoerper")]),
        structures=[],
        mesh=cs.Mesh(base_cell=0.5),
        solver=cs.Solver(application="interFoam", end_time=60.0,
                         initial_level=95.0, write_interval_fields=10.0,
                         write_interval_series=0.1),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=2.0),
            cs.BcOutflowFree(id="ablauf", patch="outlet", type="outflow_free"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ])


ALLE = sorted(rezepte.REZEPTE)


@pytest.mark.parametrize("name", ALLE)
def test_rezept_ist_speicherbar(name):
    """
    Der harte Test: ein Kriterium mit leerem Verweis wird von `Evaluation`
    abgelehnt — beim Einsetzen fällt das nicht auf, weil in die Liste
    hinein mutiert wird, erst beim Speichern.
    """
    spec = _fall()
    rezepte.einsetzen(spec, name, {}, ".")
    cs.CaseSpec.model_validate(spec.model_dump(mode="json", exclude_none=True))


@pytest.mark.parametrize("name", ALLE)
def test_rezept_setzt_ohne_befund_ein(name):
    spec = _fall()
    rezepte.einsetzen(spec, name, {}, ".")
    schlimm = [b for b in validate_case(spec, ".")
               if b["severity"] in ("fehler", "warnung")
               and b["object_id"] != "solver"]
    assert not schlimm, [b["message"] for b in schlimm]


@pytest.mark.parametrize("name", ALLE)
def test_rezept_erklaert_sich(name):
    spec = _fall()
    zeilen = rezepte.einsetzen(spec, name, {}, ".")
    assert len(zeilen) >= 2, "Kopfzeile plus mindestens ein Hinweis"
    assert rezepte.REZEPTE[name]["label"] in zeilen[0]


@pytest.mark.parametrize("name", ALLE)
def test_rezept_bringt_sein_regelwerk_mit(name):
    spec = _fall()
    rezepte.einsetzen(spec, name, {}, ".")
    assert spec.meta.nachweis.regelwerk, "Rezept ohne Regelwerksbezug"
    for r in spec.meta.nachweis.regelwerk:
        assert r.startswith("DWA-")


def test_zweimal_einsetzen_kollidiert_nicht():
    spec = _fall()
    rezepte.einsetzen(spec, "drosselschacht", {}, ".")
    rezepte.einsetzen(spec, "drosselschacht", {"center": (20.0, 20.0)}, ".")
    ids = [s.id for s in spec.structures]
    assert len(ids) == len(set(ids))
    pegel = [g.id for g in spec.evaluation.gauges]
    assert len(pegel) == len(set(pegel)) == 2


def test_regelwerk_wird_nicht_doppelt_eingetragen():
    spec = _fall()
    rezepte.einsetzen(spec, "tosbecken", {}, ".")
    rezepte.einsetzen(spec, "absturz", {}, ".")
    assert len(spec.meta.nachweis.regelwerk) == \
        len(set(spec.meta.nachweis.regelwerk))


def test_kriterien_zeigen_auf_echte_bezugsobjekte():
    spec = _fall()
    rezepte.einsetzen(spec, "drosselschacht", {}, ".")
    rezepte.einsetzen(spec, "trennbauwerk", {"center": (22.0, 22.0)}, ".")
    pegel = {g.id for g in spec.evaluation.gauges}
    qs = {s.id for s in spec.evaluation.sections}
    for t in spec.evaluation.targets:
        if t.kind == "max_level":
            assert t.at in pegel
        if t.kind == "discharge_ratio":
            assert t.of in qs and t.to in qs and t.of != t.to


def test_drosselwand_steht_auf_der_aushubsohle():
    """
    Endete die Wand auf der LICHTEN Sohle, klaffte darunter eine Fuge von
    einer Wandstärke — der Solver rechnet dort Wasser hindurch, und die
    Drossel wäre wirkungslos.
    """
    spec = _fall()
    rezepte.einsetzen(spec, "drosselschacht", {"tiefe": 2.5,
                                               "wandstaerke": 0.3}, ".")
    kammer = next(s for s in spec.structures if s.type == "kammer")
    wand = next(s for s in spec.structures if s.type == "wall")
    oberkante = max(p[2] for p in wand.alignment.points)
    unterkante = min(p[2] for p in wand.alignment.points) - wand.height
    assert unterkante == pytest.approx(kammer.invert_level
                                       - kammer.wall_thickness, abs=1e-6)
    assert oberkante == pytest.approx(kammer.top_level, abs=1e-6)


def test_kaskade_ist_oben_offen():
    """
    Jede Stufe bis zur Geländeoberfläche: ein bis zur Stufenoberkante
    gedeckelter Aushub wäre ein verschlossener Kasten und würde vom
    Vernetzer ersatzlos entfernt.
    """
    spec = _fall()
    rezepte.einsetzen(spec, "absturz", {"stufen": 3}, ".")
    stufen = [s for s in spec.structures if s.type == "kammer"]
    assert len(stufen) == 3
    assert len({s.top_level for s in stufen}) == 1, "alle bis an die Oberfläche"
    sohlen = [s.invert_level for s in stufen]
    assert sohlen == sorted(sohlen, reverse=True), "Sohle steigt ab"


def test_schacht_rezept_liefert_aushub_und_bauteil_mit_gleichen_massen():
    spec = _fall()
    rezepte.einsetzen(spec, "strassenablauf", {"weite": 1.0,
                                               "wandstaerke": 0.12}, ".")
    schaechte = [s for s in spec.structures if s.type == "schacht"]
    assert {s.wirkung for s in schaechte} == {"aushub", "bauteil"}
    a, b = schaechte
    assert (a.width, a.invert_level, a.top_level, a.wall_thickness) == \
           (b.width, b.invert_level, b.top_level, b.wall_thickness)


@pytest.mark.parametrize("name", ALLE)
def test_verfeinerungsboxen_bleiben_im_gebiet(name):
    """
    Am Gebietsrand ragte der Verfeinerungsquader hinaus — die Prüfung
    meldete dann einen Fehler an einem Objekt, das das Rezept selbst
    gerade angelegt hatte.
    """
    spec = _fall()
    x0, y0, x1, y1 = spec.domain.extent
    # dicht an die Ecke setzen
    rezepte.einsetzen(spec, name, {"center": (x0 + 1.0, y0 + 1.0)}, ".")
    for r in spec.mesh.refinements:
        if r.type != "box":
            continue
        bx0, by0, bz0, bx1, by1, bz1 = r.extent
        assert bx0 >= x0 - 1e-6 and by0 >= y0 - 1e-6
        assert bx1 <= x1 + 1e-6 and by1 <= y1 + 1e-6
        assert bz0 >= spec.domain.z_min - 1e-6
        assert bz1 <= spec.domain.z_max + 1e-6


def test_unbekanntes_rezept_wird_abgelehnt():
    with pytest.raises(ValueError, match="Unbekanntes Rezept"):
        rezepte.einsetzen(_fall(), "gibtsnicht", {}, ".")


def test_katalog_ist_vollstaendig():
    eintraege = rezepte.katalog()
    assert {e["id"] for e in eintraege} == set(rezepte.REZEPTE)
    for e in eintraege:
        assert e["label"] and e["beschreibung"]
