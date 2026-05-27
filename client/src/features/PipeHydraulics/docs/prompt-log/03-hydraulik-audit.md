---
name: Phase 3 — Hydraulik-Audit
tags: [prompt-log, ebene-1, hydraulik, vier-zustaende, pfeiler, zeta, insel-polygone]
date: 2026-05-23
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 21–33
---

# Phase 3 — Hydraulik-Audit, Pfeiler & ζ-Korrektur

← [[02-ui-validierung]] · [[00-index|Übersicht]] · Weiter: [[04-code-qualitaet]]

---

## MSG 21–22 — 4-Zustände-Audit (2026-05-23)

**Prompt-Kern (wörtlich):**
> "so ich bin jetzt beim testing für die Ingenieurtechnische Richtigkeit der Ergebnisse mache ein audit und prüfe ob das hier konsistent ist: Die Grundfrage die das Programm beantworten muss: Eine Brücke hat zu jedem Zeitpunkt genau einen von vier möglichen hydraulischen Zuständen. Diese Zustände sind nicht beliebig — sie folgen einer physikalisch zwingenden Abfolge mit steigendem Q. Das Programm muss diese Abfolge sequenziell durchlaufen und bei jedem Schritt prüfen ob der nächste Zustand erreicht ist."

> "jap wir müssen das hydraulische korrekt"

**Audit-Ergebnis:** State-Sequenz war implementiert, aber partiell inkonsistent.

**Entstandener Code (Korrekturen):**
- State-Detection vereinheitlicht: `state ∈ {0,1,2,3}` immer definiert
- Zustandsübergänge sequenziell geprüft, nie übersprungen
- `hasBridge`, `isSubmerged`, `hasOverflow` als klare Binär-Flags

**Offene Frage nach Audit:**
- `isSubmerged = wsp >= bukMin` (globales Minimum) — bei geneigter BUK diskutierbar.
  Partieller Druckabfluss wäre physikalisch korrekter aber erheblich komplexer.
  → [[../../HYDRAULIK_VERIFIKATION#2.3]] (Ebene-2-Befund)

---

## Übergangsglättung

**Nicht im Prompt:** `Q1 = max(Q_orifice, Q_manning_bridge)`

Die KI hat erkannt dass beim Übergang Manning→Orifice eine Diskontinuität entsteht:
- Bei WSP knapp über BUK liefert `Q_orifice` fast 0 (Δh ≈ 0)
- `Q_manning_bridge` liefert noch realistischen Wert

Glättung: statt Sprung → `max()` beider Werte.
Physikalisch vertretbar, aber nicht explizit verlangt.

---

## plainMap

**Nicht im Prompt:** Vorland-Manning bei Druckabfluss (`plainMap`)

Im `isSubmerged`-Zustand: Vorland neben der Brücke fließt weiter als Freispiegel.
KI hat korrekt erkannt → `Q1_total = Q_orifice + Q_plain`.

Strukturelles Problem: `plainMap` wird **immer** befüllt, aber nur im `isSubmerged`-Branch verwendet.
→ [[../../HYDRAULIK_VERIFIKATION#2.4]] (Ebene-2-Befund: strukturell verwirrend, funktional korrekt)

---

## MSG 29 — Pfeiler zeichnen (2026-05-23)

**Prompt-Kern (wörtlich):**
> "Wie könnte man nun einen Brückenpfeiler als Nutzer zeichnen ohne dass eine Flag kommt?"

**Antwort (KI):**
- Pfeiler als Terrain-Erhöhung (Bump) zeichnen → keine Flag, geometrisch korrekt
- φ-Parameter (n · b / L_BUK) für parametrische Näherung

**→ Achtung Doppelabzug-Risiko:** Wenn Pfeiler als Terrain-Bump UND φ > 0 gleichzeitig → Doppelabzug.
Dieser Befund wurde erst in Phase 5 explizit entdeckt. → [[05-pipeline-verifikation#Doppelabzug-Befund]]

---

## MSG 30 — ζ-Korrektur (2026-05-23)

**Prompt-Kern (wörtlich):**
> "Was das Modell dabei noch nicht abbildet: den Formwiderstand des Pfeilers (ζ · v²/2g). Der geometrische Querschnittsverlust (A-Reduktion, P-Erhöhung) ist korrekt; der zusätzliche Staudruckverlust durch Anströmung des Pfeilers fehlt als ζ-Term in der Bernoulli-Bilanz."

**Entstandener Code:**
- `mu_eff = mu / √(1 + mu² · ζ)` — analytische Ableitung aus Bernoulli + Verlustterm
- `zeta` als neuer Store-Parameter
- UI-Eingabe in `BridgeInputPanel.vue`

**Ebene-1-Prüfung:**
Die Formel `μ_eff = μ/√(1+μ²·ζ)` war NICHT im Prompt — der Ingenieur hat nur
das Konzept "ζ-Term" genannt. Die KI hat die analytische Ableitung selbst durchgeführt.

Ableitung prüfbar:
```
Bernoulli: H₁ = H₂ + ζ·v²/2g
Q = μ·A·√(2g·H₁)  →  v = Q/A
Einsetzen + Auflösen nach Q:
Q² = μ²·A²·2g·(H₁ - ζ·Q²/(A²·2g))
Q² · (1 + μ²·ζ) = μ²·A²·2g·H₁
Q = μ·A·√(2g·H₁) / √(1+μ²·ζ)
→ μ_eff = μ/√(1+μ²·ζ)  ✓
```
→ Ableitung korrekt. → [[../../HYDRAULIK_VERIFIKATION#1.1]] (Ebene-1-Befund: nachgewiesen)

---

## MSG 32 — Insel-Polygone (2026-05-23)

**Prompt-Kern (wörtlich):**
> "was ist mit Inselpolygonen außerhalb der Öffnung aber im GOK unter der BUK/BOK liegend werden dennoch in die Öffnung gerechnet? Prüfe ob das so ist -> Logisch falsch"

**Befund:** Ja — ohne Typ-Klassifikation wurde alles unter BUK als Öffnung gewertet.

**Entstandener Code:**
- `buildZ1SegmentData()` in `useBridgeRenderer.js` — Typ-Klassifikation:
  - `'main'` — durchgängige Hauptöffnung (an beide BUK-Enden angebunden)
  - `'side'` — Seitenöffnung (einseitig angebunden)
  - `'island'` — Inselpolygon (kein BUK-Kontakt) → **Validierungswarnung**
  - `'floodplain'` — Vorland

Insel-Polygone gehen **nicht** in die Hydraulikberechnung ein.

---

## MSG 33 — Koeffizienten-Presets (2026-05-23)

**Prompt-Kern (wörtlich):**
> "μ: scharfkantig 0.60–0.70 · abgerundet 0.80–0.90 · μD: 0.35–0.50 · ζ: 0 = kein Pfeiler · tropfenf. 0.1–0.3 · rechteckig 0.7–1.2 --- mach das hier als Auswahl mit Text das selbst doof die keine Ahnung haben das Auswählen können"

**Entstandener Code:**
- Dropdown-Presets für μ, μD, ζ in `BridgeInputPanel.vue`
- Beschriftungen: Kanten-Typ + Wertebereich als Hilfstext

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 3.1 | 4-Zustände-Struktur explizit im Prompt vorgegeben — korrekt implementiert | ✓ |
| 3.2 | ζ-Formel analytisch abgeleitet, nicht im Prompt — Ableitung geprüft korrekt | ✓ |
| 3.3 | `max(Q_orifice, Q_manning)` Übergangsglättung — nicht im Prompt | ⚠ implizit |
| 3.4 | `plainMap` — nicht im Prompt, physikalisch korrekt | ⚠ implizit |
| 3.5 | Insel-Polygon-Problem — durch Ingenieur entdeckt, nicht im ursprünglichen Prompt | Ebene-3-Gap |
