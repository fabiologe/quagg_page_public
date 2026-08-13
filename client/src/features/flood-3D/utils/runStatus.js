// Laufstatus-Mengen an EINER Stelle. Vorher stand die Aktiv-Liste
// wortgleich in drei Komponenten und der Hauptansicht — eine neue
// Pipeline-Phase hätte vier Stellen gebraucht und still gefehlt, wo
// man sie vergisst.

// Zwischenzustände der Pipeline: solange einer davon anliegt, pollen
// Lauflisten und Log automatisch nach.
export const AKTIV = ['building', 'meshing', 'solving', 'extracting',
  'converting_fields']

// Aus Server-Sicht abgeschlossen. 'lokal' zählt dazu (Companion-
// Reservierung) — sonst pollte die Laufliste ENDLOS, solange irgendein
// alter lokaler Lauf existiert; aktiv ist so ein Lauf nur, wenn DIESER
// Browser ihn fährt (RunListPanel prüft das zusätzlich).
export const TERMINAL = ['completed', 'failed', 'unbekannt', 'lokal']

// Auslagern erst, wenn nichts mehr rechnet oder auf einen Import wartet —
// dieselbe Liste wie serverseitig in core/archiv.py ARCHIVIERBAR
export const TERMINAL_ARCHIV = ['completed', 'teilergebnis', 'abgebrochen',
  'failed']

// Läufe mit auswertbarem Ergebnis: regulär fertig oder abgebrochen und
// bis dahin ausgewertet (Teilergebnis)
export const MIT_ERGEBNIS = ['completed', 'teilergebnis']
