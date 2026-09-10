"""Aufgaben — eine schlanke Liste je Projekt (kein Kanban)."""

from datetime import date

from .audit import audit_schreiben

STATUS = ("offen", "laufend", "erledigt")
QUELLEN = ("manuell", "ki", "bcf")
_SPALTEN = ("id", "projekt_id", "abschnitt_id", "titel", "beschreibung", "status", "faellig_am",
            "erledigt_am", "quelle", "quelle_ref", "angelegt_am", "aktualisiert_am")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.aufgaben"
_AENDERBAR = ("abschnitt_id", "titel", "beschreibung", "status", "faellig_am", "erledigt_am")


class AufgabeAbgelehnt(ValueError):
    """Router: 422."""


class AufgabeUnbekannt(KeyError):
    """Router: 404."""


def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def liste(conn, projekt_id: int, *, mit_erledigten: bool = True) -> list[dict]:
    wo = "" if mit_erledigten else " AND status <> 'erledigt'"
    return [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE projekt_id = %s{wo}"
        " ORDER BY (status = 'erledigt'), faellig_am NULLS LAST, id", (projekt_id,))]


def offen_je_projekt(conn) -> dict[int, dict]:
    ergebnis: dict[int, dict] = {}
    for pid, offen, ueberfaellig in conn.execute(
            "SELECT projekt_id, count(*), count(*) FILTER (WHERE faellig_am < CURRENT_DATE)"
            " FROM projekt.aufgaben WHERE status <> 'erledigt' GROUP BY projekt_id"):
        ergebnis[pid] = {"offen": offen, "ueberfaellig": ueberfaellig}
    return ergebnis


def faellige(conn, tage: int) -> list[dict]:
    return [dict(zip(("projekt_id", "projekt", "id", "titel", "faellig_am", "status"), r)) for r in conn.execute(
        "SELECT a.projekt_id, p.name, a.id, a.titel, a.faellig_am, a.status FROM projekt.aufgaben a"
        " JOIN projekt.projekte p ON p.id = a.projekt_id"
        " WHERE a.status <> 'erledigt' AND a.faellig_am IS NOT NULL"
        " AND a.faellig_am <= CURRENT_DATE + %s ORDER BY a.faellig_am, a.id", (tage,))]


def _pruefen(felder: dict) -> dict:
    sauber = {k: v for k, v in felder.items() if k in _AENDERBAR}
    fremd = set(felder) - set(sauber)
    if fremd:
        raise AufgabeAbgelehnt(f"felder nicht aenderbar: {', '.join(sorted(fremd))}")
    if "titel" in sauber and not str(sauber["titel"] or "").strip():
        raise AufgabeAbgelehnt("titel darf nicht leer sein")
    if "status" in sauber and sauber["status"] not in STATUS:
        raise AufgabeAbgelehnt(f"status muss einer von {STATUS} sein")
    # Konsistenz status <-> erledigt_am (CHECK in der DB) hier vorab herstellen
    if sauber.get("status") == "erledigt" and not sauber.get("erledigt_am"):
        sauber["erledigt_am"] = date.today()
    if "status" in sauber and sauber["status"] != "erledigt":
        sauber["erledigt_am"] = None
    return sauber


def anlegen(conn, projekt_id: int, *, titel: str, akteur: str, beschreibung: str = "",
            faellig_am: date | None = None, abschnitt_id: int | None = None,
            quelle: str = "manuell", quelle_ref: str = "") -> dict:
    if not titel.strip():
        raise AufgabeAbgelehnt("titel darf nicht leer sein")
    if quelle not in QUELLEN:
        raise AufgabeAbgelehnt(f"quelle muss eine von {QUELLEN} sein")
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            "INSERT INTO projekt.aufgaben (projekt_id, abschnitt_id, titel, beschreibung, faellig_am, quelle, quelle_ref)"
            f" VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {', '.join(_SPALTEN)}",
            (projekt_id, abschnitt_id, titel.strip(), beschreibung or "", faellig_am, quelle, quelle_ref or "")
        ).fetchone()
        neu = _zeile(row)
        audit_schreiben(conn, akteur, "aufgabe_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu["id"], "quelle": quelle})
    return neu


def aendern(conn, projekt_id: int, aufgabe_id: int, felder: dict, *, akteur: str) -> dict:
    sauber = _pruefen(felder)
    if not sauber:
        raise AufgabeAbgelehnt("keine aenderbaren felder")
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            f"UPDATE projekt.aufgaben SET {', '.join(f'{k} = %s' for k in sauber)}"
            f" WHERE id = %s AND projekt_id = %s RETURNING {', '.join(_SPALTEN)}",
            [*sauber.values(), aufgabe_id, projekt_id]).fetchone()
        if row is None:
            raise AufgabeUnbekannt(aufgabe_id)
        audit_schreiben(conn, akteur, "aufgabe_aendern", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": aufgabe_id, "felder": sauber})
    return _zeile(row)


def loeschen(conn, projekt_id: int, aufgabe_id: int, *, akteur: str) -> None:
    conn.rollback()
    with conn.transaction():
        cur = conn.execute("DELETE FROM projekt.aufgaben WHERE id = %s AND projekt_id = %s",
                           (aufgabe_id, projekt_id))
        if cur.rowcount == 0:
            raise AufgabeUnbekannt(aufgabe_id)
        audit_schreiben(conn, akteur, "aufgabe_loeschen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": aufgabe_id})
