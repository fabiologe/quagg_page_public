# Fahrplan Stufe A — Physik glaubwürdig machen (flood-3D)

Stand 2026-09-23. Grundlage: `AUDIT_FLOOD3D_GESAMT_2026-09-22.md` (Funde F1–F12) und drei
Erkundungen vom 23.09. (Randbedingungen/Tests, Benchmark-Muster/Manifest, OpenFOAM-Image).
Protokoll der Umsetzung: `PROTOKOLL_A.md`. Nichts aus diesem Fahrplan ist gebaut; jeder
Schritt wird beim Bauen dort mit Datum, Commit und Zahlen abgehakt.

## 0 · Worum es geht, und worum nicht

Der Solver (interFoam, OpenFOAM v2406 im Image `fabiologe/quagg-foam-local`) wird nicht
angefasst. Wir bauen die Hülle: Randbedingungen, Anfangsfelder, Schemata, functionObjects,
Auswertung. Das Audit hat gezeigt, dass die Hülle mit unverändertem Solver falsche Physik
erzeugen kann — die 66 m/s am Ablauf (Fund G1, behoben in E7) kamen aus einer Zeile in
`0/p_rgh`. Stufe A repariert die vier Stellen der Hülle, die heute noch so sind, und stellt
sicher, dass eine solche Zeile künftig **an einem Lauf** auffällt, nicht erst bei einem Kunden.

**Entscheidungen von Fabio (23.09.), die diesen Fahrplan formen:**
1. Keine Benchmark-Suite. Keine Öffnung, kein GMS-Gerinne, keine Netzstudie/GCI, kein
   Harness-Port aus flood-2D. Ein billiger lokaler Probelauf (Fall K) prüft die Hülle; der
   bestehende Wehrfall wird einmal neu gerechnet, weil die neue Zulauf-Randbedingung ihn trifft.
2. Nichts auf RunPod. Alle Läufe im Server-Docker (Server ist frei).

**Was Stufe A bewusst nicht tut:** Fenster-Rückbau, VTP statt Voxel, Cd-/Sohlschub-
Neudefinition (Stufe B); Pipeline-Zusammenlegung, `schema_version`, Betriebsdeckel (Stufe C);
neue Rezepte, Bauwerke, Panels.

## 1 · Leitregeln für die Umsetzung

- **Eine Zahl vorher, eine Zahl nachher**, am selben Fall (Fall K). Ohne Zahl ist ein Schritt
  nicht erledigt.
- **Regel und Kur messen dieselbe Größe.** Dict-Änderungen werden am Lauf geprüft, nicht nur am
  Text — der `outsidePoint`-Vorfall (`core/casebuilder.py:464-470`) ist die Warnung: alle
  Wörterbuch-Tests waren grün, jeder Fall mit Vorfüllung starb in `setFields`.
- **Nie an echten Fällen.** Kopien unter `data/cases/probe_a_*`; Job-Ordner unter
  `backend/app/api/flood3D/data/probe_a/`, nie unter `/tmp` (Snap-Docker mountet /tmp leer).
- **Kein Image-Neubau nötig.** `bundle_bauen` ruft `build_case` auf dem Server
  (`core/bundle.py:108-119`); `0/*`, `system/*`, `constant/*` liegen fertig im `case.zip`; der
  Container ruft `casebuilder` nie. Der Nachlauf-Core reist mit (`bundle.py:38-58`,
  `engines/local/local_runner.py:357-382`, `execv`-Übergabe).
- Router-Änderungen wirken erst nach `pm2 restart quagg-api` (nur mit Fabios OK); Client-
  Änderungen erst nach `npm run build` (wörtlich, nie umkomponiert).
- **Commit je Schritt**, Nachricht mit Schrittkennung (`flood-3D A1: …`); Zeile im PROTOKOLL.
- **Messskripte liegen im Repo** (`backend/app/api/flood3D/probe/`), nicht im Scratchpad. Die
  E7-Skripte `e7_bauen.py`/`e7_auswerten.py` existieren heute nur noch in einem alten
  Scratchpad (`/tmp/claude-0/…/a6259390…/scratchpad/`) — sie sind die Vorlage und werden
  übernommen, bevor sie verloren gehen.
- Tests: `cd backend && venv/bin/python -m pytest app/api/flood3D/tests -q` (876 + 1 grün am
  22.09.); Client `cd client && npx vitest run src/features/flood-3D/test` (400).

## 2 · Rechenort und Leitplanken

Nur der Server, nur Docker, 0 €:

```
docker run --rm --cpus 3 --memory 1500m --shm-size=2g -e FLOOD3D_CORES=3 \
  -v <job>:/job fabiologe/quagg-foam-local:latest --job /job
```
(Rezept aus `backend/companion/quagg_local_companion.py:273-302`; Entrypoint ist
`local_runner.py`, erwartet `<job>/inputs/case.zip`, schreibt `<job>/results/artifacts.zip`
und NDJSON-Ereignisse auf stdout.)

| Grenze | Wert | Folge |
|---|---|---|
| Kerne | 4 (pm2 hat `CPUQuota=50%`, Docker läuft außerhalb) | `--cpus 3`, ein Kern bleibt der API; nie zwei Läufe parallel |
| RAM | 7 GB, ≈ 1 GB frei | `--memory 1500m`; Fälle ≤ 25 k Zellen brauchen < 0,5 GB |
| Platte | 38 GB, 88 % voll (23.09.) | vor jedem Lauf `df -h /` ≥ 3 GB frei; Job-Ordner nach der Auswertung löschen, nur Zahlen + Manifest bleiben |

Erwartete Dauern: Fall K (≈ 5–8 k Zellen, 8 s Simulation) 2–5 min je Lauf, ≈ 6 Läufe;
Fall A (24 k Zellen) 20–40 min, 2 Läufe; Wehr (20 896 Zellen, 18 s) 60–80 min, 1 Lauf.
Zusammen ≈ 4 h Rechenzeit, nacheinander.

## 3 · Reihenfolge

```
A0 Messlatte ──► A1 Zufluss ──► A2 Turbulenz-Init ──┐
             ├─► A3 Tracer an die Wasserphase        ├─► A6 Abschluss: Harness-Probe als Dauertest,
             ├─► A4 σ = 0                            │       Wehr-Nachlauf, Numerik-Version,
             └─► A5 Atmosphäre-Regel, y⁺ je Patch ───┘       Goldens, Doku
```
A1–A5 sind voneinander unabhängig, aber alle vor A6 (A6 friert den neuen Stand ein).
Aufwand ≈ 5 Arbeitstage plus ≈ 4 h Rechenzeit.

---

## A0 · Messlatte (½ Tag)

**Ziel.** Zwei Probefälle und ein Messskript, mit denen jeder Schritt dieselben Zahlen liefert.

**Fall K** (neu, synthetisch, `probe/fall_k.py`, Muster `tests/synthetic_case.py::build_spec_tal`):
Gerinne 20 × 4 m, Sohle 1 % Gefälle (Op `ramp`), Q = 0,3 m³/s konstant, `base_cell` 0,25 →
≈ 5–8 k Zellen, `end_time` 8 s, `write_interval_series` 0,05, Pegel und Querschnitt bei x = 10,
`verweilzeit: true`, Zulauf `x_min` **ohne Fenster**, Ablauf `x_max` frei, Atmosphäre.
**Kein `initial_level`** — der trockene Start ist der harte Fall für A1.

**Fall A** = Kopie von `Rentrich_BetaTest08` (`data/cases/probe_a_betatest08`): Trapez-Fenster
am Zulauf `y_min`, **kein** `initial_level`, 24 k Zellen — der echte Fall mit trockenem
Fensterzulauf. (Hinweis aus der Erkundung: 6 von 12 gespeicherten Fällen haben Fenster —
Trapez ×4, Rechteck ×1, Kreis ×1 — und 11 von 12 einen `initial_level`.)

**Skript `probe/probe_lauf.py`** (aus `e7_bauen.py` + `e7_auswerten.py`):
1. spec (aus `fall_k.py`, aus einem Fallordner, oder `--fall wehr` aus
   `tests/verifikation_wehr.py::referenz_spec`) → `validate_case` (Fehler = Abbruch) →
   `core.bundle.bundle_bauen(spec, fall_dir, run_id)` → `<job>/inputs/case.zip`.
2. Docker-Aufruf wie in Abschnitt 2, stdout nach `<job>/runner.ndjson`.
3. Auswertung aus `<job>/case/`:
   - `postProcessing/patchflow_<inlet>/…/surfaceFieldValue.dat`, `patchflow_<outlet>`: Q_zu(t), Q_ab(t)
   - `postProcessing/water_volume/…/volFieldValue.dat`: V(t) → **Massentreue** = |V(t_end) − ∫(Q_zu − Q_ab) dt| / ∫Q_zu dt
   - `postProcessing/gauge_<id>/…/position.dat`: WSP am Pegel bei t_end
   - `postProcessing/discharge_<id>/…`: Q am Querschnitt bei t_end (Projektion wie `extract/readers.read_discharge`)
   - `postProcessing/tracer_<outlet>/…`: T_ab(t) → **Tracer-Bilanz** = Σ α·T·V (aus Feldern, t_end) gegen ∫Q_zu dt − ∫Q_ab·T_ab dt
   - `postProcessing/y_plus/…/yPlus.dat`: y⁺ **je Patch** min/max (Spaltenlayout hier ablesen und im PROTOKOLL notieren — auf dem Server liegen keine postProcessing-Ordner alter Läufe mehr)
   - `log.interFoam`: Co_max, Zeitschritte, `ExecutionTime`/`ClockTime`
   - `0/C` + `<t>/U`, `<t>/alpha.water` (gz oder plain, Muster `e7_auswerten.py:69-95`): max |U| je Zeitpunkt in 0–2 s; **Wasser über Höhe** = Σ α·V der Zellen an der Zulauffläche (erste Zellschicht) oberhalb einer Kote z_ref
4. Ausgabe: eine Zeile JSON je Lauf (`<job>/probe.json`) und eine Markdown-Tabellenzeile für
   das PROTOKOLL.

**Vorher-Zahlen** (jeweils Fall K und Fall A, Stand vor A1):

| Messgröße | Erwartung alt |
|---|---|
| max \|U\| in 0–2 s | Vorhang fällt aus z_max: ≈ √(2g·(z_max − Sohle)) ≈ 6–8 m/s |
| Wasser über z_ref = Sohle + 2 Zellen an der Zulauffläche, t < 1 s | > 0 (Wasser tritt bis z_max ein) |
| Massentreue bei t_end | < 1 % (die alte BC ist massentreu, nur räumlich falsch) |
| Q am Querschnitt bei t_end | 0,3 ± ? |
| WSP am Pegel bei t_end | ? |
| Co_max | ? |
| y⁺ je Patch | terrain/inlet: sehr hoch erwartet (Luftphase) |
| Tracer-Bilanz | Verlust in die Luft: ? % |
| Laufzeit | ? |

**Abnahme A0.** Skript im Repo; Fall K und Fall A je einmal gelaufen; alle Zeilen der Tabelle
mit Zahlen im PROTOKOLL; yPlus-Spaltenlayout notiert. Commit `flood-3D A0: Messlatte`.

---

## A1 · F1 Zufluss: Freispiegel-Randbedingung statt Wasservorhang (2 Tage)

**Ist.** `core/casebuilder.py::initial_fields` (`:1252-1262`) schreibt für **jeden** Zulauf
`U flowRateInletVelocity` + `alpha.water fixedValue 1` — mit oder ohne Fenster. Ohne Fenster ist
der Patch die ganze Gebietsseite über dem Gelände (`fenster_flaeche`, `:715-747`): Wasser tritt
von der Sohle bis `z_max` ein und fällt als Vorhang. Die Prüfung meldet das nur als `hinweis`
(`core/validate.py:1336-1348`). Die OpenFOAM-Randbedingung für genau diesen Fall
(`variableHeightFlowRateInletVelocity`, Tutorial `interFoam/RAS/waterChannel`) kommt im
Bestand nicht vor. Auch `_new_case_template` (`router.py:951-965`) legt fensterlos an.

**Neue Regel: Zulauf-Art aus dem Fenster ableiten.**

| Art | Bedingung (`resolve_window(spec, b)`) | Randbedingung |
|---|---|---|
| **Rohr** | `shape == "kreis"` oder `follow` auf einen `culvert` | unverändert: `flowRateInletVelocity` + `alpha fixedValue 1` (Vollquerschnitt, dort richtig) |
| **Freispiegel** | kein Fenster, `rechteck`, `trapez`, `polygon`, `follow` auf `channel_carve` | neu, siehe unten |

```
U:            type variableHeightFlowRateInletVelocity; flowRate <q | table>; alpha alpha.water; value uniform (0 0 0);
alpha.water:  type variableHeightFlowRate; lowerBound 0; upperBound 0.9; value uniform 0;
p_rgh:        type fixedFluxPressure; (bleibt)
```
Schlüssel am Image bestätigt (`libfiniteVolume.so`: `flowRate`, `alpha`, `lowerBound`,
`upperBound`). Hydrograph → `flowRate table (…)` über `foam.table` wie heute. Das Fenster
bleibt als Patch-Beschnitt (topoSet/createPatch) bestehen; Rückbau ist Stufe C.

**Nasser Start (Pflicht).** Die BC teilt Q durch die nasse Patchfläche (`Σ α·A`); ein trockener
Rand ist eine Division durch null. `set_fields_dict` (`:452-536`) bekommt je Freispiegel-
Zulauf einen `boxToCell`-Streifen, **wenn** dort bei t = 0 kein Wasser steht (kein
`initial_level` über der Sohle an der Fläche; keine Vorfüllung, die die Fläche berührt):
- Grundriss: 2 Zellen tief ins Gebiet, quer = Fenster-Spanne bzw. ganze Kante;
- Höhe: Sohle … `h_start`; `h_start` = `invert + depth` bei `follow: channel_carve`, Fenster-`zhi`
  bei Trapez/Rechteck/Polygon, sonst 2 Zellen über der Geländesohle an der Fläche
  (`terrain.sample` entlang der Kante, Maximum);
- Reihenfolge: `initial_level` → Vorfüllungen → Streifen (spätere überschreiben frühere);
- das frühe `return None` (`:461-462`) entfällt: `setFieldsDict` entsteht auch ohne
  `initial_level`, und `build_case` nimmt `setFields` in den `Allrun` auf.

**Fläche und Manifest.** `fenster_flaeche` liefert für Freispiegel-Zuläufe die **nasse** Fläche
`b · h_start` (das ist die Größe, die die Q/A-Regel meldet). `_pruefe_ganglinien`
(`validate.py:1690`) ruft sie künftig **mit** `ctx.terrain` wie `_pruefe_raender` — heute
rechnen die beiden Regeln mit verschiedenen Flächen. Manifest bekommt je Zulauf
`zulauf: {id, art, h_start, A_nass, U_mittel}` (geschrieben in `laufwerk.geometrie_sichern`).

**Texte in `validate._pruefe_raender`** (`:1326-1362`): aus „Zulauf „x" ist die ganze Seite …
Fenster setzen oder an ein Rohr koppeln" wird „Zulauf „x" über die Sohle der Seite x_min —
der Wasserstand folgt dem Gebiet; Start nass bis h_start = … m NHN; mittlere
Eintrittsgeschwindigkeit … m/s". Schwere bleibt `hinweis`; Warnung > 3 m/s bleibt; Kur
`anschluesse_herstellen` bleibt als Angebot.

**Tests, die den alten Text festschreiben (umstellen):**

| Test | Zeile | prüft heute |
|---|---|---|
| `test_stage3_preprocessing.py::test_randbedingungen_inhaltlich` | `:348-360` | `flowRateInletVelocity` in 0/U, `fixedValue` in 0/alpha.water |
| `test_raender_rollen.py::test_zwei_zulaeufe_sind_kein_fehler_und_der_fallbau_schreibt_beide` | `:42-43` | `count("flowRateInletVelocity") == 2` |
| `test_raender_rollen.py::test_zulauffläche_ohne_fenster_ist_die_seite_ueber_dem_gelaende` | `:59-70` | Text „ganze Seite", Schwere `hinweis` |
| `test_bc_window.py::test_zufluss_geschwindigkeit_wird_ausgewiesen` | `:80-85` | `hinweis` mit „Eintrittsgeschwindigkeit" |
| `test_audit_datenfluss.py::test_fenster_flaeche_ohne_fenster_ist_die_gebietsseite` | `:164-170` | Fläche = (y1−y0)·(z_max−z_min) ohne Gelände |

Achtung: `test_bc_window.py::_messages` (`:74`) filtert `hinweis` weg — neue Zulauf-Texte
bleiben `hinweis`, sonst brechen die Tests bei `:108, :147, :190, :274, :332`.

**Neue Tests `tests/test_zulauf_freispiegel.py`:** (1) 0/U + 0/alpha.water je Art — fensterlos,
Trapez, Kreis, culvert-follow; (2) Hydrograph → `flowRate table`; (3) Streifen liegt im Gebiet,
über der Sohle, und **fehlt**, wenn `initial_level` die Fläche schon nass macht; (4)
`fenster_flaeche` = b·h_start; (5) Manifest-Feld `zulauf`; (6) `setFieldsDict` + `setFields` im
Allrun auch ohne `initial_level`.

**Gegenlauf (Pflicht, `probe_lauf.py`):** Fall K und Fall A, alt gegen neu.

| Abnahme | Kriterium |
|---|---|
| Kein Vorhang | Wasser über `h_start + 1 Zelle` an der Zulauffläche bei t < 1 s = 0 |
| Massentreue | < 1 % bei t_end |
| Durchfluss | Q am Querschnitt = 0,3 ± 5 % nach der Einlaufzeit (Fall K) |
| Stabilität | Co_max ≤ 1,5 |
| Kosten | Laufzeit ≤ 1,5 × alt |

**Risiko.** Anlaufstoß, weil Q sofort durch den schmalen Startstreifen muss. Zeigt der
Gegenlauf Co-Spitzen > 1,5 oder Massenverlust: Rampe `flowRate table ((0 0) (2 Q) …)` im
Casebuilder — kein Spec-Feld, im Manifest ausgewiesen (`zulauf.rampe_s`).

Commit `flood-3D A1: Freispiegel-Zulauf (variableHeightFlowRate), nasser Start`.

---

## A2 · F7 Turbulenz-Anfangs- und Randwerte herleiten (½ Tag)

**Ist.** k = 1e-4, ω = 1 als Literale an Zulauf, Ablauf/Atmosphäre und im `internalField`
(`casebuilder.py:1260-1261, :1306-1311, :1350-1352`). Die ε-Ableitung
`eintrag.replace("omega", "epsilon")` (`:1359`) ist ein No-op — die Einträge enthalten das Wort
nicht — also ε = 1 überall und ν_t(0) = C_μ k²/ε ≈ 9·10⁻¹⁰: kEpsilon startet praktisch laminar.
Kein Test pinnt die Zahlen; `test_kepsilon_schreibt_das_epsilon_feld` (`:442-453`) erwartet nur
`epsilonWallFunction`, `div(phi,epsilon)` und `epsilon` in fvSolution.

**Änderung.** `casebuilder.turbulenz_randwerte(U, L) -> {"k", "omega", "epsilon"}`:
- I = 0,05; k = 1,5·(U·I)²; L = 0,07·D_h (Rohr: D_h = d; Freispiegel: D_h = 4A/P mit A = b·h_start,
  P = b + 2·h_start); ω = √k / (C_μ^¼ · L); ε = C_μ^¾ · k^1,5 / L; C_μ = 0,09.
- Zulauf: U = Q/A aus `fenster_flaeche` (nass). `internalField` = Werte des größten Zulaufs;
  ohne Zulauf (Leerlauf) U = max(√(2g·Δh) der höchsten Vorfüllung über der Sohle, 0,1 m/s).
- ε-Einträge werden explizit erzeugt, nicht per `replace`.
- Werte ins Manifest: `turbulenz_init: {U, L, k, omega, epsilon}`.

**Tests.** Rechenbeispiel Q = 1 m³/s, b = 2 m, h = 1 m: U = 0,5; k = 9,375·10⁻⁴; D_h = 2;
L = 0,14; ω = 0,40; ε = 3,4·10⁻⁵. kEpsilon: ν_t(0) = C_μ k²/ε ≈ 2,3·10⁻³ (nicht 9·10⁻¹⁰).
laminar: keine k/ω/ν_t-Dateien, keine yPlus-/wallShearStress-FOs (heute werden sie
unbedingt geschrieben, `:300-307`, `:188-200`, `:1345-1354`).

**Messung Fall K.** Q am Querschnitt und WSP am Pegel gegenüber A1 ± 2 % (die Initialisierung
darf das Ergebnis nicht tragen); ν_t am Zulauf bei t = 0 vorher/nachher.

Commit `flood-3D A2: Turbulenz-Init aus Q und Fläche, epsilon explizit`.

---

## A3 · F6 Tracer an die Wasserphase binden (½ Tag)

**Ist.** `scalarTransport T` (`casebuilder.py:249-259`) ohne `phase` → Transport mit dem
Gesamtfluss `phi`; der Markierungsstoff diffundiert in die Luft und verlässt das Gebiet über
die Atmosphäre. t10/t50/Kurzschluss hängen an dieser Kurve. Kein Test pinnt den FO-Text.

**Änderung.** `phase alpha.water;` im FO. Schlüssel im Image bestätigt
(`libsolverFunctionObjects.so`: `phase`, `phasePhiCompressed`, Vorgabe `alphaPhiUn`; interFoam
registriert `alphaPhi0`/`alphaPhiUn`, das Gruppensuffix `.water` entsteht zur Laufzeit). Der
zugehörige div-Schlüssel in fvSchemes ist aus den Binärstrings **nicht** sicher ableitbar →
am Lauf bestimmen: erster Probelauf ohne Zusatz; meldet interFoam
`keyword div(<name>,T) is undefined in dictionary fvSchemes`, den genannten Schlüssel mit
`Gauss limitedLinear 1` eintragen (`div(phi,T)` bleibt; unbenutzte Einträge sind harmlos).

**Test am Lauf (Fall K).** Tracer-Bilanz Σ α·T·V(t_end) gegen ∫Q_zu dt − ∫Q_ab·T_ab dt:
Abweichung < 3 % (vorher: den Verlust in die Luft messen, Zahl ins PROTOKOLL). Text-Test:
FO enthält `phase alpha.water`.

Commit `flood-3D A3: Tracer phasengebunden`.

---

## A4 · σ = 0 (¼ Tag)

**Ist.** `_TRANSPORT` `sigma 0.07;` (`casebuilder.py:1402`), nicht konfigurierbar. Bei
Zellen ≥ 0,1 m ist die Kapillarität physikalisch bedeutungslos (We ≫ 1); die CSF-Krümmung aus
solchen Zellen erzeugt nur parasitäre Strömungen an der Grenzfläche.

**Änderung.** `sigma 0;` mit Kommentar. `interfaceProperties` liest `sigma` über
`surfaceTensionModel` (`constant`/`temperatureDependent`, im Image geprüft) — „0 zulässig" am
Probelauf bestätigen (Log ohne FatalError, Grenzfläche bleibt scharf). Kein Test pinnt `sigma`;
`transportProperties` kommt in A6 in den Golden-Satz.

**Messung Fall K.** max |U| in Luftzellen nahe der Grenzfläche (α zwischen 0,01 und 0,5)
vorher/nachher; Co_max; Laufzeit.

Commit `flood-3D A4: sigma 0 für hydraulische Maßstäbe`.

---

## A5 · Atmosphäre-Regel und y⁺ je Patch (½ Tag)

**Atmosphäre.** Ohne `atmosphere`-Rand wird `z_max` still zur Wand (`meshgen.assign_faces`,
`:42-44`: unbelegte Flächen → `farfield`, `wall`) — ein dichter Deckel über einem Zweiphasenfall.
Keine Regel prüft es (`grep atmosphere core/validate.py` = 0). Alle 12 gespeicherten Fälle und
alle Test-Specs haben `atmo`; die Vorbelegung (`router.py:963`) setzt ihn. Die Regel ist also
Absicherung gegen einen Handgriff im Objektbaum, kein aktiver Fehler.
- `validate._pruefe_raender`: **fehler** „Kein Atmosphären-Rand — die Oberseite würde zur Wand,
  eingeschlossene Luft verfälscht den Wasserspiegel", mit Kur `atmosphaere_anlegen`
  (`BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere")`, `kur.py::_KUREN`).
- Regel und Kur messen dasselbe: `any(b.type == "atmosphere" for b in spec.boundaries)`.
- Test `tests/test_atmosphaere.py`: Fall ohne → `fehler`; nach Kur → kein Befund;
  `assign_faces` gibt `z_max` dann `("atmosphere", "patch")`.

**Grenzschichten — entfällt.** Erkundung 23.09.: `addLayers` steht nur mit
`mesh.boundary_layers.patches` (`meshgen.py:429-439`); kein gespeicherter Fall hat welche;
weder Vorlage noch Rezepte noch Client legen sie an; `_pruefe_rauheit` rechnet den Layer-Faktor
0,3/r^(n−1) bereits ein (`validate.py:1853-1901`). Der Audit-Punkt F3c ist damit schon Stand.

**y⁺ je Patch.** `runner._y_plus_range` (`:369-388`) liefert nur global min/max — daraus
werden Befunde wie „y⁺ bis 95 374", die niemand einordnen kann. Künftig je Patch (yPlus schreibt
je Patch `min/max/average`; Spaltenlayout der `.dat` in A0 abgelesen); der Befund in
`evaluate.befunde_ableiten` nennt den Patch mit dem Maximum und den Wert auf `terrain`
getrennt. Der Nass-Filter (nur Zellen mit α > 0,5) kommt in Stufe B, wenn Felder über VTP
vorliegen.

Commit `flood-3D A5: Atmosphäre-Regel mit Kur, y⁺ je Patch`.

---

## A6 · Abschluss: die Hülle dauerhaft prüfbar (1½ Tage + Rechenzeit)

**Harness-Probe als Dauertest.** `tests/test_harness_probe.py` = Fall K über `probe_lauf.py`,
`pytest.mark.skipif(not os.environ.get("FLOOD3D_PROBE"))` (Muster `test_verifikation.py:21-24`),
lokal Docker, Minuten. Vier Behauptungen:

| # | Behauptung | Schwelle |
|---|---|---|
| 1 | Massentreue bei t_end | < 1 % |
| 2 | Wasser über `h_start + 1 Zelle` an der Zulauffläche in t < 1 s | = 0 |
| 3 | Q am Querschnitt nach der Einlaufzeit | Q_soll ± 5 % |
| 4 | Tracer-Bilanz | Verlust < 3 % |

Betriebsregel (in `BETRIEB_FLOOD3D.md`): „Nach jeder Änderung an `casebuilder.py`,
`meshgen.py` oder den Schemata: `FLOOD3D_PROBE=1 venv/bin/python -m pytest
app/api/flood3D/tests/test_harness_probe.py`. Dauer 2–5 min, kostet nichts."

**Wehr-Nachlauf (einmal, auf dem Server).** `test_verifikation.py` fährt heute über den
RunPod-Relay (`verifikation_wehr.py:113-126`, `relay.lauf_starten`) — nicht benutzen.
Stattdessen `probe_lauf.py --fall wehr`: nimmt `verifikation_wehr.referenz_spec()`, rechnet im
Server-Docker (20 896 Zellen, 18 s Simulation; Referenz 2026-08-11: 82 min auf 4 Serverkernen),
liest Cd wie `verifikation_wehr.py:132-141` (Median des letzten Drittels der Reihe
`overfall_cd`) und schreibt `data/verifikation/wehr_ueberfall.json` im bestehenden Format
(`fall, run_id, titel, geprueft, dauer_s, zellen, cd_sim, cd_streuung, band, band_art,
bestanden, formel`) plus `ort: "server-docker"` und `numerik_version`. Damit hängt die
Verifikation nicht mehr an RunPod; `GET /verifikation` und die Karte in
`SimulationPanel.vue:298-324` zeigen sie unverändert.
Der Wehrfall ist fensterlos → A1 trifft ihn. Erwartung: Cd im Band 0,58–0,71 (eingefrorene
Referenz 0,644 ± 10 %). Liegt er daneben, wird die neue Zahl mit Begründung im PROTOKOLL die
Referenz (`CD_REFERENZ`, `verifikation_wehr.py:31-37`) — die alte Zahl entstand mit dem
Wasservorhang. Keine weiteren Referenzfälle (Entscheidung 23.09.).

**Numerik-Version im Manifest.** `casebuilder.NUMERIK_VERSION = "2026-09-A"` mit Kommentar,
welche Entscheidungen sie bündelt (Zulauf-BC, nasser Start, σ = 0, Turbulenz-Init, Tracer-
Phase, Ablauf-BC aus E7, Schemata/Löser). Geschrieben
- in `laufwerk.geometrie_sichern` (`laufwerk.py:38-57`, neben `case_hash`/`netz_hash`),
- in `bewahren` (`laufwerk.py:95-96`) — sonst überschreibt `_import_entpacken` das Feld beim
  Import der Artefakte,
- im Runner-Manifest (`local_runner.py:995`).
`GET /runs/{id}` (Muster `altlauf_hinweise`, `router.py:535-553`, `evaluate.py:512-530`):
Hinweis, wenn `numerik_version` fehlt oder älter ist als die im Wehr-Nachlauf verifizierte
(`wehr_ueberfall.json.numerik_version`). Kein Tor, keine Sperre — ein Satz. Die
Verifikationskarte zeigt die Version (Client-Build nötig).

**Goldens.** `GOLDEN` in `test_stage3_preprocessing.py:407-421` (heute 4 Dateien:
controlDict, blockMeshDict, snappyHexMeshDict, fvOptions) erweitern um `system/fvSchemes`,
`system/fvSolution`, `constant/transportProperties`, `constant/turbulenceProperties`, `0/U`,
`0/alpha.water`, `0/p_rgh`, `0/k`, `0/omega`, `0/nut`. Regenerieren bleibt manuell
(`cli build --spec … --out …` + `cp`, Anleitung im Docstring). `golden/snappyHexMeshDict`
bleibt (`addLayers true` dort kommt aus dem Synthetik-Spec, nicht aus Vorbelegungen).

**Doku.** `BETRIEB_FLOOD3D.md`: Probe-Regel, Numerik-Version, Wehr-Nachlauf lokal;
Spezifikation Kap. 13 im Umsetzungsvermerk: „ein Harness-Probelauf + Wehr-Nachlauf; keine
Benchmark-Suite — Entscheidung 2026-09-23"; `PROTOKOLL_A.md` vollständig; Memory-Notiz.

Commit `flood-3D A6: Harness-Probe, Wehr lokal, Numerik-Version, Goldens`.

---

## 4 · Abnahme der ganzen Stufe

Stufe A ist erledigt, wenn im PROTOKOLL für A0–A6 Datum, Commit und Zahlen stehen und:
1. Fall K neu: Vorhang = 0, Massentreue < 1 %, Q ± 5 %, Tracer-Verlust < 3 %, Co_max ≤ 1,5;
2. Fall A neu: Vorhang = 0, Massentreue < 1 %, Laufzeit ≤ 1,5 × alt;
3. Wehr-Nachlauf: Cd im Band oder neue Referenz mit Begründung;
4. `test_harness_probe.py` läuft lokal grün; Backend- und Client-Suite grün;
5. jeder neue Lauf trägt `numerik_version` im Manifest;
6. BETRIEB und Spez.-Vermerk nachgezogen.

Erst danach darf ein Produktivlauf in der Oberfläche „Nachweis" heißen — bis dahin sind
Läufe Machbarkeit.

## 5 · Ausblick (nicht Teil von A)

**Stufe B — Ergebnisse ehrlich machen:** OpenFOAM `surfaces`-FO / `foamToVTK` → VTP statt
Voxel-Resampling (F4); eine Definition für WSP, v, Fr, Energiehöhe; Cd und Sohlschub neu
definieren (F5); y⁺ nass. **Stufe C — Struktur:** eine Pipeline statt drei (F11),
`schema_version`, Betriebsdeckel (F12: `max_laufzeit_s`, Semaphor, Platte, Pfade), Fenster-
Rückbau, Client-Tests.
