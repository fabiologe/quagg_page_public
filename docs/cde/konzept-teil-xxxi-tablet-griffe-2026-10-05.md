# Teil XXXI — Tablet first: Modellieren über Griffe und Knoten (Plan, 2026-10-05)

**Auftrag (Fabio, 2026-10-05):** „Die Bearbeitung per Eingabe haben wir jetzt ganz gut drauf, aber der coolste Hebel wäre
eine Tablet-first-Bearbeitung, indem man über Griffe und Knoten die Sachen modellieren kann. Checke mal den Angriffspunkt.
Es gibt auch ein Problem mit der Übernahme von bearbeiteten Sachen und dem Refresh im Viewer — der Stand ist irgendwie
unklar, wenn man was bearbeitet hat."

Nach Teil XXX (Bedienung, live seit 2026-10-05). Jede Aussage sagt, ob **[gemessen]**, **[gelesen]** (am Code) oder
**[eingeschätzt]**.

---

## 1 · Gemessen: der Tabletlauf T0

`docs/cde/bedienung/tabletlauf.cjs` — iPad hochkant (820 × 1180, Touch über CDP), ohne Projekt, Dev-Build. Eine Wand über
ein Kommando, dann mit dem Finger: antippen, „Verschieben", den Ost-Pfeil ziehen (Long-Press 380 ms, dann Zug), nach dem
Loslassen alle 250 ms Journal gegen Bild. **[gemessen]**

| Zahl | T0 |
|---|---|
| Antippen wählt die Wand · Griffe danach | ja · **0** (Griffe nur mit Werkzeug — Fabios Entscheidung vom 18.09.) |
| Tipps vom gewählten Bauteil bis zu einem Griff | **2** („Lage" aufklappen, „Verschieben") — je Griff-Familie ein anderes Werkzeug |
| Griffe von „Verschieben" | 4 (3 Pfeile, 1 Quadrat) |
| Durchmesser eines Griffs auf dem Schirm — Übersicht · auf die Wand gezoomt | **3 px · 14 px** (Ziel ≥ 40 px) |
| Zeichenfläche hochkant | 820 × 519 px = **44 %** des Schirms |
| Bedienelemente kleiner als 40 px (sichtbar) | **43 von 65** |
| Nach dem Loslassen: Journal neu nach · Bild neu nach | ≈ 1,2 s · ≈ 2,1 s (dieses kleine Modell; in 10001 dauert der Neuaufbau 4–5,6 s) |
| Dazwischen zu sehen: Geist am neuen Ort · Meldung · „beschäftigt" | **nein · nein · nein** |

### Die Bildfolge nach dem Loslassen (Bilder `bedienung/tablet/`)

1. **0,3 s:** das Werkzeug ist zu (die Tafel springt auf die Werkzeugliste zurück), die Wand steht **am alten Ort**, oben
   zählt schon „2 Schritte".
2. **1,5 s:** unverändert — kein Zeichen, dass etwas geschieht.
3. **4 s:** die Wand springt an den neuen Ort, das Werkzeug geht **von selbst wieder auf** („Übernommen.").

**Das ist der „unklare Stand":** zwischen Loslassen und fertigem Neuaufbau zeigt das Bild den alten Zustand, die Zählung
den neuen, und das Werkzeug verschwindet und kommt wieder. In 10001 dauert diese Lücke so lange wie ein Neuaufbau
(4–5,6 s, Teil XXX B4).

### Woher das kommt [gelesen]

| Schritt | Stelle | Folge |
|---|---|---|
| Loslassen | `useGriffe.zugEnde` räumt Geist und Zugbild sofort (`geistLeeren`, `composables/useGriffe.js:471`) | die Vorschau am neuen Ort ist weg, bevor das Neue gebaut ist |
| Schreiben | `bearbeitung.ausfuehren` → `abbrechen()` (`stores/useBearbeitung.js:743`) | das Werkzeug schliesst — die Tafel wechselt, die Griffe gehen |
| Bauen | `nachBauenMitMeldung` → `wendeEintragAn` → Neuaufbau (`IfcViewer.vue:916`) | 1–6 s ohne Anzeige |
| Danach | `_serieFortsetzen` (K5) schaltet das Werkzeug **wieder** scharf (`IfcViewer.vue:932`) | das Werkzeug springt zurück, die Griffe erscheinen neu |

Der fragments-Editor braucht für jeden Neuaufbau Sekunden (Teil XXX, B4 Schritt 2: auch ein einzelnes Element kostet
2,6 s) — **schneller wird das Bild nicht.** Klar werden muss also, **was in der Zwischenzeit zu sehen ist.**

---

## 2 · Bestand: welche Griffe es gibt [gemessen am Teich P11, 70 Kommandos]

| Bauteil | Griff-Familien | setzbare Zahlen | davon mit Griff |
|---|---|---|---|
| Wand, Tauchwand | Verschieben, Drehen, Punkte, Dicke, Höhe | Dicke, Höhe | 2 von 2 |
| Streifenfundament | Verschieben, Drehen, Punkte, Breite, Dicke | Breite, Dicke | 2 von 2 |
| Platte | Verschieben, Drehen, Punkte (26 Griffe), Dicke | Dicke | 1 von 1 |
| Rechen | Verschieben, Drehen, Punkte, Höhe, Stabtiefe | Stabtiefe, Höhe, Stababstand | 2 von 3 |
| Überlaufschwelle | Verschieben, Drehen, Punkte, Höhe | Höhe, Länge, Beiwert | 1 von 3 |
| Rohr | Verschieben, Drehen, Punkte | DN | **0 von 1** |
| Schacht | Verschieben, Punkte | DN | **0 von 1** |
| Drossel | Verschieben, Drehen, Punkte | DN, Abfluss, Stauhöhe | **0 von 3** (fachliche Werte — Formular bleibt richtig) |
| Pfosten | Verschieben, Punkte | Länge | **0 von 1** |
| Schicht, Raum in der Mulde | Ecken (seit B7) | Dicke bzw. Spiegel | **0** (im Formular) |
| Erdbau | Ecken, Maße (Sohlbreite, Böschung, Arbeitsraum, Sohle) | — | — |

**Das Fundament trägt.** Fast jedes Bauteil hat Griffe; Zug, Fang, Führungslinien, Pille, Long-Press, Tablet-Regeln gibt es
seit Teil XVI/XXII/XXVII. **Was fehlt, ist der Zugang:** man sieht immer nur EINE Familie, die des gerade scharfen
Werkzeugs; für einen anderen Griff braucht es ein anderes Werkzeug aus der Liste.

**Knoten:** ein eigener Schacht nimmt seine eigenen Haltungen mit (seit 2026-09-19), ein geliefertes Rohr hängt am
Schacht (`anschluss`, K8). Zwei Wände, die sich an einer Ecke treffen, oder eine Wand auf einem Fundament wissen
nichts voneinander — zieht man eine Ecke, reisst die andere ab. **[gelesen]**

---

## 3 · Die Hebel

| # | Hebel | Problem (gemessen) | Ziel |
|---|---|---|---|
| **H1** | **Die Übernahme sichtbar machen** | 1–6 s alter Zustand ohne Zeichen; Werkzeug zu und wieder auf | Der Geist bleibt am neuen Ort, bis das Bild steht; „Wird übernommen …" an der Bearbeitungsmarke; Werkzeug und Griffe bleiben (gesperrt); danach „Übernommen · Rückgängig" |
| **H2** | **„Formen": alle Griffe eines Bauteils auf einmal** | 2 Tipps je Griff-Familie; nur eine Familie sichtbar | Ein Knopf „Formen" (wie „Ecken ziehen", aber für jedes Bauteil): Punkte, Kanten, Verschieben, Drehen, Feldmaße zusammen; „Fertig" beendet |
| **H3** | **Griffe in Fingergrösse** | 3 px in der Übersicht, 14 px gezoomt (Radius = 1/70 des Abstands, höchstens 50 cm) | Grösse in **Bildschirmpixeln**: sichtbar ≥ 24 px, Trefferfläche ≥ 44 px auf dem Finger |
| **H4** | **Ziehen ohne Warten** | jeder Griff braucht 380 ms Long-Press, sonst dreht die Kamera | im Modus „Formen": ein Finger auf einem Griff zieht sofort; daneben bleibt er Kamera |
| **H5** | **Die fehlenden Griffe** | DN (Rohr, Schacht), Pfostenlänge, Schichtdicke, Spiegel ohne Griff | Feldgriffe: DN radial am Rohrende / Schachtrand, Länge senkrecht am Pfosten, Dicke auf der Schicht-Oberkante, Spiegel als Höhengriff am Raum |
| **H6** | **Knoten** | Wand-Ecke an Wand-Ecke, Wand auf Fundament: ziehen reisst sie auseinander | Fallen Punkte zweier eigener Bauteile zusammen, ist das ein Knoten: ein Griff, alle angeschlossenen Punkte gehen mit (ein Kommando); „lösen" per Tipp |
| **H7** | **Platz hochkant** | Zeichenfläche 44 % des Schirms, Tafeln darunter | im Modus „Formen" klappen die Tafeln ein; unten eine Leiste: Pille mit dem Mass · Rückgängig · Fertig |
| **H8** | **Zahl am Griff** | genaue Werte nur im Formular | Tipp auf die Pille des gezogenen Griffs → Zahl tippen (wie B5 beim Zeichnen) |

---

## 4 · Fahrplan (Vorschlag)

Jede Stufe: der Tabletlauf vorher/nachher (eine Zahl), ein Test an der echten Schnittstelle, Gegenprobe. Ein Commit je Stufe.

| Stufe | Inhalt | Zahl vorher → Ziel | Aufwand |
|---|---|---|---|
| **T0** | Tabletlauf einfrieren (dieser Plan, `bedienung/tabletlauf.cjs`) | — | erledigt |
| **T1** | **H1 Übernahme sichtbar** — Geist und Werkzeug bleiben bis zum fertigen Bild, Griffe gesperrt, Anzeige „wird übernommen" | Zeit mit altem Bild ohne Zeichen 1–6 s → 0 s; Werkzeug zu/auf 1× → 0× | ½–1 Tag |
| **T2** | **H3 Fingergrösse** — Griffradius aus Pixeln, Trefferfläche 44 px | Griff 3/14 px → ≥ 24 px sichtbar, ≥ 44 px Treffer | ½ Tag |
| **T3** | **H2 „Formen"** — alle Familien eines Bauteils, ein Knopf, Fertig; Doppeltipp aufs Bauteil öffnet es | Tipps bis zum Griff 2 → 1; Familien gleichzeitig 1 → alle | 1 Tag |
| **T4** | **H4 sofort ziehen** im Modus „Formen" | 380 ms → 0 ms auf einem Griff | ½ Tag |
| **T5** | **H7 Platz** — Tafeln klappen im Modus ein, Leiste unten | Zeichenfläche 44 % → ≥ 80 % | ½–1 Tag |
| **T6** | **H5 fehlende Griffe** (DN, Länge, Dicke, Spiegel) | setzbare Zahlen ohne Griff (ohne Drossel) 6 → 0 | 1 Tag |
| **T7** | **H6 Knoten** — zusammenfallende Punkte eigener Bauteile ziehen gemeinsam, „lösen" | Wandecke an Wandecke: reisst ab → bleibt verbunden | 1½–2 Tage |
| **T8** | **H8 Zahl am Griff** | genaue Werte am Griff: nein → ja | ½ Tag |
| **T9** | Abnahme mit Fabio am echten Tablet (Produktions-Build) | — | Fabio |

Reihenfolge-Vorschlag: **T1 zuerst** (das ist der gemeldete Fehler, und er betrifft jeden Griff und jedes Formular), dann
**T2 → T3 → T4 → T5** (zusammen die Tablet-Bedienung), dann **T6, T7, T8**. ≈ 6–8 Tage.

---

## 5 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Alternative |
|---|---|---|---|
| **E-T1** | Wann stehen die Griffe? Am 18.09. entschieden: **nur auf Knopfdruck** (kein Zucken beim Wählen verschiebt etwas). | **Bleibt so** — aber EIN Knopf „Formen" bringt alle Familien, und ein **Doppeltipp** aufs Bauteil ist derselbe Knopf | Griffe sofort beim Antippen (schneller, aber genau das Zucken-Risiko von damals) |
| **E-T2** | Ziehen ohne Long-Press? | **Ja, im Modus „Formen" auf einem Griff** — dort ist der Griff das Ziel, nicht die Kamera; ausserhalb bleibt der Long-Press | überall Long-Press (sicher, aber träge) |
| **E-T3** | Knoten: gehen zusammenfallende Punkte immer gemeinsam? | **Ja, standardmässig gemeinsam**; ein Tipp auf den Knoten „lösen" zieht nur den eigenen Punkt | nur auf Wunsch verbinden |
| **E-T4** | Während der Übernahme: darf man weiterziehen? | **Nein — Griffe gesperrt** bis das Bild steht (sonst zieht man an einem Stand, den es nicht mehr gibt) | weiterziehen, Züge reihen sich ein |
| **E-T5** | Hochkant im Modus „Formen": Tafeln einklappen? | **Ja** | Tafeln bleiben |
| **E-T6** | Reihenfolge | **T1 zuerst**, dann Tablet (T2–T5), dann T6–T8 | Knoten (T7) früher |

---

## 6 · Was dieser Plan bewusst nicht tut

- Den Neuaufbau schneller machen — die Grenze liegt im fragments-Editor (Teil XXX B4, Schritt 2). T1 macht die Wartezeit
  sichtbar und ehrlich, nicht kürzer.
- Neue Werkzeuge. Jeder Griff bedient ein vorhandenes Werkzeug über den Kommandoweg (Kommando, Beleg, Rückgängig).
- Fachliche Werte ohne Geometrie (Drosselabfluss, Überfallbeiwert) an einen Griff hängen — dafür ist das Formular richtig.
- Mehrfingergesten ausser dem vorhandenen Pinch (Kamera).

---

## 7 · Entschieden

**E-T1 (Fabio, 2026-10-05):** Griffe sofort beim Antippen — **im Bearbeiten-Modus**. Ohne Modus wählt ein Tipp nur aus.
(Das löst die Regel vom 18.09. „nur auf Knopfdruck" ab: der Knopf ist der Bearbeiten-Modus selbst.) Gilt ab T3.
**Für die Wartezeit (T1):** „die Plananimation aus flood-2D, nur in passender Farbe".
E-T2 bis E-T6: noch offen — gebaut wird nach den Empfehlungen, solange Fabio nichts anderes sagt.

## 8 · Gebaut

### T1 — Die Übernahme sichtbar (2026-10-05)

| Tabletlauf, nach dem Loslassen eines Griffs | vorher | nachher |
|---|---|---|
| Geist am neuen Ort, bis das Bild steht | nein | **ja, durchgehend** |
| Zeichen, dass gerechnet wird | nein | **„Wird übernommen …" mit Plananimation** (Zeichenfläche unten mittig + Tafel) |
| Tafel | Werkzeug → **Liste** → Werkzeug | Werkzeug → **Umbau** → Werkzeug |
| Griffe am alten Stand greifbar | ja (4) | **nein** — die Zeichenfläche nimmt so lange nichts an (E-T4 vorweg) |

- **Ein Zähler „Umbau läuft"** im Store (`bearbeitung.imUmbau`/`umbauLaeuft`): `useGriffe.ablegen` (vom Loslassen an —
  das Schreiben selbst dauert schon ≈ 1 s) und `IfcViewer.wendeEintragAn` (jeder Anwende-Weg: Formular, Löschen,
  Rückgängig) laufen darin.
- **Der Geist bleibt:** `zugEnde` räumt Geist und Zugbild nur noch beim Abbruch; sonst `ablegen` nach dem Neuaufbau.
- **Die Anzeige:** `CdeUmbauAnzeige` mit `assets/plan-laden.svg` — Kopie der flood-2D-Animation (`public/construction
  animations/Loading Icon - Plan.svg`) mit `currentColor` statt Limettengrün; Farbe `--cde-accent`. Kein Import aus
  flood-2D. Über der Zeichenfläche eine durchsichtige Sperre (`aria-busy`), die Kontextleiste ist so lange ausgeblendet.
- **Nicht schneller:** die Lücke selbst bleibt (Neuaufbau im fragments-Editor) — sie ist jetzt sichtbar und sicher.

Test `uebernahmeSichtbar.test.js` (6: Zähler, Griffzug mit Neuaufbau, Abbruch, Tafel, Animation, Viewer); 6
Gegenproben rot. Tabletlauf ohne/mit T1 im selben Stand gemessen; Messlauf Bedienung unverändert.

### T2 — Griffe in Fingergrösse (2026-10-05)

| Tabletlauf (iPad hochkant, „Verschieben" an der Wand) | T0 | T2 |
|---|---|---|
| Griff-Durchmesser in der Übersicht · auf die Wand gezoomt | 3 px · 14 px | **24 px · 24 px** |
| Trefferfläche der Pfeile (Radius, quer zur Achse, bis ein anderer Griff trifft) | ≈ 1–7 px (Hülse 5 × Schaft) | **22 px** (44 px breit) |

- **Grösse in Bildschirmpixeln** (`IfcOverlay`: `GRIFF_PX = 12` Radius, `TREFFER_PX = 22`): jeder Griff ist ein Halter
  am Griffpunkt, sein Inhalt in Griffradien gebaut; bei `radius: 'auto'` setzt der sichtbare Teil vor jeder Ausgabe den
  Massstab aus der Kamera (`weltJePixel`: perspektivisch aus der Tiefe entlang der Blickachse, orthografisch aus dem
  Sichtfenster). Vorher: einmal beim Anzeigen 1/70 des Abstands, höchstens 50 cm — und beim Zoomen blieb er stehen.
- **Überlappende Hülsen:** trifft der Strahl nur Trefferflächen, gewinnt der Griff, der auf dem SCHIRM näher am Finger
  liegt (beim Pfeil: zur Achse), nicht die vordere Hülse.
- **Bleibt:** Nordpfeil und Ebenenquadrat des Gizmos verkümmern bei fast waagerechtem Blick (Pfeil in die Tiefe,
  Quadrat von der Kante) — die Messung trifft dort nach 1–13 px den Nachbarn. Das ist die Lage des Gizmos zur Kamera,
  nicht seine Grösse. Der Lageplan misst seine Griffe weiter in Papier-mm (6 mm × Massstab).

Test `griffFingergross.test.js` (5: Übersicht/nah ohne Neuanzeige, Treffer über `griffUnter` vor/nach Zoom, Pfeil,
fester Radius, überlappende Hülsen); Gegenproben rot: alte Wahl (vordere Hülse), kein Mitwachsen, alte Hülse 1,35;
der alte Radius fällt in `ifcOverlay.test.js`. Tabletlauf misst jetzt das GEZEICHNETE (Halter-Massstab, Treffer über
`griffUnter` Pixel für Pixel) statt der Formel.

### T3 — Griffe beim Antippen (2026-10-05, E-T1)

| Tabletlauf (iPad hochkant, Wand antippen im Bearbeiten-Modus) | T0 | T3 |
|---|---|---|
| Griffe nach dem Antippen | 0 | **13** |
| Griff-Familien zugleich | 1 (die des scharfen Werkzeugs) | **5** (Verschieben, Punkte, Drehen, Wanddicke, Wandhöhe) |
| Tipps vom gewählten Bauteil bis zum ersten Griff | 2 | **0** |
| Griffe im Bild während der Übernahme | — | 4 (das Bild vor dem Loslassen bleibt stehen) |

- **Die eine Regel** (`Griffe.griffeFrei`) kennt jetzt drei Zustände: „Ecken ziehen" (nur Ecken) · ein scharfes Werkzeug
  (seine Familie, wie seit K5) · **kein Werkzeug → alle Griffe des gewählten Bauteils**, Ecken eingeschlossen. Ohne
  gewähltes Bauteil steht nichts; ohne Bearbeiten-Modus wählt ein Tipp nur aus. Der Längsschnitt (Sohlgriffe ohne
  Subjekt) braucht weiter sein Werkzeug; der Lageplan zeigt am gewählten Schacht seinen Griff.
- **Ein Zug aus „alle Griffe"** schaltet das Werkzeug seines Griffs scharf (wie bisher), legt ab und kehrt **ohne Serie**
  zu allen Griffen zurück (`serie` von `useGriffe` an `nachBauenMitMeldung`). Kam der Zug aus der Tafel (Werkzeug schon
  scharf), bleibt die Serie (K5).
- **Während der Übernahme** baut `useGriffe` nicht um, sondern erst, wenn der Umbau endet — sonst blitzten zwischen
  „Werkzeug geräumt" und „Serie wieder scharf" alle Griffe am alten Stand auf (gemessen 4 → 13 → 4).
- **Erdkörper:** ihre Ecken stehen jetzt beim Antippen (die Knopfpflicht vom 18.09. ist durch E-T1 abgelöst); ein Griff,
  der den ganzen Vorgang verschiebt, weiter nicht. „Ecken ziehen" bleibt als Filter (nur Ecken).
- **Bleibt:** in der Übersicht ballen sich die Griffe eines kleinen Bauteils (feste 24 px um eine Wand von wenigen Pixeln)
  — heranzoomen trennt sie. Auf dem Finger braucht jeder Griff weiter den Long-Press (T4).

Test `griffeBeimAntippen.test.js` (7, RÜB über Kommandos, Einordnung wie im Viewer, Zug über greifen → zugEnde ins
Journal); Gegenproben rot: Regel ohne T3-Zweig, `bereit` ohne Bauteil, immer Serie, Viewer ohne `if (serie)`, Umbau
ohne Sperre, Umbau ohne Auslöser. Bewusst gedreht (alte Zusage „ohne Werkzeug kein Griff", K5, und die Knopfpflicht vom
18.09.): `achszug.test.js` (2 + Textwächter), `eckenZiehen.test.js` (2), Textwächter in `gelaendeAbschnitt`/`griffe`.
