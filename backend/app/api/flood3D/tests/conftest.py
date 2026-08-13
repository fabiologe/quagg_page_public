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
    # KREDITKARTEN-SPERRE: seit ort-Default 'runpod' wuerde ein Test, der
    # POST /runs mit gueltigem Passwort trifft, einen ECHTEN Cloud-Job mit
    # echten Zugangsdaten starten (env_util liest backend/.env!). Leere
    # Umgebungswerte gewinnen gegen die .env — relay.konfiguriert() sagt
    # dann sauber "nicht eingerichtet". Relay-Tests patchen konfiguriert
    # selbst und bleiben unberuehrt.
    # Einzige Ausnahme: der ausdruecklich freigeschaltete Verifikationslauf
    # (FLOOD3D_VERIFIKATION=1 setzt nur ein Mensch von Hand) DARF in die
    # Cloud — genau dafuer existiert er.
    if os.environ.get("FLOOD3D_VERIFIKATION") != "1":
        monkeypatch.setenv("FLOOD3D_POD_ENDPOINT", "")
        monkeypatch.setenv("FLOOD3D_POD_API_KEY", "")
    yield
