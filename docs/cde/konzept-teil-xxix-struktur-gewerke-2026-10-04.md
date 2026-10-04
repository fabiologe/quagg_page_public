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
| **G-T2** | Raum in einer Erdmulde (L-B) | Dauerstau 992 m³, Rückhalteraum 1 424 m³ gemessen | Kern |
| **G4** | Kopfzeile mit Facetten; Abschnitt „Vorlage" (Rollentabelle, Angleichen je Rolle, Lösen) | — | Oberfläche |
| **G5** | Baugruppe: „Als Vorlage sichern" am Bauwerk → Bibliothek; setzen mit Punkt + Drehung | Schacht mit Gerinne 1 Kommando | Katalog |
| **G6** | IFC: Gewerk → System je Bauwerk (E42); Bauwerkstyp Brücke → IfcBridge + IfcBridgePart | Systeme im IFC 0 → je Gewerk eines; Prüftor sauber, IDS 0 | Schreiber (wirkt sofort) |
| **G7** | Probe **P11 Retentionsteich** (§ 11) über Kommandos, abgelegt im Projekt 10001 | Stauraum 1 424 m³, Dauerstau 992 m³ gemessen; Facetten tragen ohne Sonderfall | Test + Browser |
| **G8** | Abnahme + Browserprobe; Pipette (W4) wenn Zeit | — | Test + Browser |

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
| eine muldenweite Schicht 52 × 32 m auf 0,5-m-Raster | 28 544 Dreiecke, 0,64 s |
| Browser :3001 ohne Projekt (`erdbau_vergleich.ifc`) | 12/12: Gelände aus der Engine, Vorlage belegt Formular samt Gelände vor, 32 m³ / 11,25 m³, Unterkante folgt (Spanne 1,12 m) |

**Mengen nach Klasse:** IfcCourse → `Thickness`, `Volume`; eine Oberbodenandeckung (IfcEarthworksFill) → `CompactedVolume`,
`Depth` (neu auch für die Platte mit dieser Klasse); IfcGeographicElement hat keine Qto-Vorlage → keine Mengen. Im IFC
geprüft (Prüftor 0 Regelverstöße).

**Grenzen, benannt:** (1) Dreieckszahl: eine Schicht über die ganze Mulde trägt 28 544 Dreiecke, auch dort, wo das
Gelände eben ist — ebene Stücke zusammenzulegen spart das (nicht gebaut). (2) Wo die Anzeige das gelieferte Netz zeigt
(fern jeder Formung), liegt die Unterkante auf dem 0,5-m-Raster dieses Netzes, nicht auf dem Netz selbst — eine dünne
Schicht (Vlies 1 cm) kann dort stellenweise im Gelände verschwinden. (3) Eine Schicht hat noch keine Griffe (Umriss
ziehen) — sie wird über Kommandos und Neuzeichnen geändert.

