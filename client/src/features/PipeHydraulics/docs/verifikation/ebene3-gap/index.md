---
name: Ebene 3 — Intention-Implementation-Gap
tags: [verifikation, ebene-3, intention-gap, implizite-annahmen]
---

# Ebene 3 — Intention-Implementation-Gap

**Disziplin:** Kognitionswissenschaft + Kommunikationstheorie · methodisch neu, kein Analogon

← [[../ebene2-struktur/index|Ebene 2]] · [[../00-index|Taxonomie-Index]] · Weiter: [[../ebene4-tests/index|Ebene 4]]

---

**Prüffrage:** Welche impliziten Annahmen hat der Ingenieur gemacht die nicht
im Prompt stehen? Hat die KI diese Lücken gefüllt — und womit?

**Methodik:** Für jeden Algorithmus-Baustein fragen:
*"Was muss gelten damit dieser Code korrekt ist?"*

---

## Befunde

| # | Datei | Implizite Annahme | Risiko | Status |
|---|-------|------------------|--------|--------|
| 3.1 | [[01-pfeiler-doppelabzug]] | Pfeiler nicht im Terrain | Doppelabzug | Hinweistext ergänzt |
| 3.2 | [[02-topologie]] | Gerinne topologisch einfach verbunden | Falscher R bei Insel-Querschnitt | Nicht dokumentiert |
| 3.3 | [[03-wsp-guard]] | WSP > 0 immer gültig | Tidegebiet unbrauchbar | Stiller Fehler |
| 3.4 | [[04-entkopplung]] | Vorland/Öffnung hydraulisch entkoppelt | Q-Überschätzung bei engen Durchlässen | Nicht hinterfragt |
| 3.5 | [[05-zentroid]] | Gleichförmige Geschwindigkeitsverteilung | < 3% Fehler bei typischen Brücken | Nicht dokumentiert |
| 3.6 | [[06-manning-zone2]] | Manning gilt für flache Zone-2-Überströmung | Fehler bei h₂ < 5cm | Nicht gesichert |

---

## Lektion

Das sind die **gefährlichsten Fehler:**
- Keine Exception
- Plausible Zahlen
- Nur durch explizites Hinterfragen der Annahmen auffindbar

**Warum kein Analogon bei proprietärer Software?**
Bei proprietärer Software ist der Prompt-Code-Abstand nicht sichtbar.
Bei KI-Code ist er durch die `.jsonl`-Dateien rekonstruierbar — und damit prüfbar.

---

## Checkliste für neue Features

Für jeden neuen Algorithmus-Baustein:

- [ ] Was muss gelten damit dieser Code korrekt ist?
- [ ] Steht das explizit im Prompt oder ist es eine Annahme?
- [ ] Für welche Randfälle gilt die Annahme nicht?
- [ ] Ist der Fehlerfall dokumentiert oder ein stiller Fehler?
