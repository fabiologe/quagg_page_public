"""
Tests: Wirkungen der Bruchkante und die stufenfreie Ergänzung.

Hintergrund: beim Import von Bruchkanten entstanden „automatisch"
Höhensprünge. Die Bruchkante selbst war unschuldig — die Ursache lag in
`tin_from_lines`: außerhalb der Dreiecksmaschen wurde die Höhe des
NÄCHSTEN Stützpunkts kopiert. Das ist ein Voronoi-Feld, stückweise
konstant, mit einer Stufe an jeder Zellgrenze. Liegen Ober- und Unterkante
einer Böschung nebeneinander, stand dazwischen die volle Höhendifferenz als
senkrechte Wand. An der echten Datei `Nacktes_Becken.dxf` betraf das 84 %
der Fläche.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.terrain import TerrainField, laplace_fuellen


def _max_stufe(z: np.ndarray) -> float:
    return max(float(np.max(np.abs(np.diff(z, axis=0)))),
               float(np.max(np.abs(np.diff(z, axis=1)))))


# ---- Die stufenfreie Ergänzung -------------------------------------------

def test_zwischen_zwei_kanten_entsteht_eine_neigung_keine_wand():
    """
    Zwei Kanten auf 100 und 97 m, dazwischen nichts gemessen. Die alte
    Füllung ergab dort eine 3-m-Wand, die neue eine gleichmäßige Neigung.
    """
    n = 41
    z = np.zeros((n, n))
    fest = np.zeros((n, n), dtype=bool)
    z[0, :], fest[0, :] = 100.0, True
    z[-1, :], fest[-1, :] = 97.0, True

    g = laplace_fuellen(z, fest)
    assert g[n // 2, n // 2] == pytest.approx(98.5, abs=0.05)
    # gleichmäßig: der größte Sprung liegt in der Größenordnung des
    # Gefälles je Zelle (3 m / 40 Zellen), nicht bei den vollen 3 m
    assert _max_stufe(g) < 0.15
    assert g[0, 0] == 100.0 and g[-1, 0] == 97.0, "feste Knoten bleiben"


def test_feste_knoten_werden_nie_veraendert():
    rng = np.random.default_rng(0)
    z = rng.normal(100.0, 2.0, (30, 30))
    fest = rng.random((30, 30)) < 0.2
    original = z.copy()
    g = laplace_fuellen(z, fest)
    assert np.allclose(g[fest], original[fest])


def test_ohne_bekannte_hoehen_bleibt_alles_stehen():
    z = np.full((10, 10), 5.0)
    assert np.allclose(laplace_fuellen(z, np.zeros((10, 10), bool)), 5.0)
    assert np.allclose(laplace_fuellen(z, np.ones((10, 10), bool)), 5.0)


# ---- Die Wirkungen der Bruchkante ----------------------------------------

RING = [(6.0, 6.0), (14.0, 6.0), (14.0, 14.0), (6.0, 14.0)]


def _fall(modus: str, hoehen) -> TerrainField:
    """Plateau 95,0 mit einer 1,5-m-Beule, dazu eine geschlossene Kante."""
    ring = [(x, y, h) for (x, y), h in zip(RING, hoehen)]
    ring.append(ring[0])
    terrain = cs.Terrain(
        base=cs.TerrainBase(source="flat:95.0", resolution=0.25),
        operations=[
            cs.OpRaiseLower(id="beule", type="raise_lower", center=(10.0, 10.0),
                            radius=4.0, strength=1.5),
            cs.OpBruchkante(id="k", type="bruchkante", polyline=ring,
                            breite=0.5, modus=modus),
        ])
    return TerrainField.from_spec(
        terrain, cs.Domain(extent=(0.0, 0.0, 20.0, 20.0), z_min=90.0,
                           z_max=100.0), ".")


def _innen(f: TerrainField):
    xx, yy = f.mesh_xy()
    m = (xx > 6.8) & (xx < 13.2) & (yy > 6.8) & (yy < 13.2)
    return float(f.z[m].min()), float(f.z[m].max())


def test_ziehen_laesst_das_innere_unberuehrt():
    """Der Ausgangsbefund: eine geschlossene Kante wirkt nur als Ring."""
    lo, hi = _innen(_fall("ziehen", [96.0] * 4))
    assert hi - lo == pytest.approx(1.5, abs=0.05), "die Beule steht noch"


def test_ebnen_erzeugt_eine_exakte_ebene():
    """Das ist die Zusage: innen eben, ohne jeden Höhensprung."""
    f = _fall("ebnen", [96.0] * 4)
    lo, hi = _innen(f)
    assert hi - lo < 1e-6, f"nicht eben: {lo} … {hi}"
    assert lo == pytest.approx(96.0, abs=1e-6), "auf Kantenhöhe"


def test_ebnen_folgt_einer_geneigten_kante():
    lo, hi = _innen(_fall("ebnen", [96.0, 96.0, 97.0, 97.0]))
    assert lo < 96.3 and hi > 96.7, "die Ausgleichsebene kippt mit"


def test_fuellen_trifft_die_kantenhoehe():
    f = _fall("fuellen", [96.0] * 4)
    lo, hi = _innen(f)
    assert lo == pytest.approx(96.0, abs=1e-3)
    assert hi - lo < 1e-3


def test_beide_lassen_das_aussenliegende_gelaende_in_ruhe():
    for modus in ("ebnen", "fuellen"):
        f = _fall(modus, [96.0] * 4)
        xx, _ = f.mesh_xy()
        aussen = (xx < 5.0) | (xx > 15.0)
        assert np.allclose(f.z[aussen], 95.0), modus


def test_offene_kante_wird_gedanklich_geschlossen():
    """
    Eine Vermessungskante ist selten sauber geschlossen. Statt die Wirkung
    zu verweigern, wird der Ring geschlossen — sonst müsste der Bearbeiter
    einen Punkt von Hand doppeln.
    """
    ring = [(x, y, 96.0) for x, y in RING]          # ohne Schlusspunkt
    terrain = cs.Terrain(
        base=cs.TerrainBase(source="flat:95.0", resolution=0.25),
        operations=[cs.OpBruchkante(id="k", type="bruchkante", polyline=ring,
                                    breite=0.5, modus="ebnen")])
    f = TerrainField.from_spec(
        terrain, cs.Domain(extent=(0.0, 0.0, 20.0, 20.0), z_min=90.0,
                           z_max=100.0), ".")
    lo, hi = _innen(f)
    assert hi - lo < 1e-6 and lo == pytest.approx(96.0, abs=1e-6)


def test_flaechenwirkung_bleibt_im_zeitrahmen_der_vorschau():
    """
    Das Gelände wird bei JEDER Eingabe neu gebaut. Über das ganze Raster
    zu relaxieren kostete Sekunden — gerechnet wird nur um den freien
    Bereich herum.
    """
    import time
    ring = [(46.0, 46.0, 96.0), (54.0, 46.0, 96.0), (54.0, 54.0, 96.0),
            (46.0, 54.0, 96.0), (46.0, 46.0, 96.0)]
    terrain = cs.Terrain(
        base=cs.TerrainBase(source="flat:95.0", resolution=0.25),
        operations=[cs.OpBruchkante(id="k", type="bruchkante", polyline=ring,
                                    breite=0.5, modus="fuellen")])
    dom = cs.Domain(extent=(0.0, 0.0, 100.0, 100.0), z_min=90.0, z_max=100.0)
    t0 = time.time()
    f = TerrainField.from_spec(terrain, dom, ".")
    dauer = time.time() - t0
    assert dauer < 2.0, f"{dauer:.1f} s für eine 8-m-Kante in 100 x 100 m"
    xx, yy = f.mesh_xy()
    m = (xx > 47) & (xx < 53) & (yy > 47) & (yy < 53)
    assert float(f.z[m].max() - f.z[m].min()) < 1e-3
