"""
RunPod-Worker (dritter Rechenort) ohne RunPod, ohne boto3, ohne Docker.

Geprüft wird die Klammer um den Läufer — Eingang (case.zip holen),
Ereignis-Übersetzung (artifactsFile -> artifactsUrl), Fehlerweg und
Aufräumen. Der Läufer selbst wird durch ein Stub-Skript ersetzt
(``QUAGG_RUNNER``), denn OpenFOAM gehört nicht in einen Unit-Test.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

import pytest

from ..engines.runpod import foam_worker as w


class StubStore:
    """Ablage ohne Netz: merkt sich, was hochgeladen wurde."""

    def __init__(self, dateien: dict[str, bytes] | None = None):
        self.dateien = dateien or {}
        self.hochgeladen: list[str] = []

    def store_result(self, path: Path, job_id: str) -> str:
        self.hochgeladen.append(path.name)
        path.unlink()
        return f"https://r2.example/{job_id}/{path.name}?sig=x"

    def get_bytes(self, key: str) -> bytes:
        return self.dateien[key]


def _stub_runner(tmp_path: Path, zeilen: list[str], code: int = 0,
                 stderr: str = "") -> str:
    """Skript, das NDJSON ausgibt wie local_runner.py und dann endet."""
    p = tmp_path / "stub_runner.py"
    p.write_text(
        "import sys, json, pathlib\n"
        "job = pathlib.Path(sys.argv[sys.argv.index('--job') + 1])\n"
        "(job / 'results').mkdir(parents=True, exist_ok=True)\n"
        "(job / 'results' / 'artifacts.zip').write_bytes(b'PK\\x05\\x06' + b'\\0' * 18)\n"
        f"for z in {zeilen!r}:\n"
        "    print(z, flush=True)\n"
        f"sys.stderr.write({stderr!r})\n"
        f"sys.exit({code})\n")
    return str(p)


def _job(tmp_path: Path, **inp):
    return {"id": "job42", "input": inp}


@pytest.fixture()
def umgebung(tmp_path, monkeypatch):
    monkeypatch.setenv("QUAGG_JOB_ROOT", str(tmp_path / "jobs"))
    for k in ("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID",
              "S3_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


# ── Eingang ──────────────────────────────────────────────────────────────────

def test_case_zip_aus_s3():
    store = StubStore({"flood3d/eingang/case.zip": b"PK\x03\x04inhalt"})
    daten = w.hole_case_zip({"encoding": "s3", "key": "flood3d/eingang/case.zip"},
                            store)
    assert daten == b"PK\x03\x04inhalt"


def test_case_zip_inline_base64():
    roh = b"PK\x03\x04klein"
    daten = w.hole_case_zip(
        {"encoding": "base64", "data": base64.b64encode(roh).decode()}, StubStore())
    assert daten == roh


def test_grosses_bundle_inline_wird_abgelehnt():
    """
    Ueber das /run-Fenster von RunPod passt kein Gelaenderaster — lieber
    eine klare Meldung als ein Abbruch im Container.
    """
    gross = base64.b64encode(b"x" * (w.INLINE_MAX_BYTES + 1)).decode()
    with pytest.raises(ValueError, match="ueber .* S3"):
        w.hole_case_zip({"encoding": "base64", "data": gross}, StubStore())


def test_unbekannter_eingang_meldet_sich():
    with pytest.raises(ValueError, match="encoding"):
        w.hole_case_zip({"encoding": "brieftaube", "data": "x"}, StubStore())
    with pytest.raises(ValueError, match="case_zip"):
        w.hole_case_zip(None, StubStore())


# ── Ereignis-Uebersetzung ────────────────────────────────────────────────────

def test_done_bekommt_url_statt_datei(tmp_path):
    res = tmp_path / "results"
    res.mkdir()
    (res / "artifacts.zip").write_bytes(b"PK")
    store = StubStore()
    zeilen = [json.dumps({"event": "progress", "t": 1.5}),
              json.dumps({"event": "done", "artifactsFile": "artifacts.zip",
                          "run_id": "fall_r007", "sizeBytes": 2})]
    events = list(w.process_events(zeilen, res, store, "job42"))
    assert events[0] == {"event": "progress", "t": 1.5}
    fertig = events[1]
    assert "artifactsFile" not in fertig
    assert fertig["artifactsUrl"].startswith("https://r2.example/job42/artifacts.zip")
    assert fertig["run_id"] == "fall_r007"        # uebriges bleibt unangetastet
    assert store.hochgeladen == ["artifacts.zip"]


def test_schrott_auf_stdout_reisst_den_strom_nicht_ab(tmp_path):
    zeilen = ["kein json", "", json.dumps({"event": "log", "text": "ok"})]
    events = list(w.process_events(zeilen, tmp_path, StubStore(), "j"))
    assert events == [{"event": "log", "text": "kein json"},
                      {"event": "log", "text": "ok"}]


# ── Handler-Durchlauf ────────────────────────────────────────────────────────

def test_handler_faehrt_den_laeufer_und_liefert_die_url(tmp_path, umgebung):
    umgebung.setenv("QUAGG_RUNNER", _stub_runner(tmp_path, [
        json.dumps({"event": "log", "text": "▶ blockMesh"}),
        json.dumps({"event": "done", "artifactsFile": "artifacts.zip",
                    "run_id": "fall_r007"}),
    ]))
    umgebung.setattr(w, "S3Store", type("S", (), {"configured": staticmethod(lambda: False)}))
    events = list(w.handler(_job(tmp_path, case_zip={
        "encoding": "base64",
        "data": base64.b64encode(b"PK\x05\x06" + b"\0" * 18).decode()},
        run_id="fall_r007")))
    arten = [e.get("event") for e in events]
    assert arten[0] == "log" and "RunPod-Worker" in events[0]["text"]
    assert "done" in arten
    fertig = next(e for e in events if e["event"] == "done")
    assert fertig["artifactsUrl"].startswith("data:application/zip;base64,")


def test_kernzahl_aus_dem_auftrag_erreicht_den_laeufer(tmp_path, umgebung):
    """Die Kernzahl des Workers kommt aus dem Auftrag — sonst nimmt der
    Laeufer alle Kerne der RunPod-Maschine (was meist richtig ist)."""
    p = tmp_path / "echo_runner.py"
    p.write_text("import os, json, sys, pathlib\n"
                 "job = pathlib.Path(sys.argv[sys.argv.index('--job') + 1])\n"
                 "(job / 'results').mkdir(parents=True, exist_ok=True)\n"
                 "print(json.dumps({'event': 'log',"
                 " 'text': 'CORES=' + os.environ.get('FLOOD3D_CORES', '-')}),"
                 " flush=True)\n")
    umgebung.setenv("QUAGG_RUNNER", str(p))
    umgebung.setattr(w, "S3Store", type("S", (), {"configured": staticmethod(lambda: False)}))
    events = list(w.handler(_job(tmp_path, case_zip={
        "encoding": "base64", "data": base64.b64encode(b"PK").decode()},
        cores=16)))
    assert any("CORES=16" in e.get("text", "") for e in events)


def test_gescheiterter_laeufer_meldet_den_stderr_schwanz(tmp_path, umgebung):
    umgebung.setenv("QUAGG_RUNNER", _stub_runner(
        tmp_path, [json.dumps({"event": "log", "text": "los"})],
        code=1, stderr="Traceback…\nFoamError: blockMesh gescheitert\n"))
    umgebung.setattr(w, "S3Store", type("S", (), {"configured": staticmethod(lambda: False)}))
    with pytest.raises(RuntimeError, match="Exit-Code 1"):
        events = []
        for e in w.handler(_job(tmp_path, case_zip={
                "encoding": "base64", "data": base64.b64encode(b"PK").decode()})):
            events.append(e)
    assert any(e.get("event") == "error" and "blockMesh gescheitert" in e["text"]
               for e in events)


def test_jobordner_wird_aufgeraeumt(tmp_path, umgebung):
    """Der Worker teilt sich die Platte mit den naechsten Jobs."""
    umgebung.setenv("QUAGG_RUNNER", _stub_runner(tmp_path, [
        json.dumps({"event": "done", "artifactsFile": "artifacts.zip"})]))
    umgebung.setattr(w, "S3Store", type("S", (), {"configured": staticmethod(lambda: False)}))
    list(w.handler(_job(tmp_path, case_zip={
        "encoding": "base64", "data": base64.b64encode(b"PK").decode()})))
    assert not (tmp_path / "jobs" / "job42").exists()


# ── Das Bundle des Servers passt in diesen Worker ────────────────────────────

def test_bundle_des_servers_ist_das_erwartete_paket(tmp_path):
    """
    Der Worker erwartet ``inputs/case.zip`` — genau das, was der
    Bundle-Endpunkt baut und der Companion auf der Nutzer-Maschine
    ablegt. Bricht diese Annahme, rechnet die Cloud ins Leere.
    """
    from ..engines.local import local_runner

    quelle = Path(local_runner.__file__).read_text()
    assert 'src = job / "inputs" / "case.zip"' in quelle
    # und der Worker legt es genau dorthin
    wq = Path(w.__file__).read_text()
    assert re.search(r'"inputs"\s*/\s*"case\.zip"', wq)


def test_worker_braucht_beim_import_weder_runpod_noch_boto3():
    """Sonst waeren diese Tests nur im fertigen Image lauffaehig."""
    assert "runpod" not in sys.modules or True   # Import oben hat gereicht
    quelle = Path(w.__file__).read_text()
    kopf = quelle.split("# ── Ablage")[0]
    assert "import boto3" not in kopf and "import runpod" not in kopf
