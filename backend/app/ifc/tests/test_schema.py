"""Die Schema-Wahrheit — und dass sie wahr bleibt.

Jede Pruefung zaehlt eine Groesse, und geheilt ist sie erst bei 0:
  1. Schnappschuss gegen ifcopenshell: 0 Abweichungen. Wer ifcopenshell hebt,
     sieht hier ZUERST, was sich am Schema geaendert hat — mit Namen.
  2. Jede Waise aus IFC4/IFC2X3 hat eine Antwort: 0 unbehandelte.
  3. Die Abfragen, von denen der Schreiber lebt (Klasse, PredefinedType,
     Attribute, Mengenvorlage), sagen fuer JEDE Klasse dasselbe wie
     ifcopenshell selbst: 0 abweichende.

Laeuft mit dem IFC-venv:
    PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m pytest app/ifc/tests/test_schema.py
Die Teile ohne ifcopenshell laufen auch mit jedem python3.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.ifc import schema as S

BACKEND = Path(__file__).parents[3]


def _ifc():
    return pytest.importorskip("ifcopenshell", reason="ifcopenshell fehlt — mit dem IFC-venv laufen lassen")


def _ist_produkt(decl) -> bool:
    t = decl
    while t is not None:
        if t.name() == "IfcProduct":
            return True
        t = t.supertype()
    return False


def test_schnappschuss_ist_aktuell():
    _ifc()
    frisch = json.loads(S.als_text(S.baue_snapshot()))
    diff = S.unterschiede(frisch, S.snapshot())
    assert diff == [], ("Schnappschuss veraltet — neu schreiben: python -m app.ifc.schema --snapshot\n"
                        + "\n".join(diff))


def test_jede_waise_hat_eine_antwort():
    """Waise = Produkt aus IFC4/IFC2X3, das ADD2 nicht kennt. Jede braucht eine Entscheidung."""
    waisen = S.waisen()
    assert len(waisen) >= 20, waisen            # Schutz gegen Leerlauf: gemessen 21
    offen = []
    for w in waisen:
        ziel = S.name_von(S.normalisiere(w))
        if w in S.GESTRICHEN:
            continue
        if ziel is None or ziel == w or S.ZIELSCHEMA not in S.eintrag(ziel)["schemata"]:
            offen.append(w)
    assert offen == [], f"Waisen ohne Nachfolger — in schema.ALTNAMEN oder GESTRICHEN eintragen: {offen}"


def test_die_tabellen_haben_keine_toten_eintraege():
    """Ein Altname fuer eine Klasse, die es noch gibt, waere eine stille Umleitung."""
    waisen = set(S.waisen())
    for alt, neu in S.ALTNAMEN.items():
        assert alt in waisen or alt in S.ABGEKUENDIGT, f"{alt}: weder Waise noch abgekuendigt"
        assert S.ZIELSCHEMA in (S.eintrag(neu) or {}).get("schemata", []), f"{alt} -> {neu}: Ziel fehlt in ADD2"
    for g in S.GESTRICHEN:
        assert g in waisen, f"{g} steht in GESTRICHEN, ist aber keine Waise"
        assert S.eintrag(g)["nachfolger"] is None
    for a in S.ABGEKUENDIGT:
        e = S.eintrag(a)
        assert e.get("abgekuendigt") and S.ZIELSCHEMA in e["schemata"], a


def test_civil_element_ist_abgekuendigt_nicht_gestrichen():
    """Der Irrtum, auf dem der strukturelle Rueckweg in IfcQuelle stand."""
    e = S.eintrag("IFCCIVILELEMENT")
    assert e["schemata"] == ["IFC4", "IFC4X3_ADD2"]
    assert e["abgekuendigt"] is True
    assert S.vererbung("IfcCivilElement")[-2:] == ["IfcElement", "IfcCivilElement"]
    assert S.ist_schreibbar("IfcCivilElement") == "IfcCivilElement"


def test_waisen_erben_in_add2_begriffen():
    """Die Kette einer Waise endet dort, wo die Typprofile stehen."""
    assert S.vererbung("IfcBuildingElementComponent")[-2:] == ["IfcBuiltElement", "IfcBuildingElementComponent"]
    assert S.vererbung("IfcBeamStandardCase")[-2:] == ["IfcBeam", "IfcBeamStandardCase"]
    assert S.eintrag("IfcBeamStandardCase")["nachfolger"] == "IfcBeam"


def test_abfragen_des_schreibers_sagen_dasselbe_wie_ifcopenshell():
    """eigenbau.py fragte bis 2026-09-11 ifcopenshell direkt. Jetzt fragt es den
    Schnappschuss — also muss der fuer JEDE Klasse dasselbe sagen."""
    ifcopenshell = _ifc()
    s = ifcopenshell.schema_by_name(S.ZIELSCHEMA)
    abweichend = []
    for d in s.entities():
        n = d.name()
        erwartet = n if (not d.is_abstract() and _ist_produkt(d)) else None
        if S.ist_schreibbar(n) != erwartet:
            abweichend.append(("schreibbar", n))
        attr = {a.name(): a for a in d.all_attributes()}.get("PredefinedType")
        if S.predefined(n) != (S._enum_von(attr) if attr else []):
            abweichend.append(("predefined", n))
        if [a.name() for a in d.all_attributes()] != [a["name"] for a in S.attribute(n)]:
            abweichend.append(("attribute", n))
        if sorted(i.name() for i in d.all_inverse_attributes()) != sorted(i["name"] for i in S.inverse(n)):
            abweichend.append(("inverse", n))
    assert abweichend == [], abweichend[:10]


def test_mengenvorlagen_sagen_dasselbe_wie_ifcopenshell():
    _ifc()
    import ifcopenshell.util.pset
    t = ifcopenshell.util.pset.get_template(S.ZIELSCHEMA)
    for klasse in ("IfcEarthworksCut", "IfcEarthworksFill", "IfcPipeSegment", "IfcWall", "IfcGeographicElement"):
        v = t.get_by_name(f"Qto_{klasse[3:]}BaseQuantities")
        s = S.qto_vorlage(klasse)
        assert (v is None) == (s is None), klasse
        if v:
            assert s["name"] == v.Name
            assert [(m[0], m[1]) for m in s["merkmale"]] == [(p.Name, p.TemplateType) for p in v.HasPropertyTemplates]


def test_vorlagen_folgen_der_vererbung():
    assert "Pset_WallCommon" in S.vorlagen_fuer("IfcWallStandardCase")
    assert "Pset_Condition" in S.vorlagen_fuer("IfcPipeSegment")          # gilt fuer IfcElement
    # Verteilungs-Vorlagen gehoeren NICHT an die Wand — das alte bSDD-Woerterbuch hatte sie per '*'.
    assert "Pset_ElectricalDeviceCommon" not in S.vorlagen_fuer("IfcWall")
    name, v = next((n, v) for n, v in S.snapshot()["vorlagen"].items() if any("/" in g for g in v["gilt_fuer"]))
    klasse, _, pt = next(g for g in v["gilt_fuer"] if "/" in g).partition("/")
    assert name not in S.vorlagen_fuer(klasse)
    assert name in S.vorlagen_fuer(klasse, pt)


def test_where_rules_kommen_mit_quelltext_und_erben():
    geerbt = {r["regel"]: r for r in S.where_rules("IfcEarthworksCut")}
    assert "IfcFeatureElement.NotContained" in geerbt
    assert "ContainedInStructure" in geerbt["IfcFeatureElement.NotContained"]["quelle"]
    assert [r["regel"] for r in S.where_rules("IfcEarthworksCut", geerbt=False)] == [
        "IfcEarthworksCut.CorrectPredefinedType"]


def test_schreibbar_heisst_add2_konkret_produkt():
    """Dieselben Faelle prueft test/woerterbuch.test.js am Client (`istSchreibbar`)."""
    assert S.ist_schreibbar("IFCEARTHWORKSCUT") == "IfcEarthworksCut"
    assert S.ist_schreibbar("IfcFeatureElement") is None          # abstrakt
    assert S.ist_schreibbar("IfcCartesianPoint") is None          # kein Produkt
    assert S.ist_schreibbar("IfcProxy") is None                   # Waise: lesbar, nicht schreibbar
    assert S.ist_schreibbar("IfcPipeSegmentCulvert") is None      # bSDD-Abflachung, keine Klasse
    assert S.ist_schreibbar("") is None


def test_normierung_wie_der_client():
    """Die Faelle, die typprofilDeckung.test.js am Client festhaelt."""
    assert S.normalisiere("IFCOPENINGSTANDARDCASE") == "IFCOPENINGELEMENT"   # Altname VOR der Endung
    assert S.normalisiere("IfcWallStandardCase") == "IFCWALL"
    assert S.normalisiere("IFCBUILDINGELEMENT") == "IFCBUILTELEMENT"
    assert S.normalisiere("IfcSlabElementedCase") == "IFCSLAB"
    assert S.normalisiere("IFCQUATSCH") == "IFCQUATSCH"
    assert S.klasse_zu("IfcBeamStandardCase") == "IfcBeamStandardCase"      # die Waise selbst zuerst


def test_lesen_importiert_kein_ifcopenshell():
    """Produktions-venv, MCP-venv, pre-commit: dort gibt es kein ifcopenshell."""
    code = ("import sys; from app.ifc import schema as S; S.snapshot(); S.vererbung('IfcWall'); "
            "S.ist_schreibbar('IfcEarthworksCut'); S.qto_vorlage('IfcEarthworksCut'); "
            "print('ifcopenshell' in sys.modules)")
    r = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "False"
