---
name: Phase 5 — Pipeline-Verifikation
tags: [prompt-log, ebene-1, ebene-3, pipeline, kst-aggregation, orifice, doppelabzug, schwerpunkt]
date: 2026-05-25
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 51–59
---

# Phase 5 — Pipeline-Erklärungen & Verifikation

← [[04-code-qualitaet]] · [[00-index|Übersicht]] · Weiter: [[06-pruefhebel-taxonomie]]

---

## MSG 51 — Vollständige Q- und WSP-Pipelines (2026-05-25)

**Prompt-Kern (wörtlich):**
> "oki sieht top - nun erkläre mir anhand des Gesamten Code zur berechnung alle möglihckeiten der Q Berechung und WSP berechnung das ich jede Pipeline prüfen kann"

Dieser Prompt hat keine neuen Implementierungen ausgelöst — er war eine
Verifikationsanforderung. Ergebnis: vollständige Pipeline-Dokumentation in der Konversation.

**Geprüfte Pipelines:**
1. Manning (State 0 + 1) — Einstein-Komposit mit `zoneMap`
2. Orifice (State 2) — `μ_eff · A_netto · √(2g·Δh)`
3. Poleni (State 3) — streifenweise Integration
4. Rating Curve — `generateRatingCurve()` mit 10s Debounce
5. Q→WSP — `findWSPForQ()` mit Coarse-Scan + Bisection

---

## kSt-Aggregation

## MSG 55 — kSt-Zonen-Aggregation (2026-05-25)

**Prompt-Kern (wörtlich):**
> "mir fehlt da generell noch die erklärung zusammengefasst was passiert mit Streifen - xValues und kst Zonen wird das alles zusammgematscht?"

**Erklärung (korrekt implementiert):**

```
allKeyX() = Union(Terrain-x, BUK-x, BOK-x, kSt-Zonen-Grenzen)
→ Kein Streifen überquert eine Zonengrenze

Für jeden Streifen [x₁, x₂]:
  xm = (x₁+x₂)/2
  kSt_i = getKstAtX(xm)  → immer genau eine Zone

zoneMap[kSt_i].A += ...
zoneMap[kSt_i].P += ...

Q = Σ_kSt  kSt · (A_kSt)^(5/3) / P_kSt^(2/3) · √I
```

Einzelne Streifen werden **nicht zusammengematscht** — nur gleichartige kSt-Werte
werden in einem Bucket aggregiert, dann Q_kSt berechnet.

**Implizite Annahme (Ebene-3-Gap):**
`zoneMap` ist nach kSt-Wert indiziert. Zwei räumlich getrennte Bereiche
gleicher Rauheit werden zusammengefasst → **falscher hydraulischer Radius**
wenn topologisch getrennte Vorlandflächen denselben kSt-Wert haben.

→ [[../../HYDRAULIK_VERIFIKATION#3.2]] (Ebene-3-Befund: topologisch einfach verbunden)

---

## z_centroid-Frage

## MSG 59 — Schwerpunkt-Validierung (2026-05-25)

**Prompt-Kern (wörtlich):**
> "// Schwerpunkt der Öffnung (aus der Streifen-Schleife vorberechnet)
> z_centroid = bukZxDx / bukDxSum
> // Druckhöhe
> h_drive = (wspUW aktiv) ? wsp - wspUW : wsp - z_centroid
> -- macht es sinn den Schwerpunkt hier zu nehmen?"

**Antwort:** Ja — Standardpraxis (Bollrich, HEC-RAS). Genauigkeit:
- Fehler ≈ h_öffnung²/(24·Δh) → bei typischen Brücken < 3%
- Bei sehr hohen Öffnungen (h_öffn >> 2m) wächst der Fehler

→ [[../../HYDRAULIK_VERIFIKATION#3.5]] (Ebene-3-Befund: Gleichförmige Geschwindigkeitsverteilung)

---

## Doppelabzug-Befund

## MSG 57–58 — Pfeiler-Doppelabzug (2026-05-25)

**Prompt-Kern (wörtlich):**
> "// Pfeiler-Versperrung
> phi = min(n * b / L_BUK, 0.95)
> A_netto = A_bridge * (1 - phi)
> // ζ-Korrektur
> mu_eff = mu / √(1 + mu² · ζ)
> --- würde man dann nicht bei unserem Model den Pfeiler doppelt abziehen da man ja den Pfeiler gar nicht wirklich zeichnet sondern der durch das Gelände den Querschnitt verringert bzw in zwei Durchlässe teilt?"

**Befund (Ebene-3-Gap):**
φ-Parameter setzt voraus: Pfeilergeometrie steckt NICHT im Terrain.
Wenn Pfeiler als Terrain-Bump gezeichnet UND φ > 0 → Doppelabzug.

**Schlussfolgerung (MSG 58):**

| Situation | Richtig |
|-----------|---------|
| Pfeiler als Terrain-Bump | nPiers = 0 |
| Keine Pfeiler im Terrain | nPiers = n, bPier = b |
| Beide gleichzeitig | **Doppelabzug → falsch** |

**Maßnahme:** Hinweistext in `BridgeInputPanel.vue` ergänzt:
> "Nur verwenden wenn Pfeiler nicht im Geländeprofil eingezeichnet sind.
> Pfeiler als Terrain-Erhöhung modelliert → n = 0 setzen (sonst Doppelabzug)."

**Klassifikation:** Ebene-3-Befund — keine Exception, plausible Zahlen, nur durch
explizites Hinterfragen der Annahmen auffindbar.

→ [[../../HYDRAULIK_VERIFIKATION#3.1]] (Ebene-3-Befund: Pfeiler nicht im Terrain)

---

## MSG 56 — Orifice-Pipeline Detail (2026-05-25)

**Prompt-Kern (wörtlich):**
> "Pipeline 2 — Orifice (State 2) — erkläre es nochmal im detail"

Kein neuer Code — Verifikations-Schritt. Schritt-für-Schritt:

1. `A_bridge` — Öffnungsfläche (Trapezregel über BUK-Fußabdruck)
2. `z_centroid` — Flächenschwerpunkt der Öffnung
3. `h_drive = wsp - z_centroid` (oder `wsp - wspUW` bei Rückstau)
4. `phi = n·b/L_BUK` → `A_netto = A_bridge·(1-phi)`
5. `mu_eff = mu/√(1+mu²·ζ)`
6. `Q_orifice = mu_eff · A_netto · √(2g·h_drive)`
7. Übergangsglättung: `Q1 = max(Q_orifice, Q_manning_bridge)`
8. `Q1_total = Q1 + Q_plain` (Vorland)

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 5.1 | Pipeline-Verifikation war explizite Anforderung — korrekt durchgeführt | ✓ |
| 5.2 | Doppelabzug-Gefahr: implizite Annahme entdeckt → Hinweistext ergänzt | Ebene-3 ✓ |
| 5.3 | kSt-Topologie-Annahme (einfach verbunden) — nie explizit diskutiert | Ebene-3 ⚠ |
| 5.4 | z_centroid-Validierung — Ingenieur hat explizit hinterfragt, Begründung geliefert | ✓ |
