---
name: Gap 3.6 — Manning Zone 2
tags: [verifikation, ebene-3, manning, zone2, ueberstroemung, mindesttiefe]
---

# Gap 3.6 — Manning für flache Zone-2-Überströmung

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

Zone 2 (Überströmung über BOK) wird mit Manning-Strickler berechnet.
Nie explizit diskutiert — die KI hat es ohne Rückfrage implementiert.

```javascript
// Zone 2: Manning mit kst₂ (i.d.R. 25–30)
Q2 = kst2 * A2 * pow(A2/P2, 2/3) * sqrt(slope)
```

---

## Der Gap

Manning-Strickler gilt für vollentwickelte, turbulente Freispiegel-Strömung.
Bei sehr flacher Überströmung (h₂ < 0.05–0.1m) versagen die Voraussetzungen:

| Tiefe | Regime | Manning gilt? |
|-------|--------|--------------|
| h₂ > 0.2m | turbulent, vollentwickelt | ✓ ja |
| h₂ 0.05–0.2m | Übergang | ⚠ eingeschränkt |
| h₂ < 0.05m | laminar / Oberflächenspannung | ✗ nein |

Bei h₂ < 5cm dominieren Strömungswiderstand der Oberfläche und
Viskositätseffekte — Manning überschätzt Q systematisch.

---

## Konsequenz

Für Hochwasser-Überströmung (h₂ > 0.2m): kein Problem.
Bei geringer Überströmung (Starkniederschlag knapp über BOK): Q-Überschätzung.

**Keine Mindesttiefe eingebaut** → möglicher Fehler bei h₂ < 5cm.

---

## Mögliche Maßnahme

```javascript
const h2_min = 0.05  // m — Manning-Gültigkeitsgrenze
if (h_ü < h2_min) {
  // Validierungswarnung: "Überströmungstiefe < 5cm — Manning nicht anwendbar"
}
```

Oder: Poleni-Formel auch für Zone 2 verwenden (Poleni gilt bis h_ü → 0).

---

## Status

Nicht gesichert. Bei Anwendungen mit knapper Überströmung (Deichüberströmung,
Bemessungshochwasser am Limit) kritisch prüfen.
