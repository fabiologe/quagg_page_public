"""
Die Auswerte-Schwellen der Laubkarten gehören in den Fall.

Grund: sie SIND die Aussage. „3 % kritische Fläche" ist ohne die
Ablagerungsschwelle keine Angabe, sondern eine Zahl. Bis 2026-08-17 lagen
sie als Vue-`ref` im Panel und waren beim Reiterwechsel weg.
"""
from __future__ import annotations

import pytest

from ..core.casespec import CaseSpec, LaubkartenParameter
from .synthetic_case import build_spec_stage3


def test_schwellen_ueberleben_die_yaml_runde(tmp_path):
    spec = build_spec_stage3()
    spec.evaluation.laubkarten = LaubkartenParameter(
        ablagerung_ab=2.5, spuel_min=1.5, nass_tiefe=0.003)
    pfad = tmp_path / "case.yaml"
    spec.to_yaml(pfad)

    zurueck = CaseSpec.from_yaml(pfad)

    assert zurueck.evaluation.laubkarten.ablagerung_ab == 2.5
    assert zurueck.evaluation.laubkarten.spuel_min == 1.5
    assert zurueck.evaluation.laubkarten.nass_tiefe == 0.003


def test_ohne_angabe_bleibt_es_bei_null(tmp_path):
    """Ein Fall ohne Laubkarten-Block ist gültig — das Panel nimmt dann
    seine Vorbelegungen."""
    spec = build_spec_stage3()
    assert spec.evaluation.laubkarten is None
    pfad = tmp_path / "case.yaml"
    spec.to_yaml(pfad)
    assert CaseSpec.from_yaml(pfad).evaluation.laubkarten is None


def test_unsinnige_werte_kommen_nicht_durch():
    for kw in (dict(ablagerung_ab=0), dict(spuel_min=-1),
               dict(nass_tiefe=0), dict(nass_tiefe=5.0)):
        with pytest.raises(Exception):
            LaubkartenParameter(**kw)


def test_die_schwellen_entwerten_kein_netz():
    """
    `evaluation` steckt weder in GEOMETRIE_TEILE noch in NETZ_TEILE. Ohne
    diese Zusicherung wäre eine verschobene Auswerteschwelle ein Grund,
    minutenlang neu zu vernetzen — und die Netzvorschau gälte nach jedem
    Reglerzug als veraltet.
    """
    ohne = build_spec_stage3()
    mit = build_spec_stage3()
    mit.evaluation.laubkarten = LaubkartenParameter(ablagerung_ab=7.0)

    assert mit.netz_hash() == ohne.netz_hash()
    assert mit.geometrie_hash() == ohne.geometrie_hash()
    # der FALL-Hash unterscheidet sich sehr wohl: es ist eine Änderung
    assert mit.case_hash() != ohne.case_hash()
