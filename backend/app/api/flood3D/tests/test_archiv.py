"""
Auslagern fertiger Läufe auf die StorageBox.

Die heikle Stelle ist das Löschen: Erst wenn die Kopie nachweislich
vollständig ist, darf lokal etwas verschwinden. Getestet wird gegen ein
Ersatz-Archiv im tmp-Verzeichnis — die echte Freigabe gehört nicht in eine
Testsuite (und Läufe schon gar nicht).
"""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core import archiv
from ..router import router


def _lauf_bauen(root, run_id="demo_r001", status="completed"):
    d = root / run_id
    (d / "fields").mkdir(parents=True)
    (d / "figures").mkdir()
    (d / "case" / "constant").mkdir(parents=True)
    (d / "manifest.json").write_text(json.dumps({"status": status, "title": "Demo"}))
    (d / "result.json").write_text(json.dumps({"run_id": run_id, "status": status,
                                               "targets": []}))
    (d / "normalized.parquet").write_bytes(b"PAR1" + b"\0" * 500)
    for i in range(3):
        (d / "fields" / f"alpha_{i}.vtp").write_bytes(b"\1" * 4096)
    (d / "figures" / "uebersicht.png").write_bytes(b"\x89PNG" + b"\0" * 200)
    (d / "case" / "constant" / "g").write_text("value (0 0 -9.81);")
    return d


@pytest.fixture()
def umgebung(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    monkeypatch.setenv("FLOOD3D_ARCHIV_ROOT", str(tmp_path / "storagebox"))
    (tmp_path / "runs").mkdir()
    (tmp_path / "cases").mkdir()
    return tmp_path


@pytest.fixture()
def client(umgebung):
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


# ── Kern ────────────────────────────────────────────────────────────────────

def test_archivieren_verschiebt_das_schwere_und_laesst_die_marke(umgebung):
    d = _lauf_bauen(umgebung / "runs")
    vorher = archiv._vermessen(d)[1]

    marke = archiv.archivieren(d, "completed")

    # lokal bleibt nur, was die Oberfläche ohne Netz braucht
    assert sorted(p.name for p in d.iterdir()) == [
        "archiviert.json", "manifest.json", "result.json"]
    assert json.loads((d / "manifest.json").read_text())["title"] == "Demo"
    # drüben liegt der Rest, vollständig
    ziel = umgebung / "storagebox" / "demo_r001"
    assert (ziel / "fields" / "alpha_0.vtp").is_file()
    assert (ziel / "case" / "constant" / "g").is_file()
    assert marke["bytes"] > 0
    assert archiv._vermessen(d)[1] < vorher
    assert archiv.ist_archiviert(d)


def test_wiederherstellen_bringt_alles_zurueck(umgebung):
    d = _lauf_bauen(umgebung / "runs")
    vorher_n, vorher_b = archiv._vermessen(d)
    archiv.archivieren(d, "completed")

    ergebnis = archiv.wiederherstellen(d)

    assert ergebnis["war_archiviert"] is True
    assert archiv._vermessen(d) == (vorher_n, vorher_b)
    assert not archiv.ist_archiviert(d)
    # Archivordner ist danach leer geräumt
    assert not (umgebung / "storagebox" / "demo_r001").exists()


def test_laufender_lauf_wird_nicht_angefasst(umgebung):
    """Ein rechnender Lauf schreibt weiter in seinen Ordner."""
    d = _lauf_bauen(umgebung / "runs", status="running")
    with pytest.raises(archiv.ArchivFehler, match="rechnet"):
        archiv.archivieren(d, "running")
    assert (d / "fields" / "alpha_0.vtp").is_file()
    # ebenso eine Companion-Reservierung, deren Import noch aussteht
    with pytest.raises(archiv.ArchivFehler):
        archiv.archivieren(d, "lokal")


def test_unvollstaendige_uebertragung_loescht_lokal_NICHTS(umgebung, monkeypatch):
    """
    Der wichtigste Test: bricht die Freigabe mitten in der Kopie weg, muss
    der Lauf lokal unangetastet bleiben.
    """
    d = _lauf_bauen(umgebung / "runs")
    vorher = archiv._vermessen(d)

    echt = archiv._vermessen

    def _gelogen(ordner):
        # so tun, als sei drüben zu wenig angekommen
        if str(ordner).startswith(str(umgebung / "storagebox")):
            n, b = echt(ordner)
            return n - 1, b - 10
        return echt(ordner)

    monkeypatch.setattr(archiv, "_vermessen", _gelogen)
    with pytest.raises(archiv.ArchivFehler, match="unvollständig"):
        archiv.archivieren(d, "completed")

    monkeypatch.setattr(archiv, "_vermessen", echt)
    assert archiv._vermessen(d) == vorher          # nichts verloren
    assert not archiv.ist_archiviert(d)            # keine falsche Marke
    assert not (umgebung / "storagebox" / "demo_r001").exists()


def test_fehlendes_archiv_meldet_sich_statt_zu_schweigen(umgebung, monkeypatch):
    d = _lauf_bauen(umgebung / "runs")
    archiv.archivieren(d, "completed")
    import shutil
    shutil.rmtree(umgebung / "storagebox" / "demo_r001")
    with pytest.raises(archiv.ArchivFehler, match="Archivordner fehlt"):
        archiv.wiederherstellen(d)
    assert archiv.ist_archiviert(d)   # Marke bleibt: nichts verschwindet still


def test_kandidaten_nur_alt_und_fertig(umgebung):
    import os
    import time

    alt = _lauf_bauen(umgebung / "runs", "alt_r001")
    neu = _lauf_bauen(umgebung / "runs", "neu_r001")
    laeuft = _lauf_bauen(umgebung / "runs", "laeuft_r001", status="running")
    frueher = time.time() - 30 * 86400
    for d in (alt, laeuft):
        os.utime(d, (frueher, frueher))

    def status_von(d):
        return json.loads((d / "manifest.json").read_text())["status"]

    namen = [d.name for d, _, _ in
             archiv.kandidaten(umgebung / "runs", 14, status_von)]
    assert namen == ["alt_r001"]
    assert neu.name not in namen and laeuft.name not in namen


# ── Endpunkte ───────────────────────────────────────────────────────────────

def test_endpunkte_archivieren_und_zurueckholen(client, umgebung):
    _lauf_bauen(umgebung / "runs")
    r = client.post("/runs/demo_r001/archivieren")
    assert r.status_code == 200 and r.json()["archiviert"] is True

    liste = client.get("/runs").json()
    eintrag = next(e for e in liste if e["run_id"] == "demo_r001")
    assert eintrag["archiviert"] is True
    assert eintrag["archiv_bytes"] > 0
    assert eintrag["status"] == "completed"      # Bewertung bleibt lesbar

    stand = client.get("/archiv").json()
    assert stand["frei_gemacht_bytes"] > 0
    assert [a["run_id"] for a in stand["archiviert"]] == ["demo_r001"]

    r = client.post("/runs/demo_r001/wiederherstellen")
    assert r.status_code == 200 and r.json()["war_archiviert"] is True
    assert client.get("/runs").json()[0]["archiviert"] is False


def test_archivieren_eines_laufenden_gibt_409(client, umgebung):
    _lauf_bauen(umgebung / "runs", status="running")
    assert client.post("/runs/demo_r001/archivieren").status_code == 409


def test_unbekannter_lauf_gibt_404(client):
    assert client.post("/runs/gibtsnicht/archivieren").status_code == 404
    assert client.post("/runs/gibtsnicht/wiederherstellen").status_code == 404
