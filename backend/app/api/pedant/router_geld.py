"""HTTP-Schicht Phase 4: Geld-Sichten + erwartetes Geld. Wird wie
router_rechnungen in den Haupt-Router eingehaengt (INTERNAL-Gate vererbt)."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import get_current_active_user

from . import db
from .core import geldsichten

router_geld = APIRouter()


class ErwartetEingabe(BaseModel):
    bezeichnung: str
    betrag_cent: int
    erwartet_am: date
    status: str = "angefragt"
    bereits_gestellt_cent: int = 0
    auftraggeber_id: int | None = None
    notiz: str = ""
    projekt_id: int | None = None


class ErwartetAenderung(BaseModel):
    bezeichnung: str | None = None
    betrag_cent: int | None = None
    erwartet_am: date | None = None
    status: str | None = None
    bereits_gestellt_cent: int | None = None
    auftraggeber_id: int | None = None
    notiz: str | None = None
    projekt_id: int | None = None


@router_geld.get("/geld/sichten")
def geld_sichten():
    with db.pool().connection() as conn:
        return geldsichten.sichten(conn)


@router_geld.get("/geld/monatsreihe")
def geld_monatsreihe(zurueck: int = Query(default=6, ge=0, le=24),
                     vor: int = Query(default=6, ge=0, le=24)):
    with db.pool().connection() as conn:
        return geldsichten.monatsreihe(conn, zurueck=zurueck, vor=vor)


@router_geld.get("/geld/erwartet")
def erwartet_liste(erledigte: bool = Query(default=False)):
    with db.pool().connection() as conn:
        return geldsichten.erwartet_liste(conn, mit_erledigten=erledigte)


@router_geld.post("/geld/erwartet", status_code=201)
def erwartet_anlegen(eingabe: ErwartetEingabe,
                     nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return geldsichten.erwartet_anlegen(
                conn, felder=eingabe.model_dump(), akteur=nutzer.username)
        except geldsichten.ErwartetAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router_geld.put("/geld/erwartet/{eintrag_id}")
def erwartet_speichern(eintrag_id: int, eingabe: ErwartetAenderung,
                       nutzer=Depends(get_current_active_user)):
    felder = {name: wert for name, wert in eingabe.model_dump().items()
              if wert is not None}
    with db.pool().connection() as conn:
        try:
            return geldsichten.erwartet_speichern(
                conn, eintrag_id=eintrag_id, felder=felder, akteur=nutzer.username)
        except geldsichten.ErwartetAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
