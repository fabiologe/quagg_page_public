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
