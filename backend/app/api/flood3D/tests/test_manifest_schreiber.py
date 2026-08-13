"""
Welle 1: EIN Manifest-Schreiber statt sieben Kopien.

Der Ernstfall, gegen den hier getestet wird, lief in Produktion wirklich:
Relay-Verfolger (alle ~5 s), S3-Wächter (alle 120 s) und Reattach-Thread
schrieben dasselbe manifest.json per Lesen→Ändern→Schreiben ohne Lock —
letzter Schreiber gewann, Felder verschwanden still (der
_upload.zip-Sentinel im Wächter war das Pflaster über einem solchen
Verlust).
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

from ..core.store import lauf_reservieren, manifest_schreiben


def test_zwei_threads_verlieren_kein_feld(tmp_path):
    """2 Threads × 100 Updates auf verschiedene Felder: alle 200 da."""
    def schreiber(prefix):
        for i in range(100):
            manifest_schreiben(tmp_path, **{f"{prefix}_{i}": i})

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(schreiber, ["a", "b"]))

    stand = json.loads((tmp_path / "manifest.json").read_text())
    fehlend = [k for p in ("a", "b") for k in (f"{p}_{i}" for i in range(100))
               if k not in stand]
    assert not fehlend, f"verlorene Updates: {fehlend[:10]} …"


def test_schreiben_ist_lesbar_und_liefert_den_stand(tmp_path):
    stand = manifest_schreiben(tmp_path, status="lokal", cores=16)
    stand = manifest_schreiben(tmp_path, status="solving", letzte_zeit=1.5)
    assert stand == {"status": "solving", "cores": 16, "letzte_zeit": 1.5}
    # Datei ist hübsch (indent) und deutsch lesbar (kein \uXXXX)
    text = (tmp_path / "manifest.json").read_text()
    assert json.loads(text) == stand and "\n" in text


def test_halbe_altdatei_kippt_den_schreiber_nicht(tmp_path):
    (tmp_path / "manifest.json").write_text('{"status": "sol')   # Stromausfall
    stand = manifest_schreiben(tmp_path, status="failed")
    assert stand == {"status": "failed"}


def test_laufnummern_kollidieren_nicht(tmp_path):
    """8 gleichzeitige Reservierungen: 8 VERSCHIEDENE run_ids.

    Vorher: exists()-Zählschleife an zwei Router-Stellen — zwei
    gleichzeitige Anfragen bekamen dieselbe Nummer (TOCTOU)."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        ergebnisse = list(pool.map(
            lambda _: lauf_reservieren(tmp_path / "runs", "demo"), range(8)))
    ids = [rid for rid, _ in ergebnisse]
    assert len(set(ids)) == 8
    assert sorted(ids) == [f"demo_r{n:03d}" for n in range(1, 9)]
    for _, root in ergebnisse:
        assert root.is_dir()
