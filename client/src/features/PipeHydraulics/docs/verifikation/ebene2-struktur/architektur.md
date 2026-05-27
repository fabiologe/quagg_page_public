---
name: Ebene 2 — Architektur
tags: [verifikation, ebene-2, architektur, dependency-graph]
---

# Modul-Architektur & Dependency-Graph

← [[index|Ebene 2 Index]]

---

## Modul-Übersicht

```
useBridgeHydraulics.js          ← Keine Abhängigkeiten (reine Physik-Engine)
  Exports: calculateAtWSP, generateRatingCurve, findWSPForQ,
           interpZ, interpBridgeZ, bokRefZ, customProfileGeom

useBridgeRenderer.js            ← importiert: useBridgeHydraulics
  Exports: buildZ1Vertices, buildZ1SegmentData, buildZ2Vertices

useBridgeStore.js (Pinia)       ← importiert: useBridgeHydraulics
  State:    terrainPoints, bukProfile, bokProfile, kstZones,
            slope, wsp, wspMin, wspMax, ratingSteps,
            mu, muDeck, zeta, nPiers, bPier, flowMode, wspUW
  Computed: calcParams → currentResult [sofort]
            ratingCurve [10 s debounced]
  Methods:  save / load / undo / redo / exportProject / importProject
            addPoint / movePoint / deletePoint / clearLayer / setLayer
            addKstZone / removeKstZone / updateKstZone

useBridgeValidation.js          ← importiert: Store + Hydraulics + Renderer
  Exports: errors, warnings, isValid, allErrorMarkers, allWarningMarkers

useProfileInteraction.js        ← importiert: Store + Hydraulics + Renderer
  Exports: Viewport, Transforms, LayerControl, InteractionState, EventHandlers

Vue Components:                 ← importieren alle obigen
  BridgeProfileEditor.vue   — Profil-SVG, Drag-Interaktion, Segment-Farbcodierung
  BridgeInputPanel.vue      — Parameter-Eingabe, Q→WSP-Inversion
  BridgeResultsPanel.vue    — Ergebnisse, Ratingkurve, Validierungsanzeige
  BridgePrintModal.vue      — Druckansicht
  BridgeHydraulicsInfoModal — Markdown-Info/Tutorial
```

---

## Dependency-Graph (azyklisch)

```
useBridgeHydraulics  ←─────────────────────────────────┐
       ↑                                                │
useBridgeRenderer   ←── useBridgeValidation            │
       ↑                        ↑                      │
       │              useProfileInteraction ←── useBridgeStore
       │                        ↑                      ↑
       └────────────── Vue Components ─────────────────┘
```

**Reihenfolge in Worten:**
```
Hydraulics ← Renderer ← Validation
Hydraulics ← Store
Hydraulics ← Renderer ← Interaction ← Store
Alle       ← Vue Components
```

**Vorteil:** Kein Zyklus. Ein Hydrauliker kann `useBridgeHydraulics.js` vollständig
prüfen ohne eine einzige andere Datei zu kennen — das ist die wichtigste
architektonische Eigenschaft für Verifikation.

---

## Verantwortungstrennung

| Modul | Fachliche Zuständigkeit |
|-------|------------------------|
| `useBridgeHydraulics` | Physik: Formeln, Zustandslogik, Numerik |
| `useBridgeRenderer` | View: Weltkoordinaten → SVG-Vertices |
| `useBridgeStore` | Zustand: Persistenz, Undo/Redo, Reaktivität |
| `useBridgeValidation` | Qualität: Geometrie-Checks, Warnungen |
| `useProfileInteraction` | UX: Drag, Zoom, Pan, Segment-Klick |
| Vue Components | Komposition: alle obigen zusammengeführt |

Physik, Darstellung und Zustand sind orthogonale Konzepte — ein Hydrauliker
muss nur `useBridgeHydraulics.js` verstehen.
