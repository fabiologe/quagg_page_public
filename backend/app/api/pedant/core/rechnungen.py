"""Rechnungs-Lebenslauf: Entwurf -> gestellt -> bezahlt (| verworfen).

Lueckenlosigkeit konstruktiv: Entwuerfe haben KEINE Nummer; die Nummer wird
atomar beim Stellen vergeben, und verwerfen geht nur ohne Nummer. Das Stellen
ist der Tuersteher-Moment: Pflichtfelder -> UBL erzeugen -> KoSIT-Validator
(rot = 422, NICHTS persistiert, keine Luecke) -> gruen = Nummer + Snapshot,
XML+Bericht content-adressiert abgelegt, Forderungs-Buchung 1200 an 4400
brutto im Journal (steuerschluessel '' — 4400 ist DATEV-Automatikkonto),
Status gestellt. Idempotent und selbstheilend wie belege.freigeben.
"""

from datetime import date

from . import journal, kosit, xrechnung
from .ablage import bytes_speichern
from .audit import audit_schreiben
from .stammdaten import auftraggeber_lesen, firmendaten_lesen


class RechnungAbgelehnt(ValueError):
    """Fachliche Ablehnung — Router uebersetzt in 422."""

    def __init__(self, grund: str, meldungen: list | None = None):
        super().__init__(grund)
        self.meldungen = meldungen or []


FORDERUNGSKONTO = "1200"
ERLOESKONTO = "4400"   # DATEV-Automatikkonto Erloese 19 % — traegt KEINEN BU-Schluessel

_KOPF_FELDER = ("auftraggeber_id", "auftrag_referenz", "rechnungsdatum",
                "leistung_von", "leistung_bis", "zahlungsziel_tage", "projekt_id",
                "rechnungstyp")

_SPALTEN = ("id, re_jahr, re_lfd, rechnungsnummer, auftraggeber_id,"
            " auftrag_referenz, leitweg_id, rechnungsdatum, leistung_von,"
            " leistung_bis, steuersatz, zahlungsziel_tage, status, netto_cent,"
            " steuer_cent, brutto_cent, gestellt_am, bezahlt_am, versand_weg,"
            " versand_am, xml_pfad, xml_sha256, bericht_pfad, buchung_lfd_nr,"
            " verworfen_grund, angelegt_am, aktualisiert_am, projekt_id,"
            " rechnungstyp, vorab_cent, zahlbar_cent")


def _ablehnung(conn, akteur, aktion, nutzlast, grund, meldungen=None):
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, aktion, erfolg=False,
                        nutzlast={**nutzlast, "grund": grund})
    raise RechnungAbgelehnt(grund, meldungen)


def _positionen_lesen(conn, rechnung_id: int) -> list:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pos_nr, bezeichnung, menge_tausendstel, einheit,"
            "       einzelpreis_cent, betrag_cent, abschnitt_id"
            "  FROM rechnungspositionen WHERE rechnung_id = %s ORDER BY pos_nr",
            (rechnung_id,))
        spalten = [beschreibung.name for beschreibung in cur.description]
        return [dict(zip(spalten, zeile)) for zeile in cur]


def _vorrechnungen_lesen(conn, rechnung_id: int) -> list:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT v.id, v.rechnungsnummer, v.rechnungsdatum, v.status, v.netto_cent, v.brutto_cent"
            "  FROM rechnungsreferenzen r JOIN rechnungen v ON v.id = r.vor_rechnung_id"
            " WHERE r.rechnung_id = %s ORDER BY v.re_jahr, v.re_lfd, v.id", (rechnung_id,))
        spalten = [b.name for b in cur.description]
        return [dict(zip(spalten, zeile)) for zeile in cur]


def _anreichern(conn, roh: dict) -> dict:
    """Positionen + Vorrechnungen + Live-Summen + Faelligkeit + Pflichtfeld-Befund dazu."""
    roh["positionen"] = _positionen_lesen(conn, roh["id"])
    roh["vorrechnungen"] = _vorrechnungen_lesen(conn, roh["id"])
    if roh["status"] == "entwurf":
        betraege = xrechnung.summen(roh["positionen"], roh["steuersatz"])
        roh["netto_cent"] = betraege.netto_cent
        roh["steuer_cent"] = betraege.steuer_cent
        roh["brutto_cent"] = betraege.brutto_cent
        roh["vorab_cent"] = sum(int(v["brutto_cent"] or 0) for v in roh["vorrechnungen"]
                                if v["status"] in ("gestellt", "bezahlt"))
        roh["zahlbar_cent"] = max(0, roh["brutto_cent"] - roh["vorab_cent"])
    roh["faellig_am"] = xrechnung.faellig_am(
        roh["rechnungsdatum"], roh["zahlungsziel_tage"])
    if roh["xml_sha256"]:
        roh["xml_sha256"] = roh["xml_sha256"].strip()
    return roh


def rechnung_lesen(conn, rechnung_id: int) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_SPALTEN} FROM rechnungen WHERE id = %s",
                    (rechnung_id,))
        zeile = cur.fetchone()
        if zeile is None:
            return None
        namen = [name.strip() for name in _SPALTEN.split(",")]
        return _anreichern(conn, dict(zip(namen, zeile)))


def rechnungen_liste(conn, *, status: str | None = None, limit: int = 100,
                     projekt_id: int | None = None) -> list:
    bedingungen, werte = [], []
    if status:
        bedingungen.append("status = %s")
        werte.append(status)
    if projekt_id is not None:
        bedingungen.append("projekt_id = %s")
        werte.append(projekt_id)
    wo = f" WHERE {' AND '.join(bedingungen)}" if bedingungen else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_SPALTEN} FROM rechnungen{wo} ORDER BY id DESC LIMIT %s",
                    (*werte, limit))
        namen = [name.strip() for name in _SPALTEN.split(",")]
        zeilen = [dict(zip(namen, zeile)) for zeile in cur]
    return [_anreichern(conn, zeile) for zeile in zeilen]


def _kopf_normalisieren(felder: dict) -> dict:
    daten = {}
    for name in _KOPF_FELDER:
        if name in felder:
            daten[name] = felder[name]
    if "auftrag_referenz" in daten:
        daten["auftrag_referenz"] = str(daten["auftrag_referenz"] or "").strip()
    if "rechnungstyp" in daten:
        if daten["rechnungstyp"] is None:
            daten.pop("rechnungstyp")
        elif str(daten["rechnungstyp"]) not in xrechnung.RECHNUNGSTYPEN:
            raise RechnungAbgelehnt(f"rechnungstyp muss einer von {', '.join(xrechnung.RECHNUNGSTYPEN)} sein")
    return daten


def referenzen_setzen(conn, *, rechnung_id: int, vor_rechnung_ids: list, akteur: str) -> dict:
    """Vorrechnungen einer Schlussrechnung (BG-3): gestellte Abschlaege oder fruehere
    Schlussrechnungen desselben Auftraggebers — ersetzt den Satz komplett, nur im Entwurf."""
    rechnung = _entwurf_oder_fehler(conn, rechnung_id, akteur, "rechnung_referenzen")
    ids = sorted({int(i) for i in vor_rechnung_ids})
    if rechnung_id in ids:
        _ablehnung(conn, akteur, "rechnung_referenzen", {"rechnung_id": rechnung_id},
                   "eine rechnung referenziert sich nicht selbst")
    for vid in ids:
        vor = rechnung_lesen(conn, vid)
        if vor is None or vor["status"] not in ("gestellt", "bezahlt"):
            _ablehnung(conn, akteur, "rechnung_referenzen", {"rechnung_id": rechnung_id},
                       f"vorrechnung {vid} existiert nicht oder ist nicht gestellt")
        if vor["auftraggeber_id"] != rechnung["auftraggeber_id"]:
            _ablehnung(conn, akteur, "rechnung_referenzen", {"rechnung_id": rechnung_id},
                       f"vorrechnung {vor['rechnungsnummer']} gehoert einem anderen auftraggeber")
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM rechnungsreferenzen WHERE rechnung_id = %s", (rechnung_id,))
        for vid in ids:
            conn.execute("INSERT INTO rechnungsreferenzen (rechnung_id, vor_rechnung_id) VALUES (%s, %s)",
                         (rechnung_id, vid))
        audit_schreiben(conn, akteur, "rechnung_referenzen", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id, "vorrechnungen": ids})
    return rechnung_lesen(conn, rechnung_id)


def rechnung_anlegen(conn, *, felder: dict, akteur: str) -> dict:
    daten = _kopf_normalisieren(felder)
    fehlend = [name for name in ("auftraggeber_id", "rechnungsdatum",
                                 "leistung_von", "leistung_bis")
               if not daten.get(name)]
    if fehlend:
        _ablehnung(conn, akteur, "rechnung_anlegen", {},
                   f"pflichtfelder fehlen: {', '.join(fehlend)}")
    if auftraggeber_lesen(conn, daten["auftraggeber_id"]) is None:
        _ablehnung(conn, akteur, "rechnung_anlegen", {},
                   f"auftraggeber {daten['auftraggeber_id']} existiert nicht")
    daten.setdefault("auftrag_referenz", "")
    daten.setdefault("zahlungsziel_tage", 30)
    conn.rollback()
    with conn.transaction():
        with conn.cursor() as cur:
            spalten = ", ".join(daten)
            platzhalter = ", ".join(["%s"] * len(daten))
            cur.execute(f"INSERT INTO rechnungen ({spalten})"
                        f" VALUES ({platzhalter}) RETURNING id",
                        tuple(daten.values()))
            (neu_id,) = cur.fetchone()
        audit_schreiben(conn, akteur, "rechnung_anlegen", erfolg=True,
                        nutzlast={"rechnung_id": neu_id})
    return rechnung_lesen(conn, neu_id)


def _entwurf_oder_fehler(conn, rechnung_id: int, akteur: str, aktion: str) -> dict:
    rechnung = rechnung_lesen(conn, rechnung_id)
    if rechnung is None:
        _ablehnung(conn, akteur, aktion, {"rechnung_id": rechnung_id},
                   f"rechnung {rechnung_id} existiert nicht")
    if rechnung["status"] != "entwurf":
        _ablehnung(conn, akteur, aktion, {"rechnung_id": rechnung_id},
                   f"rechnung ist {rechnung['status']} — nur entwuerfe sind formbar")
    return rechnung


def kopf_speichern(conn, *, rechnung_id: int, felder: dict, akteur: str) -> dict:
    _entwurf_oder_fehler(conn, rechnung_id, akteur, "rechnung_kopf")
    daten = _kopf_normalisieren(felder)
    if not daten:
        raise RechnungAbgelehnt("keine bekannten felder uebergeben")
    conn.rollback()
    with conn.transaction():
        zuweisungen = ", ".join(f"{name} = %s" for name in daten)
        conn.execute(f"UPDATE rechnungen SET {zuweisungen} WHERE id = %s",
                     tuple(daten.values()) + (rechnung_id,))
        audit_schreiben(conn, akteur, "rechnung_kopf", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id,
                                  "felder": sorted(daten)})
    return rechnung_lesen(conn, rechnung_id)


def positionen_speichern(conn, *, rechnung_id: int, positionen: list,
                         akteur: str) -> dict:
    """Ersetzt den kompletten Positionssatz (nur im Entwurf — Trigger sichert)."""
    _entwurf_oder_fehler(conn, rechnung_id, akteur, "rechnung_positionen")
    if not positionen:
        _ablehnung(conn, akteur, "rechnung_positionen",
                   {"rechnung_id": rechnung_id}, "mindestens eine position")
    for stelle, position in enumerate(positionen, start=1):
        if position.get("einheit") not in xrechnung.EINHEITEN:
            _ablehnung(conn, akteur, "rechnung_positionen",
                       {"rechnung_id": rechnung_id},
                       f"position {stelle}: einheit muss eine von"
                       f" {', '.join(xrechnung.EINHEITEN)} sein")
        if not str(position.get("bezeichnung", "")).strip():
            _ablehnung(conn, akteur, "rechnung_positionen",
                       {"rechnung_id": rechnung_id},
                       f"position {stelle}: bezeichnung fehlt")
        menge = position.get("menge_tausendstel")
        preis = position.get("einzelpreis_cent")
        if not isinstance(menge, int) or isinstance(menge, bool) or menge <= 0:
            _ablehnung(conn, akteur, "rechnung_positionen",
                       {"rechnung_id": rechnung_id},
                       f"position {stelle}: menge_tausendstel muss positive ganzzahl sein")
        if not isinstance(preis, int) or isinstance(preis, bool) or preis < 0:
            _ablehnung(conn, akteur, "rechnung_positionen",
                       {"rechnung_id": rechnung_id},
                       f"position {stelle}: einzelpreis_cent muss ganzzahl >= 0 sein")
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM rechnungspositionen WHERE rechnung_id = %s",
                     (rechnung_id,))
        with conn.cursor() as cur:
            for stelle, position in enumerate(positionen, start=1):
                cur.execute(
                    "INSERT INTO rechnungspositionen (rechnung_id, pos_nr,"
                    " bezeichnung, menge_tausendstel, einheit, einzelpreis_cent, abschnitt_id)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (rechnung_id, stelle, position["bezeichnung"].strip(),
                     position["menge_tausendstel"], position["einheit"],
                     position["einzelpreis_cent"], position.get("abschnitt_id")))
        audit_schreiben(conn, akteur, "rechnung_positionen", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id,
                                  "anzahl": len(positionen)})
    return rechnung_lesen(conn, rechnung_id)


def verwerfen(conn, *, rechnung_id: int, grund: str, akteur: str) -> dict:
    if not str(grund or "").strip():
        _ablehnung(conn, akteur, "rechnung_verworfen",
                   {"rechnung_id": rechnung_id}, "verwerfen braucht einen grund")
    rechnung = _entwurf_oder_fehler(conn, rechnung_id, akteur, "rechnung_verworfen")
    if rechnung["re_lfd"] is not None:
        _ablehnung(conn, akteur, "rechnung_verworfen",
                   {"rechnung_id": rechnung_id},
                   "entwurf traegt schon eine nummer — stellen abschliessen"
                   " statt verwerfen (lueckenlosigkeit)")
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE rechnungen SET status = 'verworfen',"
                     " verworfen_grund = %s WHERE id = %s",
                     (grund.strip(), rechnung_id))
        audit_schreiben(conn, akteur, "rechnung_verworfen", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id, "grund": grund.strip()})
    return rechnung_lesen(conn, rechnung_id)


def vorpruefung(conn, *, rechnung_id: int, mit_validator: bool = False,
                akteur: str) -> dict:
    """Pflichtfelder (immer) + optional ein KoSIT-Probelauf mit Kandidaten-
    nummer — persistiert NICHTS, verbraucht keine Nummer."""
    rechnung = rechnung_lesen(conn, rechnung_id)
    if rechnung is None:
        raise RechnungAbgelehnt(f"rechnung {rechnung_id} existiert nicht")
    firma = firmendaten_lesen(conn)
    auftraggeber = auftraggeber_lesen(conn, rechnung["auftraggeber_id"])
    fehler = xrechnung.pflichtfelder_pruefen(
        firma=firma, auftraggeber=auftraggeber, rechnung=rechnung,
        positionen=rechnung["positionen"])
    ergebnis = {"pflichtfelder_ok": not fehler, "fehler": fehler,
                "validator": None}
    if mit_validator and not fehler and rechnung["status"] == "entwurf":
        kandidat = _nummer_kandidat(conn, rechnung)
        xml = _xml_bauen(rechnung, kandidat, firma, auftraggeber)
        bericht = kosit.validieren(xml)
        ergebnis["validator"] = {"valide": bericht.valide,
                                 "meldungen": bericht.meldungen}
    return ergebnis


def _nummer_kandidat(conn, rechnung: dict) -> str:
    if rechnung["re_lfd"] is not None:
        return rechnung["rechnungsnummer"]
    jahr = rechnung["rechnungsdatum"].year
    with conn.cursor() as cur:
        cur.execute("SELECT coalesce(max(re_lfd), 0) + 1 FROM rechnungen"
                    " WHERE re_jahr = %s", (jahr,))
        (lfd,) = cur.fetchone()
    return f"RE-{jahr}-{lfd:04d}"


def _xml_bauen(rechnung: dict, nummer: str, firma: dict, auftraggeber: dict) -> bytes:
    betraege = xrechnung.summen(rechnung["positionen"], rechnung["steuersatz"])
    return xrechnung.ubl_erzeugen(
        rechnungsnummer=nummer, firma=firma, auftraggeber=auftraggeber,
        rechnung=rechnung, positionen=rechnung["positionen"], betraege=betraege,
        vorrechnungen=rechnung.get("vorrechnungen", ()), vorab_cent=int(rechnung.get("vorab_cent") or 0))


def stellen(conn, *, rechnung_id: int, akteur: str) -> dict:
    """Der Tuersteher-Moment — siehe Modulkopf. Locks: (43, id) gegen
    Doppelklick, (43, 0) global fuer die Nummernvergabe."""
    conn.rollback()
    conn.execute("SELECT pg_advisory_lock(43, %s)", (rechnung_id,))
    conn.execute("SELECT pg_advisory_lock(43, 0)")
    # Die Lock-SELECTs oeffnen eine implizite Transaktion — sofort schliessen,
    # sonst werden die conn.transaction()-Bloecke unten nur SAVEPOINTS und ein
    # spaeteres rollback() vernichtet die Nummernvergabe still (dieselbe
    # psycopg-Falle wie in Phase 2, journal.buchung_anlegen-Kommentar).
    # Advisory-Locks sind session-level und ueberleben das Commit.
    conn.commit()
    try:
        rechnung = rechnung_lesen(conn, rechnung_id)
        if rechnung is None:
            _ablehnung(conn, akteur, "rechnung_stellen",
                       {"rechnung_id": rechnung_id},
                       f"rechnung {rechnung_id} existiert nicht")
        if rechnung["status"] in ("gestellt", "bezahlt"):
            return {"rechnungsnummer": rechnung["rechnungsnummer"],
                    "lfd_nr": rechnung["buchung_lfd_nr"],
                    "bereits_gestellt": True}
        if rechnung["status"] != "entwurf":
            _ablehnung(conn, akteur, "rechnung_stellen",
                       {"rechnung_id": rechnung_id},
                       f"rechnung ist {rechnung['status']}")

        firma = firmendaten_lesen(conn)
        auftraggeber = auftraggeber_lesen(conn, rechnung["auftraggeber_id"])
        fehler = xrechnung.pflichtfelder_pruefen(
            firma=firma, auftraggeber=auftraggeber, rechnung=rechnung,
            positionen=rechnung["positionen"])
        if fehler:
            _ablehnung(conn, akteur, "rechnung_stellen",
                       {"rechnung_id": rechnung_id},
                       "pflichtfelder unvollstaendig", meldungen=fehler)

        nummer = _nummer_kandidat(conn, rechnung)
        xml = _xml_bauen(rechnung, nummer, firma, auftraggeber)

        # KoSIT VOR jeder Persistenz: rot -> 422, keine Nummer verbraucht.
        bericht = kosit.validieren(xml)
        if not bericht.valide:
            _ablehnung(conn, akteur, "rechnung_stellen",
                       {"rechnung_id": rechnung_id, "kandidat": nummer},
                       "kosit-validator lehnt die rechnung ab",
                       meldungen=bericht.meldungen)

        betraege = xrechnung.summen(rechnung["positionen"], rechnung["steuersatz"])
        jahr = rechnung["rechnungsdatum"].year
        vorab = int(rechnung.get("vorab_cent") or 0)
        if vorab > betraege.brutto_cent:
            _ablehnung(conn, akteur, "rechnung_stellen", {"rechnung_id": rechnung_id},
                       "gestellte abschlaege uebersteigen die rechnungssumme")
        zahlbar = betraege.brutto_cent - vorab
        if zahlbar <= 0:
            # Der Status 'gestellt' verlangt eine Forderungsbuchung (CHECK); eine
            # Schlussrechnung ohne Restbetrag ist im Journal nichts — als
            # Abschlusszeile stattdessen einen Restbetrag > 0 lassen oder verwerfen.
            _ablehnung(conn, akteur, "rechnung_stellen", {"rechnung_id": rechnung_id},
                       "zahlbarer rest ist null — abschlaege decken die rechnungssumme")

        # Schritt 1: Nummer + Snapshot binden (Status bleibt entwurf) — ab
        # jetzt ist der Journal-Dedup ueber die Nummer eindeutig, ein Crash
        # heilt sich beim naechsten Aufruf.
        if rechnung["re_lfd"] is None:
            conn.rollback()  # offene Lese-Transaktion beenden (Savepoint-Falle)
            with conn.transaction():
                conn.execute(
                    "UPDATE rechnungen SET re_jahr = %s, re_lfd = %s,"
                    " leitweg_id = %s, netto_cent = %s, steuer_cent = %s,"
                    " brutto_cent = %s, vorab_cent = %s, zahlbar_cent = %s WHERE id = %s",
                    (jahr, int(nummer.rsplit("-", 1)[1]),
                     auftraggeber["leitweg_id"], betraege.netto_cent,
                     betraege.steuer_cent, betraege.brutto_cent, vorab, zahlbar, rechnung_id))

        # Schritt 2: XML + HTML-Bericht content-adressiert ablegen (idempotent).
        xml_ablage = bytes_speichern(xml, endung=".xml", jahr=jahr)
        bericht_ablage = bytes_speichern(
            bericht.report_html or bericht.report_xml,
            endung=".html" if bericht.report_html else ".xml", jahr=jahr)

        # Schritt 3: Forderungs-Buchung (Dedup ueber belegreferenz).
        with conn.cursor() as cur:
            # Einschraenkung auf die FORDERUNGSBUCHUNG: ab Phase 5 traegt auch
            # die Zahlungsbuchung (1800 an 1200) dieselbe belegreferenz.
            cur.execute("SELECT lfd_nr FROM buchungssaetze"
                        " WHERE belegreferenz = %s AND stornoreferenz IS NULL"
                        "   AND sollkonto = %s AND habenkonto = %s",
                        (nummer, FORDERUNGSKONTO, ERLOESKONTO))
            zeile = cur.fetchone()
        conn.rollback()
        if zeile is not None:
            lfd_nr = zeile[0]
        else:
            ergebnis = journal.buchung_anlegen(
                conn, buchungsdatum=rechnung["rechnungsdatum"],
                belegdatum=rechnung["rechnungsdatum"],
                sollkonto=FORDERUNGSKONTO, habenkonto=ERLOESKONTO,
                betrag_cent=zahlbar, steuerschluessel="",
                buchungstext=f"AR {nummer} {auftraggeber['name']}",
                belegreferenz=nummer, akteur=akteur, aktion="rechnung_stellen")
            lfd_nr = ergebnis["lfd_nr"]

        # Schritt 4: Finalisieren.
        conn.rollback()  # offene Lese-Transaktion beenden (Savepoint-Falle)
        with conn.transaction():
            conn.execute(
                "UPDATE rechnungen SET status = 'gestellt', gestellt_am = now(),"
                " xml_pfad = %s, xml_sha256 = %s, bericht_pfad = %s,"
                " buchung_lfd_nr = %s WHERE id = %s",
                (xml_ablage.relativ, xml_ablage.sha256,
                 bericht_ablage.relativ, lfd_nr, rechnung_id))
            audit_schreiben(conn, akteur, "rechnung_gestellt", erfolg=True,
                            nutzlast={"rechnung_id": rechnung_id,
                                      "rechnungsnummer": nummer,
                                      "lfd_nr": lfd_nr,
                                      "brutto_cent": betraege.brutto_cent})
        return {"rechnungsnummer": nummer, "lfd_nr": lfd_nr,
                "bereits_gestellt": False}
    finally:
        conn.execute("SELECT pg_advisory_unlock(43, 0)")
        conn.execute("SELECT pg_advisory_unlock(43, %s)", (rechnung_id,))
        conn.commit()


def versand_vermerken(conn, *, rechnung_id: int, weg: str, akteur: str) -> dict:
    if weg not in ("zre_rlp", "zre_bw"):
        raise RechnungAbgelehnt("versand_weg muss zre_rlp oder zre_bw sein")
    rechnung = rechnung_lesen(conn, rechnung_id)
    if rechnung is None:
        raise RechnungAbgelehnt(f"rechnung {rechnung_id} existiert nicht")
    if rechnung["status"] not in ("gestellt", "bezahlt"):
        raise RechnungAbgelehnt("versand gibt es erst nach dem stellen")
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE rechnungen SET versand_weg = %s, versand_am = now()"
                     " WHERE id = %s", (weg, rechnung_id))
        audit_schreiben(conn, akteur, "rechnung_versand", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id, "weg": weg})
    return rechnung_lesen(conn, rechnung_id)


def bezahlt_setzen(conn, *, rechnung_id: int, bezahlt: bool,
                   bezahlt_am: date | None, akteur: str) -> dict:
    """Manuelle Statuspflege bis Phase 5 (Bankabgleich) — rueckholbar."""
    rechnung = rechnung_lesen(conn, rechnung_id)
    if rechnung is None:
        raise RechnungAbgelehnt(f"rechnung {rechnung_id} existiert nicht")
    if bezahlt and rechnung["status"] not in ("gestellt", "bezahlt"):
        raise RechnungAbgelehnt("nur gestellte rechnungen koennen bezahlt sein")
    if not bezahlt and rechnung["status"] != "bezahlt":
        raise RechnungAbgelehnt("rechnung ist nicht als bezahlt markiert")
    conn.rollback()
    with conn.transaction():
        if bezahlt:
            conn.execute("UPDATE rechnungen SET status = 'bezahlt',"
                         " bezahlt_am = %s WHERE id = %s",
                         (bezahlt_am or date.today(), rechnung_id))
        else:
            conn.execute("UPDATE rechnungen SET status = 'gestellt',"
                         " bezahlt_am = NULL WHERE id = %s", (rechnung_id,))
        audit_schreiben(conn, akteur, "rechnung_bezahlt", erfolg=True,
                        nutzlast={"rechnung_id": rechnung_id, "bezahlt": bezahlt})
    return rechnung_lesen(conn, rechnung_id)
