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

  geprueft   gebaut UND jedes Kriterium bestanden — der Server traegt ein
  abgelehnt  gebaut, aber mindestens ein Kriterium verfehlt ODER ungeprueft —
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

from .probe import zweiter_motor
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
            eigenbau_bericht = baue_datei(
                paket, eigen, schluessel=f"{auftrag.get('schluessel') or 'verbund'}/eigenbau")
            # Was NICHT ins Paket kam (misslungen, leer, ausgeblendet), gehoert in den
            # Bericht — ein Export, der still weniger enthaelt als die Ansicht, waere
            # eine falsche Aussage ueber den Stand.
            nicht_drin = {k: paket.get(k) for k in ("misserfolge", "leer", "verborgen") if paket.get(k)}
            if nicht_drin:
                eigenbau_bericht = {**eigenbau_bericht, "nicht_im_paket": nicht_drin}
            quellen.append(Quelle(eigen, name="CDE-Eigenbau", sha256=hashlib.sha256(roh).hexdigest()))
        bericht = fuehre_zusammen(
            quellen, verbund,
            projektname=auftrag.get("projektname") or "Verbundmodell",
            crs=auftrag.get("crs"),
            schluessel=auftrag.get("schluessel") or "verbund",
            bearbeiter=auftrag.get("bearbeiter") or "", melde=melde,
            nachbearbeiten=nachbearbeiten)
        if eigenbau_bericht is not None:
            bericht["eigenbau"] = eigenbau_bericht
        bericht["werkzeug"] = f"ifcopenshell {ifcopenshell.version}"
        # Der zweite Motor vergleicht gegen diesen Bericht — er muss vorher stehen.
        schreibe_json(bericht_pfad, bericht)

        melde("pruefen: Schema und Verbundregeln")
        befunde = pruefe(verbund)["befunde"]
        melde("pruefen: zweiter Motor (web-ifc)")
        deckel_aufheben()
        befunde.append(zweiter_motor(verbund, bericht_pfad))

        offen = [b for b in befunde if b["ok"] is not True]
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
