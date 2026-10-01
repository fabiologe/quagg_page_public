# Teil XXVI — Bauwerke aus Bauteilen

**Fahrplan, Stand 2026-10-01. Geplant, nicht gebaut.** Halt nach diesem Dokument;
gebaut wird erst nach Freigabe der Entscheidungen E17–E23.

Grundlage: [planungsszenarien.md](planungsszenarien.md) (P5–P8) und
[ifc-sonderbauwerk.md](ifc-sonderbauwerk.md) (Fähigkeiten S1–S8). Pfade relativ
zum Repo. Jede Zahl unter „gemessen" stammt aus einer Probe am 2026-10-01, nicht
aus einem Etappenbericht.

---

## 0 · Das Ziel in einem Satz

**Ein Bauwerk aus mehreren Bauteilen — Bodenplatte, Wände, Decke und der Raum
dazwischen — lässt sich nur über Kommandos anlegen und kommt als ein IFC heraus,
in dem es als Bauwerk erkennbar ist, dessen Mengen stimmen und das Prüftor und
hauseigene IDS ohne Befund bestehen.**

Der Abnahmefall ist die **Kammer** aus Abschnitt 6, nicht das Regenüberlaufbecken.
Warum, steht in Abschnitt 2.

---

## 1 · Vorprüfung — sieben Funde

Bevor geplant wird, wo etwas fehlt, gemessen, was da ist.

| # | Fund | Art | Beleg |
|---|---|---|---|
| **1** | **Raumelemente gelten als schreibbar — und der Schreiber macht daraus eine schemawidrige Datei.** `istSchreibbar` nimmt jede konkrete `IfcProduct`-Klasse: `IFCSPACE`, `IFCFACILITY`, `IFCFACILITYPARTCOMMON`, `IFCBUILDING`, sogar `IFCSITE` → `true`. Eine Platte mit Kategorie `IFCSPACE` besteht `pruefeBauplan` mit **0** Fehlern. Der Schreiber hängt alles in `IfcRelContainedInSpatialStructure`. | **Fehler, heute** | gemessen: dieselbe Probe als `IFCSLAB` → 0 Regelverstöße, als `IFCSPACE` → **2**: `IfcRelContainedInSpatialStructure.WR31` und `IfcSpatialStructureElement.WR41`. Das Prüftor fängt es (Schemastufe) — aber erst beim Ausgeben, nicht beim Zeichnen. Zwei Orte entscheiden „schreibbar" verschieden |
| **2** | **Der Eigenbau schreibt keinen einzigen bSI-Merkmalssatz.** Eine eigene Platte verfehlt die hauseigene IDS. | **Fehler, heute** | gemessen: Probe-Platte gegen `quagg-starter.ids` → **1 von 18** verfehlt, „Decken — Tragend markiert", 0 von 1 Elementen. `grep Pset_…Common eigenbau.py` = 0. Eine Wand verfehlte zwei Regeln (`IsExternal`, in der IDS als „Fehler" geführt; `LoadBearing`) |
| **3** | **Das Wandrezept ist keine reine Deklaration** — anders als heute früh in drei Dokumenten behauptet. `versatzV` ist eine Zahl oder ein Feldname, kein Ausdruck wie `−hoehe/2`. Angehoben wird ein Sweep nur bei `parameter.achsbezug === 'sohle'` (`Rezeptbau._koerper`), und den schreibt nur eine Netzkante. Eine Wand ohne Netzrolle stünde mit ihrer halben Höhe im Boden | Lücke | gelesen: `services/rezept/Rezeptbau.js` (`_koerper`, `_sohlen`, `PROFIL_ARTEN`) |
| **4** | **Ein Bauwerk passt nicht ins Paket.** Jedes Paket-Bauteil braucht ≥ 3 Punkte und Dreiecke, sonst „ohne Geometrie" übersprungen (`eigenbau.baue_datei`, `EigenbauPaket.bauteilFuersPaket` gibt `null`). Ein Behälter ohne eigenen Körper — eine `IfcFacility` — hat keinen Weg in die Datei | Lücke | gelesen |
| **5** | **Eigene Bauteile tragen keine Mengen.** Nur Ableitungen deklarieren `menge` (Aushub, Auftrag, Verfüllung); `mengenVon` liest sie aus Kennzahlen. Platte, Rohr, Schacht, Pfosten kommen **ohne** `Qto_…BaseQuantities` ins IFC — „Betonmenge je Bauteil" ist heute nicht ausgebbar | Lücke | gelesen: `Ableitungen.js` (5 `menge:`-Stellen), `Eingebaut.js` (0) |
| **6** | **Das Prüftor zählt eine Zerlegung als Einordnung, prüft aber die Doppelzählung nicht.** V07 nimmt jedes Element in irgendeiner `IfcRelAggregates` als „eingeordnet". Steht ein Teil zusätzlich selbst in der Raumgliederung, zählt die Bodenplatte zweimal — und V07 schweigt | Lücke im Tor | gelesen: `pruefe.py` V07 |
| **7** | **Der Verbund trägt eine tiefere Gliederung schon.** `_site_aufloesen` hängt *jeden* Verweis auf die aufgelöste Eigenbau-Site an die Verbund-Site um („die Gliederung der Lieferung unterhalb der Site bleibt erhalten"). Eine `IfcFacility` unter der Eigenbau-Site überlebt den Verbund | **trägt** | gelesen, **nicht gemessen** — Z5 macht einen Test daraus |

Und zwei Dinge, die schon richtig bereitliegen: `schema.py` hat
`ist_untertyp(name, wurzel)` und `vorlagen_fuer(klasse, predefined)` — die beiden
Schemafragen dieses Teils („ist das ein Raumelement?", „gibt es diesen
Merkmalssatz für diese Klasse?") haben ihren Ort schon. Und `platte` darf laut
Katalogschema `richtung: 'oben'` — **der Raum ist geometrisch eine reine
Deklaration**, nur sein Schreiben ist Kernarbeit.

---

## 2 · Zwei Korrekturen an der Doku von heute früh

Beides ist mit diesem Fahrplan in den Dateien schon nachgezogen (je mit dem
Vermerk „korrigiert 2026-10-01“); hier steht, warum.

**Korrektur 1 — das Wandrezept kostet Kernarbeit.** `planungsszenarien.md` (P5),
`ifc-sonderbauwerk.md` (S4) und `planungswerkzeug.md` (Abschn. 5) sagen „eine
Deklaration, kein Code". Das stimmt nicht (Fund 3). Es kostet **wenig** Kern —
die kleinste Kur verwendet den vorhandenen Mechanismus wieder: eine Deklaration
darf ihren Höhenbezug **fest** nennen (`geometrie.achsbezug: 'sohle'`), und
`_koerper` liest `parameter.achsbezug ?? geo.achsbezug`. Kein neuer Mechanismus,
eine Zeile Lesen, eine Zeile Katalogschema. Aber es ist Kern, und so muss es
heißen.

**Korrektur 2 — der Durchstich ist nicht das Schachtbauwerk P6.** Heute früh
empfohlen, weil ein Schacht „vier Teile und einen Raum" hat. Übersehen: **ein
Schacht ist ein Netzknoten** (`netzrolle: 'knoten'`), an ihm hängen Haltungen,
Anschlüsse, Sohlhöhen, der Längsschnitt. Wird er zum Bauwerk aus Teilen, muss
erst entschieden werden, *welches* Objekt der Knoten ist — das Ganze ohne
Körper oder eines seiner Teile. Diese Frage hat mit Zerlegung nichts zu tun und
würde den Durchstich mit einem zweiten Problem belasten. **Der Durchstich ist
deshalb eine Kammer ohne Netzrolle** (Abschnitt 6): sechs Teile, ein Raum, jede
Zahl von Hand nachrechenbar. Der Schacht kommt danach (E21).

---

## 3 · Entscheidungen vor dem Bauen

Nummeriert ab E17 (Teil XXV endete bei E16). Jede mit Empfehlung; **Freigabe ohne
Gegenrede heißt: die Empfehlungen gelten.**

| # | Frage | Empfehlung | Alternative und warum nicht |
|---|---|---|---|
| **E17** | **Wo steht, wozu ein Teil gehört?** | **Am Teil**, als `parameter.teilVon: '<GlobalId>'` — ein Wert, keine Liste. **Die Schemaregel wird so zur Bauart:** `Decomposes` und `ContainedInStructure` sind beide `SET [0:1]`; ein Feld mit *einem* Wert kann gar nicht zwei Ganze nennen | Das Bauwerk listet seine Teile. Dann kann ein Teil in zwei Listen stehen (verletzt [0:1] still), eine gelöschte Wand bleibt als tote Kennung in der Liste stehen, und jedes Hinzufügen schreibt das Ganze neu — Mehrbenutzer-Konflikte am falschen Objekt |
| **E18** | **Was ist ein Bauwerk im Journal?** | **Ein eigenes Subjekt** mit eigener GlobalId (`cde-…`, vom Aufrufer vergeben, E2) und eigenem Bauplan ohne Geometrie: Rezept `bauwerk`, neue Geometrieart `keine`, Felder `name`, `art`, `klassifikation`. Es trägt, was dem Ganzen gehört (Name, Bauwerkstyp, später Fachmerkmale) | Nur ein Name an jedem Teil, kein eigenes Subjekt. Verworfen: der Name stünde N-mal da — **eine Kopie, die altern kann**, genau die Sorte, die Teil XXIV-4 gerade beseitigt hat |
| **E19** | **Welche IFC-Gestalt hat das Ganze?** | **Zwei Arten**, im Bauplan als `art`: `anlage` → `IfcFacility` (räumlich; Teile werden **enthalten**, `IfcRelContainedInSpatialStructure`) · `baugruppe` → `IfcElementAssembly/USERDEFINED` (Element; Teile werden **zerlegt**, `IfcRelAggregates`, die Baugruppe wird enthalten). Welche Beziehung zu schreiben ist, entscheidet der **Schreiber** aus dem Schema (`ist_untertyp(klasse, 'IfcSpatialElement')`) — nicht der Client | Nur `IfcElementAssembly`. Hätte für ein Becken keinen passenden PredefinedType (alle 30 stammen aus Brücken- und Bahnbau) und keinen Ort für Räume — ein `IfcSpace` kann nur unter einem Raumelement hängen (WR41) |
| **E20** | **Höhenbezug der Wand** | **Fußlinie:** die gezeichnete Linie ist die Unterkante (y in m NN), die Höhe geht nach oben. Umgesetzt als festes `geometrie.achsbezug: 'sohle'` — derselbe Mechanismus wie bei der Haltung. Im Tiefbau steht die Wand auf der Bodenplatte; deren Oberkante ist die natürliche Zeichenhöhe | Oberkante zeichnen, Höhe nach unten (wie `platte`). Dann folgt eine Wand nicht, wenn die Bodenplatte sich ändert — aber auch die Fußlinie folgt nicht von selbst. Beides ist eine absolute Zahl; die Fußlinie ist die, die der Planer kennt |
| **E21** | **Wird ein Schacht zum Bauwerk aus Teilen?** | **Nicht in diesem Teil.** Ein Schacht bleibt ein Körper und ein Netzknoten. Seine Zerlegung (Unterteil, Ringe, Konus, Abdeckung) kommt erst, wenn jemand die Teile getrennt braucht — und dann mit der Entscheidung, welches Objekt der Knoten ist | Jetzt mitmachen. Belastet den Durchstich mit einer zweiten, unabhängigen Frage (Korrektur 2) |
| **E22** | **Woher kommen die bSI-Merkmale** (`Pset_WallCommon.LoadBearing` …)? | **Aus Rezeptfeldern mit Ziel:** ein Feld nennt `pset: 'Pset_WallCommon.LoadBearing'`, hat eine Vorgabe (`tragend: ja`) und ist setzbar. Das Katalogschema prüft gegen das erzeugte Wörterbuch (`data/pset-templates.js`), dass es Satz *und* Merkmal für die Klasse gibt; der Schreiber typisiert aus der Vorlage (`IfcBoolean` …). **Derselbe Mechanismus trägt später die Fachmerkmale** (`Quagg_Entlastung` …) — Z8 ist dann reine Datenarbeit | Feste Merkmale je Klasse im Schreiber. Verworfen: Fachwissen im Schreiber, an keinem Katalogeintrag sichtbar, nicht überschreibbar |
| **E23** | **Schreibstufe** | **Stufe 6, eine Auslieferung** — wie Stufe 4 und 5. Ein alter Tab liest `teilVon` ohne Fehler (gemessen: `pruefeBauplan` prüft keine unbekannten Schlüssel) und meldet das Rezept `bauwerk` als unbekannt, ohne abzustürzen. **Aber** er schriebe Teile ohne Bauwerk aus, und nicht jedes Werkzeug trägt unbekannte Felder sicher weiter. Mit Stufe 6 liest er nur. Preis, offen: bis zum Neuladen sieht ein alter Tab Teile ohne ihr Ganzes | Zwei Auslieferungen (erst Leser, dann Schreiber). Gemessen an Stufe 4 und 5 unnötig: der Server-Wächter (R9) hält ältere Clients ohnehin ab |

---

## 4 · Leitplanken

1. **`backend/app/ifc/*` wirkt sofort.** Jede Schreiberstufe ist für sich
   vollständig und **rückwärts gleich**: ein Paket ohne die neuen Schlüssel ergibt
   dieselbe Datei wie heute. Beweis über die Gold-Fixtures aus Z0, nicht über
   „Tests grün". Nach jeder Änderung Syntax prüfen. Nie halb liegen lassen.
2. **Der Schreiber kommt vor dem Client.** Jeder neue Paketschlüssel ist additiv
   (`_pruefe_paket` lehnt unbekannte nicht ab — gelesen). Ein Client, der Räume
   schickt, darf es erst, wenn der Schreiber sie richtig einordnet — sonst WR31.
3. **Ein Commit je Stufe**, jeder mit Test **und Gegenprobe**: die Kur abschalten,
   der Test muss rot werden.
4. **Eine Zahl vorher, eine nachher.** Jede Stufe nennt beide unten.
5. **Kein Build, kein `pm2 restart`, kein Push** ohne ausdrückliches OK. Server-Module
   (`backend/app/api/**`) werden in diesem Teil **nicht** berührt.
6. **Browserproben ohne Projekt** (lokale IndexedDB) oder in 42069; nie 1337.
7. **Wird über die genannten Stellen hinaus Kern nötig, ist das ein Befund** —
   anhalten und melden, nicht miterledigen.

---

## 5 · Die Stufen

| Stufe | Inhalt | Fähigkeit | Fund | Art | Halbtage |
|---|---|---|---|---|---|
| **Z0** | Messen und einfrieren, Doku korrigieren | — | alle | Test | 1 |
| **Z1** | Das Tor schließen: Raumelemente nicht als Bauteil | — | 1 | Kern, klein | 1 |
| **Z2** | Wand und Streifenfundament | S4 | 3 | Kern klein + Katalog | 2 |
| **Z3** | bSI-Merkmale aus Rezeptfeldern | — | 2 | Kern | 2 |
| **Z4** | Mengen für eigene Bauteile | — | 5 | Kern | 2 |
| **Z5** | Das Bauwerk | S1, S2 | 4, 6, 7 | Kern | 4–5 |
| **Z6** | Der Raum | S3 | 1 | Katalog + Schreiber | 2 |
| **Z7** | Klassifizierung und Systeme | S5, S7 | — | Kern klein | 2 |
| **Z8** | Fachmerkmale als Katalog | S6 | — | **nur Daten** | 1 |
| **Z9** | Abnahme: die Kammer, dann ein RÜB ohne Ports | — | — | Test + Browser | 2 |
| | | | | **Summe** | **19–20** |

Ports (S8) und die Zerlegung des Schachts (E21) sind **nicht** in diesem Teil.

### Z0 · Messen und einfrieren

- **Gold des Schreibers:** die IFC-Dateien aus `paket_v2.json`, `paket_typen.json`,
  `paket_leitpfosten.json` werden je Entität und Beziehung gezählt und eingefroren
  (`tests/daten/gold_schreiber_vor_xxvi.json`; Kopfzeile und Zeitstempel
  ausgenommen). Jede spätere Schreiberstufe muss **diese Zählung** treffen.
- **Die drei Proben als Tests**, mit dem heutigen Ergebnis als erwartetem Wert:
  Raumelement-Probe → 2 Regelverstöße (WR31, WR41); IDS an der Platte → 1 von 18
  verfehlt; Paket-Bauteil ohne Geometrie → übersprungen. Sie werden in Z1, Z3, Z5
  jeweils **umgedreht** — mit Begründung im Commit, wie jede gedrehte Erwartung.
- ~~Doku nachziehen~~ — schon mit dem Fahrplan erledigt (Abschnitt 2).
- **Zahl:** keine Änderung am Verhalten. Client-, CDE- und IFC-Suite wie vorher.

### Z1 · Das Tor schließen (Fund 1)

- `Bauteilrezepte.istSchreibbar`: Raumelemente (`IfcSpatialElement` und darunter)
  sind **keine Bauteile** → `false`. Die Typauswahl bietet sie nicht mehr an.
- `eigenbau.baue_datei`: ein Raumelement im Bauteilweg wird **übersprungen, mit
  Grund** („Raumelement — gehört in die Gliederung, nicht in ein Bauteil"), nie
  eingeordnet. Doppelt gesichert, weil der Schreiber sofort wirkt und ein alter
  Client es weiter schicken könnte.
- Die Frage „ist das ein Raumelement?" beantwortet **eine** Stelle je Seite:
  `schema.ist_untertyp(…, 'IfcSpatialElement')` im Schreiber, im Client die
  Vererbungskette aus `entity-schema.js` — beide aus demselben Schnappschuss.
- **Zahl:** Raumelement-Probe 2 → **0** Regelverstöße (übersprungen statt falsch
  geschrieben); `istSchreibbar('IFCSPACE')` true → **false**; Gold unverändert.
- **Gegenprobe:** Sperre im Schreiber entfernen → WR31 wieder da.

### Z2 · Wand und Streifenfundament (S4, Fund 3, E20)

- **Kern, klein:** `Rezeptbau._koerper` liest `parameter.achsbezug ?? geo.achsbezug`;
  `GEOMETRIE_ARTEN.sweep.weitere` bekommt `'achsbezug'`; das Katalogschema prüft
  den Wert gegen `mitte | sohle`.
- **Katalog:** Rezept `wand` — `bauform: 'flaeche+dicke'`, `kategorieVorgabe:
  'IFCWALL'`, Geometrie `sweep`, Profil `rechteck {breite: 'dicke', tiefe: 'hoehe'}`,
  `achsbezug: 'sohle'`; Felder Name, Typ, Dicke, Höhe (beide setzbar).
  Zweiter Eintrag `streifenfundament` — dieselbe Geometrie, `IFCFOOTING`,
  PredefinedType `STRIP_FOOTING`. **Ein Rezept-Muster, zwei Katalogeinträge.**
  Keine Netzrolle — eine Wand bekommt keine Haltungswerkzeuge.
- **Zahl:** Wand 10,00 m, Dicke 0,30, Höhe 2,50, Fußlinie auf 210,00:
  tiefster Punkt **210,000**, höchster **212,500**, Körpervolumen **7,500 m³**
  (ohne die Kernzeile, mit derselben Deklaration: tiefster Punkt 208,750 — die
  halbe Höhe im Boden).
- **Gegenprobe:** `?? geo.achsbezug` entfernen → tiefster Punkt 208,750, Test rot.
- **Gold:** Rohr, Schacht, Rechteckkanal, Bordstein bitgleich (A4-/V2-Goldstandard).

### Z3 · bSI-Merkmale aus Rezeptfeldern (Fund 2, E22)

- **Katalog:** ein Rezeptfeld darf `pset: '<Satz>.<Merkmal>'` tragen.
  `Katalogschema` prüft gegen `data/pset-templates.js` (erzeugt, nie von Hand):
  gibt es den Satz für diese Klasse, gibt es das Merkmal darin? Sonst Befund mit
  „gemeint …?", wie bei den Rollen.
- **Paket:** additiver Schlüssel `merkmale: {'Pset_WallCommon': {LoadBearing: true, …}}`.
- **Schreiber:** schreibt nur Sätze, die `schema.vorlagen_fuer(klasse, predefined)`
  kennt, typisiert aus der Vorlage; Unbekanntes geht als Warnung in den Bericht,
  nie still in die Datei.
- **Katalog füllen:** `platte` → `Pset_SlabCommon.LoadBearing` (Vorgabe ja);
  `wand` → `Pset_WallCommon.LoadBearing`, `.IsExternal` (Vorgabe ja/ja).
- **Zahl:** IDS an der Probe-Platte **1 → 0** von 18 verfehlt; Probe-Wand **2 → 0**.
- **Gegenprobe:** Merkmal aus dem Paket nehmen → IDS-Befund wieder da.

### Z4 · Mengen für eigene Bauteile (Fund 5)

- **Kein neuer Mechanismus:** Rezepte deklarieren `menge` wie die Ableitungen —
  nur aus benannten **Maßen des Körpers** statt aus Kennzahlen: `achslaenge`,
  `volumen` (geschlossenes Netz), `grundflaeche`, dazu jedes Zahlfeld beim Namen.
  Die Maße rechnet der Kern an **einer** Stelle; das Netzvolumen gibt es schon
  (`geometrie/MeshOps.meshVolume`) — wiederverwenden, nicht nachbauen.
- `wand` → `Qto_WallBaseQuantities {Length, Width, Height, NetVolume}`,
  `platte` → `Qto_SlabBaseQuantities {Depth, NetArea, NetVolume}`,
  `streifenfundament` → `Qto_FootingBaseQuantities`. Mengennamen gegen die Vorlage
  geprüft (der Schreiber meldet heute schon „Menge außerhalb der Vorlage").
- **Zahl:** Probe-Platte 5,00 × 5,00 × 0,20 → `NetVolume` **5,000 m³**,
  `NetArea` **25,000 m²**; Wand aus Z2 → `NetVolume` **7,500 m³**. Heute: kein Qto.
- **Gegenprobe:** Volumen aus einem offenen Netz → Menge fehlt mit Warnung, nicht 0.

### Z5 · Das Bauwerk (S1, S2, Funde 4, 6, 7 — E17, E18, E19, E23)

Der große Schritt. Er zerfällt in fünf Commits:

| | Commit | was |
|---|---|---|
| Z5a | **Schreiber** | Paketschlüssel `bauwerke: [{cdeId, art, name, teilVon?}]`; Bauteile tragen `teilVon`. `art: anlage` → `IfcFacility` unter der Site (`IfcRelAggregates`, WR41), Teile **enthalten**; `art: baugruppe` → `IfcElementAssembly/USERDEFINED`, Teile **zerlegt**, Baugruppe enthalten. Ohne `bauwerke` → **Gold aus Z0, unverändert** |
| Z5b | **Prüftor** | neue Regel **V07b** „ein Teil einer Zerlegung steht nicht zusätzlich in der Raumgliederung" (Fund 6). Schwere **Warnung** — es ist eine Implementer-Vereinbarung, kein Schema; es sperrt nicht, aber es sagt es |
| Z5c | **Verbund** | Test: ein Eigenbau mit `IfcFacility` im Verbund mit einer Lieferung → die Facility hängt nach `_site_aufloesen` unter der Verbund-Site, V05 = 1 Wurzel (Fund 7 wird von „gelesen" zu „gemessen") |
| Z5d | **Journal und Katalog** | Rezept `bauwerk` (Geometrieart `keine`, `art`, `name`); `pruefeBauplan` kennt es; Autor baut keinen Körper, sondern meldet das Bauwerk an `EigenbauPaket` und den Strukturbaum (`Bauwerksstruktur.eigenbauBaum`: Ebene „Bauwerk" zwischen „Eigenbau" und den Teilen). `JOURNAL_KENNT = SCHREIBT_AUSGELIEFERT = 6`, `mindestClient` 6 |
| Z5e | **Werkzeuge, als Daten wo möglich** | „Bauwerk anlegen" (`neu: [cde-B]`, Name, Art) · „Zu Bauwerk hinzufügen" (Teil als Ziel, Bauwerk als `eingaben.auswahl` — die Geste gibt es) · „Aus Bauwerk lösen" (Setzer `teilVon := null`). **Keine Mehrfachauswahl** in diesem Teil: ein Teil je Kommando. Das Kommandoschema bleibt unverändert — wenn nicht, ist das ein Befund |

- **Zahl:** Kammer (Abschnitt 6) → **1** `IfcFacility`, **6** Bauteile mit
  `ContainedInStructure` = Facility, **0** direkt an der Site; V05 = 1; V07 und
  V07b ohne Befund; heute: alle 6 direkt an der Site, keine Facility.
- **Gegenproben:** `teilVon` aus dem Paket nehmen → 6 an der Site, Facility leer
  (Schreiber meldet ein Bauwerk ohne Teile); Teil zusätzlich enthalten → V07b
  meldet 1; Schreibstufe 5 lassen → Test zu `mindestClient` rot.
- **E17 als Test:** ein Teil, das zweimal `teilVon` setzen will, hat danach genau
  **ein** Ganzes — das zweite Kommando ersetzt, es fügt nicht hinzu.

### Z6 · Der Raum (S3, Fund 1)

- **Katalog:** Rezept `raum` — `kategorieVorgabe: 'IFCSPACE'`, PredefinedType
  `INTERNAL`, Geometrie `platte` mit `dicke: 'hoehe'`, `richtung: 'oben'`;
  Umriss = Fußboden in m NN. Reine Deklaration.
- **Ausnahme vom Tor aus Z1, an genau einer Stelle:** `IFCSPACE` ist schreibbar
  **nur** über ein Rezept, das sich als Raum erklärt (`raum: true`), und nur mit
  `teilVon` auf eine `anlage` — oder an der Site, wenn keine da ist.
- **Schreiber:** Räume werden **zerlegt** unter ihr Raumelement (`IfcRelAggregates`),
  nie enthalten — dieselbe Schemaauskunft wie Z5a. `Qto_SpaceBaseQuantities
  {NetFloorArea, Height, NetVolume}` aus Z4.
- **Zahl:** Kammerraum 4,00 × 3,00, lichte Höhe 2,50 → `NetVolume` **30,000 m³**,
  `NetFloorArea` **12,000 m²**; WR31/WR41 **0**; IDS „Räume — Name vorhanden" und
  „Räume — Fläche dokumentiert" erfüllt.
- **Gegenprobe:** Raum enthalten statt zerlegt → WR31 und WR41 wieder da.

### Z7 · Klassifizierung und Systeme (S5, S7)

- **Klassifizierung:** das Bauwerk trägt `klassifikation: {system, edition, code}`;
  die zulässigen Codes stehen als **Katalogdaten mit Quelle** — Bauwerkstypen
  nach den Arbeitshilfen Abwasser (2015-12): `RUEB, RKB, RRB, RRSB, PW` — nicht im
  Code. Schreiber: `IfcClassification` + `IfcClassificationReference` +
  `IfcRelAssociatesClassification`.
- **Systeme:** die Fachmodell-Gruppen bleiben (V08 hängt an ihnen). **Zusätzlich**
  ein `IfcBuiltSystem/LOADBEARING` je Bauwerk für alle Teile mit
  `LoadBearing = true` aus Z3 — die Zuordnung folgt aus einem Merkmal, nicht aus
  einer zweiten Pflege.
- **Zahl:** Kammer → 1 Klassifizierungsbezug, 1 Tragsystem mit **6** Gliedern.
- **Gegenprobe:** Platte auf „nicht tragend" → 5 Glieder.

### Z8 · Fachmerkmale als Katalog (S6)

- **Nur Daten** — der Mechanismus ist Z3. Merkmalssätze `Quagg_Entlastung`,
  `Quagg_Drossel`, `Quagg_Rechen`, `Quagg_Speicherraum`, `Quagg_Versickerung` als
  Katalogeintrag: Name, Merkmale mit Typ und Einheit, **Quelle je Merkmal**
  (DWA-A 111, DWA-A 128, DWA-A 166 — wörtlich belegt in `ifc-sonderbauwerk.md`).
- Das Katalogschema erlaubt Satznamen mit `Quagg_`-Präfix **nur**, wenn ein
  solcher Katalogeintrag sie erklärt — sonst wäre jeder Tippfehler ein neuer Satz.
- **Zahl:** Probe-Schwelle (Wand, `USERDEFINED`, `ObjectType` „Überlaufschwelle")
  trägt `Quagg_Entlastung.SchwellenhoeheNN = 212,40` in der Datei.
- **Wird hier Code nötig, ist das ein Befund** — Z3 hätte dann nicht gereicht.

### Z9 · Abnahme

1. **Die Kammer** (Abschnitt 6) nur über Kommandos, `// @vitest-environment node`,
   Speicher-Backend, Muster `durchstichAchse.test.js`. Alle Zahlen aus Abschnitt 6
   in der Datei, Prüftor **0 Verstöße**, IDS **0 von 18 verfehlt**.
2. **Ein RÜB ohne Ports und ohne Einbautechnik:** zwei Kammern, Trennwand,
   Überlaufschwelle mit `Quagg_Entlastung`, Klassifizierung `RUEB`. Gerechnet wird
   nicht — das Speichervolumen ist ein Messwert aus `IfcSpace.NetVolume`, nicht
   eine Eingabe.
3. **Verbund** mit dem Testgelände: Facility unter der Verbund-Site, Aushub der
   Baugrube (vorhandene Ableitung `bauwerksgrube` am Bauwerk) mit Wirt, Prüftor 0.
4. **Browser** ohne Projekt: Kammer zeichnen, im Strukturbaum als Bauwerk sehen,
   ein Teil lösen und wieder hinzufügen, ausgeben.

---

## 6 · Der Abnahmefall: die Kammer

Rechteckkammer, lichte Maße 4,00 × 3,00 m, lichte Höhe 2,50 m. Wände 0,30 m
stumpf gestoßen (Längswände außen durchlaufend), Bodenplatte und Decke
außenbündig. Oberkante Bodenplatte **210,00 m NN**.

| Teil | Klasse | Maße | Volumen, von Hand |
|---|---|---|---|
| Bodenplatte | `IfcSlab/BASESLAB` | 4,60 × 3,60 × 0,40, OK 210,00 | 4,60 · 3,60 · 0,40 = **6,624 m³** |
| Längswand ×2 | `IfcWall/RETAININGWALL` | 4,60 × 0,30 × 2,50, Fuß 210,00 | je 4,60 · 0,30 · 2,50 = **3,450 m³** |
| Querwand ×2 | `IfcWall/RETAININGWALL` | 3,00 × 0,30 × 2,50, Fuß 210,00 | je 3,00 · 0,30 · 2,50 = **2,250 m³** |
| Decke | `IfcSlab/ROOF` | 4,60 × 3,60 × 0,25, UK 212,50 | 4,60 · 3,60 · 0,25 = **4,140 m³** |
| **Beton gesamt** | | | 6,624 + 2·3,450 + 2·2,250 + 4,140 = **22,164 m³** |
| Kammerraum | `IfcSpace/INTERNAL` | 4,00 × 3,00 × 2,50, Boden 210,00 | **30,000 m³**, Fläche **12,000 m²** |
| Kammer | `IfcFacility` | — | Klassifizierung nach Wahl |

**Gegenprobe der Wände:** Ringfläche außen − innen = 4,60 · 3,60 − 4,00 · 3,00 =
16,56 − 12,00 = 4,56 m², mal 2,50 m = **11,400 m³** = 2 · 3,450 + 2 · 2,250 ✓.

**Gegenprobe der Lage:** Raumboden = OK Bodenplatte = 210,00; Raumdecke = UK
Decke = 212,50; Raum-Hülle = lichte Maße der Wände. Ein Raum, der in eine Wand
ragt, ist ein Befund, keine Rundung.

---

## 7 · Auslieferungen

| Wann | was geht live | Bedingung |
|---|---|---|
| mit jedem Commit an `backend/app/ifc/*` | Schreiber, Prüftor (Z1, Z3a, Z4a, Z5a–c, Z6, Z7) | Gold aus Z0 getroffen, Syntax geprüft — **es wirkt sofort** |
| **eine** Client-Auslieferung nach Z9 | alles Client-seitige, **Schreibstufe 6** | Fabios OK; Build über `dist_neu`, vorher RAM/Platte und `find … -newer dist` (fremde Zwischenstände) |
| — | kein `pm2 restart` | Server-Module werden nicht berührt |

**Der Preis von Stufe 6, offen:** bis zum Neuladen liest ein alter Tab ein
Journal mit Bauwerken nur (Banner „neu laden") und zeigt die Teile ohne ihr
Ganzes. Dieselbe Klasse wie Stufe 4 und 5.

---

## 8 · Was nicht gebaut wird

| | warum |
|---|---|
| Ports, hydraulische Topologie (S8) | kein Szenario verlangt sie; die Topologie folgt heute aus Koinzidenz und deklariertem Anschluss |
| Zerlegung des Schachts (E21) | eigene Frage: welches Objekt ist der Netzknoten? |
| Einbautechnik als Rezepte (Rechen, Drossel, Pumpe) | die Klassen sind entschieden (`ifc-sonderbauwerk.md`), aber als Körper genügt vorerst `schacht`-artiges Platzhalterrezept; eigene Rezepte, wenn jemand Maße setzen will |
| Mehrfachauswahl („diese sechs zum Bauwerk") | eine Fähigkeit der Oberfläche, nicht des Modells; ein Teil je Kommando reicht für den Durchstich |
| Bewehrung, Fugen, Schalungsflächen | `NetSideArea` wäre aus Z4 billig, aber kein Szenario fragt danach |
| Bemessung (DWA-A 128, 111) | das Becken wird **modelliert**, nicht bemessen; V, Q_Dr, Schwellenhöhe sind Eingaben |
| ISO-19650-Benennungskonvention (M5) | eigener, unabhängiger Schritt — Prozess, nicht Bauwerk |

---

## 9 · Zwischenstände

- **Nach Z1 (1 Tag):** ein vorhandener Fehler ist zu — Raumelemente lassen sich
  nicht mehr schemawidrig erzeugen. Für sich auslieferbar (nur Schreiber + eine
  Client-Zeile).
- **Nach Z4 (≈ 4 Tage):** **P5 Stützwand ist komplett** — Wand, Streifenfundament,
  Merkmale, Mengen, IDS ohne Befund. Ein vollständiges, nützliches Ergebnis, auch
  wenn danach nichts mehr käme.
- **Nach Z6 (≈ 7½ Tage):** die Kammer steht als Bauwerk mit Raum im IFC. Das ist der
  Kern dieses Teils.
- **Nach Z9 (≈ 10 Tage):** ein RÜB ohne Ports ist modellierbar; die Einbautechnik
  ist dann Katalogarbeit.

**Heute realistisch:** Z0 und Z1.
