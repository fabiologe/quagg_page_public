"""Schreib- und Lesepfad des Journals — das Herzstueck von Phase 1.

Eine Buchung entsteht in EINER Transaktion:
  1. journal_kopf FOR UPDATE lesen — serialisiert alle Schreiber, dadurch ist
     die laufende Nummer lueckenlos (keine Sequence, Sequences liessen bei
     Rollbacks Luecken).
  2. lfd_nr = letzte + 1, hash_prev = hash_letzter, Hash in Python rechnen.
  3. INSERT (der DB-Trigger prueft die Kontinuitaet nochmal), Kopf fortschreiben,
     Audit-Zeile, COMMIT.
Abgelehnte Versuche schreiben ihre Audit-Zeile in einer eigenen Transaktion —
der Fachteil wird zurueckgerollt, die Spur bleibt (FAHRPLAN Kap. 4, Punkt 6).

Korrektur gibt es nur als Gegenbuchung (storno_anlegen): Soll und Haben
getauscht, gleicher Betrag, Verweis auf das Original. Nie ein Edit.
"""

from datetime import date

from . import hashkette
from .audit import audit_schreiben


class BuchungAbgelehnt(ValueError):
    """Fachliche Ablehnung — der Router uebersetzt sie in HTTP 422."""


def _validiere(felder: dict) -> None:
    betrag = felder["betrag_cent"]
    if isinstance(betrag, bool) or not isinstance(betrag, int):
        raise BuchungAbgelehnt("betrag_cent muss eine ganze Zahl in Cent sein")
    if betrag <= 0:
        raise BuchungAbgelehnt("betrag_cent muss groesser als 0 sein")
    if felder["sollkonto"] == felder["habenkonto"]:
        raise BuchungAbgelehnt("sollkonto und habenkonto muessen verschieden sein")
    if not str(felder["buchungstext"]).strip():
        raise BuchungAbgelehnt("buchungstext darf nicht leer sein")
    for name in ("buchungsdatum", "belegdatum"):
        if not isinstance(felder[name], date):
            raise BuchungAbgelehnt(f"{name} muss ein Datum sein")


def _konto_pruefen(cur, kontonr: str, rolle: str) -> None:
    cur.execute("SELECT aktiv FROM konten WHERE kontonr = %s", (kontonr,))
    zeile = cur.fetchone()
    if zeile is None:
        raise BuchungAbgelehnt(f"{rolle} {kontonr} ist kein bekanntes Konto")
    if not zeile[0]:
        raise BuchungAbgelehnt(f"{rolle} {kontonr} ist deaktiviert")


def _abgelehnt(conn, akteur: str, aktion: str, nutzlast: dict, grund: str):
    """Audit-Spur fuer den abgelehnten Versuch in eigener Transaktion."""
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, aktion, erfolg=False,
                        nutzlast={**nutzlast, "grund": grund})
    raise BuchungAbgelehnt(grund)


def buchung_anlegen(
    conn,
    *,
    buchungsdatum: date,
    belegdatum: date,
    sollkonto: str,
    habenkonto: str,
    betrag_cent: int,
    buchungstext: str,
    steuerschluessel: str = "",
    belegreferenz: str = "",
    stornoreferenz: int | None = None,
    akteur: str,
    aktion: str = "buchung_anlegen",
) -> dict:
    nutzlast = {
        "buchungsdatum": buchungsdatum, "belegdatum": belegdatum,
        "sollkonto": sollkonto, "habenkonto": habenkonto,
        "betrag_cent": betrag_cent, "steuerschluessel": steuerschluessel,
        "buchungstext": buchungstext, "belegreferenz": belegreferenz,
        "stornoreferenz": stornoreferenz,
    }
    try:
        _validiere(nutzlast)
    except BuchungAbgelehnt as fehler:
        _abgelehnt(conn, akteur, aktion, nutzlast, str(fehler))

    # Vertrag: die Verbindung gehoert waehrend des Aufrufs dem Journal. Eine
    # zuvor implizit geoeffnete (Lese-)Transaktion wird beendet, damit der
    # Buchungsblock die AEUSSERSTE Transaktion ist — sonst legte
    # conn.transaction() nur einen Savepoint an, die Buchung bliebe uncommittet
    # und ein spaeterer Rollback des Aufrufers wuerde sie still vernichten.
    conn.rollback()
    try:
        with conn.transaction():
            with conn.cursor() as cur:
                _konto_pruefen(cur, sollkonto, "sollkonto")
                _konto_pruefen(cur, habenkonto, "habenkonto")
                cur.execute(
                    "SELECT lfd_nr_letzte, hash_letzter FROM journal_kopf"
                    " WHERE id = 1 FOR UPDATE"
                )
                letzte, hash_letzter = cur.fetchone()
                lfd_nr = letzte + 1
                hash_prev = hash_letzter.strip()
                zeilen_hash = hashkette.zeilen_hash(
                    lfd_nr=lfd_nr, buchungsdatum=buchungsdatum,
                    belegdatum=belegdatum, sollkonto=sollkonto,
                    habenkonto=habenkonto, betrag_cent=betrag_cent,
                    steuerschluessel=steuerschluessel,
                    buchungstext=buchungstext, belegreferenz=belegreferenz,
                    stornoreferenz=stornoreferenz, hash_prev=hash_prev,
                )
                cur.execute(
                    "INSERT INTO buchungssaetze"
                    " (lfd_nr, buchungsdatum, belegdatum, sollkonto, habenkonto,"
                    "  betrag_cent, steuerschluessel, buchungstext, belegreferenz,"
                    "  stornoreferenz, hash, hash_prev)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (lfd_nr, buchungsdatum, belegdatum, sollkonto, habenkonto,
                     betrag_cent, steuerschluessel, buchungstext, belegreferenz,
                     stornoreferenz, zeilen_hash, hash_prev),
                )
                cur.execute(
                    "UPDATE journal_kopf SET lfd_nr_letzte = %s, hash_letzter = %s"
                    " WHERE id = 1",
                    (lfd_nr, zeilen_hash),
                )
            audit_schreiben(conn, akteur, aktion, erfolg=True,
                            nutzlast={**nutzlast, "lfd_nr": lfd_nr})
    except BuchungAbgelehnt as fehler:
        # Ablehnung aus der Transaktion (z. B. unbekanntes Konto): der Fachteil
        # ist zurueckgerollt, die Audit-Spur kommt aus _abgelehnt.
        _abgelehnt(conn, akteur, aktion, nutzlast, str(fehler))
    return {"lfd_nr": lfd_nr, "hash": zeilen_hash}


def storno_anlegen(conn, *, nr_original: int, grund: str, akteur: str) -> dict:
    nutzlast = {"nr_original": nr_original, "grund": grund}
    if not str(grund).strip():
        _abgelehnt(conn, akteur, "storno_anlegen", nutzlast,
                   "storno braucht einen grund")
    with conn.cursor() as cur:
        cur.execute(
            "SELECT buchungsdatum, belegdatum, sollkonto, habenkonto,"
            "       betrag_cent, steuerschluessel, belegreferenz, stornoreferenz"
            "  FROM buchungssaetze WHERE lfd_nr = %s",
            (nr_original,),
        )
        original = cur.fetchone()
        if original is None:
            _abgelehnt(conn, akteur, "storno_anlegen", nutzlast,
                       f"buchung {nr_original} existiert nicht")
        if original[7] is not None:
            _abgelehnt(conn, akteur, "storno_anlegen", nutzlast,
                       f"buchung {nr_original} ist selbst ein storno")
        cur.execute(
            "SELECT lfd_nr FROM buchungssaetze WHERE stornoreferenz = %s",
            (nr_original,),
        )
        vorhanden = cur.fetchone()
        if vorhanden is not None:
            _abgelehnt(conn, akteur, "storno_anlegen", nutzlast,
                       f"buchung {nr_original} wurde bereits storniert"
                       f" (nr {vorhanden[0]})")
    (bdat, beldat, soll, haben, cent, steuer, belegref, _) = original
    return buchung_anlegen(
        conn,
        buchungsdatum=date.today(), belegdatum=beldat,
        sollkonto=haben, habenkonto=soll,       # getauscht — die Gegenbuchung
        betrag_cent=cent, steuerschluessel=steuer,
        buchungstext=f"Storno zu Nr. {nr_original}: {grund}",
        belegreferenz=belegref, stornoreferenz=nr_original,
        akteur=akteur, aktion="storno_anlegen",
    )


def letzte_buchungen(conn, limit: int = 50) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT lfd_nr, buchungsdatum, belegdatum, sollkonto, habenkonto,"
            "       betrag_cent, steuerschluessel, buchungstext, belegreferenz,"
            "       stornoreferenz, erfasst_am"
            "  FROM buchungssaetze ORDER BY lfd_nr DESC LIMIT %s",
            (limit,),
        )
        spalten = [beschreibung.name for beschreibung in cur.description]
        return [dict(zip(spalten, zeile)) for zeile in cur]


def status(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT lfd_nr_letzte FROM journal_kopf WHERE id = 1")
        (lfd_nr_letzte,) = cur.fetchone()
        cur.execute("SELECT count(*) FROM buchungssaetze")
        (anzahl,) = cur.fetchone()
        cur.execute("SELECT count(*) FROM konten WHERE aktiv")
        (konten,) = cur.fetchone()
    return {"lfd_nr_letzte": lfd_nr_letzte, "anzahl_buchungen": anzahl,
            "anzahl_konten": konten}
