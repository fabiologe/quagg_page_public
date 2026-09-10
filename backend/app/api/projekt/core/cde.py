"""CDE-Anbindung (Stufe 6, "Stufe C light"): Dokumentregister je Projekt in
<Projekt>/CDE/manifest.yaml — Modelle/Plaene mit Revision und ISO-19650-Status.

FS-first wie flood3D: die Datei liegt im Ordner, das Manifest ist die Wahrheit
ueber Revision/Status. Der Viewer (/cde?projekt=<id>&datei=…) laedt die Datei
ueber /projects/file; das RemoteBackend des Viewers (Issues/Ansichten auf dem
Server) bleibt der CDE-Roadmap Stufe C vorbehalten.
"""

import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

from . import ordner
from .env import env
from .audit import audit_schreiben

ORDNER = "CDE"
MANIFEST = "manifest.yaml"
STATUS = ("WIP", "Shared", "Published", "Archived")

# ISO-19650-Arbeitsfluss (Luecke 4, 2026-09-02): der Status geht VORWAERTS,
# zurueck ist eine bewusste Ruecknahme mit Rang. Wert = Mindestrolle fuer den
# Uebergang; was nicht in der Tabelle steht, ist kein Weg (erst ueber die
# Zwischenstufe). ADMIN darf jeden Sprung — die Korrektur-Eskape; auditiert
# wird ohnehin jeder Wechsel.
STATUS_UEBERGAENGE = {
    ("WIP", "Shared"): "WERKSTUDENT",
    ("Shared", "WIP"): "MITARBEITER",
    ("Shared", "Published"): "MITARBEITER",
    ("Published", "Archived"): "MITARBEITER",
    ("Published", "Shared"): "ADMIN",
    ("Archived", "Published"): "ADMIN",
}


def _pruefe_uebergang(von: str, nach: str, rolle) -> None:
    """Wirft CdeAbgelehnt, wenn dieser Statuswechsel nicht erlaubt ist.

    `rolle=None` heisst: direkter Core-Aufruf ohne Nutzerkontext (Tests,
    Werkzeuge). Dann gilt der GRAPH weiter, nur die Rangschranke nicht —
    der Tuersteher am Endpunkt reicht die Rolle immer mit.
    """
    from app.core.rollen import RANG, Rolle, normalisiert

    r = normalisiert(rolle) if rolle is not None else None
    if r is Rolle.ADMIN:
        return
    mindest = STATUS_UEBERGAENGE.get((von, nach))
    if mindest is None:
        raise CdeAbgelehnt(f"{von} -> {nach} ist kein ISO-19650-Weg (erst ueber die Zwischenstufe)")
    if rolle is None:
        return
    if r is None or RANG[r] < RANG[Rolle(mindest)]:
        raise CdeAbgelehnt(f"{von} -> {nach} braucht mindestens {mindest}")

ARTEN = ("modell", "plan", "bcf", "sonstiges")
# Modellsaetze (Stufe 11): benannte AUSWAHLEN aus der Ablage. Ein Satz besitzt
# nichts — er verweist. Dasselbe Gelaende in drei Varianten kostet einmal Platz.
SATZ_ZWECKE = ("bestand", "variante", "vorzug", "ausschreibung")
ENDUNGEN = {".ifc": "modell", ".ifczip": "modell", ".pdf": "plan", ".dxf": "plan", ".dwg": "plan",
            ".bcf": "bcf", ".bcfzip": "bcf"}
MAX_GROESSE = 400 * 1024 * 1024
CHUNK = 1024 * 1024
# Streng, damit DELETE /cde/{sha256} nicht versehentlich auf /cde/repo passt:
# "repo" ist keine 64-stellige Hexzahl und faellt als 422 durch.
_SHA_MUSTER = re.compile(r"^[0-9a-f]{64}$")
# Aus dem Register entfernte Dateien wandern hierhin statt geloescht zu werden.
GELOESCHT = "_geloescht"


class CdeAbgelehnt(ValueError):
    """Router: 422."""


class CdeUnbekannt(KeyError):
    """Router: 404."""


def _jetzt() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cde_ordner(o: ordner.Ordner) -> Path:
    pfad = o.pfad / ORDNER
    pfad.mkdir(exist_ok=True)
    return pfad


def manifest_lesen(o: ordner.Ordner) -> dict:
    datei = o.pfad / ORDNER / MANIFEST
    if not datei.is_file():
        return {"version": 1, "projekt_id": o.id, "dokumente": [], "saetze": []}
    daten = yaml.safe_load(datei.read_text(encoding="utf-8")) or {}
    daten.setdefault("version", 1)
    daten.setdefault("projekt_id", o.id)
    daten.setdefault("dokumente", [])
    # Rueckwaertsvertraeglich: alte Manifeste haben keine Saetze und bekommen
    # eine leere Liste, statt beim Lesen zu scheitern.
    daten.setdefault("saetze", [])
    return daten


def _manifest_schreiben(o: ordner.Ordner, daten: dict) -> None:
    ziel = _cde_ordner(o) / MANIFEST
    temp = ziel.parent / f".tmp-{uuid.uuid4().hex}"
    try:
        temp.write_text(yaml.safe_dump(daten, allow_unicode=True, sort_keys=False), encoding="utf-8")
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def register(o: ordner.Ordner) -> list[dict]:
    """Dokumente mit Existenz-Check (Datei im Explorer geloescht -> markiert)."""
    daten = manifest_lesen(o)
    for d in daten["dokumente"]:
        d["vorhanden"] = (o.pfad / ORDNER / d["datei"]).is_file()
        d["pfad"] = f"{ORDNER}/{d['datei']}"
        d["basisname"] = _basis(d)            # gerechnet, nicht gelesen — siehe `_basis`
    return sorted(daten["dokumente"], key=lambda d: (d.get("basisname", ""), -int(d.get("revision", 1))))


# Ein Revisionssuffix braucht einen TRENNER oder einen Revisionsbuchstaben.
# Ohne diese Bedingung schnitt der Ausdruck jede Ziffer am Wortende ab:
# "BIM26_..._Erdarbeiten3.ifc" wurde zu "..._Erdarbeiten", und eine spaeter
# gelieferte "..._Erdarbeiten.ifc" haette als Revision 2 DESSELBEN Modells
# gegolten — zwei verschiedene Fachmodelle in einer Linie. Aufgefallen am
# ersten echten Upload in 1337_Genau (31.08.2026). Die Dokumentation der
# Funktion meinte ohnehin nur die Formen mit Trenner.
_REVISIONS_SUFFIX = re.compile(r"([_\-\s]+(r|rev|v|version)?\s*\d+|(r|rev|v|version)\s*\d+)$",
                               flags=re.IGNORECASE)


# Ein DATUM am Ende ist Teil des Namens (2026-08-31, 20260831), keine Revision.
_DATUM_AM_ENDE = re.compile(r"[_\-\s.](19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])$")


def _basisname(name: str) -> str:
    """'Kanal_R03.ifc' -> 'Kanal' (Revisionssuffixe _R03/_rev3/-v2 abgeschnitten).

    'Erdarbeiten3.ifc' bleibt 'Erdarbeiten3' — eine angehaengte Ziffer ohne
    Trenner ist Teil des Namens, keine Revision.

    Ein DATUM am Ende bleibt ganz (Stufe 4 des Aushub-Fachmodells, 2026-09-10):
    aus '6275_ENQUIER_0X_2026-08-31.ifc' wurde '..._2026-08' — der Tag galt als
    Revision „-31". Gemessen an allen Registern: 1 von 9 Eintraegen (1337).
    """
    stamm = Path(name).stem
    if _DATUM_AM_ENDE.search(stamm):
        return stamm
    return _REVISIONS_SUFFIX.sub("", stamm).strip() or stamm


def _basis(d: dict) -> str:
    """Der Stamm eines Registereintrags — aus dem DATEINAMEN gerechnet, nicht gelesen.

    Das Manifest speichert `basisname` beim Eintragen. Nach einer Korrektur an
    `_basisname` stuende dort bei alten Eintraegen der alte Stamm, und die Linie
    zerrisse: die naechste Revision desselben Modells begaenne eine neue. Also
    wird verglichen, was die Regel HEUTE sagt — und kein Eintrag umgeschrieben.
    """
    return _basisname(d["datei"]) if d.get("datei") else (d.get("basisname") or "")


# Die IFCPROJECT-GlobalId steht im Kopf der Datei — Spiegel von ModelIdentity.js (PROJECT_RE).
KOPF_BYTES = 4 * 1024 * 1024
_IFCPROJECT = re.compile(rb"IFCPROJECT\s*\(\s*'([^']{1,64})'")


def _projekt_global_id_aus(kopf: bytes) -> str | None:
    """Die IFCPROJECT-GlobalId aus den ersten Megabytes einer IFC-Datei — oder None.

    Bis Stufe 4 kannte der Server sie nur, wenn der VIEWER hochlud; ueber die
    Projekt-Akte und die API kam jedes Modell ohne sie herein (gemessen
    2026-09-10: 9 von 9 Registereintraegen). Die Saetze pruefen ihre Linien aber
    zuerst ueber genau diese Kennung (`_linie`).
    """
    m = _IFCPROJECT.search(kopf or b"")
    return m.group(1).decode("ascii", "replace") if m else None


def _sicherer_name(name: str) -> str:
    name = Path(name or "dokument").name
    name = re.sub(r"[^A-Za-z0-9._\-äöüÄÖÜß ]+", "_", name).strip()
    return name or "dokument"


async def hochladen(conn, o: ordner.Ordner, upload, *, akteur: str, art: str | None = None,
                    status: str = "WIP", projekt_global_id: str | None = None) -> dict:
    """Streamt die Datei nach CDE/, berechnet sha256, traegt sie mit Revision ins Manifest.

    `projekt_global_id` ist die IFCPROJECT-GlobalId, die der Viewer beim Laden
    ohnehin berechnet. Sie wird nur MITGEFUEHRT, nicht fuer die Revision
    benutzt: gezaehlt wird weiter je (basisname, art), also nach der
    Buerokonvention Kanal_R01/Kanal_R02, die auch im Cockpit steht. Die
    GlobalId sagt dagegen, welche Dateien dasselbe Ursprungsmodell meinen —
    das ist die Grundlage fuer den spaeteren Modellvergleich, und beides kann
    auseinanderfallen (zwei Dateinamen, ein Modell).
    """
    if status not in STATUS:
        raise CdeAbgelehnt(f"status muss einer von {STATUS} sein")
    name = _sicherer_name(upload.filename)
    endung = Path(name).suffix.lower()
    art = art or ENDUNGEN.get(endung, "sonstiges")
    if art not in ARTEN:
        raise CdeAbgelehnt(f"art muss eine von {ARTEN} sein")
    zielordner = _cde_ordner(o)
    ziel = zielordner / name
    if ziel.exists():
        raise CdeAbgelehnt(f"{name} liegt bereits in CDE/ — neue Revision bitte mit neuem Dateinamen")
    temp = zielordner / f".tmp-{uuid.uuid4().hex}"
    pruefsumme = hashlib.sha256()
    groesse = 0
    kopf = bytearray()
    try:
        with temp.open("wb") as f:
            while True:
                chunk = await upload.read(CHUNK)
                if not chunk:
                    break
                if len(kopf) < KOPF_BYTES:
                    kopf += chunk[:KOPF_BYTES - len(kopf)]
                groesse += len(chunk)
                if groesse > MAX_GROESSE:
                    raise CdeAbgelehnt(f"datei groesser als {MAX_GROESSE // (1024 * 1024)} MB")
                pruefsumme.update(chunk)
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
        if groesse == 0:
            raise CdeAbgelehnt("leere datei")
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    # Was der Viewer schickt, gilt (er hat das Modell offen); sonst liest der Server selbst.
    if not projekt_global_id and endung == ".ifc":
        projekt_global_id = _projekt_global_id_aus(bytes(kopf))
    return _registriere(conn, o, name=name, sha=pruefsumme.hexdigest(), groesse=groesse, art=art,
                        status=status, akteur=akteur, projekt_global_id=projekt_global_id)


def _registriere(conn, o: ordner.Ordner, *, name: str, sha: str, groesse: int, art: str,
                 status: str, akteur: str, projekt_global_id: str | None = None,
                 herkunft: dict | None = None, aktion: str = "cde_hochladen") -> dict:
    """Die EINE Stelle, die einen Dokumenteintrag ins Manifest schreibt.

    Bis zum Verbundexport fuehrte nur ein Weg ins Register: der Upload. Jetzt
    sind es zwei — hochgeladen und ERZEUGT. Stuende der Eintrag zweimal im Code,
    liefen Revisionszaehlung und Feldnamen irgendwann auseinander, und das
    Register zaehlte je nach Herkunft anders. Beide Wege enden deshalb hier.

    `herkunft` steht nur an erzeugten Dokumenten. Ein hochgeladenes hat keine —
    woher es kam, weiss der Planer, nicht wir.
    """
    daten = manifest_lesen(o)
    basis = _basisname(name)
    geschwister = [d for d in daten["dokumente"] if _basis(d) == basis and d.get("art") == art]
    revision = max((int(d.get("revision", 1)) for d in geschwister), default=0) + 1
    eintrag = {"sha256": sha, "datei": name, "basisname": basis, "art": art, "revision": revision,
               "status": status, "groesse": groesse, "hochgeladen_am": _jetzt(), "von": akteur,
               "projekt_global_id": projekt_global_id or None,
               "status_historie": [{"status": status, "von": akteur, "am": _jetzt()}]}
    if herkunft:
        eintrag["herkunft"] = herkunft
    daten["dokumente"].append(eintrag)
    _manifest_schreiben(o, daten)
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, aktion, erfolg=True,
                        nutzlast={"projekt_id": o.id, "datei": name, "sha256": sha, "revision": revision})
    return {**eintrag, "vorhanden": True, "pfad": f"{ORDNER}/{name}"}


# ── Vom CDE ERZEUGTE Modelle: Verbund und Erdbau ─────────────────────────────
# Ein Verbund ist ein Modell, das die CDE aus einem Modellsatz erzeugt hat
# (Lauf: verbund_lauf.py, Werkzeug: backend/app/ifc/). Ein ERDBAU-Dokument
# (Stufe 3 des Aushub-Fachmodells) ist ein Verbund mit eingeschraenkter
# Quellenliste: das gelieferte Ur-Gelaende + der Erdbau der CDE. Ins Register
# kommen beide ueber denselben Eintrag wie ein Upload — mit Herkunft.

VERBUND_PRAEFIX = "Verbund_"
ERDBAU_PRAEFIX = "Erdbau_"


def erzeugt_dateiname(o: ordner.Ordner, praefix: str, satz_name: str) -> str:
    """`<Praefix><Satz>_R<nn>.ifc` — der Registerbrauch Kanal_R01/Kanal_R02.

    Der zweite Verbund (bzw. Erdbau) desselben Satzes ist eine REVISION des
    ersten, kein neues Dokument. Dafuer muss `_basisname` den Namen wieder auf
    denselben Stamm zurueckfuehren. Das wird hier geprueft statt angenommen:
    ein Satzname, der die Konvention unterlaeuft, soll laut scheitern, nicht
    still eine neue Linie beginnen.

    Der Satzname wird hier selbst gesaeubert. `_sicherer_name` taugt dafuer
    nicht: es nimmt zuerst `Path(name).name`, und aus „Nord/Sued" wuerde „Sued" —
    der Praefix ginge mit verloren.
    """
    sauber = re.sub(r"[^A-Za-z0-9._\-äöüÄÖÜß ]+", "_", satz_name or "").strip(" ._") or "Satz"
    basis = f"{praefix}{sauber}"
    daten = manifest_lesen(o)
    geschwister = [d for d in daten["dokumente"] if _basis(d) == basis and d.get("art") == "modell"]
    revision = max((int(d.get("revision", 1)) for d in geschwister), default=0) + 1
    name = f"{basis}_R{revision:02d}.ifc"
    if _basisname(name) != basis:
        raise CdeAbgelehnt(f"der Satzname {satz_name!r} ergibt keinen eindeutigen Dateinamen ({praefix}…)")
    return name


def erzeugtes_eintragen(conn, o: ordner.Ordner, quelle: Path, *, praefix: str, satz_name: str, akteur: str,
                        herkunft: dict, aktion: str) -> dict:
    """Die GEPRUEFTE Datei aus dem Laufordner ins Register stellen.

    Verschoben, nicht kopiert: der Laufordner liegt in CDE/, also auf derselben
    Freigabe, und `os.replace` ist dort atomar. Scheitert danach der Eintrag,
    wandert die Datei zurueck — eine Datei in CDE/ ohne Registereintrag
    blockierte den naechsten Lauf desselben Namens und stuende im Explorer
    wie ein gueltiges Dokument.
    """
    quelle = Path(quelle)
    if not quelle.is_file():
        raise CdeAbgelehnt(f"erzeugte Datei fehlt: {quelle.name}")
    name = erzeugt_dateiname(o, praefix, satz_name)
    ziel = _cde_ordner(o) / name
    if ziel.exists():
        raise CdeAbgelehnt(f"{name} liegt bereits in CDE/, aber nicht im Register — bitte pruefen")
    pruefsumme = hashlib.sha256()
    groesse = 0
    kopf = b""
    with quelle.open("rb") as f:
        while chunk := f.read(CHUNK):
            if len(kopf) < KOPF_BYTES:
                kopf += chunk[:KOPF_BYTES - len(kopf)]
            pruefsumme.update(chunk)
            groesse += len(chunk)
    os.replace(quelle, ziel)
    try:
        # Das IfcProject eines Verbunds ist aus seinem Schluessel abgeleitet — dieselbe
        # Linie fuer R01, R02, …; das Erdbau-Dokument desselben Satzes hat eine andere.
        return _registriere(conn, o, name=name, sha=pruefsumme.hexdigest(), groesse=groesse,
                            art="modell", status="WIP", akteur=akteur, herkunft=herkunft, aktion=aktion,
                            projekt_global_id=_projekt_global_id_aus(kopf))
    except BaseException:
        os.replace(ziel, quelle)
        raise


def status_setzen(conn, o: ordner.Ordner, sha256: str, status: str, *, akteur: str, rolle=None) -> dict:
    if status not in STATUS:
        raise CdeAbgelehnt(f"status muss einer von {STATUS} sein")
    daten = manifest_lesen(o)
    for d in daten["dokumente"]:
        if d["sha256"] == sha256:
            if d["status"] != status:
                _pruefe_uebergang(d["status"], status, rolle)
                d["status"] = status
                d.setdefault("status_historie", []).append({"status": status, "von": akteur, "am": _jetzt()})
                _manifest_schreiben(o, daten)
                conn.rollback()
                with conn.transaction():
                    audit_schreiben(conn, akteur, "cde_status", erfolg=True,
                                    nutzlast={"projekt_id": o.id, "sha256": sha256, "status": status})
            return {**d, "vorhanden": (o.pfad / ORDNER / d["datei"]).is_file(), "pfad": f"{ORDNER}/{d['datei']}"}
    raise CdeUnbekannt(sha256)


def loeschen(conn, o: ordner.Ordner, sha256: str, *, akteur: str) -> dict:
    """Nimmt einen Eintrag aus dem Register und raeumt die Datei beiseite.

    Die Datei wird NICHT geloescht, sondern nach CDE/_geloescht/ verschoben.
    Ein CDE ist eine Ablage: was einmal geteilt wurde, soll nachvollziehbar
    bleiben. Wer wirklich nur aussortieren will, setzt den Status auf
    "Archived" — dafuer ist er da.

    Der Client rief bisher gar nichts: `useCdeStore.removeDokument` strich den
    Eintrag nur aus seiner eigenen Liste, waehrend Manifest und Datei stehen
    blieben. Genau daran liefen die beiden Register auseinander.
    """
    if not _SHA_MUSTER.match(sha256 or ""):
        raise CdeAbgelehnt("sha256 muss 64 hexadezimale Zeichen sein")
    daten = manifest_lesen(o)
    # Ein Dokument, das ein Modellsatz fuehrt, darf nicht einfach verschwinden:
    # der Satz zeigte danach ins Leere, und niemand saehe es, bis eine
    # Auswertung ein Modell weniger findet. Lieber laut abweisen und die Saetze
    # nennen — herausnehmen kann man es dort mit einem Griff.
    if (fuehrende := saetze_mit(daten, sha256)):
        raise CdeAbgelehnt("wird noch gefuehrt von: " + ", ".join(fuehrende))
    # Und ein JOURNAL, das auf Bauteile dieser Datei zeigt, zeigte danach ins
    # Leere (Stufe 4) — gefunden an 1337: ein `geloescht` auf das Gelaende einer
    # Datei, die laengst beiseite lag.
    if (journale := journale_mit(o, sha256)):
        raise CdeAbgelehnt("wird im Journal gefuehrt: "
                           + ", ".join(f"{j['ebene']} ({j['eintraege']} Eintraege)" for j in journale)
                           + " — ohne die Datei zeigten sie ins Leere; archivieren statt entfernen")
    for i, d in enumerate(daten["dokumente"]):
        if d["sha256"] == sha256:
            quelle = o.pfad / ORDNER / d["datei"]
            beiseite = None
            if quelle.is_file():
                ablage = _cde_ordner(o) / GELOESCHT
                ablage.mkdir(exist_ok=True)
                # sha im Namen: zwei gleichnamige Dateien aus verschiedenen
                # Revisionen duerfen sich hier nicht ueberschreiben.
                beiseite = ablage / f"{sha256[:12]}-{d['datei']}"
                os.replace(quelle, beiseite)
            daten["dokumente"].pop(i)
            _manifest_schreiben(o, daten)
            conn.rollback()
            with conn.transaction():
                audit_schreiben(conn, akteur, "cde_entfernen", erfolg=True,
                                nutzlast={"projekt_id": o.id, "sha256": sha256, "datei": d["datei"],
                                          "beiseite": str(beiseite.name) if beiseite else None})
            return {"ok": True, "sha256": sha256, "datei": d["datei"],
                    "beiseite": f"{ORDNER}/{GELOESCHT}/{beiseite.name}" if beiseite else None}
    raise CdeUnbekannt(sha256)


# ── Modellsaetze (Stufe 11) ─────────────────────────────────────────────────
# Der Auftrag besitzt die Dateien; ein Satz waehlt daraus aus. Fabios Bild ist
# Git: Blobs sind inhaltsadressiert und werden geteilt, ein Branch ist ein
# benannter Zeigersatz.

_SATZ_ID_MUSTER = re.compile(r"^[a-z0-9][a-z0-9\-]{0,40}$")


def _gleiche_linie(a: dict, b: dict) -> bool:
    """Meinen zwei Registereintraege DASSELBE Fachmodell? — paarweise, nicht ueber einen Schluessel.

    Die IFCPROJECT-GlobalId entscheidet, wenn BEIDE eine tragen (sie ueberlebt
    Umbenennungen); sonst Stamm und Art — die Buerokonvention, nach der auch
    die Revisionen gezaehlt werden.

    Bis 2026-09-10 war es ein SCHLUESSEL „GlobalId, sonst Stamm|Art". Seit der
    Server die GlobalId selbst liest (Stufe 4), tragen neue Eintraege eine, alte
    nicht (9 von 9) — und R01 (alt, ohne) und R02 (neu, mit) desselben Modells
    bekamen VERSCHIEDENE Linien: beide haetten im selben Satz liegen duerfen,
    und der Revisionshinweis im Viewer fand den Wechsel nicht. Gefunden beim
    Durchdenken des Rebase-Browsertests, bevor es jemanden traf.
    """
    ga, gb = a.get("projekt_global_id"), b.get("projekt_global_id")
    if ga and gb:
        return ga == gb
    return _basis(a) == _basis(b) and a.get("art") == b.get("art")


def _satz_pruefen(daten: dict, enthaelt: list[str]) -> list[str]:
    """Die zwei Invarianten. Beim SCHREIBEN geprueft, nicht beim Lesen."""
    sauber = [s for s in (enthaelt or []) if isinstance(s, str)]
    bekannt = {d["sha256"]: d for d in daten["dokumente"]}

    fehlend = [s for s in sauber if s not in bekannt]
    if fehlend:
        raise CdeAbgelehnt(f"nicht im Register: {', '.join(s[:12] for s in fehlend)}")

    # Zwei Revisionen desselben Fachmodells duerfen nicht gleichzeitig im Satz
    # liegen — sonst stuenden zwei Fassungen nebeneinander im Raum, und keine
    # Auswertung koennte sagen, welche gilt. Paarweise (`_gleiche_linie`).
    gesehen: list[dict] = []
    for s in sauber:
        d = bekannt[s]
        for f in gesehen:
            if _gleiche_linie(f, d):
                # Sagen, WORAN es erkannt wurde: bei gleicher IFCPROJECT-GlobalId und
                # verschiedenen Namen soll niemand nach einem Tippfehler suchen.
                warum = (f" (gleiche IFCPROJECT-GlobalId {d['projekt_global_id']})"
                         if f.get("projekt_global_id") and d.get("projekt_global_id") else "")
                raise CdeAbgelehnt(f"zwei Revisionen desselben Modells: {f['datei']} und {d['datei']}{warum}")
        gesehen.append(d)
    return sauber


def saetze(o: ordner.Ordner) -> list[dict]:
    """Die Saetze mit aufgeloesten Dokumenten — fuer den Waehler im Viewer."""
    daten = manifest_lesen(o)
    bekannt = {d["sha256"]: d for d in daten["dokumente"]}
    aus = []
    for s in daten["saetze"]:
        enthaelt = list(s.get("enthaelt") or [])
        aus.append({**s, "enthaelt": enthaelt,
                    "dokumente": [bekannt[x] for x in enthaelt if x in bekannt],
                    # Ein Satz kann verwaisen, wenn jemand im Explorer aufraeumt.
                    # Das gehoert gesagt, nicht verschwiegen.
                    "verwaist": [x for x in enthaelt if x not in bekannt]})
    return aus


def satz_anlegen(conn, o: ordner.Ordner, *, name: str, akteur: str,
                 zweck: str = "variante", enthaelt: list[str] | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        raise CdeAbgelehnt("der Satz braucht einen Namen")
    if zweck not in SATZ_ZWECKE:
        raise CdeAbgelehnt(f"zweck muss einer von {SATZ_ZWECKE} sein")
    daten = manifest_lesen(o)
    if any(s.get("name") == name for s in daten["saetze"]):
        raise CdeAbgelehnt(f"es gibt schon einen Satz namens {name!r}")

    satz = {"id": f"s-{uuid.uuid4().hex[:10]}", "name": name, "zweck": zweck,
            "enthaelt": _satz_pruefen(daten, enthaelt or []),
            "angelegt_am": _jetzt(), "von": akteur}
    daten["saetze"].append(satz)
    _manifest_schreiben(o, daten)
    conn.rollback()
    with conn.transaction():
        audit_schreiben(conn, akteur, "cde_satz_anlegen", erfolg=True,
                        nutzlast={"projekt_id": o.id, "satz": satz["id"], "name": name})
    return satz


def satz_aendern(conn, o: ordner.Ordner, satz_id: str, *, akteur: str,
                 name: str | None = None, zweck: str | None = None,
                 enthaelt: list[str] | None = None) -> dict:
    daten = manifest_lesen(o)
    for s in daten["saetze"]:
        if s.get("id") != satz_id:
            continue
        if name is not None:
            neu = name.strip()
            if not neu:
                raise CdeAbgelehnt("der Satz braucht einen Namen")
            if any(x.get("name") == neu and x.get("id") != satz_id for x in daten["saetze"]):
                raise CdeAbgelehnt(f"es gibt schon einen Satz namens {neu!r}")
            s["name"] = neu
        if zweck is not None:
            if zweck not in SATZ_ZWECKE:
                raise CdeAbgelehnt(f"zweck muss einer von {SATZ_ZWECKE} sein")
            s["zweck"] = zweck
        if enthaelt is not None:
            s["enthaelt"] = _satz_pruefen(daten, enthaelt)
        _manifest_schreiben(o, daten)
        conn.rollback()
        with conn.transaction():
            audit_schreiben(conn, akteur, "cde_satz_aendern", erfolg=True,
                            nutzlast={"projekt_id": o.id, "satz": satz_id})
        return s
    raise CdeUnbekannt(satz_id)


def satz_loeschen(conn, o: ordner.Ordner, satz_id: str, *, akteur: str) -> dict:
    """Nur der Satz verschwindet. Die DATEIEN bleiben — sie gehoeren dem Auftrag."""
    daten = manifest_lesen(o)
    for i, s in enumerate(daten["saetze"]):
        if s.get("id") == satz_id:
            daten["saetze"].pop(i)
            _manifest_schreiben(o, daten)
            conn.rollback()
            with conn.transaction():
                audit_schreiben(conn, akteur, "cde_satz_loeschen", erfolg=True,
                                nutzlast={"projekt_id": o.id, "satz": satz_id, "name": s.get("name")})
            return {"ok": True, "id": satz_id, "name": s.get("name")}
    raise CdeUnbekannt(satz_id)


def saetze_mit(daten: dict, sha256: str) -> list[str]:
    """Namen der Saetze, die dieses Dokument fuehren."""
    return [s.get("name") or s.get("id") for s in daten.get("saetze", [])
            if sha256 in (s.get("enthaelt") or [])]


# ── Journale, die ein Dokument fuehren (Stufe 4 des Aushub-Fachmodells) ─────

JOURNAL_KEY = "aenderungen"
_GUID_IN_IFC = re.compile(rb"#\d+\s*=\s*IFC[A-Z0-9_]+\s*\(\s*'([0-9A-Za-z_$]{22})'")


def _globalids_der_datei(pfad: Path) -> set:
    """Alle GlobalIds einer IFC-Datei — ohne ifcopenshell (der API-Server hat es nicht)."""
    try:
        return {m.decode("ascii") for m in _GUID_IN_IFC.findall(pfad.read_bytes())}
    except OSError:
        return set()


def _journal_schritte(roh) -> list:
    """Die Schritte einer Journal-Nutzlast: v2 (in Commits und Sitzung) oder v1 (flach)."""
    if isinstance(roh, list):
        return roh
    if not isinstance(roh, dict):
        return []
    if roh.get("version") == 2:
        schritte = [x for c in roh.get("commits") or [] for x in (c.get("schritte") or [])]
        return schritte + list((roh.get("sitzung") or {}).get("schritte") or [])
    return list(roh.get("eintraege") or [])


def _bezuege(schritt: dict) -> set:
    """Die GlobalIds, an denen ein Journalschritt haengt: sein Subjekt und die Quellen einer Ableitung."""
    werte = [schritt.get("globalId")]
    nachher = schritt.get("nachher")
    quellen = ((nachher.get("parameter") or {}).get("quellen") or {}) if isinstance(nachher, dict) else {}
    for v in quellen.values():
        werte.extend(v if isinstance(v, list) else [v])
    return {w for w in werte if isinstance(w, str)}


def journale_mit(o: ordner.Ordner, sha256: str) -> list[dict]:
    """Welche Journale zeigten ins LEERE, wenn dieses Dokument verschwaende? — Schwester von `saetze_mit`.

    Gemessen wird, woran das Journal wirklich haengt: die GlobalIds seiner
    Schritte (Subjekt und Quellen einer Ableitung) gegen die GlobalIds der
    Datei. Nicht `modellSha` — der nennt bis Stufe 4 das ZUERST geladene Modell,
    nicht das bearbeitete. Zaehlt nur, was danach in KEINER anderen gelieferten
    Datei des Registers mehr steht: R01 zu entfernen, waehrend R02 dieselben
    Kennungen traegt, laesst nichts ins Leere zeigen.

    @returns [{"ebene": "Auftrag" | "Satz <Name>", "eintraege": n}]
    """
    daten = manifest_lesen(o)
    d = next((x for x in daten["dokumente"] if x["sha256"] == sha256), None)
    if d is None or Path(d["datei"]).suffix.lower() != ".ifc":
        return []
    eigene = _globalids_der_datei(o.pfad / ORDNER / d["datei"])
    ablage = o.pfad / ORDNER / REPO_ORDNER
    if not eigene or not ablage.is_dir():
        return []
    je_journal = []
    for datei in sorted(ablage.glob(f"*{JOURNAL_KEY}.json")):
        teile = datei.stem.split(":")
        if teile[-1] != JOURNAL_KEY:
            continue
        try:
            roh = json.loads(datei.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        treffer = [_bezuege(x) & eigene for x in _journal_schritte(roh) if isinstance(x, dict)]
        je_journal.append((teile, [t for t in treffer if t]))
    offen = set().union(*(t for _, liste in je_journal for t in liste)) if je_journal else set()
    # Traegt eine ANDERE gelieferte Datei dieselben Kennungen, zeigt nichts ins Leere.
    for x in daten["dokumente"]:
        if not offen:
            break
        if x["sha256"] == sha256 or (x.get("herkunft") or {}).get("art") or Path(x["datei"]).suffix.lower() != ".ifc":
            continue
        offen -= _globalids_der_datei(o.pfad / ORDNER / x["datei"])
    satzname = {s.get("id"): s.get("name") or s.get("id") for s in daten.get("saetze") or []}
    aus = []
    for teile, liste in je_journal:
        n = sum(1 for t in liste if t & offen)
        if n:
            ebene = f"Satz {satzname.get(teile[1], teile[1])}" if teile[0] == "stand" and len(teile) >= 3 else "Auftrag"
            aus.append({"ebene": ebene, "eintraege": n})
    return aus


# ── Viewer-Repository (Stufe C): Schluessel -> JSON-Datei in CDE/_repo/ ─────
# Der Viewer spricht seine RepoFacade; das RemoteBackend legt jeden Schluessel
# als eigene Datei ab (atomar, kein Lost-Update zwischen Schluesseln).

REPO_ORDNER = "_repo"
MAX_REPO_BYTES = 4 * 1024 * 1024
_KEY_MUSTER = re.compile(r"^[A-Za-z0-9:_.\-]{1,160}$")


def repo_key_pruefen(key: str) -> str:
    if not _KEY_MUSTER.match(key or "") or ".." in key:
        raise CdeAbgelehnt(f"unzulaessiger schluessel {key!r}")
    return key


# ── Ablage, ordnerbasiert ───────────────────────────────────────────────────
# Eine Umsetzung, zwei Einstiege: das Projekt-Repository liegt in
# <Projekt>/CDE/_repo/, das Buero-Repository in <Buero>/CDE/_repo/. Der
# Unterschied ist NUR der Pfad — deshalb steht die Logik hier einmal und nicht
# zweimal nebeneinander (sonst driften Groessenlimit und Schluesselpruefung
# auseinander, wie es beim Wasserzeichen schon passiert ist).


def _ablage_lesen(pfad: Path) -> dict:
    if not pfad.is_dir():
        return {}
    daten = {}
    for datei in sorted(pfad.glob("*.json")):
        try:
            daten[datei.stem] = json.loads(datei.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
    return daten


def _ablage_setzen(pfad: Path, key: str, wert) -> None:
    repo_key_pruefen(key)
    text = json.dumps(wert, ensure_ascii=False)
    if len(text.encode("utf-8")) > MAX_REPO_BYTES:
        raise CdeAbgelehnt(f"wert fuer {key} groesser als {MAX_REPO_BYTES // (1024 * 1024)} MB")
    pfad.mkdir(parents=True, exist_ok=True)
    ziel = pfad / f"{key}.json"
    temp = pfad / f".tmp-{uuid.uuid4().hex}"
    try:
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, ziel)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def _ablage_loeschen(pfad: Path, key: str) -> bool:
    repo_key_pruefen(key)
    ziel = pfad / f"{key}.json"
    if not ziel.is_file():
        return False
    ziel.unlink()
    return True


# ── Projekt-Repository ──────────────────────────────────────────────────────


def _repo_pfad(o: ordner.Ordner) -> Path:
    pfad = _cde_ordner(o) / REPO_ORDNER
    pfad.mkdir(exist_ok=True)
    return pfad


def repo_lesen(o: ordner.Ordner) -> dict:
    return _ablage_lesen(o.pfad / ORDNER / REPO_ORDNER)


def repo_setzen(o: ordner.Ordner, key: str, wert) -> None:
    _ablage_setzen(_repo_pfad(o), key, wert)


def repo_loeschen(o: ordner.Ordner, key: str) -> bool:
    return _ablage_loeschen(o.pfad / ORDNER / REPO_ORDNER, key)


# ── Buero-Repository (projektuebergreifend) ─────────────────────────────────
#
# Plankoepfe, Blattformate, Linienstil-Presets, Symbolsaetze, IDS-Regelwerke
# und KG-Kennwerte sind Buerowissen, kein Projektwissen. Bisher lagen sie je
# Projekt im Repo und fingen in jedem neuen Projekt bei null an.
#
# Der Ort ist ein Geschwister von 1_Projekte auf derselben StorageBox — neben
# 0_Literatur, 2_Archiv, 3_Buchhaltung und 99_Admin. Ueber BUERO_ROOT
# ueberschreibbar, damit Tests gegen tmp_path laufen.

BUERO_ORDNER = "0_Buero"


def buero_wurzel() -> Path:
    vorgabe = str(ordner.wurzel().parent / BUERO_ORDNER)
    return Path(env("BUERO_ROOT", vorgabe))


def _buero_repo_pfad() -> Path:
    return buero_wurzel() / ORDNER / REPO_ORDNER


def buero_repo_lesen() -> dict:
    return _ablage_lesen(_buero_repo_pfad())


def buero_repo_setzen(key: str, wert) -> None:
    _ablage_setzen(_buero_repo_pfad(), key, wert)


def buero_repo_loeschen(key: str) -> bool:
    return _ablage_loeschen(_buero_repo_pfad(), key)
