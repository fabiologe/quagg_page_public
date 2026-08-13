"""
store — Ablage und Index der Läufe (Spez. Kap. 3 und 4.4).

Verzeichnislayout je Lauf:

    <runs_root>/<run_id>/
        case/                  OpenFOAM-Fall (Eingabe der Rechnung)
        normalized.parquet     Zwischendatei (Spez. 4.2)
        result.json            Ergebnis (Spez. 4.3)
        figures/               Berichtsabbildungen
        manifest.json          Laufmanifest (Spez. 4.4)
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RunPaths:
    root: Path

    @property
    def case_dir(self) -> Path: return self.root / "case"
    @property
    def normalized(self) -> Path: return self.root / "normalized.parquet"
    @property
    def result(self) -> Path: return self.root / "result.json"
    @property
    def figures_dir(self) -> Path: return self.root / "figures"
    @property
    def manifest(self) -> Path: return self.root / "manifest.json"


def run_paths(runs_root: str | Path, run_id: str) -> RunPaths:
    return RunPaths(Path(runs_root) / run_id)


def lauf_reservieren(runs_root: str | Path, case_id: str) -> tuple[str, Path]:
    """
    Nächste freie Laufnummer ``<case>_rNNN`` ATOMAR reservieren.

    Reservierung = das Verzeichnis existiert; ``mkdir`` wirft bei
    Kollision und die Schleife nimmt dann die nächste Nummer. Vorher
    stand an zwei Stellen dasselbe racy exists()-Zählen — zwei
    gleichzeitige Anfragen bekamen dieselbe run_id. Wer die Reservierung
    zurückgeben will (Bau gescheitert), räumt das Verzeichnis weg.
    """
    root = Path(runs_root)
    root.mkdir(parents=True, exist_ok=True)
    n = 1
    while True:
        run_id = f"{case_id}_r{n:03d}"
        try:
            (root / run_id).mkdir()
            return run_id, root / run_id
        except FileExistsError:
            n += 1


def read_manifest(paths: RunPaths) -> dict | None:
    if paths.manifest.exists():
        with open(paths.manifest, encoding="utf-8") as f:
            return json.load(f)
    return None


def manifest_schreiben(run_root: str | Path, **felder) -> dict:
    """
    DIE eine Stelle, die manifest.json fortschreibt. Liefert den neuen Stand.

    Vorher gab es sieben Kopien dieses Read-Modify-Write, drei davon
    liefen gleichzeitig in verschiedenen Threads auf derselben Datei
    (Relay-Verfolger, S3-Wächter, Reattach) — letzter Schreiber gewann,
    Felder verschwanden still. Hier deshalb beides:

    - **Lock** (fcntl auf einer Seitendatei): Lesen→Ändern→Schreiben ist
      unteilbar, kein Update geht mehr verloren.
    - **Atomares Ersetzen** (tmp + ``os.replace``): Leser sehen nie eine
      halb geschriebene Datei — auch nicht der Container, der kein fcntl
      braucht (dort schreibt genau ein Prozess): er nutzt dieselbe
      Funktion, der Lock ist dort schlicht konkurrenzlos.
    """
    import fcntl
    import os
    import tempfile

    root = Path(run_root)
    root.mkdir(parents=True, exist_ok=True)
    ziel = root / "manifest.json"
    schloss = root / ".manifest.lock"
    with open(schloss, "w") as riegel:
        fcntl.flock(riegel, fcntl.LOCK_EX)
        stand = {}
        if ziel.exists():
            try:
                stand = json.loads(ziel.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                stand = {}          # halbe Altlast — Felder kommen gleich neu
        stand.update(felder)
        fd, tmp = tempfile.mkstemp(dir=root, prefix=".manifest-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(stand, f, indent=2, ensure_ascii=False)
            os.replace(tmp, ziel)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return stand
