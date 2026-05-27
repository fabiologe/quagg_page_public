---
name: Klasse D — Sensitivitätsanalyse
tags: [verifikation, ebene-4, klasse-d, sensitivitaet, uq]
---

# Klasse D — Sensitivitätsanalyse & UQ

← [[index|Ebene 4 Index]]

Prüft ob die Parameterabhängigkeiten den analytischen Erwartungen entsprechen.
Wichtig für Uncertainty Quantification (UQ): Welcher Parameter dominiert die Q-Unsicherheit?

---

## Erwartete Sensitivitäten

| Parameter | Variation | Erwartete Q-Änderung | Formel | Zustand |
|-----------|-----------|---------------------|--------|---------|
| kSt | ±20% | ±20% (linear) | Q = kSt · A · R^(2/3) · √I | State 0/1 |
| I | ×4 | ×2 (exakt) | Q ∝ √I | alle |
| μ | ±0.1 | proportional | Q_orifice = μ · ... | State 2/3 |
| Δh | ×4 | ×2 | Q_orifice ∝ √Δh | State 2/3 |
| A | ×2 | ×2 (linear) | Q ∝ A | alle |
| ζ | 0 → 0.5 | μ_eff: 0.80 → 0.743 | μ_eff = μ/√(1+μ²·ζ) | State 2/3 |

---

## Sensitivitätsranking (State 2, typische Brücke)

```
Eingabe-Unsicherheit × Hebel = Q-Unsicherheit

1. A_netto    ± 10% (Geometrie-Unsicherheit)  × linear  → ± 10% Q
2. Δh         ± 15% (WSP-Unsicherheit 0.15m)  × √       → ± 7%  Q
3. μ          ± 0.10 (Literaturstreuung)       × linear  → ± 12% Q  ← dominiert oft
4. kSt-Vorland ± 20%                           × linear  → ± 20% Q_plain (klein)
5. ζ          ± 0.3  (Pfeilerform-Unsicherheit)× nichtlin → ± 4%  Q
```

μ und A_netto dominieren die Q-Unsicherheit bei Druckabfluss.
Bei Freispiegel (State 1) dominiert kSt.

---

## D.1 — kSt-Linearität

```javascript
const Q_base = calculateAtWSP({ ...params, kstZones: [{ kst: 40 }] }).Q_total
const Q_high = calculateAtWSP({ ...params, kstZones: [{ kst: 48 }] }).Q_total  // +20%

// Erwartung (State 0/1):
Math.abs(Q_high / Q_base - 1.20) < 0.001  // exakt linear
```

---

## D.2 — I-Skalierung (√)

```javascript
const Q_1 = calculateAtWSP({ ...params, slope: 0.001 }).Q_total
const Q_4 = calculateAtWSP({ ...params, slope: 0.004 }).Q_total

// Erwartung:
Math.abs(Q_4 / Q_1 - 2.0) < 0.001  // exakt √4 = 2
```

---

## D.3 — μ-Linearität (State 2)

```javascript
const Q_08 = calculateAtWSP({ ...params, mu: 0.80 }).Q_orifice
const Q_07 = calculateAtWSP({ ...params, mu: 0.70 }).Q_orifice

// Erwartung (ζ=0):
Math.abs(Q_07 / Q_08 - 0.70/0.80) < 0.005
```

---

## D.4 — ζ-Korrektur-Überprüfung

```javascript
const Q_0  = calculateAtWSP({ ...params, zeta: 0.0 }).Q_orifice
const Q_05 = calculateAtWSP({ ...params, zeta: 0.5 }).Q_orifice

const mu      = params.mu   // z.B. 0.80
const mu_eff  = mu / Math.sqrt(1 + mu*mu * 0.5)  // = 0.743
const expected = Q_0 * (mu_eff / mu)

// Erwartung:
Math.abs(Q_05 / expected - 1.0) < 0.005
```
