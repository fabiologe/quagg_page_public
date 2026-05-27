---
name: Gap 3.3 — WSP Guard
tags: [verifikation, ebene-3, wsp-guard, tidegebiet, kuestengebiet]
---

# Gap 3.3 — WSP > 0 immer gültig

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

Der Guard `wsp <= 0 → emptyResult` setzt voraus dass das Gelände
immer im positiven Koordinatenbereich liegt.

```javascript
if (!crossSectionPoints || crossSectionPoints.length < 2 || wsp <= 0) {
  return emptyResult
}
```

---

## Der Gap

**Tidegebiet:** Gelände bei z = −5m (unter NN), WSP = 0m (Tideniedrigwasser).
- WSP > Gelände → Wasser steht, Q > 0 wäre korrekt
- `wsp <= 0` → `emptyResult` → **stiller Fehler**, Q = 0

**Berggebiet mit Koordinatensystem:** Gelände bei z = 200m, WSP = 205m.
- Kein Problem, wsp >> 0

---

## Konsequenz

Für alle Anwendungen mit Gelände über NN = 0: kein Problem.
Für Küstengebiete, Tidegebiete, Tieflagen (Holland, Norddeutschland): unbrauchbar.

**Fehlerart:** Stiller Fehler — keine Exception, `emptyResult` sieht
für den User wie "kein Abfluss" aus, ist aber "ungültige Eingabe".

---

## Möglicher Fix

```javascript
const terrainMin = Math.min(...crossSectionPoints.map(p => p.z))
if (!crossSectionPoints || crossSectionPoints.length < 2 || wsp <= terrainMin) {
  return emptyResult
}
```

Damit funktioniert das Modell auch bei negativen Koordinaten.
