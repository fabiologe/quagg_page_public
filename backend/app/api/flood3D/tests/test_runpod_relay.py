"""
Rechenort RunPod, Serverseite — ohne RunPod, ohne R2, ohne Netz.

Nachgestellt wird der Ereignisstrom, den der Worker wirklich liefert. Der
wichtigste Fall ist der letzte: RunPod meldet einen gescheiterten Handler
als ``status: COMPLETED``. Wer das für Erfolg hält, verbucht einen Lauf
ohne Ergebnis als fertig.
"""
from __future__ import annotations

import json

import pytest

from ..engines.runpod import relay


class FakeR2:
    def __init__(self):
        self.objekte = {}
        self.geloescht = []

    def put_object(self, Bucket, Key, Body, **kw):     # noqa: N803
        self.objekte[Key] = Body

    def get_object(self, Bucket, Key):                 # noqa: N803
        class B:
            def __init__(self, d): self._d = d
            def read(self): return self._d
        return {"Body": B(self.objekte[Key])}

    def generate_presigned_url(self, op, Params=None, ExpiresIn=0):  # noqa: N803
        return f"https://r2.example/signed/{Params['Key']}"

    def delete_object(self, Bucket, Key):              # noqa: N803
        self.geloescht.append(Key)
        self.objekte.pop(Key, None)


@pytest.fixture()
def welt(tmp_path, monkeypatch):
    """RunPod, R2 und Bundle-Bau ersetzt; der Ablauf bleibt echt."""
    r2 = FakeR2()
    monkeypatch.setattr(relay, "_r2", lambda: (r2, "flood-3d", "flood3d"))
    monkeypatch.setattr(relay, "konfiguriert", lambda: (True, ""))
    monkeypatch.setattr(relay, "TAKT_S", 0.001)
    monkeypatch.setattr("app.api.flood3D.core.bundle.bundle_bauen",
                        lambda spec, d, run_id, checkpoint=None: b"PK-bundle")
    (tmp_path / "run").mkdir()
    return {"r2": r2, "run_root": tmp_path / "run", "case_dir": tmp_path}


def _antworten(monkeypatch, strom, endstatus="COMPLETED", ende=None):
    """
    RunPod-Aufrufe nachstellen: /run, /stream…, /status.

    /stream gibt je Abfrage NUR die neuen Ereignisse zurueck — genau so
    verhaelt sich die echte API, und genau daran ist der erste Cloud-Lauf
    fast blind vorbeigelaufen. Hier kommt deshalb je Abfrage EIN Ereignis.
    """
    gerufen = []
    rest = list(strom)

    def _ruf(pfad, body=None, timeout=60.0):
        gerufen.append(pfad)
        if pfad == "run":
            return {"id": "job-1"}
        if pfad.startswith("stream/"):
            haeppchen = [{"output": rest.pop(0)}] if rest else []
            return {"stream": haeppchen,
                    "status": endstatus if not rest else "IN_PROGRESS"}
        if pfad.startswith("status/"):
            return ende or {"status": endstatus}
        if pfad.startswith("cancel/"):
            return {}
        raise AssertionError(pfad)

    monkeypatch.setattr(relay, "_ruf", _ruf)
    return gerufen


def _lade(monkeypatch, inhalt=b"PK-artefakte"):
    class R:
        def read(self): return inhalt
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(relay.urllib.request, "urlopen", lambda *a, **k: R())


def test_glatter_lauf_liefert_die_artefakte(welt, monkeypatch):
    _antworten(monkeypatch, [
        {"event": "log", "text": "RunPod-Worker: starte OpenFOAM"},
        {"event": "log", "text": "▶ blockMesh"},
        {"event": "progress", "t": 2.5},
        {"event": "done", "artifactsUrl": "https://r2.example/job-1/artifacts.zip"},
    ])
    _lade(monkeypatch)
    zustaende = []
    erg = relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                             welt["run_root"],
                             lambda **f: zustaende.append(f.get("status")),
                             lambda: False)

    assert erg["artefakte"] == b"PK-artefakte"
    assert erg["job_id"] == "job-1"
    # der Zustand wandert mit dem Ereignisstrom mit
    assert "building" in zustaende and "meshing" in zustaende
    assert "solving" in zustaende and "downloading" in zustaende
    # das Bundle wird hochgeladen UND danach wieder entfernt (R2 kostet)
    assert "flood3d/eingang/demo_r001.zip" in welt["r2"].geloescht
    # der Ereignisstrom liegt als Protokoll im Lauf
    zeilen = (welt["run_root"] / "log.runpod").read_text().splitlines()
    assert len(zeilen) == 4 and json.loads(zeilen[0])["event"] == "log"


def test_completed_ohne_ergebnis_ist_ein_fehler(welt, monkeypatch):
    """
    Die Falle der RunPod-API: gescheiterter Handler, Status COMPLETED.
    Erfolgreich ist nur, was ein done-Ereignis mit artifactsUrl hat.
    """
    _antworten(monkeypatch, [
        {"event": "log", "text": "los"},
        {"event": "error", "text": "FoamError: blockMesh gescheitert"},
    ], ende={"status": "COMPLETED", "error": "handler: Exit-Code 1"})
    with pytest.raises(relay.RunPodFehler, match="ohne Ergebnis"):
        relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                           welt["run_root"], lambda **f: None, lambda: False)
    # auch im Fehlerfall bleibt kein Bundle in R2 liegen
    assert "flood3d/eingang/demo_r001.zip" in welt["r2"].geloescht


def test_abbruch_wird_an_runpod_durchgereicht(welt, monkeypatch):
    gerufen = _antworten(monkeypatch, [{"event": "log", "text": "rechnet"}] * 50,
                         endstatus="IN_PROGRESS")
    with pytest.raises(relay.RunPodFehler, match="abgebrochen"):
        relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                           welt["run_root"], lambda **f: None,
                           lambda: True)          # Nutzer hat abgebrochen
    assert any(p.startswith("cancel/") for p in gerufen)


def test_ohne_konfiguration_klare_ansage(welt, monkeypatch):
    monkeypatch.setattr(relay, "konfiguriert",
                        lambda: (False, "RunPod ist nicht eingerichtet: …"))
    with pytest.raises(relay.RunPodFehler, match="nicht eingerichtet"):
        relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                           welt["run_root"], lambda **f: None, lambda: False)


def test_job_ohne_id_wird_nicht_verfolgt(welt, monkeypatch):
    monkeypatch.setattr(relay, "_ruf", lambda pfad, body=None, timeout=60.0: {})
    with pytest.raises(relay.RunPodFehler, match="keinen Job"):
        relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                           welt["run_root"], lambda **f: None, lambda: False)


def test_zwischenstand_wird_geholt_und_eingespielt(welt, monkeypatch):
    """
    Speicherpunkte: der Laeufer meldet 'checkpoint', der Relay holt das
    Teilpaket aus S3 und reicht es dem Aufrufer — Ergebnis-3D zeigt damit
    schon waehrend des Laufs die fertigen Zeitschritte. Und das Bundle
    bekommt die vorsignierte PUT-URL mit.
    """
    bundle_args = {}
    monkeypatch.setattr("app.api.flood3D.core.bundle.bundle_bauen",
                        lambda spec, d, run_id, checkpoint=None:
                        bundle_args.update(checkpoint=checkpoint) or b"PK-bundle")
    # Teilpaket liegt unter dem checkpoint-Key, wenn das Ereignis kommt
    welt["r2"].objekte["flood3d/checkpoints/demo_r001.zip"] = b"PK-teilstand"
    _antworten(monkeypatch, [
        {"event": "log", "text": "los"},
        {"event": "checkpoint", "zeiten": 3, "letzte_zeit": 2.5},
        {"event": "done", "artifactsUrl": "https://r2.example/job-1/artifacts.zip"},
    ])
    _lade(monkeypatch)
    bekommen = []
    relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                       welt["run_root"], lambda **f: None, lambda: False,
                       checkpoint_s=60,
                       zwischenstand_cb=lambda b, ev: bekommen.append((b, ev)))
    assert bundle_args["checkpoint"]["put_url"].endswith("checkpoints/demo_r001.zip")
    assert bundle_args["checkpoint"]["min_intervall_s"] == 60
    assert bekommen == [(b"PK-teilstand", {"event": "checkpoint",
                                           "zeiten": 3, "letzte_zeit": 2.5})]
    # und der checkpoint-Key wird am Ende mit abgeraeumt
    assert "flood3d/checkpoints/demo_r001.zip" in welt["r2"].geloescht


def test_ohne_callback_keine_speicherpunkte(welt, monkeypatch):
    """Der Companion-Weg bleibt unberuehrt: kein Callback -> kein checkpoint.json."""
    bundle_args = {}
    monkeypatch.setattr("app.api.flood3D.core.bundle.bundle_bauen",
                        lambda spec, d, run_id, checkpoint=None:
                        bundle_args.update(checkpoint=checkpoint) or b"PK-bundle")
    _antworten(monkeypatch, [
        {"event": "done", "artifactsUrl": "https://r2.example/job-1/artifacts.zip"}])
    _lade(monkeypatch)
    relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                       welt["run_root"], lambda **f: None, lambda: False)
    assert bundle_args["checkpoint"] is None
