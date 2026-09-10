"""Vorschlaege der KI: anlegen (MCP/Assistent), entscheiden (Mensch im Cockpit).

Uebernehmen fuehrt die fachliche Aktion aus — ueber dieselben Kernfunktionen,
die auch das Cockpit nutzt. Verwerfen laesst nur den Vertrag stehen.
"""

import json
from datetime import date

from psycopg.types.json import Jsonb

from . import abschnitte, aufgaben, projekte, zeit
from .audit import audit_schreiben

ARTEN = ("aufgabe", "notiz", "termin", "fortschritt", "zeitbuchung")
_SPALTEN = ("id", "projekt_id", "art", "nutzlast", "begruendung", "von", "status",
            "angelegt_am", "entschieden_am", "entschieden_von", "ergebnis")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.vorschlaege"


class VorschlagAbgelehnt(ValueError):
    """Router: 422."""


class VorschlagUnbekannt(KeyError):
    """Router: 404."""


def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def liste(conn, projekt_id: int | None = None, status: str | None = "offen") -> list[dict]:
    bedingungen, werte = [], []
    if projekt_id is not None:
        bedingungen.append("projekt_id = %s")
        werte.append(projekt_id)
    if status is not None:
        bedingungen.append("status = %s")
        werte.append(status)
    wo = f" WHERE {' AND '.join(bedingungen)}" if bedingungen else ""
    return [_zeile(r) for r in conn.execute(f"{_SELECT}{wo} ORDER BY id DESC", werte)]


def offen_je_projekt(conn) -> dict[int, int]:
    return dict(conn.execute(
        "SELECT projekt_id, count(*) FROM projekt.vorschlaege WHERE status = 'offen' GROUP BY projekt_id"))


def anlegen(conn, projekt_id: int, *, art: str, nutzlast: dict, begruendung: str,
            von: str = "mcp", akteur: str = "mcp") -> dict:
    if art not in ARTEN:
        raise VorschlagAbgelehnt(f"art muss eine von {ARTEN} sein")
    if not isinstance(nutzlast, dict) or not nutzlast:
        raise VorschlagAbgelehnt("nutzlast muss ein nicht-leeres objekt sein")
    projekte.lesen(conn, projekt_id)  # 404 vorher
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            "INSERT INTO projekt.vorschlaege (projekt_id, art, nutzlast, begruendung, von)"
            f" VALUES (%s, %s, %s, %s, %s) RETURNING {', '.join(_SPALTEN)}",
            (projekt_id, art, Jsonb(json.loads(json.dumps(nutzlast, default=str))),
             begruendung or "", von)).fetchone()
        neu = _zeile(row)
        audit_schreiben(conn, akteur, "vorschlag_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu["id"], "art": art})
    return neu


def _uebernehmen(conn, v: dict, akteur: str) -> str:
    """Fuehrt den Vorschlag aus; gibt eine kurze Ergebnisnotiz zurueck."""
    n = v["nutzlast"]
    pid = v["projekt_id"]
    if v["art"] == "termin":
        akte = projekte.meilenstein_anlegen(
            conn, pid, art=n.get("art", "termin"), bezeichnung=str(n.get("bezeichnung", "")),
            faellig_am=date.fromisoformat(str(n["faellig_am"])), notiz=str(n.get("notiz", "")), akteur=akteur)
        return f"meilenstein {akte['meilensteine'][-1]['id']}"
    if v["art"] == "fortschritt":
        felder = {"fortschritt_prozent": int(n["fortschritt_prozent"])}
        if n.get("status"):
            felder["status"] = str(n["status"])
        abschnitte.aendern(conn, pid, int(n["abschnitt_id"]), felder, akteur=akteur,
                           grund="KI-Vorschlag übernommen")
        return f"abschnitt {n['abschnitt_id']} auf {felder['fortschritt_prozent']} %"
    if v["art"] == "notiz":
        alt = projekte.lesen(conn, pid)["notiz"]
        text = str(n.get("text", "")).strip()
        neu = f"{alt}\n{text}".strip() if alt else text
        projekte.aendern(conn, pid, {"notiz": neu}, akteur=akteur)
        return "notiz ergänzt"
    if v["art"] == "aufgabe":
        neu = aufgaben.anlegen(conn, pid, titel=str(n.get("titel", "")), beschreibung=str(n.get("beschreibung", "")),
                               faellig_am=date.fromisoformat(str(n["faellig_am"])) if n.get("faellig_am") else None,
                               abschnitt_id=n.get("abschnitt_id"), quelle="ki", quelle_ref=f"vorschlag {v['id']}",
                               akteur=akteur)
        return f"aufgabe {neu['id']}"
    if v["art"] == "zeitbuchung":
        neu = zeit.buchen(conn, pid, datum=date.fromisoformat(str(n.get("datum") or date.today())),
                          dauer_min=int(n["dauer_min"]), taetigkeit=str(n.get("taetigkeit", "")),
                          abschnitt_id=n.get("abschnitt_id"), abrechenbar=bool(n.get("abrechenbar", True)),
                          akteur=akteur)
        return f"zeitbuchung {neu['id']}"
    raise VorschlagAbgelehnt(f"unbekannte vorschlagsart {v['art']!r}")


def entscheiden(conn, projekt_id: int, vorschlag_id: int, *, entscheidung: str, akteur: str) -> dict:
    if entscheidung not in ("uebernehmen", "verwerfen"):
        raise VorschlagAbgelehnt("entscheidung muss 'uebernehmen' oder 'verwerfen' sein")
    conn.rollback()
    row = conn.execute(f"{_SELECT} WHERE id = %s AND projekt_id = %s", (vorschlag_id, projekt_id)).fetchone()
    if row is None:
        raise VorschlagUnbekannt(vorschlag_id)
    v = _zeile(row)
    if v["status"] != "offen":
        raise VorschlagAbgelehnt(f"vorschlag ist bereits {v['status']}")
    ergebnis = ""
    if entscheidung == "uebernehmen":
        try:
            ergebnis = _uebernehmen(conn, v, akteur)
        except (KeyError, ValueError, TypeError) as fehler:
            if isinstance(fehler, VorschlagAbgelehnt):
                raise
            if isinstance(fehler, (aufgaben.AufgabeAbgelehnt, zeit.ZeitAbgelehnt)):
                raise VorschlagAbgelehnt(str(fehler))
            raise VorschlagAbgelehnt(f"nutzlast unvollständig oder ungültig: {fehler}")
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            "UPDATE projekt.vorschlaege SET status = %s, entschieden_am = now(), entschieden_von = %s,"
            f" ergebnis = %s WHERE id = %s AND status = 'offen' RETURNING {', '.join(_SPALTEN)}",
            ("uebernommen" if entscheidung == "uebernehmen" else "verworfen", akteur, ergebnis,
             vorschlag_id)).fetchone()
        if row is None:
            raise VorschlagAbgelehnt("vorschlag wurde inzwischen entschieden")
        audit_schreiben(conn, akteur, f"vorschlag_{entscheidung}", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": vorschlag_id, "ergebnis": ergebnis})
    return _zeile(row)
