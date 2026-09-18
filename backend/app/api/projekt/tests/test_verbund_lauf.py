"""Der Verbund-Lauf ueber die ECHTE Schnittstelle: hochladen, Satz, Verbund, Register.

Nichts davon ist nachgebaut. Die Gruppenmodelle gehen ueber `/cde/upload` hinein,
der Satz ueber `/cde/saetze`, der Verbund ueber `/cde/verbund` — genau der Weg,
den die Oberflaeche geht. Der Unterprozess ist der echte, mit dem echten
IFC-venv, dem echten Prueftor und dem zweiten Motor.

Nur der Projektordner ist ein Wegwerfordner (`projekte_wurzel`), nie die
StorageBox: die CDE-Endpunkte schreiben sofort.

Dauer: der Durchstich rechnet einen echten Verbund (~30-60 s). Fehlt das
IFC-venv, wird er mit Begruendung uebersprungen — nicht gruen gemeldet.
"""
import asyncio
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import cde, ordner, projekte, verbund_lauf
from app.api.projekt.router import router

REPO = Path(__file__).resolve().parents[5]
TESTDATEN = REPO / "client/src/features/cde/test"
METER = TESTDATEN / "BIM26_Gruppe5_BODEN_Erdarbeiten.ifc"
MILLI = TESTDATEN / "BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc"

braucht_werkzeug = pytest.mark.skipif(
    not verbund_lauf.python_pfad().is_file(),
    reason=f"IFC-venv fehlt ({verbund_lauf.python_pfad()}) — Einrichtung: backend/app/ifc/README.md")
braucht_daten = pytest.mark.skipif(
    not (METER.is_file() and MILLI.is_file()),
    reason="BricsCAD-Gruppenmodelle liegen nicht im Baum")
# Stufe 3 des Aushub-Fachmodells: das gelieferte Testgelaende + das Paket der
# ECHTEN Kette (Fixture aus `paketVertrag.test.js`, Stufe 2).
ERDKOERPER = REPO / "client/testdata-local/TEST-ERDKOERPER_ENQUIER.ifc"
PAKET_V2 = REPO / "backend/app/ifc/tests/daten/paket_v2.json"
VERTRAG_UR = "1Ur0Gelaende0Vertrag00"
braucht_erdkoerper = pytest.mark.skipif(
    not (ERDKOERPER.is_file() and PAKET_V2.is_file()),
    reason="TEST-ERDKOERPER (client/testdata-local) oder die Paket-Fixture fehlt")


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/FastAPI/projekte")
    app.dependency_overrides[get_current_active_user] = \
        lambda: SimpleNamespace(role="INTERNAL", username="fabio")
    return app


def _hochladen(c, pid, pfad: Path) -> dict:
    with pfad.open("rb") as f:
        r = c.post(f"/FastAPI/projekte/{pid}/cde/upload",
                   files={"datei": (pfad.name, f, "application/octet-stream")})
    assert r.status_code == 201, r.text
    return r.json()


def _warte(c, pid, lauf_id, deckel_s=900) -> dict:
    """Abholen, bis der Lauf fertig ist — so, wie die Oberflaeche es tut."""
    ende = time.time() + deckel_s
    while time.time() < ende:
        r = c.get(f"/FastAPI/projekte/{pid}/cde/verbund/{lauf_id}")
        assert r.status_code == 200, r.text
        st = r.json()
        if st["zustand"] in verbund_lauf.FERTIG and (st["zustand"] != "geprueft" or st.get("dokument")):
            return st
        time.sleep(1.0)
    pytest.fail(f"Verbund-Lauf {lauf_id} wurde in {deckel_s} s nicht fertig")


# ── Der Durchstich ──────────────────────────────────────────────────────────

@braucht_werkzeug
@braucht_daten
def test_verbund_ueber_die_echte_schnittstelle(frische_db, app_conn, projekte_wurzel):
    """Meter und Millimeter aus demselben Programm — ein Verbund, geprueft, im Register."""
    p = projekte.anlegen(app_conn, name="Verbundtest", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        a = _hochladen(c, p["id"], METER)
        b = _hochladen(c, p["id"], MILLI)
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
                   json={"name": "Boden", "zweck": "variante", "enthaelt": [a["sha256"], b["sha256"]]})
        assert r.status_code == 201, r.text
        satz = r.json()

        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": satz["id"]})
        assert r.status_code == 202, r.text
        angenommen = r.json()
        assert set(angenommen["quellen"]) == {METER.name, MILLI.name}
        st = _warte(c, p["id"], angenommen["lauf_id"])

    assert st["zustand"] == "geprueft", st.get("fehler") or st.get("offen")
    ids = {b["id"] for b in st["befunde"]}
    assert {"V01", "V02", "V04", "V08", "SPF", "V09"} <= ids
    # Hinweise (keine IDS hinterlegt, Gherkin nicht eingerichtet) sperren nicht — Fehler schon.
    fehler = [b for b in st["befunde"] if b["ok"] is not True and b.get("schwere", "fehler") == "fehler"]
    assert fehler == [], fehler
    assert st["bericht"]["weltbezug_plausibel"] is True

    dok = st["dokument"]
    assert dok["datei"] == "Verbund_Boden_R01.ifc"
    assert dok["revision"] == 1

    o = ordner.finde(p["id"])
    eintrag = next(d for d in cde.register(o) if d["sha256"] == dok["sha256"])
    assert eintrag["status"] == "WIP" and eintrag["art"] == "modell" and eintrag["vorhanden"]
    h = eintrag["herkunft"]
    assert h["art"] == "verbund" and h["satz_id"] == satz["id"]
    assert {q["sha256"] for q in h["quellen"]} == {a["sha256"], b["sha256"]}
    assert h["schema"] == "IFC4X3_ADD2"
    assert h["pruefung"]["verstoesse"] == 0
    faktoren = {q["datei"]: q["einheit_faktor"] for q in h["quellen"]}
    assert faktoren[MILLI.name] == pytest.approx(0.001)

    # Die Datei im Ordner IST das eingetragene Dokument — gemessen an der Pruefsumme.
    datei = o.pfad / cde.ORDNER / dok["datei"]
    assert hashlib.sha256(datei.read_bytes()).hexdigest() == dok["sha256"]
    # Und sie traegt das Zielschema, nicht nur ihr Eintrag.
    assert b"FILE_SCHEMA(('IFC4X3_ADD2'));" in datei.read_bytes()[:2000]

    # Der Verbund ist KEIN Fachmodell und wandert nicht still in den Satz.
    assert dok["sha256"] not in next(s for s in cde.saetze(o) if s["id"] == satz["id"])["enthaelt"]


# ── Die Regeln drumherum ────────────────────────────────────────────────────

def _projekt_mit_manifest(app_conn, dokumente, saetze, dateien=()):
    p = projekte.anlegen(app_conn, name="Verbundregeln", honorarmodell="pauschal", akteur="pytest")
    o = ordner.finde(p["id"])
    (o.pfad / cde.ORDNER).mkdir(exist_ok=True)
    for name in dateien:
        (o.pfad / cde.ORDNER / name).write_text("ISO-10303-21;\n", encoding="utf-8")
    cde._manifest_schreiben(o, {"version": 1, "projekt_id": o.id,
                                "dokumente": dokumente, "saetze": saetze})
    return p, o


def _dok(sha, datei, **mehr):
    return {"sha256": sha, "datei": datei, "basisname": cde._basisname(datei), "art": "modell",
            "revision": 1, "status": "WIP", **mehr}


def test_ein_verbund_ist_keine_quelle(frische_db, app_conn, projekte_wurzel):
    """Ein Verbund aus Verbuenden enthielte jedes Bauteil zweimal — still, mit Ersatz-Ids."""
    _p, o = _projekt_mit_manifest(
        app_conn,
        [_dok("a" * 64, "Verbund_Boden_R01.ifc", herkunft={"art": "verbund"}),
         _dok("b" * 64, "Kanal.ifc")],
        [{"id": "s-1", "name": "Alles", "enthaelt": ["a" * 64, "b" * 64]}],
        dateien=("Verbund_Boden_R01.ifc", "Kanal.ifc"))
    with pytest.raises(cde.CdeAbgelehnt, match="selbst ein Verbund"):
        verbund_lauf.auftrag_bauen(o, "s-1")


def test_alle_hindernisse_auf_einmal(frische_db, app_conn, projekte_wurzel):
    """Wer fuenf Modelle waehlt, soll nicht fuenfmal starten, um fuenf Gruende zu erfahren."""
    _p, o = _projekt_mit_manifest(
        app_conn,
        [_dok("a" * 64, "Weg.ifc"), _dok("b" * 64, "Zip.ifczip")],
        [{"id": "s-1", "name": "Kaputt", "enthaelt": ["a" * 64, "b" * 64, "c" * 64]}],
        dateien=("Zip.ifczip",))
    with pytest.raises(cde.CdeAbgelehnt) as info:
        verbund_lauf.auftrag_bauen(o, "s-1")
    text = str(info.value)
    assert "Weg.ifc fehlt" in text
    assert "nur .ifc" in text
    assert "nicht mehr im Register" in text


def test_plaene_im_satz_werden_uebergangen(frische_db, app_conn, projekte_wurzel):
    _p, o = _projekt_mit_manifest(
        app_conn,
        [_dok("a" * 64, "Kanal.ifc"),
         {**_dok("b" * 64, "Lageplan.pdf"), "art": "plan"}],
        [{"id": "s-1", "name": "Mit Plan", "enthaelt": ["a" * 64, "b" * 64]}],
        dateien=("Kanal.ifc", "Lageplan.pdf"))
    auftrag = verbund_lauf.auftrag_bauen(o, "s-1")
    assert [q["name"] for q in auftrag["quellen"]] == ["Kanal.ifc"]
    assert auftrag["uebergangen"] == ["Lageplan.pdf"]
    assert auftrag["schluessel"] == f"projekt-{o.id}/satz-s-1"


def test_zweiter_verbund_ist_revision_zwei(frische_db, app_conn, projekte_wurzel):
    """Der Registerbrauch Kanal_R01/Kanal_R02 — und der Name muss ihn ueberstehen."""
    _p, o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Verbund_Boden_R01.ifc", herkunft={"art": "verbund"})], [])
    assert cde.erzeugt_dateiname(o, cde.VERBUND_PRAEFIX, "Boden") == "Verbund_Boden_R02.ifc"
    assert cde._basisname("Verbund_Boden_R02.ifc") == "Verbund_Boden"
    # Ein Schraegstrich im Satznamen darf den Praefix nicht abschneiden.
    assert cde.erzeugt_dateiname(o, cde.VERBUND_PRAEFIX, "Nord/Sued") == "Verbund_Nord_Sued_R01.ifc"
    # Eine Ziffer am Ende des Satznamens bleibt Teil des Namens (seit E3 mit Unterstrich).
    assert cde.erzeugt_dateiname(o, cde.VERBUND_PRAEFIX, "Variante 2") == "Verbund_Variante_2_R01.ifc"
    # Das Erdbau-Dokument desselben Satzes ist eine EIGENE Linie mit eigenem Zaehler.
    assert cde.erzeugt_dateiname(o, cde.ERDBAU_PRAEFIX, "Boden") == "Erdbau_Boden_R01.ifc"


def test_erzeugte_namen_folgen_der_regel(frische_db, app_conn, projekte_wurzel):
    """E3 (Fahrplan Erdbau-Container): Praefix, Satzname in ASCII, Revision — und die Linie ueberlebt die Umstellung."""
    _p, o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Verbund_Boden Nord_R01.ifc", herkunft={"art": "verbund"})], [])
    faelle = {
        (cde.VERBUND_PRAEFIX, "Boden Nord"): "Verbund_Boden_Nord_R02.ifc",       # die alte Linie geht weiter
        (cde.ERDBAU_PRAEFIX, "Böschung Süd"): "Erdbau_Boeschung_Sued_R01.ifc",
        (cde.ERDBAU_PRAEFIX, "Straße  /  Nord."): "Erdbau_Strasse_Nord_R01.ifc",
        (cde.VERBUND_PRAEFIX, "Variante 2.1"): "Verbund_Variante_2_1_R01.ifc",
        (cde.VERBUND_PRAEFIX, "???"): "Verbund_Satz_R01.ifc",
    }
    for (praefix, satz), soll in faelle.items():
        name = cde.erzeugt_dateiname(o, praefix, satz)
        assert name == soll and cde.ERZEUGT_MUSTER.match(name), (satz, name)
    # Eingetragen sagen Name und Register dieselbe Revision — und die Eignung S1.
    quelle = o.pfad / cde.ORDNER / "lauf.ifc"
    quelle.write_text("ISO-10303-21;\n", encoding="utf-8")
    d = cde.erzeugtes_eintragen(app_conn, o, quelle, praefix=cde.VERBUND_PRAEFIX, satz_name="Boden Nord",
                                akteur="pytest", herkunft={"art": "verbund"}, aktion="cde_verbund")
    assert (d["datei"], d["revision"], d["eignung"]) == ("Verbund_Boden_Nord_R02.ifc", 2, "S1")


def test_abgelehnt_wird_nicht_eingetragen(frische_db, app_conn, projekte_wurzel):
    """Ein Verbund, der die Pruefung verfehlt, erscheint nicht im Register."""
    _p, o = _projekt_mit_manifest(app_conn, [], [])
    lauf_id = "v-1-abcdef"
    ordner_l = o.pfad / cde.ORDNER / verbund_lauf.LAUF_ORDNER / lauf_id
    ordner_l.mkdir(parents=True)
    (ordner_l / "verbund.ifc").write_text("ISO-10303-21;\n", encoding="utf-8")
    verbund_lauf._schreibe(ordner_l / "status.json", {"zustand": "abgelehnt", "akteur": "pytest"})
    assert verbund_lauf.eintragen_wenn_fertig(o, lauf_id) is None
    assert cde.register(o) == []


def test_abgerissener_lauf_sagt_es(frische_db, app_conn, projekte_wurzel):
    """Nach einem Server-Neustart darf ein Lauf nicht fuer immer „laeuft" sagen."""
    _p, o = _projekt_mit_manifest(app_conn, [], [])
    lauf_id = "v-2-abcdef"
    ordner_l = o.pfad / cde.ORDNER / verbund_lauf.LAUF_ORDNER / lauf_id
    ordner_l.mkdir(parents=True)
    # pid 1 gehoert init und lebt; eine sicher tote pid braucht einen Wert jenseits
    # von pid_max.
    verbund_lauf._schreibe(ordner_l / "status.json", {"zustand": "laeuft", "pid": 2 ** 30})
    st = verbund_lauf.status(o, lauf_id)
    assert st["zustand"] == "abgebrochen"


@pytest.mark.parametrize("boese", ["../../etc", "v-1-abcdef/../..", "", "repo"])
def test_laufkennung_wird_kein_pfad(frische_db, app_conn, projekte_wurzel, boese):
    _p, o = _projekt_mit_manifest(app_conn, [], [])
    with pytest.raises(cde.CdeUnbekannt):
        verbund_lauf.status(o, boese)


def test_ohne_werkzeug_503(frische_db, app_conn, projekte_wurzel, monkeypatch):
    """Fehlt das IFC-venv, sagt der Server das — er nimmt keinen Auftrag an, den er nicht rechnen kann."""
    p, _o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Kanal.ifc")],
        [{"id": "s-1", "name": "Kanal", "enthaelt": ["a" * 64]}], dateien=("Kanal.ifc",))
    monkeypatch.setenv("IFC_PYTHON", "/nicht/vorhanden/python")
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": "s-1"})
    assert r.status_code == 503, r.text
    assert "IFC-Werkzeug fehlt" in r.json()["detail"]


def test_unbekannter_satz_404(frische_db, app_conn, projekte_wurzel):
    p, _o = _projekt_mit_manifest(app_conn, [], [])
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": "s-gibtsnicht"})
    assert r.status_code == 404, r.text


# ── Stufe 3: Erdbau als Registerdokument ────────────────────────────────────

def _paket(quell_dokumente, wirt=VERTRAG_UR):
    return {"version": 2, "bauteile": [{"klasse": "IFCEARTHWORKSCUT", "cdeId": "cde-a", "wirt": wirt}],
            "quellDokumente": quell_dokumente, "journal": {"commit": "c-1", "sitzungOffen": False}}


def test_erdbau_nimmt_genau_die_dokumente_der_wirte(frische_db, app_conn, projekte_wurzel):
    """Ur-Gelaende ja, Rohrnetz nein — die Rohre kommen erst im grossen Verbund dazu."""
    _p, o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Gelaende.ifc"), _dok("b" * 64, "Kanal.ifc")],
        [{"id": "s-1", "name": "Boden", "enthaelt": ["a" * 64, "b" * 64]}], dateien=("Gelaende.ifc", "Kanal.ifc"))
    a = verbund_lauf.auftrag_bauen(o, "s-1", mit_eigenbau=True, modus="erdbau", paket=_paket(
        [{"sha256": "a" * 64, "datei": "Gelaende.ifc", "revision": 1, "globalIds": [VERTRAG_UR]}]))
    assert [q["name"] for q in a["quellen"]] == ["Gelaende.ifc"]
    assert a["modus"] == "erdbau" and a["schluessel"] == f"projekt-{o.id}/satz-s-1/erdbau"
    assert a["projektname"] == "Boden (Erdbau)"
    assert a["erdbau"]["globalIds"] == {"a" * 64: [VERTRAG_UR]}
    assert a["erdbau"]["journal"] == {"commit": "c-1", "sitzungOffen": False}


@pytest.mark.parametrize("paket, grund", [
    (None, "braucht den Stand der CDE"),
    ({"version": 2, "bauteile": [], "quellDokumente": []}, "keinen Aushub"),
    (_paket([{"sha256": "c" * 64, "datei": "Weg.ifc"}]), "Quelle nicht im Register: Weg.ifc"),
    (_paket([{"sha256": None, "globalIds": [VERTRAG_UR]}]), "liegt in keinem Registerdokument"),
    (_paket([{"sha256": "a" * 64, "datei": "Gelaende.ifc", "globalIds": []}]), f"Wirt ohne Registerdokument: {VERTRAG_UR}"),
    (_paket([{"sha256": "e" * 64, "datei": "Verbund_Boden_R01.ifc", "globalIds": [VERTRAG_UR]}]), "selbst erzeugt"),
])
def test_erdbau_sagt_was_fehlt(frische_db, app_conn, projekte_wurzel, paket, grund):
    _p, o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Gelaende.ifc"), _dok("e" * 64, "Verbund_Boden_R01.ifc", herkunft={"art": "verbund"})],
        [{"id": "s-1", "name": "Boden", "enthaelt": ["a" * 64]}], dateien=("Gelaende.ifc", "Verbund_Boden_R01.ifc"))
    with pytest.raises(cde.CdeAbgelehnt, match=re.escape(grund)):
        verbund_lauf.auftrag_bauen(o, "s-1", mit_eigenbau=paket is not None, modus="erdbau", paket=paket)


def _mit_erdbau(app_conn, enthaelt, *, dazu=()):
    doks = [_dok("a" * 64, "Gelaende.ifc"), _dok("b" * 64, "Kanal.ifc"),
            _dok("e" * 64, "Erdbau_Boden_R01.ifc", herkunft={
                "art": "erdbau", "quellen": [{"sha256": "a" * 64, "datei": "Gelaende.ifc", "revision": 1}]}),
            *dazu]
    return _projekt_mit_manifest(app_conn, doks, [{"id": "s-1", "name": "Alles", "enthaelt": enthaelt}],
                                 dateien=tuple(d["datei"] for d in doks))


def test_im_verbund_faellt_das_gelaende_des_erdbau_dokuments_heraus(frische_db, app_conn, projekte_wurzel):
    """Sonst stuende das Gelaende zweimal im Verbund — einmal mit Aushub, einmal ohne."""
    _p, o = _mit_erdbau(app_conn, ["a" * 64, "e" * 64, "b" * 64])
    a = verbund_lauf.auftrag_bauen(o, "s-1")
    assert [q["name"] for q in a["quellen"]] == ["Erdbau_Boden_R01.ifc", "Kanal.ifc"]
    assert a["weggelassen"] == [{"datei": "Gelaende.ifc", "grund": "steckt in Erdbau_Boden_R01.ifc"}]
    # Erdbau-Dokument UND Live-Stand: der Aushub stuende doppelt.
    with pytest.raises(cde.CdeAbgelehnt, match="zugleich"):
        verbund_lauf.auftrag_bauen(o, "s-1", mit_eigenbau=True)


def test_zwei_erdbau_dokumente_derselben_quelle_werden_abgewiesen(frische_db, app_conn, projekte_wurzel):
    zweites = _dok("f" * 64, "Erdbau_Nord_R01.ifc", herkunft={
        "art": "erdbau", "quellen": [{"sha256": "a" * 64, "datei": "Gelaende.ifc"}]})
    _p, o = _mit_erdbau(app_conn, ["e" * 64, "f" * 64], dazu=(zweites,))
    with pytest.raises(cde.CdeAbgelehnt, match="zwei Erdbau-Dokumente derselben Quelle"):
        verbund_lauf.auftrag_bauen(o, "s-1")


def test_ein_erdbau_aus_einer_anderen_revision_des_gelaendes_ist_veraltet(frische_db, app_conn, projekte_wurzel):
    """Gebaut aus Gelaende R01, der Satz fuehrt R02: zwei Fassungen des Gelaendes waeren im Verbund."""
    r02 = _dok("9" * 64, "Gelaende_R02.ifc", revision=2)
    _p, o = _mit_erdbau(app_conn, ["9" * 64, "e" * 64], dazu=(r02,))
    with pytest.raises(cde.CdeAbgelehnt, match="wurde aus Gelaende.ifc gebaut, der Satz fuehrt Gelaende_R02.ifc"):
        verbund_lauf.auftrag_bauen(o, "s-1")


def test_veraltet_auch_wenn_nur_die_neue_revision_eine_projektkennung_traegt(frische_db, app_conn, projekte_wurzel):
    """R01 vor Stufe 4 registriert (ohne GlobalId), R02 danach (mit) — dieselbe Linie, das Erdbau ist veraltet."""
    r02 = _dok("9" * 64, "Gelaende_R02.ifc", revision=2, projekt_global_id="0Uktvit05mFcrH4auhENsK")
    _p, o = _mit_erdbau(app_conn, ["9" * 64, "e" * 64], dazu=(r02,))
    with pytest.raises(cde.CdeAbgelehnt, match="wurde aus Gelaende.ifc gebaut, der Satz fuehrt Gelaende_R02.ifc"):
        verbund_lauf.auftrag_bauen(o, "s-1")


def test_ein_unbekannter_modus_wird_abgewiesen(frische_db, app_conn, projekte_wurzel):
    _p, o = _mit_erdbau(app_conn, ["a" * 64])
    with pytest.raises(cde.CdeAbgelehnt, match="modus"):
        verbund_lauf.auftrag_bauen(o, "s-1", modus="zauberei")


def _paket_auf_gelaende(gelaende: Path, dok: dict) -> tuple[dict, str]:
    """Das Paket der ECHTEN Kette (Fixture der Stufe 2) auf ein GELIEFERTES Gelaende setzen.

    Wirt, Lage und Bezugssystem kommen aus der Datei selbst: ihre GlobalId, ihr
    erster Punkt, und GK2, wo ihre Koordinaten liegen (TEST-ERDKOERPER deklariert
    UTM32, liegt aber in GK2 — wie ENQUIER, aus dem es gebaut ist).
    """
    text = gelaende.read_text(encoding="latin-1")
    guid = re.search(r"IFCGEOGRAPHICELEMENT\('([0-9A-Za-z_$]{22})'", text).group(1)
    x, y, z = (float(v) for v in re.search(
        r"IFCCARTESIANPOINTLIST3D\(\(\(([-\d.Ee+]+),([-\d.Ee+]+),([-\d.Ee+]+)\)", text).groups())
    paket = json.loads(PAKET_V2.read_text(encoding="utf-8"))
    alt = [min(b["ursprung"][i] for b in paket["bauteile"]) for i in range(3)]
    for b in paket["bauteile"]:
        u = b["ursprung"]
        b["ursprung"] = [x + 10 + u[0] - alt[0], y + 10 + u[1] - alt[1], z - 3 + u[2] - alt[2]]
        if b.get("wirt") == VERTRAG_UR:
            b["wirt"] = guid
        if (b.get("quellen") or {}).get("gelaende") == VERTRAG_UR:
            b["quellen"]["gelaende"] = guid
    paket["crs"] = "EPSG:31466"
    paket["quellDokumente"] = [{"sha256": dok["sha256"], "datei": dok["datei"], "revision": dok["revision"],
                                "globalIds": [guid]}]
    return paket, guid


@braucht_werkzeug
@braucht_erdkoerper
def test_erdbau_als_registerdokument_und_im_verbund(frische_db, app_conn, projekte_wurzel):
    """Stufe 3, die Abnahme — ueber die echte Schnittstelle, mit dem echten Unterprozess.

    Erdbau_<Satz>_R01 aus dem gelieferten Gelaende und dem Paket der echten
    Kette, geprueft wie jeder Verbund; R02 beim zweiten Mal; im Verbund mit
    {Gelaende, Erdbau R02} faellt das Gelaende aus dem Satz — TERRAIN = 1.
    Gezaehlt wird an den DATEIEN, nicht am Bericht.
    """
    p = projekte.anlegen(app_conn, name="Erdbautest", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        gel = _hochladen(c, p["id"], ERDKOERPER)
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
                   json={"name": "Boden", "zweck": "variante", "enthaelt": [gel["sha256"]]})
        assert r.status_code == 201, r.text
        satz = r.json()
        paket, guid = _paket_auf_gelaende(ERDKOERPER, gel)
        roh = json.dumps(paket).encode()

        def erdbau():
            r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": satz["id"], "modus": "erdbau"},
                       files={"eigenbau": ("eigenbau.json", roh, "application/json")})
            assert r.status_code == 202, r.text
            assert r.json()["modus"] == "erdbau" and r.json()["quellen"] == [gel["datei"], "CDE-Eigenbau"]
            return _warte(c, p["id"], r.json()["lauf_id"])

        st1 = erdbau()
        assert st1["zustand"] == "geprueft", st1.get("fehler") or st1.get("offen")
        assert st1["dokument"]["datei"] == "Erdbau_Boden_R01.ifc"
        w = st1["bericht"]["nachbearbeitung"]["wirte"]
        assert (w["geschlossen"], w["fehlende_wirte"]) == (3, [])
        st2 = erdbau()
        assert (st2["dokument"]["datei"], st2["dokument"]["revision"]) == ("Erdbau_Boden_R02.ifc", 2)

        # K3 (Fahrplan Klare Ablaeufe, S3): in dem Satz, aus dem es ausgegeben wurde, ist
        # ein Erdbau-Dokument kein Mitglied — in einem ANDEREN Satz ein normales Modell.
        r = c.put(f"/FastAPI/projekte/{p['id']}/cde/saetze/{satz['id']}",
                  json={"enthaelt": [gel["sha256"], st2["dokument"]["sha256"]]})
        assert r.status_code == 422 and "eigenen Satz" in r.json()["detail"], r.text
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
                   json={"name": "Gesamt", "zweck": "variante", "enthaelt": [gel["sha256"], st2["dokument"]["sha256"]]})
        assert r.status_code == 201, r.text
        gesamt = r.json()
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": gesamt["id"]})
        assert r.status_code == 202, r.text
        assert r.json()["weggelassen"] == [{"datei": gel["datei"], "grund": "steckt in Erdbau_Boden_R02.ifc"}]
        st3 = _warte(c, p["id"], r.json()["lauf_id"])
        assert st3["zustand"] == "geprueft", st3.get("fehler") or st3.get("offen")

        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": gesamt["id"]},
                   files={"eigenbau": ("eigenbau.json", roh, "application/json")})
        assert r.status_code == 422 and "zugleich" in r.json()["detail"], r.text

    o = ordner.finde(p["id"])
    register = {d["sha256"]: d for d in cde.register(o)}
    h = register[st1["dokument"]["sha256"]]["herkunft"]
    assert h["art"] == "erdbau" and h["satz_id"] == satz["id"]
    assert [(q["sha256"], q["globalIds"]) for q in h["quellen"]] == [(gel["sha256"], [guid])]
    assert h["journal"] == {"commit": "c-vertrag", "sitzungOffen": False}
    assert h["pruefung"]["verstoesse"] == 0
    # Seit Teil XX ist jede Werkzeug-Anwendung ein eigener Vorgang: die Fuellung der Fixture
    # (paket_v2.json) ist ihr eigener — 3 Aushuebe, 4 Vorgaenge.
    assert (h["eigenbau"]["version"], h["eigenbau"]["aushuebe"], h["eigenbau"]["vorgaenge"]) == (2, 3, 4)
    assert h["crs_herkunft"] and "Annahme aus den Ostwerten" not in h["crs_herkunft"]
    erdbau_text = (o.pfad / cde.ORDNER / "Erdbau_Boden_R01.ifc").read_text(encoding="latin-1")
    assert erdbau_text.count("IFCGEOGRAPHICELEMENT(") == 1              # das Ur, unveraendert —
    assert f"IFCGEOGRAPHICELEMENT('{guid}'" in erdbau_text                 # mit seiner Original-GlobalId
    assert erdbau_text.count("IFCEARTHWORKSCUT(") == 3
    assert erdbau_text.count("IFCSITE(") == 1                  # Stufe 2: eine Site, auch mit Eigenbau
    # Stufe 3: je Quelle EIN Dokument (Gelaende + CDE-Eigenbau), die Ablage am Gelaende,
    # `Quagg_Herkunft` an jedem Cut und Fill.
    assert erdbau_text.count("IFCDOCUMENTINFORMATION(") == 2
    assert f"'{o.phase}/{o.ordnername}/CDE/{gel['datei']}'" in erdbau_text
    assert erdbau_text.count("'Quagg_Herkunft'") == \
        erdbau_text.count("IFCEARTHWORKSCUT(") + erdbau_text.count("IFCEARTHWORKSFILL(")
    assert erdbau_text.count("IFCELEMENTQUANTITY(") >= 3
    verbund_text = (o.pfad / cde.ORDNER / st3["dokument"]["datei"]).read_text(encoding="latin-1")
    assert verbund_text.count("IFCGEOGRAPHICELEMENT(") == 1              # TERRAIN = 1: das Gelaende fiel aus dem Satz
    assert verbund_text.count("IFCEARTHWORKSCUT(") == 3
    assert verbund_text.count("IFCSITE(") == 1
    eigen = (o.pfad / cde.ORDNER / verbund_lauf.LAUF_ORDNER / st1["lauf_id"] / "eigenbau.ifc").read_text(encoding="latin-1")
    assert "'Boden (CDE-Eigenbau)'" in eigen                       # das Geruest heisst nach dem Satz des Auftrags
    # Stufe 7 (Fahrplan Erdbau-Container). G1: die Gelaendedatei in CDE/ ist nach drei Laeufen, was das
    # Register sagt. G4: R01 und R02 fuehren dieselben Aushub-GlobalIds und dasselbe IfcProject. G6: das
    # Bezugssystem ist das GEMESSENE (GK2), und der Bericht sagt, dass die Quelle anderes deklarierte.
    assert hashlib.sha256((o.pfad / cde.ORDNER / gel["datei"]).read_bytes()).hexdigest() == gel["sha256"]
    r02_text = (o.pfad / cde.ORDNER / st2["dokument"]["datei"]).read_text(encoding="latin-1")

    def aushuebe(t):
        return set(re.findall(r"IFCEARTHWORKSCUT\('([0-9A-Za-z_$]{22})'", t))

    def projekt(t):
        return re.search(r"IFCPROJECT\('([0-9A-Za-z_$]{22})'", t).group(1)

    assert len(aushuebe(erdbau_text)) == 3 and aushuebe(erdbau_text) == aushuebe(r02_text)
    assert projekt(erdbau_text) == projekt(r02_text)
    assert "IFCPROJECTEDCRS('EPSG:31466'" in erdbau_text
    lauf1 = json.loads((o.pfad / cde.ORDNER / verbund_lauf.LAUF_ORDNER / st1["lauf_id"] / "bericht.json")
                       .read_text(encoding="utf-8"))
    assert any("deklariert EPSG:25832" in w and "EPSG:31466" in w for q in lauf1["quellen"] for w in q["warnungen"])
    assert register[st3["dokument"]["sha256"]]["herkunft"]["weggelassen"] == [
        {"datei": gel["datei"], "grund": "steckt in Erdbau_Boden_R02.ifc"}]


def test_ein_dokument_durch_das_prueftor(frische_db, app_conn, projekte_wurzel):
    """Stufe 4b (IFC-Konsistenz): ein Registerdokument durch Syntax, Schema, Regeln und zweiten
    Motor — der Bericht haengt danach am Eintrag, und WIP -> Shared geht."""
    p = projekte.anlegen(app_conn, name="Pruefung", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        d = _hochladen(c, p["id"], METER)
        # Erst die Eingabe, dann die Spur: falsche Dokumente sind 404/422, nie 409.
        plan = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
                      files={"datei": ("Plan.pdf", b"%PDF-1.4", "application/pdf")}).json()
        assert c.post(f"/FastAPI/projekte/{p['id']}/cde/{plan['sha256']}/pruefung").status_code == 422
        assert c.post(f"/FastAPI/projekte/{p['id']}/cde/{'0' * 64}/pruefung").status_code == 404
        assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}/status",
                     json={"status": "Shared"}).status_code == 422          # noch kein Bericht

        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}/pruefung")
        assert r.status_code == 202, r.text
        assert r.json()["lauf_id"].startswith("p-") and r.json()["modus"] == "pruefe"
        st = _warte(c, p["id"], r.json()["lauf_id"])
        assert st["zustand"] == "geprueft", st.get("fehler") or st.get("offen")
        assert st["dokument"]["sha256"] == d["sha256"]
        b = {x["id"]: x for x in st["befunde"]}
        assert b["SPF"]["ok"] is True, b["SPF"]["sagt"][:400]
        assert b["V09"]["ok"] is True, b["V09"]["sagt"][-400:]         # web-ifc zaehlt dasselbe wie ifcopenshell
        assert b["V08"]["schwere"] == "warnung"                        # eine Lieferung ist kein Verbund
        assert c.put(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}/status",
                     json={"status": "Shared"}).status_code == 200
    eintrag = next(x for x in cde.register(ordner.finde(p["id"])) if x["sha256"] == d["sha256"])
    assert eintrag["pruefung"]["verstoesse"] == 0 and eintrag["pruefung"]["lauf_id"].startswith("p-")
    assert {x["id"] for x in eintrag["pruefung"]["befunde"]} >= {"SPF", "V01", "V09", "IDS", "GHERKIN"}


def test_das_regelwerk_des_projekts_geht_in_jede_pruefung(frische_db, app_conn, projekte_wurzel):
    """Stufe 5: ein hochgeladenes IDS-Regelwerk wird mitgeprueft — als Warnung, nicht als Sperre."""
    from pathlib import Path
    starter = Path(__file__).parents[3] / "ifc" / "daten" / "quagg-starter.ids"
    p = projekte.anlegen(app_conn, name="Regelwerk", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
                   files={"datei": ("Anforderungen.ids", starter.read_bytes(), "application/xml")})
        assert r.status_code == 201 and r.json()["art"] == "regelwerk", r.text
        d = _hochladen(c, p["id"], METER)
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/{d['sha256']}/pruefung")
        assert r.status_code == 202, r.text
        st = _warte(c, p["id"], r.json()["lauf_id"])
        assert st["zustand"] == "geprueft", st.get("fehler") or st.get("offen")
    ids = [b for b in st["befunde"] if b.get("stufe") == "ids"]
    assert len(ids) == 18, [b["id"] for b in ids]
    rot = [(b["titel"].split(" (")[0], b["zahl"]) for b in ids if b["ok"] is False]
    # Die BODEN-Lieferung: zwei Schuettungen ohne Qto_EarthworksFillBaseQuantities.CompactedVolume.
    assert rot == [("Auftrag — Mengen nach bSI-Vorlage", 2)]
    eintrag = next(x for x in cde.register(ordner.finde(p["id"])) if x["sha256"] == d["sha256"])
    assert eintrag["pruefung"]["verstoesse"] == 0                       # Warnungen sperren nicht
    assert eintrag["pruefung"]["ids"] == ["ids-01-Anforderungen.ids"]
    # Stufe 6: der GANZE Bericht — jeder Befund mit Text und Beispielen, nicht die Kurzform des Status.
    with TestClient(_app()) as c:
        r = c.get(f"/FastAPI/projekte/{p['id']}/cde/verbund/{st['lauf_id']}/bericht")
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/json"), r.text
        voll = r.json()
        assert [b["id"] for b in voll["befunde"]] == [b["id"] for b in st["befunde"]]
        assert voll["verstoesse"] == 0 and all("sagt" in b and "beispiele" in b for b in voll["befunde"])
        assert c.get(f"/FastAPI/projekte/{p['id']}/cde/verbund/p-0-000000/bericht").status_code == 404
        assert c.get(f"/FastAPI/projekte/{p['id']}/cde/verbund/nicht-da/bericht").status_code == 404


def test_das_buero_regelwerk_kommt_vor_dem_des_projekts(frische_db, app_conn, projekte_wurzel, tmp_path, monkeypatch):
    """Stufe 5: Buero-IDS (Buero-Repository, Schluessel `ids:`) gelten in jedem Projekt und stehen vorn."""
    monkeypatch.setenv("BUERO_ROOT", str(tmp_path / "0_Buero"))
    starter = Path(__file__).parents[3] / "ifc" / "daten" / "quagg-starter.ids"
    cde.buero_repo_setzen("ids:starter", {"datei": "quagg-starter.ids", "xml": starter.read_text(encoding="utf-8")})
    p = projekte.anlegen(app_conn, name="Buero-IDS", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/upload",
                   files={"datei": ("Anforderungen.ids", starter.read_bytes(), "application/xml")})
        assert r.status_code == 201, r.text
    lauf = tmp_path / "lauf"
    lauf.mkdir()
    namen = verbund_lauf._ids_ablegen(ordner.finde(p["id"]), lauf)
    assert namen == ["ids-b01-quagg-starter.ids", "ids-01-Anforderungen.ids"]
    assert [(lauf / n).read_bytes() for n in namen] == [starter.read_bytes()] * 2


@braucht_werkzeug
@braucht_erdkoerper
def test_ein_eigenbau_mit_misserfolg_kommt_nicht_ins_register(frische_db, app_conn, projekte_wurzel):
    """Fahrplan Erdbau-Container, Stufe 1 — der Befund aus Projekt 1337 als Durchstich.

    Zwei Aushuebe liessen sich nicht ableiten (tote Gelaende-Quelle); der Verbund
    lief trotzdem durch und kam als „geprueft, 0 Verstoesse" ins Register. Jetzt
    sperrt V10: dasselbe Paket mit einem Misserfolg wird abgelehnt, nichts wird
    eingetragen — der Grund steht im Status.
    """
    p = projekte.anlegen(app_conn, name="Misserfolg", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        gel = _hochladen(c, p["id"], ERDKOERPER)
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
                   json={"name": "Boden", "zweck": "variante", "enthaelt": [gel["sha256"]]})
        assert r.status_code == 201, r.text
        paket, _guid = _paket_auf_gelaende(ERDKOERPER, gel)
        paket["misserfolge"] = [{"globalId": "cde-tot-aushub",
                                 "grund": "Quelle „cde-mtvxl4co-0tcaoz38\" (gelaende) nicht ableitbar — nicht im Modell"}]
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": r.json()["id"], "modus": "erdbau"},
                   files={"eigenbau": ("eigenbau.json", json.dumps(paket).encode(), "application/json")})
        assert r.status_code == 202, r.text
        st = _warte(c, p["id"], r.json()["lauf_id"])
    assert st["zustand"] == "abgelehnt", st
    assert any(z.startswith("V10 ") for z in st["offen"]), st["offen"]
    v10 = next(b for b in st["befunde"] if b["id"] == "V10")
    assert v10["zahl"] == 1 and v10["beispiele"][0].startswith("cde-tot-aushub")
    assert not st.get("dokument")
    assert not [d for d in cde.register(ordner.finde(p["id"])) if d["datei"].startswith("Erdbau_")]


def test_ein_fertiger_lauf_belegt_die_spur_nicht_mehr(tmp_path, monkeypatch):
    """Der 409-Wettlauf (2026-09-11): der Status-Abruf traegt einen fertigen Lauf ein,
    der Hintergrund-Task gibt die Spur erst Millisekunden spaeter frei — ein
    Folgeauftrag in dieser Luecke bekam „es laeuft schon ein Verbund". Belegt ist
    die Spur nur, solange der Status nicht fertig ist (bei „geprueft": eingetragen).
    """
    monkeypatch.setattr(verbund_lauf, "python_pfad", lambda: Path(sys.executable))
    schleife = asyncio.new_event_loop()
    halt = asyncio.Event()
    task = schleife.create_task(halt.wait())            # haengt, bis er abgebrochen wird
    try:
        laufordner = tmp_path / "v-1-abcdef"
        laufordner.mkdir()
        monkeypatch.setitem(verbund_lauf._laufend, "v-1-abcdef", task)
        monkeypatch.setitem(verbund_lauf._ordner_der_laeufe, "v-1-abcdef", laufordner)

        def status(**st):
            (laufordner / "status.json").write_text(json.dumps(st), encoding="utf-8")

        for belegt in ({"zustand": "wartet"}, {"zustand": "laeuft"}, {"zustand": "geprueft"}):
            status(**belegt)
            with pytest.raises(verbund_lauf.VerbundBesetzt):
                verbund_lauf._spur_und_werkzeug()
        for frei in ({"zustand": "geprueft", "dokument": {"datei": "Erdbau_Boden_R01.ifc"}},
                     {"zustand": "abgelehnt"}, {"zustand": "fehler"}):
            status(**frei)
            verbund_lauf._spur_und_werkzeug()
        assert "v-1-abcdef" in verbund_lauf._laufend       # der Task bleibt referenziert
    finally:
        task.cancel()
        schleife.run_until_complete(asyncio.gather(task, return_exceptions=True))
        schleife.close()



# ── S4 neu: Ausgeben als Auswahlbaum ────────────────────────────────────────

def test_nur_die_angehakten_modelle(frische_db, app_conn, projekte_wurzel):
    """Der Auswahlbaum: nur die angehakten Modelle gehen hinein, das Abgewaehlte steht dabei."""
    _p, o = _projekt_mit_manifest(
        app_conn,
        [_dok("a" * 64, "Kanal.ifc"), _dok("b" * 64, "Gelaende.ifc"),
         {**_dok("c" * 64, "Lageplan.pdf"), "art": "plan"}],
        [{"id": "s-1", "name": "Nord", "enthaelt": ["a" * 64, "b" * 64, "c" * 64]}],
        dateien=("Kanal.ifc", "Gelaende.ifc", "Lageplan.pdf"))
    a = verbund_lauf.auftrag_bauen(o, "s-1", modelle=["b" * 64])
    assert [q["name"] for q in a["quellen"]] == ["Gelaende.ifc"]
    assert a["abgewaehlt"] == ["Kanal.ifc"] and a["uebergangen"] == ["Lageplan.pdf"]
    # Ohne Auswahl der ganze Satz — wie bisher.
    ganz = verbund_lauf.auftrag_bauen(o, "s-1")
    assert [q["name"] for q in ganz["quellen"]] == ["Kanal.ifc", "Gelaende.ifc"] and ganz["abgewaehlt"] == []
    with pytest.raises(cde.CdeAbgelehnt, match="nicht im Satz"):
        verbund_lauf.auftrag_bauen(o, "s-1", modelle=["d" * 64])
    with pytest.raises(cde.CdeAbgelehnt, match="kein Modell angehakt"):
        verbund_lauf.auftrag_bauen(o, "s-1", modelle=[])
    assert verbund_lauf.auftrag_bauen(o, "s-1", modelle=[], mit_eigenbau=True)["quellen"] == []


def test_modellauswahl_muss_eine_liste_sein(frische_db, app_conn, projekte_wurzel):
    p, _o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Kanal.ifc")],
        [{"id": "s-1", "name": "Kanal", "enthaelt": ["a" * 64]}], dateien=("Kanal.ifc",))
    with TestClient(_app()) as c:
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": "s-1", "modelle": "kein json"})
    assert r.status_code == 422, r.text
    assert "JSON-Liste" in r.json()["detail"]


@braucht_werkzeug
def test_autor_und_organisation_reisen_getrennt_vom_akteur(frische_db, app_conn, projekte_wurzel, monkeypatch):
    """Der Anmeldename bleibt der Akteur (Register); in die Datei kommt, wer im Dialog steht."""
    _p, o = _projekt_mit_manifest(
        app_conn, [_dok("a" * 64, "Kanal.ifc"), _dok("b" * 64, "Gelaende.ifc")],
        [{"id": "s-1", "name": "Nord", "enthaelt": ["a" * 64, "b" * 64]}], dateien=("Kanal.ifc", "Gelaende.ifc"))

    async def _nichts(*_a, **_k):
        return None
    monkeypatch.setattr(verbund_lauf, "_fahre", _nichts)
    antwort = asyncio.run(verbund_lauf.starte(o, "s-1", akteur="fabio", autor=" Anna Muster ",
                                              organisation="Ingenieurbuero Muster", modelle=["a" * 64]))
    assert antwort["abgewaehlt"] == ["Gelaende.ifc"]
    auftrag = json.loads((verbund_lauf._laufordner(o, antwort["lauf_id"]) / "auftrag.json").read_text())
    assert (auftrag["autor"], auftrag["organisation"], auftrag["bearbeiter"]) == \
        ("Anna Muster", "Ingenieurbuero Muster", "fabio")
    assert [q["name"] for q in auftrag["quellen"]] == ["Kanal.ifc"]


@braucht_werkzeug
@braucht_erdkoerper
def test_weggelassen_kommt_ins_register_mit_autor(frische_db, app_conn, projekte_wurzel):
    """S4 neu, die Zahl des Fahrplans: derselbe Misserfolg — im Auswahlbaum weggelassen.

    V10 sperrt 1 -> 0, das Erdbau-Dokument kommt ins Register, und es sagt, was
    fehlt (Quagg_Fachmodell.Ausgelassen, herkunft.eigenbau.ausgelassen) und wer es
    ausgab (FILE_NAME, IfcOwnerHistory) — Autor und Organisation aus dem Dialog.
    """
    p = projekte.anlegen(app_conn, name="Weggelassen", honorarmodell="pauschal", akteur="pytest")
    with TestClient(_app()) as c:
        gel = _hochladen(c, p["id"], ERDKOERPER)
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/saetze",
                   json={"name": "Boden", "zweck": "variante", "enthaelt": [gel["sha256"]]})
        assert r.status_code == 201, r.text
        paket, _guid = _paket_auf_gelaende(ERDKOERPER, gel)
        paket["misserfolge"] = [{"globalId": "cde-tot-aushub", "grund": "Rohr fehlt"}]
        paket["ausgelassen"] = [{"globalId": "cde-tot-aushub", "vorgang": "Kanalgraben Nord",
                                 "grund": "nicht baubar, weggelassen"}]
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund",
                   data={"satz_id": r.json()["id"], "modus": "erdbau", "autor": "Anna Muster",
                         "organisation": "Ingenieurbuero Muster"},
                   files={"eigenbau": ("eigenbau.json", json.dumps(paket).encode(), "application/json")})
        assert r.status_code == 202, r.text
        assert r.json()["abgewaehlt"] == []
        st = _warte(c, p["id"], r.json()["lauf_id"])
    assert st["zustand"] == "geprueft", st.get("fehler") or st.get("offen")
    v10 = next(b for b in st["befunde"] if b["id"] == "V10")
    assert v10["ok"] is True and "1 bewusst weggelassen" in v10["sagt"], v10["sagt"]
    o = ordner.finde(p["id"])
    eintrag = next(d for d in cde.register(o) if d["sha256"] == st["dokument"]["sha256"])
    h = eintrag["herkunft"]
    assert (h["eigenbau"]["ausgelassen"], h["eigenbau"]["ausgelassene_vorgaenge"]) == (1, ["Kanalgraben Nord"])
    assert (h.get("autor"), h.get("organisation")) == ("Anna Muster", "Ingenieurbuero Muster")
    text = (o.pfad / cde.ORDNER / st["dokument"]["datei"]).read_text(encoding="latin-1")
    assert re.search(r"FILE_NAME\('[^']*','[^']*',\('Anna Muster'\),\('Ingenieurbuero Muster'\)", text)
    assert "'Ausgelassen'" in text and "'Kanalgraben Nord'" in text
