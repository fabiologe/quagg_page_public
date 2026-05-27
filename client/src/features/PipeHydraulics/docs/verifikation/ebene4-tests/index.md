---
name: Ebene 4 — Verhaltenstests & UQ
tags: [verifikation, ebene-4, tests, uq]
---

# Ebene 4 — Verhaltenstests & UQ

**Disziplin:** Softwarequalitätssicherung + numerische Methodik · etabliert, allein nicht hinreichend

← [[../ebene3-gap/index|Ebene 3]] · [[../00-index|Taxonomie-Index]]

---

**Prüffrage:** Stimmt der Output für bekannte Referenzfälle, physikalische
Invarianten, und bei Grenzwertszenarien?

---

## Testklassen

| Datei | Klasse | Inhalt |
|-------|--------|--------|
| [[klasse-a-analytisch]] | A | Analytisch exakte Lösungen — Code = Formel |
| [[klasse-b-invarianten]] | B | Physikalische Invarianten — dürfen nie verletzt sein |
| [[klasse-c-roundtrip]] | C | Q→WSP→Q Round-Trip-Konsistenz |
| [[klasse-d-sensitivitaet]] | D | Sensitivitätsanalyse & UQ — Parameterranking |
| [[klasse-e-grenzfaelle]] | E | Grenzfall-Robustheit — kein Absturz, sinnvolle Reaktion |
| [[kalibrierung]] | — | Reale Daten, HEC-RAS-Vergleich, Bollrich-Tabellen |

---

## Lektion

Ebene 4 ist notwendig aber allein nicht hinreichend:
- Klassen A–E beweisen: Code implementiert die Formeln korrekt
- Sie schließen nicht aus: Formeln wurden falsch angewendet → [[../ebene3-gap/index|Ebene 3]]
- Sie schließen nicht aus: Formeln wurden falsch spezifiziert → [[../ebene1-prompt/index|Ebene 1]]

Alle vier Ebenen sind für vollständige Verifikation erforderlich.
