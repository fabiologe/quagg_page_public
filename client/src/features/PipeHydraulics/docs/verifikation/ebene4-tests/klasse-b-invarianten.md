---
name: Klasse B — Physikalische Invarianten
tags: [verifikation, ebene-4, klasse-b, invarianten]
---

# Klasse B — Physikalische Invarianten

← [[index|Ebene 4 Index]]

Dürfen **niemals** verletzt sein. Sollten nach jeder größeren Codeänderung
automatisch geprüft werden (können als Smoke-Tests implementiert werden).

---

## B.1 — Kein Abfluss unter Geländeminimum

```javascript
// WSP ≤ tiefstem Geländepunkt → kein Wasser
Q_total === 0  wenn  wsp <= Math.min(...terrain.map(p => p.z))
```

**Warum:** Physikalische Grundbedingung. Wenn kein Wasser im Querschnitt steht, fließt nichts.

---

## B.2 — Q monoton steigend mit WSP

```javascript
// Innerhalb eines Zustands muss Q mit WSP wachsen
Q(wsp + 0.01) > Q(wsp)   für alle wsp
```

**Warum:** Mehr Wasserstand → mehr Fläche → mehr Q. Ausnahme: Zustandswechsel kann
einen kurzen nicht-monotonen Bereich erzeugen (Manning→Orifice-Kink).
Die Übergangsglättung `max()` soll das abfangen.

---

## B.3 — Vorland kann nicht negativ beitragen

```javascript
Q_total >= Q_orifice   immer
```

**Warum:** Vorland-Manning kann nur positiv zu Q beitragen (bei gleichem Sohlgefälle).
Wenn `Q_total < Q_orifice` → Rechenfehler im Vorland-Anteil.

---

## B.4 — flowMode='free' verhindert isSubmerged

```javascript
isSubmerged === false   wenn  flowMode === 'free'
state <= 1             wenn  flowMode === 'free'
```

**Warum:** Ingenieur erzwingt Freispiegel — das Modell muss diese Entscheidung respektieren.

---

## B.5 — State immer definiert

```javascript
[0, 1, 2, 3].includes(state)   immer   // niemals undefined, null, NaN
```

**Warum:** State steuert die Q-Formelauswahl. Undefinierter State → falsche Formel.

---

## B.6 — A_bridge = 0 ohne BUK

```javascript
A_bridge === 0   wenn  wsp < Math.min(...bukProfile.map(p => p.z))
```

**Warum:** Wenn WSP die BUK nicht erreicht, gibt es keine Öffnungsfläche unter Druck.

---

## B.7 — Poleni-Kontinuität

```javascript
// Q_poleni → 0 wenn h_ü → 0 (kein Sprung)
Q_poleni(wsp = BOK_min + 0.001)  <  0.01 m³/s   // für typische Geometrien
```

**Warum:** Poleni-Formel ist Q ∝ h^(3/2) — bei h→0 geht Q→0 kontinuierlich.
Wenn ein Sprung auftritt, liegt ein numerischer Fehler vor.

---

## B.8 — isSubmerged = false ohne Brücke

```javascript
isSubmerged === false   wenn  !hasBridge
```

**Warum:** Ohne BUK kann kein Druckabfluss entstehen. State muss 0 bleiben.
