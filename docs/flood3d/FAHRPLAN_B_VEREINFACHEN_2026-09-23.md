# Fahrplan Stufe B — Weniger Hülle (flood-3D)

Stand 2026-09-23, nach Stufe A (`PROTOKOLL_A.md`). Grundlage: Gesamtaudit Abschnitt 3
(V1–V11) und die Erkundungen vom 23.09. Nichts davon ist gebaut.

## 0 · Was dieser Sprint ist, und was nicht

Vereinfachen, messbar: Zeilen weg, Doppelungen weg, Kopien weg — ohne dass ein Ergebnis
sich ändert (Numerik-Stand bleibt `2026-09-A`, Goldens bleiben, Harness-Probe bleibt grün).
Jeder Schritt hat eine Zahl vorher/nachher (`PROTOKOLL_B.md`), jeder Schritt ist ein Commit,
und nach jedem Schritt laufen beide Suiten (Backend 907, Client 400) plus einmal die
Harness-Probe (7 min, `FLOOD3D_PROBE=1`).

**Bewusst nicht in diesem Sprint** (je ein eigener Sprint, weil sie Ergebnisse ändern):
- VTP statt Voxel-Resampling (Audit F4/V3) — größter Brocken, ändert jede Ansicht.
- Regel-Diät (V1, 31 Regeln → ≤ 15) — braucht Fabios Urteil je Regel.
- Cd-/Sohlschub-/Verweilzeit-Definitionen (F5; der Tracer-Rest von 8,8 % gehört dazu).
- Import-Heuristik, Gelände-Werkzeugkasten (V5, V6).

Ausgangszahlen (23.09., nach Stufe A): Backend `flood3D/` 23 003 Zeilen (ohne Tests),
Client `flood-3D/` 22 912 Zeilen (ohne Tests); `except Exception` im Router 25, in laufwerk 16;
drei Nachlaufketten; Physik dreifach (Backend, `widerstand.js`, `simHints.js`) mit drei
bekannten Drifts.

## 1 · Reihenfolge

```
B1 Leichen + Kopien ─► B2 eine Nachlaufkette ─► B3 Schätzung nur im Server ─► B4 schema_version
                                                                             ─► B5 Betriebsdeckel
                                                                             ─► B6 Fenster-Diät (Entscheidung Fabio)
```
B1–B3 nacheinander (B3 baut auf B2 auf), B4–B6 unabhängig. Aufwand ≈ 5 Arbeitstage.

## B1 · Leichen und Kopien (½ Tag)

Alles aus der Erkundung vom 23.09., nachweislich unbenutzt oder doppelt. Kein Verhalten
ändert sich; der Beweis sind die grünen Suiten.

| Was | Wo | Maßnahme |
|---|---|---|
| `_load_base`, `_load_xyz` (0 Aufrufer; `_load_xyz` byteidentisch mit `_load_esri_ascii`) | `core/terrain.py:499-508` | löschen; `_load_esri_ascii` bleibt nur für `test_geometrie_import.py:504` — Test auf `lade_basis` umstellen, dann auch weg |
| `_rechteck` (0 Aufrufer) | `core/rezepte.py:199` | löschen |
| drei byteidentische Gitterhelfer | `sculpt._gitter`, `belag.gitter_masse`, `TerrainField.from_spec:549-552` | **eine** Funktion `terrain.gitter(spec_terrain, domain)` |
| `_naechste_flaeche` ×2, `_plan_punkte` ×2, `_PLANE`/`_FEST` ×2 | `anschluss.py:33/29`, `rotate.py:108/76`, `validate.py:2400`, `rezepte.py:112` | je eine Fassung in `conventions.py` bzw. `anschluss.py` |
| ESRI-ASCII-Schreiber ×3 | `importer._asc_schreiben`, `importer._raster_transformieren:748`, `belag.karte_schreiben:185` | **eine** `terrain.asc_schreiben()` |
| `validate._xr/_yr` (je 1 Aufrufer) | `validate.py:2501-2505` | inline |
| `launchPasswortBekannt` (0 Aufrufer), `importMeshUrl` (bewusst tot seit 16.08.) | `services/api.js:26,172` | löschen |
| `const BASE` ×2, Fehler-`detail`-Block ×5 | `services/api.js`, `services/volume.js` | `volume.js` nutzt `api.js`-Helfer; ein `fehlerAus(res)` |
| `laden()` ×3 (88/83/73 Z., gleiche Form) | `BilanzPanel`, `VerweilzeitPanel`, `BauwerkePanel` | ein Composable `useLaufReihen(runId, gruppen)` |
| `unterbrocheneLaeufe` / `abgeschlosseneCompanionLaeufe` (byteidentisch bis auf einen Vergleich) | `services/localCompanion.js:41/71` | eine Funktion mit Status-Argument |
| `Nacktes_Becken.dxf` (610 KB), Spezifikation (43 KB) in `src/` | `client/src/features/flood-3D/` | DXF nach `client/public/beispiele/`, Spezifikation nach `docs/flood3d/SPEZIFIKATION.md` (Verweise nachziehen) |
| `feldTypen.NICHT_NEGATIV` enthält `falloff` (Enum, keine Zahl); `enumLabel('modus','auto')` liefert das `wirkung`-Label | `utils/feldTypen.js:541, :63` | korrigieren, Test |

**Messung:** Zeilen Backend/Client vorher → nachher; Zahl der Doppelfassungen 8 → 0
(Liste oben); `git grep -c` je gelöschtem Namen = 0.

## B2 · Eine Nachlaufkette (1 Tag)

**Ist.** `local_runner.main` (381 Z.) ist die Wahrheit (writeCellCentres → convert → extract →
bed_shear/energy/cd → normalize → viz-Selbsttest → evaluate → befunde → render → Manifest);
`cli.cmd_all` (`cli.py:68-87`) ist eine abgedriftete Kopie ohne convert/bed/energy/cd — ein
CLI-Lauf hat keine Sohlschub-, Energie- und Cd-Reihen und meldet still „nicht_auswertbar";
`runner.py` hält Reste (`_kanten_ziehen`, `_snappy`, `extract_mesh_surface`) doppelt zu
`local_runner`.

**Änderung.** `core/nachlauf.py::nachlauf(case_dir, spec, run_id, *, felder=True) -> dict`
— die Kette **einmal**, aus `local_runner.main` herausgeschnitten, ohne Docker, ohne
NDJSON (Fortschritt über einen Callback). `local_runner.main` ruft sie; `cli.cmd_all`
ruft sie (und bekommt damit alle Reihen); `runner.py` behält nur Netzvorschau
(`mesh_preview`) und die Docker-Hülle. Die Vernetzungskette (`_kanten_ziehen`, `_snappy`,
`topoSet`/`createPatch`, `_pruefe_patches`, `checkMesh`) ebenfalls **einmal** als
`core/vernetzung.py::vernetzen(case_dir, ranks, run_foam)` mit dem Foam-Aufruf als
Parameter (Docker im Server, direkt im Container).

**Tests.** `test_cli_all_durchlauf` (`test_stage1_pipeline.py`) erwartet danach
`bed_shear`/`energy_head`-Reihen im synthetischen Fall; `test_runpod_relay.py:514`
(AST-Wächter des Runner-Vokabulars) bleibt grün; `test_bundle_vertrag.py` (kein
fastapi/boto3 im Bundle) bleibt grün — `nachlauf.py` und `vernetzung.py` liegen in `core/`.

**Messung.** Nachlaufketten 3 → 1, Vernetzungsketten 2 → 1; `local_runner.py` 1 094 → < 700 Z.;
`runner.py` 388 → < 200 Z.; Harness-Probe (Fall K) liefert dieselben Zahlen wie a5b_k
(Bilanz 0,79 %, Q 0,280, WSP 100,233 ± 0,001).

## B3 · Schätzung nur im Server (1 Tag)

**Ist.** Kirschmer, Ergun, Bewuchs, Zellzahl, Durchsatz, Δt, Dauer, Kosten, Wassertiefe
stehen im Backend **und** in `widerstand.js` (312 Z.) / `simHints.js` (419 Z.), mit drei
Drifts: Kerne 8 vs 16, Δt-Formel (min(Co, αCo) vs αCo), Dauer-Klemme.

**Änderung.** `POST /cases/{id}/schaetzung` (Entwurf rein, Zahlen raus, wie `/preview`):
`{zellen, feinste_zelle, dt, schritte, dauer_h, kosten_eur, wassertiefe, zulauf: [...],
widerstand: [{id, d, f, zeta, zonen_zellen}]}` — alles aus den vorhandenen Backend-Funktionen
(`meshgen.zellen_schaetzung`, `runner.estimate_run`, `casebuilder._screen_resistance`,
`casebuilder.zulauf_lage`). `simHints.kennwerte()` wird zu einer Anzeige des Antwortobjekts;
`widerstand.beiwerte/verlustbeiwert` entfallen (der Editor zeigt die Serverzahlen, der
Marker nutzt `zonenKasten` — der bleibt, ist Geometrie). Ein Aufruf je Entwurfsänderung,
gemeinsam mit dem 350-ms-Debounce der Vorschau (`usePreStore.scheduleDraftPreview`).

**Tests.** Backend: `test_schaetzung_endpunkt.py` (Fall K: Zellen = `zellen_schaetzung`,
Zulauf = `zulauf_lage`). Client: `simHintsNetz.test.js` pinnt dann die Anzeige gegen das
Fixture `netz_schaetzung.json` (existiert), `widerstand.test.js` (23 Tests) entfällt mit dem
Modul — die Formeln sind im Backend getestet (`test_widerstandszone.py`, 26 Tests).

**Messung.** Drifts 3 → 0; Formeln, die auf beiden Seiten stehen (Tabelle im Audit, 20 Zeilen)
→ 0; `simHints.js` 419 → ≈ 150, `widerstand.js` 312 → 0.

## B4 · `schema_version` + Migrationsliste (½ Tag)

**Ist.** `casespec.migriere` (`:1378-1440`) hat sieben Migrationen ohne Versionsstempel und ohne
eigene Testdatei; `extra="forbid"` bricht alte Fälle bei jeder Feldentfernung (zwei Vorfälle).

**Änderung.** `meta.schema_version: int = 8` (heute); `migriere` wird eine Liste
`[(von, nach, funktion)]`, läuft nur von der gespeicherten Version aufwärts und schreibt die
neue Version zurück; `from_yaml` meldet, was migriert wurde (Manifest/Meldungsleiste).
`extra="forbid"` bleibt (Tippfehlerschutz). `tests/test_migrationen.py`: je Migration ein
altes YAML-Fragment → erwartetes Modell; die 12 gespeicherten Fälle laden ohne Änderung
(`data/cases/*/case.yaml`, nur lesend).

**Messung.** Migrationen mit Test 0 → 7; jede `case.yaml` trägt danach `schema_version`.

## B5 · Betriebsdeckel (1 Tag, Audit F12)

Kein Umbau, vier kleine Sicherungen — jede mit Test:

| Was | Wo | Test |
|---|---|---|
| `max_laufzeit_s` Pflicht beim Cloud-Start: Vorgabe = 3 × Laufzeitschätzung, Deckel 8 h; Client sendet ihn | `router.start_run:2107`, `SimulationPanel` | Start ohne Angabe → Manifest trägt den Wert |
| ein Semaphor für `POST /runs` (Cloud) und `mesh-preview` (Server): mehr als N gleichzeitig → 429 mit Text | `laufwerk.py` | zwei Starts → zweiter 429 |
| Plattenwächter vor Lauf, Netzvorschau, Bundle, Import-Chunk: < 3 GB frei → 507 mit Zahl | `laufwerk.py`, `router.py` | monkeypatch `disk_usage` |
| **ein** Pfadhelfer `_lauf_pfad(run_id)`/`_fall_pfad(case_id)` mit `resolve()` + `parent`-Prüfung für alle 60 Routen (heute zwei Stile; `_SAFE` lässt `..` durch) | `router.py:71-84, :864` | `GET /runs/..` → 422; bestehender `%2F`-Test bleibt |

**Messung.** Routen mit `resolve()`-Prüfung 6 → 60; Cloud-Läufe ohne Zeitdeckel: unmöglich.

## B6 · Fenster-Diät (½ Tag) — **Entscheidung Fabio**

Seit A1 kommt Freispiegel-Wasser über die Sohle, egal wie das Fenster geformt ist; das
Fenster begrenzt nur noch Breite und Höhe. Kein gespeicherter Fall nutzt `polygon`
(Trapez ×4, Rechteck ×1, Kreis ×1). Vorschlag: `polygon` samt Ei/Maul/Tropfen-Vorlagen und
`_poly_intervals` streichen; `rechteck`, `trapez`, `kreis`, `follow` bleiben. Weg: ≈ 150 Z.
Backend (`casebuilder._window_delete_actions`, `validate._fenster_pruefen` Polygon-Zweig),
≈ 200 Z. Client (`PropertyPanel` Presets, `marker.js` Polygon, `profilePolygon`), 6 Tests.
Fabio hat die Formen im Juli gewünscht („geht mehr als eine Wandfläche?") — deshalb nur
mit seinem Ja. Alternative: behalten, nichts tun.

## 2 · Abnahme des Sprints

1. Backend- und Client-Suite grün; Harness-Probe grün mit denselben Zahlen wie a5b_k.
2. `PROTOKOLL_B.md`: je Schritt Zeilen/Kopien vorher → nachher, Commit.
3. Goldens unverändert (die Hülle rechnet dasselbe); `NUMERIK_VERSION` unverändert.
4. Gesamt: Backend + Client ≥ 1 500 Zeilen weniger, Doppelfassungen 8 → 0, Drifts 3 → 0,
   Nachlaufketten 3 → 1.

## 3 · Danach (Sprint C, eigener Fahrplan)

VTP statt Voxel (F4): OpenFOAM `surfaces`-FO (isoSurface α = 0,5, cuttingPlane) und
`foamToVTK` im Runner, vtk.js liest VTP; `foamfields.py` (534), `fields.py` (177),
`volume.js`, F3DV und Marching Cubes im Client entfallen; Froude/WSP/Tiefe einmal
serverseitig. Erst danach die Kennwert-Definitionen (F5) und der Tracer-Rest.
