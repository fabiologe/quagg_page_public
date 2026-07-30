# SaintV – 1D (ISYBAU/SWMM-Tool)

Kanalnetz-Simulation im Browser: ISYBAU-XML importieren, Netz bearbeiten,
Regen konfigurieren, mit dem echten SWMM-5.2-Solver (WebAssembly) rechnen,
Ergebnisse in 2D/3D ansehen und als PDF-Bericht exportieren.

## Datenfluss (der rote Faden)

```
XML-Datei → xmlParser → Store → SwmmBuilder → WASM-SWMM (Worker) → RptParser + SwmmOutParser
                                                                          ↓
                                                              ResultsAssembler (EIN Ergebnis-Objekt)
                                                                          ↓
                                            store.simulation.results → Viewer / Modals / PDF-Export
```

Der **Pinia-Store** ist die Datendrehscheibe — fast jede Komponente liest und
schreibt ausschließlich dort.

## Zentrale Infrastruktur

| Datei | Verantwortung |
|---|---|
| `store/index.js` | **Die Drehscheibe.** Netz (nodes/edges als Map, areas, inspections), Regen-Konfig, UI-Flags (welches Modal offen ist), Simulationsstatus/-ergebnisse, Undo/Redo-History. Alle CRUD-Aktionen (`addNode`, `updateNode`, `loadParsedData`, `runSimulation`) laufen hier durch. |
| `views/IsybauMain.vue` | **Der Dirigent (schlank).** Einstiegs-View der Route: schaltet nur zwischen 2D/3D/Ergebnis-Ansicht um und zeigt den Warnungs-Toast. Modal-Verdrahtung liegt in `components/modals/IsybauModals.vue`, Workflow-Logik in Store-Actions (`createElement`, `applyPreprocessing`, `loadProjectSnapshot`, `flashFocus`). |
| `components/modals/IsybauModals.vue` | **Zentrale Modal-Verdrahtung.** Rendert alle Modals, Sichtbarkeit über `store.ui.*`-Flags — neue Modals werden nur hier eingebunden. |
| `core/domain/Node.js` / `Edge.js` / `Area.js` | **Domain-Modelle.** Validierung, Defaults, `toJSON()` (bestimmt, was zum Worker und in Projektdateien gelangt), Überstau-Kopplung (`Node.applyOverflowState` — Single Source of Truth für isManhole/canOverflow). |

## Rechenkern (Import → Simulation → Ergebnis)

| Datei | Verantwortung |
|---|---|
| `utils/xmlParser.js` | ISYBAU-XML → rohe Knoten/Haltungen/Flächen/Inspections/Einzugsgebiete. Interpoliert fehlende Sohlhöhen (`null` = fehlt; echtes z=0 bleibt erhalten). |
| `core/services/SwmmBuilder.js` | Netz → SWMM-`.inp`: klassifiziert Knoten (Junction/Outfall/Storage), macht aus Wehr/Pumpe/Drossel/Schieber-Knoten SWMM-Sonderlinks, baut Subcatchments + Regenzeitreihen. **Achtung:** der `[REPORT]`-Block ist Pflicht, sonst schreibt SWMM keine Objekte in die .out-Datei (leere Ganglinien). |
| `utils/swmmWasmWorker.js` | **Web Worker.** Orchestriert: Builder → WASM-Lauf → beide Parser → ResultsAssembler → postet das fertige Ergebnis. |
| `utils/swmm_solver.js` / `.wasm` | SWMM 5.2 (C → WebAssembly). Quellcode in `solver/src/`, Build via `solver/build_wasm.sh`. |
| `core/worker/WorkerController.js` | Promise-Hülle um den Worker: Timeout (5 min), Absturz-Handling (`onerror`), Sperre gegen Doppelstart. |
| `utils/swmm/RptParser.js` | Parst den **Text-Report** (.rpt): Summary-Tabellen (Maxima je Knoten/Haltung), Bilanzen, Diagnose-Listen (Kontinuitätsfehler, Instabilitäten — Titel sind von `****`-Zeilen umrahmt!). |
| `utils/SwmmOutParser.js` | Parst die **Binärdatei** (.out): Zeitreihen (Tiefe/Volumen/Zufluss je Zeitschritt) für Ganglinien. Wirft bei unlesbarer Struktur, statt Müll zu liefern. |
| `utils/swmm/ResultsAssembler.js` | **Die einzige Merge-Stelle:** kombiniert .rpt + .out + Eingangs-Geometrie zum Ergebnis-Kontrakt (`nodes/edges/subcatchments/systemStats/timeSeries/warnings`; Vmax, maxVolumeStored, Knoten-Abfluss, Überstau-Flags). |
| `utils/runoffValidation.js` | Handrechnung nach Fließzeitverfahren (Q = ψ·i·A) als Plausibilitäts-Check gegen SWMM. |

## Editor (2D-Karte + Werkzeuge)

| Komponente | Verantwortung |
|---|---|
| `components/editor/IsybauEditor.vue` | Dünner Wrapper: Toolbox über dem 2D-Viewer, übersetzt Klicks je nach Editor-Modus in create-/split-Events. |
| `components/editor/EditorToolbox.vue` | Werkzeugleiste: setzt `store.editor.mode` (Zeichnen, Löschen, Teilen, Eigenschaften) + Undo/Redo. |
| `components/visualizer/IsybauViewer.vue` | **Das SVG-Herzstück (2D).** Rendert Netz + Flächen, Pan/Zoom, Selektion, Klick-Handling. Doppelrolle explizit über das `readonly`-Prop: ohne = Editor-Karte, mit = Ergebnisansicht (ElementInfo zeigt dann nur Ergebnisse, kein Speichern). |
| `components/visualizer/ViewerControls.vue` | Overlay-Buttons im 2D-Viewer (Pan/Select, Zoom, Layer). |
| `components/visualizer/ElementInfo.vue` | **Bearbeiten-Popup im 2D-Viewer.** Eigenschaften des selektierten Elements (Überstau-Checkboxen, Wehrhöhe, …) + Simulations-Maxima mit Warn-Badges. Speichern → `store.updateNode/updateEdge/updateArea`; „Bearbeiten (Tabelle)" springt via `store.openPreprocessingFor(id)` ins Preprocessing (Tab + Zeile vorselektiert). |
| Rechteck-Mehrfachauswahl | Editor-Modus `boxSelect` (Toolbox-Button): Rahmen aufziehen wählt Schächte + Haltungen (beide Endknoten im Rahmen); Shift = additiv. Aktionsleiste im Viewer löscht via `store.removeMany(ids)` in einem Undo-Schritt (Haltungen an gelöschten Knoten kaskadieren). |

## 3D-Ansicht

| Komponente | Verantwortung |
|---|---|
| `components/visualizer/IsybauViewer3D.vue` | Orchestriert die three.js-Szene: Kamera, Picking, Ergebnis-Modus (Wasserstände), Cleanup. |
| `viewer3d/useThreeCore.js` | Composable: Scene/Camera/Renderer/OrbitControls-Lebenszyklus. |
| `viewer3d/useSceneBuilder.js` | Baut die 3D-Geometrie: Schacht-Zylinder, Rohre mit echtem Querschnitt (Kreis/Ei/Trapez), Wasserstands-Overlays. |
| `viewer3d/Viewer3DControls.vue` | Layer-Toggles, Z-Überhöhung, Ansicht zurücksetzen. |
| `viewer3d/Viewer3DInfoPanel.vue` | Read-only-Infokarte zum angeklickten 3D-Element inkl. Ergebnis-Status. |

## Sidebar & Steuerung

| Komponente | Verantwortung |
|---|---|
| `components/panels/Sidebar.vue` | Linke Spalte: XML-Import (xmlParser + `store.loadParsedData`), Projekte-Button, hostet SimulationControls per Slot. |
| `components/panels/SimulationControls.vue` | Steuerpult: Regen wählen (Modellregen/KOSTRA), Daten bearbeiten, Simulationsdauer, **„Berechnung starten"**, Ergebnis-/Debug-/Download-Buttons. |
| `components/panels/TerminalHero.vue` | Deko: Retro-Terminal-Animation, solange kein Projekt geladen ist (`data/terminal-takes.json`). |

## Modals (Sichtbarkeit über `store.ui.*`)

| Modal | Verantwortung |
|---|---|
| `PreprocessingModal.vue` | **„Daten bearbeiten":** Tabellen-Massenbearbeitung aller Knoten/Haltungen/Flächen (Bauwerks-Parameter, Bulk-Edit, Excel-Export). „Übernehmen" → `store.updateNetworkData` → öffnet die Validierung. |
| `RunoffValidationModal.vue` | Fließzeitverfahren-Handrechnung je Fläche — öffnet automatisch nach „Übernehmen" im Preprocessing (nicht beim XML-Import). |
| `KostraModal.vue` | KOSTRA-DWD-Regendaten für die Netz-Koordinate (proj4-Transformation), Auswahl Dauer/Wiederkehrzeit → Store. |
| `ModelRainModal.vue` | Modellregen erstellen (Blockregen / Euler Typ II) mit Vorschau-Chart → `store.setRainModel`. |
| `SimulationResultsModal.vue` | **Das Ergebnis-Fenster (Shell):** Header, PDF-Export-Button, Tab-Navigation. Die Inhalte liegen je Tab in `results/ResultsGeneralTab.vue` (KPIs/Bilanz/Modellqualität/Regen), `results/ResultsEdgesTab.vue`, `results/ResultsNodesTab.vue` (Vmax/Füllgrad), `results/ResultsAreasTab.vue`; gemeinsame Helfer/Charts in `results/resultsShared.js`, gemeinsames Styling in `results/results-shared.css`. |
| `SimulationReportExport.vue` | „PDF"-Button im Ergebnis-Modal: 4-seitiger A4-Bericht (jsPDF). |
| `SimulationDebugModal.vue` | Power-User: rohe generierte `.inp` + roher `.rpt`-Report. |
| `ElementPropertiesModal.vue` | **Nur ERSTELLEN** neuer Elemente aus dem Editor. Bearbeiten läuft über `ElementInfo.vue` im Viewer. |
| `ProjectManagerModal.vue` | Projekte speichern/laden/löschen (IndexedDB via `services/ProjectService.js`), mit Lade-Bestätigung. |
| `IsybauHelpModal.vue` | Statische Bedienungsanleitung. |
| `common/DraggableModal.vue` | Wiederverwendbarer Rahmen: verschieb-/resizebares Fenster. |

## Tutorial (Kanaltaucher-Ratte)

Maskottchen unten rechts: geführte Tour startet 5 s nach jedem Seitenladen
(einfach wegdrückbar, keine Persistenz), danach reaktive Kommentare auf
User-Aktionen.

| Datei | Verantwortung |
|---|---|
| `tutorial/tutorialSteps.js` | **Alle Inhalte deklarativ:** Tour-Sequenz + reaktive Steps (Texte, Moods, `highlight`-Anker, `advanceOn`-Bedingungen, `info`-Keys). Neue Schritte NUR hier registrieren. |
| `tutorial/tutorialInfo.js` | **Lernstoff für Studenten** („Mehr dazu"-Karten): Einträge `{ title, blocks }` mit Block-Typen `p`/`formula`/`ref`; Steps referenzieren per Key, Mehrfachnutzung erwünscht. |
| `tutorial/TutorialInfoCard.vue` | Terminal-Style-Lernkarte über der Bubble; rendert die Blocks (Formel-Box, Norm-Verweis), scrollbar. |
| `tutorial/useTutorialGuide.js` | Zustandsmaschine (Singleton): `startTour/next/skipTour/trigger/dismiss/resetAndStartTour/toggleInfo`; Lernkarte (`infoOpen`) schließt bei jedem Step-Wechsel automatisch. |
| `tutorial/useTutorialTriggers.js` | Beobachtet den Store (Import, Regen, Simulationsstatus) und feuert `trigger()` — der Store bleibt tutorial-frei. |
| `tutorial/useHighlight.js` + `tutorial.css` | Setzt den Terminal-Glow auf `[data-tutorial="…"]`-Anker (Sidebar, SimulationControls, EditorToolbox, View-Switcher). |
| `tutorial/TutorialMascot.vue` | Ratte (Lottie) + Terminal-Sprechblase mit Typewriter und Tour-Buttons; einmal in `IsybauMain.vue` gemountet. |
| `tutorial/moods.js` | Mood→Lottie-Pfad (`/public/saintv1d/tutorial/rat_*.json`) + Fetch-Cache; fixt das `e:0`-Embedded-Flag der Exporte. |

Neustart: Hilfe-Modal → „Tutorial starten".

## Hilfs-Utilities

- `utils/mappings.js` — ISYBAU-Zahlencodes ↔ Klartext (Flächenart, Bauwerkstyp, Material→Rauheit).
- `utils/RainModelService.js` — Regenreihen-Mathematik (Blockregen, Euler-II).
- `utils/KostraService.js` — proj4-CRS-Definitionen + KOSTRA-API-Aufruf.

## Tests

```bash
cd client
npm run test        # Vitest, alle isybau-Tests
```

- `test/*.test.js` — Domain, Store, Builder (inkl. Snapshot-Golden-Master), RptParser,
  SwmmOutParser (synthetische Binärdatei), ResultsAssembler, runoffValidation, xmlParser (jsdom).
- Fixtures in `test/fixtures/` (`default.rpt`, `debug_report.rpt`), `test/test.xml`.
