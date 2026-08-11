"""
Tests des lokalen Rechenwegs (Companion): Bundle-Export mit reservierter
run_id und Artefakt-Import mit Zip-Slip-Schutz.
"""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..router import router
from .synthetic_case import build_spec_stage3


@pytest.fixture()
def client(tmp_path):
    mp = pytest.MonkeyPatch()
    cases = tmp_path / "cases"
    runs = tmp_path / "runs"
    mp.setenv("FLOOD3D_CASES_ROOT", str(cases))
    mp.setenv("FLOOD3D_RUNS_ROOT", str(runs))
    (cases / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(cases / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app), runs
    mp.undo()


def test_bundle_liefert_fall_und_reserviert_lauf(client):
    c, runs = client
    res = c.post("/cases/demo/bundle")
    assert res.status_code == 200
    run_id = res.headers["X-F3D-Run-Id"]
    assert run_id == "demo_r001"
    z = zipfile.ZipFile(io.BytesIO(res.content))
    names = set(z.namelist())
    assert {"case.yaml", "run_id.txt", "Allrun",
            "system/controlDict", "system/blockMeshDict"} <= names
    assert z.read("run_id.txt").decode() == "demo_r001"
    # Lauf ist reserviert und als lokal markiert
    manifest = json.loads((runs / "demo_r001" / "manifest.json").read_text())
    assert manifest["status"] == "lokal"
    assert manifest["origin"] == "companion"
    # zweiter Bundle-Abruf bekommt die nächste Nummer
    assert c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"] == "demo_r002"


def test_bundle_enthaelt_gelaenderaster(client):
    """
    Der Nachlauf auf der Nutzer-Maschine liest das Geländeraster erneut —
    fehlt es im Bundle, läuft die Simulation durch und scheitert erst
    danach. Echter Fund aus einem lokalen Testlauf (2026-07-31).
    """
    c, _ = client
    spec = c.get("/cases/demo").json()
    spec["terrain"]["base"]["source"] = "gelaende_test.asc"
    # winziges gültiges ESRI-Raster neben den Fall legen
    cases_root = Path(os.environ["FLOOD3D_CASES_ROOT"])
    (cases_root / "demo" / "gelaende_test.asc").write_text(
        "ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 24\n"
        "nodata_value -9999\n96 96\n96 96\n")
    assert c.put("/cases/demo", json=spec).status_code == 200

    res = c.post("/cases/demo/bundle")
    assert res.status_code == 200
    names = set(zipfile.ZipFile(io.BytesIO(res.content)).namelist())
    assert "gelaende_test.asc" in names, \
        "Geländeraster fehlt im Bundle — lokaler Nachlauf würde scheitern"


def test_bundle_bricht_ab_wenn_datei_fehlt(client):
    """Lieber sofort 422 als nach Stunden Rechenzeit im Nachlauf."""
    c, _ = client
    spec = c.get("/cases/demo").json()
    spec["terrain"]["base"]["source"] = "gibtsnicht.asc"
    c.put("/cases/demo", json=spec)
    res = c.post("/cases/demo/bundle")
    assert res.status_code == 422
    assert "gibtsnicht.asc" in res.json()["detail"]


def _artifacts_zip(run_id: str, extra: dict | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps({"status": "completed"}))
        z.writestr("result.json", json.dumps({"run_id": run_id, "targets": []}))
        z.writestr("figures/f1.png", b"png")
        z.writestr("fields/t_0000.npz", b"npz")
        # Szenengeometrie: ohne sie kann der Viewer weder Bauwerke noch
        # das Solver-Netz einblenden (Fabios Befund am ersten echten Lauf)
        z.writestr("case/constant/triSurface/wand_becken.stl", b"solid x")
        z.writestr("case/meshSurface_0.stl", b"solid y")
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


def _import(c, run_id, data):
    """Der EINE Import-Weg: gestückelt (hier: ein einziges Stück). Den
    ungestückelten Zwilling POST /runs/{id}/import gibt es nicht mehr
    (Audit H4) — die Sicherheitsprüfungen laufen über _import_entpacken
    und gelten unverändert."""
    return c.post(f"/runs/{run_id}/import-chunk",
                  params={"index": 0, "last": True}, content=data)


def test_import_uebernimmt_artefakte(client):
    c, runs = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    res = _import(c, run_id, _artifacts_zip(run_id))
    assert res.status_code == 200
    assert (runs / run_id / "result.json").exists()
    assert (runs / run_id / "figures" / "f1.png").read_bytes() == b"png"
    assert (runs / run_id / "fields" / "t_0000.npz").exists()
    # Geometrie landet dort, wo /runs/{id}/geometry sie sucht
    assert (runs / run_id / "case" / "constant" / "triSurface"
            / "wand_becken.stl").exists()
    assert (runs / run_id / "case" / "meshSurface_0.stl").exists()
    # Lauf erscheint jetzt als completed in der Liste
    lst = c.get("/runs").json()
    entry = next(r for r in lst if r["run_id"] == run_id)
    assert entry["status"] == "completed"


def test_import_ohne_reservierung(client):
    c, _ = client
    res = _import(c, "demo_r999", _artifacts_zip("demo_r999"))
    assert res.status_code == 404


def test_import_lehnt_fremde_case_dateien_ab(client):
    """Nur STLs unter case/ — kein beliebiger Fallinhalt."""
    c, _ = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    boese = _artifacts_zip(run_id, {"case/system/controlDict": b"x"})
    assert _import(c, run_id, boese).status_code == 422


def test_import_zip_slip_abgewehrt(client):
    c, _ = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    boese = _artifacts_zip(run_id, {"../../boese.txt": b"x"})
    res = _import(c, run_id, boese)
    assert res.status_code == 422


def test_import_fremde_dateien_abgewehrt(client):
    c, _ = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    fremd = _artifacts_zip(run_id, {"case/evil.sh": b"x"})
    res = _import(c, run_id, fremd)
    assert res.status_code == 422


def test_import_falsche_run_id_in_result(client):
    c, _ = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    res = _import(c, run_id, _artifacts_zip("andere_r007"))
    assert res.status_code == 422


def test_geometry_ohne_gelaendeschicht_liefert_die_bauwerke(client):
    """
    Konnte der Nachlauf auf der Nutzer-Maschine die Geländeschicht nicht
    erzeugen (der Runner meldet das ausdrücklich als Warnung und packt den
    Rest), machte der Server daraus ein 404 — ein leerer Viewer statt
    „nur das Gelände fehlt". Bauwerke und Netzoberfläche sind da und
    werden geliefert; `terrain` ist dann null.
    """
    import json as _json

    c, runs = client
    run_id = c.post("/cases/demo/bundle").headers["X-F3D-Run-Id"]
    assert _import(c, run_id, _artifacts_zip(run_id)).status_code == 200
    fdir = runs / run_id / "fields"
    assert not (fdir / "geometry.npz").exists(), "Testannahme: Schicht fehlt"
    (fdir / "index.json").write_text(_json.dumps({
        "grid": {"origin": [0, 0, 90], "spacing": [1, 1, 1],
                 "dims": [4, 4, 4]}, "times": [0.0], "fields": ["alpha"]}))

    res = c.get(f"/runs/{run_id}/geometry")
    assert res.status_code == 200
    data = res.json()
    assert data["terrain"] is None
    assert [s["patch"] for s in data["solids"]] == ["wand_becken"]
    # mesh_patches bleibt hier leer — der Testhelfer schreibt kein echtes
    # STL. Entscheidend ist: die Antwort kommt, statt an der fehlenden
    # Geländeschicht mit 404 zu scheitern.
    assert isinstance(data["mesh_patches"], list)


def test_bundle_nimmt_alle_datei_referenzen_mit(client, tmp_path):
    """
    Das Bundle zählte die mitzuschickenden Dateien von Hand auf und vergaß
    die Pinsel-Ebene: der lokale Lauf rechnete durch, konnte danach aber
    kein Gelände aufbauen — im 3D-Ergebnis fehlte die Geländeschicht
    (2026-08-11, Rentrisch_BetaTest06). Jetzt kommt die Liste aus der
    casespec selbst.
    """
    import io
    import zipfile

    from ..core import casespec as cs

    c, _ = client
    spec = cs.CaseSpec.model_validate(c.get("/cases/demo").json())
    spec.terrain.sculpt = "sculpt.npz"
    assert "sculpt.npz" in spec.datei_referenzen()

    # ohne die Datei neben dem Fall bricht das Bundle SOFORT ab …
    assert c.put("/cases/demo", json=spec.model_dump(mode="json")).status_code == 200
    r = c.post("/cases/demo/bundle")
    assert r.status_code == 422 and "sculpt.npz" in r.json()["detail"]

    # … und mit ihr liegt sie im Archiv
    import numpy as np
    from ..router import _case_dir
    # Format wie core.sculpt.speichern: dz + Rasterbezug
    np.savez_compressed(_case_dir("demo") / "sculpt.npz",
                        dz=np.zeros((37, 49), dtype="<f4"),
                        x0=0.0, y0=0.0, res=0.5)
    r = c.post("/cases/demo/bundle")
    assert r.status_code == 200
    namen = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert "sculpt.npz" in namen, namen[:20]
