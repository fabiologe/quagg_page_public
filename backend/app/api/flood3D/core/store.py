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


def read_manifest(paths: RunPaths) -> dict | None:
    if paths.manifest.exists():
        with open(paths.manifest, encoding="utf-8") as f:
            return json.load(f)
    return None
