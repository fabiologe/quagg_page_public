"""HTTP-Schicht des Pedanten. Fachlogik lebt in core/ — hier nur Uebersetzung.

Alle Endpunkte haengen hinter dem ADMIN-Gate (router-weite Dependency,
fail-closed): Buchhaltung ist seit 2026-08 nur fuer die Rolle ADMIN —
der Client-Route-Guard ist Kosmetik, DIES ist der Tuersteher.
Registriert in app/main.py unter /FastAPI/pedant; der Vue-Client ruft
/api/pedant/... (nginx und Vite schreiben /api auf /FastAPI um).
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.api.deps import get_current_active_user
from app.core.rollen import Rolle, mindestens

from . import db
from .core import ablage, belege, hashkette, journal, kosit
from .core.audit import audit_schreiben

log = logging.getLogger(__name__)

_internal_gate = mindestens(Rolle.ADMIN)

router = APIRouter(dependencies=[Depends(_internal_gate)])

# Phase 3 (Stammdaten + Rechnungen) lebt in einer eigenen Datei — das Gate
# dieses Routers vererbt sich auf alle eingehaengten Routen.
from .router_rechnungen import router_rechnungen  # noqa: E402
router.include_router(router_rechnungen)
from .router_geld import router_geld  # noqa: E402
router.include_router(router_geld)
from .router_bank import router_bank  # noqa: E402
router.include_router(router_bank)
from .router_export import router_export  # noqa: E402
router.include_router(router_export)


class BuchungEingabe(BaseModel):
    buchungsdatum: date
    belegdatum: date
    sollkonto: str
    habenkonto: str
    betrag_cent: int
    buchungstext: str
    steuerschluessel: str = ""
    belegreferenz: str = ""


class StornoEingabe(BaseModel):
    grund: str


@router.get("/status")
def status_lesen():
    ziel = db.aktives_ziel()
    try:
        with db.pool(ziel).connection() as conn:
            werte = journal.status(conn)
    except Exception as fehler:  # noqa: BLE001 — Status soll den Ausfall MELDEN, nicht 500en
        log.warning("pedant status: db nicht erreichbar: %s", fehler)
        return {"umgebung": ziel, "db_erreichbar": False}
    return {"umgebung": ziel, "db_erreichbar": True,
            "kosit_bereit": kosit.bereit() is None, **werte}


@router.get("/kette")
def kette_lesen():
    with db.pool().connection() as conn:
        bericht = hashkette.kette_pruefen(conn)
    return {"ok": bericht.ok, "zeilen_geprueft": bericht.zeilen_geprueft,
            "bruch_bei_nr": bericht.bruch_bei_nr, "grund": bericht.grund}


@router.get("/konten")
def konten_lesen():
    with db.pool().connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT kontonr, bezeichnung, kontoart FROM konten"
            " WHERE aktiv ORDER BY kontonr"
        )
        return [{"kontonr": nr, "bezeichnung": bez, "kontoart": art}
                for nr, bez, art in cur]


@router.get("/buchungen")
def buchungen_lesen(limit: int = Query(default=50, ge=1, le=500)):
    with db.pool().connection() as conn:
        return journal.letzte_buchungen(conn, limit=limit)


@router.post("/buchungen", status_code=201)
def buchung_anlegen(eingabe: BuchungEingabe, nutzer=Depends(_internal_gate)):
    with db.pool().connection() as conn:
        try:
            return journal.buchung_anlegen(
                conn, akteur=nutzer.username, **eingabe.model_dump())
        except journal.BuchungAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router.post("/buchungen/{nr}/storno", status_code=201)
def storno_anlegen(nr: int, eingabe: StornoEingabe, nutzer=Depends(_internal_gate)):
    with db.pool().connection() as conn:
        try:
            return journal.storno_anlegen(
                conn, nr_original=nr, grund=eingabe.grund, akteur=nutzer.username)
        except journal.BuchungAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


# ── Belege (Phase 2) ─────────────────────────────────────────────────────────

class BelegFelderEingabe(BaseModel):
    lieferant: str
    belegdatum: date
    netto_cent: int
    steuersatz: int
    brutto_cent: int


class FreigabeEingabe(BaseModel):
    sollkonto: str
    geldkonto: str = belege.STANDARD_GELDKONTO
    buchungsdatum: date | None = None
    buchungstext: str | None = None


class VerwerfenEingabe(BaseModel):
    grund: str


@router.post("/belege", status_code=201)
async def beleg_hochladen(datei: UploadFile = File(...), nutzer=Depends(_internal_gate)):
    try:
        ergebnis = await ablage.beleg_speichern(datei, jahr=date.today().year)
    except (ablage.AblageAbgelehnt, ablage.AblageNichtBereit) as fehler:
        # Abgelehnte Uploads hinterlassen keine Datei, aber eine Audit-Spur —
        # sonst steht im Log nur ein nacktes 422 (Prod-Befund 24.08.).
        with db.pool().connection() as conn:
            conn.rollback()
            with conn.transaction():
                audit_schreiben(conn, nutzer.username, "beleg_anlegen", erfolg=False,
                                nutzlast={"original_name": datei.filename or "",
                                          "grund": str(fehler)})
        status = 503 if isinstance(fehler, ablage.AblageNichtBereit) else 422
        raise HTTPException(status_code=status, detail=str(fehler))
    with db.pool().connection() as conn:
        try:
            return belege.beleg_anlegen(conn, ergebnis=ergebnis, akteur=nutzer.username)
        except belege.BelegDuplikat as fehler:
            raise HTTPException(status_code=409, detail={
                "grund": "duplikat", "belegnummer": fehler.belegnummer,
                "status": fehler.status})


@router.get("/belege")
def belege_lesen(status: str | None = Query(default=None),
                 limit: int = Query(default=50, ge=1, le=500),
                 kostenmerkmal: str | None = Query(default=None)):
    if status is not None and status not in (
            "erfasst", "erkannt", "geprueft", "gebucht", "verworfen"):
        raise HTTPException(status_code=422, detail=f"unbekannter status {status!r}")
    with db.pool().connection() as conn:
        return belege.belege_liste(conn, status=status, limit=limit, kostenmerkmal=kostenmerkmal)


class KostenmerkmalEingabe(BaseModel):
    kostenmerkmal: str


@router.put("/belege/{beleg_id}/kostenmerkmal")
def beleg_kostenmerkmal(beleg_id: int, eingabe: KostenmerkmalEingabe,
                        nutzer=Depends(_internal_gate)):
    with db.pool().connection() as conn:
        try:
            return belege.kostenmerkmal_setzen(
                conn, beleg_id=beleg_id, kostenmerkmal=eingabe.kostenmerkmal, akteur=nutzer.username)
        except belege.BelegAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router.get("/belege/{beleg_id}")
def beleg_lesen(beleg_id: int):
    with db.pool().connection() as conn:
        beleg = belege.beleg_lesen(conn, beleg_id)
    if beleg is None:
        raise HTTPException(status_code=404, detail=f"beleg {beleg_id} existiert nicht")
    return beleg


@router.get("/belege/{beleg_id}/datei")
def beleg_datei(beleg_id: int):
    with db.pool().connection() as conn:
        beleg = belege.beleg_lesen(conn, beleg_id)
    if beleg is None:
        raise HTTPException(status_code=404, detail=f"beleg {beleg_id} existiert nicht")
    try:
        pfad = ablage.datei_oeffnen(beleg["ablage_pfad"])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="datei fehlt in der ablage")
    except ablage.AblageNichtBereit as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))
    return FileResponse(pfad, media_type=beleg["mime_typ"],
                        filename=beleg["original_name"])


@router.put("/belege/{beleg_id}")
def beleg_felder(beleg_id: int, eingabe: BelegFelderEingabe,
                 nutzer=Depends(_internal_gate)):
    if eingabe.steuersatz not in (0, 7, 19):
        raise HTTPException(status_code=422, detail="steuersatz muss 0, 7 oder 19 sein")
    with db.pool().connection() as conn:
        try:
            return belege.felder_speichern(
                conn, beleg_id=beleg_id, akteur=nutzer.username,
                **eingabe.model_dump())
        except belege.BelegAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router.post("/belege/{beleg_id}/freigeben")
def beleg_freigeben(beleg_id: int, eingabe: FreigabeEingabe,
                    nutzer=Depends(_internal_gate)):
    with db.pool().connection() as conn:
        try:
            ergebnis = belege.freigeben(
                conn, beleg_id=beleg_id, akteur=nutzer.username,
                **eingabe.model_dump())
        except (belege.BelegAbgelehnt, journal.BuchungAbgelehnt) as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
    # 201 fuer die frische Buchung, 200 fuer die idempotente Wiederholung.
    if ergebnis["bereits_gebucht"]:
        return ergebnis
    return JSONResponse(status_code=201, content=jsonable_encoder(ergebnis))


@router.post("/belege/{beleg_id}/verwerfen")
def beleg_verwerfen(beleg_id: int, eingabe: VerwerfenEingabe,
                    nutzer=Depends(_internal_gate)):
    with db.pool().connection() as conn:
        try:
            return belege.verwerfen(conn, beleg_id=beleg_id, grund=eingabe.grund,
                                    akteur=nutzer.username)
        except belege.BelegAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
