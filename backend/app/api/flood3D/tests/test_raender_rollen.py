"""
Ränder (Etappe E5b der Sanierung, Audit P9, G3, P11).

P9: „Genau ein Zuflussrand" sperrte ein Becken mit zwei Zulaufrohren und
jeden Leerlauf — der Fallbau schreibt aber alle Zuläufe in einer Schleife.
G3: ohne Fenster war der Zulauf die volle Gebietsseite bis z_min, ohne dass
es jemand sagte (371 m² in einem Betriebsfall). P11: ein Rohr mit Rolle
„Ablauf" aus dem Import hing nie an seinem Rand; die Kur meldete „stimmig".
Regel und Kur lesen dieselbe Liste (anschluss.rollen_ohne_rand).
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core.anschluss import rollen_ohne_rand
from ..core.casebuilder import build_case, fenster_flaeche, zulauf_lage
from ..core.kur import anwenden
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3, build_spec_tal


def _befunde(spec, teil, base_dir="."):
    return [b for b in validate_case(spec, base_dir) if teil in b["message"]]


# ---- P9 -------------------------------------------------------------------

def test_zwei_zulaeufe_sind_kein_fehler_und_der_fallbau_schreibt_beide(tmp_path):
    spec = build_spec_tal(tmp_path)
    assert not _befunde(spec, "Zuflussrand erforderlich", tmp_path)   # vorher: fehler
    hin = _befunde(spec, "2 Zuläufe", tmp_path)
    assert hin and hin[0]["severity"] == "hinweis"
    assert "zulauf_west" in hin[0]["message"] and "zulauf_nord" in hin[0]["message"]
    # die ECHTE Schnittstelle: 0/U trägt beide Zulauf-Patches
    out = tmp_path / "fall"
    build_case(spec, out, base_dir=tmp_path)
    u = (out / "0" / "U").read_text()
    for patch in ("inlet", "inlet_nord"):
        block = u[u.index(patch):]
        assert "variableHeightFlowRateInletVelocity" in block[:400], patch
    assert u.count("variableHeightFlowRateInletVelocity") == 2


def test_leerlauf_ohne_zulauf_ist_nur_ein_hinweis():
    spec = build_spec_stage3()
    spec.boundaries = [b for b in spec.boundaries if b.id != "zulauf"]
    assert not _befunde(spec, "Zuflussrand erforderlich")
    assert _befunde(spec, "Kein Zuflussrand")[0]["severity"] == "hinweis"
    # ohne Startwasser gäbe es nichts zu rechnen — das bleibt ein Fehler
    spec.solver.initial_level = None
    spec.solver.vorfuellungen = []
    assert _befunde(spec, "kein Startwasser")[0]["severity"] == "fehler"


# ---- G3 -------------------------------------------------------------------

def test_zulauf_ohne_fenster_ist_freispiegel_ueber_der_sohle(tmp_path):
    # G3 → A1: ohne Fenster ist der Zulauf ein Freispiegel-Rand; die Fläche,
    # auf die sich Q verteilt, ist die NASSE Startfläche über der Sohle —
    # ein kleiner Teil der Seite, nicht mehr die Seite über dem Gelände.
    spec = build_spec_tal(tmp_path)
    b = next(x for x in spec.boundaries if x.id == "zulauf_west")
    x0, y0, x1, y1 = spec.domain.extent
    seite = (y1 - y0) * (spec.domain.z_max - spec.domain.z_min)
    feld = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    nass = fenster_flaeche(spec, b, feld)
    lage = zulauf_lage(spec, b, feld)
    assert lage["art"] == "freispiegel"
    # Startwasser: max(2 Zellen, kritische Tiefe) über der tiefsten Sohle
    h_c = (b.q ** 2 / (9.81 * (y1 - y0) ** 2)) ** (1 / 3)
    # … gekappt eine Zelle unter dem Gebietsdeckel
    z_start = min(lage["sohle"] + max(2 * spec.mesh.base_cell, h_c),
                  spec.domain.z_max - spec.mesh.base_cell)
    assert lage["z_start"] == pytest.approx(z_start)
    assert nass == pytest.approx(lage["a_nass"])
    assert 0 < nass < 0.5 * seite, (seite, nass)
    hin = [x for x in _befunde(spec, "über die Sohle", tmp_path)
           if x["object_id"] == "zulauf_west"]
    assert hin and hin[0]["severity"] == "hinweis"
    assert "x_min" in hin[0]["message"]


# ---- P11 ------------------------------------------------------------------

def _mit_ablaufrohr(x_ende: float) -> cs.CaseSpec:
    spec = build_spec_stage3()
    spec.structures.append(cs.StructCulvert(
        id="stutzen_ab", type="culvert", patch="stutzen_ab",
        axis=[(x_ende - 3.0, 9.0, 95.0), (x_ende, 9.0, 95.0)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8),
        rolle="ablauf"))
    return spec


def test_rohr_mit_rolle_wird_an_seinen_rand_gekoppelt():
    spec = _mit_ablaufrohr(23.5)                      # 0,5 m vor x_max = 24
    liste = rollen_ohne_rand(spec)
    assert liste == [{"id": "stutzen_ab", "rolle": "ablauf", "face": "x_max",
                      "abstand": 0.5, "koppelbar": True, "rand": "ablauf"}]
    b = next(x for x in validate_case(spec, ".")
             if x["object_id"] == "stutzen_ab" and "Rolle Ablauf" in x["message"])
    assert b["severity"] == "warnung" and b["fix"]["aktion"] == "anschluesse_herstellen"
    text = anwenden(spec, "anschluesse_herstellen", {})
    assert "stutzen_ab" in text
    ablauf = next(x for x in spec.boundaries if x.id == "ablauf")
    assert ablauf.window is not None and ablauf.window.follow == "stutzen_ab"
    assert ablauf.face == "x_max"
    assert rollen_ohne_rand(spec) == []                # dieselbe Messung: leer
    assert not [x for x in validate_case(spec, ".") if "Rolle Ablauf" in x["message"]]


def test_rohr_weit_im_inneren_bekommt_keine_kur_aber_die_zahl():
    spec = _mit_ablaufrohr(19.0)                      # 5 m vor x_max (nächster Rand)
    e = rollen_ohne_rand(spec)[0]
    assert e["koppelbar"] is False and e["face"] == "x_max"
    assert e["abstand"] == pytest.approx(5.0)
    b = next(x for x in validate_case(spec, ".")
             if x["object_id"] == "stutzen_ab" and "Rolle Ablauf" in x["message"])
    assert b.get("fix") is None and "x_max in 5 m" in b["message"]
    # die Kur ändert nichts Stummes: das Rohr bleibt ungekoppelt
    anwenden(spec, "anschluesse_herstellen", {})
    assert rollen_ohne_rand(spec)[0]["id"] == "stutzen_ab"
