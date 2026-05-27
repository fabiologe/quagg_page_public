---
name: Ebene 2 — Strukturelle Befunde
tags: [verifikation, ebene-2, befunde]
---

# Ebene 2 — Strukturelle Befunde

← [[index|Ebene 2 Index]]

---

| # | Sachverhalt | Status |
|---|-------------|--------|
| 2.1 | Trennung Hydraulics / Renderer / Store | ✓ korrekt |
| 2.2 | A_bridge + z_centroid in Manning-Schleife akkumuliert | ⚠ vertretbar |
| 2.3 | State-Detection via globalem BUK-Minimum | ⚠ Einschränkung bekannt |
| 2.4 | plainMap immer befüllt, nur in isSubmerged genutzt | ⚠ funktional korrekt |

---

## 2.1 — Trennung Hydraulics / Renderer / Store ✓

`useBridgeHydraulics.js` hat keine Abhängigkeiten — reine Physik.
`useBridgeRenderer.js` importiert nur Hydraulics — reine View-Logik.
`useBridgeStore.js` importiert nur Hydraulics — Zustand und Reaktivität.

**Vorteil:** Ein Hydrauliker kann die Physik vollständig prüfen ohne
den Renderer oder Store zu kennen. Physik, Darstellung und Zustand sind
orthogonale Konzepte — die Architektur spiegelt das korrekt wider.

→ Detail: [[architektur]]

---

## 2.2 — A_bridge + z_centroid in Manning-Schleife ⚠

In `useBridgeHydraulics.js` werden in der Manning-Streifen-Schleife gleichzeitig
Manning-Größen (`zoneMap`) und Orifice-Größen (`A_bridge`, `z_centroid`) akkumuliert:

```javascript
// Zeile ~131 — eine Schleife, zwei konzeptuelle Aufgaben
for (const [x1, x2] of strips) {
  // Manning:
  zoneMap[kst].A += stripA
  zoneMap[kst].P += stripP
  // Orifice (nur innerhalb BUK-Fußabdruck):
  if (inBuk) {
    A_bridge   += hO_avg * dx
    bukZxDx    += ((g + buk) / 2) * hO_avg * dx   // für z_centroid
    bukDxSum   += hO_avg * dx
  }
}
```

**Effizienz:** Ein Schleifendurchlauf statt zwei — OK für reale Profilgrößen.
**Review-Problem:** Manning-Logik und Orifice-Geometrie sind semantisch getrennt,
aber physisch verschränkt. Sauberer wäre eine eigene Funktion `calcOpeningGeometry()`.

**Risiko:** Bei Refactoring könnte jemand die Orifice-Akkumulation aus der Schleife
herausnehmen ohne zu merken dass sie dorthin gehört.

---

## 2.3 — State-Detection via globalem BUK-Minimum ⚠

```javascript
const bukMin = Math.min(...bukProfile.map(p => p.z))
const isSubmerged = wsp >= bukMin
```

Sobald **ein** BUK-Punkt untergetaucht ist → ganzes System in State 2.

**Einschränkung:** Bei schräger BUK (eine Seite tiefer) schaltet das Modell
zu früh um. Physikalisch korrekt wäre ein partieller Druckabfluss: linke Streifen
Orifice, rechte Streifen noch Manning.

**Explizit akzeptiert** in MSG 41 (2026-05-24):
> "das ist ein bekannter vereinfachter Ansatz mit dem ich leben kann"

→ Zustandsübergänge: [[zustandsmaschine#State-Detection: Bekannte Einschränkung]]

---

## 2.4 — plainMap immer befüllt, nur in isSubmerged genutzt ⚠

```javascript
// Zeile ~190 — immer:
plainMap.set(kst, { A: ..., P: ... })

// Zeile ~263 — nur in State 2/3:
if (isSubmerged) {
  Q_plain = plainMap-Summe
}
```

**Funktional:** Korrekt — in State 0/1 wird `plainMap` befüllt aber nie verwendet,
das Ergebnis ist identisch.

**Strukturell:** Verwirrend für Leser. Ein Reviewer könnte denken plainMap hat
auch in State 0/1 einen Effekt — hat es nicht.

**Sauberere Alternative:**
```javascript
if (isSubmerged) {
  // plainMap hier befüllen und sofort auswerten
}
```
