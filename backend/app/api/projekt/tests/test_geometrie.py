"""Der Server-Kernel (Teil XIV, G7): Meshpaket-Vertrag und Booleans mit Attest.

Die Golden-Datei liegt beim CLIENT (`client/src/features/cde/test/fixtures/
meshpaket_v1.bin`) — Python schreibt sie, vitest liest sie und packt sie
byteidentisch zurueck. Ein Formatwechsel faellt so auf beiden Seiten.
"""

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import trimesh
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.projekt.core import geometrie as g
from app.api.projekt.router_geometrie import router_geometrie

GOLDEN = Path(__file__).resolve().parents[5] / "client/src/features/cde/test/fixtures/meshpaket_v1.bin"


def _client(role="INTERNAL"):
    app = FastAPI()
    app.include_router(router_geometrie, prefix="/FastAPI/geometrie")
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(role=role, username="fabio")
    return TestClient(app)


def _box(s, c=(0, 0, 0)):
    return g.als_positions(trimesh.creation.box(s, transform=trimesh.transformations.translation_matrix(c)))


def _paket(op, **bloecke):
    eingaben = {n: n for n in bloecke}
    return g.schreibe_meshpaket({"op": op, "parameter": {}, "eingaben": eingaben},
                                [(n, "koerper", a) for n, a in bloecke.items()])


def test_faehigkeiten_nennen_ops_und_limits():
    r = _client().get("/FastAPI/geometrie/faehigkeiten")
    assert r.status_code == 200
    f = r.json()
    assert set(f["ops"]) == set(g.OPS)
    assert f["limits"]["maxDreiecke"] == g.MAX_DREIECKE
    assert "manifold" in f["engine"]


def test_golden_datei_ist_lesbar_und_reproduzierbar():
    """Die Golden-Datei ist Box(2) minus Box(1) — und was wir daraus lesen, schreiben wir byteidentisch zurueck."""
    daten = GOLDEN.read_bytes()
    kopf, bloecke = g.lese_meshpaket(daten)
    assert kopf["op"] == "booleDifferenz"
    assert kopf["eingaben"] == {"a": "a", "b": "b"}
    assert [b["name"] for b in kopf["bloecke"]] == ["a", "b"]
    assert len(bloecke["a"]) // 9 == 12
    wieder = g.schreibe_meshpaket({k: v for k, v in kopf.items() if k not in ("version", "bloecke")},
                                  [(b["name"], b["form"], bloecke[b["name"]]) for b in kopf["bloecke"]])
    assert wieder == daten
    antwort = g.lese_meshpaket(g.rechne(daten))[0]
    assert antwort["ok"] and abs(antwort["ergebnis"]["volumen"] - 7.0) < 1e-9


def test_box_minus_box_ueber_den_endpunkt():
    r = _client().post("/FastAPI/geometrie/op", content=_paket("booleDifferenz", a=_box((2, 2, 2)), b=_box((1, 1, 1), (0.5, 0.5, 0.5))),
                       headers={"content-type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    kopf, bloecke = g.lese_meshpaket(r.content)
    assert kopf["ergebnis"]["form"] == "koerper" and kopf["ergebnis"]["closed"] is True
    assert abs(kopf["ergebnis"]["volumen"] - 7.0) < 1e-9
    assert len(bloecke["ergebnis"]) // 9 == kopf["bloecke"][0]["triCount"] > 0
    # Das Ergebnis ist selbst wieder ein Volumen — die Kette schliesst.
    assert g.als_trimesh(bloecke["ergebnis"]).is_volume


def test_vereinigung_und_schnitt_halten_die_groessenordnung():
    a, b = _box((2, 2, 2)), _box((2, 2, 2), (1, 0, 0))
    v = g.lese_meshpaket(g.rechne(_paket("booleVereinigung", a=a, b=b)))[0]["ergebnis"]["volumen"]
    s = g.lese_meshpaket(g.rechne(_paket("booleSchnitt", a=a, b=b)))[0]["ergebnis"]["volumen"]
    assert abs(v - 12.0) < 1e-9 and abs(s - 4.0) < 1e-9
    # Kein Schnitt: Ergebnis null, Grund als Warnung — kein 422.
    kopf = g.lese_meshpaket(g.rechne(_paket("booleSchnitt", a=a, b=_box((1, 1, 1), (10, 0, 0)))))[0]
    assert kopf["ergebnis"] is None and kopf["warnungen"][0].startswith("schnitt_leer")


def test_offener_koerper_wird_mit_grund_abgelehnt():
    offen = _box((2, 2, 2))[: 9 * 10]           # zwei Dreiecke fehlen
    r = _client().post("/FastAPI/geometrie/op", content=_paket("booleDifferenz", a=offen, b=_box((1, 1, 1))),
                       headers={"content-type": "application/octet-stream"})
    assert r.status_code == 422
    assert "kein geschlossener Koerper" in r.json()["detail"]


def test_ueber_dem_limit_413(monkeypatch):
    monkeypatch.setattr(g, "MAX_BYTES", 100)
    r = _client().post("/FastAPI/geometrie/op", content=_paket("booleDifferenz", a=_box((2, 2, 2)), b=_box((1, 1, 1))))
    assert r.status_code == 413


def test_kaputtes_paket_422():
    c = _client()
    assert c.post("/FastAPI/geometrie/op", content=b"\x00\x00").status_code == 422
    kopf_falsch = g.schreibe_meshpaket({"op": "booleDifferenz", "eingaben": {"a": "x", "b": "y"}}, [])
    r = c.post("/FastAPI/geometrie/op", content=kopf_falsch)
    assert r.status_code == 422 and "fehlenden Block" in r.json()["detail"]


def test_kollisionen_paarweise_mit_volumen():
    k0, k1, k2 = _box((2, 2, 2)), _box((1, 1, 1), (0.5, 0.5, 0.5)), _box((1, 1, 1), (10, 0, 0))
    paket = g.schreibe_meshpaket({"op": "kollisionen", "parameter": {}, "eingaben": {"koerper": ["koerper[0]", "koerper[1]", "koerper[2]"]}},
                                 [("koerper[0]", "koerper", k0), ("koerper[1]", "koerper", k1), ("koerper[2]", "koerper", k2)])
    kopf = g.lese_meshpaket(g.rechne(paket))[0]
    assert kopf["ergebnis"]["form"] == "paare"
    assert kopf["ergebnis"]["paare"] == [{"a": 0, "b": 1, "volumen": pytest.approx(1.0)}]


def test_extern_darf_nicht_rechnen():
    r = _client(role="EXTERN").post("/FastAPI/geometrie/op", content=_paket("booleDifferenz", a=_box((2, 2, 2)), b=_box((1, 1, 1))))
    assert r.status_code == 403


def test_differenz_mit_liste_kettet_in_einem_aufruf():
    """Graben minus alle Rohre: b als Liste, EIN Aufruf, keine Rundreise dazwischen."""
    eingaben = {"a": "a", "b": ["b1", "b2", "b3"]}
    bloecke = [("a", "koerper", _box((4, 2, 2))),
               ("b1", "koerper", _box((1, 1, 1), (-1, 0, 0))),
               ("b2", "koerper", _box((1, 1, 1), (1, 0, 0))),
               ("b3", "koerper", _box((1, 1, 1), (20, 20, 20)))]      # weit weg: aendert nichts
    paket = g.schreibe_meshpaket({"op": "booleDifferenz", "parameter": {}, "eingaben": eingaben}, bloecke)
    r = _client().post("/FastAPI/geometrie/op", content=paket, headers={"content-type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    kopf, aus = g.lese_meshpaket(r.content)
    assert kopf["ergebnis"]["closed"] is True
    assert abs(kopf["ergebnis"]["volumen"] - (16.0 - 2.0)) < 1e-6
    assert any(w.startswith("gekettet: 3") for w in kopf["warnungen"])
    assert g.als_trimesh(aus["ergebnis"]).is_volume


def test_splitter_unter_einem_millimeter_bleiben_ein_volumen():
    """Ein Koerper mit einer Splitterflaeche (< 1 mm), wie manifold sie an Schnittkurven laesst:
    das 1-mm-Verschmelzen macht sie zur Nullflaeche — die faellt weg, der Koerper bleibt wasserdicht."""
    box = trimesh.creation.box((2, 2, 2))
    v = box.vertices.copy(); f = [list(x) for x in box.faces]
    # Ein Punkt 0,4 mm neben der Ecke i0 auf der Kante i0→i1; BEIDE Flaechen an der
    # Kante werden dort geteilt (sonst entstuende eine T-Kreuzung, kein Volumen).
    i0, i1 = int(f[0][0]), int(f[0][1])
    p = v[i0] + (v[i1] - v[i0]) * 0.0002
    v = np.vstack([v, p]); k = len(v) - 1
    neu = []
    for a, b, c in f:
        ecken = [a, b, c]
        if i0 in ecken and i1 in ecken:
            # die Kante i0–i1 durch i0–k–i1 ersetzen (Orientierung bleibt)
            for j in range(3):
                x, y = ecken[j], ecken[(j + 1) % 3]
                if {x, y} == {i0, i1}:
                    z = ecken[(j + 2) % 3]
                    neu.append([x, k, z]); neu.append([k, y, z])
                    break
        else:
            neu.append(ecken)
    m = trimesh.Trimesh(vertices=v, faces=np.array(neu), process=False)
    assert m.is_volume
    wieder = g.als_trimesh(g.als_positions(m))
    assert wieder.is_volume
    assert abs(float(wieder.volume) - 8.0) < 1e-6
