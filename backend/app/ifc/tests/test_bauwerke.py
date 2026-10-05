"""Teil XXVI — Bauwerke aus Bauteilen (Fahrplan docs/cde/fahrplan-teil-xxvi-bauwerke-2026-10-01.md).

Diese Datei waechst mit dem Teil. Z0 legt zwei Sorten Zusagen an:

  GOLD   Ein Paket OHNE die Schluessel von Teil XXVI ergibt dieselbe Datei wie
         vor Teil XXVI — gemessen ueber die Signatur (`signatur.py`), nicht
         ueber Einzelzaehlungen. Der Schreiber wirkt sofort; jede Stufe, die ihn
         anfasst, muss das hier treffen.
  PROBEN Die Funde der Vorpruefung als Zahlen. Was ein Fehler ist, steht hier
         ZUERST mit seinem heutigen Ergebnis — die Stufe, die ihn behebt, dreht
         die Erwartung um und sagt im Commit, warum.

Gold neu schreiben (nur, wenn eine Aenderung am Verhalten GEWOLLT ist, und dann
mit Begruendung im Commit):
    GOLD_SCHREIBER_SCHREIBEN=1 PYTHONPATH=backend backend/app/ifc/.venv-ifc/bin/python \\
        -m pytest backend/app/ifc/tests/test_bauwerke.py -q -k gold

Laeuft mit DEM IFC-VENV:
    PYTHONPATH=backend backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/test_bauwerke.py -q
"""
import json
import os
import re
from pathlib import Path

import pytest

ifcopenshell = pytest.importorskip(
    "ifcopenshell", reason="ifcopenshell fehlt — siehe backend/app/ifc/README.md")

from app.ifc.eigenbau import baue_datei                       # noqa: E402
from app.ifc.pruefe import ids_pruefen, schema_pruefen        # noqa: E402
from app.ifc.tests.signatur import signatur, unterschiede     # noqa: E402

DATEN = Path(__file__).parent / "daten"
GOLD = DATEN / "gold_schreiber_vor_xxvi.json"
IDS = Path(__file__).resolve().parents[1] / "daten" / "quagg-starter.ids"
# Die drei Pakete, die die echte Kette des Clients erzeugt hat (Vertragstests).
GOLD_PAKETE = ("paket_v2", "paket_typen", "paket_leitpfosten")


def _kasten(dx, dy, dz):
    p = [(0, 0, 0), (dx, 0, 0), (dx, dy, 0), (0, dy, 0), (0, 0, dz), (dx, 0, dz), (dx, dy, dz), (0, dy, dz)]
    t = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
         (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    return [list(map(float, q)) for q in p], [list(x) for x in t]


def _paket(*bauteile, **mehr):
    return {"version": 2, "bauteile": list(bauteile), **mehr}


def _bauteil(cde_id, klasse, *, masse=(5.0, 5.0, 0.2), **mehr):
    punkte, dreiecke = _kasten(*masse)
    return {"cdeId": cde_id, "klasse": klasse, "name": cde_id, "rezept": "platte",
            "ursprung": [0.0, 0.0, 0.0], "punkte": punkte, "dreiecke": dreiecke,
            "geschlossen": True, **mehr}


def _regeln(pfad) -> list:
    """Die verletzten Where-Rules, beim Namen — aus der Schemastufe des Prueftors."""
    befund = schema_pruefen(pfad)
    return sorted(set(re.findall(r"\[regeln\] (\w+\.\w+):", befund.get("sagt") or "")))


def _verfehlt(pfad) -> list:
    datei = ifcopenshell.open(str(pfad))
    return sorted(b["titel"].split(" (")[0] for b in ids_pruefen(datei, [IDS]) if b.get("ok") is False)


# ── GOLD ────────────────────────────────────────────────────────────────────

def _signaturen(tmp_path) -> dict:
    aus = {}
    for name in GOLD_PAKETE:
        paket = json.loads((DATEN / f"{name}.json").read_text(encoding="utf-8"))
        ziel = tmp_path / f"{name}.ifc"
        baue_datei(paket, ziel, schluessel="gold")
        aus[name] = signatur(ifcopenshell.open(str(ziel)))
    return aus


def test_gold_alte_pakete_ergeben_dieselbe_datei(tmp_path):
    ist = _signaturen(tmp_path)
    if os.environ.get("GOLD_SCHREIBER_SCHREIBEN"):
        GOLD.write_text(json.dumps(ist, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    soll = json.loads(GOLD.read_text(encoding="utf-8"))
    for name in GOLD_PAKETE:
        assert ist[name] == soll[name], f"{name}: " + "\n".join(unterschiede(ist[name], soll[name]))


def test_gold_traegt_etwas(tmp_path):
    """Ein Gold, das leer ist, beweist nichts — die drei Pakete muessen Substanz haben."""
    soll = json.loads(GOLD.read_text(encoding="utf-8"))
    assert {n: len(soll[n]["roots"]) for n in GOLD_PAKETE} == {
        "paket_v2": 70, "paket_typen": 28, "paket_leitpfosten": 30}
    assert all(len(soll[n]["merkmale"]) > 30 for n in GOLD_PAKETE)


# ── PROBEN (Funde der Vorpruefung) ─────────────────────────────────────────

def test_probe_platte_ist_schemagerecht(tmp_path):
    """Die Kontrolle zur Raumelement-Probe: dieselbe Geometrie als Platte."""
    ziel = tmp_path / "platte.ifc"
    baue_datei(_paket(_bauteil("cde-probe-platte", "IFCSLAB")), ziel, schluessel="probe")
    assert _regeln(ziel) == []


def test_ein_raum_im_paket_wird_ein_raum_und_kein_bauteil(tmp_path):
    """Fund 1, die ZWEITE Drehung (Z6). Bis Z1 landete eine IfcSpace in der
    Enthalten-Beziehung (WR31 + WR41, Z0 hielt es fest); Z1 sperrte sie im
    Bauteilweg. Seit Z6 hat der Raum seinen EIGENEN Weg: zerlegt unter der Site
    (oder seiner Anlage), nie enthalten. Ein Raum aus einem alten Paket wird damit
    schemagerecht geschrieben, statt verworfen. Alle ANDEREN Raumelemente bleiben
    im Bauteilweg gesperrt (naechster Test)."""
    ziel = tmp_path / "raum.ifc"
    bericht = baue_datei(_paket(_bauteil("cde-probe-raum", "IFCSPACE")), ziel, schluessel="probe")
    assert (bericht["bauteile"], bericht["raeume"], bericht["uebersprungen"]) == (0, 1, [])
    datei, enthalten, zerlegt = _beziehungen(ziel)
    assert "cde-probe-raum" not in enthalten                      # nie enthalten (WR31)
    assert zerlegt["cde-probe-raum"][0] == "IfcSite"              # zerlegt unter der Site (WR41)
    assert _regeln(ziel) == []


@pytest.mark.parametrize("klasse", ["IFCFACILITY", "IFCSITE", "IFCBUILDING", "IFCFACILITYPARTCOMMON"])
def test_kein_raumelement_kommt_durch_den_bauteilweg(tmp_path, klasse):
    bericht = baue_datei(_paket(_bauteil("cde-probe", klasse)), tmp_path / "x.ifc", schluessel="probe")
    assert bericht["bauteile"] == 0 and "Raumelement" in bericht["uebersprungen"][0]["grund"]


def test_probe_platte_ohne_merkmale_verfehlt_die_ids(tmp_path):
    """Fund 2, die KONTROLLE: ein Paket ohne Merkmale traegt keinen bSI-Satz —
    so war jede eigene Platte bis Z3 (Z0 hielt es fest). Bleibt wahr: der
    Schreiber erfindet nichts, er schreibt, was das Paket mitbringt."""
    ziel = tmp_path / "platte.ifc"
    baue_datei(_paket(_bauteil("cde-probe-platte", "IFCSLAB")), ziel, schluessel="probe")
    assert _verfehlt(ziel) == ["Decken — Tragend markiert"]


# ── Z3 — bSI-Merkmale aus dem Paket ─────────────────────────────────────────

def _merkmale_in(pfad, cde_id="cde-probe"):
    from app.ifc import guids
    datei = ifcopenshell.open(str(pfad))
    el = datei.by_guid(guids.guid_aus_cde_id(cde_id))
    aus = {}
    for r in el.IsDefinedBy or []:
        satz = r.RelatingPropertyDefinition
        if satz.is_a("IfcPropertySet") and satz.Name.startswith("Pset_"):
            aus[satz.Name] = {p.Name: (p.NominalValue.is_a(), p.NominalValue.wrappedValue) for p in satz.HasProperties}
    return aus


def test_platte_mit_tragend_besteht_die_ids(tmp_path):
    """Fund 2, seit Z3: 1 -> 0 von 18 verfehlt."""
    ziel = tmp_path / "platte.ifc"
    b = _bauteil("cde-probe", "IFCSLAB", merkmale={"Pset_SlabCommon": {"LoadBearing": True}})
    bericht = baue_datei(_paket(b), ziel, schluessel="probe")
    assert bericht["merkmalsaetze"] == 1 and not [w for w in bericht["warnungen"] if "Merkmal" in w]
    assert _merkmale_in(ziel) == {"Pset_SlabCommon": {"LoadBearing": ("IfcBoolean", True)}}
    assert _verfehlt(ziel) == []
    assert _regeln(ziel) == []


def test_wand_mit_tragend_und_aussen_besteht_die_ids(tmp_path):
    """Eine Wand verfehlte ohne Merkmale ZWEI Regeln (IsExternal, LoadBearing)."""
    ohne, mit = tmp_path / "ohne.ifc", tmp_path / "mit.ifc"
    baue_datei(_paket(_bauteil("cde-probe", "IFCWALL", masse=(10.0, 0.3, 2.5))), ohne, schluessel="probe")
    assert _verfehlt(ohne) == ["Wände — IsExternal markiert", "Wände — Tragend/nichttragend markiert"]
    b = _bauteil("cde-probe", "IFCWALL", masse=(10.0, 0.3, 2.5),
                 merkmale={"Pset_WallCommon": {"LoadBearing": True, "IsExternal": False}})
    baue_datei(_paket(b), mit, schluessel="probe")
    assert _merkmale_in(mit) == {"Pset_WallCommon": {"LoadBearing": ("IfcBoolean", True),
                                                     "IsExternal": ("IfcBoolean", False)}}
    assert _verfehlt(mit) == []


def test_ein_satz_fuer_eine_andere_klasse_wird_genannt_nicht_geschrieben(tmp_path):
    """Der Planer hat aus der Platte einen Belag gemacht: Pset_SlabCommon gilt fuer IfcCovering nicht."""
    ziel = tmp_path / "belag.ifc"
    b = _bauteil("cde-probe", "IFCCOVERING", merkmale={"Pset_SlabCommon": {"LoadBearing": True}})
    bericht = baue_datei(_paket(b), ziel, schluessel="probe")
    assert bericht["merkmalsaetze"] == 0 and _merkmale_in(ziel) == {}
    assert any("Pset_SlabCommon gilt nicht fuer IfcCovering" in w for w in bericht["warnungen"])


@pytest.mark.parametrize("werte, grund", [
    ({"LoadBearing": "ja"}, "erwartet IfcBoolean"),            # ein Text wird kein Wahrheitswert
    ({"Tragfaehig": True}, "steht nicht in der Vorlage"),       # ein Merkmal, das es nicht gibt
    ({"Status": "NEW"}, "ist kein Einzelwert"),                 # Aufzaehlung — nicht in dieser Stufe
])
def test_was_nicht_zur_vorlage_passt_wird_genannt(tmp_path, werte, grund):
    ziel = tmp_path / "x.ifc"
    bericht = baue_datei(_paket(_bauteil("cde-probe", "IFCSLAB", merkmale={"Pset_SlabCommon": werte})),
                         ziel, schluessel="probe")
    assert bericht["merkmalsaetze"] == 0 and _merkmale_in(ziel) == {}
    assert any(grund in w for w in bericht["warnungen"]), bericht["warnungen"]


def test_probe_bauteil_ohne_geometrie_wird_uebersprungen(tmp_path):
    """Fund 4: ein Paket-Bauteil braucht einen Koerper. Bleibt so — Bauwerke
    kommen in Z5 ueber einen EIGENEN Schluessel, nicht als Bauteil ohne Geometrie."""
    ohne = {"cdeId": "cde-probe-leer", "klasse": "IFCSLAB", "punkte": [], "dreiecke": []}
    bericht = baue_datei(_paket(ohne), tmp_path / "leer.ifc", schluessel="probe")
    assert bericht["bauteile"] == 0
    assert bericht["uebersprungen"] == [{"cdeId": "cde-probe-leer", "grund": "ohne Geometrie"}]


# ── DER VERTRAG: die Kammer aus der echten Kette des Clients ──────────────────
#
# `client/src/features/cde/test/bauwerkVertrag.test.js` zeichnet die Kammer ueber
# die Werkzeuge, baut sie im Autor und legt GENAU dieses Paket hier ab. Er waechst
# mit dem Teil: Z3 Merkmale, Z4 Mengen, Z5 Bauwerk, Z6 Raum.

KAMMER = DATEN / "paket_bauwerke.json"


@pytest.fixture(scope="module")
def kammer(tmp_path_factory):
    from app.ifc.pruefe import pruefe
    paket = json.loads(KAMMER.read_text(encoding="utf-8"))
    ziel = tmp_path_factory.mktemp("kammer") / "kammer.ifc"
    bericht = baue_datei(paket, ziel, schluessel="kammer")
    return {"paket": paket, "ziel": ziel, "bericht": bericht, "pruefung": pruefe(ziel, ids=[IDS])}


def test_vertrag_kammer_sechs_bauteile_ohne_verstoss(kammer):
    from app.ifc.pruefe import offen
    assert kammer["bericht"]["bauteile"] == 6 and kammer["bericht"]["uebersprungen"] == []
    fehl = [b for b in kammer["pruefung"]["befunde"] if offen(b)]
    assert fehl == [], fehl


def test_vertrag_kammer_traegt_die_bsi_merkmale_der_ids(kammer):
    """Fund 2 an der echten Kette. Ohne Merkmale verfehlte die Kammer drei Regeln
    (Decken — Tragend; Waende — IsExternal; Waende — Tragend). Jetzt keine davon.

    Fund 9: bis zu Fabios Entscheidung verfehlte sie EINE Regel neu —
    „Aussenwaende — Brandschutz-Klasse" griff, WEIL die Waende als Aussenwand
    markiert sind. Eine Hochbau-Regel; seit Fund 9 gilt sie nur fuer Waende
    eines Gebaeudes (`partOf IfcBuilding`, gemessen mit ifctester: am
    Vergleichsmodell 2 -> 2 anwendbar, an der Kammer 4 -> 0). Eine
    Feuerwiderstandsklasse fuer die Beckenwand wird nicht erfunden.
    """
    # 6 bSI-Saetze an den Bauteilen, seit Z8 dazu Quagg_Speicherraum am Raum (die gemessene Sohle).
    assert kammer["bericht"]["merkmalsaetze"] == 7
    verfehlt = _verfehlt(kammer["ziel"])
    for regel in ("Decken — Tragend markiert", "Wände — IsExternal markiert", "Wände — Tragend/nichttragend markiert"):
        assert regel not in verfehlt
    assert verfehlt == []


def _qto(datei):
    """{GlobalId: (Satzname, Methode, {Menge: Wert})} aller IfcElementQuantity."""
    aus = {}
    for r in datei.by_type("IfcRelDefinesByProperties"):
        q = r.RelatingPropertyDefinition
        if not q.is_a("IfcElementQuantity"):
            continue
        werte = {m.Name: round(getattr(m, m.attribute_name(3)), 6) for m in q.Quantities}
        for o in r.RelatedObjects:
            aus[o.GlobalId] = (q.Name, q.MethodOfMeasurement, werte)
    return aus


def test_vertrag_kammer_traegt_ihre_mengen(kammer):
    """Fund 5 (Z4): eigene Bauteile kamen ohne Qto ins IFC. Jetzt die Zahlen aus
    Abschnitt 6 des Fahrplans — 22,164 m3 Beton, von Hand gerechnet."""
    from app.ifc import guids
    from app.ifc.eigenbau import MENGEN_METHODEN
    datei = ifcopenshell.open(str(kammer["ziel"]))
    qto = _qto(datei)
    gid = lambda cde: guids.guid_aus_cde_id(cde)                                  # noqa: E731
    platte = qto[gid("cde-KA-bodenplatte")]
    assert platte[0] == "Qto_SlabBaseQuantities"
    assert platte[2] == {"Depth": 0.4, "NetArea": 16.56, "Perimeter": 16.4, "NetVolume": 6.624}
    wand = qto[gid("cde-KA-wand-nord")]
    assert wand[0] == "Qto_WallBaseQuantities"
    # Teil XXVIII, V7: GrossSideArea = Ansicht der Mittelebene, EINE Seite: 4,60 · 2,50.
    assert wand[2] == {"Length": 4.6, "Width": 0.3, "Height": 2.5, "GrossSideArea": 11.5, "NetVolume": 3.45}
    assert qto[gid("cde-KA-wand-west")][2]["NetVolume"] == 2.25
    assert qto[gid("cde-KA-decke")][2]["NetVolume"] == 4.14
    # Beton sind die BAUTEILE — der Raum (Z6) traegt seine eigene Qto und zaehlt nicht mit.
    assert round(sum(v[2]["NetVolume"] for v in qto.values() if v[0] != "Qto_SpaceBaseQuantities"), 6) == 22.164
    # Die Messmethode sagt die Wahrheit: KOERPER, nicht Gelaenderaster.
    assert {v[1] for v in qto.values()} == {MENGEN_METHODEN["koerper"]}
    assert kammer["bericht"]["mengen"] == 7                          # 6 Bauteile + der Raum (Z6)


# ── Z5a — Bauwerke als Behaelter ─────────────────────────────────────────────

def _georef(paket):
    """Das Paket ins UTM32-Fenster (V06a/V06b) — wie in test_eigenbau.py."""
    paket["crs"] = "EPSG:25832"
    for b in paket["bauteile"]:
        b["ursprung"] = [410300.0, 5460100.0, 250.0]
    return paket


def _sauber(pfad):
    """Null offene Befunde im ganzen Prueftor (Schema, Where-Rules, Verbundregeln)."""
    from app.ifc.pruefe import offen, pruefe
    fehl = [b for b in pruefe(pfad)["befunde"] if offen(b)]
    assert fehl == [], fehl


def _beziehungen(pfad):
    """Wer enthaelt / zerlegt wen — per Klasse und Name."""
    datei = ifcopenshell.open(str(pfad))
    enthalten = {e.Name: (r.RelatingStructure.is_a(), r.RelatingStructure.Name)
                 for r in datei.by_type("IfcRelContainedInSpatialStructure") for e in r.RelatedElements}
    zerlegt = {e.Name: (r.RelatingObject.is_a(), r.RelatingObject.Name)
               for r in datei.by_type("IfcRelAggregates") for e in r.RelatedObjects}
    return datei, enthalten, zerlegt


def test_eine_anlage_enthaelt_ihre_teile(tmp_path):
    ziel = tmp_path / "anlage.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-K"), _bauteil("cde-b", "IFCWALL", teilVon="cde-K"),
                           _bauteil("cde-frei", "IFCSLAB"),
                           bauwerke=[{"cdeId": "cde-K", "art": "anlage", "name": "Kammer"}]))
    bericht = baue_datei(paket, ziel, schluessel="probe")
    assert bericht["bauwerke"] == 1 and bericht["bauteile"] == 3
    datei, enthalten, zerlegt = _beziehungen(ziel)
    assert enthalten == {"cde-a": ("IfcFacility", "Kammer"), "cde-b": ("IfcFacility", "Kammer"),
                         "cde-frei": ("IfcSite", datei.by_type("IfcSite")[0].Name)}
    assert zerlegt["Kammer"][0] == "IfcSite"               # die Anlage haengt zerlegt unter der Site (WR41)
    assert _regeln(ziel) == []
    _sauber(ziel)


def test_eine_baugruppe_zerlegt_ihre_teile_und_zaehlt_sie_nicht_doppelt(tmp_path):
    ziel = tmp_path / "baugruppe.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-G"), _bauteil("cde-b", "IFCSLAB", teilVon="cde-G"),
                           bauwerke=[{"cdeId": "cde-G", "art": "baugruppe", "name": "Fertigteil"}]))
    baue_datei(paket, ziel, schluessel="probe")
    datei, enthalten, zerlegt = _beziehungen(ziel)
    assert zerlegt["cde-a"] == ("IfcElementAssembly", "Fertigteil") == zerlegt["cde-b"]
    assert "cde-a" not in enthalten and "cde-b" not in enthalten     # zerlegt, NICHT zusaetzlich enthalten
    assert enthalten["Fertigteil"][0] == "IfcSite"                   # die Baugruppe selbst ist eingeordnet
    g = datei.by_type("IfcElementAssembly")[0]
    assert (g.PredefinedType, g.ObjectType) == ("USERDEFINED", "Baugruppe")
    _sauber(ziel)


def test_eine_anlage_in_einer_anlage_wird_ein_anlagenteil(tmp_path):
    ziel = tmp_path / "teil.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-T"),
                           bauwerke=[{"cdeId": "cde-R", "art": "anlage", "name": "RUEB"},
                                     {"cdeId": "cde-T", "art": "anlage", "name": "Beckenbauwerk", "teilVon": "cde-R",
                                      "predefinedType": "BELOWGROUND"}]))
    baue_datei(paket, ziel, schluessel="probe")
    datei, enthalten, zerlegt = _beziehungen(ziel)
    teil = datei.by_type("IfcFacilityPartCommon")[0]
    assert (teil.PredefinedType, teil.UsageType) == ("BELOWGROUND", "NOTDEFINED")   # UsageType ist Pflicht
    assert zerlegt["Beckenbauwerk"] == ("IfcFacility", "RUEB")
    assert enthalten["cde-a"] == ("IfcFacilityPartCommon", "Beckenbauwerk")
    _sauber(ziel)


@pytest.mark.parametrize("bauwerke, teil_von, grund", [
    ([], "cde-X", "Bauwerk cde-X gibt es im Paket nicht"),
    ([{"cdeId": "cde-A", "art": "anlage", "teilVon": "cde-B"}, {"cdeId": "cde-B", "art": "anlage", "teilVon": "cde-A"}],
     "cde-A", "im Kreis"),
    ([{"cdeId": "cde-A", "art": "turm"}], "cde-A", "Bauwerksart 'turm' unbekannt"),
])
def test_was_nicht_stimmt_wird_genannt_und_an_die_site_gehaengt(tmp_path, bauwerke, teil_von, grund):
    ziel = tmp_path / "x.ifc"
    bericht = baue_datei(_georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon=teil_von), bauwerke=bauwerke)),
                         ziel, schluessel="probe")
    assert any(grund in w for w in bericht["warnungen"]), bericht["warnungen"]
    assert _regeln(ziel) == []
    _sauber(ziel)


# ── Z5b — Pruefregel V07b: keine Doppelzaehlung ─────────────────────────────

def _v07b(datei):
    from app.ifc.pruefe import verbundregeln
    return next(b for b in verbundregeln(datei) if b["id"] == "V07b")


def test_v07b_schweigt_beim_schreiber_und_meldet_die_doppelzaehlung(tmp_path):
    """Fund 6: V07 zaehlt Zerlegung als Einordnung — und schwieg, wenn ein Teil
    ZUSAETZLICH enthalten war. Der Schreiber tut das nie; eine Datei von anderswo kann es."""
    from app.ifc.pruefe import offen
    ziel = tmp_path / "baugruppe.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-G"), _bauteil("cde-b", "IFCSLAB", teilVon="cde-G"),
                           bauwerke=[{"cdeId": "cde-G", "art": "baugruppe", "name": "Fertigteil"}]))
    baue_datei(paket, ziel, schluessel="probe")
    datei = ifcopenshell.open(str(ziel))
    sauber = _v07b(datei)
    assert (sauber["ok"], sauber["zahl"], sauber["schwere"]) == (True, 0, "warnung")

    # Dieselbe Datei, ein Teil ZUSAETZLICH an der Site enthalten — wie es ein anderes Werkzeug schreiben koennte.
    site = datei.by_type("IfcSite")[0]
    teil = next(e for e in datei.by_type("IfcSlab") if e.Name == "cde-a")
    rel = next(r for r in datei.by_type("IfcRelContainedInSpatialStructure") if r.RelatingStructure == site)
    rel.RelatedElements = [*rel.RelatedElements, teil]
    doppelt = _v07b(datei)
    assert (doppelt["ok"], doppelt["zahl"]) == (False, 1)
    assert "Teil von IfcElementAssembly" in doppelt["beispiele"][0]
    assert not offen(doppelt)                      # meldet, sperrt nicht (Vereinbarung, keine Where-Rule)


def test_v07b_kennt_raumgliederung_nicht_als_zerlegung(tmp_path):
    """Site > Facility ist Raumgliederung, kein Bauteil-Zerlegen: eine Anlage mit Teilen bleibt ohne Befund."""
    ziel = tmp_path / "anlage.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-K"),
                           bauwerke=[{"cdeId": "cde-K", "art": "anlage", "name": "Kammer"}]))
    baue_datei(paket, ziel, schluessel="probe")
    assert _v07b(ifcopenshell.open(str(ziel)))["ok"] is True


# ── Z5c — die Anlage uebersteht den Verbund ─────────────────────────────────

def test_im_verbund_bleibt_die_anlage_mit_ihren_teilen(tmp_path):
    """Fund 7, von „gelesen" zu „gemessen": `_site_aufloesen` haengt JEDEN Verweis auf
    die Eigenbau-Site an die Verbund-Site um. Eine Facility darunter ueberlebt — mit
    ihren Teilen, und der Verbund hat danach genau EINE Site (V05)."""
    from app.ifc import verbund as V
    from app.ifc.pruefe import offen, pruefe
    from app.ifc.tests.test_eigenbau import _gelieferte_gelaendedatei
    geliefert = tmp_path / "gelaende.ifc"
    _gelieferte_gelaendedatei(geliefert)
    eigen = tmp_path / "eigenbau.ifc"
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-K"), _bauteil("cde-b", "IFCWALL", teilVon="cde-K"),
                           bauwerke=[{"cdeId": "cde-K", "art": "anlage", "name": "Kammer"}]))
    baue_datei(paket, eigen, schluessel="verbund-anlage")
    ziel = tmp_path / "verbund.ifc"
    V.fuehre_zusammen([V.Quelle(geliefert, name="Gelaendelieferung", sha256="d" * 64),
                       V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
                      ziel, projektname="Verbund mit Anlage", bearbeiter="pytest")
    datei = ifcopenshell.open(str(ziel))
    sites = datei.by_type("IfcSite")
    assert len(sites) == 1
    anlage = datei.by_type("IfcFacility")
    assert [a.Name for a in anlage] == ["Kammer"]
    eltern = [r.RelatingObject for r in datei.by_type("IfcRelAggregates") if anlage[0] in r.RelatedObjects]
    assert eltern == sites                                       # unter DER Site des Verbunds
    teile = sorted(e.Name for r in anlage[0].ContainsElements for e in r.RelatedElements)
    assert teile == ["cde-a", "cde-b"]
    fehl = [b for b in pruefe(ziel)["befunde"] if offen(b)]
    assert fehl == [], fehl


def test_vertrag_kammer_ist_ein_bauwerk(kammer):
    """Z5 an der echten Kette: angelegt und zugeordnet ueber die WERKZEUGE (Z5e),
    durch Autor und Paket (Z5d), geschrieben (Z5a). Vorher: alle sechs Teile direkt
    an der Site, keine Facility."""
    datei = ifcopenshell.open(str(kammer["ziel"]))
    assert kammer["bericht"]["bauwerke"] == 1
    anlage = datei.by_type("IfcFacility")
    assert [a.Name for a in anlage] == ["Kammer"]
    in_anlage = sorted(e.Name for r in anlage[0].ContainsElements for e in r.RelatedElements)
    assert in_anlage == ["Bodenplatte", "Decke", "Längswand Nord", "Längswand Süd", "Querwand Ost", "Querwand West"]
    site = datei.by_type("IfcSite")[0]
    assert [e for r in (site.ContainsElements or []) for e in r.RelatedElements] == []
    assert not [w for w in kammer["bericht"]["warnungen"] if "Bauwerk" in w]



# ── Z6 — der Raum ────────────────────────────────────────────────────────────

def test_ein_raum_gehoert_in_seine_anlage(tmp_path):
    ziel = tmp_path / "anlage.ifc"
    paket = _georef(_paket(_bauteil("cde-wand", "IFCWALL", teilVon="cde-K"),
                           _bauteil("cde-raum", "IFCSPACE", masse=(4.0, 3.0, 2.5), teilVon="cde-K",
                                    mengen={"netFloorArea": 12.0, "netVolume": 30.0}),
                           bauwerke=[{"cdeId": "cde-K", "art": "anlage", "name": "Kammer"}]))
    bericht = baue_datei(paket, ziel, schluessel="probe")
    assert (bericht["bauteile"], bericht["raeume"]) == (1, 1)
    datei, enthalten, zerlegt = _beziehungen(ziel)
    assert zerlegt["cde-raum"] == ("IfcFacility", "Kammer")       # unter der Anlage zerlegt
    assert enthalten["cde-wand"] == ("IfcFacility", "Kammer")     # die Wand bleibt enthalten
    _sauber(ziel)


def test_ein_raum_in_einer_baugruppe_wird_genannt_und_kommt_an_die_site(tmp_path):
    ziel = tmp_path / "x.ifc"
    paket = _georef(_paket(_bauteil("cde-raum", "IFCSPACE", teilVon="cde-G"),
                           _bauteil("cde-p", "IFCSLAB", teilVon="cde-G"),
                           bauwerke=[{"cdeId": "cde-G", "art": "baugruppe", "name": "Fertigteil"}]))
    bericht = baue_datei(paket, ziel, schluessel="probe")
    assert any("ein Raum gehoert in eine Anlage" in w for w in bericht["warnungen"])
    _datei, _enthalten, zerlegt = _beziehungen(ziel)
    assert zerlegt["cde-raum"][0] == "IfcSite"
    _sauber(ziel)



def test_vertrag_kammer_hat_ihren_raum(kammer):
    """Z6 an der echten Kette: der Kammerraum, ueber das Werkzeug gezeichnet und der
    Kammer zugeordnet, steht ZERLEGT unter der IfcFacility — nie enthalten — und
    traegt das Speichervolumen als Messwert: 4,00 x 3,00 x 2,50 = 30,000 m3."""
    from app.ifc import guids
    datei = ifcopenshell.open(str(kammer["ziel"]))
    raum = datei.by_type("IfcSpace")
    assert [r.Name for r in raum] == ["Kammerraum"]
    assert kammer["bericht"]["raeume"] == 1
    ganzes = [r.RelatingObject for r in datei.by_type("IfcRelAggregates") if raum[0] in r.RelatedObjects]
    assert [(g.is_a(), g.Name) for g in ganzes] == [("IfcFacility", "Kammer")]
    assert raum[0] not in [e for r in datei.by_type("IfcRelContainedInSpatialStructure") for e in r.RelatedElements]
    name, _methode, werte = _qto(datei)[guids.guid_aus_cde_id("cde-KA-raum")]
    assert name == "Qto_SpaceBaseQuantities"
    assert werte == {"NetFloorArea": 12.0, "Height": 2.5, "NetVolume": 30.0}
    verfehlt = _verfehlt(kammer["ziel"])
    assert "Räume — Name vorhanden" not in verfehlt and "Räume — Fläche dokumentiert" not in verfehlt
    assert _regeln(kammer["ziel"]) == []


# ── Z7 — Klassifizierung und Tragwerk ────────────────────────────────────────

def _tragwerke(datei):
    return {s.Name: sorted(o.Name for r in s.IsGroupedBy for o in r.RelatedObjects)
            for s in datei.by_type("IfcBuiltSystem")}


def test_vertrag_kammer_hat_ein_tragwerk(kammer):
    """Z7 an der echten Kette: die sechs Bauteile tragen laut Merkmal (Z3) — also
    stehen sie im Tragwerk der Kammer, und das Tragwerk dient der Kammer."""
    datei = ifcopenshell.open(str(kammer["ziel"]))
    assert _tragwerke(datei) == {"Tragwerk Kammer": ["Bodenplatte", "Decke", "Längswand Nord", "Längswand Süd",
                                                     "Querwand Ost", "Querwand West"]}
    dient = [(r.RelatingSystem.Name, [b.Name for b in r.RelatedBuildings]) for r in datei.by_type("IfcRelServicesBuildings")]
    assert dient == [("Tragwerk Kammer", ["Kammer"])]
    assert kammer["bericht"]["tragwerke"] == 1


def test_wer_nicht_traegt_steht_nicht_im_tragwerk(tmp_path):
    """Die Gegenprobe des Fahrplans: eine Platte „nicht tragend" -> eine weniger."""
    ziel = tmp_path / "t.ifc"
    paket = _georef(_paket(
        _bauteil("cde-a", "IFCSLAB", teilVon="cde-K", merkmale={"Pset_SlabCommon": {"LoadBearing": True}}),
        _bauteil("cde-b", "IFCSLAB", teilVon="cde-K", merkmale={"Pset_SlabCommon": {"LoadBearing": False}}),
        _bauteil("cde-c", "IFCSLAB", teilVon="cde-K"),                       # ohne Angabe: nicht tragend
        bauwerke=[{"cdeId": "cde-K", "art": "anlage", "name": "Kammer"}]))
    baue_datei(paket, ziel, schluessel="probe")
    assert _tragwerke(ifcopenshell.open(str(ziel))) == {"Tragwerk Kammer": ["cde-a"]}
    _sauber(ziel)


def test_der_bauwerkstyp_ist_eine_klassifizierung(tmp_path):
    """IfcFacility hat keinen PredefinedType — der Bauwerkstyp ist eine Klassifizierung,
    je System EINE IfcClassification, auch fuer zwei Bauwerke."""
    ziel = tmp_path / "k.ifc"
    k = lambda code, name: {"system": "Arbeitshilfen Abwasser", "edition": "2015-12", "code": code, "name": name,
                            "quelle": "Arbeitshilfen Abwasser (2015-12), Anhang A-1"}       # noqa: E731
    paket = _georef(_paket(_bauteil("cde-a", "IFCSLAB", teilVon="cde-1"), _bauteil("cde-b", "IFCSLAB", teilVon="cde-2"),
                           bauwerke=[{"cdeId": "cde-1", "art": "anlage", "name": "Becken 1", "klassifikation": k("RUEB", "Regenüberlaufbecken")},
                                     {"cdeId": "cde-2", "art": "anlage", "name": "Becken 2", "klassifikation": k("RRB", "Regenrückhaltebecken")}]))
    baue_datei(paket, ziel, schluessel="probe")
    datei = ifcopenshell.open(str(ziel))
    systeme = datei.by_type("IfcClassification")
    assert [(c.Name, c.Edition) for c in systeme] == [("Arbeitshilfen Abwasser", "2015-12")]
    nach = {r.RelatedObjects[0].Name: (r.RelatingClassification.Identification, r.RelatingClassification.Name)
            for r in datei.by_type("IfcRelAssociatesClassification")}
    assert nach == {"Becken 1": ("RUEB", "Regenüberlaufbecken"), "Becken 2": ("RRB", "Regenrückhaltebecken")}
    _sauber(ziel)


def test_vertrag_kammer_ist_klassifiziert(kammer):
    """Z7 an der echten Kette: der Bauwerkstyp, beim Anlegen gewaehlt, steht als
    Klassifizierung an der IfcFacility — mit System, Ausgabe und Quelle aus dem Katalog."""
    datei = ifcopenshell.open(str(kammer["ziel"]))
    rel = datei.by_type("IfcRelAssociatesClassification")
    assert [(r.RelatedObjects[0].is_a(), r.RelatedObjects[0].Name) for r in rel] == [("IfcFacility", "Kammer")]
    ref = rel[0].RelatingClassification
    assert (ref.Identification, ref.Name) == ("RRB", "Regenrückhaltebecken")
    assert (ref.ReferencedSource.Name, ref.ReferencedSource.Edition) == ("Arbeitshilfen Abwasser", "2015-12")
    assert "Anhang A-1" in ref.ReferencedSource.Source


# ── Fund 8: die Ausfuehrung (PredefinedType) und der Objekttyp ─────────────

def test_vertrag_kammer_traegt_ihre_ausfuehrungen(kammer):
    """Fund 8 an der echten Kette: die PredefinedTypes aus Abschnitt 6 des
    Fahrplans stehen in der Datei — vorher kam jedes gezeichnete Bauteil als
    NOTDEFINED an. Der Raum ohne Angabe: die Vorgabe des Rezepts, INTERNAL."""
    datei = ifcopenshell.open(str(kammer["ziel"]))
    ist = sorted((e.is_a(), e.Name, e.PredefinedType)
                 for e in datei.by_type("IfcSlab") + datei.by_type("IfcWall") + datei.by_type("IfcSpace"))
    assert ist == sorted([
        ("IfcSlab", "Bodenplatte", "BASESLAB"), ("IfcSlab", "Decke", "ROOF"),
        ("IfcWall", "Längswand Nord", "RETAININGWALL"), ("IfcWall", "Längswand Süd", "RETAININGWALL"),
        ("IfcWall", "Querwand West", "RETAININGWALL"), ("IfcWall", "Querwand Ost", "RETAININGWALL"),
        ("IfcSpace", "Kammerraum", "INTERNAL")])


@pytest.mark.parametrize("objekt_typ, pt, ot, warnung", [
    ("Überlaufschwelle", "USERDEFINED", "Überlaufschwelle", False),
    (None, "NOTDEFINED", None, True),
])
def test_userdefined_nur_mit_objekttyp(tmp_path, objekt_typ, pt, ot, warnung):
    """USERDEFINED ohne ObjectType ist ein leeres Wort — der Schreiber erfindet
    keinen und schreibt NOTDEFINED, mit Warnung. Mit Fachbegriff: beides steht da."""
    ziel = tmp_path / "schwelle.ifc"
    bericht = baue_datei(_paket(_bauteil("cde-schwelle", "IFCWALL", predefinedType="USERDEFINED",
                                         **({"objektTyp": objekt_typ} if objekt_typ else {}))),
                         ziel, schluessel="probe")
    wand = ifcopenshell.open(str(ziel)).by_type("IfcWall")[0]
    assert (wand.PredefinedType, wand.ObjectType) == (pt, ot)
    assert any("USERDEFINED ohne Objekttyp" in w for w in bericht["warnungen"]) is warnung
    assert _regeln(ziel) == []


# ── Z8: Fachmerkmale als Katalog (Fund 10) ─────────────────────────────────

SCHWELLE = DATEN / "paket_schwelle.json"


@pytest.fixture(scope="module")
def schwelle(tmp_path_factory):
    from app.ifc.pruefe import pruefe
    paket = json.loads(SCHWELLE.read_text(encoding="utf-8"))
    ziel = tmp_path_factory.mktemp("schwelle") / "schwelle.ifc"
    bericht = baue_datei(paket, ziel, schluessel="schwelle")
    return {"ziel": ziel, "bericht": bericht, "pruefung": pruefe(ziel, ids=[IDS])}


def test_vertrag_schwelle_traegt_quagg_entlastung(schwelle):
    """Die Probe aus Z8 an der echten Kette: die Ueberlaufschwelle (Fuss 211,90,
    Hoehe 0,50) traegt Quagg_Entlastung.SchwellenhoeheNN = 212,40 — gemessen am
    Koerper im Client, getypt nach dem hauseigenen Katalog. Dazu USERDEFINED mit
    ObjectType (Fund 8) und der Speicherraum mit seinen Betriebshoehen."""
    from app.ifc.pruefe import offen
    assert [w for w in schwelle["bericht"]["warnungen"] if "Merkmalssatz" in w or "nicht geschrieben" in w] == []
    datei = ifcopenshell.open(str(schwelle["ziel"]))
    wand = datei.by_type("IfcWall")[0]
    assert (wand.PredefinedType, wand.ObjectType) == ("USERDEFINED", "Überlaufschwelle")
    satz = {p.Name: (p.NominalValue.is_a(), p.NominalValue.wrappedValue)
            for r in wand.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
            for p in getattr(r.RelatingPropertyDefinition, "HasProperties", None) or ()
            if r.RelatingPropertyDefinition.Name == "Quagg_Entlastung"}
    assert satz == {"Art": ("IfcLabel", "Beckenüberlauf"), "SchwellenhoeheNN": ("IfcLengthMeasure", 212.4),
                    "Schwellenlaenge": ("IfcLengthMeasure", 4.0), "Ueberfallbeiwert": ("IfcReal", 0.6),
                    "Herleitung": ("IfcText", "Probe Teil XXVI, Z8")}
    raum = datei.by_type("IfcSpace")[0]
    speicher = {p.Name: p.NominalValue.wrappedValue for r in raum.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
                for p in getattr(r.RelatingPropertyDefinition, "HasProperties", None) or ()
                if r.RelatingPropertyDefinition.Name == "Quagg_Speicherraum"}
    assert speicher == {"SohlhoeheNN": 210.0, "BetriebswasserNN": 212.4}
    assert [b for b in schwelle["pruefung"]["befunde"] if offen(b)] == []


def test_ein_unbekannter_quagg_satz_wird_genannt_nicht_geschrieben(tmp_path):
    """Nur, was der Katalog erklaert: ein vertippter Satz ist kein neuer Satz."""
    ziel = tmp_path / "tippfehler.ifc"
    bericht = baue_datei(_paket(_bauteil("cde-x", "IFCWALL", merkmale={"Quagg_Entlastungg": {"Art": "x"}})),
                         ziel, schluessel="probe")
    assert any("Quagg_Entlastungg gilt nicht" in w for w in bericht["warnungen"])
    assert not [r for r in ifcopenshell.open(str(ziel)).by_type("IfcPropertySet") if r.Name.startswith("Quagg_Entl")]


# ── Z9.2: Abnahme — ein RUEB ohne Ports, nur ueber Kommandos ──────────────

RUEB = DATEN / "paket_rueb.json"


@pytest.fixture(scope="module")
def rueb(tmp_path_factory):
    from app.ifc.pruefe import pruefe
    paket = json.loads(RUEB.read_text(encoding="utf-8"))
    ziel = tmp_path_factory.mktemp("rueb") / "rueb.ifc"
    bericht = baue_datei(paket, ziel, schluessel="rueb")
    return {"ziel": ziel, "bericht": bericht, "pruefung": pruefe(ziel, ids=[IDS])}


def test_abnahme_rueb_im_ifc(rueb):
    """Das Paket aus `abnahmeRueb.test.js` (nur `fuehreAus`): eine IfcFacility mit
    Klassifizierung RUEB, acht Bauteile und zwei Raeume darin, Prueftor ohne
    offenen Befund, IDS 0 von 18 verfehlt. Das Speichervolumen ist ein Messwert:
    die Summe der NetVolume beider Kammern, 60,000 m³ — von Hand 2 · 4 · 3 · 2,5."""
    from app.ifc.pruefe import offen
    assert rueb["bericht"]["bauteile"] == 8 and rueb["bericht"]["uebersprungen"] == []
    assert [b for b in rueb["pruefung"]["befunde"] if offen(b)] == []
    assert _verfehlt(rueb["ziel"]) == []
    datei = ifcopenshell.open(str(rueb["ziel"]))
    (anlage,) = datei.by_type("IfcFacility")
    ref = [r.RelatingClassification for r in datei.by_type("IfcRelAssociatesClassification") if anlage in r.RelatedObjects]
    assert [(c.Identification, c.Name) for c in ref] == [("RUEB", "Regenüberlaufbecken")]
    enthalten = {e.Name for r in anlage.ContainsElements for e in r.RelatedElements}
    assert len(enthalten) == 8 and "Beckenüberlauf" in enthalten
    raeume = [e for r in anlage.IsDecomposedBy for e in r.RelatedObjects if e.is_a("IfcSpace")]
    netto = [q.VolumeValue for s in raeume for r in s.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
             and r.RelatingPropertyDefinition.is_a("IfcElementQuantity")
             for q in r.RelatingPropertyDefinition.Quantities if q.Name == "NetVolume"]
    assert sorted(round(v, 3) for v in netto) == [30.0, 30.0]
    beton = [q.VolumeValue for e in datei.by_type("IfcBuiltElement") for r in e.IsDefinedBy
             if r.is_a("IfcRelDefinesByProperties") and r.RelatingPropertyDefinition.is_a("IfcElementQuantity")
             for q in r.RelatingPropertyDefinition.Quantities if q.Name == "NetVolume"]
    assert round(sum(beton), 3) == 40.836
    schwelle = next(e for e in datei.by_type("IfcWall") if e.ObjectType == "Überlaufschwelle")
    hoehe = [p.NominalValue.wrappedValue for r in schwelle.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
             and r.RelatingPropertyDefinition.Name == "Quagg_Entlastung"
             for p in r.RelatingPropertyDefinition.HasProperties if p.Name == "SchwellenhoeheNN"]
    assert hoehe == [212.4]


# ── Z9.3: der RUEB im Gelaende — Verbund mit der Gelaendelieferung ─────────

RUEB_GELAENDE = DATEN / "paket_rueb_gelaende.json"


def test_abnahme_rueb_im_verbund_mit_dem_gelaende(tmp_path):
    """Das Paket aus `abnahmeVerbund.test.js` (Kommandos + Baugrube um die
    Bodenplatte) mit einer Gelaendelieferung, deren GlobalId der Vertrag nennt:
    EINE Site, die Anlage darunter mit ihren acht Bauteilen und zwei Raeumen,
    der Aushub mit IfcRelVoidsElement am gelieferten Gelaende, Prueftor sauber."""
    from app.ifc import verbund as V
    from app.ifc.eigenbau import wirte_herstellen_in
    from app.ifc.pruefe import offen, pruefe
    from app.ifc.tests.test_eigenbau import VERTRAG, _gelieferte_datei, _gitter
    paket = json.loads(RUEB_GELAENDE.read_text(encoding="utf-8"))
    eigen = tmp_path / "eigenbau.ifc"
    bericht = baue_datei(paket, eigen, schluessel="rueb-gelaende")
    assert bericht["uebersprungen"] == []
    gelaende = tmp_path / "gelaende.ifc"
    _gelieferte_datei(gelaende, "IfcGeographicElement", VERTRAG["ur"], _gitter(12, 5.0), "Urgelaende", "TERRAIN")
    ziel = tmp_path / "verbund.ifc"
    V.fuehre_zusammen([V.Quelle(gelaende, name="Urgelaende.ifc", sha256="d" * 64),
                       V.Quelle(eigen, name="CDE-Eigenbau", sha256="e" * 64)],
                      ziel, projektname="RUEB im Gelaende", schluessel="rueb-gelaende",
                      nachbearbeiten=[("wirte", wirte_herstellen_in)])
    datei = ifcopenshell.open(str(ziel))
    (site,) = datei.by_type("IfcSite")
    (anlage,) = datei.by_type("IfcFacility")
    assert [r.RelatingObject for r in datei.by_type("IfcRelAggregates") if anlage in r.RelatedObjects] == [site]
    assert len({e.id() for r in anlage.ContainsElements for e in r.RelatedElements}) == 8
    assert len([e for r in anlage.IsDecomposedBy for e in r.RelatedObjects if e.is_a("IfcSpace")]) == 2
    (aushub,) = datei.by_type("IfcEarthworksCut")
    assert [v.RelatingBuildingElement.GlobalId for v in aushub.VoidsElements] == [VERTRAG["ur"]]
    assert not aushub.ContainedInStructure                    # ein Aushub haengt am Wirt, nie in der Gliederung
    fehl = [b for b in pruefe(ziel, ids=[IDS])["befunde"] if offen(b)]
    assert fehl == [], fehl


# ── Teil XXVII, B3: Oeffnungen ─────────────────────────────────────────────

OEFFNUNG = DATEN / "paket_oeffnung.json"


def test_eine_oeffnung_ist_ein_ifcopeningelement_am_wirt(tmp_path):
    """Das Paket aus `bauwerkeBearbeiten.test.js` (RUEB + Kernbohrung Ø 0,30 in der
    Laengswand Nord, nur ueber Kommandos): EIN IfcOpeningElement, per
    IfcRelVoidsElement an DER Wand, nicht in der Gliederung; die Wand bleibt in
    ihrer Anlage. Mengen: Wand NetVolume 6,653 794 = 6,675 − π · 0,15² · 0,30,
    GrossVolume 6,675; Oeffnung Volume 0,021 206. Prueftor sauber, IDS 0 von 18."""
    from app.ifc.pruefe import offen, pruefe
    paket = json.loads(OEFFNUNG.read_text(encoding="utf-8"))
    ziel = tmp_path / "oeffnung.ifc"
    bericht = baue_datei(paket, ziel, schluessel="oeffnung")
    assert bericht["uebersprungen"] == [] and bericht.get("wirte_offen", 0) == 0
    datei = ifcopenshell.open(str(ziel))
    (loch,) = datei.by_type("IfcOpeningElement")
    assert loch.PredefinedType == "OPENING"
    wand = loch.VoidsElements[0].RelatingBuildingElement
    assert (wand.is_a(), wand.Name) == ("IfcWall", "Längswand Nord")
    assert not loch.ContainedInStructure and not loch.Decomposes
    (anlage,) = datei.by_type("IfcFacility")
    assert wand in [e for r in anlage.ContainsElements for e in r.RelatedElements]
    qto = {(e.Name, q.Name): round(q.VolumeValue, 6) for e in (wand, loch) for r in e.IsDefinedBy
           if r.is_a("IfcRelDefinesByProperties") and r.RelatingPropertyDefinition.is_a("IfcElementQuantity")
           for q in r.RelatingPropertyDefinition.Quantities if q.is_a("IfcQuantityVolume")}
    assert qto[("Längswand Nord", "NetVolume")] == 6.653794
    assert qto[("Längswand Nord", "GrossVolume")] == 6.675
    assert qto[(loch.Name, "Volume")] == 0.021206
    p = pruefe(ziel, ids=[IDS])
    assert [b for b in p["befunde"] if offen(b)] == []
    assert _verfehlt(ziel) == []


# ── Teil XXVII, B7: die Kammer bearbeitet ──────────────────────────────────

KAMMER_BEARBEITET = DATEN / "paket_kammer_bearbeitet.json"


def test_abnahme_die_bearbeitete_kammer_im_ifc(tmp_path):
    """Endstand von `abnahmeBearbeiten.test.js` (nur Kommandos: Bauwerk verschoben
    und kopiert, Bodenplatte +0,20, Oeffnung Ø 0,30, Rohr mit Durchfuehrung Ø 0,40):
    ZWEI Anlagen (Original und Kopie) mit je ihren sieben Teilen, zwei
    IfcOpeningElement an den richtigen Waenden, das Rohr ausserhalb der Anlagen.
    Mengen: Laengswand Nord 3,428 794, Sued 3,412 301 m³ netto.
    Prueftor ohne offenen Befund, IDS 0 von 18."""
    from app.ifc.pruefe import offen, pruefe
    paket = json.loads(KAMMER_BEARBEITET.read_text(encoding="utf-8"))
    ziel = tmp_path / "kammer_bearbeitet.ifc"
    bericht = baue_datei(paket, ziel, schluessel="kammer-bearbeitet")
    assert bericht["uebersprungen"] == [] and bericht.get("wirte_offen", 0) == 0
    datei = ifcopenshell.open(str(ziel))
    anlagen = sorted(datei.by_type("IfcFacility"), key=lambda a: a.Name)
    assert [a.Name for a in anlagen] == ["Kammer", "Kammer Kopie"]
    for a in anlagen:
        assert len({e.id() for r in a.ContainsElements for e in r.RelatedElements}) == 6
        assert len([e for r in a.IsDecomposedBy for e in r.RelatedObjects if e.is_a("IfcSpace")]) == 1
    wirte = sorted(o.VoidsElements[0].RelatingBuildingElement for o in datei.by_type("IfcOpeningElement"))
    assert sorted(w.Name for w in wirte) == ["Längswand Nord", "Längswand Süd"]
    assert all(any(r.RelatingStructure == anlagen[0] for r in w.ContainedInStructure) for w in wirte)
    netto = {e.Name: round(q.VolumeValue, 6) for e in datei.by_type("IfcWall") for r in e.IsDefinedBy
             if r.is_a("IfcRelDefinesByProperties") and r.RelatingPropertyDefinition.is_a("IfcElementQuantity")
             for q in r.RelatingPropertyDefinition.Quantities if q.Name == "NetVolume"
             and any(r2.RelatingStructure == anlagen[0] for r2 in e.ContainedInStructure)}
    assert netto["Längswand Nord"] == 3.428794 and netto["Längswand Süd"] == 3.412301
    (rohr,) = datei.by_type("IfcPipeSegment")
    assert not any(r.RelatingStructure.is_a("IfcFacility") for r in rohr.ContainedInStructure)
    # Fund 14: DN 300 als NominalDiameter in Metern — 0,3, nicht 300.
    dn = [p.NominalValue for r in rohr.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
          and r.RelatingPropertyDefinition.Name == "Pset_PipeSegmentTypeCommon"
          for p in r.RelatingPropertyDefinition.HasProperties if p.Name == "NominalDiameter"]
    assert [(v.is_a(), v.wrappedValue) for v in dn] == [("IfcPositiveLengthMeasure", 0.3)]
    assert [b for b in pruefe(ziel, ids=[IDS])["befunde"] if offen(b)] == []
    assert _verfehlt(ziel) == []


# ── Teil XXVIII, V5: die Einbauten eines Beckens ─────────────────────────────

EINBAUTEN = DATEN / "paket_einbauten.json"


@pytest.fixture(scope="module")
def einbauten(tmp_path_factory):
    from app.ifc.pruefe import pruefe
    paket = json.loads(EINBAUTEN.read_text(encoding="utf-8"))
    ziel = tmp_path_factory.mktemp("einbauten") / "einbauten.ifc"
    bericht = baue_datei(paket, ziel, schluessel="einbauten")
    return {"ziel": ziel, "bericht": bericht, "pruefung": pruefe(ziel, ids=[IDS])}


def _saetze(el) -> dict:
    """Die Merkmale eines Bauteils: {Satz: {Merkmal: (Wert, IFC-Typ)}}."""
    aus = {}
    for r in el.IsDefinedBy:
        d = r.RelatingPropertyDefinition if r.is_a("IfcRelDefinesByProperties") else None
        if d is not None and d.is_a("IfcPropertySet"):
            aus[d.Name] = {p.Name: (p.NominalValue.wrappedValue, p.NominalValue.is_a()) for p in d.HasProperties}
    return aus


def test_abnahme_einbauten_im_ifc(einbauten):
    """Das Paket aus `einbauten.test.js` (nur `fuehreAus`): der RUEB aus der Vorlage
    mit Rechen, Drossel, Tauchwand, Sauberkeitsschicht und Bettung. Klassen und
    Ausfuehrungen aus dem Schema, die hauseigenen Saetze getypt — Q_Dr 25 l/s steht
    als 0,025 IfcVolumetricFlowRateMeasure. Prueftor ohne offenen Befund, IDS 0."""
    from app.ifc.pruefe import offen
    b = einbauten["bericht"]
    assert b["bauteile"] == 13 and b["uebersprungen"] == []
    assert [w for w in b["warnungen"] if "Merkmalssatz" in w or "nicht geschrieben" in w] == []
    assert [x for x in einbauten["pruefung"]["befunde"] if offen(x)] == []
    assert _verfehlt(einbauten["ziel"]) == []
    datei = ifcopenshell.open(str(einbauten["ziel"]))
    (rechen,) = datei.by_type("IfcFilter")
    assert rechen.PredefinedType == "STRAINER"
    assert _saetze(rechen)["Quagg_Rechen"] == {"Stababstand": (0.02, "IfcPositiveLengthMeasure"),
                                                "Reinigungsart": ("maschinell", "IfcLabel")}
    (drossel,) = datei.by_type("IfcValve")
    assert drossel.PredefinedType == "REGULATING"
    q = _saetze(drossel)["Quagg_Drossel"]
    assert q["Drosselabfluss"] == (0.025, "IfcVolumetricFlowRateMeasure")
    assert q["Stauhoehe"] == (2.4, "IfcLengthMeasure")
    (tauch,) = [w for w in datei.by_type("IfcWall") if w.ObjectType == "Tauchwand"]
    assert tauch.PredefinedType == "USERDEFINED"
    schichten = sorted((s.ObjectType, s.PredefinedType) for s in datei.by_type("IfcSlab") if s.PredefinedType == "USERDEFINED")
    assert schichten == [("Bettung", "USERDEFINED"), ("Sauberkeitsschicht", "USERDEFINED")]
    # Alle in der Anlage.
    (anlage,) = datei.by_type("IfcFacility")
    enthalten = {e.GlobalId for r in anlage.ContainsElements for e in r.RelatedElements}
    assert {rechen.GlobalId, drossel.GlobalId, tauch.GlobalId} <= enthalten


# ── Teil XXVIII, V6: die Rigole (Szenario P8) ───────────────────────────────

def test_rigole_traegt_quagg_versickerung_getypt(tmp_path):
    """Ein Kieskoerper IfcCourse/FILTER, 20 × 2 × 1,2 m: der Hohlraumanteil 0,30 als
    IfcRatioMeasure, k_f als IfcLinearVelocityMeasure (Teil XXVIII neu in den
    typisierbaren Typen), das nutzbare Volumen 14,4 m³ — vom Client gerechnet."""
    ziel = tmp_path / "rigole.ifc"
    merkmale = {"Quagg_Versickerung": {"Hohlraumanteil": 0.3, "DurchlaessigkeitKf": 0.0001, "NutzbaresVolumen": 14.4,
                                       "Herleitung": "Annahme der Abnahme, nicht bemessen"}}
    bericht = baue_datei(_paket(_bauteil("cde-rigole", "IFCCOURSE", masse=(20.0, 2.0, 1.2), predefinedType="FILTER",
                                         rezept="rigole", merkmale=merkmale)), ziel, schluessel="rigole")
    assert [w for w in bericht["warnungen"] if "Merkmalssatz" in w or "nicht geschrieben" in w] == []
    datei = ifcopenshell.open(str(ziel))
    (kies,) = datei.by_type("IfcCourse")
    assert kies.PredefinedType == "FILTER"
    assert _saetze(kies)["Quagg_Versickerung"] == {
        "Hohlraumanteil": (0.3, "IfcRatioMeasure"), "DurchlaessigkeitKf": (0.0001, "IfcLinearVelocityMeasure"),
        "NutzbaresVolumen": (14.4, "IfcVolumeMeasure"), "Herleitung": ("Annahme der Abnahme, nicht bemessen", "IfcText")}
    # Ein Paket ohne Bezugssystem — geprueft werden die Regeln des Schemas, nicht die Georeferenz.
    assert _regeln(ziel) == []


# ── Teil XXVIII, V8: Abnahme P7 aus der Vorlage ─────────────────────────────

P7 = DATEN / "paket_p7.json"


def test_abnahme_p7_im_ifc(tmp_path):
    """Das Paket aus `abnahmeP7.test.js` (nur `fuehreAus`, 20 Kommandos): der RUEB
    aus der Vorlage, auf 250 m³ gebracht, mit Einbauten, Zulauf und Ablauf. Das
    Speichervolumen ist ein Messwert — Σ NetVolume der Raeume, 2 · 16,67 · 3 · 2,5
    = 250,05 m³, Soll 250 ± 1 %. Prueftor ohne offenen Befund, IDS 0 von 18."""
    from app.ifc.pruefe import offen, pruefe
    paket = json.loads(P7.read_text(encoding="utf-8"))
    ziel = tmp_path / "p7.ifc"
    bericht = baue_datei(paket, ziel, schluessel="p7")
    assert bericht["uebersprungen"] == []
    assert [w for w in bericht["warnungen"] if "Merkmalssatz" in w or "nicht geschrieben" in w] == []
    assert [b for b in pruefe(ziel, ids=[IDS])["befunde"] if offen(b)] == []
    assert _verfehlt(ziel) == []
    datei = ifcopenshell.open(str(ziel))
    (anlage,) = datei.by_type("IfcFacility")
    raeume = [e for r in anlage.IsDecomposedBy for e in r.RelatedObjects if e.is_a("IfcSpace")]
    netto = [q.VolumeValue for s in raeume for r in s.IsDefinedBy if r.is_a("IfcRelDefinesByProperties")
             and r.RelatingPropertyDefinition.is_a("IfcElementQuantity")
             for q in r.RelatingPropertyDefinition.Quantities if q.Name == "NetVolume"]
    assert len(netto) == 2 and round(sum(netto), 3) == 250.05 and abs(sum(netto) - 250) / 250 < 0.01
    # Zwei Durchfuehrungen, je in ihrer Stirnwand.
    wirte = sorted(r.RelatingBuildingElement.Name for r in datei.by_type("IfcRelVoidsElement"))
    assert wirte == ["Stirnwand Ost", "Stirnwand West"]
    assert {e.is_a() for e in datei.by_type("IfcElement")} >= {"IfcFilter", "IfcValve", "IfcPipeSegment", "IfcSlab", "IfcWall"}


# ── BIMFY I5: der Normschacht, Teil fuer Teil ───────────────────────────────

NORMSCHACHT = DATEN / "paket_normschacht.json"


@pytest.fixture(scope="module")
def normschacht(tmp_path_factory):
    from app.ifc.pruefe import pruefe
    paket = json.loads(NORMSCHACHT.read_text(encoding="utf-8"))
    ziel = tmp_path_factory.mktemp("normschacht") / "normschacht.ifc"
    bericht = baue_datei(paket, ziel, schluessel="normschacht")
    return {"ziel": ziel, "bericht": bericht, "pruefung": pruefe(ziel, ids=[IDS])}


def test_normschacht_im_ifc(normschacht):
    """Das Paket aus `bimfyNormschacht.test.js` (nur `fuehreAus`): ein DN-1000-Schacht aus der
    Vorlage. Der Schacht ist IfcDistributionChamberElement/MANHOLE und das GANZE seiner acht
    Teile (IfcRelAggregates); er selbst steht in der Site. Pset_..TypeManhole getypt, jedes Teil
    nennt seine Herleitung. Prueftor ohne offenen Befund, IDS ohne Verfehlung."""
    from app.ifc.pruefe import offen
    b = normschacht["bericht"]
    assert b["bauteile"] == 8 and b["uebersprungen"] == []
    assert [w for w in b["warnungen"] if "Merkmalssatz" in w or "nicht geschrieben" in w or "unbekannt" in w] == []
    assert [x for x in normschacht["pruefung"]["befunde"] if offen(x)] == []
    assert _verfehlt(normschacht["ziel"]) == []
    datei = ifcopenshell.open(str(normschacht["ziel"]))
    (schacht,) = datei.by_type("IfcDistributionChamberElement")
    assert (schacht.PredefinedType, schacht.Name) == ("MANHOLE", "S1")
    (zerlegt,) = schacht.IsDecomposedBy
    teile = sorted((t.is_a(), t.ObjectType) for t in zerlegt.RelatedObjects)
    assert teile == sorted([("IfcBuildingElementPart", "Schachtunterteil"), ("IfcBuildingElementPart", "Berme mit Gerinne"),
                            ("IfcBuildingElementPart", "Schachtring"), ("IfcBuildingElementPart", "Schachtring"),
                            ("IfcBuildingElementPart", "Konus"), ("IfcBuildingElementPart", "Auflagering"),
                            ("IfcDiscreteAccessory", "Schachtabdeckung"), ("IfcDiscreteAccessory", "Steigeisen")])
    assert all(t.PredefinedType == "USERDEFINED" for t in zerlegt.RelatedObjects)
    # Die Teile sind zerlegt, nicht zusaetzlich enthalten — der Schacht selbst steht in der Site.
    assert all(not t.ContainedInStructure for t in zerlegt.RelatedObjects)
    assert schacht.ContainedInStructure and schacht.ContainedInStructure[0].RelatingStructure.is_a("IfcSite")
    m = _saetze(schacht)["Pset_DistributionChamberElementTypeManhole"]
    assert m["InvertLevel"] == (102.0, "IfcLengthMeasure")
    assert m["WallThickness"] == (0.12, "IfcPositiveLengthMeasure")
    assert m["HasSteps"] == (True, "IfcBoolean")
    assert m["AccessCoverLoadRating"] == ("D 400", "IfcText")
    ring = next(t for t in zerlegt.RelatedObjects if t.ObjectType == "Schachtring")
    assert _saetze(ring)["Quagg_CDE"]["Herleitung"][0].startswith("hoehe: norm — Regelbauhöhe 1000 mm (DIN 4034-1:2020-04")
