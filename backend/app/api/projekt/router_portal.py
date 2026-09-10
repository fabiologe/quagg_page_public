"""Kundenportal-Routen: fuer jeden aktiven Nutzer (CLIENT oder INTERNAL) — er sieht
ausschliesslich Projekte, die ihm freigegeben sind. Registriert unter /FastAPI/portal."""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_active_user
from app.api.pedant import db

from .core import portal

router_portal = APIRouter(dependencies=[Depends(get_current_active_user)])


@router_portal.get("/projekte")
def portal_projekte(nutzer=Depends(get_current_active_user)):
    with db.pool().connection() as conn:
        return portal.sicht(conn, nutzer.username)
