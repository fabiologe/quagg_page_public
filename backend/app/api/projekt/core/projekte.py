"""Projektakte: Datenbank (Schema projekt) + Ordner (StorageBox) im Verbund.

Regeln (FAHRPLAN Kap. 4):
- Phase kommt IMMER aus der Ordnerlage; die DB kennt keinen Status.
- Anlage: DB-Zeile und Ordner in EINER Transaktion — scheitert das Dateisystem,
  rollt die DB zurueck. Scheitert der Commit nach dem Anlegen, bleibt ein
  Ordner ohne Akte, den der Abgleich meldet (konservativ: lieber ein Ordner
  zu viel als eine Akte ohne Ordner).
- Nach jeder Aenderung wird _akte/akte.yaml neu geschrieben (nur DB -> Datei).
"""

from datetime import date, timedelta

from . import abschnitte, akte, aufgaben, fortschritt, kalender, ordner, zeit
from . import geld as geld_mod
from . import vorschlaege as vorschlaege_mod
from .audit import audit_schreiben

HONORARMODELLE = ("hoai", "pauschal", "stunden")
ROLLEN = ("bauherr", "auftraggeber", "rechnungsempfaenger", "architekt",
          "behoerde", "fachplaner", "ausfuehrende_firma", "sonstige")
MEILENSTEIN_ARTEN = ("termin", "abgabe", "bindefrist", "gewaehrleistung",
                     "aufbewahrung", "wiedervorlage")
FAELLIG_HORIZONT_TAGE = 14

_SPALTEN = ("id", "name", "kurzname", "ordnername", "honorarmodell", "leistungsbild",
            "stundensatz_cent", "budget_stunden", "auftraggeber_id", "notiz",
            "angelegt_am", "aktualisiert_am")
_AENDERBAR = ("name", "kurzname", "honorarmodell", "leistungsbild",
              "stundensatz_cent", "budget_stunden", "auftraggeber_id", "notiz")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.projekte"


class ProjektAbgelehnt(ValueError):
    """Fachlich unzulaessig — Router: 422."""


class ProjektUnbekannt(KeyError):
    """Es gibt keine Akte mit dieser Nummer — Router: 404."""


def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def _fortschritt_fuer(zeile: dict, nach_abschnitten: dict, minuten: int) -> dict:
    """Stundenprojekte messen sich an Budget und Satz, alle anderen an Abschnitten."""
    if zeile.get("honorarmodell") == "stunden" and (zeile.get("budget_stunden") or zeile.get("stundensatz_cent")):
        return zeit.leistung_stunden(minuten, zeile.get("stundensatz_cent"), zeile.get("budget_stunden"))
    return nach_abschnitten


def _honorarmodell_pruefen(wert: str) -> str:
    if wert not in HONORARMODELLE:
        raise ProjektAbgelehnt(f"honorarmodell muss eines von {HONORARMODELLE} sein")
    return wert


def _mit_ordner(zeile: dict, o: ordner.Ordner | None) -> dict:
    zeile["phase"] = o.phase if o else None
    zeile["ordner_vorhanden"] = o is not None
    if o and o.ordnername != zeile["ordnername"]:
        zeile["ordnername"] = o.ordnername  # der Nutzer hat im Explorer umbenannt — der Ordner gewinnt
    return zeile


# ── Lesen ────────────────────────────────────────────────────────────────────

def liste(conn) -> list[dict]:
    conn.rollback()
    zeilen = [_zeile(r) for r in conn.execute(f"{_SELECT} ORDER BY id DESC")]
    termine = dict(conn.execute(
        "SELECT projekt_id, MIN(faellig_am) FROM projekt.meilensteine"
        " WHERE erledigt_am IS NULL GROUP BY projekt_id"))
    leistung = abschnitte.kennzahlen_je_projekt(conn)
    offen = vorschlaege_mod.offen_je_projekt(conn)
    geld = geld_mod.summen_je_projekt(conn)
    minuten = zeit.minuten_je_projekt(conn)
    aufgaben_offen = aufgaben.offen_je_projekt(conn)
    ordner_je_id = {o.id: o for o in ordner.scan()}
    for z in zeilen:
        _mit_ordner(z, ordner_je_id.get(z["id"]))
        z["naechster_termin"] = termine.get(z["id"])
        z["fortschritt"] = _fortschritt_fuer(z, leistung.get(z["id"], fortschritt.leistung([])),
                                             minuten.get(z["id"], 0))
        z["vorschlaege_offen"] = offen.get(z["id"], 0)
        z["aufgaben"] = aufgaben_offen.get(z["id"], {"offen": 0, "ueberfaellig": 0})
        z["minuten"] = minuten.get(z["id"], 0)
        g = geld.get(z["id"], {"gestellt_netto_cent": 0, "bezahlt_netto_cent": 0})
        z["geld"] = {**g, "unabgerechnet_cent": z["fortschritt"]["leistung_cent"] - g["gestellt_netto_cent"]}
    return zeilen


def lesen(conn, projekt_id: int) -> dict:
    conn.rollback()
    row = conn.execute(f"{_SELECT} WHERE id = %s", (projekt_id,)).fetchone()
    if row is None:
        raise ProjektUnbekannt(projekt_id)
    z = _mit_ordner(_zeile(row), ordner.finde(projekt_id))
    z["beteiligte"] = [dict(zip(
        ("id", "rolle", "name", "kontakt", "pedant_auftraggeber_id"), r))
        for r in conn.execute(
            "SELECT id, rolle, name, kontakt, pedant_auftraggeber_id FROM projekt.beteiligte"
            " WHERE projekt_id = %s ORDER BY id", (projekt_id,))]
    z["meilensteine"] = [dict(zip(
        ("id", "art", "bezeichnung", "faellig_am", "erledigt_am", "notiz"), r))
        for r in conn.execute(
            "SELECT id, art, bezeichnung, faellig_am, erledigt_am, notiz FROM projekt.meilensteine"
            " WHERE projekt_id = %s ORDER BY faellig_am, id", (projekt_id,))]
    z["abschnitte"] = abschnitte.liste(conn, projekt_id)
    z["zeit"] = zeit.summen(conn, projekt_id)
    z["fortschritt"] = _fortschritt_fuer(z, fortschritt.leistung(z["abschnitte"]), z["zeit"]["minuten_gesamt"])
    z["aufgaben"] = aufgaben.liste(conn, projekt_id)
    z["termine"] = kalender.je_projekt(conn, projekt_id)
    z["honorar_historie"] = abschnitte.historie(conn, projekt_id)
    z["vorschlaege"] = vorschlaege_mod.liste(conn, projekt_id=projekt_id, status="offen")
    z["geld"] = geld_mod.summen(conn, projekt_id, z["fortschritt"])
    return z


def kennzahlen(conn, projekte: list[dict] | None = None) -> dict:
    projekte = projekte if projekte is not None else liste(conn)
    je_phase = {p: 0 for p in ordner.PHASEN}
    ohne_ordner = 0
    for p in projekte:
        if p["phase"] is None:
            ohne_ordner += 1
        else:
            je_phase[p["phase"]] += 1
    horizont = date.today() + timedelta(days=FAELLIG_HORIZONT_TAGE)
    faellig = conn.execute(
        "SELECT count(*) FROM projekt.meilensteine"
        " WHERE erledigt_am IS NULL AND faellig_am <= %s", (horizont,)).fetchone()[0]
    ordner_ohne_akte = len(abgleich(conn, projekte)["ordner_ohne_akte"])
    return {"gesamt": len(projekte), "je_phase": je_phase, "ohne_ordner": ohne_ordner,
            "ordner_ohne_akte": ordner_ohne_akte, "faellig": faellig,
            "faellig_horizont_tage": FAELLIG_HORIZONT_TAGE,
            "vorschlaege_offen": sum(p.get("vorschlaege_offen", 0) for p in projekte),
            "unabgerechnet_cent": sum(max(0, p.get("geld", {}).get("unabgerechnet_cent", 0)) for p in projekte),
            "aufgaben_offen": sum(p.get("aufgaben", {}).get("offen", 0) for p in projekte),
            "aufgaben_ueberfaellig": sum(p.get("aufgaben", {}).get("ueberfaellig", 0) for p in projekte),
            "offen_gestellt_cent": sum(p.get("geld", {}).get("gestellt_netto_cent", 0)
                                       - p.get("geld", {}).get("bezahlt_netto_cent", 0) for p in projekte)}


def abgleich(conn, projekte: list[dict] | None = None) -> dict:
    """Die Abgleich-Karte: was liegt als Ordner ohne Akte, welche Akte hat
    keinen Ordner mehr. Beides meldet, nichts wird automatisch repariert."""
    projekte = projekte if projekte is not None else liste(conn)
    bekannt = {p["id"] for p in projekte}
    ordner_ohne_akte = [{"id": o.id, "ordnername": o.ordnername, "phase": o.phase}
                        for o in ordner.scan() if o.id not in bekannt]
    akte_ohne_ordner = [{"id": p["id"], "name": p["name"], "ordnername": p["ordnername"]}
                        for p in projekte if p["phase"] is None]
    return {"ordner_ohne_akte": ordner_ohne_akte, "akte_ohne_ordner": akte_ohne_ordner}


# ── Schreiben ────────────────────────────────────────────────────────────────

def _akte_aktualisieren(conn, projekt_id: int) -> None:
    daten = lesen(conn, projekt_id)
    _planzeile_pflegen(conn, daten)
    o = ordner.finde(projekt_id)
    if o is None:
        return
    akte.schreiben(o, {k: daten[k] for k in (
        "id", "name", "kurzname", "ordnername", "phase", "honorarmodell", "leistungsbild",
        "stundensatz_cent", "budget_stunden", "auftraggeber_id", "notiz",
        "beteiligte", "meilensteine", "abschnitte", "fortschritt", "aufgaben", "zeit")})


def _planzeile_pflegen(conn, daten: dict) -> None:
    """Pedant-Planzeile nachziehen — best effort: scheitert die Fachpruefung des
    Pedanten, bleibt die Akte trotzdem konsistent, der Fehlschlag steht im Audit."""
    try:
        geld_mod.planzeile_sync(conn, daten, akteur="projekt-sync")
    except Exception as fehler:  # noqa: BLE001 — Sync darf die Akte nie blockieren
        conn.rollback()
        with conn.transaction():
            audit_schreiben(conn, "projekt-sync", "planzeile_sync", erfolg=False,
                            nutzlast={"projekt_id": daten["id"], "grund": str(fehler)})


def _felder_pruefen(felder: dict) -> dict:
    sauber = {}
    for k, v in felder.items():
        if k not in _AENDERBAR:
            raise ProjektAbgelehnt(f"feld {k!r} ist nicht aenderbar")
        sauber[k] = v
    if "name" in sauber and not str(sauber["name"] or "").strip():
        raise ProjektAbgelehnt("name darf nicht leer sein")
    if "honorarmodell" in sauber:
        _honorarmodell_pruefen(sauber["honorarmodell"])
    for k in ("stundensatz_cent", "budget_stunden"):
        if sauber.get(k) is not None and int(sauber[k]) <= 0:
            raise ProjektAbgelehnt(f"{k} muss groesser als null sein")
    return sauber


def anlegen(conn, *, name: str, honorarmodell: str, akteur: str,
            phase: str = "00_Angebote", kurzname: str = "", leistungsbild: str | None = None,
            stundensatz_cent: int | None = None, budget_stunden: int | None = None,
            auftraggeber_id: int | None = None, notiz: str = "",
            lph: tuple[int, ...] | list[int] = ()) -> dict:
    felder = _felder_pruefen(dict(
        name=name, kurzname=kurzname, honorarmodell=honorarmodell, leistungsbild=leistungsbild,
        stundensatz_cent=stundensatz_cent, budget_stunden=budget_stunden,
        auftraggeber_id=auftraggeber_id, notiz=notiz))
    ordner.phase_pruefen(phase)
    conn.rollback()  # psycopg-Savepoint-Falle: keine offene Lese-Transaktion
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(44, 0)")  # Nummernkreis serialisieren
        max_db = conn.execute("SELECT COALESCE(MAX(id), 0) FROM projekt.projekte").fetchone()[0]
        nummer = max(max_db, ordner.hoechste_nummer(), ordner.MINDESTNUMMER - 1) + 1
        ordnername = ordner.ordnername_bilden(nummer, kurzname or name)
        conn.execute(
            "INSERT INTO projekt.projekte (id, name, kurzname, ordnername, honorarmodell,"
            " leistungsbild, stundensatz_cent, budget_stunden, auftraggeber_id, notiz)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (nummer, felder["name"].strip(), felder["kurzname"] or "", ordnername,
             felder["honorarmodell"], felder["leistungsbild"], felder["stundensatz_cent"],
             felder["budget_stunden"], felder["auftraggeber_id"], felder["notiz"] or ""))
        audit_schreiben(conn, akteur, "projekt_anlegen", erfolg=True,
                        nutzlast={"id": nummer, "ordnername": ordnername, "phase": phase})
        # Dateisystem INNERHALB der Transaktion: scheitert es, gibt es keine Akte.
        ordner.anlegen(ordnername, phase, lph)
    _akte_aktualisieren(conn, nummer)
    return lesen(conn, nummer)


def uebernehmen(conn, projekt_id: int, *, name: str, honorarmodell: str, akteur: str,
                **weitere) -> dict:
    """Bestandsordner ohne Akte bekommt eine Akte (Abgleich-Karte -> 'Akte anlegen')."""
    o = ordner.finde(projekt_id)
    if o is None:
        raise ProjektAbgelehnt(f"kein projektordner mit nummer {projekt_id}")
    felder = _felder_pruefen(dict(name=name, honorarmodell=honorarmodell, **weitere))
    conn.rollback()
    with conn.transaction():
        if conn.execute("SELECT 1 FROM projekt.projekte WHERE id = %s", (projekt_id,)).fetchone():
            raise ProjektAbgelehnt(f"projekt {projekt_id} hat bereits eine akte")
        spalten = ["id", "ordnername"] + list(felder)
        werte = [projekt_id, o.ordnername] + [felder[k] for k in felder]
        conn.execute(
            f"INSERT INTO projekt.projekte ({', '.join(spalten)})"
            f" VALUES ({', '.join(['%s'] * len(werte))})", werte)
        audit_schreiben(conn, akteur, "projekt_uebernehmen", erfolg=True,
                        nutzlast={"id": projekt_id, "ordnername": o.ordnername, "phase": o.phase})
        ordner.akte_sicherstellen(o)
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def aendern(conn, projekt_id: int, felder: dict, *, akteur: str) -> dict:
    sauber = _felder_pruefen(felder)
    if not sauber:
        return lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        setzer = ", ".join(f"{k} = %s" for k in sauber)
        cur = conn.execute(
            f"UPDATE projekt.projekte SET {setzer} WHERE id = %s",
            [*sauber.values(), projekt_id])
        if cur.rowcount == 0:
            raise ProjektUnbekannt(projekt_id)
        audit_schreiben(conn, akteur, "projekt_aendern", erfolg=True,
                        nutzlast={"id": projekt_id, "felder": sauber})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def verschieben(conn, projekt_id: int, phase: str, *, akteur: str) -> dict:
    """Phasenwechsel: ERST das Rename, DANN der Audit — ein gescheiterter Rename
    hinterlaesst nichts, ein gescheiterter Audit keinen falschen Zustand."""
    lesen(conn, projekt_id)  # 404 vor jeder Dateisystem-Aktion
    o = ordner.finde(projekt_id)
    if o is None:
        raise ProjektAbgelehnt(f"projekt {projekt_id} hat keinen ordner — erst abgleichen")
    neu = ordner.verschiebe(o, phase)
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, "projekt_verschieben", erfolg=True,
                        nutzlast={"id": projekt_id, "von": o.phase, "nach": neu.phase})
    if phase == "03_Abgeschlossen":
        _abschlussfristen(conn, projekt_id, akteur)
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


GEWAEHRLEISTUNG_JAHRE = 5     # § 634a BGB fuer Bauwerke
AUFBEWAHRUNG_JAHRE = 10       # Projektakten/Rechnungen


def _abschlussfristen(conn, projekt_id: int, akteur: str) -> None:
    """Beim Abschluss entstehen die zwei langen Fristen automatisch — einmal."""
    heute = date.today()
    vorhanden = {r[0] for r in conn.execute(
        "SELECT art FROM projekt.meilensteine WHERE projekt_id = %s AND art IN ('gewaehrleistung', 'aufbewahrung')",
        (projekt_id,))}
    for art, jahre, text in (("gewaehrleistung", GEWAEHRLEISTUNG_JAHRE, "Ende Gewährleistung (§ 634a BGB)"),
                             ("aufbewahrung", AUFBEWAHRUNG_JAHRE, "Ende Aufbewahrungsfrist Projektakte")):
        if art in vorhanden:
            continue
        meilenstein_anlegen(conn, projekt_id, art=art, bezeichnung=text,
                            faellig_am=heute.replace(year=heute.year + jahre), akteur=akteur,
                            notiz="automatisch beim Abschluss angelegt")


# ── Beteiligte ───────────────────────────────────────────────────────────────

def beteiligter_anlegen(conn, projekt_id: int, *, rolle: str, name: str, akteur: str,
                        kontakt: str = "", pedant_auftraggeber_id: int | None = None) -> dict:
    if rolle not in ROLLEN:
        raise ProjektAbgelehnt(f"rolle muss eine von {ROLLEN} sein")
    if not name.strip():
        raise ProjektAbgelehnt("name darf nicht leer sein")
    lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        neu_id = conn.execute(
            "INSERT INTO projekt.beteiligte (projekt_id, rolle, name, kontakt, pedant_auftraggeber_id)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (projekt_id, rolle, name.strip(), kontakt or "", pedant_auftraggeber_id)).fetchone()[0]
        audit_schreiben(conn, akteur, "beteiligter_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu_id, "rolle": rolle})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def beteiligter_aendern(conn, projekt_id: int, beteiligter_id: int, felder: dict, *, akteur: str) -> dict:
    erlaubt = {k: v for k, v in felder.items() if k in ("rolle", "name", "kontakt", "pedant_auftraggeber_id")}
    if "rolle" in erlaubt and erlaubt["rolle"] not in ROLLEN:
        raise ProjektAbgelehnt(f"rolle muss eine von {ROLLEN} sein")
    if "name" in erlaubt and not str(erlaubt["name"] or "").strip():
        raise ProjektAbgelehnt("name darf nicht leer sein")
    if not erlaubt:
        return lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        cur = conn.execute(
            f"UPDATE projekt.beteiligte SET {', '.join(f'{k} = %s' for k in erlaubt)}"
            " WHERE id = %s AND projekt_id = %s", [*erlaubt.values(), beteiligter_id, projekt_id])
        if cur.rowcount == 0:
            raise ProjektUnbekannt(beteiligter_id)
        audit_schreiben(conn, akteur, "beteiligter_aendern", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": beteiligter_id, "felder": erlaubt})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def beteiligter_loeschen(conn, projekt_id: int, beteiligter_id: int, *, akteur: str) -> dict:
    conn.rollback()
    with conn.transaction():
        cur = conn.execute("DELETE FROM projekt.beteiligte WHERE id = %s AND projekt_id = %s",
                           (beteiligter_id, projekt_id))
        if cur.rowcount == 0:
            raise ProjektUnbekannt(beteiligter_id)
        audit_schreiben(conn, akteur, "beteiligter_loeschen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": beteiligter_id})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


# ── Meilensteine ─────────────────────────────────────────────────────────────

def meilenstein_anlegen(conn, projekt_id: int, *, art: str, bezeichnung: str, faellig_am: date,
                        akteur: str, notiz: str = "") -> dict:
    if art not in MEILENSTEIN_ARTEN:
        raise ProjektAbgelehnt(f"art muss eine von {MEILENSTEIN_ARTEN} sein")
    if not bezeichnung.strip():
        raise ProjektAbgelehnt("bezeichnung darf nicht leer sein")
    lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        neu_id = conn.execute(
            "INSERT INTO projekt.meilensteine (projekt_id, art, bezeichnung, faellig_am, notiz)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (projekt_id, art, bezeichnung.strip(), faellig_am, notiz or "")).fetchone()[0]
        audit_schreiben(conn, akteur, "meilenstein_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu_id, "art": art,
                                  "faellig_am": faellig_am})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def meilenstein_aendern(conn, projekt_id: int, meilenstein_id: int, felder: dict, *, akteur: str) -> dict:
    erlaubt = {k: v for k, v in felder.items()
               if k in ("art", "bezeichnung", "faellig_am", "erledigt_am", "notiz")}
    if "art" in erlaubt and erlaubt["art"] not in MEILENSTEIN_ARTEN:
        raise ProjektAbgelehnt(f"art muss eine von {MEILENSTEIN_ARTEN} sein")
    if "bezeichnung" in erlaubt and not str(erlaubt["bezeichnung"] or "").strip():
        raise ProjektAbgelehnt("bezeichnung darf nicht leer sein")
    if not erlaubt:
        return lesen(conn, projekt_id)
    conn.rollback()
    with conn.transaction():
        cur = conn.execute(
            f"UPDATE projekt.meilensteine SET {', '.join(f'{k} = %s' for k in erlaubt)}"
            " WHERE id = %s AND projekt_id = %s", [*erlaubt.values(), meilenstein_id, projekt_id])
        if cur.rowcount == 0:
            raise ProjektUnbekannt(meilenstein_id)
        audit_schreiben(conn, akteur, "meilenstein_aendern", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": meilenstein_id, "felder": erlaubt})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


def meilenstein_loeschen(conn, projekt_id: int, meilenstein_id: int, *, akteur: str) -> dict:
    conn.rollback()
    with conn.transaction():
        cur = conn.execute("DELETE FROM projekt.meilensteine WHERE id = %s AND projekt_id = %s",
                           (meilenstein_id, projekt_id))
        if cur.rowcount == 0:
            raise ProjektUnbekannt(meilenstein_id)
        audit_schreiben(conn, akteur, "meilenstein_loeschen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": meilenstein_id})
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)


# ── Abschnitte (Stufe 2) — jede Aktion liefert die frische Akte zurueck ─────

def abschnitt_aktion(conn, projekt_id: int, aufruf) -> dict:
    lesen(conn, projekt_id)  # 404 vor der Aktion
    aufruf()
    _akte_aktualisieren(conn, projekt_id)
    return lesen(conn, projekt_id)
