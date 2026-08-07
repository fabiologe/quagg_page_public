"""
API-Tests Stufe 2: eigener FastAPI-App-Stub mit dem flood3D-Router und einer
temporären Laufablage (FLOOD3D_RUNS_ROOT), unabhängig von main.py und deren
Datenbank-Startup.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..cli import main as cli_main
from ..router import router
from . import synthetic_case as syn
from .synthetic_fields import build_fields


@pytest.fixture(scope="module")
def client(tmp_path_factory, monkeypatch_module):
    tmp = tmp_path_factory.mktemp("api")
    case_dir = tmp / "case"
    syn.build_case(case_dir)
    spec_path = tmp / "case.yaml"
    syn.build_spec().to_yaml(spec_path)
    runs_root = tmp / "runs"
    cli_main(["all", "--case", str(case_dir), "--spec", str(spec_path),
              "--run-id", "r001", "--out", str(runs_root)])
    build_fields(runs_root / "r001")

    monkeypatch_module.setenv("FLOOD3D_RUNS_ROOT", str(runs_root))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture(scope="module")
def monkeypatch_module():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def test_health_und_runs(client):
    assert client.get("/health").json()["runs"] == 1
    runs = client.get("/runs").json()
    assert len(runs) == 1
    r = runs[0]
    assert r["run_id"] == "r001"
    assert r["n_targets"] == 4
    assert r["n_erfuellt"] == 2
    assert r["has_normalized"] is True


def test_result_und_extremes(client):
    result = client.get("/runs/r001/result").json()
    assert result["run_id"] == "r001"
    assert {t["id"] for t in result["targets"]} >= {"max_einstau_becken"}
    extremes = client.get("/runs/r001/extremes").json()
    assert any(e["quantity"] == "level" for e in extremes)


def test_series_alle_orte_einer_groesse(client):
    data = client.get("/runs/r001/series", params={"quantity": "discharge"}).json()
    locs = {s["location_id"] for s in data["series"]}
    assert locs == {"qs_zulauf", "qs_klaerueberlauf"}
    s = data["series"][0]
    assert len(s["t"]) == len(s["v"]) == len(syn.time_grid())
    assert s["unit"] == "m3/s"


def test_series_mit_komponente(client):
    data = client.get("/runs/r001/series", params={
        "quantity": "force", "location_id": "wand_ost",
        "component": "magnitude"}).json()
    assert len(data["series"]) == 1
    assert max(data["series"][0]["v"]) > 1000


def test_balance(client):
    b = client.get("/runs/r001/balance").json()
    assert b["volume"]["v"][-1] == pytest.approx(20.0)
    assert b["courant_max"]["v"] and max(b["courant_max"]["v"]) == pytest.approx(0.5)
    assert any(r["location_id"] == "p_rgh" for r in b["residuals"])


def test_figure_auslieferung(client):
    r = client.get("/runs/r001/figures/wasserspiegel.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"


def test_timesteps_und_geometrie(client):
    ts = client.get("/runs/r001/timesteps").json()
    assert ts["grid"]["dims"] == [64, 48, 32]
    assert len(ts["timesteps"]) == 5
    geo = client.get("/runs/r001/geometry").json()
    import base64
    import numpy as np
    terrain = np.frombuffer(base64.b64decode(geo["terrain"]["z_b64"]), dtype="<f4")
    assert terrain.size == 48 * 64
    assert 94.0 < terrain.min() < 95.0


def test_volume_binaerpaket(client):
    r = client.get("/runs/r001/volume", params={"time": 0.47, "fields": "alpha"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["x-f3d-time"] == "0.5"      # nächstgelegener Zeitpunkt
    blob = r.content
    assert blob[:4] == b"F3DV"
    import json as _json
    import struct
    (hlen,) = struct.unpack("<I", blob[4:8])
    header = _json.loads(blob[8:8 + hlen])
    assert [f["name"] for f in header["fields"]] == ["alpha"]


def test_volume_gzip_transport(client):
    """Perf-Audit: alpha ist fast überall 0/1 — der Blob MUSS komprimiert
    über die Leitung, sonst zahlt jedes Zeit-Scrubbing den vollen Preis."""
    # httpx schickt Accept-Encoding gzip und entpackt transparent — die
    # Magic stimmt deshalb auch bei komprimiertem Transport
    r = client.get("/runs/r001/volume", params={"time": 0.47})
    assert r.headers.get("content-encoding") == "gzip"
    assert r.headers.get("vary") == "Accept-Encoding"
    assert r.content[:4] == b"F3DV"
    # ohne gzip im Accept-Encoding bleibt es das rohe Binärpaket
    r = client.get("/runs/r001/volume", params={"time": 0.47},
                   headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in r.headers
    assert r.content[:4] == b"F3DV"


def test_unbekannter_lauf_und_traversal(client):
    assert client.get("/runs/gibtsnicht").status_code == 404
    assert client.get("/runs/..%2F..%2Fetc/result").status_code in (404, 422)
    assert client.get("/runs/r001/figures/..%2Fresult.json").status_code in (404, 422)
