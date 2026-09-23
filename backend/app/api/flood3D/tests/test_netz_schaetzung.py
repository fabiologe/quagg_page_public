"""
Zellschätzung des fertigen Netzes (Etappe E6d, Audit G11 + C3).

Bis 2026-09-22 zählte die Prüfregel nur das Hintergrundnetz, snappyHexMesh
brach über maxGlobalCells (8 Mio) still ab, und das Panel setzte jede
Bauwerksfläche pauschal mit 5 m² an. Jetzt EINE Rechnung
(meshgen.zellen_schaetzung) für Regel, Deckel und Panel; der Router liefert
sie mit den Befunden. Die Client-Seite (utils/simHints.js) wird an der
Fixture gehalten, die dieser Test schreibt: fehlt sie, entsteht sie und der
Test fällt einmal — wie beim Schema-Schnappschuss.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from ..core import casespec as cs
from ..core.meshgen import MAX_GLOBAL_CELLS, snappy_dict, zellen_schaetzung
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3

FIXTURE = (Path(__file__).resolve().parents[5] / "client" / "src" / "features"
           / "flood-3D" / "test" / "fixtures" / "netz_schaetzung.json")


def test_regel_router_und_deckel_rechnen_dasselbe():
    spec = build_spec_stage3()
    netz: dict = {}
    befunde = validate_case(spec, ".", netz=netz)
    assert netz["gesamt"] > 0 and netz["deckel"] == MAX_GLOBAL_CELLS
    assert f"maxGlobalCells      {MAX_GLOBAL_CELLS};" in snappy_dict(
        spec, ["wand_becken"], True, (12.0, 9.0, 95.0))
    # die Regel hat mit Gelände und gebauten Körpern gerechnet: echte Flächen
    assert netz["flaechen"]["wand_becken"] > 5.0
    assert 0.0 < netz["unter_gelaende"] < 1.0
    assert not [b for b in befunde if b["object_id"] == "mesh" and "Zellen" in b["message"]]


def test_ueber_dem_deckel_ist_es_ein_fehler():
    spec = build_spec_stage3()
    spec.mesh.base_cell = 0.1                     # 240 × 180 × 80 = 3,5 Mio Hintergrund
    spec.mesh.refinements = [cs.RefineSurface(id="f", type="surface",
                                              target="terrain", level=3)]
    b = [x for x in validate_case(spec, ".") if x["object_id"] == "mesh"
         and "Zellen" in x["message"]]
    assert b and b[0]["severity"] == "fehler" and "STILL" in b[0]["message"]
    s = zellen_schaetzung(spec)
    assert s["gesamt"] > MAX_GLOBAL_CELLS
    # ohne Verfeinerung nur die Warnung ab 4 Mio (0,07 m: 10 Mio Hintergrund,
    # davon ~53 % über dem Gelände = 5,4 Mio). „Ohne" heißt Stufe 0 für das
    # Gelände — ohne Angabe verfeinert snappy es auf Stufe 1, und seit B3
    # (2026-09-23) zählt die Schätzung das mit (dann 9,3 Mio = Fehler)
    spec.mesh.refinements = [cs.RefineSurface(id="f", type="surface",
                                              target="terrain", level=0)]
    spec.structures = []        # Bauwerke verfeinert snappy sonst auf Stufe 2
    spec.mesh.base_cell = 0.07
    b = [x for x in validate_case(spec, ".") if x["object_id"] == "mesh"
         and "Zellen" in x["message"]]
    assert b and b[0]["severity"] == "warnung"


def test_fixture_fuer_den_client_ist_aktuell():
    """Dieselbe Spec + dieselbe Schätzung, an der der Vitest die JS-Formel misst."""
    spec = build_spec_stage3()
    netz: dict = {}
    validate_case(spec, ".", netz=netz)
    stand = {"spec": spec.model_dump(mode="json"), "schaetzung": netz}
    if not FIXTURE.is_file():
        FIXTURE.write_text(json.dumps(stand, indent=1, ensure_ascii=False,
                                      sort_keys=True))
        pytest.fail(f"Fixture fehlte und wurde geschrieben: {FIXTURE} — Test "
                    "erneut laufen lassen und `npx vitest run "
                    "src/features/flood-3D/test/simHintsNetz` prüfen")
    alt = json.loads(FIXTURE.read_text())
    assert alt["schaetzung"] == stand["schaetzung"], (
        "Die Zellschätzung hat sich geändert — Fixture löschen und neu "
        "schreiben lassen, dann den Vitest laufen lassen")


def test_laufschaetzung_leerlauf():
    """Leerlauf: geschätzt wird mit der erwarteten Dauer, nicht mit der
    Obergrenze end_time (vorher im Client getestet, seit B3 im Server)."""
    from ..core.runner import laufschaetzung
    kurz = build_spec_stage3(); kurz.solver.end_time = 60.0
    lang = build_spec_stage3(); lang.solver.end_time = 36000.0
    lang.solver.abbruch = cs.Abbruch(erwartete_dauer_s=60.0)
    ohne = build_spec_stage3(); ohne.solver.end_time = 36000.0
    ohne.solver.abbruch = cs.Abbruch()
    a, b, c = (laufschaetzung(s, 100_000) for s in (kurz, lang, ohne))
    assert b["dauer_s"] == 60.0
    assert b["stunden"] == a["stunden"] and b["ausgaben"] == a["ausgaben"]
    assert c["stunden"] > 100 * a["stunden"]


def test_laufschaetzung_kennt_die_standardstufen():
    """Fall K: ohne eigene Verfeinerung rechnet snappy die Sohle auf Stufe 1."""
    from ..core.runner import laufschaetzung
    from ..probe.faelle import K_ZELLE, fall_k
    ls = laufschaetzung(fall_k(), 21_000)
    assert ls["feinste_zelle"] == K_ZELLE / 2
    assert ls["feinstes_aus"] == ["terrain"]
