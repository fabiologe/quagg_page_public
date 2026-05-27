---
name: Klasse C — Round-Trip
tags: [verifikation, ebene-4, klasse-c, round-trip, q-wsp]
---

# Klasse C — Q→WSP Round-Trip

← [[index|Ebene 4 Index]]

Beweist: Q→WSP-Inversion (`findWSPForQ`) ist konsistent mit WSP→Q-Berechnung (`calculateAtWSP`).

---

## Grundtest

```javascript
const wsp_target = 3.0  // m

// Vorwärts: WSP → Q
const Q = calculateAtWSP({ ...params, wsp: wsp_target }).Q_total

// Rückwärts: Q → WSP
const wsp_back = findWSPForQ(params, Q, wspMin, wspMax)

// Erwartung:
Math.abs(wsp_back - wsp_target) < 0.01  // m — Toleranz
```

---

## Implementierung von findWSPForQ

```
Phase 1 — Coarse-Scan (50 Intervalle von wspMin bis wspMax):
  Findet das Intervall [wsp_lo, wsp_hi] in dem Q(wsp) den Zielwert kreuzt.
  Notwendig wegen Manning→Orifice-Kink (nicht monoton ohne max()-Glättung).

Phase 2 — Bisection (60 Schritte):
  Toleranz: |wsp_hi - wsp_lo| < 0.001 m
  Konvergiert auf wsp_back.
```

**Numerische Genauigkeit:**
- Coarse-Scan: 50 Schritte → Startintervall ≤ (wspMax-wspMin)/50
- Bisection: 60 Schritte → 2^(-60) · Startintervall ≈ 10^(-18) m

Dominierende Fehlerquelle: Coarse-Scan-Schrittweite, nicht die Bisection.
Bei wspMax-wspMin = 10m → Startintervall = 0.2m → nach 60 Bisections: 0.2·2^(-60) ≪ 0.001m ✓

---

## Kritische Testfälle

### C.1 — Am Zustandsübergang

```javascript
// wsp_target genau am Manning→Orifice-Kink
wsp_target = bukMin + 0.001  // knapp über BUK-Minimum
```

Hier ist `max(Q_orifice, Q_manning)` aktiv — Round-Trip muss trotzdem < 0.01m.

### C.2 — flowMode='pressure' (kein Kink)

```javascript
params.flowMode = 'pressure'
wsp_target = 2.0  // deutlich unter BUK, aber Druckabfluss erzwungen
```

Ohne Kink sollte Round-Trip besonders stabil sein.

### C.3 — Breites, flaches Profil

```javascript
// terrain=[(-50,0),(50,0)], WSP sehr flach
// Q(WSP)-Kurve hat geringen Anstieg → Bisection braucht mehr Schritte
wsp_target = 0.5
```

Prüft ob 60 Bisektionsschritte ausreichend sind (potentiell kritisch bei
sehr flachem Q(WSP)-Verlauf).

### C.4 — Mit Rückstau

```javascript
params.wspUW = 1.5
wsp_target   = 3.0
// h_drive = 3.0 - 1.5 = 1.5 m
```

`findWSPForQ` muss bei aktivem Rückstau ebenfalls korrekt invertieren.

---

## Bekannte Einschränkung

Wenn Q_target > Q(wspMax) oder Q_target < Q(wspMin) → kein Ergebnis im Suchbereich.
`findWSPForQ` gibt in diesem Fall `null` zurück (kein Absturz).
