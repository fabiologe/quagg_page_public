# Fahrplan Teil XXV — Vokabular vor Ausbau (2026-09-20)

Eine Etappe ZWISCHEN Teil XXIV (Kommandodefinition, zu) und dem Ausweiten der Werkzeuge. Sie baut keine neuen Werkzeuge. Sie öffnet die Stellen, an denen ein neues Werkzeug heute den Kern anfassen müsste.

Stand des Codes: gemessen an HEAD `8559628`; während des Schreibens kam `9561102` dazu (XXIV-4, A0). 6 Commits vor `origin` (Durchstich 2 und XXIV-4: nicht gebaut, nicht gepusht). Zeilenangaben relativ zu `client/src/features/cde/`.

**Parallel läuft Teil XXIV-4** (Fabios Auftrag vom 2026-09-19 nachts, Plan `/root/.claude/plans/oki-wir-haben-bereits-sunny-scott.md`): Paket A — der Auflöser „Sollhöhe am Ort" für alle Geländeoperationen, Paket B — die Böschung folgt dem Planum, Teil C — die Untersuchung der zwei (drei) Vokabulare. Am 2026-09-20 07:56 UTC hat sie ihren Gefriertest committet (`9561102`: `test/sollhoehe.test.js` samt Fixture — der Stand VOR dem Umbau); der Umbau selbst steht also unmittelbar bevor. **Dieser Fahrplan plant nichts davon ein zweites Mal** und richtet sich an Teil C aus; wo er sich darauf stützt, steht es an der Stufe.

Grundlage sind drei Messungen vom 2026-09-19/20, alle im Gespräch belegt und hier nur zusammengefasst:

| Messung | Ergebnis |
|---|---|
| Reichweite des Kommandostroms | 63 von 63 Werkzeugen schreiben über `werteAus`; ohne Oberfläche laufen 38, 23 zielen auf Geliefertes (so entschieden), **2 scheitern an eigenen Zielen**: `flaeche-vereinigen`, `koerper-tauschen` |
| Werkzeugarchitektur, Kostenprobe | Rechteckkanal und Leitpfosten: 0 Zeilen Code. **Bordstein (seitlich versetztes Profil): nicht ausdrückbar**, und `versatzU` besteht die Schemaprüfung und wird still ignoriert (Profil bleibt bei ±0,075 m) |
| Durchstich 2, Soll gegen Ist | teilweise bestanden: die Zielart ist Code je Operation, fünf Faltstellen ohne eine Faltfunktion, Planum und Böschung tragen je ihre eigene Höhe |

## 0 · Was die Etappe leisten muss — die Abnahme

Die Kostenprobe noch einmal, diesmal als eingecheckter Test mit Zahlen. Die Etappe ist zu, wenn:

| # | Kriterium | heute | danach |
|---|---|---|---|
| A1 | Ein Bordstein ist ein JSON im Projekt-Repo: Achse, Rechteckprofil, seitlich versetzt. Gemessen am gebauten Körper | nicht ausdrückbar | 0 Zeilen Code, Körper liegt neben der Achse |
| A2 | Ein unbekannter Schlüssel in `geometrie` oder `geometrie.profil` wird abgelehnt | `ok: true`, still ignoriert | `ok: false` mit Satz |
| A3 | Werkzeuge, die ohne Oberfläche laufen | 38 von 63 | 40 von 63; die 23 übrigen mit dem Grund „geliefert" |
| A4 | Stellen in `SETZ_OPERATIONEN`, die selbst einen Bauplan fortschreiben (`erzeugtEintrag`) | 3 (`parameter`, `mass.amBauplan`, `vorgangsmass`) | 1 |
| A5 | „Vorgang entfernen" ist ein Katalogwerkzeug | Store-Funktion mit Systembeleg | Katalog 63 → 64, Beleg ist ein Kommando |
| A6 | Subjektfelder, die nur der Viewer kennt | 6 | 3 (`gelaendeQuellen`, `koerperQuellen`, `quellmass` — sie kommen aus gelieferter Geometrie und bleiben) |
| A7 | Rechteckkanal bleibt 0 Zeilen (Regressionsschutz) | einmalige Probe | Test |

## 1 · Die Stufen

Jede Stufe ist ein eigener Commit und endet mit einem Test, der vorher rot war, plus Gegenprobe. (C1 aus dem Durchstichplan wurde in Teil XXIV verletzt — K1 bis K10 lagen in einem Commit. Diesmal je Stufe einer.)

| # | Stufe | Halbtage | Dateien | Prüfbar | Entscheidung |
|---|---|---|---|---|---|
| **V0** | **Basiszahlen einfrieren.** Die beiden Wegwerf-Läufe aus dem Gespräch werden Tests: `test/reichweite.test.js` (jedes Katalogwerkzeug mit frischem Journal über `fuehreAus` ohne `subjektVon`; erwartet heute 38 / 23 / 2, die Listen namentlich) und `test/kostenprobe.test.js` (Fälle a–f; b heute als „nicht ausdrückbar" festgehalten). Proben aus `test/hilfen/werkzeugProben.js`. Dazu Wächter W9: Subjektfelder, die Werkzeuge lesen und `subjektAusStand` nicht liefert (heute 6, Ratsche). | 0,5 | 2 neue Tests, `test/architekturWaechter.test.js` | die drei Zahlen stehen im Test, nicht im Chat | — |
| **V1** | **Das Loch im Schema schließen.** `pruefeEintrag('rezept')` prüft die Schlüssel des Rezepts (`REZEPT_SCHLUESSEL`, `services/katalog/Katalogschema.js:45`) und der Felder (`:50`), aber nicht die in `geometrie` und `geometrie.profil` (`:153-176`). Erlaubte Schlüssel je Geometrieart und je Profilart als Liste neben `GEOMETRIE_ARTEN` / `PROFIL_ARTEN` (`services/rezept/Rezeptbau.js:32-44`). **Vorher lesen, nicht schreiben:** die Rezept-Schlüssel in den Repos von 42069 und im Büro — ein Bibliotheksrezept mit einem bisher geduldeten Fremdschlüssel würde sonst still inaktiv. | 0,25 | `Katalogschema.js`, `Rezeptbau.js`, `test/katalogschema.test.js` | `versatzU` an `rechteck`: heute `ok: true` → `ok: false`; Anzahl betroffener Repo-Rezepte gezählt (erwartet 0) | — |
| **V2** | **Das Profil darf neben der Achse sitzen — und frei sein.** (a) `versatzU` / `versatzV` an JEDER Profilart, als Zahl oder Feldname; umgesetzt an EINER Stelle in `profilAus` (`services/rezept/Geometriebau.js:199`). Das deckt den Bordstein. (b) Profilart `polygon` mit `punkte: [[u, v], …]` (fest in der Deklaration, Einheit wie bisher) für Hochbord mit Fase, Eiprofil, Rinne. **Mitzunehmen:** `rohrscheitel` rechnet `Sohle + 2 × (Mitte→Sohle)` (`services/Achsbezug.js:117`) — das stimmt nur für symmetrische Profile. Die Form einer Kante nennt deshalb neben `sohlabstand` auch `profilhoehe` (`Rezeptbau.js:156-161`, aus `max v − min v`), und `rohrscheitel` nimmt sie. `_sohlen.abstand` rechnet schon aus `min v` (`Rezeptbau.js:72-75`) und braucht nichts. Kein Leser außerhalb von Rezeptbau/Geometriebau fasst `geometrie.profil` an (gegrept) — alle gehen über `sohlabstand`. | 1 | `Rezeptbau.js`, `Geometriebau.js`, `geometrie/ops/Sweep.js`, `Achsbezug.js`, `Katalogschema.js`; Tests `rezeptDeklaration.test.js`, `sohleEigen.test.js` | A1: Bordstein-JSON, quer von z = 0 bis z = 0,15 statt ±0,075; Eiprofil als Polygon: tiefster Punkt = Sohle ± 1 mm, Scheitel = Sohle + Profilhöhe; Rechteckkanal und Rohr bitgleich (A6-Gold) | E10, E11 |
| **V3** | **Ein Auflöser im Kommandokontext.** `werteAus` kennt heute `subjektVon`, `bauplanVon`, `knotenVon` (`services/kommando/Auswertung.js:41-44`). Dazu kommen `objektVon(id)` (ein eigenes Bauteil aus dem Stand: Bauplan plus das, was `subjektAusStand` liefert) und `vorlageVon(id)` (die geladene Bibliothek). Die Werkzeuge fragen den Kontext statt einer Liste am Subjekt: `flaeche-vereinigen` sucht heute in `el.eigeneFlaechen`, `koerper-tauschen` in `el.vorlagen`. Das FORMULAR braucht weiter Kandidaten: `optionen: (el) => …` wird eine Angabe `optionenAus: 'eigene:flaeche'` bzw. `'vorlagen'`, und `felderFuer` (`services/Bearbeitungen.js`, `optionen`-Auflösung) fragt `kandidatenVon(art)` — dieselbe Quelle für Formular und Auswertung. `subjektAusStand` liefert zusätzlich `erdbau` (rein aus dem Journal: `erdbauStandVon`), die drei Anreicherungen im Viewer (`components/IfcViewer.vue:1304-1306`, `:1329-1337`) entfallen. Die Vorlagen sind ein Repo-Lesen: `useBearbeitung.ladeProfile` (`stores/useBearbeitung.js:226`) lädt sie mit dem Katalogstand, `fuehreAus` bleibt synchron im Kern. Kein Journalformat ändert sich. | 2 | `Auswertung.js`, `kommando/Subjekt.js`, `stores/useBearbeitung.js`, `Bearbeitungen.js` (zwei Werkzeuge, `felderFuer`), `IfcViewer.vue`; Test `reichweite.test.js`, `subjektAusStand.test.js`, Fixture `viewerSubjekt-2026-09-19.json` | A3: 38 → 40; A6: 6 → 3; `optionen`-Funktionen im Katalog 5 → 3 (die drei Ableitungen lesen Engine-Kandidaten und bleiben); Viewer-Fixture feldgleich | — |
| **V4** | **Ein Bauplan-Schreiber.** Drei Setzer schreiben heute je für sich einen neuen `erzeugtEintrag` unter derselben Kennung: `parameter` (`Bearbeitungen.js:639-660`, mit Sohlen-Erhalt), `mass` im Zweig `amBauplan` (`:526-570`, über die Fähigkeit `sohlen`) und `vorgangsmass` (`:571-581`, über `_erdbauMassSchritte`). Gemeinsam wird `bauplanFortschreiben(el, aendere)`: Plan lesen, ändern, Sohlen erhalten, denselben Eintrag bauen. Der Beleg für die Kosten: `vorgangsmass` (Commit `82b8310`) brachte 11 Zeilen Registry, aber 117 Zeilen in `Bearbeitungen.js`. **Umfang nach E12:** klein = nur der gemeinsame Helfer; groß = Setzer-Art `bauplan` mit `pfad` (flach `'dn'`, verschachtelt `'operationen[op].parameter.<feld>'`) und `faehigkeit`, womit `parameter` und `vorgangsmass` Deklarationen derselben Art werden. **Teil C von XXIV-4 hat dieselben drei Setzer untersucht („eine benannte Zahl setzen — dreimal") und empfiehlt ABWARTEN:** ein Zusammenlegen dreht den A6-Goldstandard und `KUREN`, ohne dass ein Fall es verlangt; fällig wird es, wenn eine zweite Werkzeugfamilie Zahlen an Operationen setzt. Der kleine Umfang verträgt sich damit (keine Deklarationsform ändert sich), der große nicht. | 0,5 (klein) / 1,5 (groß) | `Bearbeitungen.js`, `test/werkzeugGold` bleibt unverändert | A4: 3 → 1; A6-Gold und `werkzeugProben` bitgleich (kein gespeicherter Bauplan ändert sich); groß: `SETZ_OPERATIONEN` 8 → 7 | E12 |
| **V5** | **„Vorgang entfernen" wird ein Katalogwerkzeug.** Heute `useBearbeitung.entferneVorgang` (`stores/useBearbeitung.js:905`) mit Systembeleg `system:vorgang-entfernen` — dabei ist es eine Nutzerabsicht. Die Rechnung ist schon rein (`Bauteilrezepte.vorgangEntfernenSchritte`, `:875`), sie braucht den Stand der Ableitung; den reicht der Kontext aus V3 herein. Ziel: ein Teil der Ableitung; der Knopf im Änderungen-Reiter geht über `useKommandoweg`. | 0,5 | `Bearbeitungen.js`, `stores/useBearbeitung.js`, `composables/useKommandoweg.js`, Aufrufer des Knopfs | A5: Katalog 63 → 64; Systembeleg-Stellen 11 → 10; ohne Oberfläche: ein Kommando entfernt Aushub, Auftrag und DGM in einem Vorgang, ein Rückgängig bringt alle drei | — |
| **V6** | **Tote Wörter.** (a) `art:` steht in 50 Katalogeinträgen und hat keinen Leser (gegrept: weder Zugriff noch Destrukturierung) — streichen. (b) `useAenderungen.eintragen` (`stores/useAenderungen.js:819`) schreibt ohne Beleg, hat null Aufrufer und steht im Rückgabeblock — aus dem Export nehmen. (c) `ebene` im Kommandoschema setzt kein Produktionsweg — nach E16 behalten mit Test oder streichen. (d) `nameAusMuster` (`Bearbeitungen.js:350`) nimmt nur eine einstellige Breite: `{n:3}` ergibt 002, `{n:03}` bleibt als Text stehen und landet als Name am Bauteil; die A6-Probe `H-{n:03}` friert genau diesen Fall ein — nach E15. (e) Die Hygiene aus Teil C von XXIV-4: die rund 19 Schlüssel der Registry `GELAENDE_OPS` stehen nur in einem Kommentar (`services/gelaende/Operationen.js:866-901`) — als eingefrorene Tabelle mit Text wie `EIGENSCHAFTSARTEN`, dazu der Selbsttest „jeder Schlüssel hat einen Leser"; und `Rezeptbau.liefert` (`services/rezept/Rezeptbau.js:285`) hat außer Tests keinen Leser — Leser geben oder streichen. **(e) erst, wenn Paket A und B durch sind** — dieselbe Datei. | 0,75 | `Bearbeitungen.js`, `stores/useAenderungen.js`, `kommando/Kommando.js`, ggf. `test/hilfen/werkzeugGold.js` | `grep -c "^        art: '"` 50 → 0; Export `eintragen` weg, Suite grün | E15, E16 |
| **V7** | **Die Zielfläche dient mehr als einem Paar** — der Katalogbeweis NACH Teil XXIV-4. Den Auflöser `sollhoeheAn` (Durchstich-2-Befund „die Zielart ist Code je Operation") und die Böschung, die dem Planum folgt (gemessen 101,5 gegen 101), baut die parallele Sitzung als Paket A und B — **nicht hier.** Übrig bleibt der Beweis, dass eine weitere Zielfläche danach eine Deklaration ist: `gerinne` bekommt `flaeche(p)` am Eintrag (`services/gelaende/Operationen.js:1044`), 15–20 Zeilen mit derselben Interpolation wie `gerinne()` (`:224-262`, `_anAchse`). Heute hat nur `planum` eine Fläche (gemessen: `flaecheVon(gerinne)` ist null), und nur `auffuellen.bis` benutzt die Adressart `stapeloperation`. | 0,5 | `gelaende/Operationen.js`; Tests `opRegistry.test.js`, `durchstichAuffuellung.test.js` | Operationen mit Zielfläche 1 → 2; „Auffüllen bis zur Gerinnesohle" als Kommando: Auftrag > 0, Sohle am Ort = interpolierte Gerinnesohle ± 1 mm | E13; **erst nach Paket A** |
| **V8** | **Katalogverlauf — nur die Vorbereitung.** `speichereVorlage` / `loescheVorlage` (`services/Bibliothek.js:75-96`), `speichereRezept` / `loescheRezept` (`:211-231`) und die Bauformregel aus dem Entwurf (`stores/useBearbeitung.js:300`) schreiben direkt ins Repo: kein Beleg, kein Rückgängig (E4 verlangt einen eigenen Katalogverlauf). Der Verlauf selbst ist eine eigene Etappe (geschätzt 4–6 Halbtage). Hier nur: EIN Schreibweg `katalogSchreibe(art, id, vorher, nachher, wer)`, durch den alle gehen — damit der Verlauf später an einer Stelle ansetzt. | 0,5 | `services/Bibliothek.js`, `services/katalog/Katalog.js`, `stores/useBearbeitung.js` | Direkte Repo-Schreiber für Katalogdaten: heute 5 (vier in `Bibliothek.js`, einer im Store) → 1 | E14 |
| **V9** | **Abnahme.** `kostenprobe.test.js` und `reichweite.test.js` mit den neuen Zahlen (A1–A7). Browserprobe nur auf `:3001`, Projekt 42069: Bordstein aus der Bibliothek zeichnen, Lage des Körpers messen; „Fläche vereinigen" und „Körper tauschen" über die Konsole als Kommando. CDE-Suite und Client-Suite mit Zahl. Build über `dist_neu` nach `find … -newer dist`, Commit je Stufe ist dann schon geschehen, Push auf Zuruf. Doku: 7a-Nachtrag, README, dieser Fahrplan mit Abschnitt „Soll gegen Ist". | 1 | Tests, `docs/cde/kommando/*` | A1–A7 erfüllt; Suite vorher 295 Dateien / 3 249 Tests | Build, Push |

**Summe Pflicht (V0–V6, V9, V4 klein): 6,5 Halbtage.** Dazu nach Entscheidung V7 (0,5) und V8 (0,5). Volle Etappe: **7,5 Halbtage** — der Auflöser und die Böschung (2–3 Halbtage) liegen in Teil XXIV-4 und zählen hier nicht. V4 groß (+1) nur gegen die Empfehlung aus Teil C.

## 2 · Reihenfolge und Abhängigkeiten

```
V0 ─▶ V1 ─▶ V2                    (Profil; unabhängig vom Rest)
V0 ─▶ V3 ─▶ V5                    (Auflöser; V5 braucht den Kontext aus V3)
             V3 ─▶ V4             (beide fassen Bearbeitungen.js an — nacheinander)
XXIV-4 Paket A ─▶ V7 ─▶ V6 (e)     (dieselbe Datei wie die parallele Sitzung — erst danach)
V6 (a)–(d) jederzeit nach V4 · V8 jederzeit · V9 zuletzt
```

Wenn gekürzt werden muss: V1, V2 und V3 sind der Kern — sie schließen die zwei Lücken, an denen heute ein Werkzeug scheitert. V4 klein und V5 sind billig und räumen auf. **Anfangen lässt sich sofort und ohne Berührung mit der parallelen Sitzung:** V0, V1, V2 fassen `Katalogschema.js`, `Rezeptbau.js`, `Geometriebau.js`, `Sweep.js`, `Achsbezug.js` an — XXIV-4 arbeitet in `gelaende/Operationen.js` und den Ableitungen. V3 und V4 fassen `Bearbeitungen.js` an; vorher prüfen, ob Paket B dort schon geschrieben hat.

## 3 · Leitplanken

- **Kein Journalformat ändert sich.** V2 fügt Wörter in REZEPT-Deklarationen hinzu (Repo-JSON), nicht in Baupläne. Ein älterer Client lehnt ein Bibliotheksrezept mit `polygon` oder `versatzU` ab (nach V1 sogar ausdrücklich); dessen Bauteile melden dort „Rezept fehlt" und werden übersprungen, nie gelöscht (A5). Das ist gewollt, gehört aber in den 7a-Nachtrag. `mindestClient` bleibt 4.
- **Gespeicherte Baupläne bleiben bitgleich.** V4 ist ein Umbau des Schreibers, nicht des Geschriebenen: A6-Gold und die 63 Proben aus R4 sind der Beweis.
- **Die Musterschicht bleibt fachblind** (W6): `optionenAus` nennt Arten wie `'eigene:flaeche'` über die Bauform, nie „Bordstein" oder „Schacht".
- **Zweite Sitzung — heute konkret:** Teil XXIV-4 schreibt in `gelaende/Operationen.js`, `ableitung/*` und deren Tests. Vor jeder Stufe `git status`; fremde ungetrackte Dateien nie anfassen, nie mitcommitten (`git add` nur mit Pfaden). V7 und V6 (e) warten, bis Paket A und B committet sind. Tests im Zweifel auf einem sauberen Worktree von HEAD.
- Wie immer: kein `npm run build` zum Prüfen, `:3000` nicht anfassen, nur 42069, Commit und Push nur auf Zuruf.

## 4 · Entscheidungen vorab

| # | Frage | Empfehlung |
|---|---|---|
| **E10** | V2: Versatz an jedem Profil UND Profilart `polygon` — oder nur eines? | Beides. Der Versatz allein löst den Bordstein, das Polygon die nächsten drei Formen; zusammen ein Halbtag. |
| **E11** | Ein Bordstein im LAGEPLAN: Linie auf der Achse oder die versetzte Kante? Der Lageplan zeichnet aus den Punkten, er kennt kein Profil. | Achse, jetzt. Die versetzte Kante ist Plandarstellung und gehört nicht in diese Etappe. |
| **E12** | V4 klein (gemeinsamer Helfer) oder groß (Setzer-Art `bauplan` mit Pfad)? | Klein. Teil C von XXIV-4 kommt unabhängig zum selben Schluss: zusammenlegen erst, wenn eine zweite Werkzeugfamilie Zahlen an Operationen setzt. |
| **E13** | V7 (Gerinnesohle als zweite Zielfläche) in diese Etappe? | Ja, als letzter Baustein nach Paket A — ein halber Tag, und er beweist, dass der Mechanismus aus Durchstich 2 nicht nur einem Paar dient. |
| **E14** | V8: Katalogverlauf jetzt, nur vorbereiten, oder ganz später? | Nur vorbereiten. Der Verlauf selbst ist eine eigene Etappe nach dem Ausweiten. |
| **E15** | `{n:03}`: den Platzhalter öffnen (`\d+`) und die eingefrorene A6-Probe bewusst ändern — oder nur dokumentieren? | Öffnen. Heute schreibt ein plausibler Tippfehler das Muster als Namen ans Bauteil, ohne Meldung. |
| **E16** | `ebene` im Kommandoschema: behalten (für Skripte) oder streichen? | Behalten, mit einem Test, der ein Kommando auf die Auftragsebene schreibt — sonst ist es ein Feld ohne Beweis. |

## 5 · Was bewusst NICHT in dieser Etappe liegt

- **Der Auflöser „Sollhöhe am Ort" und „die Böschung folgt dem Planum"** — Teil XXIV-4, Paket A und B, parallele Sitzung. Ebenso das ZUSAMMENFÜHREN der Vokabulare (Eigenschaftsarten, Rezeptfähigkeiten, Registry): Teil C empfiehlt abwarten und nennt die drei Auslöser.
- **Neue Werkzeuge.** Bordstein, Rechteckkanal, Rinne, Leitpfosten-Reihen kommen danach — als Daten. Der Bordstein erscheint hier nur als Abnahmefall.
- **Die 23 Werkzeuge mit geliefertem Ziel ohne Oberfläche.** Ein geliefertes Bauteil lebt in seiner Datei (K3, E5). Ein Subjekt aus einem Schnappschuss des Modells wäre ein eigenes Thema.
- **Die 27 handgeschriebenen `anwenden`.** Sie hängen an Eigenschaften, nicht an Namen (W7); sie in Daten zu überführen, lohnt erst, wenn ein zweites Werkzeug dieselbe Rechnung braucht.
- **Der Katalogverlauf selbst** (E4), **`neu` als Eingabe in der Oberfläche** (E2 gilt, die Oberfläche nimmt weiter ihren Kennungsgeber), **Plandarstellung versetzter Profile**, **CI**.

---

Aufträge und Grundlagen: [README](README.md)

---

## 6 · Soll gegen Ist (nach dem Bauen, 2026-09-20)

Gebaut auf Fabios „lets go mit dem Ausführen des Plans". Je Stufe ein Commit, jeder mit einem Test, der vorher rot war.

| # | Commit | Soll | Ist |
|---|---|---|---|
| V0 | `7ca84d6` | Zahlen einfrieren | `test/reichweite.test.js` (38/23/2), `test/kostenprobe.test.js` (6 Fälle), Wächter W9 |
| V1 | `4ac6c22` | Schema-Loch | Jede Art nennt ihre Schlüssel (`masse`/`weitere`); zwei Sonderzweige fielen weg (Stab.laenge, Platte.dicke sind jetzt `masse`) |
| V2 | `2911fd8` | Profil neben der Achse | `versatzU`/`versatzV` an jeder Art, Profilart `polygon`, dazu `profilhoehe` — siehe unten |
| V3 | `d50ef3a` | Auflöser im Kontext | `kommando/Kandidaten.js`, zwei Arten; Bibliothek gehört zum Katalog |
| V4 | `ce5ac6f` | ein Bauplan-Schreiber | **2 → 1, nicht 3 → 1** — siehe unten |
| V6 | `ce5ac6f`, `2275453` | tote Wörter | Namensmuster kuriert, `ebene` bewiesen, Einzelschreiber bewacht, `art` begründet stehen gelassen |
| V7 | `39e8de7` | zweite Zielfläche | `gerinne.flaeche(p)`; die Punktrechnung EINMAL (`_gerinneSoll`) |
| V8 | `3fcee7b` | ein Katalog-Schreibweg | `katalog/Katalogablage.js`, 6 → 0 Umgehungen |
| V5 | — | „Vorgang entfernen" als Werkzeug | **nicht gebaut** — siehe unten |

### Die Abnahme

| # | Kriterium | vorher | nachher |
|---|---|---|---|
| A1 | Bordstein als JSON | nicht ausdrückbar | quer von z = −0,15 bis 0 statt ±0,075, Höhe unverändert |
| A2 | unbekannter Schlüssel im Profil | `ok: true`, still ignoriert | `ok: false` mit Vorschlag, Rezept nicht aktiv |
| A3 | ohne Oberfläche ausführbar | 38 von 63, 2 offen | **40 von 63, 0 offen** |
| A4 | Setzer, die einen Bauplan schreiben | 2 | 1 |
| A5 | „Vorgang entfernen" als Katalogwerkzeug | Store-Funktion | unverändert, mit Grund |
| A6 | Subjektfelder nur vom Viewer | 6 | **3** |
| A7 | Rechteckkanal = 0 Zeilen | einmalige Probe | Test |

Suite nach V8: CDE 301 Dateien / 3 365 Tests grün, ganze Client-Suite 451 Dateien / 4 869 Tests grün (6 übersprungen).

### Wo es anders kam als geplant

**V5 fällt aus, und das ist ein Befund.** Der Plan nahm an, „Vorgang entfernen" brauche nur den Stand seiner Ableitung, und den reiche der Kontext aus V3 herein. V3 hat aber einen KANDIDATEN-Auflöser gebaut: er beantwortet „welche anderen Objekte kommen für dieses Werkzeug in Frage". `vorgangEntfernenSchritte` braucht etwas anderes — den ganzen eigenen Stand: alle Teile der Klammer, alle Anzeige-Bauteile, die sie in ihrer Vorgangsliste nennen, und ob das Ur-Gelände ausgeblendet ist. Das in die Kandidatenform zu biegen hieße, dem Vokabular eine Bedeutung zu geben, die es nicht hat; ein `standVon()` im Kommandokontext wäre die Tür, durch die ein Werkzeug das ganze Modell sieht — genau die Grenze, die der Katalog seit jeher hält (ein Werkzeug bekommt ein Subjekt, nicht das Modell). Der heutige Weg trägt einen Systembeleg und die Modus-Sperre. **Fällig wird es, wenn ein zweites Werkzeug den ganzen Stand braucht** — dann ist die Frage „wie sieht ein Werkzeug mehr als sein Subjekt?" zu beantworten, nicht vorher.

**V4 ist 2 → 1, nicht 3 → 1.** „Mass am Vorgang" (`vorgangsmass`) schreibt keinen Bauplan, sondern einen ganzen Erdbau-Vorgang mit allen Teilen. Andere Form, kein Sonderfall. Steht als Grund am Helfer.

**V2 hat einen Fehler mitgenommen, den es sonst verursacht hätte.** `rohrscheitel` rechnete den Scheitel als Sohle plus zweimal dem Abstand zur Sohle — richtig für jedes Profil, das um seine Achse symmetrisch ist, und das waren bis V2 alle. Die Kernel-Form nennt deshalb ihre `profilhoehe`. Dabei gefunden: `Number(null)` ist 0, nicht NaN — eine Achse, die das Feld mitführt, aber nicht kennt, hätte ihren Scheitel auf der Sohle gehabt und die Überdeckung wäre um r zu gross gewesen. Gefangen hat das der Überdeckungstest in `sohleEigen.test.js`, nicht das Lesen.

**Die Versatzrichtung ist gemessen, nicht gerechnet:** positiv ist LINKS in Zeichenrichtung (Achse nach Osten legt +1 m auf z − 1, nach Süden auf x + 1, nach Westen auf z + 1). Steht in der Deklaration.

**Drei eingefrorene Vergleiche mussten nachziehen**, jeder benannt und begründet: der Goldstandard vor A4 und die Viewer-Fixture tragen das additive `profilhoehe` aus; die Fixture trägt zusätzlich `erdbau.operationen` aus, das NICHT von hier kommt, sondern von Durchstich 2 (S2). Und der Goldstandard der Werkzeuge hielt einen Fehler fest — „H-{n:03}" als Name —, die zwei Werte sind korrigiert.

### V9 — die Browserprobe, der Build, der Push (2026-09-20)

**Die Browserprobe fand sofort einen Fehler, den kein Test sah.** Beim ersten Lauf blieb die Seite schwarz: `ReferenceError: Cannot access 'VORLAGEN_KEY' before initialization`. V8 hatte einen Importkreis gebaut — die Katalogablage holte ihren Schlüssel aus `Bibliothek.js`, während die Bibliothek über die Ablage schreibt. Vitest lädt in anderer Reihenfolge und hat ihn nie gesehen; in einem Test verdeckte eine Attrappe den Rest. Behoben (der Schlüssel gehört der Ablage), dazu **Wächter W10: kein Importkreis**, mit Gegenprobe.

Danach lief sie durch, auf `:3001`, Projekt 42069, ohne eine Zeile Code im Projekt zu ändern:

| | gemessen |
|---|---|
| Bordstein registriert | Schema `ok`, Werkzeug `bordstein-zeichnen` erscheint als siebtes in der Leiste |
| Formular | fünf Felder mit Vorgaben, Oberkante aus dem Gelände vorbelegt (247,428 m NN), `bereit` |
| gezeichnet | Bauplan `bordstein`, Achse von (0\|0) nach (10\|0) |
| **Körper** | **z von −0,150 bis 0,000** — der Stein liegt neben der Linie, links in Zeichenrichtung; Höhe 0,30 m |
| Flächen vereinigen | keine Liste am Subjekt, der Auflöser bietet genau die andere Fläche an |
| Tauschen | Bibliothek aus dem Katalog geladen (4 Vorlagen), angeboten wird nur `schacht-dn1000` — die zum Rezept |
| aufgeräumt | 4 Vorgänge entfernt, Journal von 42069 wieder leer (0 Commits, 0 Schritte), Konsole leer |

**Build:** `npm run build` wörtlich, atomar über `dist_neu` (das Skript tauscht selbst). Vorher geprüft: Platte 6 GB frei, 3,4 GB RAM verfügbar, Arbeitsbaum sauber, alle 48 Dateien neuer als der alte Build sind committet. Live seit 10:16 UTC: `CdeView-DyFVpNUk.js`, Schreibstufe 5, `polygon` und `versatzU` drin, die Entwicklerkonsole nicht. Kein Backend-Commit seit dem letzten Neustart, also kein `pm2 restart`.

**Push:** 27 Commits, `e56a968 → d0b635d`. Vorher auf Geheimnisse und Projektdaten geprüft — die beiden neuen Fixtures sind synthetisch, die A64-Dateien liegen ohnehin seit Januar im öffentlichen Repo.

### Was offen bleibt

- **V5** wie oben.
- Der Build liefert auch **Durchstich 2 und Teil XXIV-4** der Parallelsitzung aus, darunter **Journal-Schreibstufe 5**. Das ist dort ausdrücklich so vorgesehen (Leser und Schreiber in EINER Auslieferung, Preis benannt) — aber es ist deren Entscheidung, nicht meine, und ein Tab von gestern liest ab jetzt nur noch.
