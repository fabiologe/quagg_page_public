"""docs/ifc/*.md sind ERZEUGT, aktuell — und jeder Knoten kommt aus dem Schnappschuss (Stufe 9).

Muster: test_client_woerterbuch.py (Datei == Erzeugnis). Die Knoten werden aus
den geschriebenen Dateien gelesen, nicht aus dem Generator: geprueft wird, was
ein Leser sieht. Rein, ohne ifcopenshell.
"""
import re
from pathlib import Path

import pytest

from app.ifc import diagramme as D
from app.ifc import schema as S

_BLOCK = re.compile(r"```mermaid\n(.*?)```", re.S)


def _knoten(text: str) -> set:
    return {n for block in _BLOCK.findall(text) for n in re.findall(r"\bIfc[A-Za-z0-9]+\b", block)}


@pytest.mark.parametrize("datei", ["entities-genutzt.md", "beziehungen.md", "pruefstufen.md"])
def test_datei_ist_die_erzeugte(datei):
    assert (D.ZIEL / datei).read_text(encoding="utf-8") == D.erzeuge()[datei], \
        f"{datei} weicht ab — neu erzeugen (in backend/): python3 -m app.ifc.diagramme"


def test_jeder_knoten_kennt_der_schnappschuss():
    """Klassen im Diagramm: Entitaeten des Schnappschusses; an Beziehungsenden auch Auswahl-Typen daraus."""
    ents = S.snapshot()["entitaeten"]
    typen = {t for e in ents.values() for _, typ, _ in e["attribute"] for t in re.findall(r"Ifc[A-Za-z0-9]+", typ)}
    klassen = _knoten((D.ZIEL / "entities-genutzt.md").read_text(encoding="utf-8"))
    assert klassen and {k for k in klassen if k not in ents} == set()
    enden = _knoten((D.ZIEL / "beziehungen.md").read_text(encoding="utf-8"))
    assert enden and {k for k in enden if k not in ents and k not in typen} == set()


def test_die_klassen_der_cde_stehen_drin():
    wer, _ = D.genutzt()
    for k in ("IfcEarthworksCut", "IfcEarthworksFill", "IfcPipeSegment", "IfcDistributionChamberElement",
              "IfcGeographicElement", "IfcSite", "IfcRelVoidsElement", "IfcElementQuantity"):
        assert k in wer, k
    assert "Eigenbau-Paket" in wer["IfcEarthworksCut"]


def test_die_regeln_kommen_aus_dem_prueftor():
    kennungen = [k for k, *_ in D.regeln()]
    assert kennungen[0] == "SPF" and kennungen[-1] == "V09"
    assert {"V00", "V01", "V08", "OPEN", "IDS", "GHERKIN"} <= set(kennungen)
    titel = {k: t for k, t, *_ in D.regeln()}
    # Ein Titel, der nur ein Bezeichner ist, war eine Variable, die das Muster nicht aufloeste.
    assert [k for k, t in titel.items() if not t or re.fullmatch(r"[a-z_]+", t)] == []
    assert titel["SPF"].startswith("SPF-Syntax")


def test_generator_braucht_kein_ifcopenshell():
    assert "import ifcopenshell" not in Path(D.__file__).read_text(encoding="utf-8")
