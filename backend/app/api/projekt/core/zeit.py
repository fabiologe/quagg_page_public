"""Zeiterfassung: Buchungen in Minuten, ein Timer je Akteur, Auswertungen,
Rechnung aus Stunden (HUR) ueber den Pedanten."""

from datetime import date, datetime, timedelta, timezone

from .audit import audit_schreiben

# Der Pedant-Rechnungskern zieht lxml/KoSIT — im MCP-venv nicht vorhanden. Deshalb
# lazy importiert, genau dort, wo eine Rechnung entsteht (nie beim Lesen).

_SPALTEN = ("id", "projekt_id", "abschnitt_id", "aufgabe_id", "datum", "dauer_min", "taetigkeit",
            "abrechenbar", "rechnung_id", "akteur", "angelegt_am", "aktualisiert_am")
_SELECT = f"SELECT {', '.join(_SPALTEN)} FROM projekt.zeitbuchungen"
_AENDERBAR = ("abschnitt_id", "aufgabe_id", "datum", "dauer_min", "taetigkeit", "abrechenbar")
MAX_MIN = 1440


class ZeitAbgelehnt(ValueError):
    """Router: 422."""


class ZeitUnbekannt(KeyError):
    """Router: 404."""


def _zeile(row) -> dict:
    return dict(zip(_SPALTEN, row))


def _pruefen(felder: dict) -> dict:
    sauber = {k: v for k, v in felder.items() if k in _AENDERBAR}
    fremd = set(felder) - set(sauber)
    if fremd:
        raise ZeitAbgelehnt(f"felder nicht aenderbar: {', '.join(sorted(fremd))}")
    if "dauer_min" in sauber and not 0 < int(sauber["dauer_min"]) <= MAX_MIN:
        raise ZeitAbgelehnt(f"dauer_min muss zwischen 1 und {MAX_MIN} liegen")
    if "taetigkeit" in sauber and not str(sauber["taetigkeit"] or "").strip():
        raise ZeitAbgelehnt("taetigkeit darf nicht leer sein")
    return sauber


# ── Buchungen ────────────────────────────────────────────────────────────────

def liste(conn, projekt_id: int, *, von: date | None = None, bis: date | None = None) -> list[dict]:
    bedingungen, werte = ["projekt_id = %s"], [projekt_id]
    if von:
        bedingungen.append("datum >= %s")
        werte.append(von)
    if bis:
        bedingungen.append("datum <= %s")
        werte.append(bis)
    return [_zeile(r) for r in conn.execute(
        f"{_SELECT} WHERE {' AND '.join(bedingungen)} ORDER BY datum DESC, id DESC", werte)]


def buchen(conn, projekt_id: int, *, datum: date, dauer_min: int, taetigkeit: str, akteur: str,
           abschnitt_id: int | None = None, aufgabe_id: int | None = None, abrechenbar: bool = True) -> dict:
    felder = _pruefen(dict(datum=datum, dauer_min=dauer_min, taetigkeit=taetigkeit,
                           abschnitt_id=abschnitt_id, aufgabe_id=aufgabe_id, abrechenbar=abrechenbar))
    conn.rollback()
    with conn.transaction():
        row = conn.execute(
            "INSERT INTO projekt.zeitbuchungen (projekt_id, abschnitt_id, aufgabe_id, datum, dauer_min,"
            " taetigkeit, abrechenbar, akteur) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
            f" RETURNING {', '.join(_SPALTEN)}",
            (projekt_id, felder["abschnitt_id"], felder["aufgabe_id"], felder["datum"], int(felder["dauer_min"]),
             felder["taetigkeit"].strip(), felder["abrechenbar"], akteur)).fetchone()
        neu = _zeile(row)
        audit_schreiben(conn, akteur, "zeit_buchen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": neu["id"], "dauer_min": neu["dauer_min"]})
    return neu


def aendern(conn, projekt_id: int, buchung_id: int, felder: dict, *, akteur: str) -> dict:
    sauber = _pruefen(felder)
    if not sauber:
        raise ZeitAbgelehnt("keine aenderbaren felder")
    if "taetigkeit" in sauber:
        sauber["taetigkeit"] = sauber["taetigkeit"].strip()
    conn.rollback()
    alt = conn.execute(f"{_SELECT} WHERE id = %s AND projekt_id = %s", (buchung_id, projekt_id)).fetchone()
    if alt is None:
        raise ZeitUnbekannt(buchung_id)
    if _zeile(alt)["rechnung_id"] is not None:
        raise ZeitAbgelehnt("buchung ist abgerechnet und eingefroren")
    conn.rollback()  # Savepoint-Falle: das SELECT hat eine implizite Transaktion geoeffnet
    with conn.transaction():
        row = conn.execute(
            f"UPDATE projekt.zeitbuchungen SET {', '.join(f'{k} = %s' for k in sauber)}"
            f" WHERE id = %s RETURNING {', '.join(_SPALTEN)}", [*sauber.values(), buchung_id]).fetchone()
        audit_schreiben(conn, akteur, "zeit_aendern", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": buchung_id, "felder": sauber})
    return _zeile(row)


def loeschen(conn, projekt_id: int, buchung_id: int, *, akteur: str) -> None:
    conn.rollback()
    alt = conn.execute(f"{_SELECT} WHERE id = %s AND projekt_id = %s", (buchung_id, projekt_id)).fetchone()
    if alt is None:
        raise ZeitUnbekannt(buchung_id)
    if _zeile(alt)["rechnung_id"] is not None:
        raise ZeitAbgelehnt("buchung ist abgerechnet und eingefroren")
    conn.rollback()  # Savepoint-Falle: das SELECT hat eine implizite Transaktion geoeffnet
    with conn.transaction():
        conn.execute("DELETE FROM projekt.zeitbuchungen WHERE id = %s", (buchung_id,))
        audit_schreiben(conn, akteur, "zeit_loeschen", erfolg=True,
                        nutzlast={"projekt_id": projekt_id, "id": buchung_id})


# ── Auswertung ───────────────────────────────────────────────────────────────

def summen(conn, projekt_id: int) -> dict:
    gesamt, abrechenbar, offen = conn.execute(
        "SELECT COALESCE(SUM(dauer_min), 0), COALESCE(SUM(dauer_min) FILTER (WHERE abrechenbar), 0),"
        " COALESCE(SUM(dauer_min) FILTER (WHERE abrechenbar AND rechnung_id IS NULL), 0)"
        " FROM projekt.zeitbuchungen WHERE projekt_id = %s", (projekt_id,)).fetchone()
    je_abschnitt = [dict(zip(("abschnitt_id", "minuten"), r)) for r in conn.execute(
        "SELECT abschnitt_id, SUM(dauer_min) FROM projekt.zeitbuchungen WHERE projekt_id = %s"
        " GROUP BY abschnitt_id ORDER BY abschnitt_id NULLS LAST", (projekt_id,))]
    je_monat = [dict(zip(("monat", "minuten"), r)) for r in conn.execute(
        "SELECT to_char(datum, 'YYYY-MM'), SUM(dauer_min) FROM projekt.zeitbuchungen WHERE projekt_id = %s"
        " GROUP BY 1 ORDER BY 1 DESC LIMIT 24", (projekt_id,))]
    return {"minuten_gesamt": int(gesamt), "minuten_abrechenbar": int(abrechenbar),
            "minuten_unabgerechnet": int(offen), "je_abschnitt": je_abschnitt, "je_monat": je_monat}


def minuten_je_projekt(conn) -> dict[int, int]:
    return {pid: int(m) for pid, m in conn.execute(
        "SELECT projekt_id, SUM(dauer_min) FROM projekt.zeitbuchungen GROUP BY projekt_id")}


def zeitraum(conn, von: date, bis: date) -> list[dict]:
    """Alle Buchungen aller Projekte in einem Zeitraum (Woche/Monat)."""
    return [dict(zip(("projekt_id", "projekt", *(_SPALTEN[2:])), r)) for r in conn.execute(
        "SELECT z.projekt_id, p.name, z.abschnitt_id, z.aufgabe_id, z.datum, z.dauer_min, z.taetigkeit,"
        " z.abrechenbar, z.rechnung_id, z.akteur, z.angelegt_am, z.aktualisiert_am"
        " FROM projekt.zeitbuchungen z JOIN projekt.projekte p ON p.id = z.projekt_id"
        " WHERE z.datum BETWEEN %s AND %s ORDER BY z.datum, z.id", (von, bis))]


def leistung_stunden(minuten: int, stundensatz_cent: int | None, budget_stunden: int | None) -> dict:
    """Fortschritt fuer Stundenprojekte: Stunden/Budget; Leistung = Stunden x Satz."""
    satz = int(stundensatz_cent or 0)
    leistung = minuten * satz // 60
    budget_cent = int(budget_stunden or 0) * satz
    prozent = round(minuten * 1000 / (int(budget_stunden) * 60)) / 10 if budget_stunden else 0.0
    return {"honorar_gesamt_cent": budget_cent, "honorar_beauftragt_cent": budget_cent,
            "leistung_cent": leistung, "prozent": prozent, "stunden": round(minuten / 60, 2),
            "budget_stunden": budget_stunden, "ueber_budget": bool(budget_stunden) and prozent > 100}


# ── Timer (ein laufender je Akteur) ──────────────────────────────────────────

def timer_status(conn, akteur: str) -> dict | None:
    row = conn.execute(
        "SELECT t.projekt_id, p.name, t.abschnitt_id, t.aufgabe_id, t.taetigkeit, t.gestartet_am"
        " FROM projekt.timer t JOIN projekt.projekte p ON p.id = t.projekt_id WHERE t.akteur = %s",
        (akteur,)).fetchone()
    if row is None:
        return None
    d = dict(zip(("projekt_id", "projekt", "abschnitt_id", "aufgabe_id", "taetigkeit", "gestartet_am"), row))
    d["laeuft_min"] = max(0, int((datetime.now(timezone.utc) - d["gestartet_am"]).total_seconds() // 60))
    return d


def timer_start(conn, projekt_id: int, *, akteur: str, taetigkeit: str = "",
                abschnitt_id: int | None = None, aufgabe_id: int | None = None) -> dict:
    conn.rollback()
    with conn.transaction():
        conn.execute(
            "INSERT INTO projekt.timer (akteur, projekt_id, abschnitt_id, aufgabe_id, taetigkeit)"
            " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (akteur) DO UPDATE SET projekt_id = EXCLUDED.projekt_id,"
            " abschnitt_id = EXCLUDED.abschnitt_id, aufgabe_id = EXCLUDED.aufgabe_id,"
            " taetigkeit = EXCLUDED.taetigkeit, gestartet_am = now()",
            (akteur, projekt_id, abschnitt_id, aufgabe_id, taetigkeit or ""))
        audit_schreiben(conn, akteur, "timer_start", erfolg=True, nutzlast={"projekt_id": projekt_id})
    return timer_status(conn, akteur)


def timer_stop(conn, *, akteur: str, taetigkeit: str | None = None, abrechenbar: bool = True) -> dict | None:
    """Stoppt und bucht (mindestens 1 Minute). Ohne laufenden Timer: None."""
    t = timer_status(conn, akteur)
    if t is None:
        return None
    text = (taetigkeit or t["taetigkeit"] or "Arbeit am Projekt").strip()
    minuten = min(MAX_MIN, max(1, t["laeuft_min"]))
    buchung = buchen(conn, t["projekt_id"], datum=date.today(), dauer_min=minuten, taetigkeit=text,
                     akteur=akteur, abschnitt_id=t["abschnitt_id"], aufgabe_id=t["aufgabe_id"],
                     abrechenbar=abrechenbar)
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM projekt.timer WHERE akteur = %s", (akteur,))
    return buchung


def timer_verwerfen(conn, *, akteur: str) -> None:
    conn.rollback()
    with conn.transaction():
        conn.execute("DELETE FROM projekt.timer WHERE akteur = %s", (akteur,))


# ── Rechnung aus Stunden ─────────────────────────────────────────────────────

def _abschnitt_namen(conn, projekt_id: int) -> dict[int, str]:
    return dict(conn.execute("SELECT id, bezeichnung FROM projekt.abschnitte WHERE projekt_id = %s",
                             (projekt_id,)))


def rechnung_vorschlag(conn, projekt: dict, *, von: date | None = None, bis: date | None = None) -> dict:
    """Unabgerechnete, abrechenbare Zeit -> Positionen (HUR) je Abschnitt."""
    satz = int(projekt.get("stundensatz_cent") or 0)
    offen = [z for z in liste(conn, projekt["id"], von=von, bis=bis)
             if z["abrechenbar"] and z["rechnung_id"] is None]
    gruppen: dict[int | None, int] = {}
    for z in offen:
        gruppen[z["abschnitt_id"]] = gruppen.get(z["abschnitt_id"], 0) + int(z["dauer_min"])
    namen = _abschnitt_namen(conn, projekt["id"])
    positionen = []
    for abschnitt_id, minuten in sorted(gruppen.items(), key=lambda kv: (kv[0] is None, kv[0] or 0)):
        tausendstel_stunden = round(minuten * 1000 / 60)
        positionen.append({
            "abschnitt_id": abschnitt_id,
            "bezeichnung": f"Stunden {namen.get(abschnitt_id, 'ohne Abschnitt')} ({minuten} min)",
            "menge_tausendstel": tausendstel_stunden, "einheit": "HUR", "einzelpreis_cent": satz,
            "betrag_cent": (tausendstel_stunden * satz + 500) // 1000, "minuten": minuten})
    return {"stundensatz_cent": satz, "buchungen": [z["id"] for z in offen], "positionen": positionen,
            "summe_netto_cent": sum(p["betrag_cent"] for p in positionen)}


def rechnung_anlegen(conn, projekt: dict, *, akteur: str, leistung_von: date, leistung_bis: date | None = None,
                     von: date | None = None, bis: date | None = None) -> dict:
    if not projekt.get("auftraggeber_id"):
        raise ZeitAbgelehnt("projekt braucht einen pedant-auftraggeber (stammdaten) fuer eine rechnung")
    if not projekt.get("stundensatz_cent"):
        raise ZeitAbgelehnt("projekt braucht einen stundensatz (stammdaten)")
    v = rechnung_vorschlag(conn, projekt, von=von, bis=bis)
    if not v["positionen"]:
        raise ZeitAbgelehnt("keine unabgerechnete, abrechenbare zeit im zeitraum")
    leistung_bis = leistung_bis or max(date.today(), leistung_von)
    if leistung_bis < leistung_von:
        raise ZeitAbgelehnt("leistung_bis liegt vor leistung_von")
    from app.api.pedant.core import rechnungen as ped_rechnungen
    rechnung = ped_rechnungen.rechnung_anlegen(conn, akteur=akteur, felder={
        "auftraggeber_id": projekt["auftraggeber_id"], "rechnungsdatum": date.today(),
        "leistung_von": leistung_von, "leistung_bis": leistung_bis,
        "auftrag_referenz": f"#P{projekt['id']} {projekt.get('kurzname') or projekt['name']}"[:100],
        "projekt_id": projekt["id"]})
    rechnung = ped_rechnungen.positionen_speichern(conn, rechnung_id=rechnung["id"], akteur=akteur, positionen=[
        {k: p[k] for k in ("bezeichnung", "menge_tausendstel", "einheit", "einzelpreis_cent", "abschnitt_id")}
        for p in v["positionen"]])
    conn.rollback()
    with conn.transaction():
        conn.execute("UPDATE projekt.zeitbuchungen SET rechnung_id = %s WHERE id = ANY(%s)",
                     (rechnung["id"], v["buchungen"]))
        audit_schreiben(conn, akteur, "rechnung_aus_stunden", erfolg=True,
                        nutzlast={"projekt_id": projekt["id"], "rechnung_id": rechnung["id"],
                                  "buchungen": len(v["buchungen"]), "netto_cent": rechnung["netto_cent"]})
    return rechnung


def verworfene_freigeben(conn, projekt_id: int) -> int:
    """Wurde die Rechnung im Pedanten verworfen, wird die Zeit wieder frei."""
    conn.rollback()
    with conn.transaction():
        cur = conn.execute(
            "UPDATE projekt.zeitbuchungen z SET rechnung_id = NULL FROM rechnungen r"
            " WHERE z.projekt_id = %s AND z.rechnung_id = r.id AND r.status = 'verworfen'", (projekt_id,))
        return cur.rowcount


def wochenblatt(von: date) -> tuple[date, date]:
    start = von - timedelta(days=von.weekday())
    return start, start + timedelta(days=6)
