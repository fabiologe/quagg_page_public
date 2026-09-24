# Protokoll Stufe B — Weniger Hülle (flood-3D)

Zu `FAHRPLAN_B_VEREINFACHEN_2026-09-23.md`. Kein Schritt ist erledigt ohne Zahl vorher/nachher.
Leitplanke: Numerik-Stand `2026-09-A` und die 15 Goldens bleiben unverändert.

## Stand

| Schritt | Titel | Status | Datum | Commit |
|---|---|---|---|---|
| B1 | Leichen und Kopien | ☑ | 2026-09-23 | (siehe unten) |
| B2 | Eine Nachlaufkette | ☑ Nachlauf; Vernetzung noch doppelt | 2026-09-23 | (siehe unten) |
| B3 | Schätzung (und Bilanz) nur im Server | ☑ a Laufschätzung, c Bilanz; b Widerstand bewusst nicht | 2026-09-23 | (siehe unten) |
| B4 | `schema_version` | ☑ | 2026-09-24 | (siehe unten) |
| B5 | Betriebsdeckel | ☑ (Semaphor nur für Netzvorschau) | 2026-09-24 | (siehe unten) |
| B6 | Fenster-Diät | ☑ (Fabio: ja, 24.09.) | 2026-09-24 | (siehe unten) |

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

## B3b · Widerstandsbeiwerte — bewusst NICHT verlegt

`PropertyPanel` zeigt d, f, ξ und Fugenweite live beim Tippen im Formular, bevor die Eingabe
übernommen ist; der Server sähe sie erst danach. Die Formeln stehen doppelt, sind aber auf
beiden Seiten an dieselben Zahlen festgenagelt (`widerstand.test.js` ↔ `test_widerstandszone.py`).
Verlegen hieße träge Anzeige bei kaum geringerem Drift-Risiko.

## B3c · Wasserbilanz nur im Server

`BilanzPanel` liest Zufluss, Speicheränderung, Ablauf, Anteil, Beharrung und Austausch aus
`result.kennwerte.bilanz` (dieselbe Definition wie das Kriterium „massenbilanz"); das
Diagramm zeigt weiter die Rohreihen.

**Dabei gefunden und behoben:** Die Server-Bilanz nahm bei KONSTANTEM Zufluss die Vorgabe,
nicht die Messung — beim A7-Defizit (2–3 % weniger Wasser) verbuchte sie Wasser, das nie im
Gebiet war; der Client nahm die Messung (letzter Wert). Jetzt: gemessen, wo vorhanden, sonst
Vorgabe; dazu `ablauf_gemessen` (Mittel über das End-Viertel). Die Aussage in PROTOKOLL_A
(„Bilanz und Kennwerte nehmen ohnehin den gemessenen Zufluss") stimmte bis dahin nur für
Ganglinien. Nebenfund beim Einbau: `i0` wurde in `kennwerte` doppelt vergeben (End-Viertel
und gleitende Steigung) — eigener Name `i_viertel`.

| Messgröße | vorher | nachher |
|---|---|---|
| Definitionen der Wasserbilanz | 2 (Server, Panel) | 1 |
| `BilanzPanel.vue` | 239 Z. | 184 Z. |
| Tests Backend / Client | 909 / 399 | 910 / 399 |

Alte Läufe tragen ihre Bilanz im result.json (beim Lauf berechnet) — ohne `ablauf_gemessen`
zeigt das Panel „Ablauf (aus der Bilanz)".

## B4 · `schema_version` + nummerierte Migrationen

`casespec.MIGRATIONEN = [(1, Text, Funktion), …, (7, …)]`, `SCHEMA_VERSION = 7`,
`meta.schema_version` (hash-neutral in `_hash_daten` — ein Stempel ist kein neuer Fallstand).
`migriere(daten, bericht)` läuft nur oberhalb der gespeicherten Version und meldet, was sie
geändert hat. Die sieben Migrationen bis Version 7 prüfen die alte Form weiter selbst
(idempotent), laufen also auch auf ungestempelten Fällen gefahrlos.

| Messgröße | vorher | nachher |
|---|---|---|
| Migrationen mit eigenem Test | 1 (bohr_ueberstand, in test_durchstoss) | 4 Formen + Stempel + Hash + alle 12 gespeicherten Fälle laden |
| Tests Backend | 910 | 918 |

Referenzen neu geschrieben, Unterschied nur der Stempel: `golden/import_schnitt.json` (+2 Z.),
Schema-Schnappschuss (+5 Z.). Die gespeicherten case.yaml bekommen den Stempel beim nächsten
Speichern (Laden schreibt nie zurück). Falle wieder getroffen: „…" mit geradem
Schlusszeichen in einem Python-String → SyntaxError, `“` verwenden.

## B5 · Betriebsdeckel

| Deckel | vorher | nachher | Test |
|---|---|---|---|
| Kennungen → Pfade | `_SAFE` ließ `..` durch (eine Ebene über data/runs, data/cases) | Kennung beginnt mit Buchstabe/Ziffer — ein Muster für alle 7 Stellen | `test_router.py::test_punkt_kennungen_sind_ungueltig` |
| Cloud-Zeitdeckel | ohne Angabe keiner (Client sendet nie `max_laufzeit_s`) | Server setzt 3 × Laufschätzung, 30 min … 8 h; Angabe gilt bis 24 h; steht im Manifest (auch nach Import) | `test_betriebsdeckel.py` |
| Platte | kein Wächter | < 2 GB frei → 507 mit Zahl vor Netzvorschau, Bundle, CAD-Import, Ergebnis-Import (`FLOOD3D_PLATTE_MIN_GB`) | `test_platte_pruefen_meldet_507` |
| Netzvorschauen zugleich | je Fall eine, fallübergreifend beliebig | höchstens 1 auf dem Server (`FLOOD3D_MAX_PREVIEWS`) → 429 | `test_zweite_netzvorschau_wartet` |

Bewusst nicht: Semaphor für Cloud-Läufe — der RunPod-Endpunkt rechnet mit „Max Workers 1"
ohnehin nacheinander. Tests Backend 918 → 923.

### B4 · Nachtrag nach der Harness-Probe (24.09.)

Die Probe (4/4 grün, Zahlen identisch: Q 0,2616, WSP 100,2332, Bilanz 0,79 %) zeigte:
ein im Code neu erzeugter Fall trug `schema_version: 0`. Standard ist jetzt die aktuelle
Version. Dabei brachen drei Tests, die einen „alten" Fall aus einem frischen Dump plus
Altfeld bauen — mit Stempel 7 übersprang `migriere` die Migration. Dasselbe kann im
Betrieb passieren (gestempelte Daten mit Altfeld aus Import oder Handarbeit). Deshalb:
die sieben idempotenten Migrationen laufen IMMER (`IDEMPOTENT_BIS = 7`); der Stempel sperrt
nur künftige, nicht-idempotente. Tests 924.

## B6 · Fenster-Diät

Fensterform `polygon` samt Editor-Vorlagen Ei/Maul/Tropfen gestrichen (Fabio 24.09.: ja).
Kein gespeicherter Fall nutzte sie; Migration 8 macht aus einem alten Polygonfenster das
umschließende Rechteck (idempotent, `IDEMPOTENT_BIS = 8`). Weg: `BcWindow.points`,
`casebuilder._poly_intervals` und die Polygon-Zweige in `resolve_window`, `fenster_flaeche`,
`_window_delete_actions`, `validate._fenster_pruefen`, `rotate`; Client: Auswahl + Vorlagen
+ `profilePolygon` (PropertyPanel), Marker, Eckgriffe (objektZugriff), Randbilanz,
Feldkunde. Bleiben: `rechteck`, `trapez`, `kreis`, `follow`. Die Pfeilerform `polygon` ist
etwas anderes und bleibt.

Tests: Backend 924 → 922 (3 Polygon-Tests weg, 1 Migrationstest dazu), Client 399 → 398.
Referenzen: Goldstand Version 7 → 8, Schema-Schnappschuss ohne `polygon`/`points`.
