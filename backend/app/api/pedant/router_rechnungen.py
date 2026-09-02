"""HTTP-Schicht Phase 3: Stammdaten + Rechnungen. Wird in router.py per
include_router eingehaengt — das router-weite INTERNAL-Gate vererbt sich auf
alle Routen hier; Endpunkte, die den Akteur brauchen, holen sich den Nutzer
ueber die (gecachte) Auth-Dependency."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.deps import get_current_active_user

from . import db
from .core import ablage, kosit, rechnungen, stammdaten

router_rechnungen = APIRouter()


# ── Eingabemodelle ────────────────────────────────────────────────────────────

class FirmendatenEingabe(BaseModel):
    name: str | None = None
    rechtsform_zusatz: str | None = None
    strasse: str | None = None
    plz: str | None = None
    ort: str | None = None
    land: str | None = None
    steuernummer: str | None = None
    ust_id: str | None = None
    iban: str | None = None
    bic: str | None = None
    bank_name: str | None = None
    email: str | None = None
    telefon: str | None = None
    ansprechpartner: str | None = None


class AuftraggeberEingabe(BaseModel):
    name: str
    strasse: str = ""
    plz: str = ""
    ort: str = ""
    land: str = "DE"
    leitweg_id: str
    portal: str
    email: str = ""
    telefon: str = ""
    ansprechpartner: str = ""
    notiz: str = ""


class AuftraggeberAenderung(FirmendatenEingabe):
    # gleiche Optionalitaet, plus Leitweg/Portal/aktiv
    leitweg_id: str | None = None
    portal: str | None = None
    notiz: str | None = None
    aktiv: bool | None = None


class RechnungsKopf(BaseModel):
    auftraggeber_id: int | None = None
    auftrag_referenz: str | None = None
    projekt_id: int | None = None
    rechnungstyp: str | None = None      # '380' | '326'
    rechnungsdatum: date | None = None
    leistung_von: date | None = None
    leistung_bis: date | None = None
    zahlungsziel_tage: int | None = None


class PositionEingabe(BaseModel):
    bezeichnung: str
    menge_tausendstel: int
    einheit: str
    einzelpreis_cent: int
    abschnitt_id: int | None = None   # Projekt-Cockpit: Abschnitt fuer die Kumulation


class ReferenzenEingabe(BaseModel):
    vor_rechnung_ids: list[int]


class VerwerfenEingabe(BaseModel):
    grund: str


class VersandEingabe(BaseModel):
    weg: str


class BezahltEingabe(BaseModel):
    bezahlt: bool
    bezahlt_am: date | None = None


def _gefuellte(modell: BaseModel) -> dict:
    return {name: wert for name, wert in modell.model_dump().items()
            if wert is not None}


# ── Firmendaten ───────────────────────────────────────────────────────────────

@router_rechnungen.get("/firmendaten")
def firmendaten_lesen():
    with db.pool().connection() as conn:
        return stammdaten.firmendaten_lesen(conn)


@router_rechnungen.put("/firmendaten")
def firmendaten_speichern(eingabe: FirmendatenEingabe,
                          nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return stammdaten.firmendaten_speichern(
                conn, felder=_gefuellte(eingabe), akteur=nutzer.username)
        except stammdaten.StammdatenAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


# ── Auftraggeber ─────────────────────────────────────────────────────────────

@router_rechnungen.get("/auftraggeber")
def auftraggeber_liste(alle: bool = Query(default=False)):
    with db.pool().connection() as conn:
        return stammdaten.auftraggeber_liste(conn, nur_aktive=not alle)


@router_rechnungen.post("/auftraggeber", status_code=201)
def auftraggeber_anlegen(eingabe: AuftraggeberEingabe,
                         nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return stammdaten.auftraggeber_anlegen(
                conn, felder=eingabe.model_dump(), akteur=nutzer.username)
        except stammdaten.StammdatenAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


@router_rechnungen.put("/auftraggeber/{auftraggeber_id}")
def auftraggeber_speichern(auftraggeber_id: int, eingabe: AuftraggeberAenderung,
                           nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return stammdaten.auftraggeber_speichern(
                conn, auftraggeber_id=auftraggeber_id,
                felder=_gefuellte(eingabe), akteur=nutzer.username)
        except stammdaten.StammdatenAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))


# ── Rechnungen ───────────────────────────────────────────────────────────────

def _fachfehler(fehler: rechnungen.RechnungAbgelehnt) -> HTTPException:
    return HTTPException(status_code=422, detail={
        "grund": str(fehler), "meldungen": fehler.meldungen})


@router_rechnungen.get("/rechnungen")
def rechnungen_liste(status: str | None = Query(default=None),
                     limit: int = Query(default=100, ge=1, le=500),
                     projekt_id: int | None = Query(default=None)):
    if status is not None and status not in ("entwurf", "gestellt", "bezahlt", "verworfen"):
        raise HTTPException(status_code=422, detail=f"unbekannter status {status!r}")
    with db.pool().connection() as conn:
        return rechnungen.rechnungen_liste(conn, status=status, limit=limit, projekt_id=projekt_id)


@router_rechnungen.post("/rechnungen", status_code=201)
def rechnung_anlegen(eingabe: RechnungsKopf, nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.rechnung_anlegen(
                conn, felder=_gefuellte(eingabe), akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


@router_rechnungen.get("/rechnungen/{rechnung_id}")
def rechnung_lesen(rechnung_id: int):
    with db.pool().connection() as conn:
        rechnung = rechnungen.rechnung_lesen(conn, rechnung_id)
    if rechnung is None:
        raise HTTPException(status_code=404, detail=f"rechnung {rechnung_id} existiert nicht")
    return rechnung


@router_rechnungen.put("/rechnungen/{rechnung_id}")
def rechnung_kopf(rechnung_id: int, eingabe: RechnungsKopf,
                  nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.kopf_speichern(
                conn, rechnung_id=rechnung_id, felder=_gefuellte(eingabe),
                akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


@router_rechnungen.put("/rechnungen/{rechnung_id}/positionen")
def rechnung_positionen(rechnung_id: int, eingabe: list[PositionEingabe],
                        nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.positionen_speichern(
                conn, rechnung_id=rechnung_id,
                positionen=[position.model_dump() for position in eingabe],
                akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


@router_rechnungen.post("/rechnungen/{rechnung_id}/vorpruefung")
def rechnung_vorpruefung(rechnung_id: int, validator: bool = Query(default=False),
                         nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.vorpruefung(
                conn, rechnung_id=rechnung_id, mit_validator=validator,
                akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)
        except kosit.KositNichtBereit as fehler:
            raise HTTPException(status_code=503, detail=str(fehler))


@router_rechnungen.post("/rechnungen/{rechnung_id}/stellen")
def rechnung_stellen(rechnung_id: int, nutzer=Depends(get_current_active_user)):
    from fastapi.encoders import jsonable_encoder
    from fastapi.responses import JSONResponse
    with db.pool().connection() as conn:
        try:
            ergebnis = rechnungen.stellen(
                conn, rechnung_id=rechnung_id, akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)
        except kosit.KositNichtBereit as fehler:
            raise HTTPException(status_code=503, detail=str(fehler))
    if ergebnis["bereits_gestellt"]:
        return ergebnis
    return JSONResponse(status_code=201, content=jsonable_encoder(ergebnis))


@router_rechnungen.post("/rechnungen/{rechnung_id}/verwerfen")
def rechnung_verwerfen(rechnung_id: int, eingabe: VerwerfenEingabe,
                       nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.verwerfen(conn, rechnung_id=rechnung_id,
                                        grund=eingabe.grund, akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


@router_rechnungen.post("/rechnungen/{rechnung_id}/versand")
def rechnung_versand(rechnung_id: int, eingabe: VersandEingabe,
                     nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.versand_vermerken(
                conn, rechnung_id=rechnung_id, weg=eingabe.weg, akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


@router_rechnungen.post("/rechnungen/{rechnung_id}/bezahlt")
def rechnung_bezahlt(rechnung_id: int, eingabe: BezahltEingabe,
                     nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        try:
            return rechnungen.bezahlt_setzen(
                conn, rechnung_id=rechnung_id, bezahlt=eingabe.bezahlt,
                bezahlt_am=eingabe.bezahlt_am, akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise _fachfehler(fehler)


def _rechnung_datei(rechnung_id: int, pfad_feld: str, media_type: str,
                    endung: str) -> FileResponse:
    with db.pool().connection() as conn:
        rechnung = rechnungen.rechnung_lesen(conn, rechnung_id)
    if rechnung is None or not rechnung.get(pfad_feld):
        raise HTTPException(status_code=404, detail="datei nicht vorhanden")
    try:
        pfad = ablage.rechnung_datei_oeffnen(rechnung[pfad_feld])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="datei fehlt in der ablage")
    except ablage.AblageNichtBereit as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))
    return FileResponse(pfad, media_type=media_type,
                        filename=f"{rechnung['rechnungsnummer']}{endung}")


@router_rechnungen.get("/rechnungen/{rechnung_id}/xml")
def rechnung_xml(rechnung_id: int):
    return _rechnung_datei(rechnung_id, "xml_pfad", "application/xml", ".xml")


@router_rechnungen.get("/rechnungen/{rechnung_id}/bericht")
def rechnung_bericht(rechnung_id: int):
    return _rechnung_datei(rechnung_id, "bericht_pfad", "text/html", "-pruefbericht.html")


@router_rechnungen.put("/rechnungen/{rechnung_id}/referenzen")
def rechnung_referenzen(rechnung_id: int, eingabe: ReferenzenEingabe,
                        nutzer=Depends(get_current_active_user)):
    """Vorrechnungen (Abschlaege, Typ 326) einer Schlussrechnung — BG-3 in der XRechnung."""
    with db.pool().connection() as conn:
        try:
            return rechnungen.referenzen_setzen(
                conn, rechnung_id=rechnung_id, vor_rechnung_ids=eingabe.vor_rechnung_ids, akteur=nutzer.username)
        except rechnungen.RechnungAbgelehnt as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
