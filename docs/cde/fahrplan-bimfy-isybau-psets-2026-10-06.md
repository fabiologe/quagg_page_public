# Fahrplan · ISYBAU-Sachdaten verlustfrei und IFC-konform (2026-10-06)

> Ziel (Fabio): „eine IFC-konforme Aufarbeitung der Daten ohne Verlust".
> Jeder Sachdatenwert einer ISYBAU-Datei steht nachher im IFC, an dem Element,
> zu dem er gehört, und wo IFC ein eigenes Feld kennt, steht er auch dort.

## Ausgangslage, gemessen an der echten Datei

| Grösse | Wert |
|---|---|
| Objekte | 670 |
| Sachdatenwerte ohne Geometrie | 8 844 |
| verschiedene Felder (Pfade) | 44 (53, wenn Knoten und Kante getrennt zählen) |
| davon kommen bei isyifc an | etwa 8 bis 13 (`QG_ISYBAU_Data`, `C_Attribute`) |
| davon kommen bei BIMFY an | Name, Nennweite, Manhole-Pset aus dem Muster, Herleitung |

Beispiele für verlorene Felder sind Status, Entwässerungsart, Abwasserart,
Schachtfunktion, Strasse, Ortsteil, Kommentar, alte Bezeichnung, Punktkennung
und Bauwerkstyp.

## Erledigt vorab · isyifc Haltungsfehler (P0)

`isyifc/core/export/IfcWriter.buildProperties` schrieb an Haltungen
`Deckelhoehe = Sohle Ablauf` und für fehlende Werte `0` (Baujahr 0, Sohle 0).

| | vorher | nachher |
|---|---|---|
| Haltung | `Sohlenhoehe` (Zulauf), `Deckelhoehe` (Ablauf) | `SohlhoeheZulauf`, `SohlhoeheAblauf` |
| fehlender Wert | `0` bzw. `Unknown`, `Beton`, Profil 0,3 | fehlt |
| Schacht | Sohle und Deckel | unverändert |
| Test `isyifc/test/psetHaltung.test.js` | 3 rot | 3 grün |

Ältere Dateien bleiben lesbar. `cde/test/achseAusExtrusion.test.js` liest
erst die neuen Namen und fällt auf die alten zurück. Offen bleibt in isyifc,
dass `createMaterial` ohne Code weiter ein `IfcMaterial 'Beton'` anlegt
(siehe P5).

## Entscheidungen

| Nr | Frage | Vorschlag |
|---|---|---|
| P‑E1 | Name des vollständigen Satzes | `ISYBAU_Stammdaten` (eigener Präfix, kein `Pset_`, damit kein bSI-Name belegt wird) |
| P‑E2 | Feldnamen darin | der ISYBAU-Pfad ohne Wurzel, Punkte als Trenner, z. B. `Knoten.Schacht.Schachtfunktion` |
| P‑E3 | Schlüsselwerte | Rohwert bleibt, die Bedeutung kommt als zweiter Wert `…_Text` dazu (z. B. `Material = B`, `Material_Text = Beton`) |
| P‑E4 | wo der Satz hängt | am Bauwerk (Schacht, Ablauf) bzw. an der Haltung, nicht an jedem Ring oder Rohrstück |
| P‑E5 | `QG_ISYBAU_Data` auch aus BIMFY | **nein (Fabio, 2026-10-06)**. BIMFY schreibt nur `ISYBAU_Stammdaten` und die bSI-Psets. Alte Dateien liest die CDE weiter |
| P‑E6 | Einheiten | Längen und Höhen als `IfcLengthMeasure`, Jahre als `IfcInteger`, Datum als `IfcDate`, sonst `IfcLabel` bzw. `IfcText` |

## Stufen

### P1 · Alles lesen (Isybauleser) · **gebaut**
- `isybau/Isybauleser.stammdatenVon(obj)` sammelt je Objekt jedes Blatt mit
  Text ausser der Geometrie als `{pfad: wert}`, ohne Handliste. Der Wert bleibt
  Text wie in der Datei. Ein wiederholter Name zählt mit (`…[2]`).
- Jedes gelesene Objekt trägt `stammdaten`. `liesIsybau` meldet
  `sachdaten: {werte, gelesen, ohne}`. Jedes übergangene Objekt steht in `ohne`
  mit Anzahl und Grund.
- Echte Datei (670 Objekte):

| | Werte |
|---|---|
| in der Datei (ausser Geometrie) | 8 844 (44 Pfade) |
| an BIMFY-Geometrien | 8 810 |
| Anschlusspunkte ohne Sohle, ausgelassen (Regel `ap-ohne-sohle`) | 23 |
| Leitungen ohne Lage und ohne bekannte Knoten | 11 |
| Summe | 8 844 |

- Gegenprobe gezählt mit Python an derselben Datei (ISO-8859-1): 8 844.
- Offen für P3: die 34 Werte der 5 übergangenen Objekte. Vorschlag: ein
  eigener Satz `ISYBAU_Uebergangen` am
  `IfcSite`, damit auch sie im IFC stehen.

### P2 · Durch den Kommandoweg tragen · **gebaut**
- Der Übersetzer gibt jedem Kommando `werte.stammdaten` mit (Zeichnen und
  alle vier Vorlagen). `pruefeKommando` verlangt eine Tabelle `{pfad: text}`,
  Pfade bis 255 Zeichen.
- Das Werkzeug legt sie als `parameter.stammdaten` ab. Beim Rohr am Rohr,
  bei einer Vorlage am Bauwerk und nie an den Teilen (P‑E4).
- Echte Datei:

| | Werte |
|---|---|
| an BIMFY-Geometrien | 8 810 |
| in den Kommandos | 8 464 |
| im Journal | 8 464 |
| Zeilen „rückgebaut" (Status 6), in BIMFY von Haus aus aus | 346 |

- Journal der echten Datei 2,30 MB vorher, 2,81 MB nachher (+22 %). Die
  Werte stehen zweimal darin, im Beleg (`kommando.werte`) und im Bauteil.
- **Offen:** der Schlüssel `aenderungen` darf am Server höchstens 4 MiB gross
  sein (`MAX_REPO_BYTES`). Ein Netz anderthalbmal so gross wie dieses reisst
  die Grenze, mit oder ohne Sachdaten. Eigene Aufgabe, nicht Teil dieses Plans.

### P3 · Vollständig ins IFC (eigenbau.py) · **gebaut**
- `EigenbauPaket` gibt `stammdaten` an Bauteil und Bauwerk weiter (optional,
  ein Paket ohne bleibt Byte für Byte gleich, keine neue Paketversion).
- `eigenbau._stammdaten` schreibt je Träger einen `IfcPropertySet
  ISYBAU_Stammdaten`, jeder Wert `IfcText` wie in der Datei. Kein Präfix
  `Quagg_`, weil es Daten der Quelle sind, nicht unsere (Fabio, P‑E1).
- Vertrag: `paket_strassenablauf.json` trägt jetzt Sachdaten mit Umlaut und
  Dezimalkomma, `test_strassenablauf_isybau_stammdaten` liest sie aus der
  IFC-Datei zurück (alter Schreiber rot, neuer grün).
- Echte Datei, vom XML bis ins IFC:

| | Werte |
|---|---|
| in der Datei | 8 844 |
| im Journal | 8 464 |
| im Paket | 8 464 |
| im IFC (`ISYBAU_Stammdaten`) | 8 464 |
| Träger | 292 Schächte und Bauwerke, 304 Rohre, 49 Formstücke |
| Prüftor offen | 0 |

- Noch nicht im IFC: 346 Werte an rückgebauten Objekten (Zeile aus) und 34 an
  5 Objekten ohne Körper. Vorschlag `ISYBAU_Uebergangen` am `IfcSite` bleibt
  offen, dafür braucht das Journal einen Eintrag ohne Bauteil.
- Schlüsseltexte (`Material_Text = Beton`, P‑E3) noch nicht. Sie kommen mit P4,
  weil dieselbe Tabelle auch die bSI-Abbildung speist.

### P4 · bSI-Felder und Klartexte · **gebaut (ohne Material)**
- Eine Tabelle `bimfy/isybau/Abbildung.js` mit Regeln wie das
  Knotenregelwerk, jede mit Beispiel und Wächter (`bimfySachdaten.test.js`).
  Angewandt beim Packen (`EigenbauPaket`), das Journal bleibt roh.
- **Klartext** (P‑E3): jeder Schlüssel bekommt `<Pfad>_Text` aus
  `Schluessel.js`, gesucht nach dem letzten Namen im Pfad (beide Formate).
- **Reference und Status** in `Pset_…Common` je Klasse
  (DistributionChamberElement, PipeSegmentType, PipeFittingType,
  WasteTerminalType). Status ist in bSI eine Aufzählung, der Schreiber kann
  dafür jetzt `IfcPropertyEnumeratedValue` (eine `IfcPropertyEnumeration` je
  Datei).

| G105 | bSI | Grund |
|---|---|---|
| 0 vorhanden | EXISTING | |
| 1 geplant | NEW | |
| 2 fiktiv | OTHER | bSI kennt keinen gedachten Bestand |
| 3 ausser Betrieb | EXISTING | noch im Boden |
| 4 verdämmt/verfüllt | OTHER | weder Betrieb noch Abbruch |
| 5 sonstige | OTHER | |
| 6 rückgebaut | DEMOLISH | AH15: zu löschende Objekte |

- **Baujahr bewusst ohne bSI-Ziel.** IFC kennt nur ein Datum
  (`InstallationDate`), ein erfundener 1. Januar wäre ein Wert ohne Quelle.
- Manhole-Pset (Sohle, Wand, Steigeisen, Abdeckungsklasse) kam schon aus dem
  Muster und bleibt. Ein Merkmal hat eine Quelle, die Abbildung überschreibt nichts.
- Echte Datei:

| | Wert |
|---|---|
| Rohwerte in `ISYBAU_Stammdaten` | 8 464 |
| Klartexte dazu | 1 963 |
| Common-Sätze | 292 Schacht/Bauwerk, 304 Rohr, 49 Formstück |
| Status | 364 EXISTING, 139 NEW, 93 OTHER (49 Träger ohne Status in der Datei) |
| Warnungen des Schreibers | 0 |
| Prüftor offen | 0 |

- Ohne Klartext, weil der Code in keiner gelesenen Liste steht (23 Werte):
  Profilart `DN` 13, Aufbauform `Q` 6 und `VORFL` 1, Bauwerkstyp 7 und 8,
  SchachtFunktion `A`. Fundstellen offen (ISYBAU 2017 Referenzlisten).
- **Offen P4b:** Material als `IfcMaterial`. Der Schreiber legt heute kein
  Material an, das ist ein eigener Schritt mit Prüftor-Regeln.

### P4c · Rückbau mitbauen und markieren · **gebaut**
Fabio, 2026-10-06: „rückgebaute Elemente sollten geflaggt werden, man soll
sie in der Ansicht sehen, das ist relevant für Massen später".

- `services/Zustand.js`: EINE Regel. `parameter.zustand = 'rueckbau'` am
  Bauteil oder am Bauwerk, die Teile erben über `teilVon`. Eine Vorlage, die
  ihre Teile neu rechnet, verliert die Markierung so nicht.
- BIMFY setzt sie aus ISYBAU Status 6 und baut die Zeilen „(rückgebaut)"
  jetzt mit (vorher abgewählt). Das Kommando nimmt nur bekannte Zustände.
- Ansicht: 3D rot durchscheinend (0xc62828, Deckkraft 0,45), Lageplan rot und
  gestrichelt (auch Symbole, Strich und Farbe für den S/W-Druck),
  Strukturbaum mit Hinweis „Rückbau" und durchgestrichenem Namen.
- Export: Paketfarbe rot, im IFC `Pset_…Common.Status = DEMOLISH`.
- Echte Datei:

| | vorher | nachher |
|---|---|---|
| ISYBAU-Werte im Journal und im IFC | 8 464 | 8 810 |
| Bauwerke/Bauteile mit Rückbau | 0 | 20 (66 Teile im Paket rot) |
| `Status = DEMOLISH` im IFC | 0 | 20 |
| Netz: Knoten / lose Enden / abweichend | 341 / 33 / 23 | 358 / 2 / 33 |
| Journal | 2,81 MB | 2,92 MB |
| Prüftor offen | 0 | 0 |

- Offen P4d: Massen getrennt nach Bestand und Rückbau (Mengenkopf wie
  `Sanierung.mengenNachMassnahme`).

### P4e · Elemente ohne Körper · **gebaut**
Fabio, 2026-10-06: „Als Element ohne Geometrie".

- Was BIMFY nicht bauen kann, weil Lage oder Höhe fehlt, wird ein Bauwerk der
  Art `anschluss` (IfcPipeFitting) oder `leitung` (IfcPipeSegment). Im IFC ein
  Element OHNE Geometrie und OHNE Platzierung, in der Site enthalten, mit
  `ISYBAU_Stammdaten`, Common-Satz und Ausführung (JUNCTION/ENTRY wie der
  Formstück-Weg). Es ist kein Netzknoten, eine Leitung dorthin bleibt lose.
- Ebene in BIMFY: „ISYBAU … (ohne Körper)", Wahl „Element ohne Körper".
- Echte Datei:

| | Werte |
|---|---|
| in der Datei | 8 844 |
| im Journal | 8 844 |
| im IFC (`ISYBAU_Stammdaten`, roh) | **8 844** |
| Klartexte dazu | 2 028 |
| Elemente ohne Körper | 5 (4 IfcPipeFitting, 1 IfcPipeSegment) |
| Prüftor offen | 0 |

- **Lage ohne Höhe (gebaut):** ein Element ohne Körper trägt seine Geometrie
  roh in `ISYBAU_Stammdaten` (`Geometrie.Geometriedaten.Knoten.Punkt.Rechtswert`
  usw.), im Lagesystem der Datei. Eine Platzierung braucht eine Höhe; eine
  erfundene gäbe es nicht. Echte Datei: 19 Lagewerte an den 5 Elementen.

### P4b · Material als IfcMaterial · **gebaut**
- `Abbildung.materialVon(stammdaten, rezept)`: je Rezept des Teils das
  ISYBAU-Feld (Rohr `Material`, Ring/Konus/Platte/Auflagering `MaterialAufbau`,
  Unterteil `MaterialUnterteil`, Abdeckung `MaterialAbdeckung`, Berme
  `MaterialGerinne`, Steigeisen `MaterialSteighilfen` nach G307). Ein
  Schachtteil fragt sein Bauwerk. Ohne Angabe KEIN Material (die Norm-Annahme
  „Betonring" ist keine Materialangabe).
- Kategorie nach IFC-Empfehlung (concrete, steel, plastic, brick, earth …) nur,
  wo der Code sie eindeutig nennt. Guss, Steinzeug, Mauerwerk, Faserzement
  bleiben ohne.
- Schreiber: ein `IfcMaterial` je Name, Quelle in `Description`, EINE
  `IfcRelAssociatesMaterial` je Material an alle Elemente (auch ohne Körper).
- Echte Datei: 538 Elemente mit Material, 9 Materialien (Stahlbeton 275,
  Polypropylen 161, Beton 44, PVC 26, PVC-U 17, Kunststoff 6, Mauerwerk 6,
  GFK 2, Steinzeug 1). Schreiber 0 Warnungen, Prüftor 0 offen.

### P5 · Keine erfundenen Werte
- Kein Wert ohne Quelle. Fehlt er in der Datei, fehlt er im IFC.
- Was BIMFY ergänzt (Norm, Annahme), steht in der Herleitung und nie in
  `ISYBAU_Stammdaten`.
- isyifc folgt nach: `createMaterial` ohne Code legt kein Material an.

### P6 · Wächter und Abnahme
- Ein Test an der echten Datei zählt `gelesen`, `im Journal`, `im IFC` und
  nennt jede Abweichung mit Grund (Feldpfad, Objekt, warum).
- Ziel 8 844 / 8 844 / 8 844. Der heutige Stand je Weg wird in P1 gezählt
  (bisher nur nach Feldern gezählt, 8 bis 13 von 53).
- Rückweg: die CDE liest `ISYBAU_Stammdaten` über `IfcQuelle.merkmale()` und
  zeigt die Werte in der Bauteiltafel.

## Grenzen
- Kein Feature importiert aus einem anderen. Die Schlüsseltabellen von isyifc
  werden nicht importiert, BIMFY hat eigene in `isybau/Schluessel.js`.
- Die echte ISYBAU-Datei und Normtabellen kommen nicht ins Repo.
- `backend/app/ifc/*` wirkt sofort. Jede Stufe endet mit Syntaxprüfung und
  grüner IFC-Suite.

## Reihenfolge
P1 → P2 → P3 bringen die Vollständigkeit. P4 macht sie IFC-konform. P5 und P6
laufen bei jeder Stufe mit.
