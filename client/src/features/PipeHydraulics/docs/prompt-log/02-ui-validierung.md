---
name: Phase 2 — UI & Validierung
tags: [prompt-log, ebene-1, validierung, ux, kst-zonen, undo-redo]
date: 2026-05-17
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 8–20
---

# Phase 2 — UI, Validierung & State-Management

← [[01-grundmodell]] · [[00-index|Übersicht]] · Weiter: [[03-hydraulik-audit]]

---

## MSG 8 — WSP-Slider + Ausdruck (2026-05-17)

**Prompt-Kern (wörtlich):**
> "oki lasss uns noch paar sachen ergänzen: 1. Wasserspiegellagen Regler ist verbuggt wenn man ihn bewegt kann man ihn nur noch zwischen 0-10 einstellen - wenn Geländepunkte zwischen 240 und 250 liegen ist das ja sinnlos -> ändere den Regler das er in Abhänigkeit der Geländepunkte agiert / Ebenso die Ratingkurve / Es fehlt die möglichkeit einen geeigneten Ausdruck zu erstellen"

**Entstandener Code:**
- `setLayer('terrain', ...)` berechnet `wspMin`/`wspMax` aus Geländehöhen
- `BridgePrintModal.vue` — Druckansicht mit Profil-SVG + Ergebnistabelle
- Rating-Curve-Bereich gekoppelt an Gelände-z-Bereich

**Implizit nicht gefordert:**
- Automatische wspMin/wspMax-Berechnung (KI-Entscheidung: +5% / +30% Puffer)

---

## MSG 10 — Ausdruck-Feinabstimmung (2026-05-17)

**Prompt-Kern (wörtlich):**
> "der Ausdruck sieht Top aus! Man muss nur die Kästchen ein wenig anpassen da diese sich überlappen / Prüfe bitte ob die Maßstab und Skalier so passen und korrekt vermittelt werden"

Layout-Fix: Überlappungen im Print-Layout, Maßstabsangaben.

---

## MSG 11–12 — Geometrie-Validierung (2026-05-17)

**Prompt-Kern (wörtlich):**
> "oki nun gehts um Faktische Richtigkeit wir müssen prüfen und kontrollieren das das was ein user eingibt Hydraulisch logisch richtig und nachvollziehbar ist / vorallem auch Prüfbar wie etwas berechnet wurde - was ist mit fachlich sinnfreien Einzeichnungen?"

Dann wörtliche Vorgabe der Prüfmatrix:

> "Prüfung: BUK ≤ BOK an jedem x → Fehler: BUK > BOK (physikalisch unmöglich) | Warnung: BUK = BOK (keine Konstruktionshöhe)
> BUK ≥ Gelände → Fehler: BUK unter Gelände | WSP > min(Gelände) → Kein benetzter Bereich
> I > 0 → Kein Gefälle"

**Entstandener Code:**
- `useBridgeValidation.js` — Vollständiges Validierungs-Composable
- `BridgeValidationPanel.vue` — Fehler/Warnungs-Anzeige
- `allErrorMarkers[]` / `allWarningMarkers[]` — SVG-Marker im Profil

**Implizit nicht gefordert:**
- Marker-System im SVG-Profil (KI-Ergänzung für visuellen Kontext)
- Froude-Zahl-Warnung (erst später in Phase 4 ergänzt)

---

## MSG 13 — Polygon-Verfeinerung (2026-05-17)

**Prompt-Kern (wörtlich):**
> "oki nun müssen wir die Polygone noch bissjen unter der Haube aufmotzen problem ist wenn zu wenige Punkte angegeben sind wird nicht die Gesamte Fläche berechnet bzw in die Berechnung eingenommen da es dann vereinfacht wie könnte man das, ohne die Polygon mit 2000 für den user ersichtlichen Knoten des Polygons zu überladen, vllt Passpunkte lassen aber unter der Haube mit mehr rechnen?"

**Entstandener Code:**
- `allKeyX()` — Vereint Terrain + BUK + BOK + kSt-Grenzen in gemeinsamen x-Vektor
- Kein Oversampling sichtbar, aber alle Schnittlinien sind als Knoten vorhanden

**Implizit nicht gefordert:**
- kSt-Zonengrenzen in `allKeyX()` einbezogen (KI-Entscheidung, hydraulisch korrekt)

---

## MSG 14–15 — Info-Modal vs. Tutorial (2026-05-17)

**Prompt-Kern (wörtlich):**
> "perfekt nun fehlt eine Ausgiebige Erklärung was wo hydraulisch berechnet wird am besten wäre das über ein Interaktives Tutorial machbar ... oder ein einfaches Popup Window was einfach ne Markdown Erklärung hat was ist besser?"

> "Klingt am besten find ich top"

**Entstandener Code:**
- `BridgeHydraulicsInfoModal.vue` — Markdown-basiertes Info-Panel (Popup gewählt)

---

## MSG 16 — UX-Audit (2026-05-17)

**Prompt-Kern (wörtlich):**
> "checke mal bitte alle Kästchen und boxen und verpasse dem Features ein nicen look ohne emojis - passen den Skalierungen alle Komponenten? Wo sind Schwachstellen bei der Darstellung und User Experience"

Layout-Audit und Überarbeitung der Komponentengrößen.

---

## MSG 18 — kSt-Zonen im Viewer verschiebbar (2026-05-17)

**Prompt-Kern (wörtlich):**
> "oki was noch fehlt wäre die kst Zonen einfach im Viewer Eingabe Bereich verschieben zu können als die Ränder die dort angezeigt werden das man die einfach schieben kann"

**Entstandener Code:**
- kSt-Grenz-Drag in `useProfileInteraction.js`
- Vertikale Grenzlinien im SVG-Profil draggable

---

## MSG 19 — Undo/Redo + Projekt-Export (2026-05-17)

**Prompt-Kern (wörtlich):**
> "oki nun bau ein Statemanagement ein mit vor / zurück und Projekt speichern (sollte dann eine txt datei runterladen mit alle wichtigen Einstellungen / diese sollte auch wieder reinlesbar sein auch fehlt -> bau das in die Import Box ein"

**Entstandener Code:**
- `historyStack[]` + `historyIdx` in `useBridgeStore.js`
- `undo()` / `redo()` — JSON-Snapshots, max 60 Einträge
- `exportProject()` / `importProject()` — JSON-Datei mit `format: 'BrueckenHydraulik'`
- `SCALAR_SCHEMA` / `ARRAY_SCHEMA` — DRY-Serialisierungs-Schema

**Implizit nicht gefordert:**
- 450ms Debounce für History (KI-Entscheidung: Eingabepause = neuer Intent)
- 100ms Debounce für localStorage (KI-Entscheidung: Schutz vor Drag-Spam)
- Doppelter Debounce-Timer-Ansatz (zwei unabhängige Timer in `save()`)

---

## MSG 20 — Tutorial-Update (2026-05-17)

**Prompt-Kern (wörtlich):**
> "kannst du noch ins Tutorial übernehmen? also das bitte updaten"

Info-Modal aktualisiert mit Undo/Redo und Export-Dokumentation.

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 2.1 | Validierungsmatrix explizit im Prompt vorgegeben — gut übernommen | ✓ |
| 2.2 | 450ms / 100ms Debounce-Werte — nicht im Prompt, KI-Wahl | ⚠ implizit |
| 2.3 | kSt-Grenzen in `allKeyX()` — nicht im Prompt, physikalisch korrekt | ⚠ implizit |
| 2.4 | Info-Modal statt Tutorial — user hat explizit gewählt (MSG 15) | ✓ |
