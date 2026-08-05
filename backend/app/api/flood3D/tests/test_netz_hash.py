"""
Tests: wann gilt ein Vorschaunetz als veraltet?

Bisher wurde über den GESAMTEN Fall gehasht. Damit entwertete jede Eingabe
die Netzvorschau — ein geänderter Grenzwert, eine andere Simulationsdauer,
ein verschobener Pegel. Die Warnung „Das Vorschaunetz gehört zu einem
älteren Stand" stand deshalb fast immer da und wurde bedeutungslos.

`netz_hash()` deckt genau das ab, was die Vernetzung bestimmt. Diese Tests
ziehen die Grenze von beiden Seiten.
"""
from __future__ import annotations

import json

from ..core import casespec as cs
from ..core.casespec import CaseSpec
from .synthetic_case import build_spec_stage3


def _kopie() -> CaseSpec:
    return build_spec_stage3()


# ---- Was das Netz NICHT berührt -----------------------------------------

def test_grenzwert_entwertet_das_netz_nicht():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.evaluation.targets[0].limit_max = 99.9
    assert spec.netz_hash() == vorher
    assert spec.case_hash() != CaseSpec.model_validate(
        build_spec_stage3().model_dump(mode="json")).case_hash()


def test_simulationsdauer_entwertet_das_netz_nicht():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.solver.end_time = 240.0
    spec.solver.write_interval_fields = 20.0
    assert spec.netz_hash() == vorher


def test_meta_und_regelwerk_entwerten_das_netz_nicht():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.meta.title = "anderer Titel"
    spec.meta.nachweis.regelwerk = ["DWA-A 112", "DWA-M 176"]
    spec.meta.nachweis.bearbeiter = "wer auch immer"
    assert spec.netz_hash() == vorher


def test_auswertung_entwertet_das_netz_nicht():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.evaluation.gauges[0].point = (5.0, 5.0)
    spec.evaluation.sections.append(
        cs.Section(id="qs_neu", polyline=[(2.0, 2.0), (2.0, 16.0)]))
    assert spec.netz_hash() == vorher


# ---- Was das Netz sehr wohl berührt --------------------------------------

def test_basiszelle_entwertet_das_netz():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.mesh.base_cell = 0.4
    assert spec.netz_hash() != vorher


def test_bauwerksmass_entwertet_das_netz():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.structures[0].thickness = 0.9
    assert spec.netz_hash() != vorher


def test_gebiet_entwertet_das_netz():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.domain.z_max = 101.0
    assert spec.netz_hash() != vorher


def test_gelaendeoperation_entwertet_das_netz():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.terrain.operations[0].depth = 2.0
    assert spec.netz_hash() != vorher


def test_randfenster_entwertet_das_netz():
    """
    Das Fenster schneidet über topoSet/createPatch die Randfläche zu — es
    gehört damit zur Vernetzung, obwohl es eine Randbedingung ist.
    """
    spec = _kopie()
    vorher = spec.netz_hash()
    bc = next(b for b in spec.boundaries if b.id == "zulauf")
    bc.window = cs.BcWindow(span=(6.0, 12.0))
    assert spec.netz_hash() != vorher


def test_verfeinerung_entwertet_das_netz():
    spec = _kopie()
    vorher = spec.netz_hash()
    spec.mesh.refinements.append(
        cs.RefineSurface(id="r_neu", type="surface", target="terrain", level=2))
    assert spec.netz_hash() != vorher


# ---- Der Vergleich im Router ---------------------------------------------

def test_preview_stand_nutzt_den_netz_hash(tmp_path):
    from ..router import _preview_stand

    spec = _kopie()
    d = tmp_path / "fall"
    (d / "_mesh_preview").mkdir(parents=True)
    (d / "_mesh_preview" / "mesh_preview.json").write_text(json.dumps(
        {"cells": 1000, "case_hash": spec.case_hash(),
         "netz_hash": spec.netz_hash()}))

    assert _preview_stand(spec, d)["stale"] is False
    spec.evaluation.targets[0].limit_max = 42.0      # nur Auswertung
    assert _preview_stand(spec, d)["stale"] is False
    spec.mesh.base_cell = 0.4                        # jetzt das Netz
    assert _preview_stand(spec, d)["stale"] is True


def test_alte_vorschau_ohne_netz_hash_faellt_auf_den_fall_hash_zurueck(tmp_path):
    """Vorschauen von vor dieser Änderung kennen nur den Fall-Hash."""
    from ..router import _preview_stand

    spec = _kopie()
    d = tmp_path / "fall"
    (d / "_mesh_preview").mkdir(parents=True)
    (d / "_mesh_preview" / "mesh_preview.json").write_text(json.dumps(
        {"cells": 1000, "case_hash": spec.case_hash()}))

    assert _preview_stand(spec, d)["stale"] is False
    spec.meta.title = "anders"
    assert _preview_stand(spec, d)["stale"] is True
