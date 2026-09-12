"""Das Client-Woerterbuch ist ERZEUGT — und genau so, wie der Schnappschuss es verlangt.

Die drei Dateien in `client/src/features/cde/data/` hatten bis 2026-09-11 einen
Kopf „run scripts/gen_ifc_schema.py to regenerate", und das Skript gab es nie.
Dieser Test haelt Datei und Schnappschuss gleich; faellt er, sagt er, womit man
neu erzeugt. Muster: test_bezugssysteme.py (zwei Seiten, ein Vergleich).

Rein, ohne ifcopenshell: laeuft in jedem venv.
"""
from pathlib import Path

import pytest

from app.ifc import generiere_client as G
from app.ifc import schema as S


@pytest.mark.skipif(not G.ZIEL.is_dir(), reason="Client liegt nicht im Baum")
@pytest.mark.parametrize("datei", ["entity-schema.js", "pset-templates.js", "altnamen.js", "quagg-starter.ids"])
def test_datei_ist_die_erzeugte(datei):
    erwartet = G.erzeuge(S.snapshot())[datei]
    ist = (G.ZIEL / datei).read_text(encoding="utf-8")
    assert ist == erwartet, f"{datei} weicht ab — neu erzeugen (in backend/): python3 -m app.ifc.generiere_client"


def test_generator_braucht_kein_ifcopenshell():
    assert "import ifcopenshell" not in Path(G.__file__).read_text(encoding="utf-8")


def test_normiert_deckt_jede_waise():
    """Die Probe-Tabelle, gegen die der Client seine Normierung haelt, muss vollstaendig sein."""
    text = G.altnamen_js(S.snapshot())
    for w in S.waisen():
        assert f"    {w.upper()}: " in text, w
