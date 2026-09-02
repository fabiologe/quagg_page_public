"""Stammdaten: eigene Firmendaten (Verkaeufer) und Auftraggeber (Kaeufer).

Firmendaten sind EINE Zeile (Migration legt sie leer an); Auftraggeber werden
nie geloescht, nur deaktiviert. Jede Aenderung wird auditiert. Die harte
Leitweg-Pruefung passiert schon beim Speichern — ein Tippfehler soll beim
Anlegen auffallen, nicht erst bei der Portal-Ablehnung.
"""

from .audit import audit_schreiben
from .xrechnung import firmendaten_fehlend, leitweg_pruefen


class StammdatenAbgelehnt(ValueError):
    """Fachliche Ablehnung — Router uebersetzt in 422."""


_FIRMA_FELDER = ("name", "rechtsform_zusatz", "strasse", "plz", "ort", "land",
                 "steuernummer", "ust_id", "iban", "bic", "bank_name",
                 "email", "telefon", "ansprechpartner",
                 "datev_berater", "datev_mandant")

_AG_FELDER = ("name", "strasse", "plz", "ort", "land", "leitweg_id", "portal",
              "email", "telefon", "ansprechpartner", "notiz")

PORTALE = ("zre_rlp", "zre_bw")


def _dict_aus(cur):
    spalten = [beschreibung.name for beschreibung in cur.description]
    zeile = cur.fetchone()
    return None if zeile is None else dict(zip(spalten, zeile))


def firmendaten_lesen(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {', '.join(_FIRMA_FELDER)}, aktualisiert_am"
                    " FROM firmendaten WHERE id = 1")
        firma = _dict_aus(cur)
    firma["fehlend"] = firmendaten_fehlend(firma)
    return firma


def firmendaten_speichern(conn, *, felder: dict, akteur: str) -> dict:
    unbekannt = set(felder) - set(_FIRMA_FELDER)
    if unbekannt:
        raise StammdatenAbgelehnt(f"unbekannte felder: {', '.join(sorted(unbekannt))}")
    if not felder:
        raise StammdatenAbgelehnt("keine felder uebergeben")
    conn.rollback()
    with conn.transaction():
        zuweisungen = ", ".join(f"{name} = %s" for name in felder)
        conn.execute(f"UPDATE firmendaten SET {zuweisungen} WHERE id = 1",
                     tuple(str(wert or "").strip() for wert in felder.values()))
        audit_schreiben(conn, akteur, "firmendaten_speichern", erfolg=True,
                        nutzlast={"felder": sorted(felder)})
    return firmendaten_lesen(conn)


def _auftraggeber_pruefen(felder: dict) -> None:
    if not str(felder.get("name", "")).strip():
        raise StammdatenAbgelehnt("name darf nicht leer sein")
    if felder.get("portal") not in PORTALE:
        raise StammdatenAbgelehnt(f"portal muss eines von {', '.join(PORTALE)} sein")
    leitweg_fehler = leitweg_pruefen(felder.get("leitweg_id", ""))
    if leitweg_fehler:
        raise StammdatenAbgelehnt(leitweg_fehler)


def auftraggeber_liste(conn, *, nur_aktive: bool = True) -> list:
    with conn.cursor() as cur:
        bedingung = "WHERE aktiv" if nur_aktive else ""
        cur.execute(f"SELECT id, {', '.join(_AG_FELDER)}, aktiv, angelegt_am,"
                    f" aktualisiert_am FROM auftraggeber {bedingung} ORDER BY name")
        spalten = [beschreibung.name for beschreibung in cur.description]
        return [dict(zip(spalten, zeile)) for zeile in cur]


def auftraggeber_lesen(conn, auftraggeber_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT id, {', '.join(_AG_FELDER)}, aktiv FROM auftraggeber"
                    " WHERE id = %s", (auftraggeber_id,))
        return _dict_aus(cur)


def auftraggeber_anlegen(conn, *, felder: dict, akteur: str) -> dict:
    daten = {name: str(felder.get(name, "") or "").strip() for name in _AG_FELDER}
    daten["land"] = daten["land"] or "DE"
    _auftraggeber_pruefen(daten)
    conn.rollback()
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO auftraggeber ({', '.join(_AG_FELDER)})"
                f" VALUES ({', '.join(['%s'] * len(_AG_FELDER))}) RETURNING id",
                tuple(daten[name] for name in _AG_FELDER))
            (neu_id,) = cur.fetchone()
        audit_schreiben(conn, akteur, "auftraggeber_anlegen", erfolg=True,
                        nutzlast={"id": neu_id, "name": daten["name"]})
    return auftraggeber_lesen(conn, neu_id)


def auftraggeber_speichern(conn, *, auftraggeber_id: int, felder: dict,
                           akteur: str) -> dict:
    bestand = auftraggeber_lesen(conn, auftraggeber_id)
    if bestand is None:
        raise StammdatenAbgelehnt(f"auftraggeber {auftraggeber_id} existiert nicht")
    daten = {name: str(felder.get(name, bestand[name]) or "").strip()
             for name in _AG_FELDER}
    _auftraggeber_pruefen(daten)
    aktiv = bool(felder.get("aktiv", bestand["aktiv"]))
    conn.rollback()
    with conn.transaction():
        zuweisungen = ", ".join(f"{name} = %s" for name in _AG_FELDER)
        conn.execute(
            f"UPDATE auftraggeber SET {zuweisungen}, aktiv = %s WHERE id = %s",
            tuple(daten[name] for name in _AG_FELDER) + (aktiv, auftraggeber_id))
        audit_schreiben(conn, akteur, "auftraggeber_speichern", erfolg=True,
                        nutzlast={"id": auftraggeber_id, "aktiv": aktiv})
    return auftraggeber_lesen(conn, auftraggeber_id)
