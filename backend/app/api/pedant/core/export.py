"""Steuerberater-Export (FAHRPLAN Kap. 9, Pipeline Steuerberater-Export +
Kap. 13 Phase sechs): Pruefliste vor dem Export, Buchungsstapel-Daten und das
Buendel der Belegbilder. Die EXTF-Serialisierung selbst lebt in core/datev.py.

Empfohlener Rhythmus laut Fahrplan: monatlich, mindestens quartalsweise —
damit Fehler frueh auffallen, nicht erst am Jahresende.
"""

import io
import zipfile
from datetime import date

from .ablage import datei_oeffnen


def pruefliste(conn, *, von: date, bis: date) -> dict:
    """Die kurze Pruefung vor dem Export: Was ist noch offen? Der Export wird
    nicht blockiert (der Steuerberater darf auch Zwischenstaende sehen), aber
    jeder Punkt ist sichtbar."""
    befunde = []
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM belege"
                    " WHERE status IN ('erfasst', 'erkannt', 'geprueft')")
        (offene_belege,) = cur.fetchone()
        if offene_belege:
            befunde.append(f"{offene_belege} Beleg(e) noch nicht gebucht")
        cur.execute("SELECT count(*) FROM bankbewegungen"
                    " WHERE status = 'unabgeglichen'")
        (offene_bank,) = cur.fetchone()
        if offene_bank:
            befunde.append(f"{offene_bank} Bankbewegung(en) unabgeglichen")
        cur.execute("SELECT count(*) FROM rechnungen WHERE status = 'entwurf'")
        (entwuerfe,) = cur.fetchone()
        if entwuerfe:
            befunde.append(f"{entwuerfe} Rechnungsentwurf/-entwuerfe offen")
        cur.execute("SELECT count(*) FROM buchungssaetze"
                    " WHERE buchungsdatum BETWEEN %s AND %s", (von, bis))
        (anzahl,) = cur.fetchone()
    return {"von": von, "bis": bis, "anzahl_buchungen": anzahl,
            "befunde": befunde, "sauber": not befunde}


def buchungen_im_zeitraum(conn, *, von: date, bis: date) -> list:
    """Journalzeilen fuer den Stapel, in Nummernfolge (lueckenlos pruefbar)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT lfd_nr, buchungsdatum, belegdatum, sollkonto, habenkonto,"
            "       betrag_cent, steuerschluessel, buchungstext, belegreferenz,"
            "       stornoreferenz"
            "  FROM buchungssaetze WHERE buchungsdatum BETWEEN %s AND %s"
            " ORDER BY lfd_nr", (von, bis))
        spalten = [beschreibung.name for beschreibung in cur.description]
        return [dict(zip(spalten, zeile)) for zeile in cur.fetchall()]


def beleg_buendel(conn, *, von: date, bis: date) -> bytes:
    """ZIP der Original-Belegdateien des Zeitraums (nur gebuchte), Dateiname
    je Beleg '<belegnummer>_<originalname>' — der Steuerberater findet jede
    Datei ueber Belegfeld 1 des Stapels (FAHRPLAN Kap. 9)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT belegnummer, original_name, ablage_pfad FROM belege"
            " WHERE status = 'gebucht' AND belegdatum BETWEEN %s AND %s"
            " ORDER BY belegnummer", (von, bis))
        zeilen = cur.fetchall()

    puffer = io.BytesIO()
    fehlend = []
    with zipfile.ZipFile(puffer, "w", zipfile.ZIP_DEFLATED) as archiv:
        for belegnummer, original_name, ablage_pfad in zeilen:
            try:
                pfad = datei_oeffnen(ablage_pfad)
            except FileNotFoundError:
                fehlend.append(belegnummer)
                continue
            sicher = "".join(zeichen if zeichen.isalnum() or zeichen in "._-"
                             else "_" for zeichen in original_name)
            archiv.writestr(f"{belegnummer}_{sicher}", pfad.read_bytes())
        if fehlend:
            archiv.writestr("FEHLENDE_DATEIEN.txt",
                            "Nicht in der Ablage gefunden:\n"
                            + "\n".join(fehlend) + "\n")
    return puffer.getvalue()
