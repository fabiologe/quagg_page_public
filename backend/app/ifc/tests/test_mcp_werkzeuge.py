"""Die MCP-Werkzeuge `ifc` (Fahrplan IFC-Konsistenz, Stufe 7) — sie sagen dasselbe wie schema.py.

`app/mcp/ifc_tools.py` liest nur den Schnappschuss; der Client-Spiegel
(`Typprofile.vererbungskette`) liest dieselben erzeugten Daten
(test_client_woerterbuch.py haelt sie gleich). Damit gilt: was das Werkzeug
sagt, sagt auch der Client. Der letzte Test schickt das Vergleichsmodell durch
das Prueftor ueber denselben Unterprozess, den das Werkzeug startet.
"""
from pathlib import Path

import pytest

from app.ifc import schema as S
from app.mcp import ifc_tools as W

DATEN = Path(__file__).parent / "daten"
STARTER = Path(__file__).parents[1] / "daten" / "quagg-starter.ids"


def test_vererbung_ist_die_des_schnappschusses():
    k = W.ifc_vererbung("IFCPIPESEGMENT")
    assert k["name"] == "IfcPipeSegment" and k["kette"] == S.vererbung("IfcPipeSegment")
    assert k["kette"][0] == "IfcRoot"
    assert "IfcWallStandardCase" in W.ifc_vererbung("IfcWall", untertypen=True)["untertypen_konkret"]


def test_klasse_attribute_regeln_vorlagen():
    e = W.ifc_entity("ifcearthworkscut")
    assert e["name"] == "IfcEarthworksCut" and e["schreibbar"] and S.ZIELSCHEMA in e["schemata"]
    assert [a["name"] for a in W.ifc_attribute("IfcRoot")["attribute"]] == \
        ["GlobalId", "OwnerHistory", "Name", "Description"]
    assert any(r["regel"].endswith("NotContained") for r in W.ifc_where_rules("IfcEarthworksCut")["regeln"])
    assert not any(r["regel"].endswith("NotContained")
                   for r in W.ifc_where_rules("IfcEarthworksCut", geerbt=False)["regeln"])
    assert W.ifc_pset("IfcEarthworksCut")["mengenvorlage"] == "Qto_EarthworksCutBaseQuantities"
    assert W.ifc_pset("pset_wallcommon")["vorlage"]["name"] == "Pset_WallCommon"


def test_altnamen_und_unbekanntes():
    a = W.ifc_altname("IFCBUILDINGELEMENT")
    assert a["umbenannt_zu"] == "IfcBuiltElement" and a["gestrichen"] is False
    assert W.ifc_altname("IfcProxy")["gestrichen"] is True
    assert W.ifc_entity("IfcWallStandardCase").get("abgekuendigt")
    assert "fehler" in W.ifc_entity("IfcGibtEsNicht")


@pytest.mark.skipif(not W.IFC_PYTHON.is_file(), reason="IFC-venv fehlt")
def test_pruefe_datei_ueber_den_unterprozess():
    r = W.ifc_pruefe_datei(str(DATEN / "ids_vergleich.ifc"), ids=[str(STARTER)])
    assert "bericht" in r, r
    assert sum(1 for b in r["bericht"]["befunde"] if b["stufe"] == "ids") == 18
    assert "fehler" in W.ifc_pruefe_datei("/etc/passwd")
