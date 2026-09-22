"""
Das closed-Flag der Polylinie (Audit I1) — Etappe E2b der Sanierung.

Ein Beckenrand aus dem CAD ist als Polylinie GESCHLOSSEN gezeichnet,
wiederholt seinen Anfangspunkt aber nicht. Bis 2026-09-22 las der Import
das Flag nie: „Ring" war nur, was den Anfang wiederholte, und gab es einen
Ring, fielen alle offenen Linien aus der Vermaschung. Aus neun Linien blieb
so die Sohle allein — eine Platte auf Sohlniveau, 11 × 11 Zellen, 37 %
Abdeckung, Gebiet 4,8 × 4,8 m (tests/golden/import_schnitt.json vor E2b).
Gemessen wird am Nachbau `dxf_fabrik.neun_linien`, nicht am Betriebsfall.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.importer import _analysieren, analyze_file, apply_import
from . import dxf_fabrik as fx
from .synthetic_case import build_spec_stage3


def _kandidaten(n: dict) -> dict:
    return {c["name"]: c for c in _analysieren(n["dxf"], "linien.dxf")[0]}


def _lesen(pfad):
    zeilen = pfad.read_text().splitlines()
    z = np.array([[float(x) for x in l.split()] for l in zeilen[6:]])[::-1]
    return np.where(z <= -9998, np.nan, z)


def test_closed_flag_macht_den_beckenrand_zum_ring():
    n = fx.neun_linien()
    k = _kandidaten(n)
    rand = k["Bruchkanten_linie_3_linie"]
    assert rand["stats"]["geschlossen"] is True
    pts = rand["_polyline"]
    # EIN Ort schließt: der Anfangspunkt wird angehängt, sonst nichts
    assert len(pts) == len(n["rand"]) + 1 and pts[0] == pts[-1]
    # die Sohle wiederholte ihren Anfang schon — kein zweiter Schlusspunkt
    sohle = k["Bruchkanten_linie_1_linie"]
    assert sohle["stats"]["geschlossen"] is True
    assert len(sohle["_polyline"]) == len(n["sohle"]) + 1
    # eine Böschungslinie bleibt offen
    assert k["Bruchkanten_linie_6_linie"]["stats"]["geschlossen"] is False


def test_neun_linien_ergeben_das_ganze_becken(tmp_path):
    """
    End-to-end durch analyze_file + apply_import: zwei Ringe, das Raster
    umfasst den Beckenrand, die Höhen im Bericht stammen aus dem Raster.
    """
    n = fx.neun_linien()
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.to_yaml(tmp_path / "case.yaml")
    m = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    rollen = {"polyline": "bruchkante", "kreis": "ablaufrohr"}
    dec = [{"candidate": c["id"],
            "role": ("querschnitt" if c["name"].startswith("AUSLAUF_linie")
                     else rollen.get(c["kind"], "ignorieren"))}
           for c in m["candidates"]]
    info = apply_import(spec, tmp_path, m["import_id"], dec,
                        offset=list(fx.GK_URSPRUNG), derive_domain=True,
                        terrain_from_lines=True)
    bericht = " ".join(info["report"])
    assert "2 geschlossenen Kanten" in bericht, bericht
    assert "Stützzellen im Raster" in bericht, bericht

    z = _lesen(tmp_path / spec.terrain.base.source)
    # das Raster umfasst den ganzen Beckenrand (11,6 m) — vorher nur die
    # Sohle (4,8 m: 11 × 11 bei 0,5 m); die Rasterweite folgt seit E6b den
    # Daten (halber Stützpunktabstand), daher aus der Spec gerechnet
    res = spec.terrain.base.resolution
    erwartet = int(np.ceil(11.6 / res)) + 1
    assert z.shape == (erwartet, erwartet), (z.shape, res)
    # Zellmitten treffen die Ringknoten nicht exakt — bei ~1,1 m Zellen
    # liegt die nächste Zelle bis 0,5 m neben dem Kronenknoten, die Krone
    # variiert ±0,3 m; kein Höhenverlust (vorher: Maximum 223,38, die Sohle)
    assert np.nanmax(z) == pytest.approx(fx.KRONE, abs=0.15)
    assert np.nanmin(z) == pytest.approx(fx.SOHLE, abs=0.15)
    # ein 16-Eck deckt ~72 % seines Hüllquadrats, Randzellen ausgenommen:
    # 66 % bei 0,5-m-Zellen, 54 % bei ~1,1 m — vorher 37 % (nur die Sohle)
    assert float(np.mean(~np.isnan(z))) > 0.5
    x0, y0, x1, y1 = spec.domain.extent
    assert x1 - x0 > 11.0 and y1 - y0 > 11.0          # vorher 4,8 m
    rand = next(k for k in spec.terrain.kanten if "linie_3" in k.id)
    assert rand.geschlossen
    assert spec.terrain.base.aussenhoehe == pytest.approx(fx.KRONE, abs=0.05)
