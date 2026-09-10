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
import hashlib
import json
import re
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
    assert all(b["ok"] is True for b in st["befunde"]), [b for b in st["befunde"] if b["ok"] is not True]
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
    # Eine Ziffer am Ende des Satznamens bleibt Teil des Namens.
    assert cde.erzeugt_dateiname(o, cde.VERBUND_PRAEFIX, "Variante 2") == "Verbund_Variante 2_R01.ifc"
    # Das Erdbau-Dokument desselben Satzes ist eine EIGENE Linie mit eigenem Zaehler.
    assert cde.erzeugt_dateiname(o, cde.ERDBAU_PRAEFIX, "Boden") == "Erdbau_Boden_R01.ifc"


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

        r = c.put(f"/FastAPI/projekte/{p['id']}/cde/saetze/{satz['id']}",
                  json={"enthaelt": [gel["sha256"], st2["dokument"]["sha256"]]})
        assert r.status_code == 200, r.text
        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": satz["id"]})
        assert r.status_code == 202, r.text
        assert r.json()["weggelassen"] == [{"datei": gel["datei"], "grund": "steckt in Erdbau_Boden_R02.ifc"}]
        st3 = _warte(c, p["id"], r.json()["lauf_id"])
        assert st3["zustand"] == "geprueft", st3.get("fehler") or st3.get("offen")

        r = c.post(f"/FastAPI/projekte/{p['id']}/cde/verbund", data={"satz_id": satz["id"]},
                   files={"eigenbau": ("eigenbau.json", roh, "application/json")})
        assert r.status_code == 422 and "zugleich" in r.json()["detail"], r.text

    o = ordner.finde(p["id"])
    register = {d["sha256"]: d for d in cde.register(o)}
    h = register[st1["dokument"]["sha256"]]["herkunft"]
    assert h["art"] == "erdbau" and h["satz_id"] == satz["id"]
    assert [(q["sha256"], q["globalIds"]) for q in h["quellen"]] == [(gel["sha256"], [guid])]
    assert h["journal"] == {"commit": "c-vertrag", "sitzungOffen": False}
    assert h["pruefung"]["verstoesse"] == 0
    assert (h["eigenbau"]["version"], h["eigenbau"]["aushuebe"], h["eigenbau"]["vorgaenge"]) == (2, 3, 3)
    assert h["crs_herkunft"] and "Annahme aus den Ostwerten" not in h["crs_herkunft"]
    erdbau_text = (o.pfad / cde.ORDNER / "Erdbau_Boden_R01.ifc").read_text(encoding="latin-1")
    assert erdbau_text.count("IFCGEOGRAPHICELEMENT(") == 1              # das Ur, unveraendert —
    assert f"IFCGEOGRAPHICELEMENT('{guid}'" in erdbau_text                 # mit seiner Original-GlobalId
    assert erdbau_text.count("IFCEARTHWORKSCUT(") == 3
    assert erdbau_text.count("IFCELEMENTQUANTITY(") >= 3
    verbund_text = (o.pfad / cde.ORDNER / st3["dokument"]["datei"]).read_text(encoding="latin-1")
    assert verbund_text.count("IFCGEOGRAPHICELEMENT(") == 1              # TERRAIN = 1: das Gelaende fiel aus dem Satz
    assert verbund_text.count("IFCEARTHWORKSCUT(") == 3
    assert register[st3["dokument"]["sha256"]]["herkunft"]["weggelassen"] == [
        {"datei": gel["datei"], "grund": "steckt in Erdbau_Boden_R02.ifc"}]
