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


# ── Netz-Qualitätstor ────────────────────────────────────────────────────────
# r007 (2026-08-13): checkMesh fiel durch (Schiefe 7,2, 60 % der Zellen
# fehlten), und der Solver rechnete kommentarlos 2,5 Stunden auf dem kaputten
# Netz. Das Tor sitzt VOR dem Solver: ein durchgefallenes Netz bricht ab,
# bevor Geld verbrannt wird — mit Befunden, die der Nutzer sieht.
NETZ_SKEW_FEHLER = 4.0        # == maxInternalSkewness im snappy-Dict
NETZ_NONORTHO_WARNUNG = 65.0
ZELLEN_ABWEICHUNG_WARNUNG = 0.25


class NetzTorFehler(RuntimeError):
    """Netz taugt nicht — Lauf soll VOR dem Solver enden."""

    def __init__(self, meldung: str, befunde: list[dict]):
        super().__init__(meldung)
        self.befunde = befunde


def netz_tor(cm: dict, vorschau: dict | None = None) -> list[dict]:
    """
    Befunde aus dem checkMesh-Ergebnis (Schema wie validate._finding, plus
    wert/grenze/quelle). Wirft ``NetzTorFehler``, wenn mindestens ein
    ``fehler`` dabei ist.

    ``vorschau``: mesh_preview.json des Falls (cells, ohne_verfeinerung) —
    Zellabweichung ist nur eine WARNUNG (die Vorschau ist laut Entscheidung
    nur eine Vorschau) und wird bei ohne_verfeinerung uebersprungen (dort
    ist die Zellzahl eine bewusste Untergrenze).
    """
    befunde: list[dict] = []

    def b(severity, message, **extra):
        befunde.append({"object_id": "netz", "severity": severity,
                        "message": message, **extra})

    skew = cm.get("max_skewness")
    if skew is not None and float(skew) > NETZ_SKEW_FEHLER:
        b("fehler", f"Zellschiefe {float(skew):g} über der Grenze "
                    f"{NETZ_SKEW_FEHLER:g} — solche Zellen kippen den Solver "
                    "oder verfälschen die Lösung.",
          wert=float(skew), grenze=NETZ_SKEW_FEHLER, quelle="checkmesh")
    if cm.get("failed_checks"):
        b("fehler", f"checkMesh meldet {cm['failed_checks']} durchgefallene "
                    "Prüfung(en).",
          wert=cm["failed_checks"], grenze=0, quelle="checkmesh")
    elif not cm.get("checkmesh_ok"):
        b("fehler", "checkMesh meldet kein »Mesh OK« — Netz unbrauchbar.",
          quelle="checkmesh")
    nonortho = cm.get("max_non_ortho")
    if nonortho is not None and float(nonortho) > NETZ_NONORTHO_WARNUNG:
        b("warnung", f"Nichtorthogonalität {float(nonortho):g}° über "
                     f"{NETZ_NONORTHO_WARNUNG:g}° — Löser braucht mehr "
                     "Korrekturschleifen.",
          wert=float(nonortho), grenze=NETZ_NONORTHO_WARNUNG, quelle="checkmesh")

    if vorschau and not vorschau.get("ohne_verfeinerung"):
        soll = vorschau.get("cells")
        ist = cm.get("cells")
        if soll and ist:
            abw = abs(ist - soll) / soll
            if abw > ZELLEN_ABWEICHUNG_WARNUNG:
                b("warnung",
                  f"Zellzahl weicht {abw * 100:.0f} % von der Netzvorschau ab "
                  f"({ist:,} statt {soll:,}) — die Vorschau ist nur eine "
                  "Vorschau, aber so viel Abstand verdient einen Blick."
                  .replace(",", "."),
                  wert=ist, grenze=soll, quelle="vorschau")

    fehler = [x for x in befunde if x["severity"] == "fehler"]
    if fehler:
        raise NetzTorFehler(
            "Netz-Qualitätstor: " + " | ".join(x["message"] for x in fehler),
            befunde)
    return befunde
