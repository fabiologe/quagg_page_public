# Teil XXIX — Struktur: Allgemein, Gewerke, Vorlagen, einfachere Bearbeitung (Konzept, 2026-10-04)

**Stand:** Recherche und Plan, **nichts gebaut**. Fabios Antworten vom 2026-10-04 eingearbeitet (§ 10); Gewerke-Liste
nach einer Abdeckungsprüfung überarbeitet (§ 3.3); Probe ist der **Retentionsteich** im Projekt **10001** (§ 11). Auftrag Fabio (2026-10-04): Bauteile kategorisieren — erst das Allgemeine
einer CDE, dann eine Gliederung nach Gewerken der Infrastruktur, die zusammengesetzte Objekte (Brücke = Straße +
Entwässerung + Konstruktion + Ausstattung + Gelände …) trägt; prüfen, wie Vorlagen im Bauteilfenster verwaltet werden;
und grundsätzlich fragen, ob Bearbeitung nicht einfacher geht.

Jede Aussage sagt, woher sie kommt: **gemessen** (am Code), **gelesen** (Quelle genannt), **eingeschätzt**.

---

## 1 · Bestand (gemessen, 2026-10-04, Stand `a936e83`)

| Größe | Zahl | Bemerkung |
|---|---|---|
| Werkzeuge im Katalog | **147** | davon **84 Setzer** (ein Feld ändern), 69 davon in der Gruppe „Maße" |
| Gruppen der Werkzeugleiste | 7 | Merkmale, Maße, Lage, Erzeugen, Blatt, Gelände, Bauwerk — **nach Art der Operation**, nicht nach Fach |
| „Erzeugen" ohne Auswahl | **18 Knöpfe, flach** | 16 Rezepte + 2 Bauwerk-Vorlagen, eine Liste von Linie bis Rigole |
| Knöpfe an einer eigenen Wand | **30** (15 Setzer) | Rohr 36 (14), Platte 24 (13), Raum 21 (12), Bauwerk 16 (9) |
| Wanddicke und -höhe ändern | 2 Werkzeuge × (Knopf, Wert, Übernehmen) | zwei Vorgänge im Verlauf |
| Rezepte | 17 + Bauwerk | Linie, Fläche, Gelände, Rohr, Schacht, Pfosten, Platte, Wand, Streifenfundament, Überlaufschwelle, Raum, Rechen, Drossel, Tauchwand, Sauberkeitsschicht, Bettung, Rigole |
| Vorlagen | 2 Arten | Bibliothek: EIN Rezept + Vorgaben (Büro/Projekt); Bauwerk: eingebaut als Code (Rechteckkammer, Zweikammer-RÜB) |

**Klassifizierung gibt es schon — aber verstreut, als sieben unabhängige Merkmale** (gelesen am Code):

| Merkmal | wo | was es sagt |
|---|---|---|
| IFC-Klasse + Ausführung + Objekttyp | Bauplan `kategorie`, `predefinedType`, `objektTyp` | was es im Austausch IST |
| Bauform (9) | `bauform/Bauformen.js` | welche Form — bestimmt, welche Werkzeuge gehen |
| Netzrolle | Rezept | Kante / Knoten im Netz |
| fachliche Wurzeln | `services/Kategorien.js` (linear, Schacht, Aushub, Abzug) | Familien für Regeln |
| Bauwerk + Bauwerkstyp | `teilVon`, `bauwerkstyp` (Arbeitshilfen Abwasser: RRB, RÜB …) | wozu es gehört |
| Kosten / Fläche | DIN 276 KG, DIN 277 (Cockpit) | wie es abgerechnet wird |
| Fachmodell | Paket `fachmodell: 'erdbau' \| 'cde'` | in welche Gruppe im IFC |

**Was fehlt:** ein Merkmal **Gewerk** (Fachsystem) — nirgends steht, dass ein Rohr zur Entwässerung, ein Pfosten zur
Ausstattung, eine Platte zum konstruktiven Ingenieurbau gehört. Deshalb ist „Erzeugen" flach, und eine Brücke könnte
heute nicht sagen, welche ihrer Teile Straße und welche Entwässerung sind.

---

## 2 · Recherche — wie andere gliedern

Gelesen über NormRAG (HOAI, ASB-ING, STLK) und von einem Recherche-Agenten (IFC-4.3-Quellen im Repo
`buildingSMART/IFC4.x-development`, ISO-12006-2-Vorschau, Uniclass, CCI, BIM Bundesfernstraßen, Herstellerhilfen).
Die Seite ifc43-docs.standards.buildingsmart.org war gesperrt (403); gelesen wurden dieselben Texte als Markdown im Repo.

### 2.1 Keine Quelle benutzt EINEN Baum

| System | Getrennte Achsen | Wie ein Verbund (Brücke) entsteht |
|---|---|---|
| **ISO 12006-2:2015** | Construction complex · entity · built space · element · work result (u. a.) | „A motorway … is composed of service stations, the motorway pavement, bridges, embankments, landscaping" — dasselbe Objekt steht in mehreren Tabellen |
| **Uniclass 2015** | Co · En · SL · EF · Ss · Pr | Brücke: En_80_94 (Bauwerk) + EF_20_50 (Elemente: Widerlager, Lager, Überbau, Pfeiler) + Ss (Systeme) |
| **CCI / ISO 81346** | Funktion `=` · Produkt `-` · Ort `+` · Typ `%` | ein Bauteil trägt alle Aspekte zugleich |
| **IFC 4.3** | Raumbaum (IfcFacility → IfcFacilityPart) · Systeme (IfcBuiltSystem, IfcDistributionSystem) · Gruppen/Zonen | Bauteil steckt in GENAU einem Raumelement; Systeme liegen quer dazu und hängen per IfcRelReferencedInSpatialStructure an der Facility, die sie bedienen |
| **Objektkatalog BIM Bundesfernstraßen** | Teilbereich → Objektgruppe → Objektklasse → **Objekttyp** | der Objekttyp ist immer eine IFC-Elementklasse; Quellen: BIM-Klassen Verkehrswege 2.0, STLK, ASB-ING, DAUB |

### 2.2 IFC 4.3 — was die Klassen hergeben (gelesen, Schema `schema_IFC4X3_ADD2.json`)

- **Bauwerk (Ort):** IfcBridge (ARCHED, GIRDER, CULVERT, …), IfcRoad, IfcRailway, IfcMarineFacility, IfcBuilding — und
  **IfcFacility selbst ist instanziierbar** (so schreibt die CDE heute Kammer und RÜB). Teile: **IfcBridgePart**
  (ABUTMENT, DECK, FOUNDATION, PIER, SUBSTRUCTURE, SUPERSTRUCTURE, …), **IfcRoadPart** (CARRIAGEWAY, SIDEWALK, SHOULDER,
  ROADSIDE, TRAFFICLANE, INTERSECTION, …), IfcFacilityPartCommon (SEGMENT, SUBSTRUCTURE, JUNCTION, …).
- **Fachsystem (Funktion):** **IfcDistributionSystem** — SEWAGE, STORMWATER, RAINWATER, DRAINAGE, WASTEWATER, WATERSUPPLY …;
  **IfcBuiltSystem** — LOADBEARING, FOUNDATION, PRESTRESSING, REINFORCING, EROSIONPREVENTION, TRANSPORT ….
- **Straße über eine Brücke:** NICHT unter die Brücke gehängt. Zwei Facilities, verbunden über **IfcRelInterferesElements**
  („How the spatial hierarchy is organised is up to the user and project", Template *Spatial Interference*).
- Das alte IfcRelServicesBuildings ist abgekündigt — Systeme hängen per IfcRelReferencedInSpatialStructure an.

### 2.3 Deutsche Gliederungen — jede für einen anderen Zweck

| Quelle | Gliedert nach | Für die CDE brauchbar als |
|---|---|---|
| **HOAI §41** Ingenieurbauwerke (gelesen) | 1 Wasserversorgung · 2 Abwasserentsorgung · 3 Wasserbau · 4 Ver-/Entsorgung Gase, Feststoffe · 5 Abfall · 6 konstruktive Ingenieurbauwerke für Verkehrsanlagen · 7 sonstige Einzelbauwerke; **§45** Verkehrsanlagen; **§53** TA-Anlagengruppen 1–8 | Bauwerksart (Honorar) — eine Brücke fällt unter §41 Gr. 6 **und** §45 **und** ggf. Gr. 2: kein Bauteilbaum |
| **ASB-ING** (gelesen) | Bauteilgruppen: Überbau, Unterbau, Bauwerk, Vorspannung, Gründung, Erd-/Felsanker, Brückenseile, Lager, Fahrbahnübergang, Abdichtung, Beläge, Kappen, Schutzeinrichtung, Sonstiges | die deutsche Teilgliederung einer **Brücke** (Erhaltung) |
| **STLK-StB** (gelesen) | Leistungsbereiche 101–134: 106 Erdbau, 108 Baugruben/Leitungsgräben, 110 Entwässerung für Straßen, 111 … für Ingenieurbauten, 112–115 Oberbau/Pflaster/Einfassungen, 118 Kunstbauten Beton, 121 Lager/Übergänge/Geländer, 129 Rückhaltesysteme, 130 Schilder, 131 Markierungen … | **Gewerk-Wortschatz** des Straßen- und Brückenbaus (Ausschreibung) |
| **STLB-Bau** (gelesen) | 002 Erdarbeiten, 009 Entwässerungskanal, 010 Drän/Versickern, 013 Beton, 080 Straßen/Wege/Plätze … | dasselbe für Hoch- und Tiefbau |
| **DIN 276-4** Ingenieurbau | Kostengruppen 300/400 … | Kosten — die feine Gliederung war in der Bibliothek nicht lesbar |

### 2.4 Wie Infrastruktur-Werkzeuge ihre Paletten bauen

Civil 3D (Part Catalog → Parts List; **Assembly aus Subassemblies** für den Regelquerschnitt), OpenRoads (**Templates**,
Feature Definitions), Allplan Bridge (parametrische Objekte entlang der Achse), Revit (Kategorie → Systemfamilie /
ladbare Familie). Gemeinsames Muster (eingeschätzt): **drei Ebenen** — freie Geometrie, typisierte Fachobjekte aus einem
Katalog, **parametrische Vorlagen**, die viele Fachobjekte auf einmal erzeugen (bei Linienbauwerken: Querschnitt × Achse).

**Die CDE hat alle drei Ebenen schon** (Linie/Fläche · Rezepte · Bauwerk-Vorlagen) — ihr fehlt die fachliche Ordnung
darüber und ein Bauteilfenster, das nicht für jedes Feld einen Knopf zeigt.

---

## 3 · Die Idee: Facetten statt Baum

Ein Objekt wird nicht in EINEN Gewerke-Baum einsortiert. Es trägt fünf unabhängige Facetten; die Werkzeugleiste,
der Strukturbaum, das IFC und die Mengen lesen jeweils die, die sie brauchen.

| Facette | Frage | Werte (Beispiele) | heute | im IFC |
|---|---|---|---|---|
| **F1 Form** | Was ist es geometrisch? | Punkt, Linie, Fläche, Platte, Profilkörper, Körper, Raum | Bauform (9) ✓ | Geometrie |
| **F2 Bauteilart** | Was ist es fachlich? | Wand/RETAININGWALL, Schacht, Haltung, Rechen/STRAINER | IFC-Klasse + Ausführung + Objekttyp ✓ | Klasse + PredefinedType |
| **F3 Gewerk** (neu) | Zu welchem Fachsystem gehört es? | Entwässerung, Erdbau, Konstruktiv, Verkehrsfläche, Ausstattung, Versorgung, Technische Ausrüstung, Landschaft, Vermessung | **fehlt** | IfcDistributionSystem / IfcBuiltSystem |
| **F4 Bauwerk** | Wo gehört es hin? | RÜB › Trennwand · Brücke › Überbau | `teilVon` + Bauwerkstyp ✓ | IfcFacility / IfcBridge → FacilityPart, Zerlegung |
| **F5 Etiketten** | Wie wird es abgerechnet / ausgeschrieben? | DIN 276 KG, STLK-LB, Uniclass, Objektkatalog BIM FStr | KG, DIN 277 ✓ | IfcRelAssociatesClassification |

**Die Brücke** ist dann kein Sonderfall: ein Bauwerk „Brücke" (F4: IfcBridge) mit Teilbereichen nach ASB-ING/IfcBridgePart
(Überbau, Unterbau/Widerlager, Pfeiler, Gründung) — darin Elemente mit verschiedenen Gewerken (F3): Überbau-Platte
**Konstruktiv**, Brückenablauf und Leitung **Entwässerung**, Kappe/Schutzeinrichtung/Geländer **Ausstattung**,
Hinterfüllung **Erdbau**. Die **Straße** über der Brücke ist ein eigenes Bauwerk (IfcRoad) mit Verweis auf die Brücke —
genau wie IFC 4.3 es vorsieht; „Bauwerk im Bauwerk" bleibt der Zerlegung vorbehalten (Anlage in Anlage, Teil XXVI).

**Ein RÜB** genauso: Bauwerk RÜB (IfcFacility, Bauwerkstyp RUEB) — Wände/Platten **Konstruktiv**, Rechen/Drossel/Schwelle
**Entwässerung**, Baugrube **Erdbau**, Zu- und Ablauf **Entwässerung** (Netz). **Ein Kanalschacht** ist ein Knoten im
Netz, Gewerk Entwässerung, ohne Bauwerk (Teil XXVI hat das entschieden: P6 verworfen). **Ein Retentionsteich** ist ein
Erdbau-Vorgang (Mulde) + Raum (Speicher) + Drossel — Bauwerk mit Gewerken Erdbau und Entwässerung. **Sanitärleitungen**
sind dasselbe Rezept „Rohr" wie die Haltung, aber Gewerk **Versorgung** (Trinkwasser/Gas) — deshalb hängt das Gewerk
am Bauteil, nicht am Rezept allein.

### 3.1 Woher ein Bauteil sein Gewerk hat — eine Regelkette (wie die Netzrolle, Teil XXIII AE)

1. ausdrücklich am Bauplan (`gewerk`), gesetzt beim Zeichnen aus einem Gewerk-Reiter oder später geändert;
2. die **Rolle der Vorlage** (die Trennwand des RÜB ist Konstruktiv, der Rechen Entwässerung);
3. die **Vorgabe des Rezepts** (`gewerk: 'entwaesserung'` am Rezept „Haltung"; ein Rezept darf mehreren Gewerken
   angeboten werden, eines ist die Vorgabe);
4. die **Familie der IFC-Klasse** (Typprofil: IfcDistributionChamberElement → Entwässerung, IfcCourse → Verkehrsfläche);
5. sonst **„ohne Gewerk"** — sichtbar, nie geraten.

Für **gelieferte** Modelle gilt dieselbe Kette ab Stufe 4, dazu Systemzugehörigkeit aus dem IFC
(IfcDistributionSystem.PredefinedType), wenn die Lieferung sie trägt.

### 3.2 Der Gewerke-Katalog (überarbeitet nach § 3.3 — zehn Gewerke, zwei Facetten daneben)

| Gewerk | enthält (heute → morgen) | STLK / STLB | IFC |
|---|---|---|---|
| **Gelände & Erdbau** | Aushub, Auffüllung, Planum, Böschung, Kanalgraben, Baugrube → Oberbodenabtrag, Damm | 106, 108 / 002 | Fachmodell Erdbau (Gruppe, wie heute) |
| **Entwässerung** | Haltung, Schacht, Rigole, Rechen, Drossel, Schwelle, Tauchwand; Vorlagen Kammer, RÜB → Straßenablauf, Rinne, Mulde, Hausanschluss | 110, 111 / 009, 010, 011, 085 | IfcDistributionSystem SEWAGE · STORMWATER · RAINWATER · DRAINAGE · WASTEWATER |
| **Wasserbau** (neu) | → Gewässerprofil, Ufer- und Sohlsicherung, Ein- und Auslaufbauwerk, Notüberlauf, Durchlass/Düker, Deich, Abdichtung von Teichen | (STLK-W, nicht gelesen) | IfcBuiltSystem EROSIONPREVENTION; IfcCourse ARMOUR/PROTECTION/CORE; IfcMarineFacility nur für Häfen/Wasserstraßen |
| **Konstruktiver Ingenieurbau** | Wand, Platte, Streifenfundament, Bettung, Sauberkeitsschicht, Öffnung, Durchführung → Stütze, Kappe, Lager, Übergang, Verbau (dauerhaft), Tunnel | 117–125 / 006, 007, 013, 017, 018, 081 | IfcBuiltSystem LOADBEARING · FOUNDATION · PRESTRESSING · REINFORCING |
| **Verkehrsfläche** | → Fahrbahnaufbau (Schichten), Bord, Pflaster, Markierung, Wartungsweg | 112–115, 131 / 080 | IfcRoadPart (Ort) + IfcCourse/IfcPavement/IfcKerb |
| **Ausstattung & Verkehrstechnik** | Pfosten/Schild → Schutzeinrichtung, Geländer, Zaun, Lärmschutz, Lichtsignalanlage | 127–130, 132 | Elemente im FacilityPart; SIGNAL |
| **Leitungen** (statt „Versorgung") | → Trinkwasser, Gas, Fernwärme, Strom, Telekom/Leerrohr (Rezept „Rohr" mit anderem Gewerk) | 134 / 005, 043 | IfcDistributionSystem WATERSUPPLY · GAS · HEATING · ELECTRICAL · COMMUNICATION … |
| **Technische Ausrüstung** | → Pumpe, Schieber, MSR, Beleuchtung, Steuerung | HOAI § 53 AG 1, 4–8 | IfcDistributionSystem LIGHTING · CONTROL · MONITORINGSYSTEM … |
| **Landschaft** | → Bepflanzung, Rasen, Oberbodenauftrag | 104, 107 | IfcGeographicElement VEGETATION |
| **Vermessung & Baugrund** (erweitert) | Linie, Fläche, Bruchkante, Gelände → Bohrung, Bodenschicht, Homogenbereich | 103 | IfcGeographicElement TERRAIN; IfcGeotechnicalStratum, IfcBorehole |

**Zwei Facetten statt weiterer Gewerke** — was in den Listen vorkommt, aber kein Fachsystem ist:

| Facette | Werte | wofür | heute |
|---|---|---|---|
| **Maßnahme** | Neubau · Bestand · Sanierung · Rückbau | Bestandsleitung, Abbruch (STLB 084), „Bestand" der BIM-Klassen | **da** (`massnahme-setzen`, `Sanierung.js`) |
| **Bauzustand** | dauerhaft · temporär | Baustelleneinrichtung (101/000), Verkehrssicherung (105), Wasserhaltung (109/008), Gerüste/Behelfsbrücken (116), Verbau im Bauzustand | fehlt — ein Merkmal am Bauteil, im IFC IfcSpatialZone CONSTRUCTION bzw. Merkmal |

**Bewusst nicht im Grundbestand:** **Gleisbau/Bahn** (STLB 096/097, HOAI § 45-2, IfcRailway, Oberleitung) — als Katalog-
Erweiterung möglich (Gewerke sind Daten), aber ohne Szenario kein Eintrag. **Hochbau-TGA** (Lüftung, Heizung, Kälte,
Aufzug …) bleibt draußen — die CDE plant Infrastruktur.

### 3.3 Abdeckungsprüfung (gemessen, 2026-10-04)

Jeder Eintrag aus acht Bezugslisten einem Gewerk oder einer Facette zugeordnet
(`docs/cde/daten/gewerke_abdeckung_2026-10-04.py` — reproduzierbar, die Zuordnung je Eintrag steht dort):

| Bezugsliste | Einträge | davon Infrastruktur | ohne Platz in der 9er-Liste (Entwurf früh) | ohne Platz jetzt |
|---|---|---|---|---|
| STLK-StB Leistungsbereiche | 32 | 32 | 6 (Baustelle, Bodenerkundung, Wasserhaltung …) | 0 |
| STLB-Bau Tiefbau | 19 | 19 | 5 | 2 (Bahn) |
| HOAI § 41 / 45 / 53 | 18 | 15 | 2 (Wasserbau, Schiene) | 1 (Bahn) |
| BIM-Klassen Verkehrswege 2.0 | 7 | 7 | 4 (Baugrund, Wasserwege, Bestand, Bahn) | 1 (Bahn) |
| IfcBuiltSystem | 13 | 10 | 5 | 3 (Bahn) |
| IfcDistributionSystem | 49 | 37 | 3 | 3 (Bahn) |
| Uniclass 2015 EF | 68 | 55 | 2 | 1 (Bahn) |
| Objekte aus P1–P11 | 34 | 34 | 10 (sieben davon Wasserbau am Teich) | 0 |
| **Summe** | **240** | **209** | **37 (18 %)** | **11 — alle Bahn** |

Jedes der zehn Gewerke hat Treffer (keines ist leer). Der Fund, der die Liste geändert hat: **Wasserbau fehlte** — und
genau der Retentionsteich lebt davon (Abdichtung, Ufersicherung, Ein-/Auslauf, Notüberlauf). Grenzen der Prüfung: die
Zuordnung ist meine (eingeschätzt), STLK-W (Wasserbau, 2xx) war nicht lesbar, die Liste A-1 der Arbeitshilfen Abwasser
nur bis „RRG …".

---|---|---|---|
| **Gelände & Erdbau** | Aushub, Auffüllung, Planum, Böschung, Gerinne, Kanalgraben, Baugrube | 106, 108 / 002 | Fachmodell Erdbau (Gruppe, wie heute) |
| **Entwässerung** | Haltung, Schacht, Rigole, Rechen, Drossel, Schwelle, Tauchwand; Vorlagen Kammer, RÜB → Ablauf, Rinne, Mulde | 110, 111 / 009, 010 | IfcDistributionSystem SEWAGE / STORMWATER / DRAINAGE |
| **Konstruktiver Ingenieurbau** | Wand, Platte, Streifenfundament, Bettung, Sauberkeitsschicht, Öffnung, Durchführung → Stütze, Kappe | 117, 118 / 013 | IfcBuiltSystem LOADBEARING / FOUNDATION |
| **Verkehrsfläche** | → Fahrbahnaufbau (Schichten), Bord, Pflaster, Markierung | 112–115, 131 / 080 | IfcRoadPart (Ort) + IfcCourse/IfcPavement (Elemente) |
| **Ausstattung** | Pfosten/Schild → Schutzeinrichtung, Geländer, Zaun, Lärmschutz | 121, 128–130 | Elemente im FacilityPart |
| **Versorgung** | → Trinkwasser-, Gas-, Kabelleitung (Rezept Rohr mit anderem Gewerk) | 134 / 043 | IfcDistributionSystem WATERSUPPLY / GAS / ELECTRICAL |
| **Technische Ausrüstung** | → Pumpe, Schieber, MSR | HOAI §53 | IfcDistributionSystem |
| **Landschaft** | → Bepflanzung, Rasen, Bodenauftrag | 107 | IfcGeographicElement |
| **Vermessung & Bestand** | Linie, Fläche, Bruchkante | — | IfcAnnotation |

Der Katalog ist **Daten** (wie Regelwerk und Bauwerkstypen): Büro und Projekt dürfen Gewerke umbenennen oder ergänzen,
das Katalogschema prüft sie.

---

## 4 · „Allgemein" — was eine CDE ohne Fachbezug können muss

Zwei Ebenen, die heute vermischt sind:

**Ebene 0 — die Hülle (gehört nicht in die Bauteilleiste):** Container und Revisionen, Status, Prüfen (Prüftor, IDS),
Ausgeben, Kommentare/Notizen, Messen, Schnitte (Längs-/Querschnitt), Lageplan/Blatt, Mengen, Vergleich zweier
Revisionen, Sichtbarkeit nach Facette. Das gibt es fast alles schon in Reitern und Tafeln — es braucht keinen Platz in
„Erzeugen".

**Ebene 1 — allgemeine Modellwerkzeuge (immer da, gewerkfrei, ≤ 8 Knöpfe):**

| Zeichnen | Organisieren | Am Bauteil (jedes) |
|---|---|---|
| Punkt · Linie · Fläche · Platte · Profilkörper · Raum | Bauwerk anlegen · Zuordnen | Verschieben · Drehen · Kopieren · Spiegeln · Reihe · Löschen · Stützpunkte · Eigenschaften |

Die allgemeinen Zeichenwerkzeuge erzeugen **freie Geometrie mit wählbarer Klasse** (Vorgabe IfcBuildingElementProxy,
besser gleich die richtige) — der Weg für alles, wofür es noch kein Fachrezept gibt. Ein Fachrezept (Ebene 2) ist dann
dieselbe Form mit Klasse, Feldern, Merkmalen und Gewerk vorbelegt.

---

## 5 · Die Werkzeugleiste neu

**Ohne Auswahl:**

```
[ Suche: „Was willst du tun?" ]
Allgemein:   Punkt  Linie  Fläche  Platte  Profilkörper  Raum  Bauwerk
Gewerk:     (Entwässerung) Erdbau  Konstruktiv  Verkehr  Ausstattung  …   ← Reiter, zuletzt gewählter bleibt
  Bauteile:  Haltung  Schacht  Rigole  Rechen  Drossel  Schwelle  Tauchwand
  Vorlagen:  Rechteckkammer  Zweikammer-RÜB  (Bibliothek: DN-300-Haltung …)
```

**Mit Auswahl (das Bauteilfenster):**

```
Wand „Längswand Nord"  ·  Konstruktiv  ·  RÜB › Längswand Nord  ·  aus Vorlage (gesteuert)
┌ Eigenschaften ─────────────────────────────────┐
│ Dicke 0,30  Höhe 2,50  Ausführung RETAININGWALL │   ← EIN Formular, EIN Kommando
│ Tragend ja  Aussen ja  KG 352                   │
│                              [Übernehmen]       │
└─────────────────────────────────────────────────┘
Lage:   Verschieben  Drehen  Kopieren  Spiegeln  Auf Bauteil stellen
Form:   Stützpunkte  Teilen
Fach:   Öffnung setzen  Rohrdurchführung
```

Zahl, die das messen soll: Knöpfe an einer Wand **30 → 20** (G2 gemessen; geschätzt waren ≤ 12), Dicke + Höhe ändern **2 Vorgänge → 1**,
„Erzeugen" **18 flach → ≤ 8 Allgemein + ≤ 8 je Gewerk**.

---

## 6 · Vorlagen im Bauteilfenster verwalten

**Drei Sorten, EINE Bibliothek (nach Gewerk geordnet):**

| Sorte | was sie ist | woher | heute |
|---|---|---|---|
| **Bauteil-Vorlage** | ein Rezept + Werte („Haltung DN 300 Beton") | Büro/Projekt (Daten) | ✓ (A5) |
| **Bauwerk-Vorlage, parametrisch** | Rollen aus Werten (Kammer, RÜB) — Werte ändern wertet neu aus | eingebaut (Code, E31) | ✓ (XXVIII) |
| **Baugruppe** (neu) | ein fertiges Bauwerk als Schnappschuss: Teile relativ zum Rahmen, gesetzt mit Punkt + Drehung, **ohne** Formeln | „Als Vorlage sichern" am Bauwerk → Büro/Projekt (Daten) | fehlt |

Die Baugruppe ist der billige Weg zu „mein Standardschacht mit Gerinne und Abdeckung" oder „unser Durchlass DN 800":
kein Code, keine Formelsprache — Daten wie die Bauteil-Vorlage, nur mit mehreren Rollen. Parametrisch bleibt, was
wirklich mit Maßen wächst (Becken).

**Am Bauwerk aus einer Vorlage** (Abschnitt „Vorlage" im Bauteilfenster): die Werte als Formular (Übernehmen =
`vorlage-werte-setzen`), darunter die **Rollen als Tabelle** — Rolle · Bauteil · Status (gesteuert / abweichend: Feld /
fehlt) · „Angleichen" je Zeile; unten „Von der Vorlage lösen" (danach normale Bauteile, keine Steuerung mehr).

**Am Teil:** in der Kopfzeile „Rolle Trennwand der Vorlage Zweikammer-RÜB" mit Sprung zum Bauwerk; ändert der Planer ein
gesteuertes Feld, sagt das Formular vorher: „Dieses Feld steuert die Vorlage — beim nächsten Wertesetzen wird die Wand
übersprungen. Stattdessen an der Vorlage ändern?"

---

## 7 · Geht Bearbeitung einfacher? — sieben Wege, bewertet

| # | Weg | Wirkung | Aufwand | Empfehlung |
|---|---|---|---|---|
| **W1** | **Eigenschaftsformular statt Setzer-Knöpfe** — alle setzbaren Felder auf einmal, ein Kommando mit mehreren Werten | 84 Knöpfe verschwinden aus der Leiste; Setzer bleiben im Katalog (Kommandos, Kuren, Skripte) | mittel | **ja, zuerst** — der größte Hebel |
| **W2** | **Gewerk-Reiter + Suche** statt flacher Liste | findbar bei 50+ Rezepten | klein | ja |
| **W3** | **Vorlagen statt Einzelzeichnen** für alles Zusammengesetzte (Kammer, RÜB, Durchlass, Schacht mit Gerinne) | 21 → 1 Kommando (gemessen, XXVIII) | da | ausbauen (Baugruppe) |
| **W4** | **„Wie dieses" (Pipette)** — neues Bauteil mit den Werten des gewählten | spart die Bibliothek für den Alltag | klein | ja |
| **W5** | **Tabelle am Bauwerk** — Teile mit Hauptmaßen, Zellen editierbar (jede Änderung ein Kommando) | Becken mit 15 Teilen in einer Sicht; Haltungslisten | mittel | später |
| **W6** | **Griffe gleich bei Auswahl** statt erst mit scharfem Werkzeug | Ziehen ohne Knopf | klein | **nein — entschieden 2026-10-04:** Griffe nur nach Knopfdruck, „sonst fängt der erste an, Zeug schon zu verschieben" |
| **W7** | **Regelquerschnitt × Achse** für Linienbauwerke (Straße, Graben, Rinne, Mulde) — das Assembly-Prinzip von Civil 3D/OpenRoads | eine Straße ist dann nicht 40 gezeichnete Bänder, sondern ein Querschnitt an einer Achse | groß | eigener Teil, erst nach einem Verkehrs-Szenario |

**Verworfen:** freies CAD (beliebige Extrusion, Boolesche Operationen als Werkzeug) als Hauptweg — die Semantik
(Klasse, Gewerk, Merkmale) ginge verloren, und das IFC wäre wieder Proxy. Freie Geometrie bleibt als Ebene 1, mit Klasse.

---

## 8 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Verworfen |
|---|---|---|---|
| **E39** | Gewerke als Baum oder als Facette? | **Facette** am Bauteil (F3), dazu Bauwerk (F4) als Ort — wie IFC, ISO 12006-2, Uniclass, CCI | Ein Gewerke-Baum mit Bauwerken als Blättern: die Brücke wäre in fünf Ästen gleichzeitig |
| **E40** | Ein Gewerk je Bauteil oder mehrere? | **eines** (das Fachsystem); weitere Zugehörigkeiten als Etiketten (F5) | Mehrfach-Gewerk: Mengen und Systeme zählten doppelt |
| **E41** | Woher kommt der Wortschatz? | eigener kleiner Katalog (**10 Gewerke** + Facetten Maßnahme, Bauzustand, § 3.2/3.3), **Daten**, Wörter aus STLK/STLB; Abbildung auf IFC-Systeme | HOAI-Gruppen (Honorar, nicht Bauteil); Uniclass direkt (englisch, 6 Tabellen) |
| **E42** | Wie wird ein Gewerk im IFC geschrieben? | **IfcDistributionSystem / IfcBuiltSystem** je Bauwerk und Gewerk, per IfcRelReferencedInSpatialStructure an der Facility; Erdbau bleibt Fachmodell-Gruppe | IfcGroup „Gewerk" ohne Systemtyp; IfcRelServicesBuildings (abgekündigt) |
| **E43** | Brücke und Straße (für später; die Probe ist der Teich, E47) | Brücke = Bauwerk mit Teilbereichen (IfcBridge/IfcBridgePart, Gliederung nach ASB-ING); Straße = eigenes Bauwerk mit Verweis | Straße unter der Brücke (IFC sagt ausdrücklich: Verweis) |
| **E44** | Bauteilfenster | **Formular (W1)** + Kopfzeile mit Facetten + Werkzeuge nach Geste (Lage, Form, Fach) | weitere Knöpfe je Feld |
| **E45** | Vorlagen | drei Sorten, eine Bibliothek; neu nur die **Baugruppe** (Daten, ohne Formeln) | Formelsprache jetzt (E31 bleibt) |
| **E47** | Probe | **Retentionsteich** im Projekt 10001 (§ 11), entschieden 2026-10-04 | Brücke (bleibt Szenario für später) |
| **E46** | USERDEFINED | wo eine Ausführung passt, sie nehmen; USERDEFINED nur mit Objekttyp und mit Befund-Hinweis — der Objektkatalog BIM FStr rät davon ab | still beibehalten (Tauchwand, Bettung, Schwelle stehen heute so) |

---

## 9 · Stufen (Vorschlag Teil XXIX)

| Stufe | Inhalt | Zahl vorher → Ziel | Art |
|---|---|---|---|
| **G0** | messen und einfrieren | Knöpfe Wand 30 / Rohr 36; Erzeugen 18 flach; Dicke+Höhe = 2 Vorgänge; Bauteile mit Gewerk 0 | Test |
| **G1** | Gewerke-Katalog (Daten, Katalogschema) + `gewerk` an Rezepten, Vorlagen-Rollen, Typprofil-Familien; Auflöser `gewerkVon` (Regelkette §3.1) | Rezepte ohne Gewerk 17 → 0 | Kern klein |
| **G2** | Eigenschaftsformular (W1): `eigenschaften-setzen`; Setzer aus der Leiste, nicht aus dem Katalog | **gemessen:** Wand 30 → 20, Rohr 36 → 31, Platte 24 → 16, Raum 21 → 13, Bauwerk 16 → 11 Knöpfe; 2 Maße = 1 Vorgang (das Ziel „≤ 12“ war geschätzt — die 14 Lage-/Formoperationen einer Wand bleiben echte Werkzeuge) | Kern + Oberfläche |
| **G3** | Werkzeugleiste: Allgemein + Gewerk-Reiter + Suche; Zeichnen aus einem Reiter setzt das Gewerk | Erzeugen 18 flach → ≤ 8 je Ansicht | Oberfläche |
| **G3b** | Mengen folgen der Klasse (L-F): Körpermaß → Qto der gewählten Klasse; Merkmalsfelder nur, wo ihr Satz gilt | Teich: Elemente ohne Mengen 16 → 0, Warnungen 67 → 0 | Kern klein |
| **G-T1** | Schicht, die dem Gelände folgt (L-A, mit L-C Band entlang Achse) — **gebaut 2026-10-04**, § 11.4 | Teich: 9 Elemente in Form — **gemessen 0 → 9** (8 in der Mulde, der Rasen eben oberhalb) | Kern |
| **G-T2** | Raum in einer Erdmulde (L-B) — **gebaut 2026-10-04**, § 11.5 | Dauerstau 992 m³, Rückhalteraum 1 424 m³ — **gemessen 991,83 / 1 423,83** (0,5-m-Raster; die Eckgrate) | Kern |
| **G4** | Kopfzeile mit Facetten; Abschnitt „Vorlage" (Rollentabelle, Angleichen je Rolle, Lösen) — **gebaut 2026-10-04**, § 11.6 | am Bauwerk sichtbar 11 → 9 (Vorlagen-Werkzeuge im Abschnitt) | Oberfläche |
| **G5** | Baugruppe: „Als Vorlage sichern" am Bauwerk → Bibliothek; setzen mit Punkt + Drehung — **gebaut 2026-10-04**, § 11.7 | Ablaufbauwerk des Teichs **11 Kommandos → 1** | Katalog |
| **G6** | IFC: Gewerk → System je Bauwerk (E42); Bauwerkstyp Brücke → IfcBridge + IfcBridgePart — **Systeme gebaut 2026-10-04**, § 11.8; Brücke nicht (E43: später) | Systeme im IFC 0 → je Bauwerk und Gewerk eines; Prüftor sauber, auch im Verbund | Schreiber (wirkt sofort) |
| **G7** | Probe **P11 Retentionsteich** (§ 11) über Kommandos, abgelegt im Projekt 10001 — **gebaut 2026-10-04**, § 11.9 | Stauraum 1 424 m³, Dauerstau 992 m³ — **gemessen 1 423,83 / 991,83**, im Test und im Projekt; Gewerk ausdrücklich nur an 2 von 30 Elementen | Test + Browser |
| **G8** | Abnahme + Browserprobe; Pipette (W4) wenn Zeit — **gebaut 2026-10-04**, § 11.10 | W4: 30 von 30 Teichelementen „wie dieses“ gleich; Abnahme fand Qto-Lücken an Rohr/Schacht/Stab: **P11 8 → 0**, G0 5 → 0 | Test + Browser |

Grob 14–18 Halbtage (eingeschätzt). **Nicht in diesem Teil:** Regelquerschnitt × Achse (W7), Tabelle am Bauwerk (W5),
Versorgungs- und TA-Rezepte über das Rohr hinaus, Fremdklassifikationen (Uniclass, Objektkatalog) als Etiketten.

**Leitplanken** wie in XXVIII: messen vor bauen, ein Kommando = ein Vorgang, kein Werkzeug kennt ein Gewerk beim Namen
(Gewerke sind Daten), alte Journale bleiben lesbar (`gewerk` additiv; fehlt es, greift die Regelkette),
`backend/app/ifc/*` wirkt sofort, Commit je Stufe mit Gegenprobe.

---

## 10 · Entschieden (Fabio, 2026-10-04)

1. **Griffe nur nach Knopfdruck** (W6 nein) — „sonst fängt der erste an, Zeug schon zu verschieben".
2. **Gewerke-Liste gut, aber tiefer prüfen** → § 3.3: zehn Gewerke statt neun (Wasserbau neu, Vermessung um Baugrund
   erweitert, „Versorgung" heißt „Leitungen"), Maßnahme und Bauzustand als Facetten, Bahn als spätere Erweiterung.
3. **Reihenfolge wie vorgeschlagen** (G0 … G8).
4. **Probe: Retentionsteich**, in einem eigenen Projekt — **angelegt: 10001 „Beispiel: Retentionsteich in Gelände"**
   (`01_Laufend/10001_Beispiel_Retentionsteich_in_Gelaende`, Akte über „Bestandsordner übernehmen", Audit `claude`).
5. **Weg danach:** erst diese **Basis** (Teil XXIX), dann die **Bibliothek** (Vorlagen, Baugruppen, Bauteil-Vorlagen
   je Gewerk, Büro/Projekt), danach **Bimify**.

---

## 11 · Probe P11 — Retentionsteich (Szenario, von Hand gerechnet)

**Auftrag.** Ein Regenrückhalteteich mit Dauerstau im Gelände: Sohle 40,00 × 20,00 m auf 98,00 m NN, Böschungen 1 : 3,
Dauerwasserspiegel 99,00, Stauziel (Notüberlauf) 100,00. Zulauf DN 600 mit Einlaufbauwerk und Steinschüttung,
Ablauf über ein Drosselbauwerk (Schacht mit Drossel und Notüberlaufschwelle), Notüberlauf als befestigte Rinne,
Abdichtung (Tondichtung) auf Sohle und Böschung, Wartungsweg, Zaun, Uferbepflanzung. Bauwerk **RRB** (HOAI-Objektliste:
„Erdbecken als Regenrückhaltebecken", Gruppe 2).

**Die Zahlen** (prismatoid, h/6 · (A₁ + 4·Aₘ + A₂)):

| Raum | Höhen | Flächen | Volumen |
|---|---|---|---|
| Dauerstau | 98,00 → 99,00 | 40·20 = 800 · 43·23 = 989 · 46·26 = 1 196 m² | (800 + 3 956 + 1 196)/6 = **992,0 m³** |
| **Rückhalteraum** | 99,00 → 100,00 | 1 196 · 49·29 = 1 421 · 52·32 = 1 664 m² | (1 196 + 5 684 + 1 664)/6 = **1 424,0 m³** |

### 11.1 Die Elemente eines Retentionsteichs in BIM

Belegt aus **DWA-M 176 (2013)** (NormRAG): Regenrückhaltebecken mit Dauerstau „müssen immer abgedichtet werden" (5.2);
Dichtungsaufbau mit Oberboden, Dichtungsschutzschicht, Geogitter, Geotextil-Vliesstofflage, Kunststoffdichtungsbahn (KDB)
und **Verankerungsgraben**; **Freibord** (5.3), dabei Bewuchs mit Höhe (Schilf 0,40 m); „Jede Regenrückhalteanlage ist
für den Überlastungsfall mit einem **Notüberlauf** auszustatten" (5.4.5, Beispiel Dammscharte); **Zufahrt** (6.1.10),
**Umzäunung** (6.1.11), Anlagen zur Abflussbegrenzung (6.2). Steg und Zuwegung zum Steg sind Fabios Ausstattung,
nicht aus dem Merkblatt. Klassen und Ausführungen gegen das gepinnte Schema geprüft — **IfcGeotextile gibt es in
IFC4X3_ADD2 nicht**.

Das Bauwerk **„Retentionsteich" (RRB, IfcFacility)** mit Anlagenteilen; der Steg ist ein eigenes Bauwerk mit Verweis
(wie Straße und Brücke, § 3).

| # | Element | Gewerk | IFC-Klasse / Ausführung | Form | Merkmale, Mengen | heute (eingeschätzt, G0 misst) |
|---|---|---|---|---|---|---|
| **Becken** | | | | | | |
| 1 | Oberbodenabtrag | Gelände & Erdbau | IfcEarthworksCut / TOPSOILREMOVAL | Fläche × Dicke | Volumen | teilweise (Erdbau) |
| 2 | Aushub Teichmulde | Gelände & Erdbau | IfcEarthworksCut / EXCAVATION | Grube mit Böschung 1 : 3 | UndisturbedVolume | ja (Ausheben) |
| 3 | Verwallung / Damm | Gelände & Erdbau | IfcEarthworksFill / EMBANKMENT | Auffüllung | CompactedVolume | ja (Auffüllen) |
| 4 | Verankerungsgraben der Dichtung | Gelände & Erdbau | IfcEarthworksCut / TRENCH | Graben am Böschungskopf | Länge | teilweise |
| 5 | Tondichtung (oder KDB) | Wasserbau | IfcCourse / CORE (KDB: IfcCovering / MEMBRANE) | **Schicht, die dem Gelände folgt** | Dicke, Fläche, kf | **nein** |
| 6 | Schutzvlies / Geotextil | Wasserbau | IfcCourse / FILTER (kein IfcGeotextile) | dieselbe Schicht | Fläche | **nein** |
| 7 | Dichtungsschutzschicht | Wasserbau | IfcCourse / PROTECTION | dieselbe Schicht | Dicke | **nein** |
| 8 | Oberboden auf der Böschung | Landschaft | IfcEarthworksFill / USERDEFINED „Oberbodenandeckung" | dieselbe Schicht | Volumen | **nein** |
| 9 | **Steinschüttung** Wasserwechselzone | Wasserbau | IfcCourse / ARMOUR | Band entlang der Uferlinie, auf der Böschung | Dicke, Steinklasse, Fläche | **nein** |
| 10 | **Schilf** in der Flachwasserzone | Landschaft | IfcGeographicElement / VEGETATION | Fläche auf der Berme | Pflanzenart, Pflanzdichte St./m², Wuchshöhe | **nein** (Klasse ja, Ausführung fehlt) |
| 11 | Rasenansaat Böschung | Landschaft | IfcGeographicElement / VEGETATION | Fläche | Fläche | teilweise |
| 12 | Dauerstau (Wasserkörper) | Entwässerung | IfcSpace | **Raum in der Mulde** bis 99,00 | NetVolume 992 m³, Betriebswasser | **nein** (Raum = Prisma) |
| 13 | Rückhalteraum | Entwässerung | IfcSpace | Raum 99,00 → 100,00 | NetVolume 1 424 m³ | **nein** |
| **Zulauf** | | | | | | |
| 14 | Zulaufhaltung DN 600 | Entwässerung | IfcPipeSegment | Rohr | DN, Sohle | ja |
| 15 | Einlaufbauwerk (Stirnwand, Sohlplatte) | Wasserbau | IfcWall / IfcSlab im Anlagenteil | Wand + Platte | Volumen | ja (Teile), Vorlage nein |
| 16 | Kolkschutz vor dem Einlauf | Wasserbau | IfcCourse / ARMOUR | Schicht auf Sohle/Böschung | Dicke, Steinklasse | **nein** |
| 17 | Grobrechen am Einlauf | Entwässerung | IfcFilter / STRAINER | Rechen | Stababstand | ja |
| **Ablauf** | | | | | | |
| 18 | Drosselschacht | Entwässerung | IfcDistributionChamberElement / MANHOLE | Schacht | DN | ja |
| 19 | Drossel | Entwässerung | IfcValve / REGULATING | Drossel | Q_Dr, Stauhöhe | ja |
| 20 | **Wehrschwelle** (Stauziel 100,00) | Entwässerung | IfcWall / USERDEFINED „Überlaufschwelle" + Quagg_Entlastung | Schwelle | Schwellenhöhe gemessen, µ | ja |
| 21 | Tauchwand vor der Drossel | Entwässerung | IfcWall / USERDEFINED „Tauchwand" | Wand | — | ja |
| 22 | Ablaufhaltung | Entwässerung | IfcPipeSegment | Rohr | DN | ja |
| **Notüberlauf** | | | | | | |
| 23 | Dammscharte | Gelände & Erdbau | IfcEarthworksCut / CUT | Absenkung der Krone | Breite, Sohlhöhe | teilweise |
| 24 | Befestigung der Scharte | Wasserbau | IfcCourse / ARMOUR | Schicht | Dicke | **nein** |
| **Steg** (eigenes Bauwerk) | | | | | | |
| 25 | Pfähle | Konstruktiv | IfcPile / DRIVEN | Stab, senkrecht | Länge, Querschnitt, Material | teilweise (Pfosten, ohne Ausführung) |
| 26 | Jochträger, Längsträger | Konstruktiv | IfcBeam / JOIST | Profilkörper, waagerecht | Querschnitt, Länge | **nein** (kein Träger-Rezept) |
| 27 | Belag | Konstruktiv | IfcSlab / FLOOR | Platte | Dicke, Fläche | ja (Platte) |
| 28 | Geländer | Ausstattung & Verkehrstechnik | IfcRailing / HANDRAIL | Linie mit Höhe | Höhe, Länge | **nein** |
| **Zuwegung, Zufahrt, Ausstattung** | | | | | | |
| 29 | Weg zum Steg (wassergebundene Decke) | Verkehrsfläche | IfcCourse / PAVEMENT (+ Tragschicht) | Band entlang einer Achse mit Breite, auf dem Gelände | Breite, Aufbau, Fläche | teilweise (Platte, eben) |
| 30 | Wegeinfassung | Verkehrsfläche | IfcKerb | Profilkörper entlang Linie | Länge | **nein** |
| 31 | Zufahrt / Wartungsweg | Verkehrsfläche | IfcCourse / PAVEMENT | Band | Breite, Fläche | teilweise |
| 32 | Zaun | Ausstattung & Verkehrstechnik | IfcRailing / FENCE | Linie mit Höhe | Länge, Höhe | **nein** |
| 33 | Tor | Ausstattung & Verkehrstechnik | IfcDoor / GATE | Punkt mit Breite | Breite | **nein** |
| 34 | Pegellatte | Technische Ausrüstung | IfcSensor / LEVELSENSOR | Punkt | Nullpunkt NN | **nein** |
| 35 | Warnschild | Ausstattung & Verkehrstechnik | IfcSign / PICTORAL | Punkt | — | teilweise (Pfosten) |

### 11.2 G0 gemessen (2026-10-04, `test/strukturG0.test.js`, `test_bauwerke.py::test_g0_teich…`)

Die Spalte „heute" oben war geschätzt — und bei der **Klasse zu pessimistisch**. Je Element das passendste Kommando von
heute, das Paket gelesen, dann durch den echten Schreiber:

| Größe | gemessen |
|---|---|
| Elemente ohne Erdbau | 30 |
| Klasse **und** Ausführung kommen richtig an | **26** — über Platte, Wand, Fundament mit überschriebener Klasse |
| nur die Ausführung fehlt | 4 — Drosselschacht, Pfahl, Pegellatte, Warnschild (Schacht und Pfosten haben kein Feld dafür) |
| Schreiber nimmt an, Prüftor offen | 28 Bauteile + 2 Räume, **0 offene Befunde** |
| **Elemente, deren Mengen und Merkmale nicht zur Klasse passen** | **16** — 67 Warnungen: die Steinschüttung bringt `NetVolume`/`Pset_SlabCommon` der Platte mit, `IfcCourse` kennt `Thickness`/`Volume`; der Schreiber schreibt nichts Falsches, aber **Volumen und Flächen fehlen im IFC** |

**Die Lücke ist nicht die Klasse, sondern Form und Mengen.**

### 11.3 Was der Teich verlangt — die Lücken, nach Hebel geordnet

| Lücke | betrifft Elemente | Art | Vorschlag |
|---|---|---|---|
| **L-A Schicht, die dem Gelände folgt** (Fläche auf dem geformten Raster, Dicke senkrecht zur Fläche oder lotrecht wählbar) | 5, 6, 7, 8, 9, 10, 11, 16, 24 — **neun** | Kern (neue Ableitung aus Gelände + Umriss) | eigene Stufe **G-T1** |
| **L-B Raum in einer Erdmulde** (Volumen zwischen Gelände und einer Höhe, oder zwischen zwei Höhen) | 12, 13 | Kern (Ableitung aus Gelände) | eigene Stufe **G-T2**; Zahl 992 / 1 424 m³ |
| **L-C Band entlang einer Achse mit Breite, auf dem Gelände** | 29, 31 (auch Graben-/Mulden-Wege) | Kern klein (Variante von L-A) | mit G-T1 |
| **L-D freie Klasse an den allgemeinen Formen** (Profilkörper → IfcRailing, IfcKerb, IfcBeam; Stab → IfcPile, IfcSensor, IfcDoor) — mit Ausführung | 25, 26, 28, 30, 32, 33, 34, 35 — **acht** | Katalog (G3 „Allgemein", § 4) | Rezepte als Vorgaben: Zaun, Geländer, Träger, Pfahl, Einfassung, Pegel |
| **L-F Mengen und Merkmale folgen der Klasse** (G0: 16 von 30 Elementen ohne Mengen im IFC) — Körpermaße (Volumen, Dicke, Fläche, Länge) werden auf die Qto-Vorlage der GEWÄHLTEN Klasse abgebildet, Merkmalsfelder nur, wo ihr Satz gilt | 5–11, 16, 24, 26, 28–33 — **sechzehn** | Kern klein (Mengenabbildung je Klasse aus der bSI-Vorlage) | mit G3 (allgemeine Formen mit wählbarer Klasse brauchen es zuerst) |
| **L-E Vorlagen** | 15, 18–22 (Ablaufbauwerk), 25–28 (Steg) | Katalog | Baugruppe (G5) bzw. parametrisch „Steg" (Länge, Breite, Pfahlabstand) |

**Offen zur Entscheidung:** Welche Klasse bekommt der **Steg** als Bauwerk — IfcFacility (wie Kammer und Teich),
IfcBridge / GIRDER (er überspannt Wasser) oder IfcMarineFacility / JETTY (Steg im Wasser; die Klasse ist für Häfen
gedacht)? Vorschlag: **IfcFacility**, Bauwerkstyp „Steg" — die anderen beiden behaupten mehr, als der Steg ist.

### 11.4 G-T1 gebaut (2026-10-04, `test/schichtGelaende.test.js`, `test_bauwerke.py::test_gt1…`)

**Was es ist.** Eine Ableitung `gelaendeschicht` (Quelle: das Gelände) mit zwei Zeichenwerkzeugen — „Schicht auf dem
Gelände" (Umriss) und „Band auf dem Gelände" (Achse + Breite, L-C). Der Ableitungslauf legt sie auf das Gelände NACH
ALLEN Erdbau-Vorgängen (`gelaendeFolgt`, wie die Anzeige); gespeichert sind nur Umriss/Achse, Dicke, Abstand, Richtung
— Klasse, Ausführung, Objekttyp, Gewerk und Vorlage stehen oben im Bauplan, wo `gewerkVon`, `objektTypVon`,
`typAusVorlage` sie lesen. Kernel-Operation `schicht`: Umriss in Dreiecke, je Dreieck gegen die Dreiecke des Rasters
geschnitten (dieselbe Diagonale wie die Anzeige) — der Rand bleibt der gezeichnete Umriss. Dicke lotrecht (Vorgabe)
oder senkrecht zur Fläche. Die acht Schicht-Vorlagen aus G3 zeigen jetzt darauf (der Weg mit dem Band-Werkzeug).

| gemessen | Wert |
|---|---|
| Dichtung 30 × 20 m, 0,5 m, VOR dem Aushub | Unterkante 100,00, 300 m³ |
| dieselbe Dichtung NACH dem Aushub (Tiefe 2, 1 : 3), Journaleintrag unverändert | Unterkante 98,00, weiter 300 m³ (lotrecht = Grundfläche × Dicke) |
| Vlies auf der Böschung 1 : 3, 14 × 6 m, senkrecht zur Fläche | 44,27 m³ = 14 · 6 · 0,5 · √(10/9) |
| Weg als Band 50 × 2,5 × 0,15 | 18,75 m³, Gewerk Verkehrsfläche (Klassenregel IfcCourse/PAVEMENT) |
| Teich § 11.1: die neun Schicht-Elemente aus den Vorlagen auf der Mulde | 9 geschlossen, 8 folgen der Mulde, Rasen eben auf 100,00 |
| Zufall: 4 000 Umrisse mit Ecken auf halben Millimetern | 0 offene Körper (auf 1 mm gerundet: 2 044, auf 1 mm zusammengelegt: 6) |
| eine muldenweite Schicht 52 × 32 m auf 0,5-m-Raster | 30 048 Dreiecke, 0,5 s (nach G-T2: entartete Stücke vom Schwerpunkt aus zerlegt) |
| Browser :3001 ohne Projekt (`erdbau_vergleich.ifc`) | 12/12: Gelände aus der Engine, Vorlage belegt Formular samt Gelände vor, 32 m³ / 11,25 m³, Unterkante folgt (Spanne 1,12 m) |

**Mengen nach Klasse:** IfcCourse → `Thickness`, `Volume`; eine Oberbodenandeckung (IfcEarthworksFill) → `CompactedVolume`,
`Depth` (neu auch für die Platte mit dieser Klasse); IfcGeographicElement hat keine Qto-Vorlage → keine Mengen. Im IFC
geprüft (Prüftor 0 Regelverstöße).

**Grenzen, benannt:** (1) Dreieckszahl: eine Schicht über die ganze Mulde trägt 30 048 Dreiecke, auch dort, wo das
Gelände eben ist — ebene Stücke zusammenzulegen spart das (nicht gebaut). (2) Wo die Anzeige das gelieferte Netz zeigt
(fern jeder Formung), liegt die Unterkante auf dem 0,5-m-Raster dieses Netzes, nicht auf dem Netz selbst — eine dünne
Schicht (Vlies 1 cm) kann dort stellenweise im Gelände verschwinden. (3) Eine Schicht hat noch keine Griffe (Umriss
ziehen) — sie wird über Kommandos und Neuzeichnen geändert.

### 11.5 G-T2 gebaut (2026-10-04, `test/raumInMulde.test.js`, `test_bauwerke.py::test_gt2…`)

**Was es ist.** Eine Ableitung `muldenraum` (Quelle: das Gelände, wie die Schicht nach ALLEN Erdbau-Vorgängen) mit dem
Werkzeug „Raum in der Mulde": Umriss (wo der Raum sein darf, meist der Muldenrand), Spiegel und untere Grenze in m NN
(leer = bis aufs Gelände). Ein `IfcSpace`, dessen Körper die Mulde ausfüllt: Boden = max(Gelände, untere Grenze),
Decke = Spiegel, nur wo das Gelände tiefer liegt. Kernel-Operation `raumInMulde` auf denselben Stücken wie die Schicht
(Umriss ∩ Geländedreiecke), je Stück an der Linie Gelände = Spiegel (und = untere Grenze) geschnitten — exakt je Ebene.

| gemessen | Wert |
|---|---|
| Teich § 11, Dauerstau Gelände → 99,00 | 991,83 m³ (von Hand 992,0; −1/6 m³ in den vier Eckgraten, quadratisch mit der Zelle: 0,25 m → −1/24) |
| Rückhalteraum 99,00 → 100,00 | 1 423,83 m³ (von Hand 1 424,0); ein Prisma über der Wasserfläche hätte 1 196 |
| Mengen | Qto_SpaceBaseQuantities: NetVolume, GrossVolume, NetFloorArea (Wasserfläche), Height (Tiefe) |
| über den echten Weg (Ausheben, dann zwei Räume) | dieselben Zahlen wie das Raster von Hand, Gewerk Entwässerung |
| Höhenversatz 300 | dasselbe Wasser (Spiegel in m NN) |
| kleiner Teich durch Schreiber + Prüftor | 0 Regelverstöße, Mengen wie oben |
| Zufall: 600 Gelände × 3 Räume, Additivität (bis a) + (a … b) = (bis b) | 0 offen, additiv auf 4·10⁻¹² |
| Float32-Höhen, Spiegel GENAU auf Knoten, waagerechte Flecken auf Spiegelhöhe | 0 offen von 1 800 (vorher bis 111) |
| Browser :3001 ohne Projekt, natürliche Senke im Testgelände | 10/10, Summe = Dauerstau + Rückhalteraum auf 10⁻⁶ |

**Was die Probe gefunden hat** (Browser, dann Zufallstest): ein Spiegel 1,8·10⁻⁸ m über Geländeknoten aus Float32 machte
den Körper offen. Drei Ursachen, drei Kuren, je mit roter Gegenprobe: (1) Knoten näher als 10 µm am Spiegel gelten der
Rechnung als 10 µm darüber (`KNOTEN_ABSTAND`) — sonst berühren sich zwei Wasserflächen in einem Punkt; kostet am Teich
< 10⁻³ m³, und die vier Eckdreiecke genau auf dem Spiegel (je cell²/2) zählen nicht zur Wasserfläche. (2) An der
Wasserlinie trägt das Wasser einen Film von 1,5 µm statt Boden und Decke zusammenzulegen. (3) Ein Stück, dessen
Fächer vom ersten Eckpunkt ein Dreieck ohne Fläche ergäbe, wird vom Schwerpunkt aus zerlegt (gilt auch für die Schicht).

**Grenzen, benannt:** (1) Ein Aushub am GELIEFERTEN Gelände geht über die Kommandokonsole nicht (Kommandos ohne
Oberfläche kennen nur eigene Bauteile) — im Browser wurde der Raum deshalb in der natürlichen Senke geprüft, der Teich
über den echten Weg im Test. (2) Liegt der Spiegel am Umriss über dem Gelände, ist der Raum dort senkrecht abgeschnitten
(Hinweis `raum_am_umriss`). (3) Der Reiter Entwässerung trägt jetzt neun Bauteile (Grenze aus § 5: acht) — der
Regenrückhalteraum gehört fachlich dorthin.

### 11.6 G4 gebaut (2026-10-04, `test/facetten.test.js`, Browserprobe 16/16)

**Was es ist.** `services/Facetten.js` (rein) liest je Bauteil seine Facetten — Form, Klasse + Ausführung + Objekttyp,
Gewerk (mit Quelle: am Bauteil / Rezept / Klasse), das Bauwerk mit Pfad (`teilVon`, Baugruppe › Anlage) und die Vorlage:
ein Bauwerk „aus Vorlage", ein Teil „Rolle … der Vorlage" (mit seiner Abweichung), ein Bauteil aus der Bibliothek.
Dazu die **Rollentabelle** eines Bauwerks: je Rolle Bauteil und Stand (gesteuert / abweichend: Feld / fehlt) — dieselbe
Regel wie der Befund `vorlage_abweichung`. Neues Werkzeug **„Von der Vorlage lösen"** (ein Kommando, ein Eintrag: das
Bauwerk wird gewöhnlich, die Teile bleiben, wie sie sind, und Teil des Bauwerks).

**In der Tafel „Bauteil":** unter dem Titel die Facetten als Chips (ein Bauwerk im Pfad ist ein Sprung dorthin — auch ein
Bauwerk ohne Körper wird gewählt, aus dem Stand, `api.waehleEigenes`); am Teil einer Vorlage der Hinweis, dass eine
Änderung es aus der Steuerung nimmt, bzw. dass es schon abweicht. Am Bauwerk aus einer Vorlage der Abschnitt „Vorlage":
Tabelle mit „Angleichen" je abweichender Zeile (startet `an-vorlage-angleichen` mit der Rolle), „Werte ändern", „Von der
Vorlage lösen". Diese drei Werkzeuge stehen am einzelnen Bauwerk nicht mehr als Knöpfe in der Leiste (`imAbschnitt`).

**Gefunden in der Browserprobe:** nach „Übernehmen" am Bauwerk sprang die Auswahl auf die zuletzt geklickte Wand — das
Nachwählen suchte das Subjekt über seinen Ort im Modell, ein Bauwerk hat keinen. Kur: ein Bauwerk wird nach dem Anwenden
aus dem Stand neu eingeordnet, und beim Wählen eines Bauwerks wird die Modellauswahl geleert.

### 11.7 G5 gebaut (2026-10-04, `test/baugruppe.test.js`, Browserprobe 10/10)

**Was es ist.** Die **Baugruppe** — die dritte Sorte Vorlage (§ 6): ein Bauwerk als Schnappschuss in der Bibliothek,
`{art: 'baugruppe', rezept: 'bauwerk', werkzeug: 'baugruppe-setzen', gewerk, bauwerk: {art, bauwerkstyp}, teile: [{rolle,
rezept, kategorie, name, parameter}]}` — Punkte relativ zu „Mitte unten" (Grundrissmitte, tiefste Höhe), Verweise unter den
Teilen (`anschluss`, `hoeheVon`) als Rollen, keine Formeln. Das Katalogschema nimmt nur Daten: bekannte Rezepte, keine
Ableitungen, keine Bauwerke als Teile, Verweise nur auf eigene Rollen. `services/rezept/Baugruppe.js` (rein).

**Sichern:** am Bauwerk „Als Baugruppe sichern …" (Name, Projekt oder Büro); was nicht mitkommt, sagt die Rückmeldung
(Ableitungen wie eine Öffnung — sie hängen an ihrer Quelle; Bauwerke im Bauwerk; ein Verweis nach draussen).
**Setzen:** die Baugruppe steht in der Palette im Reiter ihres Gewerks (Mehrheit ihrer Teile); der Klick startet „Baugruppe
setzen" — ein Punkt, Drehung, optional Unterkante; EIN Kommando legt Bauwerk und Teile an (dieselbe Rechnung wie eine
Bauwerk-Vorlage, `vorlageTeile`), die Verweise zeigen auf die neuen Kennungen, das Bauwerk nennt seine Herkunft
(Kopfzeile „aus Baugruppe …"). An einem Bauwerk erscheint eine Baugruppe nicht als Vorlage zum „Tauschen".

| gemessen | Wert |
|---|---|
| Ablaufbauwerk des Teichs (Schacht DN 1500, Drossel, Tauchwand, Wehrschwelle, Ablaufhaltung am Schacht, Bauwerk, 5 Zuordnungen) | 11 Kommandos → **1** (6 Einträge, 1 Vorgang) |
| gesetzt um 90° | Längen gleich, Richtung +90°, Anschluss auf den neuen Schacht |
| Browser :3001 | sichern über die Tafel, Palette Entwässerung zeigt sie, Klick belegt das Werkzeug vor, gesetzt: 5 Teile mit den Klassen des Originals |

**Grenzen:** eine Öffnung (Ableitung am Wirt) kommt nicht mit; eine Baugruppe ist ein Schnappschuss — sie wächst nicht mit
Maßen (das bleibt der Bauwerk-Vorlage, Code); kein Bearbeiten einer gesicherten Baugruppe (neu sichern ersetzt sie nicht,
es legt eine zweite an).

### 11.8 G6 gebaut (2026-10-04, `test/gewerkSysteme.test.js`, `test_bauwerke.py::test_g6…`)

**Was es ist.** Der Gewerke-Katalog (`katalog/Gewerke.js`) nennt je Gewerk sein IFC-System — Klasse, Ausführung gegen
die Aufzählung des gepinnten Schemas, Objekttyp bei USERDEFINED; Erdbau (Fachmodell-Gruppe der Vorgänge) und Vermessung
haben keins. Das Paket trägt je Bauteil `gewerk: {id, titel, system}` (additiv); der Schreiber fasst je Bauwerk und Gewerk
zusammen: ein System mit den Teilen (IfcRelAssignsToGroup), am Raumelement referenziert (IfcRelReferencedInSpatialStructure —
gelesen im Schema: `RelatedElements` ist dort `IfcSpatialReferenceSelect = IfcGroup | IfcProduct`, ein System darf stehen).
Teile ohne Bauwerk bilden ihr System an der Site; eine Baugruppe (kein Raumelement) über ihre Anlage. Der Schreiber prüft
nur, was das Paket nennt — eine Klasse, die kein System ist, oder eine unbekannte Ausführung wird genannt, nie geraten.

| Gewerk | System |
|---|---|
| Entwässerung | IfcDistributionSystem / DRAINAGE |
| Wasserbau | IfcBuiltSystem / EROSIONPREVENTION |
| Konstruktiver Ingenieurbau | IfcBuiltSystem / USERDEFINED „Konstruktiver Ingenieurbau" (LOADBEARING schreibt schon das Tragwerk aus dem Merkmal) |
| Verkehrsfläche | IfcBuiltSystem / USERDEFINED „Verkehrsfläche" (TRANSPORT behauptete mehr) |
| Ausstattung & Verkehrstechnik | IfcBuiltSystem / USERDEFINED „Ausstattung" |
| Leitungen | IfcDistributionSystem / USERDEFINED „Leitungen Dritter" |
| Technische Ausrüstung | IfcDistributionSystem / USERDEFINED „Technische Ausrüstung" |
| Landschaft | IfcBuiltSystem / USERDEFINED „Landschaft" |
| Gelände & Erdbau, Vermessung | — |

**Gemessen:** Kammer aus der Vorlage + Rohr unter „Leitungen" + Zaun → 4 Systeme (Konstruktiv und Entwässerung an der
IfcFacility, Leitungen und Ausstattung an der Site), Prüftor 0 offene Befunde, im Verbund dieselben vier an DER Site.

**Wirkung:** `eigenbau.py` wirkt sofort — ein Paket ohne `gewerk` (jeder heute ausgelieferte Client) schreibt keine Systeme,
die Ausgabe bleibt wie bisher (Gold „alte Pakete ergeben dieselbe Datei" unverändert grün). Systeme entstehen erst mit dem
neuen Client. **Nicht gebaut:** Bauwerkstyp Brücke → IfcBridge/IfcBridgePart (E43, für später).

### 11.9 G7 gebaut — P11 über Kommandos (2026-10-04, `test/p11Teich.test.js`, `test_bauwerke.py::test_p11…`, Projekt 10001)

**Was es ist.** Der Teich aus § 11 als Kommandofolge (`test/hilfen/p11Kommandos.js`): **70 Kommandos** — zwei Bauwerke
(Retentionsteich, Bauwerkstyp RRB; Steg), Aushub mit Böschung 1 : 3, neun Schichten aus den Bibliotheks-Vorlagen, Dauerstau
und Rückhalteraum als Raum in der Mulde, Zulauf, Ablaufbauwerk, Notüberlauf, Steg (Pfähle, Jochträger, Belag, Geländer),
Weg zum Steg mit Einfassung, Zufahrt, Zaun, Tor, Pegellatte, Warnschild, dann die Zuordnungen zu den Bauwerken. Kein
Werkzeug kennt den Teich: alles sind Vorlagen und allgemeine Formen aus G1–G6. Derselbe Helfer läuft im Test (Gelände eben
auf 100,00) und im Projekt 10001 (Beispielgelände `10001_Gelaende_Wiese.ifc`, EPSG:25832, eben auf 200,00 im Teichbereich).

| gemessen | Test | Projekt 10001 (Browser :3001) |
|---|---|---|
| Kommandos ausgeführt | 70 / 70 | 70 / 70 (in zwei Läufen, 37 + 33), ein Commit mit 73 Schritten |
| Dauerstau (von Hand 992 m³) | 991,83 m³ | 991,83 m³ |
| Rückhalteraum (von Hand 1 424 m³) | 1 423,83 m³ | 1 423,83 m³ |
| Klasse, Ausführung, Gewerk je Element wie § 11.1 | 30 / 30 | — (dieselben Baupläne) |
| Gewerk **ausdrücklich** gesetzt | 2 (Oberboden: Landschaft statt Wasserbau, Stirnwand: Wasserbau statt Konstruktiv) | — |
| Bauwerk-Pfad in der Kopfzeile | Tondichtung, Dauerstau › Retentionsteich; Belag › Steg; Weg: keins | im Paket: Retentionsteich 23 Teile, Steg 9, ohne Bauwerk 4 |
| Paket | — | 36 Bauteile, 2 Bauwerke, 7 Gewerke |
| durch den Schreiber (Vertragspaket ohne die muldenweiten Körper) | 28 Bauteile, 2 IfcFacility, **8 Systeme**, Prüftor 0 offene Befunde | — |

Die 1/6 m³ zu wenig sind die Eckgrate der Böschung auf dem 0,5-m-Raster (§ 11.5), nicht eine Abweichung der Rechnung.

**Die Facetten tragen — zwei Kuren und ein Hinweis, alle an P11 gefunden:**
1. **Eine Schicht ließ sich keinem Bauwerk zuordnen.** Die Zuordnung prüfte den Bauplan wie ein gezeichnetes Bauteil
   („mindestens 3 Punkte, 0 gesetzt") — eine Ableitung trägt ihre Geometrie in den Operationen. Kur in `pruefeBauplan`.
   Und das Fortschreiben einer Ableitung hätte ihren Bauplan ohne Rolle neu geschrieben: eine Ableitung mit EINEM Teil
   (Schicht, Raum in der Mulde) wird jetzt als ganzer Bauplan fortgeschrieben; eine mit mehreren (ein Erdbau-Vorgang)
   bekommt den Grund „Ein Erdbau-Vorgang gehört ins Fachmodell Erdbau, nicht in ein Bauwerk."
2. **Ein Tor aus der Vorlage gab einen ungültigen IfcDoorType** (OperationType ist im Schema Pflicht). Der Schreiber füllt
   Pflichtattribute einer Aufzählung mit NOTDEFINED; gibt es keinen vertretbaren Wert, entsteht kein Typ, die Vorlage
   bleibt am Merkmal, und die Warnung sagt es (`eigenbau.py`, wirkt sofort; Pakete ohne `typ` unberührt).
3. **IfcEarthworksFill kennt keinen Typ** (Oberboden aus der Vorlage) — kein Fehler, als Warnung gemeldet.

**Gefunden im Browser, nicht gekurt:** jedes Kommando über die Oberfläche baut die Szene neu. Die erste Probe (Kommando und
Neuaufbau je Schritt) kam in 600 s nur bis Kommando 37 — eingeschätzt rund 15 s je Kommando (600 s abzüglich Anmeldung und Laden, durch 37) bei 30 Teilen auf dem Gelände;
die zweite schrieb das Journal ohne Neuaufbau und baute einmal. Für eine Kommandofolge (Skript, Baugruppe) braucht es
„erst alle schreiben, dann einmal bauen" — gehört zur Bibliothek, nicht zu G7.

**Grenzen, benannt:** die muldenweiten Schichten und die beiden Räume sind im Vertragspaket draußen (je 20 000–30 000
Dreiecke, G-T1/G-T2 tragen eigene Verträge); im Projekt stehen sie im Paket. Das Beispielgelände ist im Teichbereich eben —
ein Teich am Hang ist nicht geprobt.

### 11.10 G8 — Abnahme und Pipette (2026-10-04, `test/wieDieses.test.js`, Browserprobe 15/15 in 10001)

**„Wie dieses" (W4).** Am gewählten Eigenbau der Abschnitt „Wie dieses" mit dem Knopf „Wie dieses zeichnen": das
Zeichenwerkzeug, das das Bauteil gemacht hat, mit seinen Feldern vorbelegt — so wie eine Vorlage, nur ohne Bibliothek.
Kein neues Werkzeug, kein neuer Journalweg: `Bearbeitungen.wieDieses(bauplan)` (rein) liefert `{werkzeug, vorgaben}`;
genommen wird genau, was das Formular des Werkzeugs kennt (Klasse, Ausführung, Objekttyp, Maße, Gewerk) und die Vorlage
(die Herkunft bleibt). Name, Höhe und Gelände gehören zum einzelnen Bauteil. Eine Schicht findet ihr Werkzeug über ihre
Form (Umriss → Fläche, Achse → Band). Nicht an einem Bauwerk („als Baugruppe sichern"), nicht an einem Erdbau-Vorgang
(Aushub + Auftrag — dieselbe Regel wie beim Zuordnen), nicht an Geliefertem.

| gemessen | Wert |
|---|---|
| jedes der 30 Teichelemente „wie dieses" als Kommando neu gezeichnet: Rezept, Klasse, Ausführung, Gewerk, alle Werte ohne Ort/Name/Bauwerk | **30 von 30 gleich** |
| Gegenproben (Operationswerte, Klasse, Form → Werkzeug, Vorlage je weggenommen) | 4 / 4 rot |
| Browser :3001, Projekt 10001 | Tondichtung → Schicht-Werkzeug mit Dicke 0,5, Klasse IfcCourse, Vorlage „tondichtung"; Weg → Band mit Breite 2,5; Pfahl → Pfosten als IfcPile/DRIVEN; am Teich kein „Wie dieses"; Journal 73 → 73 (nichts geschrieben); 0 pageerror |

**Die Abnahme der Stufen (§ 9) — Ziel gegen Messung:**

| Stufe | Ziel | gemessen (Test) |
|---|---|---|
| G1 | Rezepte ohne Gewerk 17 → 0 | 0 von 17, Ableitungen 9 von 9 (`gewerke.test.js`) |
| G2 | weniger Knöpfe, 2 Maße = 1 Vorgang | Wand 30 → 20, Rohr 36 → 31, Platte 24 → 16, Raum 21 → 13, Bauwerk 16 → 9; 1 Vorgang (`strukturG0.test.js`) |
| G3 | Erzeugen 18 flach → ≤ 8 je Ansicht | Allgemein 7; je Abschnitt höchstens 9 — Entwässerung hat 9 Bauteile (mit dem Raum in der Mulde, G-T2) und 5 Vorlagen (`palette.test.js`): das Ziel „≤ 8" ist dort um einen Eintrag verfehlt |
| G3b | Teich: Mengen passend zur Klasse, Warnungen 67 → 0 | 0 Warnungen (`test_g0_teich…`) |
| G-T1/G-T2, G4–G7 | wie § 11.4–11.9 | grün |

**In der Abnahme gefunden und behoben — Mengen an Rohr, Schacht, Stab.** G3b hatte die Mengen, die NICHT zur Klasse passten,
auf 0 gebracht; die Gegenrichtung zählte niemand: Elemente, deren Klasse eine Mengenvorlage mit Länge, Fläche oder Volumen
kennt, die aber gar keine Mengen trugen. Gemessen im Schreiber (bSI-Vorlagen des gepinnten ifcopenshell): **G0-Paket 5,
P11 8** — vier Pfähle, Drosselschacht, zwei Haltungen, Warnschild. Ursache: Rohr, Schacht und Pfosten deklarierten keine
Mengen. Kur als Deklaration (kein Code je Klasse): Rohr `length` (waagerechte Achslänge, wie das Gefälle), Schacht
`depth` (neues Körpermaß „Höhenspanne": Sohle bis Deckel) und `grossVolume`, Pfosten `height`/`width`/`thickness` (in den
Namen seiner Vorgabeklasse IfcSign). Eine Klasse ohne Höhe nimmt die Höhe als Länge (`ZIEL_JE_SINN`), so bekommt der
Pfahl `Length`. **Nachher 0 und 0**; Mengensätze G0 20 → 25, P11 16 → 24. Von Hand: Haltungen 21 / 22 m, Pfahl 3 m,
Schild 2 × 0,08 × 0,08 m, Drosselschacht 2,20 m tief, 3,789 m³ (16-Eck, r 0,75 — 2,5 % unter π r² h). Gelesen, nicht
geändert: Ventil, Filter, Sensor kennen nur ein Gewicht, Vegetation hat keine Mengenvorlage — dort sind keine Mengen richtig.
Die Gold-Pakete (Schächte, Leitpfosten) bleiben unverändert; ihr Vergleich nimmt `mengenMethode` aus wie schon `gewerk`.
Zwei Tests gedreht, mit Grund: „ein Rohr hat (noch) keine Mengendeklaration" → „ein Rohr trägt seine Länge"; ein
Testhelfer, der ein aufgelöstes Rezept zur Deklaration zurückbaut, streicht auch die neue Funktion `mengen`.

**Offen, benannt:** G3 „≤ 8 je Ansicht" im Reiter Entwässerung um eins verfehlt (9 Bauteile, bewusst: der Raum in der Mulde gehört dorthin); ein Kommando über die
Oberfläche baut die Szene neu (§ 11.9); „Wie dieses" nimmt keine Merkmalssätze mit (sie hängen am Bauteil, nicht am
Formular) — die Bibliothek ist dafür der Weg.


**Nachtrag (Fabio nach G8: „Steg anklicken öffnet die Eigenschaften nicht — wie wird das bei IFC gehandelt?").** Im IFC ist
ein Bauwerk ein Raumelement (IfcFacility; in einer Anlage IfcFacilityPartCommon, eine Baugruppe IfcElementAssembly) mit
eigener GlobalId, Name, Merkmalen und Klassifizierung; die Teile stehen darin, je Gewerk ein System. Ein Viewer zeigt das
beim Klick auf den Knoten, obwohl es keinen Körper hat. Bei uns führte der Klick auf den Namen ins Leere (er zoomt nur zu
Knoten mit Geometrie). Jetzt wählt er das Bauwerk aus dem Stand (derselbe Weg wie die Kopfzeile); die Tafel zeigt unter
„Merkmale" den Steckbrief `EigenbauPaket.bauwerkImIfc` — aus demselben Paketeintrag, den der Schreiber bekommt, mit seiner
Klassenregel. Gemessen: Steg IfcFacility, 9 Bauteile, Systeme Konstruktiv 7 + Ausstattung 2 (= die Zahlen des Schreibers
in `test_p11…`); Teich IfcFacility, RRB, 23 Bauteile, 5 Systeme. Browser in 10001: beide Klicks 7/7, Journal unverändert.
Nebenbei gesehen, nicht geändert: am Bauwerk steht „Baugrube ums Bauwerk" unter „Weil netz" (Bauform des Bauwerks).
