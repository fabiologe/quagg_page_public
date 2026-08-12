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


# --------------------------------------------------------------------------
# Kernzahl auf der Nutzer-Maschine
# --------------------------------------------------------------------------

def _lade_runner():
    """local_runner.py laeuft normalerweise IM Container (Importpfad
    ..engines.local.local_runner existiert aber auch hier)."""
    from ..engines.local import local_runner
    return local_runner


def test_lokale_kernzahl_ohne_deckel(monkeypatch):
    """
    Die Maschine gehoert dem Nutzer: ein 16-Kerner soll 16 Kerne rechnen.
    Frueher wurde auf 8 gedeckelt (Entscheidung 2026-08-11 aufgehoben).
    """
    r = _lade_runner()
    monkeypatch.delenv("FLOOD3D_CORES", raising=False)
    monkeypatch.delenv("QUAGG_FOAM_CORES", raising=False)
    # was die Maschine hergibt, ermittelt erlaubte_kerne (eigener Test) —
    # hier geht es nur darum, dass NICHTS mehr gedeckelt wird
    monkeypatch.setattr(r, "erlaubte_kerne", lambda: 16)
    assert r._cores() == 16
    monkeypatch.setattr(r, "erlaubte_kerne", lambda: 64)
    assert r._cores() == 64


def test_lokale_kernzahl_vorgabe_schlaegt_automatik(monkeypatch):
    r = _lade_runner()
    monkeypatch.setattr(r, "erlaubte_kerne", lambda: 16)
    monkeypatch.setenv("FLOOD3D_CORES", "4")
    assert r._cores() == 4
    monkeypatch.delenv("FLOOD3D_CORES")
    monkeypatch.setenv("QUAGG_FOAM_CORES", "12")   # Altname
    assert r._cores() == 12
    monkeypatch.setenv("QUAGG_FOAM_CORES", "quatsch")
    assert r._cores() == 16                        # faellt auf die Automatik


def test_server_bleibt_gedeckelt():
    """
    Gegenprobe: der SERVER teilt sich die Maschine mit allem anderen und
    darf sie nicht fuellen — die Aufhebung gilt nur lokal.
    """
    import os as _os
    from ..core import runner
    assert runner.CORES <= (_os.cpu_count() or 1)


def test_kernzahl_beachtet_das_kontingent_des_containers(tmp_path, monkeypatch):
    """
    os.cpu_count() meldet die Kerne der MASCHINE, nicht die des Containers.
    In der Cloud (16 zugeteilte vCPUs auf einem grossen Knoten) startete
    mpirun sonst weit mehr Raenge als Kerne da sind — der Lauf wird dadurch
    langsamer statt schneller (2026-08-12 am ersten RunPod-Lauf gesehen).
    """
    r = _lade_runner()
    monkeypatch.setattr(r.os, "cpu_count", lambda: 64)
    monkeypatch.setattr(r.os, "sched_getaffinity", lambda pid: set(range(64)))

    # cgroup v2: 16 Kerne von 64
    v2 = tmp_path / "cpu.max"
    v2.write_text("1600000 100000\n")
    assert r.erlaubte_kerne(cpu_max=v2, quota=tmp_path / "x", periode=tmp_path / "y") == 16

    # cgroup v1: 8 Kerne
    q, p = tmp_path / "quota", tmp_path / "periode"
    q.write_text("800000"); p.write_text("100000")
    assert r.erlaubte_kerne(cpu_max=tmp_path / "fehlt", quota=q, periode=p) == 8

    # ohne Begrenzung ("max") bleibt es bei der Maschine
    v2.write_text("max 100000\n")
    assert r.erlaubte_kerne(cpu_max=v2, quota=tmp_path / "x", periode=tmp_path / "y") == 64


def test_cpuset_begrenzung_wird_beachtet(tmp_path, monkeypatch):
    """--cpuset-cpus schlaegt sich in sched_getaffinity nieder."""
    r = _lade_runner()
    monkeypatch.setattr(r.os, "cpu_count", lambda: 64)
    monkeypatch.setattr(r.os, "sched_getaffinity", lambda pid: {0, 1, 2, 3})
    assert r.erlaubte_kerne(cpu_max=tmp_path / "a", quota=tmp_path / "b",
                            periode=tmp_path / "c") == 4


def test_maschinenbericht_erkennt_langsame_dateisysteme(tmp_path, monkeypatch):
    """
    Ein Lauf auf einer fremden Maschine ist ohne diese Angaben nicht zu
    beurteilen — im Audit 2026-08-12 fehlten genau sie. Entscheidend ist das
    Dateisystem des Job-Ordners: OpenFOAM schreibt staendig, und ueber eine
    Docker-Desktop-Bruecke kostet das ein Vielfaches.
    """
    r = _lade_runner()
    mounts = tmp_path / "mounts"
    mounts.write_text("/dev/sda1 / ext4 rw 0 0\n"
                      "drivers /job drvfs rw 0 0\n")
    monkeypatch.setattr(r.Path, "read_text", r.Path.read_text)  # unveraendert
    orig = r._dateisystem

    def _fs(pfad):
        # /proc/mounts durch die Testdatei ersetzen
        eintraege = [(z.split()[1], z.split()[2])
                     for z in mounts.read_text().splitlines()]
        ziel = str(pfad)
        treffer = max((e for e in eintraege if ziel.startswith(e[0])),
                      key=lambda e: len(e[0]), default=("", "?"))
        return treffer[1], r.LANGSAME_FS.get(treffer[1], "")

    monkeypatch.setattr(r, "_dateisystem", _fs)
    bericht = r.maschinen_bericht(Path("/job/xyz"), 12)
    assert bericht["job_fs"] == "drvfs"
    assert "Windows" in bericht["job_fs_warnung"]
    assert bericht["kerne_benutzt"] == 12
    assert "ram_gb" in bericht and bericht["ram_gb"] > 0
    monkeypatch.setattr(r, "_dateisystem", orig)


def test_maschinenbericht_meldet_kein_problem_auf_ext4(tmp_path, monkeypatch):
    r = _lade_runner()
    monkeypatch.setattr(r, "_dateisystem", lambda p: ("ext4", ""))
    bericht = r.maschinen_bericht(tmp_path, 4)
    assert "job_fs_warnung" not in bericht
    assert bericht["job_fs"] == "ext4"
