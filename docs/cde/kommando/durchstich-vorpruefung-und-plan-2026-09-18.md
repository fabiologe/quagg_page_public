# Durchstich „Achse ziehen" — Vorprüfung und Plan (2026-09-18)

Stand des Codes: Commit `443919b`. Alle Zeilenangaben relativ zu `client/src/features/cde/`. Die Verweise A2, A4, A6, U3, U6, E2 … zeigen in den [Abgleich](abgleich-2026-09-18.md).

## Stand nach den Entscheidungen (2026-09-18, spät)

Fabio hat E1–E9 entschieden ([Entscheidungen](entscheidungen-2026-09-18.md)), E7 ist gemessen ([Messbefund](messbefund-e7-hoehenbezug-2026-09-18.md)), und es gibt einen [Entwurf der Kommandodefinition](kommandodefinition.md). Die sechs Annahmen aus C0 sind damit ersetzt:

| Annahme in C0 | jetzt |
|---|---|
| 1 · Schema | `kommandodefinition.md`, Abschnitt 1 — von Fabio angenommen (2026-09-18) |
| 2 · Kennung vom Aufrufer | entschieden (E2), Feld `neu` |
| 3 · Zugpunkte verweisen auf Knoten | entschieden (E6) — aber NACH dem Durchstich; im Durchstich fallen die Koordinaten in XZ zusammen |
| 4 · Sohlhöhe | gemessen: heute DN/2 daneben; die vorgesehene Richtung gilt (E7) |
| 5 · ungültig gegen regelwidrig | entschieden (E5) — der Umbau der Formulare NACH dem Durchstich |
| 6 · ganz oder gar nicht beim Sichern | gebaut (K2): ein Vorgang, einmal gesichert; verweigert der Mehrbenutzer-Wächter, ist er abgelehnt. Scheitert nur das Netz, bleibt er ganz im Fenster und geht mit dem nächsten Schritt (Abnahme 2026-09-12) |

**Die Schritte danach:**

| # | Schritt | Entscheidung | im Durchstich? | Halbtage |
|---|---|---|---|---|
| K1 | Kommando als Wert, reine Auswertung, Kennung vom Aufrufer — **gebaut 2026-09-18** | E1, E2 | ja | 2 |
| K2 | ganz oder gar nicht, Schemaversion, Beleg am ersten Eintrag, Vorgang = Kommando — **gebaut 2026-09-18** | E1 | ja | 2 |
| K2b | Operationen tragen eine Kennung (`op-…`), Verweis `{operation}`; dazu Punktadressen statt Nummern — **gebaut 2026-09-18** | E3 | ja | 1 |
| K3 | Subjekt eines eigenen Bauteils aus dem Stand — kuriert zugleich den Messbefund „gewählte eigene Haltung hat weder Achse noch Strang, Feld 0 m NN" — **gebaut 2026-09-18** | — | ja | 2–3 |
| K4 | Sohlhöhe echt: Bauplan nennt `achsbezug`, neue Haltungen `sohle`; Längsschnitt-Sicht liest den Bezug (auch für Geliefertes, O7); **zwei Auslieferungen** — **K4a gebaut 2026-09-19** (Leser, Werkzeuge in Sohle, Speicherung Mitte), **K4b gebaut, hinter Schreibstufe 4** | E7 | ja | 3 |
| K5 | ein Gefälle, eine Funktion — **gebaut 2026-09-19** | — | ja | 1 |
| K6 | Markierung ohne Engine, Prüfliste einmal außerhalb der Modellschleife — **gebaut 2026-09-19** | — | ja | 2 |
| K7 | Abnahmetest nur über Kommandos (C2) — **grün 2026-09-19** (`test/durchstichAchse.test.js`) | — | ja | 1 |
| K9 | Wegwerf-Oberfläche: Kommando-Konsole — **gebaut 2026-09-19**, dazu Fang auf Knoten beim Zeichnen einer Kante | — | ja | 1 |
| K8 | Verknüpfung deklariert + `netzToleranzM` statt fester 1 mm in `services/Netztopologie.js:26-27` — **gebaut 2026-09-19** | E6 | **danach** | 3 |
| **K10** | **Formulare sperren nicht mehr:** `min/max` werden Befunde der Schwere `warnung`, `bereit` fragt nur Technisches (`services/Bearbeitungen.js:3106-3126`, `stores/useBearbeitung.js:149-150`, Fachgrenzen in `services/rezept/Eingebaut.js`, `services/gelaende/Operationen.js`) — **gebaut 2026-09-19** | E5 | **danach** | 2–3 |

Im Durchstich **15–16 Halbtage**, danach K8 und K10 mit 5–6. Der erste sinnvolle Zwischenstand ist nach K1 + K2 **erreicht** (2026-09-18, nicht committet): die Naht existiert, und die Produktion verhält sich bis auf zwei gewollte Stellen wie vorher — jeder Vorgang trägt seinen Beleg, und ein vom Mehrbenutzer-Wächter verweigerter Schritt ist abgelehnt statt still lokal. Einzelheiten: `kommandodefinition.md`, Abschnitt 7a. Danach, ebenfalls gebaut und nicht committet: K2b samt Adressen statt Nummern (E3), Wiederholen (O2) und Systembelege (O4) — die letzten beiden liegen außerhalb der Halbtage des Durchstichs. Dann K3 (Subjekt aus dem Stand, im Browser feldgleich mit dem Viewer) und K4 (Sohle am gebauten Körper auf den Millimeter; K4b wartet auf die nächste Auslieferung) und K5 (ein Gefälle, gegen die Weglänge) und K6 (Markierung ohne Engine, einmal statt je Modell). **Der zweite Zwischenstand ist erreicht (K7, 2026-09-19): der Abnahmefall ist grün, ohne Oberfläche, allein über Kommandos.** **Mit K9 (2026-09-19) ist der Durchstich vollständig**: Konsole im Entwicklungsmodus, Fang auf Knoten beim Zeichnen, im Browser nachgeprüft. Danach, je eigener Schritt: K4b einschalten (eine Auslieferung nach K4a), K8 (Verknüpfung, `netzToleranzM` — **gebaut 2026-09-19**), K10 (Formulare sperren nicht mehr — **gebaut 2026-09-19**), O6 (Sohlzug, Merkmalsfenster und Cockpit als Kommandos — **gebaut 2026-09-19**).

Die Abschnitte B und C unten sind der Stand VOR den Entscheidungen und bleiben als Begründung stehen.

## B — Vorprüfung: wie weit läuft der Abnahmefall heute? (Auftrag 3a)

| # | Schritt | Urteil | Beleg |
|---|---|---|---|
| 1–2 | Schacht A und B setzen | **teilweise** | Ohne Store geht es schon: `nachId('schacht-zeichnen').anwenden({punkte, hoehenversatz}, werte)` liefert den fertigen `erzeugt`-Schritt (`Bearbeitungen.js:515-535`, `Bauteilrezepte.js:722-735`). Der Store-Weg verlangt `modusAn` + scharfes Werkzeug + gültiges Formular (`useBearbeitung.js:645-664`). **Lücken:** die Kennung wird IM Werkzeug gewürfelt (`Bauteilrezepte.js:671-674`, `:726`) — ein Folgekommando kann A nicht nennen. Über den Zeichenweg der Oberfläche fallen Sohle und Deckel zusammen: `_mitHoehe` verwirft das y (`composables/useEingabe.js:145-149`), EINE Formularhöhe gilt für alle Punkte (`Bearbeitungen.js:520-525`) — der Schacht hat dann keine Höhe. Als Netzknoten reicht `punkte[0]` (`rezept/Rezeptbau.js:157-162`). |
| 3 | Haltung ziehen | **teilweise** | Die Vorgabe „Muster + Katalogeintrag" ist erfüllt: `rohr-zeichnen` entsteht aus Schlitz `zug` + Rezept `rohr` (`Bearbeitungen.js:462-477`, `:957`). **Aber:** gespeichert werden nur Koordinaten, keine Verknüpfung; verbunden ist, was in XY auf 1 mm zusammenfällt (`Netztopologie.js:26-27`). Beim Rohrzeichnen gibt es KEINEN Fang — `fang` entsteht nur, wenn das Werkzeug `eingaben` deklariert (`Bearbeitungen.js:483-486`), `services/Fangpunkte.js` hat in Produktion keinen Aufrufer. Die Endhöhe kommt nie von der Schachtsohle. |
| 4 | Sohlhöhen ändern | **BRUCH** | `sohlhoehen-setzen` wird an der eigenen Haltung angeboten (Rollen aus dem Typprofil `bauform/Typprofile.js:95-96`, Güte „gemessen" über `bauform/Bauformen.js:287-289`) und läuft durch — schreibt aber nur `parametrik` (`Bearbeitungen.js:342-359`, `:1264-1284`). Gelesen wird dieser Stand an drei Stellen (Forderungslinie `LaengsschnittSicht.js:54-58`, Vorbelegung `useBearbeitung.js:395`, Cockpit), nie von Geometrie, Netz oder Befund. Die Sohlgriffe sind für Eigenes abgeschaltet (`services/Griffe.js:266`). |
| 5 | Gefälle berechnen | **teilweise** | Nie gespeichert — richtig. Aber fünf Rechnungen statt einer: `Befunde.js:155-158` (maßgeblich, gegen die waagerechte Länge), `services/AxisAnnotations.js:314-323`, `LaengsschnittSicht.js:68`, `services/Vorschau.js:226`, Umkehrung `Bearbeitungen.js:1483`. Die Netzkante trägt keinen `achsbezug` (`Rezeptbau.js:150-153`), obwohl `formAus('linie')` `'mitte'` sagt (`:89-93`) — fürs Gefälle gleichgültig, für jede Sohlhöhe nicht. |
| 6 | Markierung bei Unterschreitung | **fehlt als Lauf ohne Oberfläche** | Die Regel stimmt und kommt aus dem Katalog: `gefaelle_zu_flach` über `mindestGefaelle` → `regeln/Regelwerk.js:108-111`, eingebaut die Formel 1:DN (DN 300 → 3,33 ‰), überschreibbar durch Büro/Projekt (`test/regelwerk.test.js:55-62`). Aber der Lauf übers Modell braucht die Engine (`engine/Pruefliste.js:25`) und mindestens EIN geliefertes Modell (A2 · F8); Aufrufer ist allein `components/IfcPlanningCockpit.vue:131`, das Ergebnis liegt in einem lokalen `ref`. Je Bauteil gibt es `useBearbeitung.befunde` (`:140-147`) — es braucht `bauteil.achse` aus dem Viewer. Im Raum wird kein Befund gefärbt (`IfcEngine.js:138-166`). |

**Der erste Bruch ist Schritt 4.** Genau dort, weil das Werkzeug, das die Aufgabe nennt (und das der Befund als Kur nennt), an einem EIGENEN Bauteil eine Forderung an einen Planer schreibt, den es nicht gibt: `SETZ_OPERATIONEN.mass` kennt keinen Zweig eigen/geliefert, und die Kette Bauplan → `cdeAchsenAus` → Netzkante → `befundeFuer` liest ausschließlich `parameter.punkte`. Auf dem Papier ist die Schleife 4 → 5 → 6 geschlossen, im Code offen — der Kommentar `Bearbeitungen.js:1261-1262` nennt es selbst als aufgeschobene Arbeit. Dahinter warten zwei weitere Brüche: Schritt 6 hat keinen Lauf ohne Engine, Schritt 3 keine Verknüpfung.

Am nächsten kommen dem Abnahmefall heute `test/rezeptAusBibliothek.test.js:214-240` (eigene Kante zeichnen, Achse von Hand einordnen, Katalogwerkzeug ausführen) und `test/fachmodellJournal.test.js:130-153` (Journal → Netz → Prüfliste — mit von Hand gebautem `_achsen`).

---

## C — Plan Durchstich „Achse ziehen" (Auftrag 3)

### C0 · Vor dem Plan: die Kommandodefinition reicht für diesen Durchstich NICHT

Es gibt sie nicht als Dokument, nur als sieben Grundsätze. Für den Durchstich fehlen genau diese Stellen (jede ist eine Entscheidung aus A6):

1. **Das Schema selbst** — welche Felder ein Kommando hat. Der Plan nimmt an: `{schema, id, werkzeug, ziel: [guid], neu: [guid], werte, zug, wer, wann}`.
2. **Wer die Kennung neuer Objekte vergibt (E2).** Ohne sie kann „Haltung zwischen A und B" A und B nicht nennen. Annahme: der Aufrufer, im Feld `neu`.
3. **Ob „dazwischen ziehen" die Schächte REFERENZIERT (E6)** oder nur ihre Koordinaten trifft. Annahme: Zugpunkte dürfen `{knoten: guid}` sein, der Bauplan nennt seine Anschlüsse.
4. **Was „Sohlhöhe" an einer eigenen Haltung bedeutet (E7)** — heute liegt die Achse in der Rohrmitte. Annahme: das Kommando spricht in Sohlhöhe m NN, der Bauplan nennt seinen Achsbezug.
5. **Wo „ungültig" aufhört und „regelwidrig" anfängt (E5).** Annahme: nur Unbaubares wird abgelehnt.
6. **Was „ganz oder gar nicht" beim SICHERN heißt (U3)** — gilt ein Kommando als ausgeführt, wenn es im Speicher steht, der Server aber nicht antwortet? Annahme: nein, es wird zurückgenommen und gemeldet.

Der Plan unten steht unter diesen sechs Annahmen. Fällt eine anders aus, ändern sich K1, K4 oder K8 — der Rest nicht.

### C1 · Die Schritte

Jeder Schritt ist ein eigener Commit und endet mit einem Test, der vorher rot war. Bis einschließlich K3 ändert sich am Verhalten der Produktion NICHTS.

| # | Schritt | Schicht | berührte Dateien | Art | Halbtage |
|---|---|---|---|---|---|
| **K1** | **Das Kommando wird ein Wert, die Auswertung eine Funktion.** Schema `{schema: 1, id, werkzeug, ziel, neu, werte, zug, wer, wann}` mit `pruefeKommando`; `werteAus(kommando, {subjektVon}) → {schritte, grund}` ruft das unveränderte `anwenden`; die Kennung neuer Objekte kommt aus `kommando.neu` statt aus `neueGlobalId()` im Werkzeug; `useBearbeitung.fuehreAus(kommando)`, und `ausfuehren` baut aus seinem Zustand ein Kommando und ruft es. **Prüfbar:** für alle 58 Werkzeuge dieselben Schritte wie vorher (Goldstandard nach dem Muster `test/hilfen/werkzeugGold.js`); `fuehreAus({werkzeug:'schacht-zeichnen', neu:['cde-A'], …})` schreibt den Eintrag mit genau dieser Kennung. | L3 | neu `services/kommando/Kommando.js`, `services/kommando/Auswertung.js`; `services/Bearbeitungen.js` (Zeichenwerkzeug nimmt die Kennung aus dem Kontext), `services/Bauteilrezepte.js` (`ableitungsSchritte` ebenso), `stores/useBearbeitung.js`; Test `kommando.test.js` | Kern | 2 |
| **K2** | **Ganz oder gar nicht, mit Version.** `useAenderungen.eintragenVorgang(liste, {kommando})`: alle prüfen, alle anhängen, EINMAL sichern, bei Fehler alle wieder heraus und den Grund melden; das Kommando liegt als Beleg am ersten Eintrag des Vorgangs (nur Einträge überleben das Laden eines alten Clients unverändert — Commits baut `_uebernimmV2` aus einer festen Feldliste neu, `useAenderungen.js:738-746`); `_ladeEbene` macht aus unbekannter `version` ein „nur lesen". Dieselbe Funktion für `entferneVorgang`, `rebaseAuf`, den Längsschnitt-Zug. **Prüfbar:** wirft der dritte von vier Schritten, ist das Journal unverändert und nichts wurde gesichert; ein vierteiliger Vorgang löst EIN Sichern aus (vorher vier). | L3 | `stores/useAenderungen.js`, `stores/useBearbeitung.js`, `components/LaengsschnittCanvas.vue`; Tests `kommandoAtomar.test.js`, Anpassung `test/journalPfade.test.js` | Kern | 2 |
| **K3** | **Das Subjekt eines EIGENEN Bauteils ohne Viewer.** `subjektAusStand(globalId, {stand, hoehenversatz})` liefert dieselbe Gestalt, die heute `components/IfcViewer.vue` zusammenträgt (`stand.bauplan`, `achse` aus der Netzprojektion des Rezepts, `category`, `eigen`, `knotenImNetz` aus `cdeAchsenAus`); der Viewer ruft für eigene Bauteile dieselbe Funktion — ein Ort. **Prüfbar:** für eine eigene Haltung ist das Subjekt aus dem Stand feldgleich mit dem des Viewers (Fixture). | L3 | neu `services/kommando/Subjekt.js`; `components/IfcViewer.vue`; Test `subjektAusStand.test.js` | Kern | 2 |
| **K4** | **Die Sohlhöhe einer eigenen Haltung ist echt.** Der Setzer `mass` unterscheidet: geliefert → Forderung wie bisher; eigen → neuer Bauplan über `neuePunkteFuerZug`. Der Bauplan einer Kante nennt seinen `achsbezug`; die Netzkante gibt ihn weiter. Der Längsschnitt-Zug ruft dasselbe Werkzeug über `fuehreAus` (U6 für diesen Fall zu). **Prüfbar:** `sohlhoehen-setzen` an der eigenen Haltung ändert `parameter.punkte`, die Netzkante und den Befund; am gebauten Rohrkörper liegt der tiefste Punkt auf der kommandierten Sohlhöhe (± 1 mm); `test/sohlhoehen.test.js` (geliefert) bleibt unverändert grün. | L2/L3 | `services/Bearbeitungen.js` (`SETZ_OPERATIONEN.mass`), `services/rezept/Rezeptbau.js`, `services/rezept/Geometriebau.js`, `services/LaengsschnittSicht.js`, `components/LaengsschnittCanvas.vue`; Test `sohleEigen.test.js` | Kern | 3 |
| **K5** | **Ein Gefälle, eine Funktion.** `gefaellePromille(achse)` gegen die waagerechte Länge, gelesen von Befunden, Achsbeschriftung, Längsschnitt und Vorschau. **Prüfbar:** Zahlengleichheit mit den vier alten Rechnungen auf Zufallsachsen. | L0/L1 | `services/geometrie/Stationierung.js` (oder `Achsbezug.js`), `services/Befunde.js`, `services/AxisAnnotations.js`, `services/LaengsschnittSicht.js`, `services/Vorschau.js` | Kern | 1 |
| **K6** | **Markierung ohne Engine.** `pruefeStand({stand, geloescht, typprofilFuer, regelwerk})` → Befunde je Kennung fürs eigene Netz (`cdeAchsenAus` → `baueNetz` mit der Toleranz aus dem Regelwerk → `befundeFuer` + `befundeFuerNetz`); `pruefeAlles` ruft es EINMAL ausserhalb der Modellschleife (behebt „ohne Lieferung nichts, mit zweien doppelt"); Abfrage `befundeVon(globalId)`. **Prüfbar:** eigenes Netz ohne jedes gelieferte Modell wird geprüft; mit zwei Lieferungen steht jede eigene Haltung einmal in der Liste. | L3 | neu `services/Prueflauf.js`; `services/engine/Pruefliste.js`, `services/engine/Netzabfragen.js` (Toleranz), `stores/useBearbeitung.js`; Test `prueflauf.test.js` | Kern | 2 |
| **K7** | **Der Abnahmetest — nur Kommandos** (C2). Noch mit zusammenfallenden Koordinaten. | Test | neu `test/durchstichAchse.test.js` (Umgebung `node`, kein DOM) | Kern | 1 |
| **K8** | **Verknüpfung statt Zufall.** Ein Zugpunkt darf `{knoten: guid}` sein (Musterschicht, fachblind über `netzrolle: 'knoten'`); der Bauplan trägt `anschluss: {anfang, ende}`; das Netz nimmt die deklarierte Verknüpfung zuerst, die Koinzidenz als Rückfall (Geliefertes); weichen beide ab → Befund. Kopieren/Reihe/Spiegeln nehmen die Verknüpfung NICHT mit. **Prüfbar:** der Abnahmetest nennt die Schächte statt ihrer Koordinaten; ein um 5 cm verschobener Schacht ergibt `anschluss_abweichend` statt eines stillen losen Endes. | L1–L3 | `services/rezept/Eingebaut.js`, `services/rezept/Rezeptbau.js`, `services/eigenschaften/Eigenschaftsarten.js`, `services/Bearbeitungen.js`, `services/Netztopologie.js`, `services/Befunde.js`, `services/katalog/Katalogschema.js` | Kern | 3 |
| **K9** | **Wegwerf-Oberfläche.** Ein Feld „Kommando absetzen" (JSON → `fuehreAus`) mit der Liste der Markierungen, nur im Entwicklungsmodus; dazu `fang: 'knoten'` am erzeugten Zeichenwerkzeug für Rezepte mit `netzrolle: 'kante'`, damit der gezeichnete Punkt als `{knoten}` ankommt. | L5 | neu `components/dev/KommandoKonsole.vue`; `services/Bearbeitungen.js` (eine Deklaration) | Wegwerf (Konsole) · Kern (Fang) | 1–2 |

Summe: **17–18 Halbtage** — K3 und K8 mit der größten Unschärfe (siehe „Nicht geprüft" in C4). Nicht im Durchstich, weil das Abnahmekriterium es nicht verlangt: Redo, Strg+Z, die übrigen Direktschreiber (U6), die 13 journalfreien Datenarten (E4), Operationen mit eigener Kennung (E3, A4).

### C2 · Die Prüfung ohne Oberfläche

Höhenversatz 0, eingebautes Regelwerk, kein geliefertes Modell.

| # | Kommando | erwartet |
|---|---|---|
| 1 | `schacht-zeichnen`, `neu: ['cde-A']`, Punkte (0 \| 100,00 \| 0) und (0 \| 102,50 \| 0), DN 1000 | 1 Eintrag, Kennung `cde-A`; Knoten bei Sohle 100,00 |
| 2 | `schacht-zeichnen`, `neu: ['cde-B']`, (30 \| 99,85 \| 0) und (30 \| 102,40 \| 0) | Knoten bei Sohle 99,85 |
| 3 | `rohr-zeichnen`, `neu: ['cde-H']`, Zug A → B (K7: Koordinaten, K8: `{knoten:'cde-A'}`, `{knoten:'cde-B'}`), DN 300, Sohle 100,00 → 99,85 | Gefälle 0,15 m / 30 m = **5,0 ‰** ≥ 1000/300 = 3,33 ‰ → **keine** Markierung; kein loses Ende, kein Schacht ohne Anschluss |
| 4 | `sohlhoehen-setzen`, `ziel: ['cde-H']`, Ende := 99,91 | **3,0 ‰** < 3,33 ‰ → `befundeVon('cde-H')` = genau ein Befund `gefaelle_zu_flach`, Wert „3.0 ‰", Grenze „mindestens 3.3 ‰", Quelle „Faustregel 1:DN". Das Kommando ist AUSGEFÜHRT (Eintrag im Journal), nicht abgelehnt |
| 5 | `sohlhoehen-setzen`, Ende := 99,88 | **4,0 ‰** → Markierung weg |
| 6 | Katalog: Büro-Regelwerk `gefaelleMindestPromille: 5` laden | dieselbe Haltung mit 4,0 ‰ ist wieder markiert, Quelle nennt das Büro — das Mindestgefälle steht im Katalog |
| 7 | Rückgängig (ein Schritt) | Stand wie nach Kommando 4; ein Schritt, nicht mehrere |

Dazu: im Journal steht nirgends ein Gefälle und kein Netz (nur `rezept` + `parameter`); jedes Kommando trägt `schema: 1`; wirft die Auswertung von Kommando 3, ist das Journal wie nach Kommando 2.

### C3 · Die Stelle mit dem größten Risiko: K4 — was die Höhe einer eigenen Haltung bedeutet

Die Zahl `parameter.punkte[i].y` einer eigenen Haltung hat heute **zwei Lesarten**, am Code belegt:

- **Rohrmitte:** der Rohrkörper wird UM die Punkte gezogen (Kreisprofil um den Ursprung, `rezept/Geometriebau.js:186-190`); `formAus('linie')` sagt ausdrücklich `achsbezug: 'mitte'` (`rezept/Rezeptbau.js:86-93`) — so liest sie der Kanalgraben; der klassische Längsschnitt rechnet sie damit auf die Sohle um (`services/Laengsschnitt.js:25-33`).
- **Sohle:** die bearbeitbare Längsschnitt-Sicht nimmt dieselbe Zahl roh als Sohlhöhe (`services/LaengsschnittSicht.js:50-52`, Feld `geliefert: {hA, hE}`), und ihr Zug schreibt die gezogene SOHLhöhe in genau dieses y (`:205-221`). Die Netzkante trägt gar keinen Bezug (`Rezeptbau.js:150-153`, `IfcEngine.js:3176-3183`).

Wer heute im Längsschnitt die Sohle einer eigenen Haltung auf H zieht, bekommt im Raum ein Rohr, dessen Sohle bei H − DN/2 liegt. Das Gefälle merkt davon nichts (der Versatz kürzt sich heraus) — deshalb ist es bisher nicht aufgefallen.

**Die Annahme in K4:** der Bauplan einer Kante nennt seinen `achsbezug`; neue Haltungen schreiben `'sohle'`, der Rohrkörper wird um DN/2 angehoben gebaut; Baupläne ohne das Feld bleiben `'mitte'` und damit bitgleich.
**Wenn sie falsch ist** — etwa weil ein Leser das Feld nicht beachtet oder doppelt umrechnet —, liegt jede neue Haltung still um DN/2 daneben: 15 cm bei DN 300, ein halber Meter bei DN 1000. Das ist dieselbe Fehlerklasse wie Teil XXI E4 (Graben DN/2 zu tief), und sie zeigt sich in keinem Gefälletest. **Deshalb misst K4 am gebauten Körper** (tiefster Punkt des Netzes = kommandierte Sohlhöhe ± 1 mm) und am Kanalgraben über einer eigenen Haltung, nicht am Bauplan.

Zweites Risiko, kleiner: **K3.** Das Subjekt, das der Viewer zusammenträgt, ist gewachsen; weicht `subjektAusStand` in einem Feld ab, verhält sich ein Werkzeug ohne Oberfläche anders als mit. Gegenmittel: der Viewer ruft für eigene Bauteile dieselbe Funktion — dann gibt es die Abweichung nicht.

### C4 · Was heute realistisch ist, und wo ein sinnvoller Zwischenstand liegt

- **Heute (ein Arbeitstag = zwei Halbtage):** K1. Mit Glück der Anfang von K2.
- **Erster sinnvoller Zwischenstand — nach K1 + K2 (2 Tage):** die Naht existiert. Jede Bearbeitung läuft als Kommando mit Schemaversion durch EINE Funktion, atomar, mit der Absicht als Beleg im Journal — und die Produktion verhält sich wie vorher. Das ist der Stand, auf dem Auftrag 2 nicht mehr Papier ist.
- **Zweiter Zwischenstand — nach K7 (6½ Tage):** der Abnahmefall ist grün, ohne Oberfläche, noch mit zusammenfallenden Koordinaten. Ab hier ist der Rest (Verknüpfung, Wegwerf-Oberfläche) Ausbau.
- **Nicht geprüft — ehrlich benannt.** Die unabhängige Gegenprüfung dieses Plans ist am Sitzungslimit gescheitert; was folgt, habe nur ich gelesen: (1) wie groß die Anreicherung im Viewer wirklich ist und welche Felder auch für EIGENE Bauteile die Engine brauchen (`anker`, `oberkante`, `lageUmkehrbar`) — K3 kann 3 statt 2 Halbtage kosten; (2) ob `parameter.anschluss` an der Rezept-Feldliste des Katalogschemas, an `pruefeBauplan` oder an „Haltung teilen"/„Schacht verschieben" hängen bleibt (K8); (3) E7 ist am Code belegt, im Browser nicht nachgemessen. Jeder der drei Punkte ist die erste halbe Stunde des jeweiligen Schritts.
- **Voraussetzung für alles ab K4:** Fabios Entscheidung E7; für K8: E6. K1–K3 und K5–K6 hängen an keiner offenen Entscheidung außer E2.
- **Formatregel (Leitplanke 4 aus Teil XXIII):** K2 (Beleg am Eintrag, Feld `schema`) und K8 (`anschluss` im Bauplan) schreiben neue Felder ins Journal. Beide sind additiv: ein Client übernimmt Einträge als Ganzes (`useAenderungen.js:727-739`), und die Dateiverdichtung kopiert den Eintrag mit `{...e}` (`services/JournalFormat.js:119-134`) — ein zusätzliches Feld AM EINTRAG überlebt also. Ein Feld am Commit oder auf oberster Ebene überlebte NICHT (`_uebernimmV2` baut Commits aus einer festen Feldliste, `:741-746`; `_sichern` schreibt eine feste Nutzlast, `:685-709`). Deshalb liegt der Beleg am Eintrag. Vor dem ersten Schreiben trotzdem ein Test gegen den heute ausgelieferten Leser. K4 ändert die BEDEUTUNG eines Feldes für neue Baupläne: ein alter Client baute eine `'sohle'`-Haltung DN/2 zu tief. **K4 braucht deshalb zwei Auslieferungen** — erst der Leser, eine Auslieferung später das Schreiben von `'sohle'`.

---

Auftrag: [auftrag-3-plan-durchstich.md](auftrag-3-plan-durchstich.md)
