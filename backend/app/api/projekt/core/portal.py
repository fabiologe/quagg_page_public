"""Kundenportal: Freigaben je Projekt und die geldfreie Sicht fuer CLIENT-Nutzer."""

import sqlite3
from datetime import date

from . import ordner, projekte
from .audit import audit_schreiben
from .mails import db_pfad

PHASEN_TITEL = {"00_Angebote": "Angebot", "01_Laufend": "in Bearbeitung", "02_Pausiert": "pausiert",
                "03_Abgeschlossen": "abgeschlossen", "04_Abgelehnt": "nicht beauftragt", "05_Bezahlt": "abgeschlossen"}


class PortalAbgelehnt(ValueError):
    """Router: 422."""


def portal_nutzer() -> list[dict]:
    """Aktive CLIENT-Nutzer der App (SQLite, nur lesend) — Kandidaten fuer Freigaben."""
    pfad = db_pfad()
    if not pfad.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
        # EXTERN = neue Rolle (2026-08), CLIENT = Altwert bis zur Startup-Migration
        zeilen = conn.execute("SELECT username FROM user WHERE role IN ('EXTERN', 'CLIENT') AND is_active = 1 ORDER BY username").fetchall()
        conn.close()
    except sqlite3.OperationalError:
        return []
    return [{"username": z[0]} for z in zeilen]


def freigaben(conn, projekt_id: int) -> list[dict]:
    return [dict(zip(("id", "username", "von", "angelegt_am"), r)) for r in conn.execute(
        "SELECT id, username, von, angelegt_am FROM projekt.portal_freigaben WHERE projekt_id = %s ORDER BY username",
        (projekt_id,))]


def freigeben(conn, projekt_id: int, username: str, *, akteur: str) -> list[dict]:
    username = (username or "").strip()
    if not username:
        raise PortalAbgelehnt("username darf nicht leer sein")
    if username not in {n["username"] for n in portal_nutzer()}:
        raise PortalAbgelehnt(f"{username!r} ist kein aktiver Portal-Nutzer (Rolle EXTERN)")
    projekte.lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        conn.execute("INSERT INTO projekt.portal_freigaben (projekt_id, username, von) VALUES (%s, %s, %s)"
                     " ON CONFLICT (projekt_id, username) DO NOTHING", (projekt_id, username, akteur))
        audit_schreiben(conn, akteur, "portal_freigeben", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "username": username})
    return freigaben(conn, projekt_id)


def entziehen(conn, projekt_id: int, username: str, *, akteur: str) -> list[dict]:
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM projekt.portal_freigaben WHERE projekt_id = %s AND username = %s",
                     (projekt_id, username))
        audit_schreiben(conn, akteur, "portal_entziehen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "username": username})
    return freigaben(conn, projekt_id)


def _sicht_projekt(a: dict) -> dict:
    """Was der Auftraggeber sieht: Leistungsstand in Prozent, Phasen, Termine — KEINE Cent."""
    heute = date.today()
    return {
        "id": a["id"], "name": a["name"], "phase": a["phase"], "phase_titel": PHASEN_TITEL.get(a["phase"], "—"),
        "fortschritt_prozent": a["fortschritt"]["prozent"],
        "abschnitte": [{"nr": s["nr"], "bezeichnung": s["bezeichnung"], "lph": s["lph"],
                        "fortschritt_prozent": s["fortschritt_prozent"], "status": s["status"],
                        "beauftragt": s["beauftragt"], "anteil": s["honorar_cent"]}
                       for s in a["abschnitte"] if s["status"] != "entfallen"],
        "termine": [{"art": m["art"], "bezeichnung": m["bezeichnung"], "faellig_am": m["faellig_am"],
                     "ueberfaellig": m["faellig_am"] < heute}
                    for m in a["meilensteine"] if not m["erledigt_am"] and m["art"] in ("termin", "abgabe")],
        "beteiligte": [{"rolle": b["rolle"], "name": b["name"]} for b in a["beteiligte"]],
        "stand": str(a["aktualisiert_am"])[:10],
    }


def sicht(conn, username: str) -> list[dict]:
    ids = [r[0] for r in conn.execute(
        "SELECT projekt_id FROM projekt.portal_freigaben WHERE username = %s ORDER BY projekt_id DESC", (username,))]
    ergebnis = []
    for pid in ids:
        try:
            a = projekte.lesen(conn, pid)
        except projekte.ProjektUnbekannt:
            continue
        s = _sicht_projekt(a)
        # Anteile nur als Verhaeltnis (Balkenbreite), keine Betraege nach aussen
        gesamt = sum(x["anteil"] for x in s["abschnitte"]) or 1
        for x in s["abschnitte"]:
            x["anteil"] = round(x["anteil"] / gesamt, 4)
        ergebnis.append(s)
    return ergebnis
