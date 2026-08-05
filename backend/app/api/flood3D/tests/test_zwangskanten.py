"""
Tests: das Gelände entsteht ZWISCHEN den Kanten, nicht aus einer Punktwolke.

Eine gewöhnliche Delaunay kennt die Ringe nicht. Sie vermascht die Punkte,
schneidet Ecken ab und spannt Dreiecke quer durch das Becken — hinterher
wurde weggeschnitten, was zu weit greift, und übrig blieben Löcher, die
wieder gefüllt werden mussten. Beides erfindet Gelände.

Mit Zwangskanten ist jeder geschlossene Ring eine GRENZE und der
nächstinnere sein Loch:

    innerhalb der Sohle            -> vermascht
    zwischen Sohle und Beckenrand  -> vermascht
    quer durch das Becken          -> gibt es nicht

und es entsteht kein einziger neuer Stützpunkt.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.importer import (_raster_aus_dreiecken, tin_aus_ringen,
                             tin_from_lines)


def _ring(a: float, b: float, z: float, n: int = 8) -> np.ndarray:
    """Geschlossenes Rechteck mit n Punkten je Seite, konstante Höhe."""
    ecken = [(a, a), (b, a), (b, b), (a, b)]
    pkte = []
    for (x0, y0), (x1, y1) in zip(ecken, ecken[1:] + ecken[:1]):
        for t in np.linspace(0, 1, n, endpoint=False):
            pkte.append((x0 + t * (x1 - x0), y0 + t * (y1 - y0), z))
    return np.array(pkte + [pkte[0]])


def _lesen(pfad):
    zeilen = pfad.read_text().splitlines()
    z = np.array([[float(x) for x in l.split()] for l in zeilen[6:]])[::-1]
    return np.where(z <= -9998, np.nan, z)


def _gitter(z, a=4.0, res=0.25):
    xs = a + np.arange(z.shape[1]) * res
    ys = a + np.arange(z.shape[0]) * res
    return np.meshgrid(xs, ys)


# ---- Der Fall aus der Aufgabenstellung -----------------------------------

def test_sohle_in_beckenrand_ergibt_ebene_sohle_und_boeschung(tmp_path):
    asc = tmp_path / "g.asc"
    info = tin_aus_ringen([("rand", _ring(4, 36, 100.0)),
                           ("sohle", _ring(14, 26, 96.0))], asc, 0.25)
    z = _lesen(asc)
    X, Y = _gitter(z)

    assert info["n_ringe"] == 2
    innen = (X > 15) & (X < 25) & (Y > 15) & (Y < 25)
    assert np.allclose(z[innen], 96.0), "die Sohle ist innen eben"

    # Die Böschung läuft LINEAR von der Ober- zur Unterkante: Rand bei
    # x=4 (100 m), Sohle bei x=14 (96 m), also 0,4 m Gefälle je Meter
    for x, soll in ((6.0, 99.2), (9.0, 98.0), (12.0, 96.8)):
        auf = (np.abs(X - x) < 0.2) & (np.abs(Y - 20.0) < 0.2)
        assert z[auf].mean() == pytest.approx(soll, abs=0.1), f"bei x={x}"


def test_es_wird_kein_stuetzpunkt_erfunden(tmp_path):
    """
    Der Kern: die Zwangs-Delaunay benutzt ausschliesslich die Punkte der
    Ringe. Jede Rasterhöhe liegt damit zwischen zwei gemessenen Höhen.
    """
    asc = tmp_path / "g.asc"
    rand, sohle = _ring(4, 36, 100.0), _ring(14, 26, 96.0)
    info = tin_aus_ringen([("rand", rand), ("sohle", sohle)], asc, 0.25)
    assert info["n_punkte"] == len(set(map(tuple, np.round(
        np.vstack([rand, sohle])[:, :2], 6))))
    z = _lesen(asc)
    assert np.nanmin(z) >= 96.0 - 1e-6 and np.nanmax(z) <= 100.0 + 1e-6


def test_kein_dreieck_spannt_quer_durch_das_becken(tmp_path):
    """
    Die Probe aufs Exempel: mitten im Becken darf nichts von der
    gegenüberliegenden Böschung zu sehen sein. Eine Delaunay ohne
    Zwangskanten legt dort eine Schräge quer über die Sohle.
    """
    asc = tmp_path / "g.asc"
    tin_aus_ringen([("rand", _ring(4, 36, 100.0)),
                    ("sohle", _ring(14, 26, 96.0))], asc, 0.25)
    z = _lesen(asc)
    X, Y = _gitter(z)
    sohlflaeche = (X > 14.5) & (X < 25.5) & (Y > 14.5) & (Y < 25.5)
    assert float(np.nanmax(z[sohlflaeche]) - np.nanmin(z[sohlflaeche])) < 1e-6


def test_gestuftes_becken_paart_mit_dem_naechstinneren_ring(tmp_path):
    """
    Rand > Berme > Sohle: das Loch im Rand ist die BERME, nicht die Sohle.
    Sonst spannte die Böschung über die Berme hinweg.
    """
    asc = tmp_path / "g.asc"
    tin_aus_ringen([("rand", _ring(4, 36, 100.0)),
                    ("berme", _ring(10, 30, 98.0)),
                    ("sohle", _ring(16, 24, 96.0))], asc, 0.25)
    z = _lesen(asc)
    X, Y = _gitter(z)
    auf_berme = (np.abs(X - 10.0) < 0.2) & (np.abs(Y - 20.0) < 0.2)
    assert z[auf_berme].mean() == pytest.approx(98.0, abs=0.1), \
        "die Berme liegt auf ihrer Höhe, die Böschung überspringt sie nicht"
    # und zwischen Berme und Sohle läuft es LINEAR — die obere Böschung
    # (Rand 100 auf Berme 98) darf nicht bis zur Sohle durchziehen
    zwischen = (np.abs(X - 13.0) < 0.2) & (np.abs(Y - 20.0) < 0.2)
    assert z[zwischen].mean() == pytest.approx(97.0, abs=0.1)


def test_zwangskanten_decken_mehr_ab_als_die_gewoehnliche_vermaschung(tmp_path):
    """
    Der messbare Gewinn: die gewöhnliche Vermaschung schneidet die zu weit
    gespannten Dreiecke weg und lässt dabei den grössten Teil der Fläche
    als „nicht gemessen" zurück.
    """
    rand, sohle = _ring(4, 36, 100.0), _ring(14, 26, 96.0)
    mit = tin_aus_ringen([("rand", rand), ("sohle", sohle)],
                         tmp_path / "a.asc", 0.25)
    ohne = tin_from_lines([rand, sohle], tmp_path / "b.asc", 0.25)
    assert mit["coverage"] > 0.99
    assert mit["coverage"] > ohne["coverage"] + 0.5


def test_ausserhalb_des_aeussersten_rings_wird_waagerecht_ergaenzt(tmp_path):
    """
    Ein runder Ring füllt sein Hüllrechteck nicht aus. Was übrig bleibt,
    ist nicht gemessen — dort steht eine EBENE auf der höchsten gemessenen
    Höhe, keine erfundene Wölbung.
    """
    winkel = np.linspace(0, 2 * np.pi, 33)
    kreis = np.column_stack([20 + 12 * np.cos(winkel), 20 + 12 * np.sin(winkel),
                             np.full(len(winkel), 100.0)])
    asc = tmp_path / "g.asc"
    info = tin_aus_ringen([("rand", kreis),
                           ("sohle", _ring(16, 24, 96.0))], asc, 0.25)
    z = _lesen(asc)
    assert info["coverage"] < 0.85, "die Ecken liegen ausserhalb des Kreises"
    assert np.nanmax(z) == pytest.approx(100.0)
    ecke = z[:6, :6]                      # Hüllrechteck-Ecke
    assert np.nanmax(ecke) - np.nanmin(ecke) < 1e-6, "dort ist es eben"


def test_offene_kante_kann_keine_flaeche_begrenzen(tmp_path):
    offen = np.array([(0.0, 0.0, 100.0), (10.0, 0.0, 99.0)])
    with pytest.raises(ValueError, match="geschlossene"):
        tin_aus_ringen([("linie", offen)], tmp_path / "g.asc", 0.25)


# ---- Das TIN wird gelesen, nicht neu vermascht ---------------------------

def test_dreiecke_werden_genommen_wie_sie_sind():
    """
    `_raster_aus_dreiecken` legt genau die gegebenen Dreiecke auf das
    Raster. Wo keines liegt, bleibt NaN — der Weg über eine frische
    Delaunay füllte dort die konvexe Hülle und erfand damit Gelände.
    """
    ecken = np.array([[0.0, 0.0, 10.0], [4.0, 0.0, 10.0], [0.0, 4.0, 14.0]])
    xx, yy = np.meshgrid(np.arange(0, 4.5, 0.5), np.arange(0, 4.5, 0.5))
    z = _raster_aus_dreiecken(ecken, np.array([[0, 1, 2]]), xx, yy)

    assert np.isnan(z[-1, -1]), "die freie Ecke bleibt leer"
    assert z[0, 0] == pytest.approx(10.0)
    assert z[-1, 0] == pytest.approx(14.0)
    # linear dazwischen: z hängt nur von y ab
    assert z[4, 0] == pytest.approx(12.0)
    fertig = ~np.isnan(z)
    assert 10.0 - 1e-9 <= np.nanmin(z) and np.nanmax(z) <= 14.0 + 1e-9
    assert fertig.mean() == pytest.approx(0.5, abs=0.15)


def test_senkrechte_dreiecke_tragen_keine_hoehe():
    """Eine Beckenwand projiziert sich auf eine Linie — sie wird übersprungen."""
    ecken = np.array([[0.0, 0.0, 10.0], [4.0, 0.0, 10.0], [2.0, 0.0, 14.0]])
    xx, yy = np.meshgrid(np.arange(0, 4.5, 0.5), np.arange(0, 4.5, 0.5))
    z = _raster_aus_dreiecken(ecken, np.array([[0, 1, 2]]), xx, yy)
    assert np.isnan(z).all()
