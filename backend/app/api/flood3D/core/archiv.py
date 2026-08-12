"""
Fertige Läufe auf die StorageBox auslagern.

Warum nur Läufe: Sie sind der einzige Teil, der unbegrenzt wächst (100–200 MB
je Lauf), und nach dem Rechnen werden sie nur noch gelesen. Fälle bleiben
lokal — sie sind winzig (19 MB für alles) und werden bei jeder Bedienung
angefasst.

Warum nicht dort RECHNEN (gemessen 2026-08-12): Die Freigabe schafft 147 MB/s
bei großen Dateien, ist aber bei vielen kleinen 30× langsamer als die lokale
Platte (200 Dateien: 0,83 s statt 0,028 s) — und ein OpenFOAM-Lauf schreibt
zehntausende davon. Dazu ist sie `soft` eingehängt: Bei einer Netzstörung gibt
es einen E/A-Fehler statt zu warten, und eine Stunde Rechenzeit wäre verloren.
Ausgelagert wird deshalb erst, wenn nichts mehr rechnet.

Was lokal BLEIBT, damit die Oberfläche ohne Netz auskommt:
``manifest.json`` (Liste, Zustand, Protokoll-Panel), ``result.json``
(Bewertung, Zielwerte) und die Marke ``archiviert.json``. Alles Schwere —
Felder, Abbildungen, Fallordner, normalized.parquet — wandert.

Sicherheitsnetz: kopieren, GEGENPRÜFEN (Dateizahl und Bytes), erst dann
lokal löschen. Ein halb übertragener Lauf darf nicht als archiviert gelten.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

MARKE = "archiviert.json"
BLEIBT_LOKAL = {"manifest.json", "result.json", MARKE}

# Terminale Zustände: was noch rechnet oder auf einen Import wartet, wird
# nicht angefasst (ein laufender Lauf schreibt weiter in den Ordner).
ARCHIVIERBAR = {"completed", "teilergebnis", "abgebrochen", "failed"}


class ArchivFehler(RuntimeError):
    """Vorhersehbare Gründe (nicht eingehängt, Lauf läuft noch, …)."""


def archiv_wurzel() -> Path:
    return Path(os.environ.get("FLOOD3D_ARCHIV_ROOT",
                               "/mnt/storagebox/flood3d-runs"))


def archiv_bereit() -> tuple[bool, str]:
    """Ist die StorageBox da und beschreibbar? (Automount kann schlafen.)"""
    wurzel = archiv_wurzel()
    try:
        wurzel.mkdir(parents=True, exist_ok=True)
        probe = wurzel / ".schreibprobe"
        probe.write_text("x")
        probe.unlink()
    except OSError as e:
        return False, f"Archiv nicht erreichbar ({wurzel}): {e}"
    return True, ""


def _vermessen(ordner: Path) -> tuple[int, int]:
    """(Dateizahl, Bytes) — die Größe, an der die Gegenprüfung hängt."""
    n = summe = 0
    for p in ordner.rglob("*"):
        if p.is_file():
            n += 1
            summe += p.stat().st_size
    return n, summe


def marke_lesen(run_root: Path) -> dict | None:
    p = Path(run_root) / MARKE
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def ist_archiviert(run_root: Path) -> bool:
    return marke_lesen(run_root) is not None


def archivieren(run_root: Path, status: str) -> dict:
    """
    Schweres Beiwerk auf die StorageBox schieben. Gibt die Marke zurück.

    Reihenfolge ist Absicht: erst kopieren, dann gegenprüfen, dann lokal
    löschen. Bricht das Netz mittendrin weg, steht der Lauf noch vollständig
    auf der Platte — nur der Archivordner ist unvollständig und wird beim
    nächsten Versuch überschrieben.
    """
    run_root = Path(run_root)
    if not run_root.is_dir():
        raise ArchivFehler("Lauf nicht gefunden")
    if ist_archiviert(run_root):
        return marke_lesen(run_root)
    if status not in ARCHIVIERBAR:
        raise ArchivFehler(
            f"Lauf im Zustand {status!r} — archiviert wird erst, wenn nichts "
            "mehr rechnet oder auf einen Import wartet.")
    bereit, grund = archiv_bereit()
    if not bereit:
        raise ArchivFehler(grund)

    ziel = archiv_wurzel() / run_root.name
    if ziel.exists():
        shutil.rmtree(ziel, ignore_errors=True)
    ziel.mkdir(parents=True)

    verschoben = [p for p in sorted(run_root.iterdir())
                  if p.name not in BLEIBT_LOKAL]
    for p in verschoben:
        if p.is_dir():
            shutil.copytree(p, ziel / p.name)
        else:
            shutil.copy2(p, ziel / p.name)

    # Gegenprüfung: Dateizahl UND Bytes müssen stimmen, sonst nichts löschen
    soll_n = soll_b = 0
    for p in verschoben:
        if p.is_dir():
            n, b = _vermessen(p)
        else:
            n, b = 1, p.stat().st_size
        soll_n += n
        soll_b += b
    ist_n, ist_b = _vermessen(ziel)
    if (ist_n, ist_b) != (soll_n, soll_b):
        shutil.rmtree(ziel, ignore_errors=True)
        raise ArchivFehler(
            f"Übertragung unvollständig ({ist_n}/{soll_n} Dateien, "
            f"{ist_b}/{soll_b} Bytes) — lokal bleibt alles unangetastet.")

    for p in verschoben:
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()

    marke = {"archiviert_am": time.time(), "pfad": str(ziel),
             "dateien": soll_n, "bytes": soll_b}
    (run_root / MARKE).write_text(json.dumps(marke, indent=2))
    return marke


def wiederherstellen(run_root: Path) -> dict:
    """Zurückholen. Vorhandenes lokal wird NICHT überschrieben."""
    run_root = Path(run_root)
    marke = marke_lesen(run_root)
    if marke is None:
        return {"run_id": run_root.name, "war_archiviert": False}
    quelle = Path(marke["pfad"])
    if not quelle.is_dir():
        raise ArchivFehler(
            f"Archivordner fehlt ({quelle}) — StorageBox eingehängt? "
            "Die Marke bleibt stehen, damit nichts stillschweigend verschwindet.")
    for p in sorted(quelle.iterdir()):
        ziel = run_root / p.name
        if ziel.exists():
            continue
        if p.is_dir():
            shutil.copytree(p, ziel)
        else:
            shutil.copy2(p, ziel)
    ist_n, ist_b = _vermessen(run_root)
    if ist_b < marke.get("bytes", 0):
        raise ArchivFehler(
            f"Zurückgeholt sind nur {ist_b} von {marke.get('bytes')} Bytes — "
            "Archiv bleibt stehen, bitte erneut versuchen.")
    (run_root / MARKE).unlink(missing_ok=True)
    shutil.rmtree(quelle, ignore_errors=True)
    return {"run_id": run_root.name, "war_archiviert": True,
            "bytes": marke.get("bytes", 0)}


def kandidaten(runs_root: Path, alter_tage: float,
               status_von) -> list[tuple[Path, str, int]]:
    """
    Fertige, alte, noch nicht archivierte Läufe — (Ordner, Zustand, Bytes).

    ``status_von`` liefert den Zustand eines Laufordners; die Auswertung
    liegt im Router (Manifest + result.json), nicht hier.
    """
    grenze = time.time() - alter_tage * 86400
    out = []
    for d in sorted(Path(runs_root).iterdir()):
        if not d.is_dir() or ist_archiviert(d):
            continue
        status = status_von(d)
        if status not in ARCHIVIERBAR:
            continue
        if d.stat().st_mtime > grenze:
            continue
        out.append((d, status, _vermessen(d)[1]))
    return out
