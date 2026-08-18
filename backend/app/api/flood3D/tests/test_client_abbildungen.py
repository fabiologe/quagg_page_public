"""
Im Browser gerechnete Abbildungen gehoeren zum Lauf.

Vorgeschichte: die Laubkarten rechnet der Client, Berichtsabbildungen
entstanden aber nur serverseitig beim Auswerten. Der PNG-Knopf war
deshalb ein reiner Download — das Bild landete im Downloads-Ordner und
war mit nichts verknuepft (2026-08-17).
"""
from __future__ import annotations

import base64
import json
import zlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.flood3D.router import router
from app.api.flood3D.tests.synthetic_case import build_spec_stage3


def _png(breite=4, hoehe=4) -> bytes:
    """Ein winziges, gueltiges PNG (grau)."""
    def chunk(typ, daten):
        c = typ + daten
        return (len(daten).to_bytes(4, "big") + c
                + (zlib.crc32(c) & 0xFFFFFFFF).to_bytes(4, "big"))
    kopf = (breite.to_bytes(4, "big") + hoehe.to_bytes(4, "big")
            + bytes([8, 0, 0, 0, 0]))
    roh = b"".join(b"\x00" + b"\x80" * breite for _ in range(hoehe))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", kopf)
            + chunk(b"IDAT", zlib.compress(roh)) + chunk(b"IEND", b""))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    d = tmp_path / "runs" / "demo_r001"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({"status": "completed"}))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), d


def _ablegen(c, fig_id="laub_C", png=None, caption="Karte C"):
    return c.post("/runs/demo_r001/abbildungen", json={
        "id": fig_id, "caption": caption,
        "png_b64": base64.b64encode(png or _png()).decode()})


def test_karte_landet_beim_lauf(client):
    c, d = client
    assert _ablegen(c).status_code == 200

    assert (d / "figures" / "laub_C.png").is_file()
    aus = c.get("/runs/demo_r001/abbildungen").json()
    assert [f["id"] for f in aus["client"]] == ["laub_C"]
    assert aus["client"][0]["caption"] == "Karte C"
    # und sie ist ueber den vorhandenen Bildkanal abrufbar
    assert c.get("/runs/demo_r001/figures/laub_C.png").status_code == 200


def test_dieselbe_karte_ueberschreibt_statt_zu_sammeln(client):
    c, _ = client
    _ablegen(c, caption="alt")
    _ablegen(c, caption="neu")
    aus = c.get("/runs/demo_r001/abbildungen").json()["client"]
    assert len(aus) == 1 and aus[0]["caption"] == "neu"


def test_ueberlebt_ein_erneutes_auswerten(client):
    """result.json wird beim Auswerten neu geschrieben — deshalb liegt die
    Client-Liste in einer EIGENEN Datei."""
    c, d = client
    _ablegen(c)
    (d / "result.json").write_text(json.dumps(
        {"status": "completed", "figures": [{"id": "serie_1"}]}))

    aus = c.get("/runs/demo_r001/abbildungen").json()
    assert [f["id"] for f in aus["figures"]] == ["serie_1"]
    assert [f["id"] for f in aus["client"]] == ["laub_C"]


def test_was_kein_png_ist_kommt_nicht_durch(client):
    c, _ = client
    # als PNG getarnte Nutzlast
    res = _ablegen(c, png=b"<svg onload=alert(1)>")
    assert res.status_code == 422
    # unbrauchbares base64
    assert c.post("/runs/demo_r001/abbildungen", json={
        "id": "x", "png_b64": "!!!"}).status_code == 422
    # Kennung mit Pfadanteil
    assert _ablegen(c, fig_id="../../etc/passwd").status_code == 422


def test_zu_grosse_abbildung_wird_abgewiesen(client):
    c, _ = client
    riesig = _png(2000, 2000) + b"\x00" * (9 * 1024 * 1024)
    res = _ablegen(c, png=riesig)
    assert res.status_code == 413


def test_loeschen(client):
    c, d = client
    _ablegen(c)
    assert c.delete("/runs/demo_r001/abbildungen/laub_C").status_code == 200
    assert not (d / "figures" / "laub_C.png").exists()
    assert c.get("/runs/demo_r001/abbildungen").json()["client"] == []
    assert c.delete("/runs/demo_r001/abbildungen/laub_C").status_code == 404
