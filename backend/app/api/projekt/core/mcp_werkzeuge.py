"""Die Werkzeuge des Projekt-MCP als reine Funktionen (ohne fastmcp), damit
sie im Backend-venv testbar sind. app/mcp/projekt_tools.py registriert sie."""

import os
from datetime import date, timedelta
from pathlib import Path

from . import abschnitte, aufgaben as aufgaben_mod, dossier, index, ordner, projekte, vorschlaege, zeit

MAX_TEXT = 40_000


def liste(conn) -> list[dict]:
    return [{"id": p["id"], "name": p["name"], "phase": p["phase"], "honorarmodell": p["honorarmodell"],
             "fortschritt_prozent": p["fortschritt"]["prozent"],
             "naechster_termin": str(p["naechster_termin"] or "")}
            for p in projekte.liste(conn)]


def dossier_text(conn, projekt_id: int) -> str:
    text, _ = dossier.schreiben(conn, projekt_id)
    return text


def termine(conn, tage: int = 30) -> list[dict]:
    horizont = date.today() + timedelta(days=tage)
    zeilen = conn.execute(
        "SELECT m.projekt_id, p.name, m.id, m.art, m.bezeichnung, m.faellig_am FROM projekt.meilensteine m"
        " JOIN projekt.projekte p ON p.id = m.projekt_id"
        " WHERE m.erledigt_am IS NULL AND m.faellig_am <= %s ORDER BY m.faellig_am, m.id", (horizont,)).fetchall()
    return [{"projekt_id": pid, "projekt": name, "id": mid, "art": art, "bezeichnung": bez,
             "faellig_am": str(faellig), "tage": (faellig - date.today()).days}
            for pid, name, mid, art, bez, faellig in zeilen]


def leistung(conn, projekt_id: int) -> dict:
    a = projekte.lesen(conn, projekt_id)
    return {"fortschritt": a["fortschritt"], "abschnitte": [
        {k: s[k] for k in ("id", "nr", "bezeichnung", "lph", "art", "honorar_cent", "beauftragt",
                           "fortschritt_prozent", "status")} for s in a["abschnitte"]]}


def _projektpfad(projekt_id: int, unterpfad: str = "") -> Path:
    o = ordner.finde(projekt_id)
    if o is None:
        raise FileNotFoundError(f"projekt {projekt_id} hat keinen ordner")
    ziel = (o.pfad / unterpfad).resolve()
    if not ziel.is_relative_to(o.pfad.resolve()) or ordner.AKTE in ziel.relative_to(o.pfad.resolve()).parts:
        raise PermissionError("pfad verlaesst den projektordner")
    return ziel


def dokumente(projekt_id: int, unterordner: str = "") -> list[dict]:
    ziel = _projektpfad(projekt_id, unterordner)
    if not ziel.is_dir():
        raise FileNotFoundError(f"kein ordner: {unterordner}")
    eintraege = []
    with os.scandir(ziel) as es:
        for e in sorted(es, key=lambda e: (not e.is_dir(), e.name.lower())):
            if e.name.startswith(".") or e.name == ordner.AKTE:
                continue
            st = e.stat()
            eintraege.append({"name": e.name, "typ": "ordner" if e.is_dir() else "datei",
                              "groesse": 0 if e.is_dir() else st.st_size,
                              "geaendert": date.fromtimestamp(st.st_mtime).isoformat()})
    return eintraege


def dokument_lesen(projekt_id: int, pfad: str, max_zeichen: int = 20_000) -> str:
    """Text aus .txt/.md/.csv direkt, aus .pdf ueber pymupdf (falls installiert);
    Office-Formate kommen mit dem Volltextindex in Stufe 5."""
    datei = _projektpfad(projekt_id, pfad)
    if not datei.is_file():
        raise FileNotFoundError(pfad)
    max_zeichen = max(200, min(int(max_zeichen), MAX_TEXT))
    endung = datei.suffix.lower()
    if endung in (".txt", ".md", ".csv", ".yaml", ".yml", ".json"):
        return datei.read_text(encoding="utf-8", errors="replace")[:max_zeichen]
    if endung == ".pdf":
        try:
            import fitz  # pymupdf
        except ImportError:
            raise RuntimeError("pymupdf fehlt in dieser Umgebung — PDF nicht lesbar")
        teile: list[str] = []
        with fitz.open(datei) as doc:
            for seite in doc:
                teile.append(seite.get_text())
                if sum(len(t) for t in teile) >= max_zeichen:
                    break
        return "".join(teile)[:max_zeichen]
    raise RuntimeError(f"dateityp {endung} wird (noch) nicht gelesen — Stufe 5 bringt docx/xlsx")


def vorschlag(conn, projekt_id: int, *, art: str, nutzlast: dict, begruendung: str) -> dict:
    v = vorschlaege.anlegen(conn, projekt_id, art=art, nutzlast=nutzlast, begruendung=begruendung,
                            von="mcp", akteur="mcp")
    return {"id": v["id"], "status": v["status"], "hinweis": "Vorschlag liegt im Cockpit zur Bestätigung."}


def aufgaben(conn, projekt_id: int | None = None, tage: int | None = None) -> list[dict]:
    """Offene Aufgaben eines Projekts oder faellige aller Projekte (tage)."""
    if projekt_id is not None:
        return [{k: t[k] for k in ("id", "titel", "status", "faellig_am", "abschnitt_id", "quelle")}
                for t in aufgaben_mod.liste(conn, projekt_id, mit_erledigten=False)]
    return aufgaben_mod.faellige(conn, tage if tage is not None else 14)


def zeiten(conn, projekt_id: int, von: str | None = None, bis: str | None = None) -> dict:
    v = date.fromisoformat(von) if von else None
    b = date.fromisoformat(bis) if bis else None
    return {"summen": zeit.summen(conn, projekt_id),
            "buchungen": [{k: z[k] for k in ("id", "datum", "dauer_min", "taetigkeit", "abschnitt_id",
                                             "abrechenbar", "rechnung_id")}
                          for z in zeit.liste(conn, projekt_id, von=v, bis=b)[:200]]}


def suche(conn, projekt_id: int, query: str, limit: int = 20, aktualisieren: bool = True) -> dict:
    """Volltextsuche im Projektordner + Mails; aktualisiert vorher den Index (inkrementell)."""
    projekte.lesen(conn, projekt_id)
    o = ordner.finde(projekt_id)
    if o is None:
        raise FileNotFoundError(f"projekt {projekt_id} hat keinen ordner")
    bericht = index.aktualisieren(o, projekt_id) if aktualisieren else None
    return {"treffer": index.suche(o, query, limit), "index": bericht or index.stand(o)}
