# Fahrplan Flood-2D → „9/10 überall"

**Datum:** 2026-06-18 · **Grundlage:** `AUDIT_FLOOD2D_Toolbar_Pipelines_2026-06-18.md` (Gesamt ~7.0/10)

Ziel: alle sechs Bewertungs-Dimensionen auf **9/10** heben, in ausführbaren Phasen mit konkreten
Code-Ankern und Abnahmekriterien.

**Vorgaben:** Solver bei **8.0.3 + quagg-Patch belassen** (Diskrepanz nur dokumentieren). Wehr-Q gegen
**echten Referenzlauf** (res.mass-Qout) kalibrieren.

## Dimension → welche Phase hebt sie auf 9

| Dimension | jetzt | → 9 durch |
|---|---|---|
| Physik. Korrektheit | 8.5 | P0 (CFL-Gate, Hazard-Doku, Q kalibriert) + P4 (R3 Krone, R1 Auslass) |
| Solver-Interpretation | 8 | P0 (Q-Einheit final, DEFRA-Hazard dok., Kanal-Semantik, 8.0.3 dok.) |
| Performance | 6.5 | P1 (Deep-Watcher, Patch-Undo, IndexedDB-Worker, Codec zero-copy) |
| Professionalität | 6 | P2 (Culvert/Texture/Node/Soffit) + P3 (Tool-State, TODO-Abbau) |
| Wartbarkeit/Architektur | 6 | P3 (gem. Diskretisierung, Index-Util, Dual-Storage, InputGenerator-Split) |
| Relevanz | 9 | bereits erreicht (halten) |

## Phase 0 — Korrektheit & Vertrauen *(Physik & Solver-Interpretation → 9)*
- **T0.1 Harter CFL-Gate** — `cflStatus` (Flood2DSolverRunner.vue:257-267) wiederverwenden; Submit bei
  `level==='unstable'` blockieren + „dt auf 0.8·dtMax klemmen". Spiegelprüfung in `InputGenerator.js`.
- **T0.2 Hazard-Formel dokumentieren** — `Haz = H·(Vc+1.5)` = DEFRA-2006 (util.cpp:211). Kommentar in
  `handler.py` + Legende (`ResultLegend.vue`/`WeirResultsPanel.vue`). Keine Rechenänderung.
- **T0.3 Wehr-Q kalibrieren (echter Lauf)** — `Σ qNormal` vs res.mass-Qout; `Q_UNIT_FACTOR` final,
  ⚠️-TODO entfernen; `test_weir_results.mjs` erweitern.
- **T0.4 Kanal-/Versions-Doku** — vx/vy(+SGC)/qx/qy in resultCodec/RunpodBackend; 8.0.3 in engines/README.

## Phase 1 — Performance *(→ 9)*
- **T1.1** Deep-Watcher-Abbau in useLayerRenderer.js (12× `deep:true` → flach + Callbacks).
- **T1.2** Patch-basiertes Undo in historyBridge.js (+ crop/mask/Shovel).
- **T1.3** IndexedDB-Hydrierung in Web-Worker (useResultDataBridge).
- **T1.4** Codec zero-copy (resultCodec.js:76 / codec.py).

## Phase 2 — Professionalität / unfertige Tools
- **T2.1** Culvert: Länge auto + Validierung (Ø>0, z_out<z_in, n>0, Cd∈(0,1]).
- **T2.2** Texture-Export verdrahten (manningfile) + Vertex-Farben nach Crop neu binden.
- **T2.3** Node/Source: Koordinaten gegen Grid validieren.
- **T2.4** Wehr-Öffnung: `soffit < hc` validieren.

## Phase 3 — Architektur/Wartbarkeit *(→ 9)*
- **T3.1** Gemeinsames `discretizeWatertightLine`-Kernmodul (utils/).
- **T3.2** Index-Util `gridTopDown↔bottomUp` (3× Duplikat eliminieren).
- **T3.3** Wehr-Dual-Storage konsolidieren (`weirLines` = Source-of-Truth).
- **T3.4** Tool-State (`bridge3DState`/`weir3DState`) in Pinia + Teardown.
- **T3.5** `InputGenerator.js` (1571 Z) modular splitten.

## Phase 4 — Physik-Tiefe *(gated)*
- **T4.1** R3 zellweise Wehrkrone — **Befund: bereits umgesetzt** für aktuelle Polylinien-Wehre
  (`cell.hc` aus `crestZAt`, [weirGeometry.js:159]); `first.hc` greift nur im Legacy-Pfad ohne Polylinie.
- **T4.2** R1 FREE-Auslass — **Befund: bereits nuanciert** (Domänenkante=natives FREE, intern=HFIX);
  nur der Offset ist nicht konfigurierbar (low value).
- **T4.3 (NEU, eigentliches Problem)** Brücken-Orifice-Instabilität (`Bridge flow calc fail`):
  **umgesetzt + test-gesichert** — Export verwirft Brückenzellen mit Soffit ≤ Gelände+0.05 m
  (degenerierte Öffnung Z≤0) + NaN-Koordinaten-Guard gegen Endlos-Loop. **Solver-Verifikation offen.**

## Verifikation
- Regressionsbasis: `test_inputgenerator_v8.mjs`, `test_structure_discretize.mjs`, `test_weir_results.mjs`,
  `test_sgc.mjs`, `verify_all_channels.py`.
- Neue Tests: CFL-Gate, Q-Einheit, Index-Util, Patch-Undo-Roundtrip.
- E2E: Editor → Export → echter Lauf → Viewer; Q gegen res.mass; Frame-Zeit-Benchmark vor/nach P1.
- Erfolgskriterium je Phase = zugeordnete Note erreicht 9.

**Reihenfolge:** P0 → P1 → P2 → P3 → P4 (P4 gated).

---

## Bugfixes (außerhalb der Phasen, 2026-06-18)

- **Modul-Ladefehler** „Failed to fetch dynamically imported module Flood2DMain.vue": **kein Code-Bug** —
  alle 96 Module im Graph transformieren mit 200, Optimizer-Hash stabil. Ursache: stale Vite-HMR-/Browser-
  Zustand nach Hinzufügen der 3 neuen Dateien. Fix: Hard-Reload, ggf. `rm -rf client/node_modules/.vite`
  + Dev-Server-Neustart.
- **A) IDB-OOM beim Viewer-Öffnen** (`DataCloneError: out of memory`): Producer schreibt jetzt **pro-Frame-
  Records** (`frame:<id>`) + Meta statt EINEM Mehrhundert-MB-`put` → kein Mega-Structured-Clone mehr.
  `buildResultData(copyArrays:false)` vermeidet zusätzlich die `.slice()`-Speicherverdopplung. Worker +
  Main-Thread-Fallback reassemblen die Records zur unveränderten data-Form (Split/Reassemble node-verifiziert
  symmetrisch). **Browser-Verifikation:** großen Lauf → Viewer öffnen → kein OOM, Frames laden.
- **B) handler.py-Robustheit**: `parse_asc` repariert zusammengelaufene Fixed-Width-Tokens (`0.0000.000`,
  Solver-Format-Überlauf bei Instabilität) per Regel statt den ganzen Frame zu verwerfen (5/5 Logiktest).
  **Hinweis:** greift erst nach **Docker-Image-Rebuild**. Die zugrundeliegende **Solver-Instabilität**
  (`Bridge flow calc fail` am Orifice, t≈849) bleibt der eigentliche Auslöser — B rettet nur die Ausgabe;
  echte Stabilisierung gehört zu R2-CFL/Brücken-Physik (Phase 4).

---

## Changelog / Erledigt

**2026-06-18 — Phase 0 (Korrektheit) + Viewer-Solver-Abgleich**
- ✅ T0.1 Harter CFL-Gate (Flood2DSolverRunner.vue Submit + InputGenerator-Spiegelwarnung).
- ✅ T0.2 Hazard als DEFRA-2006 `d·(v+1.5)` dokumentiert; falsches Legenden-Label „H·v" korrigiert.
- ✅ T0.4 Kanal-Semantik (vx/vy/qx/qy, Einheiten) + 8.0.3-Versionsentscheidung dokumentiert.
- ✅ **Wasserhaut-Fix (P5):** `useWaterSurface` rendert die Oberfläche jetzt aus dem **exakten Solver-
  Wasserspiegel `.elev`** (props.elevData, minZ-konsistent) statt aus `baseZ + geglättete Tiefe`.
  Gegen den echten Lauf `pod-85ad50e711b2` verifiziert: Backend-Kanäle treu (Δ depth 6e-8, elev 8e-6),
  aber der bisherige `smoothDepth`-Blur verschob die Oberfläche um **bis 0,48 m** (3,5 % der Zellen
  >10 cm) — Ursache der gemeldeten „physikalischen Abweichung". Tiefe bleibt geglättet nur für die Farbe.
- ✅ T0.3 Wehr-Q-Kalibrierung **abgeschlossen** (cs=2-Lauf pod-c8416a7c6ab1): Querschnitt-Durchfluss
  Σ(qx/qy)≈3212 m³/s lag zwischen res.mass Qin=3053/Qout=3619 (Verhältnis 1.04) → `qx/qy` sind **m³/s**,
  `Q_UNIT_FACTOR=1.0` verifiziert korrekt, ⚠️-TODO entfernt.
- ✅ **Bugfix Viewer cs≠1**: `openViewer` resampelt das Viewer-Terrain jetzt auf `exportCellsize` (wie der
  Solver-Input), sonst Vertex-Zahl ≠ Frame-Länge → Wasser „skipped". Bei cs=2: Terrain 658×412→329×206
  (=Frame-Länge 67774, verifiziert). Nur Re-Open nötig, kein Neu-Lauf.
  *(2026-06-19  wieder entfernt — siehe „Export-Zellweite entfernt".)*

**2026-06-19 — Export-Zellweite (exportCellsize) KOMPLETT ENTFERNT**
- Entscheidung: Solver rechnet **immer in nativer DEM-Auflösung**. Die einstellbare Ziel-Zellweite hatte
  schmalen Nutzen (Vergröbern für Tempo), aber breite Bug-/Komplexitätsfläche: Halbzellen-Ursprung,
  Viewer-Mismatch (Wasser-Render-Bug), Editor-vs-Export-Konsistenz, und die schwer zuzuordnende
  „Wasser von überall"-Verwirrung bei 2 m. Wer gröber rechnen will, importiert ein gröberes DEM.
- Entfernt: Resample-Pfad in `InputGenerator.processScenario`; `openViewer`-Resample; UI-Feld +
  `exportEstimate`/`nativeCellsize` + 2× scenarioData-Zeilen in `Flood2DSolverRunner`; `exportCellsize`-Ref
  in `useSimulationStore`; Projekt-Speichern/Laden-Listen; obsolete Resample-Tests im v8-Test.
- Behalten: `Rasterizer.resampleGrid` (sauberer, getesteter Util — prod-ungenutzt, wiederverwendbar) +
  `test_resample.mjs`. Alle 12 aktiven Tests grün.
- **Folge:** Die „Überflutung/Wasser-von-überall bei 2 m" ist damit **moot** (Pfad existiert nicht mehr).
  Die Brücken-Orifice-Instabilität (T4.3) bleibt davon unberührt — die ist nativ wie nicht-nativ relevant.

**2026-06-18 — Phase 1 (Performance)**
- ✅ T1.1 `useLayerRenderer`: **Render-Koaleszenz** — mehrere Watcher-Treffer pro Tick → ein Rebuild je
  Layer (queueMicrotask, `_disposed`-Guard). `deep:true` bleibt (Stores mutieren In-Place); eliminiert
  wurde das mehrfache Clear+Rebuild der Three.js-Gruppen pro Edit.
- ✅ T1.2 Terrain-History: Befund — der **Hot-Path (Shovel/BathyBrush) nutzte bereits Patch-Undo**;
  FULL-Snapshots nur bei Crop (Dimensions­wechsel → unvermeidbar) und Mask. Hinzugefügt: **Byte-Budget
  (96 MB) + konsistentes Evict an ALLEN Push-Stellen** (undo/redo cappten vorher gar nicht → unbegrenztes
  Stack-Wachstum behoben).
- ✅ T1.4 `resultCodec.decodeFrame`: **Zero-Copy-View** statt `buffer.slice()` je Kanal (Offsets sind
  4-aligned; Fallback bei Fehlalignment). Spart ~24 MB Garbage/Frame bei 6 Kanälen × ~1 Mio Zellen.
  Round-Trip-Test + echter Frame (`pod-85ad50e711b2`) bit-genau.
- 🔬 T1.3 IndexedDB-Hydrierung in Worker — **umgesetzt, Browser-Verifikation ausstehend.** Befund: die
  Hydrierungs-Schleife kopiert **nicht** (TypedArrays überleben den Structured-Clone); der reale Stall ist
  der **Structured-Clone des Gesamt-Blobs (~600 MB) im IDB-`get`**. Lösung: neuer
  `workers/resultHydrationWorker.js` liest IDB **im Worker** (Clone off-main-thread) und transferiert alle
  ArrayBuffers **zero-copy** zurück (`collectBuffers` dedupliziert geteilte Buffer — node-verifiziert).
  Consumer (`useResultDataBridge.readDataViaWorker`) mit **Main-Thread-Fallback** bei jedem Worker-Fehler
  (Worst Case = bisheriges Verhalten). ✅ **Browser-verifiziert** (Konsole: „Hydrierung via Worker (off-main-thread)").

**2026-06-18 — Phase 2 (Professionalität)**
- ✅ T2.1 Culvert: **Validierung** in `saveCulvert` (Ø>0, Länge>0, n>0, Cd∈(0,1]; Rückfrage bei widrigem
  Gefälle). Auto-Länge aus Knoten war bereits vorhanden.
- ✅ T2.2 Texture-Export: Befund — Pfad ist **bereits verdrahtet** (`InputGenerator.generateManningFile`
  → `terrain.n`). Hinzugefügt: **Dimensions-Guard** (surfaceGrid vs Terrain) → verhindert räumlich
  versetzte Reibung nach Crop/DEM-Wechsel (sicherer Fallback auf globale fpfric + Warnung). Offen
  (kosmetisch, Editor): Vertex-Farben/surfaceGrid nach Crop neu binden — braucht Browser-Arbeit.
- ✅ T2.3 Node/Source: **Bounds-Warnung** in `addNode` (Knoten außerhalb Terrain-Extent → Solver
  ignoriert; warnt statt still zu verwerfen).
- ✅ T2.4 Wehr-Öffnung soffit<hc: Befund — **bereits erzwungen** via `clampOpening` (alle Editierpfade
  `addOpening`/`setOpeningSoffit`/`setOpeningWidth`/`-Height` laufen durch `clampO`). Kein Eingriff nötig.

**2026-06-18 — Phase 3 (Architektur/Wartbarkeit, Teil 1)**
- ✅ T3.2 **Index-Util** `utils/gridIndex.js` (`flipRow`, `flippedIndex`) — ersetzt die inline
  top-down↔bottom-up-Arithmetik in useWeirResults, useDangerMarkers, useFlowArrows, useFlowStreamlines
  (eine Quelle der Wahrheit; Wehr-Ergebnis-Test grün).
- ✅ T3.1 **Bresenham-Dedup**: `InputGenerator.discretizeStructureAxis` nutzt jetzt das gemeinsame
  `weirGeometry.getLineCells` statt eigener 4-connected-Implementierung. `test_structure_discretize`
  bestätigt **v5 byte-identisch** + v8 unverändert.
- Hinweis: 3 stale Tests (`test_inputgenerator.mjs`, `test_rastertools*.mjs`) sind **vorbestehend**
  kaputt (importieren entfernte Alt-Pfade) — kein Bezug zu diesen Änderungen; aktive `_v8`-Pendants grün.
- ✅ T3.5 **InputGenerator-Split (Teil)**: die drei reinen Bauwerks-Helfer (`discretizeStructureAxis`,
  `collectBridgePierCells`, `collapseBridgeCellsToChannel`) in neues `middleware/structureFiles.js`
  extrahiert (isoliert testbar); Klasse behält dünne Delegatoren. InputGenerator **1571 → 1511 Z**.
  Alle 7 Struktur-Tests grün (v5 byte-identisch). Der Orchestrator `generateWeirFile` (Glue) bleibt
  bewusst in der Klasse — ein zuverlässiger 185-Zeilen-Inplace-Move ist mit den Edit-Tools zu fragil;
  algorithmischer Wert gering (reine Verdrahtung).
- ⏸ T3.3 Wehr-Dual-Storage, T3.4 Tool-State→Pinia: ändern Laufzeitverhalten/Datenmodell →
  **Browser-Verifikation nötig** (nicht blind). Nutzen mäßig, Editor-Regressionsrisiko hoch.
