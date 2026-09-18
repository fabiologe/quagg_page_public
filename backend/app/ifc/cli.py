"""Der Verbund als eigener Prozess — vom API-Server gestartet, nie in ihm gerechnet.

WARUM EIN EIGENER PROZESS, drei gemessene Gruende:

  * ifcopenshell lebt nur in `.venv-ifc`, nicht im Produktions-venv (siehe README).
  * uvicorn faehrt mit workers=1. Ein Merge im API-Prozess blockierte den EINZIGEN
    Arbeiter fuer die ganze Dauer — gut zwei Minuten bei den drei Gruppenmodellen.
  * nginx bricht /FastAPI/ nach 60 s ab. Der Server nimmt deshalb nur den Auftrag
    an (202) und liest spaeter ab, was dieser Prozess hinterlassen hat.

DER VERTRAG MIT DEM SERVER liegt vollstaendig im Laufordner
`<Projekt>/CDE/_verbund/<lauf_id>/` — nichts im Speicher, damit ein Neustart des
Servers keinen Befund verliert:

  auftrag.json   vom Server: quellen, projektname, schluessel, bearbeiter
  status.json    von BEIDEN, immer atomar geschrieben: zustand, schritt, pid, ...
  bericht.json   von hier: Messwerte des Verbunds und alle Pruefbefunde
  verbund.ifc    von hier
  log.txt        von hier: eine Zeile je Schritt, im Fehlerfall der Stapel

Zustaende:  wartet (Server) -> laeuft -> geprueft | abgelehnt | fehler

  geprueft   gebaut UND kein SPERRENDES Kriterium verfehlt (Schwere "fehler",
             `pruefe.offen`) — der Server traegt ein. IDS-Warnungen und Hinweise
             stehen im Bericht, halten den Verbund aber nicht auf
  abgelehnt  gebaut, aber mindestens ein sperrendes Kriterium verfehlt ODER ungeprueft —
             oder die Quellen lassen keinen richtigen Verbund zu (verschiedene
             Bezugssysteme, keine Landeskoordinaten)
  fehler     nicht gebaut

„Ungeprueft" zaehlt als nicht bestanden. Fehlt dem Prozess etwa `node` fuer den
zweiten Motor, wird der Verbund abgelehnt, nicht durchgewunken: ein Tor, das bei
fehlendem Werkzeug gruen zeigt, ist schlimmer als keines.

Aufruf (der Server tut das; von Hand geht es genauso):
    backend/app/ifc/.venv-ifc/bin/python -m app.ifc.cli <laufordner>
"""
import hashlib
import json
import os
import resource
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import ifcopenshell

from . import herkunft as H
from .probe import zweiter_motor
from .pruefe import offen as ist_offen
from .pruefe import pruefe
from .verbund import Quelle, VerbundUnmoeglich, fuehre_zusammen

# Der Deckel fuer den Adressraum. Der Server reicht ihn per Umgebung herein; der
# Prozess setzt ihn SELBST als erste Handlung. Der naheliegende Weg —
# `preexec_fn` beim Start — ist in einem Server mit Threadpool nicht sicher
# (die Python-Dokumentation warnt ausdruecklich: Verklemmung moeglich).
SPEICHER_VORGABE_MB = 3072


def jetzt() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def lies_json(pfad: Path) -> dict:
    try:
        return json.loads(pfad.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def schreibe_json(pfad: Path, daten: dict) -> None:
    """Atomar: der Server liest status.json, waehrend hier geschrieben wird."""
    temp = pfad.with_name(f".{pfad.name}.tmp-{os.getpid()}")
    temp.write_text(json.dumps(daten, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(temp, pfad)


def deckel_setzen() -> int | None:
    """RLIMIT_AS aus `IFC_SPEICHER_MB`. Ein unlesbarer Wert faellt auf die Vorgabe."""
    try:
        mb = int(os.environ.get("IFC_SPEICHER_MB", SPEICHER_VORGABE_MB))
    except ValueError:
        mb = SPEICHER_VORGABE_MB
    if mb <= 0:
        return None                               # ausdruecklich abgeschaltet
    grenze = mb * 1024 * 1024
    # Nur die WEICHE Grenze; die harte bleibt, damit `deckel_aufheben` sie vor
    # dem zweiten Motor wieder anheben kann.
    _weich, hart = resource.getrlimit(resource.RLIMIT_AS)
    if hart != resource.RLIM_INFINITY:
        grenze = min(grenze, hart)
    resource.setrlimit(resource.RLIMIT_AS, (grenze, hart))
    return mb


def deckel_aufheben() -> None:
    """Den Deckel vor dem zweiten Motor wieder anheben (weich bis hart).

    GEFUNDEN IM ERSTEN LAUF UEBER DEN SERVER: node erbt den Deckel, und V8
    reserviert fuer WebAssembly-Speicher weit mehr ADRESSRAUM, als es belegt.
    web-ifc brach mit „Out of memory: Cannot allocate Wasm memory for new
    instance" ab, und V09 lehnte einen einwandfreien Verbund ab. Im Probelauf
    ohne Deckel lief derselbe Vergleich gruen. Der Deckel ist fuer ifcopenshell
    gedacht; der zweite Motor hat seinen eigenen, von wasm32 ohnehin auf 4 GB
    begrenzten Speicher.
    """
    _weich, hart = resource.getrlimit(resource.RLIMIT_AS)
    resource.setrlimit(resource.RLIMIT_AS, (hart, hart))


def speicher() -> dict:
    """Spitzenwerte dieses Prozesses.

    VmPeak ist der ADRESSRAUM — genau die Groesse, die RLIMIT_AS deckelt. Wer den
    Deckel nach dem RSS bemisst, setzt ihn zu knapp: ifcopenshell bildet grosse
    Bibliotheken in den Speicher ab, die nie resident werden.
    """
    werte = {"rss_max_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)}
    try:
        for zeile in Path("/proc/self/status").read_text().splitlines():
            if zeile.startswith(("VmPeak:", "VmHWM:")):
                name, wert = zeile.split(":", 1)
                werte[f"{name.lower()}_mb"] = round(int(wert.split()[0]) / 1024)
    except OSError:
        pass
    return werte


def _dokument_pruefen(ordner: Path, auftrag: dict, bericht_pfad: Path, status: dict, melde) -> None:
    """Modus "pruefe": EIN Dokument aus dem Register durch das Tor — kein Verbund.

    Derselbe Vertrag wie beim Verbund (auftrag/status/bericht im Laufordner),
    dieselben Stufen, derselbe zweite Motor. Anders ist das Urteil: eine
    Lieferung gehoert dem Planer. Die Verbundregeln melden (Schwere "warnung"),
    und der Zustand ist "geprueft", sobald der Bericht steht — auch mit
    Verstoessen. Das Register traegt ihn ein; WIP -> Shared verlangt, dass er
    DA ist, nicht dass er gruen ist.
    """
    datei = Path(auftrag["datei"])
    if not datei.is_file():
        raise ValueError(f"{datei.name} liegt nicht im Register-Ordner")
    melde("pruefen: Syntax, Schema, Regeln, Anforderungen")
    ids = [ordner / n for n in auftrag.get("ids") or []]
    ergebnis = pruefe(datei, ids=ids, verbund=False)
    bericht = {"modus": "pruefe", "datei": datei.name, "sha256": auftrag.get("sha256"),
               "werkzeug": H.werkzeug(), **(ergebnis.get("zaehlung") or {})}
    # Der zweite Motor vergleicht gegen diesen Bericht — er muss vorher stehen.
    schreibe_json(bericht_pfad, bericht)
    melde("pruefen: zweiter Motor (web-ifc)")
    deckel_aufheben()
    befunde = ergebnis["befunde"] + [zweiter_motor(datei, bericht_pfad)]
    offen = [b for b in befunde if ist_offen(b)]
    bericht.update(befunde=befunde, verstoesse=len(offen), speicher=speicher())
    schreibe_json(bericht_pfad, bericht)
    status.update(zustand="geprueft", verstoesse=len(offen), offen=[f"{b['id']} {b['titel']}" for b in offen])


def _angabe(auftrag: dict, paket: dict | None, schluessel: str) -> str:
    """Eine Angabe aus dem Ausgeben-Dialog (Fahrplan Klare Ablaeufe, S4 neu): Autor, Organisation.

    Der neue Server legt sie in den Auftrag; solange er nicht neu gestartet ist,
    reist sie im Eigenbau-Paket mit. Leer heisst: wie bisher.
    """
    wert = auftrag.get(schluessel) or (paket or {}).get(schluessel) or ""
    return str(wert).strip()[:200]


def lauf(ordner: Path) -> int:
    ordner = Path(ordner)
    auftrag = lies_json(ordner / "auftrag.json")
    status_pfad = ordner / "status.json"
    status = {**lies_json(status_pfad), "zustand": "laeuft", "schritt": "beginnt",
              "pid": os.getpid(), "gestartet": jetzt()}
    status["speicherdeckel_mb"] = deckel_setzen()
    schreibe_json(status_pfad, status)

    log = (ordner / "log.txt").open("a", encoding="utf-8")

    def melde(text: str) -> None:
        log.write(f"{jetzt()}  {text}\n")
        log.flush()
        status["schritt"] = text
        schreibe_json(status_pfad, status)

    verbund = ordner / "verbund.ifc"
    bericht_pfad = ordner / "bericht.json"
    try:
        if (auftrag.get("modus") or "verbund") == "pruefe":
            # Ein einzelnes Registerdokument durch das Tor (Stufe 4b) — kein Verbund.
            _dokument_pruefen(ordner, auftrag, bericht_pfad, status, melde)
        else:
            if not auftrag.get("quellen"):
                raise ValueError("auftrag.json nennt keine Quelle")
            quellen = [Quelle(**q) for q in auftrag["quellen"]]
            # DIE HAKEN LAUFEN IMMER (Stufe 2/3 des Aushub-Fachmodells). Ein
            # Erdbau-Dokument aus dem Register bringt seine Aushuebe mit — deren
            # Wirte sind schon geschlossen (`schon_da`), aber seine Vorgaenge kennen
            # Rohre und Bauwerke erst im Verbund. Ohne Eigenbau und ohne
            # Erdbau-Dokument finden beide nichts und kosten nichts.
            from .eigenbau import baue_datei, vorgaenge_schliessen_in, wirte_herstellen_in
            nachbearbeiten = [("wirte", wirte_herstellen_in), ("vorgaenge", vorgaenge_schliessen_in)]
            eigenbau_bericht = None
            paket = None
            paket_pfad = ordner / "eigenbau.json"
            if paket_pfad.is_file():
                # Der CDE-Eigenbau (app/ifc/eigenbau.py) wird zu einer GEWOEHNLICHEN
                # Quelle: eine eigene IFC-Datei, die durch denselben Verbund und
                # dieselbe Pruefung geht wie jede Lieferung. Erst im Verbund liegen
                # Aushub und Ur-Gelaende nebeneinander — deshalb schliesst dort ein
                # Haken die Wirt-Beziehungen (IfcRelVoidsElement).
                melde("CDE-Eigenbau als Quelle bauen")
                roh = paket_pfad.read_bytes()
                eigen = ordner / "eigenbau.ifc"
                paket = json.loads(roh)
                # Das Geruest heisst nach dem Satz DES AUFTRAGS (Fahrplan Erdbau-Container,
                # Stufe 2) — nicht nach dem, was der Browser gerade als Projekt fuehrte.
                eigenbau_bericht = baue_datei(
                    paket, eigen, schluessel=f"{auftrag.get('schluessel') or 'verbund'}/eigenbau",
                    projektname=f"{auftrag.get('satz_name') or 'Satz'} (CDE-Eigenbau)",
                    ablage=auftrag.get("ablage"),
                    bearbeiter=_angabe(auftrag, paket, "autor"), firma=_angabe(auftrag, paket, "organisation"))
                # Was NICHT ins Paket kam (misslungen, leer, ausgeblendet, weggelassen), gehoert in den
                # Bericht — ein Export, der still weniger enthaelt als die Ansicht, waere
                # eine falsche Aussage ueber den Stand.
                nicht_drin = {k: paket.get(k) for k in ("misserfolge", "leer", "verborgen", "ausgelassen") if paket.get(k)}
                if nicht_drin:
                    eigenbau_bericht = {**eigenbau_bericht, "nicht_im_paket": nicht_drin}
                quellen.append(Quelle(eigen, name="CDE-Eigenbau", sha256=hashlib.sha256(roh).hexdigest()))
            bericht = fuehre_zusammen(
                quellen, verbund,
                projektname=auftrag.get("projektname") or "Verbundmodell",
                crs=auftrag.get("crs"),
                schluessel=auftrag.get("schluessel") or "verbund",
                # S4 neu: der Autor aus dem Ausgeben-Dialog; ohne ihn wie bisher der Anmeldename.
                bearbeiter=_angabe(auftrag, paket, "autor") or auftrag.get("bearbeiter") or "",
                firma=_angabe(auftrag, paket, "organisation"), melde=melde,
                nachbearbeiten=nachbearbeiten, ablage=auftrag.get("ablage"))
            if eigenbau_bericht is not None:
                bericht["eigenbau"] = eigenbau_bericht
            # verbund | erdbau — derselbe Lauf, dasselbe Tor; nur Quellenliste und
            # Dateiname unterscheiden sich, und die entscheidet der Server.
            bericht["modus"] = auftrag.get("modus") or "verbund"
            bericht["werkzeug"] = H.werkzeug()
            # Der zweite Motor vergleicht gegen diesen Bericht — er muss vorher stehen.
            schreibe_json(bericht_pfad, bericht)

            melde("pruefen: Schema, Verbundregeln, Anforderungen")
            # IDS-Dateien legt der Server in den Laufordner (`auftrag.ids`, Namen relativ).
            ids = [ordner / n for n in auftrag.get("ids") or []]
            # Mit dem Eigenbau-Paket: V10 sperrt, was der Eigenbau nicht bauen konnte
            # (Fahrplan Erdbau-Container, Stufe 1) — in beiden Modi, verbund und erdbau.
            befunde = pruefe(verbund, ids=ids, paket=paket)["befunde"]
            melde("pruefen: zweiter Motor (web-ifc)")
            deckel_aufheben()
            befunde.append(zweiter_motor(verbund, bericht_pfad))

            # Sperrend ist nur Schwere "fehler" — EINE Stelle (pruefe.offen).
            offen = [b for b in befunde if ist_offen(b)]
            bericht.update(befunde=befunde, verstoesse=len(offen), speicher=speicher())
            schreibe_json(bericht_pfad, bericht)
            status.update(zustand="abgelehnt" if offen else "geprueft", verstoesse=len(offen),
                          offen=[f"{b['id']} {b['titel']}" for b in offen])
    except VerbundUnmoeglich as urteil:
        # Kein Programmfehler, sondern ein Urteil ueber die Daten: die Quellen
        # lassen keinen RICHTIGEN Verbund zu. Der Grund steht im Status.
        log.write(f"{jetzt()}  abgelehnt: {urteil}\n")
        status.update(zustand="abgelehnt", fehler=str(urteil), offen=[str(urteil)])
    except Exception as fehler:                  # noqa: BLE001 — jeder Fehler gehoert in den Status
        log.write(traceback.format_exc())
        status.update(zustand="fehler", fehler=f"{type(fehler).__name__}: {fehler}")
    status.update(schritt="fertig", beendet=jetzt(), speicher=speicher())
    schreibe_json(status_pfad, status)
    log.close()
    return 0 if status["zustand"] == "geprueft" else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Aufruf: python -m app.ifc.cli <laufordner>", file=sys.stderr)
        sys.exit(2)
    sys.exit(lauf(Path(sys.argv[1])))
