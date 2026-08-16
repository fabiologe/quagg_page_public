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
Endpunkten (`flood3D/gate.py::schreib_gate`) — so ist auch der nächste neue
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
- Gefragt wird beim **Öffnen eines Falls** (vorhersehbarer Moment). Vorher
  löste die automatische Entwurfsvorschau die Abfrage aus — mitten im
  Zeichnen, und bei Abbruch blieb ein roter Balken „nichts gestartet"
  stehen, der neben einem völlig regulär gestarteten Lauf wie ein Leck im
  Schutz aussah (2026-08-12). Ein Gate-403 der Vorschau ist jetzt ein
  gelber Hinweis, und gleiche Meldungen stapeln sich nicht mehr.
- **Prüfung von außen** (jederzeit wiederholbar):
  `curl -X POST -d '{"case_id":"…"}' https://quagg-engineering.org/FastAPI/flood3d/runs`
  → 403, mit falschem `X-Launch-Password` ebenfalls 403.

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
- Kerne **lokal** (Companion): **alle Kerne der Nutzer-Maschine, kein Deckel**
  (seit 2026-08-11; vorher 8). Vorgabe möglich über `FLOOD3D_CORES` bzw. den
  Altnamen `QUAGG_FOAM_CORES` — die reicht der Companion ab v1.5.1 als `-e`
  in den Container (`docker run` vererbt seine Umgebung sonst nicht).
  **Verteilung:** Der Companion läuft beim Nutzer als Docker-Image
  (`fabiologe/quagg-companion`, seit 2026-08-12 als `:1.5.1` und `:latest`
  auf Docker Hub). Aktualisieren beim Nutzer:
  `docker pull fabiologe/quagg-companion:latest`, dann den Container neu
  erzeugen (`docker rm -f quagg-companion` + `docker run …` wie in
  `backend/companion/Dockerfile` dokumentiert) — ein `restart` genügt NICHT,
  der nimmt das alte Image. Kein
  RAM-Limit: der Container läuft ohne `--memory`; unter Docker Desktop
  (Windows/Mac) begrenzt allein die VM-Zuteilung in dessen Einstellungen.
  Ab v1.5.1 setzt der Companion außerdem `--shm-size=2g`, sonst scheitert
  mpirun bei vielen Rängen an den 64 MB `/dev/shm` der Docker-Voreinstellung.
- Timeout Netzvorschau: 20 min (`FLOOD3D_MESH_TIMEOUT`); die Solver-Laufzeit
  deckelt je Cloud-Job `max_laufzeit_s` (RunPod executionTimeout).
- Kostensatz: `FLOOD3D_POD_CORE_PRICE` (Default 0,033 €/vCPU-h, RunPod-Liste)
  — Schätzung vor dem Lauf und Ist-Kosten im Manifest rechnen damit.
  (`FLOOD3D_CORE_PRICE`/`FLOOD3D_SOLVE_TIMEOUT`/Server-`FLOOD3D_CORES` sind
  mit dem Server-Rechenort entfallen.)
- **Die Netzvorschau rechnet mit 2 Rängen** (`FLOOD3D_PREVIEW_RANKS`),
  das Produktionsnetz überall mit 8 festen Rängen (`FLOOD3D_MESH_RANKS`).
- Verwaiste Container: beim API-Start räumt ein Wächter alle `f3d_*` ab
  (nach Neustart wartet auf keinen Container mehr jemand). Von Hand:
  `docker ps -a --filter name=f3d_` / `docker rm -f <name>`.
- Laufender Serverlauf: Abbrechen über den Knopf im Lauf-&-Log-Panel
  (Status wird `abgebrochen`). Beim Cloud-Lauf geht derselbe Knopf an
  RunPods `/cancel`.
- **Log-Panel beim Cloud-Lauf**: Es gibt keinen lokalen Fallordner, solange
  gerechnet wird — `GET /runs/{id}/log` fällt deshalb auf den Ereignisstrom
  `log.runpod` zurück und übersetzt ihn lesbar. Ohne das stand dort
  „keine Logausgabe" (gemeldet 2026-08-12).

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
- **Relay-Wiederanknüpfung (seit 2026-08-13):** Beim API-Start übernimmt
  der Server alle Cloud-Läufe mit `origin=runpod` und nicht-terminalem
  Status wieder (Job-ID aus dem Manifest) — `pm2 restart` mitten im
  Cloud-Lauf ist damit unkritisch. Unbekannter Job → ehrlich `failed`.
- **R2-Putzrunde** (stündlich, `FLOOD3D_R2_PUTZ_S`): Transit-Waisen
  (eingang/checkpoints/artifacts + Worker-Ablagen) älter als
  `FLOOD3D_R2_MAX_ALTER_H=24` und ohne lebenden Lauf werden gelöscht —
  R2 ist NUR Transit.
- **Auto-Archiv** (alle `FLOOD3D_ARCHIV_S=21600` s): fertige Läufe älter
  als `FLOOD3D_ARCHIV_TAGE=14` wandern automatisch auf die StorageBox;
  StorageBox nicht eingehängt → stiller Durchlauf.
- **Nachzügler-Import (Client):** War der Browser beim Laufende weg, holt
  die App beim nächsten Öffnen fertige Companion-Ergebnisse automatisch
  nach (done-Manifest des Companion + Server-Status `lokal` als Riegel).
- **Speicherpunkte gelten auch LOKAL, und der Browser ist nur noch
  Zuschauer** (seit 2026-08-12 abends): das Bundle trägt zwei vorsignierte
  S3-URLs (Teilstände + Endergebnis), der Läufer lädt beides hoch, und ein
  **Server-Wächter** gleicht alle 2 min (`FLOOD3D_SWEEP_S`) alle Läufe im
  Zustand `lokal` mit S3 ab — Tab wechseln, in die Ergebnisse gehen, Browser
  zumachen: der Lauf kommt trotzdem vollständig an. Der Browser-Weg
  (checkpoint-Ereignis → `POST /runs/{id}/teilstand`) bleibt als schnellster
  Kanal bestehen; die Antriebsschleife übersteht Hintergrund-Drosselung
  jetzt auch selbst (150 Wackler Toleranz).
- **Speicherpunkte (seit 2026-08-12):** Cloud-Läufe sichern alle 10 min
  (`checkpoint_s` im Startaufruf übersteuert) die fertigen Zeitschritte nach
  S3; der Server spielt sie sofort ein — Raum (3D) zeigt sie WÄHREND des
  Laufs, und bei Timeout/Absturz bleibt alles bis zum letzten Punkt erhalten.
- **Falle für den Relay:** RunPod meldet auch bei einem gescheiterten Handler
  `status: COMPLETED` — der Fehler steht nur im Feld `error` der
  `/status`-Antwort. Der Relay darf einen Lauf also NICHT am Status als
  erfolgreich verbuchen, sondern nur an einem `done`-Event mit `artifactsUrl`.
- S3-Werte am Endpunkt hinterlegt (2026-08-12) — der Worker meldet „Ablage: S3".
- Relay (`engines/runpod/relay.py`) und Rechenort „RunPod (Cloud)" im
  Simulations-Panel sind gebaut: `POST /runs` mit `{"ort": "runpod"}`.
  Der Server packt das Bundle (dasselbe wie für den Companion, `core/bundle.py`),
  legt es in R2 ab, verfolgt den Job und übergibt `artifacts.zip` dem
  vorhandenen Import — die Ergebnisphase merkt keinen Unterschied.
- **Erster echter Cloud-Lauf 2026-08-12 — zwei Funde:**
  1. `/stream` liefert je Abfrage **nur die NEUEN** Ereignisse, nicht den
     ganzen Strom. Ein Index-Zeiger darauf verschluckt fast alles.
  2. `os.cpu_count()` meldet im Container die Kerne der **Maschine**, nicht
     das Kontingent — mpirun startete viel mehr Ränge als Kerne zugeteilt
     sind. `local_runner.erlaubte_kerne()` fragt jetzt zusätzlich
     `sched_getaffinity` und die cgroup-Quote ab und nimmt das Kleinste.
  3. Der Lauf endete an `executionTimeout exceeded` (Voreinstellung ~600 s)
     — am Endpunkt steht jetzt 4 h.
- **Cloud-Lauf läuft (2026-08-12).** `cloudtest_r002` (Kopie der
  Verifikation, 2 s, 20.896 Zellen) auf 16 vCPU: **175 s, 0,03 €**, Felder,
  Abbildungen und Bewertung automatisch importiert, R2 danach leer geräumt.
  Zum Vergleich vor der Kernzahl-Korrektur: 0,33 s simulierte Zeit in 532 s.
- Kostensatz: `FLOOD3D_POD_CORE_PRICE` (0,033 €/vCPU-h; RunPod berechnet
  0,036 $ je vCPU-Stunde auf JEDER Stufe — mehr Kerne kosten nicht mehr,
  solange der Solver sie ausnutzt). Faustregel interFoam: 20–50k Zellen je
  Kern, darunter frisst der Austausch den Gewinn.

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

## Leerlauf-Fall (seit 2026-08-16)

Ein Leerlauf endet nicht zu einer bekannten Zeit, sondern in einem
Zustand. Dafuer gibt es `solver.abbruch` (optional — fehlt es, laeuft
alles wie bisher bis `end_time`):

```yaml
solver:
  end_time: 3600          # ab jetzt: OBERGRENZE, grosszuegig setzen
  initial_level: 96.20    # Startwasserspiegel (oder Vorfuellungen)
  abbruch:
    art: stagnation
    fenster_s: 30         # Beobachtungsfenster
    schwelle: 0.01        # zulaessige Volumen-SPANNE im Fenster (1 % von V_start)
    mindest_abfall: 0.05  # Anlaufsperre: erst 5 % muessen abgelaufen sein
    erwartete_dauer_s: 600  # NUR fuer Schaetzung/Budget — bitte setzen!
```

- Gemessen wird die **Spanne** des Restvolumens im Fenster, nicht die
  Differenz der Endpunkte: eine schwappende Restwelle liefert sonst
  zufaellig gleiche Endwerte und der Lauf endet mitten in der Bewegung.
- Die **Anlaufsperre** ist keine Feinheit: vor dem Anspringen des
  Auslasses steht das Wasser still — ohne sie endet der Lauf bei t = 0.
- Der Waechter sitzt im Runner (`engines/local/local_runner.py`,
  `LeerlaufWaechter`) und schreibt `stopAt writeNow` in die controlDict —
  derselbe weiche Hebel wie die Pause, kein Kill. Gilt damit identisch
  auf der Nutzer-Maschine und in der Cloud (beide fahren diesen Runner).
- **`erwartete_dauer_s` bitte immer setzen.** Ausgabegitter und
  Kostenschaetzung rechnen sonst mit der Obergrenze und vergroebern das
  Feldgitter unnoetig — genau dort, wo die Laubkarten Aufloesung brauchen.
- Das Manifest sagt hinterher, warum der Lauf endete: `ende_grund`
  (`leerlauf`/`zeit`), `ende_zeit`, `ende_text`.

### Laubkarten: ein Leerlauf-/Schwall-Paar aufsetzen

1. **Gleiches Netz** fuer beide Laeufe — der Verschnitt der Karten geht
   zellweise. Kontrolle: gleicher `netz_hash` in beiden Manifesten (die
   Laufauswahl im Laubkarten-Reiter filtert danach).
2. **Leerlauf**: Anfangswasser (`initial_level` oder Vorfuellungen),
   kein Dauerzufluss, `abbruch` wie oben.
3. **Schwall**: Zufluss ueber `BcInflowHydrograph` (CSV-Ganglinie).
4. **Feldausgabe fein genug** — die Laubkarten verfolgen Laub auf der
   Wasseroberflaeche, deshalb zaehlt nicht die Zahl der Ausgaben, sondern
   das Advektions-CFL: `write_interval_fields ≤ 0,5 · dx / u_max`
   (dx = `mesh.base_cell`). Gemessen an Rentrich_BetaTest08: 0,5 m Zelle
   und 0,5 m/s Oberflaechengeschwindigkeit ergeben bei 1 s Ausgabe ein
   CFL von rund 1 — ein Tracer springt dann je Ausgabe ueber eine ganze
   Zelle, und genau die Rezirkulationen, in denen sich Laub sammelt,
   fehlen in den Daten. Das Laubkarten-Panel misst das nach und sagt es.
5. **Gleiches Ausgaberaster.** Der gleiche `netz_hash` genuegt NICHT: das
   Viz-Gitter folgt einem Datenbudget und haengt damit an Laufdauer und
   `write_interval_fields`. Zwei Laeufe auf demselben Netz koennen
   verschieden fein ausgegeben sein — dann meint dieselbe Zellnummer in
   beiden einen anderen Ort. Das Panel prueft das nach dem Laden und
   verweigert den Verschnitt mit Begruendung.
6. Sohlschubspannung liegt flaechig nur auf dem `terrain`-Patch vor —
   Bauwerksflaechen bleiben auf Karte B leer.

**Beim Ablesen von Karte A** (zwei Eigenschaften des Verfahrens, die
regelmaessig fuer Fehler gehalten werden):

- Das Laub liegt auf dem **Konvergenzsaum**, nicht im Tiefpunkt. Wo die
  Oberflaechengeschwindigkeit gegen null geht, bleibt ein Tracer stehen —
  er wandert nicht weiter bis zur tiefsten Stelle. Am Testfall gemessen:
  Saum 3,2…3,8-fache Belegung, Mitte der Senke 1,0…1,4.
- Laub in **Restpfuetzen** zaehlt mit. Die Strandungsregel greift nur auf
  trockenfallendem Boden; Wasser, das nicht ablaeuft, haelt seine Tracer
  in Bewegung. Am Laufende werden sie dort eingefroren, wo sie schwimmen,
  und getrennt ausgewiesen („in Restpfuetzen"). Ohne das blieben
  ausgerechnet die Senken leer.

## Speicher und Datenmenge (2026-08-15 hart gelernt)

- **Prozessgrenzen** stehen in `/etc/systemd/system/pm2-root.service.d/override.conf`
  (gilt fuer ALLE pm2-Dienste zusammen): `MemoryHigh=3G` (weich, drosselt),
  `MemoryMax=4G` (hart). Aendern + `systemctl daemon-reload` wirkt SOFORT,
  ohne die Dienste neu zu starten. Vorher stand dort 1 GiB — ein einziger
  langer Lauf hat den API-Prozess reihenweise vom OOM-Killer erschiessen
  lassen, waehrend nur die Ergebnisse angesehen wurden.
- **Ebenfalls in der Datei** (aelter, bewusst pruefen wenn es klemmt):
  `CPUQuota=50%` = eine HALBE CPU fuer alle pm2-Dienste, und
  `LimitNOFILE=100` = nur 100 offene Dateien.
- **Zwischendatei je Lauf** (`normalized.parquet`): Solver-Diagnostik wird
  seit 2026-08-15 beim Extrahieren verdichtet — `FLOOD3D_DIAG_PUNKTE`
  (Vorgabe 20.000) Punkte je Reihe, mit Maximum/Minimum/Endwert exakt
  erhalten; `solverInfo` schreibt im Serien-Takt statt jeden Zeitschritt.
  Aus 77 MB werden damit 1,5-3 MB. ALTE Laeufe behalten ihre grossen
  Dateien — die Endpunkte lesen sie stapelweise und ausgeduennt.
- **Regel fuer neuen Code in der API:** nie eine ganze Datei laden.
  Stroemend oder stapelweise lesen (`iter_batches`, zeilenweise), schwere
  Auswertungen in `asyncio.to_thread`, und Caches nur mit ausgeduennten
  Ergebnissen. Zwei Tests wachen darueber (`test_router.py`).

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

## Geometrie-Stände (seit 2026-08-13)

- Ein Stand ist eine benannte VOLLKOPIE des Fallordners unter
  `cases/<id>/staende/<stempel>_<name>/` — ohne `derived/mesh_preview/`
  (MB-schwere Ableitung) und ohne die Stände selbst. Gemessen an
  Rentrich_Beta07: 43 MB Fall → **0,69 MB Stand in 0,4 s**.
- Warum Vollkopie und nicht nur die Spec: `sculpt.npz` (Pinsel) wird bei
  jedem Strich unter demselben Namen überschrieben, gedrehte Raster
  tragen einen Stempel aus der Gittergeometrie, nicht aus dem Inhalt.
  Ein Spec-Schnappschuss zeigt nach dem Zurückholen auf fremde Daten.
- **Laden sichert immer vorher automatisch** („vor Laden von X",
  Quelle `auto`, die letzten 5 bleiben) — der Sprung ist umkehrbar.
  Dabei fliegt `derived/mesh_preview/` weg: die Vorschau gehörte zur
  ersetzten Geometrie.
- Wiederherstellen ohne Werkzeug: `cp -r staende/<id>/* .` im Fallordner
  (stand.json ignorieren).
- **Jeder Lauf sichert seine Geometrie** nach `runs/<id>/spec/`
  (case.yaml + Datenreferenzen, < 1 MB) und trägt `case_hash`/`netz_hash`
  ab dem START im Manifest (vorher nur im Ergebnis → gescheiterte Läufe
  hatten keine). Daraus macht „Geometrie als Stand" einen Stand im Fall.
  Läufe von vor diesem Datum haben kein `spec/` — der Knopf bleibt dort
  aus (HTTP 409 mit Erklärung).

## Daten & Backup

- `backend/app/api/flood3D/data/` ist NICHT in git (~150 MB): `cases/`
  (Quellen: case.yaml + imports/ + staende/), `runs/` (Ergebnisse),
  `archiv/` (BetaTest01/02, altes Layout), `verifikation/`.
- **Backup-Minimum**: je Fall `case.yaml` + `imports/` sichern — alles unter
  `derived/` ist reproduzierbar (Reapply), Läufe sind neu rechenbar.
  Einfachster Weg: `tar czf flood3d-cases-$(date +%F).tgz -C backend/app/api/flood3D/data cases`
  (klein, da ohne derived/-STLs nur Quelltexte). Noch ohne Automatik —
  bewusst offener Punkt.

## Physikalische Verifikation

- `FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest app/api/flood3D/tests/test_verifikation.py -q`
  (im backend/-Ordner). Rechnet seit Stage B auf dem ECHTEN Rechenort
  RunPod (16 Threads, ~17 min, ~0,1 €, 2-h-Deckel je Job) — die
  Kreditkarten-Sperre der Testsuite hat dafür genau eine Ausnahme:
  `FLOOD3D_VERIFIKATION=1` lässt die Zugangsdaten stehen. Nach jeder
  Änderung an casebuilder/meshgen/solids und vor jedem Release/Tag
  ausführen. Nur EINEN Treiber starten (gleiche run_id + gleiche
  R2-Schlüssel — zwei parallele Treiber zerschießen sich gegenseitig).
- Ergebnis: Karte „Physikalische Verifikation" in der Phase Simulation;
  der Lauf selbst ist als Projekt `verifikation-wehr` im Werkzeug anwählbar.
- Referenz: C_d = 0,644 ± 10 % (eingefroren 2026-08-11, damals Server
  4 Kerne). Auf RunPod mit dem deterministischen 8-Ränge-Netz bestätigt
  2026-08-13: identische Netz-Identität (20.896 Zellen · 847b909fb0b3),
  C_d = 0,6326 — im Band. Zweite Schranke Literaturband 0,50–0,80.

## Releases

- Stand taggen: `git tag -a flood3d-vX.Y -m "..."` auf dem Merge-Commit;
  aktueller Stand: `flood3d-v1.0-beta`. Push von master/Tags ist bewusst
  Handarbeit (Fabio entscheidet, was auf GitHub geht).
