"""Die drei Geld-Sichten (FAHRPLAN Kap. 6) + Monatsreihe fuer die einfache
Timeline (Kap. 13 Phase vier — die volle 5-Zoomstufen-Timeline ist Phase 7).

  bezahlt  — Ist-Geld. Bis Phase 5 (Bankabgleich): Rechnungen im Status
             'bezahlt' (manuell markiert); danach uebernimmt die Bank-Zuordnung.
  offen    — gestellte Rechnungen ohne Zahlung; ueberfaellig = faellig < heute.
  kommend  — erwartetes Geld (beauftragt/teilweise gestellt), abzueglich des
             bereits gestellten Anteils (bereits_gestellt_cent, von Hand gepflegt).

Aggregation in Python statt SQL-Fensterfunktionen: die Datenmengen eines
Einzelunternehmens sind winzig, und so ist die Bucketing-Logik pur testbar.
"""

from datetime import date

from .audit import audit_schreiben

STATUS_WERTE = ("angefragt", "angeboten", "beauftragt",
                "teilweise_gestellt", "vollstaendig_gestellt", "entfallen")
KOMMEND_STATUS = ("beauftragt", "teilweise_gestellt")

_ERWARTET_SPALTEN = ("id, bezeichnung, auftraggeber_id, betrag_cent,"
                     " bereits_gestellt_cent, erwartet_am, status, notiz,"
                     " angelegt_am, aktualisiert_am, projekt_id")


class ErwartetAbgelehnt(ValueError):
    """Fachliche Ablehnung — Router uebersetzt in 422."""


def _monat(datum: date) -> str:
    return f"{datum.year:04d}-{datum.month:02d}"


def _monate_spanne(heute: date, zurueck: int, vor: int) -> list:
    start = heute.year * 12 + (heute.month - 1) - zurueck
    return [f"{index // 12:04d}-{index % 12 + 1:02d}"
            for index in range(start, start + zurueck + vor + 1)]


def offener_rest(eintrag: dict) -> int:
    """Kommend-Anteil eines Eintrags: Gesamtvolumen minus bereits gestellt."""
    if eintrag["status"] not in KOMMEND_STATUS:
        return 0
    return eintrag["betrag_cent"] - eintrag["bereits_gestellt_cent"]


def sichten(conn) -> dict:
    """Die drei Summen-Kacheln, jeweils mit Anzahl."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status, COALESCE(zahlbar_cent, brutto_cent),"
            "       (rechnungsdatum + zahlungsziel_tage) < CURRENT_DATE AS ueberfaellig"
            "  FROM rechnungen WHERE status IN ('gestellt', 'bezahlt')")
        rechnungen = cur.fetchall()
        cur.execute(
            "SELECT betrag_cent, bereits_gestellt_cent, status"
            "  FROM erwartetes_geld WHERE status = ANY(%s)",
            (list(KOMMEND_STATUS),))
        erwartet = cur.fetchall()

    bezahlt = [brutto for status, brutto, _ in rechnungen if status == "bezahlt"]
    offen = [(brutto, ueberfaellig) for status, brutto, ueberfaellig in rechnungen
             if status == "gestellt"]
    kommend = [betrag - gestellt for betrag, gestellt, _ in erwartet]

    return {
        "bezahlt": {"summe_cent": sum(bezahlt), "anzahl": len(bezahlt)},
        "offen": {
            "summe_cent": sum(brutto for brutto, _ in offen),
            "anzahl": len(offen),
            "ueberfaellig_cent": sum(brutto for brutto, ueberfaellig in offen
                                     if ueberfaellig),
            "ueberfaellig_anzahl": sum(1 for _, ueberfaellig in offen if ueberfaellig),
        },
        "kommend": {"summe_cent": sum(kommend), "anzahl": len(kommend)},
    }


def monatsreihe(conn, *, zurueck: int = 6, vor: int = 6,
                heute: date | None = None) -> list:
    """Je Monat die drei Ebenen: bezahlt nach bezahlt_am, offen nach
    Faelligkeit, kommend nach erwartetem Rechnungsdatum."""
    heute = heute or date.today()
    monate = _monate_spanne(heute, zurueck, vor)
    reihe = {monat: {"monat": monat, "bezahlt_cent": 0, "offen_cent": 0,
                     "kommend_cent": 0} for monat in monate}

    with conn.cursor() as cur:
        cur.execute("SELECT bezahlt_am, COALESCE(zahlbar_cent, brutto_cent) FROM rechnungen"
                    " WHERE status = 'bezahlt'")
        for bezahlt_am, brutto in cur.fetchall():
            monat = _monat(bezahlt_am)
            if monat in reihe:
                reihe[monat]["bezahlt_cent"] += brutto
        cur.execute("SELECT rechnungsdatum + zahlungsziel_tage, COALESCE(zahlbar_cent, brutto_cent)"
                    " FROM rechnungen WHERE status = 'gestellt'")
        for faellig_am, brutto in cur.fetchall():
            monat = _monat(faellig_am)
            if monat in reihe:
                reihe[monat]["offen_cent"] += brutto
        cur.execute("SELECT erwartet_am, betrag_cent, bereits_gestellt_cent,"
                    " status FROM erwartetes_geld WHERE status = ANY(%s)",
                    (list(KOMMEND_STATUS),))
        for erwartet_am, betrag, gestellt, status in cur.fetchall():
            monat = _monat(erwartet_am)
            if monat in reihe:
                reihe[monat]["kommend_cent"] += betrag - gestellt

    return [reihe[monat] for monat in monate]


# ── Erwartetes Geld: die schlanke Planungsliste ──────────────────────────────

def _zeile_zu_dict(cur, zeile) -> dict:
    namen = [beschreibung.name for beschreibung in cur.description]
    eintrag = dict(zip(namen, zeile))
    eintrag["offener_rest_cent"] = offener_rest(eintrag)
    return eintrag


def erwartet_liste(conn, *, mit_erledigten: bool = False) -> list:
    with conn.cursor() as cur:
        if mit_erledigten:
            cur.execute(f"SELECT {_ERWARTET_SPALTEN} FROM erwartetes_geld"
                        " ORDER BY erwartet_am, id")
        else:
            cur.execute(f"SELECT {_ERWARTET_SPALTEN} FROM erwartetes_geld"
                        " WHERE status NOT IN ('vollstaendig_gestellt', 'entfallen')"
                        " ORDER BY erwartet_am, id")
        return [_zeile_zu_dict(cur, zeile) for zeile in cur.fetchall()]


def erwartet_lesen(conn, eintrag_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_ERWARTET_SPALTEN} FROM erwartetes_geld"
                    " WHERE id = %s", (eintrag_id,))
        zeile = cur.fetchone()
        return None if zeile is None else _zeile_zu_dict(cur, zeile)


def _pruefen(felder: dict) -> None:
    if not str(felder.get("bezeichnung", "")).strip():
        raise ErwartetAbgelehnt("bezeichnung darf nicht leer sein")
    if felder.get("status") not in STATUS_WERTE:
        raise ErwartetAbgelehnt(f"status muss einer von {', '.join(STATUS_WERTE)} sein")
    betrag = felder.get("betrag_cent")
    gestellt = felder.get("bereits_gestellt_cent", 0)
    for name, wert in (("betrag_cent", betrag), ("bereits_gestellt_cent", gestellt)):
        if not isinstance(wert, int) or isinstance(wert, bool):
            raise ErwartetAbgelehnt(f"{name} muss eine ganze Zahl in Cent sein")
    if betrag <= 0:
        raise ErwartetAbgelehnt("betrag_cent muss groesser als 0 sein")
    if gestellt < 0 or gestellt > betrag:
        raise ErwartetAbgelehnt("bereits_gestellt_cent muss zwischen 0 und betrag liegen")
    if not felder.get("erwartet_am"):
        raise ErwartetAbgelehnt("erwartet_am fehlt")


_FELDER = ("bezeichnung", "auftraggeber_id", "betrag_cent",
           "bereits_gestellt_cent", "erwartet_am", "status", "notiz", "projekt_id")


def erwartet_anlegen(conn, *, felder: dict, akteur: str) -> dict:
    daten = {
        "bezeichnung": str(felder.get("bezeichnung", "")).strip(),
        "auftraggeber_id": felder.get("auftraggeber_id"),
        "betrag_cent": felder.get("betrag_cent"),
        "bereits_gestellt_cent": felder.get("bereits_gestellt_cent", 0),
        "erwartet_am": felder.get("erwartet_am"),
        "status": felder.get("status", "angefragt"),
        "notiz": str(felder.get("notiz", "") or "").strip(),
        "projekt_id": felder.get("projekt_id"),
    }
    _pruefen(daten)
    conn.rollback()
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO erwartetes_geld ({', '.join(_FELDER)})"
                f" VALUES ({', '.join(['%s'] * len(_FELDER))}) RETURNING id",
                tuple(daten[name] for name in _FELDER))
            (neu_id,) = cur.fetchone()
        audit_schreiben(conn, akteur, "erwartet_anlegen", erfolg=True,
                        nutzlast={"id": neu_id, "bezeichnung": daten["bezeichnung"]})
    return erwartet_lesen(conn, neu_id)


def erwartet_speichern(conn, *, eintrag_id: int, felder: dict, akteur: str) -> dict:
    bestand = erwartet_lesen(conn, eintrag_id)
    if bestand is None:
        raise ErwartetAbgelehnt(f"eintrag {eintrag_id} existiert nicht")
    daten = {name: felder.get(name, bestand[name]) for name in _FELDER}
    daten["bezeichnung"] = str(daten["bezeichnung"] or "").strip()
    daten["notiz"] = str(daten["notiz"] or "").strip()
    _pruefen(daten)
    conn.rollback()
    with conn.transaction():
        zuweisungen = ", ".join(f"{name} = %s" for name in _FELDER)
        conn.execute(f"UPDATE erwartetes_geld SET {zuweisungen} WHERE id = %s",
                     tuple(daten[name] for name in _FELDER) + (eintrag_id,))
        audit_schreiben(conn, akteur, "erwartet_speichern", erfolg=True,
                        nutzlast={"id": eintrag_id, "status": daten["status"]})
    return erwartet_lesen(conn, eintrag_id)
