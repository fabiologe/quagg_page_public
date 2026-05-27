---
name: Ebene 1 — Prompt-Provenance
tags: [verifikation, ebene-1, provenance, jsonl]
---

# Prompt-Provenance — Wo die Prompts liegen

← [[index|Ebene 1 Index]]

---

## Session-Datei

Claude Code speichert jede Session vollständig als JSONL:

```
/root/.claude/projects/-home-fabio-quagg-page/<session-uuid>.jsonl
```

Jede Zeile = ein JSON-Objekt. Einträge mit `"type":"user"` = wörtlicher Prompt-Text.

**Hauptsession BridgeHydraulics:**
```
UUID:      d6339b1a-def2-43b7-a1f5-0265babb4c12
Zeitraum:  2026-05-15 bis 2026-05-26
Prompts:   62 User-Nachrichten (MSG 0–61)
```

---

## Ursprungsprompt (MSG 0, 2026-05-15)

```
"oki ich müsste hier upgraden und eine weitere berechnungstool einbauen
mit der möglichkeit ein custom profil zu zeichnen und einen solchen
zustand zu berechnen um eine WSP linie im Profil angezeigt zu bekommen:

Zone 1: Durchströmter Brückenquerschnitt (geschlossen) —
Benetzter Umfang U enthält auch die Brückenunterseite (BUK)
als benetzte Fläche mit einrechnen!
Q₁ = kst₁ · A₁ · R₁^(2/3) · I^(1/2)

Zone 2: sobald WSP > BOK:
Q₂ = kst₂ · A₂ · R₂^(2/3) · I^(1/2), kst₂ = 25–30
Q_gesamt = Q₁ + Q₂"
```

---

## Prompt aus JSONL extrahieren

```python
import json

path = '/root/.claude/projects/-home-fabio-quagg-page/d6339b1a-....jsonl'
with open(path) as f:
    for line in f:
        obj = json.loads(line)
        if obj.get('type') == 'user':
            content = obj['message']['content']
            if isinstance(content, list):
                text = ' '.join(c.get('text','') for c in content
                                if isinstance(c, dict) and c.get('type') == 'text')
            else:
                text = str(content)
            print(obj.get('timestamp',''), text[:200])
```

---

## Prompt-zu-Code-Verknüpfung

Vollständige Provenance nach Entwicklungsphase:

| Phase | Zeitraum | Datei |
|-------|----------|-------|
| Grundmodell | 2026-05-15 | [[../../prompt-log/01-grundmodell]] |
| UI & Validierung | 2026-05-17 | [[../../prompt-log/02-ui-validierung]] |
| Hydraulik-Audit | 2026-05-23 | [[../../prompt-log/03-hydraulik-audit]] |
| Code-Qualität | 2026-05-24 | [[../../prompt-log/04-code-qualitaet]] |
| Pipeline-Verifikation | 2026-05-25 | [[../../prompt-log/05-pipeline-verifikation]] |
| Taxonomie | 2026-05-26 | [[../../prompt-log/06-pruefhebel-taxonomie]] |
