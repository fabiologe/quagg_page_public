"""Fachliche Kategorien — Wurzeln im Baum statt Listen, und gleich denen der CDE.

Rein, ohne ifcopenshell: der API-Server importiert kategorien.py.
"""
import re
from pathlib import Path

import pytest

from app.ifc import kategorien as K

JS = Path(__file__).parents[4] / "client/src/features/cde/services/Kategorien.js"


@pytest.mark.skipif(not JS.is_file(), reason="Kategorien.js liegt nicht im Baum")
def test_aushub_wurzeln_gleich_denen_der_cde():
    m = re.search(r"AUSHUB_WURZELN = Object\.freeze\(\[([^\]]*)\]\)", JS.read_text(encoding="utf-8"))
    assert m, "AUSHUB_WURZELN in Kategorien.js nicht gefunden — Format geaendert?"
    js = re.findall(r"'([A-Z0-9]+)'", m.group(1))
    assert js == [w.upper() for w in K.AUSHUB_WURZELN]


def test_aushub_ueber_die_vererbung_und_schreibweise_egal():
    assert K.ist_aushub("IFCEARTHWORKSCUT")
    assert K.ist_aushub("IfcEarthworksCut")
    assert not K.ist_aushub("IFCEARTHWORKSFILL")
    for nichts in ("", None, "IFCQUATSCH"):
        assert not K.ist_aushub(nichts)


def test_rein_ohne_ifcopenshell():
    assert "import ifcopenshell" not in Path(K.__file__).read_text(encoding="utf-8")
