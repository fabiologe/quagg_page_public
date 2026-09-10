"""Abschnitte (LPH oder frei), Honorarhistorie, Leistungsbild-Vorlagen."""

from . import fortschritt
from .audit import audit_schreiben
from .leistungsphasen import LPH

ARTEN = ("grund", "besondere", "nachtrag", "nebenkosten")
STATUS = ("offen", "laufend", "fertig", "abgenommen", "entfallen")
_SPALTEN = ("id", "projekt_id", "nr", "bezeichnung", "lph", "art", "honorar_cent",
            "beauftragt", "fortschritt_prozent", "status", "angelegt_am", "aktualisiert_am")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.abschnitte"
_AENDERBAR = ("bezeichnung", "lph", "art", "honorar_cent", "beauftragt", "fortschritt_prozent", "status")


class AbschnittAbgelehnt(ValueError):
    """Router: 422."""


class AbschnittUnbekannt(KeyError):
    """Router: 404."""


def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def liste(conn, projekt_id: int) -> list[dict]:
    return [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE projekt_id = %s ORDER BY nr", (projekt_id,))]


def historie(conn, projekt_id: int) -> list[dict]:
    return [dict(zip(("id", "abschnitt_id", "abschnitt", "alt_cent", "neu_cent", "grund", "akteur", "am"), r))
            for r in conn.execute(
                "SELECT h.id, h.abschnitt_id, a.bezeichnung, h.alt_cent, h.neu_cent, h.grund, h.akteur, h.am"
                " FROM projekt.honorar_aenderungen h JOIN projekt.abschnitte a ON a.id = h.abschnitt_id"
                " WHERE a.projekt_id = %s ORDER BY h.id DESC", (projekt_id,))]


def kennzahlen_je_projekt(conn) -> dict[int, dict]:
    """Fuer das Portfolio: Leistung je Projekt in EINER Abfrage."""
    zeilen = conn.execute(
        "SELECT projekt_id, nr, honorar_cent, beauftragt, fortschritt_prozent, status"
        " FROM projekt.abschnitte").fetchall()
    gruppen: dict[int, list[dict]] = {}
    for pid, nr, honorar, beauftragt, prozent, status in zeilen:
        gruppen.setdefault(pid, []).append({
            "nr": nr, "honorar_cent": honorar, "beauftragt": beauftragt,
            "fortschritt_prozent": prozent, "status": status})
    return {pid: fortschritt.leistung(a) for pid, a in gruppen.items()}


def _pruefen(felder: dict) -> dict:
    sauber = {}
    for k, v in felder.items():
        if k not in _AENDERBAR:
            raise AbschnittAbgelehnt(f"feld {k!r} ist nicht aenderbar")
        sauber[k] = v
    if "bezeichnung" in sauber and not str(sauber["bezeichnung"] or "").strip():
        raise AbschnittAbgelehnt("bezeichnung darf nicht leer sein")
    if sauber.get("lph") is not None and int(sauber["lph"]) not in LPH:
        raise AbschnittAbgelehnt("lph muss zwischen 1 und 9 liegen")
    if "art" in sauber and sauber["art"] not in ARTEN:
        raise AbschnittAbgelehnt(f"art muss eine von {ARTEN} sein")
    if "status" in sauber and sauber["status"] not in STATUS:
        raise AbschnittAbgelehnt(f"status muss einer von {STATUS} sein")
    if "honorar_cent" in sauber and int(sauber["honorar_cent"]) < 0:
        raise AbschnittAbgelehnt("honorar_cent darf nicht negativ sein")
    if "fortschritt_prozent" in sauber and not 0 <= int(sauber["fortschritt_prozent"]) <= 100:
        raise AbschnittAbgelehnt("fortschritt_prozent muss zwischen 0 und 100 liegen")
    return sauber


def _naechste_nr(conn, projekt_id: int) -> int:
    return conn.execute("SELECT COALESCE(MAX(nr), 0) + 1 FROM projekt.abschnitte WHERE projekt_id = %s",
                        (projekt_id,)).fetchone()[0]


def anlegen(conn, projekt_id: int, *, bezeichnung: str, akteur: str, lph: int | None = None,
            art: str = "grund", honorar_cent: int = 0, beauftragt: bool = True,
            fortschritt_prozent: int = 0, status: str = "offen") -> dict:
    felder = _pruefen(dict(bezeichnung=bezeichnung, lph=lph, art=art, honorar_cent=honorar_cent,
                           beauftragt=beauftragt, fortschritt_prozent=fortschritt_prozent, status=status))
    conn.rollback()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(45, %s)", (projekt_id,))
        nr = _naechste_nr(conn, projekt_id)
        row = conn.execute(
            "INSERT INTO projekt.abschnitte (projekt_id, nr, bezeichnung, lph, art, honorar_cent,"
            " beauftragt, fortschritt_prozent, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
            f" RETURNING {', '.join(_SPALTEN)}",
            (projekt_id, nr, felder["bezeichnung"].strip(), felder["lph"], felder["art"],
             felder["honorar_cent"], felder["beauftragt"], felder["fortschritt_prozent"],
             felder["status"])).fetchone()
        neu = _zeile(row)
        if neu["honorar_cent"]:
            conn.execute(
                "INSERT INTO projekt.honorar_aenderungen (abschnitt_id, alt_cent, neu_cent, grund, akteur)"
                " VALUES (%s, 0, %s, 'angelegt', %s)", (neu["id"], neu["honorar_cent"], akteur))
        audit_schreiben(conn, akteur, "abschnitt_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu["id"], "nr": nr,
                                  "honorar_cent": neu["honorar_cent"]})
    return neu


def aendern(conn, projekt_id: int, abschnitt_id: int, felder: dict, *, akteur: str,
            grund: str = "") -> dict:
    sauber = _pruefen(felder)
    if not sauber:
        raise AbschnittAbgelehnt("keine aenderbaren felder")
    conn.rollback()
    with conn.transaction():
        alt = conn.execute(f"{_SELECT} WHERE id = %s AND projekt_id = %s FOR UPDATE",
                           (abschnitt_id, projekt_id)).fetchone()
        if alt is None:
            raise AbschnittUnbekannt(abschnitt_id)
        alt = _zeile(alt)
        if "bezeichnung" in sauber:
            sauber["bezeichnung"] = sauber["bezeichnung"].strip()
        row = conn.execute(
            f"UPDATE projekt.abschnitte SET {', '.join(f'{k} = %s' for k in sauber)}"
            f" WHERE id = %s RETURNING {', '.join(_SPALTEN)}",
            [*sauber.values(), abschnitt_id]).fetchone()
        neu = _zeile(row)
        if neu["honorar_cent"] != alt["honorar_cent"]:
            conn.execute(
                "INSERT INTO projekt.honorar_aenderungen (abschnitt_id, alt_cent, neu_cent, grund, akteur)"
                " VALUES (%s, %s, %s, %s, %s)",
                (abschnitt_id, alt["honorar_cent"], neu["honorar_cent"], grund or "", akteur))
        audit_schreiben(conn, akteur, "abschnitt_aendern", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": abschnitt_id, "felder": sauber})
    return neu


def loeschen(conn, projekt_id: int, abschnitt_id: int, *, akteur: str) -> None:
    """Nur fuer Fehlanlagen: sobald eine Honorarhistorie existiert, bleibt der
    Abschnitt (status 'entfallen' statt loeschen)."""
    conn.rollback()
    with conn.transaction():
        anzahl = conn.execute("SELECT count(*) FROM projekt.honorar_aenderungen WHERE abschnitt_id = %s",
                              (abschnitt_id,)).fetchone()[0]
        if anzahl:
            raise AbschnittAbgelehnt("abschnitt hat eine honorarhistorie — auf 'entfallen' setzen statt loeschen")
        cur = conn.execute("DELETE FROM projekt.abschnitte WHERE id = %s AND projekt_id = %s",
                           (abschnitt_id, projekt_id))
        if cur.rowcount == 0:
            raise AbschnittUnbekannt(abschnitt_id)
        audit_schreiben(conn, akteur, "abschnitt_loeschen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": abschnitt_id})


# ── Leistungsbilder ──────────────────────────────────────────────────────────

def leistungsbilder(conn) -> list[dict]:
    zeilen = conn.execute(
        "SELECT paragraf, jahrgang, titel, lph, bezeichnung, prozent FROM projekt.leistungsbilder"
        " ORDER BY paragraf, jahrgang, lph").fetchall()
    bilder: dict[tuple, dict] = {}
    for paragraf, jahrgang, titel, lph, bezeichnung, prozent in zeilen:
        b = bilder.setdefault((paragraf, jahrgang), {
            "paragraf": paragraf, "jahrgang": jahrgang, "titel": titel, "phasen": []})
        b["phasen"].append({"lph": lph, "bezeichnung": bezeichnung, "prozent": prozent})
    return list(bilder.values())


def aus_vorlage(conn, projekt_id: int, *, paragraf: str, honorar_cent: int,
                beauftragt: list[int] | tuple[int, ...], akteur: str, jahrgang: int = 2021) -> list[dict]:
    """Legt aus einem Leistungsbild neun Grund-Abschnitte an. honorar_cent ist das
    VOLLE Honorar (100 %); nicht beauftragte LPH entstehen mit beauftragt=false,
    damit der Balken die Teilbeauftragung zeigt. Nur auf leere Akten anwendbar."""
    if honorar_cent <= 0:
        raise AbschnittAbgelehnt("honorar_cent muss groesser als null sein")
    beauftragt = {int(n) for n in beauftragt}
    if not beauftragt or not beauftragt <= set(LPH):
        raise AbschnittAbgelehnt("beauftragt muss mindestens eine LPH zwischen 1 und 9 enthalten")
    phasen = conn.execute(
        "SELECT lph, bezeichnung, prozent FROM projekt.leistungsbilder"
        " WHERE paragraf = %s AND jahrgang = %s ORDER BY lph", (paragraf, jahrgang)).fetchall()
    if not phasen:
        raise AbschnittAbgelehnt(f"kein leistungsbild § {paragraf} ({jahrgang})")
    betraege = fortschritt.verteile(honorar_cent, [p[2] for p in phasen])
    conn.rollback()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(45, %s)", (projekt_id,))
        if conn.execute("SELECT 1 FROM projekt.abschnitte WHERE projekt_id = %s LIMIT 1",
                        (projekt_id,)).fetchone():
            raise AbschnittAbgelehnt("projekt hat bereits abschnitte — vorlage nur auf leere akte")
        conn.execute("UPDATE projekt.projekte SET leistungsbild = %s WHERE id = %s", (paragraf, projekt_id))
        neue = []
        for (lph, bezeichnung, prozent), betrag in zip(phasen, betraege):
            row = conn.execute(
                "INSERT INTO projekt.abschnitte (projekt_id, nr, bezeichnung, lph, art, honorar_cent, beauftragt)"
                f" VALUES (%s, %s, %s, %s, 'grund', %s, %s) RETURNING {', '.join(_SPALTEN)}",
                (projekt_id, lph, f"LPH {lph} {bezeichnung}", lph, betrag, lph in beauftragt)).fetchone()
            neu = _zeile(row)
            conn.execute(
                "INSERT INTO projekt.honorar_aenderungen (abschnitt_id, alt_cent, neu_cent, grund, akteur)"
                " VALUES (%s, 0, %s, %s, %s)",
                (neu["id"], betrag, f"Vorlage § {paragraf} ({prozent} %)", akteur))
            neue.append(neu)
        audit_schreiben(conn, akteur, "abschnitte_aus_vorlage", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "paragraf": paragraf,
                                  "honorar_cent": honorar_cent, "beauftragt": sorted(beauftragt)})
    return neue
