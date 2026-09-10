"""Was die CDE selbst erzeugt, muss durch DASSELBE Prueftor wie der Verbund.

Der Massstab ist nicht eine eigene Vorstellung von „konform", sondern
`pruefe.py` der Verbund-Sitzung: Schema, Where-Rules (bSI-Massstab) und die
Verbundregeln V01-V08. Eine Eigenbau-Datei, die nur hier gruen waere, haette
nichts bewiesen.

Drei Sorten Zusagen:
  1. Die Eigenbau-Datei selbst besteht das Tor — mit jeder Bauteilart, die
     die CDE erzeugt (Aushub, Auftrag, DGM, Rohr, Schacht, Linie).
  2. Die Befunde, die das Tor beim ersten Lauf fand, bleiben gefunden: ein
     Aushub OHNE Wirt ist schemawidrig, und genau das muss rot werden.
  3. Im Verbund mit einer GELIEFERTEN Datei — dort, wo der Wirt eines
     Aushubs wirklich liegt — schliesst `wirte_herstellen` die Luecke.

Laeuft mit DEM IFC-VENV:
    PYTHONPATH=backend backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_eigenbau.py -q
"""
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")

from app.ifc import guids                          # noqa: E402
from app.ifc import verbund as V                   # noqa: E402
from app.ifc.eigenbau import (                     # noqa: E402
    PSET_CDE, PaketFehler, baue_datei, wirte_herstellen, wirte_herstellen_in)
from app.ifc.probe import zweiter_motor            # noqa: E402
from app.ifc.pruefe import pruefe                  # noqa: E402

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
    return {"version": 1, "crs": "EPSG:25832", "projektname": "Eigenbau-Test",
            "erzeugt": "2026-09-10T00:00:00Z", "bauteile": bauteile, **extra}


def _alle_arten(wirt="cde-dgm"):
    """Jede Bauteilart, die die CDE heute erzeugt — mit den Werten, die das Journal traegt."""
    return [
        _bauteil("cde-aushub", "IFCEARTHWORKSCUT", _kasten(20, 4, 3), predefinedType="TRENCH",
                 farbe=0x8a7145, deckkraft=0.55, geschlossen=True, rolle="aushub", rezept="erdbau",
                 wirt=wirt),
        _bauteil("cde-auftrag", "IFCEARTHWORKSFILL", _kasten(12, 6, 2), predefinedType="EMBANKMENT",
                 farbe=0x79a06a, deckkraft=1.0, geschlossen=True, rolle="auftrag", rezept="erdbau"),
        _bauteil("cde-dgm", "IFCGEOGRAPHICELEMENT", _gitter(12, 5.0), predefinedType="TERRAIN",
                 farbe=0xa29a8c, deckkraft=1.0, geschlossen=False, rolle="dgm", rezept="erdbau"),
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
    return [(b["id"], str(b["sagt"])[:400]) for b in ergebnis["befunde"] if not b["ok"]]


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


def test_die_spur_zurueck_ins_journal(tmp_path):
    """Ohne sie weiss niemand, dass das geformte DGM das Ur-Gelaende vertritt."""
    teile = _alle_arten()
    teile[2]["ersetzt"] = ["1OaU$rmOTF_8XVO$FIs70b"]
    ziel = tmp_path / "spur.ifc"
    baue_datei(_paket(teile), ziel, schluessel="spur")
    f = ifcopenshell.open(ziel)
    dgm = f.by_type("IfcGeographicElement")[0]
    werte = {}
    for rel in dgm.IsDefinedBy:
        if rel.RelatingPropertyDefinition.Name == PSET_CDE:
            werte = {e.Name: e.NominalValue.wrappedValue for e in rel.RelatingPropertyDefinition.HasProperties}
    assert werte["CdeId"] == "cde-dgm"
    assert werte["Rezept"] == "erdbau"
    assert werte["ErsetztGlobalId"] == "1OaU$rmOTF_8XVO$FIs70b"


# ── 2. Der Befund des ersten Laufs bleibt gefunden ──────────────────────────

def test_aushub_im_selben_paket_bekommt_seinen_wirt(tmp_path):
    ziel = tmp_path / "wirt.ifc"
    baue_datei(_paket(_alle_arten(wirt="cde-dgm")), ziel, schluessel="wirt")
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
    teile = _alle_arten(wirt=wirt)
    teile[2]["ersetzt"] = [wirt]
    baue_datei(_paket(teile), eigen, schluessel="verbundtest")
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
    assert bericht == {"geschlossen": 1, "offen": [], "schon_da": 0, "fehlende_wirte": []}
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
