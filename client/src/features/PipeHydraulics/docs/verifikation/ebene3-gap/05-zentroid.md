---
name: Gap 3.5 — Zentroid-Näherung
tags: [verifikation, ebene-3, zentroid, druckhoehe, orifice]
---

# Gap 3.5 — Gleichförmige Geschwindigkeitsverteilung in der Öffnung

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

Alle Fließfäden in der Öffnung spüren dieselbe mittlere Druckhöhe.
Daraus folgt die Zentroid-Näherung:

```javascript
// Flächenschwerpunkt der Öffnung (aus Streifen-Schleife vorberechnet)
z_centroid = bukZxDx / bukDxSum

// Treibende Druckhöhe
h_drive = (wspUW != null) ? wsp - wspUW    // Rückstau
                           : wsp - z_centroid   // freier Ausfluss
```

---

## Alternativen

| Option | Formel | Genauigkeit | Aufwand |
|--------|--------|-------------|---------|
| BUK-Minimum | `Δh = WSP − min(BUK.z)` | konservativ, überschätzt Q | O(1) |
| **Zentroid** | `Δh = WSP − z_centroid` | ~1–5% Fehler | O(n) — bereits berechnet |
| Vollintegral | `Q = ∫ μ·dA·√(2g·(WSP−z))` | exakt | O(n), andere Formelstruktur |

---

## Fehleranalyse

Relativer Fehler in Δh durch Zentroid-Näherung:

```
Δh_fehler ≈ h_öffnung² / (24 · Δh)
```

| h_öffnung | Δh | Δh_fehler | Q-Fehler |
|-----------|-----|-----------|---------|
| 1m | 3m | 0.014m | ~0.2% |
| 2m | 3m | 0.056m | ~0.9% |
| 3m | 3m | 0.125m | ~2.1% |
| 4m | 4m | 0.167m | ~2.1% |
| 5m | 5m | 0.208m | ~2.1% |

**Fazit:** Für typische Brücken (h_öffn 1–3m, Δh > 2m): Fehler < 3%.
Bei sehr hohen Öffnungen (> 4m) oder kleinem Δh prüfen.

---

## Status

Entdeckt in MSG 59 (2026-05-25) durch explizite Frage:
> "macht es sinn den Schwerpunkt hier zu nehmen?"

Antwort: Ja — Standardpraxis (Bollrich, HEC-RAS). Fehler dokumentiert aber nicht
als Validierungswarnung eingebaut.

→ [[../../prompt-log/05-pipeline-verifikation#z_centroid-Frage]]
