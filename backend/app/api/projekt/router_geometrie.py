"""Der Server-Kernel der CDE (Teil XIV, G7) — unter /FastAPI/geometrie.

Zwei Endpunkte, mehr braucht der Client nicht:
  GET  /faehigkeiten   was der Server rechnet und wie viel — der Client
                       SPERRT Server-Operationen mit Grund, wenn das nicht
                       antwortet (Gesetz 10: kein toter Knopf)
  POST /op             Meshpaket rein, Meshpaket raus (application/octet-stream)

Fehler tragen Klassen: 413 ueber den Limits, 422 fachlich nicht rechenbar
(offener Koerper, Formbruch, invertierter Schnitt), 504 zu langsam.
Rechnen darf, wer mindestens WERKSTUDENT ist — dieselbe Schwelle wie fuers
Schreiben in die Buero-Ablage; die Faehigkeiten liest jeder Angemeldete.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.deps import get_current_active_user
from app.core.rollen import Rolle, mindestens

from .core import geometrie

_gate = mindestens(Rolle.WERKSTUDENT)

router_geometrie = APIRouter(dependencies=[Depends(get_current_active_user)])


@router_geometrie.get("/faehigkeiten")
def geometrie_faehigkeiten():
    return geometrie.faehigkeiten()


@router_geometrie.post("/op")
async def geometrie_op(request: Request, nutzer=Depends(_gate)):
    daten = await request.body()
    try:
        antwort = geometrie.rechne(daten)
    except geometrie.GeometrieZuGross as fehler:
        raise HTTPException(status_code=413, detail=str(fehler))
    except geometrie.GeometrieAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    except geometrie.GeometrieZeit as fehler:
        raise HTTPException(status_code=504, detail=str(fehler))
    return Response(content=antwort, media_type="application/octet-stream")
