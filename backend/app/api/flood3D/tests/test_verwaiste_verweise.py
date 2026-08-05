"""
Tests: Verweise, die ins Leere zeigen.

Diese Regeln standen einmal als harte `model_validator` in casespec. Damit
war ein Fall im Zwischenzustand nicht mehr lesbar: wer einen Pegel oder ein
Bauwerk löschte, auf das ein Kriterium zeigte, bekam 422 aus der
Entwurfsvorschau — die Szene fror auf dem Stand VOR dem Löschen ein und
zeigte weiter, was es nicht mehr gab — UND aus dem Speichern. Der einzige
Ausweg war Undo.

Ein Editor muss einen unfertigen Stand halten und sichern können. Gesperrt
wird der LAUF, und das tut die Prüfung. Diese Tests nageln beide Hälften
fest: lesbar bleiben, und trotzdem gemeldet werden — mit einer Kur, die den
Befund auch wirklich beseitigt.
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core.casespec import CaseSpec
from ..core.kur import anwenden
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _mit_target(ziel) -> CaseSpec:
    spec = build_spec_stage3()
    spec.evaluation.targets = [ziel]
    return spec


# Je Kriterienart ein Verweis, der ins Leere zeigt. `region` und `weir`
# wurden bis zu dieser Runde von NIEMANDEM geprüft — foamfields überspringt
# eine unbekannte Region still, das Kriterium blieb ohne Zahlenwert.
TOTE_VERWEISE = [
    ("max_level", cs.TargetMaxLevel(
        id="t", kind="max_level", at="weg", limit_max=1.0), "Pegelpunkt"),
    ("max_force", cs.TargetMaxForce(
        id="t", kind="max_force", at="weg"), "Bauwerk"),
    ("discharge_ratio", cs.TargetDischargeRatio(
        id="t", kind="discharge_ratio", of="weg", to="qs_ablauf",
        limit_max=0.3), "Querschnitt"),
    ("head_difference", cs.TargetHeadDifference(
        id="t", kind="head_difference", upstream="weg", downstream="qs_ablauf",
        limit_max=0.2), "Querschnitt"),
    ("overfall_cd_weir", cs.TargetOverfallCd(
        id="t", kind="overfall_cd", weir="weg", section="qs_zulauf",
        gauge="pegel_becken"), "Wehr"),
    ("min_bed_shear", cs.TargetMinBedShear(
        id="t", kind="min_bed_shear", region="weg", limit_min=0.1), "Verfeinerungsbox"),
    ("max_bed_shear", cs.TargetMaxBedShear(
        id="t", kind="max_bed_shear", region="weg", limit_max=25.0),
     "Verfeinerungsbox"),
]


@pytest.mark.parametrize("name,ziel,quelle",
                         TOTE_VERWEISE, ids=[t[0] for t in TOTE_VERWEISE])
def test_toter_verweis_bleibt_lesbar(name, ziel, quelle):
    """Der Fall muss sich laden UND speichern lassen — sonst kein Undo-Ausweg."""
    spec = _mit_target(ziel)
    CaseSpec.model_validate(spec.model_dump(mode="json"))


@pytest.mark.parametrize("name,ziel,quelle",
                         TOTE_VERWEISE, ids=[t[0] for t in TOTE_VERWEISE])
def test_toter_verweis_wird_gemeldet(name, ziel, quelle):
    spec = _mit_target(ziel)
    befunde = [b for b in validate_case(spec) if b["object_id"] == "t"]
    assert len(befunde) == 1, [b["message"] for b in befunde]
    assert befunde[0]["severity"] == "fehler"
    assert quelle in befunde[0]["message"]
    assert "weg" in befunde[0]["message"]


@pytest.mark.parametrize("name,ziel,quelle",
                         TOTE_VERWEISE, ids=[t[0] for t in TOTE_VERWEISE])
def test_kur_beseitigt_den_toten_verweis(name, ziel, quelle):
    """Regel und Kur müssen dieselbe Größe messen — sonst ist der Knopf tot."""
    spec = _mit_target(ziel)
    befund = next(b for b in validate_case(spec) if b["object_id"] == "t")
    anwenden(spec, befund["fix"]["aktion"], befund["fix"]["args"])
    assert not [b for b in validate_case(spec) if b["object_id"] == "t"]


def test_gueltige_verweise_melden_nichts():
    spec = build_spec_stage3()
    assert not [b for b in validate_case(spec)
                if "verweist auf" in b["message"]]


# ---- Verweise außerhalb der Kriterien ------------------------------------

def test_kraftpatch_ohne_bauwerk():
    spec = build_spec_stage3()
    spec.evaluation.targets = []
    spec.evaluation.force_patches = ["gibtsnicht"]
    CaseSpec.model_validate(spec.model_dump(mode="json"))
    b = next(x for x in validate_case(spec)
             if "Kraftauswertung verweist" in x["message"])
    anwenden(spec, b["fix"]["aktion"], b["fix"]["args"])
    assert "gibtsnicht" not in spec.evaluation.force_patches


def test_grenzschicht_ohne_bauwerk():
    spec = build_spec_stage3()
    spec.mesh.boundary_layers.patches = ["gibtsnicht"]
    b = next(x for x in validate_case(spec)
             if "Grenzschicht verweist" in x["message"])
    anwenden(spec, b["fix"]["aktion"], b["fix"]["args"])
    assert "gibtsnicht" not in spec.mesh.boundary_layers.patches


def test_flaechenverfeinerung_ohne_ziel():
    spec = build_spec_stage3()
    spec.mesh.refinements.append(
        cs.RefineSurface(id="r_tot", type="surface", target="gibtsnicht",
                         level=2))
    b = next(x for x in validate_case(spec) if x["object_id"] == "r_tot")
    anwenden(spec, b["fix"]["aktion"], b["fix"]["args"])
    assert not [r for r in spec.mesh.refinements if r.id == "r_tot"]


def test_kur_meldet_ehrlich_wenn_schon_aufgeraeumt():
    spec = build_spec_stage3()
    meldung = anwenden(spec, "verweis_entfernen",
                       {"art": "kraftpatch", "wert": "gibtsnicht"})
    assert "nicht mehr" in meldung


# ---- Der Erdkörper darf nach dem Löschen nicht stehenbleiben -------------

def _grosses_feld(spec):
    """Höhenfeld über der Vorschauschranke von 120.000 Knoten."""
    from ..core.terrain import TerrainField
    spec.terrain.base.resolution = 0.05      # 24x18 m / 0,05 -> ~173.000
    feld = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    assert feld.z.size > 120_000, feld.z.size
    return feld


def test_ohne_aushub_verschwindet_der_koerper_auch_bei_grossem_raster():
    """
    Der Fall aus dem Bugreport: Bauwerk gelöscht, aber der Krater blieb
    stehen. Ursache war die Reihenfolge — die Rastergröße wurde VOR dem
    Bedarf gefragt, also kam `koerper_zu_gross` zurück und der Client
    behielt den alten Körper. „Gar kein Körper mehr nötig" ist ohne eine
    einzige Boolesche Operation zu beantworten.
    """
    from ..router import _koerper_vorschau

    spec = build_spec_stage3()
    feld = _grosses_feld(spec)
    out: dict = {}
    assert _koerper_vorschau(spec, feld, ".", out) is None
    assert "koerper_zu_gross" not in out, \
        "ohne Aushub darf der Client den alten Körper nicht behalten"


def test_mit_aushub_bleibt_der_koerper_gehalten_aber_gekennzeichnet():
    from ..router import _koerper_vorschau

    spec = build_spec_stage3()
    spec.structures.append(cs.StructKammer(
        id="grube", type="kammer", patch="grube",
        footprint=[(4.0, 4.0), (8.0, 4.0), (8.0, 8.0), (4.0, 8.0)],
        invert_level=93.0, top_level=95.0, wirkung="aushub"))
    feld = _grosses_feld(spec)
    out: dict = {}
    assert _koerper_vorschau(spec, feld, ".", out) is None
    assert out.get("koerper_zu_gross") is True
    signatur = out["koerper_signatur"]

    # Bauwerk verschieben -> Signatur ändert sich, der gehaltene Körper gilt
    # damit als veraltet statt als aktuell
    spec.structures[-1].invert_level = 92.0
    out2: dict = {}
    _koerper_vorschau(spec, feld, ".", out2)
    assert out2["koerper_signatur"] != signatur


def test_kleines_raster_liefert_koerper_mit_signatur():
    from ..router import _koerper_vorschau
    from ..core.terrain import TerrainField

    spec = build_spec_stage3()
    spec.structures.append(cs.StructKammer(
        id="grube", type="kammer", patch="grube",
        footprint=[(4.0, 4.0), (8.0, 4.0), (8.0, 8.0), (4.0, 8.0)],
        invert_level=93.0, top_level=95.0, wirkung="aushub"))
    feld = TerrainField.from_spec(spec.terrain, spec.domain, ".")
    out: dict = {}
    k = _koerper_vorschau(spec, feld, ".", out)
    assert k is not None and k["signatur"] == spec.netz_hash()
