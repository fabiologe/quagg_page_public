---
name: Ebene 2 — Datenfluss
tags: [verifikation, ebene-2, datenfluss, reaktivitaet, debounce]
---

# Datenfluss

← [[index|Ebene 2 Index]]

---

## Vollständiger Datenfluss

```
User-Aktion (Drag / Input)
  │
  ├─→ store.wsp / store.slope / store.bukProfile / store.kstZones ...
  │     │
  │     ├─→ calcParams (computed, gebündeltes Eingabe-Objekt)
  │     │     │
  │     │     ├─→ currentResult = calculateAtWSP(calcParams)
  │     │     │   sofort reaktiv, kein Debounce (~0.1ms pro Berechnung)
  │     │     │
  │     │     └─→ ratingCurve = generateRatingCurve(...)
  │     │         10 000 ms debounced (31× calculateAtWSP pro Aufruf)
  │     │
  │     ├─→ z1Segments = buildZ1SegmentData(terrain, buk, bok, wsp)
  │     │   reaktiv, kein Debounce (nur Geometrie, keine Hydraulik)
  │     │
  │     └─→ errors/warnings = useBridgeValidation()
  │         reaktiv, kein Debounce
  │
  └─→ save()
        ├─→ localStorage [100 ms debounced]
        └─→ historyStack [450 ms debounced]
```

---

## Debounce-Strategie

### currentResult — sofort reaktiv

`calculateAtWSP()` ist eine einzelne Berechnung (~0.1ms).
Sofortige Reaktivität gibt dem Ingenieur Live-Feedback beim WSP-Drag.
Kein Debounce nötig.

### ratingCurve — 10 000 ms debounced

`generateRatingCurve()` ruft `calculateAtWSP()` (steps+1)-mal auf.
Bei `ratingSteps = 30` → 31 Berechnungen pro Aufruf.
Als `computed` würde das bei jedem WSP-Drag-Tick feuern (50–100×/s → UI-Freeze).

```javascript
// useBridgeStore.js
let _ratingTimer = null
watch([calcParams, wspMin, wspMax, ratingSteps], () => {
  clearTimeout(_ratingTimer)
  _ratingTimer = setTimeout(() => {
    ratingCurve.value = generateRatingCurve(...)
  }, 10000)
})
```

Aktualisiert sich erst wenn der User 10s keine Parameter mehr ändert.

### localStorage — 100 ms debounced

Schützt vor hunderten localStorage-Writes bei Mousemove-Drag.
Schnell genug, dass kein Datenverlust bei Browser-Absturz entsteht.

### historyStack — 450 ms debounced

Ein Undo-Schritt soll einer "Eingabe-Pause" entsprechen — nicht jedem
einzelnen Drag-Pixel. 450ms ist die typische Pause zwischen Tastatureingaben,
ab der ein neuer Intent beginnt.

---

## Reaktivitäts-Sequenzdiagramm

```
Drag WSP-Slider (50 Events/s)
│
├─ Tick 1:  currentResult    →  sofort neu    ✓
│           ratingCurve      →  Timer reset   (wartet)
│           localStorage     →  Timer reset   (wartet)
│           historyStack     →  Timer reset   (wartet)
│
├─ Tick 2–N: dasselbe
│
└─ Pause > 10s:
   ratingCurve      →  neu berechnet  ✓
   Pause > 450ms:
   historyStack     →  Snapshot       ✓
   Pause > 100ms:
   localStorage     →  gespeichert    ✓
```
