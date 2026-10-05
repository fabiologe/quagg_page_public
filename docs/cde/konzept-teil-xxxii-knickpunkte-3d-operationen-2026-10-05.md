# Teil XXXII — Knickpunkte überall und 3D-Operationen (Bestand und Vorschlag, 2026-10-05)

**Fabio (2026-10-05, nach der Abnahme von Teil XXXI):** „ein wichtiges feature wäre es knickpunkte hinzu fügen zu
können; aber auch andere 3D-Operationen wie zwei Objekte miteinander zu verschneiden etc was gibt es da alles" — dazu
die vier offenen Reste aus T9 (untere Leiste und kleine Ziele, Gizmo bei flachem Blick, Lageplan-Griffe in mm,
Knoten Punkt-an-Kante).

Jede Aussage sagt, woher sie kommt: **[gemessen]** = aus dem laufenden Katalog gezogen, **[gelesen]** = im Code
nachgesehen, **[eingeschätzt]** = Aufwand und Nutzen, nicht geprüft.

---

## 1 · Was es heute gibt [gemessen: `werkzeugKatalog()`, 157 Werkzeuge]

| Gruppe | Werkzeuge (ohne die 100 „… ändern"-Feldsetzer) |
|---|---|
| Zeichnen (20) | Linie, Fläche, Rohr, Schacht, Pfosten, Platte, Wand, Streifenfundament, Überlaufschwelle, Raum, Rechen, Drossel, Tauchwand, Sauberkeitsschicht, Bettung, Rigole, Schicht, Band, Raum in der Mulde, Rotstift |
| Lage (28) | Verschieben, Drehen, Spiegeln, Kopieren, Reihe, Auf Bauteil stellen, Löschen · Stützpunkt verschieben/einfügen/entfernen, Kante verschieben · Linie teilen/trimmen/versetzen/umkehren · Fläche teilen/versetzen/vereinigen · Haltung teilen, Schacht einfügen/verschieben/entfernen, An Schacht anschliessen, Trasse ändern · Bauwerk verschieben/kopieren/drehen/spiegeln |
| Gelände (10) | Graben ausheben, Auffüllen, Planum, Böschung, Gerinne · Kanalgraben, Bauwerksgrube, **Aussparung** ableiten · Knickpunkt verschieben (Erdbau), Vorgang entfernen |
| Sonst | 2 Bauwerke aus Vorlage, Bauwerk anlegen, Vorlage angleichen/lösen, Sohle ziehen, Körper tauschen, Merkmale (6) |

**Verschneiden gibt es schon — als Aussparung** [gelesen]: `aussparung-ableiten` rechnet A − B (Rohr durch Wand) als
Ableitung auf dem Server (`kernel.op('booleDifferenz')` → `backend/…/geometrie.py`, trimesh mit Volumenprüfung). Der
Server-Kernel kann ausserdem **Vereinigung** und **Schnittmenge** (`booleVereinigung`, `booleSchnitt`) — beide werden
heute nur intern genutzt (Kanalgraben: Strang + Baugruben als ein Körper), als Werkzeug gibt es sie nicht.

## 2 · Knickpunkte: wo es geht, wo nicht [gelesen]

**Geht** an eigenen Linien, Rohren, Wänden, Fundamenten, Platten, Flächen (`stuetzpunkt-einfuegen`, Bauform linie,
achse+profil, flaeche, flaeche+dicke): das „+" in jeder Kantenmitte (Tipp-Griff) oder „Stützpunkt einfügen" mit einer
Station; „−" im Eckmenü entfernt; seit T7 gehen Knoten mit. Ein Höhenknick (Sohle) = einfügen, dann den Höhengriff.

| # | Lücke | Wirkung | Aufwand [eingeschätzt] |
|---|---|---|---|
| **K1** | **Erdbau-Vorgänge, Schicht, Raum in der Mulde:** Ecken nur verschieben (`erdbau-stuetzpunkt-verschieben`), nicht einfügen oder entfernen — Umriss einer Grube, Achse eines Gerinnes, Böschungslinie, Umriss einer Schicht | eine Grube mit 4 Ecken bleibt ein Viereck | 1 Tag |
| **K2** | **Einfügen nur in der Kantenmitte** („+") — wer den Knick bei 3,20 m will, braucht das Formular | auf dem Tablet zwei Schritte statt einem | ½ Tag (Tipp auf die Kante → Station aus dem Tipppunkt; das Werkzeug kann es schon) |
| **K3** | **Lageplan:** dort stehen nur Schachtgriffe, keine Ecken/Kanten/„+" | im Plan wird nichts geknickt | 1 Tag (mit Griffen in Pixeln, Rest R3 unten) |
| K4 | **Gelieferte Bauteile:** kein Bauplan → kein Knick; für Haltungen gibt es „Trasse ändern" als Forderung | gewollt (nicht unseres) | — Empfehlung: nicht |
| K5 | **Knoten Punkt-an-Kante (T-Stoss):** ein Knick, der auf der Kante eines anderen Bauteils sitzt, ist kein Knoten | Wand an Wand (T) reisst ab | ½ Tag nach K2 |

## 3 · 3D-Operationen — was im Tiefbau Sinn hat

Hausgesetz bleibt: **Rezept statt Ergebnis** — eine Operation zwischen zwei Bauteilen wird eine Ableitung mit
Verweisen (wie die Aussparung), kein eingefrorenes Netz. Ändert sich A oder B, rechnet sie neu.

| # | Operation | Tiefbau-Beispiel | Bestand im Kern | IFC | Aufwand [eingeschätzt] |
|---|---|---|---|---|---|
| **O1** | **Verschneiden: Vereinigung · Schnittmenge · Differenz** zweier eigener Körper | Schacht + Gerinne als ein Körper, Fundament ∩ Gelände, Bauwerk − Aussparung | **fertig** auf dem Server (alle drei) | Netz (IfcTriangulatedFaceSet), Klasse von A; Quellen verborgen wie bei „Fläche vereinigen" | 1 Tag (Muster Aussparung) |
| **O2** | **Kollision als Befund** statt Geometrie: Schnittmenge zweier Körper messen | „Rohr kreuzt Fundament: 0,12 m³" — Befund mit Marke, nichts wird geändert | fertig (`booleSchnitt`) | keins (Prüfung) | 1 Tag |
| **O3** | **Am Gelände / an einer Ebene kappen** | Wand, Pfahl, Pfosten bis Geländeoberkante abschneiden | Gelände als Körper fehlt; Halbraum fehlt | Netz | 1–1½ Tage |
| **O4** | **Auf das Gelände legen (drapieren)** | Linie, Fläche, Pfosten, Bordstein folgt der Oberfläche | Linie kann es (`hoehenAus: 'gelaende'`), Sampler da | — | ½ Tag |
| **O5** | **Reihe entlang einer Achse** (Abstand, Anzahl, ausgerichtet) | Leitpfosten alle 50 m, Bäume an der Strasse | „Reihe" nur in fester Richtung; Stationierung im Kern | — | ½ Tag |
| **O6** | **Profil entlang einer Achse (Sweep)** — beliebiges Profil aus der Bibliothek | Rinne, Mulde, Bordstein, Leitplanke, Rechteckkanal | Sweep im Rezeptbau (Rohr, Rechteckkanal) | Netz / Extrusion | 1 Tag |
| **O7** | **Bis Objekt verlängern/trimmen** | Wand bis zur anderen Wand, Rohr bis zum Schacht | „Linie trimmen" nur um eine Länge | — | ½–1 Tag |
| **O8** | **Ecke verbinden (L-/T-Stoss)** | zwei Wände sauber stossen lassen | — (hängt an K5) | — | 1 Tag |
| **O9** | **Extrudieren** Fläche → Körper | gezeichnete Fläche wird Fundament/Becken | Platte deckt `flaeche+dicke` ab | Extrusion | ½ Tag |
| **O10** | **Aufspannen (Loft)** zwischen zwei Linien/Profilen | Übergangsbauwerk, Rampe, Böschungsfläche zwischen Ober- und Unterkante | — (Kernel neu) | Netz | 1½–2 Tage |
| O11 | Ausrunden/Fasen eines Achsknicks | Bogen in der Trasse | — | — | 1 Tag |
| O12 | Skalieren | selten fachlich richtig (eine Wand wird nicht 10 % grösser, sie bekommt eine andere Dicke) | — | — | Empfehlung: nicht |

## 4 · Die vier Reste aus Teil XXXI

| # | Rest | Vorschlag |
|---|---|---|
| R1 | Untere Leiste beim Formen (Mass · Rückgängig · Fertig) und 43 Ziele unter 40 px | Leiste hochkant über den Blattköpfen; die kleinen Ziele sind Tafel-Knöpfe (Kopf, Suche, Gruppen) → hochkant 44 px |
| R2 | Gizmo: Nord-Pfeil und Ebenenquadrat verkümmern bei flachem Blick | den Pfeil, der in die Tiefe zeigt, ausblenden und das Quadrat senkrecht zur Blickrichtung stellen (die zwei sichtbaren Achsen) |
| R3 | Lageplan-Griffe in Papier-mm | dieselben Pixelgrössen wie im Raum; zusammen mit K3 |
| R4 | Knoten Punkt-an-Kante | = K5 |

## 5 · Vorschlag Reihenfolge

1. **K1 + K2 + K5** — Knickpunkte überall (dein „wichtig"): Erdbau/Schicht/Raum einfügen/entfernen, Knick per Tipp auf
   die Kante, T-Stoss als Knoten. ≈ 2 Tage.
2. **O1 + O2** — Verschneiden als Werkzeug (der Kern ist fertig) und Kollision als Befund. ≈ 2 Tage.
3. **O4 + O5** — drapieren, Reihe entlang der Achse. ≈ 1 Tag.
4. **R1 + R2** — Bedienreste hochkant. ≈ 1 Tag.
5. Danach nach Bedarf: O6, O7, O8, O3, O9, O10, K3/R3.

## 6 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung |
|---|---|---|
| E-X1 | Ergebnis eines Verschneidens: lebendes Rezept (rechnet neu, wenn A oder B sich ändern) oder eingefrorenes Netz? | **Rezept** (wie die Aussparung) |
| E-X2 | Nach Vereinigung: A und B verbergen oder stehen lassen? | **verbergen** (wie „Fläche vereinigen"); das Ergebnis trägt die Klasse von A |
| E-X3 | Reihenfolge | wie § 5 |

## 7 · Entschieden (Fabio, 2026-10-05)

- **Reihenfolge:** alle vier Blöcke aus § 5 — Knickpunkte überall · Verschneiden + Kollision · Drapieren + Reihe an der
  Achse · Bedienreste hochkant.
- **E-X1:** das Ergebnis eines Verschneidens ist ein **lebendes Rezept** (wie die Aussparung); **E-X2** damit: A und B
  verborgen, das Ergebnis trägt die Klasse von A.

## 8 · Gebaut

### Block 1 — Knickpunkte überall (K1, K2, K5)

| | vorher | jetzt |
|---|---|---|
| Grube, Schüttung, Planum, Böschung, Gerinneachse, Schicht, Raum: Ecke einfügen | — (nur verschieben) | **„+" je Kante** (Tipp: Mitte) |
| … Ecke entfernen | — | **„−" am Eckmenü** (ein Ring behält 3, eine Linie 2) |
| Knick an beliebiger Stelle der Kante | nur Kantenmitte („+") oder Formular | **das „+" entlang der Kante schieben** — eingefügt, wo man loslässt; die Pille sagt „Station 3,00 m" / „ab Ecke 2 …" |
| Wand stösst gegen die Mitte einer anderen (T-Stoss) | riss beim Ziehen ab | **zieht mit**, an derselben relativen Stelle der Kante |

- **K1:** zwei Werkzeuge als DATEN (`setzt: { art: 'knickpunkt', aktion }`, allgemeine Operation bei den Setzern) — die
  Ratsche W5 (eigene `anwenden`) blieb bei 45, W7 ordnet sie über `setzt` ein; Formular ist der Griff
  (`eigeneOberflaeche`). Eingefügt wird hinter Ecke i, `abstand` Meter entlang der Kante; jede Zahl, die beide Nachbarn
  tragen (Höhe m NN, Geländeverweis, Sohlbreite), wird gemittelt — der Punkt liegt AUF der Kante, der Körper ändert
  sich erst beim Ziehen (gemessen: Aushub gleich). Die Griffe entstehen in einem Nachlauf über alle Erdbau-Eckgriffe
  (`Griffe.knickpunktGriffe`) — Punktlisten mit Höhe und Lagelisten ohne Höhe gleich.
- **K2:** „+"-Griffe tragen eine Gleitbahn (`gleiten`: Kante, Feld, Wert am Anfang); `useGriffe` lässt sie über der
  Zug-Schwelle auf der Kante gleiten (`Griffe.gleitpunkt`: Strahl → Ebene in Kantenhöhe → auf die Kante, 2 … 98 %).
  Weiter als drei Trefferflächen von der Kante losgelassen: nichts.
- **K5:** `Griffe.tStossPartner` (Punkt auf einer Kante, nicht an ihren Enden, auf die Netztoleranz, auch in der Höhe)
  → Partner der Ecken dieser Kante und der Kantengriffe daneben; EINE Regel für Ecke und T-Stoss
  (`_partnerNachziehen`: auf altem Eckpunkt → neuer Eckpunkt, auf alter Kante → dieselbe Stelle der neuen Kante).

Tests: `schichtGriffe.test.js` (+4: Griffe an Grube und Schicht, Einfügen in der Mitte mit gemittelter Höhe und
gleichem Aushub, Entfernen bis zum Dreieck, Geltung), `griffZahl.test.js` (+2: Gleiten auf Station 3,00; weit weg
nichts), `knoten.test.js` (+3: T-Stoss erkannt, Ecke und Kante gezogen). Gegenproben rot: keine „+/−"-Griffe, Höhe
nicht gemittelt, Dreieck schrumpft; Loslassen ignoriert die Gleitstelle, kein Gleiten, weit weg gilt; keine
T-Partner, nur Ecken, Eckgriff ohne T. Bewusst gedreht: Eckzählungen in `eckenRest`, `eckenZiehen`, `schichtGriffe`
(„+"/„−" kommen dazu); Katalog 157 → 159 (`strukturG0`, `reichweite` 134 → 136 ohne Oberfläche, je mit Probe);
`griffSofort` zieht den Tipp-Griff jetzt QUER zur Kante weg (das „+" gleitet längs). Suite 347 Dateien / 3 805 Tests.

### Block 2 — Verschneiden und Kollision (O1, O2)

| Gegen den laufenden Server-Kernel (Tabletlauf, Dev :3001 → quagg-api) | Ergebnis |
|---|---|
| Wand (9,64 m³) ∪ Sockel darunter (15,74 m³), per „Verschneiden" | **gebaut, 25,39 m³** (sie berühren sich nur — die Summe) |
| Rohr DN 300 quer durch eine 30-cm-Wand | **„Überschneidet sich mit ‚Querrohr': 0,020 m³"** an der Wand, umgekehrt am Rohr; Zähler „2 Befunde" (von Hand π·0,15²·0,3 = 0,021 m³, das Rohr ist ein Zwölfeck) |

- **O1 Verschneiden:** Ableitung `verschnitt` (Quellen A, B; Art vereinigung/schnitt/differenz → `booleVereinigung`/
  `booleSchnitt`/`booleDifferenz` auf dem Server), Klasse und Ausführung von A, Menge `netVolume`. Werkzeug als
  Daten-Setzer (`setzt: { art: 'verschnitt' }` — W5 bleibt), der zweite Körper über die Kandidaten `eigene:traeger`
  (V3, wie „Steht auf"). A und B werden verborgen, bleiben aber Quellen: ihr Körper kommt aus dem Bauplan (`formAus`),
  ändert er sich, rechnet das Ergebnis neu (Test: Sockel dicker → der Server bekommt den neuen). Leere Schnittmenge →
  Befund `verschnitt_leer`, kein stiller Nullkörper.
- **Grenze, ehrlich:** ein verborgener Körper ist kein Kommandoziel mehr (E8) — A oder B ändert man nicht direkt; sie
  folgen Folgen (aufstellen, Knoten, Rebase) und Rückgängig. Wer A umbauen will, nimmt das Verschneiden zurück. Ein
  Werkzeug „Verschnitt lösen" (Quellen wieder zeigen, Ergebnis weg) wäre der nächste Schritt — nicht gebaut.
- **O2 Kollision:** `services/Kollisionen.js` — eigene, sichtbare Körper aus dem Bauplan (ohne Räume, Ableitungen,
  Anzeigen), nur Paare mit überlappender Hülle gehen an den Server (`booleSchnitt`), bewusst Verbundenes (Knoten,
  T-Stoss) zählt nicht; ab 0,001 m³ ein Befund `kollision` (Warnung) an beiden. Der Viewer rechnet nach jedem Aufbau im
  Bearbeiten-Modus nach (gebündelt, die jüngste Rechnung gewinnt) und gibt sie an die Befundmarken (B7).

Tests `verschnitt.test.js` (6: Katalog, Kommando — beide verborgen, Klasse von A, ein Vorgang —, Ablehnungen, Lauf mit
Server-Attrappe, lebendes Rezept, leere Schnittmenge) und `kollisionen.test.js` (4: Rohr durch Wand, Knoten-Wände und
ferner Pfosten nicht, Verborgenes/Raum/kein Server, Viewer-Anbindung). Gegenproben rot: Klasse von B, Quellen sichtbar,
Art egal, leer still; nie verbunden, ohne Hüllenfilter, Raum zählt. Katalog 160, reichweite 137, `strukturG0` gezählt.

### Block 3 — Aufs Gelände legen und Reihe entlang einer Achse (O4, O5)

- **O4 Aufs Gelände legen:** Daten-Setzer `drapieren` (W5 bleibt) an eigenen Punkt-, Linien-, Achs- und
  Flächenbauteilen. Jeder Punkt kommt auf die Geländehöhe darunter, plus Abstand (negativ = darunter, etwa die Sohle
  einer Leitung). Die Lage bleibt, die Kennung bleibt. **Die Höhen stehen absolut im Kommando** (verborgenes Feld
  `hoehen`). Ein Skript nennt sie selbst; das Formular belegt sie aus dem Kandidaten `gelaende:hoehen` vor. Den
  speist der Viewer mit derselben Höhenabfrage wie beim Zeichnen (`setzeHoehenquelle` → `engine.hoeheAn`; der
  Sampler kennt nur Gelände, nie das Bauteil selbst). Damit lässt sich das Kommando wiederholen, auch wenn sich das
  Gelände später ändert, und Wächter W9 bleibt grün: das Werkzeug liest kein Viewer-Feld am Subjekt. Fehlt die
  Höhe unter einem Punkt, wird das Kommando abgelehnt: „kein Gelände gelesen". Liegt das Bauteil schon dort, gibt es
  keinen Schritt. Das Werkzeug wirkt auf ein Ziel (ohne `mehrfach`), weil die Höhen zu genau einem Bauteil gehören.
- **O5 Reihe entlang einer Achse:** Das vorhandene Werkzeug „Reihe" hat drei neue Felder: `entlang` (Kandidat
  `eigene:achse`: eigene, sichtbare Baupläne mit offener Punktliste, also nicht das Subjekt und keine Fläche),
  `abstand` und `ausrichten`. Gemessen wird ab dem Lotpunkt des Originals auf der Achse (Schwerpunkt im Grundriss).
  Die Kopien stehen bei `s₀ + k·Abstand`, solange die Achse reicht (`stationiere`/`ortBei` aus dem Kern). Mit
  „ausrichten" wird jede Kopie **um ihren Lotpunkt** mit der Achsrichtung gedreht. Dadurch bleibt ein Leitpfosten
  rechts der Fahrtrichtung auch nach einem Knick rechts davon. Die Höhe folgt der Achse. Ohne `entlang` bleibt die
  Reihe gerade wie bisher (Ost/Nord). Kein neues Werkzeug.

Test `drapierenReihe.test.js` (8):
- O4: Höhen + Abstand, Lage und Kennung bleiben; fehlende Höhe wird abgelehnt, nichts geschrieben; schon dort heißt
  kein Schritt; Katalog und Vorbelegung aus einer schiefen Ebene.
- O5: Achskandidaten; L-Achse 40 + 30 m mit Abstand 25 m: Station 25 bei (25 | +2), Höhe 101,25; Station 50 nach dem
  Knick bei (42 | −10), gedreht; ohne Ausrichten bei (40 | −8); gerade Reihe unverändert.
- Viewer-Anbindung.

Gegenproben rot:
- Drehung um den Schwerpunkt statt um den Lotpunkt: der Pfosten dreht sich auf der Stelle, die Kopie nach dem Knick
  liegt links statt rechts.
- `null` als Höhe 0.

Zahlen: Katalog 161, Setzer 92, Reichweite 161/138, angeboten +1 an Wand/Rohr/Platte.

### Block 4 — Bedienreste hochkant (R1, R2)

- **R2 Gizmo bei flachem Blick:** In jedem Bild (`onBeforeRender`) prüft der Gizmo die Blickrichtung (`gizmoImBlick`,
  rein):
  - Ein Pfeil, dessen sichtbarer Anteil unter 0,3 fällt (er zeigt fast in die Tiefe), schrumpft und ist nicht mehr zu
    treffen. Er schrumpft statt `visible = false`, damit er zurückkommt, sobald sich der Blick dreht. Von der Seite
    bleiben Ost und Höhe, von oben Ost und Nord, schräg alle drei.
  - Das Ebenenquadrat stellt sich zur Kamera, sobald der Blick flacher als ~20° ist. Es zieht weiter in der
    Waagerechten (der Zug rechnet dann aus dem Bildschirm, wie bisher). Nur das Bild kippt.

  Gemessen (`gizmoFlach.test.js`, Hochkant-Fläche 820 × 955, Blick 4° nach Norden): Quadrat **40 px² → 603 px²**
  (von oben 597); Nord-Pfeil ausgeblendet, ein Tipp auf den Ursprung trifft ihn nicht. Gegenprobe ohne die Kur: beide
  Tests rot.
- **R1 Formleiste und Fingerziele hochkant:**
  - `components/CdeFormleiste.vue` zeigt beim Formen (Bearbeiten an, Bauteil gewählt, kein Zeichnen, kein Messen;
    dieselbe Bedingung, unter der die Blätter einklappen) unten die Pille mit dem Maß. Das ist, was der Finger gerade
    zieht, sonst die letzte Rückmeldung, sonst der Name. Daneben **Rückgängig** (gibt erst das Serien-Werkzeug frei)
    und **Fertig** (Werkzeug ab, Auswahl leer, die Blätter klappen auf). Sichtbar nur bis 900 px Breite; die
    Kontextleiste rückt dann darüber.
  - Dazu eine Regel in `styles/theme.css`: Bei grobem Zeiger und bis 900 px hat jedes Ziel in der CDE seine
    **Layoutgröße** 44 × 44 (nicht eine unsichtbare Hülle, damit die Messung dieselbe Größe sieht wie der Finger).
    Ausgenommen sind Kästchen, Radioknöpfe und Unsichtbares. Quer und mit der Maus ändert sich nichts.

  Gemessen (Browserprobe iPad hochkant 820 × 1180, ohne Projekt, Wand gewählt, „Verschieben" offen): Ziele unter
  40 px **43 von 69 → 0 von 63** (übrig nur das unsichtbare Datei-Eingabefeld, `sr-only`). Beim Formen mit
  eingeklappten Blättern: 10 → 0. Bilder ohne Layoutbruch: Tafel mit 44-px-Zeilen, Kontextleiste über der
  Formleiste. Test `formleiste.test.js` (5).
- **O4 im Browser nachgeprüft:** Wand mitten auf dem Gelände, „Aufs Gelände legen" mit Abstand 0,5 m. Vorbelegte
  Höhen [0,03 | 0,15], danach Punkthöhen [0,53 | 0,65], gleich der Kontrolle aus dem Sampler.
  - **Gefunden:** Die Vorbelegung war leer, weil `hoeheAn` nur einen fertigen Sampler liest und jeder Aufbau ihn
    verwirft. Der Viewer baut ihn jetzt nach jedem Aufbau vor (Test hält die Zeile).
  - Ohne Gelände unter dem Bauteil (erste Probe): die Ablehnung „kein Gelände gelesen", wie vorgesehen.
