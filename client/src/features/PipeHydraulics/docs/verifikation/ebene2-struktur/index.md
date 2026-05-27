---
name: Ebene 2 — Strukturanalyse
tags: [verifikation, ebene-2, architektur]
---

# Ebene 2 — Strukturanalyse

**Disziplin:** Softwarearchitektur + Fachdisziplin · Analogie: Code-Review durch Fachingenieur

← [[../ebene1-prompt/index|Ebene 1]] · [[../00-index|Taxonomie-Index]] · Weiter: [[../ebene3-gap/index|Ebene 3]]

---

**Prüffrage:** Entspricht die Modulstruktur dem hydraulischen Berechnungsablauf?
Sind Abstraktionsebenen fachlich sinnvoll?

---

## Inhalt dieser Ebene

| Datei | Thema |
|-------|-------|
| [[architektur]] | Modul-Übersicht, Dependency-Graph (azyklisch) |
| [[datenfluss]] | User-Aktion → Berechnung → Anzeige, Debounce-Strategie |
| [[datenstrukturen]] | calcParams, currentResult, z1Segment, ValidationItem |
| [[zustandsmaschine]] | 4 hydraulische Zustände, Übergangsbedingungen |
| [[befunde]] | 4 strukturelle Befunde (2.1–2.4) |

---

## Lektion

Strukturanalyse deckt Fälle auf wo der Code korrekte Ergebnisse
aus falschen Gründen liefert — was bei Parameteränderungen zu stillen Fehlern führt.

Was Ebene 2 nicht kann: Sie prüft die Struktur — nicht ob die Formeln stimmen
([[../ebene4-tests/index|Ebene 4]]) oder welche Annahmen implizit gemacht wurden ([[../ebene3-gap/index|Ebene 3]]).
