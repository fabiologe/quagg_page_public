# 1D-Ergebnis-Pipeline, Netz-Editor-UX, Sonderbauwerke & QA-Start — Umsetzungsbericht

**Datum:** 2026-07-08 · **Status:** Phasen R, V, E, P umgesetzt und verifiziert; QA-Kampagne (Q) gestartet
**Plan:** Fahrplan nach erfolgreicher SWMM⇄LISFLOOD-Kopplung (R→V→E→P→Q)

---

## Phase R — 1D-Ergebnisse Backend→Client (e2e-verifiziert)

- **`handler.py`**: stdlib-Reader für die SWMM-Binärausgabe (`read_swmm_out`, Format output.c —
  ACHTUNG Property-Records sind Mischformat `int32 type + float32…`, Typ als float gelesen macht
  outfall→junction). Nach gekoppeltem Lauf: `network-results.json` (Serien je Knoten/Haltung +
  Systembilanz inkl. `storedVolume`) → `done_payload.networkResultsFile`; `[COUPLE]`-Finalize-Zeilen
  → strukturiertes `couplingBudget {to2d,to1d,debt,nodes}`. Stride-Ausdünnung > 6 M Werte.
- **Voraussetzung**: `[REPORT] NODES ALL / LINKS ALL` — ohne Flag schreibt SWMM KEINE Serien in
  die .out (Default NONE). In `SwmmBuilder` (addTitle) und allen Test-INPs ergänzt.
- **Client-Kette**: `RunpodBackend` (`NETWORK_RESULT`/`COUPLING_BUDGET`-Events) → Runner-Cases →
  `useSimulationStore` (`networkResults`, `couplingBudget`, **`massReport` jetzt auch im Store**) →
  `useResultDataBridge` (Meta-Record; kein Per-Frame-Overhead) → Projekt-Zip (`results/network1d.json`).
- **Tests**: `test_swmm_out_reader.py` (echte .out aus Container-SWMM), erweiterter
  `test_coupling_roundtrip.py` (Checks 7: networkResultsFile + Budget im done-Event).

## Phase V — Visualisierung im Viewer

- **`composables/viewer/useNetworkResults.js`**: pure Kerne `buildNetworkSeries`, `timeIndexAt`
  (2D-Frame ↔ 1D-Report-Step, Treppen-Halten), `networkStateAtTime` (Füllgrad/Überstau je Element).
  Test: `test_network_results.mjs`.
- **`NetworkResultsPanel.vue`** (Muster WeirResultsPanel): System-Tab (Volumen im Netz,
  Zufluss/Auslass/Überstau, Kopplungsbudget- + 2D-Massenbilanz-KPIs) und Element-Auswahl
  (Dropdown, synchron mit 3D-Picking via `net.selectedId`); Chart.js mit Frame-Cursor.
- **3D-Animation**: `useNetworkRenderer.applyResults(state)` — Haltungen füllgrad-gefärbt
  (grau→wasserblau, capacity≥1 rot), Schächte mit skalierter Wassersäule (invert→Wasserstand),
  Überstau orange + Emissive. `ResultMap3D` bekommt `networkState`-Prop; `ResultViewerMain`
  berechnet ihn pro `currentFrame`.

## Phase E — Editor-UX

- **Undo/Redo**: `useNetworkStore`-CRUD ruft `notifyPreMutate`; `useHistoryManager` erfasst/
  restauriert `net {nodes,links}` atomar mit (Alt-Snapshots ohne `net`-Feld kompatibel).
- **Schacht-Drag**: neues Singleton `useNetworkNodeTool` (tools-Map `NET_NODE`): mousedown auf
  Schacht → Kamera-Freeze (sync-Watcher, Muster Brücke), onMove nur Mesh-Vorschau
  (`renderer.previewNodePosition`, kein History-Spam/Re-Render), Drop = EIN `updateNode` mit
  Terrain-Resample (rim=Gelände, Tiefe bleibt). Klick-Unterdrückung gegen Platzierungs-Popup.
- **Haltungs-Ziehen**: Rubber-Band-Vorschau (gestrichelt; gesnappt=Lime) + **Auto-Schacht** bei
  Klick auf leeres Gelände (Tiefe 2 m).
- **Validierung** (`NetworkModel.validate`, Test `test_network_validate.mjs`): Sohle>Deckel,
  Gegengefälle (z1/z2-bewusst, `open` ausgenommen), Nullängen, isolierte Knoten, Teilnetz ohne
  Outfall (Union-Find), Sonderbauwerk ohne abgehende Haltung. Anzeige live in `NetworkTable`
  („Prüfung“-Sektion, `IssueList`).

## Phase P — Sonderbauwerke (Pumpe/Wehr/Drossel)

- Rollen im `NetNodeTool` wählbar (+Hinweis „braucht abgehende Haltung“); `NetworkPropertyPanel`
  mit rollen-spezifischen Blöcken (Pumpe: Förderleistung/EIN/AUS; Wehr: Schwelle/Breite;
  Drossel: Q) + Warnbox ohne Abgang. `toSwmmStore` reicht die Parameter durch.
- Renderer markiert Sonder-Links (Haltung ab Pumpe/Wehr/Drossel) in Rollenfarbe.
- Test: `test_swmm_special_links.mjs` ([PUMPS]+[CURVES]/[WEIRS]/[ORIFICES] aus Editor-Netz).

## Phase Q — QA-Kampagne (gestartet): zwei echte Bug-Funde am ersten Tag

1. **SwmmBuilder [PUMPS]-Spalten vertauscht** (`OffCutoff OnCutoff` statt SWMM-Ordnung
   `Startup Shutoff`): **jede** exportierte Pumpe brach den SWMM-Start mit ERROR 122 ab.
   Gefixt + Regressions-Check im Export-Test.
2. **Pumpensumpf-Pathologie**: Pumpe an SWMM-JUNCTION friert dauerhaft ein, wenn ein
   Zufluss-Slug die Förderleistung übersteigt (Preissmann-SLOT pressurisiert auf >20 m,
   Q=0 für immer — **standalone reproduziert**, kein Kopplungs-Bug). Fix: Pumpen-Knoten
   exportiert immer als `[STORAGE]`-Nassschacht (Default 4 m² Sohlfläche via `volume`,
   `bauwerkstyp=6` hält den [PUMPS]-Link). 
- **`test_coupling_pump.py`**: Senke → Pumpe → Druckleitung BERGAUF → Outfall. Physik-Assertions:
  Senke leergepumpt (0.008 m), 68.4 m³ bergauf geliefert (nur via Pumpe möglich), P1 mit 80 l/s
  in der 1D-Serie, Budget konsistent.

### QA-Matrix — Stand

| Edge-Case | Status |
|---|---|
| Roundtrip 2D→1D→Outfall→2D, Massenbilanz, Phantom-Wasser | ✅ `test_coupling_roundtrip.py` |
| Pumpe gekoppelt (Slug, bergauf, Zyklus) | ✅ `test_coupling_pump.py` |
| 1D-Serien-Decode (echte .out) | ✅ `test_swmm_out_reader.py` |
| Geometrie-Edges (Gegengefälle, Nullänge, Teilnetz, Sohle>Deckel) | ✅ `test_network_validate.mjs` (statisch) |
| Sonderbauwerk-Export | ✅ `test_swmm_special_links.mjs` |
| Rückstau vom Outfall / Wehr rückwärts gekoppelt | ⬜ offen |
| Trockenes Netz (kein Regen) gekoppelt | ⬜ offen |
| SWMM-standalone vs. gekoppelt (Regression-Anker) | ⬜ offen |
| Projekt-Roundtrip MIT 1D-Ergebnissen (Zip) | ⬜ offen (Code da, Test fehlt) |
| Großnetz 10⁴ Elemente (Render-Performance) | ⬜ offen |
| Manuelle App-Session: Netz zeichnen → Regen → Lauf → Viewer | ⬜ offen (braucht laufende App/RunPod) |

**Bekannte Alt-Leichen (unabhängig):** `test_inputgenerator.mjs`, `test_rastertools*.mjs`
verweisen auf längst verschobene Module (ERR_MODULE_NOT_FOUND) — löschen oder reparieren.

## Verifikation (alles grün, 2026-07-08)

- `npx vite build` ✓ · alle flood-2D-Node-Tests ✓ (außer 3 Alt-Leichen s.o.)
- Docker: `test_swmm_native.py` ✓ · `test_swmm_out_reader.py` ✓ · `test_coupling.py` ✓ ·
  `test_coupling_roundtrip.py` ✓ · `test_coupling_pump.py` ✓ (Image `lisflood-fp:latest` neu gebaut)
