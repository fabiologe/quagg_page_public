# Audit flood3D PostProcessing — 2026-08-05

Anlass: Vor dem ersten echten Lauf wurde die Pipeline geprüft — Ergebnis: der Lauf selbst
funktioniert, aber das PostProcessing wurde nie systematisch behandelt. Zwei gründliche
Audits (Backend-Ergebnispipeline + Client-Post-UI) auf dem Stand von master `0aec475`.

**Leitbefund: Das PostProcessing verletzt genau die Prinzipien, die das PreProcessing
heute bekommen hat.** Keine Rohdaten/Ableitungs-Trennung, drei divergierende
Nachlaufketten, der Browser rechnet Server-Zahlen nach (und kommt auf andere Werte),
und das UI urteilt (Ampeln, Empfehlungen), statt zu zeigen — entgegen der Kurskorrektur
„Simulations-Frontend, kein Nachweis-Werkzeug".

---

## A. Läuft ein echter Lauf durch? JA — mit vier Fixes davor

Die Kette Fallbau → blockMesh → surfaceFeatureExtract → snappy → topoSet/createPatch →
setFields → decomposePar → interFoam (mpirun) → reconstructPar → Extraktion →
evaluate → render ist geschlossen; Docker-Image `opencfd/openfoam-run:2406` vorhanden;
Vorfüllung korrekt im Lauf-Pfad (STL + surfaceToCell, setFields nach dem Vernetzen).
Vier Dinge VOR dem ersten Lauf:

- **A1 GEFAHR** `runner.py:339` (+ `local_runner.py:328`): `postProcess -func writeCellCentres`
  lädt zusätzlich ALLE controlDict-functions und führt sie bei t=0 erneut aus — kann
  sämtliche `postProcessing/*/0/*.dat`-Zeitreihen auf eine t=0-Zeile stutzen, BEVOR die
  Extraktion liest. Fix: `-noFunctionObjects`.
- **A2 FEHLER (verifiziert)** `casebuilder.py:228` vs. `:147`: `wall_shear` (rechnet
  `wallShearStress`) steht NACH seinen Konsumenten `tau_betrag`/`shear_*` — erster
  Messwert kaputt (Leser greift Zeitspalte), alle weiteren einen Schreibschritt alt.
  Fix: Block nach oben. (Der Code-Kommentar beschreibt sogar die richtige Absicht.)
- **A3 LÜCKE** `POST /runs` (`router.py:1261`) ruft `validate_case` nie — ein Fall mit
  Fehler-Befund startet einen bezahlten Lauf und stirbt im Container.
- **A4 KOSMETIK** `GET /runs/{id}/geometry` (`router.py:252`) globbt alle triSurface-STLs —
  Vorfüllungs-Prismen erscheinen in der 3D-Ansicht als Gebäude. Fix: `vorfuellung_*` filtern.

Dazu Betrieb: Live-Backend auf 8001 ist VOR dem PM2-Restart alt (Schema ohne
Vorfüllung/Kennwert-Targets) → `sudo pm2 restart quagg-api`.

---

## B. Backend-Ergebnispipeline

### B1. Keine Schichten (das Struktur-Thema)
- `<run>/case/` (alle Zeitverzeichnisse, zweistellig GB) bleibt ewig liegen, obwohl nach
  `render_run` nur noch `log.*` und STLs daraus gelesen werden. Keine Retention, kein
  Prune, kein „Rohdaten wegwerfen" — nur DELETE alles-oder-nichts (`router.py:149`).
- Ableitungen sind NICHT reproduzierbar: kein Weg, `fields/` oder `normalized.parquet`
  für einen existierenden Lauf neu abzuleiten (nur in `run_pipeline` verdrahtet).
- Companion-Läufe importieren `case/` gar nicht → dort sind `fields/*.npz` PRIMÄRDATEN,
  nicht Ableitung — die Schichtverletzung, die das Pre gerade losgeworden ist. Folge
  auch: lokale Läufe haben NIE ein Log (`router.py:1298` sucht in case/).
- `fields/index.json` entsteht erst ganz am Ende (`foamfields.py:294`): Abbruch mittendrin
  → npz-Dateien ohne Index, /timesteps 404, niemand räumt auf.
- `0/C` (Zellzentren, hunderte MB ASCII) wird nie gelöscht.

### B2. Drei Nachlaufketten (Duplikat-Thema)
Dieselbe Kette existiert dreimal in verschiedenen Vollständigkeitsgraden:
- `run_pipeline` (voll, Feldkonvertierung geschützt),
- `local_runner.main` (voll, aber UNGESCHÜTZT: jede Ausnahme ab `convert_case_fields`
  → kein artifacts.zip → bezahlte lokale Rechenzeit komplett verloren, `local_runner.py:330ff`),
- `cli.cmd_all` (UNVOLLSTÄNDIG: ohne Felder/bed_shear/energy_head/overfall_cd —
  wer damit „wiederherstellt", verliert still drei Reihenfamilien, `cli.py:68`).
Dazu drei Manifest-Schreiber (`store.write_manifest` tot, `runner._write_manifest`,
`router.py:1162` direkt), zwei Manifest-Dialekte (Companion-Manifest überschreibt
`created`, hat kein `duration_s`/`cores`/`case_hash`), zwei Kern-Env-Variablen
(`FLOOD3D_CORES` vs `QUAGG_FOAM_CORES`), Server vernetzt seriell/lokal parallel
(gleicher case_hash, potenziell anderes Netz).

### B3. Parser bricht still statt laut
- `_FLOAT` (`datfile.py:8`) matcht `nan/inf` nicht → divergierter Lauf verschiebt Spalten
  STUMM, `r[-1]`-Leser (wall_shear, gauge) lesen dann die ZEIT als Wert → plausibel
  aussehende falsche Kurven statt Fehler.
- `parse_*_table` lesen ohne `errors="replace"` (einzige Stellen im Modul) → ein kaputtes
  Byte beendet die Extraktion nach Stunden Rechenzeit mit UnicodeDecodeError.
- Kein try/except je Quelle in `extract_case` (`case_reader.py:27`) — eine Datei reißt alles.
- `missing` unterscheidet nicht „nie konfiguriert" von „vorhanden aber leer"; steht nur
  im Manifest, nicht in result.json.
- Sohlschubspannung hat ZWEI Einheitenlogiken: `readers.py:141` multipliziert immer
  ×1000, `foamfields.py:266` nur bei kinematischer Dimension — gleiche quantity,
  potenziell Faktor 1000 auseinander.
- `merge_log_restarts` sortiert lexikografisch → ab dem 10. Neustart falsche Reihenfolge.
- `_KOMPONENTEN = 9`, geschrieben werden 10 (T kam dazu) → 4-GB-Budget systematisch
  ~11 % überschritten; bed_shear/energy_head dekomprimieren alle npz je noch einmal.

### B4. result.json trägt Nachweis-Gepäck und hat Löcher
- **BUG:** C2-Targets schreiben `utilization`, alle anderen `utilisation` — TargetsPanel
  liest nur Letzteres → massenbilanz/kurzschluss/verweilzeit_min zeigen dauerhaft „–"
  (`evaluate.py:139,150,159`). Zudem rechnen die drei `kennwerte()` je KOMPLETT neu
  (bis zu 4× dieselbe Auswertung).
- `status` in result.json ist hartkodiert „completed" (`runner.py:362`), auch bei
  fehlgeschlagener Feldkonvertierung. `/runs/{id}` löst nur über result auf →
  laufender Lauf = „unbekannt" → **der Live-Log-Poller im RunLogPanel startet nie**.
- Nachweis-Gepäck: `nachweis{regelwerk,bearbeiter,lastfall}`, `erfuellt/nicht_erfuellt`
  + `utilisation` als Hauptspalte, `n_erfuellt/n_nicht_erfuellt` in /runs, rote
  Grenzwert-Linien in den Diagrammen (`render.py:47`).
- Fehlt für reines Simulations-Reporting: missing_sources, Laufzeit/Kerne/Image,
  Schätzung↔Ist, Zeitreihen-Inventar, erreichte Endzeit vs. end_time, Feld-Metadaten
  (Vergröberungsfaktor der Viz!), fields_error.
- `figures[].path` ist ein absoluter Serverpfad (bei Companion: der der fremden Maschine).

### B5. Endpunkte: Duplikate und Blocker
- Tot: `GET /health`, `GET /runs/{id}/inventory` (+ api.js-Export), `POST /runs/{id}/import`
  (Nicht-Chunk).
- Duplikate: `/balance` = 6 fest verdrahtete `/series`; `/extremes` = Projektion von
  `/result` (Client cached beides separat); zwei status-Wahrheiten; `RunPaths.case_dir`
  hat null Aufrufer.
- **Blocker:** `/volume` dekomprimiert 60-MB-npz SYNCHRON im Event-Loop (`router.py:370`,
  kein to_thread) — Zeitachsen-Scrubbing blockiert den ganzen Server.
- `/geometry` verlangt Gelände → Fall ohne Terrain hat nie eine 3D-Szene.
- Abgebrochener Chunk-Upload lässt `_upload.zip` liegen.
- Pfadsicherheit dagegen durchweg gut (Zip-Slip, resolve-Checks, getestet).

---

## C. Client-Post-UI

### C1. Doppelimplementierung (das Kern-Thema)
`result.json["kennwerte"]` — seit heute die prüfbare Server-Quelle — wird **von keinem
einzigen Panel gelesen** (grep: null Treffer). Stattdessen rechnen BilanzPanel/
VerweilzeitPanel/BauwerkePanel Formel für Formel selbst, ~250 Zeilen, und zwei davon
liefern ANDERE Zahlen als der Server:
- Beharrung: Client sucht vorwärts, Server rückwärts → verschiedene „Beharrung ab".
- Zufluss: Client bevorzugt gemessene Randflüsse, Server nimmt die Vorgabe →
  verschiedene Zuflüsse für denselben Lauf; dazu rundet nur der Server.

### C2. Nachweis-Gepäck (nach Kurskorrektur zu entfernen/entkernen)
- TargetsPanel = komplette Ampeltabelle („Bewertung", ✓/✗, Ausnutzungsbalken) und ist
  der **Start-Tab** — der Nutzer landet zuerst auf dem Urteil.
- `utils/kennwerte.js` (475 Z.): 26 Größen mit Bewertungsstufen + `einordnen()` —
  urteilt automatisch in KennwertHilfe, ExtremesTable, GrundrissPanel. (Die
  Erklärtexte was/einheit/faustformel/achtung sind dagegen echter Nutzen → behalten.)
- Ampeln + Handlungsempfehlungen in BilanzPanel („länger rechnen…"), VerweilzeitPanel
  („Abhilfe: Tauchwand…"), BauwerkePanel (Kolk-Text, Grenzwerte ohne Quelle);
  ✓n/✗n-Zähler doppelt (RunListPanel + CaseRunsPanel); RESULT_LABELS + res-*-Badges.
- QualityPanel-Urteile sind als RECHENQUALITÄT vertretbar, aber so zu benennen.

### C3. Struktur & Grundnutzen
- 11 flache Tabs — der Zustand, den das Pre-UI heute verlassen hat.
- Dieselbe Größe mehrfach (Volumen 2×, Kraft/Sohlschub 3×, Tracer 2×, Status 3×).
- Zeitschieber existiert 3× und synchronisiert nur beim Mount → Grundriss und Raum
  zeigen verschiedene Zeitpunkte.
- Raum3DPanel hat eigenen volumeCache statt useFieldCache → dasselbe 100-MB-Paket
  doppelt geladen und doppelt im RAM.
- Kein Weg, eine Zahl zitierfähig herauszuholen (kein Kopieren, keine
  Kennwert-Übersicht, kein Laufvergleich); nirgends steht, WAS gerechnet wurde
  (Q, end_time, Basiszelle, Turbulenzmodell).

### C4. Bugs & Fehlerbilder
- GrundrissPanel:554: Sohlschub-Zeile doppelt bei nassen Zellen (Zeile nach dem if/else).
- BilanzPanel:137/139: `spec.boundaries.find` ohne `?.` nach fangbarem null → TypeError.
- BauwerkePanel: 6 ungecachte Requests je watchEffect-Lauf, kein error/loading —
  „keine Daten" und „Backend down" sehen identisch aus; 7 Panels ganz ohne Ladezustand;
  leere Catches überall.
- Store: kein reset() beim Fallwechsel (Caches des Vorgängerfalls bleiben); extremesCache
  überflüssig (zweiter Request auf schon geladene Datei); watchEffect+await-Muster
  brüchig (RunLogPanel behilft sich mit `void store.selectedRunIds.length`).
- Drei Bedeutungen für ein Wort: utils/kennwerte.js (Urteile), simHints.kennwerte()
  (Prognosen), result.json["kennwerte"] (Server-Zahlen).

---

## D. Sanierungsplan (Vorschlag, Phasen R0–R4)

**R0 — Lauf-Fixes (klein, vor dem ersten echten Lauf):** A1 `-noFunctionObjects`,
A2 wall_shear-Reihenfolge, A3 Validierungs-Tor in POST /runs, A4 STL-Filter,
B4-Bug `utilisation`/`utilization`, B5-Blocker `/volume` in to_thread, status-Auflösung
in `/runs/{id}` (repariert Live-Log). → danach ECHTER LAUF als Feuertaufe.

**R1 — Ehrlicher Parser:** nan/inf matchen + Zeilen mit falscher Spaltenzahl verwerfen,
errors="replace", try/except je Quelle mit Quellenliste in result.json, missing
dreiteilen (nicht konfiguriert / leer / Lesefehler), EINE Sohlschub-Einheitenlogik,
Log-Sortierung numerisch.

**R2 — Eine Nachlaufkette + Schichten:** `nachlauf(spec, case_dir, run_root, run_id)`
als EINE Funktion (Fehlertoleranz + Manifest-Schreiben innen), von run_pipeline,
local_runner und CLI aufgerufen; `POST /runs/{id}/reprocess` (Ableitung wegwerfbar,
Analogie derived/); Retention für case/-Zeitordner + 0/C; Companion: case/ mitliefern
oder fields/ ehrlich als Primärdatum markieren; EIN Manifest-Vertrag (RunPaths).

**R3 — result.json als einzige Zahlenquelle:** Ampel-Vokabular raus aus dem Kern
(Kennwert ist die Aussage), nachweis{} + figures[].path streichen, Inventar +
Laufzeit-Ist + missing_sources + Feld-Metadaten hinein; /balance und /extremes
zu Projektionen einstampfen; tote Endpunkte löschen.

**R4 — Post-UI neu geordnet (11 Tabs → 5):**
1. **Lauf** = RunLog + Quality + Fallkopf („was wurde gerechnet, ist es verwertbar")
2. **Ansicht** = Grundriss + Raum als 2D/3D-Umschalter, EIN Zeitschieber, EIN Feldcache
3. **Zeitreihen** = TimeSeriesPanel (ohne Grenzwert-Linien)
4. **Kennwerte** (NEU) = liest result.kennwerte, ersetzt Bilanz/Verweilzeit/Bauwerke
   als reine Ansichts-Blöcke ohne eigene Mathematik
5. **Zahlen & Ausgabe** = Extremes + Figures + CSV/Kopieren (Zahl zitierfähig)
TargetsPanel fliegt als Start-Tab (Grenzwerte optional als Spalte in Kennwerte);
utils/kennwerte.js wird entkernt (Erklärtexte bleiben, Stufen/einordnen raus);
Start-Tab wird „Ansicht"; store.reset() beim Fallwechsel.
