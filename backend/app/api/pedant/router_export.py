"""HTTP-Schicht Phase 6: Steuerberater-Export (INTERNAL-Gate vererbt)."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response

from . import db
from .core import datev, export

router_export = APIRouter()


def _datev_zuordnung(conn) -> tuple:
    with conn.cursor() as cur:
        cur.execute("SELECT datev_berater, datev_mandant FROM firmendaten WHERE id = 1")
        berater_text, mandant_text = cur.fetchone()
    try:
        berater = int(berater_text) if berater_text.strip() else datev.STANDARD_BERATER
        mandant = int(mandant_text) if mandant_text.strip() else datev.STANDARD_MANDANT
    except ValueError:
        raise HTTPException(status_code=422,
                            detail="datev_berater/datev_mandant in den Firmendaten"
                                   " muessen Zahlen sein")
    return berater, mandant


@router_export.get("/export/pruefliste")
def export_pruefliste(von: date = Query(...), bis: date = Query(...)):
    with db.pool().connection() as conn:
        return export.pruefliste(conn, von=von, bis=bis)


@router_export.get("/export/extf")
def export_extf(von: date = Query(...), bis: date = Query(...)):
    with db.pool().connection() as conn:
        berater, mandant = _datev_zuordnung(conn)
        buchungen = export.buchungen_im_zeitraum(conn, von=von, bis=bis)
    try:
        daten = datev.extf_erzeugen(buchungen, von=von, bis=bis,
                                    berater=berater, mandant=mandant)
    except datev.DatevAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    return Response(content=daten, media_type="text/csv; charset=windows-1252",
                    headers={"Content-Disposition":
                             f'attachment; filename="{datev.dateiname(von, bis)}"'})


@router_export.get("/export/belege")
def export_belege(von: date = Query(...), bis: date = Query(...)):
    if von > bis:
        raise HTTPException(status_code=422, detail="von liegt nach bis")
    with db.pool().connection() as conn:
        daten = export.beleg_buendel(conn, von=von, bis=bis)
    name = f"Belege_{von.strftime('%Y%m%d')}_{bis.strftime('%Y%m%d')}.zip"
    return Response(content=daten, media_type="application/zip",
                    headers={"Content-Disposition":
                             f'attachment; filename="{name}"'})
