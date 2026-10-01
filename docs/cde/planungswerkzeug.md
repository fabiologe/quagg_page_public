# Das Planungs- und Bearbeitungswerkzeug der Quagg-CDE

Stand 2026-10-01. Alle Zahlen zur Laufzeit gemessen (`npx vite-node`), nicht
geschätzt. Pfade relativ zu `client/src/features/cde/`.

---

## 0 · Was es ist — und was es nicht ist

Die Quagg-CDE ist **kein Betrachter mit Anmerkungsfunktion**. Sie ist ein
Planungswerkzeug, in dem eigene Bauteile entstehen, aus dem ein geprüftes
IFC4X3_ADD2 herausfällt, und das dabei die Lieferungen fremder Planer als
Grundlage mitführt.

Sie ist auch **kein CAD**. Ein CAD zeichnet Geometrie. Dieses Werkzeug schreibt
**Absichten** auf, und die Geometrie entsteht bei jedem Aufbau neu:

```
   Absicht          Wahrheit             Ergebnis            Bild
   ┌────────┐      ┌─────────┐         ┌──────────┐       ┌────────┐
   │Kommando│─────▶│ Journal │────────▶│ Aufbau   │──────▶│Anzeige │
   └────────┘      └─────────┘         └──────────┘       └────────┘
    was der          Zustand je          Rezept +           fragments
    Planer will      Bauteil,            Quelle →           im Browser
    (ein Wert)       absolut             Geometrie
         │                │                   │
         │                │                   └─ wird NIE gespeichert
         │                └─ Vorher/Nachher, ein Vorgang = ein Undo
         └─ Beleg am ersten Eintrag des Vorgangs
```

Der Unterschied ist nicht akademisch. Er bedeutet: **senkt jemand ein Planum um
einen Meter, ändern sich Aushubmassen, Grabenbreite, Überdeckungsbefund und
Verfüllung von selbst** — weil nichts davon je ein gespeicherter Wert war.

---

## 1 · Der eine Weg

Es gibt **genau eine Naht** zwischen Oberfläche und Modell: das Kommando.
Seit Teil XXIV läuft jede Bearbeitung — auch die aus Längsschnitt,
Merkmalsfenster und Cockpit — über `fuehreAus(kommando)`.

Eine **Ratsche** hält das: `test/planKommandos.test.js` liest den Quelltext und
verlangt, dass **jeder** Aufruf von `eintragenVorgang` ein `kommando` nennt.
Ausnahmen in Produktionscode: **keine** (gemessen 2026-10-01; die einzige
verbleibende Stelle ist der Test-Helfer `eintragen` in `useAenderungen.js`, und
ein zweiter Test hält fest, dass Produktionscode ihn nicht ruft).

### Das Kommando

```js
{
  schema: 1,                       // Pflicht; unbekanntes Schema wird abgelehnt
  id: 'k-…',                       // diese Absicht, einmalig
  werkzeug: 'rohr-zeichnen',       // Muster + Operation + Katalogeintrag
  ziel: ['<GlobalId>'],            // nie ein Index, nie ein Name  (E3)
  neu:  ['cde-…'],                 // der AUFRUFER vergibt Kennungen (E2)
  werte: { dn: 300, hoehe: 290.0 },// absolut: Ost/Nord, Höhen in m NN  (O1)
  eingaben: { zug: [...], auswahl: {...}, punkt: { station: 12.4 } },
  wer: '…', wann: '…'
}
```

Vier Gesetze stecken darin, und jedes hat einen Grund:

| Gesetz | warum |
|---|---|
| **Ziele sind GlobalIds** | ein Index verschiebt sich, wenn ein anderer Planer eine Haltung einfügt. Eine Kennung nicht |
| **Werte sind absolut** | Idempotenz: dasselbe Kommando zweimal ausgeführt ergibt denselben Zustand. Ein Delta tut das nicht |
| **Der Aufrufer vergibt Kennungen** | sonst gibt es kein Skript, kein deterministisches Redo, und ein Folgekommando kann sein Ziel nicht nennen |
| **Berechnetes steht nie im Kommando** | ein gespeichertes Gefälle wäre nach der nächsten Sohlhöhenänderung eine Lüge |

### Was abgelehnt wird — und was nicht

Nur **technisch Unmögliches** wird abgelehnt: unbekanntes Schema, fehlendes
Werkzeug, fehlendes Ziel, Zyklus in den Quellen. Eine **Fachgrenze lehnt nie
ab** — DN 5000 wird gezeichnet und als `wert_ausserhalb` markiert. Fabios Regel
dazu steht im Code: „beraten, nicht verbieten".

Das ist der Unterschied zwischen einem Werkzeug, das man benutzen kann, und
einem, das man überlistet.

---

## 2 · Die sechs Begriffe

Alles, was das Werkzeug kann, besteht aus sechs Dingen. Wer sie kennt, kann es
erweitern, ohne Code zu schreiben — meistens.

### ① Bauform — als welche Form darf ich es schreiben?

Acht, abgeschlossen (`services/bauform/Bauformen.js`). Jede nennt, welche Form
der Leser liefern muss, damit sie trägt:

| Bauform | Beschreibung | Beispiele | braucht |
|---|---|---|---|
| `punkt` | Ort (+ Drehung) | Baum, Schild, Leuchte | — |
| `linie` | Kurve ohne Querschnitt | Trasse, Bruchkante, Grenze | `axis` |
| `achse+profil` | Querschnitt entlang einer Kurve | Rohr, Kanal, Träger, Bordstein | `axis` |
| `flaeche` | Region ohne Dicke | Baufeld, Flurstück, Aushubpolygon | `surface` |
| `flaeche+dicke` | ebene Fläche mit Stärke | **Wand, Decke, Platte, Fundament** | `solid` |
| `hoehenfeld` | 2,5D-Oberfläche | Gelände, Planum, Aushubsohle | `surface` |
| `koerper` | Volumen an einem Ort | Schacht, Pumpe, Armatur | `solid` |
| `netz` | passt in keine andere — nur generische Operationen | alles Übrige | — |

Dazu eine **Güte** (`gemessen · geschaetzt · unbekannt`): eine Operation nennt
ihre Mindestgüte, und was darunter liegt, wird nicht angeboten — statt auf
schlechten Daten still Unsinn zu rechnen.

### ② Rezept — woraus entsteht die Geometrie?

Sieben, davon sechs als **reine Daten** (`services/rezept/Eingebaut.js`):

| Rezept | Geometrieart | Bauform | Netzrolle |
|---|---|---|---|
| `linie` | `band` | `linie` | — |
| `flaeche` | `flaeche` | `flaeche` | — |
| `rohr` | `sweep` (Kreisprofil aus `dn`) | `achse+profil` | `kante` |
| `schacht` | `sweep`/Körper | `koerper` | `knoten` |
| `pfosten` | `stab` | `punkt` | — |
| `platte` | `platte` | `flaeche+dicke` | — |
| `gelaende` | Code (Altbestand) | `hoehenfeld` | — |

Ein Rezept ist eine Deklaration, keine Funktion:

```js
{ id: 'rohr', titel, icon, bauform: 'achse+profil', felder, netzrolle: 'kante',
  geometrie: { art: 'sweep', profil: { art: 'kreis', mass: 'dn', einheit: 'mm' } } }
```

`JSON.parse(JSON.stringify(deklaration))` baut dieselbe Geometrie — das ist der
Beweis, dass es Daten sind, und er steht als Test.

### ③ Eigenschaftsart — was HAT ein Bauteil?

Drei, und bewusst nur drei (`services/eigenschaften/Eigenschaftsarten.js`):

| Art | Text |
|---|---|
| `achse` | „eine Linie, entlang der sich stationieren lässt" |
| `netzrolle:knoten\|kante` | „Knoten oder Kante eines Netzes" |
| `mass:<rolle>` | „eine Grösse, die der Typ benennt (Rolle im Typprofil)" |

**Hier liegt die wichtigste Regel des ganzen Werkzeugs:** ein Werkzeug fragt
nie, was ein Bauteil **ist**, sondern was es **hat**.

```js
// so nicht:   if (kategorie === 'IFCPIPESEGMENT') …
// so:         braucht: ['achse', 'netzrolle:kante']
```
Folge: „Haltung teilen" funktioniert an einem ProVI-Proxy, an einem gelieferten
`IfcFlowSegment` und an einem selbst gezeichneten Rechteckkanal aus der
Bibliothek — ohne dass eine Datei einen davon beim Namen kennt. Und wo es
*nicht* geht, sagt `warumNicht` **welche Eigenschaft fehlt**, nicht nur „geht
nicht".

Ein Test hält fest, dass **jede Art einen Nutzer hat**. Vier weitere Arten
(`lage`, `profil`, `anschluesse`, `material`) wurden erwogen und **nicht
gebaut** — keine Operation fragt danach, sie wären Abstraktion auf Vorrat.

### ④ Werkzeug — Muster + Operation + Katalogeintrag

**64 Werkzeuge**, zur Laufzeit gezählt, in sechs Gruppen:

| Gruppe | Anzahl | was |
|---|---|---|
| `lage` | 25 | verschieben, drehen, spiegeln, kopieren, Reihe, Stützpunkt, Netztopologie (teilen, einfügen, entfernen, anschließen, Strang …) |
| `parametrik` | 12 | DN, Sohlhöhen, Deckelhöhe, Profilform, Stärke, Bezugshöhe, Fließrichtung … |
| `gelaende` | 11 | ausheben, auffüllen, Planum, Böschung, Gerinne, Ecken/Maße ziehen |
| `merkmale` | 8 | KG, DIN 277, Maßnahme, Merkmalssatz, umbenennen, Bauform auslegen |
| `erzeugen` | 6 | je Rezept ein Zeichenwerkzeug |
| `blatt` | 2 | Planinhalt, Rotstift |

**Kein Werkzeug ist handgeschrieben** — der Wächter W7 zählt „rückführbar, aber
handgeschrieben" und steht auf **0**. Jedes entsteht aus
- einem **Muster** (Eingabeschlitz: `subjekt` · `zug` · `umriss`, Gesten
  `tippen · punkt · auswahl · griff`) — fachblind, kennt kein Bauteil,
- einer **Operation** (was geschieht: setzen, zeichnen, Gelände formen, …),
- einem **Katalogeintrag** (Rezept, Geländeoperation, Setzer-Deklaration).

Deshalb kostet ein neues Bauteil aus der Bibliothek **kein Werkzeug**: es bekommt
sein Zeichenwerkzeug und seine Setzer von selbst.

### ⑤ Geländeoperation — wie wird geformt?

Sieben, als Registry mit Fähigkeiten (`services/gelaende/Operationen.js`):

| Operation | was |
|---|---|
| `grube` | Umriss auf GOK, Böschung fällt nach innen zur Sohle — nur schneiden |
| `schuettung` | Umriss auf GOK, steigt nach innen zur Zielhöhe — nur füllen |
| `planum` | ebene Fläche auf einer Höhe |
| `boeschung` | Ring, Krone nach außen |
| `boeschungLinie` | offene Linie, eine Seite, 1:n bis zum Gelände |
| `gerinne` | Trapezprofil entlang einer Achse, stationsweise |
| `baugrube` | Sohle + Arbeitsraum + Böschungswinkel |

Jeder Eintrag trägt rund 20 Fähigkeiten (`wende`, `wirkbereich`, `wirkflaeche`,
`kennweiten`, `hoehenfelder`, `punktfelder`, `flaeche`, `innen`, `ecken`,
`setzbar`, `querschnitt`, `profilbahn`, `cutTyp`/`fillTyp`, `vorschau`,
`werkzeug` …). **Kein Op-Name steht in einer Verzweigung** — Wächter W2 zählt
sie und steht auf 0 (von 38 vor dem Umbau).

Das Ziel einer Operation löst seit 2026-09-20 **ein** Auflöser auf
(`services/gelaende/Sollhoehe.js`): `hoehe · ur · flaeche`. Eine neue Zielart
kostet dort eine Zeile und in keiner Operation etwas.

### ⑥ Ableitung — was rechnet sich von selbst?

Fünf (`services/ableitung/Ableitungen.js`), und sie sind bewusst **Code**, nicht
Katalog:

| Ableitung | aus | macht |
|---|---|---|
| `erdbau` | Gelände + Operationen | Aushub (Cut), Auftrag (Fill), Massen je Vorgang |
| `kanalgraben` | Rohre + Schächte + Gelände | Graben, Bettung, Verfüllung, Überdeckungsbefund |
| `bauwerksgrube` | Bauteil + Gelände | Baugrube samt Arbeitsraum und Böschung |
| `aussparung` | Bauwerk + Werkzeug | Durchbruch als `IfcOpeningElement` |
| `anzeige` | Gelände + alle Vorgänge | das geformte Gelände fürs Bild — **kein Bauteil, nicht im Export** |

Alle laufen über einen **Erdbau-Stapel**: Vorgang *i* wird über alle Vorgänger
gefaltet. Deshalb ändert eine Planumsänderung die Massen jedes späteren
Vorgangs, und deshalb ist die Reihenfolge der Vorgänge eine Planerentscheidung,
die im Journal steht.

---

## 3 · Was dafür sorgt, dass es morgen noch wartbar ist

### Sechs Schichten, eine Richtung

```
L5  Oberfläche        components/ · composables/ · views/
L4  Anzeige           IfcEngine · IfcAutor · IfcViewer · GelaendeKanten
L3  Journal & Werkz.  stores/ · services/kommando/ · Bearbeitungen · Griffe
L2  Katalog           Bauteilrezepte · ableitung/ · rezept/ · katalog/ · Bibliothek
L1  Fachregeln        gelaende/ · bauform/ · eigenschaften/ · regeln/
L0  Kern              geometrie/ — Knoten, Verbindungen, Flächen, Körper
```

**Importe gehen nur nach unten.** `Sollhoehe.js` (L1) kennt die Registry nicht —
die Fläche einer anderen Operation wird ihm hereingereicht. Das klingt umständlich
und ist der Grund, warum man eine neue Zielart in einer Datei ergänzt.

### Zehn Wächter, die nur schrumpfen dürfen

`test/architekturWaechter.test.js` führt je Regel eine Ausnahmeliste mit den
heutigen Verstößen. Jeder Umbau streicht Einträge; ein **neuer** Verstoß macht
den Test rot. Die Zahlen unten sind am 2026-10-01 gemessen
(`ARCHITEKTUR_MESSEN=… npx vitest run …/architekturWaechter.test.js`, 34 Tests grün),
nicht aus den Etappenberichten übernommen.

| | misst | heute |
|---|---|---|
| W1 / W1b / W1c | Importe nach oben, Durchgriff, Rezept-Interna | 0 / 2 / 0 |
| W2 | Op-Namen in Verzweigungen | **0** (von 38) |
| W3 / W3b | Rezeptnamen in Verzweigungen, Netzrezept-Schreiber | 0 / 0 |
| W4 | Kernel-Umgehung | 0 |
| W5 | Code-Hooks in Werkzeugen und Rezepten | 34 / 2 |
| W6 | Fachwörter in der Musterschicht | **0** (von 21) |
| W7 | jedes Werkzeug ist auf Muster + Operation + Katalog rückführbar | **0 handgeschrieben**, 33 aus Daten, 28 sauber eingeordnet, 3 nicht rückführbar (die Ableitungen — so entschieden, E1) |
| W8 | Normwerte außerhalb einer Regeltabelle | **0** |
| W9 | Subjektvertrag | — |
| W10 | Importkreise | 0 |

W8 ist der unterschätzte: **jede Norm-Zahl steht im Regelwerk, nicht im Code** —
Mindestgefälle (1:DN als benannte Formel), Mindestüberdeckung 0,8 m (DIN EN
1610), Grabenbreiten (DIN EN 1610 Tab. 1/2), Böschungswinkel (DIN 4124),
Netztoleranz. Jede mit Quellenangabe, jede durch Büro- oder Projektebene
überschreibbar (`Projekt > Büro > eingebaut`).

### Die Hausgesetze

1. **Ein Vorgang = eine Absicht = ein Undo-Schritt.** Ganz oder gar nicht,
   einmal gesichert, bei Fehler alles zurück.
2. **GUID, nie Index.**
3. **Absolut, nie Delta.**
4. **Rezept statt Ergebnis** — im Journal steht nie ein Netz, nie ein Raster.
5. **Markieren statt ablehnen** bei allem Fachlichen.
6. **„Erledigt" heißt nachgeprüft** — eine Zahl vorher und eine nachher, nicht
   „Tests grün".
7. **Eine Regel und ihre Kur messen dieselbe Größe.** Sonst meldet die Kur
   Erfolg, und der Befund steht weiter.
8. **Jedes Wissen an einem Ort.** Zwei Orte für dieselbe Zahl sind ein Befund,
   auch wenn beide stimmen.

### Bedienung mit dem Finger

Vier Regeln, am iPad gemessen: ein Tipp öffnet, **erst der Zug schreibt**;
Greifpunkte skalieren mit dem Zoom; Langdruck statt Rechtsklick; kein
Schreibvorgang ohne ausdrückliches „Übernehmen".

---

## 4 · Wie man es erweitert — der Entscheidungsbaum

```
Was willst du hinzufügen?
│
├─ Ein neues BAUTEIL (Leitpfosten, Rechteckkanal, Bordstein)
│  └─▶ KATALOGEINTRAG. Rezept-Deklaration als JSON ins Büro- oder
│      Projekt-Repo. Zeichenwerkzeug, Setzer, Plansymbol, Längsschnitt
│      und Netzwerkzeuge kommen von selbst.          ►  KEIN CODE
│
├─ Eine neue GELÄNDEOPERATION (Rampe, Mulde)
│  └─▶ REGISTRY-EINTRAG in Operationen.js: Fähigkeiten als Funktionen.
│      Werkzeug, Wirkbereich, Korridor-Feinheit, Vorschau, Griffe und
│      Kennhöhen entstehen daraus.                   ►  EIN Eintrag
│
├─ Eine neue ZIELART (bis zu einer gelieferten Fläche)
│  └─▶ EINE ZEILE in Sollhoehe.js ZIELARTEN. Keine Operation ändert sich.
│
├─ Eine neue NORM-ZAHL oder Regel
│  └─▶ REGELWERK (regeln/Regelwerk.js oder Repo-Schlüssel `regelwerk`),
│      mit Quellenangabe. Nie eine Konstante im Code.  ►  KEIN CODE
│
├─ Ein neues MERKMAL an Bauteilen
│  └─▶ TYPPROFIL (Rolle) oder Pset-Vorlage. Das Setz-Werkzeug entsteht
│      aus `setzbar: true` am Feld.
│
├─ Eine neue ABLEITUNG (etwas rechnet sich aus anderem)
│  └─▶ CODE in services/ableitung/. So entschieden (E1, Teil XXIII):
│      Ableitungen tragen Algorithmen, keine Tabellen.
│
└─ Ein neues BAUWERK aus mehreren Bauteilen (Regenüberlaufbecken)
   └─▶ CODE — und zwar der, der bewusst aufgeschoben wurde:
       IfcRelAggregates, IfcFacility, IfcSpace.
       Siehe  ►  ifc-sonderbauwerk.md, Abschnitt 4
```

**Die Regel dahinter:** Katalogarbeit ist billig und sicher, Kernarbeit ist teuer
und muss begründet werden. Wird bei einer Aufgabe, die Katalogarbeit sein
sollte, Code nötig, **ist das ein Befund** — nicht etwas, das man
stillschweigend miterledigt.

---

## 5 · Was es heute nicht kann

Ehrlich, ohne Beschönigung:

| | fehlt | Folge |
|---|---|---|
| **1** | **Zusammengesetzte Bauwerke** — `IfcRelAggregates`, `IfcFacility`, `IfcSpace` | Alles liegt flach unter einer `IfcSite`. Ein Sonderbauwerk ist nicht modellierbar → [ifc-sonderbauwerk.md](ifc-sonderbauwerk.md) |
| **2** | **Wandrezept** (Linie + Dicke + Höhe, Oberkante in NN) | `platte` ist waagerecht, `pfosten` ein Stab. Keine Beckenwand, keine Stützwand. Als `sweep` mit Rechteckprofil — plus **eine Zeile Kern**, weil ein Sweep ohne Netzrolle seinen Höhenbezug nicht kennt (Fahrplan XXVI, Fund 3) |
| **3** | **Bewehrung, Schalung, Fugen** | Mengen für Ortbeton bleiben Beton-m³ und Schalungs-m² aus `Qto_…BaseQuantities`; Bewehrungslisten gar nicht |
| **4** | **Ports / hydraulische Topologie** | Das Netz entsteht aus Koinzidenz (Toleranz aus dem Regelwerk) plus deklariertem Anschluss. Für verzweigte Sonderbauwerke zu grob |
| **5** | **Bauablauf, Zeit (4D)** | Vorgänge haben eine Reihenfolge, aber kein Datum und keine Dauer |
| **6** | **Rezept-Editor in der Oberfläche** | Ein neues Bauteil heißt heute: JSON-Datei ins Repo. Bewusst so, bis jemand den Editor braucht |
| **7** | **Freiform** | `netz` kennt nur generische Operationen. Kein NURBS, keine Verschneidung im Browser (fragments kann keine Booleans — Verschneidung läuft auf dem Server) |
| **8** | **Mehrbenutzer-Zusammenführung** | Gleichzeitige Bearbeiter werden erkannt und **gesperrt**, nicht zusammengeführt. Der Drei-Wege-Vergleich arbeitet gegen Lieferrevisionen, nicht gegen Kollegen |

---

## Siehe auch

- [mussleistungen.md](mussleistungen.md) — was eine CDE können muss, Soll/Ist
- [planungsszenarien.md](planungsszenarien.md) — konkrete Fälle, an denen die Entwicklung sich ausrichtet
- [ifc-sonderbauwerk.md](ifc-sonderbauwerk.md) — zusammengesetzte Bauwerke in IFC
- [kommando/kommandodefinition.md](kommando/kommandodefinition.md) — das Kommandoschema, angenommen 2026-09-18
- [kommando/README.md](kommando/README.md) — Aufträge, Audits, Durchstiche von Teil XXIV
