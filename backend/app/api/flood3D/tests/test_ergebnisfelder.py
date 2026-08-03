"""
Tests der Ergebnisfelder-Aufbereitung: welche Solverfelder mitkommen, wie
fein das Visualisierungsgitter in der Höhe ist und ob die Prüfung vorher
warnt, wenn die Wassertiefe gar nicht auflösbar ist.

Hintergrund: Fabios erster echter Lauf zeigte außer der Sohlschubspannung
nichts — 2 m³/s über 5 s auf 1440 m² ergeben 7 mm Wasser bei 1 m Zellen.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.foamfields import MIN_VIZ_Z_LAYERS, viz_grid_for
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def test_viz_gitter_loest_die_hoehe_auf():
    """Aus 5 z-Schichten lässt sich keine Wasseroberfläche zeichnen."""
    spec = build_spec_stage3()
    g = viz_grid_for(spec)
    assert g.dims[2] >= MIN_VIZ_Z_LAYERS
    # in der Höhe feiner als im Grundriss
    assert g.spacing[2] <= g.spacing[0]
    # Grundriss bleibt bei der Basiszelle
    assert g.spacing[0] == pytest.approx(spec.mesh.base_cell)


def test_viz_gitter_bleibt_unter_der_obergrenze():
    from ..core.foamfields import MAX_VIZ_CELLS
    spec = build_spec_stage3()
    spec.domain = cs.Domain(extent=(0, 0, 2000, 2000), z_min=0, z_max=50)
    spec.mesh.base_cell = 0.5
    g = viz_grid_for(spec)
    assert g.dims[0] * g.dims[1] * g.dims[2] <= MAX_VIZ_CELLS


def test_alle_solverfelder_werden_eingesammelt(tmp_path):
    """p, k, omega, nut kommen mit — sonst fehlen sie im Viewer."""
    from ..core.foamfields import convert_case_fields
    from ..core.fields import read_index
    spec = build_spec_stage3()
    case = tmp_path / "case"
    (case / "0").mkdir(parents=True)
    n = 8

    def feld(name, wert, vektor=False):
        if vektor:
            werte = "\n".join(f"({wert} 0 0)" for _ in range(n))
        else:
            werte = "\n".join(str(wert) for _ in range(n))
        (case / "0" / name).write_text(
            f"dimensions [0 0 0 0 0 0 0];\ninternalField nonuniform "
            f"List<{'vector' if vektor else 'scalar'}>\n{n}\n(\n{werte}\n)\n;\n"
            "boundaryField {}\n")

    # Zellzentren + ein Ausgabezeitpunkt
    feld("C", 1.0, vektor=True)
    t = case / "1"
    t.mkdir()
    for name, val, vek in (("alpha.water", 0.5, False), ("U", 1.0, True),
                           ("p_rgh", 10.0, False), ("p", 20.0, False),
                           ("k", 0.1, False), ("omega", 5.0, False),
                           ("nut", 1e-5, False)):
        feld_pfad = t / name
        werte = ("\n".join(f"({val} 0 0)" for _ in range(n)) if vek
                 else "\n".join(str(val) for _ in range(n)))
        feld_pfad.write_text(
            f"dimensions [0 0 0 0 0 0 0];\ninternalField nonuniform "
            f"List<{'vector' if vek else 'scalar'}>\n{n}\n(\n{werte}\n)\n;\n"
            "boundaryField {}\n")

    convert_case_fields(spec, case, tmp_path / "run")
    felder = set(read_index(tmp_path / "run")["fields"])
    assert {"alpha", "U", "p_rgh", "p", "k", "omega", "nut"} <= felder


def test_fehlende_felder_stoeren_nicht(tmp_path):
    """Laminar hat kein k/omega/nut — der Index führt sie dann nicht."""
    from ..core.foamfields import convert_case_fields
    from ..core.fields import read_index
    spec = build_spec_stage3()
    case = tmp_path / "case"
    (case / "0").mkdir(parents=True)
    n = 8

    def schreib(pfad, val, vek=False):
        werte = ("\n".join(f"({val} 0 0)" for _ in range(n)) if vek
                 else "\n".join(str(val) for _ in range(n)))
        pfad.write_text(
            f"dimensions [0 0 0 0 0 0 0];\ninternalField nonuniform "
            f"List<{'vector' if vek else 'scalar'}>\n{n}\n(\n{werte}\n)\n;\n"
            "boundaryField {}\n")

    schreib(case / "0" / "C", 1.0, vek=True)
    t = case / "1"
    t.mkdir()
    schreib(t / "alpha.water", 0.5)
    schreib(t / "U", 1.0, vek=True)

    convert_case_fields(spec, case, tmp_path / "run")
    felder = set(read_index(tmp_path / "run")["fields"])
    assert "alpha" in felder and "U" in felder
    assert "k" not in felder and "nut" not in felder


# ---- Prüfregel: sieht man überhaupt Wasser? ------------------------------

def _spec_mit(q, dauer, cell, extent=(0, 0, 48, 30)):
    spec = build_spec_stage3()
    spec.terrain = None                 # Geländeeinfluss hier ausklammern
    spec.structures = []
    spec.mesh.refinements = []
    spec.mesh.boundary_layers = None
    spec.domain = cs.Domain(extent=extent, z_min=95.0, z_max=100.0)
    spec.mesh.base_cell = cell
    spec.solver.end_time = dauer
    spec.solver.initial_level = None
    for b in spec.boundaries:
        if b.type == "inflow_constant":
            b.q = q
    return spec


def _solver_warnungen(spec):
    return [x["message"] for x in validate_case(spec)
            if x["object_id"] == "solver" and x["severity"] == "warnung"]


def test_warnt_wenn_wasser_nicht_aufloesbar():
    """Fabios Fall: 2 m³/s, 5 s, 1440 m², 1 m Zellen -> 7 mm Wasser."""
    spec = _spec_mit(q=2.0, dauer=5.0, cell=1.0)
    msgs = _solver_warnungen(spec)
    assert any("Wassertiefe" in m for m in msgs), msgs
    assert any("Sohlschubspannung" in m for m in msgs)


def test_keine_warnung_bei_ausreichender_tiefe():
    # gleiches Gebiet, aber 20x so lange und feineres Netz
    spec = _spec_mit(q=2.0, dauer=200.0, cell=0.1)
    assert not any("Wassertiefe" in m for m in _solver_warnungen(spec))


def test_anfangswasserspiegel_zaehlt_mit():
    """Ein gefülltes Becken ist auch ohne Zulauf sichtbar."""
    spec = _spec_mit(q=2.0, dauer=5.0, cell=0.5)
    assert any("Wassertiefe" in m for m in _solver_warnungen(spec))
    from ..core.terrain import TerrainField
    spec.terrain = cs.Terrain(base=cs.TerrainBase(source="flat:95.5",
                                                  resolution=1.0))
    spec.solver.initial_level = 97.5          # 2 m über Gelände
    assert not any("Wassertiefe" in m for m in _solver_warnungen(spec))
