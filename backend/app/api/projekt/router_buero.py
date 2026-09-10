"""Buero-Ebene der CDE: projektuebergreifende Vorlagen und Bauteile.

Registriert unter /FastAPI/buero — bewusst NICHT unter /FastAPI/projekte, denn
was hier liegt, gehoert keinem Projekt: Plankoepfe, Blattformate,
Linienstil-Presets, Symbolsaetze, IDS-Regelwerke, KG-Kennwerte. Bisher lagen
sie je Projekt im Repo und fingen in jedem neuen Projekt bei null an.

Die Ablage ist dieselbe wie beim Projekt-Repository (JSON-Datei je Schluessel,
atomar geschrieben, gleiche Schluesselpruefung und Groessengrenze) — nur unter
einem anderen Pfad. Die Umsetzung steht deshalb EINMAL in core/cde.py.

Schreiben darf, wer mindestens WERKSTUDENT ist; lesen jeder angemeldete
Nutzer — Bueroeinstellungen sind kein Geheimnis, aber sie zu aendern wirkt auf
alle Projekte.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_active_user
from app.core.rollen import Rolle, mindestens

from .core import cde, ordner

_gate = mindestens(Rolle.WERKSTUDENT)

router_buero = APIRouter(dependencies=[Depends(get_current_active_user)])


def _uebersetzt(aufruf):
    """Fachfehler -> HTTP. Gleiche Zuordnung wie im Projekt-Router."""
    try:
        return aufruf()
    except cde.CdeUnbekannt as fehler:
        raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
    except cde.CdeAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    except ordner.OrdnerNichtBereit as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))


@router_buero.get("/cde/repo")
def buero_repo_lesen():
    return _uebersetzt(cde.buero_repo_lesen)


@router_buero.put("/cde/repo/{key}")
async def buero_repo_setzen(key: str, request: Request, nutzer=Depends(_gate)):
    wert = await request.json()

    def lauf():
        cde.buero_repo_setzen(key, wert)
        return {"ok": True, "key": key}
    return _uebersetzt(lauf)


@router_buero.delete("/cde/repo/{key}")
def buero_repo_loeschen(key: str, nutzer=Depends(_gate)):
    return _uebersetzt(lambda: {"ok": cde.buero_repo_loeschen(key)})
