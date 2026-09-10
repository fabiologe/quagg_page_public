"""Geld-Verzahnung mit dem Pedanten (FAHRPLAN Kap. 8, Stufe 4).

- Rechnungen und Planzeile (erwartetes_geld) tragen projekt_id, Belege das
  Kostenmerkmal '#P<id>' — alles nur Zahlen/Text, kein Fremdschluessel.
- Der Balken rechnet NETTO; die Planzeile des Pedanten ist BRUTTO und wird
  hier nur befuellt (planzeile_sync), nie als Quelle gelesen.
- Abschlag aus Leistungsstand: je Abschnitt kumulierte Leistung minus bereits
  gestellte Positionen (abschnitt_id an der Position).
"""

from datetime import date, timedelta

from . import fortschritt
from .audit import audit_schreiben

GESTELLT = ("gestellt", "bezahlt")


class GeldAbgelehnt(ValueError):
    """Router: 422."""


def kostenmerkmal(projekt_id: int) -> str:
    return f"#P{projekt_id}"


def _euro(cent: int) -> str:
    return f"{cent / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def brutto(netto_cent: int, steuersatz: int = 19) -> int:
    return (netto_cent * (100 + steuersatz) + 50) // 100


# ── Lesen ────────────────────────────────────────────────────────────────────

# Eine Schlussrechnung (380 mit Vorrechnungen) enthaelt die Abschlaege bereits —
# fuer Summen und die Kumulation je Abschnitt zaehlen nur "eigenstaendige"
# Rechnungen: gestellte/bezahlte, die NICHT von einer anderen gestellten
# Rechnung desselben Projekts referenziert werden.
_EIGENSTAENDIG = (
    "r.projekt_id = %s AND r.status IN ('gestellt', 'bezahlt') AND NOT EXISTS ("
    "  SELECT 1 FROM rechnungsreferenzen x JOIN rechnungen s ON s.id = x.rechnung_id"
    "  WHERE x.vor_rechnung_id = r.id AND s.status IN ('gestellt', 'bezahlt'))"
)


def rechnungen_des_projekts(conn, projekt_id: int) -> list[dict]:
    zeilen = conn.execute(
        "SELECT r.id, r.rechnungsnummer, r.status, r.rechnungsdatum, r.leistung_von, r.leistung_bis,"
        " COALESCE(r.netto_cent, (SELECT COALESCE(SUM(p.betrag_cent), 0) FROM rechnungspositionen p"
        "   WHERE p.rechnung_id = r.id)) AS netto_cent,"
        " r.brutto_cent, r.gestellt_am, r.bezahlt_am, r.rechnungstyp, r.vorab_cent, r.zahlbar_cent,"
        " EXISTS (SELECT 1 FROM rechnungsreferenzen x JOIN rechnungen s ON s.id = x.rechnung_id"
        "   WHERE x.vor_rechnung_id = r.id AND s.status IN ('gestellt', 'bezahlt')) AS abgerechnet_in_schluss"
        " FROM rechnungen r WHERE r.projekt_id = %s ORDER BY r.id DESC", (projekt_id,)).fetchall()
    return [dict(zip(("id", "rechnungsnummer", "status", "rechnungsdatum", "leistung_von", "leistung_bis",
                      "netto_cent", "brutto_cent", "gestellt_am", "bezahlt_am", "rechnungstyp", "vorab_cent",
                      "zahlbar_cent", "abgerechnet_in_schluss"), z)) for z in zeilen]


def gestellt_je_abschnitt(conn, projekt_id: int) -> dict[int, int]:
    return dict(conn.execute(
        "SELECT p.abschnitt_id, SUM(p.betrag_cent) FROM rechnungspositionen p"
        f" JOIN rechnungen r ON r.id = p.rechnung_id WHERE {_EIGENSTAENDIG} AND p.abschnitt_id IS NOT NULL"
        " GROUP BY p.abschnitt_id", (projekt_id,)))


def summen_je_projekt(conn) -> dict[int, dict]:
    """Fuer Portfolio + Kennzahlen: gestellt/bezahlt netto je Projekt in EINER Abfrage
    (Abschlaege, die in einer Schlussrechnung aufgegangen sind, zaehlen nicht doppelt)."""
    ergebnis: dict[int, dict] = {}
    for pid, gestellt, bezahlt in conn.execute(
            "SELECT r.projekt_id, COALESCE(SUM(r.netto_cent), 0),"
            " COALESCE(SUM(r.netto_cent) FILTER (WHERE r.status = 'bezahlt'), 0)"
            " FROM rechnungen r WHERE r.projekt_id IS NOT NULL AND r.status IN ('gestellt', 'bezahlt')"
            " AND NOT EXISTS (SELECT 1 FROM rechnungsreferenzen x JOIN rechnungen s ON s.id = x.rechnung_id"
            "   WHERE x.vor_rechnung_id = r.id AND s.status IN ('gestellt', 'bezahlt'))"
            " GROUP BY r.projekt_id"):
        ergebnis[pid] = {"gestellt_netto_cent": int(gestellt), "bezahlt_netto_cent": int(bezahlt)}
    return ergebnis


def belege_des_projekts(conn, projekt_id: int) -> list[dict]:
    zeilen = conn.execute(
        "SELECT id, belegnummer, status, lieferant, belegdatum, brutto_cent FROM belege"
        " WHERE kostenmerkmal = %s ORDER BY belegdatum DESC NULLS LAST, id DESC",
        (kostenmerkmal(projekt_id),)).fetchall()
    return [dict(zip(("id", "belegnummer", "status", "lieferant", "belegdatum", "brutto_cent"), z))
            for z in zeilen]


def planzeile_lesen(conn, projekt_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, bezeichnung, betrag_cent, bereits_gestellt_cent, erwartet_am, status"
        " FROM erwartetes_geld WHERE projekt_id = %s ORDER BY id LIMIT 1", (projekt_id,)).fetchone()
    return None if row is None else dict(zip(
        ("id", "bezeichnung", "betrag_cent", "bereits_gestellt_cent", "erwartet_am", "status"), row))


def summen(conn, projekt_id: int, kennzahlen: dict) -> dict:
    """kennzahlen = fortschritt.leistung(abschnitte) — netto."""
    rl = rechnungen_des_projekts(conn, projekt_id)
    eigen = [r for r in rl if r["status"] in GESTELLT and not r["abgerechnet_in_schluss"]]
    gestellt = sum(int(r["netto_cent"] or 0) for r in eigen)
    bezahlt = sum(int(r["netto_cent"] or 0) for r in eigen if r["status"] == "bezahlt")
    entwurf = sum(int(r["netto_cent"] or 0) for r in rl if r["status"] == "entwurf")
    fremd = sum(int(b["brutto_cent"] or 0) for b in belege_des_projekts(conn, projekt_id)
                if b["status"] != "verworfen")
    return {"gestellt_netto_cent": gestellt, "bezahlt_netto_cent": bezahlt,
            "entwurf_netto_cent": entwurf, "fremdkosten_brutto_cent": fremd,
            "unabgerechnet_cent": kennzahlen["leistung_cent"] - gestellt,
            "offen_netto_cent": gestellt - bezahlt}


def stand(conn, projekt_id: int, kennzahlen: dict) -> dict:
    return {"summen": summen(conn, projekt_id, kennzahlen),
            "rechnungen": rechnungen_des_projekts(conn, projekt_id),
            "belege": belege_des_projekts(conn, projekt_id),
            "planzeile": planzeile_lesen(conn, projekt_id)}


# ── Abschlag aus Leistungsstand ──────────────────────────────────────────────

def abschlag_vorschlag(conn, projekt_id: int, abschnitte: list[dict]) -> dict:
    gestellt = gestellt_je_abschnitt(conn, projekt_id)
    nummer = 1 + sum(1 for r in rechnungen_des_projekts(conn, projekt_id) if r["status"] in GESTELLT)
    positionen = []
    for a in abschnitte:
        if not fortschritt.zaehlt(a):
            continue
        kumuliert = int(a["honorar_cent"]) * int(a["fortschritt_prozent"]) // 100
        bereits = int(gestellt.get(a["id"], 0))
        faellig = kumuliert - bereits
        if faellig <= 0:
            continue
        positionen.append({
            "abschnitt_id": a["id"],
            "bezeichnung": (f"{a['bezeichnung']} — Leistungsstand {a['fortschritt_prozent']} %"
                            f" ({_euro(kumuliert)} kumuliert, {_euro(bereits)} bereits gestellt)"),
            "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": faellig,
            "kumuliert_cent": kumuliert, "gestellt_cent": bereits,
        })
    return {"nummer": nummer, "positionen": positionen,
            "summe_netto_cent": sum(p["einzelpreis_cent"] for p in positionen)}


def abschlag_anlegen(conn, projekt: dict, *, akteur: str, leistung_von: date,
                     leistung_bis: date | None = None) -> dict:
    """Legt im Pedanten einen Rechnungs-ENTWURF (Typ 380) mit den faelligen
    Positionen an. Stellen, Pruefen, Versand bleiben Sache des Pedanten."""
    if not projekt.get("auftraggeber_id"):
        raise GeldAbgelehnt("projekt braucht einen pedant-auftraggeber (stammdaten) fuer eine rechnung")
    vorschlag = abschlag_vorschlag(conn, projekt["id"], projekt["abschnitte"])
    if not vorschlag["positionen"]:
        raise GeldAbgelehnt("nichts faellig: leistungsstand ist vollstaendig abgerechnet")
    leistung_bis = leistung_bis or max(date.today(), leistung_von)
    if leistung_bis < leistung_von:
        raise GeldAbgelehnt("leistung_bis liegt vor leistung_von")
    referenz = f"{kostenmerkmal(projekt['id'])} {projekt.get('kurzname') or projekt['name']}"[:100]
    from app.api.pedant.core import rechnungen as ped_rechnungen   # lazy: zieht lxml/KoSIT
    rechnung = ped_rechnungen.rechnung_anlegen(conn, akteur=akteur, felder={
        "auftraggeber_id": projekt["auftraggeber_id"], "rechnungsdatum": date.today(),
        "leistung_von": leistung_von, "leistung_bis": leistung_bis,
        "auftrag_referenz": referenz, "projekt_id": projekt["id"], "rechnungstyp": "326"})
    positionen = [{"bezeichnung": f"{vorschlag['nummer']}. Abschlag: {p['bezeichnung']}",
                   "menge_tausendstel": 1000, "einheit": "C62",
                   "einzelpreis_cent": p["einzelpreis_cent"], "abschnitt_id": p["abschnitt_id"]}
                  for p in vorschlag["positionen"]]
    rechnung = ped_rechnungen.positionen_speichern(
        conn, rechnung_id=rechnung["id"], positionen=positionen, akteur=akteur)
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, "abschlag_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt["id"], "rechnung_id": rechnung["id"],
                                  "nummer": vorschlag["nummer"], "netto_cent": rechnung["netto_cent"]})
    return rechnung


# ── Planzeile im Pedanten (erwartetes_geld, brutto) ──────────────────────────

def planzeile_sync(conn, projekt: dict, *, akteur: str) -> dict | None:
    """EINE Planzeile je Projekt: Volumen = beauftragtes Honorar brutto,
    bereits gestellt = Σ brutto gestellter Rechnungen, Termin = naechste offene Frist."""
    from app.api.pedant.core import geldsichten   # lazy, siehe abschlag_anlegen
    netto = int(projekt["fortschritt"]["honorar_beauftragt_cent"])
    bestehend = planzeile_lesen(conn, projekt["id"])
    if netto <= 0:
        if bestehend and bestehend["status"] != "entfallen":
            return geldsichten.erwartet_speichern(conn, eintrag_id=bestehend["id"], akteur=akteur,
                                                  felder={"status": "entfallen"})
        return bestehend
    volumen = brutto(netto)
    gestellt = sum(int(r["brutto_cent"] or 0) for r in rechnungen_des_projekts(conn, projekt["id"])
                   if r["status"] in GESTELLT and not r["abgerechnet_in_schluss"])
    gestellt = min(gestellt, volumen)
    phase = projekt.get("phase") or ""
    if gestellt >= volumen:
        status = "vollstaendig_gestellt"
    elif gestellt > 0:
        status = "teilweise_gestellt"
    elif phase == "04_Abgelehnt":
        status = "entfallen"
    elif phase == "00_Angebote":
        status = "angeboten"
    else:
        status = "beauftragt"
    offene = sorted(m["faellig_am"] for m in projekt.get("meilensteine", [])
                    if not m["erledigt_am"] and m["faellig_am"] >= date.today())
    erwartet_am = offene[0] if offene else date.today() + timedelta(days=90)
    felder = {"bezeichnung": f"{kostenmerkmal(projekt['id'])} {projekt['name']}"[:120],
              "auftraggeber_id": projekt.get("auftraggeber_id"), "betrag_cent": volumen,
              "bereits_gestellt_cent": gestellt, "erwartet_am": erwartet_am, "status": status,
              "projekt_id": projekt["id"]}
    if bestehend is None:
        return geldsichten.erwartet_anlegen(conn, felder=felder, akteur=akteur)
    return geldsichten.erwartet_speichern(conn, eintrag_id=bestehend["id"], felder=felder, akteur=akteur)


# ── Schlussrechnung (4b): Gesamtleistung abzueglich gestellter Abschlaege ────

def schlussrechnung_vorschlag(conn, projekt_id: int, abschnitte: list[dict]) -> dict:
    """Positionen = kumulierte Leistung je zaehlendem Abschnitt; Vorrechnungen = alle
    eigenstaendig gestellten/bezahlten Rechnungen des Projekts (Abschlaege 326 und
    fruehere Schlussrechnungen), die noch in keiner Schlussrechnung aufgegangen sind."""
    positionen = []
    for a in abschnitte:
        if not fortschritt.zaehlt(a):
            continue
        kumuliert = int(a["honorar_cent"]) * int(a["fortschritt_prozent"]) // 100
        if kumuliert <= 0:
            continue
        positionen.append({"abschnitt_id": a["id"],
                           "bezeichnung": f"{a['bezeichnung']} — Leistungsstand {a['fortschritt_prozent']} %",
                           "menge_tausendstel": 1000, "einheit": "C62", "einzelpreis_cent": kumuliert})
    # Alle eigenstaendig gestellten Rechnungen des Projekts gelten als Vorrechnungen —
    # Abschlaege UND fruehere Schlussrechnungen (sonst wuerde eine zweite Schlussrechnung
    # die Gesamtleistung erneut fordern).
    abschlaege = [r for r in rechnungen_des_projekts(conn, projekt_id)
                  if r["status"] in GESTELLT and not r["abgerechnet_in_schluss"]]
    vorab = sum(int(r["brutto_cent"] or 0) for r in abschlaege)
    netto = sum(p["einzelpreis_cent"] for p in positionen)
    brutto_gesamt = brutto(netto)
    return {"positionen": positionen, "vorrechnungen": abschlaege, "summe_netto_cent": netto,
            "summe_brutto_cent": brutto_gesamt, "vorab_cent": vorab, "zahlbar_cent": brutto_gesamt - vorab}


def schlussrechnung_anlegen(conn, projekt: dict, *, akteur: str, leistung_von: date,
                            leistung_bis: date | None = None) -> dict:
    if not projekt.get("auftraggeber_id"):
        raise GeldAbgelehnt("projekt braucht einen pedant-auftraggeber (stammdaten) fuer eine rechnung")
    v = schlussrechnung_vorschlag(conn, projekt["id"], projekt["abschnitte"])
    if not v["positionen"]:
        raise GeldAbgelehnt("keine erbrachte leistung — nichts abzurechnen")
    if v["zahlbar_cent"] <= 0:
        raise GeldAbgelehnt("abschlaege decken die gesamtleistung bereits — kein zahlbarer rest")
    leistung_bis = leistung_bis or max(date.today(), leistung_von)
    if leistung_bis < leistung_von:
        raise GeldAbgelehnt("leistung_bis liegt vor leistung_von")
    from app.api.pedant.core import rechnungen as ped_rechnungen   # lazy: zieht lxml/KoSIT
    referenz = f"{kostenmerkmal(projekt['id'])} {projekt.get('kurzname') or projekt['name']} Schlussrechnung"[:100]
    rechnung = ped_rechnungen.rechnung_anlegen(conn, akteur=akteur, felder={
        "auftraggeber_id": projekt["auftraggeber_id"], "rechnungsdatum": date.today(),
        "leistung_von": leistung_von, "leistung_bis": leistung_bis,
        "auftrag_referenz": referenz, "projekt_id": projekt["id"], "rechnungstyp": "380"})
    rechnung = ped_rechnungen.positionen_speichern(conn, rechnung_id=rechnung["id"], akteur=akteur, positionen=[
        {"bezeichnung": f"Schlussrechnung: {p['bezeichnung']}", "menge_tausendstel": 1000, "einheit": "C62",
         "einzelpreis_cent": p["einzelpreis_cent"], "abschnitt_id": p["abschnitt_id"]} for p in v["positionen"]])
    if v["vorrechnungen"]:
        rechnung = ped_rechnungen.referenzen_setzen(conn, rechnung_id=rechnung["id"], akteur=akteur,
                                                    vor_rechnung_ids=[r["id"] for r in v["vorrechnungen"]])
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, "schlussrechnung_anlegen", erfolg=True,
                        nutzlast={"projekt_id": projekt["id"], "rechnung_id": rechnung["id"],
                                  "vorab_cent": rechnung["vorab_cent"], "zahlbar_cent": rechnung["zahlbar_cent"]})
    return rechnung
