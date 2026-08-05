"""
Die Skizze ist ein Import aus der Hand: Zeichnen erzeugt CAD-Kandidaten
im festen Container `skizze`, die Zuordnung macht daraus Objekte — und
bleibt änderbar, ohne dass die Linie verloren geht.
"""
from __future__ import annotations

import pytest

from ..core import casespec as cs
from ..core.importer import (SKIZZE_ID, import_neu_ableiten,
                             skizze_hinzufuegen)
from .synthetic_case import build_spec_stage3


@pytest.fixture()
def case(tmp_path):
    d = tmp_path / "demo"
    d.mkdir()
    spec = build_spec_stage3()
    # flaches Gelände ohne Operationen — die Vorbelegungen sind dann exakt
    spec.terrain.operations = []
    spec.to_yaml(d / "case.yaml")
    return spec, d


def test_gezeichnete_linie_wird_kandidat_und_objekt(case):
    spec, d = case
    info = skizze_hinzufuegen(
        spec, d, kind="polyline", rolle="gerinne",
        punkte=[[2, 2], [18, 2], [18, 16]])
    assert any("gerinne" in r for r in info["report"])
    op = next(o for o in spec.terrain.operations
              if o.type == "channel_carve" and o.herkunft == "import")
    assert op.import_ref.import_id == SKIZZE_ID
    # Vorbelegungen wie beim frueheren Editor-Zeichnen (flat:96-Gelaende)
    assert op.invert_start == pytest.approx(96.0 - 1.2)
    assert op.bottom_width == 2.0
    # Kandidat + Anwendung liegen als Rohdaten im Container
    assert (d / "imports" / SKIZZE_ID / "k0.json").is_file()
    assert (d / "imports" / SKIZZE_ID / "anwendung.json").is_file()


def test_polygon_wird_becken_und_zuordnung_bleibt_aenderbar(case):
    spec, d = case
    skizze_hinzufuegen(spec, d, kind="polygon", rolle="becken",
                       punkte=[[4, 4], [12, 4], [12, 12], [4, 12]])
    becken = next(s for s in spec.structures
                  if s.type == "basin" and s.herkunft == "import")
    assert becken.invert_level == pytest.approx(96.0 - 0.5)

    # Umzuordnen OHNE neu zu zeichnen: aus dem Becken wird ein Planum
    import_neu_ableiten(spec, d, SKIZZE_ID, rollen={"k0": "planum"})
    assert not any(s.type == "basin" and s.herkunft == "import"
                   for s in spec.structures)
    planum = next(o for o in spec.terrain.operations if o.type == "pad")
    assert planum.level == pytest.approx(96.0)
    assert planum.import_ref.kandidat == "k0"


def test_mehrere_skizzen_landen_im_einen_container(case):
    spec, d = case
    skizze_hinzufuegen(spec, d, kind="polyline", rolle="wand",
                       punkte=[[2, 8], [10, 8]])
    skizze_hinzufuegen(spec, d, kind="polyline", rolle="stutzen",
                       punkte=[[0, 5], [4, 5]])
    import json
    m = json.loads((d / "imports" / SKIZZE_ID / "manifest.json").read_text())
    assert [c["id"] for c in m["candidates"]] == ["k0", "k1"]
    assert any(s.type == "wall" and s.herkunft == "import"
               for s in spec.structures)
    stutzen = next(s for s in spec.structures if s.type == "culvert"
                   and s.import_ref and s.import_ref.import_id == SKIZZE_ID)
    # Achse knapp ueberm Gelaende (flat:96 + 0.6)
    assert stutzen.axis[0][2] == pytest.approx(96.6)


def test_verfeinerung_aus_polygon(case):
    spec, d = case
    skizze_hinzufuegen(spec, d, kind="polygon", rolle="verfeinerung",
                       punkte=[[6, 6], [14, 6], [14, 14], [6, 14]])
    box = next(r for r in spec.mesh.refinements
               if r.type == "box" and r.herkunft == "import")
    assert box.extent[0] == pytest.approx(6.0)
    assert box.extent[2] == pytest.approx(95.0)      # zmin - 1
    assert box.level == 2
