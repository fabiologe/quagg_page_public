"""HTTP-Schicht Phase 5: Bankimport + Kontoabgleich (INTERNAL-Gate vererbt)."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.api.deps import get_current_active_user

from . import db
from .core import abgleich, bankimport

router_bank = APIRouter()

MAX_IMPORT = 5 * 1024 * 1024   # Bank-Exporte sind klein; 5 MB sind grosszuegig


class ZuordnenEingabe(BaseModel):
    rechnung_id: int | None = None
    beleg_id: int | None = None


class GrundEingabe(BaseModel):
    grund: str


@router_bank.post("/bank/import", status_code=201)
async def bank_import(datei: UploadFile = File(...),
                      nutzer=Depends(get_current_active_user)):
    daten = await datei.read(MAX_IMPORT + 1)
    if len(daten) > MAX_IMPORT:
        raise HTTPException(status_code=422, detail="datei groesser als 5 MB")
    try:
        bewegungen = bankimport.datei_lesen(daten, datei.filename or "")
    except bankimport.ImportAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    with db.pool().connection() as conn:
        return abgleich.importieren(conn, bewegungen, akteur=nutzer.username)


@router_bank.get("/bank")
def bank_liste(status: str | None = Query(default=None),
               limit: int = Query(default=200, ge=1, le=1000)):
    if status is not None and status not in ("unabgeglichen", "zugeordnet", "ignoriert"):
        raise HTTPException(status_code=422, detail=f"unbekannter status {status!r}")
    with db.pool().connection() as conn:
        return abgleich.bewegungen_liste(conn, status=status, limit=limit)


@router_bank.get("/bank/{bewegung_id}/vorschlaege")
def bank_vorschlaege(bewegung_id: int):
    with db.pool().connection() as conn:
        bewegung = abgleich.bewegung_lesen(conn, bewegung_id)
        if bewegung is None:
            raise HTTPException(status_code=404,
                                detail=f"bewegung {bewegung_id} existiert nicht")
        return abgleich.vorschlaege(conn, bewegung)


@router_bank.post("/bank/{bewegung_id}/zuordnen")
def bank_zuordnen(bewegung_id: int, eingabe: ZuordnenEingabe,
                  nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return abgleich.zuordnen(conn, bewegung_id=bewegung_id,
                                     rechnung_id=eingabe.rechnung_id,
                                     beleg_id=eingabe.beleg_id,
                                     akteur=nutzer.username)
        except abgleich.AbgleichAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router_bank.post("/bank/{bewegung_id}/ignorieren")
def bank_ignorieren(bewegung_id: int, eingabe: GrundEingabe,
                    nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return abgleich.ignorieren(conn, bewegung_id=bewegung_id,
                                       grund=eingabe.grund, akteur=nutzer.username)
        except abgleich.AbgleichAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router_bank.post("/bank/{bewegung_id}/loesen")
def bank_loesen(bewegung_id: int, eingabe: GrundEingabe,
                nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return abgleich.loesen(conn, bewegung_id=bewegung_id,
                                   grund=eingabe.grund, akteur=nutzer.username)
        except abgleich.AbgleichAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router_bank.post("/bank/auto-abgleich")
def bank_auto(nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        return abgleich.auto_abgleich(conn, akteur=nutzer.username)
