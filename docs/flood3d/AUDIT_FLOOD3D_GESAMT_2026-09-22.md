# Audit flood-3D — Gesamtbild aus CFD- und Web-Sicht (2026-09-22)

Perspektive: Gutachter für 3D-Strömungssimulation (OpenFOAM/interFoam) und
Webentwicklung (Vue/FastAPI), der das Projekt zum ersten Mal sieht.
Grundlage: eigene Lesung von `casebuilder.py`, `meshgen.py`, `runner.py`,
`router.py`, `evaluate.py` und Ausschnitten aus `validate.py`; fünf
Erkundungen (Numerik, Pre-Pipeline, Post/API/Engines, Client, Doku);
beide Testsuiten (Backend 876 + 1 übersprungen in 77 s, Client 400 in
13 s — beide grün); Laufmanifeste dreier echter Fälle; eine Probe am
OpenFOAM-2406-Image; die Spezifikation und alle 13 Dokumente in `docs/`.
Nichts wurde geändert.

Alle Fundstellen als `datei:zeile`, Stand Commit `3f4d396`.

---

## 0 · Kurzurteil

1. **Reifegrad: ein weit gebautes Werkzeug mit dünner physikalischer
   Absicherung.** In der Breite (Editor, Import, Regeln, drei Rechenorte,
   12 Ergebnis-Tabs) ist das Projekt der Spezifikation davongelaufen; in
   der Tiefe (Verifikation, Netzstudie, Definition der Nachweisgrößen) ist
   es hinter ihr zurückgeblieben. Ich würde es als **Prototyp mit
   Produktionsanstrich** einordnen: ≈ 70 % Werkzeug, 20 % Nachweis,
   10 % Nachweis-Absicherung.
2. **Fachlich, Rang 1:** Der Freispiegel-Zufluss ist ohne Fenster ein
   Wasservorhang über die ganze Gebietsseite (`casebuilder.py:1255-1258`);
   die OpenFOAM-Randbedingung für genau diesen Fall
   (`variableHeightFlowRateInletVelocity`) wird nirgends benutzt. Statt
   ihrer wurden ≈ 600 Zeilen Fenster-Maschinerie gebaut.
3. **Fachlich, Rang 2:** Es gibt keine Verifikation im Sinn der eigenen
   Spezifikation (Kap. 13): ein einziger Wehrfall gegen eine
   *eingefrorene Eigenreferenz* (± 10 %) mit einem Literaturband
   (0,50–0,80), das keinen Fehler unter 30 % fangen kann, einmalig
   gerechnet, nicht in der Suite, keine Netzkonvergenz. flood-2D hat ein
   `benchmark/`, flood-3D nicht.
4. **Fachlich, Rang 3:** Was der Browser zeigt, ist nicht, was gerechnet
   wurde. Das Voxel-Resampling weicht in den echten Läufen um 34 %, 41 %
   und 100 % vom Solver-Volumen ab; y⁺ liegt bei 8 900 bis 95 000. Auf
   diesem Gitter und diesen Wandfunktionen stehen Sohlschub-, Energie-,
   Froude- und Laubkarten-Aussagen.
5. **Architektur:** Wächter und Heuristik (validate + kur + rezepte +
   anschluss + importer = **6 974 Zeilen**) sind 1,75-mal so groß wie
   Physik und Ergebnis (casebuilder + meshgen + evaluate + extract +
   foamfields = **3 983 Zeilen**). Um ein unverifiziertes Solver-Setup
   wurde ein sehr großer Schutzwall gebaut.
6. **Betrieb:** Cloud-Läufe gehen ohne Zeitdeckel hinaus (der Client
   sendet `max_laufzeit_s` nie), es gibt keinen Plattenwächter (Platte
   heute 88 % voll), die Kennungs-Prüfung lässt `..` eine Ebene weit
   durch, `POST /runs` hat keinen Semaphor.

Was der „Schüler" richtig gemacht hat, steht in Abschnitt 6 — es ist
nicht wenig.

---

## 1 · Wie weit ist das Projekt?

### Zahlen

| Größe | Wert |
|---|---|
| Backend `flood3D/` | ≈ 23 200 Zeilen Python (ohne Tests), 15 800 Zeilen Tests, 82 Testdateien |
| Client `flood-3D/` | ≈ 23 700 Zeilen .vue/.js (ohne Tests), 12 300 Zeilen Tests, 42 Testdateien |
| Datenmodell | 75 Pydantic-Klassen, 36 typisierte Objektarten, `extra="forbid"`, keine `schema_version` |
| API | 60 Routen in einer Datei (`router.py`, 2 350 Z.), 3 Startup-Hooks |
| Prüfung | 31 Regelfamilien (`validate.py`, 2 506 Z.), 17 Kuren, 6 Rezepte |
| Nachweise | 10 Target-Arten (`evaluate.py:49-178`) |
| Rechenorte | RunPod (produktiv), lokaler Companion (produktiv), Server nur Netzvorschau (Lauf = HTTP 410) |
| Verifikation | 1 Fall (Wehr), gerechnet 2026-08-11 und -13, seither nicht |
| Geschichte | 164 Commits seit 2026-07-30, ein Autor; drei frühere Audits, eine Kurskorrektur (05.08.) |

### Reife je Schicht

| Schicht | Stand | Reife |
|---|---|---|
| casespec (Vertrag) | vollständig, YAML, JSON-Schema-Export, Schnappschuss-Test; 7 Migrationen in `migriere` (`casespec.py:1378`) ohne Versionsstempel | funktional; brüchig bei jeder Feldänderung (2 dokumentierte Vorfälle „Extra inputs are not permitted") |
| Gelände / Körper / Import | 8 Terrain-Ops, Pinsel, Belag, Kanten, Drehung; DXF/STL/ASC/XYZ | funktional; Import-Heuristik erst am 22.09. vom Phantom-Gerinne befreit |
| Prüfung / Kuren / Rezepte | Regel=Kur-Prinzip seit E5 | mechanisch reif, fachlich teils Überbau (Abschnitt 3) |
| Fallbau (casebuilder/meshgen) | ESI v2406, alle Dicts, Fenster, Porosität, Rauheit, Vorfüllung, Tracer | funktional; Numerik fest verdrahtet, nur 4 von 13 Dicts golden |
| Ausführung | Relay, R2-Transit, Reattach, Checkpoints, NDJSON-Protokoll, Abbruch | produktiv seit 12./13.08.; drei Pipeline-Kopien |
| Ergebnis | Zeitreihen, Felder, Kennwerte, 6 Abbildungen | funktional; Ableitungen mehrdeutig definiert (F5) |
| Client | 4 Phasen, Editor aus 15 Modulen, 12 Tabs, drei Renderer (three.js, vtk.js, Canvas) | funktional; 0 Komponententests für die fünf großen SFCs |
| Verifikation | ein Wehrfall, außerhalb der Suite | **nicht vorhanden im Sinn der Spez.** |
| Doku | Spez. v0.1 + 13 Dokumente | umfangreich, drei belegte Drifts; keine README im Paket |

### Was heute wirklich gerechnet wird

Die echten Nutzerläufe sind klein und grob: `Rentrich_BetaTest08_r004`
23 703 Zellen, `_r007` 29 010 Zellen (ein DN800-Rohr bei 0,5-m-Basiszelle),
ein einziger Lauf mit 943 370 Zellen (`Rentrisch_BetaTest06_r004`).
Manifeste: y⁺ [1,2 … 53 360] bzw. [0,01 … 95 374]; Viz-Volumen-Abweichung
34 % bzw. 100 %; Courant-Spitze 1,54 trotz Begrenzung. Das sind keine
Nachweisläufe, das sind Machbarkeitsläufe.

Server: 4 Kerne, 7 GB RAM (1 GB frei), 38 GB Platte (88 % voll), pm2 mit
`CPUQuota=50%` und `MemoryMax=4G`. Dazu passt der Snappy-Deckel
`maxGlobalCells 8 000 000` (`meshgen.py:103`) nur für RunPod.

---

## 2 · Fachlich falsch oder gefährlich

Nach Schwere geordnet. Je Fund: Beleg → Folge → Kur.

### F1 · Freispiegel-Zufluss ist ein Wasservorhang (SCHWER)

**Beleg.** `casebuilder.py:1255-1258`: `U = flowRateInletVelocity`,
`alpha.water = fixedValue 1` auf dem *ganzen* Zulauf-Patch. Ohne Fenster
ist der Patch die ganze Gebietsseite über dem Gelände
(`fenster_flaeche`, `casebuilder.py:715-747`). Die Prüfung meldet das nur
als „hinweis" (`validate.py:1336-1348`: „Zulauf ist die ganze Seite …
Fenster setzen oder an ein Rohr koppeln"). `grep
variableHeightFlowRateInletVelocity core/ engines/` → 0 Treffer.

**Folge.** Wasser tritt von der Sohle bis `z_max` ein, fällt als Vorhang
und kollabiert; die Eintrittsgeschwindigkeit Q/A ist winzig und falsch;
die Anlaufphase ist unphysikalisch; Turbulenzfelder und Kräfte in Zulaufnähe
sind wertlos. Das OpenFOAM-Tutorial
`multiphase/interFoam/RAS/waterChannel` löst genau diesen Fall mit
`variableHeightFlowRateInletVelocity` (U, `flowRate Q`) +
`variableHeightFlowRate` (alpha, `lowerBound 0; upperBound 0.9`): der
Wasserstand am Zulauf folgt dem inneren Spiegel, Q wird nur durch die
Nasszellen gedrückt. Ein Fenster ist dafür nicht nötig — es wurde aber
gebaut: `resolve_window`, `_window_delete_actions`, `topo_set_dict`,
`create_patch_dict`, vier Formen, `follow` für Gerinne und Stutzen,
JS-Spiegel im Editor, 25 Tests.

**Kur.** Für `inflow_*` ohne Fenster die Standard-Paarung schreiben;
Fenster nur für Rohrmündungen (`kreis`, `follow: culvert`) behalten.
Gegenlauf an Fall A (BetaTest08): Q am ersten Querschnitt und WSP am
ersten Pegel, alte gegen neue Randbedingung, eine Zahl vorher/nachher.

### F2 · Verifikation existiert nicht im Sinn der Spezifikation (SCHWER)

**Beleg.** Spez. Kap. 13 verlangt drei dauerhafte Fälle (Wehrüberfall,
Ausfluss aus Öffnung, Normalabfluss nach Gauckler-Manning-Strickler),
„bei jeder Änderung an casebuilder oder meshgen erneut gerechnet". Ist:
`tests/verifikation_wehr.py` + `test_verifikation.py`, per `skipif`
außerhalb der Suite; Referenz = eingefrorener Eigenwert 0,644 ± 10 %,
Literaturband 0,50–0,80 (`verifikation_wehr.py:32`); Ergebnis
`data/verifikation/wehr_ueberfall.json`: C_d 0,633 ± 0,041 bei 20 896
Zellen, **einer** Auflösung. Seit dem 13.08. wurde der Fallbau mehrfach
geändert (E5, E7 Ablaufdruck, Zonentiefe), ohne dass der Fall neu lief.
Netzkonvergenz: in drei Dokumenten als „offen" geführt, nie gemessen. Die
einzige Konvergenzreihe im Bestand ist die Ergun-1D-Probe (63/83/92/97 %
bei 2/4/8/16 Zellen, `BETRIEB_FLOOD3D.md:326-348`). Messdaten oder ein
Referenz-CFD: keine. flood-2D hat `backend/app/api/flood2D/benchmark/`
mit Ritter-Dammbruch und Gitterkonvergenz — flood-3D nicht.

**Einordnung des Wehrfalls.** Für ein breitkroniges Wehr liegt der
theoretische Beiwert in der Poleni-Form bei μ ≈ 0,58 (mit Energiehöhe),
gemessen 0,53–0,60; bei h/L ≈ 0,4 (hier h ≈ 0,17 m auf L = 0,4 m) wird
das Wehr kurzkronig und 0,63 ist plausibel. Das weiß der Test nicht: ein
Band von 0,50 bis 0,80 kann keinen 30-%-Fehler fangen, und ± 10 % um den
Eigenwert ist Regression, keine Verifikation. Im selben Lauf steht y⁺ bis
8 935 und 41 % Viz-Volumen-Abweichung im Manifest — der „bestandene"
Fall trägt die Symptome von F3 und F4.

**Kur.** `benchmark/` wie in flood-2D: (1) Wehr mit Netzstudie auf drei
Auflösungen (Richardson-Extrapolation, GCI), (2) Ausfluss aus einer
Öffnung (Torricelli, C_d ≈ 0,61), (3) Normalabfluss im geneigten Gerinne
(Strickler k_st ↔ k_s), (4) Ritter-Dammbruch (analytisch, in 2D schon
vorhanden). Kleine Fälle laufen lokal im Docker in Minuten (5 760 Zellen
× 6 s ≈ 1–5 min), die Netzstudie auf RunPod für ≈ 0,5 €. Jeder
Produktivlauf trägt den Hash des Numerik-Profils (P1), unter dem die
Benchmarks bestanden wurden.

### F3 · Wandfunktionen außerhalb ihrer Gültigkeit — Sohlschub und y⁺ unbrauchbar (SCHWER für die Nachweise)

**Beleg.** Alle Wände bekommen `kqRWallFunction`/`omegaWallFunction`/
`nutkWallFunction` (`casebuilder.py:1317-1319`), das Gelände standardmäßig
`nutkRoughWallFunction Ks 0,03 m` (Material „erde", `casespec.py:459`,
`casebuilder.py:1203`). Bei 0,25–0,5-m-Zellen ist Ks/Δy = 0,06–0,12;
mit Grenzschichten (`relativeSizes true; finalLayerThickness 0.3;
nSurfaceLayers 3`, `meshgen.py:485-490`) schrumpft die Wandzelle auf
≈ 0,2 Δ und Ks/Δy steigt auf ≈ 0,6. Die raue Wandfunktion gilt für
Ks⁺ ≪ y⁺; die Prüfung warnt (`validate.py:1961-1964`, Schwellen 0,2/0,5),
baut aber trotzdem; der y⁺-Hinweis kommt nur, wenn ein
Sohlschub-Kriterium existiert (`validate.py:1980-1982`). Manifeste: y⁺ bis
53 360, 95 374, 8 935 — solche Werte kann niemand deuten (sie kommen aus
der Luftphase und aus dem alten Freistrahl-Sog G1).

**Folge.** `min_bed_shear`, `max_bed_shear`, Laubkarte B und die
Kolk-/Räumbarkeitsaussagen stehen auf τ aus einer extrapolierten
Wandfunktion. Dazu nimmt `bed_shear_series` τ > 1e-9 als Nässe-Ersatz
(`foamfields.py:399`) — `wallShearStress` ist auch unter Luft ungleich
null.

**Kur.** (a) y⁺ je Patch und nur in Nasszellen (α > 0,5) ausweisen, nicht
global; (b) Ks ≤ 0,5 · Δy als *Fehler*, sobald ein Sohlschub-Nachweis im
Fall steht; (c) Grenzschichten standardmäßig aus — bei Wandfunktionen
bringen sie nichts, kosten Zellen und kollabieren auf Gelände; (d) τ nur
aus Nasszellen, Nässe aus α, nicht aus τ.

### F4 · Browser-Ansicht ≠ Rechnung (SCHWER für die Auswertung)

**Beleg.** `fields.resample_points` (`fields.py:150-177`) bint die
Zellzentren des snappy-Netzes per `floor` in ein uniformes Gitter,
ungewichtet (feine Zellen zählen wie grobe), horizontal in
`base_cell`-Auflösung, nicht in der Feinstufe (`foamfields.py:226-232`).
Der eigene Selbsttest `viz_volume_check` meldet 41 % (Wehr), 34 %
(r004), 100 % (r007) Abweichung zum Solver-Volumen. Aus diesem Gitter
werden abgeleitet: Wasserspiegel und Tiefe (Client,
`useFieldCache.js:139-151`), Froude (nur Client, `:173`), Energiehöhe
(Server, `foamfields.py:519-522`: Oberkante der obersten Nasszelle →
Überschätzung bis sz/2), Sohlschub-Minimum, Laubkarten A/B/C. Es gibt
**zwei WSP-Definitionen** (Server ohne, Client mit Subzellen-Interpolation)
und **zwei Geschwindigkeits-Definitionen** (Server: ungewichtetes Mittel
von |U| in 3D inkl. Vertikalanteil, `foamfields.py:523`; Client: α·dz-
gewichtet, nur horizontal, `useFieldCache.js:128-134`).

**Folge.** Ein Bearbeiter liest im Grundriss eine Froude-Zahl, die der
Server nie berechnet hat, und im Nachweisblatt eine Energiehöhe, die mit
einer anderen Geschwindigkeit gebildet wurde. Die Spez. (Kap. 3) verlangt
„keine Abweichung zwischen dem, was der Nutzer sieht, und dem, was
gerechnet wird" — für die Geometrie eingehalten, für die Ergebnisse nicht.

**Kur.** OpenFOAM kann das selbst und besser: functionObject `surfaces`
mit `isoSurfaceCell alpha.water 0.5` (Wasserspiegel als Fläche) und
`cuttingPlane` (Schnitte) → VTP; `foamToVTK -fields` für Volumen. vtk.js
liest VTP/VTU nativ. Damit entfallen `foamfields.py` (534), `fields.py`
(177), `services/volume.js`, das F3DV-Binärprotokoll und Marching Cubes
im Browser — und die Bilder werden exakt. Tiefe, WSP je Säule, Froude
(tiefengemittelt, α-gewichtet, horizontal) einmal serverseitig aus der
Isofläche rechnen; der Client zeigt nur an.

### F5 · Nachweisgrößen mit Definitionslücken (MITTEL)

- **Überfallbeiwert** (`evaluate.py:225-269`): Kronenhöhe = Mittel der
  Polylinie statt tiefster Punkt (`:251`); b = Polylinienlänge (`:252`);
  h = Pegel − Krone ohne v²/2g (`:260`); keine Rückstauprüfung;
  Autopaarung: bei genau einem Querschnitt und einem Pegel bekommt *jedes*
  Wehr denselben Q (`:240-245`) → drei Wehre, dreifacher C_d; Wert =
  Median über die **ganze** Reihe inkl. Füllphase (`:121`), der
  Verifikationsfall nimmt das letzte Drittel (`verifikation_wehr.py:139`)
  — zwei Definitionen desselben Beiwerts.
- **min_bed_shear**: „ruhigste Nasszelle zum ruhigsten Zeitpunkt" auf dem
  Voxelgitter (`evaluate.py:95-103`, `foamfields.py:361-413`) — scheitert
  an jeder Stagnationsecke.
- **Energiehöhe**: siehe F4; Mittel über Polylinienpunkte ungewichtet
  (`foamfields.py:530`).
- **Massenbilanz**: Sekante über die letzten 25 % (`evaluate.py:328-338`)
  — eine langsame Schwingung liest sich als Beharrung.
- **discharge_ratio**: ∫|Q| dt — Rückströmung addiert statt aufzuheben
  (`evaluate.py:75-78`).
- **Verweilzeit**: nimmt den alphabetisch ersten Ablauf (`evaluate.py:432`).

**Kur.** Je Nachweisgröße genau eine Definition, mit Zeitfenster und
Gewichtung im Ergebnis ausgewiesen; C_d nur mit explizitem Paar,
Rückstaukontrolle (h_u/h_o) und Eingeschwungen-Fenster aus der Bilanz.

### F6 · Tracer ohne Phasenbindung (MITTEL)

`scalarTransport T` (`casebuilder.py:249-259`) ohne `phase` → Transport mit
dem Gesamtfluss `phi`, der Markierungsstoff diffundiert in die Luft und
verlässt das Gebiet über die Atmosphäre; t10/t50/Kurzschluss hängen an
dieser Kurve. Das eingesetzte Image kann es: Probe an
`libsolverFunctionObjects.so` (v2406) findet `phase`, `alphaPhi`,
`phasePhiCompressed`. **Kur:** `phase alpha.water;` (+ `alphaD`/`alphaDt`
sichten); Test: Tracermasse in der Wasserphase Σ α·T·V gegen Zufluss −
Abfluss.

### F7 · Turbulenz-Anfangs- und Randwerte sind Zahlen ohne Herkunft (MITTEL)

k = 1e-4, ω = 1 als Literale überall (`casebuilder.py:1260-1261,
1306-1311, 1350-1352`), keine Ableitung aus Intensität und Längenmaß,
keine Koeffizienten. Die ε-Ableitung `eintrag.replace("omega",
"epsilon")` (`:1359`) ist ein No-op (die Strings enthalten kein „omega")
→ ε = 1 m²/s³, ν_t = C_μ k²/ε ≈ 9·10⁻¹⁰ — kEpsilon startet praktisch
laminar. Wirkung auf das Ergebnis gering (wandgenerierte Turbulenz
dominiert), aber die Zahlen sind Fantasie. **Kur:** k = 1,5 (U·I)² mit
I = 5 %, L = 0,07 · hydraulischer Radius des Fensters, ω = √k/(C_μ^¼ L),
ε = C_μ^¾ k^1,5/L — ein Formelsatz, ein Test.

### F8 · Rechen als dünne poröse Zone (MITTEL)

Zone 0,15 m tief (`_SCREEN_ZONE_TIEFE`, `casebuilder.py:1055`) bei
0,25–0,5-m-Zellen; der Verlust kommt bei 2 Zellen zu 63 % an (eigene
Ergun-Probe); `rotatedBoxToCell` aus vier Polygonpunkten, das Vorzeichen
der Zonentiefe folgt dem Umlaufsinn (`casebuilder.py:956-984`); die
Verlegung 1/(1−a)² ist Heuristik. Die Regel „≥ 4 Zellen quer" existiert.
**Alternative:** `porousBafflePressure` — der OpenFOAM-Standard für
Siebe und Rechen: Drucksprung Δp = −(μ D + ½ ρ |U| I) U·L über eine
Baffle-Fläche, netzunabhängig exakt; braucht eine faceZone in der
Rechenebene (`createBaffles`). Wenn die Zone bleibt: Umlaufsinn
normieren.

### F9 · Lücken in den Randbedingungen (MITTEL)

- **Fehlt der Atmosphären-Rand, wird `z_max` still zur Wand**
  (`meshgen.py:42-44`: unbelegte Flächen → `farfield`, `wall`). Keine
  Regel verlangt ihn (`grep atmosphere validate.py` = 0). Heute abgedeckt
  durch die Vorbelegung beim Anlegen (`router.py:963`) und alle 12
  gespeicherten Fälle — ein Handgriff im Objektbaum genügt für einen
  dichten Deckel über einem Zweiphasenfall.
- `outflow_constant`: `flowRateOutletVelocity` + `alpha zeroGradient`
  (`casebuilder.py:1284-1289`) zieht Luft, wenn das Fenster nicht
  eingestaut ist; `casespec.py:1109` sagt es, nichts prüft es.
- `outflow_fixed_level`: `fixedValue p_rgh` + `variableHeightFlowRate` —
  das weirOverflow-Muster, in Ordnung; bei zwei festen Pegeln ist die
  Luftsäule über dem zweiten falsch (uniformer Wert, `:1297-1299`).
- σ = 0,07 N/m bei 0,5-m-Zellen (`_TRANSPORT`, `:1402`): physikalisch
  bedeutungslos (We ≫ 1), erzeugt nur parasitäre Strömungen an der
  Grenzfläche → σ = 0 für hydraulische Maßstäbe; nicht konfigurierbar.
- `deltaT 0.001` und `maxDeltaT 1` fest (`:323, :336`).

### F10 · Querschnitte sind Ebenen aus Anfangs- und Endpunkt (KLEIN–MITTEL)

`casebuilder.py:112-115`: Ebene aus `polyline[0]`/`polyline[-1]`, `bounds`
über die Box *aller* Punkte. Ein geknickter Querschnitt misst Wasser, das
die gezeichnete Linie nie kreuzt. **Kur:** Regel „Querschnitt ist gerade"
oder Polylinie als vertikal extrudierte `triSurfaceMesh` samplen.

### F11 · Reproduzierbarkeit: drei Nachlaufketten, ein anderer Allrun (MITTEL)

- Das ausgelieferte `Allrun` (`casebuilder.py:1415-1423`) ist seriell,
  ignoriert `checkMesh`, hat kein `decomposePar`, umgeht `netz_tor` und
  `_pruefe_patches` — wer einen Fall von Hand reproduziert, bekommt einen
  anderen, ungeschützten Lauf als Companion/RunPod
  (`local_runner.py:810-931`).
- `cli.cmd_all` (`cli.py:68-87`) ist eine dritte, abgedriftete Kette:
  ohne `convert_case_fields`, `bed_shear_series`, `energy_head_series`,
  `overfall_cd_rows` → ein CLI-Lauf hat keine Sohlschub-, Energie- und
  C_d-Reihen; die Targets stehen still auf „nicht_auswertbar". Die Spez.
  (Kap. 3) macht die CLI zur Voraussetzung für Regressionstests.
- Nur `blockMeshDict`, `controlDict`, `fvOptions`, `snappyHexMeshDict` sind
  golden (`test_stage3_preprocessing.py:407`); `fvSchemes`, `fvSolution`,
  alle `0/`-Felder, `transportProperties`, `setFieldsDict`,
  `topoSetDict`, `createPatchDict` nicht.
- `bundle.spec_sichern` wird nie aufgerufen → `spec_gesichert` ist immer
  `false`, kein Lauf trägt seine Geometrie (E7-Nebenfund).

### F12 · Betrieb und Sicherheit (MITTEL)

- **Cloud-Lauf ohne Zeitdeckel:** `router.py:2107` reicht
  `payload.get("max_laufzeit_s")` durch, der Client sendet den Schlüssel
  nie (grep über `client/src/features/flood-3D` = 0) → `executionTimeout`
  wird nur vom Verifikationsfall gesetzt. Ein hängender Solver kostet bis
  zum Endpunkt-Timeout (laut BETRIEB „aus bzw. ≥ 4 h").
- **Kein Plattenwächter** (kein `disk_usage`/`statvfs` außerhalb der
  `/dev/shm`-Probe); `import-chunk` hängt unbegrenzt an `_upload.zip` und
  liest das ganze Archiv in den RAM (`router.py:2025-2057`).
- **Kennungsprüfung:** `_SAFE = ^[A-Za-z0-9._-]+$` (`router.py:71`) matcht
  `..` → eine Ebene bis `data/`; sechs Routen prüfen korrekt mit
  `resolve()` + `parent` (z. B. `:370-373`), zwölf lesende nicht. Der
  Traversal-Test deckt nur die `%2F`-Form ab (`test_router.py:226-229`).
- Gate vergleicht mit `!=` statt `hmac.compare_digest` (`gate.py:57`);
  alle GETs sind bewusst offen.
- Kein Semaphor für `POST /runs` — N parallele Cloud-Jobs; Netzvorschau
  je Fall gesperrt, aber zwei Fälle vernetzen gleichzeitig mit
  `--oversubscribe` auf 4 Kernen.
- `local_runner.run_foam_step` (`:534-598`) hat keinen Timeout;
  Startup-Reattach-Fehler enden in `pass` (`router.py:2154`).
- `_geometrie_payload` (181 Z.) und die Import-Analyse (bis 400 MB DXF)
  laufen synchron im Event-Loop.

---

## 3 · Zu schwer gedacht — was sich vereinfachen lässt

Das Muster: Der Schüler hat um einen unverifizierten Kern (a) einen
großen Regel-/Kur-/Rezept-Apparat, (b) einen CAD-Ersatz, (c) drei
Rechenwege mit drei Pipelines und (d) eine eigene Visualisierungs-
Pipeline gebaut, statt die Werkzeuge zu nehmen, die OpenFOAM mitbringt.
Jedes dieser Stücke ist für sich sauber gemacht; zusammen sind sie das
Problem.

| # | Was | Umfang heute | Vorschlag | Was wegfällt |
|---|---|---|---|---|
| V1 | Wächter > Physik | validate 2 506 + kur 597 + rezepte 784 + anschluss 692 = 4 579 Z., 31 Regeln, 17 Kuren, 6 Rezepte | Regeln in drei Klassen: (a) solver-fatal (leere Patches, leere Zone, Gebiet, Netzgröße) — bleiben, hart; (b) fachliche Plausibilität (Eintrittsgeschwindigkeit, y⁺, Ks) — bleiben, Hinweis; (c) Bedienkomfort — einfrieren, keine neuen. Ziel ≤ 15 Regeln, jede an zwei Fällen gemessen | ≈ die Hälfte; Kuren werden zu Editor-Vorschlägen |
| V2 | Fenster-Maschinerie | `resolve_window` … `create_patch_dict` ≈ 350 Z. + Editor-Spiegel + 25 Tests | F1: Standard-Randbedingung für Freispiegel; Fenster nur `kreis` und `follow: culvert` | rechteck/trapez/polygon/`follow: channel_carve`, ≈ 400 Z. + 20 Tests |
| V3 | Eigenes Feld-Resampling | foamfields 534 + fields 177 + volume.js 76 + F3DV + Marching Cubes im Client | F4: `surfaces`-FO / `foamToVTK` → VTP, vtk.js liest nativ | ≈ 900 Z., und die Bilder werden exakt |
| V4 | Drei Pipelines | runner.py (Netzvorschau), local_runner.main 381 Z., cli.cmd_all; Core per `copytree` + `execv`-Übergabe ins Image | `core/pipeline.py` mit Schrittfunktionen (mesh, solve, post), die runner, local_runner, cli und foam_worker aufrufen; Core als Paket (pyproject) im Image | die Drift (F11) und die Übergabe-Akrobatik |
| V5 | Import-Heuristik | importer.py 2 395 Z., davon ≈ 515 Z. DXF-Logik; `_dxf_kandidaten` (239 Z.) ist die längste Funktion des Backends; 25 DXF-Entitätstypen, 16 Layer-Namenshinweise, Rollen aus Metern geraten (`_guess_role`, `:96`); 15 Audit-Funde I1–I15, Phantom-Gerinne | Rolle wählt der Nutzer (Gelände / Bauwerk / Linie) statt Raten; DXF nur 3DFACE/POLYFACE/geschlossene Ringe; Rest über STL/ASC/XYZ; eine Verortung je Fall (`Meta.transform` gibt es schon) | Rollen-, Einheiten-, Ring-Raterei; ein Drittel des Moduls |
| V6 | Gelände-Werkzeugkasten | terrain 1 053 + sculpt 206 + belag 226 + kanten 432 + rotate 467 = 2 384 Z.; 11 Op-Arten, Pinsel, Kanten (`ableiten` 175 Z.), Drehung (`rotate_case` 150 Z.), Undo-Zeitstrahl; drei byteidentische Gitterhelfer (`sculpt._gitter`, `belag.gitter_masse`, `TerrainField.from_spec`), drei Interpolationsschemata fürs Lückenfüllen; `pinsel_sperre` führt den Op-Stapel bis 13-mal aus (`terrain.py:673-691`); `sculpt.sichtbar_geworden` baut vier `TerrainField`s, um eine Migration von 2026-09-22 zu erkennen | Für „Bauwerk im Gelände prüfen" reichen Import + Planum/Gerinne/Böschung + Belag-Patches. Pinsel und Kanten sind der CAD-Ersatz, den die Spez. als Nicht-Ziel führt | Pinsel, Kantenverknüpfung, ein Teil der Ops, die Kopien |
| V11 | Doppelungen im Datenmodell | sechs Feldnamen für dieselbe Punktliste (`alignment.points`, `axis`, `footprint`, `crest_polyline`, `plane_polygon`, `polyline`/`polygon`) — `rotate_case` zählt sie namentlich auf (`rotate.py:317-333`), ein neues Geometriefeld dreht sich still nicht mit; `basin` vs `kammer`, `schacht` vs `pier`, `channel_carve` vs `graben`; `BcWindow` 11 Felder für 4 Formen, `EditAussparung` 12 Felder für 2 Lageschemata, geprüft nicht im Modell, sondern in 148 Zeilen `validate._fenster_pruefen` | ein `Geometrie`-Feld je Objekt (Punkte + Art), diskriminierte Unions statt dünn besetzter Klassen, Modellprüfung per Pydantic-Validator | die Aufzählungen in rotate/validate/Editor |
| V7 | Ergebnis-Panels | 12 Tabs, drei Renderer; Laubkarten 1 117 + 465 + 235 + 119 = 1 936 Z. für eine Frage | Laubkarten einfrieren, bis F3/F4 stehen — ein kinematischer Tracer auf einem Gitter mit 34–100 % Volumenfehler ist keine Aussage | vorerst nichts löschen, nichts ausbauen |
| V8 | Vier Schichten Feldkunde | casespec 75 Klassen; Client: feldTypen 546 + typRegister 116 + preTemplates 443 + kindPfade + Schema-Schnappschuss 7 055 Z. | `schema_version` + Migration; Client-Feldkunde aus dem JSON-Schema mit `x-quagg`-Erweiterungen (Label, Widget, Gruppe) *generieren* — das Muster läuft im IFC-Teil (`generiere_client`) schon | Hand-Spiegel und ihre Drift (`modus`-Labels, 78 unbeschriftete Felder, `falloff` in `NICHT_NEGATIV`) |
| V9 | Physik doppelt im Client | Kirschmer, Ergun, Zellzahl, Durchsatz, Δt in `widerstand.js`/`simHints.js`; drei Drifts: Kerne 8 vs 16, Δt-Formel, Dauer-Klemme | `POST /cases/{id}/schaetzung` liefert alles, Client zeigt an | simHints 419 → ≈ 100 Z., widerstand.js ganz |
| V10 | Router | 2 350 Z., 60 Routen, 25 `except Exception` | vier Router-Module (cases, runs, imports, engines), Pfadhelfer einmal | — |

Zu V1 gehört eine Beobachtung aus den drei früheren Audits: „Regel und
Kur messen nicht dasselbe", „Tests bestätigen den Testfall", „stille
Rückfälle mit plausiblem Aussehen" — das sind Symptome eines Apparats,
der größer ist als das, was er schützt. Kleiner machen ist die Kur, nicht
noch eine Regel. Zwei versteckte Kopplungen zeigen, wie weit es schon
ist: Die Reihenfolge der Registerliste `_PRUEFUNGEN` (`validate.py:2326`)
ist tragend (sie bestimmt die Ausgabeordnung), und `_Kontext.solids`/
`_Kontext.netz` werden von frühen Regeln geschrieben und von späten
gelesen (`validate.py:151-174`) — die Familien sind zweifach
reihenfolgeabhängig, ohne dass es irgendwo steht.

---

## 4 · Programmiertechnisch für die Weiterentwicklung

| # | Maßnahme | Warum |
|---|---|---|
| P1 | **Numerik als versioniertes Profil** (`numerics/interfoam_v1.yaml`: Schemata, Löser, PIMPLE, BC-Sätze, σ, Turbulenz-Init); Hash im Manifest; goldene Tests für **alle** 13 Dicts | Heute steckt die Numerik als Strings in `casebuilder.py`, 4 von 13 Dicts sind eingefroren; niemand kann sagen, mit welchem Setup ein alter Lauf entstand |
| P2 | **`benchmark/` + Nightly** (lokal Docker für kleine Fälle, RunPod für die Netzstudie); Definition of Done: C_d im Literaturband **und** GCI < 5 % | F2 |
| P3 | **Ein Pipeline-Modul, ein Image, Core als Paket** | V4, F11 |
| P4 | **`schema_version` + versionierte Migrationskette**; Loader mit `extra="ignore"` und Warnung für alte Fälle | `migriere` hat schon sieben Migrationen (`casespec.py:1378-1440`), aber keinen Versionsstempel und keine eigene Testdatei; zwei dokumentierte Ausfälle durch Feldänderungen; 12 gespeicherte Fälle |
| P5 | **Betrieb:** `max_laufzeit_s` Pflicht (Vorgabe = Schätzung × 3), Semaphor für `POST /runs`, Plattenwächter vor Lauf/Import, Pfadhelfer `resolve()+parent` in einer Funktion für alle 60 Routen, `compare_digest` | F12 |
| P6 | **Fehlerbehandlung:** 57 `except Exception` (25 im Router) → gezielte Ausnahmen + strukturiertes Logging; kein `pass` beim Reattach | Heute enden Fehler entweder im Befund-Kanal oder im Schweigen |
| P7 | **Client:** Komponententests für die fünf großen SFCs (heute 0); WebGL-Aufräum-Test (`forceContextLoss` = 0 Treffer; `disposeVtk` existiert, Heap-Messung nie erbracht); `usePreStore` (39 Felder, 45 Aktionen) in Fall/Geometrie/Lauf/Meldungen teilen; God-Functions zerlegen (`hinweis` 242, `draw` 233, `updateScene` 200, `rechnen` 162) | Wartbarkeit; die Editor-Module sind ein gutes Vorbild |
| P8 | **Konfiguration:** 23 `FLOOD3D_*` über drei Lesemechanismen → eine `pydantic-settings`-Klasse, Tabelle in BETRIEB | 15 Variablen sind unter pm2 nicht aus `backend/.env` setzbar, die Doku behauptet das Gegenteil |
| P9 | **Doku-Drift:** BETRIEB „RunPod (im Aufbau)" ist der Produktionsort; Spez.-Kopf verwirft RunPod, das gebaut wurde; TESTRUNDE prüft den abgeschafften Serverlauf; keine README im Paket (`find -iname '*.md'` leer) | Wer neu einsteigt, liest Falsches |
| P10 | **Testkultur:** 876/400 grün, aber Dicts werden als Text geprüft, nicht als Lauf (der `outsidePoint`-Vorfall, `casebuilder.py:464-470`); die fünf größten Module (`terrain`, `solids`, `importer`, `validate`, `casespec` = 10 000 von 17 700 Core-Zeilen) haben keine eigene Testdatei, sondern werden thematisch über 22–48 Dateien gestreift; `rotate_case` (150 Z.) hat 6 direkte Tests; ein zweiter *gerechneter* Referenzfall (groß, geneigt, zwei Zuläufe); Router-Tests für bares `..`, Parallelstart, volle Platte | Die schärfste Diagnose des letzten Audits: „Tests bestätigen den Testfall" |

---

## 5 · Was zuerst — Fahrplan in drei Stufen

**Stufe A — Physik glaubwürdig machen (1–2 Wochen).**
F1 Standard-Zufluss + Gegenlauf an Fall A · F6 `phase` · F7 Turbulenz-Init
· σ = 0 · Atmosphäre-Regel · F3c Grenzschichten aus. Dann F2:
`benchmark/` mit Wehr-Netzstudie, Öffnung, GMS; Profil-Hash ins
Manifest. **Erst danach** darf ein Produktivlauf „Nachweis" heißen.

**Stufe B — Ergebnisse ehrlich machen (2 Wochen).**
F4 `surfaces`-FO/VTP statt Voxel · eine Definition für WSP, v, Fr,
Energiehöhe · F5 C_d und Sohlschub neu definieren, Fenster und Gewichtung
im Ergebnis · y⁺ je Patch, nass.

**Stufe C — Struktur (danach).**
V4/P3 eine Pipeline · P4 `schema_version` · P5 Betriebsdeckel · V1/V2
Rückbau · P7 Client-Tests.

**Nicht tun, bis A und B stehen:** neue Rezepte, Bauwerke oder Panels;
GPU; Laubkarten-Ausbau; weitere Kuren.

---

## 6 · Was gut ist (damit das Bild fair bleibt)

- Die **Spezifikation** (Entwicklung rückwärts von den Nachweisgrößen,
  casespec als Vertrag, geschlossener Katalog, Core ohne Web) ist besser
  als das, was die meisten Ingenieurbüros für solche Werkzeuge schreiben.
  Das Problem ist, dass ihr Kap. 13 nicht eingehalten wurde.
- **Echte, teuer gefundene OpenFOAM-Fallen sind dokumentiert und
  gefixt:** `areaNormalIntegrate` ignoriert `weightField` (Durchfluss war
  Luft), `totalPressure` mit `hRef = 0` (66 m/s Sog), scotch-Zerlegung
  ändert das snappy-Netz (jetzt `hierarchical` mit festen Rängen,
  `netz_hash`), `outsidePoints` außerhalb jeder Zelle, spaltenbasiertes
  `force.dat`, `solverInfo` mit Textspalten. Das ist Erfahrungswissen,
  das sonst verloren geht.
- **Ein Namensvertrag** (`conventions.py`, `readers.py:1-18`) zwischen
  Fallbau und Auswertung, mit Kopplungstest.
- **Ein Manifest-Schreiber** mit `flock` (`store.py:95`), nach sieben
  driftenden Kopien; **ein Meldungskanal** im Client, nach neun.
- **Kostentor** am Router (`gate.py`), fail-closed; Kreditkarten-Sperre in
  `conftest.py`; R2 nur als Transit mit Putzrunde.
- **NDJSON-Protokoll** Companion ↔ Server mit AST-Wächter gegen Vokabel-
  Drift; Reattach nach `pm2 restart`; Checkpoints alle 10 min.
- **Editor-Modularisierung** (15 Module mit Spätbindung), Pixel-Maßstab
  für Griffe, `typRegister.bewusstOhne` als maschinenlesbare Lückenliste.
- **Audit-Kultur:** drei Audits mit Zahlen vorher/nachher, E0–E7a in einem
  Tag mit Gegenläufen — das Projekt kann sich selbst korrigieren. Dieses
  Audit sagt nur, wohin die nächste Korrektur zielen muss: nicht in die
  Breite, in die Tiefe.

---

## Anhang A · Belege, die dieses Audit selbst erhoben hat

| Was | Ergebnis |
|---|---|
| Backend-Suite (`venv`, 82 Dateien) | 876 passed, 1 skipped, 77 s |
| Client-Suite (vitest) | 42 Dateien, 400 passed, 13 s |
| `grep variableHeightFlowRateInletVelocity core/ engines/` | 0 Treffer |
| `grep atmosphere core/validate.py` | 0 Treffer |
| `re.match(r'^[A-Za-z0-9._-]+$', '..')` | True |
| `grep max_laufzeit_s client/src/features/flood-3D` | 0 Treffer |
| OpenFOAM-2406-Image, `libsolverFunctionObjects.so` | `phase` 4×, `alphaPhi` 1×, `phasePhiCompressed` 1× |
| `data/verifikation/wehr_ueberfall.json` | C_d 0,633 ± 0,041, Band 0,58–0,71 „eingefrorene Referenz", 20 896 Zellen, 1 016 s |
| Manifest `verifikation-wehr_r001` | y⁺ bis 8 935, Viz-Volumen 41 % |
| Manifest `BetaTest08_r004` / `_r007` | 23 703 / 29 010 Zellen; y⁺ bis 53 360 / 95 374; Viz-Volumen 34 % / 100 %; Courant 1,54 |
| Hardware | 4 Kerne, 7 GB RAM (1 GB frei), 38 GB Platte (88 %) |
| LOC Wächter/Heuristik vs. Physik/Ergebnis | 6 974 vs. 3 983 |
| Klassen / Typen in casespec | 75 / 36 |
| `except Exception` | 57 (Router 25, laufwerk 15, relay 8) |

## Anhang B · Frühere Audits, Status

`docs/flood3d/AUDIT_CODE_QUALITAET_FLOOD3D.md` (13.08.): Z1–Z5 erledigt, Z6
(God-Components, Leaks) und die Wellen W3–W5 teilweise offen.
`docs/flood3d/AUDIT_FLOOD3D_FALLSPEZIFISCH.md` (21./22.09.): E0–E7a gebaut und
live; offen `spec_sichern`, zweiter fester Pegel, QualityPanel-Stile.
`docs/archiv/*`: Dead-Ends U13 (C_d gegen Tabellen), U14 (Kartenabbildungen),
U19 (`profiles`), U20 (CLI unvollständig), U29 (RÜB/RRB-Rezept fehlt —
der wichtigste Bauwerkstyp der Spez.) und die Kap.-14-Restposten
(Netzkonvergenz, Kraft-Phasenwichtung, WSP-Genauigkeit) sind weiter
offen. Die Nutzer-Testrunde (`TESTRUNDE_FLOOD3D.md`, ≈ 90 Kästchen) wurde
nie abgehakt.
