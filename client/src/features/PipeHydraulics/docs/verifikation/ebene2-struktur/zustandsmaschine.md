---
name: Ebene 2 — Zustandsmaschine
tags: [verifikation, ebene-2, zustandsmaschine, hydraulik, vier-zustaende]
---

# Hydraulische Zustandsmaschine

← [[index|Ebene 2 Index]]

---

## Die vier Zustände

Eine Brücke hat zu jedem Zeitpunkt genau einen von vier möglichen hydraulischen
Zuständen. Diese Zustände folgen einer physikalisch zwingenden Abfolge mit steigendem Q.

```
state 0: Kein Brückenprofil
──────────────────────────────────────────────
  Bedingung: !hasBridge  (BUK fehlt oder < 2 Punkte)
  Q-Formel:  Manning(gesamt) — ganzes Profil als offenes Gerinne

state 1: Brücke, Freispiegel
──────────────────────────────────────────────
  Bedingung: hasBridge && !isSubmerged
             ↔ WSP < min(BUK.z)
  Q-Formel:  Manning(gesamt) — BUK noch nicht benet

state 2: Druckabfluss
──────────────────────────────────────────────
  Bedingung: hasBridge && isSubmerged && !hasOverflow
             ↔ WSP ≥ min(BUK.z) && WSP ≤ min(BOK.z)
  Q-Formel:  Orifice(Öffnung) + Manning(Vorland)

state 3: Druckabfluss + Überströmung
──────────────────────────────────────────────
  Bedingung: hasBridge && isSubmerged && hasOverflow
             ↔ WSP ≥ min(BUK.z) && WSP > min(BOK.z)
  Q-Formel:  Orifice(Öffnung) + Poleni(Überströmung) + Manning(Vorland)
```

---

## Übergangsbedingungen

```
Q steigt monoton ─────────────────────────────→

WSP wächst:
 0 ──────── state 0 ──────────────────────────────→
            !hasBridge

 hasBridge ─ state 1 ── state 2 ── state 3 ───────→
             WSP <        WSP ≥     WSP >
             BUK_min      BUK_min   BOK_min
```

**Wichtig:** Zustände können nie übersprungen werden.
- State 0→2 ist nicht möglich (State 1 muss durchlaufen werden)
- State 1→3 ist nicht möglich (State 2 muss durchlaufen werden)

---

## flowMode-Override

Der `flowMode`-Parameter erlaubt manuelle Kontrolle:

| flowMode | Effekt |
|----------|--------|
| `'auto'` | Zustand folgt WSP vs. BUK/BOK (Standard) |
| `'free'` | `isSubmerged = false` erzwungen → immer State 0/1 |
| `'pressure'` | `isSubmerged = true` erzwungen → mindestens State 2 |

Anwendungsfall `'free'`: Ingenieur weiß dass Brücke nicht einstaut (konservative Prüfung).
Anwendungsfall `'pressure'`: Rückstau-Szenario — Druckabfluss auch ohne WSP ≥ BUK_min.

---

## State-Detection: Bekannte Einschränkung

```javascript
isSubmerged = wsp >= Math.min(...bukProfile.map(p => p.z))
```

Globales BUK-Minimum — sobald **ein** BUK-Punkt untergetaucht ist,
wechselt das gesamte System in State 2.

**Problem bei geneigter BUK:** Schräge Brücke mit BUK von z=3m (links) bis z=5m (rechts).
Bei WSP=3.5m: linke Hälfte schon Druckabfluss, rechte Hälfte noch Freispiegel.
Das Modell rechnet in diesem Übergangsbereich bereits vollständig mit Orifice.

**Akzeptierte Vereinfachung:** Explizit entschieden in MSG 41 (2026-05-24).
Partieller Druckabfluss ist physikalisch korrekter aber erheblich komplexer.
Für den Normalfall (flache BUK) ist der Fehler vernachlässigbar.

→ [[../ebene3-gap/index|Ebene 3]] — Intention-Implementation-Gap

---

## Q-Formeln je Zustand

### State 0 + 1 — Manning (Einstein-Komposit)

```
Q = Σ_kSt  kSt · A_kSt^(5/3) / P_kSt^(2/3) · √I
```

Alle Streifen gleicher kSt werden zu einem Bucket akkumuliert.
`allKeyX()` stellt sicher dass kein Streifen eine Zonengrenze überquert.

### State 2 — Orifice + Manning(Vorland)

```
Q_orifice = μ_eff · A_netto · √(2g · h_drive)
Q_plain   = Manning(Vorland-Streifen außerhalb BUK-Fußabdruck)
Q1_total  = max(Q_orifice, Q_manning_bridge) + Q_plain
```

### State 3 — Orifice + Poleni + Manning(Vorland)

```
Q_poleni = ∫ (2/3) · μD · √(2g) · h_ü(x)^(1.5) dx    [streifenweise]
Q1_total = max(Q_orifice, Q_manning_bridge) + Q_plain
Q2_total = Q_poleni
Q_total  = Q1_total + Q2_total
```
