"""Verbund-Laeufe im CDE: der Server nimmt den Auftrag an, ein Unterprozess
rechnet, das Register nimmt das Ergebnis auf — aber nur, wenn es die Pruefung
bestanden hat.

WARUM DER UMWEG UEBER EINEN UNTERPROZESS, drei gemessene Gruende:

  * nginx bricht /FastAPI/ nach 60 s ab (`proxy_read_timeout`). Der Verbund der
    drei Gruppenmodelle braucht samt Pruefung gut zwei Minuten. Also: Auftrag
    annehmen (202), spaeter abholen.
  * uvicorn faehrt mit workers=1 (SQLite hat nur einen Schreiber). Ein Merge im
    API-Prozess blockierte den EINZIGEN Arbeiter.
  * ifcopenshell lebt in einem eigenen venv (`backend/app/ifc/.venv-ifc`), nicht
    im Produktions-venv, an dem der laufende Dienst haengt.

DER ZUSTAND LIEGT AUF DER PLATTE, nicht im Speicher — wie das Manifest:
`<Projekt>/CDE/_verbund/<lauf_id>/`. Ein Neustart des Servers verliert keinen
Befund, und ein abgerissener Lauf meldet sich als abgebrochen, statt fuer immer
„laeuft" zu sagen. Den Vertrag mit dem Unterprozess beschreibt `app/ifc/cli.py`.

ZWEI MODI (Stufe 3 des Aushub-Fachmodells, 2026-09-10):

  verbund  die Modelle eines Satzes (+ optional der Live-Stand der CDE) zu EINER
           Datei. Ein Erdbau-Dokument im Satz ist eine gewoehnliche Quelle —
           was IN ihm steckt (sein Ur-Gelaende), faellt aus dem Satz heraus.
  erdbau   GENAU die Registerdokumente, in denen die Wirte der Aushuebe liegen
           (`paket.quellDokumente`) + der Live-Stand: `Erdbau_<Satz>_R<nn>.ifc`,
           fuer sich allein konform (Ur-Gelaende unveraendert, Cuts/Fills,
           Vorgangsgruppen, Mengen). Derselbe Lauf, dasselbe Pruefttor.

EIN VERBUND ZUR ZEIT, serverweit. Der Dreier-Verbund belegt knapp 500 MB; die
Maschine hat gut 3,5 GB frei und einen halb belegten Swap. Zwei parallel waeren
kein Gewinn, sondern ein Wettlauf um denselben Speicher.

Rein im Sinne des Projektmoduls: Pfade und Manifest, keine HTTP-Kenntnis.
"""
import asyncio
import hashlib
import json
import os
import re
import secrets
import shutil
import threading
import time
from pathlib import Path

from . import cde, ordner
from .env import env

# Rein, ohne ifcopenshell: welche Klasse ein Aushub ist, sagt die Wurzel im IFC-Baum
# (app/ifc/kategorien.py, gespiegelt in der CDE). Hier stand zweimal der Klassenname.
from app.ifc import kategorien

BACKEND = Path(__file__).resolve().parents[4]          # .../backend
VORGABE_PYTHON = BACKEND / "app" / "ifc" / ".venv-ifc" / "bin" / "python"
LAUF_ORDNER = "_verbund"
ZEITDECKEL_S = 20 * 60
MAX_LAEUFE = 10                                         # je Projekt aufbewahrt
MAX_EIGENBAU = 100 * 1024 * 1024                        # Paket des CDE-Eigenbaus (JSON)
FERTIG = ("geprueft", "abgelehnt", "fehler", "abgebrochen")
MODI = ("verbund", "erdbau")
PRAEFIX = {"verbund": cde.VERBUND_PRAEFIX, "erdbau": cde.ERDBAU_PRAEFIX}
# `herkunft.art` erzeugter Dokumente — keine taugt als Gelaende eines Erdbaus.
ERZEUGT = ("verbund", "erdbau")
# v- = Verbund/Erdbau, p- = Pruefung eines Registerdokuments (Stufe 4b).
_LAUF_ID = re.compile(r"^[vp]-[0-9a-f]+-[0-9a-f]{6}$")

# lauf_id -> Task. Mit workers=1 ist das die ganze Wahrheit ueber laufende
# Verbuende in diesem Server; was ein Neustart abreisst, erkennt `status()` an
# der toten pid.
_laufend: dict[str, asyncio.Task] = {}
# Eintragen darf nur EINMAL geschehen. Der Hintergrund-Task und ein gleichzeitiges
# Abholen (Threadpool) koennten sonst beide eintragen — zwei Revisionen einer Datei.
_eintrag_sperre = threading.Lock()


class VerbundBesetzt(RuntimeError):
    """Es laeuft schon ein Verbund (Router: 409)."""


class WerkzeugFehlt(RuntimeError):
    """Das IFC-venv ist nicht eingerichtet (Router: 503)."""


def python_pfad() -> Path:
    """Der Interpreter des IFC-venv. `IFC_PYTHON` in backend/.env ueberschreibt ihn."""
    return Path(env("IFC_PYTHON", str(VORGABE_PYTHON)))


def _laufordner(o: ordner.Ordner, lauf_id: str) -> Path:
    # Die Kennung wird streng geprueft, bevor sie ein Pfad wird: `../..` soll
    # nicht einmal bis zum Dateisystem kommen.
    if not isinstance(lauf_id, str) or not _LAUF_ID.match(lauf_id):
        raise cde.CdeUnbekannt(lauf_id)
    return o.pfad / cde.ORDNER / LAUF_ORDNER / lauf_id


def _lies(pfad: Path) -> dict:
    try:
        return json.loads(pfad.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _schreibe(pfad: Path, daten: dict) -> None:
    temp = pfad.with_name(f".{pfad.name}.tmp-{secrets.token_hex(4)}")
    temp.write_text(json.dumps(daten, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(temp, pfad)


# ── Auftrag ─────────────────────────────────────────────────────────────────

def _ids_ablegen(o: ordner.Ordner, laufordner: Path) -> list[str]:
    """Die IDS-Regelwerke in den Laufordner — der Unterprozess prueft gegen sie (Stufe 5).

    Zuerst die des Bueros (Buero-Repository, Schluessel `ids:…`, gelten in jedem
    Projekt), dann die des Projekts (Register: Art "regelwerk", nicht
    archiviert). KOPIERT, nicht verlinkt: der Laufordner ist der ganze Vertrag,
    und ein spaeter geaendertes Regelwerk soll den Bericht dieses Laufs nicht
    nachtraeglich luegen lassen.
    """
    namen = []
    for i, w in enumerate(cde.buero_regelwerke(), 1):
        name = f"ids-b{i:02d}-{w['datei']}"
        (laufordner / name).write_text(w["xml"], encoding="utf-8")
        namen.append(name)
    werke = [d for d in cde.register(o) if d.get("art") == "regelwerk" and d.get("status") != "Archived"]
    for i, d in enumerate(werke, 1):
        quelle = o.pfad / cde.ORDNER / d["datei"]
        if not quelle.is_file():
            continue
        name = f"ids-{i:02d}-{d['datei']}"
        shutil.copyfile(quelle, laufordner / name)
        namen.append(name)
    return namen


def _modelldatei(o: ordner.Ordner, d: dict, hindernisse: list) -> dict | None:
    """Ein Registerdokument als Quelle — oder ein Hindernis mit Namen."""
    if Path(d["datei"]).suffix.lower() != ".ifc":
        hindernisse.append(f"{d['datei']}: zusammengefuehrt wird nur .ifc")
        return None
    pfad = o.pfad / cde.ORDNER / d["datei"]
    if not pfad.is_file():
        hindernisse.append(f"{d['datei']} fehlt im Projektordner")
        return None
    return {"pfad": str(pfad), "name": d["datei"], "sha256": d["sha256"],
            "revision": d.get("revision"), "status": d.get("status") or ""}


def auftrag_bauen(o: ordner.Ordner, satz_id: str, *, projektname: str | None = None,
                  mit_eigenbau: bool = False, modus: str = "verbund", paket: dict | None = None,
                  modelle: list | None = None) -> dict:
    """Aus einem Modellsatz den Auftrag fuer den Unterprozess machen.

    Abgelehnt wird LAUT und vollstaendig — alle Gruende auf einmal, nicht der
    erste. Wer fuenf Modelle ausgewaehlt hat, soll nicht fuenfmal starten, um
    fuenf Hindernisse einzeln zu erfahren.

    Plaene und andere Dokumente eines Satzes werden UEBERGANGEN, nicht
    abgelehnt: ein Satz darf mehr enthalten als Modelle, und der Verbund nimmt
    daraus, was er verarbeiten kann. Was uebergangen wurde, steht in der Antwort.

    ERDBAU-DOKUMENTE IM SATZ (Stufe 3): sie bringen ihr Ur-Gelaende mit. Das
    gelieferte Gelaende faellt deshalb aus dem Satz heraus (`weggelassen`,
    mit Grund) — sonst stuende es zweimal im Verbund, einmal mit Aushub und
    einmal ohne. Abgelehnt wird, was sich nicht aufloesen laesst: ein
    Erdbau-Dokument UND der Live-Stand (der Aushub stuende doppelt), zwei
    Erdbau-Dokumente derselben Quelle, und ein Erdbau-Dokument, das aus einer
    ANDEREN Revision des Gelaendes gebaut wurde, als der Satz fuehrt.

    AUSWAHL (Fahrplan Klare Ablaeufe, S4 neu): `modelle` sind die im Auswahlbaum
    angehakten Modelle. Nur sie gehen hinein; was abgewaehlt ist, steht unter
    `abgewaehlt`. `None` heisst: der ganze Satz, wie bisher. Im Erdbau-Modus
    entscheidet der Erdbau selbst, welche Dokumente er braucht.
    """
    if modus not in MODI:
        raise cde.CdeAbgelehnt(f"modus muss einer von {MODI} sein")
    daten = cde.manifest_lesen(o)
    satz = next((s for s in daten["saetze"] if s.get("id") == satz_id), None)
    if satz is None:
        raise cde.CdeUnbekannt(satz_id)
    bekannt = {d["sha256"]: d for d in daten["dokumente"]}
    if modus == "erdbau":
        return _auftrag_erdbau(o, satz, bekannt, projektname=projektname, paket=paket)

    enthaelt, abgewaehlt = list(satz.get("enthaelt") or []), []
    if modelle is not None:
        gewaehlt = set(modelle)
        fremd = sorted(gewaehlt - set(enthaelt))
        if fremd:
            raise cde.CdeAbgelehnt(f"{len(fremd)} gewaehlte Modelle stehen nicht im Satz {satz.get('name')!r} — "
                                   "den Dialog neu oeffnen")
        ist_modell = lambda s: s in bekannt and bekannt[s].get("art") == "modell"   # noqa: E731
        abgewaehlt = [bekannt[s]["datei"] for s in enthaelt if s not in gewaehlt and ist_modell(s)]
        enthaelt = [s for s in enthaelt if s in gewaehlt or (s in bekannt and not ist_modell(s))]

    quellen, uebergangen, hindernisse, erdbau_doks = [], [], [], []
    for sha in enthaelt:
        d = bekannt.get(sha)
        if d is None:
            hindernisse.append(f"{sha[:12]}… steht im Satz, aber nicht mehr im Register")
            continue
        if d.get("art") != "modell":
            uebergangen.append(d["datei"])
            continue
        art = (d.get("herkunft") or {}).get("art")
        if art == "verbund":
            # Ein Verbund aus Verbuenden enthielte jedes Bauteil doppelt — mit
            # abgeleiteten Ersatz-Ids, also still als ZWEI Bauteile.
            hindernisse.append(f"{d['datei']} ist selbst ein Verbund — bitte die Fachmodelle waehlen")
            continue
        q = _modelldatei(o, d, hindernisse)
        if q is None:
            continue
        quellen.append(q)
        if art == "erdbau":
            erdbau_doks.append(d)

    # Was steckt in welchem Erdbau-Dokument?
    steckt_in = {}
    for d in erdbau_doks:
        for eq in (d.get("herkunft") or {}).get("quellen") or []:
            s_eq = eq.get("sha256")
            if s_eq in steckt_in:
                hindernisse.append(f"zwei Erdbau-Dokumente derselben Quelle {eq.get('datei') or s_eq[:12]}: "
                                   f"{steckt_in[s_eq]} und {d['datei']} — eines waehlen")
                continue
            steckt_in[s_eq] = d["datei"]
            # Aus einer ANDEREN Revision gebaut, als der Satz fuehrt? Dann stuenden
            # zwei Fassungen des Gelaendes im Verbund — das Erdbau-Dokument ist veraltet.
            quell_dok = bekannt.get(s_eq)
            anders = next((q for q in quellen if quell_dok and q["sha256"] != s_eq
                           and cde._gleiche_linie(bekannt[q["sha256"]], quell_dok)), None)
            if anders is not None:
                hindernisse.append(f"{d['datei']} wurde aus {eq.get('datei') or s_eq[:12]} gebaut, der Satz fuehrt "
                                   f"{anders['name']} — den Erdbau neu erzeugen (oder die alte Revision waehlen)")
    if erdbau_doks and mit_eigenbau:
        hindernisse.append(f"{', '.join(d['datei'] for d in erdbau_doks)} und der Live-Stand der CDE zugleich — "
                           "der Aushub stuende doppelt im Verbund; eins von beiden waehlen")

    if hindernisse:
        raise cde.CdeAbgelehnt("; ".join(hindernisse))
    weggelassen = [{"datei": q["name"], "grund": f"steckt in {steckt_in[q['sha256']]}"}
                   for q in quellen if q["sha256"] in steckt_in]
    quellen = [q for q in quellen if q["sha256"] not in steckt_in]
    # Nur mit Eigenbau darf der Satz ohne Modell sein: dann ist der Verbund der
    # konforme Export dessen, was die CDE selbst gebaut hat.
    if not quellen and not mit_eigenbau:
        raise cde.CdeAbgelehnt("kein Modell angehakt — ohne Modell und ohne Eigenbau gibt es nichts auszugeben"
                               if modelle is not None else f"der Satz {satz.get('name')!r} enthaelt kein IFC-Modell")

    return {
        "satz_id": satz_id,
        "satz_name": satz.get("name") or satz_id,
        "modus": "verbund",
        "projektname": projektname or f"{satz.get('name') or satz_id} (Verbund)",
        # Stabil je Projekt und Satz: derselbe Satz ergibt beim naechsten Mal
        # dasselbe IfcProject — eine REVISION, kein Fremdling.
        "schluessel": f"projekt-{o.id}/satz-{satz_id}",
        "quellen": quellen,
        "uebergangen": uebergangen,
        "weggelassen": weggelassen,
        "abgewaehlt": abgewaehlt,
    }


def _auftrag_erdbau(o: ordner.Ordner, satz: dict, bekannt: dict, *, projektname: str | None,
                    paket: dict | None) -> dict:
    """Die Quellen eines Erdbau-Dokuments: die Registerdateien der Wirte — und nur die.

    Nicht der Satz entscheidet, sondern der Erdbau selbst: jeder Aushub nennt
    sein Ur-Gelaende (Wirt), der Browser hat es ueber den GUID-Index seinem
    Registerdokument zugeordnet (`paket.quellDokumente`). Hier wird geprueft,
    dass es dieses Dokument im Register gibt und dass JEDER Wirt darin liegt.
    Ein Rohrnetz im Satz gehoert nicht in das Erdbau-Dokument — die Rohre
    kommen im grossen Verbund dazu, und dort holt `vorgaenge_schliessen_in`
    sie in die Gruppe ihres Grabens.
    """
    satz_name = satz.get("name") or satz["id"]
    if not isinstance(paket, dict):
        raise cde.CdeAbgelehnt("Erdbau braucht den Stand der CDE (Eigenbau-Paket) — ohne ihn gibt es keinen Aushub")
    aushuebe = [b for b in paket.get("bauteile") or [] if kategorien.ist_aushub(b.get("klasse"))]
    if not aushuebe:
        raise cde.CdeAbgelehnt("das Paket enthaelt keinen Aushub — ein Erdbau-Dokument ohne Erdbau ist keins")
    hindernisse, quellen, globalids = [], [], {}
    for q in paket.get("quellDokumente") or []:
        sha = q.get("sha256")
        gids = [g for g in q.get("globalIds") or [] if isinstance(g, str)]
        if not sha:
            hindernisse.append(f"{', '.join(gids) or 'ein Wirt'} liegt in keinem Registerdokument — "
                               "das Gelaende zuerst ins Register laden")
            continue
        d = bekannt.get(sha)
        if d is None:
            hindernisse.append(f"Quelle nicht im Register: {q.get('datei') or sha[:12]}")
            continue
        if (d.get("herkunft") or {}).get("art") in ERZEUGT:
            hindernisse.append(f"{d['datei']} ist selbst erzeugt — der Erdbau braucht das GELIEFERTE Gelaende")
            continue
        eintrag = _modelldatei(o, d, hindernisse)
        if eintrag is not None and sha not in globalids:
            quellen.append(eintrag)
            globalids[sha] = gids
    genannt = {g for liste in globalids.values() for g in liste}
    offen = sorted({str(b["wirt"]) for b in aushuebe
                    if b.get("wirt") and not str(b["wirt"]).startswith("cde-")} - genannt)
    if offen:
        hindernisse.append(f"Wirt ohne Registerdokument: {', '.join(offen)}")
    if not quellen and not hindernisse:
        hindernisse.append("das Paket nennt kein Registerdokument fuer seine Wirte")
    if hindernisse:
        raise cde.CdeAbgelehnt("; ".join(hindernisse))
    journal = paket.get("journal") or {}
    return {
        "satz_id": satz["id"],
        "satz_name": satz_name,
        "modus": "erdbau",
        "projektname": projektname or f"{satz_name} (Erdbau)",
        # Eigener Schluessel: das Erdbau-Dokument ist ein anderes IfcProject als
        # der Verbund desselben Satzes — beide koennen im Register nebeneinander stehen.
        "schluessel": f"projekt-{o.id}/satz-{satz['id']}/erdbau",
        "quellen": quellen,
        "uebergangen": [],
        "weggelassen": [],
        "abgewaehlt": [],
        "erdbau": {"globalIds": globalids,
                   "journal": {"commit": journal.get("commit"), "sitzungOffen": journal.get("sitzungOffen")}},
    }


# ── Lauf ────────────────────────────────────────────────────────────────────

# Der Laufordner je laufendem Task — damit die Spur am STATUS sieht, ob ein Lauf
# noch rechnet (`_belegt`).
_ordner_der_laeufe: dict = {}


def _belegt(kennung: str, task) -> bool:
    """Belegt dieser Lauf die Spur? Solange sein Unterprozess rechnet — nicht mehr,
    sobald sein Status fertig ist (bei „geprueft": eingetragen).

    Der 409-Wettlauf (Fahrplan Erdbau-Container, 2026-09-11): der Status-Abruf
    traegt einen fertigen Lauf ein, der Hintergrund-Task gibt die Spur erst
    Millisekunden spaeter frei — ein Folgeauftrag in dieser Luecke bekam „es
    laeuft schon ein Verbund", obwohl nichts mehr rechnete. Der Task bleibt
    trotzdem in `_laufend` (eine Referenz, sonst verwirft asyncio ihn mitten im
    Eintragen); er belegt nur nicht mehr.
    """
    if task.done():
        return False
    pfad = _ordner_der_laeufe.get(kennung)
    st = _lies(pfad / "status.json") if pfad else {}
    zustand = st.get("zustand")
    return not (zustand in FERTIG and (zustand != "geprueft" or st.get("dokument")))


def _spur_und_werkzeug() -> None:
    """Die EINE Spur (einer nach dem anderen) und das Werkzeug — fuer Verbund UND Pruefung."""
    for kennung in [k for k, t in _laufend.items() if t.done()]:
        _laufend.pop(kennung, None)
        _ordner_der_laeufe.pop(kennung, None)
    belegt = [k for k, t in _laufend.items() if _belegt(k, t)]
    if belegt:
        raise VerbundBesetzt(
            f"es laeuft schon ein Verbund ({belegt[0]}) — "
            "der Server rechnet einen nach dem anderen")
    py = python_pfad()
    if not py.is_file():
        raise WerkzeugFehlt(f"IFC-Werkzeug fehlt ({py}) — Einrichtung: backend/app/ifc/README.md")


async def starte(o: ordner.Ordner, satz_id: str, *, akteur: str,
                 projektname: str | None = None, crs: str | None = None,
                 eigenbau: bytes | None = None, modus: str = "verbund",
                 modelle: list | None = None, autor: str | None = None,
                 organisation: str | None = None) -> dict:
    """Auftrag annehmen, Laufordner anlegen, Unterprozess starten. Kehrt sofort zurueck.

    `crs` ist das Bezugssystem des PROJEKTS, wie die CDE es kennt. Ohne Angabe
    ermittelt der Verbund es aus den Koordinaten der Quellen — und lehnt ab,
    wenn die Quellen sich darin nicht einig sind. Geprueft wird der Wert im
    Unterprozess (die Tabelle lebt beim Werkzeug), gleich als erster Schritt:
    ein unbekanntes System scheitert nach einer Sekunde, nicht nach zwei Minuten.
    """
    _spur_und_werkzeug()

    paket = None
    if eigenbau is not None:
        # Das Paket des CDE-Eigenbaus (IfcViewer.eigenbauPaket). Geprueft wird
        # hier nur die Form — ein Objekt, nicht zu gross — und im Erdbau-Modus
        # die Quelldokumente gegen das Register. Was drinsteht, prueft
        # eigenbau.baue_datei im Unterprozess, und am Ende das Prueftor.
        if len(eigenbau) > MAX_EIGENBAU:
            raise cde.CdeAbgelehnt(f"Eigenbau-Paket groesser als {MAX_EIGENBAU // 2**20} MB")
        try:
            paket = json.loads(eigenbau)
        except ValueError as fehler:
            raise cde.CdeAbgelehnt(f"Eigenbau-Paket ist kein JSON: {fehler}") from None
        if not isinstance(paket, dict):
            raise cde.CdeAbgelehnt("Eigenbau-Paket muss ein JSON-Objekt sein")

    auftrag = auftrag_bauen(o, satz_id, projektname=projektname, mit_eigenbau=eigenbau is not None,
                            modus=(modus or "verbund").strip().lower(), paket=paket, modelle=modelle)
    auftrag["bearbeiter"] = akteur
    # S4 neu: wer die Datei ausgibt und fuer wen — getrennt vom Akteur, den das Register braucht.
    for schluessel, wert in (("autor", autor), ("organisation", organisation)):
        if (wert or "").strip():
            auftrag[schluessel] = wert.strip()[:200]
    auftrag["crs"] = (crs or "").strip().upper() or None
    # Wo die Registerdateien liegen — `Location` ihrer Dokumentverweise (app/ifc/herkunft.py).
    auftrag["ablage"] = f"{o.phase}/{o.ordnername}/{cde.ORDNER}"
    if eigenbau is not None:
        teile = paket.get("bauteile") or []
        auftrag["eigenbau"] = {
            "groesse": len(eigenbau), "sha256": hashlib.sha256(eigenbau).hexdigest(),
            "version": paket.get("version"),
            "aushuebe": sum(1 for b in teile if kategorien.ist_aushub(b.get("klasse"))),
            "vorgaenge": len({(b.get("vorgang") or {}).get("ableitung") for b in teile if b.get("vorgang")}),
        }
        # Was beim Ausgeben abgewaehlt wurde (S4 neu, K7) — die Spur im Register.
        aus = [a for a in paket.get("ausgelassen") or [] if isinstance(a, dict)]
        if aus:
            auftrag["eigenbau"]["ausgelassen"] = len(aus)
            auftrag["eigenbau"]["ausgelassene_vorgaenge"] = sorted({str(a["vorgang"]) for a in aus if a.get("vorgang")})
    namen = [q["name"] for q in auftrag["quellen"]] + (["CDE-Eigenbau"] if eigenbau is not None else [])

    lauf_id = f"v-{int(time.time()):x}-{secrets.token_hex(3)}"
    laufordner = _laufordner(o, lauf_id)
    laufordner.mkdir(parents=True)
    auftrag["ids"] = _ids_ablegen(o, laufordner)
    _schreibe(laufordner / "auftrag.json", auftrag)
    if eigenbau is not None:
        # VOR dem Start: der Unterprozess liest es als Erstes.
        (laufordner / "eigenbau.json").write_bytes(eigenbau)
    _schreibe(laufordner / "status.json", {
        "zustand": "wartet", "akteur": akteur, "satz_id": satz_id, "modus": auftrag["modus"],
        "satz_name": auftrag["satz_name"], "angenommen": cde._jetzt(),
        "quellen": namen, "weggelassen": auftrag["weggelassen"], "abgewaehlt": auftrag["abgewaehlt"],
    })
    _laufend[lauf_id] = asyncio.create_task(_fahre(o, lauf_id))
    _ordner_der_laeufe[lauf_id] = laufordner
    _aufraeumen(o, behalte=lauf_id)
    return {"lauf_id": lauf_id, "zustand": "wartet", "modus": auftrag["modus"], "quellen": namen,
            "uebergangen": auftrag["uebergangen"], "weggelassen": auftrag["weggelassen"],
            # Immer dabei, auch leer: daran erkennt der Client, dass der Server die Auswahl kennt.
            "abgewaehlt": auftrag["abgewaehlt"]}


async def pruefung_starten(o: ordner.Ordner, sha256: str, *, akteur: str) -> dict:
    """EIN Registerdokument durch das Prueftor (Fahrplan IFC-Konsistenz, Stufe 4b).

    Derselbe Unterprozess (`cli.py`, Modus "pruefe"), dieselbe Spur und derselbe
    Laufordner-Vertrag wie der Verbund. Das Ergebnis haengt als `pruefung` am
    Registereintrag (`eintragen_wenn_fertig`), es entsteht kein neues Dokument.
    Erst die Eingabe, dann die Spur: ein falsches Dokument ist 404/422, auch
    wenn gerade gerechnet wird.
    """
    d = next((x for x in cde.register(o) if x.get("sha256") == sha256), None)
    if d is None:
        raise cde.CdeUnbekannt(sha256)
    if d.get("art") != "modell" or not str(d.get("datei", "")).lower().endswith(".ifc"):
        raise cde.CdeAbgelehnt(f"{d.get('datei')}: geprueft werden IFC-Modelle (.ifc)")
    pfad = o.pfad / cde.ORDNER / d["datei"]
    if not pfad.is_file():
        raise cde.CdeAbgelehnt(f"{d['datei']} fehlt im Projektordner")
    _spur_und_werkzeug()

    lauf_id = f"p-{int(time.time()):x}-{secrets.token_hex(3)}"
    laufordner = _laufordner(o, lauf_id)
    laufordner.mkdir(parents=True)
    _schreibe(laufordner / "auftrag.json", {"modus": "pruefe", "sha256": sha256, "datei": str(pfad),
                                           "dokument": d["datei"], "ids": _ids_ablegen(o, laufordner),
                                           "bearbeiter": akteur})
    _schreibe(laufordner / "status.json", {"zustand": "wartet", "akteur": akteur, "modus": "pruefe",
                                          "angenommen": cde._jetzt(), "quellen": [d["datei"]],
                                          "weggelassen": []})
    _laufend[lauf_id] = asyncio.create_task(_fahre(o, lauf_id))
    _ordner_der_laeufe[lauf_id] = laufordner
    _aufraeumen(o, behalte=lauf_id)
    return {"lauf_id": lauf_id, "zustand": "wartet", "modus": "pruefe", "quellen": [d["datei"]]}


async def _fahre(o: ordner.Ordner, lauf_id: str) -> None:
    """Den Unterprozess starten, abwarten, bei Erfolg eintragen."""
    laufordner = _laufordner(o, lauf_id)
    status_pfad = laufordner / "status.json"
    rueckgabe = None
    protokoll = open(laufordner / "prozess.txt", "ab")
    try:
        umgebung = {**os.environ, "PYTHONPATH": str(BACKEND),
                    "IFC_SPEICHER_MB": env("IFC_SPEICHER_MB", "")
                    or os.environ.get("IFC_SPEICHER_MB", "")}
        if not umgebung["IFC_SPEICHER_MB"]:
            umgebung.pop("IFC_SPEICHER_MB")      # der Prozess nimmt dann seine Vorgabe
        prozess = await asyncio.create_subprocess_exec(
            str(python_pfad()), "-m", "app.ifc.cli", str(laufordner),
            cwd=str(BACKEND), env=umgebung, stdout=protokoll, stderr=protokoll)
        try:
            rueckgabe = await asyncio.wait_for(prozess.wait(), timeout=ZEITDECKEL_S)
        except asyncio.TimeoutError:
            prozess.kill()
            await prozess.wait()
            st = _lies(status_pfad)
            st.update(zustand="fehler", beendet=cde._jetzt(),
                      fehler=f"Zeitdeckel von {ZEITDECKEL_S // 60} min ueberschritten — Lauf beendet")
            _schreibe(status_pfad, st)
    except Exception as fehler:                  # noqa: BLE001
        st = _lies(status_pfad)
        st.update(zustand="fehler", beendet=cde._jetzt(),
                  fehler=f"Unterprozess liess sich nicht starten: {type(fehler).__name__}: {fehler}")
        _schreibe(status_pfad, st)
    finally:
        protokoll.close()

    st = _lies(status_pfad)
    if st.get("zustand") not in FERTIG:
        # Der Prozess ist weg, ohne einen Endzustand zu schreiben: abgewuergt
        # (Speicherdeckel, SIGKILL, Absturz im C++-Teil). Das gehoert gesagt.
        st.update(zustand="fehler", beendet=cde._jetzt(),
                  fehler=f"Prozess endete ohne Ergebnis (Rueckgabewert {rueckgabe}) — "
                         "Speicherdeckel oder Absturz, siehe prozess.txt im Laufordner")
        _schreibe(status_pfad, st)
    if st.get("zustand") == "geprueft":
        # Hashen und Verschieben von ~16 MB auf der StorageBox — nicht im
        # Ereignis-Thread, sonst stuende der Server so lange.
        await asyncio.to_thread(eintragen_wenn_fertig, o, lauf_id)


def _lebt(pid) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True                               # existiert, gehoert nur jemand anderem


def status(o: ordner.Ordner, lauf_id: str, conn=None) -> dict:
    """Was ist aus dem Lauf geworden? Traegt nach, falls das Eintragen noch aussteht."""
    laufordner = _laufordner(o, lauf_id)
    if not laufordner.is_dir():
        raise cde.CdeUnbekannt(lauf_id)
    status_pfad = laufordner / "status.json"
    st = _lies(status_pfad)

    if st.get("zustand") in ("wartet", "laeuft"):
        task = _laufend.get(lauf_id)
        if (task is None or task.done()) and not _lebt(st.get("pid")):
            st.update(zustand="abgebrochen", beendet=cde._jetzt(),
                      fehler="Der Lauf wurde unterbrochen (Server-Neustart?) — bitte neu starten")
            _schreibe(status_pfad, st)

    if st.get("zustand") == "geprueft" and not st.get("dokument"):
        # Der Hintergrund-Task hat es nicht mehr geschafft (Neustart zwischen
        # Pruefung und Eintrag). Das Ergebnis liegt aber da und ist geprueft.
        eintragen_wenn_fertig(o, lauf_id, conn=conn)
        st = _lies(status_pfad)

    bericht = _lies(laufordner / "bericht.json")
    if bericht:
        st["bericht"] = {k: bericht.get(k) for k in (
            "schema", "entitaeten", "produkte", "bauteile", "groesse_mb", "dauer_s",
            "weltbezug_plausibel", "verstoesse", "werkzeug", "speicher",
            # Welches Bezugssystem der Verbund bekam, und ob es eine Angabe oder
            # eine Annahme war — das muss man sehen, bevor man die Datei weitergibt.
            "crs", "crs_herkunft", "crs_mehrdeutig", "nachbearbeitung", "eigenbau")}
        # stufe/zahl/schwere/teile/beispiele seit dem Prueftor mit Stufen (2026-09-11):
        # ohne `schwere` saehe ein Hinweis („keine IDS hinterlegt") aus wie ein Fehler.
        st["befunde"] = [{k: b.get(k) for k in ("id", "titel", "ok", "sagt", "stufe", "zahl", "schwere",
                                                "teile", "beispiele")}
                         for b in bericht.get("befunde") or []]
        st["quellen_bericht"] = [{k: q.get(k) for k in (
            "name", "schema", "einheit_faktor", "produkte", "uebernommen", "verworfen",
            "stile_uebernommen", "warnungen")} for q in bericht.get("quellen") or []]
    st["lauf_id"] = lauf_id
    return st


def bericht_pfad(o: ordner.Ordner, lauf_id: str) -> Path:
    """Die bericht.json eines Laufs — der GANZE Pruefbericht (IFC-Konsistenz, Stufe 6).

    Der Status reicht die Befunde gekuerzt weiter, das Manifest noch kuerzer. Hier
    steht jeder Befund mit Text und Beispielen — solange der Laufordner steht
    (`_aufraeumen`, MAX_LAEUFE). Fehlt er: unbekannt.
    """
    pfad = _laufordner(o, lauf_id) / "bericht.json"
    if not pfad.is_file():
        raise cde.CdeUnbekannt(f"{lauf_id}/bericht.json")
    return pfad


# ── Eintragen ───────────────────────────────────────────────────────────────

def _herkunft(auftrag: dict, bericht: dict, lauf_id: str) -> dict:
    """Die Spur, die ein erzeugtes Dokument im Manifest hinterlaesst.

    Knapp, aber vollstaendig genug, um ohne den Laufordner zu wissen, woraus es
    gebaut und wie es geprueft wurde — der Laufordner wird nach MAX_LAEUFE
    weggeraeumt, das Manifest nicht.

    `art` ist der Modus: `verbund` oder `erdbau`. Ein Erdbau-Dokument traegt je
    Quelle die GlobalIds seiner Wirte und den JOURNALSTAND, aus dem es gebaut
    wurde — die Grundlage fuer „Quelle R01 → R02 vorhanden, neu erzeugen"
    (Stufe 4) und fuer jeden Verbund, der das Gelaende weglassen muss, weil es
    im Erdbau-Dokument steckt.
    """
    gemessen = {q.get("name"): q for q in bericht.get("quellen") or []}
    wirte = (auftrag.get("erdbau") or {}).get("globalIds") or {}

    def quelle(q):
        m = gemessen.get(q["name"]) or {}
        e = {"sha256": q["sha256"], "datei": q["name"], "revision": q.get("revision"),
             "schema": m.get("schema"), "einheit_faktor": m.get("einheit_faktor"), "verworfen": m.get("verworfen")}
        if q["sha256"] in wirte:
            e["globalIds"] = wirte[q["sha256"]]
        return e

    herkunft = {
        "art": auftrag.get("modus") or "verbund",
        "satz_id": auftrag.get("satz_id"),
        "satz_name": auftrag.get("satz_name"),
        "lauf_id": lauf_id,
        "schema": bericht.get("schema"),
        "werkzeug": bericht.get("werkzeug"),
        "crs": bericht.get("crs"),
        # Was der Verbund ENTSCHIEDEN hat. Bis 2026-09-10 stand hier fest „Annahme
        # aus den Ostwerten" — auch wenn eine Quelle ihr System angab.
        "crs_herkunft": bericht.get("crs_herkunft"),
        "quellen": [quelle(q) for q in auftrag.get("quellen") or []],
        "eigenbau": auftrag.get("eigenbau"),
        "pruefung": {"verstoesse": bericht.get("verstoesse"),
                     "kriterien": [b.get("id") for b in bericht.get("befunde") or []],
                     # Gegen welche Projektanforderungen geprueft wurde (Stufe 5).
                     "ids": auftrag.get("ids") or [],
                     # Was gemeldet, aber nicht gesperrt hat (IDS-Anforderungen, Hinweise).
                     "hinweise": [b.get("id") for b in bericht.get("befunde") or []
                                  if b.get("ok") is not True and b.get("schwere") in ("warnung", "hinweis")]},
    }
    if auftrag.get("weggelassen"):
        herkunft["weggelassen"] = auftrag["weggelassen"]
    # S4 neu: abgewaehlte Modelle, Autor und Organisation der Ausgabe.
    for schluessel in ("abgewaehlt", "autor", "organisation"):
        if auftrag.get(schluessel):
            herkunft[schluessel] = auftrag[schluessel]
    if auftrag.get("erdbau"):
        herkunft["journal"] = auftrag["erdbau"].get("journal")
    return herkunft


def _pruefung_eintragen(o, laufordner: Path, st: dict, auftrag: dict, bericht: dict, lauf_id: str,
                        conn=None) -> dict | None:
    """Modus "pruefe": den Bericht als `pruefung` an den Registereintrag haengen — kein neues Dokument."""
    status_pfad = laufordner / "status.json"
    befunde = bericht.get("befunde") or []
    block = {"stand": cde._jetzt(), "lauf_id": lauf_id, "schema": bericht.get("schema"),
             "werkzeug": bericht.get("werkzeug"), "verstoesse": bericht.get("verstoesse"),
             "ids": auftrag.get("ids") or [],
             "befunde": [{k: b.get(k) for k in ("id", "titel", "ok", "zahl", "schwere", "stufe")}
                         for b in befunde]}
    akteur = st.get("akteur") or "cde"
    try:
        if conn is None:
            from app.api.pedant import db
            with db.pool().connection() as eigene:
                dok = cde.pruefung_eintragen(eigene, o, auftrag["sha256"], block, akteur=akteur)
        else:
            dok = cde.pruefung_eintragen(conn, o, auftrag["sha256"], block, akteur=akteur)
    except (cde.CdeAbgelehnt, cde.CdeUnbekannt, OSError) as fehler:
        st.update(zustand="fehler", fehler=f"Pruefbericht nicht eingetragen: {fehler}")
        _schreibe(status_pfad, st)
        return None
    st["dokument"] = {"sha256": dok["sha256"], "datei": dok["datei"], "revision": dok.get("revision"),
                      "pfad": f"{o.phase}/{o.ordnername}/{cde.ORDNER}/{dok['datei']}"}
    st["eingetragen"] = cde._jetzt()
    _schreibe(status_pfad, st)
    return st["dokument"]


def eintragen_wenn_fertig(o: ordner.Ordner, lauf_id: str, conn=None) -> dict | None:
    """Einen GEPRUEFTEN Verbund (bzw. ein Erdbau-Dokument) ins Register stellen. Genau einmal.

    Nur `geprueft` wird eingetragen. Ein abgelehnter Verbund bleibt im
    Laufordner liegen, damit man nachsehen kann, woran er scheiterte — aber er
    erscheint nicht im Register: ein stiller unkonformer Verbund dort waere
    schlimmer als keiner.
    """
    laufordner = _laufordner(o, lauf_id)
    status_pfad = laufordner / "status.json"
    with _eintrag_sperre:
        st = _lies(status_pfad)
        if st.get("zustand") != "geprueft" or st.get("dokument"):
            return st.get("dokument")
        auftrag = _lies(laufordner / "auftrag.json")
        bericht = _lies(laufordner / "bericht.json")
        if (auftrag.get("modus") or "verbund") == "pruefe":
            return _pruefung_eintragen(o, laufordner, st, auftrag, bericht, lauf_id, conn)
        herkunft = _herkunft(auftrag, bericht, lauf_id)
        akteur = st.get("akteur") or "cde"
        modus = auftrag.get("modus") or "verbund"

        def eintragen(verbindung):
            return cde.erzeugtes_eintragen(verbindung, o, laufordner / "verbund.ifc",
                                           praefix=PRAEFIX.get(modus, cde.VERBUND_PRAEFIX),
                                           satz_name=auftrag.get("satz_name") or "Satz",
                                           akteur=akteur, herkunft=herkunft, aktion=f"cde_{modus}")
        try:
            if conn is None:
                from app.api.pedant import db
                with db.pool().connection() as eigene:
                    dok = eintragen(eigene)
            else:
                dok = eintragen(conn)
        except (cde.CdeAbgelehnt, OSError) as fehler:
            st.update(zustand="fehler", fehler=f"Eintrag ins Register misslang: {fehler}")
            _schreibe(status_pfad, st)
            return None
        st["dokument"] = {
            "sha256": dok["sha256"], "datei": dok["datei"], "revision": dok["revision"],
            "pfad": f"{o.phase}/{o.ordnername}/{cde.ORDNER}/{dok['datei']}",
        }
        st["eingetragen"] = cde._jetzt()
        _schreibe(status_pfad, st)
        return st["dokument"]


def _aufraeumen(o: ordner.Ordner, *, behalte: str) -> None:
    """Alte Laufordner wegraeumen — die Spur steht im Manifest, nicht hier.

    Ein abgelehnter Lauf haelt seine Verbunddatei (bis ~16 MB) fuer die Suche
    nach dem Grund. Unbegrenzt aufbewahrt fuellte das die Ablage mit
    Zwischenstaenden, die keiner mehr ansieht.
    """
    wurzel = o.pfad / cde.ORDNER / LAUF_ORDNER
    try:
        laeufe = sorted((p for p in wurzel.iterdir() if p.is_dir() and _LAUF_ID.match(p.name)),
                        key=lambda p: p.name)
    except OSError:
        return
    for alt in laeufe[:-MAX_LAEUFE]:
        if alt.name == behalte or alt.name in _laufend:
            continue
        shutil.rmtree(alt, ignore_errors=True)
