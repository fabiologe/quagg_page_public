"""Projektordner auf der StorageBox — die Wahrheit fuer die Phase.

Wurzel: PROJEKTE_ROOT (Default /mnt/storagebox/1_Projekte). Darunter liegen
die Phasenordner, darin je Projekt EIN Ordner '<id>_<slug>'. Die Nummer ist
die Projekt-ID (Haus-Konvention, kein FK). Alles hier ist reines Dateisystem —
keine Datenbank, damit es gegen ein tmp_path testbar bleibt.
"""

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .env import env

from .leistungsphasen import ordnername_lph, slug

STANDARD_WURZEL = "/mnt/storagebox/1_Projekte"
_STORAGEBOX = Path("/mnt/storagebox")
_MOUNT_SENTINEL = _STORAGEBOX / ".quagg_mount_ok"

PHASEN = ("00_Angebote", "01_Laufend", "02_Pausiert",
          "03_Abgeschlossen", "04_Abgelehnt", "05_Bezahlt")
AKTE = "_akte"
TEMPLATE = ("00_Vertrag", "01_Grundlagen", "02_Planung", "03_Schriftverkehr",
            "04_Berechnungen", "05_Rechnungen", "CDE")
PLANUNG = "02_Planung"
_MUSTER = re.compile(r"^(\d+)(?:[_\-\s]+(.*))?$")
MINDESTNUMMER = 1000


class OrdnerFehler(ValueError):
    """Fachlich unmoeglich (Phase unbekannt, Ziel existiert) — Router: 422."""


class OrdnerNichtBereit(RuntimeError):
    """StorageBox nicht erreichbar — Router: 503."""


@dataclass(frozen=True)
class Ordner:
    id: int
    ordnername: str
    phase: str
    pfad: Path


def wurzel() -> Path:
    return Path(env("PROJEKTE_ROOT", STANDARD_WURZEL))


def mount_pruefen(pfad: Path | None = None) -> None:
    """Muster pedant/core/ablage.py: nur wenn die Wurzel auf der StorageBox liegt."""
    pfad = pfad or wurzel()
    if not pfad.is_relative_to(_STORAGEBOX):
        return
    try:
        mounts = Path("/proc/mounts").read_text(encoding="utf-8", errors="replace")
    except OSError as fehler:
        raise OrdnerNichtBereit(f"/proc/mounts nicht lesbar: {fehler}")
    if str(_STORAGEBOX) not in mounts:
        raise OrdnerNichtBereit("storagebox ist nicht gemountet")
    if not _MOUNT_SENTINEL.exists():
        raise OrdnerNichtBereit("mount-sentinel .quagg_mount_ok fehlt")


def phase_pruefen(phase: str) -> str:
    if phase not in PHASEN:
        raise OrdnerFehler(f"unbekannte phase {phase!r} (erlaubt: {', '.join(PHASEN)})")
    return phase


def _phasenordner(w: Path, phase: str) -> Path:
    """Phasenordner werden NIE implizit angelegt — fehlt einer, ist die Wurzel
    nicht die erwartete StorageBox-Struktur (oder der Mount ist weg)."""
    pfad = w / phase
    if not pfad.is_dir():
        raise OrdnerNichtBereit(f"phasenordner {phase} fehlt unter {w}")
    return pfad


def scan() -> list[Ordner]:
    """Alle Projektordner ueber alle Phasen; Namen ohne fuehrende Nummer werden
    ignoriert (sie sind keine Projekte im Sinne der Konvention)."""
    w = wurzel()
    mount_pruefen(w)
    gefunden: list[Ordner] = []
    for phase in PHASEN:
        ordner = w / phase
        if not ordner.is_dir():
            continue
        with os.scandir(ordner) as es:
            for e in es:
                if not e.is_dir() or e.name.startswith("."):
                    continue
                treffer = _MUSTER.match(e.name)
                if not treffer:
                    continue
                gefunden.append(Ordner(int(treffer.group(1)), e.name, phase, Path(e.path)))
    gefunden.sort(key=lambda o: o.id)
    return gefunden


def finde(projekt_id: int) -> Ordner | None:
    for o in scan():
        if o.id == projekt_id:
            return o
    return None


def hoechste_nummer() -> int:
    return max((o.id for o in scan()), default=0)


def ordnername_bilden(nummer: int, name: str) -> str:
    rest = slug(name)
    return f"{nummer}_{rest}" if rest else str(nummer)


def anlegen(ordnername: str, phase: str, lph: tuple[int, ...] | list[int] = ()) -> Ordner:
    """Legt den Projektordner samt Template an. Existiert er schon, ist das
    ein Fehler — Nummern werden nie doppelt vergeben."""
    phase_pruefen(phase)
    treffer = _MUSTER.match(ordnername)
    if not treffer:
        raise OrdnerFehler(f"ordnername {ordnername!r} beginnt nicht mit der nummer")
    w = wurzel()
    mount_pruefen(w)
    phasenordner = _phasenordner(w, phase)
    ziel = phasenordner / ordnername
    if ziel.exists():
        raise OrdnerFehler(f"ordner {phase}/{ordnername} existiert bereits")
    ziel.mkdir()
    (ziel / AKTE).mkdir()
    for name in TEMPLATE:
        (ziel / name).mkdir()
    for nr in lph:
        (ziel / PLANUNG / ordnername_lph(int(nr))).mkdir()
    return Ordner(int(treffer.group(1)), ordnername, phase, ziel)


def akte_sicherstellen(o: Ordner) -> Path:
    """Fuer uebernommene Bestandsordner: nur den internen _akte-Ordner ergaenzen,
    die gewachsene Struktur des Nutzers bleibt unangetastet."""
    pfad = o.pfad / AKTE
    pfad.mkdir(exist_ok=True)
    return pfad


def verschiebe(o: Ordner, phase: str) -> Ordner:
    """Phasenwechsel = ein Rename innerhalb der Wurzel (gleicher Mount)."""
    phase_pruefen(phase)
    if o.phase == phase:
        return o
    w = wurzel()
    mount_pruefen(w)
    ziel = _phasenordner(w, phase) / o.ordnername
    if ziel.exists():
        raise OrdnerFehler(f"in {phase} liegt bereits ein ordner {o.ordnername}")
    os.rename(o.pfad, ziel)
    return Ordner(o.id, o.ordnername, phase, ziel)
