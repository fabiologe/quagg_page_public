# Audit Code-Qualität flood-3D — Befunde und Aufräum-Fahrplan

Stand 2026-08-13. Drei parallele Erkundungen (Backend, Client,
Querschnitt) über den kompletten flood-3D-Bestand:
`backend/app/api/flood3D` (28.252 Zeilen Python, davon 10.056 Tests)
und `client/src/features/flood-3D` (18.389 Zeilen, davon 1.577 Tests).

**Gesamtbild in einem Satz:** Der Fachkern ist gesund — die Nähte sind
Spaghetti, und an zwei Stellen ist die Drift der kopierten Nähte schon
zu echten Bugs geworden.

---

## Was gut ist (und nicht angefasst werden soll)

- **~430 monkeypatch-freie Geometrie-/Preprocessing-Tests** auf
  `tests/synthetic_case.py`: Spec bauen, echten Code rechnen lassen,
  Zahlen prüfen. Das ist das Rückgrat des Werkzeugs.
- **`core/store.py` `RunPaths`**: die Lauf-Ablage als eingefrorene
  Dataclass — der richtige Umgang mit Pfaden, konsequent benutzt.
- **`GET /cases/{id}/schema` → `setzeSchema()`**: der Client behandelt
  das Pydantic-Schema als Wahrheit, Fallback nur als Netz, gepinnt durch
  `test/schemaEnums.test.js`. Der einzige selbstheilende Vertrag im
  System — Vorbild für alle anderen.
- **Services-Grenze im Client**: null `fetch`/`axios` außerhalb von
  `services/` — sämtliches HTTP an einem Ort.
- **`core/conventions.py`** als einzige Quelle für Größen/Komponenten.

---

## Live Bugs (heute falsch, Stufe 0)

### B1 — Cloud-Fortschritt steht auf None: `ev.get("t")` statt `time`
`engines/runpod/relay.py:193` liest `ev.get("t")` — der Runner sendet
aber `time=` (`engines/local/local_runner.py:527`). Folge: bei **jedem
frischen RunPod-Lauf** bleibt `manifest.letzte_zeit` durchgehend `None`;
erst nach einem API-Neustart übernimmt der Reattach-Zwilling
(`relay.py:287`), der korrekt `ev.get("time")` liest. Das Log-Panel
parst `log.runpod` selbst und ist deshalb unauffällig — genau darum ist
es nie aufgefallen. Der Zwilling beweist zugleich die Ursache:
kopierte Schleife, zwei Hand-Edits, Drift.

### B2 — Toter Default `ort = 'server'` (HTTP 410)
`services/api.js:184` und `stores/usePreStore.js:712` haben als Default
den seit Stage B abgeschafften Server-Rechenort (`router.py:1568` →
410). Nur weil `SimulationPanel.vue:340` explizit `'runpod'` übergibt,
knallt es nicht. Der nächste Aufrufer ohne Argument bricht.

---

## Blocker (Zeitbomben, Stufen 1–4)

### Z1 — Container-Landmine `core/gate.py`, ohne Wächter
`core/gate.py:25` importiert `fastapi`, `:27` `from ...flood2D.env_util`
— beides existiert im Container nicht (dort ist `flood3D` Top-Level und
fastapi nicht installiert). Trotzdem verschifft `core/bundle.py:92` per
`copytree` den GESAMTEN `core/`-Baum in jedes `case.zip` und jedes
Image. Überlebt nur, weil den Modul dort zufällig niemand lädt; ein
einziges `from .gate import …` irgendwo im erreichbaren Core-Graph
killt jeden Außenlauf sofort. **Kein Test wacht über den
Bundle-Vertrag** — der einzige existierende (`test_runpod_worker.py:198`)
prüft Quelltext-Substrings, nicht Importierbarkeit.

### Z2 — manifest.json: 7 Schreiber, 3 Threads, kein Lock
Sieben unabhängige Read-Modify-Write-Implementierungen
(`router.py:1607/1891/1745/1793/2023`, `core/runner.py:375`,
`local_runner.py:964`), davon laufen drei **gleichzeitig in
verschiedenen Threads** auf derselben Datei (Relay-Thread alle ~5 s,
S3-Wächter alle 120 s, Reattach-Thread). Nicht atomar, kein Lock —
letzter Schreiber gewinnt, Felder verschwinden still. Der
`_upload.zip`-Sentinel (`router.py:1787`) ist der Beweis, dass diese
Race schon einmal zugeschlagen hat und lokal gepflastert wurde.

### Z3 — ~220 Zeilen Totcode in `core/runner.py`
`run_pipeline` (`core/runner.py:419`, 187 Zeilen) hat **null Aufrufer**
seit der Server-Rechenort 410 liefert; transitiv tot: `_write_manifest`,
`geschriebene_zeiten`, `durchsatz_je_kern`, der Parallel-Zweig. Acht
Env-Variablen (`FLOOD3D_CORES`, `FLOOD3D_CORE_PRICE`,
`FLOOD3D_SOLVE_TIMEOUT`, …) sehen lebendig aus, steuern aber nichts
mehr — `BETRIEB_FLOOD3D.md:92` dokumentiert eine davon als maßgeblich.

### Z4 — `validate_case`: EINE Funktion, 1096 Zeilen
`core/validate.py:125` — 83 % der Datei ist eine Funktion mit ~40
Prüffamilien ohne Dispatch. Das schlechteste Einzelartefakt im Baum.

### Z5 — Import-Zyklus Relay↔Router + privates `_r2()`
`relay.py:337` importiert `read_manifest`/`run_paths`/`runs_root` aus
dem **Router**, der Router importiert `relay.r2_aufraeumen` — echter
Zyklus, nur durch Lazy-Imports am Leben. Grotesk: zwei der drei Symbole
sind pure Re-Exports aus `core/store.py`. Zusätzlich zieht der Router
an 4 Stellen (`router.py:1441/1553/1766/2005`) das private
`relay._r2()` und macht selbst S3-I/O — R2-Wissen lebt in zwei Layern.

### Z6 — Client: God-Components, 0 Komponententests, WebGL-Leaks
- `Editor3D.vue` **1879 Z.** (44 Funktionen, 17 refs, 10 watches; die
  Auslagerung nach `components/pre/editor/*.js` existiert, ist aber auf
  halber Strecke stehengeblieben), `Raum3DPanel.vue` **1501 Z.** (u. a.
  ein 21-Quellen-`deep`-Watch auf die 200-Zeilen-`updateScene()`),
  `PropertyPanel.vue` 934, `GrundrissPanel.vue` 894.
- **Null Komponententests** — kein einziges `mount()` im ganzen Feature;
  die sechs größten .vue-Dateien (6.449 Z., 35 % des Codes) sind blind.
  `usePreStore` (819 Z., der zentrale Zustand): ungetestet.
- **Leaks:** `Raum3DPanel` räumt die vtk-Pipeline beim Unmount nicht
  (jeder Tab-Wechsel Raum→Grundriss→Raum leckt); `ImportModal` disposed
  STL-Geometrien nicht (jeder Import-Durchgang lässt die vorherigen im
  GPU-Speicher); nirgends `forceContextLoss()` — WebGL-Kontexte (Limit
  ~8–16) werden bei Dialog-/Phasenwechseln aufgezehrt.

---

## Duplikate, die bereits driften (die Spaghetti-Mechanik)

| Duplikat | Wo | Drift schon da? |
|---|---|---|
| Stream-Folge-Schleife | `relay.py:168–238` vs. `:270–323` (Ähnlichkeit 0,71) | **JA — Bug B1** + fehlender meshing-Zweig |
| FOAM-Pipeline | `core/runner.py:419–605` (tot) vs. `local_runner.py:660–1015` (lebendig) | JA — netz_tor und Checkpoints nur in einer Kopie |
| manifest-`melde()` | 7 Stellen (s. Z2) | JA — eine Kopie serialisiert anders |
| Laufnummern-Vergabe | `router.py:1598` vs. `:1426` | TOCTOU-Race |
| Run-Polling | 3 Panels, je eigenes `setInterval` | Intervalle 8000/5000/5000 |
| Statusliterale | 4 Client-Stellen + Kopie von `ARCHIVIERBAR` | — |
| Formatter (Zahl/Bytes/Dauer/EUR) | 5+ lokale Definitionen statt `utils/labels.js` | — |
| Grenzwerte | `grenzwerte.js` vs. `evaluate.py`/`meshgen.py` — obwohl jeder Befund sein `grenze`-Feld schon mitschickt | `RunLogPanel.vue:127` umgeht beide mit nacktem 0.05 |
| .env-Parser | `relay._datei_env` vs. `flood2D/env_util._load` | zwei Caches, gleiche Bugs 2× fixen |

**Das Muster dahinter:** Kopieren statt teilen, dann divergieren die
Kopien unbeobachtet. Jeder Fahrplan-Schritt unten löscht eine
Drift-QUELLE, nicht nur einen Drift-Befund.

---

## Weitere Hindernisse

- **Env-Wildwuchs:** 23 `FLOOD3D_*`-Variablen über **3 Lesemechanismen**.
  Die per rohem `os.environ` gelesenen (15 Stück, u. a. `MESH_RANKS`,
  `RUNS_ROOT`, alle Wächter-Intervalle) sind unter PM2 aus
  `backend/.env` **nicht setzbar** — die Doku behauptet das Gegenteil.
  5 Variablen sind nirgends dokumentiert; viele werden zur Importzeit
  eingefroren.
- **Threads ohne Koordination:** 4 Startup-Hooks, unbegrenzt viele
  Lauf-/Reattach-Threads, 5 globale Container — **null Locks im ganzen
  Baum** (`grep Lock` → 0 Treffer). Reattach und S3-Wächter können
  denselben Lauf doppelt importieren.
- **85 breite `except Exception`** (9 davon völlig stumm), 4
  Exception-Vokabulare; die zwei Pipeline-Kopien werfen für denselben
  Fehler verschiedene Typen.
- **Doku-Drift:** `AUDIT_FLOOD3D_DEAD_ENDS.md` führt 3 längst gefixte
  Bugs als offen; `TESTRUNDE_FLOOD3D.md` testet den abgeschafften
  Serverlauf; `BETRIEB_FLOOD3D.md:107` nennt RunPod „im Aufbau".
- **17 Funktionen > 90 Zeilen** (Spitze: 1096/500/356);
  ~120 funktionslokale Imports verstecken echte Zyklen
  (casebuilder↔anschluss, validate↔casebuilder).
- Kleinkram: `utils/labels.js` fehlen `tracer` + 3 Target-Kinds;
  `services/api.js:244 archivStand()` unbenutzt; 6 tote Exporte in
  `importRollen.js`; `make_beispiele.py` (176 Z.) referenzlos.

**Bewusst NICHT auf dem Fahrplan:** Sprachmix Deutsch/Englisch in
Bezeichnern (Umbenennen = reine Churn ohne Sicherheitsgewinn),
`on_event`→`lifespan` (erst beim FastAPI-Upgrade), Vereinheitlichung
von `env_util` mit flood2D (fasst flood2D an — separater Entscheid).

---

# Developer-Fahrplan: der Umbau, Pipeline für Pipeline

Vier Fragen an jede Pipeline: **Was ist ihr Nutzen? Was ist ihr Ziel?
Was ist zu komplex für den Nutzen? Wie wird konkret umgebaut?**
Grundregel des ganzen Umbaus: kein Verhalten ändern außer den benannten
Bugs — die Suiten (607 pytest / 126 vitest) sind das Tor jeder Welle.

> **Stufe 0 (Sofortfixe) ist ERLEDIGT** — Commit `2c7c680`, 2026-08-13:
> Relay liest `time` statt `t` (EIN `_progress_melden` für beide
> Verfolger + 2 Drift-Wächter-Tests), `ort`-Default `'runpod'`,
> Labels ergänzt.

---

## P1 Modell-Pipeline — Spec → validate → casebuilder → Foam-Fall

**Nutzen:** Das ist das Produkt. Ein Ingenieur beschreibt den Fall
deklarativ (case.yaml), das Werkzeug baut daraus einen reproduzierbaren
OpenFOAM-Fall. Alles andere existiert nur, damit diese Übersetzung
läuft.

**Ziel:** Jede Spec-Änderung führt deterministisch zu demselben Fall;
jede Unstimmigkeit wird VOR dem (bezahlten) Rechnen als Befund gemeldet;
ein neuer Prüfschritt oder ein neues Bauwerksrezept ist ein
LOKALER Eingriff, kein Ritt durch eine 1000-Zeilen-Funktion.

**Zu komplex für den Nutzen:**
- `validate_case` (`core/validate.py:125`) — 1096 Zeilen, ~40
  Prüffamilien in einer Funktion. Der Nutzen (Befundliste) braucht
  keinen Monolithen.
- `apply_import` (`core/importer.py:1241`) — 500 Zeilen mit 12
  eingestreuten Lazy-Imports.
- Die Zyklen validate↔casebuilder und casebuilder↔anschluss, versteckt
  hinter ~120 funktionslokalen Imports — Komplexität, die nur den
  eigenen Knoten verwaltet.

**Umbau:**
1. `validate_case` → Prüffamilien `_pruefe_gelaende(spec)`,
   `_pruefe_raender(spec)`, … die je `list[dict]` (Befunde) liefern,
   plus EINE Registry-Liste, über die `validate_case` iteriert.
   Verhaltensgleich; die bestehenden validate-Tests sind das Netz.
   Danach ist „neue Prüfung" = eine Funktion + ein Listeneintrag.
2. `apply_import` in benannte Schritte schneiden (Layer-Zuordnung,
   Terrain-Ersatz, Struktur-Anlage, …), Imports an den Dateikopf.
3. Richtungsregel festschreiben und durchsetzen: `anschluss` darf
   `casebuilder` importieren, nie umgekehrt (heute: `casebuilder.py:1220`
   importiert zurück). Der Wächter-Test aus P3 (Import-Graph) prüft das
   mit.

---

## P2 Netzvorschau — Server-Docker, 2 Ränge, Kostenschätzung

**Nutzen:** Kostenloses, schnelles Feedback VOR dem bezahlten Lauf:
ehrliche Zellzahl (echtes snappy, kein Schätzmodell), Geometriefehler
früh, Kostenschätzung. Fabios Entscheid: Vorschau ist Vorschau — grob,
2 Ränge, nie Referenz.

**Ziel:** Bleibt wie sie ist. Die Komplexität (eigener Docker-Lauf) ist
durch den Nutzen GEDECKT — ein Schätzmodell ohne snappy wäre billiger,
aber unehrlich.

**Zu komplex / Umbau:** Nur eine Ehrlichkeitskorrektur, kein Umbau:
Die Laufzeitschätzung ist systematisch ~2,3× zu optimistisch (der
Zeitschritt hängt an der Wasseroberfläche, nicht an der feinsten Zelle
— Audit Rechenorte). Entweder Faktor aus den echten Läufen kalibrieren
oder als Spanne labeln („15–40 min"). Eine Zeile Text, keine Mechanik.

---

## P3 Rechen-Pipeline — Bundle → Worker → Events → Relay/Companion → Import

**Nutzen:** Das Herz: EIN Runner-Code rechnet auf zwei Rechenorten
(RunPod, lokaler Docker), der Server bleibt lastfrei und begleitet nur.
Der Bundle-Mechanismus macht den Runner unabhängig vom Alter des
gebackenen Images.

**Ziel:** Ein Runner, EIN Ereignis-Vokabular, EIN Verfolger, EIN
Manifest-Schreiber — und ein Test, der den Bundle-Vertrag erzwingt,
statt auf Glück zu bauen.

**Zu komplex für den Nutzen:**
- **7 Ereignis-Übersetzungen** entlang der Kette (Worker, Companion,
  Relay frisch, Relay reattach, run_log, localCompanion.js, Store) —
  plus Client-ERFUNDENE Event-Arten (`job`, synthetische `log`s), die
  kein Producer je sendet. Der Nutzen (Fortschritt anzeigen) braucht
  genau EINE Übersetzung am Ende der Kette.
- `run_pipeline` (`core/runner.py:419`): 187 Zeilen tote
  Zweit-Implementierung der Pipeline.
- Der Import-Zyklus Relay↔Router für Symbole, die längst in
  `core/store.py` liegen.

**Umbau (Reihenfolge = Risiko zuerst):**
1. **Bundle-Wächter-Test:** Bundle in ein Temp-Verzeichnis entpacken,
   `flood3D` als Top-Level auf sys.path, jedes verschiffte Modul im
   Subprozess importieren (fastapi/boto3 nicht installiert). Heute ROT
   wegen `core/gate.py` → `gate.py` zieht um neben `router.py` (einziger
   Importer), Test wird grün. Danach fängt er jeden künftigen
   Container-Crash zur Testzeit.
2. **EIN `manifest_schreiben(run_root, **felder)`** in `core/store.py`:
   fcntl-Lock + tmp-Datei + `os.replace`. Ersetzt alle 7 Kopien
   (`router.py:1607/1891/1745/1793/2023`, `core/runner.py:375`,
   `local_runner.py:964`; Container-Seite ohne Lock, nur atomar).
   Test: 2 Threads × 100 Updates, kein Feld verloren.
   Laufnummern-Vergabe per atomarem `mkdir` (ersetzt die TOCTOU-Kopien
   `router.py:1598`/`1426`).
3. **Totcode löschen:** `run_pipeline` + transitiv tote Helfer +
   die 8 Schein-Env-Vars; `core/runner.py` bleibt als das, was es ist:
   Netzvorschau-Docker-Runner.
4. **Zyklus kappen:** Relay importiert `read_manifest`/`run_paths` aus
   `core.store`; `runs_root()` zieht als Pfad-Politik ebenfalls dorthin.
   Der Router hört auf, privates `relay._r2()` zu ziehen — R2-Zugriffe
   des Routers werden 3 kleine Relay-Funktionen.
5. **EIN Verfolger:** `_stream_folgen(job_id, …)` für Frisch-Start UND
   Reattach (Stufe 0 hat schon `_progress_melden` geteilt — das ist der
   Rest desselben Zugs). `r2_keys(run_id)`-Helfer statt f-Strings in
   4 Dateien.
6. **Ereignis-Vokabular festschreiben:** die 5 Arten (`log`, `progress`,
   `checkpoint`, `done`, `error`) mit ihren Feldern als Konstanten/
   Docstring in `core/conventions.py`; Hops reichen durch statt zu
   übersetzen; die Client-Kunst-Events bekommen ein `_lokal`-Präfix,
   damit sichtbar ist, was nie vom Worker kommt.

---

## P4 Ergebnis-Pipeline — extract → parquet → evaluate → Befunde → Panels

**Nutzen:** Aus Foam-Zahlen werden prüfbare Nachweise: Zielwerte
(erfüllt/nicht erfüllt), Qualitätsbefunde (y⁺, Courant, Viz-Volumen)
und die 3D-/Grundriss-Ansichten. Das ist das, was der Ingenieur am Ende
in den Bericht übernimmt.

**Ziel:** Grenzwerte leben an EINER Stelle (Backend); der Client ZEIGT
Befunde an, statt sie nachzurechnen. Die zwei Ergebnis-Viewer teilen
sich ihre identische Mechanik.

**Zu komplex für den Nutzen:**
- Grenzwerte doppelt gepflegt (`grenzwerte.js` vs. `evaluate.py`/
  `meshgen.py`), obwohl JEDER Befund sein `grenze`-Feld schon mitliefert
  — der Client ignoriert es und hält eine eigene Tabelle, die
  `RunLogPanel.vue:127` dann auch noch mit einem nackten 0.05 umgeht.
- Der 21-Quellen-`deep`-Watch auf die 200-Zeilen-`updateScene()`
  (`Raum3DPanel.vue:1342`) — jede Checkbox rechnet die volle Pipeline.
- Die Viewer-Zwillinge: 5 zeichengleiche Blöcke in Grundriss- und
  Raum-Panel (loadRun, Zeitcursor-Snap, togglePlay, Farbskalen-Lock,
  gridLabel).

**Umbau:**
1. Client liest `wert`/`grenze`/`quelle` aus dem Befund und rendert sie
   (QualityPanel zeigt heute nur severity+message); `grenzwerte.js`
   schrumpft auf die reinen ANZEIGE-Schwellen, die das Backend nicht
   kennt; der 0.05-Bypass fliegt.
2. `useRunViewer()`-Composable: loadRun/Zeitcursor/Play/Skalen-Lock —
   beide Panels konsumieren es. (Das Muster `glaettung.js` hat
   vorgemacht, wie man aus dem Panel extrahiert und dabei Tests
   gewinnt.)
3. `updateScene()` nach Wirkungsgruppen schneiden: Zeit/Feld →
   Daten neu; Slice/Iso/Streamlines → Filter neu; Farben → nur LUT.
   Drei Watches mit expliziten Quellen statt einem deep-Watch.

---

## P5 Lebenszyklus & Storage — Teilstände → Archiv → R2-Putz → Reattach

**Nutzen:** Läufe überleben Browser-, Server- und PC-Neustarts
(Teilstände, Reattach, Nachzügler); die Platte läuft nicht voll
(StorageBox-Archiv); R2 kostet nichts im Ruhezustand (Putzrunde).
Für ein Ein-Mann-Produkt mit bezahlter Cloud ist genau DAS der
Unterschied zwischen Werkzeug und Bastelei.

**Ziel:** Ein Pfad-Modul, ein Env-Zugang, koordinierte Wächter.

**Zu komplex für den Nutzen:**
- 9 Pfad-/Schlüssel-Konventionen, davon R2-Keys als f-Strings in 4
  Dateien, die `r2_aufraeumen` anschließend per `split("/")`
  ZURÜCKPARST.
- 3 Env-Lesemechanismen; die 15 per rohem `os.environ` gelesenen
  Variablen sind unter PM2 aus `backend/.env` nicht setzbar — die Doku
  verspricht das Gegenteil (stille Fehlkonfiguration).
- Reattach- und S3-Wächter können denselben Lauf doppelt importieren
  (kein Terminal-Status-Guard zwischen den Threads).

**Umbau:**
1. Pfad-Politik komplett nach `core/store.py`: `runs_root()`,
   `cases_root()`, `derived_dir()`, `r2_keys(run_id)` (liefert
   eingang/checkpoint/artefakt-Keys als NamedTuple) — `RunPaths` ist
   das Vorbild und bleibt.
2. Alle `FLOOD3D_*`-Reads auf `env_util.env()` (liest backend/.env) —
   Ausnahme Container-Welt (`meshgen`, `local_runner`), die bewusst nur
   `os.environ` sieht; genau diese Ausnahme wird im Modulkopf benannt.
   Importzeit-Reads werden Funktionsaufrufe (testbar, PM2-tauglich).
3. Wächter-Koordination: `_import_entpacken` prüft-und-setzt den
   Terminal-Status ÜBER das neue gelockte `manifest_schreiben` — damit
   ist Doppel-Import strukturell weg (der `_upload.zip`-Sentinel
   entfällt).

---

## P6 Client-Editor — Editor3D, Panels, Stores

**Nutzen:** Der Fall wird GEZEICHNET statt getippt — Bauwerke setzen,
Ränder ziehen, Aussparungen stanzen. Das ist der Grund, warum das
Werkzeug benutzbar ist.

**Ziel:** `Editor3D.vue` < 800 Zeilen; die Mechanik lebt in getesteten
`editor/*.js`-Modulen (das Muster existiert und funktioniert — es ist
auf halber Strecke stehengeblieben); keine WebGL-Lecks; Laufzustand hat
EINEN Besitzer.

**Zu komplex für den Nutzen:**
- 1879-Zeilen-Component neben einem funktionierenden, getesteten
  Extraktionsmuster (2041 Zeilen `editor/*.js`).
- Undo als 100 Voll-Spec-Kopien pro Tastendruck-Serie
  (`usePreStore.js:558`).
- 3 handgebaute Run-Poller, 5 Formatter, 4× Statusliterale,
  2 three.js-Bootstraps.
- `store.error`: 10 Schreiber, 1 Leser — ein toter Parallelkanal zu
  `melden()`.

**Umbau:**
1. Extraktion fertigziehen: `buildHandles`/`applyClip`/`rebuild`/
   Stanz-Vorschau/Pointer-Choreografie nach `editor/*.js`, je Modul ein
   Test (wie `objektZugriff.test.js`).
2. Gemeinsame Composables: `useRunPolling()` (3 Kopien),
   `useThreeViewer()` (2 Bootstraps), Formatter → `utils/labels.js`,
   Statusliterale → `utils/runStatus.js`, Farbliterale →
   `SERIES_COLORS`.
3. Lecks: vtk-Pipeline-Dispose beim Unmount (`_disposeActorList` gibt
   es schon — nur beim Unmount rufen), STL-Geometrie-Dispose im
   ImportModal, `renderer.forceContextLoss()` nach jedem
   `renderer.dispose()`.
4. `store.error` raus; Fremd-Store-Schreiber (`CaseRunsPanel`,
   `RunListPanel`, `Flood3DPreMain`) durch Store-Actions ersetzen.
5. Undo: statt Voll-Kopien die letzten N Patches (alt/neu je Pfad) —
   erst WENN es drückt; bis dahin reicht Deckel + Trim beim Fallwechsel.

---

## Streichliste — Komplexität ohne Nutzen (ersatzlos löschen)

| Was | Wo | Warum tot |
|---|---|---|
| `run_pipeline` + `_write_manifest` + `geschriebene_zeiten` + `durchsatz_je_kern` + Parallel-Zweig | `core/runner.py` (~220 Z.) | null Aufrufer seit HTTP 410 |
| Schein-Env-Vars `FLOOD3D_CORES`, `FLOOD3D_CORE_PRICE`, `FLOOD3D_SOLVE_TIMEOUT`, … | `core/runner.py:21–45` + `BETRIEB:92` | steuern nur Totcode |
| `make_beispiele.py` | `engines/local/` (176 Z.) | referenzlos, COPY-exkludiert |
| `archivStand()` | `services/api.js:244` | nie aufgerufen |
| 6 tote Exporte | `utils/importRollen.js` | nur intern benutzt |
| `store.error`-Kanal | `usePreStore` (10 Schreiber) | `melden()` ist der Weg |
| toter `artifacts_put_url`-Zweig | `local_runner.py:996` | Cloud-Pfad sendet den Key nie |
| Alt-Audits (`AUDIT_FLOOD3D_DEAD_ENDS`, `TESTRUNDE_FLOOD3D`, Prä-Stage-Audits) | Repo-Wurzel | dokumentieren gefixte Bugs als offen | → `docs/archiv/` |

---

## Umsetzungswellen (Reihenfolge = Risiko vor Schönheit)

| Welle | Inhalt | Aufwand | Definition of Done |
|---|---|---|---|
| **W1 Wächter** | P3.1 Bundle-Test + gate-Umzug · P3.2 manifest_schreiben + mkdir-Reservierung | ~1 Sitzung | Bundle-Test war ROT, ist grün; Nebenläufigkeits-Test 2×100 Updates verlustfrei; Suiten grün |
| **W2 Entwirren** | P3.3 Totcode · P3.4 Zyklus · P3.5 ein Verfolger + r2_keys · P5.1/P5.2 Pfade+Env · Streichliste | ~1 Sitzung | `grep run_pipeline` leer; Relay importiert nichts aus router; alle FLOOD3D_*-Reads über env_util (außer Container-Welt); Suiten grün |
| **W3 Monolithen** | P1.1 validate-Registry · P1.2 apply_import · P4-Backend (Befund-Konstruktor) · Router dritteln (`laufwerk.py`) | 1–2 Sitzungen | validate_case < 100 Z.; router.py < 900 Z.; kein Endpunkt-Verhalten geändert (Suite beweist es) |
| **W4 Client** | P6 komplett · P4.1–P4.3 (Befund-Anzeige, useRunViewer, Watch-Gruppen) | 2–3 Sitzungen | Editor3D < 800 Z.; Tab-Wechsel-Zyklus leckt nicht mehr (Heap-Vergleich); je Extraktion ein Test |
| **W5 Doku** | Env-Tabelle in BETRIEB · Alt-Audits archivieren · P2-Schätzlabel · Ereignis-Vokabular dokumentiert | laufend, je Welle mit | Doku widerspricht dem Code nirgends mehr |

**Tor jeder Welle:** `pytest app/api/flood3D/tests -q` (607+) und
`npx vitest run` (126+) grün, PLUS der neue Wächter-Test der Welle.
Kein Cloud-Start ohne Fabios Go (Kostenregel). Nach W2 zeigt der
nächste echte RunPod-Lauf erstmals live `letzte_zeit` — der sichtbare
Beweis, dass der Umbau beim Nutzer ankommt.

---

## Nachtrag 2026-08-13 (Post-Processing-Paket): bewusst offen

- **Grundriss und Bohrung:** Die 2D-Karten (GrundrissPanel) rechnen
  weiter mit einem Boden je Rasterspalte — ein Rohr unterm Damm ist dort
  nicht darstellbar. Nur die Raum-Ansicht zeigt den Erdkörper.
- **depth/surface IN der Bohrung:** Innerhalb einer Aussparung ist der
  „Boden" der Planfelder heute die Dammoberkante — Wassertiefe/Spiegel
  sind dort falsch. Braucht ein zweites Höhenfeld (Deckenhöhe) und einen
  planFields-Umbau — eigener Entscheid.
- **21-Quellen-deep-watch (P4.3):** bleibt; die Stromlinien-Memoisierung
  nimmt ihm den teuersten Zahn.
