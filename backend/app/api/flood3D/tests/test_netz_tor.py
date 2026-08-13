"""
Netz-Qualitaetstor: ein durchgefallenes Netz erreicht den Solver nicht.
r007 rechnete 2,5 h auf Schiefe 7,2 — die Zahlen standen im Manifest,
niemand sah sie, niemand stoppte den Lauf.
"""
from __future__ import annotations

import pytest

from ..core.evaluate import befunde_ableiten
from ..core.meshgen import NetzTorFehler, netz_tor

GUT = {"cells": 317375, "points": 400000, "max_non_ortho": 64.5,
       "max_skewness": 3.66, "checkmesh_ok": True}
KAPUTT = {"cells": 127466, "points": 163532, "max_non_ortho": 64.5,
          "max_skewness": 7.20483, "checkmesh_ok": False, "failed_checks": 1}


def test_gutes_netz_passiert_das_tor():
    assert netz_tor(GUT) == []


def test_r007_haette_nie_rechnen_duerfen():
    with pytest.raises(NetzTorFehler) as e:
        netz_tor(KAPUTT)
    befunde = e.value.befunde
    fehler = [b for b in befunde if b["severity"] == "fehler"]
    assert any("7.20483" in str(b.get("wert")) or b.get("wert") == 7.20483
               for b in fehler)
    assert any(b.get("quelle") == "checkmesh" for b in fehler)


def test_zellabweichung_ist_nur_warnung():
    vorschau = {"cells": 317375, "ohne_verfeinerung": False}
    befunde = netz_tor({**GUT, "cells": 200000}, vorschau)   # -37 %
    assert len(befunde) == 1 and befunde[0]["severity"] == "warnung"
    assert befunde[0]["quelle"] == "vorschau"


def test_vereinfachte_vorschau_wird_uebersprungen():
    vorschau = {"cells": 50000, "ohne_verfeinerung": True}   # bewusste Untergrenze
    assert netz_tor(GUT, vorschau) == []


def test_befunde_aus_qualitaetszahlen():
    quality = {"y_plus_range": [0.01, 81201.99], "courant_max": 2.240887,
               "checkmesh_ok": True}
    manifest = {"viz_volume_error_rel_max": 0.3229}
    befunde = befunde_ableiten(quality, manifest)
    quellen = {b["quelle"] for b in befunde}
    assert quellen == {"yplus", "courant", "viz_volume"}
    assert all(b["severity"] == "warnung" for b in befunde)
    # gesunde Zahlen -> keine Befunde
    assert befunde_ableiten({"y_plus_range": [1, 200], "courant_max": 0.5,
                             "checkmesh_ok": True}, {}) == []
