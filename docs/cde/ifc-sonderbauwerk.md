# Sonderbauwerke in IFC — wie ein Regenüberlaufbecken entsteht

Stand 2026-10-01. Alle Klassen, PredefinedTypes und Vorlagen in diesem Text sind
gegen `backend/app/ifc/daten/schema_IFC4X3_ADD2.json` (gepinntes ifcopenshell
0.8.5, IFC4X3_ADD2) nachgeschlagen, nicht aus dem Gedächtnis. Wo etwas **nicht**
im Schema steht, steht es hier ausdrücklich als Lücke.

---

## 0 · Die kurze Antwort

**IFC hat für ein Regenüberlaufbecken keine Klasse. Es wird auch keine geben.**

Eine Suche im Schema nach `WEIR`, `OVERFLOW`, `THROTTLE`, `SCREEN`, `BASIN`,
`DETENTION` oder `RETENTION` findet in IFC4X3_ADD2 **nichts Passendes** —
gemessen, nicht geschätzt:

```
grep -i WEIR     → 0 Entitäten, 0 PredefinedTypes
grep -i OVERFLOW → 0
grep -i THROTTLE → 0
"screen" in Beschreibungen → nur IfcShadingDevice, IfcPermeableCoveringProperties
"basin"  in PredefinedTypes → IfcTank.BASIN, IfcSanitaryTerminal (Waschbecken)
```

Das ist kein Mangel, sondern die Bauart von IFC: **IFC benennt Bauteile, keine
Bauwerke.** Ein Bauwerk entsteht nicht aus einer Klasse, sondern aus **drei
Strukturen, die unabhängig voneinander über denselben Bauteilen liegen**:

```
            ┌──────────────────────────────────────────────────┐
            │  1  RAUMGLIEDERUNG   — wo steht es?              │
            │     IfcProject › IfcSite › IfcFacility ›         │
            │     IfcFacilityPartCommon › IfcSpace             │
            │     je Bauteil GENAU EIN Platz                   │
            └──────────────────────────────────────────────────┘
                      ▲
                      │  dieselben Bauteile
                      ▼
            ┌──────────────────────────────────────────────────┐
            │  2  ZERLEGUNG        — woraus besteht es?        │
            │     IfcRelAggregates / IfcElementAssembly        │
            │     je Bauteil HÖCHSTENS EIN Ganzes              │
            └──────────────────────────────────────────────────┘
                      ▲
                      │  dieselben Bauteile
                      ▼
            ┌──────────────────────────────────────────────────┐
            │  3  SYSTEME          — was arbeitet zusammen?    │
            │     IfcDistributionSystem · IfcBuiltSystem       │
            │     über IfcRelAssignsToGroup                    │
            │     je Bauteil BELIEBIG VIELE Systeme            │
            └──────────────────────────────────────────────────┘
```

Die Kardinalitäten sind Schema, nicht Konvention — aus den inversen Attributen:

| Beziehung | Attribut | Kardinalität | heißt |
|---|---|---|---|
| Raumgliederung | `IfcElement.ContainedInStructure` | `SET [0:1]` | ein Bauteil steht an **einer** Stelle |
| Zerlegung | `IfcObjectDefinition.Decomposes` | `SET [0:1]` | ein Teil hat **einen** Ganzen |
| Systeme | `IfcObjectDefinition.HasAssignments` | `SET [0:?]` | ein Bauteil ist in **vielen** Systemen |

**Und darin liegt die Antwort auf die eigentliche Schwierigkeit.** Eine
Beckenwand ist gleichzeitig zwei Dinge: ein tragendes Bauteil und die Begrenzung
einer wasserführenden Kammer. Keine Klasse der Welt kann das ausdrücken — eine
Klasse kann nur eines sein. Zwei **Systemzuordnungen** können es:

```
IfcWall  ──IfcRelAssignsToGroup──▶  IfcBuiltSystem        (LOADBEARING)
         ──IfcRelAssignsToGroup──▶  IfcDistributionSystem (STORMWATER)
```

Wer in IFC ein Sonderbauwerk sucht, sucht eine Klasse. Wer es findet, hat
aufgehört, nach Klassen zu suchen, und fängt an, die drei Strukturen zu bauen.

---

## 1 · Die Teileliste — fachlich

Die Gliederung der Bauteile kommt nicht aus IFC, sondern aus dem Regelwerk.
**DWA-A 157** trennt die **Bauteile** des Bauwerks von seinen **Einbauten** und
zählt letztere auf:

> „Einbauten können beispielsweise sein: Überlaufschwelle, Tauchwand, Rechen,
> Sieb, Drosselorgan, Messeinrichtung, Absperrorgan, Reinigungseinrichtung,
> Spüleinrichtung, Pumpanlage, Anlage zur Wärmegewinnung, Steigeisen,
> Steigbügel, Steigleiter und Sicherungssystem, Treppe …"
> — DWA-A 157, Abschnitt zu Einbauten

**Diese Trennung ist die wichtigste Entscheidung des ganzen Modells**, und sie
fällt mit IFC zusammen:

- **Bauteile** (Wände, Platten, Fundamente) → `IfcBuiltElement`-Zweig.
  Sie tragen. Sie werden in m³ Beton und m² Schalung abgerechnet.
- **Einbauten** (Schwelle, Rechen, Drossel, Pumpe) → teils `IfcBuiltElement`
  (die betonierte Schwelle), teils `IfcDistributionElement` (die Maschine).
  Sie funktionieren. Sie werden als Stück abgerechnet und haben Betriebsdaten.

Die Begriffe der Beckenhydraulik stehen in **DWA-A 166** (Ausgabe 2013-11):
Beckenkammer als „Oberbegriff für Speicher- und Sedimentationskammern",
Beckenüberlauf, Klärüberlauf, Drosselorgan, Tauchwand. Der Bauwerkstyp selbst
ist in den **Arbeitshilfen Abwasser** (2015) als Kürzel geführt — `RUEB`
Regenüberlaufbecken, `RKB` Regenklärbecken, `RRB` Regenrückhaltebecken,
`RRSB` Regenrückstaubecken, `PW` Pumpwerk, jeweils mit Bauwerkgruppe.
Dieselben Kürzel kennt das isybau-Werkzeug dieses Hauses schon.

---

## 2 · Die Teileliste — als IFC

Jede Zeile ist gegen das Schema geprüft. Spalte „Quelle": **Schema** = die
Klasse und der PredefinedType stehen so im Schema; **Wahl** = mehrere Wege sind
schemagültig, die Zeile nennt eine begründete Entscheidung; **Lücke** = IFC
sieht die Sache nicht vor.

### 2.1 Tragwerk — die Hülle

| Bauteil | Klasse | PredefinedType | Mengen (bSI-Vorlage) | Quelle |
|---|---|---|---|---|
| Bodenplatte | `IfcSlab` | `BASESLAB` | `Qto_SlabBaseQuantities` | Schema |
| Außenwand, erddruckbelastet | `IfcWall` | `RETAININGWALL` | `Qto_WallBaseQuantities` | Wahl |
| Trennwand zwischen Kammern | `IfcWall` | `SOLIDWALL` | `Qto_WallBaseQuantities` | Wahl |
| Zwischendecke | `IfcSlab` | `FLOOR` | `Qto_SlabBaseQuantities` | Schema |
| Deckenplatte, oberster Abschluss | `IfcSlab` | `ROOF` | `Qto_SlabBaseQuantities` | Wahl |
| Streifen-/Einzelfundament | `IfcFooting` | `STRIP_FOOTING` / `PAD_FOOTING` | `Qto_FootingBaseQuantities` | Schema |
| Einstiegabdeckung (Guss, D400) | `IfcPlate` | `COVER_PLATE` | `Qto_PlateBaseQuantities` | Wahl |
| Steigleiter | `IfcStair` | `LADDER` | — | Schema |
| Geländer, Absturzsicherung | `IfcRailing` | `GUARDRAIL` | — | Schema |
| Durchbruch für Zu-/Ablauf | `IfcOpeningElement` | `OPENING` | — | Schema |

Zwei Dinge dazu, die man leicht falsch macht:

**`IfcFooting` ist kein Platz für die Bodenplatte.** Seine PredefinedTypes sind
`CAISSON_FOUNDATION, FOOTING_BEAM, PAD_FOOTING, PILE_CAP, STRIP_FOOTING` — alles
Einzel- und Streifengründungen. Eine durchgehende Beckensohle ist ein
`IfcSlab/BASESLAB`. (Das Typprofil dieses Hauses sagt es an derselben Stelle
schon so: „IFCFOOTING steht bewusst NICHT bei den Flächen … Bodenplatte ist ein
IFCSLAB und steht dort richtig.")

**Der Durchbruch braucht einen Wirt und darf nicht eingeordnet werden.** Die
Where-Rule `IfcFeatureElement.NotContained` verlangt
`SIZEOF(ContainedInStructure) = 0`: ein `IfcOpeningElement` hängt über
`IfcRelVoidsElement` an seiner Wand, nie selbst in der Raumgliederung. Genau
dieselbe Regel gilt für den Aushub (`IfcEarthworksCut`) — die CDE erfüllt sie
seit dem Erdbau-Fahrplan.

### 2.2 Erdbau — was unter und um das Becken liegt

| Bauteil | Klasse | PredefinedType | Mengen | Quelle |
|---|---|---|---|---|
| Baugrube | `IfcEarthworksCut` | `BASE_EXCAVATION` | `Qto_EarthworksCutBaseQuantities` | Schema |
| **Bettung / Sauberkeitsschicht** | `IfcEarthworksFill` | `SUBGRADEBED` | `Qto_EarthworksFillBaseQuantities` | Wahl |
| Hinterfüllung, Arbeitsraum | `IfcEarthworksFill` | `BACKFILL` | dito | Schema |
| Bodenverbesserung unter der Platte | `IfcReinforcedSoil` | `REPLACED` / `ROLLERCOMPACTED` | — | Schema |
| Tragschicht / Belag darüber | `IfcCourse` | `PROTECTION` / `FILTER` | `Qto_CourseBaseQuantities` | Wahl |

**Die Bettung hat zwei schemagültige Heimaten, und die Wahl ist eine
Abrechnungsfrage, keine Geschmacksfrage:**

- `IfcEarthworksFill/SUBGRADEBED` — ihre Mengenvorlage ist
  `Qto_EarthworksFillBaseQuantities` mit **`CompactedVolume` und `LooseVolume`**.
  Das sind genau die zwei Zahlen, die im Erdbau abgerechnet werden (verdichtet
  eingebaut gegen lose angeliefert, Auflockerung dazwischen). Wer die Bettung
  mit dem Erdbau abrechnet, nimmt diese Klasse.
- `IfcCourse/FILTER` — ihre Vorlage `Qto_CourseBaseQuantities` kennt
  `Length, Width, Thickness, Volume, GrossVolume, Weight`. Das ist die Sicht
  „eingebaute Schicht als Bauteil", ohne Auflockerung.

Die CDE rechnet Erdbau heute schon in `CompactedVolume`/`UndisturbedVolume` ab.
Für sie ist `SUBGRADEBED` der Weg mit einem Ort weniger.

### 2.3 Einbauten — Beton

| Einbau | Klasse | PredefinedType | Quelle |
|---|---|---|---|
| **Überlaufschwelle (Beckenüberlauf, Klärüberlauf)** | `IfcWall` | `USERDEFINED` + `ObjectType = "Überlaufschwelle"` | **Lücke** |
| **Tauchwand** | `IfcWall` | `USERDEFINED` + `ObjectType = "Tauchwand"` | **Lücke** |
| Trockenwetterrinne | `IfcPipeSegment` | `GUTTER` | Schema |
| Sohlgefälle, Spülschwelle | `IfcSlab` | `USERDEFINED` | Lücke |

**Die Überlaufschwelle ist die schmerzhafteste Lücke des ganzen Modells**, und
zwar nicht wegen der Geometrie — geometrisch ist sie eine niedrige Wand mit
einer definierten Oberkante, und `IfcWall` trägt das mühelos. Sondern wegen der
**Zahlen**: Schwellenhöhe über NN, Schwellenlänge und Überfallbeiwert sind die
drei Größen, an denen die ganze Entlastungsrechnung hängt (DWA-A 128 für die
Bemessung, DWA-A 111 für den Leistungsnachweis — dort wird die Überlaufschwelle
ausdrücklich „als Messwehr" betrachtet). **Keine bSI-Vorlage sieht eine davon
vor.** `Pset_WallCommon` kennt `Reference, Status, AcousticRating, FireRating,
Combustible, SurfaceSpreadOfFlame, ThermalTransmittance, IsExternal,
LoadBearing, ExtendToStructure, Compartmentation` — Hochbauwerte, kein
Wasserbau.

Es braucht also ein eigenes Merkmalsset. Das ist erlaubt und üblich; es muss nur
**benannt und dokumentiert** sein, sonst kann es niemand lesen:

```
Pset: Quagg_Entlastung        (Herausgeber Quagg, versioniert)
  Art                IfcLabel          Beckenüberlauf | Klärüberlauf | Notüberlauf
  SchwellenhoeheNN   IfcLengthMeasure  m über NN — die maßgebende Zahl
  Schwellenlaenge    IfcLengthMeasure  m, wirksame Überfalllänge
  Ueberfallbeiwert   IfcReal           µ bzw. C_d, mit Quelle im Feld Herleitung
  Herleitung         IfcText           „DWA-M 176, Tab. …" oder „Messung vom …"
```

### 2.4 Einbauten — Technik

| Einbau | Klasse | PredefinedType | Vorlage | Quelle |
|---|---|---|---|---|
| **Rechen, Sieb** | `IfcFilter` | `STRAINER` | `Pset_FilterTypeCommon`, `Qto_FilterBaseQuantities` | Wahl |
| **Drosselorgan, geregelt** | `IfcValve` | `REGULATING` | `Pset_ValveTypeCommon` | Wahl |
| Wirbeldrossel | `IfcValve` | `USERDEFINED` | dito | Lücke |
| Drosselstrecke (Blende, Schlitz) | `IfcPipeSegment` | `RIGIDSEGMENT` | — | Wahl |
| Absperrschieber | `IfcValve` | `ISOLATING` | `Pset_ValveTypeIsolating` | Schema |
| Rückstauklappe | `IfcValve` | `CHECK` | — | Schema |
| Pumpe (Tauch-, Sumpf-) | `IfcPump` | `SUBMERSIBLEPUMP` / `SUMPPUMP` | — | Schema |
| Durchflussmessung | `IfcFlowMeter` | `WATERMETER` | — | Schema |
| Pegel-, Durchflussgeber | `IfcSensor` | `LEVELSENSOR` / `FLOWSENSOR` | — | Schema |
| Fertigteilbehälter, Stauraum | `IfcTank` | `BASIN` / `STORAGE` | `Pset_TankTypeCommon` | Schema |

Zu den drei Wahlen:

**Rechen → `IfcFilter/STRAINER`.** Der naheliegende Nachbar `IfcInterceptor`
scheidet aus: seine PredefinedTypes sind `CYCLONIC, GREASE, OIL, PETROL` —
Abscheider, keine Siebe. `IfcFilter` hat `STRAINER`, und das ist genau ein
Grobsieb im Strom. Brauchbar daran ist `Pset_FilterTypeCommon` mit
`NominalPressureDrop`, `NominalFlowrate`, `InitialResistance`,
`FinalResistance`. Was fehlt, ist das Kennzeichnende eines Rechens: Stababstand,
Anströmwinkel, Reinigungsart. → eigenes `Quagg_Rechen`.

**Drossel → `IfcValve/REGULATING`, aber nur wenn es ein Organ ist.** Hier liegt
eine Falle: DWA-A 166 nennt unter „Drosselorgan" auch das „als Schlitz
ausgebildete" an Klärüberläufen. Ein Schlitz ist kein Gerät — er ist eine
Öffnung in einer Wand. Also:

| Bauart | IFC |
|---|---|
| motorisch geregelter Drosselschieber | `IfcValve/REGULATING` |
| Wirbeldrossel (Fertigteil, ohne Antrieb) | `IfcValve/USERDEFINED` |
| Drosselstrecke, gedrosseltes Rohr | `IfcPipeSegment` mit kleinem DN — es **ist** ein Rohr |
| Drosselschlitz, Blende in der Wand | `IfcOpeningElement` in der Wand, Drosselwirkung als Merkmal |

`Pset_ValveTypeCommon` liefert `FlowCoefficient`, `ValveMechanism`,
`ValveOperation`, `WorkingPressure`. Die Zahl, um die es im Tiefbau geht — der
**Drosselabfluss Q_Dr** bei gegebener Stauhöhe — ist nicht vorgesehen.
→ eigenes `Quagg_Drossel` mit `Drosselabfluss`, `Stauhoehe`, `Kennlinie`.

**`IfcTank` ist eine Falle, aber eine nützliche.** `IfcTank/BASIN` existiert und
klingt nach „Becken". Es ist aber ein `IfcFlowStorageDevice` — ein **Produkt**,
ein Behälter, den man kauft und einbaut. Ein vor Ort betoniertes Becken aus
Wänden und Platten ist kein `IfcTank`; es ist ein Bauwerk aus vielen Teilen.
Die Unterscheidung ist keine Spitzfindigkeit, sie entscheidet über die
Zerlegung:

| Fall | Modell |
|---|---|
| Ortbetonbecken | ein Bauwerk aus `IfcWall` + `IfcSlab` + … (Abschnitt 3) |
| Fertigteilbecken, Zisterne, Stauraumbehälter | **ein** `IfcTank/BASIN` mit `Pset_TankTypeCommon` (`TankNominalCapacity`, `EffectiveCapacity`, `NominalDepth`) |
| früher Planungsstand, Becken noch nicht ausgelegt | ein `IfcTank/BASIN` als Platzhalter, später ersetzt |

Der dritte Fall ist der praktisch wichtigste: **in der Vorplanung ist das Becken
ein Körper mit einem Volumen, in der Ausführungsplanung ein Bauwerk aus
Bauteilen.** Beides ist IFC-konform. Was nicht konform ist, ist beides
gleichzeitig am selben Ort.

### 2.5 Der Raum — und warum er das Wichtigste ist

| Sache | Klasse | PredefinedType | Mengen |
|---|---|---|---|
| Beckenkammer, Speicherraum | `IfcSpace` | `INTERNAL` | `Qto_SpaceBaseQuantities` |
| Schieberkammer, Trockenraum | `IfcSpace` | `INTERNAL` | dito |

**Das Speichervolumen eines Beckens ist kein Bauteil. Es ist ein Raum.**

Das ist die Einsicht, an der die meisten Modelle scheitern. Man kann das
Speichervolumen nicht an der Wand und nicht an der Bodenplatte unterbringen —
es ist der *Hohlraum zwischen* ihnen. `Qto_SpaceBaseQuantities` hat dafür
`NetVolume`, `GrossVolume`, `NetFloorArea`, `Height` und sogar `NetWallArea`.
Das Beckenvolumen V aus DWA-A 128 ist `IfcSpace.NetVolume` — und nichts sonst.

Dazu gehört ein Merkmalssatz für die Betriebshöhen, die den Raum erst hydraulisch
machen (auch das keine bSI-Vorlage):

```
Pset: Quagg_Speicherraum
  Beckenart          IfcLabel          RUEB | RKB | RRB | RRSB  (Arbeitshilfen Abwasser)
  SohlhoeheNN        IfcLengthMeasure
  BetriebswasserNN   IfcLengthMeasure  Höhe, bei der die Schwelle anspringt
  Speichervolumen    IfcVolumeMeasure  = Qto NetVolume bis BetriebswasserNN
```

---

## 3 · Die drei Strukturen, konkret gebaut

Ein RÜB mit zwei Kammern, Zulauf, Schwelle, Rechen und Drossel.

### 3.1 Raumgliederung — wo steht es

```
IfcProject
└─ IfcSite                              „Gemeinde X, Gewässer Y"
   └─ IfcFacility                       „RÜB Mühlbach"      ← das Bauwerk
      ├─ IfcFacilityPartCommon/BELOWGROUND   „Beckenbauwerk"
      │  ├─ IfcSpace/INTERNAL            „Speicherkammer 1"   ← hier liegt V
      │  ├─ IfcSpace/INTERNAL            „Speicherkammer 2"
      │  └─ IfcSpace/INTERNAL            „Schieberkammer"
      └─ IfcFacilityPartCommon/ABOVEGROUND   „Betriebsgebäude"
```

Drei Hinweise, die Zeit sparen:

- **`IfcFacility` ist in IFC4X3_ADD2 instanzierbar und hat keinen
  PredefinedType** (geprüft: `attribute: []`). Die Bauwerksart sagt man über
  `Name`, `ObjectType` und eine Klassifizierung (3.4), nicht über einen
  Aufzählungswert. `IfcBuilding` ist ein *Untertyp* von `IfcFacility`, nicht sein
  Ersatz — für ein Becken ist `IfcFacility` richtiger als `IfcBuilding`.
- **`IfcFacilityPart` ist abstrakt.** Instanzierbar sind
  `IfcFacilityPartCommon` (PDT u. a. `ABOVEGROUND, BELOWGROUND, SUBSTRUCTURE,
  SUPERSTRUCTURE, JUNCTION, TERMINAL, SEGMENT`), dazu `IfcBridgePart`,
  `IfcRoadPart`, `IfcRailwayPart`, `IfcMarinePart`. Für ein Becken:
  `IfcFacilityPartCommon/BELOWGROUND`.
- **Gründung und Erdbau gehören nicht in den Raum des Beckens.** Baugrube,
  Bettung und Hinterfüllung hängen an der `IfcSite` (so macht es die CDE heute
  schon) oder an einem eigenen `IfcFacilityPartCommon/SUBSTRUCTURE`.

### 3.2 Zerlegung — woraus besteht es

```
IfcFacility „RÜB Mühlbach"
└─IfcRelAggregates─▶ IfcFacilityPartCommon „Beckenbauwerk"
                     └─IfcRelAggregates─▶ IfcElementAssembly/USERDEFINED
                                          ObjectType „Beckenkonstruktion"
                                          ├─ IfcSlab/BASESLAB   „Bodenplatte"
                                          ├─ IfcWall/RETAININGWALL × 4
                                          ├─ IfcWall/SOLIDWALL   „Trennwand"
                                          ├─ IfcWall/USERDEFINED „Überlaufschwelle"
                                          └─ IfcSlab/ROOF        „Deckenplatte"
```

**Die Regel, die man wissen muss:** `Decomposes` ist `SET [0:1]`, und
`ContainedInStructure` ist `SET [0:1]` — beide zählen getrennt. Das Schema
**verbietet nicht**, dass eine Wand sowohl in einer Assembly steckt als auch
einzeln in der Raumgliederung hängt. Es ist nur sinnlos und führt zu doppelten
Mengen.

> **Konvention, nicht Schema:** steckt ein Bauteil in einer Assembly, wird **die
> Assembly** in die Raumgliederung eingeordnet, nicht ihre Teile. Das ist eine
> Implementer-Vereinbarung von buildingSMART, keine Where-Rule — das Prüftor
> wird es nicht melden. Wer es bricht, zählt die Bodenplatte zweimal.

Und die zweite Frage, die immer kommt: **braucht es die `IfcElementAssembly`
überhaupt?** Nein, nicht zwingend. Zwei legitime Tiefen:

| Tiefe | wann |
|---|---|
| Bauteile direkt in `IfcFacilityPartCommon` | der Normalfall. Einfacher, weniger Beziehungen, Mengen stimmen |
| Bauteile in einer `IfcElementAssembly` | wenn die Gruppe als Einheit vorgefertigt, geliefert, montiert oder bewertet wird (Fertigteilschacht, Stahlbau-Rechenrahmen) |

`IfcElementAssembly` hat 30 PredefinedTypes — `ABUTMENT, ARCH, DECK, GIRDER,
MAST, PIER, TRUSS, SUMPBUSTER, ENTRANCEWORKS, …` — alle aus Brücken- und
Bahnbau. **Für ein Becken ist keiner davon richtig**; es bleibt
`USERDEFINED` + `ObjectType`. Das ist ein Hinweis darauf, dass man die Assembly
hier meist nicht braucht.

### 3.3 Systeme — was zusammen arbeitet

```
IfcDistributionSystem/STORMWATER  „Entlastungsanlage RÜB Mühlbach"
  ←IfcRelAssignsToGroup─ Zulaufhaltung (IfcPipeSegment)
  ←                      Rechen        (IfcFilter/STRAINER)
  ←                      Überlaufschwelle (IfcWall/USERDEFINED)
  ←                      Drossel       (IfcValve/REGULATING)
  ←                      Ablaufhaltung (IfcPipeSegment)
  ←                      Speicherkammer 1+2 (IfcSpace)      ← auch Räume dürfen

IfcBuiltSystem/LOADBEARING  „Tragwerk RÜB Mühlbach"
  ←IfcRelAssignsToGroup─ Bodenplatte, Wände, Deckenplatte, Schwelle
```

Die Schwelle und die Wände stehen in **beiden** Gruppen. Genau dafür ist
`HasAssignments` unbeschränkt. `IfcDistributionSystem` hat unter seinen
PredefinedTypes `STORMWATER, SEWAGE, WASTEWATER, DRAINAGE, RAINWATER` — für ein
Mischsystem-RÜB ist `SEWAGE` oder `STORMWATER` die Wahl, je nachdem, was das
Projekt durchgängig verwendet. **Eine** davon, nicht beide.

Wer die hydraulische Reihenfolge braucht (was fließt wohin), nimmt zusätzlich
`IfcDistributionPort` an den Bauteilen und `IfcRelConnectsPorts` dazwischen.
Das ist der aufwendigste Teil und der, den man am längsten aufschieben kann:
solange die Geometrie stimmt, lässt sich die Topologie aus Koinzidenz ableiten —
genau das tut die CDE heute für ihr Netz.

### 3.4 Klassifizierung — wie das Bauwerk sagt, was es ist

Da `IfcFacility` keinen PredefinedType hat und es keine Beckenklasse gibt, bleibt
ein Weg, den IFC ausdrücklich anbietet und den fast niemand nutzt:

```
IfcClassification            Name „Arbeitshilfen Abwasser", Edition „2015-12"
└─ IfcClassificationReference  Identification „RUEB"
                               Name „Regenüberlaufbecken"
   ←IfcRelAssociatesClassification─ IfcFacility „RÜB Mühlbach"
```

Beides ist im Schema (`IfcClassificationReference < IfcExternalReference`,
`IfcRelAssociatesClassification < IfcRelAssociates`). **Das ist der sauberste
Ort für den Bauwerkstyp** — er ist nachschlagbar, versioniert, und ein Empfänger
muss keine Merkmalsnamen erraten. Dieselbe Mechanik trägt Kostengruppen nach
DIN 276 und Leistungspositionen.

---

## 4 · Was die Quagg-CDE heute davon kann — und was fehlt

Gemessen am Code, nicht geschätzt.

### Was schon trägt

| Sache | Ort |
|---|---|
| Alle Bauteilklassen oben sind eingeordnet | `services/bauform/Typprofile.js`: eigene Profile für `IFCWALL`, `IFCSLAB`, `IFCPLATE`, `IFCCOURSE`, `IFCCOVERING`, `IFCTANK`, `IFCVALVE`, `IFCFLOWTREATMENTDEVICE`, `IFCDISTRIBUTIONCHAMBERELEMENT`. `IFCFOOTING` erbt bewusst `koerper` („keiner seiner Untertypen ist eine Region mit Stärke“) |
| Aushub mit Wirt, Verfüllung, Mengen nach bSI-Vorlage | Erdbau-Fahrplan; `IfcEarthworksCut`/`Fill` samt `IfcRelVoidsElement` |
| PredefinedType wird gegen das Schema geprüft, nie geraten | `eigenbau.py`, `S.predefined(klasse)` |
| Eigene Merkmalssätze am Bauteil | `Quagg_CDE`, `Quagg_Herkunft` |
| Gruppen als Sicht über Bauteilen | `IfcGroup` je Fachmodell und je Vorgang |
| Typobjekte je Vorlage | `Ifc…Type` + `IfcRelDefinesByType` |

### Was für ein Sonderbauwerk fehlt

| # | Fehlt | Heute | Aufwand |
|---|---|---|---|
| **S1** | **`IfcRelAggregates`** — jede Zerlegung | alles liegt **flach unter einer `IfcSite`** (`eigenbau.py`: ein `IfcRelContainedInSpatialStructure` für alle Produkte) | mittel |
| **S2** | **`IfcFacility` / `IfcFacilityPartCommon`** | nur `IfcSite` | klein, hängt an S1 |
| **S3** | **`IfcSpace`** — und damit das Speichervolumen | gar nicht; `grep IfcSpace eigenbau.py` = 0 | mittel |
| **S4** | **Wandrezept** (Linie + Dicke + Höhe, Fußlinie in NN) | `platte` ist waagerecht, `pfosten` ist ein Stab | **klein** — `sweep` mit Rechteckprofil, dazu **eine Zeile Kern** (die Deklaration nennt ihren Höhenbezug fest; ohne sie stünde die Wand halb im Boden — Fahrplan XXVI, Fund 3) |
| **S5** | **`IfcClassificationReference`** für den Bauwerkstyp | nicht geschrieben | klein |
| **S6** | Eigene Psets `Quagg_Entlastung` / `Quagg_Drossel` / `Quagg_Rechen` / `Quagg_Speicherraum` | keines | klein je Satz |
| **S7** | `IfcDistributionSystem` statt nur `IfcGroup` | `IfcGroup` ohne Systemtyp | klein |
| **S8** | `IfcDistributionPort` / `IfcRelConnectsPorts` | 0 Treffer im Schreiber | groß — **aufschiebbar** |

**S1 ist der Angelpunkt, und er war vorhergesehen.** Der Architektur-Umbau
Teil XXIII hat die Aggregation ausdrücklich zurückgestellt, mit Begründung:

> „rekursive Aggregation / `IfcRelAggregates` (kommt mit dem ersten
> zusammengesetzten Bauwerk)"
> — Teil XXIII, Abschnitt „Was NICHT gebaut wird"

**Das Regenüberlaufbecken ist dieses erste zusammengesetzte Bauwerk.** Die
Entscheidung von damals war richtig — keine Abstraktion auf Vorrat — und sie
wird jetzt fällig, nicht weil die Architektur es verlangt, sondern weil ein
Fachfall es verlangt. Genau so war sie gemeint.

### Die Reihenfolge, die sich daraus ergibt

```
S4 Wandrezept        ← allein nützlich, baut auf nichts auf; Deklaration + eine Kernzeile
S1 Aggregation       ← der Angelpunkt: ein Bauteil darf Teil eines Ganzen sein
S2 Facility/Part     ← fällt mit S1 fast zusammen
S3 IfcSpace          ← trägt das Speichervolumen, braucht Umriss + zwei Höhen
S6 Psets             ← je Satz eine Tabelle, kein Code
S5 Klassifizierung   ← eine Beziehung
S7 Systeme           ← IfcGroup wird IfcDistributionSystem
──────────────────── ab hier ist ein RÜB modellierbar ────────────────────
S8 Ports             ← erst, wenn jemand die Topologie wirklich braucht
```

---

## 5 · Die Kurzfassung für den Alltag

1. **Hör auf, eine Beckenklasse zu suchen.** Es gibt keine, und es ist kein Fehler.
2. **Trenne Bauteile von Einbauten** wie DWA-A 157 es tut. Die Trennung fällt mit der IFC-Vererbung zusammen.
3. **Das Speichervolumen ist ein `IfcSpace`**, kein Bauteil.
4. **Das Bauwerk ist eine `IfcFacility`** mit `IfcRelAggregates` darunter — nicht eine Klasse, sondern eine Struktur.
5. **Was zweimal gehört (tragend *und* wasserführend), bekommt zwei Systemzuordnungen**, nicht zwei Klassen.
6. **Wofür IFC keine Zahl hat** — Schwellenhöhe, Drosselabfluss, Stababstand —, bekommt ein eigenes, benanntes, versioniertes Pset mit Quellenangabe im Merkmal.
7. **Den Bauwerkstyp sagt eine `IfcClassificationReference`**, kein PredefinedType.

---

## Quellen

**Schema** (nachgeschlagen, nicht erinnert):
`backend/app/ifc/daten/schema_IFC4X3_ADD2.json`, 897 Entitäten, 760 Pset-/Qto-Vorlagen,
aus ifcopenshell 0.8.5, IFC4X3_ADD2. Nachschlagen im Haus: MCP-Server `ifc`
(`ifc_entity`, `ifc_vererbung`, `ifc_pset`) oder `backend/app/ifc/schema.py`.

**Regelwerk** (aus der Bibliothek, wörtlich belegt):
- **DWA-A 157** — Bauwerke der Kanalisation; Begriffe Bauwerk / Regelbauwerk /
  Sonderbauwerk (Abschn. 3.1.1–3.1.3), Aufzählung der Einbauten.
- **DWA-A 166** (2013-11) — Begriffe Beckenkammer, Beckenüberlauf,
  Klärüberlauf, Drosselorgan, Tauchwand.
- **DWA-M 176** (2013-11) — Hinweise zur konstruktiven Gestaltung, Drosselung.
- **DWA-A 111** (2010-12) — Abfluss- und Wasserstandsbegrenzung; Überlaufschwelle als Messwehr.
- **DWA-A 128** (1992-04) — Bemessung von Regenentlastungen; Tauchwand vor dem Klärüberlauf.
- **Arbeitshilfen Abwasser** (2015-12) — Kürzel der Bauwerktypen: RUEB, RKB, RRB, RRSB, PW.

**Nicht belegt und als Einschätzung gekennzeichnet:** jede Zeile mit Quelle
„Wahl" oder „Lücke" in Abschnitt 2 ist eine begründete Entscheidung dieses
Hauses, keine Festlegung einer Norm. Wer sie ändert, soll den Grund daneben
schreiben.
