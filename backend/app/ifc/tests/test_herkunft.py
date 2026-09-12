"""Die Herkunft erzeugter Elemente — EIN Satz, EIN Schreiber (Fahrplan Erdbau-Container, Stufe 3).

Laeuft mit DEM IFC-VENV:
    PYTHONPATH=backend backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_herkunft.py -q
"""
import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")

from app.ifc import FASSUNG, WERKZEUG, guids      # noqa: E402
from app.ifc import herkunft as H                  # noqa: E402
from app.ifc import schema as S                    # noqa: E402
from app.ifc import verbund as V                   # noqa: E402

BAUTEIL = {"cdeId": "cde-a", "klasse": "IFCEARTHWORKSCUT", "predefinedType": "TRENCH", "name": "Graben",
           "farbe": 0x8a7145, "ursprung": [410300.0, 5460100.0, 250.0],
           "punkte": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], "dreiecke": [[0, 1, 2]],
           "mengen": {"undisturbedVolume": 1.5}, "quellen": {"gelaende": "1Ur0Gelaende0Vertrag00", "rohre": []}}


def test_der_hash_haengt_am_inhalt_nicht_an_name_farbe_oder_reihenfolge():
    h = H.eingabe_hash(BAUTEIL)
    assert len(h) == 16 and int(h, 16) >= 0
    assert H.eingabe_hash(dict(reversed(list(BAUTEIL.items())))) == h
    assert H.eingabe_hash({**BAUTEIL, "name": "Anders", "farbe": 0, "cdeId": "cde-b"}) == h
    assert H.eingabe_hash({**BAUTEIL, "punkte": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.01]]}) != h
    assert H.eingabe_hash({**BAUTEIL, "quellen": {"gelaende": "2Anderes0Gelaende00000"}}) != h


def test_der_journalstand_sagt_ob_ungesicherte_schritte_mitkamen():
    assert H.journalstand({"commit": "c-1", "sitzungOffen": False}) == "c-1"
    assert H.journalstand({"commit": "c-1", "sitzungOffen": True}) == "c-1+Sitzung"
    assert H.journalstand({}) is None and H.journalstand(None) is None


def test_das_werkzeug_nennt_seine_fassung():
    assert H.werkzeug() == f"{WERKZEUG} {FASSUNG} (ifcopenshell {ifcopenshell.version})"


def _geruest(schluessel):
    g = V.zielgeruest("Herkunft", crs=None, schluessel=schluessel)
    return g["datei"], g["besitz"]


def _guids(praefix):
    def guid_von(teil):
        return guids.guid_aus_cde_id(f"{praefix}|{teil}")
    return guid_von


def _werte(objekt):
    return {e.Name: e.NominalValue.wrappedValue for r in objekt.IsDefinedBy
            for e in r.RelatingPropertyDefinition.HasProperties}


def test_ein_zweiter_schreiber_ergaenzt_den_satz_statt_einen_zweiten_anzulegen():
    """Der Verbund benennt eine GlobalId um und schreibt `OriginalGlobalId` — in DEN Satz, den der Eigenbau schrieb."""
    f, besitz = _geruest("zwei")
    wand = f.create_entity("IfcWall", GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz, Name="W")
    vorher = len(f.by_type("IfcPropertySingleValue"))
    H.schreibe(f, besitz, wand, {"QuellDokument": "A.ifc", "EingabeHash": "0123456789abcdef", "Leer": None},
               guid_von=_guids("eins"))
    H.schreibe(f, besitz, wand, {"OriginalGlobalId": "2abcdefghijklmnopqrstu", "QuellDokument": "B.ifc"},
               guid_von=_guids("zwei"))
    (rel,) = wand.IsDefinedBy
    werte = {e.Name: (e.NominalValue.is_a(), e.NominalValue.wrappedValue)
             for e in rel.RelatingPropertyDefinition.HasProperties}
    assert werte == {"QuellDokument": ("IfcLabel", "B.ifc"), "EingabeHash": ("IfcIdentifier", "0123456789abcdef"),
                     "OriginalGlobalId": ("IfcLabel", "2abcdefghijklmnopqrstu")}
    assert len(f.by_type("IfcPropertySingleValue")) == vorher + 3       # der ersetzte Wert ist weg, nicht verwaist


def test_ein_geteilter_satz_wird_nicht_fuer_alle_umgeschrieben():
    f, besitz = _geruest("geteilt")
    a = f.create_entity("IfcWall", GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz, Name="a")
    b = f.create_entity("IfcWall", GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz, Name="b")
    H.schreibe(f, besitz, a, {"QuellDokument": "A.ifc"}, guid_von=_guids("g"))
    (rel,) = a.IsDefinedBy
    rel.RelatedObjects = [a, b]
    H.schreibe(f, besitz, b, {"OriginalGlobalId": "2abcdefghijklmnopqrstu"}, guid_von=_guids("h"))
    assert _werte(a) == {"QuellDokument": "A.ifc"}
    assert _werte(b) == {"QuellDokument": "A.ifc", "OriginalGlobalId": "2abcdefghijklmnopqrstu"}


def test_das_dokument_erfuellt_seine_pflichten_und_kommt_je_sha256_einmal():
    f, besitz = _geruest("dok")
    cache = {}
    ref = H.dokument(f, cache, sha256="a" * 64, datei="Gelaende.ifc", revision=2,
                     ablage="01_Laufend/42069_BlazeIT/CDE/")
    assert H.dokument(f, cache, sha256="a" * 64, datei="Gelaende.ifc", revision=2) is ref
    info = ref.ReferencedDocument
    pflicht = [a["name"] for a in S.attribute("IfcDocumentInformation") if not a["optional"]]
    assert pflicht == ["Identification", "Name"] and all(getattr(info, a) for a in pflicht)
    assert (info.Identification, info.Name, info.Revision, info.Location) == \
        ("a" * 64, "Gelaende.ifc", "2", "01_Laufend/42069_BlazeIT/CDE/Gelaende.ifc")
    assert (ref.Identification, ref.Location, ref.Name) == ("a" * 64, info.Location, None)   # WR1
    wand = f.create_entity("IfcWall", GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz)
    rel = H.verknuepfe(f, besitz, ref, [wand, wand], guid=guids.guid_aus_cde_id("dok|rel"))
    assert rel.RelatedObjects == (wand,)
    assert H.verknuepfe(f, besitz, ref, [], guid="x") is None


def test_unsere_dokumente_verschmelzen_ueber_die_sha256_fremde_ueber_die_revision():
    f, _besitz = _geruest("schluessel")
    unser = f.create_entity("IfcDocumentInformation", Identification="b" * 64, Name="X", Revision="1")
    fremd = f.create_entity("IfcDocumentInformation", Identification="A-GA-6100", Name="Plan", Revision="B")
    assert H.dokument_schluessel(unser) == ("b" * 64,)
    assert H.dokument_schluessel(fremd) == ("A-GA-6100", "B")
