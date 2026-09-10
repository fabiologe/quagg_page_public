"""Projekt-Dossier: eine deterministische Markdown-Akte fuer Menschen UND die
KI (FAHRPLAN Kap. 11). Wird auf Anfrage erzeugt und als _akte/DOSSIER.md abgelegt.
Groessenordnung 5–20k Token: Listen sind gedeckelt, Mail-Inhalte kommen nie hinein."""

import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from . import cde, mails, ordner, projekte, vorschlaege

DATEINAME = "DOSSIER.md"
MAX_DATEIEN = 40
MAX_ORDNER = 60
MAX_HISTORIE = 20
MAX_MAILS = 20
MAX_AUFGABEN = 30


def _euro(cent) -> str:
    if cent is None:
        return "—"
    return f"{cent / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _datum(wert) -> str:
    if wert is None:
        return "—"
    if isinstance(wert, (date, datetime)):
        return wert.strftime("%d.%m.%Y")
    return str(wert)[:10]


def _dokumente(o: ordner.Ordner | None) -> tuple[list[dict], list[dict]]:
    """Ordnerzaehlung + juengste Dateien; _akte bleibt aussen vor, alles gedeckelt."""
    if o is None or not o.pfad.is_dir():
        return [], []
    ordnerliste: list[dict] = []
    dateien: list[dict] = []
    for wurzel, dirs, files in os.walk(o.pfad):
        rel = Path(wurzel).relative_to(o.pfad)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != ordner.AKTE)
        sichtbare = [f for f in files if not f.startswith(".")]
        if rel != Path(".") and len(ordnerliste) < MAX_ORDNER:
            ordnerliste.append({"ordner": str(rel), "dateien": len(sichtbare)})
        for f in sichtbare:
            try:
                st = os.stat(Path(wurzel) / f)
            except OSError:
                continue
            dateien.append({"pfad": str(rel / f) if rel != Path(".") else f,
                            "groesse": st.st_size, "geaendert": datetime.fromtimestamp(st.st_mtime)})
        if len(dateien) > 2000:
            break
    dateien.sort(key=lambda d: d["geaendert"], reverse=True)
    return ordnerliste, dateien[:MAX_DATEIEN]


def erzeugen(conn, projekt_id: int) -> str:
    a = projekte.lesen(conn, projekt_id)
    o = ordner.finde(projekt_id)
    f = a["fortschritt"]
    heute = date.today()
    z: list[str] = []
    z.append(f"# Projektakte #P{a['id']} — {a['name']}")
    z.append("")
    z.append(f"Stand: {datetime.now(timezone.utc).isoformat(timespec='minutes')} · "
             f"Phase: {a['phase'] or 'OHNE ORDNER'} · Ordner: 1_Projekte/{a['phase'] or '?'}/{a['ordnername']}")
    z.append("")
    z.append("## Stammdaten")
    z.append(f"- Honorarmodell: {a['honorarmodell']}" + (f" (Leistungsbild § {a['leistungsbild']})" if a["leistungsbild"] else ""))
    if a["honorarmodell"] == "stunden":
        z.append(f"- Stundensatz: {_euro(a['stundensatz_cent'])} netto · Budget: {a['budget_stunden'] or '—'} h")
    z.append(f"- Kurzname: {a['kurzname'] or '—'} · Pedant-Auftraggeber-Nr: {a['auftraggeber_id'] or '—'}")
    if a["notiz"]:
        z.append(f"- Notiz: {a['notiz']}")
    z.append("")
    z.append("## Beteiligte")
    if a["beteiligte"]:
        for b in a["beteiligte"]:
            z.append(f"- {b['rolle']}: {b['name']}" + (f" ({b['kontakt']})" if b["kontakt"] else ""))
    else:
        z.append("- (keine erfasst)")
    z.append("")
    z.append("## Leistungsstand")
    z.append(f"- Beauftragt netto: {_euro(f['honorar_beauftragt_cent'])} · Leistung: {_euro(f['leistung_cent'])} · "
             f"Fortschritt: {f['prozent']} %")
    if a["abschnitte"]:
        z.append("")
        z.append("| Nr | Abschnitt | Art | Honorar netto | beauftragt | Fortschritt | Status |")
        z.append("|---|---|---|---|---|---|---|")
        for s in a["abschnitte"]:
            z.append(f"| {s['nr']} | {s['bezeichnung']} | {s['art']} | {_euro(s['honorar_cent'])} | "
                     f"{'ja' if s['beauftragt'] else 'nein'} | {s['fortschritt_prozent']} % | {s['status']} |")
    else:
        z.append("- (keine Abschnitte — Leistungsstand nicht messbar)")
    z.append("")
    if a["honorar_historie"]:
        z.append("## Honorarhistorie (jüngste zuerst)")
        for h in a["honorar_historie"][:MAX_HISTORIE]:
            z.append(f"- {_datum(h['am'])}: {h['abschnitt']} {_euro(h['alt_cent'])} → {_euro(h['neu_cent'])}"
                     + (f" — {h['grund']}" if h["grund"] else ""))
        z.append("")
    z.append("## Termine und Fristen")
    offene = [m for m in a["meilensteine"] if not m["erledigt_am"]]
    if offene:
        for m in offene:
            tage = (m["faellig_am"] - heute).days if isinstance(m["faellig_am"], date) else None
            marke = "ÜBERFÄLLIG" if tage is not None and tage < 0 else (f"in {tage} Tagen" if tage is not None else "")
            z.append(f"- {_datum(m['faellig_am'])} {m['art']}: {m['bezeichnung']} {marke}".rstrip())
    else:
        z.append("- (keine offenen Termine)")
    erledigte = [m for m in a["meilensteine"] if m["erledigt_am"]]
    if erledigte:
        z.append(f"- erledigt: {len(erledigte)}")
    z.append("")
    z.append("## Geld (netto, aus dem Pedanten)")
    g = a.get("geld") or {}
    z.append(f"- Gestellt: {_euro(g.get('gestellt_netto_cent', 0))} · Bezahlt: {_euro(g.get('bezahlt_netto_cent', 0))}"
             f" · Unabgerechnete Leistung: {_euro(g.get('unabgerechnet_cent', 0))}"
             f" · Fremdkosten brutto: {_euro(g.get('fremdkosten_brutto_cent', 0))}")
    z.append("")
    z.append("## Aufgaben")
    offene_aufgaben = [t for t in a.get("aufgaben", []) if t["status"] != "erledigt"]
    if offene_aufgaben:
        for t in offene_aufgaben[:MAX_AUFGABEN]:
            frist = f" bis {_datum(t['faellig_am'])}" if t["faellig_am"] else ""
            z.append(f"- [{t['status']}] {t['titel']}{frist}")
    else:
        z.append("- (keine offenen Aufgaben)")
    z.append("")
    z.append("## Zeiten")
    zt = a.get("zeit") or {}
    z.append(f"- Gesamt: {zt.get('minuten_gesamt', 0) / 60:.1f} h · abrechenbar: {zt.get('minuten_abrechenbar', 0) / 60:.1f} h"
             f" · noch nicht abgerechnet: {zt.get('minuten_unabgerechnet', 0) / 60:.1f} h")
    for m in (zt.get("je_monat") or [])[:6]:
        z.append(f"- {m['monat']}: {m['minuten'] / 60:.1f} h")
    z.append("")
    z.append("## E-Mails (jüngste Betreffzeilen)")
    betreffs = mails.betreffzeilen(projekt_id, MAX_MAILS)
    if betreffs:
        for m in betreffs:
            z.append(f"- {m['empfangen_am']} · {m['absender']}: {m['betreff']}")
    else:
        z.append("- (keine zugeordneten Mails)")
    z.append("")
    z.append("## Dokumente")
    ordnerliste, dateien = _dokumente(o)
    if o is None:
        z.append("- (kein Projektordner)")
    else:
        for d in ordnerliste:
            z.append(f"- {d['ordner']}/ ({d['dateien']} Dateien)")
        if dateien:
            z.append("")
            z.append("Zuletzt geändert:")
            for d in dateien:
                z.append(f"- {_datum(d['geaendert'])} {d['pfad']} ({d['groesse'] // 1024} KB)")
        if not ordnerliste and not dateien:
            z.append("- (Ordner ist leer)")
    z.append("")
    z.append("## CDE (Modelle und Pläne)")
    dok = cde.register(o) if o else []
    if dok:
        for d in dok[:MAX_HISTORIE]:
            z.append(f"- {d['datei']} · {d['art']} · Rev. {d['revision']} · {d['status']}"
                     + ("" if d.get("vorhanden", True) else " · DATEI FEHLT"))
    else:
        z.append("- (kein Modell/Plan registriert)")
    z.append("")
    z.append("## Offene KI-Vorschläge")
    offen = vorschlaege.liste(conn, projekt_id=projekt_id, status="offen")
    if offen:
        for v in offen:
            z.append(f"- #{v['id']} {v['art']}: {v['nutzlast']} — {v['begruendung']}")
    else:
        z.append("- (keine)")
    z.append("")
    return "\n".join(z)


def schreiben(conn, projekt_id: int) -> tuple[str, Path | None]:
    """Erzeugt das Dossier und legt es atomar unter _akte/ ab (wenn es einen Ordner gibt)."""
    text = erzeugen(conn, projekt_id)
    o = ordner.finde(projekt_id)
    if o is None:
        return text, None
    ziel = ordner.akte_sicherstellen(o) / DATEINAME
    temp = ziel.parent / f".tmp-{uuid.uuid4().hex}"
    try:
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return text, ziel
