"""
Geländeanzeige ausgedünnt (Etappe E6e, Audit C12).

Der Editor baut aus jedem Rasterknoten ein Dreieckspaar; 500 × 500 m bei
0,5 m sind 1 Mio Knoten und ~5 MB je Griffzug. Die Geometrie-Antwort dünnt
das Raster für die ANZEIGE mit ganzzahligem Schritt aus, Rechnung und
Sculpt bleiben auf dem vollen Raster.
"""
from __future__ import annotations

import base64

import numpy as np

from ..core import casespec as cs
from ..router import ANZEIGE_KNOTEN_MAX, _geometrie_payload, anzeige_schritt
from .synthetic_case import build_spec_stage3


def test_schritt_haelt_die_knoten_unter_dem_deckel():
    assert anzeige_schritt((49, 49)) == 1
    assert anzeige_schritt((500, 500)) == 1                      # 250 000 = Deckel
    s = anzeige_schritt((1001, 1001))                            # 1 Mio Knoten
    assert s == 3 and (1001 // s + 1) ** 2 <= ANZEIGE_KNOTEN_MAX


def test_kleiner_fall_bleibt_unveraendert(tmp_path):
    spec = build_spec_stage3()
    t = _geometrie_payload(spec, tmp_path)["terrain"]
    assert t["ausduennung"] == 1 and t["resolution"] == 0.5
    assert t["dims"] == [37, 49]                                 # 18 / 0,5 + 1, 24 / 0,5 + 1


def test_grosser_fall_wird_fuer_die_anzeige_ausgeduennt(tmp_path):
    spec = build_spec_stage3()
    spec.domain = cs.Domain(extent=(0.0, 0.0, 500.0, 500.0), z_min=92.0, z_max=100.0)
    spec.terrain.operations = []
    spec.structures = []
    spec.mesh.refinements = []
    spec.evaluation = cs.Evaluation()
    t = _geometrie_payload(spec, tmp_path)["terrain"]
    assert t["ausduennung"] == 3 and t["resolution"] == 1.5
    assert t["dims"][0] * t["dims"][1] <= ANZEIGE_KNOTEN_MAX     # vorher 1 002 001
    z = np.frombuffer(base64.b64decode(t["z_b64"]), dtype="<f4")
    assert z.size == t["dims"][0] * t["dims"][1]
    assert np.allclose(z, 96.0)                                  # flat:96
