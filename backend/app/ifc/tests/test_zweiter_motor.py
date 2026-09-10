"""V09 in der Umgebung, in der er wirklich laeuft — unter pm2.

pm2 laesst `NODE_CHANNEL_FD` an jeden Enkel des API-Servers durchsickern. node
starb daran NACH getaner Arbeit (SIGABRT, Rueckgabewert -6), und V09 lehnte im
ersten Durchstich durch die Produktion einen einwandfreien Verbund ab — mit
„EINIG" im eigenen Befund. Im Test-Client gab es die Variable nicht; dieser
Test setzt sie absichtlich, sonst misst er wieder die Welt ohne pm2.

Laeuft mit dem IFC-venv:
    PYTHONPATH=. backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_zweiter_motor.py
"""
import json

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")
import ifcopenshell.guid              # noqa: E402

from app.ifc import verbund as V      # noqa: E402
from app.ifc.probe import finde_node, zweiter_motor   # noqa: E402

braucht_node = pytest.mark.skipif(finde_node() is None, reason="node nicht gefunden")


def _kleiner_verbund(tmp_path):
    """Ein Bauteil in Landeskoordinaten — klein genug fuer Sekunden, echt genug fuer beide Motoren."""
    g = V.zielgeruest("Klein", crs="EPSG:25832", schluessel="motor-test")
    f = g["datei"]
    platz = f.create_entity(
        "IfcLocalPlacement", PlacementRelTo=g["site"].ObjectPlacement,
        RelativePlacement=f.create_entity(
            "IfcAxis2Placement3D",
            Location=f.create_entity("IfcCartesianPoint", Coordinates=(410_010.0, 5_475_020.0, 0.0))))
    bauteil = f.create_entity("IfcBuildingElementProxy", GlobalId=ifcopenshell.guid.new(),
                              OwnerHistory=g["besitz"], Name="Probe", ObjectPlacement=platz)
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=g["besitz"], RelatingStructure=g["site"], RelatedElements=[bauteil])
    quelle = tmp_path / "quelle.ifc"
    f.write(str(quelle))
    ziel = tmp_path / "verbund.ifc"
    bericht = V.fuehre_zusammen([V.Quelle(quelle)], ziel, projektname="Klein")
    pfad = tmp_path / "bericht.json"
    pfad.write_text(json.dumps(bericht, default=str), encoding="utf-8")
    return ziel, pfad


@braucht_node
def test_v09_ueberlebt_die_pm2_umgebung(tmp_path, monkeypatch):
    ziel, bericht = _kleiner_verbund(tmp_path)
    monkeypatch.setenv("NODE_CHANNEL_FD", "3")
    monkeypatch.setenv("NODE_CHANNEL_SERIALIZATION_MODE", "json")
    befund = zweiter_motor(ziel, bericht)
    assert befund["ok"] is True, befund["sagt"]
    assert "EINIG" in befund["sagt"]
    assert befund["zahl"] == 0


@braucht_node
def test_rotes_v09_nennt_seinen_rueckgabewert(tmp_path):
    """Ein Urteil, das seinem Befund widersprechen koennte, muss den Grund nennen."""
    ziel, bericht = _kleiner_verbund(tmp_path)
    falsch = json.loads(bericht.read_text(encoding="utf-8"))
    falsch["produkte"] = 999            # ifcopenshell „behauptet" jetzt etwas anderes als die Datei
    bericht.write_text(json.dumps(falsch), encoding="utf-8")
    befund = zweiter_motor(ziel, bericht)
    assert befund["ok"] is False
    assert befund["zahl"] == 1
    assert "UNEINIG" in befund["sagt"] and "Rueckgabewert 1" in befund["sagt"]
