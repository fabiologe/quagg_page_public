---
name: Gap 3.2 — Topologie
tags: [verifikation, ebene-3, topologie, kst-zonen, hydraulischer-radius]
---

# Gap 3.2 — Topologisch einfach verbundenes Gerinne

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

`zoneMap` wird nach kSt-Wert indiziert.
Der Ingenieur hat implizit angenommen: ein zusammenhängendes Gerinne.

```javascript
zoneMap[kst].A += stripA
zoneMap[kst].P += stripP
// Später:
Q_kst = kst * zoneMap[kst].A^(5/3) / zoneMap[kst].P^(2/3) * sqrt(I)
```

---

## Der Gap

Zwei räumlich **getrennte** Vorlandbereiche mit gleichem kSt-Wert
landen im selben Bucket und werden mit `A/P` zusammengerechnet.

```
Beispiel: Mittelbank mit kSt=30, Vorland links kSt=30, Vorland rechts kSt=30

kst=30 bucket:
  A = A_links + A_mitte + A_rechts    ← korrekt summiert
  P = P_links + P_mitte + P_rechts    ← korrekt summiert

R = A/P    ← FALSCH für getrennte Bereiche!
            Korrekt wäre: R_links = A_links/P_links, etc.
            Q = kst·(A_links^(5/3)/P_links^(2/3) + A_rechts^(5/3)/P_rechts^(2/3) + ...) · √I
```

---

## Konsequenz

Für topologisch zusammenhängende Gerinne (Normalfall): korrekt.
Für Insel-Querschnitte (Mittelbank): falscher hydraulischer Radius → Q-Fehler.

**Fehlerrichtung:** `R_zusammen > R_getrennt` → Q-Überschätzung.
**Fehlergrößenordnung:** Abhängig von Geometrie, bei starker Aufspaltung 5–15%.

---

## Status

Nicht dokumentiert. Betrifft schätzungsweise < 5% der realen Anwendungsfälle.

**Möglicher Fix:** `zoneMap` auf `Map<kst, Segment[]>` umstellen,
Q pro Segment berechnen, erst danach summieren.
