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


def test_raumelement_im_bauteilweg_wird_uebersprungen_mit_grund(tmp_path):
    """Fund 1, seit Z1: ein Raumelement im Bauteilweg wird NICHT mehr geschrieben.

    Bis Z1 (Z0 hielt es fest) landete ein IfcSpace in der Enthalten-Beziehung:
    WR31 (Raumelemente duerfen nicht ENTHALTEN sein) und WR41 (ein Raumelement
    muss unter einem anderen ZERLEGT haengen). Jetzt: uebersprungen, mit dem
    Grund aus derselben Regel, und die Datei ist schemagerecht.
    """
    ziel = tmp_path / "raum.ifc"
    bericht = baue_datei(_paket(_bauteil("cde-probe-raum", "IFCSPACE")), ziel, schluessel="probe")
    assert bericht["bauteile"] == 0
    assert [u["cdeId"] for u in bericht["uebersprungen"]] == ["cde-probe-raum"]
    assert "Raumelement" in bericht["uebersprungen"][0]["grund"]
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

    EINE Regel verfehlt sie NEU, und das ist ehrlich so (Fund 9, Fahrplan):
    „Aussenwaende — Brandschutz-Klasse" gilt nur fuer Waende mit IsExternal = TRUE
    und greift erst, WEIL die Waende jetzt als Aussenwand markiert sind. Eine
    Hochbau-Regel (Schwere Warnung, „im Brandschutz-Konzept erwartet"). Fuer eine
    Beckenwand im Erdreich wird keine Feuerwiderstandsklasse erfunden, und die
    kanonische IDS wird nicht ohne Fabio geaendert.
    """
    assert kammer["bericht"]["merkmalsaetze"] == 6
    verfehlt = _verfehlt(kammer["ziel"])
    for regel in ("Decken — Tragend markiert", "Wände — IsExternal markiert", "Wände — Tragend/nichttragend markiert"):
        assert regel not in verfehlt
    assert verfehlt == ["Außenwände — Brandschutz-Klasse"]


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
    assert round(sum(v[2]["NetVolume"] for v in qto.values()), 6) == 22.164
    # Die Messmethode sagt die Wahrheit: KOERPER, nicht Gelaenderaster.
    assert {v[1] for v in qto.values()} == {MENGEN_METHODEN["koerper"]}
    assert kammer["bericht"]["mengen"] == 6
