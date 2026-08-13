> **Historisch** — Stand vor 2026-08-11. Viele Befunde sind inzwischen behoben.
> Aktueller Stand: `AUDIT_FLOOD3D_DEAD_ENDS.md` · Abarbeitung: `ROADMAP_FLOOD3D_PRODUKTIONSREIFE.md`


---

## Runde 2 — Layout-Struktur, umgesetzt und nachgemessen (2026-08-08)

| Kennzahl | Start | nach R1 | nach R2 |
|---|---|---|---|
| Überlappende interaktive Elemente | 78 | 8 | **0** |
| eindeutige Element-Paare | 20 | 2 | **0** |
| Abgeschnittene/gekürzte Texte | 52 | 28 | 28 |

`ragt-aus-fenster` (57) betrifft **ausschliesslich** uPlot-Interna
(`u-under`/`u-over`/`u-axis`) innerhalb scrollbarer Diagrammbereiche —
keine echten Überstände mehr.

### Gezielt nachgemessen

| Prüfung | vorher | nachher |
|---|---|---|
| Zeitleiste sichtbar (1366×768 / 1280×800 / 1440×900) | unter der Falz | **sichtbar in allen drei** |
| Bedienspalte Raum | wuchs auf 1400+ px, dehnte den Viewport | scrollt, Canvas 575–712 px |
| Editor-Werkzeugleiste (1024–1920 px) | „Netz“/„Freischneiden“ ab ~1470 px abgeschnitten | **10/10 Knöpfe erreichbar**, max. 3 Zeilen |

### Ursachen, die dahintersteckten

- **`height: 100%` gegen einen Container ohne feste Höhe** ist
  wirkungslos, und ohne `min-height: 0` greift `overflow-y` in einer
  Flexbox nie. Deshalb wuchs die Bedienspalte unbegrenzt und dehnte den
  Viewport per `stretch` gleich mit.
- Die Erklärkarte klemmte ihr `top` auf `0.3 · Fensterhöhe` und legte
  sich damit über die Bedienspalte samt ihrem eigenen Auslöser.
- `.f3d-sculptbar` war **nirgends definiert** und erbte die 340-px-Box
  der Clip-Leiste (Bedarf ≈ 900 px).
- Acht Utility-Klassen waren nur in **fremden** scoped Styles definiert
  und wirkten in rund 135 Verwendungen grösstenteils nicht.

### Offen für Runde 3

Klickziele (432 unter 28 px), fehlende Breakpoints (Fenster < 1100 px),
Einheiten/Grenzen im PropertyPanel, Zeit-Label zeigt den angeforderten
statt geladenen Zeitpunkt, Modal-Fokus.

---

## Runde 3 — Konsistenz und Zugänglichkeit (2026-08-08)

| Kennzahl | Start | R1 | R2 | **R3** |
|---|---|---|---|---|
| Überlappende interaktive Elemente | 78 | 8 | 0 | **0** |
| eindeutige Element-Paare | 20 | 2 | 0 | **0** |
| Klickziele unter 28 px | 486 | 432 | 432 | **352** |
| Knöpfe ohne Beschriftung | 11 | 12 | 11 | **8** |
| Abgeschnittene Texte | 52 | 28 | 28 | **28** |
| „ragt aus dem Fenster“ (davon uPlot-intern) | 58 | 58 | 57 | **54 (54)** |

Umgesetzt: Mindestgröße 32 px für Standardknöpfe, Trefffläche kleiner
Icon-Knöpfe per unsichtbarem Pseudo-Element auf 32 px (WCAG 2.5.8) ohne
Layoutänderung; Löschkreuz auf Touch sichtbar; Zeitleiste zeigt den
**geladenen** statt den angeforderten Zeitpunkt samt Ladezustand;
Import-Dialog mit Escape, Fokus-Falle, `role="dialog"` und einem
Store-Flag, das die globalen Tastatur-Handler ruhigstellt (Escape und
Strg+Z wirkten vorher hinter dem Dialog auf Szene und Modell);
Untergrenzen für Größen, die nicht negativ sein können.

### Bewusst zurückgenommen

Eine zweite Breakpoint-Stufe (**Stapeln unter 1024 px**) war gebaut und
ist wieder entfernt: gemessen erzeugte sie **17 neue Überlappungen**,
weil der 3D-Editor mit seinen absolut positionierten Bedienleisten und
der Canvas dafür eine eigene Höhenlogik brauchen. Die 1280er-Stufe
(schmalere Spalten) bleibt und ist sauber. Sehr schmale Fenster bleiben
damit ein offener, eigener Umbau.

**Lehre daraus:** Eine globale Media Query verliert gegen die *scoped*
Styles der Komponenten — ein nur halb greifender Breakpoint zerreisst das
Layout schlimmer, als gar keiner es täte. Breakpoints gehören dorthin,
wo die Basisregel steht.

### Weiterhin offen

Die 352 verbliebenen „kleinen“ Ziele sind überwiegend Eingabefelder und
Listenzeilen (optisch klein, aber breit und gut zu treffen); 28
gekürzte Texte betreffen lange CAD-Objektnamen im Baum (mit „…“
gekürzt, Volltext im Eigenschaftspanel). Nicht angefasst: ein
einheitliches Änderungsmodell für die Formulare (drei Muster
nebeneinander) und die Gruppierung des 12-Checkbox-Blocks.
