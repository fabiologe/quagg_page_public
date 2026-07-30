# Spezifikation

## 3D CFD Werkzeug für den hydraulischen Nachweis von Wasserbauwerken und Becken

Version 0.1, Entwurf als Umsetzungsvorlage

---

# 1 Ziel und Zweck

## 1.1 Ausgangslage

Für den hydraulischen Nachweis von Sonderbauwerken der Siedlungswasserwirtschaft und des Wasserbaus stehen im Büroalltag im Wesentlichen zwei Werkzeugklassen zur Verfügung. Auf der einen Seite eindimensionale Verfahren mit tabellierten Beiwerten, auf der anderen Seite zweidimensionale tiefengemittelte Modelle für Oberflächenabfluss und Überflutung.

Beide Ansätze versagen genau dort, wo der Nachweis eigentlich stattfindet. Ein eindimensionales Verfahren setzt voraus, dass für die vorliegende Bauwerksgeometrie ein Beiwert existiert und dass die Randbedingungen dessen Gültigkeitsbereich entsprechen. Bei realen Bauwerken ist genau das häufig nicht der Fall, etwa bei schräger Anströmung eines Streichwehrs, bei einer zu kurzen Beruhigungsstrecke vor einem Rechen oder bei einem Trennbauwerk mit unsymmetrischer Zulaufgeometrie. Ein tiefengemitteltes 2D Modell scheitert an derselben Stelle aus anderem Grund, weil es eine hydrostatische Druckverteilung und eine über die Tiefe gemittelte Geschwindigkeit annimmt. Beides ist im Nahfeld eines Bauwerks verletzt.

Der bestehende eigene Werkzeugbestand deckt die Ebenen 1D Kanalnetz sowie gekoppelt 1D/2D bereits ab. Was fehlt ist die dritte Ebene, also die lokale dreidimensionale Betrachtung des Bauwerks selbst, eingebettet in die Randbedingungen aus den beiden vorhandenen Modellen.

## 1.2 Zielsetzung

Ziel ist ein Werkzeug, mit dem ein Bearbeiter ein Wasserbauwerk oder Becken innerhalb weniger Stunden dreidimensional hydraulisch prüfen kann, ohne CFD Spezialist zu sein und ohne die OpenFOAM Dateistruktur von Hand anzufassen.

Das Werkzeug leistet dazu vier Dinge.

Erstens die geometrische Modellierung des Bauwerks und seiner Umgebung direkt in einer dreidimensionalen Arbeitsumgebung, mit Werkzeugen die auf wasserbauliche Objekte zugeschnitten sind und nicht auf allgemeine Formgebung.

Zweitens die vollständig automatisierte Erzeugung eines rechenfähigen OpenFOAM Falls aus dieser Modellierung, einschließlich Vernetzung, Randbedingungen und Auswerteanweisungen.

Drittens die Ausführung des Rechenlaufs auf gemieteter Rechenleistung mit vorheriger Kosten und Laufzeitabschätzung.

Viertens die Aufbereitung der Ergebnisse zu genau den Kennwerten, die in einem Nachweis dokumentiert werden müssen, in einer Form die direkt in den technischen Bericht übernommen werden kann.

Fünftens die vollständige räumliche Auswertung des Rechenergebnisses im Browser, auf dem Leistungsniveau eines eigenständigen Visualisierungswerkzeugs. Dieser Punkt ist gleichrangig zu den vorgenannten und nicht nachgeordnet, weil ein erheblicher Teil der fachlichen Beurteilung nicht an Kennwerten hängt sondern an der Anschauung des Strömungsbildes.

## 1.3 Anwendungsfälle

Der Zielbestand an Bauwerken umfasst folgende Typen. Die Liste ist die Grundlage für die Priorisierung des Bauwerkskatalogs im PreViewer.

**Regenwasserbehandlung und Rückhaltung**

Regenüberlaufbecken als Fang und als Durchlaufbecken, Regenklärbecken, Regenrückhaltebecken, Stauraumkanäle mit oben oder unten liegender Entlastung, Retentionsbodenfilter im Bereich der Zulaufverteilung.

**Verteilung, Trennung und Regelung**

Trennbauwerke, Verteilerbauwerke, Streichwehre und sonstige Entlastungsanlagen, Drosselbauwerke und Abflussregelorgane, Wirbelfallschächte.

**Ein und Auslauf**

Einlaufbauwerke, Auslaufbauwerke, Tosbecken und Energieumwandlungsanlagen, Absturzbauwerke und Kaskaden, Auskolkungsbereiche im Anschluss an Ausläufe.

**Maschinelle und mechanische Einbauten**

Rechen und Siebanlagen einschließlich Teilverlegung, Pumpensümpfe und Vorlagebehälter, Klappen und Schütze im Hinblick auf die Belastung.

**Kläranlagen**

Absetz und Nachklärbecken, Verteilerbauwerke, Zulaufhydraulik zu Beckenstraßen.

**Gewässerbau**

Durchlässe und Verrohrungen, Brückenwiderlager und Pfeiler im Abflussquerschnitt, örtliche Aufweitungen und Verengungen.

## 1.4 Fachliche Fragestellungen die eine dreidimensionale Betrachtung erfordern

Die folgenden Fragestellungen definieren den funktionalen Umfang. Jede von ihnen erzeugt eine konkrete Anforderung an das PostProzessing, und diese Zuordnung ist der Grund dafür dass das PostProzessing vor dem PreProzessing spezifiziert wird.

| Fragestellung | Benötigte Ergebnisgröße |
|---|---|
| Abflussaufteilung an Trenn und Verteilerbauwerken über den gesamten Zuflussbereich | Durchfluss je Querschnitt über Zeit, Verhältniswerte |
| Wehrüberfall bei ungünstiger Anströmung außerhalb des Gültigkeitsbereichs tabellierter Überfallbeiwerte | Überfallhöhe, Durchfluss, abgeleiteter effektiver Beiwert |
| Örtliche Verlusthöhen an Krümmern, Vereinigungen und Bauwerken ohne Tabellenwert | Energiehöhendifferenz zwischen zwei Querschnitten |
| Strömungsverteilung im Becken, Totzonen und Kurzschlussströmung | Geschwindigkeitsfeld im Grundriss und im Schnitt, Stromlinien |
| Wirksames Beckenvolumen und Verweilzeitverhalten | Wasservolumen über Zeit, optional Tracertransport |
| Sedimentationsverhalten und Räumbarkeit | Sohlschubspannungsverteilung |
| Anströmung und Verlusthöhe am Rechen, auch bei angesetzter Teilverlegung | Geschwindigkeitsverteilung vor der Rechenebene, Druckdifferenz |
| Lage und Stabilität des Wechselsprungs im Tosbecken | Wasserspiegellängsschnitt, Froude Zahl, Geschwindigkeitsverteilung |
| Lufteintrag an Absturzbauwerken | Phasenanteil im Bereich des Absturzes |
| Wirbelbildung an Pumpeneinläufen | Geschwindigkeitsfeld und Wasserspiegel im Einlaufbereich |
| Belastung von Rechen, Wänden, Klappen und Pfeilern für die Tragwerksplanung | Kräfte und Momente je Bauteil über Zeit, Extremwerte |
| Auskolkungsgefahr im Auslaufbereich | Sohlschubspannung und bodennahe Geschwindigkeit |
| Freibordnachweis und maximaler Einstau | Wasserspiegellage je Pegelpunkt über Zeit |

## 1.5 Wann eine dreidimensionale Betrachtung nicht angemessen ist

Diese Abgrenzung gehört bewusst in die Spezifikation, weil sie verhindert dass das Werkzeug für Fälle eingesetzt wird in denen es unverhältnismäßig ist.

Liegt eine Regelgeometrie vor, für die im einschlägigen Regelwerk ein Beiwert mit passendem Gültigkeitsbereich angegeben ist, und sind die Randbedingungen innerhalb dieses Bereichs, dann ist der eindimensionale Nachweis vorzuziehen. Er ist schneller, prüffähiger und in der Genehmigungspraxis unstrittig. Das Werkzeug ist für die Fälle gedacht, in denen diese Voraussetzung nachweisbar nicht erfüllt ist, oder in denen zusätzlich zur Dimensionierung eine Aussage über die räumliche Strömungsverteilung, über Belastungen oder über Sedimentationsverhalten verlangt wird.

## 1.6 Regelwerksbezug

Der Nachweis selbst wird nicht durch die Simulation definiert sondern durch das Regelwerk. Das Werkzeug muss deshalb je Fall festhalten gegen welches Regelwerk und gegen welche Kriterien geprüft wird, und diese Angabe in die Ergebnisdokumentation übernehmen.

Für den Zielbestand einschlägig sind insbesondere die folgenden Dokumente, wobei die im Einzelfall maßgebliche Fassung und der maßgebliche Abschnitt projektbezogen festzulegen sind.

- DWA-A 112, hydraulische Dimensionierung neu zu erstellender sowie Leistungsnachweis bestehender Sonderbauwerke. Das ist für den Zielbestand das zentrale Dokument
- DWA-A 110, hydraulische Dimensionierung und Leistungsnachweis von Abwasserleitungen und Kanälen
- DWA-A 111, hydraulische Dimensionierung von Anlagen zur Abflussregelung sowie von Regenwasserentlastungsanlagen
- DWA-A 166 in der Fassung 2013-11, Bauwerke der zentralen Regenwasserbehandlung und Rückhaltung mit der Unterscheidung der Beckenarten
- DWA-M 176 in der Fassung 2013-11, Hinweise zur konstruktiven Gestaltung von Sonderbauwerken
- DWA-A 157, Bauwerke der Kanalisation
- DWA-A 102, Grundsätze zur Bewirtschaftung von Niederschlagswasser
- DWA-M 509, für Fischaufstiegsanlagen, dort ist die numerische Strömungssimulation als Beurteilungswerkzeug beckenartiger Anlagen bereits etabliert

Anmerkung zur Verwendung. Für die Nachvollziehbarkeit im Bericht ist die Simulation kein Ersatz für den Regelwerksnachweis sondern das Mittel, mit dem die Eingangsgrößen des Nachweises ermittelt werden. Die Ergebnisdokumentation ist entsprechend aufzubauen, also Kennwert aus der Simulation, Vergleich mit dem Kriterium aus dem Regelwerk, Bewertung.

## 1.7 Abgrenzung des Leistungsumfangs

Das Werkzeug leistet ausdrücklich nicht die folgenden Dinge.

Keine Netzberechnung und keine Niederschlagsabflussmodellierung. Die Randbedingungen kommen aus den bestehenden 1D und 1D/2D Werkzeugen.

Keine allgemeine CAD Funktionalität. Der Bauwerkskatalog ist bewusst geschlossen. Komplexe Einzelkörper werden im vorhandenen CAD erstellt und als Volumenkörper importiert.

Keine Auslagerung der räumlichen Auswertung an ein externes Programm. Die vollständige dreidimensionale Auswertung erfolgt im Browser, der reguläre Arbeitsablauf soll ohne ein zusätzliches Visualisierungswerkzeug auskommen. Der Umfang ist in Kapitel 8 unter Räumliche Auswertung in 3D festgelegt. Nicht enthalten ist ein frei konfigurierbarer Filtergraph im Sinne eines allgemeinen Visualisierungsbaukastens, die verfügbaren Auswertungen sind ein festes und auf den Anwendungsfall zugeschnittenes Set.

Keine Feststoffsimulation in der ersten Ausbaustufe. Die Wirkung von Verlegung durch Treibgut wird über einen angesetzten Verlegungsgrad im Widerstandsmodell abgebildet und nicht über Partikelverfolgung.

Keine Tragwerksberechnung. Das Werkzeug liefert Einwirkungen, die Bemessung erfolgt außerhalb.

## 1.8 Nutzerprofil

Der Nutzer ist ein Bauingenieur mit wasserbaulicher Ausbildung und sicherem Verständnis der Hydraulik, ohne vertiefte Kenntnis der Finite Volumen Methode und ohne Erfahrung mit der OpenFOAM Konfiguration. Er kennt seine Bauwerksgeometrie, kennt die Randbedingungen, kennt das anzuwendende Regelwerk und weiß welche Kennwerte er im Bericht braucht.

Daraus folgen drei Gestaltungsanforderungen. Numerische Parameter mit fachlich vertretbaren Vorbelegungen, die nur bei Bedarf sichtbar werden. Fehlermeldungen in wasserbaulicher und nicht in numerischer Sprache. Und eine durchgehende Plausibilitätsprüfung, die problematische Modellierungsentscheidungen bereits im Editor meldet und nicht erst nach einem bezahlten Rechenlauf.

---

# 2 Nachweisgrößen als Ausgangspunkt der Entwicklung

Die Entwicklung erfolgt rückwärts von der Ergebnisdokumentation. Die folgende Liste ist die vollständige Menge der Größen, die das Werkzeug ausgeben muss. Alles was nicht auf dieser Liste steht wird nicht implementiert.

**Zeitreihen**

- Wasserspiegellage je definiertem Pegelpunkt
- Durchfluss je definiertem Querschnitt
- Kraft und Moment je definiertem Bauteil, getrennt nach Druck und Reibungsanteil
- Wasservolumen im Modellgebiet
- Massenbilanzfehler
- Residuen, Courant Zahl und Zeitschrittweite

**Abgeleitete Darstellungen für den Bericht**

- Wassertiefe im Grundriss
- Wasserspiegelhöhe als Höhenlinien
- Geschwindigkeitsbetrag im Grundriss und im Schnitt
- Sohlschubspannung im Grundriss
- Phasenanteil im Schnitt, für die Beurteilung des Lufteintrags

**Vollständige räumliche Felder je Ausgabezeitpunkt, für die interaktive Auswertung**

- Phasenanteil
- Geschwindigkeit als Vektor
- Druck, reduziert und gesamt
- Turbulente kinetische Energie und Wirbelviskosität
- Sohlschubspannung als Flächengröße auf Gelände und Bauwerksflächen
- Abgeleitet aus den vorgenannten, Froude Zahl und Energiehöhe

**Abgeleitete Kennwerte**

- Extremwert je Zeitreihe mit Zeitpunkt des Auftretens
- Verhältnis zweier Durchflüsse, für die Abflussaufteilung
- Energiehöhendifferenz zwischen zwei Querschnitten, als örtliche Verlusthöhe
- Froude Zahl entlang eines Längsschnitts
- Effektiver Überfallbeiwert, rückgerechnet aus Überfallhöhe und Durchfluss
- Bewertung je Nachweiskriterium, also Kennwert gegen Grenzwert mit Ergebnis

---

# 3 Systemarchitektur

Die Abhängigkeitsrichtung ist strikt einseitig. Frontend hängt an der API, die API hängt am Core, der Core hängt an nichts. Der Core enthält keinen Web und keinen Frontend Code.

```
Vue Frontend
    |
    v
FastAPI  ----  jobs (SQLite Zustandstabelle)
    |
    v
Core (Python)
    casespec      Schema und Validierung
    conventions   Einheiten, Vorzeichen, Höhenbezug
    terrain       Höhenfeld und Operationsstapel
    solids        parametrische Bauwerkserzeugung
    meshgen       blockMesh und snappyHexMesh Dictionaries
    casebuilder   OpenFOAM Fallstruktur inklusive functionObjects
    runner        lokal und RunPod hinter einem Interface
    extract       Leser der OpenFOAM Ausgaben
    normalize     normalisierte Zwischendatei
    evaluate      Nachweisgrößen und Bewertung
    render        Abbildungen, Tabellen, Bericht
    store         Ablage und Index der Läufe
    cli           alles headless aufrufbar
```

Zwei Regeln die über die Wartbarkeit entscheiden.

Erstens, jeder Schritt ist über die CLI ohne Frontend ausführbar. Das ist die Voraussetzung für Regressionstests und für die Bearbeitung durch einen Agenten.

Zweitens, die maßgebliche Geometrie entsteht ausschließlich serverseitig im Modul solids. Das Frontend erzeugt nur Vorschaugeometrie. Damit gibt es keine Abweichung zwischen dem was der Nutzer sieht und dem was gerechnet wird.

---

# 4 Datenmodell

## 4.1 casespec, der zentrale Vertrag

Eine Datei beschreibt den vollständigen Fall. PreProzessing liest sie und erzeugt den OpenFOAM Fall, PostProzessing liest dieselbe Datei und leitet daraus ab welche Auswertungen zu erstellen sind. Die functionObjects im controlDict werden aus dem Abschnitt evaluation generiert. Damit ist die Kopplung zwischen Pre und Post im Code verankert.

```yaml
meta:
  id: rueb-nord-v3
  title: "RÜB Nord, Nachweis Trennbauwerk und Rechen"
  crs:
    epsg: 25832
    origin: [432150.0, 5512300.0]
    rotation_deg: 0.0
  vertical_datum: DHHN2016
  conventions:
    length_unit: m
    force_sign: outward_normal
    level_reference: absolute
  nachweis:
    regelwerk: ["DWA-A 112:2007-08", "DWA-A 166:2013-11"]
    bearbeiter: "..."
    lastfall: "HQ100, Zufluss aus 1D Modell Variante 3"

domain:
  extent: [0.0, 0.0, 100.0, 100.0]
  z_min: 92.0
  z_max: 104.0

terrain:
  base:
    source: dgm_ausschnitt.tif
    resolution: 0.25
  operations:
    - id: t01
      type: channel_carve
      polyline: [[10,50],[45,50],[62,44]]
      invert_start: 95.20
      invert_end: 95.05
      bottom_width: 2.0
      depth: 1.20
      side_slope: 1.5
    - id: t02
      type: pad
      polygon: [[60,40],[80,40],[80,60],[60,60]]
      level: 96.50

structures:
  - id: wand_ost
    type: wall
    patch: wand_ost
    alignment:
      kind: spline
      points: [[62,44,99.50],[70,42,99.50],[78,45,99.30]]
    height: 3.00
    thickness: 0.35

  - id: rechen_01
    type: screen
    patch: rechen_01
    plane_polygon: [[70,41,95.60],[70,45,95.60],[70,45,98.00],[70,41,98.00]]
    bar_spacing: 0.020
    bar_thickness: 0.008
    approach_angle_deg: 75
    resistance:
      model: darcy_forchheimer
      d: [0, 0, 0]
      f: [120, 0, 0]
      blockage_ratio: 0.30

  - id: durchlass_sued
    type: culvert
    patch: durchlass_sued
    axis: [[78,45,95.00],[92,45,94.80]]
    profile:
      kind: circular
      diameter: 1.20

  - id: detail_drossel
    type: imported
    patch: detail_drossel
    source: drossel_v2.stl

mesh:
  base_cell: 0.40
  refinements:
    - id: r01
      type: box
      extent: [65,38,94.5,85,50,99.0]
      level: 3
    - id: r02
      type: surface
      target: rechen_01
      level: 4
  boundary_layers:
    patches: [wand_ost, rechen_01]
    n_layers: 3
    expansion_ratio: 1.2

boundaries:
  - id: inlet
    patch: inlet
    type: inflow_hydrograph
    source: zufluss_hq100.csv
    column_time: t
    column_q: Q
  - id: outlet
    patch: outlet
    type: outflow_fixed_level
    level: 94.90
  - id: atmosphere
    patch: atmosphere
    type: atmosphere

solver:
  application: interFoam
  end_time: 300
  max_co: 0.5
  max_alpha_co: 0.3
  turbulence: kOmegaSST
  write_interval_fields: 10.0
  write_interval_series: 0.1

evaluation:
  sections:
    - id: qs_zulauf
      polyline: [[20,45],[20,55]]
    - id: qs_klaerueberlauf
      polyline: [[72,40],[72,50]]
  gauges:
    - id: pegel_becken
      point: [75,45]
    - id: pegel_zulauf
      point: [20,50]
  force_patches: [wand_ost, rechen_01]
  profiles:
    - id: laengsschnitt_becken
      polyline: [[15,50],[95,45]]
  targets:
    - id: aufteilung_klaerueberlauf
      kind: discharge_ratio
      of: qs_klaerueberlauf
      to: qs_zulauf
      limit_max: 0.35
    - id: max_einstau_becken
      kind: max_level
      at: pegel_becken
      limit_max: 99.20
    - id: last_rechen
      kind: max_force
      at: rechen_01
      component: magnitude
    - id: sohlschubspannung_becken
      kind: min_bed_shear
      region: r01
      limit_min: 1.0
```

## 4.2 Normalisierte Zwischendatei

Alle Zeitreihen aus allen Quellen landen in einer Tabelle im Langformat, gespeichert als Parquet. Diese Datei ist die einzige Eingangsgröße für evaluate und render.

| Spalte | Bedeutung |
|---|---|
| run_id | Kennung des Rechenlaufs |
| time | Zeit in Sekunden, native Zeitachse der Quelle |
| quantity | force, moment, discharge, level, volume, residual, courant, bed_shear |
| location_id | ID aus der casespec, also Patch, Querschnitt oder Pegelpunkt |
| component | x, y, z, magnitude, pressure, viscous oder leer |
| value | Zahlenwert in SI |
| unit | Einheit als Text, zur Kontrolle |
| source | erzeugendes functionObject, für die Rückverfolgung |

Räumliche Ausgaben, also die für die Darstellung konvertierten Felddaten, Rasterfelder für den Grundriss und exportierte Abbildungen, gehen nicht in diese Tabelle. Sie bleiben Dateien und werden über eine Pfadreferenz mit Zeitstempel eingebunden. Isoflächen, Schnitte, Stromlinien und Glyphen werden nicht vorab erzeugt sondern zur Laufzeit aus den Felddaten im Browser berechnet.

Regel zur Zeitachse. In der Zwischendatei bleibt die native, nicht äquidistante Zeitachse jeder Quelle erhalten. Ein Resampling erfolgt ausschließlich in evaluate. Zeitintegrale werden über die tatsächlichen Zeitschritte gebildet und nicht als einfache Summe.

## 4.3 Ergebnis JSON

Pro Lauf eine Datei. Das ist die einzige Eingangsgröße für render.

```json
{
  "run_id": "rueb-nord-v3_r014",
  "case_hash": "8f2c...",
  "status": "completed",
  "quality": {
    "mass_balance_error_rel_max": 0.004,
    "residual_p_rgh_final": 3.1e-07,
    "courant_mean": 0.31,
    "checkmesh_ok": true,
    "y_plus_range": [12.4, 180.2]
  },
  "targets": [
    {
      "id": "max_einstau_becken",
      "kind": "max_level",
      "value": 99.04,
      "unit": "m",
      "time_of_occurrence": 172.4,
      "limit_max": 99.20,
      "result": "erfuellt",
      "utilisation": 0.984
    }
  ],
  "extremes": [
    {"location_id": "rechen_01", "quantity": "force", "component": "magnitude",
     "value": 18420.0, "unit": "N", "time_of_occurrence": 168.9}
  ],
  "figures": [
    {"id": "grundriss_tiefe_t170", "path": "figures/grundriss_tiefe_t170.png",
     "caption": "Wassertiefe zum Zeitpunkt der maximalen Belastung"}
  ]
}
```

## 4.4 Laufmanifest

Eine kleine Datei je Lauf, die für die Berichtsdokumentation und die Rückverfolgbarkeit erforderlich ist. Inhalt sind OpenFOAM Version und Variante, Solveranwendung, Netzkennwerte aus checkMesh, Zellenzahl, Hash der casespec, Startzeit, Laufzeit, Anzahl Kerne, Rechenumgebung, Kosten und Abbruchgrund.

---

# 5 Geometriemodell

Die Trennung nach Objektart ist die zentrale Entscheidung. Sie erlaubt direktes räumliches Arbeiten und garantiert gleichzeitig eine für die Vernetzung gültige Geometrie.

## 5.1 Gelände als Höhenfeld

Das Gelände ist ein reguläres Raster mit einem Höhenwert je Zelle. Ein Höhenfeld kann konstruktiv keine Selbstdurchdringung und keine nicht wasserdichte Geometrie erzeugen. Damit ist brushbasiertes Arbeiten unproblematisch. Bei 100 mal 100 Metern und 0,25 Meter Auflösung sind es 160.000 Werte, das ist interaktiv ohne Weiteres beherrschbar.

Alle Geländeoperationen werden als geordneter Stapel gespeichert und nicht in das Raster eingerechnet. Daraus folgen drei Eigenschaften. Rücknahme über beliebig viele Schritte, nachträgliche Parameteränderung jeder einzelnen Operation, und vollständige Dokumentierbarkeit der angesetzten Geländeanpassungen im Bericht.

## 5.2 Bauwerke als parametrische Körper

Bauwerke werden nicht frei geformt sondern aus einem geschlossenen Katalog konstruiert. Die Bearbeitung erfolgt dennoch direkt in der räumlichen Szene über Stützpunkthandles, das Arbeitsgefühl entspricht direkter Formgebung.

Der Grund gegen freie Formgebung ist zweifach. Technisch, weil die Vernetzung wasserdichte und selbstdurchdringungsfreie Geometrie voraussetzt und ein fehlerhaftes Netz nicht immer zum Abbruch führt sondern zu stillschweigend falschen Ergebnissen. Fachlich, weil ein Nachweis die Angabe der angesetzten Abmessungen verlangt und eine frei geformte Netzgeometrie diese Angabe nicht liefert.

## 5.3 Import

Der Import von Volumenkörpern aus dem CAD bleibt als Objekttyp erhalten. Er ist der Weg für Details, die parametrisch nicht sinnvoll beschreibbar sind, etwa ein Drosselorgan oder ein Fertigteilbauwerk.

---

# 6 PreViewer

## 6.1 Ansichten

**Hauptansicht 3D**

Perspektivische oder orthogonale Szene mit Gelände, Bauwerken, Verfeinerungsboxen als Drahtkörper, Randflächenmarkierungen, Querschnittslinien und Pegelpunkten. Das ist die primäre Arbeitsfläche.

**Grundrissansicht**

Koordinatentreue Draufsicht mit denselben Objekten, umschaltbar oder als zweite Ansicht. Erforderlich für koordinatengenaues Setzen und für die Übernahme von Koordinaten aus dem CAD.

**Schnittansicht**

Vertikaler Schnitt entlang einer wählbaren Linie mit Geländeprofil, Bauwerkssilhouette, vertikaler Ausdehnung der Verfeinerungsboxen und geschätzter Wasserspiegellage als Hilfslinie. Das ist die wichtigste Kontrollansicht, weil hier geprüft wird ob die Netzverfeinerung den Bereich der freien Oberfläche vertikal überhaupt erfasst.

**Objektbaum**

Liste aller Objekte mit ID, Typ, Sichtbarkeit und Validierungsstatus.

**Eigenschaftspanel**

Formular je Objekttyp, generiert aus dem JSON Schema.

**Validierungspanel**

Meldungen nach Schweregrad, jede mit Sprung zum betroffenen Objekt.

**Netz und Kostenvorschau**

Ergebnis eines billigen Vernetzungsprobelaufs mit Zellenzahl, checkMesh Kennwerten, schlechtester Zellqualität sowie geschätzter Laufzeit und geschätzten Kosten. Diese Ansicht steht zwischen Bearbeitung und Absenden.

## 6.2 Geländewerkzeuge

Alle Werkzeuge arbeiten auf dem Höhenfeld und erzeugen einen Eintrag im Operationsstapel.

| Werkzeug | Parameter |
|---|---|
| Anheben und Absenken | Radius, Abklingfunktion, Stärke, Vorzeichen |
| Glätten | Radius, Stärke, optional Begrenzungspolygon |
| Planum | Polygon, Zielhöhe |
| Gerinne einschneiden | Polylinie, Sohlhöhe Anfang und Ende, Sohlbreite, Tiefe, Böschungsneigung |
| Rampe | Polygon, zwei Zielhöhen, Interpolationsrichtung |
| Dammschüttung | Polylinie, Kronenhöhe, Kronenbreite, Neigung beidseitig |
| Bereich ersetzen | Polygon, Quellraster |
| Absoluthöhe setzen | Polygon, Höhe, optional mit Übergangsbreite |

## 6.3 Bauwerkswerkzeuge

| Typ | Parameter | Erzeugte Geometrie |
|---|---|---|
| Wand | Polylinie oder Spline, Höhe konstant oder je Stützpunkt, Dicke, optional Neigung | Sweep entlang der Achse, unten in das Gelände eingebunden |
| Durchlass | Achspolylinie, Profiltyp aus Kreis, Rechteck oder Maulprofil, Abmessungen, Sohlhöhen an beiden Enden | Rohrkörper als Hohlraum im Gelände |
| Rechen | Polygon der Rechenebene im Raum, Stabteilung, Stabdicke, Anströmwinkel, Verlegungsgrad | Fläche als Begrenzung einer porösen Zone, Stäbe werden nicht aufgelöst |
| Wehr | Kronenpolylinie, Kronenhöhe, Kronenbreite, Neigung Ober und Unterwasserseite | Sweep mit Wehrquerschnitt |
| Pfeiler und Widerlager | Grundrisspolygon, Fuß und Kopfhöhe, optional Anlauf | Extrusion |
| Becken | Grundrisspolygon, Sohlhöhe, Sohlgefälle, Wandhöhe, Wanddicke | Zusammengesetzter Körper aus Sohle und umlaufender Wand |
| Importkörper | STL Datei, Einfügepunkt, Drehung | unverändert übernommen |

Priorität für die erste Ausbaustufe sind Wand, Durchlass, Rechen und Becken. Wehr, Pfeiler und Widerlager folgen nach dem ersten abgeschlossenen Nachweis.

## 6.4 Bearbeitungshilfen

- Stützpunkthandles, im Grundriss ziehbar, Höhe über vertikalen Handle oder numerische Eingabe
- Fangen auf Geländeoberfläche, auf Stützpunkte anderer Objekte, auf ein Koordinatenraster und auf Bauwerkskanten
- Interaktive Schnittebene zur Prüfung von Innenräumen und Geländeeinbindung
- Messwerkzeug für Abstand, Höhendifferenz und Neigung
- Numerische Eingabe überall gleichwertig zur Mausbedienung, weil Koordinaten regelmäßig aus dem CAD übernommen werden
- Rücknahme und Wiederherstellung über den gesamten Bearbeitungsverlauf

---

# 7 Validierungsregeln

Die Validierung läuft fortlaufend und ist der eigentliche Mehrwert gegenüber allgemeinen Geometrie und Visualisierungswerkzeugen. Jede Regel liefert Objekt ID, Schweregrad und eine Meldung in wasserbaulicher Sprache.

**Geometrie**

- Erzeugter Körper ist wasserdicht und manifold
- Kein Sweep mit Selbstdurchdringung, tritt bei zu kleinem Krümmungsradius im Verhältnis zur Wanddicke auf
- Keine degenerierten oder überlappenden Dreiecke
- Jedes Bauwerk ist in das Gelände eingebunden, hängt also nicht in der Luft und verschwindet nicht vollständig darunter
- Keine unbeabsichtigten Spalte zwischen benachbarten Bauwerken

**Vernetzbarkeit**

- Mindestabmessung jedes Bauteils gegen die geplante lokale Zellgröße. Eine 0,20 Meter dicke Wand bei 0,30 Meter Zellgröße wird nicht aufgelöst. Diese Prüfung im Editor spart mehr Zeit als jede andere Maßnahme
- Verfeinerungsbox liegt vollständig im Modellgebiet
- Verfeinerungsbox erfasst den erwarteten Bereich der freien Oberfläche vertikal
- Grenzschichtdefinition ist mit der lokalen Zellgröße verträglich
- Patchname existiert in der erzeugten Geometrie

**Hydraulik und Randbedingungen**

- Genau ein Zuflussrand und mindestens ein Abflussrand definiert
- Zuflussrand liegt unterhalb der erwarteten Wasserspiegellage
- Abflussrand liegt nicht im Nahfeld des zu untersuchenden Bauwerks
- Zuflussganglinie ist zeitlich lückenlos und deckt die Simulationsdauer ab
- Modellgebietsränder haben ausreichenden Abstand zum Bauwerk, mindestens fünf Gerinnebreiten stromauf und zehn stromab als Vorbelegung
- Rechen ohne Widerstandsbeiwert oder ohne angesetzten Verlegungsgrad

**Auswertung**

- Jede Querschnittslinie schneidet das Gelände und liegt vollständig im Modellgebiet
- Jeder Pegelpunkt liegt innerhalb des Modellgebiets und in einem Bereich mit erwarteter Wasserbedeckung
- Jedes Nachweiskriterium verweist auf eine existierende Auswertungsgröße
- Jedes Kraftpatch existiert als Bauwerkspatch

---

# 8 PostViewer

**Laufauswahl**

Auswahl eines oder mehrerer Läufe. Alle Diagramme legen die gewählten Läufe übereinander. Vergleich ist Grundfunktion, weil sowohl die Variantenuntersuchung als auch die Plausibilisierung gegen die 1D und 2D Ergebnisse darüber läuft.

**Qualitätsansicht**

Massenbilanzfehler über Zeit, Zufluss gegen Abfluss, Residuen, Courant Zahl, Zeitschrittweite, checkMesh Kennwerte und Wandabstandskennwert. Diese Ansicht steht bewusst vor allen inhaltlichen Auswertungen, weil sie beantwortet ob der Lauf verwertbar ist.

**Zeitreihenpanel**

Kräfte und Momente je Bauteil, Durchflüsse je Querschnitt, Wasserstände je Pegelpunkt. Gemeinsamer Zeitcursor über alle Diagramme, der gleichzeitig den dargestellten Zeitpunkt in Grundriss, Schnitt und 3D Ansicht steuert.

**Grundriss mit Feldern**

Wassertiefe als Farbraster, Wasserspiegelhöhenlinien, Sohlschubspannung, optional Geschwindigkeitsvektoren. Dieselbe Komponente wie im PreViewer, mit zusätzlichen Layern.

**Schnitt und Längsprofil**

Wasserspiegellängsschnitt entlang einer definierten Linie mit Gelände und Bauwerkssilhouette darunter, Geschwindigkeitsverteilung, Froude Zahl, Energielinie. Überlagerung der Ergebnisse aus 1D und 2D als Vergleichskurven.

**Räumliche Auswertung in 3D**

Vollwertige interaktive Visualisierung des Rechenergebnisses im Browser. Diese Ansicht ersetzt das externe Visualisierungswerkzeug im regulären Arbeitsablauf vollständig.

Darstellbare Größen sind Phasenanteil, Geschwindigkeit als Betrag und als Komponenten, reduzierter und gesamter Druck, Sohlschubspannung, Turbulenzgrößen sowie die abgeleiteten Größen Froude Zahl und Energiehöhe.

Verfügbare Auswertungen, geordnet nach Nutzen für den Nachweis.

- Wasseroberfläche als Isofläche des Phasenanteils, einfärbbar nach jeder Feldgröße
- Frei positionierbare Schnittebene mit Feldeinfärbung, einzeln oder als Ebenenstapel entlang einer Achse
- Schwellwertfilter zum Ausblenden der Luftphase, sodass nur der wasserführende Bereich dargestellt wird. Das ist bei Mehrphasenrechnungen die am häufigsten benötigte Funktion
- Flächendarstellung auf Gelände und Bauwerksflächen, insbesondere Sohlschubspannung für Sedimentation und Räumbarkeit
- Vektorpfeile mit Skalierung, Ausdünnung und Begrenzung auf eine Schnittebene
- Isoflächen beliebiger Feldgrößen mit einstellbarem Schwellwert
- Stromlinien und Bahnlinien mit Startpunkten, Startlinien oder Startflächen. Für Totzonen, Kurzschlussströmung und Verweilzeitbeurteilung ist das die maßgebliche Darstellung
- Volumendarstellung mit einstellbarer Übertragungsfunktion, vor allem für die Beurteilung des Lufteintrags
- Punktabfrage mit Anzeige aller Feldwerte an der Cursorposition
- Zeitliche Animation über alle vorliegenden Ausgabezeitpunkte, mit Export als Bildsequenz

Anforderungen an die Bedienung, die den Unterschied zwischen brauchbar und unbrauchbar ausmachen.

- Farbskalen fixierbar über Zeitpunkte und über Läufe hinweg. Ohne das sind Vergleichsbilder wertlos, weil eine automatisch skalierte Legende jedes Bild anders normiert
- Kamerastellungen speicherbar und je Lauf reproduzierbar, damit Abbildungen verschiedener Varianten deckungsgleich sind
- Jede Ansicht als PNG und SVG exportierbar, mit Laufkennung, Zeitpunkt, dargestellter Größe und Wertebereich der Farbskala in der Bildunterschrift
- Umschaltung zwischen Läufen ohne Verlust von Kamera, Filtern und Farbskala

**Extremwerttabelle**

Maximalwerte je Ort und Größe mit Zeitpunkt des Auftretens. Direkter Zulieferer für die Nachweistabelle im Bericht.

**Nachweisübersicht**

Je Kriterium aus der casespec eine Zeile mit Kennwert, Grenzwert, Ausnutzungsgrad und Bewertung. Das ist die Ansicht die der Bearbeiter zuerst öffnet und die inhaltlich dem Nachweis im Bericht entspricht.

**Abbildungsexport**

Auswahl von Diagrammen und Ansichten, Export als PNG und SVG, gemeinsam mit der zugrundeliegenden Datentabelle und der Laufkennung in der Bildunterschrift.

**Logansicht**

---

# 9 API

Ein Endpunkt je Ansicht, das Backend liefert browserfertige Formate. Für die räumliche Auswertung werden Felddaten in den Browser übertragen, allerdings nicht die OpenFOAM Rohdaten sondern eine serverseitig konvertierte und für die Darstellung reduzierte Fassung. Die Reduktion ist einstellbar, die Rohdaten der Rechnung bleiben unangetastet.

| Methode und Pfad | Rückgabe |
|---|---|
| GET /cases | Liste der Fälle |
| GET /cases/{id} | casespec |
| PUT /cases/{id} | casespec speichern, Antwort enthält Validierungsergebnis |
| GET /cases/{id}/schema | JSON Schema für die Formularerzeugung |
| GET /cases/{id}/terrain | Höhenfeld als binäres Raster mit Georeferenz |
| POST /cases/{id}/terrain/op | Operation anwenden, Antwort enthält geändertes Teilraster |
| GET /cases/{id}/solids | Vorschaugeometrie der Bauwerke, gltf oder binäres STL |
| POST /cases/{id}/profile | Polylinie hinein, Geländeprofil und Bauwerksschnittpunkte heraus |
| GET /cases/{id}/validate | Liste aus Objekt ID, Schweregrad, Meldung |
| POST /cases/{id}/mesh-preview | Zellenzahl, checkMesh Kennwerte, Laufzeit und Kostenschätzung |
| POST /runs | Lauf starten, Antwort enthält run_id |
| GET /runs | Laufliste mit Status |
| GET /runs/{id} | Status, Manifest, Kosten |
| GET /runs/{id}/log | Logausgabe, streamfähig |
| GET /runs/{id}/result | Ergebnis JSON |
| GET /runs/{id}/series | Zeitreihen, gefiltert nach quantity und location_id |
| GET /runs/{id}/field | Rasterfeld als PNG mit Georeferenz oder Höhenlinien als GeoJSON |
| GET /runs/{id}/profile | Wasserspiegel, Gelände, Geschwindigkeit entlang einer Linie |
| GET /runs/{id}/timesteps | Liste der vorliegenden Ausgabezeitpunkte mit Datengröße je Zeitpunkt |
| GET /runs/{id}/geometry | Gelände und Bauwerksflächen als statische Szenengeometrie, einmal je Lauf |
| GET /runs/{id}/volume | Räumliche Felddaten zum gewählten Zeitpunkt im Visualisierungsformat, feldweise abrufbar |
| GET /runs/{id}/wallfield | Flächengrößen auf Gelände und Bauwerksflächen zum gewählten Zeitpunkt |
| GET /runs/{id}/views | Gespeicherte Kamerastellungen und Filterzustände |
| GET /runs/{id}/extremes | Extremwerttabelle |
| GET /runs/{id}/balance | Bilanz und Konvergenzreihen |
| POST /runs/{id}/report | Berichtserzeugung anstoßen, Antwort enthält Dateipfad |

---

# 10 Frontend Zustandsmodell

Drei Zustandsbereiche gehören zentral in einen Store, weil mehrere Ansichten darauf zugreifen. Werden sie lokal je Komponente gehalten, entsteht später ein Umbau.

**Zeitzustand**, aktueller Zeitpunkt, Wiedergabestatus, ausgewählte Läufe. Wird von Zeitreihen, Grundriss, Schnitt und 3D Ansicht gemeinsam genutzt.

**Darstellungszustand**, Layersichtbarkeit, Farbskalen und deren Wertebereiche, Kameraposition. Farbskalen müssen über Läufe hinweg fixierbar sein, sonst sind Vergleichsbilder nicht vergleichbar.

**Auswahlzustand**, selektiertes Objekt oder selektierte Auswertungsgröße. Verbindet Objektbaum, Eigenschaftspanel, Validierungspanel und Szene.

Die Grundrisskomponente wird einmal implementiert und in PreViewer und PostViewer mit unterschiedlichen Layersätzen verwendet. Zwei getrennte Implementierungen sind der wahrscheinlichste Architekturfehler in diesem Projekt.

---

# 11 Technologieentscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| 3D Szene PreViewer | three.js | Höhenfeld über Verschiebung im Vertex Shader, freie Handles und Gizmos für die Bearbeitung |
| 3D Szene PostViewer | VTK.js | liefert Schnittebene, Isofläche, Schwellwertfilter, Stromlinien, Glyphen und Volumendarstellung als fertige Bausteine und stammt aus derselben Entwicklung wie ParaView. Eine Eigenimplementierung dieser Filter auf three.js wäre der mit Abstand teuerste Weg |
| Zwei 3D Bibliotheken in einer Anwendung | bewusst akzeptiert | die Aufgaben sind zu unterschiedlich für eine gemeinsame Lösung. Gemeinsam gehalten werden nur Kamera und Darstellungszustand |
| Aufbereitung der Felddaten | serverseitige Konvertierung nach vtkjs mit einstellbarer Reduktion, komprimiert übertragen | begrenzt die Datenmenge, ohne die Rohdaten anzutasten |
| Ausweichpfad bei zu großen Datenmengen | serverseitiges Rendern über trame beziehungsweise ParaViewWeb mit Bildübertragung | greift erst wenn die clientseitige Verarbeitung an ihre Grenze kommt, wird nicht vorab gebaut |
| Höhenfeldbearbeitung | CPU Array plus Texturaktualisierung | 160.000 Werte, keine GPU Berechnung erforderlich |
| Grundrissansicht | deck.gl | Raster und Vektorlayer gemischt, Picking eingebaut, kein Tileserver |
| Zeitreihen | uPlot | sehr viele Punkte performant, gemeinsamer Cursor über mehrere Diagramme einfach umsetzbar |
| Geometrieerzeugung serverseitig | shapely und trimesh | Grundrissoperationen und Sweeps, ausreichend für den Katalog |
| Boolesche Operationen | zunächst nicht, später OCCT über CadQuery | erst wenn der Katalog es zwingend verlangt |
| Höhenfeld zu STL | serverseitige Tessellierung | eine Codestelle für Vorschau und Rechnung |
| Schema und Validierung | Pydantic mit JSON Schema Export | Frontend Formular folgt automatisch jeder Schemaänderung |
| Zwischendatei | Parquet | schneller Wiedereinstieg bei Iteration am Bericht |
| Jobverwaltung | SQLite Zustandstabelle plus Subprozess | Einzelnutzerbetrieb, Celery und Redis wären reine Zusatzkomplexität |
| Berichtserzeugung | bestehende Node docx Pipeline als Subprozess | vorhandene Vorlagen mit Tabellenformatierung bleiben nutzbar |
| Kein clientseitiger Geometriekernel | Entscheidung | Höhenfeld ist ein Array, Bauwerke sind Parameter, damit ist keiner nötig |
| Kein Tileserver, keine Kartenbasis | Entscheidung | lokales Koordinatensystem, 100 mal 100 Meter |

---

# 12 Ausbaustufen und Reihenfolge

Die Reihenfolge folgt dem Prinzip, dass jede Stufe an bereits vorhandenen Daten testbar ist und ein eigenständig nutzbares Ergebnis liefert.

**Stufe 1, PostProzessing headless**

extract mit allen Lesern einschließlich Behandlung von Neustartordnern, normalize, evaluate und render. Vollständig am Beispielfall damBreak testbar, ohne eigene Geometrie und ohne Frontend. Ergebnis ist ein Bericht aus einer bestehenden Rechnung.

**Stufe 2, PostViewer für Kennwerte**

Qualitätsansicht, Zeitreihenpanel, Extremwerttabelle, Nachweisübersicht, Abbildungsexport. Grundriss und Schnitt folgen, sobald die Feldendpunkte stehen.

**Stufe 2b, räumliche Auswertung in 3D**

Zuerst die Datenaufbereitung, also Konvertierung der Felddaten und Bereitstellung der Szenengeometrie. Danach in dieser Reihenfolge Schwellwertfilter zum Ausblenden der Luftphase, Wasseroberfläche als Isofläche, Schnittebene, Flächendarstellung der Sohlschubspannung, Vektorpfeile, Isoflächen beliebiger Größen, Stromlinien, Volumendarstellung, Animation und Bildexport.

Die Reihenfolge folgt dem Verhältnis von Nutzen zu Aufwand. Die ersten vier Punkte decken den Großteil der fachlichen Beurteilung ab und sind mit VTK.js in wenigen Tagen erreichbar. Stromlinien und Volumendarstellung sind die aufwändigsten Punkte und stehen deshalb am Ende, ohne dass die Nutzbarkeit vorher davon abhängt.

**Stufe 3, PreProzessing headless**

terrain, solids, meshgen und casebuilder. Prüfung über checkMesh und einen sehr kurzen Rechenlauf. Ergebnis ist ein aus der casespec erzeugter, rechenfähiger Fall.

**Stufe 4, PreViewer**

3D Szene, Geländewerkzeuge, Bauwerkswerkzeuge des reduzierten Katalogs, Objektbaum, Eigenschaftspanel, Validierungspanel.

**Stufe 5, Ausführung**

runner für RunPod, Netz und Kostenvorschau, Laufmanifest.

**Stufe 6, Erweiterung**

Restlicher Bauwerkskatalog, LTSInterFoam als günstige Variante für Parameterstudien, gegebenenfalls Feststoffbetrachtung.

---

# 13 Teststrategie

**Regressionstests auf Artefakte und nicht auf Bilder.** Für jeden Testfall werden die erzeugten OpenFOAM Dictionaries sowie die normalisierte Zwischendatei als Referenz eingefroren und numerisch beziehungsweise textuell verglichen. Bildvergleiche sind brüchig und liefern keine brauchbare Fehlermeldung.

**Geometrietests auf Invarianten.** Jeder erzeugte Körper wird auf Wasserdichtheit, Volumen und Bounding Box geprüft. Für parametrische Körper ist das Volumen analytisch nachrechenbar, das ist der schärfste verfügbare Test.

**Physikalische Verifikation an analytisch bekannten Fällen.** Wehrüberfall gegen die Überfallformel, Ausfluss aus einer Öffnung, Normalabfluss im Gerinne gegen Gauckler Manning Strickler. Diese Fälle bleiben dauerhaft im Testbestand und werden bei jeder Änderung an casebuilder oder meshgen erneut gerechnet.

**Vollständige Durchläufe.** Ein kleiner Fall, der von der casespec bis zum fertigen Bericht durchläuft, als Abnahmetest je Ausbaustufe.

---

# 14 Offene Entscheidungen

Diese Punkte sind vor Beginn der jeweiligen Stufe zu klären.

1. Maßgebliches Regelwerk und maßgebliche Nachweiskriterien für den ersten konkreten Anwendungsfall. Davon hängt ab welche Auswertungsgrößen zwingend erforderlich sind
2. Zulässigkeit und Erwartung des Prüfers hinsichtlich Netzkonvergenzstudie und Dokumentationstiefe
3. Behandlung der Kraftauswertung bei Mehrphasenströmung. Das Standardverhalten integriert den Druck über den gesamten Patch einschließlich des Bereichs in der Luftphase. Es ist festzulegen ob über den Phasenanteil gewichtet wird oder ob der enthaltene Anteil dokumentiert wird
4. Turbulenzmodell als Vorbelegung und Begründung der Wahl im Bericht
5. Abstand der Modellgebietsränder zum Bauwerk als Vorbelegung, abhängig von der Bauwerkskategorie
6. Umgang mit der Verschmierung der Phasengrenze über mehrere Zellen bei der Angabe der Wasserspiegellage, insbesondere die anzugebende Genauigkeit
7. Rechenumgebung, also Anbieter, Kernzahl und Abrechnungsmodell, sowie ob eine Beschleunigung des linearen Lösers auf Grafikprozessoren später nachgezogen wird
8. Datenmengenbudget der räumlichen Auswertung, also Auflösung des Visualisierungsgitters, Anzahl der vorgehaltenen Ausgabezeitpunkte und Anzahl der übertragenen Felder. Davon hängt ab ob die clientseitige Verarbeitung ausreicht oder der Ausweichpfad über serverseitiges Rendern erforderlich wird. Diese Entscheidung sollte an einem echten Datensatz gemessen und nicht geschätzt werden
9. Verbindliche Farbskalen und Darstellungskonventionen für Berichtsabbildungen, damit Abbildungen über Projekte hinweg einheitlich sind
