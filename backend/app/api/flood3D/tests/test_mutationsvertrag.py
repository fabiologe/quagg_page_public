"""
P3 der Preprocessing-Sanierung: EIN Mutationsvertrag.

Drehen und Anschluss laufen als Kuren über denselben Endpunktvertrag,
gespeichert wird nur bei echter Änderung, Drehen tastet kettenfrei vom
Original-Raster ab, und der Erdkörper hat EINEN Schalter, dessen Regel
und Kur dieselbe Größe messen.
"""
from __future__ import annotations

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import casespec as cs
from ..core.kur import anwenden
from ..core.rotate import rotate_case
from ..core.solids import braucht_erdkoerper
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _asc_schreiben(pfad, x0=0.0, y0=0.0, res=1.0, nx=41, ny=41):
    """Nichtlineares Testgelände: Mulde mit Rampe — reagiert auf Blur."""
    xx, yy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
    z = 95.0 + 0.05 * xx + 0.002 * (xx - 20.0) ** 2 + 0.003 * (yy - 20.0) ** 2
    zeilen = [f"ncols {nx}", f"nrows {ny}",
              f"xllcorner {x0 - res / 2}", f"yllcorner {y0 - res / 2}",
              f"cellsize {res}", "nodata_value -9999"]
    for row in z[::-1]:
        zeilen.append(" ".join(f"{v:.4f}" for v in row))
    pfad.write_text("\n".join(zeilen))
    return z


@pytest.fixture()
def raster_case(tmp_path):
    d = tmp_path / "demo"
    d.mkdir()
    spec = build_spec_stage3()
    spec.domain.extent = (0.0, 0.0, 40.0, 40.0)
    _asc_schreiben(d / "gelaende.asc")
    spec.terrain.base = cs.TerrainBase(source="gelaende.asc", resolution=1.0)
    spec.to_yaml(d / "case.yaml")
    return spec, d


# ---- Kettenfreies Drehen --------------------------------------------------

def test_drehen_tastet_immer_vom_original_ab(raster_case):
    spec, d = raster_case
    rotate_case(spec, 37.0, d)
    assert spec.terrain.base.original == "gelaende.asc"
    assert spec.terrain.base.original_abbildung.rotation_deg \
        == pytest.approx(37.0)
    erster = spec.terrain.base.source

    rotate_case(spec, 23.0, d)
    # das Original bleibt die Quelle, die Abbildung akkumuliert
    assert spec.terrain.base.original == "gelaende.asc"
    assert spec.terrain.base.original_abbildung.rotation_deg \
        == pytest.approx(60.0)
    assert spec.terrain.base.source != erster


def test_vier_mal_90_grad_ist_hoehengleich(raster_case):
    """4×90° = Identität: die Höhen müssen EXAKT die Originalhöhen sein.
    Mit Resampling-Ketten wäre das Gelände vierfach verwischt und die
    Ecken mit dem Minimum aufgefüllt."""
    spec, d = raster_case
    vorher = TerrainField.from_spec(spec.terrain, spec.domain, d)
    proben = [(3.0, 3.0), (20.0, 20.0), (36.5, 4.5), (39.0, 39.0)]
    soll = [float(vorher.sample(np.array([x]), np.array([y]))[0])
            for x, y in proben]

    for _ in range(4):
        rotate_case(spec, 90.0, d)

    assert spec.terrain.base.original_abbildung.rotation_deg \
        == pytest.approx(0.0)
    nachher = TerrainField.from_spec(spec.terrain, spec.domain, d)
    for (x, y), z in zip(proben, soll):
        ist = float(nachher.sample(np.array([x]), np.array([y]))[0])
        assert ist == pytest.approx(z, abs=1e-6), (x, y)


# ---- Ein Vertrag, gespeichert nur bei Änderung ----------------------------

def _client(monkeypatch, d):
    from .. import router as router_modul

    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(d.parent))
    app = FastAPI()
    app.include_router(router_modul.router)
    return TestClient(app)


def test_kur_ohne_wirkung_schreibt_nicht(raster_case, monkeypatch):
    spec, d = raster_case
    client = _client(monkeypatch, d)
    stand = (d / "case.yaml").read_bytes()

    # Anschlüsse sind im Synthetikfall stimmig — zweiter Aufruf erst recht
    res = client.post(f"/cases/{d.name}/anschluss").json()
    if res["geaendert"]:
        stand = (d / "case.yaml").read_bytes()
        res = client.post(f"/cases/{d.name}/anschluss").json()
    assert res["ok"] is True
    assert res["geaendert"] is False
    assert (d / "case.yaml").read_bytes() == stand
    assert isinstance(res["meldungen"], list)


def test_drehen_und_anschluss_laufen_als_kur(raster_case, monkeypatch):
    spec, d = raster_case
    client = _client(monkeypatch, d)
    res = client.post(f"/cases/{d.name}/kur",
                      json={"aktion": "drehen", "args": {"deg": 15.0}})
    assert res.status_code == 200
    body = res.json()
    assert body["geaendert"] is True
    assert any("15" in m for m in body["meldungen"])
    assert body["spec"]["meta"]["transform"]["rotation_deg"] \
        == pytest.approx(15.0)
    # ungültiger Winkel wird im Kur-Vertrag abgefangen
    res = client.post(f"/cases/{d.name}/kur",
                      json={"aktion": "drehen", "args": {"deg": 400}})
    assert res.status_code == 422


# ---- Herkunft aus Kur und Rezept ------------------------------------------

def test_kur_stempelt_herkunft(raster_case):
    spec, d = raster_case
    kante = next(s for s in spec.structures if s.type == "culvert")
    meldung = anwenden(spec, "gelaende_einbinden", {"patch": kante.patch}, d)
    assert meldung
    edit = kante.edits[-1]
    assert edit.herkunft == "kur"


def test_rezept_stempelt_herkunft(raster_case):
    from ..core.rezepte import einsetzen

    spec, d = raster_case
    vorher = {s.id for s in spec.structures}
    einsetzen(spec, "drosselschacht", {}, d)
    neu = [s for s in spec.structures if s.id not in vorher]
    assert neu and all(s.herkunft == "rezept" for s in neu)


# ---- Ein Erdkörper-Schalter -----------------------------------------------

def test_erdkoerper_schalter_gewinnt_gegen_inferenz(raster_case):
    spec, d = raster_case
    kante = next(s for s in spec.structures if s.type == "culvert")
    kante.durchstoesst_gelaende = True
    assert braucht_erdkoerper(spec) is True          # auto: Inferenz greift

    spec.terrain.erdkoerper = "aus"
    assert braucht_erdkoerper(spec) is False
    befunde = [b for b in validate_case(spec, d)
               if b.get("fix", {}).get("aktion") == "erdkoerper_auto"]
    assert befunde, "Regel muss den abgeschalteten Erdkörper melden"

    # Regel und Kur messen dieselbe Größe: nach der Kur ist der Befund weg
    anwenden(spec, "erdkoerper_auto", {}, d)
    assert spec.terrain.erdkoerper == "auto"
    assert braucht_erdkoerper(spec) is True
    assert not [b for b in validate_case(spec, d)
                if b.get("fix", {}).get("aktion") == "erdkoerper_auto"]

    spec.terrain.erdkoerper = "an"
    kante.durchstoesst_gelaende = False
    assert braucht_erdkoerper(spec) is True          # erzwungen


# ---- P4: Geometrie aus einer Quelle ---------------------------------------

def test_geometrie_antwort_buendelt_alles(raster_case, monkeypatch):
    """GET /geometry ersetzt drei Einzel-GETs; PUT liefert die Geometrie
    gleich mit (Speichern = 1 Roundtrip statt 4). Beide tragen die
    serverseitig aufgelösten Regeln (bc_faces/fenster/oeffnungen)."""
    spec, d = raster_case
    client = _client(monkeypatch, d)

    g = client.get(f"/cases/{d.name}/geometry").json()
    assert g["terrain"] is not None
    assert isinstance(g["validation"], list)
    assert isinstance(g["bc_faces"], dict) and g["bc_faces"]
    assert set(g["bc_faces"].values()) <= {"x_min", "x_max", "y_min",
                                           "y_max", "z_max"}
    assert "fenster" in g and "oeffnungen" in g and "netz_stale" in g

    res = client.put(f"/cases/{d.name}",
                     json=spec.model_dump(mode="json", exclude_none=True))
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True and "case_hash" in body
    assert body["terrain"] is not None and isinstance(body["solids"], list)
    assert isinstance(body["bc_faces"], dict)
