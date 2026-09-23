# Protokoll Stufe B — Weniger Hülle (flood-3D)

Zu `FAHRPLAN_B_VEREINFACHEN_2026-09-23.md`. Kein Schritt ist erledigt ohne Zahl vorher/nachher.
Leitplanke: Numerik-Stand `2026-09-A` und die 15 Goldens bleiben unverändert.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| B1 | Leichen und Kopien | ☑ | 2026-09-23 | (siehe unten) |
| B2 | Eine Nachlaufkette | ☐ offen | | |
| B3 | Schätzung (und Bilanz) nur im Server | ☐ offen | | |
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
