---
name: Gap 3.1 — Pfeiler Doppelabzug
tags: [verifikation, ebene-3, pfeiler, doppelabzug]
---

# Gap 3.1 — Pfeiler nicht im Terrain

← [[index|Ebene 3 Index]]

---

## Implizite Annahme

Der φ-Parameter setzt voraus dass die Pfeilergeometrie **nicht** in den
Terrain-Punkten modelliert ist. Steht nirgends im Code.

```javascript
const phi    = Math.min(nPiers * bPier / L_BUK, 0.95)
const A_netto = A_bridge * (1 - phi)
```

---

## Der Gap

Der Ingenieur hat implizit gedacht: "Pfeiler werden parametrisch angegeben."
Die KI hat die Formel korrekt implementiert — aber nicht dokumentiert
unter welcher Bedingung sie gilt.

Wenn ein User Pfeiler als Terrain-Erhöhung (Bump) zeichnet:
- Die Terrain-Bumps reduzieren `A_bridge` bereits geometrisch korrekt
- φ > 0 zieht zusätzlich ab → **Doppelabzug**

---

## Entdeckung

Entdeckt in MSG 57 (2026-05-25) durch explizite Frage des Ingenieurs:
> "würde man dann nicht bei unserem Model den Pfeiler doppelt abziehen da man ja
> den Pfeiler gar nicht wirklich zeichnet sondern der durch das Gelände den
> Querschnitt verringert bzw in zwei Durchlässe teilt?"

→ [[../../prompt-log/05-pipeline-verifikation#Doppelabzug-Befund]]

---

## Konsequenzen

| Situation | A_bridge | φ-Abzug | Ergebnis |
|-----------|----------|---------|---------|
| Pfeiler als Terrain-Bump | korrekt reduziert | 0 | ✓ korrekt |
| Parametrisch (nPiers > 0) | volle Öffnung | > 0 | ✓ korrekt |
| Beides gleichzeitig | reduziert | > 0 | ✗ Doppelabzug |

---

## Maßnahme

Hinweistext in `BridgeInputPanel.vue` ergänzt:

> "Nur verwenden wenn Pfeiler nicht im Geländeprofil eingezeichnet sind.
> Pfeiler als Terrain-Erhöhung modelliert → n = 0 setzen (sonst Doppelabzug).
> φ = n · b_P / L_BUK    A_netto = A_öffn. · (1 − φ)"

**Klassifikation:** Typischer Ebene-3-Befund — keine Exception, plausible Zahlen,
nur durch Hinterfragen der Nutzungsannahme auffindbar.
