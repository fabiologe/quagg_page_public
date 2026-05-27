---
name: Gap 3.4 — Hydraulische Entkopplung
tags: [verifikation, ebene-3, entkopplung, vorland, orifice]
---

# Gap 3.4 — Vorland und Öffnung hydraulisch entkoppelt

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

Vorland und Brückenöffnung sind hydraulisch unabhängig.
Nie explizit diskutiert — die KI hat den Standard-Lehrbuch-Ansatz gewählt.

```javascript
Q1_total = Q_orifice + Q_plain1
//         ^^^^^^^^   ^^^^^^^^
//         Öffnung    Vorland
//         unabhängig berechnet
```

---

## Der Gap

Bei sehr engem Querschnitt (Taldurchlass, kein Vorland) beeinflussen sich
beide Zonen über die gemeinsame Energielinie gegenseitig:

- Erhöhter Q_orifice senkt den Wasserstand oberstrom
- Dadurch sinkt der tatsächliche Δh
- Q_plain verändert sich entsprechend

Die einfache Addition `Q_orifice + Q_plain` ignoriert diese Rückkopplung.

---

## Wann ist der Fehler relevant?

| Querschnitt | Vorland-Anteil | Fehler |
|-------------|---------------|--------|
| Breites Tal mit Vorland | groß | gering — Öffnung dominiert nicht |
| Normaler Brückenquerschnitt | mittel | vernachlässigbar |
| Enger Taldurchlass | klein/null | potentiell signifikant |

**Fehlerrichtung:** Q-Überschätzung (beide Anteile voll addiert).

---

## Standard-Praxis

Diese Entkopplung ist der Standard-Ansatz nach DIN 19661 / HEC-RAS /
Bollrich für Einzelbauwerks-Berechnung. Nur bei detaillierter 1D-HN-Berechnung
mit expliziter Energielinie-Iteration wird die Kopplung aufgelöst.

**Status:** Nicht hinterfragt, Standard-Praxis. Für das Anwendungsziel
(Einzelbauwerks-Abschätzung) akzeptabel.
