---
name: BridgeHydraulics — Vault Index
tags: [bridge-hydraulics, index]
---

# BridgeHydraulics — Dokumentations-Vault

Obsidian-Vault für das Brücken-Hydraulik-Feature (`PipeHydraulics/`).

## Verifikation

| Datei | Inhalt |
|-------|--------|
| [[verifikation/00-index\|Taxonomie-Index]] | Übersicht aller 4 Ebenen + Befund-Schnellübersicht |
| [[verifikation/00-index\|Taxonomie-Index]] | Vollständige Struktur + Befund-Schnellübersicht |
| [[verifikation/ebene1-prompt/index\|Ebene 1 — Prompt]] | Provenance · Befunde · ζ-Ableitung |
| [[verifikation/ebene2-struktur/index\|Ebene 2 — Struktur]] | Architektur · Datenfluss · Datenstrukturen · Zustandsmaschine |
| [[verifikation/ebene3-gap/index\|Ebene 3 — Gap]] | 6 Einzelbefunde: Pfeiler · Topologie · WSP-Guard · Entkopplung · Zentroid · Manning |
| [[verifikation/ebene4-tests/index\|Ebene 4 — Tests]] | Klassen A–E · Sensitivität · Kalibrierung |

## Prompt-Log

| Datei | Inhalt |
|-------|--------|
| [[prompt-log/00-index\|Prompt-Log Index]] | Übersicht aller Entwicklungsphasen + Timeline |

## Prompt-Log nach Phase

| Phase | Datum | Thema |
|-------|-------|-------|
| [[prompt-log/01-grundmodell\|01 Grundmodell]] | 2026-05-15 | Zwei-Zonen-Modell, Profil-Import, Viewer |
| [[prompt-log/02-ui-validierung\|02 UI & Validierung]] | 2026-05-17 | WSP-Slider, Druck, Validation, kSt-Drag |
| [[prompt-log/03-hydraulik-audit\|03 Hydraulik-Audit]] | 2026-05-23 | 4-Zustand-Abfolge, Pfeiler, ζ-Korrektur |
| [[prompt-log/04-code-qualitaet\|04 Code-Qualität]] | 2026-05-24 | Canvas, Insel-Polygone, Debounce, Q→WSP |
| [[prompt-log/05-pipeline-verifikation\|05 Pipeline-Verifikation]] | 2026-05-25 | Erklärungen, kSt-Zonen, Doppelabzug |
| [[prompt-log/06-pruefhebel-taxonomie\|06 Prüfhebel-Taxonomie]] | 2026-05-26 | Verifikations-Framework, Obsidian-Vault |

## Querverweise

- Prompt-Provenance → [[verifikation/01-ebene1-prompt-analyse]]
- Intention-Gap-Befunde → [[prompt-log/05-pipeline-verifikation#Doppelabzug-Befund]]
- Code-Architektur + Datenstrukturen → [[verifikation/02-ebene2-strukturanalyse]]
- Testklassen + Kalibrierung → [[verifikation/04-ebene4-verhaltenstests]]

## Session-Datei

Alle Prompts stammen aus:
```
/root/.claude/projects/-home-fabio-quagg-page/d6339b1a-def2-43b7-a1f5-0265babb4c12.jsonl
```
Einträge mit `"type":"user"` = wörtliche Prompt-Texte (62 Einträge, 2026-05-15 bis 2026-05-26).
