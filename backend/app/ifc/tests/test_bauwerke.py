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
    assert kammer["bericht"]["merkmalsaetze"] == 6
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
    assert wand[2] == {"Length": 4.6, "Width": 0.3, "Height": 2.5, "NetVolume": 3.45}
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
