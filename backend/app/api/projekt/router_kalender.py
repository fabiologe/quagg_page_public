"""Kalender-Routen (Termine, Einladungen, Antworten, Feed-Token) unter /FastAPI/kalender.

Eigener Router, weil router.py mit GET /{projekt_id} jeden literalen Pfad
schluckt. Lesen ab WERKSTUDENT, Schreiben/Einladen ab MITARBEITER. Der Feed
selbst (router_feed) laeuft OHNE Auth — Outlook/Google holen ihn nur per URL.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.api.pedant import db
from app.core.config import get_settings
from app.core.rollen import Rolle, mindestens
from app.db.database import get_session
from app.services import email_sender, signatur

from .core import kalender, projekte
from .core.env import env
from .router import _uebersetzt

log = logging.getLogger(__name__)

_gate = mindestens(Rolle.WERKSTUDENT)
_schreib_gate = mindestens(Rolle.MITARBEITER)

router_kalender = APIRouter(dependencies=[Depends(_gate)])
router_feed = APIRouter()


# ── Eingaben ──────────────────────────────────────────────────────────────

class TeilnehmerEingabe(BaseModel):
    email: str
    name: str = ""
    rolle: str = "REQ-PARTICIPANT"


class EinladungOptionen(BaseModel):
    betreff: str | None = None
    nachricht: str | None = None
    nur_neue: bool = False


class TerminEingabe(BaseModel):
    titel: str
    beginn: str                       # ISO-8601 mit Offset (oder Datum bei ganztag)
    ende: str | None = None           # ganztag: letzter Tag INKLUSIV
    ganztag: bool = False
    ort: str = ""
    besprechungslink: str = ""
    beschreibung: str = ""
    projekt_id: int | None = None
    teilnehmer: list[TeilnehmerEingabe] = Field(default_factory=list)
    einladung: EinladungOptionen | None = None   # gesetzt = sofort einladen


class TerminAenderung(BaseModel):
    titel: str | None = None
    beginn: str | None = None
    ende: str | None = None
    ganztag: bool | None = None
    ort: str | None = None
    besprechungslink: str | None = None
    beschreibung: str | None = None
    projekt_id: int | None = None
    teilnehmer: list[TeilnehmerEingabe] | None = None


# ── Helfer ────────────────────────────────────────────────────────────────

def _sender(session: Session, nutzer):
    """Sende-Funktion fuer den Kern: bindet SQLite-Session und die Signatur des Absenders."""
    def senden(**kw):
        return email_sender.send_email(
            cc=[], attachments=[], reply_to_event=None, session=session,
            signatur_daten=signatur.daten_fuer(nutzer, session), **kw)
    return senden


def _mit_versand(aufruf):
    try:
        return _uebersetzt(aufruf)
    except email_sender.VersandFehler as exc:
        raise HTTPException(status_code=502, detail=str(exc))


def _konto() -> tuple[str, str]:
    z = email_sender.smtp_zugang()
    return z["email"], get_settings().SIGNATUR_FIRMA or "Quagg Engineering"


def _sync_best_effort(conn) -> dict:
    try:
        return kalender.antworten_verarbeiten(conn)
    except Exception as exc:  # noqa: BLE001 — Sync ist Beiwerk, der Kalender muss trotzdem laden
        log.warning("Kalender-Antworten nicht verarbeitet: %s", exc)
        conn.rollback()
        return {"fehler": str(exc)}


# ── Termine ───────────────────────────────────────────────────────────────

@router_kalender.get("")
def kalender_lesen(von: str = Query(...), bis: str = Query(...), projekt_id: int | None = None,
                   mit_abgesagten: bool = False):
    with db.pool().connection() as conn:
        sync = _sync_best_effort(conn)
        termine = _uebersetzt(lambda: kalender.liste(conn, von, bis, projekt_id=projekt_id, mit_abgesagten=mit_abgesagten))
        conn.rollback()
        meilensteine = [dict(zip(("id", "projekt_id", "projekt_name", "art", "bezeichnung", "faellig_am", "erledigt_am"), r))
                        for r in conn.execute(
                            "SELECT m.id, m.projekt_id, p.name, m.art, m.bezeichnung, m.faellig_am, m.erledigt_am"
                            " FROM projekt.meilensteine m JOIN projekt.projekte p ON p.id = m.projekt_id"
                            " WHERE m.faellig_am >= %s::date AND m.faellig_am <= %s::date"
                            + (" AND m.projekt_id = %s" if projekt_id is not None else "")
                            + " ORDER BY m.faellig_am, m.id",
                            (von[:10], bis[:10], *([projekt_id] if projekt_id is not None else [])))]
        return {"termine": termine, "meilensteine": meilensteine, "sync": sync}


@router_kalender.post("/antworten-verarbeiten")
def antworten_verarbeiten(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: kalender.antworten_verarbeiten(conn, akteur=nutzer.username))


@router_kalender.post("/termine", status_code=201)
def termin_anlegen(eingabe: TerminEingabe, nutzer=Depends(_schreib_gate), session: Session = Depends(get_session)):
    konto, konto_name = _konto()
    with db.pool().connection() as conn:
        def lauf():
            t = kalender.anlegen(conn, titel=eingabe.titel, beginn=eingabe.beginn, ende=eingabe.ende, ganztag=eingabe.ganztag,
                                 ort=eingabe.ort, besprechungslink=eingabe.besprechungslink, beschreibung=eingabe.beschreibung,
                                 projekt_id=eingabe.projekt_id, teilnehmer=[x.model_dump() for x in eingabe.teilnehmer],
                                 akteur=nutzer.username, organisator_email=konto, organisator_name=konto_name)
            if eingabe.einladung is not None:
                t = kalender.einladen(conn, t["id"], akteur=nutzer.username, senden=_sender(session, nutzer),
                                      betreff=eingabe.einladung.betreff, nachricht=eingabe.einladung.nachricht)
            return t
        return _mit_versand(lauf)


@router_kalender.get("/termine/{termin_id}")
def termin_lesen(termin_id: int):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: kalender.lesen(conn, termin_id))


@router_kalender.put("/termine/{termin_id}")
def termin_aendern(termin_id: int, eingabe: TerminAenderung, nutzer=Depends(_schreib_gate)):
    felder = eingabe.model_dump(exclude_unset=True)
    teilnehmer = felder.pop("teilnehmer", None)
    with db.pool().connection() as conn:
        def lauf():
            t = kalender.aendern(conn, termin_id, felder, akteur=nutzer.username) if felder else kalender.lesen(conn, termin_id)
            if teilnehmer is not None:
                t = kalender.teilnehmer_setzen(conn, termin_id, teilnehmer, akteur=nutzer.username)
            return t
        return _uebersetzt(lauf)


@router_kalender.delete("/termine/{termin_id}")
def termin_entfernen(termin_id: int, nutzer=Depends(_schreib_gate), session: Session = Depends(get_session)):
    """Nie eingeladen -> loeschen; sonst Absage (CANCEL an alle Eingeladenen)."""
    with db.pool().connection() as conn:
        def lauf():
            t = kalender.lesen(conn, termin_id)
            if t["eingeladen_am"] is None or t["status"] == "abgesagt":
                kalender.loeschen(conn, termin_id, akteur=nutzer.username)
                return {"geloescht": True, "id": termin_id}
            return kalender.absagen(conn, termin_id, akteur=nutzer.username, senden=_sender(session, nutzer))
        return _mit_versand(lauf)


@router_kalender.post("/termine/{termin_id}/einladen")
def termin_einladen(termin_id: int, optionen: EinladungOptionen = EinladungOptionen(), nutzer=Depends(_schreib_gate),
                    session: Session = Depends(get_session)):
    with db.pool().connection() as conn:
        return _mit_versand(lambda: kalender.einladen(conn, termin_id, akteur=nutzer.username, senden=_sender(session, nutzer),
                                                      betreff=optionen.betreff, nachricht=optionen.nachricht,
                                                      nur_neue=optionen.nur_neue))


# ── Akte-Varianten: Antwort ist die frische Projektakte (Muster router._akte_nach) ──

def _akte_nach(conn, projekt_id: int, aufruf):
    return _mit_versand(lambda: projekte.abschnitt_aktion(conn, projekt_id, aufruf))


@router_kalender.post("/projekte/{projekt_id}/termine", status_code=201)
def akte_termin_anlegen(projekt_id: int, eingabe: TerminEingabe, nutzer=Depends(_schreib_gate),
                        session: Session = Depends(get_session)):
    konto, konto_name = _konto()
    with db.pool().connection() as conn:
        def lauf():
            t = kalender.anlegen(conn, titel=eingabe.titel, beginn=eingabe.beginn, ende=eingabe.ende, ganztag=eingabe.ganztag,
                                 ort=eingabe.ort, besprechungslink=eingabe.besprechungslink, beschreibung=eingabe.beschreibung,
                                 projekt_id=projekt_id, teilnehmer=[x.model_dump() for x in eingabe.teilnehmer],
                                 akteur=nutzer.username, organisator_email=konto, organisator_name=konto_name)
            if eingabe.einladung is not None:
                kalender.einladen(conn, t["id"], akteur=nutzer.username, senden=_sender(session, nutzer),
                                  betreff=eingabe.einladung.betreff, nachricht=eingabe.einladung.nachricht)
        return _akte_nach(conn, projekt_id, lauf)


@router_kalender.put("/projekte/{projekt_id}/termine/{termin_id}")
def akte_termin_aendern(projekt_id: int, termin_id: int, eingabe: TerminAenderung, nutzer=Depends(_schreib_gate)):
    felder = eingabe.model_dump(exclude_unset=True)
    teilnehmer = felder.pop("teilnehmer", None)
    with db.pool().connection() as conn:
        def lauf():
            if kalender.lesen(conn, termin_id)["projekt_id"] != projekt_id:
                raise kalender.TerminUnbekannt(termin_id)
            if felder:
                kalender.aendern(conn, termin_id, felder, akteur=nutzer.username)
            if teilnehmer is not None:
                kalender.teilnehmer_setzen(conn, termin_id, teilnehmer, akteur=nutzer.username)
        return _akte_nach(conn, projekt_id, lauf)


@router_kalender.delete("/projekte/{projekt_id}/termine/{termin_id}")
def akte_termin_entfernen(projekt_id: int, termin_id: int, nutzer=Depends(_schreib_gate),
                          session: Session = Depends(get_session)):
    with db.pool().connection() as conn:
        def lauf():
            t = kalender.lesen(conn, termin_id)
            if t["projekt_id"] != projekt_id:
                raise kalender.TerminUnbekannt(termin_id)
            if t["eingeladen_am"] is None or t["status"] == "abgesagt":
                kalender.loeschen(conn, termin_id, akteur=nutzer.username)
            else:
                kalender.absagen(conn, termin_id, akteur=nutzer.username, senden=_sender(session, nutzer))
        return _akte_nach(conn, projekt_id, lauf)


@router_kalender.post("/projekte/{projekt_id}/termine/{termin_id}/einladen")
def akte_termin_einladen(projekt_id: int, termin_id: int, optionen: EinladungOptionen = EinladungOptionen(),
                         nutzer=Depends(_schreib_gate), session: Session = Depends(get_session)):
    with db.pool().connection() as conn:
        def lauf():
            if kalender.lesen(conn, termin_id)["projekt_id"] != projekt_id:
                raise kalender.TerminUnbekannt(termin_id)
            kalender.einladen(conn, termin_id, akteur=nutzer.username, senden=_sender(session, nutzer),
                              betreff=optionen.betreff, nachricht=optionen.nachricht, nur_neue=optionen.nur_neue)
        return _akte_nach(conn, projekt_id, lauf)


# ── Feed-Token ────────────────────────────────────────────────────────────

def _feed_urls(token: str) -> dict:
    # PUBLIC_BASE_URL kommt aus backend/.env (gelesen wie in core/office.py)
    basis = env("PUBLIC_BASE_URL", "https://quagg-engineering.org").strip().rstrip("/")
    url = f"{basis}/FastAPI/kalender/feed/{token}.ics"
    return {"url": url, "webcal": "webcal://" + url.split("://", 1)[1]}


@router_kalender.get("/feed-link")
def feed_link(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        info = kalender.feed_link(conn, nutzer.username)
    return {"aktiv": info is not None, **(info or {})}


@router_kalender.post("/feed-link/neu", status_code=201)
def feed_link_neu(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        token = kalender.feed_neu(conn, nutzer.username, akteur=nutzer.username)
        info = kalender.feed_link(conn, nutzer.username)
    return {"aktiv": True, **(info or {}), **_feed_urls(token)}


@router_kalender.delete("/feed-link")
def feed_link_widerrufen(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        anzahl = kalender.feed_widerrufen(conn, nutzer.username, akteur=nutzer.username)
    return {"aktiv": False, "widerrufen": anzahl}


# ── Feed (ohne Auth) ──────────────────────────────────────────────────────

@router_feed.get("/{token}.ics")
def feed_abrufen(token: str):
    with db.pool().connection() as conn:
        username = kalender.feed_nutzer_fuer_token(conn, token)
        if username is None:
            raise HTTPException(status_code=404, detail="Nicht gefunden.")
        daten = kalender.feed_ics(conn)
    return Response(
        content=daten,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="quagg-termine.ics"',
            "Cache-Control": "private, max-age=300",
        },
    )
