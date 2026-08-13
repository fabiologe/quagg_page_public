"""
laufwerk — das Laufwerk: alles, was Läufe fährt und bewacht.

Keine HTTP-Schicht: hier leben die Registries der aktiven Läufe, der
RunPod-Orchestrierungs-Thread, die Wächter (Teilstände einsammeln,
Auto-Archiv, R2-Putzrunde) und das Wiederanknüpfen nach einem API-Neustart.
Der Router ruft diese Funktionen — nie umgekehrt: laufwerk importiert
NICHTS aus dem Router (Pfad-/Store-Politik kommt aus core/store, der
S3-Transit läuft ausschließlich über benannte Funktionen in
engines/runpod/relay).
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path

from fastapi import HTTPException

from .core.store import (manifest_schreiben, read_manifest, run_paths,
                         runs_root)
from .engines.runpod import relay

# ── Registries ──────────────────────────────────────────────────────────────
# Aktive Lauf-Threads dieses Prozesses (run_id -> Thread). Nach einem
# Neustart ist das leer — dafür gibt es relays_wiederanknuepfen().
_active_runs: dict[str, object] = {}
# Fälle, für die gerade eine Netzvorschau rechnet (Doppelstart-Sperre)
_laufende_previews: set[str] = set()


# ── Artefakt-Import ─────────────────────────────────────────────────────────
_IMPORT_TOP = {"manifest.json", "result.json", "normalized.parquet"}
_IMPORT_MEMBER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


# Der ungestückelte Import-Zwilling (POST /runs/{id}/import) ist entfernt
# (Audit H4): der Client lädt seit jeher ausschließlich über /import-chunk —
# ein 400-MB-Body scheiterte an jeder Proxy-Grenze.
def _import_entpacken(run_root: Path, run_id: str, data: bytes) -> dict:
    import io
    import zipfile

    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Kein gültiges Archiv")
    for m in z.namelist():
        if m.endswith("/"):
            continue
        ok = (_IMPORT_MEMBER.match(m) and ".." not in m
              and (m in _IMPORT_TOP
                   or m.startswith(("figures/", "fields/"))
                   # Szenengeometrie: Bauwerks-STLs und die vernetzte
                   # Solver-Oberflaeche (dort sucht /runs/{id}/geometry)
                   or (m.startswith("case/") and m.endswith(".stl")
                       and (m.startswith("case/constant/triSurface/")
                            or m.startswith("case/meshSurface")))))
        if not ok:
            raise HTTPException(status_code=422,
                                detail=f"Unerlaubter Archivpfad: {m!r}")
    for m in z.namelist():
        if m.endswith("/"):
            continue
        target = run_root / m
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(z.read(m))
    # Konsistenz: die Artefakte müssen zum reservierten Lauf gehören
    result_path = run_root / "result.json"
    if result_path.exists():
        got = json.loads(result_path.read_text()).get("run_id")
        if got != run_id:
            raise HTTPException(status_code=422,
                                detail=f"Artefakte tragen run_id {got!r}, "
                                       f"erwartet {run_id!r}")
    return {"run_id": run_id, "status": "completed"}


def _endstatus_bei_fehler(run_root: Path) -> str:
    """Cloud-Lauf gescheitert: liegen gesicherte Zwischenstaende vor, ist
    das ein TEILERGEBNIS (ansehbar!), kein Totalausfall — die 4 Zeitschritte
    des Wiederanknuepfungs-Smokes waren da und trugen trotzdem 'failed'."""
    try:
        m = json.loads((run_root / "manifest.json").read_text())
        if m.get("teilstand"):
            return "teilergebnis"
    except Exception:  # noqa: BLE001
        pass
    return "failed"


# ── RunPod-Orchestrierung ───────────────────────────────────────────────────
def runpod_lauf_starten(spec, case_dir: Path, run_id: str, run_root: Path,
                        cores: int | None = None,
                        checkpoint_s: int | None = 600,
                        max_laufzeit_s: int | None = None) -> None:
    """
    Cloud-Lauf im Hintergrund fahren: Bundle → R2 → Job → Ereignisstrom →
    vorhandener Import. Der Endpunkt hat Gate und Validierungstor schon
    passiert und die run_id reserviert — hier beginnt die Orchestrierung.

    Nach dem Import sieht der Lauf aus wie jeder andere — das Manifest
    aus dem Archiv (mit foam, checkMesh, Kosten) bleibt maßgeblich, wir
    setzen nur den Endzustand darüber.
    """
    def melde(**felder):
        """Manifest fortschreiben — gelockt und atomar (core/store)."""
        manifest_schreiben(run_root, **felder)

    def work_runpod():
        def zwischenstand(daten: bytes, ev: dict) -> None:
            """Teilstand aus S3 in den Lauf einspielen — Ergebnis-3D zeigt
            damit schon WAEHREND des Cloud-Laufs die fertigen Zeitschritte."""
            try:
                _import_entpacken(run_root, run_id, daten)
                melde(teilstand=True,
                      teilstand_zeiten=ev.get("zeiten"),
                      letzte_zeit=ev.get("letzte_zeit"))
            except Exception as e:       # noqa: BLE001
                melde(teilstand_fehler=f"{type(e).__name__}: {e}"[:200])

        try:
            erg = relay.lauf_starten(spec, case_dir, run_id, run_root, melde,
                                     lambda: (run_root / "ABBRUCH").exists(),
                                     cores=cores,
                                     checkpoint_s=checkpoint_s,
                                     zwischenstand_cb=zwischenstand,
                                     max_laufzeit_s=max_laufzeit_s)
            melde(status="importing")
            _import_entpacken(run_root, run_id, erg["artefakte"])
            relay.artefakt_aufraeumen(erg["job_id"])
            # Ist-Kosten mit dem RunPod-Satz, nicht mit dem Serversatz:
            # 0,033 EUR je vCPU-Stunde (Preisliste 2026-08-12).
            from .core.runner import POD_PRICE_EUR_H
            # Kernzahl aus dem importierten Manifest: das ist die, mit der
            # der Worker WIRKLICH gerechnet hat (der Laeufer schreibt sie
            # mit) — nicht die, die wir vermuten.
            kerne = int(json.loads((run_root / "manifest.json").read_text())
                        .get("cores") or 16)
            # origin/ort NACH dem Import setzen: das Manifest aus dem
            # Archiv stammt vom Laeufer und sagt "companion" — richtig fuer
            # die Nutzer-Maschine, falsch fuer die Cloud.
            melde(status="completed", finished=time.time(),
                  origin="runpod", ort="runpod",
                  duration_s=erg["dauer_s"], runpod_job=erg["job_id"],
                  cost_eur=round(erg["dauer_s"] / 3600.0 * kerne
                                 * POD_PRICE_EUR_H, 2))
        except relay.RunPodFehler as e:
            abgebrochen = "abgebrochen" in str(e).lower()
            melde(status="abgebrochen" if abgebrochen
                  else _endstatus_bei_fehler(run_root),
                  error=str(e)[:500], finished=time.time())
        except Exception as e:                   # noqa: BLE001
            melde(status=_endstatus_bei_fehler(run_root),
                  error=f"{type(e).__name__}: {e}"[:500],
                  finished=time.time())
        finally:
            (run_root / "ABBRUCH").unlink(missing_ok=True)

    def work():
        try:
            work_runpod()
        except Exception as e:                   # noqa: BLE001
            # Der Fehlerzustand steht NORMALERWEISE im Manifest — aber
            # wenn das Manifest-Schreiben selbst scheitert (Platte voll),
            # verschwände der Lauf sonst spurlos in `status: building`.
            # Deshalb zusätzlich ins Server-Log (Audit F8).
            print(f"flood3d: Lauf {run_id} abgebrochen "
                  f"({type(e).__name__}: {e}) — Details im Manifest, "
                  "sofern es sich schreiben ließ", flush=True)
        finally:
            _active_runs.pop(run_id, None)

    # Der Cloud-Weg schreibt sein Manifest selbst — Ordner und erster
    # Zustand müssen VOR dem Thread stehen, sonst zeigt die Liste einen
    # Lauf ohne alles.
    run_root.mkdir(parents=True, exist_ok=True)
    melde(status="building", origin="runpod", ort="runpod",
          title=spec.meta.title, created=time.time())

    t = threading.Thread(target=work, name=f"flood3d-{run_id}", daemon=True)
    _active_runs[run_id] = t
    t.start()


# ── Wächter ─────────────────────────────────────────────────────────────────
def _lauf_status(root: Path, d: Path) -> str:
    """Status eines Laufs: result.json ist maßgeblich, sonst Manifest."""
    paths = run_paths(root, d.name)
    result = None
    if paths.result.exists():
        try:
            result = json.loads(paths.result.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            result = None
    return (result or {}).get(
        "status", (read_manifest(paths) or {}).get("status", ""))


def teilstaende_einsammeln() -> list[str]:
    """
    Laeufe im Zustand „lokal" mit S3 abgleichen — OHNE Browser.

    Der lokale Weg hing am Browser-Faden: Tab-Wechsel drosselte die
    Antriebsschleife, Navigation toetete sie, und fertig gerechnete Laeufe
    blieben als „lokal, 0 MB" stehen (gemeldet 2026-08-12). Der Laeufer
    laedt Teilstaende und Endergebnis nach S3; dieser Waechter holt beides
    ab, sobald es dort liegt — der Browser ist nur noch Zuschauer.
    """
    eingesammelt: list[str] = []
    if not relay.r2_bereit():   # ohne R2 gibt es nichts einzusammeln
        return eingesammelt
    root = runs_root()
    if not root.is_dir():
        return eingesammelt
    for d in sorted(root.iterdir()):
        mp = d / "manifest.json"
        if not d.is_dir() or not mp.is_file():
            continue
        try:
            m = json.loads(mp.read_text())
        except Exception:  # noqa: BLE001
            continue
        if m.get("status") != "lokal":
            continue
        if (d / "_upload.zip").exists():
            continue       # der Browser importiert gerade selbst — nicht dazwischenfunken
        run_id = d.name
        try:
            daten = relay.endergebnis_holen(run_id)
            if daten is not None:
                _import_entpacken(d, run_id, daten)
                relay.transit_loeschen(run_id)
                eingesammelt.append(run_id)
                print(f"flood3d: Endergebnis von {run_id} aus S3 eingesammelt "
                      "(ohne Browser)", flush=True)
                continue
        except Exception:  # noqa: BLE001 — kein Endergebnis: Teilstand versuchen
            pass
        try:
            geholt = relay.teilstand_mit_marke_holen(
                run_id, bekannte_marke=m.get("teilstand_stand"))
            if geholt is None:
                continue   # kein Teilstand hinterlegt oder schon eingespielt
            daten, marke = geholt
            _import_entpacken(d, run_id, daten)
            # status="lokal" ausdruecklich zuruecksetzen: das eingespielte
            # Archiv bringt ein eigenes Manifest mit — ein TEILSTAND macht
            # den Lauf aber nicht fertig, er rechnet ja noch
            manifest_schreiben(d, status="lokal", teilstand=True,
                               teilstand_stand=marke,
                               teilstand_quelle="s3-waechter")
            eingesammelt.append(run_id)
        except Exception:  # noqa: BLE001 — auch kein Teilstand: naechster Lauf
            pass
    return eingesammelt


def archiv_waechter() -> list[str]:
    """
    Auto-Archiv (Entscheidung 2026-08-13): Ergebnisse liegen primaer auf
    der Serverplatte, fertige Laeufe wandern nach FLOOD3D_ARCHIV_TAGE
    automatisch auf die StorageBox — die Knoepfe 📦/📥 existieren, hier
    kommt nur der Automat dazu. StorageBox nicht eingehaengt -> stiller
    Durchlauf (naechste Runde versucht es wieder).
    """
    from .core.archiv import ArchivFehler, archiv_bereit, archivieren, kandidaten

    bereit, _grund = archiv_bereit()
    if not bereit:
        return []
    root = runs_root()
    if not root.is_dir():
        return []

    tage = float(os.environ.get("FLOOD3D_ARCHIV_TAGE", "14"))
    archiviert = []
    for d, status, _bytes in kandidaten(root, tage,
                                        lambda d: _lauf_status(root, d)):
        try:
            archivieren(d, status)
            archiviert.append(d.name)
            print(f"flood3d: Lauf {d.name} automatisch auf die StorageBox "
                  f"archiviert (aelter als {tage:g} Tage)", flush=True)
        except ArchivFehler as e:
            print(f"flood3d: Auto-Archiv {d.name} uebersprungen: {e}",
                  flush=True)
    return archiviert


def relays_wiederanknuepfen() -> list[str]:
    """
    Nach einem API-Neustart: Cloud-Laeufe, deren Relay-Thread mit dem alten
    Prozess starb, wieder uebernehmen — der RunPod-Job rechnet (und kostet)
    ja weiter. Job unbekannt -> ehrlich als failed markieren statt ewig
    `solving` zu zeigen. Das schliesst die Waisen-Quelle, die bisher
    Handarbeit in der RunPod-Konsole brauchte.
    """
    root = runs_root()
    if not root.is_dir():
        return []
    uebernommen = []
    for d in sorted(root.iterdir()):
        mp = d / "manifest.json"
        if not d.is_dir() or not mp.is_file():
            continue
        try:
            m = json.loads(mp.read_text())
        except Exception:  # noqa: BLE001
            continue
        if m.get("origin") != "runpod":
            continue
        if m.get("status") in ("completed", "failed", "abgebrochen",
                               "teilergebnis"):
            continue
        job_id = m.get("runpod_job")
        run_id = d.name
        run_root = d

        def melde(_root=run_root, **felder):
            manifest_schreiben(_root, **felder)

        if not job_id:
            melde(status="failed", finished=time.time(),
                  error="API-Neustart vor der Job-Anlage — bitte neu starten")
            continue

        def _work(run_id=run_id, run_root=run_root, job_id=job_id, melde=melde):
            def zwischenstand(daten, ev):
                try:
                    _import_entpacken(run_root, run_id, daten)
                    melde(teilstand=True, teilstand_zeiten=ev.get("zeiten"),
                          letzte_zeit=ev.get("letzte_zeit"))
                except Exception as e:   # noqa: BLE001
                    melde(teilstand_fehler=f"{type(e).__name__}: {e}"[:200])
            try:
                erg = relay.wiederanknuepfen(
                    run_id, run_root, job_id, melde,
                    lambda: (run_root / "ABBRUCH").exists(), zwischenstand)
                melde(status="importing")
                _import_entpacken(run_root, run_id, erg["artefakte"])
                relay.artefakt_aufraeumen(erg["job_id"])
                melde(status="completed", origin="runpod", ort="runpod",
                      finished=time.time(), wiederangeknuepft=True)
            except relay.RunPodFehler as e:
                ab = "abgebrochen" in str(e).lower()
                melde(status="abgebrochen" if ab
                      else _endstatus_bei_fehler(run_root),
                      error=str(e)[:500], finished=time.time())
            except Exception as e:       # noqa: BLE001
                melde(status=_endstatus_bei_fehler(run_root),
                      finished=time.time(),
                      error=f"{type(e).__name__}: {e}"[:500])
            finally:
                (run_root / "ABBRUCH").unlink(missing_ok=True)

        threading.Thread(target=_work, daemon=True,
                         name=f"flood3d-reattach-{run_id}").start()
        uebernommen.append(run_id)
        print(f"flood3d: Relay fuer {run_id} wieder angeknuepft "
              f"(Job {job_id})", flush=True)
    return uebernommen


def teilstand_waechter_starten() -> None:
    """
    Die Sweep-Schleife anwerfen: alle 2 Minuten S3 abgleichen
    (FLOOD3D_SWEEP_S uebersteuert; <= 0 schaltet ab — Tests), dazu in
    groesseren Takten Auto-Archiv (FLOOD3D_ARCHIV_S) und R2-Putzrunde
    (FLOOD3D_R2_PUTZ_S, Altersgrenze FLOOD3D_R2_MAX_ALTER_H).
    """
    takt = int(os.environ.get("FLOOD3D_SWEEP_S", "120"))
    if takt <= 0:
        return             # fuer Tests abschaltbar

    archiv_takt = int(os.environ.get("FLOOD3D_ARCHIV_S", "21600"))
    putz_takt = int(os.environ.get("FLOOD3D_R2_PUTZ_S", "3600"))
    stand = {"archiv": 0.0, "putz": 0.0}

    def _schleife():
        while True:
            time.sleep(takt)
            try:
                teilstaende_einsammeln()
            except Exception:  # noqa: BLE001 — der Waechter darf nie sterben
                pass
            jetzt = time.time()
            if jetzt - stand["archiv"] >= archiv_takt:
                stand["archiv"] = jetzt
                try:
                    archiv_waechter()
                except Exception:  # noqa: BLE001
                    pass
            if jetzt - stand["putz"] >= putz_takt:
                stand["putz"] = jetzt
                try:
                    weg = relay.r2_aufraeumen(
                        float(os.environ.get("FLOOD3D_R2_MAX_ALTER_H", "24")))
                    if weg:
                        print(f"flood3d: R2-Putzrunde entfernte {len(weg)} "
                              f"Waisen: {weg[:5]}", flush=True)
                except Exception:  # noqa: BLE001
                    pass

    threading.Thread(target=_schleife, name="flood3d-teilstand",
                     daemon=True).start()
