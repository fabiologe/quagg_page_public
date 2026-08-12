"""
Gemeinsame Testvoraussetzungen.

Das Kosten-Gate (core/gate.py) sperrt Läufe, solange kein Passwort
konfiguriert ist — absichtlich fail-closed, damit ein vergessenes Passwort
nicht zum offenen Scheunentor wird. Für die Testsuite wird es ausdrücklich
abgeschaltet; die Gate-Tests selbst schalten es gezielt wieder ein.
"""
import os

import pytest


@pytest.fixture(autouse=True)
def _gate_aus(monkeypatch):
    monkeypatch.setenv("FLOOD3D_GATE_OFF", "1")
    yield
