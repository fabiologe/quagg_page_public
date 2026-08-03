# Benchmark-Bericht flood-2D

Erste quantitative Validierung des Solvers gegen eine **exakte analytische Lösung** —
nicht gegen sich selbst.

> **Abgrenzung.** `engines/docker/test_*.py` sind Regressionstests: tut der Code, was er soll
> (kein Absturz, richtige Dateiformate, plausible Massenbilanz). Sie sagen **nichts** darüber,
> ob das Ergebnis der Physik entspricht. Genau das prüfen die Fälle hier.

Ausführen:

```bash
cd backend/app/api/flood2D/benchmark
python3 run_benchmark.py                  # alle Fälle
python3 run_benchmark.py --convergence    # zusätzlich Gitterkonvergenz
python3 run_benchmark.py --keep           # Job-Verzeichnisse zum Nachsehen behalten
```

Erzeugte Dateien:

| Datei | Inhalt | versioniert |
|---|---|---|
| `RESULTS.md` | Ergebnistabelle des letzten Laufs (maschinell erzeugt) | ja |
| `history.csv` | eine Zeile je Fall/Schema **und Lauf** — macht Drift über die Zeit sichtbar | ja |
| `report.json` | Rohdaten inkl. Profilauszügen für Plots | nein (Laufartefakt) |

---

## Lauf vom 2026-08-01

Solver: `fabiologe/quagg-lisflood:latest`, Stempel `73653c3-dirty`, 9 Patches
(der Versionsstempel geht aus dem `solver_version`-Event in `report.json` ein — damit ist
jederzeit nachvollziehbar, welcher Solver diese Zahlen erzeugt hat).

### Fall 1 — Ritter-Dammbruch

Senkrechter Dammbruch auf trockenem, horizontalem, reibungsfreiem Bett. h₀ = 10 m,
Domäne 1000 m, Auswertung bei t = 20 s. Exakte Lösung nach Ritter (1892).
Metriken über die **aktive Zone** (Verdünnungswelle, 297 von 500 Zellen) — außerhalb ist die
Lösung trivial konstant und würde den Fehler wegmitteln.

| Schema | RMSE | NSE | Frontfehler ≥0,2 m | ≥0,05 m | ≥0,01 m |
|---|---|---|---|---|---|
| **fv1** (Finite-Volumen, HLL) | **0,082 m** | **0,999** | −10 m | −32 m | −44 m |
| acceleration (Trägheitsform.) | 1,878 m | 0,603 | −154 m | −196 m | −220 m |

**Befund 1 — `fv1` ist für schnelle Transienten geeignet.** Bei 2 m Zellweite liegt der
Tiefenfehler bei 8 cm auf einen 10-m-Dammbruch (< 1 %), NSE praktisch 1,0. Der Frontverzug von
10 m entspricht 5 Zellen.

**Befund 2 — `acceleration` ist es nicht, und der Unterschied ist groß.** RMSE 1,88 m
(~19 % von h₀), NSE 0,60, Front 154 m zu langsam. Die Welle läuft mit ≈ 11 m/s statt
analytisch 2·c₀ = 19,8 m/s — die Trägheitsformulierung vernachlässigt den Advektionsterm und
ist für Dammbruch-Transienten schlicht nicht gedacht. Das ist **kein Solver-Fehler**, sondern
eine Modellwahl-Frage: für langsame Vorlandüberflutung ist `acceleration` richtig und schneller,
für Dammbruch/Deichbruch/Sturzflut muss `fv1` gewählt werden.

> **Praktische Folge für die App.** SGC erzwingt `acceleration` (`pars.cpp:730`). Wo ein
> Sub-Grid-Gerinne im Modell steckt, ist der Solver damit automatisch auf das für rasche
> Transienten ungeeignete Schema festgelegt. Für Nachweise mit schnellen Wellen ist das eine
> bewusste Entscheidung — und sollte im Client sichtbar gemacht werden, statt implizit zu
> passieren.

**Frontlage ist schwellwertabhängig.** Der analytische Auslauf ist ein extrem dünner Keil; jedes
Verfahren 1. Ordnung diffundiert ihn weg. Deshalb wird die Front bei drei Schwellen gemessen.
Geprüft wird gegen ≥ 0,2 m — eine Schwelle nahe null misst hauptsächlich die Diffusion der
Zellspitze, nicht die Qualität der Lösung.

### Gitterkonvergenz (fv1)

| dx | Zellen | RMSE | NSE | Frontfehler |
|---|---|---|---|---|
| 8 m | 125 | 0,214 m | 0,995 | −24 m |
| 4 m | 250 | 0,127 m | 0,998 | −20 m |
| 2 m | 500 | 0,082 m | 0,999 | −10 m |
| 1 m | 1000 | 0,052 m | 1,000 | −3 m |

Fehler fällt **monoton**, beobachtete Konvergenzordnung **p ≈ 0,68** (Einzelschritte 0,75 / 0,63
/ 0,65).

**Warum das der wichtigste Teil ist:** Ohne Konvergenznachweis wäre ein guter RMSE bei einer
Auflösung Zufall. Dass der Fehler sich mit dem Gitter systematisch verkleinert, belegt, dass hier
tatsächlich Diskretisierungsfehler gemessen wird — die Harness misst etwas Reales.

p ≈ 0,68 statt der theoretischen 1,0 ist für dieses Problem **erwartet und kein Defekt**: an
Unstetigkeiten und Trocken-Nass-Fronten fällt die formale Ordnung eines Verfahrens 1. Ordnung
regelmäßig unter 1.

### Fall 2 — Manning-Normalabfluss im SGC-Rechteckgerinne

Der Fall trifft den Pfad, den die App tatsächlich exportiert: ein Sub-Grid-Gerinne (SGC) mit
Rechteckquerschnitt. Q = 10 m³/s, b = 5 m, n = 0,030, S₀ = 0,001, Gefälle über 2 km.
Analytische Normalwassertiefe **h_n = 1,8293 m** (Froude 0,26, also strömend).

| Größe | Wert |
|---|---|
| h simuliert (Mittel im Auswertefenster) | **1,8305 m** |
| h analytisch | 1,8293 m |
| relative Abweichung | **+0,07 %** |
| RMSE | 0,0014 m |
| Profilneigung über 2 km | +1,9 mm/km |

**Die SGC-Gerinnehydraulik stimmt mit der Handrechnung praktisch exakt überein.** Das ist ein
stärkeres Ergebnis, als es aussieht: die Referenz wurde nicht angenommen, sondern am Quelltext
hergeleitet — `sgc.cpp:869` rechnet mit der Trägheitsgleichung, die im stationären Zustand exakt
auf Manning zusammenfällt, und `CalcSGC_R` case 1 liefert den **vollen** hydraulischen Radius
R = A/(w+2h), nicht die Breitgerinne-Näherung.

Gitterkonvergenz (dx = 40/20/10/5 m): RMSE 0,006 → 0,003 → 0,001 → 0,001 m, p ≈ 1,00. Die
Normalwassertiefe ist erwartungsgemäß praktisch auflösungsunabhängig — alle Fehler liegen unter
6 mm.

#### Zwei Fallen, die dieser Fall aufgedeckt hat

**1. Punktquellen-QFIX ist m²/s, nicht m³/s.** Der erste Lauf ergab 230 % zu große Tiefen, weil
`Qin` bei 100 statt 10 m³/s lag. Ursache ist kein Solver-Fehler, sondern die Einheit:

```c
// sgc.cpp:1059
if (Statesptr->latlong == OFF) Q_multiplier = Parptr->dx;
// sgc.cpp:1075
dV = BCptr->PS_Val[ps_index] * Q_multiplier * Solverptr->Tstep;
```

Auf einem projizierten Gitter wird der `.bci`-Wert mit der Zellweite multipliziert. Wer m³/s
hinschreibt, speist um den Faktor Zellweite zu viel ein. Der Client weiß das und splittet den
Zufluss (s. `engines/docker/README.md`, Abschnitt `bdyfile`) — für handgebaute Szenarien ist es
eine scharfe Kante.

**2. Ein freier Auslauf macht den Normalabfluss-Vergleich unmöglich.** Mit `FREE` am Unterwasser
stellte sich eine Senkungskurve ein, die von 1,808 m am Zulauf auf 1,095 m am Auslauf abfiel —
über das **gesamte** 2-km-Gebiet. Bei strömendem Abfluss wirkt der Unterwasserrand stromauf, und
die Längenskala ist h/S₀ ≈ 1800 m. Es gab in diesem Aufbau schlicht keine Strecke mit
gleichförmigem Abfluss.

Deshalb liegt der Unterwasserrand jetzt auf der Normalwasserspiegellage (`HFIX`). Das macht den
Test **nicht zirkulär**: vorgegeben ist nur der Wasserstand am letzten Querschnitt. Ob daraus über
2 km gleichförmiger Abfluss wird, entscheidet allein der Reibungsansatz des Solvers — weicht seine
Konveyanz von der Handrechnung ab, kippt der Wasserspiegel gegen die Sohle. Genau das misst die
Prüfgröße **Profilneigung**, und die liegt bei 1,9 mm/km (≈ 3,8 mm auf 2 km).

---

## Toleranzen — was sie sind und was nicht

Die Schwellen in `run_benchmark.py` (`TOLERANCE`) sind **Regressionsschwellen**, keine
Gütezusagen: sie beantworten „ist es schlechter geworden als beim letzten Mal", nicht „ist es
gut genug für einen Nachweis". Die belastbare Größe sind die gemessenen Werte in der Tabelle
oben. Bei jeder Solver-Änderung gegenrechnen und Abweichungen hier festhalten.

---

## Bekannte Vereinfachungen

- **Reibungsfrei** ist bei LISFLOOD nicht exakt darstellbar; gesetzt ist `fpfric 1e-6`. Der
  daraus folgende Fehler ist klein gegen die gemessenen Schemafehler.
- **Geschlossene Ränder.** Domänenlänge und Simulationsdauer sind so gewählt, dass weder
  Wellenkopf (bei 302 m) noch Front (bei 896 m) einen Rand erreichen — es gibt also keine
  Reflexion, die das Ergebnis verfälschen könnte.
- **Nur Tiefen verglichen.** Die Ritter-Lösung liefert auch ein Geschwindigkeitsfeld; der
  Vergleich dagegen steht noch aus.

## Nächste Fälle (Reihenfolge aus ROADMAP_FLOOD2D_PRODUKTION.md, P1.2)

2. Gleichförmiger Abfluss im Gerinne (Manning-Normalabfluss) — validiert den SGC-Rechteckkanal
   gegen Handrechnung.
3. Ein publizierter Fall (EA-2D-Benchmark o. ä.) als Außenreferenz.
4. Einzelstrukturen: Wehr, Brücke, Punktzulauf je isoliert gegen Handrechnung.
   → braucht vorher den echten Wehr-Durchflussbeiwert (P1.3); solange `Cd` hartcodiert 1,704
   ist, misst ein Wehr-Benchmark nur die Rategüte.
5. Echtes Ereignis mit Pegeldaten — zuletzt.
