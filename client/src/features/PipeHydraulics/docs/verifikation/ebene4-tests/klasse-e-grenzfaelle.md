---
name: Klasse E — Grenzfälle
tags: [verifikation, ebene-4, klasse-e, grenzfaelle, robustheit]
---

# Klasse E — Grenzfall-Robustheit

← [[index|Ebene 4 Index]]

Stellt sicher dass der Code bei Randbedingungen nicht abstürzt und sinnvoll reagiert.

---

## E.1 — Maximale Pfeiler-Versperrung

```javascript
// φ = 0.95 (Maximum durch min(n·b/L_BUK, 0.95))
const nPiers = 10, bPier = 1.0  // L_BUK = 10m → φ = 1.0 → gecappt auf 0.95

// Erwartung:
result.phi     === 0.95
result.A_netto === result.A_bridge * 0.05   // fast null
result.Q_orifice  > 0   // Übergangskorrektur max() übernimmt
```

`max(Q_orifice, Q_manning_bridge)` soll verhindern dass Q_total auf 0 springt.

---

## E.2 — BOK unter BUK

```javascript
// Physikalisch unmöglich — BOK sollte oberhalb BUK liegen
bukProfile = [{ x: -3, z: 4 }, { x: 3, z: 4 }]
bokProfile = [{ x: -3, z: 3 }, { x: 3, z: 3 }]  // BOK < BUK

// Erwartung:
result.hasOverflow === false   // BOK-Guard verhindert Poleni
// Validierungswarnung: BOK < BUK
```

---

## E.3 — Minimale Überströmungstiefe

```javascript
// WSP knapp über BOK
wsp = bokMin + 0.001  // 1mm Überströmung

// Erwartung:
result.Q_poleni < 0.001  // m³/s — fast null, kein Sprung
result.hasOverflow === true
```

Poleni ∝ h^(3/2) → bei h→0 geht Q_poleni→0 kontinuierlich.

---

## E.4 — BUK mit weniger als 2 Punkten

```javascript
bukProfile = [{ x: 0, z: 3 }]  // Einzelpunkt

// Erwartung:
result.hasBridge === false
result.state     === 0   // Manning, kein Orifice
result.A_bridge  === 0
```

---

## E.5 — Leere Profile

```javascript
// Kein Terrain, kein BUK, kein BOK
crossSectionPoints = []

// Erwartung:
// emptyResult — kein Absturz, kein NaN
result.Q_total   === 0
result.state     === 0
```

---

## E.6 — WSP genau auf BUK-Minimum

```javascript
wsp = Math.min(...bukProfile.map(p => p.z))

// Übergang Manning ↔ Orifice — kein NaN
result.state     === 2   // isSubmerged: wsp >= bukMin (≥)
result.h_drive   >= 0
result.Q_total   > 0
```

---

## E.7 — flowMode-Overrides

```javascript
// Freispiegel erzwungen bei WSP über BUK
params.flowMode = 'free'
params.wsp      = bukMin + 1.0  // WSP deutlich über BUK

// Erwartung:
result.isSubmerged === false
result.state       <= 1
result.Q_orifice   === 0

// Druckabfluss erzwungen bei WSP unter BUK
params.flowMode = 'pressure'
params.wsp      = bukMin - 1.0

// Erwartung:
result.isSubmerged === true
result.state       === 2
```

---

## E.8 — Einzelpunkt-Terrain

```javascript
crossSectionPoints = [{ x: 0, z: 0 }]  // zu wenig für Streifen

// Erwartung:
result.Q_total === 0   // kein Absturz
```

---

## E.9 — Negative Geländehöhen (Tidegebiet)

```javascript
crossSectionPoints = [{ x: -10, z: -5 }, { x: 10, z: -5 }]
wsp = 0  // NN — über Gelände

// Aktuelles Verhalten (Gap 3.3):
// wsp <= 0 → emptyResult → Q = 0  (stiller Fehler!)

// Erwartetes Verhalten nach Fix:
// wsp > terrainMin → Q > 0
```

→ [[../ebene3-gap/03-wsp-guard|Gap 3.3 — WSP-Guard]]
