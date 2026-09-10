"""Termine mit Uhrzeit, Teilnehmer (RSVP), iMIP-Einladungen, Antworten, Feed.

Meilensteine bleiben DATE-Fristen; hier leben Kalender-Ereignisse nach
RFC 5545 (UID/SEQUENCE). Mailversand ist injiziert (`senden`-Callback), damit
der Kern ohne SMTP testbar ist. Antworten der Teilnehmer liest der IMAP-Worker
in email_events.ical_json (SQLite); `antworten_verarbeiten` holt sie hier
lesend ab (Muster core/mails.py) und verbucht sie idempotent.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services import ical

from . import mails
from .audit import audit_schreiben

UID_DOMAIN = "quagg-engineering.org"
ORTSZEIT = ZoneInfo("Europe/Berlin")
UTC = timezone.utc

_SPALTEN = ("id", "projekt_id", "titel", "beginn", "ende", "ganztag", "ort", "besprechungslink",
            "beschreibung", "uid", "sequenz", "eingeladen_sequenz", "eingeladen_am", "status",
            "abgesagt_am", "quelle", "organisator_email", "organisator_name", "unser_status",
            "email_event_id", "angelegt_von", "angelegt_am", "aktualisiert_am")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.termine"
_AENDERBAR = ("projekt_id", "titel", "beginn", "ende", "ganztag", "ort", "besprechungslink", "beschreibung")
_VEVENT_RELEVANT = ("titel", "beginn", "ende", "ganztag", "ort", "besprechungslink", "beschreibung")
_T_SPALTEN = ("id", "termin_id", "email", "name", "rolle", "status", "kommentar", "eingeladen_am", "antwort_am")
_T_SELECT = f"SELECT {', '.join(_T_SPALTEN)} FROM projekt.termin_teilnehmer"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ROLLEN = ("REQ-PARTICIPANT", "OPT-PARTICIPANT")
_ANTWORT_STATUS = ("ACCEPTED", "DECLINED", "TENTATIVE")
FEED_MEILENSTEIN_ARTEN = ("termin", "abgabe", "bindefrist", "wiedervorlage")


class TerminAbgelehnt(ValueError):
    """Router: 422."""


class TerminUnbekannt(KeyError):
    """Router: 404."""


# ── Helfer ────────────────────────────────────────────────────────────────

def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def _t_zeile(row) -> dict:
    return dict(zip(_T_SPALTEN, row))


def _zeit(wert, feld: str) -> datetime:
    """datetime oder ISO-String -> bewusste UTC-Zeit. Naive Werte gelten als UTC."""
    if isinstance(wert, datetime):
        dt = wert
    elif isinstance(wert, date):
        dt = datetime.combine(wert, time.min)
    elif isinstance(wert, str) and wert.strip():
        try:
            dt = datetime.fromisoformat(wert.strip().replace("Z", "+00:00"))
        except ValueError:
            raise TerminAbgelehnt(f"{feld}: kein gueltiger Zeitpunkt ({wert!r})")
    else:
        raise TerminAbgelehnt(f"{feld} fehlt")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _zeitraum(beginn, ende, ganztag: bool, *, ende_inklusiv: bool = True) -> tuple[datetime, datetime]:
    """Gespeichert wird immer UTC mit EXKLUSIVEM Ende. Die API liefert bei Ganztag den
    letzten Tag inklusiv ('bis 11.09.'), iCalendar dagegen exklusiv (ende_inklusiv=False)."""
    b = _zeit(beginn, "beginn")
    e = _zeit(ende, "ende") if ende not in (None, "") else (b + timedelta(hours=1))
    if ganztag:
        b_tag = b.date()
        e_tag = e.date()
        if e.time() != time.min or ende_inklusiv:
            e_tag += timedelta(days=1)
        if e_tag <= b_tag:
            e_tag = b_tag + timedelta(days=1)
        b = datetime.combine(b_tag, time.min, tzinfo=UTC)
        e = datetime.combine(e_tag, time.min, tzinfo=UTC)
    if e <= b:
        raise TerminAbgelehnt("ende muss nach beginn liegen")
    return b, e


def _link_pruefen(link: str | None) -> str:
    link = (link or "").strip()
    if link and not re.match(r"^https?://", link):
        raise TerminAbgelehnt("besprechungslink muss mit http:// oder https:// beginnen")
    return link


def _teilnehmer_pruefen(liste) -> list[dict]:
    sauber: list[dict] = []
    gesehen: set[str] = set()
    for eintrag in liste or ():
        if isinstance(eintrag, str):
            eintrag = {"email": eintrag}
        email = str(eintrag.get("email") or "").strip().lower()
        if not email:
            continue
        if not _EMAIL_RE.match(email):
            raise TerminAbgelehnt(f"ungueltige teilnehmer-adresse: {email}")
        if email in gesehen:
            continue
        gesehen.add(email)
        rolle = str(eintrag.get("rolle") or "REQ-PARTICIPANT").upper()
        if rolle not in _ROLLEN:
            raise TerminAbgelehnt(f"rolle muss eine von {_ROLLEN} sein")
        sauber.append({"email": email, "name": str(eintrag.get("name") or "").strip(), "rolle": rolle})
    return sauber


def _teilnehmer_laden(conn, termin_ids: list[int]) -> dict[int, list[dict]]:
    if not termin_ids:
        return {}
    ergebnis: dict[int, list[dict]] = {i: [] for i in termin_ids}
    for r in conn.execute(f"{_T_SELECT} WHERE termin_id = ANY(%s) ORDER BY id", (termin_ids,)):
        t = _t_zeile(r)
        ergebnis[t["termin_id"]].append(t)
    return ergebnis


def _mit_teilnehmern(conn, termine: list[dict]) -> list[dict]:
    je_id = _teilnehmer_laden(conn, [t["id"] for t in termine])
    for t in termine:
        t["teilnehmer"] = je_id.get(t["id"], [])
        t["einladung_offen"] = t["eingeladen_am"] is not None and (t["eingeladen_sequenz"] or 0) < t["sequenz"]
    return termine


def _projekt_name(conn, projekt_id: int | None) -> str:
    if projekt_id is None:
        return ""
    row = conn.execute("SELECT name FROM projekt.projekte WHERE id = %s", (projekt_id,)).fetchone()
    return row[0] if row else ""


def _projekt_pruefen(conn, projekt_id: int | None) -> None:
    if projekt_id is None:
        return
    if conn.execute("SELECT 1 FROM projekt.projekte WHERE id = %s", (projekt_id,)).fetchone() is None:
        raise TerminAbgelehnt(f"projekt {projekt_id} unbekannt")


def spanne_text(termin: dict) -> str:
    """'Mo, 01.09.2026 10:00–11:30' bzw. 'Mo, 01.09.2026 (ganztägig)' in Ortszeit."""
    b = termin["beginn"].astimezone(ORTSZEIT)
    e = termin["ende"].astimezone(ORTSZEIT)
    tage = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
    if termin.get("ganztag"):
        letzter = (termin["ende"] - timedelta(days=1)).astimezone(UTC).date()
        erster = termin["beginn"].astimezone(UTC).date()
        if letzter <= erster:
            return f"{tage[erster.weekday()]}, {erster:%d.%m.%Y} (ganztägig)"
        return f"{erster:%d.%m.%Y} – {letzter:%d.%m.%Y} (ganztägig)"
    if b.date() == e.date():
        return f"{tage[b.weekday()]}, {b:%d.%m.%Y %H:%M}–{e:%H:%M}"
    return f"{b:%d.%m.%Y %H:%M} – {e:%d.%m.%Y %H:%M}"


def einladungstext(termin: dict, projekt_name: str = "", nachricht: str = "") -> str:
    zeilen = []
    if nachricht:
        zeilen += [nachricht.strip(), ""]
    zeilen += [f"Termin: {termin['titel']}", f"Wann: {spanne_text(termin)}"]
    if termin.get("ort"):
        zeilen.append(f"Wo: {termin['ort']}")
    if termin.get("besprechungslink"):
        zeilen.append(f"Besprechungslink: {termin['besprechungslink']}")
    if projekt_name:
        zeilen.append(f"Projekt: {projekt_name}")
    if termin.get("beschreibung"):
        zeilen += ["", termin["beschreibung"].strip()]
    zeilen += ["", "Bitte über die Zusagen/Absagen-Funktion Ihres Kalenders antworten."]
    return "\n".join(zeilen)


# ── Lesen ─────────────────────────────────────────────────────────────────

def liste(conn, von, bis, *, projekt_id: int | None = None, mit_abgesagten: bool = False) -> list[dict]:
    v, b = _zeit(von, "von"), _zeit(bis, "bis")
    bedingungen = ["beginn < %s", "ende > %s"]
    werte: list = [b, v]
    if projekt_id is not None:
        bedingungen.append("projekt_id = %s")
        werte.append(projekt_id)
    if not mit_abgesagten:
        bedingungen.append("status = 'geplant'")
    termine = [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE {' AND '.join(bedingungen)} ORDER BY beginn, id", werte)]
    return _mit_teilnehmern(conn, termine)


def je_projekt(conn, projekt_id: int) -> list[dict]:
    termine = [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE projekt_id = %s ORDER BY beginn, id", (projekt_id,))]
    return _mit_teilnehmern(conn, termine)


def lesen(conn, termin_id: int) -> dict:
    row = conn.execute(f"{_SELECT} WHERE id = %s", (termin_id,)).fetchone()
    if row is None:
        raise TerminUnbekannt(termin_id)
    return _mit_teilnehmern(conn, [_zeile(row)])[0]


def _lesen_per_uid(conn, uid: str) -> dict | None:
    row = conn.execute(f"{_SELECT} WHERE uid = %s", (uid,)).fetchone()
    return _mit_teilnehmern(conn, [_zeile(row)])[0] if row else None


# ── Schreiben ─────────────────────────────────────────────────────────────

def anlegen(conn, *, titel: str, beginn, ende, akteur: str, organisator_email: str,
            organisator_name: str = "", ganztag: bool = False, ort: str = "", besprechungslink: str = "",
            beschreibung: str = "", projekt_id: int | None = None, teilnehmer=()) -> dict:
    if not (titel or "").strip():
        raise TerminAbgelehnt("titel darf nicht leer sein")
    b, e = _zeitraum(beginn, ende, bool(ganztag))
    link = _link_pruefen(besprechungslink)
    leute = _teilnehmer_pruefen(teilnehmer)
    conn.rollback()
    with conn.transaction():
        _projekt_pruefen(conn, projekt_id)
        row = conn.execute(
            "INSERT INTO projekt.termine (projekt_id, titel, beginn, ende, ganztag, ort, besprechungslink,"
            " beschreibung, uid, organisator_email, organisator_name, angelegt_von)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (projekt_id, titel.strip(), b, e, bool(ganztag), (ort or "").strip(), link,
             (beschreibung or "").strip(), f"neu-{secrets.token_hex(8)}", organisator_email.lower(),
             organisator_name or "", akteur)).fetchone()
        tid = row[0]
        conn.execute("UPDATE projekt.termine SET uid = %s WHERE id = %s", (f"termin-{tid}@{UID_DOMAIN}", tid))
        for t in leute:
            conn.execute(
                "INSERT INTO projekt.termin_teilnehmer (termin_id, email, name, rolle) VALUES (%s, %s, %s, %s)",
                (tid, t["email"], t["name"], t["rolle"]))
        audit_schreiben(conn, akteur, "termin_anlegen", erfolg=True,
                        nutzlast={"id": tid, "projekt_id": projekt_id, "teilnehmer": len(leute)})
    return lesen(conn, tid)


def aendern(conn, termin_id: int, felder: dict, *, akteur: str) -> dict:
    sauber = {k: v for k, v in felder.items() if k in _AENDERBAR}
    fremd = set(felder) - set(sauber)
    if fremd:
        raise TerminAbgelehnt(f"felder nicht aenderbar: {', '.join(sorted(fremd))}")
    if not sauber:
        raise TerminAbgelehnt("keine aenderbaren felder")
    alt = lesen(conn, termin_id)
    if alt["status"] == "abgesagt":
        raise TerminAbgelehnt("abgesagte termine koennen nicht geaendert werden")
    if "titel" in sauber and not str(sauber["titel"] or "").strip():
        raise TerminAbgelehnt("titel darf nicht leer sein")
    if "besprechungslink" in sauber:
        sauber["besprechungslink"] = _link_pruefen(sauber["besprechungslink"])
    if {"beginn", "ende", "ganztag"} & sauber.keys():
        ganztag = bool(sauber.get("ganztag", alt["ganztag"]))
        b, e = _zeitraum(sauber.get("beginn", alt["beginn"]), sauber.get("ende", alt["ende"]), ganztag)
        sauber.update({"beginn": b, "ende": e, "ganztag": ganztag})
    for k in ("titel", "ort", "beschreibung"):
        if k in sauber:
            sauber[k] = str(sauber[k] or "").strip()
    relevant = any(k in _VEVENT_RELEVANT and sauber[k] != alt[k] for k in sauber)
    conn.rollback()
    with conn.transaction():
        if "projekt_id" in sauber:
            _projekt_pruefen(conn, sauber["projekt_id"])
        zuweisung = ", ".join(f"{k} = %s" for k in sauber)
        werte = list(sauber.values())
        if relevant and alt["eingeladen_am"] is not None:
            zuweisung += ", sequenz = sequenz + 1"
        conn.execute(f"UPDATE projekt.termine SET {zuweisung} WHERE id = %s", [*werte, termin_id])
        audit_schreiben(conn, akteur, "termin_aendern", erfolg=True,
                        nutzlast={"id": termin_id, "felder": sorted(sauber)})
    return lesen(conn, termin_id)


def teilnehmer_setzen(conn, termin_id: int, liste, *, akteur: str) -> dict:
    """Abgleich: neue kommen als NEEDS-ACTION dazu, fehlende werden entfernt, bekannte behalten Status."""
    leute = _teilnehmer_pruefen(liste)
    termin = lesen(conn, termin_id)
    vorhanden = {t["email"]: t for t in termin["teilnehmer"]}
    conn.rollback()
    with conn.transaction():
        for t in leute:
            if t["email"] in vorhanden:
                conn.execute("UPDATE projekt.termin_teilnehmer SET name = %s, rolle = %s WHERE id = %s",
                             (t["name"] or vorhanden[t["email"]]["name"], t["rolle"], vorhanden[t["email"]]["id"]))
            else:
                conn.execute(
                    "INSERT INTO projekt.termin_teilnehmer (termin_id, email, name, rolle) VALUES (%s, %s, %s, %s)",
                    (termin_id, t["email"], t["name"], t["rolle"]))
        bleibt = {t["email"] for t in leute}
        for email, t in vorhanden.items():
            if email not in bleibt:
                conn.execute("DELETE FROM projekt.termin_teilnehmer WHERE id = %s", (t["id"],))
        audit_schreiben(conn, akteur, "termin_teilnehmer", erfolg=True,
                        nutzlast={"id": termin_id, "anzahl": len(leute)})
    return lesen(conn, termin_id)


def einladen(conn, termin_id: int, *, akteur: str, senden, betreff: str | None = None,
             nachricht: str | None = None, nur_neue: bool = False) -> dict:
    """REQUEST an die Teilnehmer schicken (Erst-Einladung oder Aktualisierung mit hoeherer SEQUENCE).

    `senden(*, to, subject, body_text, ical, ical_methode)` ist injiziert (email_sender.send_email).
    """
    termin = lesen(conn, termin_id)
    if termin["status"] == "abgesagt":
        raise TerminAbgelehnt("abgesagte termine koennen nicht eingeladen werden")
    if termin["quelle"] != "eigen":
        raise TerminAbgelehnt("fremde einladungen koennen nicht weiterversendet werden")
    alle = termin["teilnehmer"]
    ziel = [t for t in alle if t["eingeladen_am"] is None] if nur_neue else alle
    if not ziel:
        raise TerminAbgelehnt("keine teilnehmer zum einladen")
    update = termin["eingeladen_am"] is not None and not nur_neue
    projekt_name = _projekt_name(conn, termin["projekt_id"])
    ics = ical.vcalendar_request(termin, alle, organisator_email=termin["organisator_email"],
                                 organisator_name=termin["organisator_name"], projekt_name=projekt_name)
    subject = (betreff or "").strip() or ical.betreff_fuer("REQUEST", termin["titel"], update=update)
    body = einladungstext(termin, projekt_name, nachricht or "")
    ergebnis = senden(to=[t["email"] for t in ziel], subject=subject, body_text=body, ical=ics, ical_methode="REQUEST")
    jetzt = datetime.now(UTC)
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE projekt.termine SET eingeladen_am = %s, eingeladen_sequenz = sequenz WHERE id = %s",
                     (jetzt, termin_id))
        conn.execute("UPDATE projekt.termin_teilnehmer SET eingeladen_am = %s WHERE termin_id = %s AND email = ANY(%s)",
                     (jetzt, termin_id, [t["email"] for t in ziel]))
        audit_schreiben(conn, akteur, "termin_einladen", erfolg=True,
                        nutzlast={"id": termin_id, "empfaenger": len(ziel), "update": update,
                                  "mail_id": getattr(ergebnis, "id", None)})
    return lesen(conn, termin_id)


def absagen(conn, termin_id: int, *, akteur: str, senden=None) -> dict:
    termin = lesen(conn, termin_id)
    if termin["status"] == "abgesagt":
        return termin
    jetzt = datetime.now(UTC)
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE projekt.termine SET status = 'abgesagt', abgesagt_am = %s, sequenz = sequenz + 1"
                     " WHERE id = %s", (jetzt, termin_id))
        audit_schreiben(conn, akteur, "termin_absagen", erfolg=True, nutzlast={"id": termin_id})
    termin = lesen(conn, termin_id)
    eingeladene = [t for t in termin["teilnehmer"] if t["eingeladen_am"] is not None]
    if senden is not None and termin["quelle"] == "eigen" and eingeladene:
        ics = ical.vcalendar_cancel(termin, termin["teilnehmer"], organisator_email=termin["organisator_email"],
                                    organisator_name=termin["organisator_name"])
        senden(to=[t["email"] for t in eingeladene], subject=ical.betreff_fuer("CANCEL", termin["titel"]),
               body_text=f"Der Termin wurde abgesagt.\n\nTermin: {termin['titel']}\nWann: {spanne_text(termin)}",
               ical=ics, ical_methode="CANCEL")
        conn.rollback()   # lesen() hat eine implizite Transaktion offen — sonst wird das hier nur ein Savepoint
        with conn.transaction():
            conn.execute("UPDATE projekt.termine SET eingeladen_sequenz = sequenz WHERE id = %s", (termin_id,))
        termin = lesen(conn, termin_id)
    return termin


def loeschen(conn, termin_id: int, *, akteur: str) -> None:
    termin = lesen(conn, termin_id)
    if termin["eingeladen_am"] is not None and termin["status"] != "abgesagt":
        raise TerminAbgelehnt("eingeladene termine bitte absagen statt loeschen")
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM projekt.termine WHERE id = %s", (termin_id,))
        audit_schreiben(conn, akteur, "termin_loeschen", erfolg=True, nutzlast={"id": termin_id})


# ── Fremde Einladungen ────────────────────────────────────────────────────

def _ical_zeiten(ical_dict: dict) -> tuple[datetime, datetime, bool]:
    ganztag = bool(ical_dict.get("ganztag"))
    b, e = _zeitraum(ical_dict.get("beginn"), ical_dict.get("ende"), ganztag, ende_inklusiv=False)
    return b, e, ganztag


def einladung_uebernehmen(conn, ical_dict: dict, *, email_event_id: int | None, akteur: str,
                          unser_status: str | None = None) -> dict:
    """Fremde REQUEST (aus dem Mail-Client) als Termin uebernehmen; bei bekannter UID aktualisieren."""
    uid = (ical_dict.get("uid") or "").strip()
    if not uid:
        raise TerminAbgelehnt("einladung ohne uid")
    if unser_status is not None and unser_status not in _ANTWORT_STATUS:
        raise TerminAbgelehnt(f"unser_status muss einer von {_ANTWORT_STATUS} sein")
    b, e, ganztag = _ical_zeiten(ical_dict)
    org = ical_dict.get("organizer") or {}
    teilnehmer = _teilnehmer_pruefen([
        {"email": a.get("email"), "name": a.get("name"), "rolle": a.get("rolle")}
        for a in ical_dict.get("attendees") or [] if a.get("email")])
    vorhanden = _lesen_per_uid(conn, uid)
    conn.rollback()
    with conn.transaction():
        if vorhanden is None:
            row = conn.execute(
                "INSERT INTO projekt.termine (projekt_id, titel, beginn, ende, ganztag, ort, beschreibung, uid,"
                " sequenz, quelle, organisator_email, organisator_name, unser_status, email_event_id, angelegt_von)"
                " VALUES (NULL, %s, %s, %s, %s, %s, %s, %s, %s, 'einladung', %s, %s, %s, %s, %s) RETURNING id",
                (ical_dict.get("summary") or "(ohne Titel)", b, e, ganztag, ical_dict.get("ort") or "",
                 ical_dict.get("beschreibung") or "", uid, int(ical_dict.get("sequenz") or 0),
                 (org.get("email") or "").lower(), org.get("name") or "", unser_status, email_event_id, akteur)
            ).fetchone()
            tid = row[0]
            for t in teilnehmer:
                conn.execute(
                    "INSERT INTO projekt.termin_teilnehmer (termin_id, email, name, rolle, status)"
                    " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (termin_id, email) DO NOTHING",
                    (tid, t["email"], t["name"], t["rolle"], "NEEDS-ACTION"))
            ergebnis = "neu"
        else:
            tid = vorhanden["id"]
            neuer = int(ical_dict.get("sequenz") or 0) >= vorhanden["sequenz"]
            if neuer:
                conn.execute(
                    "UPDATE projekt.termine SET titel = %s, beginn = %s, ende = %s, ganztag = %s, ort = %s,"
                    " beschreibung = %s, sequenz = %s WHERE id = %s",
                    (ical_dict.get("summary") or vorhanden["titel"], b, e, ganztag, ical_dict.get("ort") or "",
                     ical_dict.get("beschreibung") or "", int(ical_dict.get("sequenz") or 0), tid))
            if unser_status is not None:
                conn.execute("UPDATE projekt.termine SET unser_status = %s WHERE id = %s", (unser_status, tid))
            ergebnis = "aktualisiert" if neuer else "unveraendert"
        audit_schreiben(conn, akteur, "termin_uebernehmen", erfolg=True,
                        nutzlast={"id": tid, "uid": uid, "ergebnis": ergebnis, "email_event_id": email_event_id})
    return lesen(conn, tid)


# ── Antworten (REPLY/COUNTER/CANCEL/REQUEST) aus email_events ────────────

def _absender_email(roh: str) -> str:
    m = re.search(r"<([^>]+)>", roh or "")
    return (m.group(1) if m else (roh or "")).strip().lower()


def _verbuche(conn, termin: dict, ical_dict: dict, mail: dict, *, status: str, kommentar: str) -> str:
    """Teilnehmerstatus setzen; unbekannter Absender wird neu aufgenommen."""
    kandidaten = [a.get("email", "").lower() for a in ical_dict.get("attendees") or [] if a.get("email")]
    if not kandidaten:
        kandidaten = [_absender_email(mail.get("absender", ""))]
    vorhanden = {t["email"]: t for t in termin["teilnehmer"]}
    ergebnis = "uebernommen"
    antwort_am = _zeit(mail.get("empfangen_am"), "empfangen_am") if mail.get("empfangen_am") else datetime.now(UTC)
    for email in kandidaten:
        if not _EMAIL_RE.match(email):
            continue
        if email in vorhanden:
            conn.execute("UPDATE projekt.termin_teilnehmer SET status = %s, kommentar = %s, antwort_am = %s WHERE id = %s",
                         (status, kommentar, antwort_am, vorhanden[email]["id"]))
        else:
            name = next((a.get("name", "") for a in ical_dict.get("attendees") or [] if a.get("email", "").lower() == email), "")
            conn.execute(
                "INSERT INTO projekt.termin_teilnehmer (termin_id, email, name, status, kommentar, antwort_am)"
                " VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (termin_id, email) DO UPDATE"
                " SET status = EXCLUDED.status, kommentar = EXCLUDED.kommentar, antwort_am = EXCLUDED.antwort_am",
                (termin["id"], email, name or "", status, kommentar, antwort_am))
            ergebnis = "neu_aufgenommen"
    return ergebnis


def _gegenvorschlag_text(ical_dict: dict) -> str:
    try:
        b, e, ganztag = _ical_zeiten(ical_dict)
        return "Gegenvorschlag: " + spanne_text({"beginn": b, "ende": e, "ganztag": ganztag})
    except TerminAbgelehnt:
        return "Gegenvorschlag (Zeit nicht lesbar)"


def antworten_verarbeiten(conn, *, akteur: str = "kalender-sync") -> dict:
    """Neue Kalender-Mails aus email_events genau einmal verbuchen (Idempotenz ueber termin_antworten)."""
    conn.rollback()
    ab_id = conn.execute("SELECT coalesce(max(email_event_id), 0) FROM projekt.termin_antworten").fetchone()[0]
    neue = mails.kalender_mails(ab_id)
    zaehler = {"gelesen": 0, "uebernommen": 0, "uebersprungen": 0}
    # Ein echter Transaktionsblock (nach rollback), je Mail ein Savepoint — ein
    # kaputter Kalenderteil verwirft nur seine eigene Verbuchung.
    conn.rollback()
    with conn.transaction():
        for mail in neue:
            zaehler["gelesen"] += 1
            ergebnis = _verarbeite_mail(conn, mail)
            if ergebnis in ("uebernommen", "neu_aufgenommen", "gegenvorschlag", "abgesagt", "aktualisiert"):
                zaehler["uebernommen"] += 1
            else:
                zaehler["uebersprungen"] += 1
        if zaehler["gelesen"]:
            audit_schreiben(conn, akteur, "kalender_antworten", erfolg=True, nutzlast=zaehler)
    return zaehler


def _verarbeite_mail(conn, mail: dict) -> str:
    """Eine Kalender-Mail verbuchen (laeuft in einem Savepoint). Gibt das Ergebnis-Wort zurueck."""
    ical_dict = mail["ical"]
    methode = (ical_dict.get("methode") or "").upper()
    uid = (ical_dict.get("uid") or "").strip()
    message_id = mail["message_id"] or f"ohne-message-id-{mail['id']}"
    with conn.transaction():
        schon = conn.execute("SELECT 1 FROM projekt.termin_antworten WHERE message_id = %s", (message_id,)).fetchone()
        if schon:
            return "schon_verbucht"
        termin = _lesen_per_uid(conn, uid) if uid else None
        ergebnis = "ignoriert"
        try:
            if not uid:
                ergebnis = "ohne_uid"
            elif methode in ("REPLY", "COUNTER"):
                if termin is None:
                    ergebnis = "unbekannte_uid"
                elif termin["eingeladen_sequenz"] is not None and int(ical_dict.get("sequenz") or 0) < termin["eingeladen_sequenz"]:
                    ergebnis = "veraltet"
                elif methode == "REPLY":
                    partstat = next((a.get("partstat") for a in ical_dict.get("attendees") or []), None) or "NEEDS-ACTION"
                    if partstat not in ("ACCEPTED", "DECLINED", "TENTATIVE", "DELEGATED", "NEEDS-ACTION"):
                        partstat = "NEEDS-ACTION"
                    ergebnis = _verbuche(conn, termin, ical_dict, mail, status=partstat,
                                         kommentar=(ical_dict.get("kommentar") or "").strip())
                else:
                    _verbuche(conn, termin, ical_dict, mail, status="TENTATIVE", kommentar=_gegenvorschlag_text(ical_dict))
                    ergebnis = "gegenvorschlag"
            elif methode == "CANCEL":
                if termin is not None and termin["quelle"] == "einladung" and termin["status"] != "abgesagt":
                    conn.execute("UPDATE projekt.termine SET status = 'abgesagt', abgesagt_am = %s WHERE id = %s",
                                 (datetime.now(UTC), termin["id"]))
                    ergebnis = "abgesagt"
                else:
                    ergebnis = "unbekannte_uid" if termin is None else "ignoriert"
            elif methode == "REQUEST":
                if termin is not None and termin["quelle"] == "einladung" and int(ical_dict.get("sequenz") or 0) > termin["sequenz"]:
                    b, e, ganztag = _ical_zeiten(ical_dict)
                    conn.execute(
                        "UPDATE projekt.termine SET titel = %s, beginn = %s, ende = %s, ganztag = %s, ort = %s,"
                        " beschreibung = %s, sequenz = %s WHERE id = %s",
                        (ical_dict.get("summary") or termin["titel"], b, e, ganztag, ical_dict.get("ort") or "",
                         ical_dict.get("beschreibung") or "", int(ical_dict.get("sequenz") or 0), termin["id"]))
                    ergebnis = "aktualisiert"
                else:
                    ergebnis = "nur_protokolliert" if termin is None else "ignoriert"
            else:
                ergebnis = "nur_protokolliert"
        except TerminAbgelehnt as fehler:
            ergebnis = f"fehler: {fehler}"[:200]
        conn.execute(
            "INSERT INTO projekt.termin_antworten (message_id, email_event_id, uid, methode, ergebnis)"
            " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (message_id) DO NOTHING",
            (message_id, mail["id"], uid or "", methode or "?", ergebnis))
    return ergebnis


# ── Feed (webcal) ─────────────────────────────────────────────────────────

def feed_termine(conn, *, tage_zurueck: int = 90, tage_voraus: int = 730) -> tuple[list[dict], list[dict]]:
    jetzt = datetime.now(UTC)
    von, bis = jetzt - timedelta(days=tage_zurueck), jetzt + timedelta(days=tage_voraus)
    termine = [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE beginn < %s AND ende > %s AND (status = 'geplant' OR abgesagt_am > %s) ORDER BY beginn, id",
        (bis, von, jetzt - timedelta(days=30)))]
    meilensteine = [dict(zip(("id", "art", "bezeichnung", "faellig_am", "projekt_name"), r)) for r in conn.execute(
        "SELECT m.id, m.art, m.bezeichnung, m.faellig_am, p.name FROM projekt.meilensteine m"
        " JOIN projekt.projekte p ON p.id = m.projekt_id"
        " WHERE m.art = ANY(%s) AND m.erledigt_am IS NULL AND m.faellig_am BETWEEN %s AND %s"
        " ORDER BY m.faellig_am, m.id", (list(FEED_MEILENSTEIN_ARTEN), von.date(), bis.date()))]
    return termine, meilensteine


def feed_ics(conn) -> bytes:
    termine, meilensteine = feed_termine(conn)
    return ical.vcalendar_publish(termine, meilensteine)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def feed_link(conn, username: str) -> dict | None:
    row = conn.execute(
        "SELECT erstellt_am, zuletzt_abgerufen_am FROM projekt.kalender_feeds"
        " WHERE username = %s AND widerrufen_am IS NULL ORDER BY id DESC LIMIT 1", (username,)).fetchone()
    return {"erstellt_am": row[0], "zuletzt_abgerufen_am": row[1]} if row else None


def feed_neu(conn, username: str, *, akteur: str) -> str:
    """Neues Token (alte werden widerrufen); Klartext kommt nur hier zurueck."""
    token = secrets.token_urlsafe(32)
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE projekt.kalender_feeds SET widerrufen_am = now() WHERE username = %s AND widerrufen_am IS NULL",
                     (username,))
        conn.execute("INSERT INTO projekt.kalender_feeds (username, token_hash) VALUES (%s, %s)",
                     (username, _token_hash(token)))
        audit_schreiben(conn, akteur, "kalender_feed_neu", erfolg=True, nutzlast={"username": username})
    return token


def feed_widerrufen(conn, username: str, *, akteur: str) -> int:
    conn.rollback()
    with conn.transaction():
        cur = conn.execute("UPDATE projekt.kalender_feeds SET widerrufen_am = now() WHERE username = %s AND widerrufen_am IS NULL",
                           (username,))
        audit_schreiben(conn, akteur, "kalender_feed_widerrufen", erfolg=True, nutzlast={"username": username})
        return cur.rowcount


def feed_nutzer_fuer_token(conn, token: str) -> str | None:
    if not token or len(token) < 20:
        return None
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            "UPDATE projekt.kalender_feeds SET zuletzt_abgerufen_am = now()"
            " WHERE token_hash = %s AND widerrufen_am IS NULL RETURNING username", (_token_hash(token),)).fetchone()
    return row[0] if row else None
