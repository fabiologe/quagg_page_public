"""
Tests Anschluss-Reparatur: nach Drehen oder Zuschneiden sitzt die
Randbedingung auf der falschen Gebietsfläche, die Rohrachse endet im
Nirgendwo und Verfeinerungsquader ragen heraus. Das sind mechanische
Folgen, keine fachlichen — sie müssen sich aus der Geometrie herleiten
lassen, ohne die Rohrlage zu verändern.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.anschluss import (anschluesse_herstellen, boxen_ins_gebiet,
                              stutzen_anschliessen)
from ..core.rotate import rotate_case
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _mit_stutzen() -> cs.CaseSpec:
    """Becken-Fall mit Ablaufstutzen quer durch die Böschung an x_min."""
    spec = build_spec_stage3()
    spec.structures.append(cs.StructCulvert(
        id="dn800", type="culvert", patch="dn800",
        # schräg zur Gebietsfläche, wie eine Rohrleitung durch eine
        # schiefe Böschung: 20° aus der x-Achse gedreht
        axis=[(6.0, 9.0, 95.0), (2.0, 7.5, 94.9)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8),
        # das Rohr liegt im Damm — ohne diesen Schalter meldet die Prüfung
        # zu Recht, dass der Vernetzer sein Inneres wegräumen würde
        durchstoesst_gelaende=True))
    # der Zulauf würde sonst per Vorbelegung ebenfalls auf x_min landen
    next(b for b in spec.boundaries if b.id == "zulauf").face = "y_max"
    ablauf = next(b for b in spec.boundaries if b.id == "ablauf")
    ablauf.face = "x_min"
    ablauf.window = cs.BcWindow(shape="rechteck", follow="dn800")
    return spec


def test_stutzen_wird_in_eigener_richtung_verlaengert():
    spec = _mit_stutzen()
    p0 = np.array(spec.structures[-1].axis[-1], dtype=float)
    richtung_alt = p0 - np.array(spec.structures[-1].axis[0], dtype=float)

    meldung = stutzen_anschliessen(spec, spec.structures[-1], "x_min")

    ende = np.array(spec.structures[-1].axis[-1], dtype=float)
    richtung_neu = ende - np.array(spec.structures[-1].axis[0], dtype=float)
    # Richtung unverändert (gleicher Einheitsvektor) — der Rohrscheitel
    # bleibt, wie er liegt
    e_alt = richtung_alt / np.linalg.norm(richtung_alt)
    e_neu = richtung_neu / np.linalg.norm(richtung_neu)
    assert np.allclose(e_alt, e_neu, atol=1e-6)
    # steht jetzt eine Basiszelle hinter x_min = 0
    assert ende[0] == pytest.approx(-spec.mesh.base_cell, abs=1e-3)
    assert "dn800" in meldung


def test_zu_langer_stutzen_wird_gekuerzt():
    spec = _mit_stutzen()
    spec.structures[-1].axis[-1] = (-3.0, 6.0, 94.7)
    stutzen_anschliessen(spec, spec.structures[-1], "x_min")
    assert spec.structures[-1].axis[-1][0] == pytest.approx(-0.5, abs=1e-3)


def test_parallele_achse_meldet_statt_zu_raten():
    spec = _mit_stutzen()
    spec.structures[-1].axis = [(6.0, 9.0, 95.0), (6.0, 2.0, 95.0)]
    meldung = stutzen_anschliessen(spec, spec.structures[-1], "x_min")
    assert "parallel" in meldung


def test_flaeche_folgt_der_geometrie():
    spec = _mit_stutzen()
    # Stutzen zeigt in Wahrheit nach y_min, die Randbedingung steht auf x_min
    spec.structures[-1].axis = [(12.0, 9.0, 95.0), (12.0, 0.2, 94.9)]
    meldungen = anschluesse_herstellen(spec)
    ablauf = next(b for b in spec.boundaries if b.id == "ablauf")
    assert ablauf.face == "y_min"
    assert any("y_min" in m for m in meldungen)


def test_belegte_flaeche_wird_gemeldet_statt_ueberschrieben():
    spec = _mit_stutzen()
    # der Stutzen endet an y_max — dort liegt schon der Zulauf
    spec.structures[-1].axis = [(6.0, 9.0, 95.0), (6.0, 17.8, 94.9)]
    meldungen = anschluesse_herstellen(spec)
    ablauf = next(b for b in spec.boundaries if b.id == "ablauf")
    assert ablauf.face == "x_min"          # unverändert
    assert any("schon" in m for m in meldungen)


def test_boxen_werden_ins_gebiet_beschnitten():
    spec = build_spec_stage3()
    spec.mesh.refinements[0].extent = (-3.0, 6.0, 94.0, 12.0, 25.0, 97.0)
    meldungen = boxen_ins_gebiet(spec)
    assert spec.mesh.refinements[0].extent[0] == 0.0
    assert spec.mesh.refinements[0].extent[4] == 18.0
    assert meldungen


def test_nach_drehung_ist_der_fall_wieder_laufbereit(tmp_path):
    """Der eigentliche Zweck: drehen, reparieren, keine Fehler mehr."""
    spec = _mit_stutzen()
    rotate_case(spec, 15.0, tmp_path)
    vorher = [f for f in validate_case(spec, tmp_path) if f["severity"] == "fehler"]
    assert vorher, "Drehung muss den Anschluss zunächst zerreißen"

    anschluesse_herstellen(spec)

    nachher = [f for f in validate_case(spec, tmp_path)
               if f["severity"] == "fehler"]
    assert nachher == [], nachher


def test_ohne_befund_wird_nichts_angefasst():
    spec = build_spec_stage3()
    vorher = spec.model_dump(mode="json")
    assert anschluesse_herstellen(spec) == []
    assert spec.model_dump(mode="json") == vorher
