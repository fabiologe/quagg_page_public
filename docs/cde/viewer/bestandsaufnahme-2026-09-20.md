# Bestandsaufnahme Viewer — Auswahl, Bearbeiten, Rückmeldung, Gelände, Befunde

Stand 2026-09-20, Zweig `cde-verbundexport` (`89fdf6a`). Beschreibend; geändert wurde am Code nichts.
Pfade ohne Präfix liegen unter `client/src/features/cde/`.

## 0 Wie gemessen wurde — und was das für die Aussagen heißt

- **Dev-Server:** auf `:3000` lief nichts. Benutzt wurde der laufende Vite auf `127.0.0.1:3001` (gleiches Arbeitsverzeichnis, läuft seit 09.09.).
- **Browser:** Headless-Chrome 148 mit Software-Renderer (SwiftShader), 1400 × 900, echte Maus- und Tastenereignisse. **Nicht Firefox.** Alles, was Farbe, Deckkraft oder Malreihenfolge betrifft, gilt für diesen Browser.
- **Projekt 42069** wurde nur angesehen. Sein Satz „Durchstich Verbund" enthält ein Modell in Millimetern, das die Bearbeitung sperrt (`bilder/beleg-mm-sperre-42069.png`). Das Entladen dieses Modells hätte den Schlüssel „zuletzt offene Modelle" im Projekt-Repo neu geschrieben und wurde deshalb **nicht** ausgeführt; „In Meter umrechnen" (merkt die Lesart je Datei) ebenfalls nicht. In 42069 ist nichts verändert.
- **Alle Handlungen** liefen in einer Sitzung **ohne Projekt**. Dort ist das Repo die IndexedDB des Browserprofils (zur Laufzeit geprüft: `repo.remote === false`, Backend `IndexedDbBackend`; die Seite sagt selbst „Nur im Browser gespeichert — kein Projekt geöffnet"). Das Profil ist ein Wegwerfprofil und mit dem Browser verschwunden.
- **Modelle:** `test/IFCOUT_Entwässerung Export .IFC` (IFC2X3, 37 von 74 Bauteilen Proxys), `test/BIM26_Gruppe5_BODEN_Erdarbeiten.ifc`, für das Gelände `backend/app/ifc/tests/daten/erdbau_vergleich.ifc`.
- **Folge der Modellwahl:** das Kanalmodell lieferte 0 Haltungsachsen und 0 Schachtknoten (Proxys ohne Bauformregel). Der Längsschnitt war deshalb ausgegraut, Schacht-, Sohl- und Deckelgriffe sowie Befunde an Haltungen gab es nicht zu sehen.
- **Kennzeichnung:** **[gesehen]** = im Browser beobachtet oder gemessen. **[Code]** = nur gelesen, nicht gesehen. **unsicher** steht dort, wo ich es bin.
- Die Browser-Konsole blieb über die ganze Sitzung fehlerfrei (einzig `favicon.ico` 404).

## 1 Auswahl

**Wie wird ausgewählt**
- Klick im 3D **[gesehen]**: wählt das Bauteil, öffnet rechts die Tafel „Bauteil", setzt eine HUD-Pille ans Bauteil („BUILDINGELEMENTPROXY Schacht ⌄"). Klick ins Leere wählt ab. Ein Zeiger-Stapel auf `pointerdown/move/up`, Klick-Toleranz 8 px, Treffer über Mittelstrahl + 12 Randstrahlen, Rang Bauteil < Erdkörper < Gelände **[Code]** — `services/IfcSelectionHandler.js:47,96-100,270-292`, `services/IfcEngine.js:1098-1210`, `services/Auswahlrang.js:24-82`.
- Durchtippen (nochmal an derselben Stelle → nächster Kandidat) **[Code]**. Im Versuch blieb es dreimal beim Schacht; dahinter lag nichts, das ist also kein Gegenbeweis.
- Rahmen **[gesehen]**: Shift + Ziehen, gestrichelter Rand und durchscheinende Füllung in Akzentblau (`bilder/beleg-rahmen.png`). Links→rechts fing nur den ganz umschlossenen Schacht (1), rechts→links alles Berührte (3). Kein Lasso **[Code]** — `IfcSelectionHandler.js:195-198,366-411`, `IfcEngine.js:1357-1392`.
- Baum **[gesehen]**: Klick auf einen *Geschoss*knoten unterstreicht die Zeile und zeigt das Auge, sonst nichts. Klick auf ein *Bauteil*-Blatt zoomt auf das Bauteil (`bilder/beleg-baumklick.png`) — die Tafel „Bauteil" geht dabei **nicht** auf, `selectedElement` und `bearbeitung.bauteil` bleiben leer. Beim Gelände gesehen: der Zoom-Weg färbte dessen Kanten hellblau (Engine-Auswahl), während Tafel und HUD-Pille weiter „Schacht" zeigten. Weg: `IfcSpatialWindow.vue:156-159` → `viewerApi.zoomToLocalId` `IfcViewer.vue:1673-1676`. Der vollständige Weg `waehleBauteil` (`IfcViewer.vue:1802-1812`) wird nur vom Cockpit benutzt **[Code]**.
- Befehlspalette (Strg+K/F), Kostengruppen-Liste, „Verbundenes wählen" in der HUD-Pille **[Code]** — `ui/CdeCommandPalette.vue:88-155`, `IfcPlanningCockpit.vue:268-279`, `CdeHudLayer.vue:82-91,192-204`.
- Aus anderer Ansicht **[Code]**: der Lageplan setzt keine Bauteilauswahl (`IfcPlanCanvas.vue:680-760`), der Längsschnitt liest sie nur (`LaengsschnittCanvas.vue:14-19,365`). Ein Klick in den Plan ließ die Auswahl unverändert **[gesehen]**, der Plan war dabei aber noch im Aufbau — schwacher Beleg.

**Was sich sichtbar ändert**
- Am Bauteil laut Code ein heller durchscheinender Schimmer (`SELECTION_STYLE` 0.72/0.88/1.0, Deckkraft 0,55, `IfcEngine.js:60-65`). **[gesehen]:** am grauen Schachtkörper war **kein Farbwechsel messbar** — Pixel vor dem Klick, beim Hover und nach dem Klick je ≈ (85, 85, 85); auch bei drei gewählten Bauteilen nicht. Ob das am Modell oder am Software-Renderer liegt: **unsicher**.
- Gelände wird nicht gefüllt, seine Dreieckskanten werden hellblau (`#4fc3f7`) **[gesehen]**, `bilder/beleg-gelaende-kantenauswahl.png` — `services/GelaendeKanten.js:42-46,257-280,374-383`.
- Am Rest: nichts, kein Abdunkeln **[gesehen]**. `dimmen` gehört zur Vorschau, nicht zur Auswahl **[Code]** (`services/Vorschau.js:53-60`).
- Die Tafel öffnet sich und verkleinert das Bild; der Bildausschnitt verschiebt sich dabei **[gesehen]**.

**Hover [gesehen]:** kein Farbwechsel am Bauteil, kein Tooltip. Die Zeigerklasse wechselt von `zeiger--auswahl` auf `zeiger--hover` (laut CSS weißer → grüner Ring, `IfcViewer.vue:3055-3066`); unten erscheint die Koordinatenleiste „Projekt E 410892.550 m N 5475914.724 m H 245.919 m EPSG:25832". Zielmarke und Pille am Zeiger gibt es nur mit scharfem Werkzeug. Auf Touch abgeschaltet **[Code]** — `composables/useZeiger.js:43-104`.

**Mehrfachauswahl [gesehen]:** nur über den Rahmen (und „Verbundenes wählen" **[Code]**); Shift/Strg-Klick addiert nicht **[Code]**. Sichtbar: Banner in der Tafel „3 Bauteile gewählt. Auf alle wirken: Kostengruppe setzen, Umbenennen, … Alles Übrige nur auf „Schacht"." (`bilder/beleg-mehrfachauswahl.png`), HUD-Pille nur am ersten, keine Sammelwerte. Gespeichert in `IfcEngine._selectedItems` und `useBearbeitung.bauteile` — `stores/useBearbeitung.js:53-68,361-370`, `CdeToolbox.vue:99-105,443-458`.
- **[gesehen]** Nach **H** (ausblenden) sind Engine-Auswahl und `selectedElement` leer, `bearbeitung.bauteile` hält weiter 3, und das Banner „3 Bauteile gewählt" bleibt stehen — auch nach Shift+A. Erst ein Klick ins Leere räumt es.

**Filter, Isolieren, Ausblenden [Code, bis auf H/Shift+A]:** Auswahl ausblenden **H**, isolieren **I**, alles zeigen **Shift+A**; Kategorie/IFC-Klasse, Geschoss (Alle/Solo/Bis), ganzes Modell, Baumknoten und Erdbau-Vorgang je per Auge; Textfilter im Baum. Kein Filter nach Fachbereich, Status oder Eigenschaft. — `IfcEngine.js:854-945,2011-2058`, `IfcViewer.vue:2217-2228,2827-2871`, `IfcLayerPanel.vue`, `IfcStoreyNav.vue`, `IfcSpatialWindow.vue:11-47,105-130`.

**Über mehrere Ansichten [Code]:** drei Träger — `IfcEngine._selectedItems` (Hervorhebung), `useIfcStore.selectedElement` (Tafel, Pille), `useBearbeitung.bauteil/bauteile` (Werkzeuge, Befunde, Längs-/Querschnitt). Der Längsschnitt zeichnet das gewählte Segment dicker und passt sich neu ein (`LaengsschnittCanvas.vue:365,422`). Klick zoomt nicht, setzt nur den Orbit-Drehpunkt (`IfcEngine.js:1135-1139`).

**Bauteilfenster [gesehen]** = Tafel „Bauteil" (`CdeToolbox.vue` → `IfcSemanticWindow.vue` → `IfcSidebar.vue` → `PsetBrowser.vue`): Name, IFC-Klasse; Werkzeuggruppen „Immer möglich" und „Weil Koerper" bzw. „Weil Hoehenfeld"; „Merkmale" mit „+ Pset", Entity-Karte (Klasse, Fachbereich-Etikett), Name, `_localId`, `_guid`, GlobalId, PredefinedType, Psets; beim Erdkörper eine Mengenkarte (Aushub gewachsen/lose, Auflockerung, Gegenprobe Körper ↔ Raster); „Warum diese Werkzeuge?", „Hier nicht möglich (45)". In der Pset-Liste „ProVI" überdrucken sich Bezeichner und Wert („PVI_BEZEICHNUN**Demo**OJEKT"). Achse/Gefälle/DN und Befunde mit Kur **[Code]** (`CdeToolbox.vue:191-227`).

## 2 Bearbeiten im Viewer

**Einstieg [gesehen]:** Knopf „Bearbeiten" (Taste E). Danach `modusAn = true`, der Knopf ist blau hinterlegt, sein Titel lautet „Bearbeitung sichern oder beenden [E]". Das Rahmen-Element `.bearb-rahmen` (2 px `rgb(79,195,247)`, deckungsgleich mit dem Bild, z-index 6) und die Marke „Bearbeitung" (`.bearb-marke`, z-index 7) stehen im DOM — **im Bild sind sie nicht zu sehen**: Randpixel = Hintergrund (32, 41, 50), auch Minuten später; `elementsFromPoint` führt den WebGL-`CANVAS` über `.bearb-marke` (`bilder/beleg-bearbeiten-an.png`). Gemessen im projektlosen Layout unter Headless-Chrome; im Projekt-Layout und in Firefox **unsicher**. Sperrgründe: kein Modell, Millimeter-Modell **[gesehen in 42069]**, Status Published/Archived, laufendes Nachspielen **[Code]** — `IfcViewer.vue:256-292,1391-1429,2818,3003-3014`, `stores/useBearbeitung.js:147,439-444,522-525`.
- Die Werkzeugknöpfe der Tafel sind bei ausgeschaltetem Modus nicht deaktiviert **[gesehen]**; was ein Klick dann tut, habe ich nicht probiert.

**Direkte Handlungen (Griffe)** — jeder Griff bedient einen Katalogeintrag, `services/Griffe.js:86-331`, `composables/useGriffe.js`:

| Handlung | Griff | Werkzeug | |
|---|---|---|---|
| Ganzes Bauteil verschieben, Ost/Nord/Höhe | Kugel am Körper, XYZ | `verschieben` | **[gesehen]** |
| Erdbau-Ecke ziehen (Rand und Sohle), XZ | Kugel je Ecke, nur nach „Ecken ziehen" | `erdbau-stuetzpunkt-verschieben` | **[gesehen]** |
| Höhe einer Ecke | kleiner Nebengriff, Y | dito | **[gesehen als Griff, nicht gezogen]** |
| Schacht verschieben, XZ | Kugel am Knoten | `schacht-verschieben` | [Code] |
| Stützpunkt/Kante eigener Bauteile, XZ (Shift → Y) | Kugel an Ecke/Kantenmitte | `stuetzpunkt-`/`kante-verschieben` | [Code] |
| Stützpunkt entfernen / einfügen | Würfel, Tipp | `stuetzpunkt-entfernen/-einfuegen` | [Code] |
| Drehen | Kugel auf Kreisbahn, 5°-Raster | `drehen` | [Code] |
| Maß-Ecken (Sohlbreite, Böschung, Arbeitsraum) | gleitet auf einer Linie | `erdbau-mass-setzen` | [Code] |
| Sohl-, Deckel-, Bezugshöhe | Y-Griff, teils „Forderung" | `sohlhoehen-`/`deckelhoehe-`/`bezugshoehe-setzen` | [Code] |
| Sohle im Längsschnitt, Schacht im Lageplan | Canvas-Griffe | `sohle-ziehen`, `schacht-verschieben` | [Code] |

- **Gelände hat keine Griffe [gesehen]** (Bauform `hoehenfeld`); es wird über Werkzeuge geformt: Gerinne einschneiden, Ausheben, Auffüllen, Böschung an Kante, Planum herstellen.
- Woran die Griffart hängt **[Code]**: Bauform (erlaubte Achsen, `services/Achszug.js:44-47`), Rezept des eigenen Bauteils, Rollen im Typprofil, Herkunft geliefert/eigen, Zustand `eckenFuer`; mit scharfem Werkzeug nur dessen Griffe. Griffe sind three.js-Kugeln ohne Tiefentest, Radius = Abstand/70, geklemmt 0,08–0,50 m; Farben Akzent / Warn (Forderung) / Danger (entfernen) / Ok (einfügen) — `services/IfcOverlay.js:341-393,547-552`.

**Achsen**
- Bauteil-Griff **[gesehen]**: keine Pfeile; die Achse folgt der Zugrichtung. Ein waagerechter Zug von 96 px, der zwischen den projizierten Achsen lag, fing **keine** Achse: Pille und Felder blieben auf 0,00, beim Loslassen wurde nichts geschrieben. Entlang der projizierten Ost-Achse gezogen: Achse `ost`, 126 px = 1,00 m. Fangwinkel 14°, Lösen 26°, Totzone 8 px, Strg erzwingt die Höhe **[Code]** — `Achszug.js:22-26,89-136`, `useGriffe.js:484-532`.
- Stütz-/Kanten-/Eckgriffe XZ, Shift → Y, auf dem Finger dafür der eigene Höhengriff; Drehgriff auf dem Kreis; Maß-Ecken nur auf ihrer Linie **[Code]** — `Griffe.js:152-164,404-430`.
- Raster 0,10 m (im Versuch bestätigt: 1,00 / 0,70 / −7,00 / +5,60), Alt schaltet frei; Winkelraster 5°. Ein Ortho-Schalter existiert nicht **[Code]**.

**Fangen [Code, außer wo vermerkt]**
- Im Griffzug (Schacht, Ecken): Fanglinien in Projektkoordinaten, Radius **0,60 m in der Welt**; Schnitt zweier Linien > eine Linie > Raster — `services/Fanglinien.js:74-219`, `useGriffe.js:44-45,333-341`. Beim Eckzug standen 10 Linien bereit, gefangen wurde nichts; zwei lange gestrichelte blaue Linien in Richtung der anliegenden Kanten waren sichtbar **[gesehen]**.
- Mit scharfem Werkzeug beim Schweben: Ecken/Kanten der Geometrie, Radius **14 px** (`services/Fangpunkte.js:24`, `IfcEngine.js:1297-1341`). **[gesehen]** beim Zeichnen des Aushubs: Zielmarke als oranger Ring mit Kreuz, Pille mit orangem Rand „→ Kante".
- Knotenfang beim Zeichnen mit Radius aus dem Regelwerk (`fangKnotenM`); Schließfang 14/16/22 px (Maus/Stift/Finger); Lageplan-Raster nach Maßstab (1:500 = 1 m) — `composables/useEingabe.js:176-196`, `services/Eingaben.js:116-131`.

**Eingabe während der Handlung**
- Zahl tippen **im** Zug: nein **[Code]**. Der Zug schreibt live in die Felder der Kontextleiste **[gesehen]**; getippt wird davor oder stattdessen.
- Enter beim Zeichnen übernimmt sofort, sobald genug Punkte da sind **[gesehen]**: Schritte 2 → 6, ohne Zwischenfrage. Backspace nimmt den letzten Punkt zurück **[Code]**.
- Esc gestuft (Zug → Ecken ziehen → Geste → Werkzeug), kein Rechtsklick-Menü **[Code]** — `IfcViewer.vue:2769-2812`.
- Strg+Z **[gesehen]**: nahm den Eckzug als einen Vorgang zurück (8 → 6 Schritte). Während einer laufenden Bearbeitung gesperrt **[Code]** (`IfcViewer.vue:1017-1033`).

**Nur über Formular [Code]:** „mitführen" (Forderung gegen wirkliches Mitführen), Merkmale/Klassifikation (KG, DIN 277, Pset, Umbenennen, Maßnahme, Bauform auslegen), Profilgröße/-form, Stärke, Fließrichtung, Stranggefälle, Erdbau-Parameter ohne Ecke (Bodenklasse, Wandform, Bettung …), Kopieren, Reihe, Spiegeln, Versetzen/Trimmen/Teilen, Vereinigen, Körper tauschen, Trasse ändern, Löschen. Zwischenform „Tipp ins Bild statt Ziehen": Haltung teilen, Schacht einfügen — `services/Bearbeitungen.js:1386-3620`, `ui/CdeBearbeitungForm.vue`, `CdeKontextleiste.vue`.

## 3 Rückmeldung während einer Handlung

**Zahlen [gesehen]**
- Pille am Zeiger, **Δ zum Startpunkt**, aktive Achse vorn mit ▸: „▸ Ost +1.00 · Nord +0.00 · Höhe +0.00 m", „▸ Höhe +0.70 · …". Beim Eckzug zusätzlich die beiden anliegenden Kantenlängen: „Ost −7.00 · Nord +5.60 m · 24,17 m | 31,30 m" — in derselben Pille Punkt und Komma als Dezimaltrenner.
- Kontextleiste unter dem Bild, **absolut**: Rechtswert [m], Hochwert [m], Höhe [m NN], dazu „Übernehmen"/„Abbrechen" und ein Chip „Δ 1.00 m in der Ebene · ΔH −0.00 m" bzw. „ΔH +0.70 m". Höhe [m NN] = Welt-y + Höhenversatz des Modells (hier 245,205).
- Ohne Zug: Koordinaten unter dem Zeiger (E/N/H). Beim Eckzug kommen intern Feldwerte in einem anderen Rahmen an (`ost −587.081`, `nord −15771.761` gegenüber E 410 312 / N 5 460 120 beim Zeichnen auf derselben Fläche); in diesem Modus zeigt die Oberfläche sie nicht. Ob das Formular „Knickpunkt verschieben" sie so zeigt: **unsicher**.
- `services/Achszug.js:197-203`, `useGriffe.js:350-412`, `services/Griffe.js:342-393`, `services/Hoehenbezug.js:33-46`, `CdeHudLayer.vue:32-40`.

**Hilfslinien, Vorschauen, Geister [gesehen]**
- Geist: das Bauteil in durchscheinendem Blau mit Kanten am Zielort, das Original bleibt grau stehen; dazu eine blaue Drahtbox und ein kleiner Versatzpfeil.
- Zeichnen auf dem Gelände: orange Linien zwischen den gesetzten Punkten, gestrichelte Schlusskante zum Zeiger.
- Eckzug: orange Vorschau des neuen Randpolygons, zwei gestrichelte blaue Führungslinien.
- **Nicht** gesehen: die drei Achs-Führungslinien beim Bauteil-Griff (Code: ±120 m, gewählte Achse deckend, `useGriffe.js:535-552`). Da beim Eckzug Führungslinien sichtbar waren, liegt es nicht daran, dass der Renderer keine Linien zeichnet; Ursache **unsicher**.
- Lot und Landescheibe aufs Gelände (`IfcOverlay.js:436-461`): nicht gesehen — unter dem gezogenen Schacht lag kein Gelände (`hoeheAn = null`). Gummibänder zu mitgeführten Anschlüssen (`Vorschau.js:184-192`): nicht gesehen, das Modell hatte keine erkannten Anschlüsse.
- Die Tafel wechselt während des Zugs auf „Verschieben Schacht — Eingabe unten in der Leiste — Griffe im Bild ziehen dieselben Felder" **[gesehen]**.
- Die Kontextleiste liegt über dem unteren Bilddrittel **[gesehen]**: beim XY-Zug verdeckte die Pille das Feld „Rechtswert", das sie gerade änderte; beim Zeichnen des Aushubs lag die Leiste über dem vierten Punkt und der unteren Kante des Umrisses.

**Farben [gesehen/Code]:** Akzentblau = Griff, Geist, Führung; Orange (Warn) = Fang, Zeichenzug, Vorschauumriss, Forderung; laut Code Rot = Ost und „entfernen", Grün = Nord und „einfügen", Grau `#737373` = „dimmen" (`Vorschau.js:53-60`, `Achszug.js:28-32`, `styles/theme.css:30-44`). Chips: blau = Wert, grün = Ableitung/neu, orange = Warnung (`CdeKontextleiste.vue:230-238`).

**Höhe beim Ziehen [gesehen]:** als Δ in der Pille und als absolute m NN im Feld. Gegen das Gelände nur bildlich (Lot), nie als Zahl **[Code]**. Beim Zeichnen auf dem Gelände zeigt die Pille die Geländehöhe (H 250.73) und ein Chip „Sohle 249.10 m NN · 2.00 m unter dem Rand".

**Folgen an anderen Größen**
- Massen: nicht live. Chip „… — Massen nach Übernehmen" **[gesehen]**.
- Beim Eckzug: keine Chips, keine Mengenänderung im Bild **[gesehen]**.
- Gefälle nur bei Sohlhöhen-Forderungen, Überdeckung erst als Befund nach dem Aufbau, „n Anschlüsse gelöst" als Warn-Chip **[Code]** (`Vorschau.js:174-239`, `services/ableitung/Ableitungen.js:874-883`).
- **[gesehen]** Nach dem Verschieben des Schachts endet das Rohr frei in der Luft (`bilder/xy-3-danach.png`); im Bild weist nichts darauf hin.

**Erst nach dem Loslassen**
- Journaleintrag: je Griffzug ein Vorgang („Lage", „Knickpunkt verschieben") **[gesehen]**.
- Formular-/Zeichenweg: Leiste „✓ Übernommen · Aushub 354 m³ · Nochmal · ×" **[gesehen]**.
- **Griffweg: keine „Übernommen"-Zeile [gesehen]**, weder nach den Schachtzügen noch nach dem Eckzug (`IfcViewer.vue:933` reicht nur `wendeEintragAn` durch **[Code]**). Die neue Kubatur (354 → 519 m³ gewachsen, 407 → 597 m³ lose) stand erst nach erneutem Anwählen in der Mengenkarte.
- Neuaufbau des CDE-Modells und der Geländeanzeige, Griffe stehen neu **[gesehen]** — `IfcViewer.vue:2024-2110`, `useGriffe.js:556-592`.

## 4 Gelände

**Wo und wie dargestellt**
- 3D **[gesehen]**: deckende beigegraue Fläche (≈ 110/108/102) mit grauen Dreieckskanten; Erdkörper durchscheinend braun (Aushub) bzw. grün (Auftrag) mit Umrissringen in Rastertreppen — `services/Bauteilfarben.js:63-83`, `services/GelaendeKanten.js`, `services/ErdbauUmrisse.js`. Das „Gelände" des BIM26-Modells ist ein `IfcEarthworksFill` und erscheint als grünes Band, nicht im Geländeton.
- Lageplan **[Code]**: Umriss, optional Höhenlinien (Vorgabe aus, 0,5 m) und Böschungsschraffur (Vorgabe aus) — `services/ContourLines.js`, `services/SlopeHatch.js`, `services/IfcVectorPlotter.js:513-557`, `IfcPlanPanel.vue:51-77`. **[gesehen]** nur den Aufbauzustand „Planinhalte werden gesammelt…" (`bilder/beleg-lageplan-aufbau.png`).
- Längsschnitt **[Code]**: die interaktive Ansicht zeichnet kein Gelände (`LaengsschnittCanvas.vue:301-408`); der PDF-Längsschnitt schon (`services/LaengsschnittPdf.js:96-101`).
- Querschnitt **[Code]**: Urgelände gestrichelt, „Gelände jetzt" voll, Soll in Akzent, mit Legende (`CdeQuerschnitt.vue:14-32,155-158`).

**Ur- gegen Planungsgelände [Code]:** im 3D bewusst derselbe Ton. Unterschieden wird strukturell — das Ur-Gelände wird beim ersten Vorgang verborgen, daneben entsteht die Anzeigeform „… (Anzeige)" (Rezept `anzeige`, nicht im Export); die Tafel benennt sie. Explizit unterschieden nur im Querschnitt. — `Bauteilfarben.js:50-64`, `services/Bearbeitungen.js:1101-1134`, `services/ableitung/Ableitungen.js:1528-1580`, `IfcSemanticWindow.vue:33-42`. **[gesehen]:** das Journal führte nach dem Aushub „Urgelaende (Anzeige)", „… · Aushub", „… · Auftrag".

**Schnitt eines Elements mit dem Gelände:** Querschnittsansicht mit Querlinie im Raum, Böschungskanten als Linien, Aushub-/Auftragskörper als eigene Bauteile, Schnittebene **[Code]** — `CdeQuerschnitt.vue`, `services/gelaende/Boeschungskanten.js:49-67`, `IfcEngine.js:2583-2654`. **[gesehen]:** Aushubkörper mit zwei Umrissringen (Rand, Sohle).

**Was eine Geländeoperation im Bild auslöst [gesehen]**
- Während des Zeichnens: drei Chips, keine Änderung am Gelände.
- Nach dem Übernehmen: Aushubkörper erscheint, die Auswahl ist leer, „4 Modelle" (`cde-eigenbau` kommt dazu), Rückmeldung mit m³.
- **Die Geländefläche ist danach verschwunden** — über das ganze Gelände, nicht nur in der Grube: Zellinneres vorher ≈ (110, 108, 102), nachher (32, 41, 50) = Hintergrund, Minuten später unverändert. Es bleibt das graue Drahtgitter (`bilder/beleg-ausheben-uebernommen.png`). Keine Bauwarnung (`getHinweise()` leer), keine Konsolenmeldung. Ob die Anzeigeform nicht gebaut, nicht gefüllt oder vom Software-Renderer nicht gezeichnet wird: **unsicher**.
- Laut Code soll die Anzeige die Lieferung Dreieck für Dreieck sein, nur in veränderten Zellen das geformte Raster; Kanten und Umrisse 250 ms entprellt — `services/gelaende/Anzeigenetz.js:1-47`, `IfcEngine.js:2536-2687`.
- Der gezeichnete Umriss war ein Viereck; der Körper trägt einen gezackten Rasterrand mit einer Kerbe oben links.

**Höhendifferenz zum Gelände:** HUD-Chip „Überdeckung x m" / „x m über dem Gelände", Befund „Überdeckung unter Mindestmaß" (Vorgabe 0,8 m), „Tiefe" im Querschnitt und in der Querprofil-Skizze **[Code]** — `services/Beziehungen.js:431-470,584-590`, `services/Befunde.js:462-486`, `CdeQuerschnitt.vue:28`. **[gesehen]** nur der Chip „2.00 m unter dem Rand". Im Längsschnitt keine.

## 5 Befunde und Markierungen

Im Versuch gab es keinen Befund an einem Bauteil zu sehen (keine Haltungen erkannt). **Gesehen** habe ich nur Import-/Einheiten-Hinweise: in 42069 das Banner „Dieses Modell ist in Millimetern geschrieben …" mit Knopf „In Meter umrechnen" und die Sperrzeile in der Tafel; ausgelesen die Importbefunde des Kanalmodells („37 × IFCPRESENTATIONSTYLEASSIGNMENT — in keinem IFC-Schema" als Warnung, Proxy-Anteil als Hinweis). Alles Übrige **[Code]**:

- **Arten:** Regel-/Geometriebefund am Bauteil (`services/Befunde.js`, Grenzen `services/regeln/Regelwerk.js`), Fachgrenze am Formularwert, Ableitungs-/Erdbaubefund nach dem Aufbau, Importbefund, Georeferenz, IDS-Schnellcheck (Client), Prüfbericht des Prüftors (Server), Kollisionen; daneben Rotstift und Notiz/Issue.
- **Wo:** in Listen — Tafel „Bauteil" (`CdeToolbox.vue:206-228`), Prüfliste und IDS (`IfcQualityTab.vue`), Prüfbericht (`PruefberichtPanel.vue`), Modelltafel (`CdeModellTafel.vue:85-110`), Ausgeben-Dialog, Dokumentliste (`CdeView.vue:388-406`). **Im 3D, Lageplan und Längsschnitt gibt es keine Marker für Regelbefunde**; dort erscheinen nur Notiz-Pins (`services/IfcAnnotations.js:169-196`), Rotstift und die Beziehungs-Chips der HUD-Pille.
- **Wie:** Symbol trägt die Bedeutung (Kreuz, Ausrufezeichen, Haken, Info), Farbe dazu — Fehler `--cde-danger` `#ef5350`, Warnung `--cde-warn` `#ffb74d`, Hinweis `--cde-text-mute`, ok `--cde-success-strong`, Issue `#e91e63`; in der Tafel als Randstreifen. Text mit Wert, Grenze, Quelle, optional „Kur".
- **Wann:** am gewählten Bauteil sofort (computed), als Momentaufnahme im Journaleintrag; modellweite Prüfliste, IDS und Kollisionen auf Knopfdruck; Erdbaubefunde nach dem Aufbau; Prüftor nach dem Serverlauf (Polling 2 s); Import beim Laden.
- **Schweren:** Client-Fachbefunde nur `hinweis | warnung`, keiner sperrt (`Befunde.js:9-16,51`); Prüftor `fehler | warnung | hinweis | ok`, nur `fehler` sperrt (`services/Pruefbericht.js:28-36`); IDS `error | warning | info`.
- **Befund ↔ Element:** aus Prüfliste/IDS per Knopf zum Bauteil über `waehleBauteil` (zoomt, wählt, öffnet die Tafel); umgekehrt zeigt die Tafel die Befunde des gewählten Bauteils. Ein Zähler offener Befunde in Kopf- oder Reiterleiste existiert nicht.

## 6 Die drei Bildfolgen

Ablage `docs/cde/viewer/bilder/`. Alle in der projektlosen Sitzung, Bearbeiten-Modus an.

**XY — Schacht entlang Ost verschieben (Bauteil-Griff)**
- `xy-1-vorher.png` — Der gewählte Schacht trägt einen hellblauen Kugelgriff im unteren Drittel, rechts die Tafel mit den Werkzeugen; Rahmen und Marke des Modus sind nicht zu sehen.
- `xy-2-im-zug.png` — Ein blauer Geist des Schachts steht 1 m versetzt neben dem grauen Original, die Pille zeigt „▸ Ost +1.00 · Nord +0.00 · Höhe +0.00 m" und liegt dabei über dem Feld „Rechtswert" der Kontextleiste.
- `xy-3-danach.png` — Der Schacht steht an der neuen Stelle, der Griff ist mitgewandert, das blaue Rohr endet frei, und eine „Übernommen"-Zeile fehlt.

**Z — denselben Schacht anheben**
- `z-1-vorher.png` — Derselbe Zustand wie nach dem XY-Zug (Sekunden später aufgenommen, daher bildgleich mit `xy-3-danach.png`).
- `z-2-im-zug.png` — Der Geist steht 0,70 m höher mit Drahtbox und kleinem senkrechtem Pfeil, die Pille zeigt „▸ Höhe +0.70 · Ost +0.00 · Nord +0.00 m", das Feld „Höhe [m NN]" 246.755, der Chip „ΔH +0.70 m".
- `z-3-danach.png` — Der Schacht steht höher, das Werkzeug ist abgeräumt, die Tafel zeigt wieder die Werkzeugliste.

**Gelände — Ecke eines Aushubs ziehen**
- `gelaende-1-vorher.png` — Der zuvor gezeichnete Aushub (354 m³) liegt als brauner Körper mit acht blauen Eckgriffen im Gelände, das nur noch als graues Drahtgitter erscheint; unten die Leiste „Ecken ziehen … Fertig".
- `gelaende-2-im-zug.png` — Die linke obere Ecke ist herausgezogen, ein oranger Umriss zeigt den neuen Rand, zwei gestrichelte blaue Linien laufen durch die Ecke, die Pille zeigt „Ost −7.00 · Nord +5.60 m · 24,17 m | 31,30 m", die Mengenkarte rechts noch 354 m³.
- `gelaende-3-danach.png` — Der Aushub ist mit der neuen Ecke neu gebaut und die Griffe sitzen an den neuen Ecken; eine Mengen-Rückmeldung erscheint nicht.

Weitere Belege: `beleg-mm-sperre-42069.png`, `beleg-baumklick.png`, `beleg-klick-auswahl.png`, `beleg-rahmen.png`, `beleg-mehrfachauswahl.png`, `beleg-bearbeiten-an.png`, `beleg-gelaende-kantenauswahl.png`, `beleg-ausheben-zeichnen.png`, `beleg-ausheben-uebernommen.png`, `beleg-lageplan-aufbau.png`.

## 7 Was ich nicht einordnen konnte

1. **Auswahl-Schimmer unsichtbar.** Kein messbarer Farbwechsel am gewählten Körper. Modell, Material oder Software-Renderer? Im echten Browser gegenprüfen.
2. **Rahmen und Marke des Bearbeiten-Modus liegen unter dem Canvas.** Gemessen im projektlosen Layout unter Headless-Chrome. Gilt das im Projekt-Layout und in Firefox?
3. **Geländefläche nach der ersten Operation weg.** Anzeigeform im Journal vorhanden, keine Warnung, keine Konsolenmeldung. Nicht gebaut, nicht gefüllt oder nicht gezeichnet?
4. **Achs-Führungslinien beim Bauteil-Griff nicht zu sehen**, obwohl Führungslinien beim Eckzug sichtbar waren.
5. **Die Blickrichtung wechselte mehrfach ohne mein Zutun** zwischen Schräg- und Draufsicht (nach Shift-Rahmen, nach Klickauswahl, nach dem Öffnen der Tafel). Ob der Shift-Zug die Kamera mitdreht oder die Größenänderung des Bilds einpasst, habe ich nicht getrennt.
6. **Toast „0 Schritte angewandt · 1 × auch vom Planer geändert"** beim Nachladen eines dritten Modells. Meine zwei Verschiebungen standen danach nachweislich noch (Journal-Lage = gerenderte Hülle); was der Toast zählt, weiß ich nicht.
7. **Ein „Leerklick" wählte einmal nicht ab** (an der Stelle lief vermutlich das grüne Band durch das Bild); dann hätte aber das Band gewählt sein müssen.
8. **Der Griff saß nicht dort, wo ich geklickt hatte** (Klick bei y 560, Griff bei y 666) — die Ansicht hatte zwischen Klick und Bild gewechselt, siehe 5.
9. **Zwei Koordinatenrahmen am selben Gelände:** E 410 312 / N 5 460 120 beim Zeichnen, `ost −587 / nord −15 771` als Feldwerte beim Eckzug. Im Code als Absicht kommentiert („in Welt, ohne Ladeversatz"); was das Formular „Knickpunkt verschieben" dem Nutzer zeigt, habe ich nicht gesehen.
10. **Gezackter Aushubrand mit Kerbe** statt des gezeichneten Vierecks — Rasterauflösung des Fixtures oder etwas anderes?
11. **Nicht gesehen, weil das Modell es nicht hergab:** Schacht-, Sohl-, Deckel- und Drehgriffe, Gummibänder, Lot/Landescheibe, Befunde am Bauteil mit Kur, Längsschnitt, Querschnitt, fertiger Lageplan, Isolieren (I), Touch. Dafür bräuchte es ein Kanalmodell mit erkannten Haltungen — etwa in 42069, sobald dort das Millimeter-Modell aus dem Satz ist oder umgerechnet wurde; das ist Fabios Entscheidung, nicht meine.
