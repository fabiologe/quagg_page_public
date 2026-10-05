# BIMFY · ISYBAU in höchster Genauigkeit

**Fahrplan, Stand 2026-10-05.** Stufen I1 bis I6 sind gebaut, I7 (Abnahme mit echter Datei) steht aus. Jede Aussage sagt,
ob sie **gelesen**, **gemessen** oder **eingeschätzt** ist.

Die Regelliste (Felder und Schlüssel des ISYBAU‑Formats, Normmasse für Schacht, Abdeckung und
Rohr, IFC‑Abbildung) liegt bei Fabio und **nicht im Repo**, weil sie Tabellen und Zitate aus
lizenzierten Normen enthält und der Repo öffentlich ist. Im Code stehen nur einzelne Masse mit
Norm und Stelle (`services/bimfy/muster/Normwerte.js`).

---

## 0 · Das Ziel in einem Satz

Aus einer ISYBAU‑Datei entsteht jeder Schacht **Bauteil für Bauteil** (Unterteil mit Gerinne und
Auftritt, Ringe, Konus, Auflageringe, Abdeckung, Steigeisen) und jede Haltung **mit ihrer Wand**,
und jedes Mass sagt, ob es aus der Datei, aus einer Norm oder aus einer Annahme stammt.

---

## 1 · Was ISYBAU hergibt und was nicht

ISYBAU liefert **Daten, keine Körper** (gelesen, Arbeitshilfen Abwasser 12/2015, Anhang A‑7):

| Bereich | gibt es | gibt es nicht |
|---|---|---|
| Schacht | Deckelhöhe (DMP), Sohlhöhe (SMP oder HP), Schachttiefe, Funktion, Steighilfen | Anzahl und Höhe der Ringe |
| Abdeckung | Form, Typ (Lüftung), lichte Masse, Klasse, Werkstoff, Auflageringe (Anzahl, Höhe **in cm**), Schmutzfänger | Rahmenhöhe |
| Aufbau | Form, Konus ja/nein, Abdeckplatte ja/nein, Länge, Breite, Höhe, Werkstoff | Konushöhe |
| Untere Schachtzone | Übergangsplatte, Konus, Masse, Podest | |
| Unterteil | Form, Masse, Werkstoff, Gerinneform, Gerinnewerkstoff | Gerinnehöhe als Zahl |
| Haltung | Sohlhöhen, Länge, Werkstoff, Profilart, Profilmasse in mm, Knickpunkte, Bögen | Wanddicke, Steifigkeitsklasse, Rohrverbindung |

Was fehlt, schliessen die **Muster** mit Normregeln (DIN 4034‑1, DWA‑A 157, DIN EN 124,
Produktnormen der Rohre) und, wo keine Norm im Bestand ist, mit gekennzeichneten Annahmen.

---

## 2 · Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| **I‑E1** | Wo wird der Schacht gegliedert? | Als **Bauwerk‑Vorlage** wie in Teil XXVIII (`rezept/Bauwerksvorlagen.js`): Werte hinein, Teile mit Rollen heraus. Die Kette rechnet `muster/Normschacht.js` (Fabio, 2026-10-05: „lets go“) |
| **I‑E2** | Normwerte, wo ISYBAU schweigt? | **Ja, gekennzeichnet** (Fabio, 2026-10-05). Jedes Mass trägt `herleitung` mit `art` = `isybau`, `norm`, `norm-pruefen` oder `annahme` |
| **I‑E3** | Rohrwand | Hohlprofil aus DN und Werkstoff (`muster/Rohrwand.js`); Kunststoff nach SDR, Beton und Steinzeug als Faustwert gekennzeichnet |
| **I‑E4** | Schreiber erweitern? | **Ja** (Fabio, 2026-10-05). `backend/app/ifc` wirkt sofort, deshalb eine eigene Stufe mit Gold und Prüftor |
| **I‑E5** | Der Leser im Feature `isyifc` | Nicht angefasst. Seine Lesefehler stehen in der Regelliste; der BIMFY‑Leser ist eigenständig nach dem Format |

---

## 3 · Stufen

### I1 · Leser und Muster (gebaut)

| Modul | was es tut |
|---|---|
| `services/bimfy/isybau/Isybauleser.js` | liest Schacht (Abdeckung, Aufbau, Untere Schachtzone, Unterteil, Steighilfen), Kanten (Kante, Profil, Haltung/Leitung/Rinne/Gerinne) und die Geometrie (Punkte, Kanten mit Kreisbögen, Polygone) nach dem Format 2013. Meldet Millimeter, wo Meter verlangt sind |
| `services/bimfy/isybau/Schluessel.js` | die Schlüssellisten G102, G205, G300 bis G309, G105, V106 |
| `services/bimfy/muster/Normschacht.js` | die Bauteilkette eines runden Schachts. Gemessene Höhen gelten, Ringe aus 1000/750/500 mm, der Rest in Auflageringen (60/80/100 mm, zusammen ≤ 240 mm). Was nicht aufgeht, wird Befund |
| `services/bimfy/muster/Rohrwand.js` | Innen‑ und Aussendurchmesser, Wanddicke, Bezug der Nennweite (innen oder aussen) |
| `services/bimfy/Geometrieleser.js` | BIMFY nutzt den neuen Leser; jede Geometrie trägt `isybau` und `muster` |

**Gemessen** (Test `bimfyMuster.test.js`): ein Regelschacht DN 1000, Deckel 105,00, Sohle 102,00,
Abgang DN 300 wird zu **7 Teilen** statt einem Zylinder: Unterteil 101,85 bis 102,70, Ring 1000,
Ausgleichsring 500, Hals 600, Auflagering 60, Abdeckung, Steiggang mit 7 Steigeisen im Abstand
315 mm. Rest der Kette −2 cm (in der Toleranz). Gegenprobe: Auflageringe in mm statt cm gelesen →
2 Tests rot.

### I2 · Geometrie für Hohlkörper (gebaut)

Die Rezepte kennen heute nur volle Profile (`PROFIL_ARTEN`: Kreis, Rechteck, Polygon). Gebraucht:

| Form | für | Weg (eingeschätzt) |
|---|---|---|
| Kreisring‑Profil | Rohr mit Wand, Schachtring, Auflagering | neue Profilart `kreisring` (aussen, innen) für den Sweep |
| Kegelstumpf, hohl, exzentrisch | Schachthals | neue Geometrieart, Loft zwischen zwei Kreisen |
| Topf mit Gerinne | Unterteil | Ring + Boden, Gerinne als Abzug (Kernel) |
| Platte mit Öffnung | Abdeckplatte, Übergangsplatte, Abdeckung | Platte mit Loch (Polygon mit Innenring) |
| Bügel | Steigeisen | Stab mit kleinem Profil, je Position |

Leitplanke: Mengen (Volumen) müssen am Körper stimmen, ein Ring hat das Volumen des Rings.

### I3 · Rezepte (gebaut)

Je Teil ein Rezept mit Feldern aus der Kette: `schachtunterteil`, `schachtring`, `schachthals`,
`abdeckplatte`, `uebergangsplatte`, `auflagering`, `schachtabdeckung`, `steigeisen`. Das Rohr
bekommt ein Feld für die Wanddicke. Die Klassen nach der IFC‑Recherche (eingeschätzt):
`IfcBuildingElementPart` bzw. `IfcDiscreteAccessory` mit `USERDEFINED` und ObjectType.

### I4 · Vorlage „Normschacht“ (gebaut)

Eine Bauwerk‑Vorlage, deren Rollen `Normschacht` liefert. Das Ganze ist der Schacht selbst
(`IfcDistributionChamberElement/MANHOLE`), nicht eine Anlage.

### I5 · Schreiber (`backend/app/ifc`, wirkt sofort, gebaut)

- ein Bauteil darf ein Ganzes sein (`IfcRelAggregates` Schacht → Teile)
- PredefinedType `MANHOLE`, damit `Pset_DistributionChamberElementTypeManhole` geschrieben wird
- Hohlprofile, Merkmale InnerDiameter/OuterDiameter am Rohr
- die Herleitung je Mass in einem Quagg‑Satz (wie `Herleitung` in `quagg-merkmale.json`)
- Gold und Prüftor vor und nach der Stufe

### I6 · BIMFY verdrahten (gebaut)

ISYBAU‑Schacht → ein Kommando „Bauwerk aus Vorlage“; Haltung → Rohr mit Wand, Enden als Knoten
am Schacht (K8). Die Tafel zeigt je Schacht die Befunde und wie viel Norm und Annahme drinsteckt.


### Stand nach I2 bis I6 (gemessen)

| Stufe | was gebaut ist | Nachweis |
|---|---|---|
| I2 | `ops/Sweep.ringstueck` (Drehkörper, geneigte Achse = exzentrisch, r = 0 schliesst Boden und Deckel), `sweep` mit Loch; Geometriearten `ringstueck`, `berme`, `tritte`; Profilart `kreisring` | `bimfyKoerper.test.js`: Volumen = Vieleckformel, alle geschlossen, Konus auf der Versatzseite senkrecht |
| I3 | 8 Rezepte (`nurVorlage`): Unterteil, Ring, Hals, Platte, Auflagering, Berme (IfcBuildingElementPart), Abdeckung, Steigeisen (IfcDiscreteAccessory), USERDEFINED mit Objekttyp. Rohr: Wanddicke (leer = wie bisher) und DN‑Bezug | Wächterlisten ergänzt, Reichweite 147/124 → 150/127 |
| I4 | Vorlage `normschacht`, Bauwerksart `schacht`, Ort und Höhe je Vorlage benannt | `bimfyNormschacht.test.js`: ein Kommando, Schacht + 8 Teile, 101,85 bis 105,00 lückenlos |
| I5 | Schreiber: `schacht` → `IfcDistributionChamberElement/MANHOLE`, Teile über `IfcRelAggregates`, Pset…TypeManhole, `Quagg_CDE.Herleitung` je Teil | `test_bauwerke.py::test_normschacht_im_ifc` mit dem echten Paket: Prüftor ohne offenen Befund, IDS 0. Gegenprobe SUMP statt MANHOLE → rot |
| I6 | BIMFY: ISYBAU‑Schacht → Normschacht (Vorschlag), Haltung → Rohr mit Wand | `bimfyMuster.test.js`: zwei Schächte → 8 und 9 Teile, Steinzeugrohr DN 300 mit 27,3 mm Wand, Sohle bleibt 102,00/101,70 |

### Offen nach I6

1. **Netzknoten.** Ein Normschacht ist kein Knoten im Netz (keine Netzrolle). Längsschnitt und Netzwerkzeuge sehen die Haltungen, die Schächte nur als Bauwerk.
2. **Untere Schachtzone** (Übergangsplatte) rechnet das Muster, die Werte der Vorlage tragen sie noch nicht.
3. **Profilarten** ausser Kreis (Ei, Maul, Rechteck) werden als Kreis gebaut und gemeldet.
4. **Ringanzahl.** Ändert „Werte der Vorlage ändern“ die Zahl der Ringe, fehlen Rollen (Grenze der Vorlagen mit festen Rollen).
5. **Gerinne** im Grundriss genau, die Sohle eben (Halbschale vereinfacht). Loch der Abdeckplatte zentrisch.
6. **Annahmen** bis zu Fabios Normen: Rahmenhöhe 160 mm, Rahmenbreite 80 mm, Deckel 60 mm, Konus exzentrisch, Steiggang nach Norden, Wand Beton/Steinzeug als Faustwert.

### I7 · Abnahme (gemacht, echte Datei Format 2017)

Fabios Datei bleibt ausserhalb des Repos. Ihre Eigenheiten sind in `bimfyMuster.test.js`
nachgestellt (Block „Abnahme I7“).

Funde und Kur:

- `<></>` macht die Datei unlesbar → wird repariert und gemeldet.
- Polygonart klein, `Knoten/Abdeckungen/Deckel`, Profilart „DN“, HoeheAuflageringe in cm,
  Sohle in mm → Leser kennt beides, Einheiten werden gemeldet.
- HoeheAufbau 0 heisst unbekannt. Konus und Platte beide „nein“ → Regelaufbau mit Hals, Befund.
- Formen Q, Z, VORFL → Sonderform (Ebene „(Sonderform)“), kein Normschacht.
- Status 6 → Ebene „(rückgebaut)“, beim Import abgewählt.
- Flachschächte → Unterteil gekürzt bis DN + 0,1 m, sonst Befund `zu_flach`.
- Lage in GK2 → `Lagebezug.js` erkennt das System und rechnet auf Wunsch ins Projektsystem um.

| Messgrösse | vorher | nachher |
|---|---|---|
| offene Ketten | 52 | 0 |
| abgelehnte Kommandos | 2 | 0 |
| Fehler im Steigmass | 7 | 0 |
| Lesezeit | 13,6 s | 0,7 s |

Ergebnis: 463 Geometrien, 444 Kommandos, 100 Normschächte (5 bis 10 Teile), 40 Sonderformen,
304 Rohre, 1090 Bauteile. Schreiber 2,3 s ohne Warnung, Prüftor 0 offen.

### I8 · Ein Vorgang, Rohre aller Werkstoffe, Muffen und Ringstösse (gebaut)

1. **Sammlung.** Neues Kommando `sammlung` aus Erzeugen‑Teilen. Ein Import ist ein Vorgang mit
   einem Beleg und einem Rückgängig. Nebenbei behoben: Die Tafel gab ihren Kommandos keine
   Kennungen, jedes Bauteil wäre abgelehnt worden.
2. **Rohrwand je Werkstoff** (`muster/Rohrwand.js`). Formeln statt Normtabellen, je mit Stützwert:
   Beton und Stahlbeton aus dem Spitzenden‑Aussendurchmesser (DIN V 1201, Tab. 7, DN 300 → 386 mm)
   mit Glockenmuffe, Steinzeug (d3 DN 150 → 186 mm), PVC, PP und PE über SDR mit Steckmuffe
   (PP/PE L1 = 0,4·dn + 18 mm, Baulänge 6 m), Guss (DE, Wand K9). GFK, Polymerbeton, Faserzement
   sind Annahmen (Normen nicht im Bestand). Kunststoff der alten DN‑Reihe (DN 150) ist DN/OD 160.
3. **Muffen am Rohr.** Felder Baulänge, Muffe aussen, Muffe Tiefe. Die Geometrie setzt je Stoss
   eine Muffe, am Knick rückt sie hinter ihn. Herleitung am Rohr im IFC.
4. **Ringstösse.** Spitzende unten, Muffe oben (DIN V 4034‑1:2004, Tab. 5, als Formeln: DN 1000 →
   1090/65/70 mm). Unterteil hat die Muffe, der Konus das Spitzende; an anderem DN entfällt der Stoss.

| Messgrösse (echte Datei) | vorher | nachher |
|---|---|---|
| Vorgänge beim Import | 463 | 1 |
| Zeit für den Import | 46,3 s | 1,5 s |
| Muffen an Rohren | 0 | 1252 an 284 Rohren |
| Schachtteile mit Stoss | 0 | 248 |
| Prüftor offen | 0 | 0 |

### I9 · Gehrung im Sweep, Kastenschacht (gebaut)

1. **Gehrung.** Der Sweep streckt das Profil am Knick um 1/cos(w/2). Ein Rohr mit Knick hat
   jetzt Fläche × Achslänge als Volumen (Gold `rohr` Fall 0: 4,3204 → 4,4143 m³).
2. **Kastenschacht** (`muster/Kastenschacht.js`, Vorlage `kastenschacht`, Körper `kasten`).
   Klein (lichte Seite < 0,8 m): Kasten mit rechteckiger Abdeckung. Begehbar: Kasten, Abdeckplatte
   mit runder Öffnung, Auflagering, runde Abdeckung, Steigeisen ab 1 m Tiefe. Die Längsachse folgt
   dem Ablauf und dreht mit dem Bauwerk. Wand, Boden und Abdeckung sind Annahmen (DIN EN 1917
   nicht im Bestand), gemauert 24 cm.

| Messgrösse (echte Datei) | vorher | nachher |
|---|---|---|
| eckige Schächte als Sonderform | 32 | 0 |
| gegliederte Schächte im IFC | 100 | 125 (dazu 7 rückgebaute, abgewählt) |
| Prüftor offen | 0 | 0 |

### I9b · Der Schacht ist ein Knoten im Netz (gebaut)

Ein Bauwerk der Art „schacht“ steht im Netz an seiner Sohle in der Schachtmitte (`CdeAchsen`),
mit einem Radius bis zur Aussenwand (`knotenRadius` der Vorlage). BIMFY gibt jedem Schacht seine
Kennung vorab, jede Haltung nennt an Anfang und Ende ihren Schacht. Lage und Höhe bleiben wie
vermessen: die Haltungen der echten Datei enden im Mittel 57 cm neben der Mitte, an der Wand.
Am gezeichneten Schacht bleibt die strenge Regel (E6: 5 cm daneben ist „abweichend“).

| Messgrösse (echte Datei) | vorher | nachher |
|---|---|---|
| Knoten im Netz | 15 | 140 |
| lose Rohrenden | 606 | 315 (davon 290 an Anschlusspunkten und Bauwerken, die BIMFY noch nicht liest) |
| Schächte ohne Anschluss | 13 | 3 |
| Anschluss abweichend | 0 | 23 (Sonderform‑Schächte ohne Radius) |

### I10 · Anschlusspunkte und Bauwerke (gebaut)

1. **Anschlusspunkt** (KnotenTyp 1): Rezept `anschlusspunkt`, IfcPipeFitting — JUNCTION für AP,
   ENTRY für GA, RR, SE, ER (AH15, Tab. A‑1‑2). Sohle an der Lage, Gelände am GOK‑Punkt
   (A‑1.2.2.2). DN 150 ist angenommen.
2. **Bauwerk** (KnotenTyp 2): Rezept `sonderbauwerk`, Hülle aus dem Umriss (SBW) von der Sohle bis
   zum Deckel, GrossVolume. Knoten am Schwerpunkt, Radius bis zum Umriss. Name nach G400.
3. **Fuge am Symbol.** Die Haltungslänge der Datei passt zu Linie plus Lücken (Median 9 mm),
   nicht zur Linie (68 cm): der Export kürzt die Linien am Symbol. Am Schacht sind die 0,50 m
   genau die Innenwand DN 1000 — dort bleibt das Rohrende. Am Anschlusspunkt (kein Körper)
   wird die Leitung bis zum Punkt verlängert (bis 0,5 m), die Höhe bleibt, die Herleitung sagt es.

| Messgrösse (echte Datei) | vorher | nachher |
|---|---|---|
| Knoten im Netz | 140 | 341 |
| lose Rohrenden | 315 | 33 |
| Anschluss abweichend | 23 | 23 (Sonderform‑Schächte) |
| verlängerte Leitungen | 0 | 162 |
| IfcPipeFitting im IFC | 0 | 198 |
| Prüftor offen | 0 | 0 |

### I11 · Knotenregelwerk und Kunststoffschacht (gebaut)

Fabio: „ein Gebäudeanschluss ist meist ein kleiner PVC‑Schacht mit DI = 0,8 m … skalierbar und
erweiterbar, damit wir alle möglichen komischen Fehleinträge abfangen können."

1. **Regelwerk** (`bimfy/Knotenregeln.js`): jeder ISYBAU‑Knoten läuft durch eine Tabelle von
   Regeln seiner Art. Eine Regel entscheidet (Bauart), berichtigt einen Fehleintrag und gibt weiter,
   oder passt nicht. Jede Regel trägt ein Beispiel, der Wächter (`bimfyKnotenregeln.test.js`) prüft
   jedes. Stellschrauben stehen in `KNOTEN_VORGABEN`. Normschacht, Kasten und Sonderform ziehen mit
   in die Tabelle.
2. **Kunststoffschacht** (`muster/Kunststoffschacht.js`, Vorlage `kunststoffschacht`): DI skalierbar,
   ab 0,8 m Konus auf 625 mm, sonst Teleskop; Unterteil, Schachtrohr, Abdeckung. Wand DI/40, Boden
   und Bauhöhen sind Annahmen (DIN EN 13598‑2 nicht im Bestand), DI 0,8 ist Fabios Vorgabe.
3. **Fehleinträge**, die die echte Datei hat: GOK‑Punkte nur mit Höhe (101, vorher nicht gelesen),
   kein GOK (56, Tiefe 1,0 m angenommen), GOK unplausibel (5, verworfen), Höhen vertauscht (1),
   zu flach für einen Schacht (2, Formstück).

| Messgrösse (echte Datei) | vorher | nachher |
|---|---|---|
| Gebäudeanschlüsse als Schacht | 0 | 149 (74 mit Konus, 75 mit Teleskop) |
| abgefangene Fehleinträge | 0 | 62 berichtigt, 2 als Formstück |
| gegliederte Schächte im IFC | 125 | 274 |
| verlängerte Leitungen | 162 | 2 (nur noch an Formstücken) |
| Prüftor offen | 0 | 0 |

### Offen nach I8

1. ~~Netzknoten des Normschachts~~ — gebaut (I9b). ~~Anschlusspunkte und Bauwerke~~ — gebaut (I10).
2. ~~Kastenvorlage für die 32 eckigen Schächte~~ — gebaut (I9).
3. Anschlusspunkte am Bauwerk, Gerinne als Halbschale, Untere Schachtzone in der Vorlage.
4. PP profiliert (DIN EN 13476), GFK, Polymerbeton, Faserzement: Normen fehlen im Bestand.
   Muffenspalt der Schachtringe (DIN V 4034‑1, Tab. 7) und Falzmasse (DIN 4034‑2, nur Bild) ebenso.
5. Lage der Ringmuffe (oben) ist angenommen, am Original zu prüfen.
6. ~~Der Sweep streckt die Gehrung am Knick nicht~~ — behoben (I9a): Volumen = Fläche × Achslänge.

---

## 4 · Lücken, die nur Fabio schliessen kann

DIN 19584 (Rahmenhöhe der Abdeckung), DIN EN 1917 vollständig, DIN 4034‑1 Tabelle 5 (Muffe und
Spitzende) und Tabelle 4 am Original, ISYBAU 2017 und das XSD, die Steigeisennormen, Herstellertabellen
für Beton‑ und Steinzeugrohre. Bis dahin stehen dort Annahmen, und sie heissen so.

---

## 5 · Leitplanken

1. Gemessene Höhen gelten, das Muster passt sich an, nie umgekehrt.
2. Kein Mass ohne Herleitung.
3. Was nicht aufgeht, ist ein Befund, nicht still verschluckt.
4. Keine Normtabellen ins öffentliche Repo, nur einzelne Masse mit Norm und Stelle.
5. Ein Commit je Stufe mit Test und Gegenprobe; `backend/app/ifc` nur mit Gold.
