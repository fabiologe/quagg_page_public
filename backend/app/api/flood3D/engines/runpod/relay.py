"""
Rechenort RunPod, Serverseite: Bundle → R2 → Job → Ereignisstrom → Import.

Der Ablauf ist derselbe wie beim lokalen Lauf, nur dass niemand am Browser
sitzt: Der Server packt ``case.zip``, legt es in R2 ab, startet den Job,
liest den Ereignisstrom mit und schreibt ihn in Manifest und Protokoll des
Laufs. Am Ende lädt er ``artifacts.zip`` herunter und übergibt es dem
VORHANDENEN Import — deshalb sieht ein RunPod-Lauf in der Ergebnisphase aus
wie jeder andere.

Eine Falle steckt in der RunPod-API: Ein gescheiterter Handler wird trotzdem
als ``status: COMPLETED`` gemeldet, der Fehler steht nur im Feld ``error``.
Erfolgreich ist ein Lauf hier deshalb ausschliesslich dann, wenn ein
``done``-Ereignis mit ``artifactsUrl`` kam.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from ....flood2D.env_util import env

BASIS = "https://api.runpod.ai/v2"
# Wie oft der Ereignisstrom abgefragt wird. Ein CFD-Lauf dauert Minuten bis
# Stunden — schneller zu fragen bringt nichts ausser Last.
TAKT_S = 5.0


class RunPodFehler(RuntimeError):
    """Vorhersehbar: nicht konfiguriert, Job abgelehnt, Lauf gescheitert."""


def konfiguriert() -> tuple[bool, str]:
    if not env("FLOOD3D_POD_ENDPOINT") or not env("FLOOD3D_POD_API_KEY"):
        return False, ("RunPod ist nicht eingerichtet: FLOOD3D_POD_ENDPOINT "
                       "und FLOOD3D_POD_API_KEY in backend/.env setzen.")
    return True, ""


# ── R2 (Eingang und Rückweg) ────────────────────────────────────────────────
def _r2():
    import boto3
    from botocore.config import Config

    def wert(name, default=""):
        # Zugangsdaten liegen in backend/.env.r2.flood3d (eigener Bucket)
        return env(name) or _datei_env().get(name, default)

    fehlend = [k for k in ("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID",
                           "S3_SECRET_ACCESS_KEY") if not wert(k)]
    if fehlend:
        raise RunPodFehler("R2-Zugang unvollständig (" + ", ".join(fehlend)
                           + ") — backend/.env.r2.flood3d prüfen.")
    client = boto3.client(
        "s3", endpoint_url=wert("S3_ENDPOINT"),
        aws_access_key_id=wert("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=wert("S3_SECRET_ACCESS_KEY"),
        region_name="auto", config=Config(signature_version="s3v4"))
    return client, wert("S3_BUCKET"), (wert("S3_PREFIX", "flood3d") or "flood3d").strip("/")


_ENV_DATEI_CACHE: dict = {}


def _datei_env() -> dict:
    if not _ENV_DATEI_CACHE:
        pfad = Path(__file__).resolve().parents[5] / ".env.r2.flood3d"
        werte = {}
        if pfad.is_file():
            for zeile in pfad.read_text(encoding="utf-8",
                                        errors="replace").splitlines():
                zeile = zeile.strip()
                if zeile and not zeile.startswith("#") and "=" in zeile:
                    k, v = zeile.split("=", 1)
                    werte[k.strip()] = v.strip().strip('"').strip("'")
        _ENV_DATEI_CACHE.update(werte or {"_leer": "1"})
    return _ENV_DATEI_CACHE


# ── RunPod-Aufrufe ──────────────────────────────────────────────────────────
def _ruf(pfad: str, body: dict | None = None, timeout: float = 60.0) -> dict:
    schluessel = env("FLOOD3D_POD_API_KEY")
    req = urllib.request.Request(
        f"{BASIS}/{env('FLOOD3D_POD_ENDPOINT')}/{pfad}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {schluessel}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        text = (e.read() or b"").decode("utf-8", "replace")[:300]
        raise RunPodFehler(f"RunPod {pfad}: HTTP {e.code} {text}")
    except urllib.error.URLError as e:
        raise RunPodFehler(f"RunPod {pfad} nicht erreichbar: {e.reason}")


def abbrechen(job_id: str) -> None:
    try:
        _ruf(f"cancel/{job_id}", {})
    except RunPodFehler:
        pass          # Abbruch ist ein Versuch, kein Versprechen


# ── Ablauf ──────────────────────────────────────────────────────────────────
# Runner-Phase → Manifest-Status. Der Runner (local_runner.emit) sendet
# progress-Ereignisse mit phase= und time= — hier ist die EINE Übersetzung
# für beide Verfolger (Frisch-Start und Wiederanknüpfen). Vorher waren es
# zwei Hand-Kopien, und eine las ev["t"] statt ev["time"]: letzte_zeit
# blieb jeden frischen Cloud-Lauf lang None (gefunden 2026-08-13).
_PHASE_STATUS = {"meshing": "meshing", "solving": "solving",
                 "postprocessing": "extracting"}


def _progress_melden(melde, ev: dict) -> None:
    felder = {"status": _PHASE_STATUS.get(ev.get("phase"), "solving")}
    if ev.get("time") is not None:
        felder["letzte_zeit"] = ev.get("time")
    melde(**felder)


def lauf_starten(spec, case_dir: Path, run_id: str, run_root: Path,
                 melde, abbruch_gewuenscht, cores: int | None = None,
                 checkpoint_s: int | None = 600,
                 zwischenstand_cb=None,
                 max_laufzeit_s: int | None = None) -> dict:
    """
    Einen Fall in der Cloud rechnen lassen.

    ``melde(**felder)`` schreibt ins Manifest (der Aufrufer kennt das
    Format), ``abbruch_gewuenscht()`` sagt, ob der Nutzer abgebrochen hat.
    Rückgabe: die Artefakte als Bytes — das Auspacken macht der Aufrufer
    mit dem vorhandenen Import.
    """
    from ...core.bundle import bundle_bauen

    ok, grund = konfiguriert()
    if not ok:
        raise RunPodFehler(grund)

    melde(status="building")
    client, bucket, praefix = _r2()
    eingang = f"{praefix}/eingang/{run_id}.zip"
    # Speicherpunkte: der Laeufer laedt Teilstaende ueber eine vorsignierte
    # PUT-URL hoch (das Foam-Image hat kein boto3); wir holen sie per Key
    # und spielen sie in den Lauf ein. Ohne das war ein Timeout bei Stunde 4
    # von 5 ein Totalverlust, und Ergebnis-3D blieb stundenlang leer.
    cp_key = f"{praefix}/checkpoints/{run_id}.zip"
    checkpoint = None
    if zwischenstand_cb is not None and checkpoint_s:
        put_url = client.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": cp_key,
                    "ContentType": "application/zip"},
            ExpiresIn=86400)
        checkpoint = {"put_url": put_url,
                      "min_intervall_s": int(checkpoint_s)}
    daten = bundle_bauen(spec, case_dir, run_id, checkpoint=checkpoint)
    melde(status="uploading", bundle_bytes=len(daten))
    client.put_object(Bucket=bucket, Key=eingang, Body=daten,
                      ContentType="application/zip")

    eingabe = {"case_zip": {"encoding": "s3", "key": eingang}, "run_id": run_id}
    if cores:
        eingabe["cores"] = int(cores)
    auftrag: dict = {"input": eingabe}
    if max_laufzeit_s:
        # Harte Laufzeit-Leitplanke JE JOB, von RunPod selbst durchgesetzt —
        # Rauch- und Beweislaeufe koennen damit nie mehr kosten als geplant
        # (Vorgabe Fabio 2026-08-13: Tests kurz deckeln, nie Stunden).
        auftrag["policy"] = {"executionTimeout": int(max_laufzeit_s) * 1000}
    job = _ruf("run", auftrag)
    job_id = job.get("id")
    if not job_id:
        raise RunPodFehler(f"RunPod hat keinen Job angelegt: {job}")
    melde(status="queued", runpod_job=job_id)

    artefakt_url = None
    fehler = None
    gesehen = 0
    t0 = time.time()
    protokoll = Path(run_root) / "log.runpod"
    try:
        while True:
            if abbruch_gewuenscht():
                abbrechen(job_id)
                raise RunPodFehler("Vom Nutzer abgebrochen")
            stand = _ruf(f"stream/{job_id}", timeout=90)
            # ACHTUNG: /stream liefert je Abfrage NUR die NEUEN Ereignisse,
            # nicht den ganzen bisherigen Strom. Ein Index-Zeiger darauf
            # verschluckt fast alles (2026-08-12 am ersten Cloud-Lauf
            # gesehen: von den Fortschrittsmeldungen kam nur ein Teil an,
            # die Kernzahl-Zeile fehlte ganz).
            strom = stand.get("stream", [])
            gesehen += len(strom)
            for eintrag in strom:
                ev = eintrag.get("output", eintrag)
                if not isinstance(ev, dict):
                    continue
                with open(protokoll, "a", encoding="utf-8") as f:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
                art = ev.get("event")
                if art == "progress":
                    _progress_melden(melde, ev)
                elif art == "checkpoint" and zwischenstand_cb is not None:
                    try:
                        roh = client.get_object(Bucket=bucket,
                                                Key=cp_key)["Body"].read()
                        zwischenstand_cb(roh, ev)
                    except Exception as e:   # noqa: BLE001 — Teilstand darf den Lauf nie kippen
                        melde(teilstand_fehler=f"{type(e).__name__}: {e}"[:200])
                elif art == "error":
                    fehler = str(ev.get("text"))[:500]
                    # Netz-Tor-Abbrueche tragen ihre Befunde im Ereignis —
                    # ohne diese Zeilen waeren die Zahlen des Abbruchs
                    # unsichtbar (der Lauf hat ja keine Artefakte)
                    extra = {k: ev[k] for k in ("befunde", "netz") if k in ev}
                    if extra:
                        melde(**extra)
                elif art == "done":
                    artefakt_url = ev.get("artifactsUrl")
            zustand = stand.get("status")
            if zustand in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"):
                # ACHTUNG: COMPLETED heisst NICHT erfolgreich — ein
                # gescheiterter Handler wird genauso gemeldet, der Grund
                # steht nur im error-Feld.
                if not artefakt_url:
                    ende = _ruf(f"status/{job_id}")
                    fehler = fehler or str(ende.get("error") or zustand)[:500]
                break
            time.sleep(TAKT_S)

        if not artefakt_url:
            raise RunPodFehler(f"Cloud-Lauf ohne Ergebnis: {fehler}")

        melde(status="downloading", dauer_cloud_s=round(time.time() - t0, 1))
        with urllib.request.urlopen(artefakt_url, timeout=900) as r:
            artefakte = r.read()
        return {"artefakte": artefakte, "job_id": job_id,
                "dauer_s": round(time.time() - t0, 1)}
    finally:
        # Eingang immer wegräumen — R2 kostet je gespeichertem GB, und das
        # Bundle wird nach dem Start nie wieder gebraucht.
        for key in (eingang, cp_key):
            try:
                client.delete_object(Bucket=bucket, Key=key)
            except Exception:  # noqa: BLE001 — Aufräumen darf den Lauf nicht kippen
                pass


def wiederanknuepfen(run_id: str, run_root: Path, job_id: str,
                     melde, abbruch_gewuenscht, zwischenstand_cb=None) -> dict:
    """
    Nach einem API-Neustart an einen noch laufenden RunPod-Job wieder
    anknuepfen: der alte Relay-Thread ist tot, der Job rechnet (und kostet)
    weiter, das Manifest steht auf solving. Gleiches Verfolgen wie in
    lauf_starten, nur ohne Bundle und ohne Neueinreichung.
    Wirft RunPodFehler("… unbekannt"), wenn RunPod den Job nicht mehr kennt.
    """
    import time as _time

    ok, grund = konfiguriert()
    if not ok:
        raise RunPodFehler(grund)
    try:
        stand = _ruf(f"status/{job_id}")
    except RunPodFehler:
        raise RunPodFehler(f"RunPod-Job {job_id} unbekannt (API-Neustart, "
                           "Job verfallen oder geloescht)")
    if stand.get("status") in ("FAILED", "CANCELLED", "TIMED_OUT"):
        raise RunPodFehler(f"RunPod-Job endete als {stand.get('status')}: "
                           f"{str(stand.get('error'))[:200]}")

    client, bucket, praefix = _r2()
    cp_key = f"{praefix}/checkpoints/{run_id}.zip"
    melde(status="solving", wiederangeknuepft=True)
    artefakt_url = None
    fehler = None
    gesehen = 0
    t0 = _time.time()
    protokoll = Path(run_root) / "log.runpod"
    try:
        while True:
            if abbruch_gewuenscht():
                abbrechen(job_id)
                raise RunPodFehler("Vom Nutzer abgebrochen")
            stand = _ruf(f"stream/{job_id}", timeout=90)
            strom = stand.get("stream", [])
            gesehen += len(strom)
            for eintrag in strom:
                ev = eintrag.get("output", eintrag)
                if not isinstance(ev, dict):
                    continue
                with open(protokoll, "a", encoding="utf-8") as f:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
                art = ev.get("event")
                if art == "progress":
                    _progress_melden(melde, ev)
                elif art == "checkpoint" and zwischenstand_cb is not None:
                    try:
                        roh = client.get_object(Bucket=bucket,
                                                Key=cp_key)["Body"].read()
                        zwischenstand_cb(roh, ev)
                    except Exception as e:   # noqa: BLE001
                        melde(teilstand_fehler=f"{type(e).__name__}: {e}"[:200])
                elif art == "error":
                    fehler = str(ev.get("text"))[:500]
                    extra = {k: ev[k] for k in ("befunde", "netz") if k in ev}
                    if extra:
                        melde(**extra)
                elif art == "done":
                    artefakt_url = ev.get("artifactsUrl")
            zustand = stand.get("status")
            if zustand in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"):
                if not artefakt_url:
                    ende = _ruf(f"status/{job_id}")
                    fehler = fehler or str(ende.get("error") or zustand)[:500]
                break
            time.sleep(TAKT_S)
        if not artefakt_url:
            raise RunPodFehler(f"Cloud-Lauf ohne Ergebnis: {fehler}")
        melde(status="downloading")
        import urllib.request as _ur
        with _ur.urlopen(artefakt_url, timeout=900) as r:
            artefakte = r.read()
        return {"artefakte": artefakte, "job_id": job_id,
                "dauer_s": round(_time.time() - t0, 1)}
    finally:
        for key in (f"{praefix}/eingang/{run_id}.zip", cp_key):
            try:
                client.delete_object(Bucket=bucket, Key=key)
            except Exception:  # noqa: BLE001
                pass


def r2_aufraeumen(max_alter_h: float = 24.0) -> list[str]:
    """
    Verwaiste Transit-Objekte im R2 loeschen — R2 ist NUR Transit
    (Entscheidung 2026-08-13). Waisen entstehen, wenn ein Relay-Thread
    stirbt (API-Neustart) oder ein Lauf scheitert: eingang/-Bundles,
    checkpoints/, artifacts/ sowie die Worker-Ablagen
    ``{praefix}/{job_id}/artifacts.zip``. Geloescht wird nur, was aelter
    als ``max_alter_h`` ist UND zu keinem lebenden (nicht-terminalen) Lauf
    gehoert. Rueckgabe: Liste der geloeschten Keys (fuers Log).
    """
    import datetime as _dt

    from ...router import read_manifest, run_paths, runs_root

    client, bucket, praefix = _r2()
    grenze = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=max_alter_h)
    lebendig: set[str] = set()
    root = runs_root()
    if root.is_dir():
        for d in root.iterdir():
            if not d.is_dir():
                continue
            m = read_manifest(run_paths(root, d.name)) or {}
            if m.get("status") not in ("completed", "failed", "abgebrochen",
                                       "teilergebnis", "unbekannt"):
                lebendig.add(d.name)

    geloescht: list[str] = []
    token = None
    while True:
        kw = {"Bucket": bucket, "Prefix": f"{praefix}/"}
        if token:
            kw["ContinuationToken"] = token
        antwort = client.list_objects_v2(**kw)
        for obj in antwort.get("Contents", []):
            key = obj["Key"]
            alter_ok = obj.get("LastModified") and obj["LastModified"] < grenze
            if not alter_ok:
                continue
            teile = key[len(praefix) + 1:].split("/")
            if teile[0] in ("eingang", "checkpoints", "artifacts") and len(teile) == 2:
                run_id = teile[1].removesuffix(".zip")
                if run_id in lebendig:
                    continue
            # Worker-Ablage {job_id}/artifacts.zip: keine Zuordnung zu einem
            # Lauf moeglich — nach Ablauf der Frist ist sie eine Waise
            client.delete_object(Bucket=bucket, Key=key)
            geloescht.append(key)
        if not antwort.get("IsTruncated"):
            break
        token = antwort.get("NextContinuationToken")
    return geloescht


def artefakt_aufraeumen(job_id: str) -> None:
    """Ergebnisarchiv in R2 löschen, nachdem es importiert ist."""
    try:
        client, bucket, praefix = _r2()
        client.delete_object(Bucket=bucket, Key=f"{praefix}/{job_id}/artifacts.zip")
    except Exception:  # noqa: BLE001
        pass
