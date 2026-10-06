"""Gelaende aus XYZ-Raster und ASCII-Grid (Fahrplan BIMFY XYZ, Stufe X2).

Geprueft wird an erzeugten Rastern (keine echte Datei im Repo): Lesen beider
Formate, das Ausduennen mit eingehaltener Toleranz, eine DICHTE Flaeche (keine
Risse, auch nicht an Kachelgrenzen), Luecken bleiben Luecken, und das IFC
besteht das Prueftor.
"""
from collections import Counter

import ifcopenshell
import numpy as np
import pytest

from app.ifc import gelaende as G


def _huegel(n=129, x0=410000.0, y0=5460000.0, d=1.0):
    y, x = np.mgrid[0:n, 0:n]
    z = 100 + 3 * np.sin(x / 30) * np.cos(y / 40) + 0.5 * (x > n * 0.6)
    return G.Raster(x0, y0, d, d, z, quelle="huegel.xyz", format="xyz-raster")


def _randkanten(dreiecke):
    zaehler = Counter(tuple(sorted(e)) for a, b, c in dreiecke for e in ((a, b), (b, c), (c, a)))
    assert max(zaehler.values()) <= 2, "eine Kante in mehr als zwei Dreiecken"
    return [k for k, v in zaehler.items() if v == 1]


def test_ascii_grid_ecke_mitte_nodata_und_nord_zuerst():
    text = "ncols 3\nnrows 2\nxllcorner 100\nyllcorner 200\ncellsize 2\nNODATA_value -9999\n1 2 3\n4 -9999 6\n"
    r = G.lies_asc(text, "x.asc")
    assert (r.x0, r.y0, r.dx) == (101.0, 201.0, 2.0)          # Ecke + halbe Zelle = Mitte
    assert r.z[0].tolist()[0] == 4 and np.isnan(r.z[0, 1])    # die SUEDzeile ist die letzte der Datei
    assert r.z[1].tolist() == [1, 2, 3]
    m = G.lies_asc(text.replace("xllcorner 100", "xllcenter 100").replace("yllcorner 200", "yllcenter 200"))
    assert (m.x0, m.y0) == (100.0, 200.0)
    with pytest.raises(G.GelaendeFehler, match="erwartet"):
        G.lies_asc("ncols 3\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 1\n1 2 3\n")


def test_xyz_raster_mit_luecke_semikolon_und_komma():
    zeilen = ["x;y;z"] + [f"{410000 + 2 * i};{5460000 + 2 * j};{100 + i},{j}" for i in range(4) for j in range(3) if (i, j) != (2, 1)]
    r = G.lies_xyz("\n".join(zeilen), "dgm.xyz")
    assert r.z.shape == (3, 4) and (r.dx, r.dy) == (2.0, 2.0)
    assert np.isnan(r.z[1, 2]) and r.z[2, 3] == pytest.approx(103.2)
    assert r.punkte == 11 and r.hinweise == ["1 Zeile(n) ohne drei Zahlen uebergangen"]
    # Eine unregelmaessige Aufnahme ist KEIN Raster — gesagt, nicht geraten.
    unregel = "\n".join(f"{x} {y} 100" for x, y in [(0, 0), (1.3, 0.2), (2.9, 4.1), (0.4, 3.3), (5.5, 1.7)])
    with pytest.raises(G.GelaendeFehler, match="kein regelmaessiges Raster"):
        G.lies_xyz(unregel)
    assert G.lies("a.asc", "ncols 2\nnrows 2\nxllcenter 0\nyllcenter 0\ncellsize 1\n1 1\n1 1\n").format == "ascii-grid"


def test_ebene_wird_zwei_dreiecke():
    assert len(G.rtin(np.full((9, 9), 5.0), 0.01)) == 2


def test_ausduennen_haelt_die_toleranz_und_bleibt_dicht():
    r = _huegel()
    punkte, dreiecke, abw, t = G.netz_eingehalten(r, 0.02)
    assert abw <= 0.02 and len(punkte) < r.punkte / 5           # deutlich weniger Punkte
    rand = _randkanten(dreiecke)
    # Jede offene Kante liegt am Aussenrand des Rasters — innen kein Riss (kein T-Stoss).
    for a, b in rand:
        pa, pb = punkte[a], punkte[b]
        aussen = lambda p: p[0] in (r.x0, r.x0 + 128) or p[1] in (r.y0, r.y0 + 128)   # noqa: E731
        assert aussen(pa) and aussen(pb), (pa, pb)


def test_luecken_bleiben_luecken():
    r = _huegel(65)
    r.z[20:30, 20:30] = np.nan
    punkte, dreiecke, abw, _ = G.netz_eingehalten(r, 0.02)
    assert abw <= 0.02
    # Kein Netzpunkt in der Luecke, kein Dreieck ueber ihr.
    innen = (punkte[:, 0] > r.x0 + 20) & (punkte[:, 0] < r.x0 + 29) & (punkte[:, 1] > r.y0 + 20) & (punkte[:, 1] < r.y0 + 29)
    assert not innen.any()
    mitte = punkte[dreiecke].mean(axis=1)
    assert not ((mitte[:, 0] > r.x0 + 21) & (mitte[:, 0] < r.x0 + 28) & (mitte[:, 1] > r.y0 + 21) & (mitte[:, 1] < r.y0 + 28)).any()


def test_kacheln_passen_ohne_riss_aneinander(monkeypatch):
    monkeypatch.setattr(G, "KACHEL", 16)
    r = _huegel(41)
    punkte, dreiecke = G.netz(r, 0.02)
    for a, b in _randkanten(dreiecke):
        pa, pb = punkte[a], punkte[b]
        aussen = lambda p: p[0] in (r.x0, r.x0 + 40) or p[1] in (r.y0, r.y0 + 40)   # noqa: E731
        assert aussen(pa) and aussen(pb), "Riss an einer Kachelgrenze"
    assert G.groesste_abweichung(r, punkte, dreiecke) <= 0.03


def test_ifc_terrain_tin_georeferenz_und_prueftor(tmp_path):
    from app.ifc.pruefe import pruefe, offen
    ziel = tmp_path / "Gelaende_huegel_R01.ifc"
    bericht = G.schreibe_gelaende(_huegel(65), ziel, crs="EPSG:25832", name="huegel")
    assert bericht["groesste_abweichung"] <= 0.02 and bericht["dreiecke"] > 2
    f = ifcopenshell.open(str(ziel))
    (el,) = f.by_type("IfcGeographicElement")
    assert el.PredefinedType == "TERRAIN"
    (tin,) = f.by_type("IfcTriangulatedIrregularNetwork")
    assert len(tin.CoordIndex) == bericht["dreiecke"] == len(tin.Flags)
    assert f.by_type("IfcMapConversion") and f.by_type("IfcProjectedCRS")[0].Name == "EPSG:25832"
    pset = {p.Name: p.NominalValue.wrappedValue for r in el.IsDefinedBy
            for p in r.RelatingPropertyDefinition.HasProperties if r.RelatingPropertyDefinition.Name == "Quagg_Gelaende"}
    assert pset["Rasterpunkte"] == 65 * 65 and pset["Format"] == "xyz-raster"
    assert [b for b in pruefe(ziel)["befunde"] if offen(b)] == []


def test_laufordner_modus_gelaende(tmp_path):
    """Der Unterprozess-Vertrag (cli.lauf): auftrag.json mit modus "gelaende" → verbund.ifc,
    bericht.json, status "geprueft" — so traegt der Server es ein wie einen Verbund."""
    import json
    from app.ifc import cli
    r = _huegel(33)
    asc = tmp_path / "dgm.asc"
    zeilen = "\n".join(" ".join(f"{v:.2f}" for v in reihe) for reihe in r.z[::-1])
    asc.write_text(f"ncols 33\nnrows 33\nxllcenter {r.x0}\nyllcenter {r.y0}\ncellsize 1\nNODATA_value -9999\n{zeilen}\n")
    (tmp_path / "auftrag.json").write_text(json.dumps({"modus": "gelaende", "datei": str(asc), "crs": "EPSG:25832",
                                                       "name": "dgm", "schluessel": "test"}))
    assert cli.lauf(tmp_path) == 0
    status = json.loads((tmp_path / "status.json").read_text())
    bericht = json.loads((tmp_path / "bericht.json").read_text())
    assert status["zustand"] == "geprueft", status
    assert bericht["format"] == "ascii-grid" and bericht["groesste_abweichung"] <= 0.02
    assert (tmp_path / "verbund.ifc").is_file()
