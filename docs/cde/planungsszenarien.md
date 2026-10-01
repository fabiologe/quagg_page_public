# Planungsszenarien — woran die Entwicklung sich ausrichtet

Stand 2026-10-01.

Zehn Fälle aus der Tiefbauplanung, jeder mit Zahlen, die man nachrechnen kann.
**P1–P4 tragen heute** — sie sind der Maßstab, nicht Wunschdenken. **P5–P8
fordern Entwicklung**, jeder nennt genau, welche. **P9–P10** sind Abläufe, keine
Geometrie.

Die Reihenfolge der Entwicklung steht nicht am Anfang, sondern am **Ende** —
abgeleitet daraus, wie viele Szenarien dieselbe Fähigkeit verlangen. Das ist der
Unterschied zwischen einer Roadmap und einer Wunschliste.

**Wie ein Szenario benutzt wird:** als Abnahmefall. Jedes nennt eine Zahl, die
herauskommen muss. Kein „Ansicht sieht gut aus" — eine Zahl, von Hand
nachgerechnet, vorher und nachher.

---

## P1 · Haltung zwischen zwei Schächten — **trägt**

**Auftrag.** Zwei Schächte DN 1000, 30 m auseinander. Dazwischen eine Haltung
DN 300. Sohle 100,00 → 99,85. Prüfen, ob das Mindestgefälle eingehalten ist.

**Ablauf, nur über Kommandos:**

| # | Kommando | Werte |
|---|---|---|
| 1 | `schacht-zeichnen` | `neu: ['cde-A']`, Punkte (0\|100,00\|0) und (0\|102,50\|0), DN 1000 |
| 2 | `schacht-zeichnen` | `neu: ['cde-B']`, (30\|99,85\|0) und (30\|102,40\|0) |
| 3 | `rohr-zeichnen` | `neu: ['cde-H']`, Zug A→B, DN 300, Sohle 100,00 → 99,85 |
| 4 | `sohlhoehen-setzen` | `ziel: ['cde-H']`, Ende := 99,91 |

**Die Zahl.** 0,15 m auf 30 m = **5,0 ‰**. Grenze 1:DN = 1000/300 = **3,33 ‰**
→ keine Markierung. Nach Kommando 4: 0,09 m / 30 m = **3,0 ‰** < 3,33 ‰ →
genau **ein** Befund `gefaelle_zu_flach`, Quelle „Faustregel 1:DN". Das Kommando
ist **ausgeführt**, nicht abgelehnt.

**Ist.** Vollständig, ohne Oberfläche, als Test `test/durchstichAchse.test.js`.
Das Gefälle wird gegen die **waagerechte** Weglänge gerechnet (nicht gegen die
Sehne — ein Knick machte sie um 40 % zu steil). Die Sohle im Raum liegt auf der
kommandierten Sohlhöhe ± 0 mm; der `achsbezug` des Bauplans sagt, ob die Achse
Sohle oder Rohrmitte ist.

---

## P2 · Kanalgraben mit Überdeckungsnachweis — **trägt**

**Auftrag.** Für die Haltung aus P1 den Graben ausheben: Bettung 10 cm,
Böschung 1:1,5 (bzw. verbaut), Grabenbreite nach DIN EN 1610. Prüfen, ob die
Überdeckung mindestens 0,8 m beträgt.

**Die Zahl.** Grabenbreite aus DIN EN 1610 Tab. 1/2 bei DN 300 und der Tiefe an
der jeweiligen Station — **stationsweise**, nicht eine Breite je Haltung.
Überdeckung = Gelände vor diesem Graben minus Rohrscheitel; bei 0,85 m kein
Befund, bei Büro-Regelwerk 1,0 m ein Befund mit Quelle „Büro".

**Ist.** `ABLEITUNGEN.kanalgraben`. Tiefe entlang der Haltung alle 2 m plus
Enden; Sohlbreite stückweise konstant (die Norm ist eine Stufenfunktion);
Schachtbaugrube schließt stufenlos an die Grabensohle an (≤ 2 cm, vorher 15 cm
Absatz). Der Körper ist ein **Querprofilkörper**, kein Knotenraster — am
verbauten Graben lag der Rasterwert bis **+52 %** daneben, und die Gegenprobe
war blind dafür. Gemessen 231,313 m³ Körper gegen 231,313 m³ Integral.

---

## P3 · Baugrube für ein Bauwerk — **trägt**

**Auftrag.** Für ein Rechteckbauwerk 6 × 4 m, Sohle bei 295,00, eine Baugrube
mit 0,60 m Arbeitsraum und Böschung 45°.

**Die Zahl.** Aushubsohle = Bauwerksunterkante − Bettung. Aushub nach
`Qto_EarthworksCutBaseQuantities.UndisturbedVolume`; Verfüllung des Arbeitsraums
nach `Qto_EarthworksFillBaseQuantities.CompactedVolume`. Summe der Vorgänge =
Gesamtmasse auf 1e-6 — das ist ein Test, keine Zusicherung.

**Ist.** `ABLEITUNGEN.bauwerksgrube`, Arbeitsraum und Böschungswinkel aus dem
Regelwerk (DIN 4124). Der Aushub hängt per `IfcRelVoidsElement` am **Gelände**
als Wirt und ist nicht in die Raumgliederung eingeordnet — `IfcFeatureElement.NotContained`.

---

## P4 · Auffüllung zwischen Gelände und Planum — **trägt**

**Auftrag.** Ein Planum 10 × 10 m auf 301,00 herstellen, Böschung 1:2, und den
Zwischenraum zum Gelände (300,00) auffüllen. Dann das Planum auf 301,50 ändern —
Böschung und Massen müssen folgen, ohne zweites Kommando.

**Die Zahl.** Knoten 0,75 m außerhalb des Planumsrands:
`301,00 − 0,75/2 = 300,625`. Nach `erdbau-mass-setzen hoehe=301,50`:
`301,50 − 0,75/2 = 301,125`. Auffüllmasse 144,214237 m³ → neu gerechnet.

**Ist.** Vollständig, als Test `test/boeschungFolgt.test.js`. Die Böschung zeigt
über `{ziel: 'flaeche', flaeche: 'op-P'}` auf das Planum, statt seine Höhe zu
kopieren — **eine kopierte Höhe ist nirgends mehr die Wahrheit**. Alte Journale
ohne Verweis rechnen unverändert.

**Was dieses Szenario gelehrt hat** (und warum es hier steht): die erste Fassung
war „teilweise bestanden". Planum und Böschung trugen je eine eigene Kopie der
Höhe — das Ändern des einen ließ das andere stehen. Gefunden hat es nicht ein
Test, sondern **ein Szenario mit einer Zahl**.

---

## P5 · Stützwand an einer Straße — **fordert S4**

**Auftrag.** Entlang einer 40 m langen Achse eine Winkelstützwand: Höhe 2,50 m
über Gelände, Dicke 0,30 m, Fundament 1,20 × 0,40 m, Hinterfüllung mit
Sickerschicht. Betonmenge und Schalungsfläche ausgeben.

**Soll im IFC.**

| Teil | Klasse | PredefinedType |
|---|---|---|
| Wandscheibe | `IfcWall` | `RETAININGWALL` |
| Fundament | `IfcFooting` | `STRIP_FOOTING` |
| Sickerschicht | `IfcCourse` | `FILTER` |
| Hinterfüllung | `IfcEarthworksFill` | `BACKFILL` |
| Baugrube | `IfcEarthworksCut` | `TRENCH` |

Mengen: `Qto_WallBaseQuantities` (`NetVolume`, `GrossSideArea` = Schalung),
`Qto_FootingBaseQuantities`.

**Ist.** `IFCWALL` (`flaeche+dicke`) und `IFCCOURSE` haben eigene Typprofile;
`IFCFOOTING` erbt `koerper` — bewusst, denn „keiner seiner Untertypen ist eine
Region mit Stärke“. Aushub und Hinterfüllung trägt der Erdbau.
**Was fehlt: ein Rezept, das aus einer Linie eine stehende Scheibe macht.**
`platte` ist waagerecht, `pfosten` ein Stab.

**Entwicklungsauftrag — klein, und lohnend über dieses Szenario hinaus:**

```js
{ id: 'wand', titel: 'Wand', bauform: 'flaeche+dicke', kategorieVorgabe: 'IFCWALL',
  felder: [NAME, TYP, dicke, hoehe],
  geometrie: { art: 'sweep', achsbezug: 'sohle',              // ← neu, siehe unten
               profil: { art: 'rechteck', breite: 'dicke', tiefe: 'hoehe' } } }
```
Ein `sweep` mit Rechteckprofil entlang einer Linie — Geometrieart und Profil
**gibt es schon** (Rechteckkanal). **Korrigiert 2026-10-01 (Fahrplan Teil XXVI,
Fund 3): es ist *keine* reine Deklaration.** Ein Sweep legt sein Profil um die
Linie; angehoben wird er nur bei `parameter.achsbezug: 'sohle'`, und den
schreibt nur eine Netzkante. Ohne Kur stünde die Wand mit der halben Höhe im
Boden. Die kleinste Kur verwendet den vorhandenen Mechanismus wieder: die
Deklaration nennt `achsbezug` fest, `_koerper` liest `parameter.achsbezug ??
geo.achsbezug` — eine Zeile Kern, eine Zeile Katalogschema.

**Und dasselbe Rezept trägt das Streifenfundament.** Ein `STRIP_FOOTING` ist
geometrisch genau das: eine Linie mit Rechteckprofil, nur breiter und flacher.
Ein Rezept, zwei Katalogeinträge (`wand` → `IFCWALL`, `streifenfundament` →
`IFCFOOTING`) — der Grund, warum S4 drei Szenarien bedient und nicht eines.

Höhenbezug (E20 im Fahrplan): **die gezeichnete Linie ist der Fuß** (Unterkante
in m NN), die Höhe geht nach oben — im Tiefbau steht die Wand auf der
Bodenplatte, deren Oberkante kennt der Planer.

---

## P6 · Schachtbauwerk mit Gerinne und drei Anschlüssen — **fordert S1, S3**

**Auftrag.** Ein Kontrollschacht DN 1500: Unterteil mit Gerinne, zwei
Zuläufe DN 250 und DN 300, ein Ablauf DN 400, Auftritt, Konus, Deckel D400.
Das Bauwerk soll **als Einheit** in der Mengenliste stehen, seine Teile aber
einzeln bemaßt sein.

**Soll im IFC.**
```
IfcDistributionChamberElement/MANHOLE  „Schacht S-12"
 └─IfcRelAggregates─▶ ├─ IfcSlab/BASESLAB        Unterteil
                      ├─ IfcWall/USERDEFINED     Gerinne (Trockenwetterrinne)
                      ├─ IfcPlate/COVER_PLATE    Abdeckung
                      └─ IfcStair/LADDER         Steigeisen
IfcSpace/INTERNAL  „Schachtraum S-12"   ← Luftraum, Qto NetVolume
```

**Ist.** Der Schacht als **ein** Körper trägt (Rezept `schacht`, Netzrolle
`knoten`, Anschlüsse über `parameter.anschluss` und Koinzidenz). **Was fehlt:
die Zerlegung.** Heute ist der Schacht ein Bauteil; seine Teile können nicht
daran hängen.

**Entwicklungsauftrag.** S1 (`IfcRelAggregates`) und S3 (`IfcSpace`).
Dies ist der **kleinere Bruder von P7** und darum der bessere Durchstich: ein
Schacht hat vier Teile und einen Raum, ein RÜB zwanzig und drei. Wer die
Aggregation an einem Schacht baut, hat sie am Becken schon.

---

## P7 · Regenüberlaufbecken — **das Vollbild**

**Auftrag.** Ein RÜB im Mischsystem, Speichervolumen 250 m³, zwei Kammern.
Zulauf DN 600, Beckenüberlauf mit Schwelle auf 212,40 m NN und 4,0 m Länge,
Klärüberlauf mit Tauchwand, Grobrechen im Zulauf, geregelte Drossel auf
Q_Dr = 45 l/s, Ablauf DN 300. Bodenplatte 0,40 m, Wände 0,30 m, Decke 0,25 m.
Bettung 0,15 m Kies unter einer 5 cm Sauberkeitsschicht.

**Gefordert ist am Ende:** Betonmenge je Bauteil, Schalungsfläche,
Aushub und Verfüllung, **das Speichervolumen aus der Geometrie** (nicht aus der
Eingabe), und ein IFC, das das Prüftor mit 0 Verstößen besteht.

**Soll im IFC.** Vollständig ausgearbeitet in
**[ifc-sonderbauwerk.md](ifc-sonderbauwerk.md)** — dort steht jede Klasse, jeder
PredefinedType und jede Mengenvorlage gegen das Schema geprüft, dazu die drei
Strukturen (Raumgliederung · Zerlegung · Systeme) und die vier eigenen
Merkmalssätze für die Zahlen, die IFC nicht vorsieht.

**Die Zahl, an der es hängt.** `IfcSpace.NetVolume` der Speicherkammern bis zur
Schwellenhöhe 212,40 = **250 m³ ± 1 %**, nachgerechnet aus Grundfläche × Höhe.
Das Speichervolumen ist **kein Bauteil, es ist ein Raum** — und das ist die
Einsicht, an der dieses Szenario sein Gewicht hat.

**Ist.** Alle Bauteilklassen haben ein Typprofil. Aushub und Verfüllung tragen.
**Was fehlt: S1 Aggregation, S2 Facility/Part, S3 Space, S4 Wandrezept,
S5 Klassifizierung, S6 vier Psets, S7 Systeme** — die Liste samt Reihenfolge
steht in `ifc-sonderbauwerk.md` Abschn. 4.

**Nicht in diesem Szenario** (ausdrücklich, damit es nicht ausufert):
Bewehrung, Fugen, Statik, Bauablauf, hydraulische Berechnung. Das Becken wird
**modelliert**, nicht bemessen — die Bemessung nach DWA-A 128 bleibt außen vor,
ihre Ergebnisse (V, Q_Dr, Schwellenhöhe) sind **Eingaben**.

---

## P8 · Versickerungsanlage (Rigole) — **fordert S3, S6**

**Auftrag.** Eine Rigole 20 × 2,0 × 1,2 m aus Kiesschüttung, Hohlraumanteil
30 %, mit Geotextil, Zulauf über einen Sickerschacht DN 1000. Nutzbares
Speichervolumen und Versickerungsfläche ausgeben.

**Soll im IFC.**

| Teil | Klasse | PredefinedType |
|---|---|---|
| Kieskörper | `IfcCourse` | `FILTER` |
| Umhüllung (Geotextil) | `IfcCovering` | `MEMBRANE` |
| Sickerschacht | `IfcDistributionChamberElement` | `INSPECTIONCHAMBER` |
| Aushub | `IfcEarthworksCut` | `TRENCH` |

**Die Zahl.** Bruttovolumen 20 × 2,0 × 1,2 = 48 m³, nutzbar 30 % = **14,4 m³**.
Versickerungsfläche (Sohle + halbe Wandflächen nach DWA-A 138) separat.

**Ist.** `IFCCOURSE` hat ein Typprofil; der Körper ist als `platte` oder über
einen Erdbau-Vorgang darstellbar. **Was fehlt:** der **Hohlraumanteil** — und
damit die einzige Zahl, die die Anlage von einem Haufen Kies unterscheidet.
`Qto_CourseBaseQuantities` kennt `Volume, GrossVolume, Thickness, Weight`, aber
keine Porosität; `Pset_CourseCommon` nur `NominalLength/Thickness/Width`.

**Entwicklungsauftrag.** S6: `Quagg_Versickerung { Hohlraumanteil,
Durchlaessigkeit_kf, Versickerungsflaeche, Herleitung }` — und **S3**, wenn das
nutzbare Volumen als Raum geführt werden soll statt als Merkmal. Entscheidung
offen; Vorschlag: als Merkmal, weil es ein Materialkennwert ist und kein Raum
(anders als beim Becken, wo der Hohlraum wirklich leer ist).

---

## P9 · Revisionswechsel mitten in der Planung — **trägt**

**Auftrag.** Die eigene Arbeit (Graben, Baugrube, Massen) steht auf
`Gelaende_R01.ifc`. Der Vermesser liefert `Gelaende_R02.ifc` — dasselbe
Gelände, neue GlobalId. Die Arbeit darf nicht verloren gehen.

**Ablauf.** Laden → Revisionswechsel wird erkannt (Basisname bzw.
`projekt_global_id`) → Reiter „Verlauf" zeigt „Journal hängt an R01: umhängen…"
→ Zuordnungstabelle mit Vorschlag (`gleich` · `name+kategorie` · `pruefmass`),
**nur eindeutige Kandidaten werden vorgeschlagen** → bestätigen → ein Commit
`rebase {von, nach, abbildung}`.

**Die Zahl.** Nach dem Umhängen: `fehlend = 0` (vorher 1),
`erzeugt.parameter.quellen.gelaende === 'B'`, Massen neu gerechnet gegen R02.
Zweites Umhängen: 0 Schritte (Idempotenz).

**Ist.** Vollständig, im Browser nachgeprüft (12/12). Kein automatisches
Umhängen ohne bestätigte Tabelle; eine falsche Zuordnung ist ein normaler,
zurücknehmbarer Commit.

---

## P10 · Übergabe an den Auftraggeber — **trägt, mit einer Lücke**

**Auftrag.** Den Planungsstand als geprüftes IFC an die Stadtwerke übergeben,
nachweisbar, mit Begleitschein.

**Ablauf.** Modellsatz wählen → „Ausgeben" → ein geprüfter Verbund
(`Verbund_<Satz>_R<nn>.ifc`) wird erzeugt und ins Register eingetragen, mit
`herkunft{quellen[], commit, pruefung}` → Prüfbericht liegt am Container →
`WIP → Shared` (verlangt den Prüfbericht) → `Shared → Published` (Eignung `A1`)
→ Übergabepaket: ZIP mit Begleitschein, Empfänger, Anmerkung, protokolliert.

**Die Zahl.** `pruefe.py` unabhängig: **0 Verstöße**. Prüfsumme der Datei =
Prüfsumme im Register. Quellen, die im erzeugten Container stecken, fallen aus
dem Satz (kein doppeltes Gelände im Verbund).

**Ist.** Trägt. **Die Lücke:** der Dateiname folgt keiner
ISO-19650-Benennungskonvention — kein Urheber, keine Disziplin, kein Bauwerk im
Namen (M5 in [mussleistungen.md](mussleistungen.md)). Ein Büro mit
ISO-19650-Vorgaben weist das Paket zurück, obwohl der Inhalt stimmt.

---

## Die Entwicklungsreihenfolge, abgeleitet

Welche Fähigkeit verlangen wie viele Szenarien?

| Fähigkeit | P5 | P6 | P7 | P8 | P10 | Σ | Aufwand |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| **S4** Wandrezept (Linie + Dicke + Höhe) | ● | ● | ● | | | **3** | **klein** (eine Kernzeile + Deklaration) |
| **S1** `IfcRelAggregates` | | ● | ● | | | **2** | mittel |
| **S3** `IfcSpace` | | ● | ● | ○ | | **2+** | mittel |
| **S6** eigene Psets (je Satz) | | | ● | ● | | **2** | klein je Satz |
| **S2** `IfcFacility` / `FacilityPart` | | | ● | | | 1 | klein, hängt an S1 |
| **S5** `IfcClassificationReference` | | | ● | | ● | **2** | klein |
| **S7** `IfcDistributionSystem` | | ● | ● | | | **2** | klein |
| **M5** Benennungskonvention | | | | | ● | 1 | mittel |
| **S8** Ports / Topologie | | ○ | ○ | | | 0 | groß — **aufschieben** |

● verlangt · ○ wäre nützlich, geht auch ohne

**Daraus die Reihenfolge — und jeder Schritt ist für sich nützlich:**

```
1  S4  Wandrezept          ← drei Szenarien, kleinster Aufwand, nichts hängt davor.
                             Nach S4 ist P5 (Stützwand) KOMPLETT.
2  S1  Aggregation         ← der Angelpunkt. In Teil XXIII bewusst aufgeschoben
                             „kommt mit dem ersten zusammengesetzten Bauwerk" —
                             das ist jetzt da.
3  S2  Facility / Part     ← fällt mit S1 fast zusammen.
4  S3  IfcSpace            ← trägt das Speichervolumen. Umriss + zwei Höhen.
                             Nach S3 ist P6 (Schachtbauwerk) KOMPLETT.
5  S7  Systeme             ← IfcGroup wird IfcDistributionSystem. Eine Zeile je Gruppe.
6  S5  Klassifizierung     ← eine Beziehung; löst auch den Bauwerkstyp in P10.
7  S6  Psets               ← Quagg_Entlastung, _Drossel, _Rechen, _Speicherraum,
                             _Versickerung. Je Satz eine Tabelle, kein Code.
                             Nach S6 sind P7 (RÜB) und P8 (Rigole) KOMPLETT.
─────────────── ab hier ist ein Sonderbauwerk modellierbar ───────────────
8  M5  Benennungskonvention ← Prozess, nicht Geometrie; unabhängig vorziehbar.
9  S8  Ports                ← erst, wenn jemand die Topologie wirklich braucht.
```

**Der Durchstich dafür ist eine Kammer — weder P7 noch P6.** *Korrigiert
2026-10-01:* zuerst stand hier P6. Übersehen war, dass ein Schacht ein
**Netzknoten** ist: wird er zum Bauwerk aus Teilen, muss erst entschieden
werden, welches Objekt der Knoten ist — eine zweite, unabhängige Frage. Eine
Kammer ohne Netzrolle (Bodenplatte, vier Wände, Decke, ein Raum) beweist
dieselbe Mechanik ohne diese Last, und jede ihrer Zahlen ist von Hand
nachrechenbar. Ausgearbeitet im [fahrplan-teil-xxvi-bauwerke-2026-10-01.md](fahrplan-teil-xxvi-bauwerke-2026-10-01.md).

---

## Wie ein Szenario zum Abnahmefall wird

Das Muster, das sich in diesem Haus bewährt hat (P1 und P4 sind so entstanden):

1. **Bericht vor dem Bauen.** Was trägt heute, was bricht, und an welcher Stelle
   genau. Dann anhalten und Freigabe abwarten.
2. **Eine Zahl von Hand**, bevor eine Zeile Code entsteht. Nicht „das Volumen
   stimmt" — `301,50 − 0,75/2 = 301,125`.
3. **Der Abnahmetest läuft über Kommandos**, ohne Oberfläche
   (`// @vitest-environment node`, Speicher-Backend). Baut der Test seine
   Eingabe selbst, prüft er sich selbst.
4. **Ein Commit je Schritt**, jeder mit Test und **Gegenprobe**: die Kur
   abschalten, der Test muss rot werden. Bleibt er grün, hat die Kur nie gewirkt.
5. **Soll gegen Ist danach**, ohne Beschönigung. „Teilweise bestanden" ist ein
   gültiges Ergebnis und mehr wert als ein geschöntes „bestanden".
6. **Was über die Katalogarbeit hinaus Code nötig macht, ist ein Befund** — kein
   Auftrag, den man stillschweigend miterledigt.

---

## Siehe auch

- [planungswerkzeug.md](planungswerkzeug.md) — die sechs Begriffe, der Entscheidungsbaum zum Erweitern
- [ifc-sonderbauwerk.md](ifc-sonderbauwerk.md) — S1–S8 im Einzelnen, gegen das Schema geprüft
- [mussleistungen.md](mussleistungen.md) — M1–M24, Soll aus ISO 19650-1
- [kommando/durchstich-2-auffuellung-2026-09-19.md](kommando/durchstich-2-auffuellung-2026-09-19.md) — P4 als ausgeführter Durchstich samt Nachtrag
