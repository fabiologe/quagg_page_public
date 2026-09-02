"""Kontoabgleich (FAHRPLAN Kap. 9, Pipeline Kontoabgleich): Import mit Dedup,
Zuordnungs-Vorschlaege, Zuordnen mit automatischer Buchung, Loesen per Storno.

Fachliche Leitplanken:
- EINGANG (+) einer offenen Rechnung zuordnen = NEUE Journalbuchung
  1800 an 1200 (Bankbetrag), belegreferenz = Rechnungsnummer; die Rechnung wird
  'bezahlt', wenn der Bankbetrag den Brutto trifft (±1 Cent) — sonst bleibt sie
  gestellt (Teilzahlung bleibt im Journal sichtbar).
- AUSGANG (-) einem gebuchten Beleg zuordnen = NUR Abhaken (beleg_id, Status):
  die Aufwandsbuchung existiert seit der Beleg-Freigabe — eine zweite Buchung
  waere doppelt.
- Automatik nur bei SICHEREN Treffern (Betrag exakt UND Referenz im
  Verwendungszweck); alles andere wartet auf manuelle Freigabe (Kap. 9:
  "bei Unsicherheit manuelle Freigabe").
- Fehlzuordnung loesen = Storno der Zahlungsbuchung (Gegenbuchung, nie Edit)
  + Status zurueck auf unabgeglichen.
"""

from datetime import date

from . import journal
from .audit import audit_schreiben
from .bankimport import Bewegung

BANKKONTO = "1800"
FORDERUNGSKONTO = "1200"


class AbgleichAbgelehnt(ValueError):
    """Fachliche Ablehnung — Router uebersetzt in 422."""


_SPALTEN = ("id, import_datum, buchungsdatum, betrag_cent, verwendungszweck,"
            " gegen_name, gegen_iban, status, rechnung_id, beleg_id,"
            " buchung_lfd_nr, zuordnung_grund")


def _ablehnung(conn, akteur, aktion, nutzlast, grund):
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, aktion, erfolg=False,
                        nutzlast={**nutzlast, "grund": grund})
    raise AbgleichAbgelehnt(grund)


def _zeile_zu_dict(cur, zeile):
    namen = [beschreibung.name for beschreibung in cur.description]
    return dict(zip(namen, zeile))


def bewegung_lesen(conn, bewegung_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_SPALTEN} FROM bankbewegungen WHERE id = %s",
                    (bewegung_id,))
        zeile = cur.fetchone()
        return None if zeile is None else _zeile_zu_dict(cur, zeile)


def bewegungen_liste(conn, *, status: str | None = None, limit: int = 200) -> list:
    with conn.cursor() as cur:
        if status:
            cur.execute(f"SELECT {_SPALTEN} FROM bankbewegungen WHERE status = %s"
                        " ORDER BY buchungsdatum DESC, id DESC LIMIT %s",
                        (status, limit))
        else:
            cur.execute(f"SELECT {_SPALTEN} FROM bankbewegungen"
                        " ORDER BY buchungsdatum DESC, id DESC LIMIT %s", (limit,))
        return [_zeile_zu_dict(cur, zeile) for zeile in cur.fetchall()]


def importieren(conn, bewegungen: list, *, akteur: str) -> dict:
    """Bewegungen einfuegen; Dubletten (dedup_hash) werden still uebersprungen —
    ein erneuter Import derselben Datei ist ein No-op."""
    neu = uebersprungen = 0
    conn.rollback()
    for bewegung in bewegungen:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO bankbewegungen (buchungsdatum, betrag_cent,"
                    " verwendungszweck, gegen_name, gegen_iban, dedup_hash)"
                    " VALUES (%s, %s, %s, %s, %s, %s)"
                    " ON CONFLICT (dedup_hash) DO NOTHING RETURNING id",
                    (bewegung.buchungsdatum, bewegung.betrag_cent,
                     bewegung.verwendungszweck, bewegung.gegen_name,
                     bewegung.gegen_iban, bewegung.dedup_hash()))
                if cur.fetchone() is None:
                    uebersprungen += 1
                else:
                    neu += 1
    with conn.transaction():
        audit_schreiben(conn, akteur, "bank_import", erfolg=True,
                        nutzlast={"neu": neu, "uebersprungen": uebersprungen})
    return {"neu": neu, "uebersprungen": uebersprungen}


# ── Vorschlaege ──────────────────────────────────────────────────────────────

def _offene_rechnungen(conn) -> list:
    with conn.cursor() as cur:
        cur.execute("SELECT id, rechnungsnummer, brutto_cent, auftraggeber_id"
                    " FROM rechnungen WHERE status = 'gestellt'")
        return [{"rechnung_id": r_id, "rechnungsnummer": nummer,
                 "brutto_cent": brutto, "auftraggeber_id": ag}
                for r_id, nummer, brutto, ag in cur.fetchall()]


def _offene_belege(conn) -> list:
    """Gebuchte Ausgaben ohne Bank-Haekchen."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT b.id, b.belegnummer, b.brutto_cent, b.lieferant"
            "  FROM belege b WHERE b.status = 'gebucht'"
            "   AND NOT EXISTS (SELECT 1 FROM bankbewegungen bb"
            "                    WHERE bb.beleg_id = b.id AND bb.status = 'zugeordnet')")
        return [{"beleg_id": b_id, "belegnummer": nummer,
                 "brutto_cent": brutto, "lieferant": lieferant}
                for b_id, nummer, brutto, lieferant in cur.fetchall()]


def vorschlaege(conn, bewegung: dict) -> list:
    """Kandidaten mit Konfidenz: 'sicher' (Betrag exakt UND Referenz im
    Verwendungszweck), 'betrag' (nur Betrag ±1 Cent), 'referenz' (nur Nummer)."""
    zweck = bewegung["verwendungszweck"].upper().replace(" ", "")
    treffer = []
    if bewegung["betrag_cent"] > 0:
        for rechnung in _offene_rechnungen(conn):
            betrag_passt = abs(bewegung["betrag_cent"] - rechnung["brutto_cent"]) <= 1
            referenz_passt = rechnung["rechnungsnummer"].replace("-", "") in \
                zweck.replace("-", "")
            if betrag_passt and referenz_passt:
                stufe = "sicher"
            elif betrag_passt:
                stufe = "betrag"
            elif referenz_passt:
                stufe = "referenz"
            else:
                continue
            treffer.append({**rechnung, "art": "rechnung", "konfidenz": stufe})
    else:
        for beleg in _offene_belege(conn):
            betrag_passt = abs(-bewegung["betrag_cent"] - beleg["brutto_cent"]) <= 1
            referenz_passt = beleg["belegnummer"].replace("-", "") in \
                zweck.replace("-", "")
            if betrag_passt and referenz_passt:
                stufe = "sicher"
            elif betrag_passt:
                stufe = "betrag"
            else:
                continue
            treffer.append({**beleg, "art": "beleg", "konfidenz": stufe})
    rang = {"sicher": 0, "betrag": 1, "referenz": 2}
    return sorted(treffer, key=lambda kandidat: rang[kandidat["konfidenz"]])


# ── Zuordnen / Ignorieren / Loesen ───────────────────────────────────────────

def zuordnen(conn, *, bewegung_id: int, rechnung_id: int | None = None,
             beleg_id: int | None = None, akteur: str, grund: str = "manuell") -> dict:
    from . import rechnungen as rechnungsmodul

    bewegung = bewegung_lesen(conn, bewegung_id)
    nutzlast = {"bewegung_id": bewegung_id, "rechnung_id": rechnung_id,
                "beleg_id": beleg_id}
    if bewegung is None:
        _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                   f"bewegung {bewegung_id} existiert nicht")
    if bewegung["status"] != "unabgeglichen":
        _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                   f"bewegung ist {bewegung['status']}")
    if (rechnung_id is None) == (beleg_id is None):
        _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                   "genau eines von rechnung_id/beleg_id angeben")

    if rechnung_id is not None:
        if bewegung["betrag_cent"] <= 0:
            _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                       "ausgaenge gehoeren zu belegen, nicht zu rechnungen")
        rechnung = rechnungsmodul.rechnung_lesen(conn, rechnung_id)
        if rechnung is None or rechnung["status"] not in ("gestellt", "bezahlt"):
            _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                       "rechnung existiert nicht oder ist nicht gestellt")
        # Zahlungsbuchung: Bank an Forderung, in Hoehe des BANKbetrags.
        conn.rollback()
        ergebnis = journal.buchung_anlegen(
            conn, buchungsdatum=bewegung["buchungsdatum"],
            belegdatum=bewegung["buchungsdatum"],
            sollkonto=BANKKONTO, habenkonto=FORDERUNGSKONTO,
            betrag_cent=bewegung["betrag_cent"], steuerschluessel="",
            buchungstext=f"Zahlungseingang {rechnung['rechnungsnummer']}"
                         f" ({bewegung['gegen_name'] or 'Bank'})",
            belegreferenz=rechnung["rechnungsnummer"],
            akteur=akteur, aktion="bank_zuordnen")
        with conn.transaction():
            conn.execute(
                "UPDATE bankbewegungen SET status = 'zugeordnet', rechnung_id = %s,"
                " buchung_lfd_nr = %s, zuordnung_grund = %s WHERE id = %s",
                (rechnung_id, ergebnis["lfd_nr"], grund, bewegung_id))
            audit_schreiben(conn, akteur, "bank_zuordnen", erfolg=True,
                            nutzlast={**nutzlast, "lfd_nr": ergebnis["lfd_nr"]})
        # Voll getroffen (±1 Cent) -> Rechnung ist bezahlt.
        if rechnung["status"] == "gestellt" \
                and abs(bewegung["betrag_cent"] - rechnung["brutto_cent"]) <= 1:
            rechnungsmodul.bezahlt_setzen(
                conn, rechnung_id=rechnung_id, bezahlt=True,
                bezahlt_am=bewegung["buchungsdatum"], akteur=akteur)
    else:
        if bewegung["betrag_cent"] >= 0:
            _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                       "eingaenge gehoeren zu rechnungen, nicht zu belegen")
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM belege WHERE id = %s", (beleg_id,))
            zeile = cur.fetchone()
        if zeile is None or zeile[0] != "gebucht":
            _ablehnung(conn, akteur, "bank_zuordnen", nutzlast,
                       "beleg existiert nicht oder ist nicht gebucht")
        # KEINE zweite Buchung — der Aufwand steht seit der Beleg-Freigabe im
        # Journal; hier wird nur abgehakt.
        conn.rollback()
        with conn.transaction():
            conn.execute(
                "UPDATE bankbewegungen SET status = 'zugeordnet', beleg_id = %s,"
                " zuordnung_grund = %s WHERE id = %s",
                (beleg_id, grund, bewegung_id))
            audit_schreiben(conn, akteur, "bank_zuordnen", erfolg=True,
                            nutzlast=nutzlast)
    return bewegung_lesen(conn, bewegung_id)


def ignorieren(conn, *, bewegung_id: int, grund: str, akteur: str) -> dict:
    if not str(grund or "").strip():
        raise AbgleichAbgelehnt("ignorieren braucht einen grund")
    bewegung = bewegung_lesen(conn, bewegung_id)
    if bewegung is None:
        raise AbgleichAbgelehnt(f"bewegung {bewegung_id} existiert nicht")
    if bewegung["status"] != "unabgeglichen":
        raise AbgleichAbgelehnt(f"bewegung ist {bewegung['status']}")
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE bankbewegungen SET status = 'ignoriert',"
                     " zuordnung_grund = %s WHERE id = %s",
                     (grund.strip(), bewegung_id))
        audit_schreiben(conn, akteur, "bank_ignoriert", erfolg=True,
                        nutzlast={"bewegung_id": bewegung_id, "grund": grund.strip()})
    return bewegung_lesen(conn, bewegung_id)


def loesen(conn, *, bewegung_id: int, grund: str, akteur: str) -> dict:
    """Fehlzuordnung aufheben: Zahlungsbuchung stornieren (Gegenbuchung),
    Rechnung ggf. zurueck auf gestellt, Bewegung wieder unabgeglichen."""
    from . import rechnungen as rechnungsmodul

    if not str(grund or "").strip():
        raise AbgleichAbgelehnt("loesen braucht einen grund")
    bewegung = bewegung_lesen(conn, bewegung_id)
    if bewegung is None:
        raise AbgleichAbgelehnt(f"bewegung {bewegung_id} existiert nicht")
    if bewegung["status"] not in ("zugeordnet", "ignoriert"):
        raise AbgleichAbgelehnt(f"bewegung ist {bewegung['status']}")

    if bewegung["buchung_lfd_nr"] is not None:
        journal.storno_anlegen(conn, nr_original=bewegung["buchung_lfd_nr"],
                               grund=f"Zuordnung geloest: {grund.strip()}",
                               akteur=akteur)
    if bewegung["rechnung_id"] is not None:
        rechnung = rechnungsmodul.rechnung_lesen(conn, bewegung["rechnung_id"])
        if rechnung and rechnung["status"] == "bezahlt":
            rechnungsmodul.bezahlt_setzen(conn, rechnung_id=rechnung["id"],
                                          bezahlt=False, bezahlt_am=None,
                                          akteur=akteur)
    conn.rollback()
    with conn.transaction():
        conn.execute(
            "UPDATE bankbewegungen SET status = 'unabgeglichen', rechnung_id = NULL,"
            " beleg_id = NULL, buchung_lfd_nr = NULL, zuordnung_grund = ''"
            " WHERE id = %s", (bewegung_id,))
        audit_schreiben(conn, akteur, "bank_geloest", erfolg=True,
                        nutzlast={"bewegung_id": bewegung_id, "grund": grund.strip()})
    return bewegung_lesen(conn, bewegung_id)


def auto_abgleich(conn, *, akteur: str) -> dict:
    """Alle unabgeglichenen Bewegungen durchgehen; NUR 'sicher'-Treffer werden
    automatisch zugeordnet (und auch nur, wenn er eindeutig ist)."""
    zugeordnet = 0
    offen = bewegungen_liste(conn, status="unabgeglichen", limit=1000)
    for bewegung in offen:
        kandidaten = [kandidat for kandidat in vorschlaege(conn, bewegung)
                      if kandidat["konfidenz"] == "sicher"]
        if len(kandidaten) != 1:
            continue
        kandidat = kandidaten[0]
        zuordnen(conn, bewegung_id=bewegung["id"],
                 rechnung_id=kandidat.get("rechnung_id"),
                 beleg_id=kandidat.get("beleg_id"),
                 akteur=akteur, grund=f"auto ({kandidat['konfidenz']})")
        zugeordnet += 1
    return {"geprueft": len(offen), "zugeordnet": zugeordnet}
