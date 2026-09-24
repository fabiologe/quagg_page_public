"""Fahrplan B4: nummerierte Migrationen mit Formatstempel."""
from __future__ import annotations

import copy
from pathlib import Path

import pytest

from ..core import casespec as cs
from ..core.casespec import MIGRATIONEN, SCHEMA_VERSION, migriere
from ..probe.faelle import fall_k

FAELLE = Path(__file__).resolve().parents[1] / "data" / "cases"


def _basis() -> dict:
    return fall_k().model_dump(mode="json")


def test_versionen_sind_lueckenlos():
    assert [z for z, _, _ in MIGRATIONEN] == list(range(1, len(MIGRATIONEN) + 1))
    assert SCHEMA_VERSION == MIGRATIONEN[-1][0]


@pytest.mark.parametrize("ziel, altform, pruefe", [
    (1, lambda d: d["structures"].append({"id": "p", "type": "pier", "patch": "p",
        "footprint": [[1, 0.2], [1.3, 0.2], [1.3, 0.5], [1, 0.5]], "base_level": 99.5,
        "top_level": 101, "cutwater": "rund"}),
     lambda d: "cutwater" not in d["structures"][0]),
    (3, lambda d: d["structures"].append({"id": "w", "type": "wall", "patch": "w",
        "alignment": {"kind": "spline", "points": [[1, 0.2, 100.5], [3, 0.2, 100.5]]},
        "height": 1, "thickness": 0.2}),
     lambda d: d["structures"][0]["alignment"]["kind"] == "polyline"),
    (6, lambda d: d["meta"].update(crs={"epsg": 25832, "origin": [1, 2], "rotation_deg": 5}),
     lambda d: d["meta"]["crs"] == {"epsg": 25832}),
    (7, lambda d: d["meta"].update(crs_offset=[100.0, 200.0], crs_rotation_deg=0),
     lambda d: d["meta"]["transform"]["translation"] == [-100.0, -200.0]
     and "crs_offset" not in d["meta"]),
])
def test_migration_hebt_alte_form_an(ziel, altform, pruefe):
    d = _basis()
    d["meta"].pop("schema_version", None)
    altform(d)
    bericht: list[str] = []
    migriere(d, bericht)
    assert pruefe(d)
    assert d["meta"]["schema_version"] == SCHEMA_VERSION
    assert dict((z, t) for z, t, _ in MIGRATIONEN)[ziel] in bericht
    cs.CaseSpec.model_validate(d)                        # danach gültig


def test_gestempelter_fall_laeuft_nicht_erneut():
    d = _basis()
    d["meta"]["schema_version"] = SCHEMA_VERSION
    d["meta"]["crs_offset"] = [1.0, 2.0]                 # käme nur aus altem Fall
    bericht: list[str] = []
    migriere(d, bericht)
    assert bericht == [] and d["meta"]["crs_offset"] == [1.0, 2.0]


def test_stempel_aendert_keinen_hash():
    a = fall_k()
    b = copy.deepcopy(a); b.meta.schema_version = SCHEMA_VERSION
    assert a.case_hash() == b.case_hash()
    assert a.netz_hash() == b.netz_hash() and a.geometrie_hash() == b.geometrie_hash()


@pytest.mark.skipif(not FAELLE.is_dir(), reason="keine gespeicherten Fälle")
def test_alle_gespeicherten_faelle_laden():
    # nur lesend: from_yaml schreibt nie zurück
    namen = sorted(p.parent.name for p in FAELLE.glob("*/case.yaml"))
    assert namen
    for n in namen:
        spec = cs.CaseSpec.from_yaml(FAELLE / n / "case.yaml")
        assert spec.meta.schema_version == SCHEMA_VERSION, n
