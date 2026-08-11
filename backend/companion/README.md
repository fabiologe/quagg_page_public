# quagg Local Companion — Rechnen auf der Nutzer-Maschine

Alles in diesem Ordner läuft **nicht auf unserem Server, sondern beim
Nutzer**. Der Companion ist der Brückendienst zwischen Browser und der
lokalen Docker-Engine: Eine Web-Seite darf weder `docker run` ausführen
noch auf die Platte schreiben — der Companion tut beides und spricht dabei
dasselbe HTTP-Protokoll wie unser Server-Backend.

Er bedient **beide** Solver, deshalb liegt er hier und nicht mehr unter
`app/api/flood2D/` (Stand 2026-07-31):

| Engine     | Auslöser                    | Rechen-Image                        | Datenort (Volume)     |
|------------|-----------------------------|-------------------------------------|-----------------------|
| `lisflood` | Flood2D, Rechenort „Lokal"  | `fabiologe/lisflood_acc_modi:local` | `quagg-flood2d-data`  |
| `openfoam` | flood-3D, Rechenort „Lokal" | `fabiologe/quagg-foam-local:latest` | `quagg-flood3d-data`  |

## Wo die Läufe liegen

**Getrennte Volumes je Engine** (ab v1.4.0). Grund: Ein OpenFOAM-Lauf
schleppt Netz *und* alle Zeitschritte mit sich — schon ein 3-Sekunden-
Testfall belegte 103 MB, echte Nachweise gehen in die GB. LISFLOOD-
Ergebnisse sind dagegen klein. Getrennt heißt: getrennt aufräumbar, und
ein Schwung 3D-Läufe verdrängt keine 2D-Ergebnisse (`KEEP_RUNS` gilt je
Ordner).

Im Container (Normalfall beim Nutzer):

```
quagg-flood2d-data  -> /data     ->  /data/runs/<job>/…
quagg-flood3d-data  -> /data3d   ->  /data3d/runs/<job>/…
```

Nativ (Companion als reines Python): `…/quagg/flood2d/runs` bzw.
`…/quagg/flood3d/runs` — unter Windows in `%LOCALAPPDATA%`, auf macOS in
`~/Library/Application Support`, sonst `~/.local/share`.

Ein Laufordner enthält:

| Pfad                    | Inhalt                                            |
|-------------------------|---------------------------------------------------|
| `inputs/`               | was der Browser geschickt hat (2D: .par/.dem, 3D: `case.zip`) |
| `case/`                 | **nur 3D**: der entpackte OpenFOAM-Fall — hier liegen die Zeitschritt-Ordner und `log.*`, das ist der Platzfresser |
| `fields/`, `figures/`   | **nur 3D**: aufbereitete Felder und Berichtsbilder |
| `results/`              | was der Browser abholt (2D: Frames, 3D: `artifacts.zip`) |
| `manifest.json`         | Status und Ereignisse, überlebt Neustarts         |

Zum Server zurück geht **nur** `results/` — beim Testfall 1 MB statt
103 MB. Die Rohdaten bleiben auf der Maschine des Nutzers.

## Dateien

| Datei                        | Zweck                                            |
|------------------------------|--------------------------------------------------|
| `quagg_local_companion.py`   | der Dienst selbst (nur Standardbibliothek)       |
| `Dockerfile`                 | Companion als Image (`fabiologe/quagg-companion`) |
| `release.sh`                 | baut **beide** Images und pusht sie auf Docker Hub |
| `test_companion_e2e.py`      | Companion als Subprozess, echter LISFLOOD-Lauf   |
| `test_companion_docker.py`   | Companion im Container (Sibling-Modus)           |

Die Nutzer-Skripte (`install-…`, `update-…`) liegen bewusst woanders:
unter `client/public/downloads/`, weil sie über die Web-App
heruntergeladen werden.

## Wo welches Image gebaut wird

Der **Companion** wird hier gebaut. Die **Rechen-Images** gehören zu ihrem
Feature und werden dort gebaut:

- `app/api/flood2D/engines/docker/` → LISFLOOD-Solver
- `app/api/flood3D/engines/local/` → OpenFOAM + flood3D-Nachlaufkette
  (`local_runner.py` importiert den flood3D-Core, deshalb liegt es dort)

`release.sh` ist die Klammer: Es baut und pusht Companion **und**
OpenFOAM-Image und prüft danach, ob die Version auf dem Hub wirklich zum
Quelltext passt.

## Bildname

Das Companion-Image heißt **`fabiologe/quagg-companion:latest`**. Früher
lag es unter `fabiologe/lisflood_acc_modi:companion` — ein Name aus der
Zeit, als der Dienst nur Flood2D bediente. Die Update-Skripte räumen das
alte Image beim ersten Lauf weg; der Container heißt unverändert
`quagg-companion`.

Nicht verwechseln: `fabiologe/lisflood_acc_modi:local` ist weiterhin das
**Solver**-Image für Flood2D und bleibt so.

## Veröffentlichen

```bash
cd backend/companion
docker login          # einmalig
bash release.sh
```

**Ohne Push passiert beim Nutzer nichts.** Die Installer- und
Update-Skripte ziehen immer vom Docker Hub — ein nur lokal gebautes Image
wird dabei sogar überschrieben. Genau daran ist v1.3.0 zuerst gescheitert.

## Fallen, die uns schon getroffen haben

- **`.bat` braucht CRLF.** Mit Unix-LF blinkt das cmd-Fenster auf und
  stirbt wortlos, ohne je `pause` zu erreichen. `.sh`/`.command` bleiben LF.
- **Sibling-Modus:** Läuft der Companion selbst im Container, startet er
  den Solver als *Geschwister* über den gemounteten Docker-Socket. Dessen
  `-v`-Pfade interpretiert der **Host**-Daemon — Container-Pfade wären dort
  bedeutungslos. Deshalb teilen sich beide das benannte Volume
  `quagg-flood2d-data` (`QUAGG_SIBLING_VOLUME`).
- **Antwortformat nicht anfassen:** Ein LISFLOOD-Job muss weiterhin
  `{"engine": "local"}` liefern — `RunpodBackend.js` wertet das Feld aus.
  Neue Engines bekommen eigene Kennungen (`local-openfoam`).
- **Snap-Docker auf dem Server sieht `/tmp` des Hosts nicht.** Testdaten
  gehören nach `backend/data/`, nicht nach `/tmp`.
