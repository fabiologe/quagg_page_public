"""
Geometrie-Stände: benannte Speicherstände der Fallgeometrie.

Der wichtigste Test ist der erste: ein Stand muss die MUTABLEN Begleiter
mitnehmen. `sculpt.npz` wird bei jedem Pinselstrich unter demselben Namen
überschrieben, und die gedrehten Geländeraster tragen einen Stempel aus
der Gittergeometrie statt aus ihrem Inhalt — ein Stand, der nur die
Spezifikation sichert, zeigt nach dem Zurückholen auf fremde Daten.
"""
from __future__ import annotations

import json

import pytest

from ..core.staende import (AUTO_BEHALTEN, StandFehler, staende_liste,
                            stand_anlegen, stand_laden, stand_loeschen)
from . import synthetic_case as syn


@pytest.fixture()
def fall(tmp_path):
    """Fallordner mit allem, was einen Stand ausmacht: Spec, Pinsel-Ebene,
    Ableitung, Importquelle — und der teuren Netzvorschau."""
    d = tmp_path / "demo"
    (d / "derived" / "mesh_preview").mkdir(parents=True)
    (d / "imports" / "imp-1").mkdir(parents=True)
    syn.build_spec().to_yaml(d / "case.yaml")
    (d / "sculpt.npz").write_bytes(b"PINSEL-A")
    (d / "derived" / "gelaende_gedreht_42.asc").write_text("RASTER-A")
    (d / "imports" / "imp-1" / "manifest.json").write_text('{"quelle": "a.dxf"}')
    (d / "derived" / "mesh_preview" / "polyMesh").write_bytes(b"X" * 5000)
    return d


def test_stand_nimmt_die_mutablen_begleiter_mit(fall):
    """Spec, Pinsel-Ebene und Ableitungsraster kommen zurück — die
    Netzvorschau bleibt draußen (Ableitung zu EINEM netz_hash, MB-schwer)."""
    stand = stand_anlegen(fall, "Ausgangslage")

    kopie = fall / "staende" / stand["id"]
    assert (kopie / "case.yaml").is_file()
    assert (kopie / "sculpt.npz").read_bytes() == b"PINSEL-A"
    assert (kopie / "derived" / "gelaende_gedreht_42.asc").read_text() == "RASTER-A"
    assert (kopie / "imports" / "imp-1" / "manifest.json").is_file()
    assert not (kopie / "derived" / "mesh_preview").exists()
    assert stand["case_hash"] and stand["quelle"] == "hand"
    assert stand["groesse_mb"] < 0.1          # ohne Vorschau ist ein Stand winzig


def test_laden_holt_den_alten_zustand_zurueck(fall):
    stand = stand_anlegen(fall, "Ausgangslage")

    # weiterarbeiten: Pinsel neu, Raster neu, Import dazu, Vorschau gerechnet
    (fall / "sculpt.npz").write_bytes(b"PINSEL-B")
    (fall / "derived" / "gelaende_gedreht_42.asc").write_text("RASTER-B")
    (fall / "imports" / "imp-2").mkdir()
    (fall / "imports" / "imp-2" / "manifest.json").write_text("{}")

    erg = stand_laden(fall, stand["id"])

    assert (fall / "sculpt.npz").read_bytes() == b"PINSEL-A"
    assert (fall / "derived" / "gelaende_gedreht_42.asc").read_text() == "RASTER-A"
    # was es damals nicht gab, ist auch wieder weg
    assert not (fall / "imports" / "imp-2").exists()
    # die Vorschau gehörte zur ersetzten Geometrie
    assert not (fall / "derived" / "mesh_preview").exists()
    # und der Sprung ist umkehrbar: der Zustand von eben liegt gesichert da
    assert erg["auto_stand"]["name"].startswith("vor Laden von Ausgangslage")
    auto = fall / "staende" / erg["auto_stand"]["id"]
    assert (auto / "sculpt.npz").read_bytes() == b"PINSEL-B"


def test_laden_laesst_die_staende_selbst_in_ruhe(fall):
    a = stand_anlegen(fall, "A")
    b = stand_anlegen(fall, "B")
    stand_laden(fall, a["id"])
    ids = {s["id"] for s in staende_liste(fall)}
    assert {a["id"], b["id"]} <= ids


def test_auto_staende_werden_gedeckelt(fall):
    ziel = stand_anlegen(fall, "Ziel")
    for _ in range(AUTO_BEHALTEN + 3):
        stand_laden(fall, ziel["id"])
    autos = [s for s in staende_liste(fall) if s["quelle"] == "auto"]
    assert len(autos) == AUTO_BEHALTEN
    # von Hand benannte Stände bleiben unangetastet
    assert any(s["id"] == ziel["id"] for s in staende_liste(fall))


def test_liste_jungster_zuerst_und_loeschen(fall):
    a = stand_anlegen(fall, "erster")
    b = stand_anlegen(fall, "zweiter")
    assert [s["id"] for s in staende_liste(fall)][:2] == [b["id"], a["id"]]
    stand_loeschen(fall, a["id"])
    assert [s["id"] for s in staende_liste(fall)] == [b["id"]]
    with pytest.raises(StandFehler):
        stand_laden(fall, a["id"])


def test_stand_aus_lauf_legt_die_laufgeometrie_ueber_den_fall(fall, tmp_path):
    """
    Der Lauf sichert nur case.yaml + Datenreferenzen. Der Stand daraus
    muss trotzdem vollständig sein: erst der heutige Fall (Importquellen),
    dann die Geometrie von damals darüber.
    """
    spec_dir = tmp_path / "run" / "spec"
    spec_dir.mkdir(parents=True)
    (spec_dir / "case.yaml").write_text((fall / "case.yaml").read_text())
    (spec_dir / "sculpt.npz").write_bytes(b"PINSEL-DAMALS")

    (fall / "sculpt.npz").write_bytes(b"PINSEL-HEUTE")
    stand = stand_anlegen(fall, "aus Lauf demo_r001", quelle="lauf:demo_r001",
                          ueberlagern=spec_dir)

    kopie = fall / "staende" / stand["id"]
    assert (kopie / "sculpt.npz").read_bytes() == b"PINSEL-DAMALS"   # überlagert
    assert (kopie / "imports" / "imp-1" / "manifest.json").is_file()  # aus dem Fall
    assert stand["quelle"] == "lauf:demo_r001"


@pytest.fixture()
def api(tmp_path, monkeypatch):
    """Router mit eigener Fall- und Laufablage — der Vertrag, gegen den
    die Oberfläche baut."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from ..router import router

    cases, runs = tmp_path / "cases", tmp_path / "runs"
    (cases / "demo").mkdir(parents=True)
    syn.build_spec().to_yaml(cases / "demo" / "case.yaml")
    (cases / "demo" / "sculpt.npz").write_bytes(b"PINSEL-A")
    runs.mkdir()
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(cases))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(runs))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), cases, runs


def test_endpunkte_anlegen_laden_loeschen(api):
    client, cases, _ = api

    assert client.get("/cases/demo/staende").json()["staende"] == []
    stand = client.post("/cases/demo/staende",
                        json={"name": "Ausgangslage"}).json()["stand"]
    assert stand["name"] == "Ausgangslage"
    assert len(client.get("/cases/demo/staende").json()["staende"]) == 1

    (cases / "demo" / "sculpt.npz").write_bytes(b"PINSEL-B")
    antwort = client.post(f"/cases/demo/staende/{stand['id']}/laden").json()
    assert antwort["ok"] and antwort["case_hash"]
    assert antwort["auto_stand"]["id"]
    assert (cases / "demo" / "sculpt.npz").read_bytes() == b"PINSEL-A"

    assert client.delete(f"/cases/demo/staende/{stand['id']}").json()["ok"]
    assert stand["id"] not in {s["id"] for s in
                               client.get("/cases/demo/staende").json()["staende"]}
    # unbekannter Stand: 404 statt Serverfehler
    assert client.post("/cases/demo/staende/gibtsnicht/laden").status_code == 404


def test_endpunkt_geometrie_aus_lauf(api):
    client, cases, runs = api
    lauf = runs / "demo_r001"
    lauf.mkdir()
    (lauf / "manifest.json").write_text(json.dumps({"status": "completed"}))

    # Altlauf ohne gesicherte Geometrie: klare 409 statt stiller Kopie
    antwort = client.post("/runs/demo_r001/geometrie-als-stand")
    assert antwort.status_code == 409
    assert "vor den Ständen" in antwort.json()["detail"]

    (lauf / "spec").mkdir()
    (lauf / "spec" / "case.yaml").write_text(
        (cases / "demo" / "case.yaml").read_text())
    (lauf / "spec" / "sculpt.npz").write_bytes(b"PINSEL-DAMALS")

    stand = client.post("/runs/demo_r001/geometrie-als-stand").json()["stand"]
    assert stand["quelle"] == "lauf:demo_r001"
    kopie = cases / "demo" / "staende" / stand["id"]
    assert kopie.joinpath("sculpt.npz").read_bytes() == b"PINSEL-DAMALS"
    # und die Laufliste sagt jetzt, dass dieser Lauf seine Geometrie trägt
    zeile = next(r for r in client.get("/runs").json()
                 if r["run_id"] == "demo_r001")
    assert zeile["spec_gesichert"] is True


def test_fall_ohne_spec_gibt_klaren_fehler(tmp_path):
    leer = tmp_path / "leer"
    leer.mkdir()
    with pytest.raises(StandFehler, match="case.yaml"):
        stand_anlegen(leer, "geht nicht")


def test_spec_sichern_legt_genau_die_referenzliste_ab(tmp_path):
    """Was ein Lauf mitnimmt: die Spec und jede Datei, auf die sie zeigt —
    dieselbe Liste, die auch das Bundle einpackt."""
    from ..core.bundle import spec_sichern

    case_dir = tmp_path / "fall"
    case_dir.mkdir()
    spec = syn.build_spec()
    spec.to_yaml(case_dir / "case.yaml")
    for name in spec.datei_referenzen():
        p = case_dir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"DATEN")

    gesichert = spec_sichern(spec, case_dir, tmp_path / "run" / "spec")

    assert gesichert[0] == "case.yaml"
    assert set(gesichert[1:]) == set(spec.datei_referenzen())
    for name in gesichert:
        assert (tmp_path / "run" / "spec" / name).is_file()


def test_lauf_traegt_hashes_ab_dem_start_und_ueberlebt_den_import(tmp_path):
    """
    Die Hashes standen bisher nur im Ergebnis — gescheiterte Läufe hatten
    keine. Jetzt schreibt der Start sie, und der Artefakt-Import (der das
    Manifest im Ganzen überschreibt) darf sie nicht wieder wegnehmen.
    """
    import io
    import zipfile

    from .. import laufwerk

    run_root = tmp_path / "runs" / "demo_r001"
    run_root.mkdir(parents=True)
    case_dir = tmp_path / "fall"
    case_dir.mkdir()
    spec = syn.build_spec()
    spec.to_yaml(case_dir / "case.yaml")
    for name in spec.datei_referenzen():
        p = case_dir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"DATEN")

    laufwerk.geometrie_sichern(spec, case_dir, run_root)
    stand = json.loads((run_root / "manifest.json").read_text())
    assert stand["case_hash"] == spec.case_hash()
    assert stand["netz_hash"] == spec.netz_hash()
    assert (run_root / "spec" / "case.yaml").is_file()

    puffer = io.BytesIO()
    with zipfile.ZipFile(puffer, "w") as z:
        z.writestr("manifest.json", json.dumps({"status": "completed"}))
        z.writestr("result.json", json.dumps({"run_id": "demo_r001",
                                              "targets": []}))
    laufwerk._import_entpacken(run_root, "demo_r001", puffer.getvalue())

    nachher = json.loads((run_root / "manifest.json").read_text())
    assert nachher["status"] == "completed"          # Archiv gewinnt beim Status
    assert nachher["case_hash"] == spec.case_hash()  # Herkunft überlebt
