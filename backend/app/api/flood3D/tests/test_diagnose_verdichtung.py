"""
Solver-Diagnostik verdichten — ohne dass jemand etwas verliert.

Vorgeschichte: Ein Lauf mit 760.881 Zeitschritten (Rentrich_BetaTest08_r004)
schrieb 7,6 Mio Zeilen Zeitreihen; 99,98 % davon waren Courant, Kontinuität,
Zeitschrittweite und Residuen je EINZELNEM Solverschritt. Das Ergebnis: eine
77-MB-Zwischendatei, 906 MB im Speicher und ein Serverprozess, den der
OOM-Killer reihenweise erschossen hat (2026-08-15).

Fabios Bedingung für die Verdichtung war: sie darf weder die Fehlersuche
auf dem Server noch die Anzeige im Client einschränken. Genau das prüfen
diese Tests — die Zahlen, auf die es ankommt, müssen EXAKT bleiben.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core.conventions import Component, Quantity
from ..core.extract.readers import _Verdichter, read_log


def _log_schreiben(pfad, n_schritte: int, co_max_spitze_bei: int = -1):
    """Ein interFoam-Log mit n Zeitschritten nachstellen (echtes Format)."""
    with open(pfad, "w") as f:
        f.write("/*-- interFoam --*/\nCreate mesh\n\n")
        for i in range(1, n_schritte + 1):
            t = i * 0.001
            co_max = 9.99 if i == co_max_spitze_bei else 0.1 + (i % 7) * 0.01
            f.write(f"Courant Number mean: {0.05 + (i % 5) * 0.001:g} "
                    f"max: {co_max:g}\n")
            f.write(f"deltaT = {0.001 if i != co_max_spitze_bei else 1e-7:g}\n")
            f.write(f"Time = {t:g}\n\n")
            f.write("time step continuity errors : sum local = 1e-09, "
                    f"global = 1e-10, cumulative = {i * 1e-9:g}\n")
            f.write("ExecutionTime = 1 s\n\n")
        f.write("End\n")


def _reihe(rows, quantity, komponente):
    aus = [r for r in rows if r["quantity"] == quantity.value
           and r["component"] == komponente.value]
    aus.sort(key=lambda r: r["time"])
    return np.array([r["value"] for r in aus], dtype=float)


def test_lange_laeufe_werden_klein_aber_die_spitze_bleibt(tmp_path, monkeypatch):
    """
    Der Kern: 50.000 Zeitschritte, gedeckelt auf 200 Punkte je Reihe — und
    die eine Courant-Spitze (der Wert, wegen dem eine Warnung erscheint)
    überlebt exakt, samt dem Einbruch der Zeitschrittweite daneben.
    """
    monkeypatch.setattr("app.api.flood3D.core.extract.readers.DIAG_PUNKTE", 200)
    log = tmp_path / "log.interFoam"
    _log_schreiben(log, 50_000, co_max_spitze_bei=31_337)

    rows = read_log(log, "demo_r001")

    co_max = _reihe(rows, Quantity.COURANT, Component.MAX)
    assert 0 < len(co_max) <= 400              # Deckel: hoechstens 2x Ziel
    assert co_max.max() == pytest.approx(9.99)  # die Spitze: EXAKT erhalten
    dt = _reihe(rows, Quantity.TIMESTEP, Component.NONE)
    assert dt.min() == pytest.approx(1e-7)      # der dt-Einbruch ebenso
    # Kontinuitaet ist kumulativ — der letzte Wert traegt die Aussage
    cont = _reihe(rows, Quantity.CONTINUITY, Component.NONE)
    assert cont[-1] == pytest.approx(50_000 * 1e-9)
    # und aus 50.000 Schritten sind ein paar hundert Zeilen geworden
    assert len(rows) < 2000


def test_die_bewertung_liest_dieselben_zahlen(tmp_path, monkeypatch):
    """
    Gegenprobe gegen die UNVERDICHTETE Fassung: genau die Kennzahlen, die
    core/evaluate.py aus diesen Reihen zieht (max, Mittel, letzter Wert),
    muessen gleich bleiben — sonst aendert die Verdichtung Nachweise.
    """
    log = tmp_path / "log.interFoam"
    _log_schreiben(log, 8192, co_max_spitze_bei=5000)

    monkeypatch.setattr("app.api.flood3D.core.extract.readers.DIAG_PUNKTE",
                        10 ** 9)              # praktisch unverdichtet
    voll = read_log(log, "r")
    monkeypatch.setattr("app.api.flood3D.core.extract.readers.DIAG_PUNKTE", 64)
    duenn = read_log(log, "r")

    v_max, d_max = (_reihe(r, Quantity.COURANT, Component.MAX)
                    for r in (voll, duenn))
    assert d_max.max() == v_max.max()                    # Befundschwelle
    v_mean, d_mean = (_reihe(r, Quantity.COURANT, Component.MEAN)
                      for r in (voll, duenn))
    assert d_mean.mean() == pytest.approx(v_mean.mean(), rel=1e-6)
    v_cont, d_cont = (_reihe(r, Quantity.CONTINUITY, Component.NONE)
                      for r in (voll, duenn))
    assert d_cont[-1] == v_cont[-1]                      # kumulativer Fehler
    assert len(duenn) < len(voll) / 50                   # und viel kleiner


def test_verdichter_verschmilzt_nach_art_der_reihe():
    """Die Verschmelzungsregel ist keine Geschmacksfrage: sie entscheidet,
    ob Spitzen, Einbrüche und Endstände überleben."""
    for art, erwartet in (("max", 7.0), ("min", 1.0), ("last", 4.0),
                          ("mean", 3.5)):
        v = _Verdichter(ziel=2, art=art)
        for t, wert in enumerate([1.0, 7.0, 2.0, 4.0]):
            v.dazu(float(t), wert)
        v._halbieren()
        assert (max(v.v) if art == "max" else
                min(v.v) if art == "min" else
                v.v[-1] if art == "last" else
                sum(v.v) / len(v.v)) == pytest.approx(erwartet), art


def test_speicher_bleibt_gedeckelt(tmp_path):
    """
    Der eigentliche Grund für den Umbau: das Log wird zeilenweise gelesen
    und nie als Ganzes gehalten. 300.000 Zeitschritte (~35 MB Log) dürfen
    den Leser nicht über ein paar MB wachsen lassen.
    """
    import resource
    import subprocess
    import sys

    log = tmp_path / "log.interFoam"
    _log_schreiben(log, 300_000)
    assert log.stat().st_size > 20 * 1024 * 1024      # wirklich ein grosses Log

    skript = (
        "import resource, sys;"
        "sys.path.insert(0, '/home/fabio/quagg_page/backend');"
        "from app.api.flood3D.core.extract.readers import read_log;"
        "vorher = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss;"
        f"rows = read_log(__import__('pathlib').Path(r'{log}'), 'r');"
        "nachher = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss;"
        "print(len(rows), (nachher - vorher) // 1024)")
    aus = subprocess.run([sys.executable, "-c", skript], capture_output=True,
                         text=True, timeout=600)
    assert aus.returncode == 0, aus.stderr
    zeilen, zuwachs_mb = (int(x) for x in aus.stdout.split())
    from ..core.extract.readers import DIAG_PUNKTE
    # 4 Diagnose-Reihen, je hoechstens 2x Ziel — statt 1,2 Mio Rohzeilen
    assert zeilen <= 4 * 2 * DIAG_PUNKTE
    assert zeilen < 300_000 * 4 / 5, "zu wenig verdichtet"
    assert zuwachs_mb < 150, f"Leser wuchs um {zuwachs_mb} MB"
