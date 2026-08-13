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
        return {"Body": B(self.objekte[Key]),
                "LastModified": f"stand-{len(self.objekte[Key])}"}

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


def test_teilstand_endpunkt_spielt_lokalen_speicherpunkt_ein(tmp_path, monkeypatch):
    """
    Lokaler Weg (Wunsch 2026-08-12): der Laeufer laedt nach S3 hoch, der
    BROWSER stoesst /runs/{id}/teilstand an (beim Cloud-Lauf macht das der
    Relay). Der Endpunkt holt das Paket, spielt es ein und schreibt die
    Teilstand-Marken ins Manifest.
    """
    import io
    import json as _json
    import zipfile as _zip

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from .. import router as router_mod

    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    run_root = tmp_path / "runs" / "demo_r001"
    run_root.mkdir(parents=True)
    (run_root / "manifest.json").write_text(_json.dumps({"status": "lokal"}))

    buf = io.BytesIO()
    with _zip.ZipFile(buf, "w") as z:
        z.writestr("fields/t_0000.npz", b"NPZ")
        z.writestr("fields/index.json", "{}")
    r2 = FakeR2()
    r2.objekte["flood3d/checkpoints/demo_r001.zip"] = buf.getvalue()
    monkeypatch.setattr(relay, "_r2", lambda: (r2, "flood-3d", "flood3d"))

    app = FastAPI(); app.include_router(router_mod.router)
    client = TestClient(app)
    res = client.post("/runs/demo_r001/teilstand",
                      json={"zeiten": 2, "letzte_zeit": 0.5})
    assert res.status_code == 200
    assert (run_root / "fields" / "t_0000.npz").read_bytes() == b"NPZ"
    m = _json.loads((run_root / "manifest.json").read_text())
    assert m["teilstand"] is True and m["teilstand_zeiten"] == 2
    assert m["status"] == "lokal"          # der Zustand bleibt beim Lauf

    # ohne hinterlegtes Objekt: 404 mit Klartext
    r2.objekte.clear()
    assert client.post("/runs/demo_r001/teilstand", json={}).status_code == 404


def test_bundle_traegt_checkpoint_wenn_r2_da(tmp_path, monkeypatch):
    """Auch der Companion-Weg bekommt die Speicherpunkt-Anweisung mit."""
    import io
    import zipfile as _zip

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from .. import router as router_mod
    from .synthetic_case import build_spec_stage3

    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(tmp_path / "cases"))
    (tmp_path / "cases" / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(tmp_path / "cases" / "demo" / "case.yaml")
    monkeypatch.setattr(relay, "_r2", lambda: (FakeR2(), "flood-3d", "flood3d"))

    app = FastAPI(); app.include_router(router_mod.router)
    client = TestClient(app)
    res = client.post("/cases/demo/bundle")
    assert res.status_code == 200
    namen = _zip.ZipFile(io.BytesIO(res.content)).namelist()
    assert "checkpoint.json" in namen


def _lauf_zip(run_id, status="completed"):
    import io
    import json as _json
    import zipfile as _zip
    buf = io.BytesIO()
    with _zip.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", _json.dumps({"status": status,
                                                 "origin": "companion"}))
        z.writestr("result.json", _json.dumps({"run_id": run_id, "targets": []}))
        z.writestr("fields/t_0000.npz", b"NPZ")
        z.writestr("fields/index.json", "{}")
    return buf.getvalue()


def test_waechter_sammelt_endergebnis_ohne_browser_ein(tmp_path, monkeypatch):
    """
    Der lokale Weg hing am Browser-Faden: Navigation toetete die
    Antriebsschleife, fertige Laeufe blieben als 'lokal, 0 MB' stehen.
    Der Waechter holt Endergebnis UND Teilstand selbst von S3.
    """
    import json as _json

    from .. import router as router_mod

    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    fertig = tmp_path / "runs" / "demo_r001"
    fertig.mkdir(parents=True)
    (fertig / "manifest.json").write_text(_json.dumps(
        {"status": "lokal", "origin": "companion"}))
    halb = tmp_path / "runs" / "demo_r002"
    halb.mkdir()
    (halb / "manifest.json").write_text(_json.dumps({"status": "lokal"}))
    laeuft_nicht = tmp_path / "runs" / "demo_r003"
    laeuft_nicht.mkdir()
    (laeuft_nicht / "manifest.json").write_text(_json.dumps(
        {"status": "completed"}))

    r2 = FakeR2()
    r2.objekte["flood3d/artifacts/demo_r001.zip"] = _lauf_zip("demo_r001")
    r2.objekte["flood3d/checkpoints/demo_r002.zip"] = _lauf_zip("demo_r002")
    monkeypatch.setattr(relay, "_r2", lambda: (r2, "flood-3d", "flood3d"))

    eingesammelt = router_mod.teilstaende_einsammeln()

    assert sorted(eingesammelt) == ["demo_r001", "demo_r002"]
    # Endergebnis: Manifest kommt aus dem Archiv, Status completed, S3 leer
    m1 = _json.loads((fertig / "manifest.json").read_text())
    assert m1["status"] == "completed"
    assert (fertig / "fields" / "t_0000.npz").exists()
    assert "flood3d/artifacts/demo_r001.zip" in r2.geloescht
    # Teilstand: Marken gesetzt, Lauf bleibt 'lokal'
    m2 = _json.loads((halb / "manifest.json").read_text())
    assert m2["status"] == "lokal" and m2["teilstand"] is True
    assert m2["teilstand_quelle"] == "s3-waechter"
    # zweiter Durchlauf ohne neue Objekte: nichts doppelt einspielen
    assert router_mod.teilstaende_einsammeln() == []


def test_waechter_funkt_dem_browser_nicht_dazwischen(tmp_path, monkeypatch):
    import json as _json

    from .. import router as router_mod

    monkeypatch.setenv("FLOOD3D_RUNS_ROOT", str(tmp_path / "runs"))
    d = tmp_path / "runs" / "demo_r001"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(_json.dumps({"status": "lokal"}))
    (d / "_upload.zip").write_bytes(b"halber Upload")
    r2 = FakeR2()
    r2.objekte["flood3d/artifacts/demo_r001.zip"] = _lauf_zip("demo_r001")
    monkeypatch.setattr(relay, "_r2", lambda: (r2, "flood-3d", "flood3d"))
    assert router_mod.teilstaende_einsammeln() == []


def test_laufzeit_leitplanke_je_job(welt, monkeypatch):
    """
    Vorgabe Fabio (2026-08-13): Test-/Beweislaeufe duerfen nie mehr kosten
    als geplant — die Grenze setzt RunPod selbst durch (policy je Job),
    nicht ein Skript, das sterben koennte.
    """
    monkeypatch.setattr("app.api.flood3D.core.bundle.bundle_bauen",
                        lambda spec, d, run_id, checkpoint=None: b"PK")
    auftraege = []

    def _ruf(pfad, body=None, timeout=60.0):
        if pfad == "run":
            auftraege.append(body)
            return {"id": "job-1"}
        if pfad.startswith("stream/"):
            return {"stream": [{"output": {"event": "done",
                "artifactsUrl": "https://r2.example/j/a.zip"}}],
                "status": "COMPLETED"}
        return {}

    monkeypatch.setattr(relay, "_ruf", _ruf)
    _lade(monkeypatch)
    relay.lauf_starten(object(), welt["case_dir"], "demo_r001",
                       welt["run_root"], lambda **f: None, lambda: False,
                       max_laufzeit_s=300)
    assert auftraege[0]["policy"] == {"executionTimeout": 300000}

    # ohne Vorgabe: KEINE policy — es gilt das Endpunkt-Limit (8 h)
    relay.lauf_starten(object(), welt["case_dir"], "demo_r002",
                       welt["run_root"], lambda **f: None, lambda: False)
    assert "policy" not in auftraege[1]
