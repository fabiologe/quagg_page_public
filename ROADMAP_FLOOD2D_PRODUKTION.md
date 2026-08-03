# flood-2D — Fahrplan zur Produktionsreife

Stand: 2026-08-01 · Basis: Audit vom selben Tag (Solver, Editor-Werkzeuge, Tests, Docker, Repo-Hygiene)

---

## 0. Der eine Satz

Die **Werkzeuge sind reif**, die **Physik ist unvalidiert**, und die **Auslieferung ist nicht
reproduzierbar**. Das dritte Problem ist der Blocker: solange nicht feststeht, *welcher Solver-Stand*
ein Ergebnis erzeugt hat, ist jeder Benchmark wertlos — man würde Modellfehler und Image-Drift
vermischen.

---

## 1. Kritischer Befund: die drei Solver-Images divergieren

Alle 9 Patches stehen korrekt im `Dockerfile`
(`backend/app/api/flood2D/engines/docker/Dockerfile`, Zeilen 67–135). Sie sind aber **nicht in allen
gebauten Images**, weil die Images zu unterschiedlichen Zeitpunkten gebaut wurden:

| Image | gebaut | `timeseries-memset` | `coupling-sgc-hook` |
|---|---|---|---|
| `lisflood-fp:latest` (Server-Docker-Pfad) | 2026-07-28 21:15 | ✅ | ❌ **fehlt** |
| `lisflood-fp:runpod` (Cloud-Pfad) | 2026-07-29 11:31 | ✅ | ❌ **fehlt** |
| `fabiologe/lisflood_acc_modi:local` (Companion) | 2026-07-30 19:56 | ✅ | ✅ |

Herleitung: Die `COPY`-Zeile für `quagg-coupling-sgc-hook.patch` kam erst mit Commit `5074ec7`
(2026-07-30 19:21) ins Dockerfile — **nach** dem Bau von `:latest` und `:runpod`.
Die `memset`-Zeile kam mit `27b1a66` (2026-07-27 09:39), also **vor** allen drei Builds.

**Konsequenz:** SWMM↔LISFLOOD-Kopplung auf SGC-Zellen verhält sich je nach gewähltem Backend
unterschiedlich. Derselbe Fall liefert lokal ein anderes Ergebnis als auf dem Server.

**Nebenbefund:** Die „⚠️ Offen"-Sektion in `engines/patches/README.md` (Z. 567–605) ist **veraltet** —
sie behauptet, `memset` und `outflow-free-direction` seien noch nicht gebaut. Beide sind drin.
Die Release-Notes lügen; das ist für sich genommen schon ein Produktionsrisiko.

---

## 2. Phase P0 — Reproduzierbarkeit (Blocker, ~1 Woche)

Ohne P0 braucht mit Benchmarking gar nicht angefangen zu werden.

### P0.1 Ein Build, drei Ziele, ein Commit
Alle drei Images aus **demselben Git-Stand** neu bauen und gemeinsam taggen.
Regel ab sofort: Solver-Images werden nie einzeln nachgezogen.

Build-Kontext ist **`backend/app/api/flood2D/`** (nicht `backend/app/api/`) — das Dockerfile
referenziert `engines/…` und `codec.py` relativ dazu.

```bash
cd backend/app/api/flood2D
SHA="$(git rev-parse --short HEAD)$(git diff --quiet -- . || echo -dirty)"
docker build -f engines/docker/Dockerfile --target runtime \
    --build-arg QUAGG_SHA="$SHA" -t quagg-lisflood:$SHA .
docker build -f engines/docker/Dockerfile --target runpod \
    --build-arg QUAGG_SHA="$SHA" -t quagg-lisflood:runpod-$SHA .
```

### P0.2 Versionsstempel im Solver (höchster Hebel)
Das Image muss beim Start seine Herkunft ausgeben — Git-SHA + Liste der angewandten Patches —,
`handler.py` schreibt das in jedes Ergebnis, der Client zeigt es im Ergebnis-Header.

```dockerfile
ARG QUAGG_SHA=unknown
ENV QUAGG_SOLVER_SHA=${QUAGG_SHA}
RUN ls /tmp/*.patch > /opt/quagg/PATCHES.txt
```

Erst damit lässt sich später sagen: „dieser Benchmark lief gegen Solver `a1b2c3d`, 9 Patches."
Ohne diesen Punkt ist jede Fallvalidierung nach zwei Wochen nicht mehr nachvollziehbar.

### P0.3 Patch-README zur Wahrheit machen
Die „Offen"-Sektion streichen bzw. gegen den tatsächlichen Dockerfile-Stand abgleichen. Künftig gilt
das Dockerfile als Single Source of Truth, das README beschreibt nur noch das *Warum* je Patch.

### P0.4 Tests wirklich ausführbar machen ✅ (2026-08-01)
50 `test_*.mjs` unter `client/src/features/flood-2D/test/` matchten das vitest-Discovery-Muster
nicht — **`npm test` führte sie nicht aus**. Umbenennen auf `*.test.mjs` wäre falsch (vitest bricht
bei Dateien ohne Testsuite mit „No test suite found" ab), deshalb ein eigener Runner:

```bash
npm test          # vitest + Node-Skripte (beides)
npm run test:node # nur die Node-Skripte
npm run test:node sgc bridge   # gefiltert nach Dateiname
```

`client/scripts/run-node-tests.mjs` sammelt alle `src/features/*/test/test_*.mjs` ein, fährt jede
in eigenem Prozess, wertet den Exit-Code aus und gibt bei Fehlschlag die letzten 40 Ausgabezeilen
aus. `diag_*.mjs` bleibt draußen (Diagnose-Skript ohne Pass/Fail).

**Was der erste ehrliche Durchlauf zutage förderte** (47/50) — beides Fälle, in denen bisher
„grün" gemeldet wurde, ohne dass geprüft wurde:

1. `test_coupled_scenario`, `test_coupling_export` und `test_geometry_engine` zeigten per Default
   auf `lisflood-fp:coupling` — ein Tag, das es nicht mehr gibt. Ihr Docker-Teil wurde deshalb
   **still übersprungen**. Auf `fabiologe/quagg-lisflood:latest` gezogen; sie fahren jetzt
   wirklich einen Solver-Lauf.
2. Drei Tests waren verwaist: `test_inputgenerator` prüfte `InputGenerator.processTerrain()`
   (heute `processScenario`, abgedeckt von `test_inputgenerator_v8`), `test_rastertools` und
   `test_rastertools_real` importierten `solverTerra/RasterTools.js` — Modul und Funktionen sind
   längst gelöscht. Nicht reparierbar, weil es nichts mehr zu testen gibt → entfernt.
   Die Fixture `test/dgm10_small.xyz` (900 K) blieb liegen; sie könnte für P1 als
   Benchmark-Geländedatei taugen.

---

## 3. Phase P1 — Physik-Validierung (der eigentliche Benchmark-Einstieg, ~2–3 Wochen)

Heute existiert **keinerlei** quantitative Validierung gegen Ground Truth. Der einzige Referenzpunkt
ist die solvereigene Massenbilanz — eine Selbstkonsistenzprüfung, kein Realitätsabgleich.

### P1.1 Benchmark-Gerüst ✅ (2026-08-01)
```
backend/app/api/flood2D/benchmark/
  metrics.py                  # RMSE, MAE, NSE, F-Statistik, Frontlage (mehrere Schwellen)
  cases/ritter_dambreak.py    # Fall 1: analytische Lösung + Szenariobau
  run_benchmark.py            # fährt Fälle × Schemata, --convergence, report.json
  REPORT.md                   # gemessene Werte + Interpretation
```

**Erstes Ergebnis** (Ritter-Dammbruch, dx = 2 m, t = 20 s, aktive Zone):

| Schema | RMSE | NSE | Frontfehler (≥0,2 m) |
|---|---|---|---|
| `fv1` | 0,082 m | 0,999 | −10 m |
| `acceleration` | 1,878 m | 0,603 | −154 m |

Gitterkonvergenz für `fv1` über dx = 8/4/2/1 m: Fehler fällt monoton
(0,214 → 0,127 → 0,082 → 0,052 m), beobachtete Ordnung **p ≈ 0,68**. Damit ist belegt, dass die
Harness echten Diskretisierungsfehler misst und der gute RMSE kein Zufall einer Auflösung ist.

**Fachlicher Befund mit Folgen für die App:** `acceleration` unterschätzt die Wellenschnelle um
fast die Hälfte (11 statt 19,8 m/s) — für Dammbruch/Sturzflut unbrauchbar, für langsame
Vorlandüberflutung dagegen richtig und schneller. Da **SGC zwingend `acceleration` aktiviert**
(`pars.cpp:730`), ist jedes Modell mit Sub-Grid-Gerinne automatisch auf das für rasche
Transienten ungeeignete Schema festgelegt. Das sollte im Client sichtbar werden, statt implizit
zu passieren → neuer Punkt in P3.

### P1.2 Reihenfolge der Fälle — bewusst von einfach nach schwer
1. ✅ **Analytisch**, ohne Struktur: Dammbruch auf trockenem, ebenem Bett (Ritter-Lösung).
   Prüft nackte Flachwassergleichung. — *erledigt 2026-08-01, s. `benchmark/RESULTS.md`*
2. ✅ **Analytisch mit Reibung**: gleichförmiger Abfluss im Gerinne (Manning-Normalabfluss) —
   validiert SGC-Rechteckkanal gegen Handrechnung. — *erledigt 2026-08-01: **+0,07 %**
   Abweichung, Profilneigung 1,9 mm/km über 2 km. Die SGC-Gerinnehydraulik ist damit
   quantitativ bestätigt.*
3. **Publiziert**: ein Fall aus der EA-2D-Benchmark-Suite oder LISFLOOD-eigenen Testfällen —
   gibt eine Außenreferenz.
4. **Struktur-Einzelfälle**: Wehr, Brücke, Punktzulauf je isoliert gegen Handrechnung.
5. **Echtes Ereignis** mit Pegeldaten — erst ganz zuletzt.

### P1.3 Wehr-Durchflussbeiwert
`Cd` ist überall hartcodiert (`useWeir3DTool.js:214` = 1.704, `useGeoStore.js:237`,
`InputGenerator.js:993/1664`). Vor Schritt P1.2/4 braucht das Wehr eine geometrieabhängige
Cd-Ermittlung plus UI-Override — analog zum bereits vorhandenen `pierShapeCd()` bei Brücken.
Solange Cd geraten ist, misst ein Wehr-Benchmark nur die Rateguete.

---

## 4. Phase P2 — Betriebsreife (~1–2 Wochen, parallel zu P1 möglich)

### P2.1 RunPod echt verifizieren
`test_runpod_e2e.py` fährt gegen das lokale Image, **nicht** gegen RunPod. Ein echter Cloud-GPU-Lauf
(Queue, S3/R2-Upload, GPU-Ausführung) hat nie stattgefunden. Ein einziger dokumentierter End-to-End-Lauf
mit Screenshot und Kostenzahl genügt als Nachweis.

### P2.2 Mock-Fallback laut machen
`services/solver/index.js:52` fällt still auf `MockRunpodTransport` zurück, sobald Env-Vars fehlen —
und der Mock **entfernt SGC/FV1/DG2/Brücken-Flags** (`MockRunpodTransport.js:34-48`) und rechnet mit
v5.9-WASM-Physik. Das ist die gefährlichste stille Falle im System: Man testet vermeintlich die
Cloud-Physik und bekommt etwas ganz anderes. → sichtbarer Warnbanner in der UI, nicht nur Konsole.

### P2.3 CI
Es gibt **keine** `.github/workflows`. Minimal: ein Workflow, der bei jedem Push die JS-Tests und die
nicht-Docker-Python-Tests fährt. Die Docker-Tests laufen dafür nächtlich oder manuell.

---

## 5. Phase P3 — Funktionslücken (nach dem Benchmark, priorisiert nach Bedarf)

| Lücke | Heute | Nötig für Produktionsreife? |
|---|---|---|
| SGC-Trapez + Mehrfachkanal + Brücke | Kombination ungetestet, UI erlaubt sie | ja — testen oder sperren |
| 2D-Culvert | fehlt (2026-07 entfernt), nur SWMM-1D-Umweg | abhängig vom Anwendungsfall |
| Globale FREE-Randbedingung | deaktiviert, Nachfolger geplant | mittelfristig |
| CFL/Zeitschritt engine-übergreifend | nie systematisch geprüft | ja, im Zuge P1.1 |
| Stale Kommentar `useChannelStructureTool.js:13` | ✅ erledigt 2026-08-01 | — |
| Schemawahl im Client sichtbar machen | SGC erzwingt still `acceleration` — für schnelle Transienten nachweislich ungeeignet (P1.1) | ja, sobald Sturzflut-/Dammbruchfälle gerechnet werden |

---

## 6. Aufräum-Ablauf

Vier getrennte Blöcke, aufsteigend nach Risiko. **Block A und B sind sofort machbar, C und D brauchen
eine bewusste Entscheidung.**

### Block A — Docker-Platte (risikoarm)

> **Nachtrag 2026-08-01, Erwartung korrigiert:** Hier stand ursprünglich „gewinnt ~3,7 GB". Real
> ging die Platte von 6,3 auf 5,8 GB frei **zurück** — die gelöschten Images teilten sich fast alle
> Layer mit `opencfd/openfoam-run:2406`, und die zwei neuen Solver-Images kamen dazu. Der Gewinn
> liegt in der Ordnung (20 → 12 Tags), nicht im Platz. Echter Platz steckt in Block D und im
> buildx-Volume (1,63 GB, s. unten) — nicht in den Solver-Images.

Ausgangslage: Platte bei **83 % (6,3 GB frei)**, 20 Images / 2,1 GB, davon **2,04 GB (96 %)
ungenutzt**, dazu **1,63 GB verwaiste Volumes**.

```bash
docker system df                                   # vorher
docker rmi lisflood-fp:pre-ascii-cleanup-backup \
           lisflood-fp:ascii-cleanup \
           lisflood-fp:multiarch-test \
           fabiologe/lisflood_acc_modi:multiarch-test
docker volume prune -f                             # 1,63 GB, keins davon aktiv
docker builder prune -f
docker system df                                   # nachher
```

Achtung: **`lisflood-fp:sgc-coupling-hook` erst löschen, nachdem P0.1 gelaufen ist** — es ist derzeit
das einzige Image mit dem Kopplungs-Patch außer dem Companion-Image.

### Block B — Tag-Schema vereinheitlichen (risikoarm, beseitigt die „Durchmischung")

Der eigentliche Befund: **Die Dockerfiles sind sauber getrennt** (flood2D, flood3D, Companion — drei
Dateien, drei Kontexte, keine Vermischung). Die Unordnung sitzt ausschließlich in den **Tags**:

- Zwei Registry-Namen für dasselbe Artefakt: `fabiologe/lisflood_acc_modi` (Altname, immer noch
  Default in `build-multiarch.sh:28` **und** `quagg_local_companion.py:50`) neben `fabiologe/lisflood-fp`.
- Eine Image-ID (`e3d2e3f2d6e7`) hängt an **fünf** Tags gleichzeitig.
- **Der Companion liegt im Solver-Repo**: `fabiologe/lisflood_acc_modi:companion` und
  `fabiologe/quagg-companion:latest` sind dieselbe ID (`03a6157d3df0`). Das ist die Stelle, an der
  „2D-Solver" und „Companion" begrifflich verschmolzen sind.

Zielschema — ein Präfix, Rolle im Namen, Datum/SHA im Tag:

| Rolle | neu | ersetzt |
|---|---|---|
| 2D-Solver (CPU) | `fabiologe/quagg-lisflood:latest` | `lisflood_acc_modi:local`, `lisflood-fp:latest` |
| 2D-Solver (RunPod) | `fabiologe/quagg-lisflood:runpod` | `lisflood-fp:runpod`, `lisflood_acc_modi:runpod` |
| Companion-Dienst | `fabiologe/quagg-companion:latest` | `lisflood_acc_modi:companion` ✂ |
| 3D-Engine (OpenFOAM) | `fabiologe/quagg-foam:latest` | `quagg-foam-local:latest` |

Danach `build-multiarch.sh:28` und `quagg_local_companion.py:50` auf die neuen Namen ziehen.

> **Alte Namen brauchen eine Übergangsfrist, keinen harten Schnitt.** Beim Umbenennen am
> 2026-08-01 fiel der laufende Companion sofort auf `image.present: false` — er trägt den alten
> Namen `fabiologe/lisflood_acc_modi:local` fest im ausgelieferten Image und findet den Solver
> nicht mehr, sobald der Tag weg ist. Dasselbe gilt für **jeden Nutzer**, der die veröffentlichte
> Companion-Version einsetzt. Der Alias bleibt daher bestehen, bis ein neues Companion-Image mit
> dem neuen Default gebaut **und in die Registry gepusht** ist — erst danach darf der Altname weg.

**Zur eigentlichen Frage „2D und 3D durchmischt":** Es gibt genau zwei echte Berührungspunkte, und
beide sind *architektonisch gewollt*, nur schlecht benannt:
1. `backend/companion/release.sh` baut und pusht Companion **und** OpenFOAM-Image in einem Rutsch.
2. `quagg_local_companion.py` ist **ein** Dienst mit zwei Engines (`ENGINES = ("lisflood","openfoam")`,
   getrennte Datenordner `…/quagg/flood2d` und `…/quagg/flood3d`).

Das ist als „ein Companion, zwei Engines" ein sinnvoller Entwurf — er sollte nur im README explizit so
benannt werden, statt sich hinter dem Solver-Namen zu verstecken. **Kein Umbau nötig, nur Umbenennung
und ein Absatz Doku.**

### Block C — Repo-Hygiene (braucht Entscheidung)

1. **Git-Worktree als Gitlink committet.** `.claude/worktrees/sleepy-lewin-9a5888` steht mit Modus
   `160000` (Submodul-Eintrag) im Index — 179 MB dupliziertes Client-Verzeichnis, Branch
   `claude/sleepy-lewin-9a5888`, Stand **2. Mai**, seit 3 Monaten tot. Das erzeugt bei jedem
   `git status` den ` m`-Eintrag.
   ```bash
   git worktree remove .claude/worktrees/sleepy-lewin-9a5888   # ggf. --force
   git rm --cached .claude/worktrees/sleepy-lewin-9a5888
   echo ".claude/worktrees/" >> .gitignore
   ```
2. **30 MB Heap-Timeline getrackt**: `client/src/features/isybau/test/Heap-20260726T143453.heaptimeline`
   — Profiling-Artefakt, gehört nicht ins Repo.
3. **59 MB `ifc-4.3.json`** (`client/src/features/ifc-viewer/services/`) — falls das ein
   Schema-Download ist, gehört es hinter einen Fetch-Schritt statt in die Versionierung.
4. **Verirrte Dateien**: `backend/app/api/data/regression_coupling_sgc/` liegt eine Ebene zu hoch
   (gehört unter `flood2D/data/`), dazu `flood2D/data/build_coupling.log`, `backend/scan.log`,
   `engines/docker/verify_all_channels.py` (Einmal-Skript vom 13.06.), verstreute `__pycache__/`.

### Block D — Datenhalden (nur Platte, kein Repo-Problem)

Nicht versioniert, aber sie füllen die 38-GB-Platte:
- `backend/data/RAG` — **6,3 GB** (verwaiste ChromaDB, siehe Memory `project_rag_literatur`)
- `backend/data/literatur_fts.sqlite` — **867 MB**
- `backend/app/api/flood3D/data/runs` — **579 MB** (Lauf-Artefakte, Aufbewahrungsfrist nötig)
- `backend/app/api/flood3D/data/cases` — **229 MB**

Empfehlung: Aufbewahrungsregel für `flood3D/data/runs` und `flood2d_jobs` (z. B. 30 Tage), und die
RAG-Frage einmal grundsätzlich klären — 6,3 GB für eine nicht genutzte Datenbank ist der größte
Einzelposten der Platte.

---

## 7. Erledigt am 2026-08-01

- ✅ **P0.1** — `runtime` + `runpod` aus einem Stand neu gebaut, alle 9 Patches in beiden verifiziert.
  Divergenz behoben.
- ✅ **P0.2** — Versionsstempel: `QUAGG_SOLVER_SHA` + `/opt/lisflood/PATCHES.txt` im Image,
  `solver_version`-Event + `results/solver_version.json` aus `handler.py`.
- ✅ **P0.3** — `patches/README.md` korrigiert (die „Offen"-Liste war in beide Richtungen falsch);
  Dockerfile ist jetzt als alleinige Wahrheit dokumentiert, Vorfall festgehalten.
- ✅ **Block A** — 20 → 11 Images, verwaistes 1,19-GB-Foam-Image und alle Backup-/Doppel-Tags weg.
- ✅ **Block B** — Tag-Schema auf `fabiologe/quagg-lisflood:{latest,runpod,local,<sha>}`,
  Code-Referenzen gezogen (`engines/__init__.py`, `quagg_local_companion.py`, `build-multiarch.sh`,
  13 Testdateien), Regression 11/11 grün, danach 3 Tests gegen den neuen Default-Namen bestätigt.
- ✅ **Nebenbefund behoben** — das Companion-Startkommando in `Flood2DSolverRunner.vue` war
  veraltet: falsches Image, **kein 3D-Volume**, keine `SIBLING_VOLUME`-Variablen. Wer es kopierte,
  bekam einen Companion, der dem Solver den Job-Ordner nicht durchreichen kann.
- ✅ Stale-Kommentar in `useChannelStructureTool.js:13` („Typ 7 fehlt im Solver") korrigiert.

- ✅ **P0.4** — Runner `client/scripts/run-node-tests.mjs`, `npm test` fährt jetzt beides
  (27 vitest-Dateien / 308 Tests + 47 Node-Skripte, grün).
- ✅ **P1.1** — Benchmark-Harness + Fall 1 (Ritter) inkl. Gitterkonvergenz, s. oben.
- ✅ **Reproduzierbarkeits-Lücke geschlossen** — `codec.py` war nicht versioniert, wird aber vom
  Dockerfile per `COPY` gebraucht: **aus einem frischen Clone war das Solver-Image nicht baubar.**
  `.gitignore` arbeitet für `flood2D/` mit einer Positivliste, die Datei war schlicht vergessen.
  Zusammen mit `benchmark/` nachgetragen (`report.json` bleibt ignoriert — Laufergebnis).

**Noch nicht gepusht:** Die neuen Namen existieren bisher nur lokal. Companion- und Solver-Image
mit neuem Default müssen in die Registry, bevor der Altname-Alias entfallen darf (s. Block B).

---

## 8. Empfohlene Reihenfolge

```
Woche 1   P0.1 Neubau aller Images aus einem Commit   ← Blocker
          P0.2 Versionsstempel
          P0.3 README bereinigen
          P0.4 Test-Runner
          Block A + B (Docker aufräumen, Tags vereinheitlichen)

Woche 2   P1.1 Benchmark-Gerüst + Metriken
          P1.2 Fall 1+2 (Dammbruch, Normalabfluss)
          Block C (Repo-Hygiene)

Woche 3   P1.2 Fall 3+4 (publizierter Fall, Strukturen)
          P1.3 Wehr-Cd
          P2.2 Mock-Warnbanner

Woche 4   P2.1 RunPod-Cloud-Lauf
          P2.3 CI
          P1.2 Fall 5 (echtes Ereignis) — erst wenn 1–4 sitzen
```

**Der Einstieg ins detaillierte Benchmarking ist ab Woche 2 möglich** — aber nur, wenn P0 davor
abgeschlossen ist. Vorher misst man Image-Drift statt Physik.
