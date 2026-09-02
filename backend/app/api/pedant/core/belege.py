"""Beleg-Fachlogik: Plausibilitaet, Buchungsvorschlag, Lebenslauf, Freigabe.

Der Lebenslauf: erfasst -> (erkannt, nur mit OCR) -> geprueft -> gebucht |
verworfen. Die Freigabe ist die einzige Stelle, an der aus einem Beleg eine
Buchung wird — EINE Zeile BRUTTO mit DATEV-BU-Steuerschluessel, Sollkonto vom
Nutzer, Geldkonto aus der Allowlist. Die Uebergangsregeln erzwingt zusaetzlich
der DB-Trigger aus 004 — hier stehen sie fuer verstaendliche Fehlermeldungen.
"""

import json
from dataclasses import dataclass
from datetime import date

from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from . import journal
from .ablage import AblageErgebnis
from .audit import audit_schreiben

GELDKONTEN = ("1800", "1600", "3300", "1550")  # Bank, Kasse, Verb. L+L, Ford. Ges.
STANDARD_GELDKONTO = "1800"

# GWG-Schwellen in NETTO-Cent (FAHRPLAN Kap. 8, Schritt 4).
GRENZE_SOFORT = 25_000    # unter 250 € netto: direkt Aufwand
GRENZE_GWG = 80_000       # 250–800 € netto: GWG-Sofortabschreibung 6260


class BelegAbgelehnt(ValueError):
    """Fachliche Ablehnung — Router uebersetzt in 422."""


def _ablehnung(conn, akteur: str, aktion: str, nutzlast: dict, grund: str):
    """Audit-Spur fuer den abgelehnten Versuch (FAHRPLAN Kap. 4, Punkt 6)."""
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, aktion, erfolg=False,
                        nutzlast={**nutzlast, "grund": grund})
    raise BelegAbgelehnt(grund)


class BelegDuplikat(Exception):
    """Selbe Datei existiert schon als Beleg — Router uebersetzt in 409."""

    def __init__(self, belegnummer: str, status: str):
        super().__init__(f"datei bereits erfasst als {belegnummer} ({status})")
        self.belegnummer = belegnummer
        self.status = status


@dataclass(frozen=True)
class Befund:
    ok: bool
    erwartet_brutto_cent: int | None
    abweichung_cent: int | None
    grund: str


def plausibilitaet(netto_cent, steuersatz, brutto_cent) -> Befund:
    """Netto + Steuer = Brutto, kaufmaennisch gerundet, ±1 Cent Toleranz
    (positionsweise Rundung auf Kassenbons)."""
    if netto_cent is None or steuersatz is None or brutto_cent is None:
        return Befund(False, None, None, "netto, steuersatz und brutto muessen gefuellt sein")
    steuer = (netto_cent * steuersatz + 50) // 100
    erwartet = netto_cent + steuer
    abweichung = brutto_cent - erwartet
    if abs(abweichung) <= 1:
        return Befund(True, erwartet, abweichung, "")
    return Befund(False, erwartet, abweichung,
                  f"brutto weicht {abweichung:+d} cent vom erwarteten wert ab")


def vorschlag(netto_cent: int | None) -> dict:
    """Buchungsvorschlag nach Nettobetrag — ein Vorschlag, kein Automatismus."""
    if netto_cent is None:
        return {"stufe": None, "konto_vorschlag": None, "hinweis": ""}
    if netto_cent < GRENZE_SOFORT:
        return {"stufe": "sofortaufwand", "konto_vorschlag": None,
                "hinweis": "Unter 250 € netto: direkt als Aufwand buchen."}
    if netto_cent <= GRENZE_GWG:
        return {"stufe": "gwg", "konto_vorschlag": "6260",
                "hinweis": "250–800 € netto: Sofortabschreibung GWG (6260) — "
                           "Pflicht zur Aufnahme ins Anlageverzeichnis."}
    return {"stufe": "aktivierung", "konto_vorschlag": None,
            "hinweis": "Ueber 800 € netto: aktivieren (z. B. 0650 Bueroeinrichtung, "
                       "0135 Software) und ueber die Nutzungsdauer abschreiben."}


def steuerschluessel(steuersatz: int) -> str:
    """DATEV-BU-Abbildung: 19 % Vorsteuer -> '9', 7 % -> '8', 0 % -> ''."""
    return {19: "9", 7: "8", 0: ""}[steuersatz]


_SPALTEN = ("id, belegnummer, erfasst_am, original_name, ablage_pfad, sha256,"
            " groesse_bytes, mime_typ, status, lieferant, belegdatum, netto_cent,"
            " steuersatz, brutto_cent, kostenmerkmal, buchung_lfd_nr,"
            " verworfen_grund, aktualisiert_am")


def _zeile_zu_dict(zeile) -> dict:
    namen = [name.strip() for name in _SPALTEN.split(",")]
    beleg = dict(zip(namen, zeile))
    beleg["sha256"] = beleg["sha256"].strip()
    beleg["befund"] = plausibilitaet(
        beleg["netto_cent"], beleg["steuersatz"], beleg["brutto_cent"]).__dict__
    beleg["vorschlag"] = vorschlag(beleg["netto_cent"])
    return beleg


def beleg_lesen(conn, beleg_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_SPALTEN} FROM belege WHERE id = %s", (beleg_id,))
        zeile = cur.fetchone()
    return None if zeile is None else _zeile_zu_dict(zeile)


def belege_liste(conn, *, status: str | None = None, limit: int = 50,
                 kostenmerkmal: str | None = None) -> list[dict]:
    """kostenmerkmal: None = alle, '' = nur ohne Zuordnung, sonst exakt dieses."""
    bedingungen, werte = [], []
    if status:
        bedingungen.append("status = %s")
        werte.append(status)
    if kostenmerkmal is not None:
        bedingungen.append("kostenmerkmal = %s")
        werte.append(kostenmerkmal)
    wo = f" WHERE {' AND '.join(bedingungen)}" if bedingungen else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_SPALTEN} FROM belege{wo} ORDER BY id DESC LIMIT %s", (*werte, limit))
        return [_zeile_zu_dict(zeile) for zeile in cur]


def kostenmerkmal_setzen(conn, *, beleg_id: int, kostenmerkmal: str, akteur: str) -> dict:
    """Projektzuordnung ('#P<id>') — in jedem Status ausser verworfen erlaubt;
    der Trigger laesst nach 'gebucht' genau dieses Feld noch zu."""
    beleg = beleg_lesen(conn, beleg_id)
    if beleg is None:
        raise BelegAbgelehnt(f"beleg {beleg_id} existiert nicht")
    if beleg["status"] == "verworfen":
        raise BelegAbgelehnt("verworfene belege bekommen keine zuordnung")
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE belege SET kostenmerkmal = %s WHERE id = %s",
                     (kostenmerkmal.strip(), beleg_id))
        audit_schreiben(conn, akteur, "beleg_kostenmerkmal", erfolg=True,
                        nutzlast={"beleg_id": beleg_id, "kostenmerkmal": kostenmerkmal.strip()})
    return beleg_lesen(conn, beleg_id)


def beleg_anlegen(conn, *, ergebnis: AblageErgebnis, akteur: str) -> dict:
    """Legt die DB-Zeile zum abgelegten Original an. Duplikat (sha256) ->
    BelegDuplikat mit Nummer und Status des Bestands."""
    jahr = date.today().year
    nutzlast = {"sha256": ergebnis.sha256, "original_name": ergebnis.original_name,
                "groesse_bytes": ergebnis.groesse_bytes}
    conn.rollback()
    for versuch in (1, 2):  # UNIQUE(jahr, lfd) faengt Races — ein Retry genuegt
        try:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT coalesce(max(beleg_lfd), 0) + 1 FROM belege"
                        " WHERE beleg_jahr = %s", (jahr,))
                    (lfd,) = cur.fetchone()
                    cur.execute(
                        "INSERT INTO belege (beleg_jahr, beleg_lfd, original_name,"
                        " ablage_pfad, sha256, groesse_bytes, mime_typ)"
                        " VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (jahr, lfd, ergebnis.original_name, ergebnis.relativ,
                         ergebnis.sha256, ergebnis.groesse_bytes, ergebnis.mime_typ))
                    (beleg_id,) = cur.fetchone()
                audit_schreiben(conn, akteur, "beleg_anlegen", erfolg=True,
                                nutzlast={**nutzlast, "beleg_id": beleg_id})
            return beleg_lesen(conn, beleg_id)
        except UniqueViolation as fehler:
            conn.rollback()
            # Duplikat-Inhalt verletzt sha256 ODER ablage_pfad (enthaelt den Hash) —
            # je nachdem, welcher Constraint zuerst prueft.
            if fehler.diag.constraint_name in ("belege_sha256_key",
                                               "belege_ablage_pfad_key"):
                with conn.cursor() as cur:
                    cur.execute("SELECT belegnummer, status FROM belege"
                                " WHERE sha256 = %s", (ergebnis.sha256,))
                    nummer, status = cur.fetchone()
                with conn.transaction():
                    audit_schreiben(conn, akteur, "beleg_anlegen", erfolg=False,
                                    nutzlast={**nutzlast, "grund": "duplikat",
                                              "bestand": nummer})
                raise BelegDuplikat(nummer, status)
            if versuch == 2:
                raise


def _beleg_oder_fehler(cur, beleg_id: int) -> tuple:
    cur.execute("SELECT belegnummer, status, buchung_lfd_nr FROM belege"
                " WHERE id = %s", (beleg_id,))
    zeile = cur.fetchone()
    if zeile is None:
        raise BelegAbgelehnt(f"beleg {beleg_id} existiert nicht")
    return zeile


def felder_speichern(conn, *, beleg_id: int, lieferant: str, belegdatum: date,
                     netto_cent: int, steuersatz: int, brutto_cent: int,
                     akteur: str) -> dict:
    """Speichert die (hand-)erfassten Felder. Stimmt die Plausibilitaet, wird
    der Beleg 'geprueft' — das Abspeichern IST die Bestaetigung; die echte
    Schranke bleibt die Freigabe. Sonst bleibt er 'erfasst', Felder inklusive."""
    try:
        if not str(lieferant or "").strip():
            raise BelegAbgelehnt("lieferant darf nicht leer sein")
        befund = plausibilitaet(netto_cent, steuersatz, brutto_cent)
        conn.rollback()
        with conn.transaction():
            with conn.cursor() as cur:
                nummer, status, _ = _beleg_oder_fehler(cur, beleg_id)
                if status not in ("erfasst", "erkannt", "geprueft"):
                    raise BelegAbgelehnt(f"beleg {nummer} ist {status} — felder sind fest")
                neuer_status = "geprueft" if befund.ok else "erfasst"
                cur.execute(
                    "UPDATE belege SET lieferant = %s, belegdatum = %s, netto_cent = %s,"
                    " steuersatz = %s, brutto_cent = %s, status = %s WHERE id = %s",
                    (lieferant.strip(), belegdatum, netto_cent, steuersatz,
                     brutto_cent, neuer_status, beleg_id))
            audit_schreiben(conn, akteur, "beleg_felder", erfolg=True,
                            nutzlast={"beleg_id": beleg_id, "status": neuer_status,
                                      "befund_ok": befund.ok, "grund": befund.grund})
    except BelegAbgelehnt as fehler:
        _ablehnung(conn, akteur, "beleg_felder", {"beleg_id": beleg_id}, str(fehler))
    return beleg_lesen(conn, beleg_id)


def freigeben(conn, *, beleg_id: int, sollkonto: str,
              geldkonto: str = STANDARD_GELDKONTO, buchungsdatum: date | None = None,
              buchungstext: str | None = None, akteur: str) -> dict:
    """Beleg -> Buchung. Idempotent: Advisory-Lock gegen Doppelklick, Dedup
    ueber belegreferenz im Journal; ein Crash zwischen Buchung und
    Beleg-Nachtrag heilt sich beim naechsten Aufruf."""
    conn.rollback()
    conn.execute("SELECT pg_advisory_lock(42, %s)", (beleg_id,))
    try:
        if geldkonto not in GELDKONTEN:
            raise BelegAbgelehnt(f"geldkonto {geldkonto} nicht erlaubt"
                                 f" (erlaubt: {', '.join(GELDKONTEN)})")
        if sollkonto == geldkonto:
            raise BelegAbgelehnt("sollkonto und geldkonto muessen verschieden sein")
        with conn.cursor() as cur:
            nummer, status, vorhandene_buchung = _beleg_oder_fehler(cur, beleg_id)
            if status == "gebucht":
                return {"belegnummer": nummer, "lfd_nr": vorhandene_buchung,
                        "bereits_gebucht": True}
            if status != "geprueft":
                raise BelegAbgelehnt(f"beleg {nummer} ist {status},"
                                     " freigeben geht nur aus geprueft")
            cur.execute("SELECT lieferant, belegdatum, brutto_cent, steuersatz"
                        " FROM belege WHERE id = %s", (beleg_id,))
            lieferant, belegdatum, brutto, satz = cur.fetchone()
            # Selbstheilung: Buchung kann von einem frueheren, abgebrochenen
            # Aufruf schon existieren — dann nur den Beleg nachtragen.
            cur.execute("SELECT lfd_nr FROM buchungssaetze"
                        " WHERE belegreferenz = %s AND stornoreferenz IS NULL",
                        (nummer,))
            zeile = cur.fetchone()
        conn.rollback()

        if zeile is not None:
            lfd_nr = zeile[0]
        else:
            ergebnis = journal.buchung_anlegen(
                conn,
                buchungsdatum=buchungsdatum or date.today(),
                belegdatum=belegdatum,
                sollkonto=sollkonto, habenkonto=geldkonto,
                betrag_cent=brutto,                      # EINE Zeile BRUTTO
                steuerschluessel=steuerschluessel(satz),
                buchungstext=(buchungstext or f"{lieferant} {nummer}").strip(),
                belegreferenz=nummer,
                akteur=akteur, aktion="beleg_freigeben")
            lfd_nr = ergebnis["lfd_nr"]

        with conn.transaction():
            conn.execute("UPDATE belege SET status = 'gebucht',"
                         " buchung_lfd_nr = %s WHERE id = %s", (lfd_nr, beleg_id))
            audit_schreiben(conn, akteur, "beleg_gebucht", erfolg=True,
                            nutzlast={"beleg_id": beleg_id, "belegnummer": nummer,
                                      "lfd_nr": lfd_nr})
        return {"belegnummer": nummer, "lfd_nr": lfd_nr, "bereits_gebucht": False}
    except BelegAbgelehnt as fehler:
        _ablehnung(conn, akteur, "beleg_freigeben", {"beleg_id": beleg_id}, str(fehler))
    finally:
        conn.execute("SELECT pg_advisory_unlock(42, %s)", (beleg_id,))
        conn.commit()


def verwerfen(conn, *, beleg_id: int, grund: str, akteur: str) -> dict:
    """Terminal. Die Datei bleibt liegen — verworfen heisst 'kein Beleg fuer die
    Buchhaltung', nicht 'nie dagewesen'."""
    try:
        if not str(grund or "").strip():
            raise BelegAbgelehnt("verwerfen braucht einen grund")
        conn.rollback()
        with conn.transaction():
            with conn.cursor() as cur:
                nummer, status, _ = _beleg_oder_fehler(cur, beleg_id)
                if status not in ("erfasst", "erkannt", "geprueft"):
                    raise BelegAbgelehnt(f"beleg {nummer} ist {status} — verwerfen unmoeglich")
                cur.execute("UPDATE belege SET status = 'verworfen',"
                            " verworfen_grund = %s WHERE id = %s",
                            (grund.strip(), beleg_id))
            audit_schreiben(conn, akteur, "beleg_verworfen", erfolg=True,
                            nutzlast={"beleg_id": beleg_id, "grund": grund.strip()})
    except BelegAbgelehnt as fehler:
        _ablehnung(conn, akteur, "beleg_verworfen", {"beleg_id": beleg_id}, str(fehler))
    return beleg_lesen(conn, beleg_id)


def erkennung_eintragen(conn, *, beleg_id: int, felder, roh: dict, akteur: str) -> dict:
    """Schreibt ein OCR-Ergebnis (spaeter: cli beleg-erkennen). Status wird
    'erkannt' — die menschliche Pruefung (felder_speichern) bleibt Pflicht."""
    conn.rollback()
    with conn.transaction():
        with conn.cursor() as cur:
            nummer, status, _ = _beleg_oder_fehler(cur, beleg_id)
            if status != "erfasst":
                raise BelegAbgelehnt(f"beleg {nummer} ist {status},"
                                     " erkennung nur auf erfasst")
            cur.execute(
                "UPDATE belege SET lieferant = %s, belegdatum = %s, netto_cent = %s,"
                " steuersatz = %s, brutto_cent = %s, erkannt_json = %s,"
                " status = 'erkannt' WHERE id = %s",
                (felder.lieferant, felder.belegdatum, felder.netto_cent,
                 felder.steuersatz, felder.brutto_cent,
                 Jsonb(json.loads(json.dumps(roh, default=str))), beleg_id))
        audit_schreiben(conn, akteur, "beleg_erkannt", erfolg=True,
                        nutzlast={"beleg_id": beleg_id, "unsicher": felder.unsicher})
    return beleg_lesen(conn, beleg_id)
