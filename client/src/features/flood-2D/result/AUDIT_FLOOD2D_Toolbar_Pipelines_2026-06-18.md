# AUDIT Flood-2D — Toolbar, Pipelines, Physik, Performance, Architektur

**Datum:** 2026-06-18
**Fokus:** `client/src/features/flood-2D` (Editor + 3D-Viewer) ⟷ `backend/app/api/flood2D` (RunPod/Docker-LISFLOOD-FP)
**Sibling:** `result/AUDIT_LISFLOOD82_Physik_und_Wehre.md` (2026-06-13)

> **Methode & Vertrauensgrad:** 3 Explore-Agents (Editor/Toolbar, Physik-Middleware, Backend/Viewer)
> + direkte Code-Verifikation der folgenreichsten Behauptungen gegen Datei:Zeile und gegen die
> LISFLOOD-Quelle (`backend/.../LISFLOOD-FP-trunk`). Befunde markiert:
> **[V]** = am Code verifiziert · **[A]** = Agent-Befund, plausibel aber nicht einzeln nachgeprüft ·
> **[FA]** = widerlegter / entschärfter Fehlalarm.

---

## 0. TL;DR — Gesamtbewertung

| Dimension | Note | Kurzbegründung |
|---|---|---|
| **Physikalisch korrekte Abbildung** | **8.5 / 10** | Kernhydraulik (Poleni-Wehr, Orifice-Brücke, SGC, Manning, Q-Flux-Split, Regen mm/h) gegen Solverquelle verifiziert korrekt. Lücken: zellweise Wehrkrone, Hazard-Formel intransparent, kein harter CFL-Gate. |
| **Solver-Interpretation korrekt** | **8 / 10** | Dateiformate/Einheiten/Weltkoordinaten/Staggering verifiziert. Offen: Wehr-Q-Einheit (`Q_UNIT_FACTOR`) self-TODO, Hazard-Kanal-Semantik undokumentiert, deploytes 8.0.3 ≠ Client-Baum. |
| **Professionalität / bis ans Ende gedacht** | **6 / 10** | Viele Features „shippen", aber mit offenen Kanten: Culvert ohne Validierung, Texture-Export-Pfad unklar, IndexedDB-Hydrierung blockiert Main-Thread, Tool-State nicht in Pinia, Dual-Storage. TODO-Kommentare in ausgelieferten Pfaden. |
| **Performance** | **6.5 / 10** | Solver/Codec ok. Editor-Renderpfad (Deep-Watcher-Kaskade) und Undo-Snapshots (volle Float32Array) sind die zwei realen Engpässe. |
| **Wartbarkeit / Architektur** | **6 / 10** | Starke Modul-Trennung (composables/viewer, services/solver), aber Code-Duplikation (Bresenham/Index-Konvertierung), 1500-Zeilen-Dateien, zwei Wehr-Speicherwege. |
| **Relevanz** | **9 / 10** | Browser-3D-Editor + echter LISFLOOD-FP auf GPU-RunPod ist ein echtes Alleinstellungsmerkmal; Datenfluss Editor→Solver→Viewer funktioniert end-to-end. |

**Gesamt-Entwicklungsstand: ~7.0 / 10** — „fortgeschrittenes Beta": physikalisch glaubwürdig und
end-to-end lauffähig, aber mit klar lokalisierbaren Reife-/Robustheitslücken bevor man es einem
externen Ingenieur-Kunden ungeschult in die Hand gibt.

---

## 1. Pipeline-Landkarte

```
TOOLBAR (EditorToolbar.vue)
  │ setTool() → useSimulationStore.activeTool
  ▼
EDITOR-TOOLS (components/tools/*, composables/editor/*)
  │ schreiben Geometrie → useGeoStore (terrain, modifications, weirs, weirLines, bridges, boundaries, nodes, culvertLinks)
  │ Render: useLayerRenderer (Three.js, 12× deep-watch)
  ▼
INPUT-GENERIERUNG / PHYSIK (middleware/*, utils/*)
  │ InputGenerator (1571 Z) → .par/.bci/.bdy/.weir/.rain + SGC + DEM-Export
  │ Rasterizer, SgcGenerator, weirGeometry, Bridge*Lattice, ScenarioValidator
  ▼
SOLVER-SERVICE (services/solver/*)
  │ RunpodBackend → runpodTransport → RunPod-Serverless ; resultCodec ; Mock/Wasm-Pfade
  ▼
BACKEND (backend/app/api/flood2D)
  │ docker_engine → Container → handler.py (570 Z) → LISFLOOD-FP 8.0.3 (+ quagg-weir-flow.patch)
  │ encode_wd: depth/elev/vx/vy(+SGC)/qx/qy ent-staggert → codec → JSONL-Heartbeat
  ▼
ERGEBNIS-PIPELINE (composables/viewer/*, components/viewer/*, views/ResultViewerMain.vue)
  │ useResultDataBridge (IndexedDB) → useWaterSurface / useFlowArrows / useFlowStreamlines /
  │ useDangerMarkers / useWeirResults → ResultMap3D
```

---

## 2. Bewertung pro Toolbar-Tool

Reife 1–10; „Physik" nur wo das Tool physikalische Größen erfasst. Quelle: `EditorToolbar.vue` + Tool-/Composable-Dateien.

| Tool | Reife | Physik | Hauptbefund | Status |
|---|---|---|---|---|
| **SELECT / PAN** | – | – | Infrastruktur, ok | ✅ |
| **DRAW_POLY (Gebäude)** | 6 | ok | Nur Footprint, keine Höhe; Maskierung als NoData (korrekt, `Rasterizer`); zwei Datenquellen (`modifications` vs `buildings`-computed) **[V]** | brauchbar |
| **WEIR – LINE (2-Klick)** | 6 | **gut [V]** | Poleni/hc-absolut/Weltkoord verifiziert korrekt; `hc` wird pro Segment gelesen **[FA-widerlegt]**; keine Öffnung im LINE-Modus | brauchbar |
| **WEIR – POLYLINE** | 7 | gut | Editierbare Linie = Source-of-Truth, Zellen abgeleitet (`_syncWeirCells`) **[V]**; per-Zelle-hc-Feld existiert, wird im v8-Export aber auf `first.hc` reduziert (**R3**) | gut |
| **NODE / Source** | 5 | teilw. | Q-Quelle; **keine Koordinaten-Validierung** gegen aktuelles Grid nach DEM-Wechsel **[A]** | lückenhaft |
| **SHOVEL (RAISE/LOWER/ANCHOR)** | 7 | gut | Stärkstes Editier-Tool, ANCHOR/IDW-Bathymetrie; Perf: IDW pro Frame ungecacht, Undo-Snapshot = **volle Float32Array [A]** | gut, Perf-Schuld |
| **BOUNDARY (Q/H/FREE)** | 6 | gut | Grid-Snap-Cache nach Crop veraltet **[A]**; keine Konflikt-Detektion bei Kreuzung; interner FREE = HFIX(terrain−0.01) (**R1**) **[V, bestätigt im Bestands-Audit]** | brauchbar |
| **CULVERT (1D/2D BMI)** | 3–4 | schwach | Länge nicht aus Knoten berechnet, **keine Validierung** (Ø>0, z_out<z_in); nur v5/BMI-Pfad | **unfertig** |
| **BRIDGE – LINE** | 5 | mittel | Sohle = DEM-Mittel statt Min entlang Achse **[A]**; benötigt SGC darunter (dokumentiert, korrekt geclippt) | brauchbar |
| **BRIDGE – MESH3D** | 6 | gut | Anspruchsvoller Lattice-Editor (`useBridge3DTool` 1157 Z); State `reactive({})` **nicht in Pinia** → Residual-Watcher beim Tool-Wechsel **[A]** | ambitioniert |
| **TEXTURE (Manning-n)** | 5 | ok | Rauheit malen; **Export-Pfad unklar** (wie landet das Grid in InputGenerator?); Vertex-Farben nach Crop stale **[A]** | lückenhaft |
| **CROP** | 7 | – | Funktioniert; Undo speichert vollständiges altes DEM (Memory-Peak) **[A]** | gut, Perf-Schuld |
| **BATHYMETRIE (Modal)** | 7 | gut | DGM+Vermessung Preprocessing, SGC-Raster-Vorschau (`useSgcRasterPreview`) | gut |

**Toolbar-Querbefunde:**
- **Dual-Storage Wehre [V]:** klassische 2-Klick-Wehre → `weirs` (lineId=null); Polylinien → `weirLines` + abgeleitete `weirs`. Kohärent designt (Doku in `useGeoStore.js:283-308`), aber zwei Pfade, die der Export per `lineId` unterscheiden muss. Komplexitäts-Smell, kein Bug.
- **Tool-State außerhalb Pinia [A]:** `bridge3DState`, `weir3DState` als `reactive({})` → keine garantierte Bereinigung bei Tool-Wechsel.

---

## 3. Bewertung pro Pipeline

### P1 — Editor → Store → Render (Geometrieerfassung) · **Reife 6.5**
- **Stark:** breites, funktionsreiches Toolset; generischer Greifpunkt-Editor (`useControlPointEditor`) als wiederverwendbares Modul.
- **Real-Engpass [V]:** `useLayerRenderer.js` registriert **12× `deep:true`** (Zeilen 781–821), 3× `immediate:true` → Startup rendert Geometrie mehrfach, jeder Geo-Edit triggert 2–3 Renderpässe. Bei vielen Gebäuden/Wehrpunkten spürbares UI-Lag.
- **Memory [A]:** Undo-Historie (`cropTerrain`, `maskTerrainByPolygon`, Shovel) speichert komplette `gridData`-Kopien.
- **Architektur:** Index-Konvertierung top-down↔bottom-up (`(nrows-1-r)*ncols+c`) **3×** dupliziert **[V: useDangerMarkers:80, useWeirResults:92, + useFlowArrows]**.

### P2 — Input-Generierung / Physik · **Reife 8.5 · Physik 9** (stärkste Schicht)
- **Verifiziert korrekt [V, gegen LISFLOOD-Quelle]:** Wehr-Weltkoordinaten (`input.cpp:165`), hc absolut [m NHN], Poleni-Freiabfluss/Rückstau, Orifice-Brücke (Soffit absolut), Regen mm/h (`input.cpp:2111`), Infiltration m/s, Q-Flux-Split (Σ=Q), SGC bed<bank/width>0, 4-connected wasserdichte Strukturlinien (`weirGeometry.js`).
- **Offene Risiken (aus Bestands-Audit, weiterhin gültig):**
  - **R1** interner FREE-Auslass = HFIX(terrain−0.01) → kann inneren Abfluss drosseln (`InputGenerator.js:16`).
  - **R2** **kein harter CFL-Gate** vor Versand — nur UI-Warnung; zu großes dt → negative Tiefen.
  - **R3** Wehrkrone zellweise nicht abgebildet (v8 nutzt `first.hc` für ganze Linie).
- **Spaghetti:** `InputGenerator.js` = **1571 Zeilen**; `discretizeStructureAxis` vs `discretizeWeirPolyline` implementieren beide 4-connected-Bresenham getrennt → gemeinsames Kernmodul fehlt.

### P3 — Backend-Solver / Docker · **Reife 8 · Solver-Interpretation 8**
- **Stark:** LISFLOOD-FP 8.0.3 + `quagg-weir-flow.patch` (SGC-Fallback, NaN-/Div0-Guards); robuste Race-Guards in `scan_frames` (wartet auf Vx/Vy/Qx/Qy, Final-Pass holt verworfene Frames nach); Heartbeat über `res.mass`; Snap-Docker-Kill-Workaround dokumentiert; Velocity-Ent-Staggerung + SGC-Kanal-Überschreibung **dokumentiert korrekt [V]**.
- **Schwächen:**
  - **Hazard-Formel nicht im Handler sichtbar** — Kanal wird nur durchgereicht/kodiert; Semantik (h·v? Defra?) undokumentiert. **[A]**
  - **8.0.3 ≠ Client-Baum/„8.2"** — der ausgelieferte Solver weicht vom im Client referenzierten Stand ab (Bestands-Audit).
  - `_mid`-Kantenmittel an Wänden ist **bewusster Visualisierungs-Kompromiss [FA-entschärft, V]** (`handler.py:131-144` Docstring), kein Bug — sollte als „nicht physikalische Wandgeschwindigkeit" gekennzeichnet bleiben.
  - 35 Zeilen Regen-Diagnostik im Hot-Path; PAR-Keywords hardcoded.

### P4 — Solver-Service / Transport · **Reife 7.5**
- **Stark:** saubere Backend-Abstraktion (`SolverBackend` + Runpod/Wasm/Mock), exponentielles Backoff, Inaktivitäts-/Absolut-Timeouts, Presigned-URL-Auflösung für Dev.
- **Schwächen:** `resultCodec`/`codec.py` doppelte Buffer-Kopie pro Kanal/Frame (Memory-Hotspot, minor) **[A]**; Binary-Fetch-Timeout hart 120 s; Velocity-Kanal-Semantik (vx/vy vs „velocity") nicht dokumentiert.

### P5 — Ergebnis / Viewer · **Reife 7**
- **Stark:** `useWaterSurface` (nass-gated Smoothing, Überström-Lamelle an Wehren, Spike-Deckel, 3 Färbemodi), `useFlowStreamlines` (RK2/Heun + Jobard-Lefer korrekt **[V-konzeptuell]**), `useFlowArrows`, `useDangerMarkers`.
- **Reale Lücken:**
  - **Wehr-Q-Einheit unverifiziert [V]:** `useWeirResults.js:29` `Q_UNIT_FACTOR=1.0` trägt selbst ein ⚠️-TODO „MUSS gegen res.mass verifiziert werden" (m³/s vs m²/s). Bis dahin sind absolute Q-Werte im WeirResultsPanel mit Vorbehalt.
  - **IndexedDB-Hydrierung blockiert Main-Thread [A]:** synchrone Deserialisierung großer Frame-/Terrain-Sätze in `useResultDataFromOpener` → Browser-Freeze bei großen Läufen; Web-Worker fehlt.
  - Turbulenz/Gischt empirisch (kein Froude) — visuell ok, nicht physikalisch.
  - `useDangerMarkers:81` `min(robustMax, depth)` ist **konsistent mit der gekappten Anzeige-Oberfläche [FA-entschärft, V]** (`:62` Doku), kein Typo.

---

## 4. Explizit widerlegte / entschärfte Fehlalarme (Rigor-Nachweis)

| Behauptung (Agent) | Befund |
|---|---|
| `addWeirBatch` „hc wird ignoriert (KRITISCH)" | **Falsch [V]** — `useGeoStore.js:274` liest `parseFloat(weir.hc)` pro Segment; Segmente tragen `hc` laut Signatur (`:261`). |
| `handler.py _mid` „physikalisch falsch" | **Entschärft [V]** — bewusster, im Docstring (`:131-144`) begründeter Visualisierungs-Kompromiss an Wänden. |
| `useDangerMarkers:81` „Typo, sollte robustMax" | **Entschärft [V]** — `min(robustMax, depth)` entspricht exakt der gekappten Wasserhaut (`:62` Doku). |
| Wehr-Koordinaten/Regen-/Infiltrations-Einheiten falsch (älteres Audit) | **Bereits widerlegt** gegen Solverquelle (Bestands-Audit §2). |

---

## 5. Priorisierter Remediation-Backlog

**P0 — Korrektheit/Vertrauen (klein, hoher Hebel)**
1. **R2 harter CFL-Gate** vor Upload: `dt ≤ cs/√(g·h_max)` als blockierende Validierung statt nur UI-Warnung (`InputGenerator`/`Flood2DSolverRunner`).
2. **Wehr-Q-Einheit verifizieren** gegen `res.mass` und `Q_UNIT_FACTOR` final setzen (`useWeirResults.js:29`); Regressionstest `test_weir_results.mjs` erweitern.
3. **Hazard-Formel dokumentieren** (Handler/Viewer-Legende): welche Definition liefert der Solver?

**P1 — Performance/Robustheit**
4. `useLayerRenderer` Deep-Watcher → flache Watcher + gezielte Re-Render-Callbacks (12× `deep:true` abbauen).
5. Undo-Historie auf **Patches** (geänderte Zell-Indizes) statt voller `gridData`-Kopien.
6. IndexedDB-Hydrierung in **Web-Worker** (Result-Viewer Freeze beheben).

**P2 — Architektur/Vollständigkeit**
7. Gemeinsames `discretizeWatertightLine`-Kernmodul (Bresenham-Duplikat v5/v8 + WeirResults).
8. Eine top-down↔bottom-up-Index-Utility (3× Duplikat eliminieren).
9. **Culvert-Tool** fertigstellen: Länge auto, Validierung (Ø>0, z_out<z_in, n>0).
10. **Texture-Export-Pfad** dokumentieren/verdrahten; Vertex-Farben nach Crop neu binden.
11. Tool-State (`bridge3DState`/`weir3DState`) in Pinia + sauberes Teardown beim Tool-Wechsel.

---

## 6. Verifikation der Befunde (für Folgearbeit)

- **Physik gegen Solverquelle:** `backend/app/api/flood2D/engines/LISFLOOD-FP-trunk/{input,weir_flow,fp_flow,sgc}.cpp` — die zitierten Zeilen erneut prüfen, wenn der Solver auf 8.2 gehoben wird.
- **Wehr-Q-Einheit:** Real-Lauf dumpen, `Σ qNormal` über Wehrzellen gegen `res.mass`-Bilanz vergleichen.
- **Render-Perf:** Editor mit ~100 Gebäuden + 50-Punkt-Wehrlinie laden, Frame-Zeit vor/nach Watcher-Umbau messen.
- **Bestehende Tests:** `test_inputgenerator_v8.mjs`, `test_structure_discretize.mjs`, `test_weir_results.mjs`, `test_sgc.mjs`, `verify_all_channels.py` — als Regressions-Basis nutzen.
