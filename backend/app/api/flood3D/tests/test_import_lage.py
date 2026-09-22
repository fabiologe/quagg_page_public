"""
Lage, Einheit und Gebiet für jede Kandidatenart (Audit I2, I7, I12) —
Etappe E2c der Sanierung.

Bis 2026-09-22 hingen Bbox, Offset-Vorschlag und Einheitenverdacht im
Manifest nur an NETZ-Kandidaten; eine Datei aus Linien und Kreisen bekam
nichts davon, `$INSUNITS` wurde nie gelesen, und ein fehlender Offset wurde
still zu 0 — drei Importe eines Betriebsfalls landeten in Gauß-Krüger, vier
Rohre in drei Koordinatenwelten. Das Gebiet aus dem Gelände ließ die
mitimportierten Rohre außen vor.
"""
from __future__ import annotations

import io
import json
import math

import numpy as np
import pytest

from ..core.importer import (_analysieren, _guess_role, analyze_file,
                             apply_import, import_neu_ableiten)
from . import dxf_fabrik as fx
from .synthetic_case import build_spec_stage3


def _dxf_dach(einheit_code: int, kante: float, hoehe: float,
              ursprung=(0.0, 0.0), kreis=None) -> bytes:
    """
    Offenes Dach-TIN (3DFACE, nicht wasserdicht) kante × kante in der
    Quelleinheit, optional ein Rohrkreis (mitte, radius, extrusion).
    """
    import ezdxf
    from ezdxf.math import OCS, Vec3

    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = einheit_code
    msp = doc.modelspace()
    ox, oy = ursprung
    us = np.linspace(0.0, kante, 4)

    def p(a, b):
        return (ox + us[a], oy + us[b], hoehe * us[a] / kante)

    for i in range(3):
        for j in range(3):
            msp.add_3dface([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j)],
                           dxfattribs={"layer": "FLAECHE"})
            msp.add_3dface([p(i, j), p(i + 1, j + 1), p(i, j + 1), p(i, j)],
                           dxfattribs={"layer": "FLAECHE"})
    if kreis:
        mitte, r, ext = kreis
        msp.add_circle(OCS(Vec3(ext)).from_wcs(Vec3(mitte)), r,
                       dxfattribs={"layer": "AUSLAUF", "extrusion": ext})
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def _fall(tmp_path):
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.to_yaml(tmp_path / "case.yaml")
    return spec


def _rollen(m, **fest):
    std = {"mesh": "gelaende", "kreis": "ablaufrohr", "polyline": "bruchkante"}
    return [{"candidate": c["id"], "role": fest.get(c["name"], std.get(c["kind"], "ignorieren"))}
            for c in m["candidates"]]


def _rohr_aus(spec, import_id):
    """Der Durchlass, der aus DIESEM Import stammt (der Referenzfall hat eigene)."""
    return next(s for s in spec.structures
                if s.type == "culvert" and getattr(s, "import_ref", None)
                and s.import_ref.import_id == import_id)


# ---- I2: Lage aus allen Kandidatenarten -----------------------------------

def test_linien_datei_bekommt_lage_und_einheit(tmp_path):
    n = fx.neun_linien()
    _, info = _analysieren(n["dxf"], "linien.dxf")
    assert info["einheit"] == {"code": 6, "name": "Meters", "faktor": 1.0}
    m = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    assert m["einheit"]["faktor"] == 1.0
    assert not any(c["kind"] == "mesh" for c in m["candidates"])
    # vorher: kein bbox, kein offset_suggest, kein unit_suspect (Schlüssel fehlten)
    ox, oy = fx.GK_URSPRUNG
    assert m["bbox"][0][0] == pytest.approx(ox + 0.2, abs=0.01)   # Rand r = 5,8 um (6, 6)
    assert m["bbox"][1][0] == pytest.approx(ox + 12.8, abs=0.01)  # Rohrkreis bis 12,0 + 0,8
    assert m["offset_suggest"] == [m["bbox"][0][0], m["bbox"][0][1]]
    assert m["unit_suspect"] is False
    assert m["stl_ursprung"] == [0.0, 0.0]                        # keine Netze


def test_raster_datei_bekommt_lage(tmp_path):
    asc = (b"ncols 3\nnrows 2\nxllcorner 2500000\nyllcorner 5400000\n"
           b"cellsize 10\nNODATA_value -9999\n1 2 3\n4 5 6\n")
    m = analyze_file(asc, "dgm.asc", tmp_path)
    assert m["bbox"][0][:2] == [2500000.0, 5400000.0]
    assert m["bbox"][1][:2] == [2500030.0, 5400020.0]
    assert m["offset_suggest"] == [2500000.0, 5400000.0]


# ---- I7: die Einheit der Zeichnung ----------------------------------------

def test_einheit_der_zeichnung_schlaegt_die_spannweite(tmp_path):
    # 3 m × 3 m in Millimetern: die Spannweite 3 000 galt als Meter und
    # das Dach als Gelände (Audit I7)
    m = analyze_file(_dxf_dach(4, 3000.0, 300.0), "schacht_mm.dxf", tmp_path / "a")
    assert m["einheit"] == {"code": 4, "name": "Millimeters", "faktor": 0.001}
    assert m["unit_suspect"] is False
    dach = next(c for c in m["candidates"] if c["kind"] == "mesh")
    assert dach["role_guess"] != "gelaende"
    # 6 km in Metern: bisher „sehr groß für Meter — Millimeter?"
    m = analyze_file(_dxf_dach(6, 6000.0, 60.0), "fluss_m.dxf", tmp_path / "b")
    assert m["unit_suspect"] is False
    # ohne Einheit bleibt der Verdacht — als Frage, nicht als Umschaltung
    m = analyze_file(_dxf_dach(0, 6000.0, 60.0), "unklar.dxf", tmp_path / "c")
    assert m["einheit"] is None and m["unit_suspect"] is True


def test_rollenraten_rechnet_mit_dem_faktor():
    stats = {"span_xy": (3000.0, 3000.0), "z_range": (0.0, 300.0),
             "watertight": False}
    assert _guess_role(stats, "", faktor=0.001) != "gelaende"
    assert _guess_role(stats, "") == "gelaende"          # alter Verdacht


# ---- I2: fehlender Offset wird nicht still zu 0 ---------------------------

def test_zweiter_import_ohne_offset_landet_in_der_welt_des_falls(tmp_path):
    spec = _fall(tmp_path)
    b = fx.nacktes_becken()
    m1 = analyze_file(b["dxf"], "becken.dxf", tmp_path)
    apply_import(spec, tmp_path, m1["import_id"], _rollen(m1),
                 offset=list(m1["offset_suggest"]), rotation_deg=12.0,
                 derive_domain=True)
    assert spec.meta.transform is not None
    # zweiter Import derselben Vermessung als Linien — OHNE Offset
    n = fx.neun_linien()
    m2 = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    info = apply_import(spec, tmp_path, m2["import_id"],
                        _rollen(m2, AUSLAUF_linie_linie="querschnitt"),
                        offset=None, terrain_from_lines=False)
    assert any("Verortung des ersten Imports gilt" in r for r in info["report"])
    rohr = _rohr_aus(spec, m2["import_id"])
    assert max(abs(v) for p in rohr.axis for v in p[:2]) < 100.0   # vorher 2,5 Mio
    a = json.loads((tmp_path / "imports" / m2["import_id"] / "anwendung.json").read_text())
    assert a["offset"] is not None and a["rotation_deg"] == pytest.approx(12.0)
    assert not any("weichen vom ersten Import ab" in r for r in info["report"])
    # und der Reapply bleibt stabil
    import_neu_ableiten(spec, tmp_path, m2["import_id"])
    rohr2 = _rohr_aus(spec, m2["import_id"])
    assert np.allclose(np.asarray(rohr.axis), np.asarray(rohr2.axis))


def test_erster_import_ohne_offset_nimmt_den_vorschlag(tmp_path):
    spec = _fall(tmp_path)
    n = fx.neun_linien()
    m = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    info = apply_import(spec, tmp_path, m["import_id"],
                        _rollen(m, AUSLAUF_linie_linie="querschnitt"),
                        offset=None, derive_domain=True, terrain_from_lines=True)
    assert any("Vorschlag" in r and "angewandt" in r for r in info["report"])
    x0, y0, x1, y1 = spec.domain.extent
    assert max(abs(x0), abs(y0), abs(x1), abs(y1)) < 100.0        # vorher 2,5 Mio
    assert spec.meta.transform is not None
    assert spec.meta.transform.translation[0] == pytest.approx(-m["offset_suggest"][0], abs=0.01)


def test_altimport_ohne_offset_wird_geheilt(tmp_path):
    """
    So lag es vor dem 22.09.2026: Anwendung `offset: null`, die Objekte in
    Gauß-Krüger neben einem lokalen Gebiet. Regel und Kur messen dieselbe
    Zahl — die Koordinaten der Objekte dieses Imports.
    """
    from ..core import kur
    from ..core.validate import validate_case

    spec = _fall(tmp_path)
    b = fx.nacktes_becken()
    m1 = analyze_file(b["dxf"], "becken.dxf", tmp_path)
    apply_import(spec, tmp_path, m1["import_id"], _rollen(m1),
                 offset=list(m1["offset_suggest"]), derive_domain=True)
    n = fx.neun_linien()
    m2 = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    apply_import(spec, tmp_path, m2["import_id"],
                 _rollen(m2, AUSLAUF_linie_linie="querschnitt"),
                 offset=None, terrain_from_lines=False)
    # den Altzustand nachstellen: Anwendung ohne Offset, Objekte in GK
    pfad = tmp_path / "imports" / m2["import_id"] / "anwendung.json"
    a = json.loads(pfad.read_text())
    a["offset"] = None
    pfad.write_text(json.dumps(a))
    ox, oy = fx.GK_URSPRUNG
    rohr = _rohr_aus(spec, m2["import_id"])
    rohr.axis = [(p[0] + ox, p[1] + oy, p[2]) for p in rohr.axis]

    def angeboten():
        return [x for x in validate_case(spec, tmp_path)
                if "ohne Offset" in x["message"]
                and ((x.get("fix") or {}).get("args") or {}).get("import_id")
                == m2["import_id"]]

    hin = angeboten()
    assert len(hin) == 1 and hin[0]["severity"] == "warnung"
    kur.anwenden(spec, "import_neu_ableiten_roh", {"import_id": m2["import_id"]}, tmp_path)
    assert angeboten() == []
    assert max(abs(v) for p in _rohr_aus(spec, m2["import_id"]).axis for v in p[:2]) < 100.0
    assert json.loads(pfad.read_text())["offset"] is not None


def test_lokale_datei_bleibt_unberuehrt(tmp_path):
    spec = _fall(tmp_path)
    m = analyze_file(_dxf_dach(6, 12.0, 1.0, ursprung=(3.0, 4.0)), "lokal.dxf", tmp_path)
    assert m["offset_suggest"] is None
    info = apply_import(spec, tmp_path, m["import_id"], _rollen(m), offset=None,
                        derive_domain=True)
    assert not any(r.startswith("Lage:") for r in info["report"])
    assert spec.domain.extent[0] == pytest.approx(3.0, abs=0.01)


# ---- I12: das Gebiet umfasst die mitimportierten Rohre --------------------

def test_gebiet_umfasst_das_rohr_mit_wandung(tmp_path):
    spec = _fall(tmp_path)
    # Dach 12 × 12 m, z 0 … 1; Rohr DN800 UNTER der tiefsten Stelle und
    # über den Rand hinaus (Mitte bei x = 13, Stutzen 2·D = ±0,8 m in x)
    kreis = ((13.0, 6.0, -1.0), 0.4, (1.0, 0.0, 0.0))
    m = analyze_file(_dxf_dach(6, 12.0, 1.0, kreis=kreis), "dach.dxf", tmp_path)
    info = apply_import(spec, tmp_path, m["import_id"], _rollen(m), derive_domain=True)
    rohr = _rohr_aus(spec, m["import_id"])
    x0, y0, x1, y1 = spec.domain.extent
    aussen = rohr.profile.diameter / 2 + rohr.profile.wandstaerke
    for p in rohr.axis:
        assert x0 <= p[0] <= x1 and y0 - aussen <= p[1] <= y1 + aussen
        assert spec.domain.z_min <= p[2] - aussen                # vorher: z_min = −0,5, Rohrsohle −1,55
    assert x1 >= 13.0 + 0.8 + aussen - 0.01                         # vorher: 12,0
    assert any("einschließlich 1 Rohr" in r for r in info["report"])
    # trockener Start bleibt am Gelände, nicht an der Rohrsohle
    assert spec.solver.initial_level == pytest.approx(0.0, abs=0.01)


# ---- I10: Kreis → Rohr nur als Querschnitt ---------------------------------

def _rohre_aus(spec, import_id):
    return [s for s in spec.structures
            if s.type == "culvert" and getattr(s, "import_ref", None)
            and s.import_ref.import_id == import_id]


def test_kreis_in_der_draufsicht_wird_kein_rohr(tmp_path):
    """
    Der Nachbau trägt einen Schachtdeckel (Achse senkrecht) und einen
    Rohrquerschnitt (Achse waagerecht). Mit der Rollenvermutung des Dialogs
    entsteht genau EIN Rohr; wer es besser weiß, darf den Deckel trotzdem
    zum Rohr erklären. Und die Dialogwahl „zulaufrohr" wird `rolle: zulauf`.
    """
    n = fx.neun_linien()
    spec = _fall(tmp_path)
    m = analyze_file(n["dxf"], "linien.dxf", tmp_path)
    deckel = next(c for c in m["candidates"] if "SCHACHT" in c["name"])
    assert deckel["role_guess"] == "ignorieren" and deckel["stats"]["lage"] == "draufsicht"
    vermutet = [{"candidate": c["id"], "role": c["role_guess"]} for c in m["candidates"]]
    apply_import(spec, tmp_path, m["import_id"], vermutet, terrain_from_lines=True)
    rohre = _rohre_aus(spec, m["import_id"])
    assert len(rohre) == 1 and rohre[0].rolle == "ablauf"          # vorher 2

    # Nutzer weiß es besser: Deckel als Zulaufrohr, Auslauf als Zulaufrohr
    fest = [{"candidate": c["id"],
             "role": "zulaufrohr" if c["kind"] == "kreis" else c["role_guess"]}
            for c in m["candidates"]]
    apply_import(spec, tmp_path, m["import_id"], fest, terrain_from_lines=True)
    rohre = _rohre_aus(spec, m["import_id"])
    assert len(rohre) == 2 and {r.rolle for r in rohre} == {"zulauf"}
