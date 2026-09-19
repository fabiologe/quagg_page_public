# Fahrplan — Rest der Etappe Teil XXIV (2026-09-19, abends)

Stand des Codes: HEAD `c3127e0`, Arbeitsbaum sauber. Live-Build 17:18 UTC (`CdeView-UVNYk7pU.js`, Schreibstufe 4, Konsole nicht im Bundle). CDE-Suite auf diesem Stand: 295 Dateien, 3 249 Tests grün, 6 übersprungen (18:30 UTC). Der Zweig `cde-verbundexport` liegt 52 Commits vor `origin`; seit dem 2026-09-09 ist nichts gepusht. Zeilenangaben relativ zu `client/src/features/cde/`.

Grundlage ist das Nachhaken vom 2026-09-19, 16:00 UTC: Durchstich K1–K10, K2b, O2, O4, O6 gebaut, Abnahmefall C2 grün (Node, ohne Oberfläche, 170 Tests in 18 Dateien auf sauberem HEAD). Was danach im Baum geschah, steht in Abschnitt 0; was noch fehlt, in Abschnitt 2.

## 0 · Was sich seit dem Nachhaken geändert hat

Drei Commits einer zweiten Sitzung, alle Erdbau, keine Doku:

| Commit | Zeit UTC | Inhalt | Durchstich berührt? |
|---|---|---|---|
| `82b8310` | 16:11 | Teil XXII Rest — Ecken ziehen an Gerinne, Böschung, Kanalgraben, Baugrube (`gelaende/Eckmasse.js`, `test/eckenRest.test.js`) | `Bearbeitungen.js`: neuer Setzer `vorgangsmass`, neues Werkzeug mit Nummernfeld `op` — trägt `adresse: 'operation'` und `gueltig`, folgt also E3 und K10 |
| `bd15068` | 16:41 | Teil XX D — der Gerinne-Schnitt (`gelaende/Querschnitt.js`, `test/gerinneSchnitt.test.js`) | `IfcViewer.vue`: drei Hunks am Overlay, nicht am Subjekt |
| `c3127e0` | 17:16 | Teil XXI P6-Rest — Strang- und Schachtbaugruben als ein Profilkörper (`geometrie/ops/Profilkoerper.js`) | nein |

Kein Hunk berührt `fuehreAus`, `sohlen`, `achsbezug`, `anschluss`, `subjektAusStand` oder die Kommandodienste. Das Live-Bundle schreibt weiter Stufe 4. Die Restposten aus dem Nachhaken sind unverändert offen.

**Nachgetragen:** die Doku der drei Erdbau-Commits steht in [../erdbau-2026-09-19.md](../erdbau-2026-09-19.md) (Ecken als Maß, Gerinne-Schnitt, Profilkörper — mit den Zahlen aus Test und Browser).

## 1 · Was fertig ist

Steht in [kommandodefinition.md](kommandodefinition.md), Abschnitt 7a, und im Kopf von [durchstich-vorpruefung-und-plan-2026-09-18.md](durchstich-vorpruefung-und-plan-2026-09-18.md). Kurz: das Kommando ist die Naht (K1, K2), Kennungen kommen vom Aufrufer (E2, K2b), das Subjekt eines eigenen Bauteils kommt aus dem Stand (K3), die Sohle ist echt und wird seit 15:42 UTC als Sohle gespeichert (K4a/K4b), ein Gefälle (K5), Markierung ohne Engine (K6), Abnahmetest (K7), Fang und Konsole (K9), Verknüpfung (K8), Formulare sperren nicht mehr (K10), Sohlzug, Merkmalsfenster und Cockpit setzen Kommandos ab (O6).

## 2 · Die Restposten

Jeder Posten endet mit einer Zahl vorher und nachher. Reihenfolge = Tabelle. „Entscheidung" nennt, wo Fabio vorher ja sagen muss.

| # | Posten | Halbtage | Dateien | Prüfbar | Entscheidung |
|---|---|---|---|---|---|
| **R1** | **Doku nachziehen.** Plan-Kopf und 7a sagen noch „K4b hinter Schreibstufe 4", „nicht committet", „kein Build". Dazu zwei Korrekturen am Inhalt: (a) „fortgeschriebene Kanten speichern ihre Sohle" gilt nur für Pläne OHNE `achsbezug`; ein Plan mit ausdrücklichem `'mitte'` bleibt beim Fortschreiben `'mitte'` (`rezept/Rezeptbau.js:82`, `speichere` behält den Bezug) — drei Formen sind gleichwertig, die Zahlen stimmen in allen; (b) Abweichung 2 in 7a: der Planinhalt-Weg ohne Beleg war hinter Stufe 3 stumm und ist seit 15:42 scharf. README-Zeile, Memory. | 0,25 | `docs/cde/kommando/*` | `grep -c "nicht committet\|hinter Schreibstufe\|kein Build"` in `kommandodefinition.md`, `durchstich-…md`, `README.md`: heute 2 + 2 + 1 = 5, danach 0 | — |
| **R2** | **Planinhalt und Rotstift bekommen einen Beleg.** `stores/planJournal.js:57` ruft `eintragenVorgang` ohne `kommando`; damit gilt „jeder Vorgang hat genau einen Beleg" in Produktion nicht mehr. Zwei Wege: (a) Katalogwerkzeuge `planinhalt-setzen` / `rotstift-zeichnen` nach dem Muster `merkmalssatz-setzen` (O6: Deklaration, `eigeneOberflaeche`, Fenster baut das Kommando über `useKommandoweg`) — das ist E4 wörtlich („Planinhalt und Rotstift werden Kommandos"); (b) ein Systembeleg `system:planinhalt` — billiger, aber ein Beleg ohne Absicht für etwas, das der Nutzer gezeichnet hat. Empfehlung: (a); ein Radierzug bleibt EIN Vorgang. | 1 | `stores/planJournal.js`, `services/Bearbeitungen.js` (zwei Deklarationen), `composables/useKommandoweg.js`, Test `planKommandos.test.js` | Ratsche: Aufrufer von `eintragenVorgang` ohne `kommando` — heute 1 (planJournal), danach 0; jeder Planinhalt-Eintrag in der Datei trägt `kommando.schema: 1` | (a) oder (b) |
| **R3** | **Alte Forderungen an eigenen Haltungen.** Vor K4 schrieb „Sohlhöhen festlegen" an eigenen Haltungen `parametrik`; der Längsschnitt liest sie weiter für jede Kante (`services/LaengsschnittSicht.js:61-66`) und zeigt „gefordert", obwohl kein Werkzeug sie mehr einlöst. Kur: für Kanten mit `quelle: 'bauplan'` gilt der Bauplan, die Forderung wird ignoriert; dazu ein Befund `forderung_ohne_wirkung` (Warnung, Kur „in den Bauplan übernehmen") im Prüflauf, damit der Altbestand nicht still bleibt. | 0,5 | `services/LaengsschnittSicht.js`, `services/Prueflauf.js`, `services/Befunde.js`, Test in `sohleEigen.test.js` | Fixture: eigene Haltung + alte Forderung 99,00 → `gefordert` heute `{hA: 99}`, danach `null`; Befund 1 | — |
| **R4** | **K1-Gold über alle Werkzeuge.** Der Plan verlangte „für alle 58 Werkzeuge dieselben Schritte wie vorher"; `test/hilfen/werkzeugGold.js` hat Proben für 15. Jede Probe ist ein Subjekt plus Werte; die Zeichenwerkzeuge brauchen einen Zug. Werkzeuge ohne Probe stehen in einer AUSNAHMELISTE mit Grund, und der Test verlangt, dass jede Katalog-Id entweder eine Probe oder einen Grund hat. | 1 | `test/hilfen/werkzeugGold.js`, `test/kommando.test.js` | Werkzeuge mit Probe: 15 → 58 minus begründete Ausnahmen; Ausnahmen mit Grund gelistet, Ziel ≤ 5 | — |
| **R5** | **K3-Fixture gegen den echten Viewer.** Der Plan verlangte „feldgleich mit dem des Viewers (Fixture)"; `subjektAusStand.test.js` vergleicht gegen eine Engine-Attrappe, die Viewer-Gleichheit ist nur im Browser gemessen (16 bzw. 14 Felder). Kur: das Viewer-Subjekt einer eigenen Haltung und eines eigenen Schachts aus dem Browser (42069, A64-Netz) als JSON-Fixture ablegen; der Test baut denselben Stand nach und vergleicht Feld für Feld. Der Fixture-Lauf ist das e2e-Skript aus dem Scratchpad, einmalig. | 1 | `test/fixtures/viewerSubjekt-*.json`, `test/subjektAusStand.test.js` | Felder verglichen: 0 → 16 + 14, Abweichungen 0; Gegenprobe: ein Feld im Fixture geändert → rot | — |
| **R6** | **Rechteckprofil, Abstand Mitte → Sohle.** 7a: „nicht eigens getestet". Ein Rechteckkanal aus der Bibliothek, Sohle gesetzt, tiefster Punkt des Körpers = Sohle. | 0,25 | `test/sohleEigen.test.js` | 1 neuer Test; Gegenprobe (`abstand` liefert 0) rot | — |
| **R7** | **Sohle eines GELIEFERTEN Knotens beim Fang.** K9/K8 lassen die getippte Höhe stehen, weil die Platzierung eines gelieferten Schachts nicht sicher seine Sohle ist. Kur: die Sohle aus den Anschlüssen des Knotens (`Netztopologie.anschluesseMitAchsen`, tiefste Ablauf-Sohle mit ihrem Achsbezug), sonst die getippte. | 0,5 | `services/kommando/Auswertung.js`, `services/Netztopologie.js`, Test in `verknuepfung.test.js` | Fixture: gelieferter Schacht mit Ablauf-Sohle 235,39, getippt 240 → Ende heute 240, danach 235,39 | einbauen oder auf „nach der Etappe" legen |
| **R8** | **K5 und K6 im Browser messen.** Beides ist nur im Test belegt. K5: eine L-Haltung 2 × 20 m, 12 cm Fall — Achsbeschriftung, Längsschnitt, Vorschau nennen 3,0 ‰ (die Sehne sagte 4,24). K6: Prüfliste mit 0 und mit 2 gelieferten Modellen — die eigene Haltung steht genau einmal drin. Zahlen in 7a. | 0,5 | Scratchpad e2e, `docs/cde/kommando/kommandodefinition.md` | drei Anzeigen gleich; Treffer je Modellzahl 1 / 1 | — |
| **R9** | **Server-Wächter für `mindestClient`** (schließt die letzte Lücke der K4-Migration). Heute prüft nur der Client (`stores/useAenderungen.js:751`); der Server (`backend/app/api/projekt/core/cde.py`) kennt das Feld nicht. Ein Tab von vor dem 2026-09-18 16:05 kennt die Sperre nicht und dürfte eine Stufe-4-Datei überschreiben, sobald er selbst der letzte Schreiber war. Kur: der Server lehnt eine Nutzlast ab, deren `mindestClient` kleiner ist als der gespeicherte (409 mit Grund); der Client zeigt es wie die Verweigerung des Mehrbenutzer-Wächters. Braucht `pm2 restart quagg-api`. | 1 | `backend/app/api/projekt/core/cde.py`, `tests/test_cde.py`, `stores/useAenderungen.js` | `test_cde.py`: Nutzlast mit 2 auf Datei mit 4 → heute 200, danach 409 | ja/nein; Neustart nur mit Fabios OK |
| **R10** | **Abnahme und Auslieferung.** (a) Fabio spielt C2 in der Konsole selbst (`:3001`, Entwicklungsmodus, Knopf „Beispiel C2"). (b) Nach R1–R8: CDE-Suite und Client-Suite grün mit Zahlen; Build atomar über `dist_neu` nach `find … -newer dist` (fremde Zwischenstände!). (c) Commit und Push auf Zuruf — 52 Commits liegen nur lokal. | 0,5 | — | Suite-Zahlen vorher/nachher; Push: `git rev-list --count origin/cde-verbundexport..HEAD` 52 → 0 | Push |

Summe ohne R9: **5,5 Halbtage**; mit R9: **6,5**. R1 sofort, weil die Doku heute etwas anderes sagt als der Code. R2 vor allem anderen, weil es Produktion betrifft. R4 und R5 sind die zwei Prüfkriterien aus dem Plan, die nur halb eingelöst sind. R7 und R9 sind Ausbau; ohne sie ist die Etappe trotzdem zu.

## 3 · Wann die Etappe zu ist

1. Kein Schreibweg ins Journal ohne Beleg (Ratsche 0).
2. Jedes Katalogwerkzeug hat eine Gold-Probe oder einen genannten Grund.
3. Die Viewer-Gleichheit des Subjekts ist ein Test, keine Browsererinnerung.
4. Die Doku sagt, was der Code tut (R1), inklusive der drei Speicherformen des Achsbezugs.
5. Suite grün mit Zahl, Build live, Zweig gepusht.

## 4 · Außerhalb der Etappe, benannt

- **Planinhalte aus der alten Ablage** (`uebernimm`, A7b): der alte Schlüssel bleibt liegen; schreibt ein alter Client weiter dorthin, kommen neue Ids nach, Änderungen nicht. Nicht getestet.
- **N1 bei „Schacht entfernen"** mit verschiedenen Rezepten: die neue Haltung ist das Katalog-Rohr (Teil XXIII).
- **Rückgängig einer Version bei offener Bearbeitung** überschreibt spätere Arbeit derselben Bearbeitung (Kassensturz S5, Nebenbefund).
- **E8 beim Wiederholen** nicht gebaut — bewusst (7a, Abweichung 3), der Fall kann nicht entstehen.
- **Ein Commit für K1–K10** statt je Schritt einer (C1) — geschehen, nicht rückgängig zu machen; künftig wieder je Schritt.
- **Katalogverlauf** (E4), **CI** (nie gelaufen), **Kennwerte und Pauschalen** (E4: nach dem Durchstich neu bewerten).

## 5 · Stand (2026-09-19, spät — R1–R10 erledigt)

Umgesetzt auf Fabios „bitte umsetzen und die Lücken für unsere Etappe füllen“. Entscheidungen, die der Plan offen ließ: R2 (a) Katalogwerkzeuge; R7 eingebaut; R9 Code und Tests, Neustart nur auf Zuruf. Einzelheiten und Gegenproben in [kommandodefinition.md](kommandodefinition.md), 7a, „Rest der Etappe“.

| # | vorher → nachher | Stand |
|---|---|---|
| R1 | veraltete Aussagen 5 → 0 | fertig |
| R2 | Aufrufer von `eintragenVorgang` ohne Kommando 1 → 0; Planinhalt in der Serverdatei mit Beleg (Browser) | fertig |
| R3 | `gefordert` `{hA: 99}` → `null`; Befund `forderung_ohne_wirkung` 0 → 1 | fertig |
| R4 | Werkzeuge mit Probe 15 → 63 (alle), Ausnahmen 0 | fertig |
| R5 | verglichene Felder 0 → 16 + 14, Abweichungen 0 | fertig |
| R6 | Rechteckprofil: 0 → 2 Tests | fertig |
| R7 | Ende am gelieferten Schacht 240 → 235,39; Knoten aller Modelle (vorher nur des ersten) | fertig |
| R8 | Tafel 3 ‰, Befund 3,0 ‰, Längsschnitt 3,000 ‰ (Sehne 4,24); Prüfliste 1 / 1 bei 0 und 2 Modellen; Vorschau: in den Testdaten keine geknickte gelieferte Achse | gemessen |
| R9 | Nutzlast 2 auf Datei 4: 200 → 409; Client nimmt den Vorgang zurück und liest nur | live: pm2-Neustart 20:10 UTC; in Produktion geprüft an einem Probe-Schlüssel in 42069 (4 → 200, 2 → 409, ohne Feld → 409; danach gelöscht) |
| R10 | Suite Client 446 / 4 776 grün, Server 145 grün; acht Commits `0d0b31b`…`2da17aa` (je Schritt einer, jeder Zwischenstand mit seinen Tests grün); Build 20:07 UTC (`index-Aw-19ceq.js`, `CdeView-BRvidCPU.js`, Konsole nicht im Bundle), Domain 200; Push `origin/cde-verbundexport` 60 → 0 | fertig (Fabio „oki geht klar“) |

Neu offen (aus R8): eigene Bauteile, gezeichnet ohne geladenes Modell, bekommen beim späteren Laden eines Modells im selben Tab keinen Versatz nachgeführt; die Prüfliste zeigt höchstens 30 Bauteile.

---

Aufträge und Grundlagen: [README](README.md)
