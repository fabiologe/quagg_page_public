# Kommandodefinition — angenommen am 2026-09-18

Grundlage: [Auftrag 2](auftrag-2-plan-kommandodefinition.md), Fabios [Entscheidungen E1–E9](entscheidungen-2026-09-18.md), der [Messbefund E7](messbefund-e7-hoehenbezug-2026-09-18.md) und der [Abgleich](abgleich-2026-09-18.md). Stand des Codes: Commit `443919b`; Zeilenangaben relativ zu `client/src/features/cde/`.

Von Fabio angenommen am 2026-09-18, samt den Empfehlungen O1–O7. Was davon gebaut ist, steht in Abschnitt 7a.

## 0 · Was ein Kommando ist — und was nicht

- **Ein Kommando ist eine Absicht:** welches Werkzeug, an welchen Zielen, mit welchen Eingaben und Werten. Es ist die einzige Naht zwischen Oberfläche und Modell. Die Oberfläche baut Kommandos; sie schreibt nie selbst ins Journal.
- **Ein Kommando ist nicht die Wahrheit (E1).** Die Wahrheit bleibt das Zustandsjournal mit `vorher`/`nachher` je Bauteil. Das Kommando liegt als **Beleg** am Vorgang, den es erzeugt hat. Widersprechen sich Beleg und Einträge, gewinnen die Einträge.
- **Ein Kommando = ein Vorgang = ein Undo-Schritt.** Die Vorgangskennung IST die Kommandokennung. Damit ist „eine Absicht, ein Rückgängig" keine Absprache mehr, sondern Struktur.
- **Auswertung:** `werteAus(kommando, stand) → { schritte, befunde }` ist eine reine Funktion; sie ruft das unveränderte `anwenden` des Katalogwerkzeugs (`services/Bearbeitungen.js`). `fuehreAus(kommando)` prüft, wertet aus und schreibt den Vorgang **ganz oder gar nicht**.

## 1 · Das Schema — kommentiertes Beispiel

```jsonc
{
  // ── PFLICHT ────────────────────────────────────────────────────────────────
  "schema": 1,                          // Version DIESES Schemas. Ein Leser, der die Zahl
                                        // nicht kennt, liest nur (wie heute `mindestClient`).
  "id": "ko-mu9x2k-7f3a",               // eindeutig, vom Aufrufer vergeben. Wird die
                                        // Vorgangskennung aller Einträge des Kommandos.
  "werkzeug": "rohr-zeichnen",          // Katalog-Id (`nachId`). Das Werkzeug trägt Muster,
                                        // Operation und Katalogeintrag — das Kommando nennt
                                        // sie nicht noch einmal (ein Ort, siehe unten).
  "ziel": [],                           // GlobalIds der Subjekte. Leer beim Erzeugen.
                                        // NIE ein Index, NIE ein Name.
  "wer": "fabio",
  "wann": "2026-09-18T19:12:00Z",

  // ── PFLICHT BEIM ERZEUGEN (E2) ─────────────────────────────────────────────
  "neu": ["cde-mu9x2k-h1"],             // Kennungen der Objekte, die entstehen — der
                                        // Aufrufer vergibt sie, nicht das Werkzeug.
                                        // Operationen bekommen ebenfalls eine (E3), Präfix `op-`.

  // ── JE NACH MUSTER ─────────────────────────────────────────────────────────
  "eingaben": {                         // Schlitze und Gesten, benannt wie in `services/Eingaben.js`
    "zug": [                            // ein offener Linienzug; `umriss` für einen geschlossenen
      { "ost": 410300.00, "nord": 5460100.00, "hoehe": 100.00 },   // absolut: Projektkoordinaten, m NN
      { "knoten": "cde-mu9x2k-sB" }                                  // oder ein VERWEIS auf ein Objekt
    ],
    "auswahl": { "gelaende": "1mk6pIG0mTjafjSoGCTPLu" },           // ein anderes Bauteil, je Feld
    "punkt": { "station": 12.40 }                                    // ein Ort AUF dem Ziel: Feld → Station in m
  },
  "werte": {                            // Formularfelder des Werkzeugs, je Feldname, ABSOLUT
    "dn": 300,
    "name": "H-017"
  },

  // ── OPTIONAL ───────────────────────────────────────────────────────────────
  "ebene": "stand"                      // 'auftrag' | 'stand'; ohne Angabe die aktive Ebene
}
```

### Was bewusst NICHT im Kommando steht

| weggelassen | warum | wo es stattdessen steht |
|---|---|---|
| Muster, Operation, Katalogeintrag | stehen am Werkzeug im Katalog; doppelt gepflegt liefen sie auseinander | `werkzeugKatalog()` — jedes Werkzeug ist seit A6 als Muster + Operation + Katalogeintrag eingeordnet (Wächter W7) |
| Bauform | eine Eigenschaft des ZIELS oder des Rezepts, nie eine Eingabe | `bauform/Bauformen.js`, Rezept |
| `predefinedType`, abgeleiteter Name, Gefälle, Mengen, Befunde | berechnet | im Ergebnis bzw. gar nicht gespeichert |
| `basis`, `quellBasis`, Prüfmaß, `raster.cell` | Beweisstücke des Drei-Wege-Vergleichs, entstehen bei der Auswertung | an den Einträgen (Ergebnis) |
| Kennung neuer Objekte im Werkzeug | E2 | Feld `neu` |
| Stützpunkt-Index | E3 — nie | volle Punktliste oder der alte Punkt als Wert |

### Die Benennung

- **Muster** heißen wie in `services/Eingaben.js`: Schlitze `subjekt`, `zug`, `umriss`; Gesten `tippen`, `punkt`, `auswahl`, `griff`. Im Kommando erscheint ein Muster nur als Schlüssel unter `eingaben`.
- **Bauform** heißt wie in `services/bauform/Bauformen.js` (`punkt`, `achse+profil`, `flaeche+dicke`, …) und kommt im Kommando nicht vor.
- **Parameter** heißen wie die Felder des Werkzeugs (`felder[].name`). Jedes Feld nennt schon heute die Eigenschaft, die es setzt (`ausTypprofil: 'sohlhoeheAnfang'`, `setzt.werte[].rolle`). Das Kommando benutzt den Feldnamen; die Auswertung übersetzt über das Werkzeug auf die Eigenschaft (offene Entscheidung O5).
- **Werte sind absolut:** Lage in Projektkoordinaten (Ost/Nord), Höhen in m NN, Maße in der Einheit des Feldes. Ein Kommando rechnet nie „um 20 cm tiefer".
- **Verweise** sind entweder eine GlobalId (`"ziel"`, `{ "knoten": guid }`) oder eine Operationskennung (`{ "operation": "op-…" }`, E3).

### Ablage

Der Beleg liegt als Feld `kommando` am **ersten Eintrag** des Vorgangs. Nur Einträge überleben einen älteren Leser unverändert: `_uebernimmV2` übernimmt Einträge als Ganzes, baut Commits aber aus einer festen Feldliste neu (`stores/useAenderungen.js:727-746`), und die Dateiverdichtung kopiert den Eintrag mit `{...e}` (`services/JournalFormat.js:119-134`). Die Journaldatei behält ihre eigene Version (`version: 2`, `mindestClient`) — das ist die Version der Datei, nicht des Kommandos.

## 2 · Fünf Kommandos

Szenario des Durchstichs: zwei Schächte, eine Haltung DN 300, Mindestgefälle 1:DN = 3,33 ‰.

### 2.1 Schacht setzen

```jsonc
{ "schema": 1, "id": "ko-01", "werkzeug": "schacht-zeichnen", "ziel": [], "neu": ["cde-sA"],
  "eingaben": { "zug": [
      { "ost": 410300.00, "nord": 5460100.00, "hoehe": 100.00 },   // Sohle
      { "ost": 410300.00, "nord": 5460100.00, "hoehe": 102.50 } ]   // Deckel
  },
  "werte": { "dn": 1000, "name": "S1" }, "wer": "fabio", "wann": "…" }
```
Ergebnis: ein `erzeugt`-Eintrag `cde-sA`, Bauplan `{rezept: 'schacht', parameter: {punkte, dn}}`. **Heute anders:** über den Zeichenweg der Oberfläche fallen Sohle und Deckel zusammen — `_mitHoehe` verwirft das y (`composables/useEingabe.js:145-149`), EINE Formularhöhe gilt für alle Punkte (`services/Bearbeitungen.js:520-525`). Im Kommando trägt jeder Punkt seine Höhe; das Feld `hoehe` wird zur Vorgabe für Punkte ohne Höhe.

### 2.2 Haltung ziehen

```jsonc
{ "schema": 1, "id": "ko-03", "werkzeug": "rohr-zeichnen", "ziel": [], "neu": ["cde-h1"],
  "eingaben": { "zug": [ { "knoten": "cde-sA" }, { "knoten": "cde-sB" } ] },
  "werte": { "dn": 300, "name": "H1" }, "wer": "fabio", "wann": "…" }
```
Das Muster ist der generische Zug; die Haltung entsteht aus Zug + Katalogeintrag `rohr` (`netzrolle: 'kante'`), kein eigenes Haltungswerkzeug. Ein Zugpunkt `{knoten}` übernimmt Lage und **Sohle** des Knotens (`Achsbezug.knotensohle`, seit A9a). Ergebnis-Bauplan: `{punkte, dn, achsbezug: 'sohle', anschluss: {anfang: 'cde-sA', ende: 'cde-sB'}}`.
**Zeitplan:** `achsbezug: 'sohle'` kommt mit K4 (E7), `anschluss` mit K8 nach dem Durchstich (E6). Bis dahin schreibt der Durchstich Koordinaten, die in XZ mit den Schächten zusammenfallen — das Schema ändert sich dadurch nicht.

### 2.3 Sohlhöhe ändern

```jsonc
{ "schema": 1, "id": "ko-04", "werkzeug": "sohlhoehen-setzen", "ziel": ["cde-h1"],
  "werte": { "anfang": 100.00, "ende": 99.91 },       // Sohle in m NN, absolut (E7)
  "wer": "fabio", "wann": "…" }
```
Ein Kommando für geliefert UND eigen; die Auswertung entscheidet an einer Eigenschaft des Ziels, nicht am Typ: **hat das Ziel einen Bauplan**, wird er fortgeschrieben (neue Punkthöhen, `achsbezug: 'sohle'`); **ist es geliefert**, entsteht wie heute eine Forderung (`parametrik`). Ergebnis hier: 3,0 ‰ < 3,33 ‰ → die Haltung ist AUSGEFÜHRT und markiert (`gefaelle_zu_flach`, Grenze aus dem Regelwerk), nicht abgelehnt (E5).
**Heute anders:** am eigenen Bauteil schreibt dasselbe Werkzeug nur eine Forderung, die niemand liest (`SETZ_OPERATIONEN.mass`, `services/Bearbeitungen.js:342-359`).

### 2.4 Bauform löschen

Zwei Lesarten, beide sind heute Katalogwerkzeuge.

```jsonc
// (a) das Bauteil entfernen — gemeint ist meist das
{ "schema": 1, "id": "ko-05", "werkzeug": "loeschen", "ziel": ["cde-h1"], "wer": "fabio", "wann": "…" }

// (b) die AUSLEGUNG zurücknehmen („als welche Bauform lesen?")
{ "schema": 1, "id": "ko-06", "werkzeug": "bauform-auslegen", "ziel": ["2x9…gid"],
  "werte": { "bauform": null }, "wer": "fabio", "wann": "…" }
```
(a) schreibt `geloescht` (`services/Bearbeitungen.js:1907-1909`) — bei Geliefertem ausblenden, nie löschen. (b) setzt den Stand der Art `bauform` auf `null` („zurück zur Regel"). Beides ist mit einem Undo-Schritt zurück.

### 2.5 Objekte verknüpfen

```jsonc
{ "schema": 1, "id": "ko-07", "werkzeug": "an-schacht-anschliessen", "ziel": ["cde-h1"],
  "eingaben": { "auswahl": { "knoten": "cde-sB" } },
  "werte": { "ende": "ende" },                        // benanntes Ende, nie ein Index
  "wer": "fabio", "wann": "…" }
```
Eigenes Ziel: der Bauplan bekommt `anschluss.ende = 'cde-sB'`, das Ende rückt auf den Knoten (E6). Geliefertes Ziel: wie heute `lage` + `bezug` mit `zielBasis` (`services/Bearbeitungen.js:2594-2601`). Weichen Deklaration und Koinzidenz ab, ist das ein Befund. **Nach dem Durchstich** (E6). Die Werkzeug-Id bleibt, weil sie in `KUREN` und in Vorgangstiteln steht — siehe Konflikt K5.

## 3 · Undo, Redo, gelöschtes Ziel

- **Undo** bleibt, wie es ist: ein Vorgang wird ganz zurückgenommen — in der offenen Sitzung durch Entfernen (`stores/useAenderungen.js:1309-1329`), nach dem Commit durch Gegeneinträge (`:873-919`). Neu ist nur, dass der Vorgang IMMER genau ein Kommando ist.
- **Redo wendet das gespeicherte Ergebnis wieder an (E9).** Nach einem Commit: neue Einträge mit vertauschtem `vorher`/`nachher` der Gegeneinträge, Feld `wiederholungVon`. In der offenen Sitzung verschwinden die Einträge heute wirklich — dort hält ein **Redo-Stapel im Speicher** die entfernten Einträge samt Beleg; ein neues Kommando leert ihn. Neu ausgewertet wird nie — außer beim Rebase auf eine neue Lieferrevision, wo das gewollt ist.
- **Gelöschtes Ziel (E8).**
  - *Bei der Eingabe:* `pruefeKommando` lehnt ab — ein fehlendes oder gelöschtes Ziel ist technisch unmöglich. Grund in `warumNicht`.
  - *Beim Wiederabspielen, Rebase und Redo:* nicht abbrechen. Der Eintrag auf das fehlende Ziel wird übersprungen, der Vorgang gilt als **teilweise wirkungslos**; das ist ein abgeleiteter Zustand (wie heute `fehlt` in `services/Nachspielen.js:177`, `unaufgeloest` in `services/JournalRebase.js:52`), kein gespeicherter.
  - *Undo eines Vorgangs, dessen Ziel inzwischen ein anderes Kommando gelöscht hat:* Undo nimmt heute nur den jüngsten offenen Vorgang zurück (`useAenderungen.js:874`), der Fall entsteht also nicht; `zurueckBis` nimmt die späteren zuerst zurück.

## 4 · Auswertung über Eigenschaftsarten

Die Auswertung fragt, was das Ziel HAT, nie, was es IST:

1. `pruefeKommando` vergleicht `verlangtVon(werkzeug)` mit `eigenschaftenVon(ziel)` (`services/eigenschaften/Eigenschaftsarten.js:61-85`). Fehlt eine Eigenschaft, kann das Werkzeug nicht rechnen → technisch ungültig, abgelehnt mit dem Satz aus `eigenschaftText`.
2. Die Operation verzweigt an Eigenschaften: *hat einen Bauplan* (eigen) oder *hat eine Lieferachse* (geliefert); *welchen Achsbezug* trägt die Achse; *welche Netzrolle*. Nie an „ist ein Rohr".
3. Die Regeln lesen Eigenschaften mit Grenzwerten aus dem Regelwerk (`services/regeln/Regelwerk.js`, jede Regel nennt `prueft: 'achse.gefaelle'`).

**Die konkrete Stelle, an der es heute anders läuft:** `_anschluesseNachfuehren` beim Schacht-Verschieben mit „wirklich mitführen" (`services/Bearbeitungen.js:180-209`). Statt den Bauplan der angeschlossenen EIGENEN Haltung fortzuschreiben, löscht es sie und erzeugt eine neue — mit dem Rezept, das der Katalog für die Rolle `kante` kennt, und mit festen Typannahmen:

```js
eintraege.push({ art: 'geloescht', globalId: k.globalId, nachher: true });
eintraege.push(erzeugtEintrag({
    rezept: rezeptFuerNetzrolle('kante'),
    kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
    parameter: { punkte, dn: k.dn ?? 300 },
}));
```

Folgen: ein Rechteckkanal aus der Bibliothek wird ein Rohr, fehlt die Nennweite, wird es DN 300, die Kennung ist neu, und der Vorlagenbezug ist weg (Befund N1 aus Teil XXIII A5). Nach dem Schema fragt die Auswertung: *hat die Kante einen Bauplan?* → dann dieselbe Kennung, derselbe Bauplan, nur das Ende wandert. Dieselbe Typannahme steht in der Prüfliste (`services/engine/Pruefliste.js:72`, `:75`, `:81`, `:96` — eine eigene Kante ohne Kategorie wird als `IFCPIPESEGMENT` geprüft).

## 5 · Probe: Auffüllung zwischen Gelände und Planum

Der Fall existiert heute nicht: `auffuellen` kennt als Ziel nur eine Höhe oder das Ur-Gelände (`services/gelaende/Operationen.js:1249-1272`). Als Kommando:

```jsonc
{ "schema": 1, "id": "ko-09", "werkzeug": "auffuellen", "ziel": ["1mk6pIG0mTjafjSoGCTPLu"],
  "neu": ["cde-cut-9", "cde-fill-9", "op-fill-9"],
  "eingaben": { "umriss": [ { "ost": …, "nord": …, "hoehe": … }, … ] },
  "werte": { "ziel": "flaeche", "bis": { "operation": "op-planum-3" }, "neigung": 1.5 },
  "wer": "fabio", "wann": "…" }
```

**Das Schema trägt — mit einer Erweiterung, die E3 schon vorsieht:** ein Verweis darf auf eine OPERATION zeigen (`{operation: 'op-…'}`), nicht nur auf ein Bauteil. Ohne E3 hätte das Planum kein Ziel — es ist heute die Operation Nr. j in der Liste eines Vorgangs.

**Was außerhalb des Schemas erweitert werden muss** (ehrlich, damit es nicht wie „trägt" aussieht):
1. Die Operation `schuettung` braucht die Zielart `flaeche` — Katalog und Ableitung, Code nach Entscheidung E1 aus Teil XXIII.
2. **Reihenfolge im Erdbau-Stapel:** die Auffüllung muss NACH dem Planum gerechnet werden, auf das sie zeigt. Heute ordnet `erdbauStapelVon` nach der Liste `vorgaenge` und der Kettentiefe; ein Verweis auf eine Operation im Stapel ist dort kein Kriterium.
3. **Zyklusprüfung über Operationen:** `pruefeBezuege` kennt Zyklen nur zwischen Bauteil-Quellen (`services/ableitung/Bezuege.js:68-105`). „Planum hängt an Auffüllung hängt an Planum" muss abgelehnt werden (technisch, E5).
4. Die Operationskennungen: Operationen in Alt-Journalen haben keine. Sie werden erst adressierbar, wenn ihr Vorgang das nächste Mal geschrieben wird.

## 6 · Offene Entscheidungen

- **O1 Koordinaten im Kommando.** *Empfehlung:* Projektkoordinaten (Ost/Nord, wie die Werkzeuge sie heute zeigen) und m NN — absolut und unabhängig vom Ladeversatz, so dass ein Skript sie kennt. Alternative: die Weltkoordinaten des Journals mit dessen Rahmenmerker; kürzer, aber für einen Menschen nicht lesbar.
- **O2 Reichweite von Redo.** *Empfehlung:* nur innerhalb der offenen Sitzung und nur bis zum nächsten neuen Kommando; nach einem Commit Redo über Gegen-Gegeneinträge. Ein Redo über das Neuladen hinweg wäre ein zweiter gespeicherter Stapel.
- **O3 Kennungen für Operationen.** *Empfehlung:* wie E2 vom Aufrufer, im Feld `neu` mit Präfix `op-`; alte Operationen bleiben ohne, bis ihr Vorgang neu geschrieben wird.
- **O4 Vorgänge ohne Nutzerabsicht** (Rücknahme, Übernahme Planinhalte, Rebase, Basis-Hebung). *Empfehlung:* sie tragen einen Beleg mit `werkzeug: 'system:<name>'` — dann gilt „jeder Vorgang hat genau einen Beleg" ohne Ausnahme.
- **O5 Feldnamen oder Eigenschaften in `werte`.** *Empfehlung:* Feldnamen des Werkzeugs (eine Quelle, der Katalog); die Übersetzung auf Eigenschaften steht am Feld.
- **O6 Die drei Direktschreiber** (Längsschnitt-Zug, Merkmalsfenster, Planungs-Cockpit). *Empfehlung:* werden Katalogwerkzeuge und damit Kommandos; der Längsschnitt-Zug zuerst, weil er E7 berührt. (**alle drei gebaut 2026-09-19**, Abschnitt 7a.)
- **O7 Achsbezug im Längsschnitt auch für GELIEFERTE Haltungen.** Die bearbeitbare Sicht ignoriert ihn auch dort (Messbefund, Nebenbefund). *Empfehlung:* mit K4 mitkurieren — dieselbe Stelle, und im Bild steht heute eine Mittenhöhe als „Sohle".

## 7 · Was dieser Entwurf bewusst nicht abdeckt

- Den **Katalogverlauf** (Vorlagen, Rezepte, Typprofile, Bauformregeln, Regelwerk) — E4: eigener Verlauf, später.
- **Kennwerte und Pauschalen** — E4: nach dem Durchstich neu bewerten.
- **Ansicht, Linienstile, Planoptionen, Modellsatzwahl, Einheitenlesart** — E4: kein Verlauf.
- **Mehrbenutzer:** das Zusammenführen zweier Bearbeiter auf Kommandoebene. Es bleibt beim Wächter, der das Sichern verweigert.
- **Eine Skriptsprache oder Makros.** Das Schema macht Kommandos serialisierbar; eine Sprache darüber ist ein eigenes Thema.
- **Auswertung auf dem Server.** `werteAus` läuft im Browser; der Server liest Journale nur (`backend/app/api/projekt/core/cde.py`).
- **Migration alter Journale.** Einträge ohne Beleg bleiben gültig; sie sind Ergebnis ohne Absicht.
- **Den Umbau der Formulare nach E5** (Fachgrenzen sperren nicht mehr) — eigener Arbeitsschritt nach dem Durchstich (**gebaut 2026-09-19 als K10**, Abschnitt 7a).

## 7a · Umsetzungsstand (bis 2026-09-19 — committet und ausgeliefert, K4b offen)

Fabio hat das Schema am 2026-09-18 angenommen („ja zum Schema"), die offenen Punkte O1–O7 gelten wie empfohlen.

**Ausgeliefert 2026-09-19, 13:21 UTC** (Commits `94f87e5`, `cb32e53`, `b8289a0`; Build `index-DP6P1mDO.js`, kein Server-Neustart nötig). Damit ist K4a (der Leser des Sohlbezugs) live. **K4b** — neue Haltungen speichern `achsbezug: 'sohle'` (`JournalFormat._schreibt = 4`, schließt A7b ein) — folgt in einer EIGENEN Auslieferung, sobald alle alten Tabs neu geladen sind: ein Client von vor diesem Build läse eine Sohl-Haltung als Rohrmitte und baute sie DN/2 zu tief.

**K4b + A7b ausgeliefert 2026-09-19 (Fabio: „mach das alles“):** `JournalFormat.SCHREIBT_AUSGELIEFERT = 4` — neue und fortgeschriebene Kanten speichern ihre SOHLE (`achsbezug: 'sohle'`), das Journal schreibt Pfadschritte, Planinhalte und Rotstift ins Journal, nichts Abgeleitetes; `mindestClient 4`. Jeder Tab ab dem Build vom 2026-09-18 16:05 liest ein solches Journal nur. Im Browser (:3001, 42069): eine Haltung DN 1000, zweimal die Sohle gesetzt — Satz-Journal mit `mindestClient 4`, 4 Pfadschritten, `achsbezug 'sohle'`; neu geladen derselbe Stand, die Unterkante des gebauten Körpers auf der tieferen Sohle (387,18 m NN). 16 Tests, die die Schreibweise von Stufe 2 festhielten, sind gedreht (Stufe-2-Vergleiche setzen die Stufe jetzt selbst; gespeicherte Höhen sind Sohlen).

- **K1 gebaut:** `services/kommando/Kommando.js` (Schema 1, `pruefeKommando`, Rahmen Welt ↔ Ost/Nord/m NN, `kommandoAusZustand`), `services/kommando/Auswertung.js` (`werteAus`, ruft das unveränderte Werkzeug), Kennungsquelle in `Bauteilrezepte.mitKennungen` (E2), `Projektkoordinaten.ausProjekt` (Umkehrung von `nachProjekt`), `useBearbeitung.fuehreAus` (ohne Oberfläche); `ausfuehren` baut aus seinem Zustand ein Kommando und ruft `fuehreAus`.
- **K2 gebaut:** `useAenderungen.eintragenVorgang` (ein Vorgang, ein Sichern), Beleg `kommando` am ersten Eintrag, Vorgangskennung = Kommandokennung, eine unbekannte Journalversion wird nur gelesen. Auch Rebase, Planinhalte, „Vorgang entfernen" und der Sohlzug im Längsschnitt schreiben in einem Zug.
- **K2b gebaut (E3):** jede Operation trägt beim Schreiben eine Kennung `op-…` (`Bauteilrezepte.ableitungsSchritte`). Eine neue bekommt sie vom Aufrufer (`neu`, dieselbe Kennungsquelle wie Bauteile, das Präfix nach der Art). Eine Operation aus der Zeit vor K2b bekommt die aus ihrem Inhalt abgeleitete `op-alt-<Prüfsumme>` (Gleiche werden durchgezählt) — genau die, mit der ein Kommando sie eben angesprochen hat. Gespeichert wird die Kennung, nie die Stelle.
- **Adressen statt Nummern (E3):** die vier Werkzeuge mit Nummernfeldern — Knickpunkt verschieben (Operation und Ecke), Stützpunkt verschieben, Stützpunkt entfernen, Kante verschieben — zeichnen diese Felder als `adresse` aus. An der Naht übersetzt `kommandoAusZustand` die Nummer in den alten Punkt (Ost/Nord/m NN) bzw. in die Operationskennung; `werteAus` übersetzt zurück, räumlich mit Höhe und 1 mm Toleranz (Sohle und Deckel eines Schachts liegen im Grundriss übereinander, nur die Höhe trennt sie). Eine Nummer im Kommando ist ein Schemafehler; ein Punkt, den es nicht mehr gibt, ist ein fehlendes Ziel (E8). Die fünfte Stelle aus dem Zwischenbericht war „Drehen": dort ist das Griff-Feld ein Winkel in Grad, also ein Wert und keine Nummer. Ein Wächter hält fest, dass jedes Nummernfeld im Katalog eine Adresse trägt.
- **Wiederholen gebaut (O2, E9):** `useAenderungen.wiederholen` und `kannWiederholen`, Knopf im Änderungen-Reiter neben „Rückgängig". Je Ebene ein Stapel im Speicher; jeder neue gesicherte Schritt leert ihn. In der offenen Sitzung kommen die entfernten Einträge mit Vorgangskennung und Beleg zurück. Nach einem Commit entstehen neue Einträge mit `wiederholungVon`, ein Beleg `system:wiederholen` und ein Commit „Wiederholt: …". Wieder angewendet wird das gespeicherte Ergebnis, nie neu ausgewertet. Der Stapel überlebt das Neuladen nicht — er ist Bedienung, keine Historie.
- **Systembelege gebaut (O4):** `services/kommando/Beleg.js` (ohne Importe). Dasselbe Schema, Werkzeug `system:<name>`; `werte` sagen, was geschah (der zurückgenommene Vorgang, der Commit, die Zuordnung, die Art …). Belegt sind: Rückgängig, Wiederholen, Commit zurücknehmen, Rebase, Übernahme, die drei Konfliktentscheidungen (meiner gilt, verwerfen, übertragen), eine Art verwerfen und Vorgang entfernen. Zwei Folgen: auch eine einteilige Rücknahme trägt jetzt eine Vorgangskennung (die des Belegs), und „eine Art verwerfen" ist jetzt EIN Vorgang statt n Einzelschritten. `fuehreAus` lehnt einen Systembeleg ab — er ist ein Nachweis, kein Kommando. „Auf die Auftragsebene heben" bekommt keinen: dabei entsteht kein Vorgang, der Eintrag wandert samt seinem Beleg.
- **K3 gebaut — das Subjekt eines eigenen Bauteils aus dem Stand:** `services/kommando/Subjekt.js` (`standVon`, `subjektAusStand`). Stand, Hülle aus der Rezeptgeometrie (gleiche Formel wie für die Box aus dem Raum, `geometrie/Huelle.js`), Lage und Versatz aus dem Rahmen, Achse, Strang, Knoten und Anschlüsse aus dem Netz (`Netztopologie.strangMitAchsen`/`anschluesseMitAchsen`, dieselben Funktionen wie in der Engine). Ohne Oberfläche nimmt `fuehreAus` das Netz der eigenen Bauteile; der Viewer ruft für eigene Bauteile dieselbe Funktion und reicht nur das Netz über alle Modelle herein (`engine.netzAuskunft()`). Ein geliefertes Ziel ohne geladenes Modell wird mit Grund abgelehnt. Gemessen vorher (Browser, 42069, A64-Netz): eine eigene Haltung hatte im Viewer weder Achse noch Strang, kein eigenes Bauteil einen Versatz — „Verschieben" per Formular tat an eigenen Bauteilen nichts. Nachher: Viewer-Subjekt und `subjektAusStand` sind für Haltung und Schacht Feld für Feld gleich (16 bzw. 14 Felder, 0 Abweichungen), der Längsschnitt der allein gewählten Haltung hat ein Segment (vorher keins), „Sohlhöhen festlegen" ist vorbelegt (vorher leer), Verschieben eines eigenen Schachts um 1,000 m wirkt.
- **K4a gebaut — die Sohlhöhe einer eigenen Haltung ist echt (E7), Leser und Werkzeuge; ausliefern mit EINER Auslieferung:**
  - Der Bauplan einer Kante nennt seinen Bezug (`parameter.achsbezug`, ohne Angabe `mitte` — alte Baupläne bauen bitgleich). Die Rezepte der Kanten haben dafür eine Fähigkeit `sohlen` (`rezept/Rezeptbau.js`): Sohlen lesen, Sohlen speichern, Enden setzen (Zwischenpunkte linear, `Geometriebau.hoehenUeberLaenge` — eine Regel). Den Abstand Mitte → Sohle nimmt sie aus dem Profil, damit der tiefste Punkt des Körpers genau die Sohle ist.
  - Leser: Körper, Kernel-Form, Netzkante, Achse, Strang, Anschlüsse, Längsschnitt-Sicht, Vorbelegung „Sohlhöhen festlegen", Netzbefund am Knoten, Überdeckung im Beziehungsindex. Eine Rechnung dafür: `Achsbezug.sohleAnAchse` / `scheitelAnAchse` / `achsbezugDerAchse`.
  - Werkzeuge rechnen in Sohle: Zeichnen (das Feld heißt jetzt „Sohlhöhe"), „Sohlhöhen festlegen" an einem eigenen Bauteil schreibt den Bauplan (`setzt.amBauplan: 'sohlen'`; geliefert bleibt es eine Forderung), der Sohlzug im Längsschnitt, DN ändern (die Sohle bleibt), und die fünf Netzwerkzeuge, die aus fremden Achsen eigene Kanten bauen (Haltung teilen, Schacht einfügen/entfernen, Anschlüsse mitführen, Trasse ändern) — jede Höhe mit dem Bezug IHRER Achse.
  - Gespeichert wird in K4a weiter die Rohrmitte, jetzt ausdrücklich (`achsbezug: 'mitte'`) — die Lesart jedes älteren Clients. Deshalb genügt eine Auslieferung.
- **K4b gebaut, NICHT eingeschaltet:** ab Schreibstufe 4 (`JournalFormat._schreibt = 4`, `kantenbezugNeu()`) speichern neue und neu geschriebene Kanten ihre Sohle (`achsbezug: 'sohle'`), und die Datei verlangt `mindestClient: 4`. Ein Client ohne K4a baute eine solche Haltung DN/2 zu tief — also frühestens eine Auslieferung nach K4a. Stufe 4 schließt Stufe 3 (A7b) ein. `JOURNAL_KENNT` ist schon 4.
- **K4 gemessen im Browser** (:3001, 42069, A64-Netz; eigene Haltung DN 1000 über die Oberfläche, getippte Sohle 200,00 m NN): Unterkante des gebauten Rohrs 200,000 (vorher 199,50); Längsschnitt und Vorbelegung 200,00; „Sohlhöhen festlegen" Ende auf 199,80 → Unterkante 199,800, als `erzeugt` (vorher eine Forderung ohne Wirkung); Sohlzug auf 199,70 → 199,700. Abweichung jeweils 0 mm.
- **K5 gebaut — ein Gefälle, eine Rechnung:** `geometrie/Stationierung.gefaelle` / `gefaellePromille` / `punkteDerAchse`. Bis K5 rechneten fünf Stellen selbst und nicht gegen dieselbe Länge: Achsbeschriftung gegen die Weglänge in der Draufsicht, Befund, Längsschnitt-Sicht und Vorschau gegen die gerade Sehne, „Strang-Gefälle setzen" verteilte nach der räumlichen Länge. Jetzt gilt überall die waagerechte Weglänge entlang der Achse — dieselbe, mit der stationiert wird. Bei geraden Haltungen ändert sich keine Zahl (500 Zufallsachsen gegen die eingefrorenen alten Rechnungen). Bei einer Haltung mit Knick erschien das Gefälle über die Sehne steiler: ein L aus 2 × 20 m mit 12 cm Fall hat 3,0 ‰, die Sehne sagte 4,24 ‰, und der Befund „zu flach" (DN 300: 3,33 ‰) fiel durch — jetzt meldet er es. Mitgenommen, was K4 übersehen hatte: „Strang-Gefälle setzen" las die rohe Achshöhe als Sohle und schrieb an eigenen Haltungen nur eine Forderung — jetzt Sohlen, und eigene Glieder bekommen ihren Bauplan fortgeschrieben (die Baupläne der anderen Glieder reicht `werteAus` als `bauplanVon` im Kontext); die Tafel „Sohle" zeigte die rohe Achshöhe und bei eigenen Haltungen „waagerecht" — jetzt `services/Achsanzeige.js`, rein und geprüft. Strangglieder tragen ihre Punkte mit (Längsschnitt stationiert entlang der Haltung).
- **K6 gebaut — Markierung ohne Engine:** `services/Prueflauf.js` (`pruefeStand`, `pruefeStandAusJournal`) prüft die eigenen Kanten und Knoten EINMAL mit denselben Regeln (`befundeFuer`, `befundeFuerNetz`, Regelwerk aus dem Katalog). Zwei Zuführungen, eine Rechnung: aus dem Journal (Store: `befundeVon(globalId)`, `pruefeEigenes()`) und aus der Engine (`pruefeAlles` ruft es außerhalb der Modellschleife, mit dem Netz der Engine). Vorher liefen die eigenen Kanten innerhalb der Schleife über die gelieferten Modelle: ohne geliefertes Modell gar nicht geprüft, mit zweien doppelt. Der Abnahmefall C2, Schritte 4–6, läuft jetzt ohne Oberfläche: 3,0 ‰ → genau ein Befund „zu flach" (Grenze 3,3 ‰, Quelle „Faustregel 1:DN"), 4,0 ‰ → keiner, Büro-Regelwerk 5 ‰ → wieder markiert, Quelle „Büro-Regelwerk". Die Netztoleranz bleibt die feste 1 mm (aus dem Regelwerk erst mit K8, Fabios E6).
- **K7 — der Abnahmetest ist grün:** `test/durchstichAchse.test.js`, Umgebung `node` (kein DOM, keine Engine, kein Browser), die Ablage ein Speicher im Test. Die Kommandofolge C2 wörtlich: Schacht A (Knoten bei Sohle 100,00), Schacht B (99,85), Haltung A → B DN 300 (5,0 ‰, keine Markierung, kein loses Ende, kein Schacht ohne Anschluss), Ende 99,91 (ausgeführt, genau ein Befund „zu flach", Wert „3.0 ‰", Grenze „mindestens 3.3 ‰", Quelle „Faustregel 1:DN"; gebaute Sohle 99,910 ± 1 mm), Ende 99,88 (4,0 ‰, frei), Büro-Regelwerk 5 ‰ (wieder markiert, „Büro-Regelwerk"), Rückgängig (ein Schritt, Stand wie nach 4). Dazu: im gespeicherten Journal nur Rezept und Parameter — kein Gefälle, kein Netz, kein Körper; jedes Kommando mit Schema 1 in der Datei; wirft die Auswertung von Kommando 3, sind Journal und Datei wie nach Kommando 2; die Haltung kommt aus Muster „Zug" + Katalogeintrag `rohr`, das Mindestgefälle ist ein Katalogeintrag mit benannter Formel. Gegenproben 7 von 7 rot (je eine aus K1, K2, K4 ×2, K5, K6 und eine aufs Rückgängig).
- **K9 gebaut — Wegwerf-Oberfläche und Fang:** (a) *Kern:* das Zeichenwerkzeug einer Kante erklärt `fang: 'knoten'` (aus der Netzrolle des Rezepts), und der Eingabe-Motor fängt beim Zeichnen auch ohne gewähltes Bauteil — auf die Knoten, die der Viewer als Auskunft hereinreicht (`getKnoten` → `engine.netzAuskunft().knoten`, dieselbe Auskunft wie beim Subjekt, K3). Bis K9 gab es beim Rohrzeichnen keinen Fang; das Netz fiel nur zufällig über die 1-mm-Koinzidenz zusammen. Gefangen wird in der Draufsicht, die Höhe bleibt, woher sie kam (die Sohle eines GELIEFERTEN Knotens ist nicht sicher dessen y — eine Achsbezug-Frage für später). Der Zugpunkt als Verweis `{knoten}` bleibt K8. (b) *Wegwerf:* `components/dev/KommandoKonsole.vue`, nur im Entwicklungsmodus (im Build fällt der Import weg): JSON absetzen → `fuehreAus` → ans Modell; Rückgängig; Markierungen aus `pruefeEigenes()`; ein Knopf „Beispiel C2“ setzt den Abnahmefall am Weltursprung des geladenen Modells ein. Im Browser (:3001, 42069, A64-Netz): C2 über die Konsole 5 × ausgeführt, keine Markierung; nach Rückgängig „H: gefaelle_zu_flach 3.0 ‰“ ([Bild](bilder/k9-konsole.png)); eine Haltung mit echten Mausklicks je 6 px neben die Schachtmitten gezeichnet → beide Enden genau auf den Schachtmitten (0 mm).
- **K8 gebaut — Verknüpfung statt Zufall (Fabios E6):** der Bauplan einer Kante nennt ihre Knoten (`parameter.anschluss: {anfang, ende}`, GlobalIds; additiv — ein älterer Client ignoriert das Feld und baut aus den Punkten wie bisher). `Netztopologie.baueNetz` nimmt die Erklärung vor der Koinzidenz; passt der Ort nicht mehr, meldet der Befund „Anschluss abweichend" (Wert = Abstand, Grenze = Toleranz), ein genannter Knoten, den es nicht gibt, „Anschluss verwaist". Die Toleranz steht im Regelwerk (`netzToleranzM`, eingebaut 1 mm wie die bisherige Konstante — ein Büro kann sie ändern). Im Kommando darf ein Zugpunkt am Anfang oder Ende `{knoten}` sein, wo das Werkzeug auf Knoten fängt (K9); er übernimmt Lage und — bei einem eigenen Schacht — dessen Sohle, die dann gegen eine getippte Höhe gilt; ein gelieferter Knoten nimmt die angegebene oder getippte Höhe (seine Platzierung ist nicht sicher die Sohle). Ein Knoten, den es nicht gibt und dessen Ort das Kommando nicht nennt, ist E8. Die Oberfläche: der Fang nennt den Knoten, der Beleg trägt ihn. Werkzeuge: Kopieren, Reihe, Spiegeln nehmen den Anschluss nicht mit; Haltung teilen gibt jedem Stück sein Ende; Schacht einfügen verbindet die Stücke mit dem neuen Schacht; „An Schacht anschließen" rückt an einer eigenen Haltung nur das Ende auf den Knoten (Sohle bleibt) und schreibt den Anschluss; „wirklich mitführen" nennt den verschobenen Schacht. Der Abnahmetest (K7) nennt jetzt die Schächte statt ihrer Koordinaten. Im Browser (:3001, 42069): mit echten Klicks gezeichnet → Bauplan nennt beide Schächte, die Enden liegen auf deren Sohlen trotz anderer getippter Höhe; Schacht B 5 cm verschoben → „Anschluss abweichend 0.05 m" im Prüflauf und in der Prüfliste der Engine, das Netz verbindet weiter.
- **K10 gebaut — Formulare sperren nicht mehr bei Fachgrenzen (Fabios E5):** `Bearbeitungen.pruefe` lehnt nur noch das technisch Unmögliche ab — Pflichtwert fehlt, keine Zahl, nicht in der Auswahl, und was ein Feld als technische Grenze erklärt (`gueltig: {min, max, ueber, unter}`, vom Katalogschema geprüft: nur diese Schlüssel, nur Zahlen). Von den 42 Zahlenfeldern mit Fachgrenze (in 26 der 58 Werkzeuge) tragen 37 eine technische: jedes Nennmaß, jede Länge, Dicke und Tiefe `ueber: 0` (ein DN 0 baut keinen Körper), Böschungswinkel `ueber: 0, unter: 90`, Neigung 1:n `ueber: 0`, Auflockerung `ueber: 0`, Arbeitsraum, Wanddicke, Bettung, Stationen und Nummern `min: 0`, Anzahl Kopien `min: 1`. Bewusst nur Fachgrenze: Drehwinkel, Spiegelachse, „Beginnt bei“ (2×), Kantenhöhe über Gelände — und die Höchstzahl 200 Kopien: 5 000 Kopien sind nach E5 nicht unmöglich, nur langsam; wer eine technische Obergrenze will, setzt sie als Zahl ins Feld. Die Fachgrenzen (`min`/`max`) werden Befunde `wert_ausserhalb` (`Befunde.befundeFuerWerte`: Schwere Warnung, Wert, Grenze, Quelle „Fachgrenze des Formulars“, keine Kur — ob der Wert falsch ist, weiß nur, wer ihn eingab). Sie erscheinen (a) im Formular: `bereit` bleibt wahr, die Kontextleiste sagt die Grenze vor dem nächsten Schritt ([Bild](bilder/k10-grenze.png)); (b) im Ergebnis von `fuehreAus` (`hinweise`) und in der Momentaufnahme der Befunde am Eintrag; (c) am eigenen Bauteil, solange der Wert steht: der Prüflauf liest die Rezeptwerte jedes eigenen Bauteils (auch Pfosten und Platte, die keine Achse haben), mit und ohne Engine gleich (der Viewer reicht der Engine die Baupläne). Ein Feld, ein Befund: beurteilt schon eine Regel denselben Wert (die Nennweite eines Rohrs gegen das Typprofil — `dn_ausserhalb` nennt jetzt `feld: 'dn'`), kommt kein zweiter dazu. Im Browser (:3001, 42069, A64-Netz, echtes Formular, echte Klicks): DN 5000 getippt → kein Fehler, Übernehmen frei, Hinweis „DN 5000 mm liegt über der üblichen Grenze — ausgeführt, bitte prüfen.“; DN 0 → „dn: muss größer als 0 sein“, gesperrt; gezeichnet → Bauplan DN 5000, am Eintrag `wert_ausserhalb 5000 mm`, am Bauteil `dn_ausserhalb DN 5000 (Typprofil)`. Vorher (die Gegenprobe K10-1 stellt den alten Zustand her): 7 von 10 neuen Tests rot — DN 5000 war im Formular gesperrt und als Kommando abgelehnt.
- **O6 gebaut — der Sohlzug im Längsschnitt ist ein Kommando:** neues Werkzeug „Sohle am Punkt setzen“ (`sohle-ziehen`), als Daten, nicht als Code: die Setzer-Operation `mass` bekommt `amOrt: '<feld>'` — das eine Feld setzt die Rolle, deren Ort (`ort: 'achse.anfang' | 'achse.ende'`, neu an den Sohlen-Werten, die „Sohlhöhen festlegen“ mitbenutzt) am Punkt liegt. Damit hat der Zug am Schacht eine Form, ohne das Schema zu ändern: `ziel` = die Haltungen am Griff, `eingaben.zug` = EIN Punkt (Ost/Nord, ihr gemeinsames Ende), `werte.hoehe` = die Sohle in m NN (auf mm gerundet). Welches Ende, sagt der Ort — keine Nummer, kein „A“/„E“ im Kommando (E3). „Am Ort“ heißt: das nächste Ende, höchstens so weit wie `netzToleranzM` (wie das Netz zwei Enden für denselben Ort hält) — kein Fangradius, sonst zöge eine Mehrfachauswahl die Haltung am Nachbarschacht mit. Eine Haltung ohne Ende am Ort wird übersprungen und gezählt; ohne jedes: abgelehnt mit Grund (E8). Der Punkt fängt auf Knoten (K9), in der Werkzeugleiste also auch per Tipp neben die Schachtmitte. Geliefert: die volle Rollenkarte wie seit 17.2 (das andere Ende mit seiner wirksamen Sohle); eigen: nur dieses Ende im Bauplan (Fähigkeit `sohlen`, K4), das andere bleibt bitgleich. Der Längsschnitt baut das Kommando und ruft `fuehreAus`; für gelieferte Glieder reicht er ihr Subjekt aus dem Strang herein (`Subjekt.subjektAusStrang`: dieselbe Achse, aus der er die Sohle zeigt), eigene kommen aus dem Stand. `fuehreAus` nimmt dafür `jeEintrag` (Basis, Modell, Modell-Prüfsumme je Eintrag — am gemischten Knoten trüge sonst die eigene Haltung die Basis der gelieferten) und fällt für ein eigenes Bauteil, das der Aufrufer nicht kennt, auf den Stand zurück. `LaengsschnittSicht.sohlZugEintraege`/`cdeZugEintraege` sind weg, ihre Tests prüfen jetzt das Werkzeug. Direktschreiber im Journal (Komponenten mit `aenderungen.eintragen…`): vorher 3, jetzt 2 (Cockpit, Merkmalsfenster) — als Ratsche im Test. Im Browser (:3001, 42069, A64-Netz, echte Maus auf der Leinwand): gelieferte Haltung → eine Forderung {Anfang 235,641 gezogen, Ende 235,39 wie vorher}, Basis = Lieferstand, Beleg `sohle-ziehen` mit dem Ort in Ost/Nord; Rückgängig nimmt sie ganz. Eigener Knoten B zwischen H1 und H2 → ein Vorgang, zwei Baupläne: H1 [287,38 → 287,498], H2 [287,498 → 287,08], die anderen Enden unverändert ([Bild](bilder/o6-sohlzug.png)). Nebenbei gemessen: am A64-Netz liegen Zulauf-Ende und Ablauf-Anfang am Schacht oft etwas über 1 cm auseinander (235,39 / 235,40) — der Längsschnitt zeigt dort zwei Griffe statt eines (Regel seit 17.2: bis 1 cm ist es ein Griff, darüber ein Absturz). Unverändert.
- **O6 fertig — Merkmalsfenster und Cockpit:** keine Oberflächenkomponente schreibt mehr selbst ins Journal (vorher drei). Die Fenster setzen Kommandos über `composables/useKommandoweg.js` ab: dort steht einmal die Modus-Sperre (Stufe 12.0d — `fuehreAus` ist der Weg ohne Oberfläche und prüft ihn nicht), das Kommando aus Werkzeug, Ziel und Werten, das Modell je Eintrag und das Subjekt eines gelieferten Bauteils, von dem das Fenster nur die Kennung kennt (`Subjekt.subjektAusKennung`: Kennung + Stand; eigenes kommt aus dem Stand). Der Längsschnitt nutzt denselben Weg. (a) *Merkmalsfenster:* neues Katalogwerkzeug „Merkmalssatz setzen“ (`merkmalssatz-setzen`), als Deklaration mit der neuen Setzer-Operation `satz` (ein Eintrag einer Karte unter seinem Namen, die übrigen Sätze aus dem Stand — `standVon` führt dafür `pset`). Sein Formular ist das Fenster; `eigeneOberflaeche` hält es aus Werkzeugleiste und Auswahl heraus. Beim Umbau gefunden und im Test festgehalten: die Merkmale kommen als LISTE `[{name, value}]` aus dem Pset-Browser — ein Objekt vorauszusetzen hätte jeden Satz verworfen. (b) *Cockpit:* Kostengruppe und DIN-277-Klasse von Hand über `kg-setzen`/`din277-setzen`, dieselben Werkzeuge wie in der Werkzeugleiste (ein Code außerhalb der Auswahl wird jetzt abgelehnt — die Auswahllisten von Tabelle und Werkzeug kommen aus derselben Quelle). Der Altbestand vor Stufe 7 (`din276-overrides`, `din277-overrides`) kommt als EIN Vorgang mit Systembeleg `system:uebernahme` herein (`useAenderungen.uebernimmAltbestand`) statt je Zuweisung ein Eintrag und ein Sichern; der alte Schlüssel wird erst gelöscht, wenn der Vorgang steht. Der Wächter „Kein Weg am Bearbeiten-Modus vorbei“ sucht jetzt jeden Schreibweg des Journals (auch `eintragenVorgang` und die Übernahmen — vorher nur `eintragen`) und meldet veraltete Einträge seiner Liste; sie schrumpfte von fünf auf drei. Im Browser (:3001, 42069, A64-Netz, echte Klicks): gelieferte Haltung gewählt, Pset-Browser → „Pset_Condition“ → ein Wert getippt → „Pset hinzufügen“: Kommando `merkmalssatz-setzen` mit Beleg, `modell: geliefert`, der Satz steht danach am Bauteil ([Bild](bilder/o6-merkmalssatz.png)). Das Cockpit ließ sich dort nicht von Hand bedienen — siehe Nebenbefund; seinen Weg prüft der Test am montierten Cockpit. **Nebenbefund, behoben (2026-09-19, auf Fabios „hopp“):** die fragments-Bibliothek liefert die GlobalId im Datenabruf als `_guid`, NICHT als Attribut `GlobalId` — gemessen am A64-Netz: 40 von 40 Schächten mit `_guid` gleich dem GUID-Index, `GlobalId` bei keinem. KG-Klassifizierer, DIN-277-Klassifizierer, IDS-Prüfung und `parseItemData` lasen `item.GlobalId` und bekamen immer `''`: im Cockpit stand an jedem Element „Keine GlobalId geladen“, keine Zuweisung von Hand war möglich, und eine anderswo gesetzte Kostengruppe oder DIN-277-Klasse griff dort nie. Die Tests bauten ihre Datensätze MIT `GlobalId` — am echten Weg vorbei. Kur an EINEM Ort: `IfcDataConfig.globalIdAusDaten(item)` (`_guid`, Rückfall `GlobalId`), dazu im KG-Klassifizierer die Kennung aus dem GUID-Index, wo kein Datenabruf läuft. Wächter: kein Dienst liest `item.GlobalId` von Hand. Test `guidAusDaten.test.js` (6, Datensätze in der Form der Bibliothek) + 2 in `kgClassifier.test.js`; Gegenprobe (Regel liest wieder nur `GlobalId`): 5 von 6 rot. Im Browser (:3001, 42069, A64): die Auswahlfelder sind frei („KG manuell zuweisen“), eine echte Auswahl 411 → 300 schreibt `kg-setzen` mit Beleg, Rückgängig nimmt sie ganz.
- **Nachgeprüft:** Tests `kommando.test.js` (20), `kommandoAtomar.test.js` (9), `adressenUndKennungen.test.js` (13), `wiederholenUndBelege.test.js` (9), `subjektAusStand.test.js` (10), `sohleEigen.test.js` (12), `gefaelle.test.js` (9), `prueflauf.test.js` (8), `durchstichAchse.test.js` (4), `kommandoKonsole.test.js` (6), `verknuepfung.test.js` (13) — die Kommandotests bauen ihr Subjekt nicht mehr von Hand. Gegenproben: je Kur eine Mutation, 14 von 14 rot — eine war zuerst grün (die Höhe in der Punktadresse prüfte kein Test; der Fall „Sohle und Deckel genau übereinander" ist ergänzt); für K3 10 von 10 rot; für K4 15 von 15 rot; für K5 12 von 12 rot (eine war zuerst grün: im Testaufbau hatten beide Haltungen zufällig dieselbe räumliche Länge — der Aufbau unterscheidet sie jetzt). für K6 7 von 7 rot (eine erst als schwache Mutation grün — neu formuliert wie der alte Code, dann rot). für K9 6 von 6 rot (eine zuerst nur durch einen Syntaxfehler rot — gültig neu formuliert, dann echt rot). für K8 13 von 13 rot. für K10 17 von 17 rot (Test `formularGrenzen.test.js`, 10). für O6 13 von 13 rot (Test `sohleZiehen.test.js`, 7, dazu die umgezogenen Zug-Tests; drei waren zuerst grün — das andere Ende lag zufällig auf dem mm, der „Tipp“ war 0 px, der gelieferte Zulauf lag schon in Sohle —, die Tests sind geschärft); für den O6-Rest 12 von 12 rot (Test `fensterKommandos.test.js`, 5, montierte Fenster; zwei waren zuerst grün — die Vorgangskennung und die Meldung „galt schon“ prüfte kein Test —, geschärft). CDE 289 Dateien / 3 176 Tests grün, ganze Client-Suite 439 Dateien / 4 680 Tests grün (O6-Rest gedreht, je mit Begründung: `bearbeitungVerklebung`, `psetJournal`, `bearbeitungStore` — `stand` führt `pset`). Mit K10 gedreht: `bearbeitungen.test.js` („weist zu klein und zu groß ab“ wird „Fachgrenzen sperren nicht mehr, die technische Grenze schon“); der Goldstandard A6 vergleicht ohne `gueltig`. K5 und K6 sind nicht im Browser nachgemessen; K6 läuft im Test über den echten Prototyp der Engine. Browser nur für K1/K2 (:3001, 42069, A64-Netz mit Kartenbezug): über die Oberfläche gezeichnet und als Kommando in Ost/Nord gesetzt landen am selben Ort (7,6·10⁻¹¹ m), der Beleg steht in der gespeicherten Datei auf dem Server.
- **Gemessen:** 20 Eckzüge — die Zustände verdichten weiter um den Faktor 7,9; ein Beleg kostet rund 250 Zeichen.

**Abweichungen vom Entwurf, bewusst:**
1. **Netzfehler beim Sichern:** der Vorgang bleibt ganz im Fenster, der nächste Schritt schreibt ihn mit — so hat Fabio es am 2026-09-12 abgenommen. Zurückgenommen wird nur, wenn der Mehrbenutzer-Wächter das Schreiben verweigert (E5); vorher lebte der Schritt dann lokal weiter und ging beim Neuladen still verloren. Der Hinweistext im Änderungen-Reiter sagt es jetzt so.
2. **Ein Weg schreibt noch ohne Beleg** (bis O6 vier): Planinhalte/Rotstift (A7b, hinter Schreibstufe 3). Die drei Direktschreiber am Katalog vorbei (U6: Sohlzug im Längsschnitt, Merkmalsfenster, Planungs-Cockpit) setzen seit O6 Kommandos ab, die Altbestands-Übernahme des Cockpits trägt einen Systembeleg. „Jeder Vorgang hat genau einen Beleg" gilt damit für alles außer Planinhalt und Rotstift.
3. **Gelöschtes Ziel beim Wiederholen (E8) kann nicht entstehen:** zwischen Zurück und Wiederholen liegt kein gesicherter Schritt derselben Ebene (er leerte den Stapel), und ein fremder Schreiber wird vom Mehrbenutzer-Wächter abgelehnt. Das Überspringen beim Wiederholen ist deshalb nicht gebaut.
4. **Noch nicht gebaut:** Knotenverweise im Zug (E6, nach dem Durchstich — gebaut mit K8); Strg+Z / Strg+Umschalt+Z (gebaut 2026-09-19; F3 — die CDE bricht heute bei jeder Modifikatortaste ab).

**Was K4 an GELIEFERTEN Daten sichtbar ändert (Empfehlung O7, bewusst):** der Längsschnitt und die Vorbelegung „Sohlhöhen festlegen" zeigen bei Achsen aus der Extrusion jetzt die Sohle statt der Mitte (DN/2 tiefer); die Überdeckung einer Achse auf Sohlniveau (isyifc) ist um DN/2 kleiner als bisher gerechnet — der Befund „Überdeckung gering" kann dort neu erscheinen, er rechnet jetzt wie der Kanalgraben seit Teil XXI. Der Netzbefund „Zulauf unter Ablauf" vergleicht Sohlen.

**[Behoben 2026-09-19, siehe „Nebenbefunde behoben“ unten.]** **Offen aus K8:** „Schacht entfernen" legt zwei Haltungen zu einer zusammen — die neue nennt keine Anschlüsse (sie fällt auf die Koinzidenz zurück); die Erklärungen der alten zu übernehmen braucht ihre Baupläne am Werkzeug. „Verschieben" eines eigenen Schachts führt eigene Haltungen weiterhin nicht mit — mit Erklärung wird das jetzt als „Anschluss abweichend" sichtbar statt still.

**[Behoben 2026-09-19.]** **Offen aus K5 (Nebenbefund, nicht angefasst):** „Haltung teilen" und „Schacht einfügen" interpolieren den Teilpunkt auf der Sehne zwischen Anfang und Ende und bauen zwei Stücke aus je zwei Punkten — an einer eigenen Haltung mit Knick liegt der Teilpunkt neben dem Rohr, und die Zwischenpunkte gehen verloren. Gehört zur Stationierung (`ortBei`), eigener Schritt.

**Offen aus K4:** ~~Der Sohlzug im Längsschnitt läuft noch nicht als Kommando~~ — seit O6 ein Kommando (Abschnitt 7a). Ein Rechteckprofil nimmt den Abstand Mitte → Sohle über dieselbe Formel (halbe Tiefe), ist aber nicht eigens getestet.

**[Behoben 2026-09-19.]** **Nebenbefund aus K3, nicht angefasst:** „Verschieben" an einem EIGENEN Schacht verschiebt nur seinen Bauplan; die angeschlossenen eigenen Haltungen bleiben stehen, auch mit „wirklich mitführen" (das Werkzeug kehrt im Zweig für eigene Bauteile zurück, bevor es die Anschlüsse nachführt). Das Feld erscheint, wirkt aber nicht. Gehört zur Verknüpfung (E6, K8).

**[Behoben 2026-09-19.]** **Nebenbefund, nicht angefasst:** „Konflikt übertragen" legt den Gegeneintrag in zwei Commits — `verwerfeEinen` committet ihn schon, danach committet `uebertrageAuf` ihn mit dem neuen Eintrag noch einmal. Im Verlauf stehen deshalb „Konflikt verworfen" und „Konflikt übertragen" nebeneinander. Das war schon vor Teil XXIV so.

**Nebenbefunde behoben (2026-09-19, nach der Auslieferung, auf Fabios „lets go“ — nicht committet):**
1. *Teilen und Schacht einfügen auf der Achse:* `Bearbeitungen._teilung` statt `_teilpunkt` — die Station ist die Weglänge im Grundriss (wie Geste, Längsschnitt, Gefälle), der Punkt liegt AUF der Achse, jedes Stück behält die Punkte seiner Seite. Gemessen an einer L-Haltung (20 m Ost, 20 m Nord): vorher lag der Schnitt bei Station 10 auf (5 | 5), 3,5 m neben dem Rohr, getippt bei Station 27 auf (13,5 | 13,5), 9,6 m daneben, und der Knick ging verloren; jetzt (10 | 0) bzw. (20 | 7), Knick erhalten. Dasselbe trifft die Kur des Befunds „Schacht liegt auf der Haltung — hier teilen?“ (sie rechnet ihre Station ebenfalls im Grundriss). Test `teilenEntlang.test.js` (6).
2. *Verschieben eines eigenen Schachts:* eigene Haltungen folgen immer — dieselbe Kennung, derselbe Bauplan (Rezept, Profil, Zwischenpunkte), nur ihr Ende wandert, und es nennt den Schacht. Der Regler „als Forderung / wirklich mitführen“ gilt nur noch gelieferten Haltungen und erscheint nur dann. „Schacht verschieben“ an einem eigenen Schacht schreibt seinen Bauplan statt einer `lage`, die niemand las. Behebt auch N1 aus Teil XXIII für das Verschieben. Vorher: die Haltung blieb stehen, Befund „Anschluss abweichend 0,05 m“.
3. *Schacht entfernen:* die zusammengelegte Haltung übernimmt ALLE Punkte beider Haltungen und die Erklärungen der fernen Schächte (Anfang vom Zulauf, Ende vom Ablauf); die Anschluss-Auskunft (`anschluesseMitAchsen`) trägt dafür die Achspunkte. Vorher: drei Punkte, keine Erklärung. Offen bleibt hier N1: die neue Haltung ist das Katalog-Rohr, auch wenn die alten ein Rechteckkanal waren.
4. *Konflikt übertragen:* neuer Eintrag und Gegeneintrag entstehen zusammen — ein Vorgang, ein Commit, ein Sichern, nichts wird nachträglich umgeschrieben; beide in der Ebene des Konflikt-Eintrags. Gemessen: vorher 2 Commits, 3 Sicherungen, 1 Kennung in zwei Commits; jetzt 1, 1, 0.
5. *Strg+Z / Strg+Umschalt+Z (Strg+Y):* derselbe Weg wie die Knöpfe im Verlauf; im Eingabefeld gilt das Text-Rückgängig, mitten in einer Bearbeitung nichts (mit Grund), nie stumm; beide Kürzel stehen in der Befehlsliste. Im Browser mit echter Tastatur nachgeprüft.
Gegenproben: 1) 1 von 1 + alter Code 4 rot, 2) 6 von 6, 3) 3 von 3, 4) alter Code rot, 5) 5 von 5 rot. Client 440 Dateien / 4 693 Tests grün. **Nachgezogen (2026-09-19):** „Stützpunkt einfügen“, „Linie teilen“ und der „+“-Griff an der Kantenmitte zählen ihre Station jetzt ebenfalls im Grundriss (an einer 45°-Linie lag Station 5 vorher bei 3,54 m); „Schacht entfernen“ zwischen zwei eigenen Haltungen desselben Rezepts behält das Rezept (N1: zwei Rechteckkanäle ergaben ein Rohr, jetzt einen Rechteckkanal mit dem Profil des Ablaufs).

## 8 · Konflikte mit den Auditbefunden — nicht geglättet

- **K1 · B17 „Kommandos sind Zustandskopien".** Audit 1 wollte Pfadschritte statt voller Baupläne. E1 behält die Zustandskopien bewusst als Wahrheit; das Kommando kommt nur als Beleg dazu. Im Speicher bleibt das Journal quadratisch; nur die Datei ist seit A7 verdichtet. Der Befund steht damit weiter — entschieden, nicht behoben.
- **K2 · B15 „nichts Abgeleitetes speichern".** Das Kommando enthält nichts Abgeleitetes. Die Einträge (das Ergebnis) tragen weiter `name`, `bauform` und `kategorie` der Ableitungsteile; `predefinedType` fällt erst mit A7b aus der Datei. Teilweise erfüllt.
- **K3 · U10 „ein Vorgang, N Kopien desselben Parametersatzes".** Bleibt. Der Beleg am ersten Eintrag ändert daran nichts; die Kopien gelten jetzt ausdrücklich als Ergebnis.
- **K4 · Teil XXI, E4 „eigene Rohre liegen in der Rohrmitte".** Die Kernel-Form sagt heute ausdrücklich `achsbezug: 'mitte'` (`services/rezept/Rezeptbau.js:86-93`). E7 dreht das für NEUE Haltungen auf `'sohle'`. Beide Zustände müssen nebeneinander gelten (alte Baupläne ohne Feld = `mitte`), und das braucht zwei Auslieferungen.
- **K5 · S1 „Netzwerkzeuge heißen nach Bauteilen".** Die Kommandos nennen `schacht-zeichnen`, `an-schacht-anschliessen`, `sohlhoehen-setzen` — Ids mit Fachwörtern, obwohl die Auswertung seit AE an Eigenschaften hängt. Ein Umbenennen änderte gespeicherte Vorgangstitel und die Tabelle `KUREN`; es ist eine Formatänderung und gehört nicht in diesen Entwurf.
- **K6 · Audit 2, Schicht 1 fachblind.** Der Zugpunkt `{knoten: guid}` ist fachblind (Netzrolle `knoten`, nicht „Schacht"). Kein Konflikt — aber heute gibt es beim Rohrzeichnen gar keinen Fang (`services/Bearbeitungen.js:483-486`); der Verweis ist neu.
- **K7 · Audit 1, „die eine Stelle zuerst" (B20 Vorlagenbezug).** Seit A1 gebaut. Das Kommando `rohr-zeichnen` aus einer Vorlage trägt die Vorlage in `werte.vorlage` — ein Eingabewert, kein berechneter. Kein Konflikt.

---

Aufträge und Grundlagen: [README](README.md)
