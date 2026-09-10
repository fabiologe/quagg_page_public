"""Bezugssystem und Lage im Verbund — an den echten Dateien und an gebauten Faellen.

ANLASS (2026-09-10): der erste Verbund schrieb fest EPSG:25832. Die Nachbarsitzung
fand das ENQUIER-Kanalnetz in Gauss-Krueger Zone 2 — und die Messung zeigte mehr:
ALLE georeferenzierten isyifc-Exporte (A64, ENQUIER) sind DOPPELT georeferenziert,
mit Landeskoordinaten in der Geometrie UND demselben Ursprung in der
IfcMapConversion. Ein Betrachter, der die Verschiebung anwendet, legt ENQUIER bei
Rechtswert ~5,15 Mio. ab. Der Verbund darf das weder glauben noch still
reparieren: er misst, welche Lesart in ein bekanntes Fenster faellt, und sagt,
was er getan hat.

Dazu der Normalfall nach IFC4 — LOKALE Koordinaten plus MapConversion —, den
keine vorhandene Datei zeigt. Er wird hier gebaut, damit er nicht erst beim
ersten echten Kunden auffaellt.

Laeuft mit dem IFC-venv:
    backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_bezug.py -q
"""
import math
import pathlib

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")
import ifcopenshell.guid             # noqa: E402
import ifcopenshell.util.placement   # noqa: E402

from app.ifc import verbund as V     # noqa: E402
from app.ifc.pruefe import pruefe    # noqa: E402

REPO = pathlib.Path(__file__).parents[4]
METER = REPO / "client/src/features/cde/test/BIM26_Gruppe5_BODEN_Erdarbeiten.ifc"
ENQUIER = REPO / "client/testdata-local/TEST-ERDKOERPER_ENQUIER.ifc"
A64 = REPO / "client/testdata-local/6178_A64-2BA_0_2026-03-18 (12).ifc"


def _es_gibt(*pfade):
    return pytest.mark.skipif(not all(p.is_file() for p in pfade),
                              reason=f"Testdatei fehlt: {[p.name for p in pfade if not p.is_file()]}")


def _regel(ergebnis, kennung):
    return next(b for b in ergebnis["befunde"] if b["id"] == kennung)


# ── Gebaute Faelle ──────────────────────────────────────────────────────────

def _lokale_quelle(pfad, *, e, n, grad=0.0):
    """Ein Bauteil bei LOKAL (10, 20, 0) — die Lage steht nur in der MapConversion."""
    g = V.zielgeruest("Lokal", crs="EPSG:25832", schluessel=f"lokal-{e}-{grad}")
    f = g["datei"]
    mc = f.by_type("IfcMapConversion")[0]
    mc.Eastings, mc.Northings = float(e), float(n)
    if grad:
        mc.XAxisAbscissa = math.cos(math.radians(grad))
        mc.XAxisOrdinate = math.sin(math.radians(grad))
    platz = f.create_entity(
        "IfcLocalPlacement", PlacementRelTo=g["site"].ObjectPlacement,
        RelativePlacement=f.create_entity(
            "IfcAxis2Placement3D",
            Location=f.create_entity("IfcCartesianPoint", Coordinates=(10.0, 20.0, 0.0))))
    punkte = f.create_entity("IfcCartesianPointList3D",
                             CoordList=((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)))
    flaeche = f.create_entity("IfcTriangulatedFaceSet", Coordinates=punkte, CoordIndex=((1, 2, 3),))
    darstellung = f.create_entity("IfcShapeRepresentation", ContextOfItems=g["koerper"],
                                  RepresentationIdentifier="Body", RepresentationType="Tessellation",
                                  Items=[flaeche])
    bauteil = f.create_entity(
        "IfcBuildingElementProxy", GlobalId=ifcopenshell.guid.new(), OwnerHistory=g["besitz"],
        Name="Probe", ObjectPlacement=platz,
        Representation=f.create_entity("IfcProductDefinitionShape", Representations=[darstellung]))
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=g["besitz"], RelatingStructure=g["site"], RelatedElements=[bauteil])
    f.write(str(pfad))
    return bauteil.GlobalId


def _welt(pfad, guid):
    m = ifcopenshell.util.placement.get_local_placement(ifcopenshell.open(pfad).by_guid(guid).ObjectPlacement)
    return m[0][3], m[1][3]


def test_lokale_koordinaten_werden_mit_der_mapconversion_verschoben(tmp_path):
    """Der Normalfall nach IFC4: lokal modelliert, Lage in der MapConversion."""
    quelle = tmp_path / "lokal.ifc"
    guid = _lokale_quelle(quelle, e=410_000, n=5_475_000)
    ziel = tmp_path / "verbund.ifc"
    b = V.fuehre_zusammen([V.Quelle(quelle)], ziel, projektname="Lokal")
    q = b["quellen"][0]
    assert q["mapconversion_angewandt"] is True
    assert b["crs"] == "EPSG:25832"
    assert _welt(ziel, guid) == (pytest.approx(410_010.0), pytest.approx(5_475_020.0))
    assert b["weltbezug_plausibel"] is True
    ergebnis = pruefe(ziel)
    assert ergebnis["verstoesse"] == 0, [(x["id"], str(x["sagt"])[:200]) for x in ergebnis["befunde"] if not x["ok"]]


def test_gedrehte_mapconversion_dreht_mit(tmp_path):
    """90 Grad: lokal (10, 20) liegt danach bei (E-20, N+10)."""
    quelle = tmp_path / "gedreht.ifc"
    guid = _lokale_quelle(quelle, e=410_000, n=5_475_000, grad=90.0)
    ziel = tmp_path / "verbund.ifc"
    V.fuehre_zusammen([V.Quelle(quelle)], ziel, projektname="Gedreht")
    x, y = _welt(ziel, guid)
    assert x == pytest.approx(409_980.0, abs=1e-6)
    assert y == pytest.approx(5_475_010.0, abs=1e-6)


def test_ohne_landeskoordinaten_wird_abgelehnt(tmp_path):
    """Ein lokales Modell OHNE Verschiebung laege am Nullpunkt — das wird gesagt, nicht getan."""
    quelle = tmp_path / "nullpunkt.ifc"
    _lokale_quelle(quelle, e=0, n=0)
    with pytest.raises(V.VerbundUnmoeglich, match="keine Landeskoordinaten"):
        V.fuehre_zusammen([V.Quelle(quelle)], tmp_path / "v.ifc", projektname="Nullpunkt")


def test_unbekanntes_system_scheitert_vor_dem_ersten_oeffnen(tmp_path):
    """Die Quelle existiert nicht — gaebe es kein Vorab-Pruefen, kaeme ein Dateifehler."""
    with pytest.raises(V.VerbundUnmoeglich, match="unbekannt"):
        V.fuehre_zusammen([V.Quelle("/gibt/es/nicht.ifc")], tmp_path / "v.ifc", crs="EPSG:4326")


def test_nachbearbeiten_sieht_den_fertigen_verbund_vor_dem_schreiben(tmp_path):
    """Der Haken fuer den CDE-Eigenbau: alle Quellen drin, Georeferenz gesetzt, noch nicht geschrieben."""
    quelle = tmp_path / "lokal.ifc"
    _lokale_quelle(quelle, e=410_000, n=5_475_000)
    ziel = tmp_path / "verbund.ifc"
    gesehen = {}

    def haken(datei):
        gesehen["projekte"] = len(datei.by_type("IfcProject"))
        gesehen["crs"] = [c.Name for c in datei.by_type("IfcProjectedCRS")]
        gesehen["geschrieben"] = ziel.exists()
        return {"geschlossen": 0, "offen": []}

    b = V.fuehre_zusammen([V.Quelle(quelle)], ziel, projektname="Haken",
                          nachbearbeiten=[("probe", haken)])
    assert gesehen == {"projekte": 1, "crs": ["EPSG:25832"], "geschrieben": False}
    assert b["nachbearbeitung"] == {"probe": {"geschlossen": 0, "offen": []}}


def test_zielgeruest_verlangt_ein_crs():
    """Die alte Vorgabe EPSG:25832 war genau der Fehler. Wer kein System nennt, soll es merken."""
    with pytest.raises(TypeError):
        V.zielgeruest("Ohne")                                   # noqa: E501 — absichtlich ohne crs
    g = V.zielgeruest("Offen", crs=None)
    assert g["crs"] is None and not g["datei"].by_type("IfcProjectedCRS")
    V.georeferenz_setzen(g, "epsg:31466", herkunft="Test")
    crs = g["datei"].by_type("IfcProjectedCRS")[0]
    assert (crs.Name, crs.MapProjection, crs.MapZone, crs.GeodeticDatum) == \
        ("EPSG:31466", "Gauss-Krueger", "2", "DHDN")
    with pytest.raises(ValueError, match="schon gesetzt"):
        V.georeferenz_setzen(g, "EPSG:31466", herkunft="nochmal")


# ── V07: Aussparungen haengen ueber ihren Wirt ──────────────────────────────

def _mit_aushub(pfad, *, mit_wirt=True, aushub_eingeordnet=False):
    g = V.zielgeruest("Aushub", crs="EPSG:25832", schluessel=f"aushub-{mit_wirt}-{aushub_eingeordnet}")
    f, site, besitz = g["datei"], g["site"], g["besitz"]

    def element(klasse, name):
        return f.create_entity(
            klasse, GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz, Name=name,
            ObjectPlacement=f.create_entity(
                "IfcLocalPlacement", PlacementRelTo=site.ObjectPlacement,
                RelativePlacement=f.create_entity(
                    "IfcAxis2Placement3D",
                    Location=f.create_entity("IfcCartesianPoint", Coordinates=(410_000.0, 5_475_000.0, 0.0)))))

    gelaende = element("IfcGeographicElement", "Urgelaende")
    aushub = element("IfcEarthworksCut", "Aushub")
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=besitz, RelatingStructure=site,
                    RelatedElements=[gelaende] + ([aushub] if aushub_eingeordnet else []))
    if mit_wirt:
        f.create_entity("IfcRelVoidsElement", GlobalId=ifcopenshell.guid.new(), OwnerHistory=besitz,
                        RelatingBuildingElement=gelaende, RelatedOpeningElement=aushub)
    f.write(str(pfad))


def test_v07_kennt_den_aushub_ueber_seinen_wirt(tmp_path):
    datei = tmp_path / "aushub.ifc"
    _mit_aushub(datei)
    regel = _regel(pruefe(datei), "V07")
    assert regel["ok"] is True, regel["sagt"]


def test_v07_findet_den_aushub_ohne_wirt(tmp_path):
    datei = tmp_path / "ohne_wirt.ifc"
    _mit_aushub(datei, mit_wirt=False)
    regel = _regel(pruefe(datei), "V07")
    assert regel["ok"] is False and "ohne Wirt" in regel["sagt"]


def test_aushub_in_der_gliederung_verletzt_das_schema(tmp_path):
    """Die Where-Rule, an der die erste V07-Fassung vorbeiprüfte — das Schema faengt sie."""
    datei = tmp_path / "eingeordnet.ifc"
    _mit_aushub(datei, aushub_eingeordnet=True)
    regel = _regel(pruefe(datei), "SPF")
    assert regel["ok"] is False and "NotContained" in regel["sagt"]


# ── Die echten Dateien ──────────────────────────────────────────────────────

@_es_gibt(ENQUIER)
def test_doppelt_georeferenziert_wird_nicht_verschoben(tmp_path):
    """ENQUIER: Gauss-Krueger 2 in der Geometrie, UTM32 im Etikett, Ursprung doppelt."""
    ziel = tmp_path / "enquier.ifc"
    b = V.fuehre_zusammen([V.Quelle(ENQUIER)], ziel, projektname="ENQUIER")
    q = b["quellen"][0]
    assert q["crs_deklariert"] == "EPSG:25832"
    assert q["crs_erkannt"] == ["EPSG:31466"]
    assert q["mapconversion"]["eastings"] == pytest.approx(2_577_078)
    assert q["mapconversion_angewandt"] is False
    assert any("widerspricht den Koordinaten" in w for w in q["warnungen"])
    assert any("es gilt, was die Koordinaten sagen" in w for w in q["warnungen"])
    assert b["crs"] == "EPSG:31466"
    assert "Annahme" in b["crs_herkunft"]
    # Nicht bei 5,15 Mio. — dort laege es, haette der Verbund der MapConversion geglaubt.
    assert 2_400_000 < b["huelle"]["max"][0] < 2_600_000
    ergebnis = pruefe(ziel)
    assert _regel(ergebnis, "V06a")["ok"] is True
    assert _regel(ergebnis, "V06b")["ok"] is True, _regel(ergebnis, "V06b")["sagt"]
    crs = ifcopenshell.open(ziel).by_type("IfcProjectedCRS")
    assert [(c.Name, c.MapProjection) for c in crs] == [("EPSG:31466", "Gauss-Krueger")]


@_es_gibt(A64)
def test_a64_utm_mit_angabe_und_doppeltem_ursprung(tmp_path):
    """A64: UTM — die Angabe in der Datei entscheidet die Mehrdeutigkeit 32/33."""
    b = V.fuehre_zusammen([V.Quelle(A64)], tmp_path / "a64.ifc", projektname="A64")
    q = b["quellen"][0]
    assert q["crs_erkannt"] == ["EPSG:25832", "EPSG:25833"]
    assert q["mapconversion_angewandt"] is False
    assert b["crs"] == "EPSG:25832"
    assert b["crs_mehrdeutig"] == ["EPSG:25833"]
    assert "nach der Angabe in" in b["crs_herkunft"]
    assert b["weltbezug_plausibel"] is True


@_es_gibt(METER, ENQUIER)
def test_gemischte_bezugssysteme_werden_abgelehnt(tmp_path):
    """UTM neben Gauss-Krueger — Hunderte Kilometer auseinander gemeint, nie uebereinander."""
    with pytest.raises(V.VerbundUnmoeglich, match="verschiedenen Bezugssystemen") as info:
        V.fuehre_zusammen([V.Quelle(METER), V.Quelle(ENQUIER)], tmp_path / "v.ifc", projektname="Mix")
    assert METER.name in str(info.value) and ENQUIER.name in str(info.value)


@_es_gibt(METER)
def test_projektangabe_muss_zu_den_koordinaten_passen(tmp_path):
    with pytest.raises(V.VerbundUnmoeglich, match="liegt nicht in EPSG:31466"):
        V.fuehre_zusammen([V.Quelle(METER)], tmp_path / "v.ifc", crs="EPSG:31466")
