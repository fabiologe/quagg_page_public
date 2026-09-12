"""Die Starter-IDS (Fahrplan IFC-Konsistenz, Stufe 5) — gueltig, und sie misst, was sie verspricht.

`daten/quagg-starter.ids` ist die kanonische Datei der mitgelieferten
Projektanforderungen. Der Client liest eine Kopie fuer seine Vorschau
(test_client_woerterbuch.py haelt sie gleich), das Prueftor prueft mit ihr.

ZWEI MOTOREN, EINE ZAHL: ifctester urteilt, die Vorschau im Browser zeigt. Die
echten Testdateien treffen nur eine der achtzehn Regeln (gemessen 2026-09-11:
BODEN 2 Schuettungen, BODEN3 und IFCOUT keine). Deshalb gibt es ein
Vergleichsmodell, das jede Regel trifft — `tests/daten/ids_vergleich.ifc` — und
die Zaehlung des Prueftors daran, `ids_vergleich.json`. Diese Datei haelt das
Urteil fest; `client/.../test/idsVergleich.test.js` haelt die Vorschau dagegen.

Laeuft mit dem IFC-venv:
    PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m pytest app/ifc/tests/test_ids.py
Vergleichsmodell neu schreiben (nur wenn die Starter-IDS oder die Tabelle sich aendert):
    PYTHONPATH=. app/ifc/.venv-ifc/bin/python app/ifc/tests/test_ids.py
"""
import json
import uuid
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip("ifcopenshell", reason="ifcopenshell fehlt — mit dem IFC-venv laufen lassen")
import ifcopenshell.api                                    # noqa: E402
import ifcopenshell.guid                                   # noqa: E402
import ifctester.ids                                       # noqa: E402

from app.ifc import pruefe as P                            # noqa: E402

STARTER = Path(__file__).parents[1] / "daten" / "quagg-starter.ids"
DATEN = Path(__file__).parent / "daten"
VERGLEICH_IFC = DATEN / "ids_vergleich.ifc"
VERGLEICH_JSON = DATEN / "ids_vergleich.json"
NS = "{http://standards.buildingsmart.org/IDS}"

# Das Vergleichsmodell: (Klasse, Kennung, Name, Merkmalsaetze, Mengensaetze).
# Jede Starter-Regel trifft mindestens ein Element, die meisten einmal erfuellt
# und einmal verfehlt. Name None heisst: Attribut leer ($).
VERGLEICH = (
    ("IfcSpace", "R-benannt", "Raum 1", {}, {"Qto_SpaceBaseQuantities": {"NetFloorArea": 12.5}}),
    ("IfcSpace", "R-ohne", None, {}, {}),
    ("IfcWall", "W-aussen-ohne-brand", "W1", {"Pset_WallCommon": {"IsExternal": True, "LoadBearing": True}}, {}),
    ("IfcWall", "W-aussen-mit-brand", "W2", {"Pset_WallCommon": {"IsExternal": True, "FireRating": "F90"}}, {}),
    ("IfcWall", "W-innen", "W3", {"Pset_WallCommon": {"IsExternal": False, "LoadBearing": False}}, {}),
    ("IfcWall", "W-ohne-merkmale", "W4", {}, {}),
    # IDS 1.0 kennt in der Klassenfacette keine Vererbung — dieser zaehlt fuer IFCWALL NICHT.
    ("IfcWallStandardCase", "W-standardcase", "W5", {"Pset_WallCommon": {"IsExternal": True}}, {}),
    ("IfcDoor", "T-aussen", "T1", {"Pset_DoorCommon": {"IsExternal": True}}, {}),
    ("IfcDoor", "T-ohne", "T2", {}, {}),
    ("IfcWindow", "F-innen", "F1", {"Pset_WindowCommon": {"IsExternal": False}}, {}),
    ("IfcSlab", "D-ohne", "D1", {}, {}),
    ("IfcColumn", "S-tragend", "S1", {"Pset_ColumnCommon": {"LoadBearing": True}}, {}),
    ("IfcDistributionChamberElement", "K-benannt", "Schacht 1", {}, {}),
    ("IfcDistributionChamberElement", "K-ohne", None, {}, {}),
    ("IfcPipeSegment", "H-mit-dn", "Haltung 1", {"Pset_PipeSegmentTypeCommon": {"NominalDiameter": 0.3}}, {}),
    ("IfcPipeSegment", "H-ohne", "Haltung 2", {}, {}),
    ("IfcEarthworksCut", "A-mit-menge", "Aushub 1", {},
     {"Qto_EarthworksCutBaseQuantities": {"UndisturbedVolume": 42.0}}),
    ("IfcEarthworksCut", "A-ohne", "Aushub 2", {}, {}),
    ("IfcEarthworksFill", "AF-mit-menge", "Auftrag 1", {},
     {"Qto_EarthworksFillBaseQuantities": {"CompactedVolume": 10.0}}),
    # Der abgeleitete Container (Fahrplan Erdbau-Container, Stufe 4): Elemente der CDE
    # (Quagg_CDE.CdeId) — einmal mit Herkunft und bestimmtem Typ, einmal ohne beides.
    ("IfcEarthworksCut", "A-cde-voll", "Aushub CDE 1",
     {"Quagg_CDE": {"CdeId": "cde-ids-1"}, "Quagg_Herkunft": {"QuellRevision": "1"}},
     {"Qto_EarthworksCutBaseQuantities": {"UndisturbedVolume": 5.0}}),
    ("IfcEarthworksCut", "A-cde-ohne", "Aushub CDE 2", {"Quagg_CDE": {"CdeId": "cde-ids-2"}},
     {"Qto_EarthworksCutBaseQuantities": {"UndisturbedVolume": 3.0}}),
    ("IfcEarthworksFill", "AF-cde-voll", "Auftrag CDE 1",
     {"Quagg_CDE": {"CdeId": "cde-ids-3"}, "Quagg_Herkunft": {"QuellRevision": "1"}},
     {"Qto_EarthworksFillBaseQuantities": {"CompactedVolume": 4.0}}),
    ("IfcEarthworksFill", "AF-cde-ohne", "Auftrag CDE 2", {"Quagg_CDE": {"CdeId": "cde-ids-4"}},
     {"Qto_EarthworksFillBaseQuantities": {"CompactedVolume": 2.0}}),
)
# PredefinedType je Kennung, sonst leer ($). USERDEFINED mit ObjectType ist
# schemakonform — fuer den Container der CDE aber nicht bestimmt.
TYP = {"A-cde-voll": "TRENCH", "A-cde-ohne": "NOTDEFINED", "AF-cde-voll": "EMBANKMENT",
       "AF-cde-ohne": ("USERDEFINED", "Sonderschuettung")}


def kennungen(ids_pfad: Path) -> list:
    """Die `identifier` der Spezifikationen, in Dateireihenfolge.

    Aus dem XML, nicht aus ifctester: dessen `Specification.parse` (0.8.5) liest
    name, description und instructions ein, `identifier` NICHT — er bleibt None.
    Deshalb zaehlt der Pruefbericht die Spezifikationen durch (IDS:<datei>:<nr>),
    und die Reihenfolge ist die Bruecke zur Kennung.
    """
    import xml.etree.ElementTree as ET
    return [s.get("identifier") for s in ET.parse(ids_pfad).getroot().iter(NS + "specification")]


def _guid(kennung: str) -> str:
    """Feste GlobalIds — das Modell ist neu erzeugbar, ohne dass die Fixture wandert."""
    return ifcopenshell.guid.compress(uuid.uuid5(uuid.NAMESPACE_URL, f"quagg/ids-vergleich/{kennung}").hex)


def baue_vergleichsmodell(pfad: Path) -> Path:
    run = ifcopenshell.api.run
    f = ifcopenshell.file(schema="IFC4X3_ADD2")
    kette = [run("root.create_entity", f, ifc_class="IfcProject", name="IDS-Vergleich")]
    run("unit.assign_unit", f)
    for klasse, name in (("IfcSite", "Gelaende"), ("IfcBuilding", "Haus"), ("IfcBuildingStorey", "EG")):
        e = run("root.create_entity", f, ifc_class=klasse, name=name)
        run("aggregate.assign_object", f, relating_object=kette[-1], products=[e])
        kette.append(e)
    site, geschoss = kette[1], kette[3]
    for klasse, kennung, name, psets, qtos in VERGLEICH:
        e = run("root.create_entity", f, ifc_class=klasse, name=name)
        e.GlobalId = _guid(kennung)
        typ = TYP.get(kennung)
        if typ is not None:
            e.PredefinedType, e.ObjectType = (typ, None) if isinstance(typ, str) else typ
        if klasse == "IfcSpace":
            run("aggregate.assign_object", f, relating_object=geschoss, products=[e])
        elif klasse != "IfcEarthworksCut":                 # ein Aushub wird nicht eingeordnet (Where-Rule)
            wirt = site if klasse.startswith("IfcEarthworks") else geschoss
            run("spatial.assign_container", f, relating_structure=wirt, products=[e])
        for satz, werte in psets.items():
            run("pset.edit_pset", f, pset=run("pset.add_pset", f, product=e, name=satz), properties=werte)
        for satz, werte in qtos.items():
            run("pset.edit_qto", f, qto=run("pset.add_qto", f, product=e, name=satz), properties=werte)
    f.write(str(pfad))
    return pfad


def zaehlung(pfad: Path) -> list:
    """Das Urteil des Prueftors je Spezifikation — in der Form, die auch die Vorschau liefern muss."""
    befunde = P.ids_pruefen(ifcopenshell.open(str(pfad)), [STARTER])
    return [{"kennung": k, "anwendbar": b["teile"]["anwendbar"], "verfehlt": b["zahl"],
             "verfehlt_von": sorted(b["beispiele"])}
            for k, b in zip(kennungen(STARTER), befunde, strict=True)]


def test_starter_ist_gueltiges_ids_1_0_mit_schwere():
    ids = ifctester.ids.open(str(STARTER), validate=True)          # gegen das offizielle XSD
    assert len(ids.specifications) == 18
    assert all((s.instructions or "").startswith("Schwere: ") for s in ids.specifications)
    k = kennungen(STARTER)
    assert len(k) == 18 and None not in k and len(set(k)) == 18    # Kennungen da und eindeutig
    assert [s.identifier for s in ids.specifications] == [None] * 18, \
        "ifctester liest identifier jetzt ein — Pruefbericht kann die Kennung direkt fuehren"


@pytest.fixture(scope="module")
def waende(tmp_path_factory) -> Path:
    """Eine Aussenwand ohne FireRating, eine Innenwand — beide mit IsExternal und LoadBearing."""
    run = ifcopenshell.api.run
    f = ifcopenshell.file(schema="IFC4X3_ADD2")
    projekt = run("root.create_entity", f, ifc_class="IfcProject", name="P")
    run("unit.assign_unit", f)
    site = run("root.create_entity", f, ifc_class="IfcSite", name="S")
    run("aggregate.assign_object", f, relating_object=projekt, products=[site])
    for name, aussen in (("Aussen", True), ("Innen", False)):
        wand = run("root.create_entity", f, ifc_class="IfcWall", name=name)
        run("spatial.assign_container", f, relating_structure=site, products=[wand])
        pset = run("pset.add_pset", f, product=wand, name="Pset_WallCommon")
        run("pset.edit_pset", f, pset=pset, properties={"IsExternal": aussen, "LoadBearing": True})
    pfad = tmp_path_factory.mktemp("ids") / "waende.ifc"
    f.write(str(pfad))
    return pfad


def test_aussenwand_ohne_brandschutz_ist_genau_eine_warnung(waende):
    """Die Bedingung IsExternal=TRUE greift (gemessen: TRUE und true gleich), die Anforderung trifft genau eine Wand."""
    befunde = [b for b in P.pruefe(waende, ids=[STARTER])["befunde"] if b["stufe"] == "ids"]
    assert len(befunde) == 18
    rot = [b for b in befunde if b["ok"] is False]
    assert [b["titel"].split(" (")[0] for b in rot] == ["Außenwände — Brandschutz-Klasse"]
    assert rot[0]["zahl"] == 1 and rot[0]["schwere"] == "warnung" and not P.offen(rot[0])
    assert rot[0]["teile"] == {"anwendbar": 1, "erfuellt": 0}
    aussen = ifcopenshell.open(str(waende)).by_type("IfcWall")
    assert rot[0]["beispiele"] == [next(w.GlobalId for w in aussen if w.Name == "Aussen")]


def test_vergleichsmodell_zaehlt_wie_die_fixture():
    """Das Urteil am eingecheckten Modell == ids_vergleich.json — die Zahl, die die Vorschau treffen muss."""
    soll = json.loads(VERGLEICH_JSON.read_text(encoding="utf-8"))
    assert zaehlung(VERGLEICH_IFC) == soll["spezifikationen"]


def test_vergleichsmodell_ist_das_erzeugte(tmp_path):
    """Neu gebaut zaehlt es genauso — das eingecheckte Modell ist kein Einzelstueck."""
    soll = json.loads(VERGLEICH_JSON.read_text(encoding="utf-8"))
    assert zaehlung(baue_vergleichsmodell(tmp_path / "neu.ifc")) == soll["spezifikationen"]


def test_jede_regel_trifft_und_die_grenzfaelle_stehen_drin():
    """Kein Leerlauf: jede Regel hat Anwendungsfaelle; Mengen einmal erfuellt, einmal nicht; kein Untertyp."""
    soll = {s["kennung"]: s for s in json.loads(VERGLEICH_JSON.read_text(encoding="utf-8"))["spezifikationen"]}
    assert set(soll) == set(kennungen(STARTER))
    assert all(s["anwendbar"] >= 1 for s in soll.values()), [k for k, s in soll.items() if not s["anwendbar"]]
    assert (soll["spec-aushub-mengen"]["anwendbar"], soll["spec-aushub-mengen"]["verfehlt"]) == (4, 1)
    for regel in ("spec-aushub-herkunft", "spec-auftrag-herkunft", "spec-aushub-typ", "spec-auftrag-typ"):
        assert (soll[regel]["anwendbar"], soll[regel]["verfehlt"]) == (2, 1), regel    # nur die zwei der CDE
    assert (soll["spec-space-area"]["anwendbar"], soll["spec-space-area"]["verfehlt"]) == (2, 1)
    assert soll["spec-wall-external-flag"]["anwendbar"] == 4       # W5 (IfcWallStandardCase) zaehlt nicht
    assert soll["spec-wall-fire-rating"]["anwendbar"] == 2         # nur die zwei IfcWall mit IsExternal=TRUE
    # Der Bericht fuehrt je Befund hoechstens 5 Beispiele (pruefe._befund). Die Vorschau
    # vergleicht ALLE Verfehler — gleich ist das nur, solange keine Regel oefter verfehlt wird.
    assert all(s["verfehlt"] <= 5 for s in soll.values())


def test_die_aufzaehlung_ist_die_des_schemas():
    """Die Typ-Regeln des Erdbau-Containers nennen GENAU die PredefinedTypes des Schemas, ohne USERDEFINED/NOTDEFINED.

    Die Aufzaehlung steht in der IDS-Datei (IDS kennt keinen Verweis aufs Schema).
    Dieser Test ist ihr Waechter: aendert sich die Fassung des Schemas, faellt es hier auf.
    """
    import xml.etree.ElementTree as ET

    from app.ifc import schema as S
    xs = "{http://www.w3.org/2001/XMLSchema}"
    specs = {s.get("identifier"): s for s in ET.parse(STARTER).getroot().iter(NS + "specification")}
    for kennung, klasse in (("spec-aushub-typ", "IfcEarthworksCut"), ("spec-auftrag-typ", "IfcEarthworksFill")):
        werte = [e.get("value") for e in specs[kennung].iter(xs + "enumeration")]
        assert werte == [w for w in S.predefined(klasse) if w not in ("USERDEFINED", "NOTDEFINED")], kennung


if __name__ == "__main__":
    baue_vergleichsmodell(VERGLEICH_IFC)
    VERGLEICH_JSON.write_text(json.dumps({
        "_zweck": "Zwei Motoren, eine Zahl (IFC-Konsistenz, Stufe 5): die Zaehlung des Prueftors (ifctester) "
                  "am Vergleichsmodell. Die Vorschau im Client (IdsValidator.js) muss dieselbe liefern — "
                  "client/src/features/cde/test/idsVergleich.test.js. Neu schreiben: "
                  "PYTHONPATH=. app/ifc/.venv-ifc/bin/python app/ifc/tests/test_ids.py",
        "ids": "backend/app/ifc/daten/quagg-starter.ids",
        "modell": "backend/app/ifc/tests/daten/ids_vergleich.ifc",
        "spezifikationen": zaehlung(VERGLEICH_IFC),
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(VERGLEICH_IFC, VERGLEICH_JSON)
