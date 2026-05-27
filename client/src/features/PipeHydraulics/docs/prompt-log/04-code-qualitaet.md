---
name: Phase 4 — Code-Qualität
tags: [prompt-log, ebene-1, code-qualitaet, debounce, q-wsp, canvas, segment-analyse]
date: 2026-05-24
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 34–50
---

# Phase 4 — Segment-Analyse, Code-Qualität & Q→WSP

← [[03-hydraulik-audit]] · [[00-index|Übersicht]] · Weiter: [[05-pipeline-verifikation]]

---

## MSG 34 — Segment-Klick-Analyse (2026-05-24)

**Prompt-Kern (wörtlich):**
> "oki wir müssen nun das Flächen Problem angehen 1. wir bräuchten eine Funktion das der User eine Fläche anklickt und dann dort alle Infos zur Fläche bekommt (m² / benetzte Fläche / geschlossen ja nein etc) 2. wir müssen mal schauen ob eine Fläche wirklich durch BOK - GOK - BUK geschlossen wird oder dadurch halt Inselpolygone entstehen"

**Entstandener Code:**
- `buildZ1SegmentData()` — gibt `type`, `A`, `P`, `maxH`, `xLeft`, `xRight` zurück
- Klick-Interaktion → Segment-Popup mit Flächen-Info
- Validierungswarnung wenn `type === 'island'`

---

## MSG 36 — Expandable Canvas (2026-05-24)

**Prompt-Kern (wörtlich):**
> "als nächstes brauchen wir eine Ausklappfunktion des Zeichencanvas als Window sodass man das beliebig groß ziehen kann"

**Entstandener Code:**
- `useProfileInteraction.js` — `windowMode` ref
- Modales Großfenster für den Profil-Editor (draggable + resizable)

---

## MSG 37 — BUK/BOK unter Gelände (2026-05-24)

**Prompt-Kern (wörtlich):**
> "man bekommt eine nError BUK oder BOK unter Gelände das ist ja in erster Linie kein Problem oder?"

**Entscheidung:** Warnung statt Fehler — physikalisch kann BUK lokal unter Gelände sein
(z.B. bei Auflager-Geometrie). Ingenieur muss selbst beurteilen.

---

## MSG 38 — Pfeiler-Parameter-Erklärung (2026-05-24)

**Prompt-Kern (wörtlich):**
> "nun die nächste logische Frage es gibt ja einen Pfeiler Beiwert wie soll der mit einberechnet werden wenn in dem User Interface gar keine Pfeiler möglich sind einzutragen sondern - wie funktioniert das nochmal mit der passenden Formel dazu wie wird der Pfeiler da eingerechnet?"

**Erklärung:**
```
φ = n · b_Pfeiler / L_BUK
A_netto = A_bridge · (1 - φ)
```

Dieser Prompt-Austausch hat den Doppelabzug-Befund vorbereitet → [[05-pipeline-verifikation#Doppelabzug-Befund]]

---

## MSG 40 — Vollständiges Hydraulik-Audit (2026-05-24)

**Prompt-Kern (wörtlich):**
> "Prüfe nun ob das Tool eine vollständige Hydraulische Modellierung eines 1D Querschnitts möglich macht wo sind Problem wo ist Optimierungs Potential - Wäre ein Druckabfluss Toggle sinnvoll (der Ingenieur kann nochmal manuell entscheiden ob wirklich Druckabfluss berechnet werden soll - für den Rückstaufall aus vom Unterstrom herkommend?) mach auch eine Logikmap wie was welche Input Daten berechnet"

**Entstandener Code:**
- `flowMode` Parameter: `'auto'` / `'free'` / `'pressure'`
- `wspUW` — Unterwasserstand für Rückstau-Berechnung
- Logik-Karte in `BridgeHydraulicsInfoModal.vue`

---

## MSG 41 — Zustandsübergang-Hinweis akzeptiert (2026-05-24)

**Prompt-Kern (wörtlich):**
> "es klingt alles gut bis auf: 2. Zustandsübergang ist rein geometrisch, nicht physikalisch — isSubmerged = wsp >= bukMin — das niedrigste BUK-Punkt-z triggers den Vollumstieg auf Orifice. Bei asymmetrischer Brücke (z.B. gewölbt, eine Seite tiefer) kann damit zu früh umgeschaltet werden. --- das ist ein bekannter vereinfachter Ansatz mit dem ich leben kann"

**Klassifikation:** Bekannte Einschränkung, bewusst akzeptiert.
→ [[../../HYDRAULIK_VERIFIKATION#2.3]] dokumentiert.

---

## MSG 42 — Code-Qualitäts-Audit (2026-05-24)

**Prompt-Kern (wörtlich):**
> "so nun gehts ans Programmierer Technische bewerte auf Spaghetti Code und Performance des Features wo ist Verbesserungs Potential und was ist gut?"

**Audit-Ergebnis (Probleme):**
- `localStorage` auf jedem `mousemove` → CPU-Spike
- Rating-Curve reaktiv während Drag → UI-Freeze
- 9-fache Serialisierungs-Boilerplate

---

## MSG 44–45 — z_centroid + Froude (2026-05-24)

**Prompt-Kern (wörtlich):**
> "z̄_BUK ist nicht der Schwerpunkt der Öffnung — z_BUK_mean = bukZxDx / bukDxSum // öffnungsgewichtet — Für die Orifice-Energiehöhe wäre der Flächenschwerpunkt der Öffnung präziser:
> Δh = WSP − z_centroid = WSP − (∫ z(x)·h(x) dx) / A_bridge"

> "Punkt 3 und 4 kann ich sofort sauber fixen — sind 3–5 Zeilen je. let's go"

**Entstandener Code:**
- `z_centroid = Σ((g+buk)/2 · h · dx) / A_bridge` — korrekter Flächenschwerpunkt
- `Fr = v / √(g · h_hydraulisch)` ins `currentResult`
- Froude-Warnung in `BridgeResultsPanel.vue` wenn `Fr ≥ 0.8`

---

## MSG 46–47 — Priorisierte Code-Verbesserungen (2026-05-24)

**Prompt-Kern (wörtlich):**
> "🔴 Hoch: localStorage auf jedem mousemove → save() aufteilen: persist (debounced 100ms) vs snapshot (450ms) | 🔴 Hoch: Rating-Curve reaktiv während Drag → Debounce oder dirty-Flag | 🟡 Mittel: 9-fache Serialisierungsboilerplate → State als ein Schema-Objekt, generischer serialize/deserialize"

**Entstandener Code:**
- `save()` mit zwei unabhängigen Debounce-Timern (100ms / 450ms)
- Rating-Curve: `watch()` mit 10.000ms Debounce statt `computed`
- `SCALAR_SCHEMA` + `ARRAY_SCHEMA` — DRY-Serialisierung

---

## Q→WSP Bisection

## MSG 49 — Q→WSP-Inversion (2026-05-24)

**Prompt-Kern (wörtlich):**
> "oki die Verzögerung beim berechnen muss bissjen erhöht werden auf 10sek (auf welcher ist es überhaupt) weiter muss noch der WSP verfeinert werden sodass delta h nicht nur 0,01m bzw müsste eine Reverseingabe in die Pipeline eingebaut werden sodass auch QEingabe => WSP sollte möglich ist"

**Entstandener Code:**
- `findWSPForQ()` — Bisektionsalgorithmus
- `_ratingTimer` Debounce: 150ms → 10.000ms
- Slider step: 0.05 → 0.01

**Implizit nicht gefordert:**
- Coarse-Scan vor Bisection (50 Intervalle) — KI-Entscheidung wegen Manning→Orifice-Kink
- 50 Scan-Schritte + 60 Bisektionsschritte, Toleranz 0.001m
- Round-Trip-Fehler < 0.01m (nicht spezifiziert, aber physikalisch sinnvoll)

**Offene Frage:** Ist 50+60 ausreichend für alle realen Querschnitte?
→ [[../../HYDRAULIK_VERIFIKATION#Klasse C — Round-Trip]] (Test empfohlen)

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 4.1 | Code-Verbesserungen explizit vom Ingenieur vorgegeben (MSG 46) — korrekt umgesetzt | ✓ |
| 4.2 | Coarse-Scan-Schrittzahl (50) — KI-Wahl, nicht im Prompt | ⚠ implizit |
| 4.3 | z_centroid-Fix explizit verlangt und korrekt umgesetzt | ✓ |
| 4.4 | Froude-Warnung explizit verlangt | ✓ |
| 4.5 | 10s Rating-Debounce explizit verlangt ("auf 10sek erhöhen") | ✓ |
