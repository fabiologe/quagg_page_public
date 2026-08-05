"""
Tests Stufe G: aus Typ und Lage folgt etwas.

Drei Stellen im Werkzeug maßen die Beziehung längst — und lasen das
Ergebnis rückwärts. Sie prüften eine Handeingabe, statt sie herzustellen:

* die Importrolle eines Körpers wurde geschrieben und nirgends gelesen,
* `resolve_window` verwirft eine Kopplung, deren Achsende zu weit vom Rand
  weg liegt, stellte sie aber nie her,
* die Hohlraumregel prüfte je Körper und meldete deshalb einen
  verschlossenen Kasten, während der Nachbar offen zu Tage lag.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pytest
import trimesh

from ..core import casespec as cs
from ..core.anschluss import kopplung_ableiten
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _befunde(spec, teil, base_dir="."):
    return [b for b in validate_case(spec, base_dir) if teil in b["message"]]


# ---- G1: die Rolle, die nichts tat --------------------------------------

def _mit_importkoerper(d: Path, rolle: str, mitte=(9.0, 9.0)):
    """Fall mit einem importierten Quader dicht am Zulaufrand."""
    spec = build_spec_stage3()
    netz = trimesh.creation.box(extent=(0.4, 6.0, 2.0))
    netz.apply_translation((mitte[0], mitte[1], 95.5))
    netz.export(d / "koerper.stl")
    spec.structures.append(cs.StructImported(
        id="platte", type="imported", patch="platte", source="koerper.stl",
        role=rolle))
    return spec


def test_importierte_wand_erinnert_an_die_kraftauswertung():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        spec = _mit_importkoerper(d, "wand")
        treffer = _befunde(spec, "Kraftauswertung dafür ist aber aus", d)
        assert len(treffer) == 1
        assert treffer[0]["fix"]["aktion"] == "kraftauswertung_ein"

        # Kur und Regel messen dieselbe Größe: eingeschaltet -> weg
        spec.evaluation.force_patches.append("platte")
        assert not _befunde(spec, "Kraftauswertung dafür ist aber aus", d)


def test_ohne_aussagekraeftige_rolle_keine_erinnerung():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        spec = _mit_importkoerper(d, "bauwerk")
        assert not _befunde(spec, "Kraftauswertung dafür ist aber aus", d)


def test_randabstand_greift_auch_bei_importierten_koerpern():
    """
    `_plan_punkte` gab für einen importierten Körper ein leeres Array
    zurück — jede grundrissbasierte Regel lief stillschweigend an ihm
    vorbei. Seine Lage steckt in der STL-Datei, nicht im Schema.
    """
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        # dicht an den Zulaufrand (x_min bei 0) geschoben
        spec = _mit_importkoerper(d, "wand", mitte=(0.6, 9.0))
        assert [b for b in _befunde(spec, "bis zum Rand", d)
                if b["object_id"] == "platte" and b["severity"] == "warnung"], \
            "Randabstand wird für importierte Körper nicht geprüft"


def test_importierter_koerper_weit_weg_ist_unauffaellig():
    """Die Regel misst wirklich die Lage — sonst meldete sie immer."""
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        spec = _mit_importkoerper(d, "wand", mitte=(9.0, 9.0))
        assert not [b for b in _befunde(spec, "bis zum Rand", d)
                    if b["object_id"] == "platte" and b["severity"] == "warnung"]


def test_stutzenrolle_ueberlebt_das_speichern():
    """
    Der Layername sagte „Einlauf" bzw. „Auslauf", und beim Bauen wurde es
    verworfen: aus beiden Kreisen wurde derselbe Stutzen.
    """
    spec = build_spec_stage3()
    spec.structures.append(cs.StructCulvert(
        id="einlauf", type="culvert", patch="einlauf",
        axis=[(0.0, 9.0, 94.0), (3.0, 9.0, 94.0)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8),
        rolle="zulauf"))
    wieder = cs.CaseSpec.model_validate(spec.model_dump(mode="json"))
    assert next(s for s in wieder.structures if s.id == "einlauf").rolle == "zulauf"


# ---- G3: die Kopplung, die nur geprüft wurde ----------------------------

def _fall_mit_stutzen(*rollen: str | None) -> cs.CaseSpec:
    """Zulaufrand mit leerem Fenster, dazu Stutzen an genau diesem Rand."""
    spec = build_spec_stage3()
    spec.boundaries = [
        b for b in spec.boundaries if not b.type.startswith("inflow")]
    spec.boundaries.insert(0, cs.BcInflowConstant(
        id="zulauf", patch="zulauf", type="inflow_constant", q=0.5,
        face="x_min", window=cs.BcWindow(shape="kreis")))
    x0 = spec.domain.extent[0]
    for i, r in enumerate(rollen):
        spec.structures.append(cs.StructCulvert(
            id=f"rohr_{i}", type="culvert", patch=f"rohr_{i}",
            axis=[(x0 - 0.1, 6.0 + 3 * i, 94.0), (x0 + 2.0, 6.0 + 3 * i, 94.0)],
            profile=cs.CulvertProfile(kind="circular", diameter=0.8), rolle=r))
    return spec


def _fenster(spec):
    return next(b for b in spec.boundaries if b.id == "zulauf").window


def test_eindeutige_lage_stellt_die_kopplung_her():
    spec = _fall_mit_stutzen(None)
    meldungen = kopplung_ableiten(spec)
    assert _fenster(spec).follow == "rohr_0"
    assert any("gekoppelt" in m for m in meldungen)


def test_zwei_stutzen_am_selben_rand_werden_nicht_geraten():
    """
    Welcher von zweien der Zulauf ist, ist eine fachliche Entscheidung —
    dasselbe Muster wie bei zwei Randbedingungen auf einer Quaderfläche.
    """
    spec = _fall_mit_stutzen(None, None)
    meldungen = kopplung_ableiten(spec)
    assert _fenster(spec).follow is None
    assert any("von Hand entschieden" in m for m in meldungen)


def test_die_rolle_entscheidet_bei_zwei_kandidaten():
    """Ein Ablaufrohr wird kein Zulauf, auch wenn die Lage passt."""
    spec = _fall_mit_stutzen("ablauf", "zulauf")
    kopplung_ableiten(spec)
    assert _fenster(spec).follow == "rohr_1"


def test_bewusst_gesetztes_fenster_bleibt_unangetastet():
    spec = _fall_mit_stutzen(None)
    _fenster(spec).span = (4.0, 8.0)
    assert kopplung_ableiten(spec) == []
    assert _fenster(spec).follow is None


def test_stutzen_ausser_reichweite_wird_nicht_gekoppelt():
    spec = _fall_mit_stutzen(None)
    rohr = next(s for s in spec.structures if s.id == "rohr_0")
    rohr.axis = [(8.0, 6.0, 94.0), (10.0, 6.0, 94.0)]
    assert kopplung_ableiten(spec) == []
    assert _fenster(spec).follow is None


def test_kopplung_zweimal_ableiten_bleibt_gleich():
    spec = _fall_mit_stutzen(None)
    kopplung_ableiten(spec)
    assert kopplung_ableiten(spec) == []
    assert _fenster(spec).follow == "rohr_0"


# ---- G3: der Hohlraum, der je Körper geprüft wurde ----------------------

def _schacht(kennung, mitte, deckel):
    return cs.StructSchacht(
        id=kennung, type="schacht", patch=kennung, shape="rechteck",
        center=mitte, width=2.0, length=2.0,
        invert_level=92.0, top_level=deckel, wirkung="aushub")


def test_benachbarte_aushuebe_bilden_einen_raum():
    """
    Zwei anstoßende Aushübe sind nach dem Abziehen EIN Hohlraum. Reicht
    einer bis an die Oberfläche, hängt der andere daran — je Körper
    geprüft meldete die Regel dort einen verschlossenen Kasten.
    """
    spec = build_spec_stage3()
    spec.structures.append(_schacht("tief", (9.0, 9.0), 94.0))     # zu
    spec.structures.append(_schacht("offen", (11.0, 9.0), 99.0))   # offen
    assert not _befunde(spec, "vollständig unter dem Gelände"), \
        "der Verbund reicht bis an die Oberfläche"


def test_abgesetzter_aushub_bleibt_ein_befund():
    spec = build_spec_stage3()
    spec.structures.append(_schacht("tief", (9.0, 9.0), 94.0))
    spec.structures.append(_schacht("offen", (16.0, 16.0), 99.0))
    treffer = _befunde(spec, "vollständig unter dem Gelände")
    assert len(treffer) == 1 and treffer[0]["object_id"] == "tief"


def test_der_befund_nennt_die_angeschlossenen_nachbarn():
    spec = build_spec_stage3()
    spec.structures.append(_schacht("tief", (9.0, 9.0), 94.0))
    spec.structures.append(_schacht("auch_tief", (11.0, 9.0), 94.5))
    treffer = _befunde(spec, "vollständig unter dem Gelände")
    assert len(treffer) == 1, "ein Raum, ein Befund"
    # Der Befund hängt an einem der beiden und nennt den anderen — sonst
    # wüsste man nicht, welcher Raum gemeint ist
    beide = {"tief", "auch_tief"}
    genannt = {treffer[0]["object_id"]} | {
        k for k in beide if k in treffer[0]["message"]}
    assert genannt == beide
