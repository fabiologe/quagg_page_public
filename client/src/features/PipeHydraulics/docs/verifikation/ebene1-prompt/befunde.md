---
name: Ebene 1 — Befunde
tags: [verifikation, ebene-1, befunde]
---

# Ebene 1 — Befunde

← [[index|Ebene 1 Index]]

---

| # | Sachverhalt | Prompt-Grundlage | Status |
|---|-------------|-----------------|--------|
| 1.1 | **ζ-Korrektur** `μ_eff = μ/√(1+μ²·ζ)` — analytische Ableitung aus Bernoulli | Nur Konzept "ζ·v²/2g" im Prompt, nicht die Formel | ✓ [[zeta-ableitung\|Ableitung geprüft]] |
| 1.2 | **Übergangsglättung** `max(Q_orifice, Q_manning_bridge)` | Nicht im Prompt | ✓ physikalisch vertretbar |
| 1.3 | **z_centroid als Δh-Referenz** | Im Prompt nicht spezifiziert | ✓ Standardpraxis (Bollrich, HEC-RAS) |
| 1.4 | **plainMap-Konzept** (Vorland-Manning bei Druckabfluss) | Nicht im Prompt | ✓ physikalisch korrekt |

---

## 1.1 — ζ-Korrektur

**Prompt (MSG 30, 2026-05-23):**
> "Was das Modell dabei noch nicht abbildet: den Formwiderstand des Pfeilers (ζ · v²/2g). Der geometrische Querschnittsverlust ist korrekt; der zusätzliche Staudruckverlust durch Anströmung des Pfeilers fehlt als ζ-Term in der Bernoulli-Bilanz."

Der Ingenieur hat nur das Konzept genannt. Die KI hat `μ_eff = μ/√(1+μ²·ζ)` selbst abgeleitet.
→ Vollständige Ableitung: [[zeta-ableitung]]

---

## 1.2 — Übergangsglättung

**Nicht im Prompt.** KI hat erkannt: beim Übergang Manning→Orifice entsteht eine Diskontinuität.

```javascript
Q1 = Math.max(Q_orifice_raw, Q_manning_bridge)
```

Bei WSP knapp über BUK liefert `Q_orifice` fast 0 (Δh ≈ 0), während Manning noch
einen realistischen Wert gibt. `max()` verhindert den Sprung.

**Physikalisch:** Vertretbar — kein Modellbruch, nur ein Übergangsartefakt.
**Risiko:** Wenn Diskontinuität physikalisch signifikant wäre, würde max() das verbergen.

---

## 1.3 — z_centroid als Δh-Referenz

**Nicht im Prompt.** Drei mögliche Definitionen für Δh:

| Option | Formel | Eigenschaft |
|--------|--------|-------------|
| BUK-Minimum | `Δh = WSP − min(BUK.z)` | konservativ, überschätzt Q |
| **Zentroid** | `Δh = WSP − z_centroid` | Standardnäherung, < 3% Fehler |
| Vollintegral | `Q = ∫ μ·√(2g·(WSP−z))·dA` | exakt, aufwändig |

KI hat Zentroid gewählt. Fehleranalyse: Δh_fehler ≈ h_öffnung²/(24·Δh).
Bei h_öffn = 2m, Δh = 3m: Fehler ≈ 5.5%.
→ Detailanalyse: [[../ebene3-gap/05-zentroid]]

---

## 1.4 — plainMap (Vorland bei Druckabfluss)

**Nicht im Prompt.** KI hat korrekt erkannt:
Vorland neben der Brücke fließt auch bei eingestautem Hauptgerinne weiter als Freispiegel.

```javascript
// State 2: Orifice + Vorland-Manning
Q1_total = Q_orifice + Q_plain1
```

Strukturelles Problem: `plainMap` wird immer befüllt, aber nur im `isSubmerged`-Branch genutzt.
→ [[../ebene2-struktur/befunde#2.4]]
