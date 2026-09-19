"""HTTP-Schicht des Projekt-Cockpits. Fachlogik lebt in core/ — hier nur
Uebersetzung. Alle Routen ab WERKSTUDENT (router-weit, fail-closed);
Rechnungslegung (Geld, Abschlag, Belege, Stunden-/Schlussrechnung) nur ADMIN.
Registriert in app/main.py unter /FastAPI/projekte; der Client ruft /api/projekte/...
"""
import json

from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from app.api.deps import get_current_active_user
from app.core.rollen import Rolle, mindestens
from app.api.pedant import db

from app.api.pedant.core import belege as ped_belege
from app.api.pedant.core.geldsichten import ErwartetAbgelehnt
from app.api.pedant.core.rechnungen import RechnungAbgelehnt

from . import wopi
from .core import abschnitte, aufgaben, cde, dossier, geld, index, kalender, office, ordner, portal, projekte, vorlagen, vorschlaege, zeit
# Der Verbund rechnet in einem Unterprozess (eigenes IFC-venv); hier wird nur
# gestartet und abgelesen.
from .core import verbund_lauf


_gate = mindestens(Rolle.WERKSTUDENT)
_admin_gate = mindestens(Rolle.ADMIN)

router = APIRouter(dependencies=[Depends(_gate)])


def _uebersetzt(aufruf):
    """Fachfehler -> HTTP; ein Muster fuer alle Routen."""
    try:
        return aufruf()
    except (projekte.ProjektUnbekannt, abschnitte.AbschnittUnbekannt,
            vorschlaege.VorschlagUnbekannt, aufgaben.AufgabeUnbekannt, zeit.ZeitUnbekannt,
            cde.CdeUnbekannt, kalender.TerminUnbekannt) as fehler:
        raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
    except (projekte.ProjektAbgelehnt, abschnitte.AbschnittAbgelehnt, ordner.OrdnerFehler,
            vorschlaege.VorschlagAbgelehnt, geld.GeldAbgelehnt, RechnungAbgelehnt,
            ErwartetAbgelehnt, ped_belege.BelegAbgelehnt, aufgaben.AufgabeAbgelehnt,
            zeit.ZeitAbgelehnt, vorlagen.VorlageAbgelehnt, cde.CdeAbgelehnt, portal.PortalAbgelehnt,
            kalender.TerminAbgelehnt) as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    except (ordner.OrdnerNichtBereit, wopi.WopiAbgelehnt) as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))
    except cde.CdeZuAlt as fehler:
        raise HTTPException(status_code=409, detail=str(fehler))


class ProjektEingabe(BaseModel):
    name: str
    honorarmodell: str = "pauschal"
    phase: str = "00_Angebote"
    kurzname: str = ""
    leistungsbild: str | None = None
    stundensatz_cent: int | None = None
    budget_stunden: int | None = None
    auftraggeber_id: int | None = None
    notiz: str = ""
    lph: list[int] = []


class ProjektAenderung(BaseModel):
    name: str | None = None
    kurzname: str | None = None
    honorarmodell: str | None = None
    leistungsbild: str | None = None
    stundensatz_cent: int | None = None
    budget_stunden: int | None = None
    auftraggeber_id: int | None = None
    notiz: str | None = None


class Uebernahme(BaseModel):
    id: int
    name: str
    honorarmodell: str = "pauschal"


class Verschiebung(BaseModel):
    phase: str


class BeteiligterEingabe(BaseModel):
    rolle: str
    name: str
    kontakt: str = ""
    pedant_auftraggeber_id: int | None = None


class BeteiligterAenderung(BaseModel):
    rolle: str | None = None
    name: str | None = None
    kontakt: str | None = None
    pedant_auftraggeber_id: int | None = None


class MeilensteinEingabe(BaseModel):
    art: str
    bezeichnung: str
    faellig_am: date
    notiz: str = ""


class MeilensteinAenderung(BaseModel):
    art: str | None = None
    bezeichnung: str | None = None
    faellig_am: date | None = None
    erledigt_am: date | None = None
    notiz: str | None = None


class AbschnittEingabe(BaseModel):
    bezeichnung: str
    lph: int | None = None
    art: str = "grund"
    honorar_cent: int = 0
    beauftragt: bool = True
    fortschritt_prozent: int = 0
    status: str = "offen"


class AbschnittAenderung(BaseModel):
    bezeichnung: str | None = None
    lph: int | None = None
    art: str | None = None
    honorar_cent: int | None = None
    beauftragt: bool | None = None
    fortschritt_prozent: int | None = None
    status: str | None = None
    grund: str = ""


class VorlageEingabe(BaseModel):
    paragraf: str
    honorar_cent: int
    beauftragt: list[int]
    jahrgang: int = 2021


class AbschlagEingabe(BaseModel):
    leistung_von: date
    leistung_bis: date | None = None


class BelegZuordnung(BaseModel):
    beleg_id: int


class AufgabeEingabe(BaseModel):
    titel: str
    beschreibung: str = ""
    faellig_am: date | None = None
    abschnitt_id: int | None = None


class AufgabeAenderung(BaseModel):
    titel: str | None = None
    beschreibung: str | None = None
    status: str | None = None
    faellig_am: date | None = None
    erledigt_am: date | None = None
    abschnitt_id: int | None = None


class ZeitEingabe(BaseModel):
    datum: date
    dauer_min: int
    taetigkeit: str
    abschnitt_id: int | None = None
    aufgabe_id: int | None = None
    abrechenbar: bool = True


class ZeitAenderung(BaseModel):
    datum: date | None = None
    dauer_min: int | None = None
    taetigkeit: str | None = None
    abschnitt_id: int | None = None
    aufgabe_id: int | None = None
    abrechenbar: bool | None = None


class TimerStart(BaseModel):
    taetigkeit: str = ""
    abschnitt_id: int | None = None
    aufgabe_id: int | None = None


class TimerStop(BaseModel):
    taetigkeit: str | None = None
    abrechenbar: bool = True


class StundenRechnung(BaseModel):
    leistung_von: date
    leistung_bis: date | None = None
    von: date | None = None
    bis: date | None = None


class VorlageEingabeDok(BaseModel):
    name: str | None = None


class CdeStatus(BaseModel):
    status: str
    eignung: str | None = None


class SatzNeu(BaseModel):
    """Ein Modellsatz ist eine AUSWAHL — `enthaelt` sind sha256-Verweise."""
    name: str
    zweck: str = "variante"
    enthaelt: list[str] = []


class SatzPatch(BaseModel):
    """Alles optional: wer nur umbenennt, schickt nur den Namen."""
    name: str | None = None
    zweck: str | None = None
    enthaelt: list[str] | None = None


class Freigabe(BaseModel):
    username: str


class Entscheidung(BaseModel):
    entscheidung: str   # 'uebernehmen' | 'verwerfen'


def _gesetzt(modell: BaseModel) -> dict:
    return modell.model_dump(exclude_unset=True)


@router.get("/phasen")
def phasen_lesen():
    return list(ordner.PHASEN)


@router.get("")
def projekte_lesen():
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.liste(conn))


@router.get("/kennzahlen")
def kennzahlen_lesen():
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.kennzahlen(conn))


@router.get("/abgleich")
def abgleich_lesen():
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.abgleich(conn))


@router.post("", status_code=201)
def projekt_anlegen(eingabe: ProjektEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.anlegen(
            conn, akteur=nutzer.username, **eingabe.model_dump()))


@router.post("/uebernehmen", status_code=201)
def projekt_uebernehmen(eingabe: Uebernahme, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.uebernehmen(
            conn, eingabe.id, name=eingabe.name, honorarmodell=eingabe.honorarmodell,
            akteur=nutzer.username))


@router.get("/leistungsbilder")
def leistungsbilder_lesen():
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: abschnitte.leistungsbilder(conn))


@router.get("/konfiguration")
def konfiguration_lesen():
    """Was der Client fuer Office-Links wissen muss (WebDAV-Basis, Online-Office)."""
    return office.konfiguration()


@router.get("/vorlagen")
def vorlagen_lesen():
    return vorlagen.liste()


@router.get("/portal-nutzer")
def portal_nutzer_lesen():
    return portal.portal_nutzer()


@router.get("/timer")
def timer_lesen(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: zeit.timer_status(conn, nutzer.username))


@router.post("/timer/stop")
def timer_stoppen(eingabe: TimerStop, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            buchung = zeit.timer_stop(conn, akteur=nutzer.username, taetigkeit=eingabe.taetigkeit,
                                      abrechenbar=eingabe.abrechenbar)
            if buchung:
                projekte.abschnitt_aktion(conn, buchung["projekt_id"], lambda: None)
            return buchung
        return _uebersetzt(lauf)


@router.delete("/timer")
def timer_verwerfen(nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        zeit.timer_verwerfen(conn, akteur=nutzer.username)
        return {"ok": True}


@router.get("/zeiten")
def zeiten_zeitraum(von: date, bis: date):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: zeit.zeitraum(conn, von, bis))


@router.get("/aufgaben/faellig")
def aufgaben_faellig(tage: int = 14):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: aufgaben.faellige(conn, tage))


@router.get("/vorschlaege")
def vorschlaege_offen_lesen():
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: vorschlaege.liste(conn, status="offen"))


@router.get("/{projekt_id}")
def projekt_lesen(projekt_id: int):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.lesen(conn, projekt_id))


@router.put("/{projekt_id}")
def projekt_aendern(projekt_id: int, eingabe: ProjektAenderung, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.aendern(
            conn, projekt_id, _gesetzt(eingabe), akteur=nutzer.username))


@router.post("/{projekt_id}/verschieben")
def projekt_verschieben(projekt_id: int, eingabe: Verschiebung, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.verschieben(
            conn, projekt_id, eingabe.phase, akteur=nutzer.username))


@router.post("/{projekt_id}/beteiligte", status_code=201)
def beteiligter_anlegen(projekt_id: int, eingabe: BeteiligterEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.beteiligter_anlegen(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump()))


@router.put("/{projekt_id}/beteiligte/{beteiligter_id}")
def beteiligter_aendern(projekt_id: int, beteiligter_id: int, eingabe: BeteiligterAenderung,
                        nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.beteiligter_aendern(
            conn, projekt_id, beteiligter_id, _gesetzt(eingabe), akteur=nutzer.username))


@router.delete("/{projekt_id}/beteiligte/{beteiligter_id}")
def beteiligter_loeschen(projekt_id: int, beteiligter_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.beteiligter_loeschen(
            conn, projekt_id, beteiligter_id, akteur=nutzer.username))


@router.post("/{projekt_id}/meilensteine", status_code=201)
def meilenstein_anlegen(projekt_id: int, eingabe: MeilensteinEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.meilenstein_anlegen(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump()))


@router.put("/{projekt_id}/meilensteine/{meilenstein_id}")
def meilenstein_aendern(projekt_id: int, meilenstein_id: int, eingabe: MeilensteinAenderung,
                        nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.meilenstein_aendern(
            conn, projekt_id, meilenstein_id, _gesetzt(eingabe), akteur=nutzer.username))


@router.delete("/{projekt_id}/meilensteine/{meilenstein_id}")
def meilenstein_loeschen(projekt_id: int, meilenstein_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.meilenstein_loeschen(
            conn, projekt_id, meilenstein_id, akteur=nutzer.username))


# ── Abschnitte (Stufe 2) ─────────────────────────────────────────────────────

@router.post("/{projekt_id}/abschnitte", status_code=201)
def abschnitt_anlegen(projekt_id: int, eingabe: AbschnittEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, lambda: abschnitte.anlegen(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump())))


@router.post("/{projekt_id}/abschnitte/vorlage", status_code=201)
def abschnitte_aus_vorlage(projekt_id: int, eingabe: VorlageEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, lambda: abschnitte.aus_vorlage(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump())))


@router.put("/{projekt_id}/abschnitte/{abschnitt_id}")
def abschnitt_aendern(projekt_id: int, abschnitt_id: int, eingabe: AbschnittAenderung,
                      nutzer=Depends(_gate)):
    felder = _gesetzt(eingabe)
    grund = felder.pop("grund", "")
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, lambda: abschnitte.aendern(
            conn, projekt_id, abschnitt_id, felder, akteur=nutzer.username, grund=grund)))


@router.delete("/{projekt_id}/abschnitte/{abschnitt_id}")
def abschnitt_loeschen(projekt_id: int, abschnitt_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, lambda: abschnitte.loeschen(
            conn, projekt_id, abschnitt_id, akteur=nutzer.username)))


# ── Dossier + Vorschlaege (Stufe 7a) ─────────────────────────────────────────

@router.get("/{projekt_id}/dossier", response_class=PlainTextResponse)
def dossier_lesen(projekt_id: int):
    """Erzeugt das Dossier frisch, legt es unter _akte/DOSSIER.md ab und liefert es als Markdown."""
    with db.pool().connection() as conn:
        text, _ = _uebersetzt(lambda: dossier.schreiben(conn, projekt_id))
    return PlainTextResponse(text, media_type="text/markdown; charset=utf-8")


@router.get("/{projekt_id}/vorschlaege")
def vorschlaege_lesen(projekt_id: int, status: str | None = None):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: vorschlaege.liste(conn, projekt_id=projekt_id, status=status))


@router.post("/{projekt_id}/vorschlaege/{vorschlag_id}/entscheiden")
def vorschlag_entscheiden(projekt_id: int, vorschlag_id: int, eingabe: Entscheidung,
                          nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        _uebersetzt(lambda: vorschlaege.entscheiden(
            conn, projekt_id, vorschlag_id, entscheidung=eingabe.entscheidung, akteur=nutzer.username))
        return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, lambda: None))


# ── Geld (Stufe 4) ───────────────────────────────────────────────────────────

@router.get("/{projekt_id}/geld", dependencies=[Depends(_admin_gate)])
def geld_lesen(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            return geld.stand(conn, projekt_id, a["fortschritt"])
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/abschlag", dependencies=[Depends(_admin_gate)])
def abschlag_vorschau(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            return geld.abschlag_vorschlag(conn, projekt_id, a["abschnitte"])
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/abschlag", status_code=201)
def abschlag_anlegen(projekt_id: int, eingabe: AbschlagEingabe, nutzer=Depends(_admin_gate)):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            rechnung = geld.abschlag_anlegen(conn, a, akteur=nutzer.username,
                                             leistung_von=eingabe.leistung_von,
                                             leistung_bis=eingabe.leistung_bis)
            projekte.abschnitt_aktion(conn, projekt_id, lambda: None)   # Planzeile + Akte nachziehen
            return {"rechnung_id": rechnung["id"], "status": rechnung["status"],
                    "netto_cent": rechnung["netto_cent"], "positionen": len(rechnung["positionen"])}
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/belege/frei", dependencies=[Depends(_admin_gate)])
def belege_frei(projekt_id: int, limit: int = 100):
    """Belege ohne Kostenmerkmal — Kandidaten fuer die Zuordnung."""
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: [
            {k: b[k] for k in ("id", "belegnummer", "status", "lieferant", "belegdatum", "brutto_cent")}
            for b in ped_belege.belege_liste(conn, kostenmerkmal="", limit=limit)
            if b["status"] != "verworfen"])


@router.post("/{projekt_id}/belege")
def beleg_zuordnen(projekt_id: int, eingabe: BelegZuordnung, nutzer=Depends(_admin_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            ped_belege.kostenmerkmal_setzen(conn, beleg_id=eingabe.beleg_id,
                                            kostenmerkmal=geld.kostenmerkmal(projekt_id),
                                            akteur=nutzer.username)
            a = projekte.lesen(conn, projekt_id)
            return geld.stand(conn, projekt_id, a["fortschritt"])
        return _uebersetzt(lauf)


@router.delete("/{projekt_id}/belege/{beleg_id}")
def beleg_loesen(projekt_id: int, beleg_id: int, nutzer=Depends(_admin_gate)):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            ped_belege.kostenmerkmal_setzen(conn, beleg_id=beleg_id, kostenmerkmal="",
                                            akteur=nutzer.username)
            return geld.stand(conn, projekt_id, a["fortschritt"])
        return _uebersetzt(lauf)


# ── Aufgaben + Zeit (Stufe 3) — Antworten sind die frische Akte ──────────────

def _akte_nach(conn, projekt_id: int, aufruf):
    return _uebersetzt(lambda: projekte.abschnitt_aktion(conn, projekt_id, aufruf))


@router.post("/{projekt_id}/aufgaben", status_code=201)
def aufgabe_anlegen(projekt_id: int, eingabe: AufgabeEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: aufgaben.anlegen(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump()))


@router.put("/{projekt_id}/aufgaben/{aufgabe_id}")
def aufgabe_aendern(projekt_id: int, aufgabe_id: int, eingabe: AufgabeAenderung, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: aufgaben.aendern(
            conn, projekt_id, aufgabe_id, _gesetzt(eingabe), akteur=nutzer.username))


@router.delete("/{projekt_id}/aufgaben/{aufgabe_id}")
def aufgabe_loeschen(projekt_id: int, aufgabe_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: aufgaben.loeschen(
            conn, projekt_id, aufgabe_id, akteur=nutzer.username))


@router.get("/{projekt_id}/zeiten")
def zeiten_lesen(projekt_id: int, von: date | None = None, bis: date | None = None):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            zeit.verworfene_freigeben(conn, projekt_id)
            return {"buchungen": zeit.liste(conn, projekt_id, von=von, bis=bis),
                    "summen": zeit.summen(conn, projekt_id)}
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/zeiten", status_code=201)
def zeit_buchen(projekt_id: int, eingabe: ZeitEingabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: zeit.buchen(
            conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump()))


@router.put("/{projekt_id}/zeiten/{buchung_id}")
def zeit_aendern(projekt_id: int, buchung_id: int, eingabe: ZeitAenderung, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: zeit.aendern(
            conn, projekt_id, buchung_id, _gesetzt(eingabe), akteur=nutzer.username))


@router.delete("/{projekt_id}/zeiten/{buchung_id}")
def zeit_loeschen(projekt_id: int, buchung_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _akte_nach(conn, projekt_id, lambda: zeit.loeschen(
            conn, projekt_id, buchung_id, akteur=nutzer.username))


@router.post("/{projekt_id}/timer", status_code=201)
def timer_starten(projekt_id: int, eingabe: TimerStart, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return zeit.timer_start(conn, projekt_id, akteur=nutzer.username, **eingabe.model_dump())
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/stundenrechnung", dependencies=[Depends(_admin_gate)])
def stundenrechnung_vorschau(projekt_id: int, von: date | None = None, bis: date | None = None):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: zeit.rechnung_vorschlag(conn, projekte.lesen(conn, projekt_id), von=von, bis=bis))


@router.post("/{projekt_id}/stundenrechnung", status_code=201)
def stundenrechnung_anlegen(projekt_id: int, eingabe: StundenRechnung, nutzer=Depends(_admin_gate)):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            r = zeit.rechnung_anlegen(conn, a, akteur=nutzer.username, **eingabe.model_dump())
            projekte.abschnitt_aktion(conn, projekt_id, lambda: None)
            return {"rechnung_id": r["id"], "status": r["status"], "netto_cent": r["netto_cent"],
                    "positionen": len(r["positionen"])}
        return _uebersetzt(lauf)


# ── Dokumente, Office, Volltext (Stufe 5) ────────────────────────────────────

def _ordner_oder_422(projekt_id: int) -> ordner.Ordner:
    projekte_ordner = ordner.finde(projekt_id)
    if projekte_ordner is None:
        raise projekte.ProjektAbgelehnt(f"projekt {projekt_id} hat keinen ordner")
    return projekte_ordner


@router.get("/{projekt_id}/suche")
def projekt_suche(projekt_id: int, q: str = Query(min_length=2), limit: int = Query(default=20, ge=1, le=100)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return {"treffer": index.suche(_ordner_oder_422(projekt_id), q, limit),
                    "index": index.stand(_ordner_oder_422(projekt_id))}
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/index")
def projekt_index(projekt_id: int, nutzer=Depends(_gate)):
    """Baut/aktualisiert den Volltextindex (inkrementell, gedeckelt)."""
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return index.aktualisieren(_ordner_oder_422(projekt_id), projekt_id)
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/office-link")
def office_link(projekt_id: int, pfad: str):
    """Office-URI (ms-word:ofe|u|…) fuer eine Datei im Projektordner — leer ohne WebDAV-Basis."""
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            o = _ordner_oder_422(projekt_id)
            rel = pfad.strip("/")
            if not (o.pfad / rel).resolve().is_relative_to(o.pfad.resolve()):
                raise projekte.ProjektAbgelehnt("pfad verlaesst den projektordner")
            return office.office_link(f"{o.phase}/{o.ordnername}/{rel}") or {}
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/vorlagen/{vorlage_id}", status_code=201)
def vorlage_erzeugen(projekt_id: int, vorlage_id: str, eingabe: VorlageEingabeDok,
                     nutzer=Depends(_gate)):
    from app.api.pedant.core import stammdaten
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            try:
                firma = stammdaten.firmendaten_lesen(conn)
            except Exception:  # noqa: BLE001 — ohne Firmendaten bleiben die Felder leer
                firma = None
            return vorlagen.erzeugen(conn, a, vorlage_id, akteur=nutzer.username, firma=firma, name=eingabe.name)
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/wopi-session")
def wopi_session(projekt_id: int, pfad: str, request: Request, nutzer=Depends(_gate)):
    """Editor-Sitzung fuer ONLYOFFICE (Formular-POST in ein iframe); 503 ohne ONLYOFFICE_URL."""
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            basis = office.api_basis(request)
            return wopi.session(projekt_id, pfad.strip("/"), nutzer.username, basis)
        return _uebersetzt(lauf)


# ── CDE (Stufe 6): Dokumentregister im Projektordner ─────────────────────────

@router.get("/{projekt_id}/cde")
def cde_register(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            o = _ordner_oder_422(projekt_id)
            return {"dokumente": cde.register(o), "saetze": cde.saetze(o),
                    "status": list(cde.STATUS), "arten": list(cde.ARTEN),
                    "satz_zwecke": list(cde.SATZ_ZWECKE),
                    "viewer_url": f"/cde?projekt={projekt_id}", "basis": f"{o.phase}/{o.ordnername}",
                    "stammdaten": {"nummer": str(a["id"]), "name": a["name"],
                                   "bauherr": next((b["name"] for b in a["beteiligte"] if b["rolle"] == "bauherr"), ""),
                                   "lph": ", ".join(str(s["lph"]) for s in a["abschnitte"]
                                                    if s.get("lph") and s.get("beauftragt") and s.get("status") == "laufend")}}
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/cde/saetze")
def cde_saetze(projekt_id: int, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.saetze(_ordner_oder_422(projekt_id))
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/cde/saetze", status_code=201)
def cde_satz_anlegen(projekt_id: int, eingabe: SatzNeu, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.satz_anlegen(conn, _ordner_oder_422(projekt_id),
                                    name=eingabe.name, zweck=eingabe.zweck,
                                    enthaelt=eingabe.enthaelt, akteur=nutzer.username)
        return _uebersetzt(lauf)


@router.put("/{projekt_id}/cde/saetze/{satz_id}")
def cde_satz_aendern(projekt_id: int, satz_id: str, eingabe: SatzPatch, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.satz_aendern(conn, _ordner_oder_422(projekt_id), satz_id,
                                    name=eingabe.name, zweck=eingabe.zweck,
                                    enthaelt=eingabe.enthaelt, akteur=nutzer.username)
        return _uebersetzt(lauf)


@router.delete("/{projekt_id}/cde/saetze/{satz_id}")
def cde_satz_loeschen(projekt_id: int, satz_id: str, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.satz_loeschen(conn, _ordner_oder_422(projekt_id), satz_id, akteur=nutzer.username)
        return _uebersetzt(lauf)


# ── CDE: Verbundmodell aus einem Modellsatz ──────────────────────────────────
# Auftrag annehmen (202) und abholen: nginx bricht /FastAPI/ nach 60 s ab, der
# Verbund der drei Gruppenmodelle braucht samt Pruefung gut zwei Minuten.
# Multipart statt JSON: der CDE-Eigenbau kommt als Datei `eigenbau` mit
# (JSON-Paket aus IfcViewer.eigenbauPaket). `crs` ist das Projekt-Bezugssystem
# (z. B. "EPSG:31466"); ohne Angabe wird es aus den Quellen ermittelt. `modus`
# = "verbund" (Vorgabe) oder "erdbau": dann entsteht Erdbau_<Satz>_R<nn>.ifc aus
# dem gelieferten Ur-Gelaende und dem Erdbau der CDE (Stufe 3, Aushub-Fachmodell).

def _modellauswahl(roh: str | None) -> list | None:
    """Die angehakten Modelle (S4 neu): eine JSON-Liste von sha256 — oder keine Auswahl (alle)."""
    if roh is None or not roh.strip():
        return None
    try:
        liste = json.loads(roh)
    except ValueError:
        liste = None
    if not isinstance(liste, list) or not all(isinstance(x, str) for x in liste):
        raise ValueError("modelle muss eine JSON-Liste von sha256 sein")
    return liste


@router.post("/{projekt_id}/cde/verbund", status_code=202)
async def cde_verbund_starten(projekt_id: int, satz_id: str = Form(...),
                              projektname: str | None = Form(default=None),
                              crs: str | None = Form(default=None),
                              modus: str = Form(default="verbund"),
                              # S4 neu (Ausgeben als Auswahlbaum): die angehakten Modelle des Satzes
                              # als JSON-Liste der sha256 — und wer die Datei fuer wen ausgibt.
                              modelle: str | None = Form(default=None),
                              autor: str | None = Form(default=None),
                              organisation: str | None = Form(default=None),
                              eigenbau: UploadFile | None = File(default=None),
                              nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        try:
            projekte.lesen(conn, projekt_id)
            o = _ordner_oder_422(projekt_id)
        except projekte.ProjektUnbekannt as fehler:
            raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
        except (projekte.ProjektAbgelehnt, ordner.OrdnerFehler) as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
        except ordner.OrdnerNichtBereit as fehler:
            raise HTTPException(status_code=503, detail=str(fehler))
    try:
        auswahl = _modellauswahl(modelle)
    except ValueError as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    try:
        paket = await eigenbau.read() if eigenbau is not None else None
        return await verbund_lauf.starte(o, satz_id, akteur=nutzer.username,
                                         projektname=projektname, crs=crs, eigenbau=paket, modus=modus,
                                         modelle=auswahl, autor=autor, organisation=organisation)
    except cde.CdeUnbekannt as fehler:
        raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
    except cde.CdeAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    except verbund_lauf.VerbundBesetzt as fehler:
        raise HTTPException(status_code=409, detail=str(fehler))
    except (verbund_lauf.WerkzeugFehlt, ordner.OrdnerNichtBereit) as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))


@router.get("/{projekt_id}/cde/verbund/{lauf_id}")
def cde_verbund_status(projekt_id: int, lauf_id: str):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return verbund_lauf.status(_ordner_oder_422(projekt_id), lauf_id, conn=conn)
        return _uebersetzt(lauf)


@router.get("/{projekt_id}/cde/verbund/{lauf_id}/bericht")
def cde_verbund_bericht(projekt_id: int, lauf_id: str):
    """Der GANZE Pruefbericht eines Laufs (IFC-Konsistenz, Stufe 6) — solange der Laufordner steht.

    Der Status kuerzt, das Manifest noch mehr; hier steht jeder Befund mit Text,
    Zahl und Beispielen. Nach MAX_LAEUFE ist der Laufordner weggeraeumt: 404.
    """
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            pfad = verbund_lauf.bericht_pfad(_ordner_oder_422(projekt_id), lauf_id)
            return FileResponse(pfad, media_type="application/json", filename=f"Pruefbericht_{lauf_id}.json")
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/cde/{sha256}/pruefung", status_code=202)
async def cde_pruefung_starten(projekt_id: int, sha256: str, nutzer=Depends(_gate)):
    """Ein Registerdokument durch das Prueftor (IFC-Konsistenz, Stufe 4b).

    Abgeholt wird wie beim Verbund ueber GET /{id}/cde/verbund/{lauf_id}.
    """
    with db.pool().connection() as conn:
        try:
            projekte.lesen(conn, projekt_id)
            o = _ordner_oder_422(projekt_id)
        except projekte.ProjektUnbekannt as fehler:
            raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
        except (projekte.ProjektAbgelehnt, ordner.OrdnerFehler) as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
        except ordner.OrdnerNichtBereit as fehler:
            raise HTTPException(status_code=503, detail=str(fehler))
    try:
        return await verbund_lauf.pruefung_starten(o, sha256, akteur=nutzer.username)
    except cde.CdeUnbekannt as fehler:
        raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
    except cde.CdeAbgelehnt as fehler:
        raise HTTPException(status_code=422, detail=str(fehler))
    except verbund_lauf.VerbundBesetzt as fehler:
        raise HTTPException(status_code=409, detail=str(fehler))
    except (verbund_lauf.WerkzeugFehlt, ordner.OrdnerNichtBereit) as fehler:
        raise HTTPException(status_code=503, detail=str(fehler))


@router.post("/{projekt_id}/cde/upload", status_code=201)
async def cde_hochladen(projekt_id: int, datei: UploadFile = File(...), art: str | None = Query(default=None),
                        status: str = Query(default="WIP"),
                        projekt_global_id: str | None = Query(default=None),
                        nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        try:
            projekte.lesen(conn, projekt_id)
            o = _ordner_oder_422(projekt_id)
            return await cde.hochladen(conn, o, datei, akteur=nutzer.username, art=art, status=status,
                                       projekt_global_id=projekt_global_id)
        except (projekte.ProjektUnbekannt,) as fehler:
            raise HTTPException(status_code=404, detail=f"unbekannt: {fehler.args[0]}")
        except (projekte.ProjektAbgelehnt, cde.CdeAbgelehnt) as fehler:
            raise HTTPException(status_code=422, detail=str(fehler))
        except ordner.OrdnerNichtBereit as fehler:
            raise HTTPException(status_code=503, detail=str(fehler))


@router.put("/{projekt_id}/cde/{sha256}/status")
def cde_status(projekt_id: int, sha256: str, eingabe: CdeStatus, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.status_setzen(conn, _ordner_oder_422(projekt_id), sha256, eingabe.status,
                                     akteur=nutzer.username, eignung=eingabe.eignung,
                                     rolle=getattr(nutzer, "rolle", None) or getattr(nutzer, "role", None))
        return _uebersetzt(lauf)


# ── CDE Stufe C: Viewer-Repository je Projekt ────────────────────────────────

@router.get("/{projekt_id}/cde/repo")
def cde_repo_lesen(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.repo_lesen(_ordner_oder_422(projekt_id))
        return _uebersetzt(lauf)


@router.put("/{projekt_id}/cde/repo/{key}")
async def cde_repo_setzen(projekt_id: int, key: str, request: Request, nutzer=Depends(_gate)):
    wert = await request.json()
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            cde.repo_setzen(_ordner_oder_422(projekt_id), key, wert)
            return {"ok": True, "key": key}
        return _uebersetzt(lauf)


@router.delete("/{projekt_id}/cde/repo/{key}")
def cde_repo_loeschen(projekt_id: int, key: str, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return {"ok": cde.repo_loeschen(_ordner_oder_422(projekt_id), key)}
        return _uebersetzt(lauf)


# Bewusst NACH den repo-Routen: `/cde/repo` wuerde sonst als sha256="repo"
# durchgehen. `cde.loeschen` besteht zusaetzlich auf 64 Hexzeichen.
@router.delete("/{projekt_id}/cde/{sha256}")
def cde_entfernen(projekt_id: int, sha256: str, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return cde.loeschen(conn, _ordner_oder_422(projekt_id), sha256, akteur=nutzer.username)
        return _uebersetzt(lauf)


# ── Schlussrechnung (4b) ─────────────────────────────────────────────────────

@router.get("/{projekt_id}/schlussrechnung", dependencies=[Depends(_admin_gate)])
def schlussrechnung_vorschau(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            return geld.schlussrechnung_vorschlag(conn, projekt_id, a["abschnitte"])
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/schlussrechnung", status_code=201)
def schlussrechnung_anlegen(projekt_id: int, eingabe: AbschlagEingabe, nutzer=Depends(_admin_gate)):
    with db.pool().connection() as conn:
        def lauf():
            a = projekte.lesen(conn, projekt_id)
            r = geld.schlussrechnung_anlegen(conn, a, akteur=nutzer.username,
                                             leistung_von=eingabe.leistung_von, leistung_bis=eingabe.leistung_bis)
            projekte.abschnitt_aktion(conn, projekt_id, lambda: None)
            return {"rechnung_id": r["id"], "status": r["status"], "netto_cent": r["netto_cent"],
                    "vorab_cent": r["vorab_cent"], "zahlbar_cent": r["zahlbar_cent"],
                    "positionen": len(r["positionen"]), "vorrechnungen": len(r["vorrechnungen"])}
        return _uebersetzt(lauf)


# ── Kundenportal (Stufe 8): Freigaben ────────────────────────────────────────

@router.get("/{projekt_id}/freigaben")
def freigaben_lesen(projekt_id: int):
    with db.pool().connection() as conn:
        def lauf():
            projekte.lesen(conn, projekt_id)
            return portal.freigaben(conn, projekt_id)
        return _uebersetzt(lauf)


@router.post("/{projekt_id}/freigaben", status_code=201)
def freigabe_anlegen(projekt_id: int, eingabe: Freigabe, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: portal.freigeben(conn, projekt_id, eingabe.username, akteur=nutzer.username))


@router.delete("/{projekt_id}/freigaben/{username}")
def freigabe_entziehen(projekt_id: int, username: str, nutzer=Depends(_gate)):
    with db.pool().connection() as conn:
        return _uebersetzt(lambda: portal.entziehen(conn, projekt_id, username, akteur=nutzer.username))
