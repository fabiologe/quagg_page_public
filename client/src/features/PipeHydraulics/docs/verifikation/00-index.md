---
name: Prüfhebel-Taxonomie — Index
tags: [verifikation, taxonomie, index]
---

# Prüfhebel-Taxonomie — Index

KI-generierter Ingenieurcode lässt sich nicht wie proprietäre Software prüfen.
Vier strukturell verschiedene Prüfhebel existieren — mit unterschiedlichem
Informationsgehalt, Aufwand und Zugang.

→ [[../index|Vault Index]] · [[../prompt-log/00-index|Prompt-Log]]

---

## Warum vier Ebenen?

Proprietäre Software hat nur Ebene 4 (Black-Box). KI-generierter Code
exponiert zusätzlich den Entstehungsprozess — Prompt, Strukturentscheidungen,
implizite Lücken. Das ist ein Vorteil wenn man ihn nutzt, ein Risiko wenn nicht.

---

## Struktur

```
verifikation/
  ebene1-prompt/
    index.md          ← Übersicht Ebene 1
    provenance.md     ← Wo Prompts liegen, JSONL, Extraktion
    befunde.md        ← 4 Befunde: ζ, Übergang, z_centroid, plainMap
    zeta-ableitung.md ← Vollständige Bernoulli-Ableitung μ_eff = μ/√(1+μ²·ζ)

  ebene2-struktur/
    index.md          ← Übersicht Ebene 2
    architektur.md    ← Modul-Übersicht, Dependency-Graph, Verantwortungstrennung
    datenfluss.md     ← User→Berechnung→Anzeige, Debounce-Strategie
    datenstrukturen.md← calcParams, currentResult, z1Segment, ValidationItem
    zustandsmaschine.md← 4 Zustände, Übergänge, flowMode, Q-Formeln
    befunde.md        ← 4 strukturelle Befunde (2.1–2.4)

  ebene3-gap/
    index.md              ← Übersicht + Checkliste
    01-pfeiler-doppelabzug.md ← φ-Annahme, Doppelabzug, Hinweistext
    02-topologie.md           ← zoneMap-Bucket, falscher R bei Insel
    03-wsp-guard.md           ← wsp<=0 Guard, Tidegebiet
    04-entkopplung.md         ← Vorland/Öffnung entkoppelt
    05-zentroid.md            ← Δh-Fehleranalyse, Alternativen
    06-manning-zone2.md       ← Manning-Gültigkeitsgrenze h₂ < 5cm

  ebene4-tests/
    index.md               ← Übersicht Testklassen
    klasse-a-analytisch.md ← 7 Handrechenkontrollen mit Zahlenwerten
    klasse-b-invarianten.md← 8 physikalische Invarianten
    klasse-c-roundtrip.md  ← Q→WSP Bisection, kritische Fälle
    klasse-d-sensitivitaet.md← UQ, Parameterranking, Sensitivitäten
    klasse-e-grenzfaelle.md  ← 9 Grenzfälle, WSP-Guard-Bug
    kalibrierung.md          ← Pegel, HEC-RAS, Bollrich, Protokoll-Vorlage
```

---

## Zusammenfassung

| Ebene | Ordner | Was wird geprüft | Vorteil bei KI-Code |
|-------|--------|-----------------|---------------------|
| 1 | [[ebene1-prompt/index\|ebene1-prompt/]] | Übereinstimmung Absicht / Instruktion | Prompt archiviert — nachweisbar |
| 2 | [[ebene2-struktur/index\|ebene2-struktur/]] | Fachliche Sinnhaftigkeit der Architektur | Architektur erklärbar, nicht verborgen |
| 3 | [[ebene3-gap/index\|ebene3-gap/]] | Implizite Annahmen des Ingenieurs | Gap sichtbar durch Prompt-Code-Abstand |
| 4 | [[ebene4-tests/index\|ebene4-tests/]] | Input-Output-Korrektheit | Einziger Hebel auch bei proprietärer SW |

---

## Befund-Schnellübersicht

| # | Ebene | Befund | Status |
|---|-------|--------|--------|
| 1.1 | Prompt | ζ-Korrektur analytisch abgeleitet | ✓ nachgewiesen |
| 1.2 | Prompt | Übergangsglättung max() | ✓ vertretbar |
| 1.3 | Prompt | z_centroid Standardnäherung | ✓ vertretbar |
| 1.4 | Prompt | plainMap bei Druckabfluss | ✓ korrekt |
| 2.1 | Struktur | Trennung Hydraulics/Renderer/Store | ✓ korrekt |
| 2.2 | Struktur | A_bridge in Manning-Schleife | ⚠ vertretbar |
| 2.3 | Struktur | State-Detection via BUK-Minimum | ⚠ bekannt |
| 2.4 | Struktur | plainMap immer befüllt | ⚠ korrekt |
| 3.1 | Gap | Pfeiler-Doppelabzug | ⚠ Hinweis ergänzt |
| 3.2 | Gap | Topologie einfach verbunden | ⚠ offen |
| 3.3 | Gap | WSP>0 Guard (Tidegebiet) | ⚠ stiller Fehler |
| 3.4 | Gap | Entkopplung Vorland/Öffnung | ⚠ Standard-Praxis |
| 3.5 | Gap | Zentroid-Fehler < 3% | ⚠ dokumentiert |
| 3.6 | Gap | Manning h₂ < 5cm | ⚠ offen |

> "Der einzige Weg zur Gewissheit ist nicht mehr Vertrauen — sondern systematisches Misstrauen
> gegenüber allen impliziten Annahmen." — Ebene-3-Prinzip
