---
name: Phase 6 — Prüfhebel-Taxonomie
tags: [prompt-log, ebene-1, pruefhebel, taxonomie, obsidian, verifikation]
date: 2026-05-26
session: d6339b1a-def2-43b7-a1f5-0265babb4c12
msgs: 60–62
---

# Phase 6 — Prüfhebel-Taxonomie & Obsidian-Vault

← [[05-pipeline-verifikation]] · [[00-index|Übersicht]]

---

## MSG 60 — Taxonomie-Auftrag (2026-05-26)

**Prompt-Kern (wörtlich):**
> "Aufgabe: Entwicklung einer Pruefhebel-Taxonomie
> Im Gegensatz zu proprietaerer Software existieren fuer KI-generierten Code vier verschiedene Pruefhebel mit grundlegend unterschiedlichem Informationsgehalt und Aufwand. Deren Taxonomie ist zu entwickeln, zu begruenden und am Anwendungsfall zu erproben:
>
> Ebene 1 -- Prompt-Analyse: War die Aufgabenstellung fachlich korrekt formuliert? Hat der Prompt die Methodik klar genug spezifiziert?
> Ebene 2 -- Strukturanalyse: Entspricht die Modulstruktur dem hydraulischen Berechnungsablauf?
> Ebene 3 -- Intention-Implementation-Gap: Welche impliziten Annahmen hat der Ingenieur gemacht?
> Ebene 4 -- Verhaltenstests & UQ: Stimmt der Output für bekannte Referenzfälle?"

**Entstandene Dokumente:**
- `HYDRAULIK_VERIFIKATION.md` — vollständige Taxonomie mit konkreten Befunden
- `PROMPT_LOG.md` (jetzt: `docs/prompt-log/`) — Prompt-Provenance-Datei

**Implizit nicht gefordert:**
- Konkrete Test-Werte für Klasse A (KI hat Referenzberechnungen durchgeführt)
- Sensitivitäts-Ranking für Klasse D (KI-Ergänzung)
- Grenzfall-Spezifikation für Klasse E (KI-Ergänzung)

---

## MSG 61 — Obsidian-Vault-Auftrag (2026-05-26)

**Prompt-Kern (wörtlich):**
> "mache den @client/src/features/PipeHydraulics/PROMPT_LOG.md vollständig glaube das ist echt wichtig packe es in einen folder und erstelle unterkapitel also nicht eine riesige prompt_log.md datei sondern mehrer damit ich das später in obsidian laden kann mit den verweisen am besten"

**Entstandene Struktur:**
```
docs/
  index.md                          ← Vault-Einstiegspunkt
  prompt-log/
    00-index.md                     ← Übersicht aller Phasen
    01-grundmodell.md               ← 2026-05-15, MSG 0–7
    02-ui-validierung.md            ← 2026-05-17, MSG 8–20
    03-hydraulik-audit.md           ← 2026-05-23, MSG 21–33
    04-code-qualitaet.md            ← 2026-05-24, MSG 34–50
    05-pipeline-verifikation.md     ← 2026-05-25, MSG 51–59
    06-pruefhebel-taxonomie.md      ← 2026-05-26, MSG 60–62 (diese Datei)
```

Alle Dateien haben:
- YAML Frontmatter mit `tags`, `date`, `session`, `msgs`
- `[[wiki links]]` zu verwandten Dateien (Obsidian-kompatibel)
- Wörtliche Prompt-Zitate aus `.jsonl`-Datei
- Ebene-3-Befund-Verweise auf `HYDRAULIK_VERIFIKATION.md`

---

## Warum dieser Vault?

Der Vault ist selbst ein Ebene-1-Prüfinstrument.

### Ohne Vault
```
Code existiert.
Ingenieur: "Warum ist das so implementiert?"
Antwort: "Trust me bro."
```

### Mit Vault
```
Code existiert.
Ingenieur: "Warum ist μ_eff = μ/√(1+μ²·ζ)?"
Antwort: [[03-hydraulik-audit#MSG 30 — ζ-Korrektur]]
→ Prompt: "ζ·v²/2g Verlustterm in Bernoulli-Bilanz"
→ Ableitung: nachvollziehbar, prüfbar, zitierbar
```

Der Prompt ist das Pflichtenheft. Der Vault ist der Nachweis.

---

## Session-Provenance

```
Session-UUID:  d6339b1a-def2-43b7-a1f5-0265babb4c12
JSONL-Pfad:    /root/.claude/projects/-home-fabio-quagg-page/d6339b1a-def2-43b7-a1f5-0265babb4c12.jsonl
Zeitraum:      2026-05-15 bis 2026-05-26
User-Prompts:  62 Einträge (MSG 0–61)
```

Alle wörtlichen Zitate in diesem Vault stammen aus `"type":"user"`-Einträgen
der `.jsonl`-Datei — maschinell extrahiert, nicht rekonstruiert.

---

## Ebene-1-Bewertung dieser Phase

| # | Befund | Status |
|---|--------|--------|
| 6.1 | Taxonomie explizit und präzise im Prompt vorgegeben — vollständig umgesetzt | ✓ |
| 6.2 | Konkrete Test-Werte (Klasse A) — nicht im Prompt, KI-Ergänzung | ⚠ implizit |
| 6.3 | Obsidian-Format explizit gewählt ("damit ich das später in obsidian laden kann") | ✓ |
| 6.4 | Vault-Struktur (6 Dateien statt 1) — explizit verlangt ("nicht eine riesige Datei") | ✓ |

---

## Nächste Schritte

- [ ] [[../../HYDRAULIK_VERIFIKATION#Klasse A — Analytisch exakte Lösungen]] — Unit-Tests implementieren
- [ ] [[../../HYDRAULIK_VERIFIKATION#Klasse C — Round-Trip]] — Round-Trip-Test durchführen
- [ ] Kalibrierung mit realen Messdaten (Pegel OW + UW + Q-Messung)
- [ ] HEC-RAS-Vergleich für ein bekanntes Querprofil
