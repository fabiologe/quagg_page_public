"""
Tolerante Low-Level-Parser für OpenFOAM-postProcessing-Ausgaben.

Die Formate unterscheiden sich zwischen OpenFOAM-Foundation und ESI-Variante
(z. B. forces.dat mit geschachtelten Klammertripeln gegenüber getrennten
force.dat/moment.dat). Deshalb wird hier nicht ein festes Spaltenlayout
angenommen, sondern: erste Zahl der Zeile ist die Zeit, danach entweder
Skalarspalten oder eine Folge von Klammertripeln. Die fachliche Deutung der
Spalten übernimmt readers.py.

Neustartordner (Spez. Stufe 1): unter postProcessing/<name>/ liegt je
(Neu-)Start ein Zeitverzeichnis ("0", "120.5", …). Ein Neustart ab t=120.5
ersetzt alle Daten t >= 120.5 aus früheren Läufen — gleiche Semantik wie
OpenFOAM selbst beim Weiterrechnen.
"""
from __future__ import annotations

import re
from pathlib import Path

_FLOAT = r"[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?"
_TRIPLE_RE = re.compile(rf"\(\s*({_FLOAT})\s+({_FLOAT})\s+({_FLOAT})\s*\)")
_NUM_RE = re.compile(_FLOAT)


def list_start_dirs(fo_dir: Path) -> list[Path]:
    """Zeitverzeichnisse eines functionObjects, nach Startzeit sortiert."""
    dirs = []
    for d in fo_dir.iterdir() if fo_dir.is_dir() else []:
        if not d.is_dir():
            continue
        try:
            dirs.append((float(d.name), d))
        except ValueError:
            continue
    return [d for _, d in sorted(dirs, key=lambda x: x[0])]


def merge_restart_rows(chunks: list[tuple[float, list[tuple]]]) -> list[tuple]:
    """
    chunks: je Startverzeichnis (startzeit, zeilen), Zeilen beginnen mit time.
    Späterer Start gewinnt: aus früheren Chunks fliegt alles ab der Startzeit
    des nächsten Chunks heraus.
    """
    chunks = sorted(chunks, key=lambda c: c[0])
    rows: list[tuple] = []
    for i, (_, data) in enumerate(chunks):
        cutoff = chunks[i + 1][0] if i + 1 < len(chunks) else None
        for row in data:
            if cutoff is not None and row[0] >= cutoff:
                continue
            rows.append(row)
    return rows


def parse_scalar_table(path: Path) -> tuple[list[str], list[tuple]]:
    """
    Tabellendatei mit #-Kopfzeilen und Skalarspalten (surfaceFieldValue,
    volFieldValue, solverInfo, residuals, interfaceHeight-Ableger).

    Rückgabe: (Spaltennamen ohne 'Time', Zeilen als (time, v1, v2, ...)).
    Die letzte #-Zeile vor den Daten gilt als Spaltenkopf, sofern sie zu den
    Datenspalten passt; sonst werden die Spalten c1..cN durchnummeriert.
    """
    header: list[str] = []
    rows: list[tuple] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            header = line.lstrip("#").split()
            continue
        vals = [float(v) for v in _NUM_RE.findall(line)]
        if len(vals) >= 2:
            rows.append(tuple(vals))
    if not rows:
        return [], []
    n_data = len(rows[0]) - 1
    if header and header[0].lower() in ("time", "time(s)", "t") and len(header) - 1 == n_data:
        names = header[1:]
    else:
        names = [f"c{i + 1}" for i in range(n_data)]
    return names, rows


def parse_vector_table(path: Path) -> list[tuple[float, list[tuple[float, float, float]]]]:
    """
    Datei mit Zeit + Klammertripeln, beliebig tief geschachtelt
    (forces.dat der Foundation-Variante, force.dat/moment.dat der ESI-Variante).
    Rückgabe je Zeile: (time, [tripel in Dateireihenfolge]).
    """
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _NUM_RE.match(line)
        if not m:
            continue
        t = float(m.group(0))
        triples = [(float(a), float(b), float(c))
                   for a, b, c in _TRIPLE_RE.findall(line[m.end():])]
        if triples:
            out.append((t, triples))
    return out


def read_scalar_fo(fo_dir: Path, filename: str) -> tuple[list[str], list[tuple]]:
    """Skalartabelle über alle Neustartordner eines functionObjects."""
    chunks, names = [], []
    for d in list_start_dirs(fo_dir):
        f = d / filename
        if not f.exists():
            continue
        n, rows = parse_scalar_table(f)
        if rows:
            names = names or n
            chunks.append((float(d.name), rows))
    return names, merge_restart_rows(chunks)


def read_vector_fo(fo_dir: Path, filename: str) -> list[tuple[float, list[tuple]]]:
    """Vektortabelle über alle Neustartordner eines functionObjects."""
    chunks = []
    for d in list_start_dirs(fo_dir):
        f = d / filename
        if not f.exists():
            continue
        rows = parse_vector_table(f)
        if rows:
            chunks.append((float(d.name), rows))
    return merge_restart_rows(chunks)
