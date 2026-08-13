# flood-3D — Testrunden- und Dokumentations-Checkliste

Stand: 2026-08-11 (`flood3d-v1.0-beta` + Parallel-Meshing) · Vollständiges
Inventar aller Bedienelemente und Rechenwege — zum Abhaken und als Grundlage
für die Nutzer-Doku. Reihenfolge = typischer Arbeitsablauf.

Legende: ☐ offen · ✅ getestet · ✍ Notiz nötig

---

## 0 · Startseite (Projektliste)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ Projektkarte (Klick) | öffnet den Fall im Arbeitsbereich | Rentrisch-Fall öffnen; Szene, Baum, Panel gefüllt |
| ☐ **Neues Projekt** → Name → **Anlegen** | legt leeren Fall an (Standard-Domain/Gelände) | anlegen, öffnen, wieder löschen |
| ☐ Projekt `verifikation-wehr` | der physikalische Referenzfall — normal anwählbar | öffnen; Wehr quer im Gerinne sichtbar |

## 1 · Kopfleiste (Flood3DPreMain)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ **←** | zurück zur Projektliste | alter Fehlertext darf NICHT auf der Startseite kleben |
| ☐ Phasen **Modell / Simulation / Läufe (n) / Ergebnis** | Arbeitsbereich wechseln | alle vier durchschalten |
| ☐ **↶ / ↷** (auch Strg+Z/Y) | Undo/Redo — JEDE Modelländerung ist ein Schritt | Wand ziehen → ↶ → ↷; auch nach Löschen und Rezept |
| ☐ Speichern-Knopf | PUT + Prüfung; liefert Geometrie in einem Roundtrip | dirty-Marker verschwindet |
| ☐ Meldungsleiste | EIN Meldungsweg; Erfolg/Hinweis räumen sich weg, **Warnung und Fehler bleiben stehen** (✕ zum Schließen) | Warnung provozieren (z. B. kaputte Vorschau) |

## 2 · Objektbaum (links)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ **⬇ Geometrie importieren** | DXF/STL/OBJ/ASC/XYZ-Import-Dialog | siehe Pipeline P1 |
| ☐ **＋ Neu anlegen** (eine Auswahl) | Katalogvorlagen ALLER Gruppen + Rezepte | je Gruppe eine Vorlage einsetzen: Geländeoperation (inkl. **Bruchkante**), **Vermessungskante** (neu!), Bauwerk, Verfeinerung, Vorfüllung, Randbedingung, Querschnitt, Pegel, Nachweiskriterium |
| ☐ Rezepte im ＋-Menü (6) | Straßenablauf, Drosselschacht, Trennbauwerk, Tosbecken, Absturz, Pumpensumpf — Anordnung in einem Zug | jedes einmal einsetzen; ⚒-Gruppe erscheint, Teile benannt |
| ☐ Rezept-Gruppe **✕** | löscht das GANZE Rezept (ein Undo-Schritt, Aufräumkaskade) | einsetzen → löschen → ↶ |
| ☐ Objekt anklicken | selektiert (Szene + Panel folgen) | Chip-Farbe = schlimmster Prüfbefund |
| ☐ Objekt **✕** | löscht mit Aufräumkaskade (verwaiste Verweise/Verfeinerungen gehen mit) | Pegel löschen, an dem ein Kriterium hängt |
| ☐ **↻ Neu ableiten** (Import) | Reapply: baut alle Objekte des Imports bitidentisch neu | nach Rollenänderung |
| ☐ **⇄ Kanten verknüpfen** | leitet aus Vermessungskanten-Rollen Objekte ab | Kante mit Rolle „mauer" → Wand entsteht |
| ☐ ⬢ Erdkörper-Badge | zeigt an, WARUM der Fall einen Erdkörper braucht | Tooltip lesen |

## 3 · 3D-Editor (Mitte)

**Werkzeugleiste:**

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ **☑/☐ Auswählen** | Auswahl-Sperre: aus = Klicks/Züge gehören NUR der Kamera | aus → nichts selektierbar, Pan/Orbit ungestört |
| ☐ **· Ecke / ▬ Kante** | Strg-Höhenzug: einzelne Ecke oder ganze Kante (Wand/Wehr/Durchlass/Rechen/Bruchkante) | Wand: eine Ecke heben vs. ganze Krone heben |
| ☐ **⭙ Stanzen … (Esc)** | erscheint während der Klick-Platzierung | siehe Panel ✎-Knöpfe |
| ☐ **Draufsicht** | koordinatentreue Top-Ansicht (Rotation gesperrt) | rein/raus, Kamera kehrt zurück |
| ☐ **Netz** | zeigt das ECHTE snappy-Vorschaunetz; ohne Netz: Knopfzeile **▦ Netzvorschau rechnen** / **⚡ Schnell ohne Verfeinerung** | siehe Pipeline P2 |
| ☐ **Freischneiden** | Klemm-Ebene der Ansicht (x/y-Schieber + Richtung) | Beckeninneres freischneiden; Aus = Ebene weg |

**Maus/Tastatur im Editor:**

| Interaktion | Soll | Prüfschritt |
|---|---|---|
| ☐ Linksklick | wählt; **Klick ins Leere = abwählen** | auch Esc wählt ab |
| ☐ Rechtsklick-Drag | Pan — immer, auch über Objekten | kein Kontextmenü, kein Zittern |
| ☐ Mausrad | Zoom; Drehpunkt ankert am GESTEN-Anfang | kein Springen beim Durchscrollen |
| ☐ Doppelklick | zentriert Kamera auf Geländepunkt | |
| ☐ Ecken-Griffe ziehen | Raster-/Punktfang, Alt = frei, **Strg = Höhe**; Klemmung an der Domain (Durchlass darf Mündungs-Überstand) | Wand-Ecke aus der Domain ziehen → stoppt am Rand |
| ☐ ＋-Zwischenpunkte | Klick-Zug fügt Ecke ein | |
| ☐ Entf | löscht Ecke unterm Cursor bzw. Bearbeitungs-Marker | |
| ☐ Strg+D | dupliziert das gewählte Objekt versetzt | |
| ☐ Shift/Strg+Ziehen am gewählten Körper | verschiebt ganzes Objekt (Strg = Höhe) | Vorschau flott (Körper-Cache: nur das Gezogene baut neu) |
| ☐ Domain-Griffe (8) + Dreh-Gizmo | Gebiet ziehen; **Drehen dreht das MODELL** | drehen → Kur-Meldungen prüfen |
| ☐ Randbedingungs-Marker ziehen | Fenster entlang der Kante, über Ecken auf andere Seiten | |
| ☐ **Rechen: 5. Griff** (Oberkanten-Mitte) | kippt die Ebene (Unterkante = Scharnier); orange **Porositätszone (0,15 m)** kippt mit | |
| ☐ **Vorfüllung** | Wasserebene sichtbar; Ecken ziehbar, **Strg-Zug stellt den Spiegel** | |

**Gelände formen (Pinsel — über „🖌 Gelände formen" im Gelände-Panel):**

| Element | Soll | Prüfschritt |
|---|---|---|
| ☐ ▲ Heben / ▼ Senken / ≈ Glätten | Delta aufs Höhenraster, live | |
| ☐ **⌇ Bruchkante** | Ring wird GRÜN an Vermessungskanten UND Baum-Bruchkanten; Gelände wird im Pinsel AUF Kantenhöhe GESETZT | zweiter Strich ändert nichts (idempotent) |
| ☐ Ø/Stärke-Regler, ◯/▢ | Pinselform | |
| ☐ **↩ Strich** | inverses Delta (eigener Undo-Weg!) | |
| ☐ **✓ Fertig** | beendet Formen | Erdkörper-Fälle: Deckfläche zieht mit |

## 4 · Eigenschaften-Panel (rechts)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ ℹ | Lehrtext je Objekttyp ein/aus | |
| ☐ Felder + Punktliste | Zahlen/Enums/Stützpunkte (Hover zeigt Punkt in der Szene; **Fenster-Punkte: Spalten „Kante/Höhe", KEIN Szenen-Marker**) | |
| ☐ **{ } JSON ↔ ↩ Maske** | Rohbearbeitung je Feld (Expertenweg) | |
| ☐ **⇄ Seite wechseln** | Randbedingung auf die nächste Gebietsseite | |
| ☐ Fenster-Auswahl | ganze Fläche / Rechteck / Kreis / Trapez / **Polygon (Ecken ziehen)** / **Polygon-Vorlagen Ei/Maul/Tropfen** / an Gerinne/Stutzen gekoppelt | Vorlage einsetzen → wird als Polygon geführt |
| ☐ **＋ Verfeinerungsbox ans Fenster** | Box um die Öffnung | |
| ☐ **✎ Bohrung / ✎ Öffnung / ✎ Zuschnitt** | Klick-Platzierung am Körper (Mausrad = Maß, Shift+Rad = Höhe) | Bohrung setzen, Marker nachträglich verschieben |
| ☐ **＋ Gelände / ＋ Auf Gebiet / ＋ Lage / ＋ Heilen** | Bearbeitungs-Stapel (EditListe: ↑↓ Reihenfolge, ✕). **Heilen repariert das NETZ** (Löcher schließen), es nimmt keine Bearbeitungen zurück | Heilen an löchrigem Import: Prüfbefund „nicht wasserdicht" verschwindet |
| ☐ **↺ Alle Bearbeitungen entfernen** | nimmt die MODELLIERUNG zurück — Rohzustand des Körpers, ein Undo-Schritt | mehrere Bohrungen setzen → entfernen → Strg+Z holt sie zurück |
| ☐ Rechen-Panel | NUR Stabform/Teilung/Winkel/Verlegungsgrad + Kirschmer-Hilfetext (d/f versteckt, solange 0) | |
| ☐ Gelände-Panel | Erdkörper-Schalter; „Sohle Erdkörper"-Felder sind RAUS | |
| ☐ **Übernehmen / 🗑** | Änderungen anwenden / Objekt löschen | |

## 5 · Prüfung & Kuren (ValidationPanel)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ Befund-Klick | springt zum Objekt | |
| ☐ **⚕ Kur-Knopf** je Befund | Ein-Klick-Reparatur; Befund MUSS danach weg sein | **„In das Gebiet einpassen"**: Wand teils rausziehen (YAML/Panel) → Kur kappt am Rand |
| ☐ Kur **„Körper heilen"** | erscheint bei nicht wasserdichten Körpern (Regel war bis 2026-08-11 wirkungslos) | löchrige STL importieren → Befund + Kur → danach dicht |
| ☐ **⚯ Anschlüsse herstellen** | Stutzen/Gerinne an die Randfläche, Boxen ins Gebiet | |
| ☐ Komplett-draußen-Objekt | FEHLER blockt Lauf + Netzvorschau (422); Bauwerk wird NICHT an den Solver übergeben; andere Körper bleiben sichtbar | |

## 6 · Phase Simulation

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ Parameterformular | Dauer, Intervalle, Kerne … mit Live-Einordnung (rot = nicht startbar) | |
| ☐ Regelwerks-Auswahl | Mehrfachauswahl → landet im Ergebnis | |
| ☐ **Netzvorschau** (auch ↻ auf der Karte) | Zellzahl, checkMesh, Dauer-/Kostenschätzung | Karte zeigt „ohne Verfeinerung"-Kennzeichnung beim Schnellweg |
| ☐ **Physikalische Verifikation** (Karte) | bestanden/nicht, C_d gegen Band, Zellen, Prüfdatum | nach Verifikationslauf aktuell |
| ☐ Rechenort **Server / Lokal** | Serverlauf vs. Companion | siehe P3/P4 |
| ☐ **Lauf starten** | gesperrt bei Fehler-Befunden; Doppelklick startet nur EINEN Lauf | |
| ☐ **▶ … fortsetzen (n MB)** | unterbrochenen lokalen Lauf wiederaufnehmen | |

## 7 · Phase Läufe / Ergebnis (PostViewer)

| Element | Was es tut | Prüfschritt |
|---|---|---|
| ☐ Laufliste: Checkboxen | Mehrfachauswahl → Diagramme überlagern (Strichmuster je Lauf) | |
| ☐ Chips **hängt? / verfallen / ohne Auswertung / abgebrochen** | Ehrlichkeits-Marker | verfallen: Companion-Reservierung > 7 Tage |
| ☐ 🗑 je Lauf | löscht Lauf samt Feldern (Rückfrage) | |
| ☐ **Nachweis** (Targets) | Kennwert/Grenzwert/Ausnutzung/Bewertung + Regelwerk | |
| ☐ **Bilanz / Verweilzeit / Qualität** | Ampeln lesen die FALL-Kriterien (kurzschluss/massenbilanz), sonst Vorbelegung | Kriterium ändern → Ampel folgt |
| ☐ **Zeitreihen** | gemeinsamer Zeitcursor; **Kraft/Moment: Betrag/Druckanteil/Reibungsanteil**; C_d je Wehr (auch OHNE Kriterium, wenn 1 Querschnitt + 1 Pegel); CSV-Export je Diagramm | |
| ☐ **Grundriss** | Tiefe/\|U\|/Sohlschub, WSP-Höhenlinien, Pfeile; Längsschnitt per 2 Klicks (**Schnitt entfernen**) | |
| ☐ **Raum (3D)** | Wasserkörper, Isoflächen, Schnittebene + Ebenenstapel, Pfeile, Stromlinien, **Punktabfrage** (Spiegel/Tiefe/Froude = gleiche Regel wie Karten), Kamera **Speichern/Zurücksetzen** (je FALL), **PNG exportieren** | |
| ☐ **Extremwerte / Abbildungen** | Tabelle; server-gerenderte PNG/SVG | |
| ☐ **Lauf & Log** | Manifest-Kacheln inkl. **Ist-Kosten**, Gelände-/Feldfehler-Warnzeilen, Viz-Selbsttest; Log-Tail live; **✕ Lauf abbrechen** | Abbruch → Status `abgebrochen`, kein `failed` |

---

## P · Pipelines (Rechenwege)

**P1 — Geometrie-Import:** Datei wählen (Beispiele: gelaende_bauwerke.dxf, koerper.stl, problemfall.dxf, boeschungskanten.dxf) → Kandidaten + Rollen-**Vorschlag** → Zuordnung je Kandidat → Anwenden → Objekte mit Herkunfts-Badge; „↻ Neu ableiten" reproduziert bitidentisch. ☐
**P2 — Netzvorschau (NEU: parallel):** „Netz" → ▦ voll ODER ⚡ ohne Verfeinerung → blockMesh → **snappy auf 4 Kernen** → checkMesh → Netz in der Szene + Kostenkarte; Fehler-Befunde blocken mit Klartext (422); Doppelstart → 409. ☐
**P3 — Serverlauf:** Lauf starten → Status building→meshing→solving→…→completed; Log live; **✕ Abbrechen** killt den Container sauber; Ist-Kosten im Manifest. ☐
**P4 — Companion-Weg (e2e auf DEINEM Rechner):** Rechenort Lokal → Bundle lädt → Companion rechnet (Pause/Fortsetzen) → Import-chunk → Lauf erscheint als completed mit Feldern. ☐
**P5 — Verifikation:** `FLOOD3D_VERIFIKATION=1 pytest …/test_verifikation.py` (Server, ~1 h) → Karte aktualisiert + Fall `verifikation-wehr` + Lauf anwählbar. ☐
**P6 — Modell drehen:** Dreh-Gizmo am Gebiet → Modell dreht, Gebiet legt sich neu, Anschluss-Kuren laufen; Gelände wird vom ORIGINAL abgetastet (kein Verwaschen). ☐
**P7 — Kur-Runde:** absichtlich Befunde bauen (Box raus, Bauwerk in der Luft, Rohr vergraben, Objekt teils draußen) → jede Kur beseitigt ihren Befund. ☐

---

*Gefundene Fehler bitte je Zeile mit ✍-Notiz — die Runde wird wie gehabt als
Fahrplan-Eintrag nachgezogen.*
