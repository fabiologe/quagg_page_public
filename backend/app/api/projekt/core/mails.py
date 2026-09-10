"""Lesender Zugriff auf die E-Mail-Tabelle der uebrigen App (SQLite, SQLModel).

Bewusst ueber sqlite3 aus der Standardbibliothek statt ueber app.db.database:
der MCP-Server laeuft in einem eigenen venv ohne sqlmodel, und Lesen im
mode=ro kann die Datei nicht anfassen. Tabelle: email_events, project_id = Projektnummer.
"""

import sqlite3
from pathlib import Path

from .env import env

_STANDARD_DB = Path(__file__).resolve().parents[4] / "quagg.db"   # backend/quagg.db


def db_pfad() -> Path:
    return Path(env("QUAGG_SQLITE_PFAD", str(_STANDARD_DB)))


def betreffzeilen(projekt_id: int, limit: int = 20) -> list[dict]:
    """Juengste Mails eines Projekts: Datum, Absender, Betreff — keine Inhalte."""
    pfad = db_pfad()
    if not pfad.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []
    try:
        zeilen = conn.execute(
            "SELECT received_at, sender, subject FROM email_events"
            " WHERE project_id = ? ORDER BY received_at DESC LIMIT ?", (projekt_id, limit)).fetchall()
    except sqlite3.OperationalError:
        return []
    finally:
        conn.close()
    return [{"empfangen_am": str(e or "")[:16], "absender": s or "", "betreff": b or ""} for e, s, b in zeilen]


def kalender_mails(ab_id: int = 0, limit: int = 500) -> list[dict]:
    """Eingegangene Mails mit Kalenderteil (ical_json vom Worker), aelteste zuerst — fuer
    kalender.antworten_verarbeiten. Nur ids > ab_id, damit nie alles neu gelesen wird."""
    pfad = db_pfad()
    if not pfad.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
        zeilen = conn.execute(
            "SELECT id, message_id, sender, received_at, ical_json FROM email_events"
            " WHERE ical_json IS NOT NULL AND folder = 'inbox' AND id > ? ORDER BY id LIMIT ?",
            (ab_id, limit)).fetchall()
        conn.close()
    except sqlite3.OperationalError:
        return []
    import json
    ergebnis = []
    for i, mid, s, e, roh in zeilen:
        try:
            ical = json.loads(roh) if isinstance(roh, str) else roh
        except (TypeError, ValueError):
            continue
        if isinstance(ical, dict):
            ergebnis.append({"id": i, "message_id": mid or "", "absender": s or "",
                             "empfangen_am": e or "", "ical": ical})
    return ergebnis


def inhalte(projekt_id: int, limit: int = 500) -> list[dict]:
    """Fuer den Volltextindex: Betreff + Textkoerper (gedeckelt)."""
    pfad = db_pfad()
    if not pfad.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
        zeilen = conn.execute(
            "SELECT id, received_at, sender, subject, body_text FROM email_events"
            " WHERE project_id = ? ORDER BY received_at DESC LIMIT ?", (projekt_id, limit)).fetchall()
        conn.close()
    except sqlite3.OperationalError:
        return []
    return [{"id": i, "empfangen_am": str(e or "")[:16], "absender": s or "", "betreff": b or "",
             "text": (t or "")[:100_000]} for i, e, s, b, t in zeilen]
