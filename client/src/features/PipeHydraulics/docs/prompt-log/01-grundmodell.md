---
name: Phase 1 — Grundmodell
tags: [prompt-log, ebene-1, zwei-zonen, profil-editor, import]
date: 2026-05-15
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 0–7
---

# Phase 1 — Zwei-Zonen-Grundmodell & Profil-Editor

→ [[00-index|Übersicht]] · Weiter: [[02-ui-validierung]]

---

## MSG 0 — Kernkonzept (2026-05-15)

**Prompt-Kern (wörtlich):**
> "oki ich müsste hier upgraden und eine weitere berechnungstool einbauen mit der möglichkeit ein custom profil zu zeichnen und einen solchen zustand zu berechnen um eine WSP linie im Profil angezeigt zu bekommen:
> Zone 1: Durchströmter Brückenquerschnitt (geschlossen) — Benetzter Umfang U enthält auch die Brückenunterseite (BUK) als benetzte Fläche mit einrechnen!
> Q₁ = kst₁ · A₁ · R₁^(2/3) · I^(1/2)
> Zone 2: sobald WSP > BOK: Q₂ = kst₂ · A₂ · R₂^(2/3) · I^(1/2), kst₂ = 25–30
> Q_gesamt = Q₁ + Q₂"

**Entstandener Code:**
- `useBridgeHydraulics.js` — Grundgerüst
- `calculateAtWSP()` — Hauptberechnungsfunktion
- `allKeyX()` — Diskretisierung aller Profilknoten
- `getKstAtX()` — kSt-Zonen-Lookup
- `zoneMap`-Aggregation — Einstein-Komposit-Methode
- Zweizonentrennung Zone 1 / Zone 2

**Implizit nicht gefordert:**
- `z_centroid`-Näherung für Δh (KI-Wahl: Standardnäherung, nicht im Prompt spezifiziert)
- `max(Q_orifice, Q_manning_bridge)` Übergangsglättung (pragmatisches Artefakt)
- `plainMap` — Vorland-Manning parallel zum Orifice
- Poleni-Integration streifenweise statt skalarer Kronenbreiten-Formel
- Orifice-Formel `μ·A·√(2g·Δh)` — nur "Druckabfluss" war implizit, nicht die Formel

**Offene Fragen:**
- War die Orifice-Formel explizit gefordert oder nur das Konzept "Druckabfluss"?
- `kst₂ = 25–30` — war das als fixer Default oder als einstellbar gemeint?

---

## MSG 1 — Irreguläre Querschnitte + Import (2026-05-15)

**Prompt-Kern (wörtlich):**
> "oki nun müsste man das Gerinne voll freizeichnen können / mit verschiedenen Kst werten sodass man auch irreguläre Querschnitte berechnen kann / vllt auch einen geojson import von Punkten des Gerinne Querschnitts und Brückenpunkte / die Brücke kann ja auch irregulär sein ... Passe daran auch die HydraulikEngine an!"

**Entstandener Code:**
- `interpZ()` — lineare Interpolation zwischen Profilpunkten
- `interpBridgeZ()` — BUK-Interpolation mit Infinity-Sentinel außerhalb Fußabdruck
- `kstZones[]` — Array statt Einzel-kSt
- Freies Profilzeichnen (drag-and-drop Punkte)
- GeoJSON-Import-Grundstruktur

**Implizit nicht gefordert:**
- Infinity-Sentinel als Boundary-Marker für BUK/BOK — KI-Design-Entscheidung
- `bokRefZ()` als separate Extrapolationsfunktion

---

## MSG 2 — Import-Modal + BUK/BOK-Clipping (2026-05-15)

**Prompt-Kern (wörtlich):**
> "baue den Import wie eine Excel-Tabelle mit verschiedenen Register eins Für Gerinnepunkte / Brückenpunkte BUK BOK --- Das Problem gilt es ebenfalls noch zu lösen: Eine Brücke kann auch am Gelände wieder anschließen dort wird dann aber weiter mit dem Unteren Querschnitt gerechnet - auch fehlt ein wenig das Clipping sprich wir haben oft Kreuzungen der Linien obwohl das eigentlich keinen Sinn machen"

**Entstandener Code:**
- `BridgeImportModal.vue` — Tab-basierter Import (Terrain / BUK / BOK)
- Clipping-Logik: BUK/BOK außerhalb Fußabdruck → Gelände
- `mergedKeyX()` — gemeinsame x-Koordinaten aller Profile

---

## MSG 4–5 — BOK-Geometrie-Korrektur (2026-05-15)

**Prompt-Kern (wörtlich):**
> "es gibt immernoch das problem das der Schnittpunkt BOK - Gelände kein neues vollständiges offenes Profil erzeugt sondern irgend ein mischmatsch aus dem unteren profil weil das gelände da weiter gezeichnet wird"
> "oki das ist schon besser aber die berechnung von dem Oberen Gerinne über der Brücke stimmt noch nicht ganz es sind immernoch zwei getrennte bereiche Gelände über BOK und Bereich über BOK sind ein bereich"

**Entstandener Code:**
- `bokRefZ()` — horizontale BOK-Referenzlinie extrapoliert über gesamte Gerinnebreite
- Zone-2-Sohle = `max(Gelände, BOK_Referenz)` — aufgesatteltes Brückendeck korrekt

---

## MSG 6 — Reale Vermessungsdaten (2026-05-15)

**Prompt-Kern:**
> [Koordinatenliste: 380468.5 5507139 245.457 ...]

Erster Test mit echten Vermessungspunkten (Gauß-Krüger / UTM + Höhe).
Auslöser für lokale Koordinatentransformation (relative x-Werte).

---

## MSG 7 — Viewer Pan + Zoom (2026-05-15)

**Prompt-Kern (wörtlich):**
> "im viewer fehlt die möglichkeit sich zu bewegen als pan und auch reinzommen"

**Entstandener Code:**
- `useProfileInteraction.js` — Viewport-Transforms, Pan/Zoom
- SVG viewBox-Steuerung mit Mouse-Events

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 1.1 | Zwei-Zonen-Formel explizit im Prompt — korrekt übernommen | ✓ |
| 1.2 | Orifice-Formel nicht im Prompt — KI hat Standard-Ansatz gewählt | ⚠ implizit |
| 1.3 | Poleni nicht erwähnt — KI hat ergänzt (physikalisch korrekt) | ⚠ implizit |
| 1.4 | Infinity-Sentinel für BUK/BOK-Boundaries — reine KI-Architektur-Entscheidung | ⚠ implizit |

→ Vollständige Ebene-1-Analyse: [[../../HYDRAULIK_VERIFIKATION#Ebene 1 — Prompt-Analyse]]
