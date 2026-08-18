"""
Oberflaechenbelaege: verschiedene Rauheiten auf EINEM Gelaende.

In OpenFOAM haengt die Rauheit nicht an einer Zelle, sondern an der
Wandflaeche — und sie wird je PATCH als eine Zahl geschrieben
(`Ks uniform 0.03` in 0/nut). Ein Bauwerk hat deshalb schon lange sein
Material; das Gelaende war EIN Patch und konnte nur EINE Rauheit tragen.

Der Weg (an OpenFOAM v2406 im Container gegengeprueft, siehe
core/belag.py): topoSet schneidet die Gelaendeflaechen unter einem
Belags-Prisma heraus, createPatch macht daraus einen eigenen Wandpatch,
0/nut gibt ihm sein k_s.
"""
from __future__ import annotations

import numpy as np

from ..core import casespec as cs
from ..core.belag import belag_koerper, belag_polygone, lade_belagskarte
from ..core.casebuilder import (belag_patch, create_patch_dict,
                                initial_fields, topo_set_dict)
from .synthetic_case import build_spec_stage3


def _karte_schreiben(pfad, ids, x0=0.0, y0=0.0, zelle=1.0):
    """ESRI-ASCII mit Belag-Kennungen. Zeile 0 der Datei ist die OBERSTE."""
    ny, nx = ids.shape
    zeilen = [f"ncols {nx}", f"nrows {ny}", f"xllcorner {x0}",
              f"yllcorner {y0}", f"cellsize {zelle}", "NODATA_value -9999"]
    for j in range(ny - 1, -1, -1):
        zeilen.append(" ".join(str(int(v)) for v in ids[j]))
    pfad.write_text("\n".join(zeilen) + "\n")


def _fall(tmp_path, ids=None):
    """Stufe-3-Fall mit einer Belagskarte: linke Haelfte Beton, rechte Erde."""
    spec = build_spec_stage3()
    if ids is None:
        ids = np.ones((18, 24), dtype=int)
        ids[:, 12:] = 2
    _karte_schreiben(tmp_path / "belag.asc", ids)
    spec.terrain.belagskarte = cs.Belagskarte(
        source="belag.asc",
        belaege=[cs.Belag(id=1, name="Beton", ks=0.002),
                 cs.Belag(id=2, name="Rasen", ks=0.03)])
    return spec


# ── Geometrie ───────────────────────────────────────────────────────────────

def test_kennungen_werden_nicht_interpoliert(tmp_path):
    """
    Zwischen Kennung 1 und 3 laege interpoliert 2 — ein Belag, den
    niemand gemalt hat. Deshalb wird ganzzahlig gelesen.
    """
    ids = np.array([[1, 1, 3], [1, 3, 3]], dtype=int)
    _karte_schreiben(tmp_path / "k.asc", ids)

    gelesen, x0, y0, zelle = lade_belagskarte(tmp_path / "k.asc")

    assert sorted(np.unique(gelesen).tolist()) == [1, 3]
    assert zelle == 1.0
    # Zeile 0 des Ergebnisses ist die UNTERSTE (y0) — in der DATEI steht
    # sie zuletzt. Genau diese Umkehrung macht `lade_belagskarte`.
    assert gelesen[0].tolist() == [1, 1, 3]
    assert gelesen[1].tolist() == [1, 3, 3]


def test_flecken_desselben_belags_werden_eine_flaeche(tmp_path):
    ids = np.array([[1, 0, 1], [1, 0, 1]], dtype=int)
    _karte_schreiben(tmp_path / "k.asc", ids)
    gelesen, x0, y0, zelle = lade_belagskarte(tmp_path / "k.asc")

    polys = belag_polygone(gelesen, x0, y0, zelle)

    assert set(polys) == {1}                     # 0 ist kein Belag
    assert polys[1].area == 4.0                  # 4 Zellen a 1 m2
    koerper = belag_koerper(polys[1], 90.0, 100.0)
    assert koerper is not None
    assert koerper.volume > 0


def test_leerer_belag_faellt_heraus(tmp_path):
    """Gemalt und wieder uebermalt: ein Patch ohne Flaechen braecht
    createPatch ab."""
    ids = np.zeros((3, 3), dtype=int)
    _karte_schreiben(tmp_path / "k.asc", ids)
    gelesen, x0, y0, zelle = lade_belagskarte(tmp_path / "k.asc")
    assert belag_polygone(gelesen, x0, y0, zelle) == {}


# ── Fallaufbau ──────────────────────────────────────────────────────────────

def test_topo_set_schneidet_je_belag_aus_dem_gelaende(tmp_path):
    ts = topo_set_dict(_fall(tmp_path), tmp_path)

    assert ts is not None
    # erst ALLE Gelaendeflaechen, dann auf die unter dem Prisma einschraenken
    assert "patchToFace" in ts and "patch   terrain;" in ts
    assert ts.count("searchableSurfaceToFace") == 2
    assert 'file    "belag1.stl";' in ts and 'file    "belag2.stl";' in ts
    assert "action  subset;" in ts


def test_create_patch_macht_je_belag_eine_wand(tmp_path):
    spec = _fall(tmp_path)
    cp = create_patch_dict(spec, tmp_path)

    assert cp is not None
    for b in spec.terrain.belagskarte.belaege:
        assert belag_patch(b) in cp
    assert cp.count("type            wall;") >= 2


def test_jeder_belag_bekommt_seine_eigene_rauheit(tmp_path):
    spec = _fall(tmp_path)
    nut = initial_fields(spec, tmp_path)["nut"]

    # Beton und Rasen mit ihren eigenen k_s, nicht mit dem Gelaendewert
    assert "Ks              uniform 0.002;" in nut
    assert "Ks              uniform 0.03;" in nut
    for b in spec.terrain.belagskarte.belaege:
        assert belag_patch(b) in nut
    # der Rest des Gelaendes behaelt sein Grundmaterial
    assert "\n    terrain\n" in nut


def test_ohne_belagskarte_aendert_sich_nichts(tmp_path):
    """Der Regelfall bleibt unberuehrt: ein Fall ohne Karte baut genau
    wie vorher."""
    ohne = build_spec_stage3()
    nut = initial_fields(ohne, tmp_path)["nut"]
    assert "belag" not in nut
    assert (create_patch_dict(ohne, tmp_path) or "").count("belag") == 0


def test_fehlende_kartendatei_kippt_den_fallaufbau_nicht(tmp_path):
    """
    Ein Stand, dessen Rasterdatei fehlt, muss weiter baubar sein — sonst
    steht der Bearbeiter vor einem Fall, den er nicht mehr oeffnen kann.
    Die Pruefung meldet das getrennt.
    """
    spec = build_spec_stage3()
    spec.terrain.belagskarte = cs.Belagskarte(
        source="gibtsnicht.asc",
        belaege=[cs.Belag(id=1, name="Beton", ks=0.002)])

    nut = initial_fields(spec, tmp_path)["nut"]
    assert "belag" not in nut
    ts = topo_set_dict(spec, tmp_path)
    assert ts is None or "belag" not in ts


def test_die_rauheitspruefung_sieht_die_belaege(tmp_path):
    """
    Ein Belag mit grober Rauheit auf feinem Netz ist derselbe Fehler wie
    ein grobes Gelaendematerial — er darf nicht durchrutschen, nur weil
    er in der Karte statt am Terrain steht.
    """
    from ..core.validate import validate_case

    spec = _fall(tmp_path)
    spec.terrain.material = "stahl"        # Grundmaterial glatt
    spec.terrain.belagskarte.belaege[1].ks = 0.1   # Steinschuettung
    spec.mesh.base_cell = 0.2
    spec.mesh.refinements = []

    texte = [b["message"] for b in validate_case(spec, tmp_path)
             if "k_s" in b["message"]]
    assert any("0.1" in t for t in texte), texte


def test_die_schubspannung_verliert_die_belagsflaechen_nicht(tmp_path):
    """
    DER Fallstrick beim Umbau: die tau-Karte liest die Wandflaechen
    NAMENTLICH vom Patch `terrain`. Deckt die Belagskarte das ganze
    Gebiet ab, schneidet createPatch alle Flaechen heraus und `terrain`
    verschwindet — Karte B der Laubkarten waere dann leer, ohne dass
    irgendwo ein Fehler auftaucht.

    Am echten Netz gegengeprueft (base_cell 1,0 m): 2667 Gelaendeflaechen,
    danach 1428 Beton + 1239 Rasen = 2667. Keine doppelt, keine verloren.
    """
    from ..core.casebuilder import control_dict

    ctl = control_dict(_fall(tmp_path))
    # Das Funktionsobjekt muss die Belag-Patches mit abdecken
    assert '"terrain_belag.*"' in ctl


def test_gelaende_patches_werden_aus_dem_NETZ_gelesen(tmp_path):
    """
    Nicht aus der Spezifikation: nur das Netz weiss, was wirklich
    entstanden ist (ein leerer Belag faellt heraus, ein vollstaendig
    ueberdecktes `terrain` ist weg).
    """
    from ..core.foamfields import _gelaende_patches

    (tmp_path / "constant" / "polyMesh").mkdir(parents=True)
    (tmp_path / "constant" / "polyMesh" / "boundary").write_text(
        "3\n(\n"
        "    terrain_belag1\n    {\n        type wall;\n    }\n"
        "    terrain_belag2\n    {\n        type wall;\n    }\n"
        "    inlet\n    {\n        type patch;\n    }\n)\n")

    assert _gelaende_patches(tmp_path) == ["terrain_belag1", "terrain_belag2"]


def test_ohne_netz_bleibt_es_beim_gelaende(tmp_path):
    from ..core.foamfields import _gelaende_patches
    assert _gelaende_patches(tmp_path) == ["terrain"]
