"""
Zwei Läufe paaren: was zählt wirklich?

Vorgeschichte (2026-08-17). Die Laubkarten verschneiden einen Leerlauf mit
einem Spülschwall Zelle für Zelle. Gepaart werden durfte nur bei gleichem
`netz_hash` — und der umfasste die Randbedingungen VOLLSTÄNDIG, samt
Zuflussmenge. Gemessen an den echten Läufen Rentrich_BetaTest08 r006 und
r007: gleiches Netz (29.010 Zellen beide), identisches Ausgaberaster,
einziger Unterschied im ganzen Fall `q = 0,0` gegen `0,8` m³/s — und
trotzdem galten sie als verschiedene Netze.

Das Kriterium schloss damit systematisch das Paar aus, für das es gebaut
war: ein Leerlauf und ein Schwall unterscheiden sich per Definition in
genau diesen Werten.
"""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import casespec as cs
from ..core.vergleich import paar_stufe, raster_gleich, spec_unterschiede
from ..router import router
from .synthetic_case import build_spec_stage3


# ── Die Kennungen ───────────────────────────────────────────────────────────

def _mit_zufluss(q: float) -> cs.CaseSpec:
    spec = build_spec_stage3()
    for b in spec.boundaries:
        if b.type == "inflow_constant":
            b.q = q
    return spec


def test_zuflussmenge_ist_kein_anderes_netz():
    """DER Fall aus der Praxis: derselbe Fall, andere Zuflussmenge."""
    assert _mit_zufluss(0.0).netz_hash() == _mit_zufluss(0.8).netz_hash()


def test_wasserstand_und_ganglinie_ebenso():
    leer, voll = build_spec_stage3(), build_spec_stage3()
    for b in voll.boundaries:
        if b.type == "outflow_fixed_level":
            b.level = 99.0
    # und der Anfangswasserspiegel steckte noch nie im Netz-Hash
    voll.solver.initial_level = 97.5
    assert leer.netz_hash() == voll.netz_hash()


def test_was_der_vernetzer_sieht_zaehlt_weiterhin():
    """Gegenprobe — sonst wäre die Kennung wertlos."""
    grund = build_spec_stage3().netz_hash()

    anders_patch = build_spec_stage3()
    anders_patch.boundaries[0].patch = "anderer_patch"
    assert anders_patch.netz_hash() != grund

    anders_face = build_spec_stage3()
    anders_face.boundaries[0].face = "y_max"
    assert anders_face.netz_hash() != grund

    anders_fenster = build_spec_stage3()
    anders_fenster.boundaries[0].window = cs.BcWindow(
        shape="rechteck", z_min=95.0, z_max=96.0, center=5.0,
        bottom_width=1.0, top_width=1.0)
    assert anders_fenster.netz_hash() != grund

    # und die Geometrie sowieso
    grober = build_spec_stage3()
    grober.mesh.base_cell *= 2
    assert grober.netz_hash() != grund


def test_reihenfolge_der_raender_bleibt_hash_relevant():
    """
    Bewusst NICHT sortiert: ohne gesetztes `face` leitet meshgen aus der
    Reihenfolge ab, welcher Rand auf welche Gebietsfläche kommt („erster
    Zufluss x_min"). Eine Sortierung würde genau das verschlucken.
    """
    a = build_spec_stage3()
    for b in a.boundaries:
        b.face = None
    b2 = a.model_copy(deep=True)
    b2.boundaries = list(reversed(b2.boundaries))
    assert a.netz_hash() != b2.netz_hash()


def test_geometrie_hash_kennt_die_raender_gar_nicht():
    """Die Antwort auf „dasselbe Bauwerk?" — Zu- und Abflüsse gehören
    nicht dazu."""
    assert _mit_zufluss(0.0).geometrie_hash() == _mit_zufluss(0.8).geometrie_hash()

    anders = build_spec_stage3()
    anders.boundaries[0].patch = "anderer_patch"
    # anderes NETZ (Patchname), aber dasselbe Bauwerk
    assert anders.netz_hash() != build_spec_stage3().netz_hash()
    assert anders.geometrie_hash() == build_spec_stage3().geometrie_hash()

    verschoben = build_spec_stage3()
    verschoben.domain.extent = (1.0, 1.0, 25.0, 19.0)
    assert verschoben.geometrie_hash() != build_spec_stage3().geometrie_hash()


# ── Die reinen Vergleichsfunktionen ─────────────────────────────────────────

def _gitter(dims, origin=(0.0, 0.0, 0.0), spacing=(0.5, 0.5, 0.2)):
    return {"dims": list(dims), "origin": list(origin),
            "spacing": list(spacing)}


def test_raster_vergleich():
    assert raster_gleich(_gitter((40, 20, 30)), _gitter((40, 20, 55)))["gleich"]
    schief = raster_gleich(_gitter((40, 20, 30)), _gitter((80, 40, 30)))
    assert not schief["gleich"]
    # der Grund muss auf die URSACHE zeigen, nicht nur „passt nicht"
    assert "Schreibintervall" in schief["grund"]
    assert not raster_gleich(_gitter((40, 20, 30)),
                             _gitter((40, 20, 30), origin=(1, 0, 0)))["gleich"]
    assert not raster_gleich(None, _gitter((40, 20, 30)))["gleich"]
    assert not raster_gleich({"dims": [1, 2]}, _gitter((40, 20, 30)))["gleich"]


def test_unterschiede_nennen_die_fundstelle():
    a = {"boundaries": [{"id": "zulauf", "q": 0.0}]}
    b = {"boundaries": [{"id": "zulauf", "q": 0.8}]}
    u = spec_unterschiede(a, b)
    assert u == [{"pfad": "boundaries[0].q", "a": 0.0, "b": 0.8}]


def test_unterschiede_bei_verschieden_langen_listen():
    u = spec_unterschiede({"x": [1, 2]}, {"x": [1, 2, 3]})
    assert u == [{"pfad": "x", "a": "2 Einträge", "b": "3 Einträge"}]


def test_unterschiede_sind_gedeckelt():
    a = {f"f{i}": i for i in range(50)}
    b = {f"f{i}": i + 1 for i in range(50)}
    assert len(spec_unterschiede(a, b, grenze=5)) == 5


def test_ampel():
    # rot ist die Beurteilung, nicht die Sperre — die hängt am Raster
    assert paar_stufe(False, True, "gleich") == "rot"
    assert paar_stufe(True, True, "gleich") == "gruen"
    assert paar_stufe(True, False, "gleich") == "gelb"     # Leerlauf/Schwall
    assert paar_stufe(True, False, "unbekannt") == "gelb"  # Altlauf
    assert paar_stufe(True, False, "verschieden") == "rot"


# ── Der Endpunkt ────────────────────────────────────────────────────────────

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), tmp_path / "runs"


def _lauf(runs, name, spec=None, grid=None):
    d = runs / name
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({"status": "completed"}))
    if spec is not None:
        (d / "spec").mkdir()
        spec.to_yaml(d / "spec" / "case.yaml")
    if grid is not None:
        (d / "fields").mkdir()
        (d / "fields" / "index.json").write_text(json.dumps(
            {"grid": grid, "timesteps": [{"time": 0.0}], "fields": ["alpha"]}))


FEIN = {"dims": [20, 26, 40], "origin": [2.0, 2.0, 223.2],
        "spacing": [0.5, 0.5, 0.07]}
GROB = {"dims": [10, 13, 40], "origin": [2.0, 2.0, 223.2],
        "spacing": [1.0, 1.0, 0.07]}


def test_leerlauf_und_schwall_sind_ein_paar(client):
    """Das Paar aus der Praxis: alles gleich bis auf den Zufluss."""
    c, runs = client
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    _lauf(runs, "demo_r007", _mit_zufluss(0.8), FEIN)

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r007"}).json()

    assert v["raster"]["gleich"] is True
    assert v["netz"]["gleich"] is True          # nach der Korrektur
    assert v["geometrie"]["stand"] == "gleich"
    assert v["stufe"] == "gruen"
    assert v["rechenbar"] is True


def test_anderer_patchname_bleibt_paarbar_und_wird_benannt(client):
    """Gleiches Bauwerk, anderes Netz — gelb statt gesperrt, und der
    Unterschied steht dabei."""
    c, runs = client
    anders = _mit_zufluss(0.8)
    anders.boundaries[0].patch = "anderer_patch"
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    _lauf(runs, "demo_r007", anders, FEIN)

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r007"}).json()

    assert v["netz"]["gleich"] is False
    assert v["geometrie"]["stand"] == "gleich"
    assert v["stufe"] == "gelb"
    assert v["rechenbar"] is True
    pfade = [u["pfad"] for u in v["unterschiede"]]
    assert any("patch" in p for p in pfade)


def test_verschiedene_geometrie_wird_rot_aber_nicht_gesperrt(client):
    c, runs = client
    grob = build_spec_stage3()
    grob.mesh.base_cell *= 2
    _lauf(runs, "demo_r006", build_spec_stage3(), FEIN)
    _lauf(runs, "demo_r007", grob, FEIN)

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r007"}).json()

    assert v["geometrie"]["stand"] == "verschieden"
    assert v["stufe"] == "rot"
    # warnt, sperrt aber nicht — sonst säße man wieder fest
    assert v["rechenbar"] is True
    assert any("base_cell" in u["pfad"] for u in v["unterschiede"])


def test_verschiedenes_raster_ist_der_harte_fall(client):
    c, runs = client
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    _lauf(runs, "demo_r007", _mit_zufluss(0.8), GROB)

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r007"}).json()

    assert v["stufe"] == "rot"
    assert v["rechenbar"] is False
    assert "Zellen" in v["raster"]["grund"]


def test_altlauf_ohne_gesicherten_stand_wird_angeboten(client):
    """16 von 20 Altläufen haben ihre Geometrie nicht mitgesichert. Sie
    bleiben wählbar — die Geometrie gilt als ungeprüft, nicht als falsch."""
    c, runs = client
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    _lauf(runs, "demo_r002", None, FEIN)         # kein spec/case.yaml

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r002"}).json()

    assert v["geometrie"]["stand"] == "unbekannt"
    assert v["stufe"] == "gelb"
    assert v["rechenbar"] is True


def test_lauf_ohne_felder_ist_nicht_rechenbar(client):
    c, runs = client
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    _lauf(runs, "demo_r009", _mit_zufluss(0.8), None)

    v = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r009"}).json()

    assert v["rechenbar"] is False
    assert v["stufe"] == "rot"


def test_vergleich_verschluckt_nicht_die_laufkennung(client):
    """`/runs/vergleich` muss VOR `/runs/{run_id}` stehen — sonst käme
    „vergleich" als Laufkennung an."""
    c, runs = client
    _lauf(runs, "demo_r006", _mit_zufluss(0.0), FEIN)
    res = c.get("/runs/vergleich", params={"a": "demo_r006", "b": "demo_r006"})
    assert res.status_code == 200
    assert res.json()["stufe"] == "gruen"


# ── Die Netzvorschau darf davon nichts merken ───────────────────────────────

def test_unveraenderter_fall_behaelt_seine_vorschau(client, tmp_path):
    """
    Die neu berechnete Netzkennung hätte sonst jede vorhandene Vorschau
    einmalig entwertet — und seit dem 16.08. zeigt der Editor ein
    veraltetes Netz gar nicht mehr an.
    """
    c, _ = client
    spec = build_spec_stage3()
    vor = tmp_path / "cases" / "demo" / "derived" / "mesh_preview"
    vor.mkdir(parents=True)
    # Vorschau mit einem VERALTETEN netz_hash, aber passendem case_hash
    (vor / "mesh_preview.json").write_text(json.dumps(
        {"cells": 1234, "netz_hash": "alte_rechnung",
         "case_hash": spec.case_hash()}))

    stand = c.get("/cases/demo/mesh-preview").json()
    assert stand["vorhanden"] is True
    assert stand["stale"] is False

    # eine echte Änderung schlägt weiterhin durch
    spec.mesh.base_cell *= 2
    spec.to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    assert c.get("/cases/demo/mesh-preview").json()["stale"] is True
