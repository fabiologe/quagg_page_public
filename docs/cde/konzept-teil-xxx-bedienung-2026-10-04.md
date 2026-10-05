# Teil XXX — Bedienung: was wir haben, was fehlt, wie es weitergeht (Konzept, 2026-10-04)

**Auftrag (Fabio, 2026-10-04):** „Plane die Bearbeitungen weiter — prüfe mal bitte, was wir bis jetzt haben und was noch
alles fehlt. Ich glaube, vor allem ist es bei der User Experience noch extrem ausbaufähig!"

Gemessen wurde auf drei Wegen: (1) der Werkzeugkatalog und seine Einstiege, gezählt am Code (`werkzeugKatalog()` in Node
geladen); (2) was die eigenen Dokumente und Gedächtnisnotizen als offen führen; (3) ein **Durchlauf mit echter Maus und
Tastatur** im Browser — Vite :3001, ohne Projekt (lokale IndexedDB, nichts im Projekt-Repo), Testgelände
`erdbau_vergleich.ifc`, Chrome headless mit Software-Renderer, **nicht Firefox, nicht Tablet**. Kennzeichnung:
**[gemessen]** im Browser oder am Code gezählt, **[gelesen]** im Code oder in Dokumenten, **[eingeschätzt]**.

Pfade ohne Präfix liegen unter `client/src/features/cde/`.

---

## 1 · Was wir haben (Bestand)

### 1.1 Werkzeuge — viele, und gut gebaut **[gemessen]**

| Gruppe | Anzahl | Eingabe |
|---|---|---|
| Maße (`parametrik`) | 78 | 77 nur Formular, 1 Zug (Sohle ziehen) |
| Lage | 30 | 27 Formular, 3 Zug |
| Erzeugen | 22 | 14 Zug, 8 Umriss |
| Gelände | 13 | 8 Formular, 2 Zug, 3 Umriss |
| Merkmale | 11 | Formular |
| Blatt, Bauwerk | 3 | Formular |
| **Summe** | **157** | 126 Formular, 20 Zug, 11 Umriss |

Davon stehen 72 nur im Formular „Eigenschaften" (G2), 3 im Abschnitt „Vorlage", 5 haben ihre eigene Oberfläche (Griffe,
Strukturbaum, Merkmalsfenster, Lageplan). Gesten an Feldern: `punkt` (5 Werkzeuge), `auswahl` (7), `griff` (6).

Das Fundament trägt: jedes Werkzeug ist ein Kommando (ein Vorgang, rückgängig, mit Beleg), Eignung und Begründung („Hier
nicht möglich (n)") kommen aus einer Regel, Vorschau läuft live (`useVorschau`, 50 ms), Rückmeldung „Übernommen ·
Nochmal" steht 8 s, Undo/Redo über Tasten, Palette und Verlauf.

### 1.2 Einstiege — elf Orte **[gelesen]**

Tafel „Bauteil" (ohne Auswahl: Palette mit Suche, Allgemein + 10 Gewerk-Reiter, Gelände; mit Auswahl: Werkzeuge nach
Herleitung, Vorlage, Bauwerk, „Wie dieses", Ecken, Querschnitt, Merkmale) · Kontextleiste unten (das EINE Formular) ·
HUD-Pille an der Auswahl · Zeiger-Pille · Griffe im Raum · Längsschnitt (Sohle ziehen) · Lageplan (Schachtgriffe,
Planinhalte, Rotstift) · Befehlspalette Strg+K · Merkmalsfenster · Cockpit (KG, DIN 277) · Strukturbaum · Verlauf.

### 1.3 Tastatur, Auswahl, Griffe **[gelesen]**

- **Tasten, die es gibt:** Strg+K/F, Strg+Z, Strg+Y/Strg+Umschalt+Z, Esc (stufenweise), Enter, Rückschritt (letzter
  Punkt), E, M, N, V, ?, H, I, Umschalt+A, T/R, 1–3, Alt (ohne Raster), Umschalt (Höhe statt Lage).
- **Tasten, die fehlen:** Entf, Strg+C/V/D, Strg+A — „Delete" steht in keinem Handler.
- **Auswahl:** Klick (Rang Bauteil > Erdkörper > Gelände), Durchtippen, Rahmen nur mit Umschalt + Maus (kein Touch),
  Baum, Suche, Prüfliste, Verbund über die Pille. **Kein** Umschalt-/Strg-Klick zum Ergänzen.
- **Mehrfach (`mehrfach`)** können 11 Setzer — **nicht** Löschen und nicht Verschieben (ein Kommentar in `IfcViewer.vue`
  behauptet es für Löschen).
- **Griffe** nur mit scharfem Werkzeug ihrer Familie (Fabios Entscheidung: nur nach Knopfdruck) — verschieben (Gizmo),
  Schacht, Punkte, Drehen, Sohle/Deckel/Bezug, Ecken, Längsschnitt, Bauwerk, je Feldsetzer.
- **Fang:** Bibliothek (Ecke/Kante) nur auf gelieferten Modellen; Fanglinien an Schacht- und Erdbau-Griffen; Knotenfang
  beim Rohr; Raster 0,1 m. **Punktfang auf eigene Bauteile ist gebaut, aber nicht angeschlossen** — `Fangpunkte.js`
  (Schacht, Achsende, Stützpunkt) hat ausser Tests keinen Aufrufer.
- **Keine Zahl während des Ziehens oder Zeichnens** (keine getippte Länge, kein Winkel) — Zahlen nur im Formular.
- Kopieren, Reihe, Drehen, Spiegeln: als Formular-Werkzeuge (relativ), nur an Eigenbau; Verschieben absolut. Keine
  Zwischenablage.

---

## 2 · Der Durchlauf — was ein Planer erlebt **[gemessen]**

Ablauf wie am ersten Tag: Modell laden → eine Wand zeichnen → sie anklicken → Dicke ändern → löschen → kopieren →
rückgängig. Zählung: Klicks und Tasten.

| # | Schritt | Klicks | Was passiert | Befund |
|---|---|---|---|---|
| 1 | Modell geladen | 0 | Oben „Projekt wählen" über die halbe Breite (ohne Projekt), Gelände klein am Rand, Tafel „Bauteil" **zu** | **B1**, **B2** · Bild `bedienung/bilder/01-start-ohne-projekt.png` |
| 2 | Palette öffnen | 1 | erst „Bauteil" in der rechten Leiste — die Palette ist vorher nicht zu sehen | **B2** |
| 3 | „Wand" | 2 | Draufsicht; das Formular (11 Felder, 258 × 499 px) steht **mitten im Bild, über dem Gelände**; vom Gelände bleibt ein Streifen von ~37 px | **B3** (Hauptbefund) · Bild `02-formular-verdeckt-gelaende.png` |
| 4 | zwei Punkte ins Gelände | 4 | beim ersten Versuch trafen beide Klicks das Formular: „Mindestens 2 Punkte nötig"; erst im Streifen darüber ging es | **B3** |
| 5 | Enter | 4 + 1 Taste | „Übernommen · Nochmal" ✓ — Journal 0 → 1 | gut |
| 6 | Wand anklicken | 5 | **nichts gewählt.** Die neue Wand ist nicht gewählt, die Kamera bleibt in der Draufsicht, die 0,3-m-Wand ist dort ein Strich von ~2 px | **B4** · Bild `03-nach-uebernehmen-nichts-gewaehlt.png` |
| 7 | Entf | +1 Taste | nichts (Journal 1 → 1) | **B5** · Bild `04-entf-ohne-wirkung.png` |
| 8 | Strg+C, Strg+V | +2 Tasten | nichts | **B5** |
| 9 | Strg+Z | +1 Taste | Wand weg (1 → 0) ✓ | gut |

Nebenbei gesehen: die Marke „Bearbeitung · 1 Schritt · Sichern" liegt oben **über** dem Hinweis „Nur im Browser
gespeichert" — beide überlappen sich (**B1**). Keine Fehler in der Konsole.

**Lesart:** das Werkzeug funktioniert, sobald man weiss, wo man klicken darf. Die Hürden liegen davor und danach:
Platz im Bild, der erste Schritt, das Ergebnis in der Hand, die Tasten, die jede andere Software hat.

---

## 3 · Was die Dokumente als offen führen **[gelesen]**

Die Liste mit Quellen steht im Anhang; hier verdichtet, nach Häufigkeit in Fabios Rückmeldungen.

1. **Zu komplex, zu viel auf einmal** — fünfmal seit 09-10 („riesen Durcheinander", „weniger ist mehr", „Slop statt
   smart und einfach").
2. **Gelände verschwindet, verschiebt sich, flimmert** — viermal; seit Teil XXI/XXII und heute (Schicht auf Schicht)
   weitgehend gekurt.
3. **Ungewollte Auslöser** (Gelände-Klick, Griffe) — entschieden: Griffe nur nach Knopfdruck.
4. **Verschieben nicht flüssig** — zweimal („nicht so smooth wie flood-3D").
5. **Jedes Kommando baut die Szene neu:** ~15 s je Kommando bei 30 Teilen (Teil XXIX, § 11.9) — im Projekt der grösste
   gefühlte Bremsklotz.
6. Offen ohne Rückmeldung von Fabio: **Firefox-Gegenprobe** (Drehgefühl, Gizmo, Auswahllisten), **Tablet** (Kammer mit
   einem Tipp, Formular), **Griffzug mit der Maus** an Wanddicke/Wandhöhe — Testliste vom 03.10., Teil A1–A3, F.
7. Benannte Lücken: Schicht ohne Griffe; Baugruppe nicht bearbeitbar; Befunde ohne Marker im Raum und ohne Zähler;
   Massen nicht live; Auswahl-Schimmer im Software-Renderer nicht messbar; Mehrfachauswahl nur mit Umschalt + Maus;
   Tabelle am Bauwerk (W5) „später".

Fabios Regeln, die jeder Vorschlag einhält: Griffe nur nach Knopfdruck · die vier Tablet-Regeln (nichts am Schweben,
keine Pflicht-Modifikatortaste, 40 × 40 je Ziel, ein Tipp schreibt nicht) · kein `window.confirm` · Firefox ist der
Browser · beraten statt verbieten · weniger ist mehr (keine neuen Knöpfe in der Kopfleiste, eine Meldungsstelle) ·
gezeichnet wird im 3D.

---

## 4 · Diagnose — sechs Hebel

| # | Hebel | Befund | Wirkung | Aufwand |
|---|---|---|---|---|
| **H1** | **Das Bild gehört dem Zeichnen** | das Formular deckt ~20 % der Bildfläche (258 × 499 von 848 × 764 px, aus dem Bild abgelesen), mittig über dem Gelände (B3); „Projekt wählen" und Hinweise liegen über dem Bild (B1) | gross — es betrifft jedes Zeichnen | klein–mittel |
| **H2** | **Das Ergebnis in der Hand** | nach „Übernommen" ist nichts gewählt; Draufsicht bleibt; eine dünne Wand ist kaum zu treffen (B4) | gross — jeder zweite Schritt ist „das eben Gezeichnete ändern" | klein |
| **H3** | **Tasten und Auswahl wie überall** | Entf, Strg+C/V/D, Strg+A fehlen; kein Ergänzen per Umschalt-/Strg-Klick; Löschen nicht mehrfach (B5) | gross — Muskelgedächtnis aus jedem CAD | klein–mittel |
| **H4** | **Tempo** | ~15 s je Kommando bei 30 Teilen (Neuaufbau der ganzen Szene) | sehr gross im Projekt | **gross** |
| **H5** | **Präzise ohne Formular** | Punktfang auf eigene Bauteile nicht angeschlossen; keine Länge/Winkel tippen; keine Maße am Zeiger beim Zeichnen | mittel–gross | mittel |
| **H6** | **Der erste Schritt** | Palette erst nach Klick auf „Bauteil"; 157 Werkzeuge, davon am Bauteil 9–31 Knöpfe (G2/G4); keine Führung | mittel | klein |

Bewusst **nicht** als Hebel: noch mehr Werkzeuge. Der Katalog ist breit genug; was fehlt, ist der Weg dorthin.

---

## 5 · Fahrplan (Vorschlag) — Stufen B0 … B8

Jede Stufe: messen vorher, ein Test an der echten Schnittstelle, Gegenprobe, Browser-Durchlauf (dieses Skript,
`scratchpad/ux/durchlauf.cjs`, wird zum festen Messlauf). Eine Zahl vorher → Ziel.

| Stufe | Inhalt | Zahl vorher → Ziel | Aufwand |
|---|---|---|---|
| **B0** | **Messlauf einfrieren:** der Durchlauf aus § 2 als wiederholbare Browserprobe — sechs Standardabläufe (Wand zeichnen, ändern, löschen, kopieren, rückgängig, Teich-Schicht auf Schicht) mit Klicks, Tasten, verdeckter Bildfläche, Journal vorher/nachher | — (Basis: § 2) | ½ Tag |
| **B1** | **Platz im Bild:** das Formular wandert beim Zeichnen in die Tafel rechts (die zeigt dort heute nur Titel + Abbrechen); unten bleibt eine Zeile: nächster Schritt · Übernehmen · Abbrechen. „Projekt wählen" klappt nach der Wahl (oder ohne Projekt) zu; Hinweise stapeln sich nicht über der Bearbeitungsmarke | verdeckte Bildfläche beim Zeichnen ~20 % → ≤ 5 % (B0 misst sie am DOM statt am Bild); Fehlklicks „ins Formular" 2 → 0 | 1 Tag |
| **B2** | **Ergebnis in der Hand:** nach dem Zeichnen ist das neue Bauteil gewählt (Tafel zeigt es, Griffe auf Knopfdruck); die Kamera kehrt in die Ansicht vor dem Zeichnen zurück; „Nochmal" bleibt | Klicks „zeichnen → Dicke ändern" heute nicht möglich ohne Suchen → 1 | ½ Tag |
| **B3** | **Gewohnte Tasten und Auswahl:** Entf = Löschen der Auswahl (ein Kommando, Rückmeldung „Gelöscht · Rückgängig", **mehrfach**); Strg+C/V = Kopie (am Zeiger oder mit Versatz, E-B4), Strg+D = Duplikat; Strg+A = alles Sichtbare im Eigenbau; Umschalt-/Strg-Klick ergänzt/entfernt; Verschieben mehrfach; auf dem Tablet ein Knopf „Mehrere wählen" statt Modifikatortaste | Entf/Strg+C/V wirkungslos → je 1 Taste; Mehrfach-Werkzeuge 11 → 13+ | 1–1½ Tage |
| **B4** | **Tempo:** ein Kommando baut nur, was es betrifft (Bauteil, seine Ableitungen und Abhängigen) statt der ganzen Szene; eine Kommandofolge (Baugruppe, Skript) baut einmal am Ende | ~15 s je Kommando bei 30 Teilen → < 1 s **[eingeschätzt]** | 2–3 Tage (Engine, Autor, Ableitungslauf) |
| **B5** | **Präzise ohne Formular:** Punktfang auf eigene Bauteile anschliessen (`Fangpunkte.js` ist fertig); beim Zeichnen Länge und Winkel tippen (Zahl → Enter, wie im CAD); Länge/Winkel/Höhe in der Zeiger-Pille während des Zeichnens; Ortho per Knopf (Tablet) bzw. Umschalt | Punktfang eigener Bauteile 0 → Schacht, Achsende, Stützpunkt, Ecke | 1½–2 Tage |
| **B6** | **Der erste Schritt:** Tafel „Bauteil" ist beim Öffnen eines Modells offen (Palette sichtbar); Kamera passt das Modell ein; ein kurzer Leitfaden beim ersten Zeichnen (eine Zeile, abschaltbar) | Klicks bis zum ersten Werkzeug 2 → 1 | ½ Tag |
| **B7** | **Am Objekt weiter:** Griffe für Schichten (Umriss ziehen, nach Knopfdruck); Massen live in der Zeiger-Pille; Befunde als Marker im Raum + Zähler in der Kopfzeile | Schichten ohne Griffe 9 Rezeptelemente → 0 | 2 Tage |
| **B8** | **Abnahme mit Fabio:** Firefox und Tablet nach Testliste (offen seit 03.10.), dazu der Messlauf B0 | — | Fabio |

**B0 gemessen (2026-10-04, `bedienung/messlauf.cjs`, ohne Projekt, Chrome headless):**

| Zahl | B0 (vorher) |
|---|---|
| Klicks bis zur Palette | 1 |
| verdeckte Zeichenfläche beim Zeichnen — gesamt / mittleres Drittel | 23,9 % / **85,7 %** |
| zwei Klicks in die Bildmitte ergeben eine Wand | nein |
| neues Bauteil danach gewählt | nein |
| Kamera danach zurück | nicht messbar (keine Schnittstelle — kommt mit B2) |
| Entf löscht · Strg+Z holt zurück · Strg+C/V kopiert · Strg+A wählt | nein · ja · nein · 0 |

Reihenfolge-Vorschlag: **B0 → B1 → B2 → B3 → B6** (zusammen ~4 Tage, jede für sich spürbar), dann **B4** (Tempo — der
grösste Hebel im Projekt, aber der grösste Umbau), dann **B5**, **B7**. B8 läuft nebenher. Die Bibliothek (Fabios
nächste Etappe nach der Basis) profitiert von B4 direkt: eine Baugruppe setzen ist dann ein Aufbau, nicht dreissig.

---

## 6 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Alternative |
|---|---|---|---|
| **E-B1** | Wohin das Formular beim Zeichnen? | **in die Tafel rechts** — dort ist beim Zeichnen ohnehin nur Titel + Abbrechen; das Bild bleibt frei | unten, aber einzeilig mit aufklappbaren Feldern |
| **E-B2** | Kamera nach dem Zeichnen? | **zurück in die Ansicht vorher** (gezeichnet wird in der Draufsicht, angeschaut im 3D) | Draufsicht bleibt bis Esc |
| **E-B3** | Entf ohne Rückfrage? | **ja** — es ist ein Kommando, Strg+Z holt es zurück; die Rückmeldung sagt „Gelöscht · Rückgängig" | mit Rückfrage über `store.frage` (nicht `window.confirm`) |
| **E-B4** | Strg+V legt die Kopie … | **am Zeiger ab** (die Kopie hängt am Mauszeiger, ein Klick setzt sie; auf dem Tablet ein Tipp) | mit festem Versatz (2 m, wie „Kopieren" heute) |
| **E-B5** | Tempo (B4) vor der Bibliothek? | **ja** — jede Baugruppe und jedes Skript läuft heute in den 15-s-Neuaufbau | Bibliothek zuerst, B4 danach |

---

**Entschieden (Fabio, 2026-10-04: „oki lets go"):** alle fünf wie empfohlen — Formular in die Tafel rechts (E-B1), Kamera
zurück in die Ansicht vorher (E-B2), Entf ohne Rückfrage (E-B3), Strg+V legt die Kopie am Zeiger ab (E-B4), Tempo vor der
Bibliothek (E-B5). Gebaut in der Reihenfolge B0 → B1 → B2 → B3 → B6 → B4 → B5 → B7.

---

## 7 · Was dieser Plan bewusst nicht tut

Keine neuen Fachwerkzeuge; keinen Regelquerschnitt × Achse (W7, eigener Teil); keine Tabelle am Bauwerk (W5, nach B3,
wenn Mehrfach trägt); kein Zusammenführen mehrerer Bearbeiter; keine Änderung an Fabios Griff-Entscheidung.

---

## Anhang · Quellen der offenen Punkte

- Teil XXIX: `konzept-teil-xxix-struktur-gewerke-2026-10-04.md` § 7 (W5, W7), § 11.4 (Schicht ohne Griffe), § 11.7
  (Baugruppe nicht bearbeitbar), § 11.9 (15 s je Kommando), § 11.10 (Pipette ohne Merkmalssätze, G3 „≤ 8").
- Teile XXVI–XXVIII: `fahrplan-teil-xxvii-…` Z. 249–263 (Fang für `hoeheVon`, Gehrung, Öffnung kaum sichtbar),
  `fahrplan-teil-xxviii-…` Z. 120, 235, 243 (Fund 17, Griffzug nicht gefahren), `testliste-teil-xxvi-xxviii-2026-10-03.md`
  A1–A3, F (Maus, Server, Tablet, Firefox).
- Viewer: `viewer/bestandsaufnahme-2026-09-20.md` § 1–7 (Kontextleiste und Pille verdecken, keine Massen live, keine
  Befundmarker, kein Ortho, keine Zahl beim Ziehen, Auswahl-Schimmer), `viewer/kur-2026-09-21.md` Z. 198–206 (Serie,
  Firefox).
- Tragfähig: `tragfaehig-2026-09-24.md` Z. 83–90 (ProVI-Griffe, Firefox).
- Mussleistungen: `mussleistungen.md` § 2, § 4 — offen M5 (Benennung), M14 (Frist/Zuständigkeit), M22 (Kommentar am
  Container); teilweise M4, M20. (Stand 2026-10-01, nicht nachgeführt.)

---

## 8 · Gebaut

### B1 — Platz im Bild (2026-10-04)

Die Werkzeugkarte (Formular, Gesten, Querprofil, Vorschau-Chips) ist ein eigenes Stück (`CdeWerkzeugKarte`, Rechnung in
`composables/useWerkzeugKarte`). Sie steht in der Tafel „Bauteil", wenn die Tafel sie zeigt; die Leiste unter dem Bild wird
dann eine Zeile (Werkzeug · nächster Schritt · Übernehmen · Abbrechen). Ein Werkzeug, das scharf wird, öffnet die Tafel. Die
Tafel ist kein Kind des Viewers — sie bekommt die Karte über die Viewer-Schnittstelle (`api.werkzeugKarte`) und meldet sich
an (`inTafel`); erst dann wird die Leiste schmal, sonst steht das Formular wie bisher unten (Tablet, Tafel zu). Ohne Projekt
klappt „Projekt wählen" über einem geladenen Modell auf eine Zeile zu; der Hinweis „Nur im Browser gespeichert" rückt unter
die Bearbeitungsmarke.

| Messlauf | B0 | B1 |
|---|---|---|
| Höhe der Zeichenfläche | 764 px | **924 px** (+21 %) |
| verdeckt beim Zeichnen — gesamt / mittleres Drittel | 23,9 % / 85,7 % | **6,1 % / 0 %** |
| zwei Klicks in die Bildmitte ergeben eine Wand | nein | **ja** |

Das Ziel „≤ 5 %" ist knapp verfehlt: 4,3 % liegen schon ohne Werkzeug über dem Bild (Werkzeugleiste links, Hinweis oben),
dazu die schmale Zeile.

**Gefunden beim Bauen:** der erste Versuch reichte die Karte per `provide` aus dem Viewer — der Test (Tafel als Kind
montiert) war grün, im Browser änderte sich nichts (23,9 % wie vorher): in der App ist die Tafel ein GESCHWISTER des
Viewers. Der Test montiert jetzt beide als Geschwister wie die Seite. Gegenprobe (Tafel meldet sich nicht an) rot.

### B2 — Das Ergebnis in der Hand (2026-10-04)

Nach dem Zeichnen ist das NEUE Bauteil gewählt (`waehleNeues` — das erste neue, das kein Ableitungsteil ist; nur nach
einem Erzeugen-Werkzeug), auf beiden Wegen (Knopf und Enter im Motor). Die Ansicht vor dem Zeichnen wird gemerkt, bevor die
Draufsicht kommt; wird das Werkzeug frei — übernommen oder abgebrochen —, kehrt die Kamera dorthin zurück (nur die Kamera,
Sichtbarkeit und Schnitt bleiben).

| Messlauf | B1 | B2 |
|---|---|---|
| neues Bauteil danach gewählt | nein | **ja** |
| Kamera danach zurück | (nicht messbar) | **ja** — Gegenprobe im Browser (Zurückkehren abgeschaltet): nein |

**Gefunden beim Bauen:** der Motor ruft nach Enter `nachBauen(eintrag)` ohne Werkzeugkennung, und `ausfuehren` hat das
Werkzeug da schon geräumt — „war es ein Erzeugen?" kam ohne den gemerkten letzten Werkzeugnamen falsch heraus. Ein
Schlüssel `kameraZustand` an der Viewer-Schnittstelle nur für den Messlauf hätte die Hausregel gebrochen (jeder Schlüssel
hat einen Nutzer in der App) — der Messlauf liest die Kamera über `captureViewpoint` (gespeicherte Ansichten).

### B3 — Tasten und Auswahl wie überall (2026-10-04)

- **Entf** löscht die Auswahl — ein Kommando, ohne Rückfrage (E-B3); die Rückmeldung sagt „Gelöscht." bzw. „n Bauteile
  gelöscht." mit dem Knopf **Rückgängig**. „Löschen" ist jetzt `mehrfach`.
- **Strg+C** merkt die gewählten Eigenbau-Teile; **Strg+V** setzt sie als Kopie AM ZEIGER (E-B4): „Kopieren" läuft mit der
  Geste „Ziel", die Vorschau folgt dem Zeiger, ein Klick setzt sie — alle Teile um denselben Versatz, die Kopie ist danach
  gewählt. **Strg+D** = Strg+C + Strg+V. Derselbe Weg über „Kopieren" in der Tafel („Ziel: im Raum zeigen") — fürs Tablet.
- **Strg+A** wählt den ganzen Eigenbau (ohne Bauwerke, Geländeanzeige, Verborgenes).
- **Umschalt-/Strg-/Cmd-Klick** nimmt dazu oder heraus (Engine `ergaenzeAuswahl`, Gelände nie); auf dem Tablet der Schalter
  **„Mehrere wählen"** in der Tafel (keine Pflicht-Modifikatortaste).

| Messlauf | B2 | B3 |
|---|---|---|
| Entf löscht · Strg+Z holt zurück | nein · ja | **ja · ja** |
| Strg+C/V legt eine Kopie ab | nein | **ja** (an der Klickstelle, danach gewählt) |
| Strg+A wählt (von 2 eigenen) | 0 | **2** |

**Gefunden beim Bauen — ein alter Fehler:** ein GELÖSCHTER Eigenbau blieb im Bild stehen — auch über den Knopf „Löschen"
in der Tafel. Der Eintrag wurde „einzeln" angewandt, das Eigenbau-Modell entsteht aber als Ganzes aus dem Journal; ein
gelöschtes Teil fällt nur beim Neuaufbau heraus. Jetzt nimmt ein Lösch-Eintrag an Eigenbau den Weg Neuaufbau (`wegVon`).
Dazu: die Meldung „Das Bauteil wurde ersetzt" nur noch, wenn wirklich ein neues kam; „Kein Treffer — ein Bauteil antippen"
bei einer Ortsgeste heisst jetzt „einen Ort auf Gelände oder Bauteil antippen".

**Nicht gebaut, mit Grund:** „Verschieben" für mehrere — seine Felder sind ABSOLUTE Koordinaten, mehrere Teile landeten auf
demselben Punkt; ein relativer Weg gehört zum Griff (Gizmo) und kommt mit B5/B7. Gegenproben: ohne `mehrfach` an „Löschen"
und ohne den Ergänzen-Zweig im Auswahl-Handler — rot.

### B6 — Der erste Schritt (2026-10-04)

Mit einem geladenen Modell steht die Tafel „Bauteil" offen (wenn rechts keine andere Tafel gewählt ist) — die Palette ist
sofort zu sehen. Messlauf: Klicks bis zur Palette **1 → 0**. Nicht gebaut, mit Grund: das Einpassen der Kamera (sie passt
nach dem Laden schon ein — `zoomToFit` über die geladenen Modelle, das Modell wirkt nur durch den 1,5-fachen Abstand klein)
und der Leitfaden-Satz (die Karte sagt beim Zeichnen schon „Punkte ins Gelände setzen — Enter schliesst ab, Esc bricht
ab"). Die verdeckte Fläche beim Start steigt 4,3 → 5,2 %: dieselben Leisten auf einer schmaleren Zeichenfläche.

