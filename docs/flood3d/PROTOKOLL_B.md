# Protokoll Stufe B — Weniger Hülle (flood-3D)

Zu `FAHRPLAN_B_VEREINFACHEN_2026-09-23.md`. Kein Schritt ist erledigt ohne Zahl vorher/nachher.
Leitplanke: Numerik-Stand `2026-09-A` und die 15 Goldens bleiben unverändert.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| B1 | Leichen und Kopien | ☑ | 2026-09-23 | (siehe unten) |
| B2 | Eine Nachlaufkette | ☑ Nachlauf; Vernetzung noch doppelt | 2026-09-23 | (siehe unten) |
| B3 | Schätzung (und Bilanz) nur im Server | ⏳ a ☑ (Laufschätzung); b Widerstand, c Bilanz offen | 2026-09-23 | (siehe unten) |
| B4 | `schema_version` | ☐ offen | | |
| B5 | Betriebsdeckel | ☐ offen | | |
| B6 | Fenster-Diät | ⏸ wartet auf Fabios Entscheidung | | |

## B1 · Leichen und Kopien

| Messgröße | vorher | nachher |
|---|---|---|
| Backend-Zeilen (`flood3D/` ohne Tests) | 23 003 | 22 975 (−28) |
| Client-Zeilen (`flood-3D/` ohne Tests) | 22 912 | 22 890 (−22) |
| Client-Quellbaum | 2,2 MB | 1,6 MB (DXF 610 KB + Spezifikation 43 KB raus) |
| Backend-/Client-Tests | 907 / 400 | 907 / 402 |

Erledigt:
- **Eine** `terrain.gitter_masse` statt drei byteidentischer Fassungen (`sculpt._gitter`,
  `belag.gitter_masse`, Block in `TerrainField.from_spec`).
- Tote Funktionen weg: `terrain._load_base`, `_load_xyz`, `_load_esri_ascii` (Test nutzt
  `lade_basis`), `rezepte._rechteck`, `validate._xr/_yr` (inline), `api.launchPasswortBekannt`,
  `api.importMeshUrl`.
- Randflächen-Helfer einmal in `conventions.py` (`FLAECHE_IN_EXTENT`, `naechste_flaeche`),
  statt `anschluss._PLANE`/`_naechste_flaeche` und `rotate._FEST`/`_naechste_flaeche`.
- `api.js`: eine `fehlerAus(res, praefix)` statt fünf Fehlerblöcken; `volume.js` nutzt
  `BASE` und `fehlerAus` aus `api.js`.
- `localCompanion.js`: eine `companionLaeufe(fertig)` statt zwei Kopien.
- **Zwei echte Fehler** in der Feldkunde: `strength` stand in `NICHT_NEGATIV` — Gelände
  **absenken** (raise_lower, negativ) war im Panel gesperrt; `falloff` (Auswahl) ebenfalls.
  `modus` von `EditGelaende` zeigte das Label von `wirkung` („Aushub, sobald eingegraben").
  Tests ergänzt.
- DXF (echte Projektzeichnung) nach `docs/flood3d/daten/` — **nicht** nach `client/public/`,
  wie im Fahrplan stand: das würde sie über die Website ausliefern. Spezifikation nach
  `docs/flood3d/SPEZIFIKATION.md`, Verweise nachgezogen.

Bewusst **nicht** zusammengelegt — die Erkundung hatte sie als Kopien geführt, sie sind keine:
- Drei ESRI-ASCII-Schreiber: Belagskarte (Ganzzahl-IDs, NODATA 0, andere Eckkonvention),
  Import-Transformation (schreibt ein vorhandenes Raster um), Höhenraster. Zusammenlegen
  hätte Dateien auf der Platte verändert.
- Zwei `_plan_punkte`: Bauwerk (validate) vs. ganzer Bauplan (rezepte) — nur gleicher Name;
  das Rezepte-Exemplar heißt jetzt `_bauplan_punkte`.
- Drei `laden()` (Bilanz/Verweilzeit/Bauwerke): gemeinsam ist nur die Schleife über die Läufe.
  **Dabei gefunden:** `BilanzPanel` rechnet die Wasserbilanz im Browser nach, obwohl
  `evaluate.kennwerte["bilanz"]` sie liefert — echte Physik-Doppelung → B3.

## B2 · Eine Nachlaufkette

`core/nachlauf.py::nachlauf(case, job, spec, run_id, manifest, foam=None, melde=…)` — die
Kette einmal; `local_runner.main` und `cli all` rufen sie, OpenFOAM kommt als Parameter.

| Messgröße | vorher | nachher |
|---|---|---|
| Nachlaufketten | 2 (+ Reste in runner.py) | 1 |
| `local_runner.py` | 1 094 Z. | 1 012 Z. |
| `cli all` | ohne Felder, Sohlschub, Energiehöhe, C_d | dieselbe Kette (Felder, wenn 0/C vorliegt) |
| Backend-Tests | 907 | 907 |
| Harness-Probe (Fall K, Container) | a5b_k: Q 0,2616 / WSP 100,2332 / Bilanz 0,79 % / Tracer 8,8 % | test_k: 0,2616 / 100,2332 / 0,79 % / 8,8 % — 4/4 grün |

Noch offen aus B2: die Vernetzungskette (`runner._snappy`/`mesh_preview` vs. `local_runner`)
steht weiter zweimal.

## B3a · Laufschätzung nur im Server

`runner.laufschaetzung(spec, zellen)` (feinste Zelle, Δt, Schritte, Dauer, Kernstunden,
Stunden auf 16 Kernen, Ausgaben) — `estimate_run` (Netzvorschau) rechnet damit; die Prüfung
hängt sie mit der Wassertiefe (Speicherkurve, `_pruefe_solver`) an `netz_schaetzung`, die
mit jeder Vorschau kommt. `simHints.kennwerte` zeigt nur noch an.

**Dabei gefunden und behoben:** Schätzung und Panel sahen nur ausdrücklich angelegte
Verfeinerungen; snappyHexMesh verfeinert ohne Angabe das Gelände auf Stufe 1 und Bauwerke
auf Stufe 2. `meshgen.flaechen_stufen(spec)` ist jetzt die eine Quelle für snappy_dict,
zellen_schaetzung und laufschaetzung (snappyHexMeshDict byte-gleich, Goldens unverändert).

| Messgröße | vorher | nachher | gemessen |
|---|---|---|---|
| Fall K Zellen | 10 607 | 22 607 | 21 000 (a5b_k) |
| Fall K feinste Zelle | 0,10 m | 0,05 m | 0,05 m (Sohle Stufe 1) |
| Fall K Kernstunden (15 s) | 0,088 | 0,377 | ≈ 0,33 (3 Kerne × 400 s) |
| Fall A Zellen | – | 46 286 | 29 006 (zu hoch = sichere Richtung) |
| Client-Drifts (Kerne 8/16, Courant, Wassertiefe P13, Standardstufen) | 4 | 0 | |
| `simHints.js` | 419 Z. | 368 Z. | |
| Tests Backend / Client | 907 / 402 | 909 / 399 (1 Test ins Backend verlegt, 2 neu) | |

Der Deckeltest `test_ueber_dem_deckel_ist_es_ein_fehler` nahm an, ohne Verfeinerung werde
nicht verfeinert — bei 0,07 m ergäben die Standardstufen wirklich 9,3 Mio Zellen (Fehler);
der Test setzt jetzt ausdrücklich Stufe 0 und keine Bauwerke.
