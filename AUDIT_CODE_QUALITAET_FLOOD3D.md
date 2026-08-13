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

# Fahrplan (Stufen 0–6, jede einzeln lieferbar, Suite als Tor)

## Stufe 0 — Sofortfixe *(erledigt in dieser Sitzung)*
1. **B1:** `relay.py` liest `time` statt `t`; frischer Pfad bekommt den
   strukturierten `phase`-Zweig (statt blockMesh-Substring-Schnüffeln).
   Drift-Wächter-Test pinnt die Event-Feldnamen des Runners gegen BEIDE
   Relay-Leser.
2. **B2:** `ort`-Defaults auf `'runpod'`; toter Migrationszweig und
   Stale-Kommentare raus.
3. `labels.js`: `tracer` + fehlende Target-Kinds.

## Stufe 1 — Bundle-Vertrag absichern (Z1)
- `core/gate.py` → `flood3D/gate.py` (neben router.py; einziger
  Importer ist der Router). `core/` ist danach framework-frei.
- **Wächter-Test:** Bundle in Temp-Verzeichnis entpacken, `flood3D` als
  Top-Level, jedes verschiffte Modul im Subprozess importieren (ohne
  fastapi/boto3). Muss auf heutigem Stand ROT sein (gate.py), grün nach
  dem Umzug — der Test, der den Container-Crash der Zukunft fängt.
- `make_beispiele.py` löschen.

## Stufe 2 — EIN Manifest-Schreiber (Z2)
- `core/store.py`: `manifest_schreiben(run_root, **felder)` — fcntl-Lock
  + tmp-Datei + `os.replace`, einheitliches Format. Alle 7 Stellen
  umstellen (Container-Seite ohne Lock, nur atomar). Test: 2 Threads ×
  100 Updates, kein Feld verloren.
- Laufnummern-Reservierung per atomarem `mkdir` in einem Helfer
  (ersetzt beide Kopien).

## Stufe 3 — Totcode raus, Relay entwirren (Z3, Z5)
- `run_pipeline` + tote Äste löschen; tote Env-Vars aus Code und Doku.
- Relay importiert aus `core.store` statt aus dem Router (Zyklus weg);
  `runs_root()`-Pfadpolitik zieht nach `core/store.py`.
- EINE `_stream_folgen(...)`-Funktion für Frisch-Start UND Reattach —
  löscht die Drift-Quelle von B1 dauerhaft.
- `r2_keys(run_id)`-Helfer statt f-Strings in 4 Dateien.

## Stufe 4 — Die zwei Monolithen schneiden (Z4 + Router)
- `validate_case` → Prüffamilien `_pruefe_*(spec)` + Registry-Liste;
  verhaltensgleich, bestehende Tests als Netz.
- `router.py` dritteln: HTTP bleibt, `laufwerk.py` bekommt
  Lauf-Orchestrierung + Wächter-Daemons + `_active_runs`, Pfad-Politik
  nach `core/store.py`. S3-Zugriffe des Routers hinter Relay-Funktionen.
- Gemeinsamer Befund-Konstruktor (heute 3 lokale `def b(...)`).

## Stufe 5 — Client entflechten (Z6, nach dem bewährten Muster)
Das Extraktionsmuster (`editor/*.js`, `glaettung.js` — beide getestet)
funktioniert, es ist nur liegengeblieben. Fortsetzen:
- `Editor3D.vue`: Handles/Clip/Stanz-Vorschau/Pointer nach `editor/*`
  nachziehen (Ziel < 800 Z.).
- Zwillinge zusammenlegen: `useRunViewer()` (loadRun/Zeitcursor/Play),
  `useThreeViewer()`, `useRunPolling()`; Formatter → `labels.js`,
  Statusliterale → `utils/runStatus.js`, Farbliterale → `SERIES_COLORS`.
- Leaks: vtk-Dispose beim Unmount, STL-Dispose + `forceContextLoss()`.
- Toten `store.error`-Kanal entfernen; Fremd-Store-Schreiber durch
  Actions ersetzen.
- Testfundament statt Vollabdeckung: `usePreStore`-Tests + Test je
  neuer Extraktion.

## Stufe 6 — Doku ehrlich machen + Dauer-Leitplanken
- Env-Tabelle in `BETRIEB_FLOOD3D.md` (alle 23 Vars, Lesemechanismus,
  PM2-Falle); Stale-Stellen fixen.
- Veraltete Audits (`AUDIT_FLOOD3D_DEAD_ENDS.md`,
  `TESTRUNDE_FLOOD3D.md`, Prä-Stage-Audits) nach `docs/archiv/`.
- Dauer-Wächter: Test „kein fastapi/boto3-Import unter `core/`".

## Verifikation je Stufe
`venv/bin/python -m pytest app/api/flood3D/tests -q` (605+) und
`npx vitest run` (125+) grün, plus die neuen Wächter-Tests der Stufe.
Kein Cloud-Start ohne Go (Kostenregel); B1 ist per FakeR2-Test prüfbar,
der nächste echte RunPod-Lauf zeigt dann erstmals live `letzte_zeit`.
