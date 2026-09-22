# flood-3D — Audit „fallspezifische Entscheidungen" (2026-09-21)

Anlass: Fall `Rentrisch_BetaTest10` (neue Geometrie `Nacktes_Becken_EP2.dxf`)
zeigt ein Gerinne, das niemand gezeichnet hat. Rein lesend geprüft — am Fall
wurde nichts verändert, kein Endpunkt aufgerufen.

## Teil 1 — Das Phantom-Gerinne

### Befund in Zahlen

| Größe | Wert |
|---|---|
| Geländeoperationen im Fall | **0** (`operations: []`) — das Gerinne ist kein Objekt |
| Vermessenes TIN (`3D_FL`) | 12 × 12 m Hüllquader, davon 53 % vom TIN gedeckt |
| Gebiet (von Hand vergrößert) | 50 × 74 m = 3 700 m² |
| Geländeknoten **außerhalb** des Rasters | 13 893 von 15 049 = **92,3 %** |
| Phantom-Streifen Süd | x −1,5…1,5 · y −44…−2,5 → 42 m lang, ~3 m breit, bis **0,81 m** tief |
| Phantom-Streifen Nord | zwei Stück, je 15,5 m lang, < 0,3 m tief |
| Fläche > 10 cm unter Plateau | echt 77 m² → im Modell **268 m²** |
| Volumen unter Plateauhöhe | echt 114 m³ → im Modell **196 m³ (+82 m³, +72 %)** |

Das ist kein Darstellungsfehler: dieselbe Höhenfläche geht als `terrain.stl`
an snappyHexMesh. Das Becken hätte im Einstaunachweis 72 % mehr Volumen.

### Ursache: drei Stufen, jede für sich „vernünftig"

1. **Import füllt, was nicht gemessen ist** —
   `core/importer.py:835-846` (`rasterize_tin_to_asc`): Zellen des Hüllquaders
   außerhalb des TIN werden waagerecht auf die **höchste** Rasterhöhe gesetzt
   (hier 225,537). Die Begründung im Kommentar ist der Testfall selbst: „im
   Einstaunachweis die sichere Seite". Die Maske „gemessen / erfunden" geht
   dabei verloren — die ASC-Datei enthält danach **keine** NODATA-Zelle mehr
   (gemessen: 0 von 600), 281 von 600 Zellen sind erfunden.
2. **Drehen klemmt** — `core/rotate.py:148` tastet das Original über
   `_load_base → _sample_bilinear` ab, und `core/terrain.py:213-214` klemmt
   jede Koordinate außerhalb per `np.clip` auf den Rasterrand. Wo das TIN den
   Hüllquader mit einer **tiefen** Stelle berührt (das nackte Becken ist an
   den Spitzen offen: 63 von 86 TIN-Randknoten liegen > 10 cm unter der Krone,
   der tiefste auf Sohlhöhe 223,053), wird dieser Randwert diagonal bis in die
   Ecke des gedrehten Rasters fortgeschrieben.
3. **Das Gebiet klemmt noch einmal** — `TerrainField.from_spec`
   (`core/terrain.py:310`) tastet das gedrehte Raster wieder geklemmt ab. Der
   diagonale Streifen trifft die Südkante des Rasters bei x ≈ −1,5…1,5 und
   läuft von dort schnurgerade 42 m bis an den Gebietsrand.

Dass das Muster bekannt war, zeigt der Code selbst: für die Sculpt-Ebene gibt
es die Innen-Maske zweimal (`core/sculpt.py:59-61`, `core/rotate.py:200-202`,
„außerhalb 0") — nur das Grundgelände hat sie nicht.

### Warum es bisher nie auffiel

Quercheck über alle gespeicherten Fälle (Anteil Gebiet außerhalb des Rasters /
Höhenspanne auf dem Rasterrand):

| Fall | außerhalb | Randspanne |
|---|---|---|
| BetaTest03 | 53 % | 0,00 m |
| BetaTest04, TESTTXT_01 | 7,8 % | 0,00 m |
| BetaTest05 | 3,0 % | 0,00 m |
| Beta07, BetaTest06, g0-riesennetz | 2,5 % | 0,75 m |
| **BetaTest10** | **92,8 %** | **0,86 m** |
| **BetaTest09** | **100 %** | 0,00 m |

Die Testfamilie kam fast immer aus `tin_from_lines` + Außenkante: der
Rasterrand ist dort eine einheitliche Krone, das Klemmen schreibt eine Ebene
fort und bleibt unsichtbar. Das nackte Becken ist der erste Fall mit
**offenem, tiefem TIN-Rand und einem Gebiet, das größer ist als die
Vermessung**.

**Nebenfund `Rentrich_BetaTest09`:** Das Raster liegt noch in Gauß-Krüger
(xll 2 579 361,8), das Gebiet lokal (2…14). 100 % des Gebiets entstehen aus
einem einzigen geklemmten Eckpixel. Das Klemmen **versteckt** eine komplette
Fehlverortung — ohne Klemmen wäre das Gelände sichtbar leer gewesen.

### Was fehlt

Keine Prüfregel vergleicht die Ausdehnung von `terrain.base.source` mit
`domain.extent`. Die Prüfung meldete am Fall drei Befunde zum Rohr — und
schwieg zu 92 % erfundenem Gelände.

### Empfehlung (Entscheidung bei Fabio)

- **Eine** Stelle, **eine** erklärte Regel für „nicht gemessen": NODATA bleibt
  in der Datei NODATA (Maske erhalten), `_sample_bilinear` klemmt für das
  Grundgelände nicht mehr, und `from_spec` füllt außerhalb nach einer im Fall
  sichtbaren Vorgabe (eben auf Höhe X; Vorschlag X = Kronenhöhe der
  TIN-Randknoten, vom Nutzer überschreibbar).
- Prüfregel „x % des Gebiets ohne Geländedaten" (Warnung ab > 5 %, mit Kur
  „Gebiet auf die Vermessung zurücksetzen").
- Editor: nicht gemessene Fläche sichtbar anders färben.
- Gegenprobe im Speicher gerechnet: mit „außerhalb = Plateau" statt Klemmen
  bleiben 79,5 m² / 113,6 m³ — das echte Becken (76,8 m² / 113,9 m³).

## Teil 2 — Prüfregeln, Kuren, Rezepte

Pfade unter `backend/app/api/flood3D/core/`. `validate_case` gegen BetaTest10
(im Speicher): 7 Befunde — 1 Fehler, 3 Warnungen, 3 Hinweise, **keiner zur
Geländeabdeckung**. Stichproben der Schwersten von Hand am Code bestätigt.

| # | Schwere | Stelle | Entscheidung | Versagt wo |
|---|---|---|---|---|
| P1 | hoch, still | `validate.py:259-271` | Abdeckung wird nur für `terrain.base.koerper` geprüft; fürs Höhenraster gar nicht. „Gebiet liegt im Raster" gilt nur im Augenblick des Imports (`importer.py:1703-1711`) | jedes von Hand vergrößerte, verschobene, gedrehte Gebiet; alle Geländeregeln (Gebietshöhe + Kur, Pegel, Rohrmund, `min(terrain.z)`) messen danach das Phantom |
| P2 | hoch, sperrt den Lauf | `validate.py:816-827` ↔ `kur.py:95-98` | Beim Aushub misst die Regel die **Flächen**verfeinerung, die Kur legt einen **Quader** | Schacht 0,6 m, Zelle 1 m: Kur meldet „Stufe 3 (0,125 m)", Fehler steht wortgleich weiter; weg nur durch Verfeinern des ganzen Geländes |
| P3 | hoch, still | `kur.py:118` ↔ `meshgen.py:156-157` | `zip(spec.structures, _bauwerk_bboxen(spec))` — die Boxliste überspringt Bauwerke ohne Grundriss (jeder `imported`), das `zip` verrutscht | ein importierter Körper vor Bauwerk A: die Box landet um Bauwerk B, Erfolg wird für A gemeldet |
| P4 | hoch, still | `validate.py:864-875` | „Rohr im Erdreich" = Anteil der **Rohrlänge** ≥ 15 %, 41 Stützpunkte | 200-m-Rohr unter 10-m-Damm (5 %): kein Befund, der Vernetzer trennt das Rohr trotzdem |
| P5 | hoch–mittel, still | `validate.py:797-810` | Auflösungsregel kennt 5 Typen; pier, weir, kammer, imported und die Rohrschale (`wandstaerke` 0,15) prüft niemand | Tosbecken-Rezept bei 2-m-Zelle: Störkörper 0,4 m ohne Befund; in BetaTest10 bleibt die Schale auch nach der Kur unter einer Zelle |
| P6 | mittel–hoch | `leerlauf.py:20-22` | Abbruch bei < 1 % von V_start je 30 s — geeicht auf 100–200 m³ mit freiem DN800 | 4 800 m³ mit Drossel 0,1 m³/s: Abbruch bei t = 2 400 s mit dem Text „abgelaufen ist, was ablaufen kann", während 95 % noch stehen |
| P7 | mittel | `validate.py:591-604` | Kreis > 1,5 m = „Kreisradius vs. Durchmesser prüfen" — Schwelle laut Kommentar am DN800 des Testfalls gesetzt. **In BetaTest10 trifft sie zu:** der CIRCLE im DXF (Layer `AUSLAUF`) hat r = 0,8 m, der Import rechnet richtig d = 2r = 1,6 m (`importer.py:1446`) — ist DN800 gemeint, steckt der Fehler in der Zeichnung | DN2000, DN150, Rahmen 3,0 × 1,5 bekommen dieselbe Warnung samt „Kreisradius"; keine Kur, nicht quittierbar |
| P8 | mittel | `validate.py:1145-1146, 1184-1185` ↔ `kur.py:170, 188-197` | `box_ans_fenster` mit fester Stufe 2, hängt jedes Mal eine **neue** Box an | Fenster 0,3 m bei Zelle 1 m: drei Klicks, drei Boxen, Befund bleibt |
| P9 | mittel | `validate.py:963-966` | „Genau ein Zuflussrand" als Fehler — der Fallbau schreibt alle Zuläufe in einer Schleife (`casebuilder.py:1203`) | Becken mit zwei Zulaufrohren gesperrt; Leerlauf ohne Zulauf gesperrt |
| P10 | mittel | `validate.py:467-488` | Geländelage an den **vier Ecken** des Hüllquaders | Wehr quer im 3-m-Flussschlauch: „verschwindet vollständig unter dem Gelände" |
| P11 | mittel, still | `anschluss.py:499-501` | Rand ohne Fenster wird nie gekoppelt; die Kur meldet „Anschlüsse waren stimmig" | BetaTest10: `auslauf_rohr` (`rolle: ablauf`) hängt an keinem Rand, 29 m von x_max; Zu- und Ablauf sind volle Seitenflächen 74 × 5 m. Der Importbericht verspricht das Gegenteil (`importer.py:1471-1473`) |
| P12 | mittel–niedrig | `validate.py:1300-1312` | „Sperrbreite" = Ausdehnung der Planpunkte; beim Rohr die Achs**länge** | BetaTest10: „3,2 m je Breite" für ein 1,9-m-Rohr; Rohr senkrecht zum Rand → 0 → übersprungen |
| P13 | mittel–niedrig | `validate.py:935-940, 1018-1039` | ein waagerechter Spiegel; Wassertiefe = Volumen / **ganze Gebietsfläche**, nur `inflow_constant` zählt | Ganglinie: Regel schweigt; BetaTest10: Anfangsspiegel 223,05 liegt unter dem tiefsten Gelände 223,106, ohne Meldung |
| P14 | mittel–niedrig | `rezepte.py:226-227, 284-285, 323, 339-340, 350-357` | feste Meter (Störkörper 0,4 × 0,6 × 0,6; ±1,0 m; `limit_max=25`), Fließrichtung fest +y, `_mitte` = Gebietsmitte | Fließrichtung x: „Pegel oberstrom" steht falsch; BetaTest10: Gebietsmitte (11, −7) liegt im Phantomgelände |
| P15 | niedrig–mittel | `validate.py:296-299, 1694-1699, 384-389, 491-493, 1523-1525` | zwei `except Exception` stellen Regeln stumm; ein gebohrtes Rohr irgendwo stuft **jeden** verschlossenen Hohlraum herab; y⁺-Hinweis schlägt ab 6,7 mm Zelle an, also immer | — |

## Teil 3 — Client

Pfade unter `client/src/features/flood-3D/`. Nur gelesen.

| # | Schwere | Stelle | Entscheidung | Versagt wo |
|---|---|---|---|---|
| C1 | hoch, still | `components/pre/Editor3D.vue:259, 847-850, 467-469` | Kamera wird je Mount **einmal** eingepasst; Draufsicht fällt auf `|| 95` zurück | Neufall (`flat:95`, Gebiet 0…100) → Import auf 224 m: Szene leer, bis man die Phase wechselt; „Stand laden" ebenso |
| C2 | hoch, faktisch still | `components/pre/ImportModal.vue:212-214, 421-423`; `editor/szene.js:98-109` | Importbericht schließt nach **1,8 s**, jede Zeile grün mit ✓, nichts geht in die Meldungsleiste. Genau dort steht der Satz „… liegen außerhalb des TIN und werden waagerecht …" (`importer.py:1567`). Die Geometrie-Antwort trägt keine Maske → erfundenes Gelände sieht aus wie gemessenes | dieser Fall |
| C3 | hoch, falsche Meldung | `utils/simHints.js:54-108` | wörtlich „Geeicht am gemessenen Netz des Falls Rentrisch_BetaTest06"; Wassertiefe = Zufluss / **Gebietsfläche**; jede Bauwerksfläche pauschal **5 m²**; nur `inflow_constant` | hier 0,016 m statt ~0,4 m → Warnung „Gebietshöhe sehr hoch"; 40-m-Wand Stufe 4: ~4 000 statt ~250 000 Zellen geschätzt — vor einem kostenpflichtigen Start |
| C4 | mittel, still | `editor/marker.js:350-354`, `editor/objektZugriff.js:543-544`, `PropertyPanel.vue:574-575` | drei Typlisten mit exaktem String, `outflow_constant` (Drossel) fehlt | Drosselrand: kein Marker, keine Griffe, kein „Seite wechseln", keine Fenstermaske — der Server verlangt aber ein Fenster |
| C5 | mittel, still | `editor/handles.js:12-14`, `editor/marker.js`, `Editor3D.vue:522-523` | Griffe/Marker in festen Weltmetern; `minDistance 2`, `maxDistance 600` | hier ~3 px Griffradius (Rentrisch ~20 px); 500 × 500 m: Gebiet nie ganz im Bild; 2 × 2 m: Greifkugel deckt das Modell |
| C6 | mittel, still | `utils/preTemplates.js:206, 275-276, 311, 328` | Vorlagen landen in der **Gebietsmitte**, Höhen aus einem 95-m-Bezugsraum je Punkt umgerechnet; senkrechte Maße skalieren nie | Mitte auf Böschung/Phantom: schiefe Wehrkrone, Gegengefälle im Durchlass; „Ablauf fester Pegel" = Gelände in der **Mitte** − 0,5 m |
| C7 | mittel | `editor/handles.js:40-41, 240-242`, `editor/verschieben.js:112-114` | Fangraster = Basiszelle, am Weltursprung verankert (Netz beginnt bei x0) | Neufall-Zelle 1,0: CAD-Punkt 12,43 springt auf 12,00 |
| C8 | mittel | `ImportModal.vue:49-53, 355-361, 388-390` | ab Spannweite 5 000 schaltet der Dialog **kommentarlos auf mm** (Warnung erscheint nur bei Faktor 1); „Gebiet ableiten" hängt einmalig an der Rollenvermutung; „Gelände" erst ab 25 m² und 10 m | 6-km-Gelände in m → 6 m; 8 × 8-m-Gelände wird nie als Gelände erkannt → Gebiet bleibt 0…100, z 90…100 |
| C9 | mittel, still | `editor/sculpt.js:17, 198, 206` | Pinsel „Ø 4,0 m" wird als **Radius** benutzt (8 m breit); Hub 0,12 m je 25-ms-Tick | zwei Drittel eines 12-m-Beckens je Strich |
| C10 | niedrig–mittel | `PropertyPanel.vue:879-884, 902` ↔ `solids.py:991-998` | Spiegel „Aushub oder Bauteil": Client tastet Eckpunkte, Server den erweiterten Außenring | am Hang: Panel sagt Aushub, Server baut Bauteil |
| C11 | niedrig–mittel, still | `utils/preTemplates.js:342-343` | Rechenzone wird still vertieft, der Text dazu verworfen | Neufall-Zelle 1,0 → Zone 0,15 → **4,0 m** |
| C12 | niedrig–mittel | `editor/szene.js:77-121` | Geländenetz in voller Rasterauflösung bei jeder Entwurfsvorschau; Auflösung erbt fest 0,5 m | 500 × 500 m: 1 Mio Knoten, ~5 MB je Griffzug |
| C13 | niedrig–mittel | `PropertyPanel.vue:583, 617-618, 643-650, 824-826` | „Zulauf x_min, Ablauf x_max" viermal gespiegelt; Fenstermitte = halbe **Box**höhe | 20 m Relief: Rohröffnung 10 m über der Talsohle |
| C14 | niedrig, still | `editor/marker.js:90, 126, 256`, `PunktListe.vue:95, 112` | `?? 0` für fehlende Höhen | bei 224 m NHN liegt alles ohne z 224 m unter dem Gelände, unsichtbar |
| C15 | niedrig | `Editor3D.vue:246` | Stanzmaß `{ d: 0.8, … }` = der DN800 des Testfalls | — |

## Teil 4 — Import-Pfad

Pfade unter `backend/app/api/flood3D/core/`. I1–I3 an Fabios echten Dateien
gemessen (nur gelesen), I3 und I14 von Hand nachgemessen.

| # | Schwere | Stelle | Entscheidung | Versagt wo |
|---|---|---|---|---|
| I1 | hoch, still | `importer.py:159-170, 1353-1368` | Das `closed`-Flag der Polylinie wird nie gelesen; „Ring" ist nur, was den Anfangspunkt **wiederholt**. Gibt es einen Ring, fallen **alle offenen Linien** aus der Vermaschung | BetaTest09: Beckenrand im DXF `closed=True`, Enden 2,2 m auseinander → als Ring zählt nur die Sohle (1 von 9 Linien), Raster 18 × 19 statt 25 × 25, Rest auf `nanmax` = 223,38 gefüllt — eine Platte auf Sohlniveau. Der Bericht nennt trotzdem „Höhen 223,05 … 225,56" |
| I2 | hoch, still | `importer.py:712-741, 1684`; `ImportModal.vue:356-390` | Offset-Vorschlag, Einheitenverdacht und „Gebiet ableiten" hängen nur an **Mesh**-Kandidaten | DXF nur aus Linien + Kreisen: kein Vorschlag, kein Haken. BetaTest09: drei Linien-Importe mit `offset: null` → Raster in Gauß-Krüger, Gebiet lokal. Die Warnung „Lage-Parameter weichen ab" wird genau dann übersprungen, wenn der Offset fehlt |
| I3 | hoch, still | `importer.py:717` | Mesh-Kandidaten werden **vor** dem Offset als STL (float32) abgelegt | **BetaTest10 nachgemessen:** DXF 11,949 × 11,955 m → `k0.stl` 11,75 × 11,5 m; float32-Schritt 0,25 m in x, 0,5 m in y. Höhenabweichung gegen das DXF im Mittel 5 cm, 95 % 16 cm, max 76 cm; 287 von 486 Dreiecken haben danach Grundrissfläche ≈ 0. Volumen bleibt (112,8 → 113,0 m³), die Form nicht. Linien und Kreise bleiben exakt (JSON) und liegen bis 25 cm gegen das TIN versetzt |
| I4 | hoch | `importer.py:881-905`; `terrain.py:113-114` | Kantengrenze `k = min(32, …)`, Rückfall 10 m; `laplace_fuellen` fest **400** Jacobi-Schritte | Linien mit 20 m Abstand: `coverage 0.0`, das ASC besteht aus „nan nan …", der Bericht sagt „stufenfrei ergänzt". Lücke 30 m: 0,57 m Fehler; 100 m: 1,70 m |
| I5 | hoch, still | `rotate.py:256-304, 101`; `importer.py:1769-1775` | „Modell drehen" dreht **nicht**: `terrain.kanten`, `solver.vorfuellungen`, Belagskarte, `base.koerper`. Ränder ohne `face` wandern nicht mit. Reapply kennt die Drehung nicht | nach 180°: Kante und Vorfüllung bleiben stehen; „Kanten verknüpfen" holt die Operation zurück an die alte Stelle; Zulauf liegt relativ zum Modell auf der Gegenseite. Mehrfachdrehung ±30/±45°: Gebietsfläche ×14, gefüllt mit Randwert |
| I6 | hoch (Lageplan) | `importer.py:166-168, 200-219` | 2D-Polylinie → z = 0; `stats.hoehen` wird berechnet und nirgends ausgewertet; Rolle aus dem Layernamen | Layer „Grabenachse" zieht das Gelände auf 0,00 m |
| I7 | mittel–hoch, still | `importer.py:60, 107-108, 738` | Einheit aus der Spannweite geraten (> 5 000), `$INSUNITS` nie gelesen (Fabios DXF trägt 6 = Meter) | Schacht 3 × 3 m in mm (3000): kein Verdacht, Rolle „gelaende", Raster 6001 × 6001 ≈ 860 MB im Produktionsprozess. Fluss 6 000 m in m: gilt als mm |
| I8 | mittel–hoch | `importer.py:1479-1483` ↔ `terrain.py:236-239` | XYZ-Bytes werden unter `.asc` geschrieben, der Leser verzweigt nach Endung | `KeyError 'xllcorner'`; der Test prüft nur Bytes und Extent, lädt das Gelände nie |
| I9 | mittel | `ImportModal.vue:421-423`; `importer.py:1731-1738` | Bericht 1,8 s sichtbar, nirgends gespeichert (= C2) | alle ACHTUNG-Zeilen |
| I10 | mittel | `importer.py:222-228, 465-477, 1446-1447`; `casespec.py:738, 771` | **Jeder** Kreis wird Ablaufrohr; Achse = Extrusionsvektor; Länge = 2·D mittig auf der Kreisebene; `wandstaerke 0.15`, `bohr_ueberstand 0.5` | Kreis in Draufsicht (Normalfall) → senkrechter Stutzen bei z = 0; „Schachtdeckel" und „Baum" werden Ablaufrohr. BetaTest10: 3,2-m-Stutzen, halb im Becken, erreicht nie einen Rand |
| I11 | mittel | `router.py:937-939`; `importer.py:1343, 1489, 1518`; `casespec.py:165` | Rasterweite fest 0,5 m — **vier** verschiedene Rückfallwerte für dieselbe Größe (0,5 / 0,5 / 1,0 / 0,25); Zellgröße der Rasterdatei ignoriert; bei Überlagerung gewinnt das erste Dreieck in Dateireihenfolge | 3 × 3 m → 7 × 7 Knoten; 0,1-m-Scan wird auf 0,5 m ausgedünnt |
| I12 | mittel | `importer.py:1703-1726`; `router.py:940-946` | Gebiet = exakte Gelände-Bbox ohne Puffer und ohne die mitimportierten Rohre; `z_min = lo − 0,5`; Vorlage `q=1.0`, `end_time=120`, `initial_level=94` | Rohr unter der Sohle wird bei −0,5 m gekappt; 40-m-Hänge → 60 m hohes Gebiet |
| I13 | mittel–niedrig | `importer.py:85-93, 109, 366` | „Gelände" ab 25 m² **und** 10 m; Layerhinweise als Teilstring; `decode("utf-8", errors="replace")` | 9 × 9 m → „bauwerk"; „EXISTING" enthält „tin" → Gelände, „Papier" → Pfeiler, „Random" → Gelände; DXF vor R2007: „Gel�nde" |
| I14 | mittel–niedrig | `importer.py:435, 1570` | Dreieck nur bei vtx3 == vtx2; BricsCAD schreibt vtx3 == **vtx0** | BetaTest10 nachgemessen: 243 von 243 Flächen → 486 „Dreiecke", die Hälfte entartet → falsche Warnung „244 von 486 stehen senkrecht — das sind Beckenwände" |
| I15 | niedrig–mittel | `importer.py:1145-1204, 1667` | Vorbelegungen in absoluten Metern (Gerinne 2,0 × 1,5; Stutzen `diameter=0.8`; Mauer 1,0 m dick); `except Exception: … else 95.0` | Schacht 3 × 3 m bekommt ein 6,5 m breites Gerinne |

## Teil 5 — Gelände, Körper, Netz, Fallbau

| # | Schwere | Stelle | Entscheidung | Versagt wo |
|---|---|---|---|---|
| G1 | **hoch — betrifft Ergebnisse** | `casebuilder.py:1174-1183, 1221-1223` | `outflow_free` = `totalPressure p0 0` auf p_rgh, `hRef = 0`, solange kein fester Pegel existiert. Mit p = p_rgh − ρg(z − hRef) heißt p_rgh = 0 auf einer wassergefüllten Ablauffläche: Unterwasserstand auf **0 m NHN**. Der Sog wächst mit der absoluten Höhenlage: √(2gz) = 6 m/s bei 2 m, 43 m/s bei 95 m, **66 m/s bei 223 m** | Im Code belegt, Folge hergeleitet, **nicht durch Gegenlauf bewiesen**. Dazu passt das Archiv: `Rentrich_BetaTest08_r004` (`outflow_free`, Q = 0,8 m³/s) zeigt im DN800-Auslauf τ_max = 2 443 N/m² (plausibel ~6), Courant-Mittel 0,0017, 760 881 Zeitschritte. `tests/test_audit_luecken.py:70` schreibt `h_ref == 0.0` sogar fest |
| G2 | hoch, still | `terrain.py:113-167` | 400 Jacobi-Schritte unabhängig von der Fläche, keine Rückmeldung über Konvergenz | 12 m: 0,000 m Fehler · 50 m: 0,17 m · 100 m: 0,59 m · 300 m: 2,49 m |
| G3 | hoch, still | `meshgen.py:30-36`; `casebuilder.py:551-555, 1205-1208` | Zulauf = ganze x_min-Fläche mit α = 1, Ablauf = x_max | BetaTest10: Zulauf 371,5 m² (74 m breit), v = 0,003 m/s, 150 m² davon **über** dem Plateau; das Ablaufrohr endet im Inneren ohne Rand |
| G4 | mittel, still | `terrain.py:307-308`; `sculpt.py:33-34`; `belag.py:150-151` | `nx = round((x1−x0)/res) + 1` — passt nur bei ganzzahligen Vielfachen | Gebiet 12,2 m / Raster 0,5: die Geländefläche endet 0,20 m vor dem Rand (BetaTest05: 0,16 m) — möglicher Netzleck, nicht gelaufen |
| G5 | mittel, still | `meshgen.py:141-161, 186-201` | `locationInMesh` bei 35 % zwischen Gelände und Deckel; kennt importierte Körper nicht; stiller Rückfall auf 15 % / 50 % | fortgeschriebenes Gelände über `z_max` → Saatpunkt außerhalb des Netzes |
| G6 | mittel, still | `solids.py:973, 997-998` | `wirkung: auto` erkennt den eingegrabenen Schacht über `min(gelaende) ≥ oben − 0,05` | ab 5 % Geländegefälle (d = 3 m) wird der Schacht „bauteil" und bleibt zu |
| G7 | mittel, still | `casespec.py:738`; `solids.py:450, 589`; `meshgen.py:248, 257` | Festmaße (Schale 0,15; Wehrplatte ≤ 0,08) gegen Stufen, die an der Basiszelle hängen | Rentrisch (Basis 0,5): Schale 1,2 Zellen. BetaTest10 (Basis 1,0): 0,6 Zellen |
| G8 | mittel, still | `terrain.py:480-505` | Außenkante ohne `innen` nimmt die **erste** Böschung im Stapel und überschreibt alles außerhalb | zwei Becken: Sohle des zweiten springt 223,00 → 226,00 |
| G9 | mittel, still | `casespec.py:274, 331`; `terrain.py:357` | Wirkungsbreite einer Kante fest 1,0 m (skaliert nach oben, nie nach unten) | OK/UK 0,5 m auseinander: Oberkante landet 1 m zu tief |
| G10 | mittel | `terrain.py:271` | `_load_xyz` rät die Rasterweite aus dem Median der x-Abstände, füllt mit dem **Mittelwert** | 20 000 unregelmäßige Punkte auf 500 m → 771 Mio Zellen, 6,2 GB |
| G11 | niedrig–mittel | `meshgen.py:302-303`; `validate.py:942-946` | `maxGlobalCells 8000000` fest; die Prüfung zählt nur das Hintergrundnetz | 500 × 500 m: snappy bricht die Verfeinerung still ab |
| G12 | niedrig–mittel | `terrain.py:37-60` | jede Operation rechnet über das ganze Raster (Knoten × Segmente), bei jeder Entwurfsvorschau | 12 m: 0,01 s · 74 m: 0,21 s · 500 m: 9,6 s je Operation |
| G13 | niedrig–mittel | `casebuilder.py:1210-1211, 1250-1308` | k = 1e-4, ω = 1 fest; ε per `replace("omega","epsilon")` | kEpsilon startet mit ν_t = 9e-10, praktisch laminar |
| G14 | niedrig–mittel | `casebuilder.py:325`; `terrain.py:639`; `solids.py:1436` | `writePrecision 7` + float32-STL, keine Sperre gegen große Koordinaten | von Hand gesetztes Gebiet in Landeskoordinaten: 0,5-m-Raster im STL |
| G15 | niedrig–mittel | `solids.py:223-227, 304-333`; `casebuilder.py:50-55, 874-877` | stille Rückfälle: ungeschnittener Körper, `concatenate` statt Vereinigung, „kein Belag", Momentbezug (0 0 0) | — |

## Rangfolge — was zuerst

1. **G1 Ablaufdruck** — der einzige Fund, der bereits gerechnete Ergebnisse in
   Frage stellt. Erst mit einem kurzen Gegenlauf belegen (derselbe Fall einmal
   mit `hRef` auf Ablaufhöhe oder `prghPressure p 0`), dann entscheiden.
2. **Teil 1 + P1 + C2** — Phantomgelände: nicht klemmen, Maske erhalten, Regel
   „x % ohne Geländedaten", Bericht nicht nach 1,8 s wegwerfen.
3. **I3** — Offset **vor** der STL-Ablage abziehen (oder Kandidaten als
   float64 ablegen). Verformt heute jedes TIN in Landeskoordinaten.
4. **I1 + I2** — `closed`-Flag lesen; Offset/Einheit/Gebiet auch für
   Linien-Importe. Erklärt BetaTest09.
5. **P3, P2, P8** — Kuren, die Erfolg melden und den Befund stehen lassen.
6. **G3 + P11 + I10** — Rohr mit Rolle „ablauf" ohne Rand; Zulauf als 74-m-Wand.
7. **P9, P7, P6** — Regeln, die am Testfall geeicht sind und woanders sperren
   oder auf die falsche Spur führen.
8. Rest nach Bedarf, sobald ein Fall > 50 m oder < 5 m ansteht
   (G2, I4, I7, C5, G11, G12).

## Das Muster dahinter

- **Absolute Meter statt bezogener Größen.** 5 000, 10 m, 25 m², 400 Schritte,
  1,0 m Kantenbreite, 0,15 m Schale, Stufe 2, 1,5 m Nennweite, 30 s / 1 %,
  hRef 0, Griffe 0,3 m, `maxDistance 600`. Am 12-m-Becken mit 0,2–0,5-m-Zellen
  passt alles zufällig zugleich — und kippt zugleich, sobald Gebiet, Relief,
  Höhenlage oder Basiszelle sich ändern.
- **Stille Rückfälle mit plausiblem Aussehen.** `nanmax`, Randwert per clip,
  nächste Höhe, Mittelwert, z = 0, 95.0, x_min, Millimeter, ungeschnittener
  Körper. Keiner meldet sich; jeder sieht aus wie ein Ergebnis.
- **Unausgesprochene Annahmen, die niemand als Bedingung prüft:** Gebiet ≈
  Becken, Raster deckt Gebiet, ein waagerechter Spiegel, genau ein Zulauf,
  Fließrichtung +x / +y, DXF mit 3DFACE-TIN in Metern und UTF-8.
- **Regel und Kur messen nicht dasselbe** (P2, P3, P8); validate misst oft die
  Nachbargröße (Rohrdurchmesser statt Schale, Hintergrundnetz statt
  verfeinertem Netz).
- **Tests bestätigen den Testfall** statt ihn an einer zweiten Geometrie zu
  brechen (`h_ref == 0.0` festgeschrieben; XYZ-Test lädt das Gelände nie).
  Ein zweiter, bewusst **andersartiger** Referenzfall (groß, geneigt, zwei
  Zuläufe, Linien-DXF in Landeskoordinaten) hätte die Mehrzahl dieser Funde
  beim ersten Durchlauf gezeigt.

## Messlatte (E0, 2026-09-22) — Stand VOR der Sanierung

Gemessen mit `python -m app.api.flood3D.tests.messlatte <cases_root>` (rein
lesend, im Speicher; Definitionen im Modulkopf). „außerhalb" zählt die
Zellfläche des Rasters inkl. halber Randzelle — deshalb stehen Beta07/06/g0
hier auf 0,0 % (oben mit Knotenmaß 2,5 %). „Pinsel tot" = Anteil der Fläche,
auf dem ein Strich keine Wirkung hätte; „heute" mit der jetzigen Reihenfolge
(Pinsel vor allen Operationen), „geplant" mit der beschlossenen (nach den aus
Kanten abgeleiteten, vor den eigenen). „dz unter abgeleitet" = größter
Pinselhub, der heute unsichtbar unter einer abgeleiteten Fläche liegt.

| Fall | Gebiet | Raster | außerhalb | Randspanne | Phantom-Knoten | Phantom m³ | NODATA | Pinsel tot heute | Pinsel tot geplant | dz unter abgeleitet |
|---|---|---|---|---|---|---|---|---|---|---|
| Rentrich_Beta07 | 12×13 | 12×18 | 0.0% | 0.75 m | 0 | 0.0 | 0 | 40% | 0% | 1.10 |
| Rentrich_BetaTest08 | 10×13 | 16×18 | 0.0% | 0.00 m | 0 | 0.0 | 0 | 43% | 0% | 0.93 |
| Rentrich_BetaTest09 | 12×13 | 9×10 | 100.0% | 0.00 m | 0 | 0.0 | 0 | 0% | 0% | — |
| Rentrisch_BetaTest03 | 17×17 | 12×12 | 49.0% | 0.00 m | 2 | 0.1 | 0 | 27% | 0% | — |
| Rentrisch_BetaTest04 | 12×12 | 12×12 | 0.0% | 0.00 m | 0 | 0.0 | 0 | 39% | 0% | — |
| Rentrisch_BetaTest05 | 16×14 | 16×16 | 0.0% | 0.00 m | 0 | 0.0 | 0 | 1% | 0% | 0.74 |
| Rentrisch_BetaTest06 | 12×13 | 12×18 | 0.0% | 0.75 m | 0 | 0.0 | 0 | 40% | 0% | 1.10 |
| Rentrisch_BetaTest10 | 50×74 | 17×17 | 92.3% | 0.86 m | 677 | 74.9 | 0 | 0% | 0% | — |
| TESTTXT_01 | 12×12 | 12×12 | 0.0% | 0.00 m | 0 | 0.0 | 0 | 38% | 0% | — |
| g0-riesennetz | 12×13 | 12×18 | 0.0% | 0.75 m | 0 | 0.0 | 0 | 40% | 0% | 1.10 |

Drei Dinge, die erst diese Tabelle zeigt:

- **Kein einziger Fall trägt NODATA in den Daten** — die Maske „nicht
  gemessen" ist bei allen Importen verloren gegangen (Teil 1, Stufe 1).
- **Pinsel tot heute 27–43 %, geplant 0 %** — das ist die Zahl, an der E3
  gemessen wird.
- **Unsichtbare Striche bis 1,10 m** liegen heute unter abgeleiteten Flächen
  (Beta07/06/g0 1,10; 08 0,93; 05 0,74). Beim Umschalten der Reihenfolge
  würden sie sichtbar — E3 braucht vorher die Kur „wirkungslose Striche
  verwerfen", sonst verformt der Umbau still fünf Fälle.

Zielzahlen: E1a BetaTest10 Phantom-Knoten 677 → 0, Phantom m³ 74,9 → 0;
E1b Volumen unter Plateau 196 → ~114 m³; E3 Pinsel tot 27–43 % → 0 %.

### E1a gebaut (2026-09-22, Branch `claude/flood3d-fallunabhaengig`) — NACHHER

Dieselbe Messlatte, derselbe Datenbestand (nur gelesen), neuer Code:

| Fall | außerhalb | Phantom-Knoten | Phantom m³ | Bemerkung |
|---|---|---|---|---|
| **Rentrisch_BetaTest10** | 92,3 % | **677 → 0** | **74,9 → 0,0** | außerhalb steht die Ebene auf 225,54 m; die Prüfung meldet 92 % und bietet „Gebiet auf die Vermessung setzen" und „Gelände aus dem Original neu abtasten" (schief gedrehte Altdatei ohne NODATA) |
| Rentrich_BetaTest09 | 100 % | 0 | 0,0 | neu: **Fehler** „Höhenraster und Gebiet überlappen sich nicht" statt eines stillen Eckpixels |
| Rentrisch_BetaTest03 | 49,0 % | 2 | 0,1 | die zwei Knoten sind Bruchkanten-Operationen, die in die Ebene schneiden — kein Phantom |
| alle übrigen | 0,0 % | 0 | 0,0 | unverändert: ihr Raster deckt das Gebiet, Hashes bleiben gleich |

Was E1a geändert hat (Backend `core/terrain.py` `lade_basis`, `importer.py`,
`rotate.py`, `validate.py` `_pruefe_gelaendeabdeckung`, `kur.py`,
`casespec.TerrainBase.aussenhoehe`, `router._geometrie_payload`; Client
`szene.js` grau, `PropertyPanel` Außenhöhe, `ImportModal` Bericht bleibt):
NODATA bleibt in der Datei (TIN, Ringe, Linien, Drehung), EINE Regel beim
Lesen (Ebene auf der Außenhöhe = höchste gemessene Randzelle, überschreibbar),
Maske `gemessen` reist bis in den Editor, Regel und Kur messen mit
`TerrainField.abdeckung`. Nebenfund I4 mitgenommen: bei Linien ohne
überlebendes Dreieck schrieb die Datei „nan nan nan" — die Stützpunkte
selbst sind jetzt immer gemessen. Tests: Backend 765 + 1 übersprungen,
Client 355 (Stand nach E1a).

### E1b gebaut (2026-09-22) — Import-Treue, gemessen an einer Kopie von BetaTest10

| Größe | vorher | nachher |
|---|---|---|
| Dreiecke des abgeleiteten TIN (Zeichnung: 243 3DFACE) | 486 (Hälfte entartet) | **243** |
| Abweichung TIN ↔ Zeichnung, 95 % / max | 0,245 / 0,258 m | **0,000 / 0,000 m** |
| Außenhöhe | 225,537 (zellbasiert, Zufall der Quantisierung) | **225,565 = höchster Randpunkt der Zeichnung** |
| Volumen unter 225,537 im Gebiet | 196 (vor E1a) → 121 (E1a) | **107 m³** (innerhalb der Vermessung 99 m³) |
| Drehung des Falls (315,3°) nach Neuableitung | ging verloren (I5) | **bleibt**, gedrehtes Raster neu abgetastet |
| NODATA-Zellen im gedrehten Raster | 0 | 14 792 |

Was E1b geändert hat: `importer._kandidaten_ablegen` legt alle Netze eines
Imports um EINEN ganzzahligen Ursprung verschoben ab (`stl_ursprung` im
Manifest), `load_mesh` rechnet ihn in float64 zurück (I3); 3DFACE mit
vtx3 == vtx0 ist ein Dreieck (I14); `import_neu_analysieren` + Kur
`import_neu_ableiten_roh` zerlegen einen Alt-Import aus der Rohdatei neu,
Prüfregel `_pruefe_importablage` bietet sie an, solange das Manifest keinen
Ursprung trägt; `_gelaende_setzen` behält bei Neuableitung desselben
Imports die Drehung (I5). Die Außenhöhe kommt beim Import aus den
Randpunkten der Vermessung (`_randkrone_tin`, `_randkrone_punkte`) — die
zellbasierte Ableitung des Lesers bleibt Rückfall für Raster und Altfälle
(sie lag am Betriebsfall 18 cm unter der Krone, gestützt auf 2 Zellen).
Tests: Backend 768 + 1 übersprungen.

### E4 gebaut (2026-09-22) — Greifen und Ziehen

- **E4a Maßstab + Kamera** (`editor/massstab.js`, `editor/kamera.js`): Griffe,
  Zwischenpunkte, Klickzylinder und Pegel melden eine PIXELgröße an und
  werden je Frame nach Kameraabstand skaliert; Kamera near/far und
  min-/maxDistance kommen aus dem Gebiet (`kameraGrenzen`); neu eingepasst
  wird bei > 20 % Gebietsänderung (Import, Stand laden), nicht bei jedem
  Griffzug; Draufsicht ohne `|| 95`; Knopf „⤢ Alles". `fitCamera`,
  `terrainZ`-Kopien aus `Editor3D.vue`/`sculpt.js` entfernt (eine Rechnung:
  `store.gelaendeZ`).
- **E4b Rückmeldung statt stiller Klemme:** Fangraster am Gebietsursprung
  (importierte CAD-Punkte springen nicht mehr), Umschalter „⌗ Fang" in der
  Leiste, Coord-Zeile sagt „am Gebietsrand" / „stößt an den Gebietsrand"
  (Objekt wird schon im Zug begrenzt statt beim Loslassen zurückzuspringen),
  Entf an der Mindestpunktzahl meldet sich.
- **E4c Typregister** (`utils/typRegister.js`, gehalten gegen
  `test/fixtures/casespec.schema.json` aus `cli schema`, pytest-Wächter
  `test_schema_schnappschuss.py`): ersetzt die drei Stringlisten; Drossel
  (`outflow_constant`) hat jetzt Marker, Griffe und Fenster-Werkzeug, der
  Graben Griffe; 20 dokumentierte Lücken mit Grund (`luecken()`), die Zahl
  darf nur schrumpfen.

**Browsersonde** (Kopie von BetaTest10 über Mini-Backend 8002 + Vite 3003,
headless Chrome, `scratchpad/probe_e1_e4.js`):

| Messung | Ergebnis |
|---|---|
| graue Knoten (Ebene außerhalb der Vermessung) | **92,3 %** |
| Griffradius fern / nach 6 Rad-Stufen näher | **7,0 px / 7,0 px** (vorher ~3 px in diesem Gebiet, ~20 px im 12-m-Fall) |
| Panel-Hinweis Gelände | „…Ebene auf 225.54 m — automatisch: die höchste gemessene Randzelle; Rand 224.68 … 225.54 m" |
| Platzhalter Außenhöhe | „automatisch: 225.54" |
| Werkzeugleiste | ☑ Auswählen · Ecke · **⌗ Fang** · Draufsicht · **⤢ Alles** · Netz · Freischneiden |
| Prüfung | „92% des Gebiets liegen außerhalb der Vermessung …" + Kur „Gebiet auf die Vermessung setzen"; Alt-Import-Hinweis + Kur „Import aus der Rohdatei neu ableiten"; „Gelände aus dem Original neu abtasten" |

Nebenfund der Sonde: `window.prompt` (Launch-Passwort) blockiert die Seite
in headless-Automatisierung vollständig — Dialog-Handler nötig.
Tests: Backend 769 + 1 übersprungen, Client 379 (Basis 755 / 352).

### E3 gebaut (2026-09-22) — der Pinsel wirkt dort, wo man streicht

Fabios Befund war „viele Bearbeitungsschritte werden beim Gelände-Editieren
zurückgesetzt". Ursache: die Sculpt-Ebene lag VOR dem ganzen
Operationsstapel — also auch vor den aus Vermessungskanten ABGELEITETEN
Operationen. Die sind aber die Vermessung selbst, kein zugesichertes Maß.
In Fällen aus Linien war der Pinsel damit auf 27–43 % der Fläche
wirkungslos: der Strich erschien live und schnappte nach der Server-Antwort
zurück, ohne ein Wort.

| Größe | vorher | nachher |
|---|---|---|
| Pinsel wirkungslos (Beta07, BetaTest06, g0) | 40 % | **0 %** |
| Pinsel wirkungslos (BetaTest08 / 04 / TESTTXT_01 / 03) | 43 / 39 / 38 / 27 % | **0 %** |
| Sperre = nur eigene Sollhöhen (Sonde, angelegtes 5×5-m-Planum in 12×13 m) | — | **16,2 %**, benannt: `sonden_planum_3` |
| Rückgängig-Stapel für Striche | eigener, unsichtbarer, stirbt beim Phasenwechsel | **ein Zeitstrahl mit den Objektänderungen** |
| Pinselradius-Regler | fest „Ø" 0,5 … 25 m, Vorgabe 4,0 m (= 8 m breit im 12-m-Becken) | **„Radius", 0,05 … 4 m, Vorgabe 1,1 m** (aus dem Gebiet) |

Neue Reihenfolge: Basis → abgeleitete Operationen → **Pinsel** → eigene
Operationen. Wo eine eigene Sollhöhe hält, misst der Server es exakt am
fertigen Feld (`TerrainField.pinsel_sperre`, ein Probe-Hub durch den
Stapel) statt über Hüllboxen — eine geschlossene Bruchkante „ebnen" sperrt
ihre Fläche, ein Gerinne nur seinen Einschnitt. Der Editor zeichnet den
Cursor dort rot, setzt den Strich gar nicht erst und nennt die haltende
Operation; der Deckel für die Maske ist 12 Operationen / 400 000 Knoten.

Migration: Striche, die vorher unsichtbar unter einer abgeleiteten Fläche
lagen, wirken jetzt. Fünf Bestandsfälle tragen solche (bis 0,98 m). Die
neue Prüfregel nennt Fläche und Tiefe, die Kur „Diese Pinselstriche
verwerfen" räumt genau sie weg (Striche daneben bleiben) — Regel und Kur
messen mit derselben Funktion (`sculpt.sichtbar_geworden`).

Dazu: der Sculpt-Endpunkt speichert den offenen Entwurf weiterhin (er
braucht das gespeicherte Gitter), sagt es aber jetzt; die Antwort des
Servers zum Strich landet in der Meldungsleiste statt im Nichts; und
`rotate` dreht Vermessungskanten, Vorfüllungen und Belagskarte mit — sie
blieben stehen, während Gelände und Bauwerke sich drehten (Audit I5).

Die Messlatte fragt für „jetzt" das Werkzeug selbst (`pinsel_sperre`) statt
einer Nachbildung; „vorher" stellt die alte Reihenfolge nach.
Tests: Backend 776 + 1 übersprungen, Client 386.

### E2-Rest gebaut (2026-09-22) — der Import kennt die Datei, nicht den Testfall

Fünf Teiletappen, je ein Commit (E2a `d9a0a8b` … E2e `4af3e5d`), dazu die
Regel „Import ohne Offset". Gemessen am Nachbau `dxf_fabrik.neun_linien`
(neun Linien mit closed-Flag, Rohrkreis, Schachtdeckel, Gauß-Krüger) und an
einer **Kopie** von Rentrich_BetaTest09 — nie am Fall selbst.

**E2a — Schnitt.** `apply_import` (507 Zeilen, innere Funktionen mit
`nonlocal`) → `_Uebernahme` + je Schritt eine Funktion (vorbereiten, Gelände
aus Linien, je Kandidat, Kanten verknüpfen, Lage prüfen, Gebiet ableiten,
Anwendung schreiben); längste Funktion im Block < 66 Zeilen. Wächter
`tests/test_import_schnitt.py` hält den vollen Stand beider Fabriken golden
(`tests/golden/import_schnitt.json`: Spec-Dump, `derived/*`, Bericht,
Anwendung) — fehlt die Datei, schreibt der Test sie und fällt einmal; jede
Etappe, die den Import absichtlich ändert, löscht sie und committet den
neuen Stand. Der Golden ist damit auch das Protokoll der Etappen.

| Größe (Nachbau BetaTest09 = `neun_linien`) | vorher | nachher |
|---|---|---|
| geschlossene Kanten / Dreiecke (I1) | 1 / 2 | **2 / 21** |
| Raster aus den Linien | 11 × 11, Abdeckung 37 % | **25 × 25, 66 %** |
| Höhen im Raster (der Bericht nannte 223,05 … 225,55) | 223,05 … 223,38 (Sohlplatte) | **223,06 … 225,52** |
| offene Linien im Raster | keine (mit dem ersten Ring fielen alle heraus) | 6 als Stützzellen (36 Zellen), 1 außerhalb genannt |
| Manifest ohne Netz: `bbox` / `offset_suggest` / `unit_suspect` (I2) | fehlen | **vorhanden**, Vorschlag (2 500 000,2 / 5 400 000,2) |
| Einheit (I7) | Spannweite > 5 000 → still mm | **`$INSUNITS` der Zeichnung** (6 = m, 4 = mm); Verdacht nur ohne Einheit, als Frage |
| Übernahme ohne Offset | Gebiet in Gauß-Krüger (2 500 003 … 2 500 008) | **Verortung des Falls bzw. Vorschlag angewandt**, Gebiet (0, 0) … (14,35, 11,6) |
| Gebiet aus dem Gelände (I12) | nackte Gelände-Bbox, Rohr gekappt | **mit Rohren samt Wandung**, z_min unter der Rohrsohle |
| Kreise in der Draufsicht, die Rohr werden (I10) | 1 (Schachtdeckel → senkrechter Stutzen) | **0** (`stats.lage`, Rolle wählbar) |
| XYZ-Import (I8) | Bytes unter `.asc`, Leser `KeyError 'cellsize'` | **→ ESRI-ASCII**, Gelände lädt |
| Punktwolke 20 000 Punkte auf 500 m (G10) | 771 Mio Zellen, 6,2 GB | **Ablehnung „kein Raster"**; Altleser Deckel 50 Mio |
| Rasterweite aus einer 2-m-Rasterdatei (I11-Teil) | fest 0,5 m (16-fach überabgetastet) | **2 m aus der Datei**, Deckel 4 Mio Knoten |

**Kopie Rentrich_BetaTest09** (fünf Importe derselben DXF, Gelände aus dem
letzten, drei ohne Offset; die Regel `_pruefe_importablage` bietet jetzt für
jeden davon die Kur `import_neu_ableiten_roh` an; angewandt wurden alle vier
angebotenen, danach `gebiet_auf_vermessung` aus E1a):

| Größe | vorher | nach 4 Kuren | nach der 5. |
|---|---|---|---|
| Gebietsknoten außerhalb der Vermessung | **100 %** | 11 % | **0 %** |
| Raster und Gebiet überlappen | nein | ja | ja |
| Modellgelände | eben auf 223,38 (Sohlplatte) | 223,07 … 225,57 (Krone) | dito |
| Rohre in verschiedenen Koordinatenwelten (lokal / gedreht-GK / GK) | 3 | **1** | 1 |
| Vermessungskanten außerhalb des Gebiets | 9 von 9 | 5 von 27 | 23 (das enge Gebiet schneidet den Beckenrand — Nutzerentscheidung) |
| Befunde „fehler" | 14 | **5** | 9 |

Die gespeicherte Verortung (Drehung 70,6°, aus „Modell drehen") setzt die
Rohdatei richtig in die lokale Welt — `lokal_nach_welt(t, 0, 0)` liefert den
Import-Offset. Die Restfehler sind E5-Themen (viermal „1,6 m bei 1-m-Zelle"
= P2/P5, Zulauffenster über den Rand = P11) und Querschnitte außerhalb des
Gebiets (die Zeichnung hat sie außerhalb des Beckenrands).

Zwei Fallen für die Nachwelt: `ezdxf.new()` schreibt `$INSUNITS = 6` (Meter)
— eine Test-DXF „in mm" braucht das Flag ausdrücklich. Und das Gebiet
bekommt beim Ableiten KEINEN Rand von einer Basiszelle (Fahrplan sah ihn
vor): die Abdeckungsregel aus E1a misst genau diesen Rand als „außerhalb der
Vermessung" und würde ihn bei 12 m Gebiet mit 27 % melden.
Tests: Backend 797 + 1 übersprungen, Client 395.

### E5 gebaut (2026-09-22) — Regel und Kur messen dieselbe Größe

Vier Commits (E5a `779278e`, E5b `45c7a71`, E5c `bcb19ae`, E5d), Muster
überall: EINE Messfunktion, die Regel UND Kur aufrufen, die Kur misst nach,
bevor sie Erfolg meldet. Weil `validate.py` `kur.py` importiert, wohnen die
Messungen in `meshgen` (`zelle_am_ort`, `flaechen_zelle`, `box_stufe`,
`stufe_fuer`, `bauwerk_bbox`), `casebuilder` (`fenster_mitte`,
`fenster_flaeche` mit Gelände), `anschluss` (`rollen_ohne_rand`,
`verschuettete_strecke`) und `solids` (`boden_unter`). Getestet an Fall A
(Becken, Basis 0,5) UND Fall B (Tal, Basis 2,0), Muster `_kur_wirkt`
(Befund → Kur → Befund weg → zweiter Aufruf ändert nichts).

| # | vorher | nachher |
|---|---|---|
| P2 Aushub: Regel misst Flächenverfeinerung, Kur legt Quader | Kur-Klicks bis der Befund weg ist: ∞ | **1** (Fall A Schacht 0,4 m, Fall B 1,0 m); das Gelände bleibt grob |
| P3 `zip(structures, Hüllenliste)` verrutscht bei Bauwerken ohne Grundriss | Quader um das falsche Bauwerk | **0**; ohne Grundriss sagt die Kur es, statt das Gelände zu verfeinern |
| P8 Fensterbox mit festem `level=2`, je Klick eine neue Box | Klicks bis der Befund weg ist: ∞, Boxen: n | **1**, eine Box `fein_<id>`, angehoben statt angehängt |
| P5 Rohrschale 0,15 m gegen die Zelle | nie geprüft | Warnung + Kur (Faktor 1); BetaTest10-Kopie 0 → **1** (0,15 Zellen); pier/weir/kammer in der Auflösungsregel |
| P9 „Genau ein Zuflussrand" | Fall B (zwei Zuläufe) gesperrt, Leerlauf gesperrt | Fehler **1 → 0**; `0/U` trägt beide Zulauf-Patches; kein Zulauf nur ohne Startwasser ein Fehler |
| G3 Zulauf ohne Fenster | volle Seite bis z_min, stumm: 371,5 m² | Fläche **über dem Gelände** 150 m²; Hinweis „ganze Seite x_min, 74 m breit" 0 → **1** |
| P11 Rohr mit Rolle ohne Rand | nie gekoppelt, Kur „stimmig" | Warnung mit Abstand (BetaTest10 „y_max in 17,8 m", ohne Kur); 0,5 m vor dem Rand: Kur koppelt, `window.follow` gesetzt, Liste leer |
| P10 Geländelage an vier Hüllquader-Ecken | Wehr quer im Tal „verschwindet" | Umriss + Mitte (`boden_unter`): falsche Warnung **1 → 0** |
| P4 Rohr im Erdreich = Anteil ≥ 15 % an 41 Punkten | 2-m-Damm über 20-m-Rohr stumm | längste Strecke in m, ½ Zelle Abtastung, ab 2 Zellen: Befund **0 → 1**; 0,4 m streifend 0 |
| P12 Sperrbreite des Rohrs = Achslänge (längs) / 0 (quer) | quer: übersprungen | Umriss des gebauten Körpers: **1,1 m** (0,8 + Wandung); BetaTest10 schräg 3,2 → 3,3 m |
| P7 Nennweite > 1,5 m „ungewöhnlich" (am DN800 geeicht) | DN2000, DN150, Rahmen dieselbe Warnung; BetaTest10 1 | am gekoppelten Zufluss: DN150 an 0,8 m³/s (45 m/s) 0 → **1**, DN2000 an 0,8 m³/s **1 → 0**; ungekoppelt nur gegen ⅓ der Gebietsseite |
| P6 Leerlauf: 1 % von V_start je 30 s | 4 800 m³ / Drossel 0,1: fertig bei 94 % Rest | zusätzlich Rate < 10 % der schnellsten Phase: nicht vor „leer"; DN800-Abklingen endet wie bisher (t ≈ 164 s) |

BetaTest10-Kopie gesamt: Befunde 1 / 5 / 5 (fehler / warnung / hinweis)
vor E5 → 1 / 4 / 6 nach E5 — die falsche Nennweiten-Warnung ist weg, die
Rohrschale und das ungekoppelte Ablaufrohr sind neu und richtig, der
74-m-Zulauf steht jetzt im Bericht. Verschoben nach E6: P13, P14, P15.
Tests: Backend 816 + 1 übersprungen, Client 395.

### Auslieferung (2026-09-22, 15:31) und Browserprobe

Übernahme per Fast-Forward in den Live-Checkout (`cde-verbundexport`
89fdf6a → 0df1e2f), Suite mit der Produktions-venv im Live-Tree 816 grün,
`pm2 restart quagg-api` (Startup ~10 s), `npm run build` mit temporärer
3-G-Swapdatei (der ständige Swap war voll), Bundle
`Flood3DPreMain-*.js` trägt den neuen Import-Dialog, quagg-engineering.org
antwortet 200.

Browserprobe am Import-Dialog (Mini-Backend 8002 auf einer **Kopie** von
BetaTest10, Vite 3003, Chrome headless), nichts übernommen:

| Datei | Einheit | Lage | Gebiet ableiten | Kreise |
|---|---|---|---|---|
| `neun_linien.dxf` (synthetisch, 2,5 Mio / 5,4 Mio — fremde Welt) | „Meters (×1)" aus der Zeichnung | Vorschlag aus der Datei (2 500 000,2 / 5 400 000,2), Drehung 0 | angehakt (vorher: nur bei Gelände-Netz) | `AUSLAUF_rohr` Querschnitt → Ablaufrohr; `SCHACHT_deckel` **Draufsicht → ignorieren** mit Hinweis |
| `Nacktes_Becken_EP1.dxf` (Betriebsdatei, Welt des Falls) | dito | **Verortung des Falls**: Offset 2 579 366,56 / 5 459 067,3, **Drehung 315,3°** vorbelegt | angehakt | `AUSLAUF_rohr` Querschnitt → Ablaufrohr |
