# Untersuchung: zwei Vokabulare (2026-09-20)

Der Bericht zu [Durchstich 2](durchstich-2-auffuellung-2026-09-19.md) stellt fest, dass es zwei Vokabulare für dasselbe Prinzip gibt — „fragen, was etwas HAT, nicht was es IST" — und dass sie nichts voneinander wissen: die **Eigenschaftsarten** für Bauteile (`services/eigenschaften/Eigenschaftsarten.js`) und die **Registry der Geländeoperationen** (`GELAENDE_OPS` in `services/gelaende/Operationen.js`).

Dies ist eine Untersuchung. Es wurde nichts geändert. Stand: `63114b6`; Pfade relativ zu `client/src/features/cde/`.

## 0 · Es sind drei, nicht zwei

Zwischen A und B liegt ein drittes, unbenanntes Vokabular: die **Fähigkeiten eines Rezepts** (R) — `erdbau`, `gelaendeform`, `punkteIn`, `sohlen`, `braucht: 'quellraster'`, `ecken`, `setzbar`, `querschnitt`, `punktlisten`, `lagelisten`, `hoehenFelder`. R ist die Brücke: das Ableitungsrezept `erdbau` reicht Schlüssel für Schlüssel an B durch (`ableitung/Ableitungen.js:503-528`).

## 1 · Gegenüberstellung

| | **A — Eigenschaftsarten** | **B — Registry `GELAENDE_OPS`** |
|---|---|---|
| Träger | ein Bauteil (geliefert oder eigen) | eine Operation in einem Erdbau-Vorgang |
| Begriffe | **3**: `achse`, `netzrolle:knoten\|kante`, `mass:<rolle>` | **≈ 20**: `wende`, `wirkbereich`, `wirkflaeche`, `kennweiten`, `hoehenfelder`, `punktfelder`, `lagefelder`, `kennhoehen`, `flaeche`, `zielAusVorgaenger`, `innen`, `ecken`, `setzbar`, `querschnitt`, `profilbahn`, `cutTyp`/`fillTyp`, `vorschau`, `werkzeug`, `titel` |
| Gestalt | **Marke** in einer Menge: „hat es". Den Wert liefert jemand anders (Typprofil, Engine, `CdeAchsen`) | **Fähigkeit mit Ausführung**: der Schlüssel sagt „hat es", der Wert sagt „so geht es" |
| Wozu | **Eignung und Begründung**: darf dieses Werkzeug an dieses Bauteil? (`passende`, `Bearbeitungen.js:3599-3660`; `Herleitung.warumNicht`) | **Rechnen, Zeichnen, Greifen** — alles, was vor A2 38 Verzweigungen über den Op-Namen waren |
| Geschlossen? | ja, eingefroren; Selbsttest „jede Art hat einen Nutzer" (`test/eigenschaftsarten.test.js:33`) | nein — die Liste steht in einem Kommentar; geprüft werden 8 Pflichtschlüssel, kein „jeder Schlüssel hat einen Leser" |
| Aus dem Repo erweiterbar | **ja** (Typprofil, Rezept-Deklaration, Bauformregel) | **nein** — jeder Eintrag trägt Funktionen, das Katalogschema lehnt Code ab (`katalog/Katalogschema.js:130`). So entschieden (E1, Teil XXIII) |
| Kennt das andere | nein | nein — keine Operation nennt oder liest je eine Eigenschaftsart |

**Dasselbe gemeint, zweimal gesagt:**

- `mass:<rolle>` (A) ≙ `setzbar` + `hoehenfelder` (B): „eine benannte Grösse, die sich setzen lässt".
- `achse` (A) ≙ `lagefelder`/`punktfelder` + `querschnitt` (B): ein Gerinne erfüllt die Definition von `achse` („eine Linie, entlang der sich stationieren lässt") wörtlich, sagt es aber nicht. Der Rechenkern ist schon EINER (`geometrie/Stationierung.js`).
- `punkteIn: 'parameter'` (R) ≙ `punktfelder`/`ecken`/`innen` (B): „hat Punkte, die man greifen kann".
- `flaeche` (B) ≙ die Quell-FORM `raster` eines Bauteils (`rezept.formen`, `holeQuellForm(gid, 'raster')`): „gibt eine Höhe am Ort". Das ist streng genommen ein **viertes** Vokabular (`geometrie/Formen.js`, Formsemantik A9).

**Nur auf einer Seite:** `netzrolle` (nur Bauteile — Operationen haben kein Netz); `wirkbereich`, `wirkflaeche`, `kennweiten`, `profilbahn`, `cutTyp`/`fillTyp` (nur Operationen — Rastermechanik und der IFC-Typ des Erdkörpers; ein Bauteil hat dafür seine Hülle).

## 2 · Was heute zweimal gebaut werden muss

1. **Eine benannte Zahl setzen — dreimal.** Setzer `mass` (Typprofil-Rolle; geliefert = Forderung, eigen = Bauplan), Setzer `parameter` (Rezeptfeld `setzbar: true`), Setzer `vorgangsmass` (Op-Feld `setzbar` → `erdbau-mass-setzen`). Drei Deklarationsformen, drei Auflösungen, drei Gültigkeitsprüfungen (`gueltig`, `_massGueltig`).
2. **Einen Punkt adressieren — zweimal.** `ADRESSEN.stuetzpunkt` (Bauplan-Punkte, Höhe in Welt) und `ADRESSEN.knickpunkt` (Op-Punkte, Höhe in NN); zwei Werkzeuge (`stuetzpunkt-verschieben`, `erdbau-stuetzpunkt-verschieben`), eine Geste.
3. **Eignung und Begründung — zweimal, und nur einmal sichtbar.** Für Bauteile erklärt `passende`/`warumNicht` schon in der Werkzeugleiste, warum etwas fehlt. Für Operationen entscheidet es sich erst IM Werkzeug, dreistufig und mit festen Sätzen: Bauform `koerper` (A, grob) → Rezept-Flag `erdbau` (R) → `setzbar` am Eintrag (B) (`Bearbeitungen.js:1020-1031`).
4. **„Gib mir eine Höhe am Ort" — zweimal.** Aus einem Bauteil über seine Form `raster` + `rasterAbtasten`; aus einer Operation über `flaeche(p)(x, z)` (seit Durchstich 2, jetzt hinter `Sollhoehe.sollhoeheVon`). Der Kanalgraben löst dieselbe Frage ein drittes Mal mit eigenem Code (Rohrsohle + Bettung).
5. **Selbstprüfung des Vokabulars** — A hat sie, B nicht. Und `Rezeptbau.liefert` (`rezept/Rezeptbau.js:285`) hat ausser Tests **keinen Leser**: ein Schaufenster ohne Publikum.

## 3 · Verallgemeinerung oder Ersetzung — und wer weicht?

**Eine Verallgemeinerung, keine Ersetzung; und keine Seite weicht ganz.**

A ist ein Vokabular von MARKEN. Es taugt für Eignung und Begründung und sagt nichts über die Ausführung — deshalb liegt die Auflösung einer `mass:`-Rolle heute in den Werkzeugtabellen (`SETZ_OPERATIONEN.mass.werte`), nicht beim Träger. B ist eine Tabelle von FÄHIGKEITEN MIT AUSFÜHRUNG. Sie taugt zum Rechnen und erklärt sich niemandem.

Zusammengeführt hiesse: „eine Fähigkeit ist ein Name plus optional ein Auflöser, erklärt vom Träger". Rezept, Typprofil und Registry-Eintrag wären drei Sorten Träger, A wäre `Object.keys` davon.

- Bei **Eignung und Begründung weicht B** — die Maschinerie von A ist die bessere: Operationen erklärten `liefert`, `erdbau-mass-setzen` sagte `braucht`.
- Bei der **Auflösung weicht A** — die Fähigkeit trüge ihren Auflöser beim Träger statt im Werkzeug.
- **Draussen bleibt** auf beiden Seiten, was kein Gegenstück hat (`netzrolle`; Rastermechanik).

## 4 · Umfang, und wo es wehtut

Nur die Schnittmenge (Zahl setzen, Punkt adressieren, Eignung für Operationen): **≈ 4–6 Arbeitstage**. Ein Vokabular für alles: **≈ 8–10 Tage und eine Änderung der Kommandodefinition.**

Es tut weh an:

- **`ziel` im Kommando ist eine GlobalId.** Eine Operation ist kein Subjekt; man erreicht sie über ein Teil ihres Vorgangs plus `werte.op`. „`passende` für Operationen" hiesse: Operationen werden wählbare Ziele — das berührt das Schema, das jetzt zweimal unverändert geblieben ist.
- **Die drei Setzer** (`SETZ_OPERATIONEN`, ≈ 100 Zeilen, 13+ Werkzeuge) samt A6-Goldstandard und `KUREN` — jede Zusammenlegung dreht Fixtures.
- **Höhenbezug der Adressen** (`hoeheInNn`: Bauplan-Punkte in Welt, Op-Punkte in NN) — ein echter Unterschied, keine Doppelung.
- **Die Erweiterbarkeit bleibt asymmetrisch**, egal wie man zusammenführt: Operationen tragen Funktionen und kommen nie aus dem Repo. Ein gemeinsames Vokabular könnte das verdecken.
- Die Wächter W5/W7 (Einordnungslisten).

## 5 · Empfehlung: abwarten — mit einer halben Stunde Hygiene

Zwei (drei) Vokabulare sind für den heutigen Stand **vertretbar**: sie beschreiben verschiedene Dinge mit kleiner Schnittmenge (3 Marken gegen ≈ 20 Schlüssel; genau ZWEI Werkzeuge wirken auf Operationen), jede Doppelung ist stabil und getestet, und die eigene Regel des Hauses aus AE gilt — keine Abstraktion auf Vorrat, jede Art braucht einen Nutzer. Ein Zusammenführen jetzt wäre Umbau an der teuersten Stelle (Setzer + Goldstandard + Schema), ohne dass ein Fall es verlangt.

Was sich **jetzt** lohnt, weil es nichts umbaut (nicht Teil dieses Auftrags, nur auf Zuruf):

- die Schlüsselliste von B aus dem Kommentar in eine eingefrorene Tabelle mit Text heben (wie `EIGENSCHAFTSARTEN`) und ein Selbsttest „jeder Schlüssel hat einen Leser" — dann haben beide Seiten dieselbe FORM, und B wächst nicht mehr unbemerkt;
- `Rezeptbau.liefert` einen Leser geben oder streichen.

**Fällig wird die Zusammenführung beim ersten dieser Ereignisse:**

1. **Ein Ziel, das ein Bauteil ODER eine Operation sein darf** — „Auffüllen bis Unterkante Bodenplatte", „bis zu einer gelieferten Fläche". Dann braucht der Auflöser aus Paket A eine Zielart, deren Auflösung `formVon(gid, 'raster')` ist, und „gibt eine Höhe am Ort" muss EINE Frage an beide Sorten Träger sein. Das ist der wahrscheinlichste Auslöser — und `services/gelaende/Sollhoehe.js` ist jetzt genau die Stelle, an der es geschieht.
2. **Eine Operation wird in der Oberfläche wählbar wie ein Bauteil** — dann muss die Werkzeugleiste für sie erklären, warum etwas fehlt, und das kann nur `passende`.
3. **Eine zweite Werkzeugfamilie setzt Zahlen an Operationen** — aus drei Setzern würden vier.
