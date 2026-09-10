"""Stammdaten-Snapshot im Projektordner: <Projekt>/_akte/akte.yaml.

Schreibrichtung ausschliesslich DB -> Datei (Leitentscheidung 3). Die Datei
ist fuer Menschen und fuer die KI lesbar und ueberlebt einen DB-Verlust;
zurueckgelesen wird sie nie automatisch.
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

from .ordner import AKTE, Ordner

DATEINAME = "akte.yaml"


def pfad(o: Ordner) -> Path:
    return o.pfad / AKTE / DATEINAME


def schreiben(o: Ordner, daten: dict) -> Path:
    """Atomar: Temp-Datei im selben Ordner, dann os.replace."""
    ziel = pfad(o)
    ziel.parent.mkdir(exist_ok=True)
    inhalt = dict(daten)
    inhalt["stand"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    text = yaml.safe_dump(inhalt, allow_unicode=True, sort_keys=False, default_flow_style=False)
    temp = ziel.parent / f".tmp-{uuid.uuid4().hex}"
    try:
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return ziel


def lesen(o: Ordner) -> dict | None:
    datei = pfad(o)
    if not datei.is_file():
        return None
    return yaml.safe_load(datei.read_text(encoding="utf-8")) or {}
