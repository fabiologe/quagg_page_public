"""Das Tor: baut einen Verbund aus den echten Gruppenmodellen und prueft ihn.

EIN Aufruf, eine Zeile je Kriterium, ein Exit-Code:

    backend/app/ifc/.venv-ifc/bin/python -m app.ifc.probe

Das ist der Unterschied zwischen „gebaut" und „nachgeprueft". Solange die
Pruefung eine Befehlszeile ist, die jemand von Hand zusammensetzt, wird sie beim
dritten Mal nicht mehr gefahren — und ab dann heisst „erledigt" nur noch
„erinnert".

WAS GEPRUEFT WIRD, ist bewusst die echte Schnittstelle: die drei Lieferungen der
Gruppe, so wie sie aus BricsCAD und ProVI kamen. Zwei Schemata, zwei
Laengeneinheiten, keine Georeferenzierung. Eine selbstgebaute Eingabe wuerde
genau die Eigenschaften nicht haben, an denen der Verbund scheitern kann.

DER ZWEITE MOTOR (V09) laeuft als eigener Prozess: `node`, `web-ifc`, ein
anderer Parser. Fehlt node, wird das Kriterium als UNGEPRUEFT gemeldet — NICHT
als bestanden. Ein Tor, das bei fehlendem Werkzeug „gruen" sagt, ist schlimmer
als keines.

GESCHRIEBEN WIRD NUR ins Zielverzeichnis. Die Quellen werden ausschliesslich
gelesen; `normalisiere()` arbeitet auf einer Kopie im Speicher. Der Waechter
unten stellt trotzdem sicher, dass das Ziel weder im Repository noch auf der
StorageBox liegt — die CDE-Endpunkte schreiben sofort, und ein Probelauf, der
echte Projektdaten anfasst, ist keiner.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .pruefe import _befund, pruefe, zeichen
from .verbund import Quelle, fuehre_zusammen

REPO = Path(__file__).resolve().parents[3]
TESTDATEN = REPO / "client/src/features/cde/test"
CLIENT = REPO / "client"

GRUPPENMODELLE = [
    "BIM26_Gruppe5_BODEN_Erdarbeiten.ifc",
    "BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc",
    "IFCOUT_Entwässerung Export .IFC",
]

# Wohin NIEMALS geschrieben wird.
VERBOTEN = (TESTDATEN, Path("/mnt/storagebox"))


def _waechter(ziel: Path) -> None:
    ziel = ziel.resolve()
    for verboten in VERBOTEN:
        try:
            ziel.relative_to(verboten.resolve())
        except (ValueError, OSError):
            continue
        raise SystemExit(f"Ziel {ziel} liegt in {verboten} — dorthin schreibt der Probelauf nicht.")


def finde_node() -> str | None:
    """Das node fuer den zweiten Motor.

    Der API-Server laeuft unter pm2 ohne Login-Shell. Ob der nvm-node in seinem
    PATH steht, haengt davon ab, aus welcher Shell pm2 einmal gestartet wurde —
    heute ja (gemessen an /proc/<pid>/environ), nach einem `pm2 resurrect` aus
    systemd nicht sicher. Faende der Unterprozess dann kein node, waere V09
    „ungeprueft" und JEDER Verbund abgelehnt. Deshalb in fester Reihenfolge:
    ausdrueckliche Angabe, PATH, nvm, System.
    """
    import glob
    import os
    ausdruecklich = os.environ.get("QUAGG_NODE")
    if ausdruecklich and os.access(ausdruecklich, os.X_OK):
        return ausdruecklich
    im_pfad = shutil.which("node")
    if im_pfad:
        return im_pfad
    for muster in ("/root/.nvm/versions/node/*/bin/node", "/home/*/.nvm/versions/node/*/bin/node",
                   "/usr/local/bin/node", "/usr/bin/node"):
        treffer = sorted(glob.glob(muster))
        if treffer:
            return treffer[-1]
    return None


def umgebung_fuer_node() -> dict:
    """Die Umgebung fuer node — OHNE die IPC-Variablen, die pm2 durchsickern laesst.

    GEFUNDEN IM ERSTEN DURCHSTICH DURCH DIE PRODUKTION (2026-09-10): pm2 startet
    quagg-api mit `NODE_CHANNEL_FD=3` — sein IPC-Kanal zum Kind. Die Variable erbt
    jeder Enkel, auch dieser node. Der glaubt dann, auf Deskriptor 3 haenge ein
    Elternprozess, rechnet sauber, druckt „EINIG" und stirbt beim Beenden an
    SIGABRT (Rueckgabewert -6). V09 lehnte einen einwandfreien Verbund ab.

    Nachgestellt mit der Umgebung aus /proc/<pid>/environ: mit der Variable -6,
    ohne sie 0. Im Test-Client und im Probelauf gab es sie nicht — deshalb war
    beides gruen, und erst die Produktion zeigte es.
    """
    import os
    return {k: v for k, v in os.environ.items() if not k.startswith("NODE_CHANNEL")}


V09_TITEL = "zweiter Motor (web-ifc) sieht dasselbe"


def zweiter_motor(verbund: Path, bericht: Path) -> dict:
    """V09 — dieselbe Datei, von web-ifc gelesen.

    Der Befund entsteht ueber `pruefe._befund` wie jeder andere. Bis 2026-09-11
    stand er hier als eigenes dict, und ihm fehlten `beispiele` (in den
    Fruehausstiegen auch `zahl`) — gefunden vom Vertragstest des Berichts
    (tests/test_bericht.py), den das Berichtspanel im Client braucht.
    """
    skript = CLIENT / "scripts/verbund_webifc.mjs"
    if not skript.is_file():
        return _befund("V09", V09_TITEL, None, f"{skript} fehlt", stufe="motor", schwere="fehler")
    node = finde_node()
    if node is None:
        return _befund("V09", V09_TITEL, None, "node nicht gefunden (QUAGG_NODE, PATH, nvm, /usr/bin) — "
                       "UNGEPRUEFT, nicht bestanden", stufe="motor", schwere="fehler")
    lauf = subprocess.run([node, str(skript), str(verbund), str(bericht)],
                          cwd=CLIENT, capture_output=True, text=True, timeout=600,
                          env=umgebung_fuer_node())
    ausgabe = (lauf.stdout + lauf.stderr).strip()
    if lauf.returncode != 0:
        # Der Rueckgabewert gehoert in den Befund. Beim ersten Durchstich durch die
        # Produktion stand hier „EINIG — beide Motoren sehen dieselbe Datei" — und
        # V09 war trotzdem rot, ohne zu sagen warum. Ein Urteil, das seinem eigenen
        # Befund widerspricht, muss den Grund nennen. Negativ heisst Signal
        # (-9 = OOM-Killer, -11 = Absturz).
        signal = f", Signal {-lauf.returncode}" if lauf.returncode < 0 else ""
        ausgabe += f"\n[node {node} endete mit Rueckgabewert {lauf.returncode}{signal}]"
    return _befund("V09", V09_TITEL, lauf.returncode == 0, ausgabe[-1500:], lauf.returncode,
                   stufe="motor", schwere="fehler")


def _main(argv=None):
    p = argparse.ArgumentParser(description="Verbund bauen und pruefen — der autonome Probelauf")
    p.add_argument("--ziel", default=None,
                   help="Ausgabeverzeichnis (Vorgabe: ein Wegwerfverzeichnis)")
    p.add_argument("--behalten", action="store_true", help="Wegwerfverzeichnis nicht loeschen")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    fehlend = [n for n in GRUPPENMODELLE if not (TESTDATEN / n).is_file()]
    if fehlend:
        print(f"Gruppenmodelle fehlen in {TESTDATEN}: {fehlend}", file=sys.stderr)
        return 2

    ordner = Path(a.ziel) if a.ziel else Path(tempfile.mkdtemp(prefix="quagg-verbund-"))
    _waechter(ordner)
    ordner.mkdir(parents=True, exist_ok=True)
    verbund = ordner / "verbund.ifc"
    bericht_pfad = ordner / "bericht.json"

    begonnen = time.time()
    print(f"Verbund aus {len(GRUPPENMODELLE)} Lieferungen -> {verbund}")
    bericht = fuehre_zusammen(
        [Quelle(TESTDATEN / n) for n in GRUPPENMODELLE],
        verbund, projektname="BIM26 Gruppe5 Gesamtverbund", bearbeiter="probe",
        melde=lambda t: print(f"  .. {t}", flush=True))
    bericht_pfad.write_text(json.dumps(bericht, indent=1, ensure_ascii=False, default=str))

    print("\nQuellen:")
    for q in bericht["quellen"]:
        print(f"  {q['name'][:38]:40} {q['schema']:12} Faktor {q['einheit_faktor']:<8}"
              f" Produkte {q['produkte']:<4} uebernommen {q['uebernommen']:<4}"
              f" verworfen {q['verworfen']:<4} Stile gerettet {q['stile_gerettet']}")
        for w in q["warnungen"]:
            print(f"      WARNUNG {w}")

    print(f"\nVerbund: {bericht['entitaeten']} Entitaeten, {bericht['produkte']} Produkte, "
          f"{bericht['groesse_mb']} MB, {bericht['dauer_s']} s")

    ergebnis = pruefe(verbund)
    befunde = ergebnis["befunde"] + [zweiter_motor(verbund, bericht_pfad)]

    print("\nPruefung:")
    offen = 0
    ungeprueft = 0
    for x in befunde:
        # Gezaehlt wird nur, was sperrt (Schwere "fehler"): ein Hinweis "keine IDS
        # hinterlegt" ist kein ungeprueftes Kriterium.
        z = zeichen(x)
        if z == "?   ":
            ungeprueft += 1
        elif z == "FEHL":
            offen += 1
        print(f"  [{z}] {x['id']:5} {x['titel']}")
        if x["ok"] is not True:
            for zeile in str(x["sagt"]).splitlines()[:10]:
                print(f"           {zeile}")

    print(f"\n{offen} Verstoss(e), {ungeprueft} ungeprueft, gesamt {time.time()-begonnen:.0f} s")
    if a.json:
        print(json.dumps({"bericht": bericht, "befunde": befunde}, indent=1,
                         ensure_ascii=False, default=str))
    if not a.behalten and not a.ziel:
        shutil.rmtree(ordner, ignore_errors=True)
    else:
        print(f"Dateien bleiben in {ordner}")

    # Ungeprueft ist NICHT bestanden: ein fehlendes Werkzeug muss den Lauf
    # rot machen, sonst meldet das Tor Erfolg fuer etwas, das es nie angesehen hat.
    return 1 if (offen or ungeprueft) else 0


if __name__ == "__main__":
    sys.exit(_main())
