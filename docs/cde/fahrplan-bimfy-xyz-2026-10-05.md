# BIMFY · XYZ und Punktdaten — wohin damit

**Fahrplan, Stand 2026-10-05. Geplant, nicht gebaut.** Gebaut wird erst nach Freigabe der
Entscheidungen X‑E1 bis X‑E6. Jede Aussage sagt, ob sie **gelesen**, **gemessen** oder
**eingeschätzt** ist.

Grundlage ist BIMFY auf dem Branch `cde-bimfy` (Tafel unter „Notizen“, Leser in
`client/src/features/cde/services/bimfy/`). Heute wird dort aus jedem XYZ‑Punkt ein eigenes
Bauteil. Für ein paar Schachtdeckel stimmt das. Für ein Geländemodell mit einer Million Punkten
ist es falsch.

---

## 0 · Das Ziel in einem Satz

Eine XYZ‑Datei wird das, was sie ist. Meistens ist das ein **DGM**, das Längsschnitt, Erdbau und
Sampler als Gelände benutzen und das im IFC als `IfcGeographicElement/TERRAIN` ankommt. Seltener
sind es Einzelobjekte, Linien oder Messwerte.

---

## 1 · Was in einer XYZ‑Datei stecken kann

XYZ ist kein Format, sondern eine Spaltenform. Dieselben drei Zahlen pro Zeile können ganz
verschiedene Dinge bedeuten. Die Tabelle ordnet nach Häufigkeit (eingeschätzt, aus der Praxis
im Tiefbau).

| # | Was es ist | Woran man es erkennt | Was daraus werden soll | heute in BIMFY |
|---|---|---|---|---|
| **A** | **DGM‑Raster** der Landesvermessung (DGM1, DGM5 als ASCII) | regelmäßiges Raster, 0,5 bis 5 m Schritt, kein Code, oft über eine Million Punkte je km² | **Gelände** (ausgedünnt) | falsch (Einzelpunkte) |
| **B** | **Geländeaufnahme** des Vermessers | unregelmäßig, Punktnummer und Code, ein paar Tausend Punkte, Codes für Bruchkanten | **Gelände** mit **Bruchkanten** | falsch |
| **C** | **Bestandsaufnahme** mit Punktcode | Codes wie Schachtdeckel, Hydrant, Baum, Laterne, Grenzstein | **Einzelobjekte** je Code | ja |
| **D** | **Linienpunkte** (Bordstein, Gebäudekante, Zaun, Böschungsoberkante) | Code plus Linienkennung oder fortlaufende Nummern | **Züge** je Linie | nein (nur Punkte) |
| **E** | **Kanalaufmaß** | Codes für Deckel und Sohle, Nummern wie die Schächte | Abgleich mit **Schacht/Haltung** (ISYBAU) | teilweise |
| **F** | **Peilung / Bathymetrie** (Gewässersohle) | dichte Punkte in einem Band, Höhen unter dem Ufer | **Gelände unter Wasser**, mit dem DGM zusammengeführt | falsch |
| **G** | **Laserscan / Punktwolke** | sehr dicht, oft Zusatzspalten (Intensität, RGB, Klasse), Häuser und Bäume mit drin | nur die **Bodenpunkte** als Gelände, der Rest ist Bestand | falsch |
| **H** | **Absteck‑ oder Achspunkte** | Stationswerte, Achsnamen | **Trasse** (`IfcAlignment`) oder Annotation | nein |
| **I** | **Wiederholungsmessung** (Setzung, Monitoring) | dieselben Punktnummern mehrfach, mit Datum | **Messwerte am Bauteil** (Zeitreihe), keine Geometrie | nein |
| **J** | **Bohr‑ und Pegelpunkte** | wenige Punkte, Zusatzwerte wie Tiefe oder Wasserstand | Baugrundobjekt (`IfcBorehole` im Schema nachzuschlagen) | nein |
| **K** | **Fest‑ und Höhenpunkte** | wenige Punkte mit Punktart PP, HP | **Bezugssystem**, keine Geometrie | nein |

**Die Antwort auf „was könnte es noch sein“** sind also vor allem C, D und E (das eigentliche
BIMFY‑Gebiet), F und G (auch Gelände, aber mit Vorarbeit) und I bis K (gar keine Geometrie).

---

## 2 · Vorprüfung

| # | Fund | Art | Beleg |
|---|---|---|---|
| **1** | BIMFY liest XYZ heute als Einzelpunkte und warnt erst ab 500 Punkten | Lücke | gelesen: `bimfy/Geometrieleser.js`, `liesPunktliste` |
| **2** | **Gelände kommt in der CDE nur aus gelieferten IFC‑Modellen.** Die Quelle eines Gelände‑Vorgangs ist die GlobalId eines gelieferten Elements, das Raster rechnet `_quellFormVon` aus dessen Netz | Randbedingung | gelesen: `IfcEngine.js` (`holeQuellraster`, `_quellrasterVon`) |
| **3** | **Das Journal speichert Parameter, niemals Netze.** Bei einem DGM sind die Parameter die Punkte selbst, eine Million davon passt nicht in einen Journaleintrag | Randbedingung | gelesen: `Bauteilrezepte.js`, Kopf |
| **4** | Was Gelände ist, entscheidet die **Bauform** `hoehenfeld`, nicht der Klassenname. `IfcGeographicElement` steht in der Vorbelegung | trägt | gelesen: `GelaendeQuelle.js` |
| **5** | Das Paket schreibt bewusst **keine geformte Geländefläche**, weil das ein zweites TERRAIN am selben Ort wäre. Ein importiertes DGM ist aber das **erste** Terrain, also ein anderer Fall | Randbedingung | gelesen: `backend/app/ifc/eigenbau.py`, Abschnitt Böschungskanten |
| **6** | Der Server kennt **erzeugte Container** mit Namensregel (`Verbund_…`, `Erdbau_…`) samt Eignung und Prüftor | trägt | gelesen: `core/cde.py` (`ERZEUGT_MUSTER`) |
| **7** | Das Register kennt `modell, plan, bcf, regelwerk, sonstiges`. Eine `.xyz` landet in `sonstiges` | Lücke | gelesen: `core/cde.py` (`ARTEN`, `ENDUNGEN`) |
| **8** | Es gibt **schon zwei XYZ‑Importer** mit Delaunay, Rasterung und Zellbudget: `flood-2D/middleware/importers/xyzTerrainImporter.js` (465 Zeilen) und `isybau/utils/xyzTerrainImporter.js` (607 Zeilen). Kein Feature importiert aus einem anderen, also droht eine dritte Kopie | Befund | gelesen, Zeilen abgezählt |
| **9** | Vermessungsdaten heißen im Haus `IfcAnnotation/SURVEY`. Ein `IfcSurveyPoint` gibt es im Schema nicht | trägt | gelesen: `eigenbau.py` (nachgeschlagen am gepinnten Schema) |
| **10** | `delaunator` ist schon Abhängigkeit des Clients. Er trianguliert **ohne Zwangskanten** | Randbedingung | gelesen: `client/package.json` |

---

## 3 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Verworfen |
|---|---|---|---|
| **X‑E1** | **Wo lebt ein DGM aus XYZ?** | Als **erzeugtes Modell im Register**: der Server macht aus der Rohdatei `Gelaende_<Name>_R01.ifc` (`IfcGeographicElement/TERRAIN` mit `IfcTriangulatedIrregularNetwork`, Georeferenz aus dem Projekt). Die Rohdatei bleibt als Herkunft im Register (`Quagg_Herkunft`, Dokumentverweis). Danach ist das DGM ein gewöhnliches geliefertes Modell, und Längsschnitt, Erdbau, Verbund und Prüftor funktionieren **ohne Änderung im Client** (Fund 2, 4, 6) | Punkte ins Journal (Fund 3). Ein Netz nur im Browser, das beim nächsten Laden fehlt. Ein eigenes Gelände‑Rezept mit Dateiverweis, das einen zweiten Geländeweg neben dem gelieferten öffnet |
| **X‑E2** | **Wie wird trianguliert?** | **TIN** für Aufnahmen (B), **ausgedünntes TIN** für Raster (A) mit einer Höhentoleranz (Vorschlag 2 cm), damit aus einer Million Punkte einige Zehntausend Dreiecke werden. Bruchkanten kommen in Stufe X5 als Zwangskanten | Ein Raster ins IFC schreiben. Kein Ausdünnen (die Datei wird riesig und der Viewer langsam, eingeschätzt) |
| **X‑E3** | **Wer entscheidet, was die Datei ist?** | BIMFY **schlägt vor** aus Merkmalen (Raster ja/nein, Codes, Anzahl, wiederholte Nummern, Zusatzspalten), der Mensch **bestätigt** einen von drei Wegen: *Gelände*, *Objekte nach Code*, *Linien nach Code*. Nie still | Automatik ohne Rückfrage. Immer nur Einzelpunkte (heute) |
| **X‑E4** | **Lage und Höhe** | XYZ trägt kein Bezugssystem. Es gilt das **des Projekts** (EPSG und Höhensystem aus `bezugssysteme.py`), und die Tafel zeigt es vor dem Anlegen an. Spaltenfolge wie heute (Rechts/Hoch erkannt und gemeldet) | Raten aus den Zahlen |
| **X‑E5** | **Wo wohnt der gemeinsame XYZ‑Leser?** | Für das Gelände **auf dem Server** (Python, `app/ifc`), damit es eine Rechnung für alle gibt. Die beiden Client‑Importer (Fund 8) bleiben, wo sie sind, bis Fabio einen gemeinsamen Ort für Geodaten festlegt | Eine dritte Kopie im CDE‑Feature |
| **X‑E6** | **Zuschnitt** | Optional ein Umriss (Projektgebiet), der vor dem Triangulieren schneidet. Den Umriss liefert BIMFY schon (DXF, GeoJSON) | Immer die ganze Kachel |

---

## 4 · Stufen

Jede Stufe beginnt mit einer Zahl von heute und endet mit derselben Zahl danach.

### X0 · Messen mit echten Dateien

Drei echte Dateien in `client/testdata-local/` (nicht ins Repo): eine **DGM1‑Kachel** vom
Landesamt, eine **Geländeaufnahme mit Codes**, eine **Bestandsvermessung**. Gemessen wird je
Datei: Punktzahl, Raster ja/nein und Schritt, Zahl der Codes, Lesezeit in BIMFY heute.

*Ergebnis:* eine Tabelle in diesem Dokument. Ohne diese Dateien bleiben die Schwellen unten
eingeschätzt.

### X1 · Erkennen (Client, rein)

Neues Modul `services/bimfy/Punktanalyse.js`. Es liefert Anzahl, Ausdehnung, Raster (Schritt oder
null), Codes mit Häufigkeit, wiederholte Nummern, Zusatzspalten und einen **Vorschlag** A bis K
mit einem Satz Begründung. BIMFY zeigt den Vorschlag und die drei Wege (X‑E3).

*Messung:* jede der drei Dateien aus X0 bekommt den richtigen Vorschlag. Gegenprobe mit einer
verfälschten Rasterweite.

### X2 · Gelände auf dem Server

`cli.py gelaende` in der IFC‑Umgebung. Rohdatei lesen, ausdünnen (X‑E2), triangulieren, als
IFC 4.3 schreiben (`IfcGeographicElement/TERRAIN`, `IfcTriangulatedIrregularNetwork`,
`IfcMapConversion` aus dem Projekt), Herkunft auf die Rohdatei setzen. Das Register lernt
`Gelaende_…_Rnn.ifc` in `ERZEUGT_MUSTER` und `EIGNUNG`. Das Prüftor läuft über das Ergebnis.

*Achtung:* `backend/app/ifc/*` wirkt sofort, Server‑Module erst nach `pm2 restart quagg-api`
und nur mit Fabios OK.

*Messung:* DGM1‑Kachel → Dreiecke, größte Höhenabweichung zu den Rohpunkten ≤ Toleranz, Prüftor
ohne Fehler, Dateigröße.

### X3 · Der Weg aus BIMFY

„Als Gelände anlegen“ lädt die Rohdatei ins Register und startet den Auftrag (`AuftragApi`).
Das fertige Modell wird geladen wie jedes andere.

*Messung:* Längsschnitt über eine Haltung zeigt die Geländelinie aus dem importierten DGM. Ein
Aushub darauf liefert eine Menge.

### X4 · Objekte und Linien nach Code

Eine **Codeliste je Projekt** (Stammdaten): Code → Objekt (Rezept und Klasse) oder Code →
Linie. Linien entstehen aus Code plus Linienkennung oder aus fortlaufenden Nummern. Das ist der
Fall C und D und braucht keinen Server.

*Messung:* Bestandsvermessung aus X0 → Zahl der Bordsteinlinien gleich der im Plan des
Vermessers.

### X5 · Bruchkanten

Linien mit Bruchkanten‑Code und Bruchkanten aus DXF gehen als Zwangskanten in die
Triangulation (Server, X2). Im IFC tragen die Dreiecke die Kantenflags.

*Messung:* an einer Böschungsoberkante liegt keine Dreieckskante quer zur Bruchkante.

### X6 · Sonderfälle, je nach Bedarf

Peilung und DGM zu einem Gelände zusammenführen (F). Laserscan nur mit Bodenklasse, eher aus
LAS/LAZ als aus XYZ (G). Wiederholungsmessungen als Messwerte am Bauteil (I). Bohrpunkte (J),
die Klasse wird vorher im Schema nachgeschlagen.

---

## 5 · Offene Fragen an Fabio

1. Welche Dateien bekommst du **wirklich**? Drei Beispiele reichen für X0.
2. Gibt es eine **Codeliste** deines Vermessers (oder eine Hausliste)?
3. **X‑E1**: soll das DGM ein eigenes Modell im Register werden? Davon hängt alles Weitere ab.
4. **X‑E5**: wo sollen Geodaten‑Leser künftig wohnen, wenn drei Features sie brauchen?

---

## 6 · Leitplanken

1. Erst messen, dann bauen.
2. Kein zweiter Geländeweg. Ein DGM aus XYZ ist danach ein geliefertes Gelände wie jedes andere.
3. Kein Netz im Journal.
4. Der Mensch bestätigt, was eine Datei ist.
5. `backend/app/ifc/*` wirkt sofort, ein Commit je Stufe mit Test und Gegenprobe.
6. Kein Build, kein pm2 ohne Zuruf.
