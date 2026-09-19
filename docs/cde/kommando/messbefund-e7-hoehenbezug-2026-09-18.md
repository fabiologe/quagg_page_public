# Messbefund E7 — was bedeutet die Höhe einer eigenen Haltung? (2026-09-18)

**Frage (Fabio, E7):** Passt die im Längsschnitt angezeigte und geschriebene Sohlhöhe einer eigenen Haltung zur Lage des Rohrkörpers, oder weicht sie um den halben Durchmesser ab?

**Antwort: sie weicht ab, um genau DN/2.** Gemessen dreimal: ohne Browser mit den echten Funktionen, und zweimal im Browser. Bei DN 1000 liegt die Rohrsohle im Raum 0,50 m unter dem, was Längsschnitt, Werkzeug und Sohlzug „Sohle" nennen. Rohrkörper, Kanalgraben und klassischer Längsschnitt stimmen untereinander — sie lesen die Zahl als Rohrmitte.

Damit ist Fabios Bedingung erfüllt, und die vorgesehene Richtung aus E7 gilt: das Kommando spricht in Sohlhöhe m NN, der Bauplan nennt seinen Bezug ausdrücklich, neue Haltungen schreiben `sohle`.

Stand des Codes: Commit `443919b`. Zeilenangaben relativ zu `client/src/features/cde/`.

## Aufbau

- Haltung **DN 1000** (DN/2 = 0,50 m, unübersehbar), gezeichnet mit dem erzeugten Werkzeug `rohr-zeichnen` und getippter **Höhe**. Das Formularfeld heißt „Höhe", nicht „Sohle" (`services/rezept/Eingebaut.js:81`).
- Danach **Sohlzug** am Anfang über denselben Weg wie der Längsschnitt (`services/LaengsschnittSicht.js:213-233`, aufgerufen wie in `components/LaengsschnittCanvas.vue:205-232`).
- Gemessen wird jeweils die **Unterkante des gebauten Rohrkörpers** — das ist die Rohrsohle im Raum.

## Messung 1 — ohne Browser, echte Funktionen

Höhenversatz 0 (Welt = NN), Haltung von 290,00 auf 289,90 m NN über 20 m, Sohlzug am Anfang auf 289,00.

| Leser | Ort | nennt es | Wert | Rohrsohle im Raum | Abweichung |
|---|---|---|---|---|---|
| Rohrkörper (Sweep um die Punkte) | `services/rezept/Geometriebau.js:186-190` | — | Unter-/Oberkante 289,500 / 290,500 | 289,500 | — |
| Kernel-Form `linie` | `services/rezept/Rezeptbau.js:86-93` | `achsbezug: 'mitte'` | 290,00 | 289,500 | stimmt (Mitte) |
| Netzkante | `services/rezept/Rezeptbau.js:143-155` | kein Bezug | 290,00 | 289,500 | — |
| **Längsschnitt-Sicht (bearbeitbar)** | `services/LaengsschnittSicht.js:50-51` | **Sohle** | **290,00** | 289,500 | **+0,500** |
| **Werkzeug „Sohlhöhen festlegen", Feld „Sohle Anfang"** | `services/Bearbeitungen.js:322-335` | **Sohle** | **290,00** | 289,500 | **+0,500** |
| **Sohlzug auf 289,00** | `services/LaengsschnittSicht.js:213-233` | **Sohle** | **289,00** geschrieben | 288,501 | **+0,499** |
| Kanalgraben über der eigenen Haltung | `services/ableitung/Ableitungen.js:778-800` | `achsbezug: mitte` | Grabensohle 289,395 + Bettung 0,10 | 289,500 | −0,005 (Raster) |
| Klassischer Längsschnitt | `services/Laengsschnitt.js:25-33` | Sohle über `rohrsohle(y, {achsbezug:'mitte'})` | 289,50 | 289,500 | stimmt |

Skript: Scratchpad der Sitzung, `e7/e7messung.test.js`; Ergebnis `e7-ohne-browser.json`.

## Messung 2 — im Browser, eigene Haltung allein

Vite :3001, Testprojekt 42069, Gelände `TEST-ERDKOERPER_ENQUIER.ifc` (nur geladen, nie registriert), Höhenversatz 282,0667. Haltung waagerecht, getippte Höhe **290,00 m NN**.

| | Wert |
|---|---|
| Hülle des gebauten Rohrs | Unterkante **289,500**, Oberkante **290,500** m NN |
| nach Sohlzug am Anfang auf **289,00** | geschriebene Punkthöhe 289,00 · Unterkante **288,501** m NN → **+0,499** |

**Nebenbefund (gemessen):** Die allein gewählte eigene Haltung bekommt vom Viewer weder Achse noch Strang. `achseVon` findet eigene Kanten nur unter dem Schlüssel `cde:<GlobalId>` (`services/IfcEngine.js:3176-3186`), der Viewer fragt mit der localId des Fragments (`components/IfcViewer.vue:1163-1170`). Folgen im Browser:

- Der Längsschnitt bleibt leer: „Im 3D oder Lageplan eine Haltung wählen" — obwohl die Haltung gewählt ist ([Bild](bilder/e7-laengsschnitt-allein-leer.png)).
- Das Werkzeug „Sohlhöhen festlegen" wird angeboten und belegt das Feld „Sohle Anfang" mit **0 m NN** vor (Rückfall `leer: 0`, `services/Bearbeitungen.js:1281`).

## Messung 3 — im Browser, eigene Haltung im gelieferten Strang

Angezeigt wird eine eigene Haltung im Längsschnitt nur, wenn sie im Strang einer gelieferten hängt. Aufbau: A64-Netz (`6178_A64-2BA_0_2026-03-18 (12).ifc`, nur geladen), Höhenversatz 187,38. Am Auslaufschacht (Knoten mit Zulauf, ohne Ablauf) beginnt eine eigene Haltung DN 1000 mit getippter Höhe **206,19 m NN** = Endhöhe der Zulaufhaltung. Gewählt wird die gelieferte Zulaufhaltung, wie ein Klick.

| | Wert |
|---|---|
| Strang der Längsschnitt-Sicht | gelieferte Zulaufhaltung → eigene Haltung |
| **angezeigte Sohle des eigenen Segments** | **206,19** m NN |
| Hülle des eigenen Rohrs | Unterkante **205,69**, Oberkante **206,69** m NN |
| **Abweichung** | **+0,50** |

[Bild](bilder/e7-laengsschnitt-eigene-haltung.png): „E7-Anschluss · DN 1000 · 0.0 %" liegt im Längsschnitt auf der 206-m-Linie.

## Nebenbefund, am Code belegt und im Bild gesehen, nicht nachgemessen

**Die bearbeitbare Längsschnitt-Sicht ignoriert den Achsbezug auch bei gelieferten Haltungen.** `strangVon` gibt die Herkunft der Achse nicht weiter (`services/IfcEngine.js:2962-2979`), `baueSicht` liest jede Höhe roh als Sohle (`services/LaengsschnittSicht.js:50-51`). Der klassische Längsschnitt rechnet dagegen seit Teil XXI mit dem Bezug (`services/Laengsschnitt.js:25-33`). Im Bild trägt die gelieferte Zulaufhaltung ihre Achse „aus der Extrusion" — nach `Achsbezug.achsbezugVon` ist das die Rohrmitte —, und das Bauteilfenster wie die Sicht nennen sie „Sohle". Bei DN 300 sind das 0,15 m. Die Rohrsohle dieser Haltung habe ich nicht gegen ihren Körper gemessen.

## Was daraus folgt

1. **Die Zahl in `parameter.punkte` einer eigenen Haltung ist heute die Rohrmitte.** So baut der Körper, so liest der Kanalgraben, so rechnet der klassische Längsschnitt. Die getippte „Höhe" beim Zeichnen ist also eine Mittenhöhe.
2. **Drei Stellen nennen dieselbe Zahl „Sohle" und liegen DN/2 daneben:** die bearbeitbare Längsschnitt-Sicht, die Vorbelegung von „Sohlhöhen festlegen" und der Sohlzug. Wer im Längsschnitt die Sohle auf H zieht, bekommt ein Rohr mit Sohle H − DN/2.
3. **Das Gefälle stimmt trotzdem.** Der Versatz ist an beiden Enden gleich und kürzt sich heraus. Deshalb ist der Fehler bisher niemandem aufgefallen, und deshalb fängt ihn auch kein Gefälletest.
4. **Für E7 heißt das:** die vorgesehene Richtung gilt. Das Kommando spricht in Sohlhöhe m NN, der Bauplan nennt seinen Bezug. Baupläne ohne Angabe bleiben `mitte` und damit bitgleich; neue schreiben `sohle`. Die Umrechnung geschieht an einer Stelle (`services/Achsbezug.js`, `rohrsohle` / `rohrmitte`), und die Längsschnitt-Sicht bekommt den Bezug mit dem Strang — das kuriert den gelieferten Fall gleich mit.
5. **Die Bedeutung eines gespeicherten Feldes ändert sich.** Ein älterer Client baute eine `sohle`-Haltung DN/2 zu tief. Das braucht zwei Auslieferungen: erst den Leser, eine Auslieferung später das Schreiben von `sohle`.
6. **Der Nebenbefund zur Auswahl** (keine Achse, kein Strang, Feld 0 m NN) ist ein eigener Fehler. Er liegt auf dem Weg des Durchstichs (Schritt K3, Subjekt aus dem Stand) und wird dort mitgenommen.
   **Nachtrag 2026-09-18 (K3 gebaut):** behoben. Im Browser (42069, A64-Netz) hat die allein gewählte eigene Haltung jetzt Achse und Strang, der Längsschnitt zeigt ein Segment (vorher keins), „Sohlhöhen festlegen" ist mit 200,00 / 199,85 m NN vorbelegt (vorher leer). Was diese Zahlen bedeuten — Rohrmitte oder Sohle — klärt K4.

## Nachtrag 2026-09-19 — nach K4a (dieselbe Messung)

Im Browser (:3001, 42069, A64-Netz), eigene Haltung DN 1000 über die Oberfläche gezeichnet, getippte Sohle 200,00 m NN:

| Leser / Schritt | nennt | Rohrsohle im Raum | Abweichung |
|---|---|---|---|
| Zeichnen (Feld „Sohlhöhe") | 200,00 | 200,000 | 0 (vorher −0,50) |
| Längsschnitt-Sicht, Vorbelegung | 200,00 | 200,000 | 0 |
| „Sohlhöhen festlegen", Ende 199,80 | 199,80 | 199,800 | 0 (vorher: Forderung ohne Wirkung) |
| Sohlzug, Ende 199,70 | 199,70 | 199,700 | 0 |

Gespeichert ist weiter die Rohrmitte (200,50), jetzt mit `achsbezug: 'mitte'`. Die Sohle als gespeicherte Zahl (K4b) folgt eine Auslieferung später.

## Aufräumen

Beide Browserläufe haben die Journal-, Panel- und „zuletzt offen"-Schlüssel von 42069 vorher gesichert und danach auf genau diesen Stand zurückgesetzt (Prüfung „gleich: true" in beiden Läufen). Nichts wurde registriert, :3000 wurde nicht berührt.
