"""Hash-Kette ueber die Buchungszeilen (FAHRPLAN Kap. 4, Punkt 3).

Jede Zeile traegt sha256(kanonische Serialisierung ihrer Felder + hash_prev).
Wird irgendwo nachtraeglich manipuliert, bricht die Kette erkennbar —
kette_pruefen() rechnet jede Zeile nach und vergleicht am Ende mit dem Kopf.

Die Serialisierung ist Pipe-getrennt mit fester Feldreihenfolge statt JSON:
kein Spielraum durch Key-Reihenfolge oder Whitespace. Pipes und Backslashes in
Freitextfeldern werden escaped, damit die Abbildung injektiv bleibt (zwei
verschiedene Buchungen koennen nie denselben kanonischen Text ergeben).
"""

import hashlib
from dataclasses import dataclass
from datetime import date

GENESIS_HASH = "0" * 64


def _escape(wert: str) -> str:
    return wert.replace("\\", "\\\\").replace("|", "\\|")


def kanonisieren(
    lfd_nr: int,
    buchungsdatum: date,
    belegdatum: date,
    sollkonto: str,
    habenkonto: str,
    betrag_cent: int,
    steuerschluessel: str,
    buchungstext: str,
    belegreferenz: str,
    stornoreferenz: int | None,
    hash_prev: str,
) -> str:
    felder = [
        str(lfd_nr),
        buchungsdatum.isoformat(),
        belegdatum.isoformat(),
        _escape(sollkonto),
        _escape(habenkonto),
        str(betrag_cent),
        _escape(steuerschluessel),
        _escape(buchungstext),
        _escape(belegreferenz),
        "" if stornoreferenz is None else str(stornoreferenz),
        hash_prev,
    ]
    return "|".join(felder)


def zeilen_hash(**felder) -> str:
    return hashlib.sha256(kanonisieren(**felder).encode("utf-8")).hexdigest()


@dataclass
class KettenBericht:
    ok: bool
    zeilen_geprueft: int
    bruch_bei_nr: int | None = None
    grund: str = ""


def kette_pruefen(conn) -> KettenBericht:
    """Liest alle Buchungen in Nummernfolge, rechnet jeden Hash nach und
    prueft die Verkettung samt Abgleich mit journal_kopf. Nur SELECTs."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT lfd_nr, buchungsdatum, belegdatum, sollkonto, habenkonto,"
            "       betrag_cent, steuerschluessel, buchungstext, belegreferenz,"
            "       stornoreferenz, hash, hash_prev"
            "  FROM buchungssaetze ORDER BY lfd_nr"
        )
        erwartet_nr = 1
        erwartet_prev = GENESIS_HASH
        geprueft = 0
        for zeile in cur:
            (nr, bdat, beldat, soll, haben, cent, steuer, text, belegref,
             stornoref, gespeichert, prev) = zeile
            if nr != erwartet_nr:
                return KettenBericht(False, geprueft, nr,
                                     f"luecke: nr {erwartet_nr} erwartet")
            if prev != erwartet_prev:
                return KettenBericht(False, geprueft, nr,
                                     "hash_prev schliesst nicht an")
            errechnet = zeilen_hash(
                lfd_nr=nr, buchungsdatum=bdat, belegdatum=beldat,
                sollkonto=soll, habenkonto=haben, betrag_cent=cent,
                steuerschluessel=steuer, buchungstext=text,
                belegreferenz=belegref, stornoreferenz=stornoref,
                hash_prev=prev,
            )
            if errechnet != gespeichert.strip():
                return KettenBericht(False, geprueft, nr,
                                     "zeileninhalt passt nicht zum hash")
            erwartet_prev = gespeichert.strip()
            erwartet_nr = nr + 1
            geprueft += 1

        cur.execute("SELECT lfd_nr_letzte, hash_letzter FROM journal_kopf WHERE id = 1")
        kopf_nr, kopf_hash = cur.fetchone()
        if kopf_nr != erwartet_nr - 1 or kopf_hash.strip() != erwartet_prev:
            return KettenBericht(False, geprueft, kopf_nr,
                                 "journal_kopf passt nicht zum kettenende")
    return KettenBericht(True, geprueft)
