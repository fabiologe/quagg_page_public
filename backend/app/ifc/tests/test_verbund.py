"""Der Verbund an den ECHTEN Lieferungen — und der Beweis, dass das Prueftor zubeisst.

ZWEI SORTEN TESTS, und die zweite ist die wichtigere:

  1. Der Verbund aus den zwei BricsCAD-Lieferungen muss sauber durchgehen.
     Gefahren wird mit den echten Dateien, nicht mit einer selbstgebauten
     Eingabe: die eine rechnet in Metern, die andere in Millimetern, und genau
     das ist die Eigenschaft, an der ein Verbund scheitert. Eine erfundene
     Eingabe haette sie nicht.

  2. Jede Regel des Prueftors muss an einer KAPUTTEN Datei anschlagen. Ein
     Pruefer, der nie rot wird, sagt nichts aus — er meldet nur, dass er
     gelaufen ist. Deshalb wird der fertige Verbund hier absichtlich
     beschaedigt, und jede Regel muss ihren eigenen Schaden finden.

Die volle Probe ueber alle drei Lieferungen (mit ProVI-Migration und dem
zweiten Motor) dauert gut zwei Minuten und lebt in `app/ifc/probe.py`:

    backend/app/ifc/.venv-ifc/bin/python -m app.ifc.probe

Laeuft mit DEM IFC-VENV:
    backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/ -q
"""
import pathlib

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")

from app.ifc import verbund as V           # noqa: E402
from app.ifc.pruefe import pruefe          # noqa: E402

TESTDATEN = pathlib.Path(__file__).parents[4] / "client/src/features/cde/test"
METER = TESTDATEN / "BIM26_Gruppe5_BODEN_Erdarbeiten.ifc"
MILLIMETER = TESTDATEN / "BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc"
PROVI = TESTDATEN / "IFCOUT_Entwässerung Export .IFC"

haben_boden = pytest.mark.skipif(not (METER.is_file() and MILLIMETER.is_file()),
                                 reason="BricsCAD-Lieferungen liegen nicht im Baum")


@pytest.fixture(scope="module")
def verbund_boden(tmp_path_factory):
    """Der Verbund der zwei BricsCAD-Lieferungen. Einmal je Modul gebaut (~10 s)."""
    if not (METER.is_file() and MILLIMETER.is_file()):
        pytest.skip("BricsCAD-Lieferungen liegen nicht im Baum")
    ziel = tmp_path_factory.mktemp("verbund") / "boden.ifc"
    bericht = V.fuehre_zusammen(
        [V.Quelle(METER, sha256="a" * 64), V.Quelle(MILLIMETER, sha256="b" * 64)],
        ziel, projektname="Testverbund", bearbeiter="pytest")
    return ziel, bericht


# ── 1. Der Verbund selbst ───────────────────────────────────────────────────

@haben_boden
def test_die_millimeterdatei_wird_umgerechnet(verbund_boden):
    """DER Befund, der das ganze Vorhaben traegt.

    410 936 420 mm und 410 300 m gehoeren in dasselbe Modell. Ohne Umrechnung
    liegt eine Lieferung um Faktor 1000 daneben — und die Datei oeffnet sich
    trotzdem. Gemessen wird deshalb die HUELLE, nicht ein Erfolgskennzeichen.
    """
    _ziel, bericht = verbund_boden
    nach_quelle = {q["name"]: q for q in bericht["quellen"]}
    mm = nach_quelle[MILLIMETER.name]
    assert mm["einheit_faktor"] == pytest.approx(0.001)
    assert mm["huelle_vorher"]["max"][0] > 400_000_000      # Millimeter
    assert 400_000 < mm["huelle_nachher"]["max"][0] < 420_000   # Meter
    assert bericht["weltbezug_plausibel"] is True


@haben_boden
def test_alle_bauteile_kommen_an(verbund_boden):
    """Nichts darf still verschwinden."""
    _ziel, bericht = verbund_boden
    erwartet = sum(q["uebernommen"] for q in bericht["quellen"])
    assert bericht["bauteile"] == erwartet
    assert erwartet > 0
    for q in bericht["quellen"]:
        assert q["verworfen"] == 0, (q["name"], q["verworfen_klassen"])


@haben_boden
def test_die_farben_kommen_mit(verbund_boden):
    """Ein farbloser Verbund wird nicht benutzt — und faellt durch keine Schemapruefung.

    `IfcStyledItem` zeigt AUF die Geometrie; der Rueckweg (`StyledByItem`) ist
    nur ein inverses Attribut, dem `file.add` nicht folgt. Beim ersten
    vollstaendigen Lauf kamen deshalb alle drei Lieferungen grau an, und die
    Schema-Pruefung war trotzdem gruen. Diese Zusage misst das Ergebnis.
    """
    ziel, bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    erwartet = sum(q["stile_uebernommen"] for q in bericht["quellen"])
    vorhanden = len(f.by_type("IfcStyledItem")) + len(f.by_type("IfcPresentationLayerAssignment"))
    assert vorhanden == erwartet
    quellstile = sum(
        len(ifcopenshell.open(p).by_type("IfcStyledItem"))
        for p in (METER, MILLIMETER))
    assert vorhanden >= quellstile, "im Verbund fehlen Stile, die die Quellen hatten"


@haben_boden
def test_ein_projekt_ein_kontext_eine_wurzel(verbund_boden):
    """Die drei Dinge, die IFC nur einmal je Datei zulaesst."""
    ziel, _bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    assert len(f.by_type("IfcProject")) == 1
    wurzeln = [k for k in f.by_type("IfcGeometricRepresentationContext")
               if not k.is_a("IfcGeometricRepresentationSubContext")]
    assert len(wurzeln) == 1
    unter_projekt = [o for rel in f.by_type("IfcRelAggregates")
                     if rel.RelatingObject.is_a("IfcProject")
                     for o in rel.RelatedObjects]
    assert len(unter_projekt) == 1


@haben_boden
def test_herkunft_bleibt_lesbar(verbund_boden):
    """Ohne Herkunft ist ein Verbund eine Einbahnstrasse."""
    ziel, bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    gruppen = [g for g in f.by_type("IfcGroup") if g.ObjectType == "Fachmodell"]
    assert {g.Name for g in gruppen} == {METER.name, MILLIMETER.name}
    saetze = [p for p in f.by_type("IfcPropertySet") if p.Name == V.PSET_FACHMODELL]
    assert len(saetze) == len(gruppen)
    werte = {e.Name: e.NominalValue.wrappedValue
             for e in saetze[0].HasProperties}
    assert werte["SHA256"] in {"a" * 64, "b" * 64}
    assert werte["Quellschema"] == "IFC4X3_ADD2"


@haben_boden
def test_georeferenz_nennt_sich_annahme(verbund_boden):
    """Keine Lieferung bringt eine Georeferenz mit — das darf die Datei nicht verschweigen."""
    ziel, _bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    assert len(f.by_type("IfcProjectedCRS")) == 1
    assert len(f.by_type("IfcMapConversion")) == 1
    satz = next(p for p in f.by_type("IfcPropertySet") if p.Name == V.PSET_GEOREF)
    werte = {e.Name: e.NominalValue.wrappedValue for e in satz.HasProperties}
    assert werte["CRS"] == "EPSG:25832"
    assert "Annahme" in werte["Herkunft"]


@haben_boden
def test_derselbe_satz_ergibt_dieselben_ids(tmp_path):
    """Zweimal gebaut heisst REVISION, nicht Fremdling.

    Der isyifc-Schreiber wuerfelt seine GlobalIds; zwei Exporte desselben Netzes
    haben dort nichts miteinander zu tun. Hier muessen sie sich wiedererkennen.
    """
    ids = []
    for lauf in range(2):
        ziel = tmp_path / f"lauf{lauf}.ifc"
        V.fuehre_zusammen([V.Quelle(METER, sha256="a" * 64)], ziel,
                          projektname="Wiederholung", schluessel="satz-7")
        f = ifcopenshell.open(ziel)
        ids.append((f.by_type("IfcProject")[0].GlobalId,
                    f.by_type("IfcSite")[0].GlobalId,
                    sorted(g.GlobalId for g in f.by_type("IfcGroup"))))
    assert ids[0] == ids[1]


@haben_boden
def test_pruefung_ist_sauber(verbund_boden):
    """Das Ergebnis der Ebenen 1 und 2 — die Zahl, die der Befund behauptet."""
    ziel, _bericht = verbund_boden
    ergebnis = pruefe(ziel)
    fehl = [b for b in ergebnis["befunde"] if not b["ok"]]
    assert ergebnis["verstoesse"] == 0, [(b["id"], b["sagt"][:300]) for b in fehl]


# ── 2. Beisst das Prueftor? ─────────────────────────────────────────────────

def _regel(ergebnis, kennung):
    return next(b for b in ergebnis["befunde"] if b["id"] == kennung)


@haben_boden
def test_v01_findet_ein_zweites_projekt(verbund_boden, tmp_path):
    ziel, _ = verbund_boden
    f = ifcopenshell.open(ziel)
    f.create_entity("IfcProject", GlobalId=ifcopenshell.guid.new(), Name="Eindringling")
    kaputt = tmp_path / "zwei_projekte.ifc"
    f.write(str(kaputt))
    assert _regel(pruefe(kaputt), "V01")["ok"] is False


@haben_boden
def test_v02_findet_millimeter(tmp_path):
    """Die unveraenderte Millimeter-Lieferung MUSS an V02 scheitern.

    Damit ist belegt, dass die Regel den Einheitenfehler wirklich sieht — und
    nicht nur zufaellig gruen ist, weil der Verbund ihn vorher behoben hat.
    """
    ergebnis = pruefe(MILLIMETER)
    assert _regel(ergebnis, "V02")["ok"] is False
    assert _regel(ergebnis, "V06b")["ok"] is False       # Huelle faellt aus dem UTM-Fenster


@haben_boden
def test_v04_findet_doppelte_globalid(verbund_boden, tmp_path):
    ziel, _ = verbund_boden
    f = ifcopenshell.open(ziel)
    wurzeln = f.by_type("IfcRoot")
    wurzeln[1].GlobalId = wurzeln[0].GlobalId
    kaputt = tmp_path / "doppelte_guid.ifc"
    f.write(str(kaputt))
    regel = _regel(pruefe(kaputt), "V04")
    assert regel["ok"] is False and regel["zahl"] >= 1


@haben_boden
def test_v04_findet_ungueltige_globalid(verbund_boden, tmp_path):
    """`cde-abc123` ist die Form, die die CDE im Journal fuehrt — im IFC ist sie falsch."""
    ziel, _ = verbund_boden
    f = ifcopenshell.open(ziel)
    f.by_type("IfcSite")[0].GlobalId = "cde-m1abcd-xyz"
    kaputt = tmp_path / "ungueltige_guid.ifc"
    f.write(str(kaputt))
    assert _regel(pruefe(kaputt), "V04")["ok"] is False


@haben_boden
def test_v08_findet_bauteil_ohne_herkunft(verbund_boden, tmp_path):
    ziel, _ = verbund_boden
    f = ifcopenshell.open(ziel)
    for rel in f.by_type("IfcRelAssignsToGroup"):
        f.remove(rel)
    kaputt = tmp_path / "ohne_herkunft.ifc"
    f.write(str(kaputt))
    regel = _regel(pruefe(kaputt), "V08")
    assert regel["ok"] is False and regel["zahl"] > 0


@haben_boden
def test_spf_findet_einen_where_rule_verstoss(verbund_boden, tmp_path):
    """Ebene 1 muss anschlagen, sonst prueft sie nur die Syntax.

    Nachgestellt wird der Befund, den das Prueftor am eigenen Geruest gefunden
    hat: ChangeAction gesetzt, LastModifiedDate fehlt.
    """
    ziel, _ = verbund_boden
    f = ifcopenshell.open(ziel)
    besitz = f.by_type("IfcOwnerHistory")[0]
    besitz.ChangeAction = "ADDED"
    besitz.LastModifiedDate = None
    kaputt = tmp_path / "where_rule.ifc"
    f.write(str(kaputt))
    regel = _regel(pruefe(kaputt), "SPF")
    assert regel["ok"] is False and regel["zahl"] >= 1


# ── 3. Die ProVI-Lieferung (Migration ueber zwei Schemata) ──────────────────

@pytest.mark.skipif(not PROVI.is_file(), reason="ProVI-Lieferung liegt nicht im Baum")
def test_provi_wandert_ueber_ifc4_und_behaelt_ihre_farben(tmp_path):
    """IFC2X3 -> IFC4 -> IFC4X3: einen direkten Weg gibt es nicht.

    Und die Farben: `IfcPresentationStyleAssignment` faellt beim letzten Schritt
    weg (in IFC4X3 gibt es den Typ nicht mehr). Ohne die Rettung in
    `_stile_retten` gingen die 37 `IfcStyledItem` mit ihm — das Modell kaeme
    grau an. Gemessen wird deshalb die Zahl der geretteten Stile, nicht das
    blosse Gelingen.
    """
    ziel = tmp_path / "provi.ifc"
    bericht = V.fuehre_zusammen([V.Quelle(PROVI, sha256="c" * 64)], ziel,
                                projektname="ProVI allein")
    q = bericht["quellen"][0]
    assert q["schema"] == "IFC2X3"
    assert q["stile_gerettet"] > 0
    assert q["uebernommen"] > 0
    f = ifcopenshell.open(ziel)
    assert f.schema_identifier == "IFC4X3_ADD2"
    # Die Zahl, die zaehlt, ist die im ERGEBNIS — nicht die des Zwischenschritts.
    # Genau hier stand beim ersten Lauf eine 0 neben `stile_gerettet == 37`.
    assert len(f.by_type("IfcStyledItem")) > 0
    assert pruefe(ziel)["verstoesse"] == 0


# ── Eine Site (Fahrplan Erdbau-Container, Stufe 2) ──────────────────────────

@haben_boden
def test_der_verbund_hat_genau_eine_site(verbund_boden):
    """Die Sites der Lieferungen gehen in der des Verbunds auf.

    Bis 2026-09-11 hing jede Quell-Site UNTER der des Verbunds (Projekt 1337: vier
    IfcSite). V05 zaehlte eine Raumwurzel und war zufrieden — jeder Empfaenger sah
    vier Standorte.
    """
    ziel, bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    sites = f.by_type("IfcSite")
    assert len(sites) == 1 and bericht["raumwurzeln"] == 1
    gebaeude = f.by_type("IfcBuilding")
    assert len(gebaeude) == 2
    assert all(g.Decomposes[0].RelatingObject == sites[0] for g in gebaeude)
    assert {q["name"]: [s["name"] for s in q["sites_aufgeloest"]] for q in bericht["quellen"]} == \
        {METER.name: ["Standort"], MILLIMETER.name: ["Standort"]}
    # BODEN 2, BODEN3 7 — vorher direkt in ihren Quell-Sites enthalten (gemessen 2026-09-11)
    assert sum(len(r.RelatedElements) for r in sites[0].ContainsElements or ()) == 2 + 7


@haben_boden
def test_die_lage_ueberlebt_das_aufloesen(verbund_boden):
    """Die Kinder zeigen auf die PLATZIERUNG der Quell-Site, nicht auf die Site — keine Koordinate wandert."""
    import ifcopenshell.util.placement as PL
    ziel, _bericht = verbund_boden
    f = ifcopenshell.open(ziel)
    quelle = ifcopenshell.open(METER)
    abweichung = []
    for p in quelle.by_type("IfcProduct"):
        if not p.ObjectPlacement or p.is_a("IfcSite"):
            continue
        a = PL.get_local_placement(p.ObjectPlacement)[:3, 3]
        b = PL.get_local_placement(f.by_guid(p.GlobalId).ObjectPlacement)[:3, 3]
        abweichung.append(float(abs(a - b).max()))
    assert abweichung and max(abweichung) < 1e-6


def test_eine_site_geht_auf_attribute_und_saetze_wandern_die_georeferenz_nicht():
    import ifcopenshell.guid
    g = V.zielgeruest("T", crs=None, schluessel="t")
    f, unsere = g["datei"], g["site"]
    platz = f.create_entity("IfcLocalPlacement", RelativePlacement=f.create_entity(
        "IfcAxis2Placement3D", Location=f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))))
    fremd = f.create_entity("IfcSite", GlobalId=ifcopenshell.guid.new(), Name="Standort", ObjectPlacement=platz,
                            RefLatitude=(50, 7, 12, 0), RefElevation=301.5)
    haus = f.create_entity("IfcBuilding", GlobalId=ifcopenshell.guid.new(), Name="Haus")
    f.create_entity("IfcRelAggregates", GlobalId=ifcopenshell.guid.new(), RelatingObject=fremd, RelatedObjects=[haus])
    wand = f.create_entity("IfcWall", GlobalId=ifcopenshell.guid.new(), Name="W")
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(),
                    RelatedElements=[wand], RelatingStructure=fremd)
    V._merkmale(f, g["besitz"], fremd, "Pset_SiteCommon", {"BuildableArea": 12})
    V._merkmale(f, g["besitz"], fremd, V.PSET_GEOREF, {"CRS": "EPSG:25832"})
    befund = V.Befund(name="Lieferung")
    assert V._site_aufloesen(f, g, fremd, befund) is True
    assert f.by_type("IfcSite") == [unsere]
    assert haus.Decomposes[0].RelatingObject == unsere
    assert wand.ContainedInStructure[0].RelatingStructure == unsere
    assert (unsere.RefLatitude, unsere.RefElevation) == ((50, 7, 12, 0), 301.5)
    assert set(V._merkmalsaetze(unsere)) == {"Pset_SiteCommon"}          # die Georeferenz setzt der Verbund selbst
    assert befund.sites_aufgeloest[0]["merkmalsaetze_verworfen"] == [V.PSET_GEOREF]
    assert V._leere_beziehungen_entfernen(f) == 1                        # die leer gewordene Georeferenz-Beziehung


def test_ein_widerspruch_laesst_die_site_stehen():
    import ifcopenshell.guid
    g = V.zielgeruest("T", crs=None, schluessel="t2")
    f, unsere = g["datei"], g["site"]
    unsere.RefLatitude = (51, 0, 0, 0)
    fremd = f.create_entity("IfcSite", GlobalId=ifcopenshell.guid.new(), Name="Anderswo", RefLatitude=(50, 7, 12, 0))
    befund = V.Befund(name="Lieferung")
    assert V._site_aufloesen(f, g, fremd, befund) is False
    assert len(f.by_type("IfcSite")) == 2 and not befund.sites_aufgeloest
    assert "RefLatitude" in befund.warnungen[0]


def test_zwei_fassungen_desselben_programms_bleiben_eindeutig():
    """UR1: ein Erdbau-Dokument der Fassung 1 im Verbund der Fassung 2 — zwei Nennungen, zwei Kennungen.

    Mit der Fassung 2 (Fahrplan Erdbau-Container, Stufe 3) traf das jedes
    Erdbau-Dokument, das vorher im Register lag: gleiche ApplicationIdentifier,
    andere Version — `_einmalige_verschmelzen` liess beide stehen, UR1 lehnte ab.
    """
    g = V.zielgeruest("T", crs=None, schluessel="ur1")
    f = g["datei"]
    (unsere,) = f.by_type("IfcApplication")
    f.create_entity("IfcApplication", ApplicationDeveloper=unsere.ApplicationDeveloper, Version="1",
                    ApplicationFullName=unsere.ApplicationFullName, ApplicationIdentifier=unsere.ApplicationIdentifier)
    bericht = V._einmalige_verschmelzen(f)
    kennungen = [a.ApplicationIdentifier for a in sorted(f.by_type("IfcApplication"), key=lambda a: a.id())]
    assert kennungen == ["quagg-cde", "quagg-cde 1"]                     # unsere bleibt, wie sie ist
    assert unsere.Version == V.FASSUNG and bericht == {"IfcApplication (Kennung um Fassung ergaenzt)": 1}
