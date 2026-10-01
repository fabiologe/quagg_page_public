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


def test_probe_eigene_platte_verfehlt_heute_die_ids(tmp_path):
    """Fund 2, STAND VOR Z3: der Eigenbau schreibt keinen bSI-Merkmalssatz."""
    ziel = tmp_path / "platte.ifc"
    baue_datei(_paket(_bauteil("cde-probe-platte", "IFCSLAB")), ziel, schluessel="probe")
    assert _verfehlt(ziel) == ["Decken — Tragend markiert"]


def test_probe_bauteil_ohne_geometrie_wird_uebersprungen(tmp_path):
    """Fund 4: ein Paket-Bauteil braucht einen Koerper. Bleibt so — Bauwerke
    kommen in Z5 ueber einen EIGENEN Schluessel, nicht als Bauteil ohne Geometrie."""
    ohne = {"cdeId": "cde-probe-leer", "klasse": "IFCSLAB", "punkte": [], "dreiecke": []}
    bericht = baue_datei(_paket(ohne), tmp_path / "leer.ifc", schluessel="probe")
    assert bericht["bauteile"] == 0
    assert bericht["uebersprungen"] == [{"cdeId": "cde-probe-leer", "grund": "ohne Geometrie"}]
