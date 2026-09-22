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
            operations=[], erdkoerper="an"),
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


# ---- E6f (Audit P14): Rezepte folgen der Fließrichtung, der Zelle und dem
# Blickpunkt statt festen Metern in +y aus der Gebietsmitte

def test_tosbecken_folgt_der_zulaufrichtung():
    spec = _fall()
    zulauf = next(b for b in spec.boundaries if b.type.startswith("inflow"))
    zulauf.face = "y_max"                                 # Zulauf von Norden → Strömung −y
    rezepte.einsetzen(spec, "tosbecken", {}, ".")
    schwelle = next(s for s in spec.structures if s.id.startswith("endschwelle"))
    sk = [s for s in spec.structures if s.id.startswith("stoerkoerper")]
    assert sk and schwelle.crest_polyline[0][1] < min(s.center[1] for s in sk)
    spec2 = _fall()
    zulauf2 = next(b for b in spec2.boundaries if b.type.startswith("inflow"))
    zulauf2.face = "x_min"                                # Zulauf von Westen → +x
    rezepte.einsetzen(spec2, "tosbecken", {}, ".")
    schwelle2 = next(s for s in spec2.structures if s.id.startswith("endschwelle"))
    sk2 = [s for s in spec2.structures if s.id.startswith("stoerkoerper")]
    assert schwelle2.crest_polyline[0][0] > max(s.center[0] for s in sk2)


def test_tosbecken_masse_folgen_der_zelle():
    spec = _fall()
    spec.mesh.base_cell = 1.0
    rezepte.einsetzen(spec, "tosbecken", {}, ".")
    sk = next(s for s in spec.structures if s.id.startswith("stoerkoerper"))
    assert sk.width >= 2.0                                # vorher fest 0,4 m
    schwelle = next(s for s in spec.structures if s.id.startswith("endschwelle"))
    assert schwelle.crest_width >= 2.0                    # vorher fest 0,4 m
    box = next(r for r in spec.mesh.refinements if r.id.startswith("fein_tosbecken"))
    becken = next(s for s in spec.structures if s.id.startswith("tosbecken"))
    xs = [p[0] for p in becken.footprint]
    assert box.extent[0] <= min(xs) - 2.0 + 1e-6           # Rand zwei Zellen, vorher 1,0 m


# ---- E7a: der Blickpunkt darf neben dem Gebiet liegen ---------------------
# Seit E6e schickt der Client den Blickpunkt der Kamera als `center` mit;
# der verlässt das Gebiet beim ersten Schwenk. Gemessen am 2026-09-22
# (Kopie BetaTest10, Browsersonde): ein Rezept 15 m neben dem Gebiet legte
# 3 bis 14 Befunde an — bis hin zu „18,8 Mio Zellen" aus einem verdrehten
# Verfeinerungsquader. Der Bauplan rückt jetzt als Ganzes hinein.

AUSSEN = [(45.0, 40.0), (-100.0, -100.0), (0.0, 15.0), (30.0, 30.0)]
_DRAUSSEN = ("außerhalb", "hinaus", "nicht vollständig im Modellgebiet")


@pytest.mark.parametrize("name", ALLE)
@pytest.mark.parametrize("center", AUSSEN)
def test_rezept_bleibt_im_gebiet(name, center):
    spec = _fall()
    zeilen = rezepte.einsetzen(spec, name, {"center": center}, ".")
    x0, y0, x1, y1 = spec.domain.extent
    for s in spec.structures:
        for x, y in _punkte(s):
            assert x0 - 1e-6 <= x <= x1 + 1e-6, f"{s.id}: x = {x}"
            assert y0 - 1e-6 <= y <= y1 + 1e-6, f"{s.id}: y = {y}"
    for g in spec.evaluation.gauges:
        assert x0 <= g.point[0] <= x1 and y0 <= g.point[1] <= y1
    befunde = [b for b in validate_case(spec, ".")
               if b["severity"] in ("fehler", "warnung")
               and b["object_id"] != "solver"]
    assert not [b for b in befunde if b["severity"] == "fehler"], \
        [b["message"] for b in befunde]
    assert not [b for b in befunde
                if any(w in b["message"] for w in _DRAUSSEN)], \
        [b["message"] for b in befunde]
    assert any("hineingerückt" in z for z in zeilen), \
        "das Zurückrücken muss dastehen, sonst wundert sich der Nutzer"


def _punkte(s):
    """XY-Punkte eines Bauwerks samt seinem Aufmaß (Weite, Dicke …)."""
    pkte = []
    for feld in rezepte._XY_LISTEN:
        pkte += [(float(p[0]), float(p[1])) for p in (getattr(s, feld, None) or [])]
    for feld in rezepte._XY_PUNKTE:
        p = getattr(s, feld, None)
        if p is not None:
            pkte.append((float(p[0]), float(p[1])))
    a = getattr(s, "alignment", None)
    if a is not None:
        pkte += [(float(p[0]), float(p[1])) for p in a.points]
    h = rezepte._aufmass(s)
    return [(x + sx * h, y + sy * h) for x, y in pkte for sx, sy in ((-1, -1), (1, 1))]


def test_verfeinerungsquader_wird_erst_nach_dem_ruecken_beschnitten():
    """
    Zuerst schneiden, dann schieben gab aus einem weit draußen gebauten
    Quader einen Kasten über das halbe Gebiet — die Netzschätzung sprang
    auf 18,8 Mio Zellen (Fehler „bricht STILL ab").
    """
    spec = _fall()
    rezepte.einsetzen(spec, "absturz", {"center": (-100.0, -100.0)}, ".")
    x0, y0, x1, y1 = spec.domain.extent
    for r in spec.mesh.refinements:
        if r.type != "box":
            continue
        bx0, by0, _, bx1, by1, _ = r.extent
        assert bx1 > bx0 and by1 > by0, f"{r.id}: verdrehter Quader {r.extent}"
        assert (bx1 - bx0) <= (x1 - x0) and (by1 - by0) <= (y1 - y0)
    from ..core.meshgen import zellen_schaetzung
    assert zellen_schaetzung(spec)["gesamt"] < 1_000_000


def test_rezept_am_blickpunkt():
    spec = _fall()
    rezepte.einsetzen(spec, "drosselschacht", {"center": [5.0, 6.0]}, ".")
    kammer = next(s for s in spec.structures if s.id.startswith("drosselkammer"))
    xs = [p[0] for p in kammer.footprint]
    ys = [p[1] for p in kammer.footprint]
    assert (min(xs) + max(xs)) / 2 == pytest.approx(5.0, abs=0.01)
    assert (min(ys) + max(ys)) / 2 == pytest.approx(6.0, abs=0.01)


def test_unbekanntes_rezept_wird_abgelehnt():
    with pytest.raises(ValueError, match="Unbekanntes Rezept"):
        rezepte.einsetzen(_fall(), "gibtsnicht", {}, ".")


def test_katalog_ist_vollstaendig():
    eintraege = rezepte.katalog()
    assert {e["id"] for e in eintraege} == set(rezepte.REZEPTE)
    for e in eintraege:
        assert e["label"] and e["beschreibung"]
