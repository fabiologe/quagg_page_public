"""Die Bezugssystem-Tabelle — und dass sie mit der der CDE uebereinstimmt.

Die Tabelle steht zweimal: im Browser (`Koordinatensysteme.js`) und hier. Das ist
gewollt (keine Querverknuepfung zwischen Client und Werkzeug), aber zwei Tabellen
laufen auseinander, sobald jemand nur eine anfasst. Der erste Test liest deshalb
die JS-Datei und vergleicht jede Zeile. Aendert sich dort ein Fenster, wird es
hier rot — bevor ein Verbund mit dem alten Fenster geprueft wird.

Rein, ohne ifcopenshell: laeuft in jedem venv.
"""
import re
from pathlib import Path

import pytest

from app.ifc import bezugssysteme as B

JS = Path(__file__).parents[4] / "client/src/features/cde/services/Koordinatensysteme.js"


@pytest.mark.skipif(not JS.is_file(), reason="Koordinatensysteme.js liegt nicht im Baum")
def test_gleich_der_tabelle_der_cde():
    text = JS.read_text(encoding="utf-8")
    zeilen = re.findall(
        r"epsg:\s*'(EPSG:\d+)'.*?ostVon:\s*([\d_]+),\s*ostBis:\s*([\d_]+)(?:,\s*mehrdeutig:\s*\[([^\]]*)\])?",
        text)
    assert zeilen, "Tabelle in Koordinatensysteme.js nicht gefunden — Format geaendert?"
    js = [(epsg, float(von.replace("_", "")), float(bis.replace("_", "")),
           tuple(re.findall(r"'(EPSG:\d+)'", mehr or "")))
          for epsg, von, bis, mehr in zeilen]
    py = [(s.epsg, s.ost[0], s.ost[1], s.mehrdeutig) for s in B.SYSTEME]
    assert py == js


def test_die_drei_faelle_aus_fabios_dateien():
    # A64 (Pfalz): gueltiges UTM — 32 und 33 sind am Rechtswert nicht trennbar.
    assert B.erkenne(325_721, 5_480_000) == ["EPSG:25832", "EPSG:25833"]
    # ENQUIER (Saarland): UTM endet bei 834 000 — das ist Gauss-Krueger Zone 2.
    assert B.erkenne(2_577_078, 5_460_000) == ["EPSG:31466"]
    # BIM26 Erdarbeiten3 in Millimetern, NICHT umgerechnet: nichts passt.
    assert B.erkenne(410_936_420, 5_476_022_225) == []


def test_lokales_modell_ist_nicht_erkennbar():
    """Kein Weltbezug heisst „nicht erkennbar", nicht „das naechste System"."""
    assert B.erkenne(512.0, 380.0) == []
    assert B.erkenne(410_300, 380.0) == []          # Rechtswert passt, Hochwert nicht


def test_fenster_passt_und_unbekannt_ist_none():
    huelle = {"min": [0, 0, 0], "max": [410_300.8, 5_475_845.9, 247.3]}
    assert B.fenster_passt(huelle, "EPSG:25832") is True
    assert B.fenster_passt(huelle, "EPSG:25833") is True
    assert B.fenster_passt(huelle, "EPSG:31466") is False
    # Unbekannt wird nicht geraten.
    assert B.fenster_passt(huelle, "EPSG:4326") is None
    assert B.fenster_passt(None, "EPSG:25832") is False


def test_gleichwertig():
    assert B.gleichwertig("EPSG:25832", "epsg:25833")
    assert B.gleichwertig("EPSG:31466", "EPSG:31466")
    assert not B.gleichwertig("EPSG:25832", "EPSG:31466")
    assert not B.gleichwertig("EPSG:25832", "EPSG:4326")


def test_rein_ohne_ifcopenshell():
    """Der API-Server importiert diese Datei — im Produktions-venv gibt es kein ifcopenshell."""
    quelle = Path(B.__file__).read_text(encoding="utf-8")
    assert "import ifcopenshell" not in quelle
