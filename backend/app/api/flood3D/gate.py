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

from ..flood2D.env_util import env

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


def _entscheide(gegeben: str | None) -> None:
    """Gemeinsamer Vergleich für den direkten Aufruf und die Abhängigkeit."""
    if gate_offen():
        return
    erwartet = launch_passwort()
    if not erwartet:
        raise HTTPException(
            status_code=503,
            detail="Kosten-Gate nicht konfiguriert: FLOOD3D_LAUNCH_PASSWORD "
                   "(oder FLOOD2D_LAUNCH_PASSWORD) in backend/.env setzen. "
                   "Schreiben und Rechnen bleiben bis dahin gesperrt.")
    if gegeben != erwartet:
        raise HTTPException(
            status_code=403,
            detail="Falsches oder fehlendes Passwort — nichts gestartet.")


def pruefe_kosten_gate(request: Request | None = None,
                       payload: dict | None = None) -> None:
    """
    Wirft 403 ohne/mit falschem Passwort, 503 wenn keins konfiguriert ist.

    Das Passwort darf im Kopf ``X-Launch-Password`` stehen (gilt für alle
    Endpunkte, auch die ohne Rumpf) oder als ``launchPassword`` im Rumpf
    (wie bei flood-2D).
    """
    gegeben = request.headers.get(KOPFZEILE) if request is not None else None
    if not gegeben and isinstance(payload, dict):
        gegeben = payload.get("launchPassword")
    _entscheide(gegeben)


async def _passwort_aus_rumpf(request: Request) -> str | None:
    """
    Rückfall für API-Nutzer, die ``launchPassword`` im Rumpf schicken.

    Der Rumpf wird nur angefasst, wenn er klein und JSON ist: Bundle- und
    Artefakt-Uploads gehen in 100-MB-Stücken durch dieselbe Abhängigkeit,
    die will niemand als JSON parsen. (Starlette puffert den Rumpf, der
    Endpunkt bekommt ihn danach unverändert.)
    """
    if not request.headers.get("content-type", "").startswith("application/json"):
        return None
    try:
        laenge = int(request.headers.get("content-length") or 0)
    except ValueError:
        return None
    if laenge > 1_000_000:
        return None
    try:
        rumpf = await request.json()
    except Exception:  # noqa: BLE001 — kaputtes JSON ist Sache des Endpunkts
        return None
    return rumpf.get("launchPassword") if isinstance(rumpf, dict) else None


async def schreib_gate(request: Request) -> None:
    """
    Als Router-Abhängigkeit: JEDE schreibende Anfrage braucht das Passwort.

    Bewusst am Router statt an 22 einzelnen Endpunkten — so ist auch der
    nächste neue Endpunkt geschützt, ohne dass jemand daran denken muss.
    Lesen bleibt frei: Ansehen kostet nichts, und die Ergebnisansicht soll
    ohne Hürde teilbar bleiben.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    gegeben = request.headers.get(KOPFZEILE) or await _passwort_aus_rumpf(request)
    _entscheide(gegeben)
