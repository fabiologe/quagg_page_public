# Betriebsnotiz flood-3D

Stand: 2026-08-11 (Tag `flood3d-v1.0-beta`) · Für den Server-Alltag; Fachliches
steht in der Spezifikation, offene Punkte im Fahrplan.

## Dienste

| Was | Wie |
|---|---|
| Backend (FastAPI) | **PM2**, Prozess `quagg-api`, Port 8001 — Neustart: `pm2 restart quagg-api`. Nach JEDER Backend-Codeänderung nötig (Python ist geladen). `quagg-internal.service` (systemd) ist ein anderer, kaputter Prozess — ignorieren. |
| Frontend Dev | Fabios vite-Dev-Server auf :3000 — **niemals `pkill -f vite`**. HMR zieht Client-Änderungen selbst. |
| Frontend Prod | quagg-engineering.org ist ein STATISCHER dist-Build — ohne `npm run build` (baut nach `dist_neu`, dann atomarer Tausch) ändert sich dort nichts. Vor dem Build RAM/Platte prüfen. |
| Health | `GET /FastAPI/flood3d/health` → `{status, runs}` |

## Kosten-Gate (seit 2026-08-12 scharf)

flood-3D steht öffentlich im Netz. Gesperrt ist seit 2026-08-12 **jede
schreibende Anfrage** (POST/PUT/PATCH/DELETE) — Rechnen *und* Ändern:
Lauf starten, Netzvorschau, Bundle, Fall anlegen/speichern/drehen, Kuren,
Rezepte, Importe, Löschen, Archivieren. **Lesen bleibt frei**: Ansehen
kostet nichts, und eine Ergebnisansicht soll ohne Hürde teilbar bleiben.

Die Sperre hängt als Abhängigkeit am **Router**, nicht an 22 einzelnen
Endpunkten (`core/gate.py::schreib_gate`) — so ist auch der nächste neue
Endpunkt geschützt, ohne dass jemand daran denken muss.

- Passwort: `FLOOD3D_LAUNCH_PASSWORD` in `backend/.env`, ersatzweise
  `FLOOD2D_LAUNCH_PASSWORD` (gleiches Publikum, gleiche Rechnung).
- **Ohne konfiguriertes Passwort wird gesperrt, nicht geöffnet** (503). Ein
  vergessener Eintrag darf nicht zum offenen Scheunentor werden.
- `FLOOD3D_GATE_OFF=1` hebt es ausdrücklich auf (Tests, Entwicklung);
  `tests/conftest.py` setzt das für die Suite.
- Übergabe: Kopfzeile `X-Launch-Password` (alle Endpunkte) oder Feld
  `launchPassword` im Rumpf (wie flood-2D; der Rumpf wird nur bei kleinem
  JSON angefasst — Datei-Uploads laufen in 100-MB-Stücken durch dieselbe
  Abhängigkeit).
- Der Client fragt **einmal je Browser-Sitzung** (`sessionStorage`): vorab
  bei den teuren Aktionen, sonst erst wenn der Server 403 sagt — dann wird
  gefragt und der Aufruf **automatisch wiederholt**. Dadurch scheitert auch
  ein Aufrufort nicht stumm, der die Kopfzeile nicht selbst setzt.
- Unterschied zu flood-2D: dort steht eine Kopie des Passworts **im
  Client-Bundle** und ist für jeden Besucher lesbar. Bei flood-3D entscheidet
  allein der Server.
- Nach dem Ändern des Passworts: `pm2 restart quagg-api` (die .env wird beim
  Start gelesen) — ein Client-Neubau ist NICHT nötig.

## Rechnen (OpenFOAM im Docker)

- Image **Server**: `opencfd/openfoam-run:2406` (Env `FLOOD3D_OF_IMAGE`).
- Image **lokal**: `fabiologe/quagg-foam-local:latest` — gebaut `FROM`
  demselben `opencfd/openfoam-run:2406`, legt nur Python + unseren Core
  obendrauf (dort läuft der Läufer *im* Container). Gegenübergestellt am
  2026-08-11: identische Basis-Schichten (5/5), v2406, OpenMPI 4.1.6,
  gleicher Werkzeugsatz — **kein Unterschied im Solver**.
- **Beide Seiten müssen dieselbe Ausgabe fahren.** Sonst liefert derselbe
  Fall je nach Rechenort andere Zahlen und die eingefrorene Verifikation
  (C_d) gilt nur noch für eine Seite. Abgesichert durch:
  `core/foam.py::FOAM_API_ERWARTET` (eine Stelle), Tests gegen
  `FLOOD3D_OF_IMAGE` **und** gegen das `FROM` im Local-Dockerfile, und
  jeder Lauf schreibt die tatsächlich gerechnete Ausgabe aus dem Log-Kopf
  ins Manifest (`foam`), sichtbar im Lauf-&-Log-Panel. Beim Anheben also:
  Dockerfile, `OF_IMAGE`, `FOAM_API_ERWARTET` gemeinsam — und
  Verifikation neu laufen lassen.
- Kerne **Server**: `FLOOD3D_CORES` (Default 4, gedeckelt auf die CPU-Zahl) —
  die Maschine ist geteilt, sie darf nicht vollgelaufen werden.
- Kerne **lokal** (Companion): **alle Kerne der Nutzer-Maschine, kein Deckel**
  (seit 2026-08-11; vorher 8). Vorgabe möglich über `FLOOD3D_CORES` bzw. den
  Altnamen `QUAGG_FOAM_CORES` — die reicht der Companion ab v1.5.1 als `-e`
  in den Container (`docker run` vererbt seine Umgebung sonst nicht). Kein
  RAM-Limit: der Container läuft ohne `--memory`; unter Docker Desktop
  (Windows/Mac) begrenzt allein die VM-Zuteilung in dessen Einstellungen.
  Ab v1.5.1 setzt der Companion außerdem `--shm-size=2g`, sonst scheitert
  mpirun bei vielen Rängen an den 64 MB `/dev/shm` der Docker-Voreinstellung.
- Timeouts: Vernetzung 20 min (`FLOOD3D_MESH_TIMEOUT`), Solver 2 h
  (`FLOOD3D_SOLVE_TIMEOUT`).
- Kostensatz: `FLOOD3D_CORE_PRICE` (Default 0,05 €/Kern-h) — Schätzung vor dem
  Lauf und Ist-Kosten im Manifest rechnen damit.
- **Netzvorschau rechnet seriell auf 1 Kern**; nur der Solverlauf nutzt alle
  Kerne (mpirun). Ein voller Lauf zeigt ~400 % CPU — das ist Absicht.
- Verwaiste Container: beim API-Start räumt ein Wächter alle `f3d_*` ab
  (nach Neustart wartet auf keinen Container mehr jemand). Von Hand:
  `docker ps -a --filter name=f3d_` / `docker rm -f <name>`.
- Laufender Serverlauf: Abbrechen über den Knopf im Lauf-&-Log-Panel
  (Status wird `abgebrochen`).

## Rechenort RunPod (im Aufbau)

Dritter Rechenort neben Server und Nutzer-Maschine. Der Worker ist die
Klammer um denselben `local_runner.py`: `case.zip` rein (Bundle), Ereignisse
als NDJSON raus, `artifacts.zip` nach R2, Server importiert wie bei einem
lokalen Lauf.

- Image: **`fabiologe/quagg-foam-runpod:2406`** (Docker Hub, 454 MB komprimiert),
  gebaut aus `engines/runpod/Dockerfile` `FROM fabiologe/quagg-foam-local`.
  Neu bauen aus `backend/app/api/`:
  `docker build -f flood3D/engines/runpod/Dockerfile -t fabiologe/quagg-foam-runpod:2406 .`
- **Endpunkt-Einstellungen** (RunPod-Konsole → Serverless → New Endpoint → CPU):

  | Feld | Wert | Warum |
  |---|---|---|
  | Container Image | `fabiologe/quagg-foam-runpod:2406` | fester Tag, nicht `latest` |
  | Instance | CPU, compute-optimized, **16 vCPU** | interFoam skaliert über mpirun; der Läufer nimmt ohne Vorgabe alle Kerne |
  | Container Disk | **≥ 30 GB** | Netz + alle Zeitschritte eines Laufs |
  | Min Workers | **0** | Flex: keine Kosten im Leerlauf |
  | Max Workers | 1 (später mehr) | ein Lauf zur Zeit reicht zum Einfahren |
  | Idle Timeout | 5 s | Worker soll nach dem Lauf sofort abfallen |
  | **Execution Timeout** | **aus bzw. ≥ 4 h** | Voreinstellung (Minuten) würde jeden CFD-Lauf abschneiden — der wichtigste Schalter |
  | Env Vars | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX=flood3d` | Werte aus `backend/.env.r2.flood3d` (eigener R2-Bucket, Entscheidung 2026-08-12) |

- In `backend/.env` (angelegt 2026-08-12): `FLOOD3D_POD_ENDPOINT=6nu16dktu7oejc`
  und `FLOOD3D_POD_API_KEY=rpa_…` — **eigene Namen**, `RUNPOD_ENDPOINT_ID`/
  `RUNPOD_API_KEY` gehören flood-2D. Die Schlüssel sind endpunkt-gebunden: der
  2D-Schlüssel bekommt am 3D-Endpunkt 403 und umgekehrt. Keine Leerzeichen um
  das `=` — sonst heißt die Variable `FLOOD3D_POD_API_KEY ` und wird nie gefunden.
- R2-Bucket: **`flood-3d`** (eigener Bucket, Zugangsdaten in
  `backend/.env.r2.flood3d`, nicht versioniert). Access Key ID + Secret gibt es
  NUR beim Anlegen des Tokens zu sehen: R2 → *Manage R2 API Tokens* → *Create
  API Token* → Object Read & Write, auf `flood-3d` beschränkt. Der dort ebenfalls
  angezeigte „Token value" ist der Cloudflare-API-Token und für S3 unbrauchbar.
- **Rauchtest 2026-08-12 bestanden**: Job angenommen (3,8 s Anlauf, warmer
  Worker), Worker-Log kam im Strom an, absichtlich kaputtes `case.zip` führte
  zu sauberen `error`-Events und Exit 1.
- **Falle für den Relay:** RunPod meldet auch bei einem gescheiterten Handler
  `status: COMPLETED` — der Fehler steht nur im Feld `error` der
  `/status`-Antwort. Der Relay darf einen Lauf also NICHT am Status als
  erfolgreich verbuchen, sondern nur an einem `done`-Event mit `artifactsUrl`.
- Noch offen: S3-Umgebungsvariablen am Endpunkt hinterlegen (der Worker meldet
  sonst „Ablage: inline" und kann nur Fälle < 8 MB annehmen — ein echtes Bundle
  mit Geländeraster ist größer), dann Relay im Backend (Bundle → R2 → `/run` →
  `/stream` → Import) und die dritte Option im Rechenort-Feld.

## Läufe auslagern (StorageBox)

Läufe sind der einzige Teil, der unbegrenzt wächst (100–200 MB je Lauf);
Fälle sind zusammen 19 MB und bleiben lokal.

- Ziel: **`/mnt/storagebox/flood3d-runs/<run_id>/`** (CIFS-Automount, 1 TB,
  `FLOOD3D_ARCHIV_ROOT` übersteuert den Pfad).
- Lokal bleiben `manifest.json`, `result.json` und die Marke
  `archiviert.json` — Liste, Zustand und Bewertung funktionieren damit ohne
  Netz. Felder, Abbildungen, Fallordner und `normalized.parquet` wandern.
- Knöpfe in der Laufliste: **📦 auslagern**, **📥 zurückholen**; Chip
  „archiviert". `GET /archiv` zeigt Stand und Kandidaten (Vorgabe: fertig und
  älter als 14 Tage), bewegt aber nichts. Beide Aktionen liegen hinter dem
  Kosten-Gate.
- **Erst kopieren, gegenprüfen (Dateizahl UND Bytes), dann lokal löschen.**
  Bricht die Übertragung ab, bleibt der Lauf lokal unangetastet — dafür gibt
  es einen eigenen Test.
- **Nicht auf der Freigabe RECHNEN.** Gemessen 2026-08-12: 147 MB/s bei großen
  Dateien, aber viele kleine sind 30× langsamer als lokal (200 Dateien 0,83 s
  statt 0,028 s) — ein OpenFOAM-Lauf schreibt zehntausende. Dazu ist sie
  `soft` eingehängt: Netzstörung = E/A-Fehler statt Warten, eine Stunde
  Rechenzeit wäre weg.
- Echter Durchlauf 2026-08-12 (`Rentrisch_BetaTest06_r002`, 110 MB):
  auslagern 1,9 s, zurückholen 0,9 s, Inhalt byteidentisch.

## Bekannte Deckel (bewusst)

| Deckel | Wert | Wo |
|---|---|---|
| Visualisierungsgitter | 1,5 M Zellen / 4 GB | foamfields (Selbsttest-Abweichung steht im Laufmanifest) |
| Erdkörper-Vorschau + STL-Export | 120 000 Rasterknoten | router (`koerper_zu_gross` bzw. 413) |
| Rechen-Porositätszone | 0,15 m Tiefe | casebuilder `_SCREEN_ZONE_TIEFE` — Kirschmer-f ist DARAUF normiert |
| Mesh-Preview | 1 gleichzeitige je Fall (409 sonst) | router `_laufende_previews` |

## Fallen (mehrfach real getroffen)

- **Snap-Docker + /tmp**: Pfade unter /tmp werden LEER in den Container
  gemountet — Arbeitsverzeichnisse immer neben die Daten legen.
- **Endpunkte schreiben**: auch harmlos aussehende Mutations-Endpunkte
  speichern die case.yaml neu — nie an echten Fällen testen, vorher kopieren.
- `_Model` hat `extra="forbid"`: Felder aus der casespec entfernen heißt,
  dass ALTE case.yaml nicht mehr laden (deshalb bleiben die toten
  Conventions-/Meta-Felder drin, siehe Audit-T4-Vermerk).

## Daten & Backup

- `backend/app/api/flood3D/data/` ist NICHT in git (~150 MB): `cases/`
  (Quellen: case.yaml + imports/), `runs/` (Ergebnisse), `archiv/`
  (BetaTest01/02, altes Layout), `verifikation/` (Referenz-Ergebnisse).
- **Backup-Minimum**: je Fall `case.yaml` + `imports/` sichern — alles unter
  `derived/` ist reproduzierbar (Reapply), Läufe sind neu rechenbar.
  Einfachster Weg: `tar czf flood3d-cases-$(date +%F).tgz -C backend/app/api/flood3D/data cases`
  (klein, da ohne derived/-STLs nur Quelltexte). Noch ohne Automatik —
  bewusst offener Punkt.

## Physikalische Verifikation

- `FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest app/api/flood3D/tests/test_verifikation.py -q`
  (im backend/-Ordner; ~1 h auf 4 Kernen). Nach jeder Änderung an
  casebuilder/meshgen/solids und vor jedem Release/Tag ausführen.
- Ergebnis: Karte „Physikalische Verifikation" in der Phase Simulation;
  der Lauf selbst ist als Projekt `verifikation-wehr` im Werkzeug anwählbar.
- Referenz: C_d = 0,644 ± 10 % (eingefroren 2026-08-11), zweite Schranke
  Literaturband 0,50–0,80.

## Releases

- Stand taggen: `git tag -a flood3d-vX.Y -m "..."` auf dem Merge-Commit;
  aktueller Stand: `flood3d-v1.0-beta`. Push von master/Tags ist bewusst
  Handarbeit (Fabio entscheidet, was auf GitHub geht).
