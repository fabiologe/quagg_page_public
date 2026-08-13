"""
Netz-Determinismus: dieselbe Fallbeschreibung muss auf jeder Maschine
dasselbe Netz ergeben. r007 (2026-08-13) bewies das Gegenteil: scotch
partitioniert je Rangzahl anders, und mit der Partition aendert sich das
parallele snappy-Ergebnis (16 Raenge: 60 % weniger Zellen, Schiefe 7,2).
Seitdem: Vernetzen IMMER mit festen MESH_RANKS und method hierarchical;
nur der Solver rechnet mit den Raengen der Maschine.
"""
from __future__ import annotations

import pytest

from ..core.meshgen import (MESH_RANKS, PREVIEW_RANKS, drei_faktoren,
                            netz_zerlegung_dict)


def test_drei_faktoren_deterministisch_und_wuerfelig():
    assert drei_faktoren(8) == (2, 2, 2)
    assert drei_faktoren(2) == (2, 1, 1)
    assert drei_faktoren(4) == (2, 2, 1)
    assert drei_faktoren(6) == (3, 2, 1)
    assert drei_faktoren(16) == (4, 2, 2)
    assert drei_faktoren(1) == (1, 1, 1)
    # zweimal dieselbe Antwort — darauf baut die Standort-Gleichheit
    assert drei_faktoren(12) == drei_faktoren(12)


def test_zerlegungs_dict_hierarchisch_und_bytestabil():
    d1 = netz_zerlegung_dict(8)
    d2 = netz_zerlegung_dict(8)
    assert d1 == d2                       # byte-stabil
    assert "hierarchical" in d1 and "scotch" not in d1
    assert "n           (2 2 2)" in d1
    assert "order       xyz" in d1
    assert "numberOfSubdomains 8;" in d1


def test_vorgaben():
    assert MESH_RANKS >= 1
    assert PREVIEW_RANKS <= 2             # Fabios Entscheidung: Vorschau max 2


def test_laeufer_vernetzt_fest_und_loest_mit_maschinenraengen(monkeypatch):
    """Meshing-Dict hierarchical+MESH_RANKS; Solver-Dict weiterhin scotch."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]
                           / "engines" / "local"))
    from ..engines.local import local_runner as r

    # Solver-Zerlegung unveraendert scotch mit Maschinen-cores
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        case = Path(td); (case / "system").mkdir()
        r._decompose_dict(case, 6)
        text = (case / "system" / "decomposeParDict").read_text()
        assert "scotch" in text and "numberOfSubdomains 6;" in text

    # mpirun fuers Meshing: Uebersubskription erlaubt, kein taskset
    monkeypatch.setattr(r, "container_scheibe", lambda: False)
    monkeypatch.setattr(r, "kern_bindung", lambda *a, **k: "0,1,2,3,4,5")
    cmd = r.mpi_kommando(8, uebersubskription=True)
    assert "--oversubscribe" in cmd and "taskset" not in cmd
    assert cmd.endswith("-np 8")
    # Solver-Aufruf behaelt die Kern-Bindung
    assert r.mpi_kommando(6).startswith("taskset -c 0,1,2,3,4,5 ")
