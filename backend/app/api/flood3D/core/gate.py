"""
Kosten-Gate: flood-3D steht öffentlich im Netz, und jeder Lauf verbrennt
entweder Server-Kerne oder — über RunPod — echtes Geld auf Fabios Rechnung.
Ohne Passwort läuft deshalb NICHTS an, auch nicht bei direktem API-Aufruf
unter Umgehung der Oberfläche (Muster von flood2D/router.py, dort seit dem
RunPod-Scharfschalten in Betrieb).

Unterschied zu flood-2D bewusst: dort vergleicht auch der Client gegen eine
im Bundle stehende Kopie des Passworts — die ist für jeden lesbar, der die
Seite öffnet. Hier entscheidet ALLEIN der Server; der Client fragt nur ab
und reicht durch.

Passwortquelle (erste nicht leere gewinnt):
    FLOOD3D_LAUNCH_PASSWORD   eigenes Passwort für flood-3D
    FLOOD2D_LAUNCH_PASSWORD   Rückfall — beide Werkzeuge teilen sich sonst
                              dieselbe Rechnung und dasselbe Publikum

Ist KEINS gesetzt, wird gesperrt statt geöffnet (503). Ein vergessenes
Passwort darf nicht in ein offenes Scheunentor umschlagen — genau der Fall,
der die Rechnung hochtreibt. Für Tests und die lokale Entwicklung hebt
``FLOOD3D_GATE_OFF=1`` das Gate ausdrücklich auf.
"""
from __future__ import annotations

from fastapi import HTTPException, Request

from ...flood2D.env_util import env

KOPFZEILE = "X-Launch-Password"


def launch_passwort() -> str | None:
    """Konfiguriertes Passwort oder ``None``, wenn keins hinterlegt ist."""
    for name in ("FLOOD3D_LAUNCH_PASSWORD", "FLOOD2D_LAUNCH_PASSWORD"):
        wert = (env(name, "") or "").strip()
        if wert:
            return wert
    return None


def gate_offen() -> bool:
    """Ausdrücklich abgeschaltet (Tests, Entwicklung)."""
    return env("FLOOD3D_GATE_OFF", "").strip() == "1"


def pruefe_kosten_gate(request: Request | None = None,
                       payload: dict | None = None) -> None:
    """
    Wirft 403 ohne/mit falschem Passwort, 503 wenn keins konfiguriert ist.

    Das Passwort darf im Kopf ``X-Launch-Password`` stehen (gilt für alle
    Endpunkte, auch die ohne Rumpf) oder als ``launchPassword`` im Rumpf
    (wie bei flood-2D).
    """
    if gate_offen():
        return
    erwartet = launch_passwort()
    if not erwartet:
        raise HTTPException(
            status_code=503,
            detail="Kosten-Gate nicht konfiguriert: FLOOD3D_LAUNCH_PASSWORD "
                   "(oder FLOOD2D_LAUNCH_PASSWORD) in backend/.env setzen. "
                   "Läufe bleiben bis dahin gesperrt.")
    gegeben = None
    if request is not None:
        gegeben = request.headers.get(KOPFZEILE)
    if not gegeben and isinstance(payload, dict):
        gegeben = payload.get("launchPassword")
    if gegeben != erwartet:
        raise HTTPException(
            status_code=403,
            detail="Falsches oder fehlendes Passwort — nichts gestartet.")
