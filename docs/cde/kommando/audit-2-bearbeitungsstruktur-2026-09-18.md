> **Stand: VOR Teil XXIII.** Dieser Bericht beschreibt den Code vom 2026-09-18 vormittags. Die meisten Befunde sind seither gebaut (Fahrplan A0–A9, AE, AR; Commits `c24a6a8` … `443919b`). Wörtlich aus dem Gesprächsprotokoll übernommen; Zeilennummern und Dateipfade gelten für den damaligen Stand (u. a. `geometry/` → `ifcleser/`, `ops/Graben.js` → `ops/Profilkoerper.js`).

# Audit Bearbeitungsstruktur — Befundbericht (2026-09-18)

Geprüft gegen das Vier-Schichten-Soll. Das Bild fällt besser aus als im ersten Audit. Schicht 1 und 4 stehen zu großen Teilen. Schicht 3 gibt es nur zur Hälfte, und daran hängt fast alles Übrige.

## Wo die vier Schichten heute liegen

| Schicht | im Code | Zustand |
|---|---|---|
| **1 Muster** | [Eingaben.js](client/src/features/cde/services/Eingaben.js#L25-L39) (Schlitze subjekt/zug/umriss, Gesten tippen/punkt/auswahl/griff), `useEingabe`, `useGriffe`, `Achszug`, `Fanglinien`, `Fangpunkte` | Vertrag sauber und fachblind, die Ausführung nicht (S2) |
| **2 Operationen** | [Bearbeitungen.js](client/src/features/cde/services/Bearbeitungen.js), 47 Einträge plus erzeugte `-zeichnen`-Werkzeuge; Kernel-Ops | Transformationen hängen an der Bauform, Netzwerkzeuge an Bauteilnamen (S1) |
| **3 Eigenschaftsarten** | [Typprofile.js](client/src/features/cde/services/bauform/Typprofile.js#L21-L26) mit Rollen und `brauchtRolle`, dazu Bauformen und Kernel-Formen | nur für skalare Maße vorhanden (S4) |
| **4 Katalog** | Typprofile, Bauformregeln und Bibliothek als Daten mit Repo-Vorrang; Rezepte, Werkzeuge, Regeln und Symbole als Code | gemischt (S5, S9) |

## 1 · Werkzeuge statt Muster

**S1 · hoch · Schicht 2.** Die Netzwerkzeuge heißen nach Bauteilen und sind eigener Code: `schacht-verschieben`, `schacht-einfuegen`, `schacht-entfernen`, `haltung-teilen`, `an-schacht-anschliessen`, `trasse-aendern` und `strang-*`. Fachlich sind es Operationen auf Knoten und Kante. Das lässt sich heute nicht ausdrücken, weil „Netzrolle" keine Eigenschaft ist (siehe S4).

Die fünf Geländewerkzeuge `graben-ausheben`, `auffuellen`, `planum-herstellen`, `gerinne-einschneiden` und `boeschung-anschliessen` wären rückführbar. Jedes ist Schlitz plus `GELAENDE_OPS`-Eintrag plus Felder. Trotzdem ist jedes ein handgeschriebener Katalogeintrag.

Das Soll gibt es im Haus schon einmal: [`zeichenBearbeitung(rezept)`](client/src/features/cde/services/Bearbeitungen.js#L314) erzeugt `${rezept}-zeichnen` aus Muster, Katalogeintrag und Parametern.

*Kleinster Umbau:* ein `formwerkzeugFuer(op)` nach demselben Muster, und die Netzwerkzeuge an Eigenschaften binden (AE). Die IDs bleiben, weil sie in `KUREN` stehen.

## 2 · Operationen an Typen gebunden

**S2 · hoch · Schicht 1.** Die Musterschicht kennt den Schacht beim Namen:
- [useEingabe.js:30–31, 167–176](client/src/features/cde/composables/useEingabe.js#L167-L176) mit `FANG_SCHACHT_M = 10`, `fang !== 'schacht'` und `bauteil.schachtKnoten`
- [useGriffe.js:233–241](client/src/features/cde/composables/useGriffe.js#L233-L241) mit `g.art === 'schacht'` und `holeSchachtAnschluesse`, zusammen 15 Codezeilen mit Fachwort
- [Griffe.js:49, 58](client/src/features/cde/services/Griffe.js#L49) mit den Rezeptnamen-Sets, zusammen 26 Codezeilen
- [Fangpunkte.js:46](client/src/features/cde/services/Fangpunkte.js#L46)

Zusammen sind das 24 Codezeilen in Modulen, die fachblind sein sollen.

*Kleinster Umbau:* `fang: { netzrolle: 'knoten' }`, die Griffart `'knoten'`, und der Fangradius als Feld des Schlitzes.

**Sauber** sind die Transformationen: `verschieben`, `drehen`, `kopieren`, `reihe`, `stuetzpunkt-*`, `kante-verschieben`, `linie-*` und `flaeche-*` filtern nach Bauform. Die Setter filtern nach `brauchtRolle`. Beides sind Eigenschaften, keine Typen.

## 3 · Geometrie als Ergebnis statt als Rezept

Weitgehend sauber. Im Journal stehen Rezept, Quellen und Parameter, nie ein Netz. `koerper-tauschen` ist nur das Anwenden einer Vorlage. Der ganze Lauf entsteht bei jedem Aufbau neu aus dem Journal.

Die Probe aus der Aufgabenstellung besteht für Körper und Massen. Ändert sich das Planum, faltet der Stapel die Auffüllung und ihre Massen neu (`erdbauStapel.test.js`).

**S3 · mittel.** An einer Stelle fällt die Probe durch. Die Randhöhen `umriss[].y` und `linie[].y` sind ein Geländeschnappschuss vom Zeichnen. [`_amRing`](client/src/features/cde/services/gelaende/Operationen.js#L126) interpoliert sie „aus den Punkthöhen, nie aus dem Raster". Sinkt das Planum um einen Meter, steht der Rand der Auffüllung einen Meter in der Luft.

Die Begründung aus Teil XX verlangt nur, nicht aus dem eigenen Ergebnis zu lesen. Das Gelände vor dem eigenen Vorgang (`stapel.vorherVon`) wäre genauso idempotent.

*Kleinster Umbau:* `y: null` bedeutet „auf dem Gelände davor" und wird in `leite` aufgelöst.

## 4 · Fehlende Eigenschaftsschicht

**S4 · hoch.** Schicht 3 existiert ausdrücklich nur für skalare Maße. Ein Werkzeug sagt `brauchtRolle` ([13 Stellen](client/src/features/cde/services/Bearbeitungen.js#L991)). Das Typprofil der Familie liefert die Rolle, und [`passende`](client/src/features/cde/services/Bearbeitungen.js#L3034) filtert danach. Das ist ein guter Vertrag.

Für Lage, Achse mit Stationierung, Netzrolle, Material und Anschlusspunkte gibt es keinen solchen Vertrag. Operationen greifen dort an der Schicht vorbei: über `schachtKnoten`, `holeSchachtAnschluesse`, die `fachmodell`-Funktionen der Rezepte und `LAGE_REZEPTE`. Stationen werden an vier Stellen neu gerechnet.

*Kleinster Umbau:* `brauchtRolle` zu `braucht: ['achse', 'netzrolle:kante', 'mass:…']` verallgemeinern, mit einem einzigen Auflöser `eigenschaftenVon(subjekt)`.

## 5 · Katalog im Code — die Leitpfosten-Probe

**S5 · hoch.** Ein Leitpfosten lässt sich heute nicht ohne Code anlegen:
- Die Bauform `punkt` hat 6 Typprofile, aber kein Rezept, das sie erzeugt. `flaeche+dicke` hat 12 Typprofile und ebenfalls kein Rezept.
- Der einzige Ausweg wäre eine Vorlage auf dem Rezept `schacht`. Damit würde der Leitpfosten ein Netzknoten mit Schachtgriff.
- Das Plansymbol stammt aus einer festen Liste in [DefaultLineStyles.js:97](client/src/features/cde/services/DefaultLineStyles.js#L97).
- Einen Materialkatalog gibt es nicht.
- Eine eigene Regel wäre nicht möglich (siehe S9).

Was schon ohne Code geht: ein Typprofil für `IFCSIGN` als Datensatz auf Büro-Ebene und das generische Werkzeug `reihe` entlang einer Achse.

*Kleinster Umbau:* zwei neue Geometriearten `stab` und `platte` in den deklarativen Rezepten, und Symbole als Daten.

## 6 · Katalogerzeugung von Hand

**S6 · mittel.** Den Generator gibt es: [generiere_client.py](backend/app/ifc/generiere_client.py) erzeugt Wörterbuch, Pset-Vorlagen, Altnamen und IDS und hat einen `--pruefe`-Modus. Zuordnungen hängen auf Familienebene und werden vererbt, zum Beispiel deckt `IFCFLOWSEGMENT` Rohr, Kanal und Kabel ab (`vererbungskette`). Der Vorrang ist Projekt vor Büro vor eingebautem Satz.

Es fehlen Katalog-Entwürfe. Die Typprofile sind handgeschrieben, und ihre `quelle` (das Pset-Feld) wird von Hand zugeordnet.

*Kleinster Umbau:* Der Generator schreibt je Familie `typprofil-entwuerfe.js` aus den bSI-Vorlagen, mit dem Status `entwurf`.

## 7 · Zustand unbestätigt

Überwiegend erfüllt. Der Import verwirft nichts und bricht nicht ab:
- Eine unbekannte Klasse landet in [`_luecke`](client/src/features/cde/services/Herleitung.js#L170-L193), Stufe `schema`.
- Die Form kommt aus der Geometrie mit `guete: 'geschaetzt'`, und „Bauform auslegen" bestätigt sie.
- `alleVorschlaege` schlägt Regeln aus Namen und Kategorien vor.

**S7 · niedrig.** Der Zustand lebt je Bauteil und als flüchtige Vorschlagsliste, nicht als festgehaltener Katalogeintrag. Niemand sieht „diese Familie kam schon dreimal, entschieden hat keiner".

*Kleinster Umbau:* Vorschläge als Bauformregeln mit `enabled: false, status: 'unbestaetigt'` auf Projektebene speichern.

## 8 · Katalog ohne Validierung

**S8 · mittel.** Prüfer gibt es für Vorlagen (`pruefeVorlage`), Instanzen (`pruefeBauplan`) und Kernel-Formen (`pruefeForm`). Für Typprofile und Bauformregeln aus dem Büro- oder Projekt-Repo gibt es keinen. Das sind genau die Daten, die das System ohne Programmfassung erweitern. Geprüft wird nur `istBauform` beim Regeltreffer ([Bauformregeln.js:118](client/src/features/cde/services/bauform/Bauformregeln.js#L118)).

Ein Typprofil mit vertipptem Rollennamen wirkt still: Das Werkzeug erscheint dann einfach nie.

*Kleinster Umbau:* ein gemeinsames `Katalogschema.pruefeEintrag(art, eintrag)`. Ungültige Einträge werden gemeldet und nicht aktiv.

## 9 · Fachregeln vermischt mit Kern

**S9 · mittel.** Die Regeln sind sauber tabelliert und nennen ihre Quelle:
- `GRABENREGELN`: DIN EN 1610 Tab. 1/2, DIN 4124
- `REGELWERK` ([Befunde.js:39](client/src/features/cde/services/Befunde.js#L39))
- `AUFLOCKERUNG`: ausdrücklich kein Normwert

Die Naht zum Hereinreichen existiert über `regelwerk =` und `regeln =`. Die Tabellen liegen aber im Code. Niemand reicht etwas aus dem Repo herein, und ein Büro kann kein Mindestgefälle ändern.

Lose daneben liegen:
- [`MINDEST_UEBERDECKUNG = 0.8`](client/src/features/cde/services/ableitung/Ableitungen.js#L74), DIN EN 1610, in der Rezeptschicht
- die 1:DN-Formel in [Befunde.js:123](client/src/features/cde/services/Befunde.js#L123), Quelle im Code nicht genannt
- `gefaelleHoechstPromille: 100`
- `FANG_SCHACHT_M = 10`, in Schicht 1
- `KANALGRABEN_ANSCHLUSS = 2`

*Kleinster Umbau:* ein Katalog `regelwerk` mit Repo-Vorrang. Jede Regel nennt die Eigenschaft, die sie prüft. Formeln bleiben benannter Code.

## 10 · Überabstraktion

Sauber. Alle Muster haben mindestens drei echte Nutzer: Schlitz `zug` 5 Werkzeuge, `umriss` 3, Geste `punkt` 4 Felder, `auswahl` 4, `griff` 11 Werkzeuge, `mehrfach` 10.

Eine Auffälligkeit ist das Gegenteil von Überabstraktion: `punkt` und `flaeche+dicke` haben Leser, aber keinen Erzeuger (siehe S5). Von den allgemeinen Erzeugungsoperationen des Solls (spiegeln, extrudieren, rotieren, aufspannen, boolesch) existiert keine als Werkzeug. Das ist zu früh und kein Mangel. Nur Spiegeln fehlt im Alltag.

## Rückführung aller Werkzeuge

**Nicht rückführbar (16), davon 11 eigener Algorithmus mit Namensbindung:**

| Werkzeug | Muster | wäre Operation | fehlt |
|---|---|---|---|
| `an-schacht-anschliessen` | zug + Fang | Kante an Knoten anschließen | Netzrolle, Anschlusspunkte |
| `schacht-verschieben` | griff XZ | Knoten verschieben, Kanten folgen | Netzrolle, Anschlusspunkte |
| `schacht-einfuegen`, `schacht-entfernen` | subjekt | Knoten in Kante einfügen oder entfernen | Netzrolle |
| `haltung-teilen` | punkt auf achse | Kante an Station teilen | Achse mit Stationierung |
| `trasse-aendern` | zug | Achse neu legen | Achse |
| `strang-gefaelle-setzen`, `strang-massnahme`, `strang-umbenennen` | mehrfach | Maß oder Merkmal entlang verbundener Kanten | Netzrolle |
| `fliessrichtung-setzen`, `linie-umkehren` | tippen | Achsrichtung | Achse (Richtung) |

Die übrigen 5 bleiben bewusst Code, weil sie Ableitungen sind und Entscheidung E1 das so festlegt. `kanalgraben-ableiten`, `bauwerksgrube-ableiten` und `aussparung-ableiten` haben das Muster subjekt + auswahl Gelände, die Operation ist die jeweilige Ableitung. `erdbau-stuetzpunkt-verschieben` hat das Muster griff. `bauform-auslegen` ist das Bestätigen der Bauform.

**Rückführbar, aber handgeschrieben (17):**

| Werkzeug | Muster | Operation | Katalogeintrag |
|---|---|---|---|
| `graben-ausheben`, `auffuellen`, `planum-herstellen` | umriss | Gelände formen | `GELAENDE_OPS.grube`, `schuettung`, `planum` |
| `gerinne-einschneiden`, `boeschung-anschliessen` | zug | Gelände formen | `gerinne`, `boeschungLinie` |
| `sohlhoehen-setzen`, `deckelhoehe-setzen`, `bezugshoehe-setzen` | griff Y oder tippen | Höhe setzen | Rolle `sohlhoehe*`, `deckelhoehe` |
| `profilgroesse-setzen`, `profilform-setzen`, `staerke-setzen` | tippen | Maß setzen | Rolle `profilGroesse`, `profilform`, `dicke` |
| `kg-setzen`, `din277-setzen`, `massnahme-setzen`, `umbenennen` | tippen | Merkmal setzen | Schlüssel |
| `koerper-tauschen` | tippen | Vorlage anwenden | Bibliothek |
| `loeschen` | subjekt | entfernen | — |

**Sauber (18):** `verschieben`, `drehen`, `kopieren`, `reihe`, `stuetzpunkt-verschieben`, `stuetzpunkt-einfuegen`, `stuetzpunkt-entfernen`, `kante-verschieben`, `linie-teilen`, `linie-trimmen`, `linie-versetzen`, `flaeche-teilen`, `flaeche-vereinigen`, `flaeche-versetzen`. Alle filtern nach Bauform und `nurEigene`. Dazu die vier erzeugten `linie-zeichnen`, `flaeche-zeichnen`, `rohr-zeichnen` und `schacht-zeichnen`, die aus Muster, Rezept und Feldern entstehen.

## Die eine Stelle zuerst

**[`passende()` und `brauchtRolle`](client/src/features/cde/services/Bearbeitungen.js#L3010-L3055): zu `braucht` über Eigenschaftsarten verallgemeinern.**

Das ist der einzige Ort, an dem Operationen und Katalog schon per Vertrag miteinander reden. Heute gilt der Vertrag nur für Maße. Wird er um Achse, Netzrolle und Anschlusspunkte erweitert, fallen S1, S2 und S4 gemeinsam:
- Die Netzwerkzeuge verlieren ihre Namensbindung.
- Die Musterschicht vergisst den Schacht.
- Ein Rechteckkanal aus der Bibliothek bekommt „Kante teilen", ohne dass ihn eine Datei kennt.

Der Schritt ist heute klein: 13 `brauchtRolle`-Stellen, und die Kurzform bleibt gültig. Jedes Werkzeug, das vorher noch entsteht, bindet sich dagegen wieder an einen Namen.

## Im Fahrplan

Die Befunde stehen in **Teil XXIII**. Zwei neue Stufen sind dazugekommen: **AE** (Eigenschaftsarten) vor A4 und **AR** (Regelwerk als Katalog) nach A6. Die Begründung für AE vor A4: Der neue Rezeptkatalog würde sonst wieder mit Namensbindung entstehen.

Geändert an bestehenden Stufen:
- A0 bekommt drei weitere Wächterzahlen: Musterschicht fachblind (24 → 0), Rückführung (16 / 17 / 18), lose Normkonstanten (5 → 0).
- A3 nimmt S2 auf.
- A4 bekommt Punkt- und Plattenrezept.
- A5 bekommt Katalogschema, Symbole, Entwürfe und den Zustand „unbestätigt". Dein Leitpfosten ist dort der Beweis-Test, bis zum `IfcSign` im geprüften IFC.
- A6 erzeugt die Geländewerkzeuge statt sie zu schreiben, und Spiegeln kommt dazu.
- A7 bekommt die Randhöhen als Verweis (S3), mit derselben Zwei-Auslieferungs-Regel wie die Pfadschritte.

Der Gesamtaufwand steigt damit von 16–18 auf 22–24 Arbeitstage.

Die Voraussetzung ist unverändert: Teil XXII ist laut Plandatei gebaut und geprüft (406 Dateien / 4 311 Tests, Browserprobe 16/16), aber noch nicht committet. Vor A0 muss das passiert sein, dann messe ich die Basiszahlen neu.
