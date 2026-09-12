"""Was die CDE selbst erzeugt, muss durch DASSELBE Prueftor wie der Verbund.

Der Massstab ist nicht eine eigene Vorstellung von „konform", sondern
`pruefe.py` der Verbund-Sitzung: Schema, Where-Rules (bSI-Massstab) und die
Verbundregeln V01-V08. Eine Eigenbau-Datei, die nur hier gruen waere, haette
nichts bewiesen.

Drei Sorten Zusagen:
  1. Die Eigenbau-Datei selbst besteht das Tor — mit jeder Bauteilart, die
     die CDE ins Paket legt (Aushub, Auftrag, gezeichnetes Gelaende, Rohr,
     Schacht, Linie). Seit Paket v2 KEIN geformtes DGM: die Anzeigeform bleibt
     im Raum der CDE (Stufe 2 des Aushub-Fachmodells).
  2. Die Befunde, die das Tor beim ersten Lauf fand, bleiben gefunden: ein
     Aushub OHNE Wirt ist schemawidrig, und genau das muss rot werden.
  3. Im Verbund mit einer GELIEFERTEN Datei — dort, wo der Wirt eines
     Aushubs wirklich liegt — schliesst `wirte_herstellen` die Luecke.

Laeuft mit DEM IFC-VENV:
    PYTHONPATH=backend backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_eigenbau.py -q
"""
import json
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")

from app.ifc import guids                          # noqa: E402
from app.ifc import herkunft as H                  # noqa: E402
from app.ifc import verbund as V                   # noqa: E402
from app.ifc.eigenbau import (                     # noqa: E402
    PAKET_VERSION, PSET_CDE, PSET_VORGANG, PaketFehler, baue_datei, vorgaenge_schliessen_in,
    wirte_herstellen, wirte_herstellen_in)
from app.ifc.probe import zweiter_motor            # noqa: E402
from app.ifc.pruefe import ids_pruefen, offen, pruefe  # noqa: E402

REPO = Path(__file__).resolve().parents[4]

# UTM32, in der Gegend der BIM26-Lieferungen — das Fenster, das V06b heute prueft.
OST, NORD, HOEHE = 410300.0, 5460100.0, 250.0


def _kasten(dx, dy, dz):
    p = [(0, 0, 0), (dx, 0, 0), (dx, dy, 0), (0, dy, 0), (0, 0, dz), (dx, 0, dz), (dx, dy, dz), (0, dy, dz)]
    t = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
         (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    return [list(map(float, q)) for q in p], [list(x) for x in t]


def _gitter(n, zelle):
    p = [[i * zelle, j * zelle, 0.3 * ((i * j) % 5)] for i in range(n) for j in range(n)]
    t = []
    for i in range(n - 1):
        for j in range(n - 1):
            a, b, c, d = i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1
            t += [[a, b, c], [a, c, d]]
    return p, t


def _bauteil(cde_id, klasse, geo, **extra):
    punkte, dreiecke = geo
    return {"cdeId": cde_id, "klasse": klasse, "name": f"Test {cde_id}",
            "ursprung": [OST, NORD, HOEHE], "punkte": punkte, "dreiecke": dreiecke, **extra}


def _paket(bauteile, **extra):
    return {"version": PAKET_VERSION, "crs": "EPSG:25832", "projektname": "Eigenbau-Test",
            "erzeugt": "2026-09-10T00:00:00Z", "bauteile": bauteile, **extra}


VORGANG = {"ableitung": "ab-1", "art": "erdbau", "reihe": 0, "titel": "Test · Gelände formen"}


def _alle_arten(wirt="cde-gelaende"):
    """Jede Bauteilart, die die CDE ins Paket legt — mit den Werten, die das Journal traegt.

    Paket v2: Aushub und Auftrag gehoeren EINEM Vorgang, tragen Mengen (die
    Kaesten messen 240 und 144 m3) und das Fachmodell „erdbau". Das Gelaende
    ist ein in der CDE GEZEICHNETES (Altbestand `gelaende`), kein geformtes —
    es dient als Wirt im selben Paket, damit die Datei allein das Tor besteht.
    """
    quellen = {"gelaende": wirt, "rohre": [], "schaechte": [], "bauteil": None}
    return [
        _bauteil("cde-aushub", "IFCEARTHWORKSCUT", _kasten(20, 4, 3), predefinedType="TRENCH",
                 farbe=0x8a7145, deckkraft=0.55, geschlossen=True, rolle="aushub", rezept="erdbau",
                 wirt=wirt, fachmodell="erdbau", vorgang=VORGANG, quellen=quellen,
                 mengen={"undisturbedVolume": 240.0}),
        _bauteil("cde-auftrag", "IFCEARTHWORKSFILL", _kasten(12, 6, 2), predefinedType="EMBANKMENT",
                 farbe=0x79a06a, deckkraft=1.0, geschlossen=True, rolle="auftrag", rezept="erdbau",
                 fachmodell="erdbau", vorgang=VORGANG, quellen=quellen, mengen={"compactedVolume": 144.0}),
        _bauteil("cde-gelaende", "IFCGEOGRAPHICELEMENT", _gitter(12, 5.0), predefinedType="TERRAIN",
                 farbe=0xa29a8c, deckkraft=1.0, geschlossen=False, rezept="gelaende", fachmodell="cde"),
        _bauteil("cde-rohr", "IFCPIPESEGMENT", _kasten(30, 0.5, 0.5), geschlossen=True, rezept="rohr"),
        _bauteil("cde-schacht", "IFCDISTRIBUTIONCHAMBERELEMENT", _kasten(1, 1, 3), geschlossen=True,
                 rezept="schacht"),
        _bauteil("cde-linie", "IFCANNOTATION",
                 ([[0, 0, 0], [40, 0, 0], [40, 0.06, 0], [0, 0.06, 0]], [[0, 1, 2], [0, 2, 3]]),
                 geschlossen=False, rezept="linie"),
    ]


def _sauber(ergebnis):
    """Null Verstoesse — ohne Ausnahme.

    Bis 2026-09-10 durfte V07 an den Aushueben rot sein: die Regel verlangte
    die Einordnung in die Raumgliederung, das Schema verbietet sie fuer
    Aushuebe (`IfcFeatureElement.NotContained`). Die Verbund-Sitzung hat V07
    angepasst — ein Aushub gilt als eingeordnet, wenn sein WIRT es ist. Der
    strict-xfail, der das anzeigen sollte, hat es angezeigt.
    """
    assert not _fehl(ergebnis), _fehl(ergebnis)


def _regel(ergebnis, kennung):
    return next(b for b in ergebnis["befunde"] if b["id"] == kennung)


def _fehl(ergebnis):
    # Offen heisst: sperrt (pruefe.offen). Ein Hinweis „keine IDS hinterlegt" ist keiner.
    return [(b["id"], str(b["sagt"])[:400]) for b in ergebnis["befunde"] if offen(b)]


# ── 1. Die Eigenbau-Datei allein ────────────────────────────────────────────

def test_jede_bauteilart_besteht_das_prueftor(tmp_path):
    """DIE Zusage. Null Verstoesse — Schema, Where-Rules und V01-V08."""
    ziel = tmp_path / "eigenbau.ifc"
    bericht = baue_datei(_paket(_alle_arten()), ziel, schluessel="t1")
    assert bericht["bauteile"] == 6
    assert bericht["wirte_offen"] == 0
    _sauber(pruefe(ziel))


def test_globalids_sind_abgeleitet_formgerecht_und_stabil(tmp_path):
    """Zweimal geschrieben heisst REVISION, nicht Fremdling — und nie `cde-…` im IFC."""
    ids = []
    for lauf in range(2):
        ziel = tmp_path / f"lauf{lauf}.ifc"
        baue_datei(_paket(_alle_arten()), ziel, schluessel="stabil")
        f = ifcopenshell.open(ziel)
        ids.append(sorted(r.GlobalId for r in f.by_type("IfcRoot")))
    assert ids[0] == ids[1]
    assert all(guids.ist_gueltig(g) for g in ids[0])
    f = ifcopenshell.open(tmp_path / "lauf0.ifc")
    aushub = f.by_type("IfcEarthworksCut")[0]
    assert aushub.GlobalId == guids.guid_aus_cde_id("cde-aushub")
    assert not any(r.GlobalId.startswith("cde-") for r in f.by_type("IfcRoot"))


def test_klassen_und_predefinedtype_kommen_aus_dem_journal(tmp_path):
    ziel = tmp_path / "klassen.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="klassen")
    f = ifcopenshell.open(ziel)
    assert f.by_type("IfcEarthworksCut")[0].PredefinedType == "TRENCH"
    assert f.by_type("IfcEarthworksFill")[0].PredefinedType == "EMBANKMENT"
    assert f.by_type("IfcGeographicElement")[0].PredefinedType == "TERRAIN"
    # Ohne Angabe im Journal: NOTDEFINED — nie etwas Erfundenes.
    assert f.by_type("IfcPipeSegment")[0].PredefinedType == "NOTDEFINED"
    assert f.by_type("IfcDistributionChamberElement")[0].PredefinedType == "NOTDEFINED"


def test_ungueltiges_wird_gemeldet_nicht_erfunden(tmp_path):
    teile = _alle_arten() + [
        _bauteil("cde-quatsch", "IFCQUATSCH", _kasten(1, 1, 1)),
        _bauteil("cde-falsch", "IFCEARTHWORKSFILL", _kasten(2, 2, 2), predefinedType="FOOBAR"),
        _bauteil("cde-leer", "IFCPIPESEGMENT", ([], [])),
    ]
    ziel = tmp_path / "gemeldet.ifc"
    bericht = baue_datei(_paket(teile), ziel, schluessel="gemeldet")
    uebersprungen = {u.get("cdeId") for u in bericht["uebersprungen"]}
    assert {"cde-quatsch", "cde-leer"} <= uebersprungen
    assert any("FOOBAR" in w for w in bericht["warnungen"])
    f = ifcopenshell.open(ziel)
    falsch = next(e for e in f.by_type("IfcEarthworksFill") if e.GlobalId == guids.guid_aus_cde_id("cde-falsch"))
    assert falsch.PredefinedType == "NOTDEFINED"
    _sauber(pruefe(ziel))


def test_ein_kaputtes_paket_wird_abgelehnt(tmp_path):
    with pytest.raises(PaketFehler):
        baue_datei({"version": 99, "bauteile": []}, tmp_path / "x.ifc")
    with pytest.raises(PaketFehler):
        baue_datei({"version": 1}, tmp_path / "x.ifc")


def test_der_aushub_scheint_auch_beim_empfaenger_durch(tmp_path):
    """Die Farbe gehoert ins IFC, nicht nur in die CDE-Ansicht."""
    ziel = tmp_path / "farbe.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="farbe")
    f = ifcopenshell.open(ziel)
    aushub = f.by_type("IfcEarthworksCut")[0]
    flaeche = aushub.Representation.Representations[0].Items[0]
    stil = flaeche.StyledByItem[0].Styles[0]
    schattierung = stil.Styles[0]
    assert schattierung.Transparency == pytest.approx(0.45)
    assert schattierung.SurfaceColour.Red == pytest.approx(0x8a / 255)
    # Drei Farben im Paket, drei Stile — geteilt, nicht je Bauteil.
    assert len(f.by_type("IfcSurfaceStyle")) == 3


def test_koordinaten_liegen_im_landessystem(tmp_path):
    """Platzierung traegt den Landeswert, die Punkte bleiben klein (Float-Stellen)."""
    ziel = tmp_path / "lage.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="lage")
    f = ifcopenshell.open(ziel)
    rohr = f.by_type("IfcPipeSegment")[0]
    ort = rohr.ObjectPlacement.RelativePlacement.Location.Coordinates
    assert ort == pytest.approx((OST, NORD, HOEHE))
    punkte = rohr.Representation.Representations[0].Items[0].Coordinates.CoordList
    assert max(abs(c) for p in punkte for c in p) < 100
    assert _regel(pruefe(ziel), "V06b")["ok"] is True


def test_gauss_krueger_wird_als_gauss_krueger_geschrieben(tmp_path):
    """Das Kanalnetz ENQUIER liegt in GK2 — dann darf im CRS nicht UTM stehen."""
    ziel = tmp_path / "gk2.ifc"
    baue_datei(_paket(_alle_arten(), crs="EPSG:31466"), ziel, schluessel="gk2")
    f = ifcopenshell.open(ziel)
    crs = f.by_type("IfcProjectedCRS")[0]
    assert crs.Name == "EPSG:31466"
    assert crs.GeodeticDatum == "DHDN"
    assert crs.MapProjection == "Gauss-Krueger"
    assert crs.MapZone == "2"


def test_die_herkunft_des_systems_steht_in_der_datei(tmp_path):
    """Woher das System kommt, gehoert zur Aussage — die CDE hat es ERKANNT, nicht gelesen."""
    ziel = tmp_path / "herkunft.ifc"
    text = ("Georeferenz-Erkennung der CDE: die Datei deklariert EPSG:25832, "
            "die Koordinaten liegen in EPSG:31466")
    baue_datei(_paket(_alle_arten(), crs="EPSG:31466", crsHerkunft=text), ziel, schluessel="herkunft")
    import ifcopenshell.util.element as ue
    f = ifcopenshell.open(ziel)
    werte = ue.get_psets(f.by_type("IfcSite")[0]).get(V.PSET_GEOREF, {})
    assert werte.get("Herkunft") == text
    assert werte.get("CRS") == "EPSG:31466"


def test_ohne_system_keine_vorgabe(tmp_path):
    """Kein System im Paket: keine erfundene Georeferenz (frueher stand hier fest UTM32)."""
    ziel = tmp_path / "ohne.ifc"
    bericht = baue_datei(_paket(_alle_arten(), crs=None), ziel, schluessel="ohne")
    f = ifcopenshell.open(ziel)
    assert not f.by_type("IfcProjectedCRS")
    assert not f.by_type("IfcMapConversion")
    assert bericht["crs"] is None
    assert any("ohne Bezugssystem" in w for w in bericht["warnungen"])


def test_ein_unbekanntes_system_wird_abgelehnt(tmp_path):
    """Nicht raten: ein System, das bezugssysteme.py nicht kennt, ist ein Paketfehler."""
    with pytest.raises(PaketFehler, match="unbekannt"):
        baue_datei(_paket(_alle_arten(), crs="EPSG:4326"), tmp_path / "x.ifc", schluessel="x")


def _pset(objekt, satzname):
    """Die Werte eines Merkmalssatzes — ueber die inverse Beziehung, wie ein Empfaenger liest."""
    for rel in objekt.IsDefinedBy or ():
        d = rel.RelatingPropertyDefinition
        if d.is_a("IfcPropertySet") and d.Name == satzname:
            return {e.Name: e.NominalValue.wrappedValue for e in d.HasProperties}
    return {}


def _qto(objekt):
    """Die Mengen eines Bauteils: {'_name': Qto-Satz, Mengenname: Wert}."""
    for rel in objekt.IsDefinedBy or ():
        d = rel.RelatingPropertyDefinition
        if d.is_a("IfcElementQuantity"):
            return {"_name": d.Name, **{q.Name: q[3] for q in d.Quantities}}
    return {}


def test_die_spur_zurueck_ins_journal(tmp_path):
    """Kennung, Rezept, Vorgang, Wirt — und seit Paket v2 KEIN `ErsetztGlobalId` mehr."""
    ziel = tmp_path / "spur.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="spur")
    f = ifcopenshell.open(ziel)
    werte = _pset(f.by_type("IfcEarthworksCut")[0], PSET_CDE)
    assert werte["CdeId"] == "cde-aushub"
    assert werte["Rezept"] == "erdbau"
    assert werte["Vorgang"] == "Test · Gelände formen"
    assert werte["Wirt"] == guids.guid_aus_cde_id("cde-gelaende")
    assert not any(e.Name == "ErsetztGlobalId" for e in f.by_type("IfcPropertySingleValue"))


# ── 2. Der Befund des ersten Laufs bleibt gefunden ──────────────────────────

def test_aushub_im_selben_paket_bekommt_seinen_wirt(tmp_path):
    ziel = tmp_path / "wirt.ifc"
    baue_datei(_paket(_alle_arten(wirt="cde-gelaende")), ziel, schluessel="wirt")
    f = ifcopenshell.open(ziel)
    aushub = f.by_type("IfcEarthworksCut")[0]
    assert len(aushub.VoidsElements) == 1
    assert aushub.VoidsElements[0].RelatingBuildingElement.is_a("IfcGeographicElement")


def test_aushub_ohne_wirt_ist_schemawidrig(tmp_path):
    """DER erste Befund des Prueftors — er darf nicht still verschwinden.

    `IfcFeatureElementSubtraction.VoidsElements` ist Pflicht. Liegt der Wirt in
    einer gelieferten Datei, fehlt er in der Eigenbau-Datei allein — und genau
    dort muss die Schema-Pruefung rot sein. Das ist der Grund fuer
    `wirte_herstellen`.
    """
    ziel = tmp_path / "ohne_wirt.ifc"
    bericht = baue_datei(_paket(_alle_arten(wirt="1OaU$rmOTF_8XVO$FIs70b")), ziel, schluessel="ohne")
    assert bericht["wirte_offen"] == 1
    assert any("wirte_herstellen" in w for w in bericht["warnungen"])
    ergebnis = pruefe(ziel)
    assert _regel(ergebnis, "SPF")["ok"] is False
    assert "VoidsElements" in _regel(ergebnis, "SPF")["sagt"]


def test_aushub_haengt_nicht_in_der_raumgliederung(tmp_path):
    """Der ZWEITE Befund des Prueftors: `IfcFeatureElement.NotContained`.

    Mit geschlossenem Wirt war der Aushub noch immer rot — weil er zusaetzlich
    in `IfcRelContainedInSpatialStructure` stand. Ein Aushub haengt ueber seinen
    Wirt in der Gliederung, nicht selbst.
    """
    ziel = tmp_path / "gliederung.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="gliederung")
    f = ifcopenshell.open(ziel)
    assert not f.by_type("IfcEarthworksCut")[0].ContainedInStructure
    for klasse in ("IfcEarthworksFill", "IfcGeographicElement", "IfcPipeSegment",
                   "IfcDistributionChamberElement", "IfcAnnotation"):
        assert f.by_type(klasse)[0].ContainedInStructure, klasse
    assert _regel(pruefe(ziel), "SPF")["ok"] is True


# ── 3. Im Verbund mit einer gelieferten Datei ───────────────────────────────

def _gelieferte_gelaendedatei(pfad: Path) -> str:
    """Eine Lieferung eines Beteiligten: ein Gelaende, sonst nichts.

    Gebaut mit dem Geruest der Verbund-Sitzung (anderer Schluessel, andere
    GlobalIds) und einer GEWUERFELTEN GlobalId fuer das Gelaende — so, wie ein
    fremdes Programm sie vergibt.
    """
    g = V.zielgeruest("Gelaendelieferung", crs="EPSG:25832", schluessel="lieferung-gelaende",
                      bearbeiter="Planer")
    f = g["datei"]
    punkte, dreiecke = _gitter(12, 5.0)
    koord = f.create_entity("IfcCartesianPointList3D", CoordList=[tuple(p) for p in punkte])
    flaeche = f.create_entity("IfcTriangulatedFaceSet", Coordinates=koord, Closed=False,
                              CoordIndex=[(a + 1, b + 1, c + 1) for a, b, c in dreiecke])
    darstellung = f.create_entity("IfcShapeRepresentation", ContextOfItems=g["koerper"],
                                  RepresentationIdentifier="Body", RepresentationType="Tessellation",
                                  Items=[flaeche])
    platz = f.create_entity("IfcLocalPlacement", PlacementRelTo=g["site"].ObjectPlacement,
                            RelativePlacement=f.create_entity(
                                "IfcAxis2Placement3D",
                                Location=f.create_entity("IfcCartesianPoint", Coordinates=(OST, NORD, HOEHE))))
    guid = ifcopenshell.guid.new()
    while guid[0] not in "0123":            # `new()` ist formgerecht, aber sicher ist sicher
        guid = ifcopenshell.guid.new()
    gelaende = f.create_entity("IfcGeographicElement", GlobalId=guid, OwnerHistory=g["besitz"],
                               Name="Urgelaende", PredefinedType="TERRAIN", ObjectPlacement=platz,
                               Representation=f.create_entity("IfcProductDefinitionShape",
                                                              Representations=[darstellung]))
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=g["besitz"], RelatingStructure=g["site"], RelatedElements=[gelaende])
    f.write(str(pfad))
    return guid


@pytest.fixture
def verbund_mit_aushub(tmp_path):
    """Gelieferte Gelaendedatei + Eigenbau, dessen Aushub dieses Gelaende aushoehlt."""
    geliefert = tmp_path / "gelaende.ifc"
    wirt = _gelieferte_gelaendedatei(geliefert)
    eigen = tmp_path / "eigenbau.ifc"
    baue_datei(_paket(_alle_arten(wirt=wirt)), eigen, schluessel="verbundtest")
    ziel = tmp_path / "verbund.ifc"
    bericht = V.fuehre_zusammen(
        [V.Quelle(geliefert, name="Gelaendelieferung", sha256="d" * 64),
         V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
        ziel, projektname="Verbund mit Eigenbau", bearbeiter="pytest")
    return ziel, bericht, wirt


def test_ohne_wirte_herstellen_bleibt_der_verbund_rot(verbund_mit_aushub):
    """Der Beweis, dass der zweite Haken im Verbundlauf noetig ist."""
    ziel, _bericht, _wirt = verbund_mit_aushub
    assert _regel(pruefe(ziel), "SPF")["ok"] is False


def test_mit_wirte_herstellen_ist_der_verbund_sauber(verbund_mit_aushub):
    """Gelieferte Datei + Eigenbau + Wirt geschlossen = null Verstoesse."""
    ziel, bericht, wirt = verbund_mit_aushub
    assert bericht["bauteile"] == 7                 # 1 geliefert + 6 Eigenbau
    ergebnis_wirte = wirte_herstellen(ziel)
    assert ergebnis_wirte["geschlossen"] == 1
    assert ergebnis_wirte["offen"] == []
    f = ifcopenshell.open(ziel)
    aushub = f.by_type("IfcEarthworksCut")[0]
    assert aushub.VoidsElements[0].RelatingBuildingElement.GlobalId == wirt
    _sauber(pruefe(ziel))


def test_wirte_herstellen_ist_wiederholbar(verbund_mit_aushub):
    """Zweimal gerufen: keine zweite Beziehung, keine doppelte GlobalId."""
    ziel, _b, _w = verbund_mit_aushub
    wirte_herstellen(ziel)
    zweiter = wirte_herstellen(ziel)
    assert zweiter["geschlossen"] == 0 and zweiter["schon_da"] == 1
    _sauber(pruefe(ziel))


def test_eigenbau_behaelt_seine_herkunft_im_verbund(verbund_mit_aushub):
    ziel, _b, _w = verbund_mit_aushub
    wirte_herstellen(ziel)
    f = ifcopenshell.open(ziel)
    gruppen = {g.Name for g in f.by_type("IfcGroup") if g.ObjectType == "Fachmodell"}
    assert "CDE-Eigenbau" in gruppen
    assert any(p.Name == PSET_CDE for p in f.by_type("IfcPropertySet"))


# ── Der zweite Motor ────────────────────────────────────────────────────────

def test_web_ifc_liest_die_eigenbau_datei(tmp_path):
    """Derselbe Parser, mit dem die CDE im Browser liest — ein Eigenbau, den er
    nicht oeffnet, waere fuer die eigene Ansicht wertlos.

    Ueber `probe.zweiter_motor`, den Weg des Verbundlaufs (V09), nicht ueber
    einen eigenen node-Aufruf: nur dieser Weg kennt die Umgebung, die node als
    Enkel von pm2 braucht (ohne NODE_CHANNEL_*, sonst SIGABRT beim Beenden).
    Zwei Wege zu derselben Frage waeren wieder auseinandergelaufen.
    """
    ziel = tmp_path / "eigenbau.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="webifc")
    befund = zweiter_motor(ziel, tmp_path / "webifc.json")
    if befund["ok"] is None:                        # node oder Skript fehlt: ungeprueft, nicht bestanden
        pytest.skip(befund["sagt"])
    assert befund["ok"] is True, befund["sagt"]
    assert "EINIG" in befund["sagt"]


def test_der_im_speicher_haken_fuer_den_verbundlauf(tmp_path):
    """`wirte_herstellen_in(datei)` — die Form, die `fuehre_zusammen(nachbearbeiten=...)` ruft."""
    geliefert = tmp_path / "gelaende.ifc"
    wirt = _gelieferte_gelaendedatei(geliefert)
    eigen = tmp_path / "eigenbau.ifc"
    baue_datei(_paket(_alle_arten(wirt=wirt)), eigen, schluessel="imspeicher")
    ziel = tmp_path / "verbund.ifc"
    V.fuehre_zusammen([V.Quelle(geliefert, sha256="d" * 64), V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
                      ziel, projektname="Haken")
    datei = ifcopenshell.open(ziel)
    bericht = wirte_herstellen_in(datei)
    assert bericht == {"geschlossen": 1, "offen": [], "schon_da": 0, "fehlende_wirte": [], "ohne_wirtangabe": []}
    # Nichts geschrieben — das tut der Verbundlauf selbst.
    assert not ifcopenshell.open(ziel).by_type("IfcEarthworksCut")[0].VoidsElements


def test_ein_fehlender_wirt_bleibt_offen_und_wird_genannt(tmp_path):
    eigen = tmp_path / "eigenbau.ifc"
    baue_datei(_paket(_alle_arten(wirt="3xFehlt0000000000000000")), eigen, schluessel="fehlt")
    bericht = wirte_herstellen_in(ifcopenshell.open(eigen))
    assert bericht["geschlossen"] == 0
    assert bericht["offen"] == [guids.guid_aus_cde_id("cde-aushub")]
    # … und WAS fehlt: das Gelaende, das in den Satz gehoert.
    assert bericht["fehlende_wirte"] == ["3xFehlt0000000000000000"]


def test_v07_kennt_den_aushub_ueber_seinen_wirt(verbund_mit_aushub):
    """V07 zaehlt den Aushub ueber seinen Wirt (bis 2026-09-10 ein strict-xfail)."""
    ziel, _b, _w = verbund_mit_aushub
    wirte_herstellen(ziel)
    assert _regel(pruefe(ziel), "V07")["ok"] is True


# ── 4. Paket v2 (Stufe 2 des Aushub-Fachmodells) ────────────────────────────

def test_ein_v1_paket_wird_laut_abgelehnt(tmp_path):
    """v1 trug die geformte Kopie des Gelaendes als Bauteil — still angenommen,
    stuende wieder ein zweites TERRAIN in der Datei."""
    with pytest.raises(PaketFehler, match="erwartet 2"):
        baue_datei({**_paket(_alle_arten()), "version": 1}, tmp_path / "v1.ifc")


def test_mengen_stehen_als_qto_nach_der_bsi_vorlage(tmp_path):
    """Die Zahl aus dem Paket — also aus dem Mengenreiter — steht als Qto im IFC."""
    ziel = tmp_path / "qto.ifc"
    bericht = baue_datei(_paket(_alle_arten()), ziel, schluessel="qto")
    assert bericht["mengen"] == 2
    f = ifcopenshell.open(ziel)
    qtos = f.by_type("IfcElementQuantity")
    assert len(qtos) == 2                           # Cut + Fill; Rohr, Schacht, Linie tragen keine
    cut = _qto(f.by_type("IfcEarthworksCut")[0])
    assert cut["_name"] == "Qto_EarthworksCutBaseQuantities"
    assert cut["UndisturbedVolume"] == pytest.approx(240.0, abs=1e-3)
    fill = _qto(f.by_type("IfcEarthworksFill")[0])
    assert fill["_name"] == "Qto_EarthworksFillBaseQuantities"
    assert fill["CompactedVolume"] == pytest.approx(144.0, abs=1e-3)
    assert all("raster" in q.MethodOfMeasurement.lower() for q in qtos)     # WIE gemessen wurde, steht dabei
    _sauber(pruefe(ziel))


def test_eine_menge_ausserhalb_der_vorlage_wird_gemeldet_nicht_geschrieben(tmp_path):
    """Ein Qto-Satz mit erfundenen Mengen waere so unkonform wie ein erfundener PredefinedType."""
    teile = _alle_arten()
    teile[0]["mengen"] = {"undisturbedVolume": 240.0, "compactedVolume": 5.0, "quatschVolumen": 1.0}
    ziel = tmp_path / "quatsch.ifc"
    bericht = baue_datei(_paket(teile), ziel, schluessel="quatsch")
    assert any("CompactedVolume steht nicht in Qto_EarthworksCutBaseQuantities" in w for w in bericht["warnungen"])
    assert any("QuatschVolumen" in w for w in bericht["warnungen"])
    assert set(_qto(ifcopenshell.open(ziel).by_type("IfcEarthworksCut")[0])) == {"_name", "UndisturbedVolume"}


def test_ein_vorgang_ist_eine_gruppe_mit_cut_und_fill(tmp_path):
    """Fabios Entscheidung 2: ein Cut je Vorgang — und was zum Vorgang gehoert, haelt eine Gruppe zusammen."""
    ziel = tmp_path / "vorgang.ifc"
    bericht = baue_datei(_paket(_alle_arten()), ziel, schluessel="vorgang")
    assert bericht["vorgaenge"] == 1
    f = ifcopenshell.open(ziel)
    [gruppe] = [g for g in f.by_type("IfcGroup") if g.ObjectType == "Vorgang"]
    assert gruppe.Name == "Test · Gelände formen"
    glieder = {o.GlobalId for rel in gruppe.IsGroupedBy for o in rel.RelatedObjects}
    assert glieder == {guids.guid_aus_cde_id("cde-aushub"), guids.guid_aus_cde_id("cde-auftrag")}
    w = _pset(gruppe, PSET_VORGANG)
    assert (w["Ableitung"], w["Art"], w["Reihenfolge"]) == ("ab-1", "erdbau", 1)


def test_erdbau_und_eigenbau_sind_zwei_fachmodelle(tmp_path):
    """Ein Empfaenger findet den Aushub, ohne Rezeptnamen der CDE zu kennen."""
    ziel = tmp_path / "fm.ifc"
    bericht = baue_datei(_paket(_alle_arten()), ziel, schluessel="fm")
    assert bericht["fachmodelle"] == {"Erdbau": 2, "CDE-Eigenbau": 4}
    f = ifcopenshell.open(ziel)
    fm = {g.Name: {o.GlobalId for rel in g.IsGroupedBy for o in rel.RelatedObjects}
          for g in f.by_type("IfcGroup") if g.ObjectType == "Fachmodell"}
    assert fm["Erdbau"] == {guids.guid_aus_cde_id("cde-aushub"), guids.guid_aus_cde_id("cde-auftrag")}
    assert _regel(pruefe(ziel), "V08")["ok"] is True


def test_ein_aushub_durch_einen_auftrag_sagt_es_am_merkmal_und_der_wirt_bleibt(tmp_path):
    """Fabios Entscheidung 3: Wirt immer das Ur-Gelaende, die Auffuellung nur Merkmal und Kennzahl."""
    teile = _alle_arten()
    zweiter = {"ableitung": "ab-2", "art": "erdbau", "reihe": 1, "titel": "Test · Gerinne"}
    teile.append(_bauteil("cde-aushub-2", "IFCEARTHWORKSCUT", _kasten(4, 4, 3), predefinedType="TRENCH",
                          geschlossen=True, rolle="aushub", rezept="erdbau", wirt="cde-gelaende",
                          fachmodell="erdbau", vorgang=zweiter, mengen={"undisturbedVolume": 48.0},
                          schneidetAuffuellung=["cde-auftrag"], aushubAusAuffuellung=3.5))
    ziel = tmp_path / "auff.ifc"
    bericht = baue_datei(_paket(teile), ziel, schluessel="auff")
    assert bericht["vorgaenge"] == 2
    f = ifcopenshell.open(ziel)
    zwei = f.by_guid(guids.guid_aus_cde_id("cde-aushub-2"))
    w = _pset(zwei, PSET_CDE)
    assert w["SchneidetAuffuellung"] == guids.guid_aus_cde_id("cde-auftrag")
    assert w["AushubAusAuffuellung"] == pytest.approx(3.5)
    wert = next(e for e in f.by_type("IfcPropertySingleValue") if e.Name == "AushubAusAuffuellung")
    assert wert.NominalValue.is_a("IfcVolumeMeasure")          # ein Messwert mit Einheit, kein Text
    assert zwei.VoidsElements[0].RelatingBuildingElement.is_a("IfcGeographicElement")
    _sauber(pruefe(ziel))


def test_eine_gelieferte_oeffnung_bleibt_unberuehrt(tmp_path):
    """Nur EIGENE Aushuebe (mit CdeId): eine gelieferte Oeffnung ohne Wirt ist der Befund ihrer Lieferung."""
    ziel = tmp_path / "oeffnung.ifc"
    baue_datei(_paket(_alle_arten()), ziel, schluessel="oeffnung")
    datei = ifcopenshell.open(ziel)
    fremd = datei.create_entity("IfcOpeningElement", GlobalId=ifcopenshell.guid.new(), Name="geliefert")
    bericht = wirte_herstellen_in(datei)
    assert bericht["offen"] == [] and bericht["ohne_wirtangabe"] == [] and bericht["schon_da"] == 1
    assert not fremd.VoidsElements


def test_ein_aushub_ohne_wirtangabe_wird_genannt(tmp_path):
    """Dort fehlt nicht ein Gelaende im Satz, sondern die Angabe im Journal — das ist ein anderer Satz."""
    ziel = tmp_path / "ohne_angabe.ifc"
    bericht = baue_datei(_paket(_alle_arten(wirt=None)), ziel, schluessel="ohne-angabe")
    assert bericht["wirte_offen"] == 1
    w = wirte_herstellen_in(ifcopenshell.open(ziel))
    assert w["ohne_wirtangabe"] == ["cde-aushub"] and w["fehlende_wirte"] == []


ROHR_GUID = "2Rohr0Haltung000000001"


def _gelieferte_datei(pfad: Path, klasse: str, guid: str, geo, name: str, predefined: str) -> str:
    """Eine Lieferung mit EINEM Bauteil bekannter GlobalId — so, wie das Paket es nennt."""
    g = V.zielgeruest(f"Lieferung {name}", crs="EPSG:25832", schluessel=f"lieferung-{name}", bearbeiter="Planer")
    f = g["datei"]
    punkte, dreiecke = geo
    koord = f.create_entity("IfcCartesianPointList3D", CoordList=[tuple(map(float, p)) for p in punkte])
    flaeche = f.create_entity("IfcTriangulatedFaceSet", Coordinates=koord,
                              CoordIndex=[(a + 1, b + 1, c + 1) for a, b, c in dreiecke])
    darstellung = f.create_entity("IfcShapeRepresentation", ContextOfItems=g["koerper"],
                                  RepresentationIdentifier="Body", RepresentationType="Tessellation",
                                  Items=[flaeche])
    platz = f.create_entity("IfcLocalPlacement", PlacementRelTo=g["site"].ObjectPlacement,
                            RelativePlacement=f.create_entity(
                                "IfcAxis2Placement3D",
                                Location=f.create_entity("IfcCartesianPoint", Coordinates=(OST, NORD, HOEHE))))
    el = f.create_entity(klasse, GlobalId=guid, OwnerHistory=g["besitz"], Name=name, PredefinedType=predefined,
                         ObjectPlacement=platz,
                         Representation=f.create_entity("IfcProductDefinitionShape", Representations=[darstellung]))
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=g["besitz"], RelatingStructure=g["site"], RelatedElements=[el])
    f.write(str(pfad))
    return guid


def _kanalgraben(wirt, rohr=ROHR_GUID):
    v = {"ableitung": "ab-kg", "art": "kanalgraben", "reihe": 0, "titel": "H-001 · Kanalgraben"}
    q = {"gelaende": wirt, "rohre": [rohr], "schaechte": [], "bauteil": None}
    return [
        _bauteil("cde-graben", "IFCEARTHWORKSCUT", _kasten(30, 1.1, 3), predefinedType="TRENCH", geschlossen=True,
                 rolle="graben", rezept="kanalgraben", wirt=wirt, fachmodell="erdbau", vorgang=v, quellen=q,
                 mengen={"undisturbedVolume": 99.0, "length": 30.0}),
        _bauteil("cde-verfuellung", "IFCEARTHWORKSFILL", _kasten(30, 1.1, 2.5), predefinedType="BACKFILL",
                 geschlossen=True, rolle="verfuellung", rezept="kanalgraben", fachmodell="erdbau", vorgang=v,
                 quellen=q, mengen={"compactedVolume": 80.0}),
    ]


def test_im_verbund_holt_der_vorgang_seine_haltung(tmp_path):
    """Die Gruppe „H-001 · Kanalgraben" enthaelt im Verbund Graben, Verfuellung UND die gelieferte Haltung."""
    gelaende = tmp_path / "gelaende.ifc"
    wirt = _gelieferte_gelaendedatei(gelaende)
    rohr = tmp_path / "rohr.ifc"
    _gelieferte_datei(rohr, "IfcPipeSegment", ROHR_GUID, _kasten(30, 0.3, 0.3), "H-001", "RIGIDSEGMENT")
    eigen = tmp_path / "eigenbau.ifc"
    baue_datei(_paket(_kanalgraben(wirt)), eigen, schluessel="kg")
    ziel = tmp_path / "verbund.ifc"
    bericht = V.fuehre_zusammen(
        [V.Quelle(gelaende, sha256="d" * 64), V.Quelle(rohr, sha256="c" * 64),
         V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
        ziel, projektname="Vorgang",
        nachbearbeiten=[("wirte", wirte_herstellen_in), ("vorgaenge", vorgaenge_schliessen_in)])
    assert bericht["nachbearbeitung"]["vorgaenge"] == {"vorgaenge": 1, "mit_quellen": 1, "ergaenzt": 1, "fehlend": []}
    f = ifcopenshell.open(ziel)
    [gruppe] = [g for g in f.by_type("IfcGroup") if g.ObjectType == "Vorgang"]
    glieder = {o.GlobalId for rel in gruppe.IsGroupedBy for o in rel.RelatedObjects}
    assert glieder == {guids.guid_aus_cde_id("cde-graben"), guids.guid_aus_cde_id("cde-verfuellung"), ROHR_GUID}
    assert wirt not in glieder                      # das Gelaende ist der WIRT, kein Glied
    assert _qto(f.by_guid(guids.guid_aus_cde_id("cde-graben")))["Length"] == pytest.approx(30.0)
    _sauber(pruefe(ziel))
    assert vorgaenge_schliessen_in(ifcopenshell.open(ziel))["ergaenzt"] == 0     # wiederholbar


# ── 5. Der Vertrag mit dem Browser ──────────────────────────────────────────

FIXTURE = Path(__file__).parent / "daten" / "paket_v2.json"
VERTRAG = {"ur": "1Ur0Gelaende0Vertrag00", "rohr": ROHR_GUID, "bauteil": "3Fundament0A0000000001"}


def _welt(datei, guid):
    """Die Punkte eines Bauteils in Weltkoordinaten — Platzierungskette mal Koordinatenliste (G6)."""
    import numpy as np
    import ifcopenshell.util.placement as PL
    el = datei.by_guid(guid)
    punkte = np.array(el.Representation.Representations[0].Items[0].Coordinates.CoordList, dtype=float)
    return (np.c_[punkte, np.ones(len(punkte))] @ PL.get_local_placement(el.ObjectPlacement).T)[:, :3]


def _fingerabdruck(pfad):
    """sha256 und Aenderungszeit einer Datei — was ein Verbund an seinen Quellen nie aendern darf (G1)."""
    import hashlib
    return hashlib.sha256(pfad.read_bytes()).hexdigest(), pfad.stat().st_mtime_ns


@pytest.mark.skipif(not FIXTURE.is_file(), reason="Fixture fehlt — im Client: PAKET_VERTRAG_SCHREIBEN=1 "
                    "npx vitest run src/features/cde/test/paketVertrag.test.js")
def test_das_paket_der_echten_kette_besteht_mit_seinen_lieferungen(tmp_path):
    """DAS Paket, das der Browser baut (Katalog -> Journal -> Lauf -> Autor -> Paket) — kein nachgebautes.

    Die Pakete der Tests oben baut dieser Test selbst; genau so schrieb 2026
    ein DXF-Export monatelang NaN, waehrend drei Tests gruen waren. Die Fixture
    legt `paketVertrag.test.js` im Client ab und prueft bei jedem Lauf, dass
    sie die Form des frischen Pakets hat. Szenario wie die Abnahme der Stufe 1:
    Ur-Gelaende + Gerinne + Kanalgraben + Bauwerksgrube.
    """
    paket = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert paket["version"] == PAKET_VERSION
    cuts = [b for b in paket["bauteile"] if b["klasse"] == "IFCEARTHWORKSCUT"]
    assert len(cuts) == 3 and all(b["wirt"] == VERTRAG["ur"] for b in cuts)
    assert not any(b["klasse"] == "IFCGEOGRAPHICELEMENT" for b in paket["bauteile"])

    eigen = tmp_path / "eigenbau.ifc"
    bericht = baue_datei(paket, eigen, schluessel="vertrag")
    # Vier Vorgaenge (Teil XX: jede Werkzeug-Anwendung ein eigener Vorgang) —
    # Gerinne, Auffuellen, Kanalgraben, Bauwerksgrube; die Fuellung hing bis
    # dahin am Gerinne.
    assert bericht["uebersprungen"] == [] and bericht["vorgaenge"] == 4
    assert bericht["mengen"] == sum(1 for b in paket["bauteile"] if b.get("mengen"))

    gelaende = tmp_path / "gelaende.ifc"
    _gelieferte_datei(gelaende, "IfcGeographicElement", VERTRAG["ur"], _gitter(12, 5.0), "Urgelaende", "TERRAIN")
    rohr = tmp_path / "rohr.ifc"
    _gelieferte_datei(rohr, "IfcPipeSegment", VERTRAG["rohr"], _kasten(30, 0.3, 0.3), "H-001", "RIGIDSEGMENT")
    # Stufe 7 (Fahrplan Erdbau-Container): G1 — die Quellen vorher; G6 — das Ur in Weltkoordinaten vorher.
    quellen_vorher = {p.name: _fingerabdruck(p) for p in (gelaende, rohr, eigen)}
    ur_vorher = _welt(ifcopenshell.open(gelaende), VERTRAG["ur"])
    ziel = tmp_path / "verbund.ifc"
    b = V.fuehre_zusammen(
        [V.Quelle(gelaende, name="Urgelaende.ifc", sha256="d" * 64), V.Quelle(rohr, name="Kanal.ifc", sha256="c" * 64),
         V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
        ziel, projektname="Vertrag",
        nachbearbeiten=[("wirte", wirte_herstellen_in), ("vorgaenge", vorgaenge_schliessen_in)])
    assert {p.name: _fingerabdruck(p) for p in (gelaende, rohr, eigen)} == quellen_vorher   # G1: Quellen unveraendert
    w = b["nachbearbeitung"]["wirte"]
    assert (w["geschlossen"], w["fehlende_wirte"], w["ohne_wirtangabe"]) == (3, [], [])
    v = b["nachbearbeitung"]["vorgaenge"]
    assert v["ergaenzt"] == 1 and v["fehlend"] == [VERTRAG["bauteil"]]     # das Fundament liegt nicht im Satz
    assert (v["vorgaenge"], v["mit_quellen"]) == (4, 2)           # Gerinne und Auffuellen nennen keine Lieferung

    f = ifcopenshell.open(ziel)
    assert len(f.by_type("IfcGeographicElement")) == 1          # TERRAIN = 1 (mit Paket v1: zwei)
    ur_nachher = _welt(f, VERTRAG["ur"])                         # G6: dieselben Punkte, dieselbe Lage
    assert ur_vorher.shape == ur_nachher.shape and float(abs(ur_vorher - ur_nachher).max()) < 1e-6
    assert len(f.by_type("IfcEarthworksCut")) == 3
    for c in cuts:
        el = f.by_guid(guids.guid_aus_cde_id(c["cdeId"]))
        assert _qto(el)["UndisturbedVolume"] == pytest.approx(c["mengen"]["undisturbedVolume"], abs=1e-3)
    # Die Fuellung: verdichtet eingebaut, mit Menge — und der Graben, der durch
    # sie schneidet, sagt es am Merkmal; sein Wirt bleibt das Ur (Entscheidung 3).
    fills = [b for b in paket["bauteile"] if b["klasse"] == "IFCEARTHWORKSFILL"]
    assert fills and len(f.by_type("IfcEarthworksFill")) == len(fills)
    for b in fills:
        el = f.by_guid(guids.guid_aus_cde_id(b["cdeId"]))
        assert _qto(el)["CompactedVolume"] == pytest.approx(b["mengen"]["compactedVolume"], abs=1e-3)
    graben = next(c for c in cuts if c["vorgang"]["art"] == "kanalgraben")
    el = f.by_guid(guids.guid_aus_cde_id(graben["cdeId"]))
    assert guids.guid_aus_cde_id(fills[0]["cdeId"]) in _pset(el, PSET_CDE)["SchneidetAuffuellung"]
    assert el.VoidsElements[0].RelatingBuildingElement.GlobalId == VERTRAG["ur"]
    # Stufe 3 (Erdbau-Container): je Quelle EIN Dokument. Das Ur-Gelaende nennen der
    # Eigenbau (mit Revision) UND der Verbund an der Gruppe der Lieferung (ohne) —
    # verschmolzen bleibt eins, und es kennt die Revision.
    infos = {i.Identification: i for i in f.by_type("IfcDocumentInformation")}
    assert sorted(infos) == ["c" * 64, "d" * 64, "e" * 64]
    assert (infos["d" * 64].Name, infos["d" * 64].Revision) == ("Urgelaende.ifc", "1")
    assert len(f.by_type("IfcDocumentReference")) == 3
    am_ur = {o.GlobalId for r in f.by_type("IfcRelAssociatesDocument")
             if r.RelatingDocument.ReferencedDocument == infos["d" * 64] for o in r.RelatedObjects}
    assert {guids.guid_aus_cde_id(c["cdeId"]) for c in cuts} <= am_ur
    # Stufe 4: die Regeln des abgeleiteten Containers — jede trifft alle Elemente der CDE, keine verfehlt.
    urteil = {b["titel"].split(" (")[0]: b for b in ids_pruefen(f, [REPO / "backend/app/ifc/daten/quagg-starter.ids"])}
    for titel, n in (("Aushub der CDE — Herkunft lesbar", len(cuts)),
                     ("Aushub der CDE — PredefinedType bestimmt", len(cuts)),
                     ("Auftrag der CDE — Herkunft lesbar", len(fills)),
                     ("Auftrag der CDE — PredefinedType bestimmt", len(fills))):
        assert (urteil[titel]["ok"], urteil[titel]["teile"]) == (True, {"anwendbar": n, "erfuellt": n}), \
            (titel, urteil[titel]["sagt"])
    _sauber(pruefe(ziel))


# ── Die Herkunft am Element (Fahrplan Erdbau-Container, Stufe 3) ────────────

@pytest.mark.skipif(not FIXTURE.is_file(), reason="Fixture fehlt — siehe test_das_paket_der_echten_kette")
def test_jedes_erzeugte_element_traegt_quagg_herkunft(tmp_path):
    """Quelle, Revision, sha256, Journalstand, Werkzeug, Eingabe-Hash — am Element, wo ein fremdes Werkzeug liest."""
    paket = json.loads(FIXTURE.read_text(encoding="utf-8"))
    doc = paket["quellDokumente"][0]
    baue_datei(paket, tmp_path / "a.ifc", schluessel="herkunft")
    f = ifcopenshell.open(tmp_path / "a.ifc")
    werte = {b["cdeId"]: _pset(f.by_guid(guids.guid_aus_cde_id(b["cdeId"])), H.PSET_HERKUNFT)
             for b in paket["bauteile"]}
    for b in paket["bauteile"]:
        w = werte[b["cdeId"]]
        assert (w["QuellDokument"], w["QuellRevision"], w["QuellSHA256"]) == \
            (doc["datei"], str(doc["revision"]), doc["sha256"])
        assert (w["Journalstand"], w["Erzeugt"], w["Werkzeug"]) == ("c-vertrag", paket["erzeugt"], H.werkzeug())
        assert w["EingabeHash"] == H.eingabe_hash(b)
        assert json.loads(w["QuellGlobalIds"])["gelaende"] == VERTRAG["ur"]
    assert len({w["EingabeHash"] for w in werte.values()}) == len(werte)
    # Derselbe Stand -> dieselben Hashes; ein Punkt anders -> genau dieser Hash anders.
    paket["bauteile"][0]["punkte"][0][2] += 0.01
    baue_datei(paket, tmp_path / "b.ifc", schluessel="herkunft")
    g = ifcopenshell.open(tmp_path / "b.ifc")
    anders = [b["cdeId"] for b in paket["bauteile"]
              if _pset(g.by_guid(guids.guid_aus_cde_id(b["cdeId"])), H.PSET_HERKUNFT)["EingabeHash"]
              != werte[b["cdeId"]]["EingabeHash"]]
    assert anders == [paket["bauteile"][0]["cdeId"]]


@pytest.mark.skipif(not FIXTURE.is_file(), reason="Fixture fehlt — siehe test_das_paket_der_echten_kette")
def test_dokumentverweis_je_quellcontainer(tmp_path):
    """Je Registerdatei EIN IfcDocumentInformation — die Referenz an der Gruppe UND an jedem Element daraus."""
    paket = json.loads(FIXTURE.read_text(encoding="utf-8"))
    paket["quellDokumente"] = paket["quellDokumente"] * 2            # zweimal genannt, einmal geschrieben
    doc = paket["quellDokumente"][0]
    bericht = baue_datei(paket, tmp_path / "e.ifc", schluessel="dok", ablage="01_Laufend/42069_BlazeIT/CDE")
    f = ifcopenshell.open(tmp_path / "e.ifc")
    assert bericht["dokumente"] == 1
    (info,) = f.by_type("IfcDocumentInformation")
    assert (info.Identification, info.Name, info.Revision) == (doc["sha256"], doc["datei"], str(doc["revision"]))
    assert info.Location == f"01_Laufend/42069_BlazeIT/CDE/{doc['datei']}"
    (ref,) = f.by_type("IfcDocumentReference")
    assert ref.ReferencedDocument == info and ref.Name is None        # IfcDocumentReference.WR1
    (rel,) = f.by_type("IfcRelAssociatesDocument")
    assert {guids.guid_aus_cde_id(b["cdeId"]) for b in paket["bauteile"]} <= {o.GlobalId for o in rel.RelatedObjects}
    assert [o.Name for o in rel.RelatedObjects if o.is_a("IfcGroup")] == ["Erdbau"]


def test_die_herkunft_sagt_nie_mehr_als_sie_weiss(tmp_path):
    """Stufe 4: nur aus der CDE -> Quelle „CDE-Journal", Revision = Journalstand. Aus einer Lieferung ohne
    Registerdatei -> KEINE Quelle (die IDS-Regel `spec-*-herkunft` meldet es), statt einer erfundenen."""
    eigen = tmp_path / "cde.ifc"
    baue_datei(_paket(_alle_arten(), journal={"commit": "c-7", "sitzungOffen": True}), eigen, schluessel="journal")
    w = _pset(ifcopenshell.open(eigen).by_type("IfcEarthworksCut")[0], H.PSET_HERKUNFT)
    assert (w["QuellDokument"], w["QuellRevision"], w["Journalstand"]) == \
        (H.QUELLE_JOURNAL, "c-7+Sitzung", "c-7+Sitzung")
    assert "QuellSHA256" not in w
    fremd = tmp_path / "fremd.ifc"
    baue_datei(_paket(_alle_arten(wirt="1OaU$rmOTF_8XVO$FIs70b")), fremd, schluessel="fremd")
    w = _pset(ifcopenshell.open(fremd).by_type("IfcEarthworksCut")[0], H.PSET_HERKUNFT)
    assert not {"QuellDokument", "QuellRevision"} & set(w) and w["EingabeHash"]


# ── Das Vergleichsmodell der Bauwerksstruktur (Fahrplan Erdbau-Container, Stufe 8) ──

ERDBAU_VERGLEICH = Path(__file__).parent / "daten" / "erdbau_vergleich.ifc"


def baue_erdbau_vergleich(ziel: Path, arbeit: Path) -> dict:
    """Der Erdbau-Verbund, an dem der Client seine Bauwerksstruktur misst.

    paket_v2.json (die Kette des Browsers) + gelieferte Gelaende- und Rohrdatei,
    Wirte und Vorgaenge geschlossen: 3 Aushuebe mit IfcRelVoidsElement am Ur,
    1 Auftrag, 4 Vorgaenge. Eingecheckt wie ids_vergleich.ifc; gelesen von
    client/.../test/bauwerksstrukturAmEchtenModell.test.js. Neu schreiben:
        PYTHONPATH=. app/ifc/.venv-ifc/bin/python app/ifc/tests/test_eigenbau.py
    """
    paket = json.loads(FIXTURE.read_text(encoding="utf-8"))
    eigen = arbeit / "eigenbau.ifc"
    baue_datei(paket, eigen, schluessel="erdbau-vergleich")
    gelaende = arbeit / "gelaende.ifc"
    _gelieferte_datei(gelaende, "IfcGeographicElement", VERTRAG["ur"], _gitter(12, 5.0), "Urgelaende", "TERRAIN")
    rohr = arbeit / "rohr.ifc"
    _gelieferte_datei(rohr, "IfcPipeSegment", VERTRAG["rohr"], _kasten(30, 0.3, 0.3), "H-001", "RIGIDSEGMENT")
    return V.fuehre_zusammen(
        [V.Quelle(gelaende, name="Urgelaende.ifc", sha256="d" * 64), V.Quelle(rohr, name="Kanal.ifc", sha256="c" * 64),
         V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
        ziel, projektname="Erdbau-Vergleich", schluessel="erdbau-vergleich",
        nachbearbeiten=[("wirte", wirte_herstellen_in), ("vorgaenge", vorgaenge_schliessen_in)])


def _struktur(pfad):
    f = ifcopenshell.open(str(pfad))
    return {"voids": sorted((r.RelatingBuildingElement.GlobalId, r.RelatedOpeningElement.GlobalId)
                            for r in f.by_type("IfcRelVoidsElement")),
            "gruppen": sorted((g.Name, g.ObjectType, len({o.id() for r in g.IsGroupedBy for o in r.RelatedObjects}))
                              for g in f.by_type("IfcGroup"))}


@pytest.mark.skipif(not FIXTURE.is_file(), reason="Fixture fehlt — siehe test_das_paket_der_echten_kette")
def test_der_erdbau_vergleich_des_clients_ist_der_erzeugte(tmp_path):
    """Die eingecheckte Datei hat die Struktur eines frischen Laufs — der Client misst an keinem Einzelstueck."""
    assert ERDBAU_VERGLEICH.is_file(), "neu schreiben: PYTHONPATH=. app/ifc/.venv-ifc/bin/python app/ifc/tests/test_eigenbau.py"
    baue_erdbau_vergleich(tmp_path / "neu.ifc", tmp_path)
    frisch = _struktur(tmp_path / "neu.ifc")
    assert frisch == _struktur(ERDBAU_VERGLEICH)
    assert len(frisch["voids"]) == 3 and sum(1 for g in frisch["gruppen"] if g[1] == "Vorgang") == 4


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as t:
        b = baue_erdbau_vergleich(ERDBAU_VERGLEICH, Path(t))
    print(ERDBAU_VERGLEICH, b["produkte"], "Produkte,", len(_struktur(ERDBAU_VERGLEICH)["voids"]), "Aushuebe am Wirt")
