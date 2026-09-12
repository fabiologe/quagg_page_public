"""Der IFC-Kopf beim Upload — gegen dieselbe Falltabelle wie der Client.

Rein, ohne ifcopenshell: der API-Server importiert kopf.py.
"""
import json
from pathlib import Path

import pytest

from app.ifc import kopf as K

TABELLE = json.loads((Path(__file__).parent / "daten" / "kopf_faelle.json").read_text(encoding="utf-8"))["faelle"]
TESTDATEN = Path(__file__).parents[4] / "client/src/features/cde/test"


@pytest.mark.parametrize("fall", TABELLE, ids=[f["name"] for f in TABELLE])
def test_fall_aus_der_gemeinsamen_tabelle(fall):
    roh = fall["roh"].encode("latin1")
    assert K.lies_kopf(roh) == fall["erwartet"]
    assert (K.ablehnung(roh, fall["endung"]) is not None) is fall["abgelehnt"]


@pytest.mark.parametrize("datei, schema, einheit", [
    ("BIM26_Gruppe5_BODEN_Erdarbeiten.ifc", "IFC4X3_ADD2", "m"),
    ("BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc", "IFC4X3_ADD2", "mm"),
    ("IFCOUT_Entwässerung Export .IFC", "IFC2X3", "m"),
])
def test_die_echten_gruppendateien(datei, schema, einheit):
    """Dieselben Werte, die test_vertrag.py mit ifcopenshell misst (Faktor 1 / 0,001 / 1)."""
    pfad = TESTDATEN / datei
    if not pfad.is_file():
        pytest.skip("Gruppendateien liegen nicht im Baum")
    with pfad.open("rb") as f:
        k = K.lies_kopf(f.read(K.KOPF_BYTES))
    assert (k["ist_step"], k["schema"], k["einheit_hinweis"]) == (True, schema, einheit)
    assert k["projekt_global_id"]


def test_rein_ohne_ifcopenshell():
    assert "import ifcopenshell" not in Path(K.__file__).read_text(encoding="utf-8")
