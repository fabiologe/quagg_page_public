# Durchstich 2 — Auffüllung zwischen Gelände und Planum (2026-09-19, spät)

Die Wiederholungsprobe zur [Kommandodefinition](kommandodefinition.md) (Abschnitt 5, Probe Auffüllung; [Abgleich A4](abgleich-2026-09-18.md); [Entscheidungen E1–E9](entscheidungen-2026-09-18.md), besonders E3). Stand des Codes: `e56a968`. Zeilenangaben relativ zu `client/src/features/cde/`.

**Teil 1 ist der Bericht vor dem Bauen. Gebaut wird erst nach Freigabe.** Teil 3 (Soll gegen Ist) kommt nach dem Bauen an das Ende dieser Datei.

---

## Teil 1 — Bericht vor dem Bauen

### 0 · Die Deutung, an der alles hängt: was „Fläche" heißt

`schuettung` kennt heute zwei Ziele (`services/gelaende/Operationen.js:397-434`): eine **Höhe** (`ziel: 'hoehe'`, Krone über dem Rand, Böschung 1 : n nach innen) und das **Ur-Gelände** (`ziel: 'ur'`, Rückverfüllung). Die dritte Zielart `flaeche` heißt hier:

> **Ziel ist die Sollfläche, die eine andere Operation des Stapels definiert** — beim Planum die Ebene auf seiner Höhe. Je Rasterknoten im Umriss der Auffüllung ist die Sollhöhe `flaeche(x, z)`; aufgefüllt wird, wo das Gelände (nach allen Vorgängern) darunter liegt: `neu = max(h, soll)`, mit Böschung `soll = min(flaeche(x, z), rand + d/n)` — dieselbe Formel wie heute, nur dass `hoehe` eine Funktion des Ortes ist.

Warum die Sollfläche und nicht „das Gelände nach der Operation P": Das Planum stellt seine Fläche in seinem Umriss selbst her. Liegt P im Stapel vor der Auffüllung, ist das Gelände dort schon auf Planumshöhe — eine Auffüllung *innerhalb* P hätte nichts zu tun. „Auffüllung zwischen Gelände und Planum" ist deshalb der Körper *neben und um* das Planum, der dessen Höhe erreicht (die Dammschulter): Ziel ist die Ebene, die P definiert, Ort ist der eigene Umriss. Innerhalb von P tut die Auffüllung nichts (`soll > h` ist falsch), also keine Doppelzählung, und zweimal angewandt ändert sich nichts (Gesetz 4).

Was das im Code bedeutet: Der **Anbieter** der Fläche ist der Eintrag der Operation in der Registry (`GELAENDE_OPS.planum.flaeche(p) → (x, z) → y`). Der **Nehmer** ist `schuettung`, der über die Registry fragt „hat die genannte Operation eine Fläche?" — nie „ist es ein Planum" (Wächter W2, `test/architekturWaechter.test.js:299-304`). Eine Operation ohne `flaeche` ist ein Befund, keine Ablehnung (E5).

### 1 · Was schon trägt und nicht gebaut wird

| Vorgabe | trägt | Beleg |
|---|---|---|
| Operationen haben stabile Kennungen (E3) | **ja, seit K2b** — jede Operation trägt `id: 'op-…'`; eine alte bekommt `op-alt-<fnv1a>`; beim Fortschreiben eines Vorgangs behält sie ihre Kennung | `services/Bauteilrezepte.js:409-436` (`operationenMitKennung`), `:551-555` (`ableitungsSchritte`: `if (op.id) return op`) |
| „Ändert sich das Planum, wird die Auffüllung neu ausgewertet" | **ja, geschenkt vom Stapel** — jeder Vorgang wird über *alle* Vorgänger gefaltet, je Lauf neu; die Auffüllung speichert nur ihr Rezept | `services/ableitung/Ableitungslauf.js:100-135` (`_opsListen`, `_gefaltet`), `services/ableitung/Ableitungen.js:404-420` |
| Das Werkzeug entsteht aus Muster + Registry-Eintrag | **ja** — `formwerkzeugFuer(art)` baut `auffuellen` aus `GELAENDE_OPS.schuettung.werkzeug` (Schlitz `umriss`, Felder, `ausEingabe`) | `services/Bearbeitungen.js:1287-1310` |
| Das Planum lässt sich per Kommando ändern | **fast** — `erdbau-mass-setzen` (E3, Adresse `operation`) setzt ein Maß am Vorgang; das Rezept fragt die Registry, welche Maße die Operation `setzbar` erklärt. Das Planum erklärt heute **keines** — eine Zeile Daten fehlt (S3) | `services/Bearbeitungen.js:2298-2313`, `:1015-1024` (`_massZiel`), `services/ableitung/Ableitungen.js:514`; `setzbar` heute nur an `gerinne` (`Operationen.js:1096`) und `boeschungLinie` (`:1407`) |
| Ein fehlendes Ziel wird bei der Eingabe abgelehnt (E8) | **ja, der Weg existiert** — `adressenAlsNummern` prüft eine Operationskennung gegen die Liste des Subjekts und liefert den Grund | `services/kommando/Kommando.js:104-113` |
| Die Kommandodefinition | **reicht.** `werte.bis = {operation: 'op-…'}` ist der vorgesehene Verweis (Abschnitt 1, „Verweise"; Abschnitt 5, Beispiel `ko-09`), `neu` nimmt `op-`-Kennungen, `ziel` ist die GlobalId des Geländes. Nichts wird geändert. | `kommandodefinition.md` §1, §5 |

**Was fehlt, ist exakt A4:** (1) die Zielart `flaeche` in der Operation, (2) die Adressierung einer Operation, die in einem **anderen** Vorgang des Stapels liegt — K2b adressiert Operationen des **eigenen** Bauplans (`ADRESSEN.operation.liste = el.stand.bauplan.parameter.operationen`, `services/Bearbeitungen.js:918-920`). Ein Gelände hat keinen Bauplan; sein Stapel steht in `el.erdbau` (`Bauteilrezepte.erdbauStandVon`, `:474-493`), und der trägt je Vorgang nur `{ableitung, art, titel}` — die Operationen nicht.

### 2 · Arbeitsschritte

| # | Schritt | Einordnung | Begründung am Code | Dateien | Zeilen |
|---|---|---|---|---|---|
| **S1** | **Zielart `flaeche` in der Operation.** (a) `schuettung()` bekommt den Zweig `ziel === 'flaeche'`: die Zieloperation über den Kontext holen (`operationVon(id)`), ihre Fläche über die Registry (`flaecheVon(op)`), je Knoten `soll = flaeche(x, z)`; ohne Ziel → Warnung `schuettung_ziel_fehlt`, ohne Fläche → `schuettung_ziel_ohne_flaeche` (E5: ausgeführt, markiert). (b) `formeNach(raster, ops, {…, vorherige})` reicht `operationVon` an jedes `wende` — gesucht wird in den Operationen der Vorgänger **und** den schon gefalteten der eigenen Liste (Ziel muss *vorher* liegen). (c) Die vier Faltstellen des Stapels reichen die Vorgänger herein: `Ableitungen.js:420, :432` (`stapel.opsVor`), `Ableitungslauf.js:132` (`_gefaltet`: `listen.slice(0, k-1)`), `:148` (`_durchAuffuellung`). (d) `planum.flaeche = (p) => Number.isFinite(p.hoehe) ? () => p.hoehe : null` — die Ebene. | **Kernarbeit** (Vorgabe 1) | Die Operation ist Code nach E1/Teil XXIII; der Kontext von `formeNach` ist heute `{bereich, ur}` (`Operationen.js:1545`) und kennt keine anderen Operationen. Ohne (c) sähe die Auffüllung ihr Ziel in EINEM Faltweg (Anzeige, Präfix-Cache, feiner Korridor) und im anderen nicht — Bild und Zahl widersprächen sich. (d) ist eine Deklaration am Registry-Eintrag, aber funktionswertig; ich zähle sie zur Kernarbeit, weil ohne Anbieter keine Zielart. | `services/gelaende/Operationen.js`, `services/ableitung/Ableitungen.js`, `services/ableitung/Ableitungslauf.js` | ≈ 35 (Operationen 28, Ableitungen 2, Ableitungslauf 4) |
| **S2** | **Eine Operation des Stapels adressieren (E3 über den Vorgang hinaus).** (a) `erdbauStandVon` gibt zusätzlich `operationen`: alle Operationen der Vorgänge des Stapels, in Stapelreihenfolge, mit Kennung und `vorgang` (die Liste `vorgaenge` bleibt, wie sie ist — sie wird in den Anzeige-Bauplan geschrieben, `Bearbeitungen.js:1094-1104`, und darf nicht wachsen). (b) Neue Adressart `ADRESSEN.stapeloperation = { kennung: true, liste: (el) => el.erdbau?.operationen ?? [] }`. (c) `Kommando.js`: Adressarten mit `kennung` werden wie `operation` geprüft (`{operation: 'op-…'}`, `:297-300`), `adressenAlsNummern` prüft die Existenz (E8) und reicht die **Kennung** statt einer Nummer durch (`:104-113`), `nummernAlsAdressen` wickelt eine Kennung ein (`:78-96`). | **Kernarbeit** (Vorgabe 2) | K2b gab Operationen Kennungen und Adressen **innerhalb** eines Vorgangs. „Fülle bis zum Planum P" zeigt aus einem Vorgang in einen anderen — dafür gibt es weder die Liste am Subjekt noch eine Adressart, die die Kennung weitergibt statt sie in eine Nummer zu übersetzen. Die Nummer wäre hier falsch: gespeichert wird im Bauplan die Kennung (Rezept statt Position, U9). | `services/Bauteilrezepte.js`, `services/Bearbeitungen.js` (nur `ADRESSEN`), `services/kommando/Kommando.js` | ≈ 18 (3 + 5 + 10) |
| **S3** | **Katalog.** Am Eintrag `GELAENDE_OPS.schuettung.werkzeug`: Option `{wert: 'flaeche', titel: 'bis zur Fläche einer Operation (Planum)'}`; Feld `{name: 'bis', titel: 'Zieloperation', typ: 'text', leerErlaubt: true, adresse: 'stapeloperation'}`; `mass` wird `leerErlaubt` (es gilt nur bei Ziel Höhe — heute muss man es auch für „bis GOK" mitgeben); `warumNicht(werte, zug)`: Ziel Höhe ohne Maß, Ziel Fläche ohne Zieloperation, Zieloperation ohne Fläche → Grund (technisch, E5); `ausEingabe`: Zweig `flaeche` → `{art: 'schuettung', parameter: {umriss, ziel: 'flaeche', flaeche: werte.bis, neigung}}`. Am Eintrag `planum`: `setzbar: { hoehe: {} }` (damit `erdbau-mass-setzen` die Planumshöhe setzen darf). `schuettung.kennhoehen`: Kronenkante nur bei Ziel Höhe (heute `p.ziel !== 'ur'` → bei Fläche stünde `hoehe: undefined`, `Boeschungskanten.js:110` filtert es zwar, aber die Regel soll stimmen). | **Katalogarbeit** — mit einer Grauzone | Alles steht am Registry-Eintrag, den `formwerkzeugFuer` liest (A6: Geländewerkzeuge werden erzeugt). Grauzone, ehrlich benannt: `ausEingabe` und `warumNicht` sind Funktionen im Katalogeintrag (der Übersetzer von Formular zu Operation), keine reinen Daten — so ist es seit A6 bei allen fünf Geländewerkzeugen. | `services/gelaende/Operationen.js` | ≈ 15 |
| **S4** | **Abnahmetest** `test/durchstichAuffuellung.test.js`: die Kommandofolge aus Abschnitt 3, nur über `fuehreAus`, Ablage im Speicher wie `durchstichAchse.test.js`; die Zahlen über den Ableitungslauf (`neuerAbleitungslauf` mit echtem Kernel, synthetisches Gelände wie `erdbauStapel.test.js`). Dazu: Ziel fehlt (E8 → Grund), Ziel ohne Fläche (Warnung, Vorgang steht), Ziel liegt im Stapel hinter der Auffüllung (Warnung, Auftrag 0), Idempotenz (zweiter Lauf gleich), Rückgängig der Planumsänderung (450 → 300). `test/opRegistry.test.js`: `flaeche` ist ein optionaler Schlüssel, das Planum hat einen, das Gerinne nicht. Gegenproben je Kur. | Test | — | `test/durchstichAuffuellung.test.js` (neu), `test/opRegistry.test.js` | ≈ 170 |
| **S5** | **Teil 3** dieses Berichts: Soll gegen Ist, jede Typabfrage, Namensbindung, Fachregel. | Doku | — | diese Datei, `README.md`, Gedächtnis | — |

**Summe Kernarbeit: ≈ 53 Zeilen in 6 Dateien; Katalogarbeit: ≈ 15 Zeilen in 1 Datei.** Das ist mehr Kern als Katalog — und das ist der Befund, bevor gebaut ist: Die *Fachaussage* (das Planum bietet eine Ebene, die Auffüllung nimmt sie) ist klein (≈ 15 Zeilen, S1a + S1d). Der Rest ist Verdrahtung: einer Operation die anderen Operationen zugänglich machen (S1b/c, ≈ 14) und eine Kennung aus einem Kommando bis in einen Bauplan durchreichen (S2, ≈ 18). Ob das die Architektur bestanden hat, entscheidet sich in Teil 3 daran, ob diese Verdrahtung **einmal** entsteht und die nächste Zielart (Gerinnesohle, Krone einer Schüttung) dann eine Deklaration am Eintrag ist.

Ein Commit je Schritt: S1, S2, S3 einzeln (jeder für sich grün — S1 und S2 ohne S3 ändern kein Verhalten, S3 ohne S1/S2 wäre ein Formularfeld ohne Wirkung; deshalb die Reihenfolge S1 → S2 → S3), S4 mit dem Test, S5 die Doku.

### 3 · Die Kommandofolge und die Zahl

Gelände: geliefert (`DGM1`), eben auf **100,00 m NN**, 40 × 40 m, Zellweite 1 m; Höhenversatz 0 (damit die Zahlen ohne Umrechnung lesbar sind — die Umrechnung NN ↔ Welt geht denselben Weg wie in `randhoehen.test.js`, dort mit 300). Alle Umrisse achsparallel mit Rändern auf **x,25 / x,75** — dann fallen die Ränder auf die Zellmitten des feinen Rasters (0,5 m), auf dem die Massen gerechnet werden (`Ableitungen.js:424-436`), und die Zellformel (`Operationen.js:496-517`, Mittel der vier Ecken × Zellfläche) liefert die Fläche einer Stufe **exakt**.

| # | Kommando | Inhalt | erwartet |
|---|---|---|---|
| 1 | `planum-herstellen`, `ziel: [DGM1]`, `neu: [cde-P-aushub, cde-P-auftrag, cde-anzeige, op-P]` | `umriss` (10,25 \| 10,25) … (20,25 \| 20,25), `werte: {hoehe: 101.00, neigung: ''}` | Vorgang P: Auftrag **100,000 m³** (10 × 10 × 1,00), Aushub 0; die Anzeige entsteht; op-P trägt die Kennung aus `neu` |
| 2 | `auffuellen`, `ziel: [DGM1]`, `neu: [cde-S-aushub, cde-S-auftrag, op-S]` | `umriss` (5,25 \| 5,25) … (25,25 \| 25,25), jeder Punkt `hoehe: 100.00` (Rand auf dem Gelände — Eingabe, wie `punkteInNn` sie verlangt), `werte: {ziel: 'flaeche', bis: {operation: 'op-P'}, neigung: ''}` | Vorgang S: Auftrag **300,000 m³** = (20² − 10²) m² × (101,00 − 100,00) m; Aushub 0; im Bauplan `flaeche: 'op-P'`, kein Index; Anzeige gesamt 400 |
| 3 | `erdbau-mass-setzen`, `ziel: [cde-P-auftrag]` | `werte: {op: {operation: 'op-P'}, feld: 'hoehe', wert: 101.5}` | P wird fortgeschrieben — dieselbe Klammer, dieselben Kennungen, op-P behält seine Kennung; S wird **nicht** geschrieben |
| 4 | Ableitungslauf neu | — | P **150,000**, S **450,000** = 300 × 1,50; Anzeige 600 — ohne einen Eintrag an S |
| 5 | Rückgängig (ein Schritt) | — | S wieder 300,000 |
| 6 | `auffuellen` mit `bis: {operation: 'op-gibt-es-nicht'}` | — | abgelehnt mit Grund (E8), Journal unverändert |
| 7 | `auffuellen` mit Ziel einer Operation ohne Fläche (z. B. `op-S` selbst oder eine Böschungslinie) | — | eingetragen, Warnung `schuettung_ziel_ohne_flaeche`, Auftrag 0 (E5) |

Rechenweg der Zahl: Der Ring zwischen dem Umriss von S (20 × 20 m) und dem Planum (10 × 10 m) hat 300 m². Das Gelände liegt dort auf 100,00, die Sollfläche auf 101,00 → Schichtdicke 1,00 m → **300 m³**. Innerhalb des Planums liegt das Gelände nach P schon auf 101,00 → 0. Nach Kommando 3: Dicke 1,50 m → **450 m³**. Ohne Böschung, damit die Zahl von Hand stimmt; mit Böschung 1 : 1,5 ist der Körper ein Pyramidenstumpf-Ring, dessen Rasterwert nicht mehr geschlossen nachrechenbar ist — der Test prüft den Fall nur auf Plausibilität (kleiner als 300, größer als 0) und Idempotenz.

### 4 · Die Stelle mit dem größten Risiko

**Die Faltstellen (S1c).** Der Stapel faltet an mehreren Stellen mit `formeNach`: der Vorgang selbst grob und fein (`Ableitungen.js:420, :432`), der Präfix-Cache für alle Nachfolger und die Anzeige (`Ableitungslauf.js:132`), der Auffüllungs-Nachweis (`:148`), die Anzeige-Flicken (`gelaende/Flicken.js:116`, dort mit ALLEN Operationen in einer Liste). Sieht die Auffüllung ihr Ziel an einer Stelle nicht, füllt sie dort still nichts — die Anzeige zeigt den Ring auf 100,00, der Körper steht auf 101,00, oder umgekehrt. Genau die Fehlerklasse von Teil XXI (Bild ≠ Zahl). Gegenmittel im Test: die Anzeige (nach allen Vorgängen) muss Zelle für Zelle gleich `formeNach(ur, alle Operationen)` sein — wie `erdbauStapel.test.js` es prüft — und die Summe der Vorgänge gleich der Gesamtmasse der Anzeige. Dazu wird „Ziel nicht gefunden" nie stumm: `formeNach` gibt eine Warnung heraus, die der Lauf an die Ableitung hängt.

Zweites Risiko, kleiner: **die Reihenfolge im Stapel.** A4 nennt sie als offen („die Auffüllung müsste NACH dem Planum gerechnet werden"). Gebaut wird **kein** Sortierkriterium nach Bezug, sondern die Regel: das Ziel muss im Stapel *vor* der Auffüllung liegen (Vorgänger oder frühere Operation derselben Liste); sonst Warnung, Auftrag 0. In der Praxis hält das von selbst — ein Kommando, das P nennt, wird nach P eingetragen und steht in `vorgaenge` dahinter (`Bezuege.erdbauStapelVon:248-256`). Ein Zyklus (A4, Punkt 3) kann so nicht entstehen: „vorher" ist eine strikte Ordnung. Bricht ein späterer Rebase oder eine Hand am Anzeige-Bauplan die Ordnung, sieht man es als Warnung, nicht als falsche Zahl.

### 5 · Was bewusst nicht gebaut wird — und was vorab schon ein Befund ist

- **Oberfläche:** kein Formularfeld für die Zieloperation, kein Griff, kein Vorschau-Chip. `_ringVorschau` fällt bei fehlender `hoehe` still aus (`Operationen.js:1367`), zeigt also nichts Falsches. Kommt mit der Oberfläche.
- **`flaeche` an anderen Operationen** (Gerinnesohle, Grubensohle, Krone einer Schüttung): je eine Deklaration am Eintrag. Nicht jetzt — der Durchstich braucht das Planum. Ob es dann wirklich nur die Deklaration ist, steht in Teil 3.
- **Stapel nach Bezug sortieren:** siehe Abschnitt 4.
- **Fachregeln:** dieser Durchstich führt **keine** neue ein. Vorab benannt, nicht von mir und nicht meine Aufgabe: die Vorbelegung der Böschung 1 : 1,5 steht als Zahl im Werkzeug (`Operationen.js:1329`, `vorbelegung`), nicht im Regelwerk — eine lose Vorgabe, die der Wächter W8 nicht zählt (er zählt vier benannte Normwerte).
- **Subjekt eines gelieferten Geländes ohne Viewer:** K3 baut das Subjekt eigener Bauteile aus dem Stand; ein geliefertes Gelände hat keinen Weg ohne Modell. `fuehreAus` verlangt dafür `subjektVon` vom Aufrufer (`stores/useBearbeitung.js:756-762`). Der Test reicht es (GlobalId, Höhenversatz, `erdbau: erdbauStandVon(stand, gid)`), wie der Viewer es tut. Das ist innerhalb des heutigen Vertrags, aber es heißt: „allein über Kommandos" gilt für ein geliefertes Ziel nur mit einem Aufrufer, der das Subjekt kennt. Kein Umbau hier, aber benannt.
- **Migration:** Alt-Journale haben `ziel: 'hoehe'|'ur'` und keine Zieloperation; nichts ändert sich für sie. Eine Auffüllung mit `flaeche` schreibt ein neues Feld in den Bauplan — additiv; ein älterer Leser fällt in `schuettung()` auf `ziel === 'hoehe'` ohne `hoehe` → `schuettung_ohne_hoehe`, Vorgang wirkungslos, kein Absturz (`Operationen.js:403`). Ausgeliefert wird in einem Zug (kein Format der Datei, nur ein Parameter).

---

## Teil 3 — Soll gegen Ist (nach dem Bauen)

Gebaut auf Fabios „oki Teil 2" in vier Commits: `e6563b9` (S1), `00d0ee0` (S2), `2210a37` (S3), `a2dd5b2` (S4). Jeder Schritt endet mit einem eigenen Test, jede Kur mit Gegenprobe (S1 4/4, S2 4/4, S3 5/5, S4 10/10 rot). Client 447 Dateien / 4 796 Tests grün (vorher 446 / 4 776). Nicht gebaut, nicht gepusht.

### Das Abnahmekriterium

| Kriterium | erfüllt? | Beleg |
|---|---|---|
| Auffüllung zwischen Gelände und Planum allein über Kommandos | **ja** | `test/durchstichAuffuellung.test.js`: `planum-herstellen` → `auffuellen` über `fuehreAus`, Umgebung `node`, keine Oberfläche. Einschränkung: das Ziel ist ein GELIEFERTES Gelände, dessen Subjekt der Aufrufer reicht (`subjektVon` samt `erdbau`, wie der Viewer). Ohne Modell gibt es kein Subjekt eines gelieferten Bauteils — das war vor diesem Durchstich so (K3) und ist es noch. |
| Planum über seine Kennung benannt, nicht über seine Position | **ja** | Kommando `werte.bis = {operation: 'op-P'}`; im Bauplan `flaeche: 'op-P'`, keine Höhe, kein Index; im Beleg und in der gespeicherten Datei dieselbe Kennung. Eine Nummer statt `{operation}` ist ungültig (E3), eine unbekannte Kennung abgelehnt (E8). |
| Volumen als Zahl, von Hand nachrechenbar | **ja** | 300,000 m³ = (20² − 10²) m² × 1,00 m — genau, bei 1 m Zellweite (feiner Korridor) und bei 0,5 m (ohne). Gesamt 400 aus den Vorgängen UND unabhängig aus dem Bild der Anzeige. Die Kernel-Gegenprobe sagt 300,15 (0,05 %, an der senkrechten Stufe; in ihrer Toleranz von 2 %). |
| Ändert sich das Planum, wird die Auffüllung samt Volumen neu ausgewertet | **ja — für ein Planum OHNE Böschung.** Mit Böschung: **nein**, siehe Befund 1 | Planum auf 101,50 → Auffüllung 450,000 m³, ohne einen Eintrag an ihr; Rückgängig → 300. |

### Soll gegen Ist je Schritt

| # | Schritt | geschätzt | tatsächlich (Code / Kommentar) | Einordnung erwartet → tatsächlich |
|---|---|---|---|---|
| S1 | Zielart `flaeche` | ≈ 35 Zeilen, 3 Dateien | **29 / 26**, 3 Dateien (`Operationen.js` 23, `Ableitungen.js` 3, `Ableitungslauf.js` 3) | Kern → Kern, wie erwartet. Davon ist die Fachaussage ≈ 13 Zeilen (Zweig in `schuettung`, `planum.flaeche`); der Rest ist Verdrahtung (`formeNach` + vier Faltstellen) |
| S2 | Operation im Stapel adressieren | ≈ 18, 3 Dateien | **16 / 11**, 3 Dateien (`Kommando.js` 10, `Bearbeitungen.js` 4 — nur `ADRESSEN`, `Bauteilrezepte.js` 2) | Kern → Kern, wie erwartet |
| S3 | Katalog | ≈ 15, 1 Datei | **17 / 10**, 1 Datei (`Operationen.js`) | Katalog → Katalog, **mit der benannten Grauzone**: `ausEingabe` und `warumNicht` sind Funktionen im Eintrag. Abweichung: `warumNicht` prüft NICHT „Ziel ohne Fläche" (so im Plan) — das ist nach E5 kein technischer Fehler; der Lauf markiert es (Warnung, 0 m³). |
| S4 | Abnahmetest | ≈ 170 | **276**, 12 Tests | — |
| — | **ungeplant:** A6-Goldvergleich | 0 | **+17 Testcode** in `werkzeugeAusDaten.test.js` | siehe Befund 3 |
| — | **ungeplant:** ein Vorgang, den kein Werkzeug baut | 0 | 1 Test | siehe Befund 2 |

**Summe Produktivcode: 62 Zeilen (Kern 45, Katalog 17) in 6 Dateien** — geschätzt 68. Die Schätzung hielt; die Aufteilung auch: mehr Kern als Katalog.

### Was Katalogarbeit war, wie erwartet

- Das dritte Ziel „bis zur Fläche einer Operation", das Feld der Zieloperation, „Höhe über dem Rand" darf leer sein, `warumNicht` je Ziel, `ausEingabe` — alles am Registry-Eintrag, aus dem `formwerkzeugFuer` das Werkzeug baut. Keine Zeile in `Bearbeitungen.js` außer der Adressart.
- „Die Planumshöhe ist setzbar": eine Zeile Daten (`setzbar: { hoehe: {} }`); `erdbau-mass-setzen` fragt sie über die Registry.
- **„Ändert sich das Planum, wird die Auffüllung neu ausgewertet" kostete NICHTS.** Der Stapel faltet jeden Vorgang bei jedem Lauf über alle Vorgänger; die Auffüllung speichert nur ihr Rezept und ihren Verweis. Das ist der stärkste Beleg dafür, dass das Fundament (Rezept statt Ergebnis, E1) trägt.
- Das Planum als Anbieter der Fläche: eine Deklaration am Eintrag (`flaeche: (p) => () => p.hoehe`). Ich hatte sie zur Kernarbeit gezählt; tatsächlich ist sie Katalog. Die nächste Zielfläche (die Sohle eines Gerinnes, die Krone einer Schüttung) ist ebenfalls eine solche Zeile — der Nehmer fragt `flaecheVon(op)`, nie den Namen.

### Was entgegen der Erwartung Kernarbeit wurde — und warum genau

Nichts wurde Kern, was nicht einer der beiden erlaubten Punkte war. Aber innerhalb der beiden erlaubten Punkte war mehr Verdrahtung nötig, als „eine Zielart" und „eine Kennung" klingen:

1. **Die Zielart ließ sich nicht als Daten hinzufügen.** Eine Operation (`wende`) bekam bisher `{bereich, ur}` — sie kannte keine anderen Operationen. Damit die Schüttung ihr Ziel findet, musste `formeNach` einen neuen Kontext (`operationVon`) reichen, und **vier Aufrufer** im Stapel mussten die Vorgänger hereingeben: der Vorgang grob, der Vorgang fein, der Präfix-Cache (Anzeige und alle Nachfolger), der Auffüllungs-Nachweis. Es gibt keine EINE Funktion „falte den Stapel" — fünf Stellen rufen `formeNach` mit je eigenem Kontext; schon `ur` wird an jeder anders gereicht. Das Risiko aus Teil 1 §4 trat nicht als Fehler auf, aber als Aufwand: jede Stelle einzeln, und jede braucht ihre eigene Gegenprobe (M1, M2a, M2b, M3).
2. **Die Zielart ist Code JE OPERATION.** Der Zweig „bis zur Fläche" steht in `schuettung()`. Wollte morgen eine Grube „bis zur Fläche" ausheben, braucht `grube()` denselben Zweig noch einmal. Die Anbieterseite ist generisch (eine Deklaration), die Nehmerseite nicht: es fehlt ein gemeinsamer Auflöser „Sollhöhe am Ort" (Zahl | Ur | Fläche einer Operation), den jede Operation fragt. Nicht gebaut — über die zwei erlaubten Punkte hinaus.
3. **Adressieren über den Vorgang hinaus brauchte eine neue Adressart und ein neues Feld am Subjekt.** K2b adressiert Operationen im EIGENEN Bauplan. Das Gelände hat keinen Bauplan; sein Stapel hängt als Anreicherung `el.erdbau` am Subjekt (`Bauteilrezepte.erdbauStandVon`), und die kannte je Vorgang nur `{ableitung, art, titel}`. Neu: `erdbau.operationen` und `ADRESSEN.stapeloperation` mit der Eigenschaft `kennung: true` (die Kennung wandert weiter, keine Nummer). Die Kommandodefinition blieb unverändert; `Kommando.js` (Übersetzung Adresse ↔ Wert) nicht.

### Welche Eigenschaftsart, welches Muster, welche Operation hat gefehlt

- **Muster:** keines. Der Schlitz `umriss` reichte.
- **Operation:** keine neue. `schuettung` bekam ein drittes Ziel.
- **Eigenschaftsart: „stellt eine Fläche her".** Es gab sie nicht. Sie steht jetzt als Schlüssel `flaeche` in der Registry der Geländeoperationen — **nicht** im Vokabular der Eigenschaftsarten (`eigenschaften/Eigenschaftsarten.js`: `achse`, `netzrolle`, `mass`). Das ist ein Befund über die Architektur: es gibt zwei Vokabulare, eines für Bauteile (Eigenschaftsarten, AE) und eines für Operationen (Registry-Schlüssel, A2). Beide funktionieren nach demselben Prinzip (fragen, was etwas HAT), aber sie wissen nichts voneinander.
- **Adressart:** `stapeloperation` — eine Operation irgendwo im Stapel des Geländes.
- **Subjekt eines gelieferten Geländes ohne Viewer:** fehlt weiterhin; der Test reicht es wie der Viewer.

### Jede eingeführte Typabfrage, Namensbindung, hartkodierte Fachregel

| Stelle | was | Art |
|---|---|---|
| `Operationen.js`, `schuettung()` | `ziel === 'flaeche'` | Namensbindung an einen Wert des EIGENEN Parameters `ziel` — dieselbe Sorte wie das vorhandene `ziel === 'ur'`. Kein Vergleich mit dem Typ eines anderen Objekts. |
| `Operationen.js`, Eintrag `schuettung.werkzeug` | `werte?.ziel === 'flaeche'` in `ausEingabe` und `warumNicht` | dieselbe Namensbindung im Katalogeintrag |
| `Operationen.js`, `schuettung.kennhoehen` | `(p.ziel ?? 'hoehe') === 'hoehe'` | dieselbe (vorher `p.ziel !== 'ur'`) |
| `Operationen.js`, Warnungen | `schuettung_ziel_fehlt`, `schuettung_ziel_ohne_flaeche` | Warnungscode mit Op-Präfix, wie `schuettung_ohne_ur` |
| `Kommando.js` | `adresse === 'operation' \|\| ADRESSEN[adresse].kennung` | die Namensbindung `'operation'` war schon da (K2b); NEU ist nur die Frage nach der Eigenschaft `kennung` — bewusst keine zweite Namensbindung |
| — | **keine Typabfrage:** nirgends „ist das Ziel ein Planum". Die Schüttung fragt `flaecheVon(op)`; ein Ziel ohne Fläche ist eine Warnung | — |
| — | **keine neue Fachregel.** Die Fläche eines Planums ist seine Definition, keine Regel. Vorab benannt und unverändert: die Vorbelegung der Böschung 1 : 1,5 steht als Zahl im Werkzeug, nicht im Regelwerk | — |

Der Architektur-Wächter (W1–W8) ist unverändert grün; keine Ausnahmeliste wuchs.

### Befunde

1. **„Planum ändern" ist mit Böschung inkonsistent — und S3 hat den Weg dorthin geöffnet.** `planum-herstellen` mit Böschung schreibt ZWEI Operationen, jede mit ihrer eigenen Kopie der Höhe (`Operationen.js:1195`: `{art: 'boeschung', parameter: {umriss, hoehe, neigung}}`). Gemessen (Kommando `erdbau-mass-setzen` op-P → 101,50): `op-P planum hoehe=101.5`, `op-B boeschung hoehe=101` — die Böschung läuft von der alten Höhe aus, am Rand des Planums steht eine 0,5-m-Stufe. Die Höhe der Böschung lässt sich per Kommando gar nicht setzen („lässt sich an dieser Operation nicht setzen"). Vor S3 war die Planumshöhe überhaupt nicht setzbar; der Abnahmefall (Planum ohne Böschung) ist davon nicht berührt, der Alltag schon. Das ist U10 im Kleinen: eine Zustandskopie innerhalb eines Vorgangs. **Die naheliegende Kur ist derselbe Mechanismus:** die Böschung zeigt auf die Fläche des Planums (`flaeche: 'op-P'`) statt eine Höhe zu kopieren — dann folgt sie von selbst. Das ist Kernarbeit an `boeschung()` samt Umgang mit Alt-Journalen; nicht gebaut, zur Entscheidung.
2. **Der Auffüllungs-Nachweis war über Kommandos nicht prüfbar.** Er bekommt die Vorgänger jetzt mit (Faltstelle 4). In jedem Vorgang, den ein Katalogwerkzeug baut, ändert das nichts: eine reine Schüttung trägt nie ab. Messbar ist es nur an einem Vorgang, der schneidet UND bis zur Fläche verfüllt — den baut kein Werkzeug; der Test legt ihn direkt über `ableitungsSchritte` an (ohne die Verdrahtung: 100 m³ „aus einer Auffüllung" bei 0 m³ Aushub). Eine Verdrahtung auf Vorrat, die nur ein künstlicher Vorgang sichtbar macht.
3. **Der A6-Goldvergleich brach an einer reinen Katalogerweiterung.** Er fror die Formularfelder jedes Werkzeugs ein; ein drittes Ziel an „Auffüllen" machte ihn rot, obwohl jeder alte Schritt gleich blieb. Jetzt vergleicht er die Felder als Teilmenge (was A6 kannte, muss gleich sein) und die Schritte weiter exakt; die Gegenproben (alte Option entfernt, alter Schritt geändert) sind rot. Ohne diese Änderung wäre JEDE künftige Katalogarbeit an einem der 16 alten Werkzeuge ein Testbruch gewesen.
4. **Altoperationen sind nicht adressierbar**, bis ihr Vorgang einmal neu geschrieben ist: ihre abgeleitete Kennung (`op-alt-…`, aus dem Inhalt in NN) kennt der Lauf nicht (er rechnet in Welt). So stand es schon in der Kommandodefinition (§5, Punkt 4); jetzt ist es gebaut und mit Grund versehen.
5. **Die Reihenfolge im Stapel wird nicht nach Bezug sortiert.** Regel stattdessen: das Ziel muss VORHER liegen, sonst Warnung und 0 m³. Über Kommandos kann ein späteres Ziel nicht entstehen (es muss bei der Eingabe existieren, E8); ein Zyklus ist damit ausgeschlossen. Gegen eine Hand am Anzeige-Bauplan oder einen Rebase, der die Ordnung dreht, schützt nur die Warnung.

### Hat die Architektur die Wiederholungsprobe bestanden?

**Teilweise — der Weg trägt, der Kern ist an zwei Stellen noch nicht generisch genug.**

Bestanden hat, was am meisten zählt: Die Kommandodefinition reichte ohne Änderung. Die Neuauswertung nach einer Änderung am Planum kostete keine Zeile. Das Ziel steht als Kennung im Journal, nicht als Position. Die Werkzeugseite war Katalogarbeit. Es gibt keine Typabfrage, keine neue Fachregel, und der Wächter blieb grün. Die zwei erlaubten Kernpunkte haben zusammen 45 Zeilen Code gekostet.

Nicht bestanden, ehrlich:
- **Die Nehmerseite der Zielart ist Code je Operation.** Die nächste Operation, die „bis zur Fläche" können soll, braucht denselben Zweig noch einmal. Generisch wäre ein gemeinsamer Auflöser „Sollhöhe am Ort", den jede Operation fragt.
- **Der Stapel hat keine eine Faltfunktion.** Ein neuer Kontext für Operationen muss an fünf Stellen gereicht werden. Eine davon war nur mit einem künstlichen Vorgang überhaupt prüfbar.
- **Innerhalb eines Vorgangs gibt es Zustandskopien** (Planum und Böschung tragen je ihre Höhe). Die erste Änderung per Kommando hat das sichtbar gemacht, nicht der Test des Abnahmefalls.

Die Verdrahtung (Kontext für Operationen, Adressierung über den Vorgang hinaus) ist jetzt einmal da. Eine weitere *Zielfläche* ist deshalb eine Deklaration. Eine weitere *Operation mit Ziel* und eine Böschung, die ihrem Planum folgt, wären weiterhin Kernarbeit.

---

## Nachtrag (2026-09-20): der Auflöser und die Böschung

Fabios zwei Folgeaufträge aus Teil 3 — der gemeinsame Auflöser („Wo es mehr Kern war", Punkt 1) und Befund 1 (die Böschung folgt dem Planum nicht). Gebaut in neun Commits (`9561102` … `63114b6`), je Schritt einer. Nicht gebaut, nicht gepusht, kein Neustart.

### Der Auflöser „Sollhöhe am Ort" (Paket A)

`services/gelaende/Sollhoehe.js` ist ein Blatt: es kennt weder die Registry noch eine einzelne Operation. Die Fläche einer anderen Operation reicht `formeNach` als Fähigkeit herein (`flaecheAn`) — sonst wäre es ein Kreis und ein Griff nach oben (W1). Die Tabelle `ZIELARTEN` nennt je Ziel drei Eigenschaften: `mitBoeschung`, `rueckverfuellung`, `eigenesFeld`.

| | vorher | nachher |
|---|---|---|
| Codezeilen in `Operationen.js`, die eine Zielart beim Namen nennen | **16** | **0** |
| Operationen, die „bis zur Fläche" können | 1 (`schuettung`) | **5** (`schuettung`, `grube`, `planum`, `boeschung`, `baugrube`) |
| **Zeilen, die `grube()` dafür gebraucht hat** | — | **7 geändert, davon 4 neu** — keine nennt eine Zielart |

Die Zahl 7 ist der von Fabio verlangte Beweis: Signatur (Kontext), zwei Zeilen Auflöser statt der Sohlenprüfung, `soll.mitBoeschung &&` an der Neigung, zwei Zeilen in der Schleife. Gemessen wird die Zählgröße mit

```
grep -nE "ziel === '|ziel !== '|\.ziel \?\? '|ziel = '|ziel: '" services/gelaende/Operationen.js | grep -vE "^[0-9]+: *(\*|//)"
```

**Verhaltensneutral, nachgewiesen:** `test/fixtures/sollhoehe-vorher.json` friert 21 Szenarien mit dem Code von VOR dem Umbau ein (Summe, gewichtete Summe, Kleinstes, Grösstes, veränderte Knoten, Löcher, zwölf Proben, Warnliste wörtlich) — danach bitgleich. Kein Erwartungswert wurde angepasst.

**Nicht geglättet** (jede Eigenheit mit Grund im Code): drei verschiedene Neigungsklemmen; die Reihenfolge der Frühausstiege je Operation; eine unbekannte Zielart rechnet `wende` wie „Höhe", ein Leser, der eine Zahl braucht (Krone, innerer Ring), zählt sie nicht als Höhe; `mitBoeschung` fragen nur die, deren RAND ausläuft (Grube, Schüttung) — bei Böschung und Baugrube IST die Böschung die Operation. Neu ist allein, dass eine nicht endliche Zielhöhe den Knoten überspringt, statt NaN ins Raster zu schreiben.

### Die Böschung folgt dem Planum (Paket B)

„Planum herstellen" schreibt die Böschung als `{ziel: 'flaeche', flaeche: 'op-P'}` — derselbe Mechanismus wie „Auffüllen bis zur Fläche", kein neuer. Dafür nennt das Planum seine Kennung schon in `ausEingabe`: `formwerkzeugFuer` (L3) reicht `neueKennung: neueOperationsId` in den Kontext; die Quelle ist dieselbe wie überall (E2).

**Die Zahl** (Gelände eben 300,00 m NN, Planum 10 × 10 m auf 301,00, Böschung 1 : 2, Höhenversatz 300): ein Knoten 0,75 m ausserhalb des Rands liegt auf 301,00 − 0,75/2 = **300,625**. Nach „Planumshöhe 301,50" auf **301,125** — 0,50 m höher, wie das Planum, mit EINEM Kommando. Vorher blieb er auf 300,625, und am Rand stand eine Stufe von 0,875 m.

**Alte Journale:** eine Böschung ohne `ziel` liest der Auflöser als „Höhe" — dieselbe Rechnung wie immer. Bewiesen gegen `test/fixtures/boeschung-vorher.json` (Massen 144,214237 m³, Feinheit, Bild), erzeugt mit dem Code von vor der Kur. Umgestellt wird ein Journal erst, wenn es ohnehin neu geschrieben wird (`kopienAlsVerweise` in `ableitungsSchritte`, wo alle Neuschreibungen zusammenlaufen) — und nur, was zweifelsfrei eine Kopie ist (fünf Bedingungen, jede einzeln geprüft). Auch ein Journal von vor K2b (Operationen ohne Kennung) wird umgestellt; der Verweis zeigt dann auf die aus dem Inhalt abgeleitete Kennung, die mitgespeichert wird.

**Eine Auslieferung, Schreibstufe 5** („Operationen verweisen aufeinander"): ein älterer Client läse eine Böschung ohne Höhe als `boeschung_ohne_hoehe` — er zeigte das Planum ohne Böschung, mit falschen Massen und falschem IFC, und diese Warnung sieht niemand. Jeder Tab ab 2026-09-18 16:05 liest ein Stufe-5-Journal nur (Banner), der Server-Wächter (R9) hält ältere ab. Preis, offen benannt: bis zum Neuladen kann ein solcher Tab im Lesemodus falsche Massen zeigen — dieselbe Klasse wie bei Stufe 4.

**Was die Probe gefunden hat:** „Kopie und Verweis rechnen dasselbe" war zuerst rot. `wirkflaecheVon` bekam den Kontext nicht und rechnete beim Verweis mit Saum 0 — eine 47-fach kleinere Wirkfläche und damit ein anderer Korridor (0,5 m statt 1 m), also andere Massen. Genau der stille Zahlensprung, der in Teil 1 als grösstes Risiko benannt war. Behoben; die Probe ist jetzt der Wächter davor.

**Zwei überflüssige Bedingungen** sind beim Gegenprobieren aufgefallen (die Höhenprobe deckt sie ab) und wieder herausgeflogen.

### Trägt noch etwas dieselbe Sorte Kopie?

| Stelle | Urteil |
|---|---|
| `bauwerksgrube.leite` (`ableitung/Ableitungen.js:1342`) baut dasselbe Paar Planum + Böschung | **Keine Kopie, die altern kann:** beide Höhen kommen je Lauf aus derselben Variablen und werden nie gespeichert. Nicht umgebaut. |
| Die Böschung kopiert weiterhin den **Umriss** des Planums | **Schlafend:** das Planum hat keine `punktfelder`, es ist heute nicht ziehbar. Sobald es das wird, entsteht derselbe Fehler am Umriss — dann gehört der Umriss ebenso an die Vorgängerin. |
| Der Anzeige-Bauplan trägt `vorgaenge[].titel` (`Bearbeitungen.js:1102`, gelesen in `Bezuege.js:252`, wo die gespeicherte Kopie die abgeleitete schlägt) | **Kopie, die altern kann:** wird ein Vorgang umbenannt, steht in der Anzeige der alte Titel, bis der nächste Vorgang die Liste neu schreibt. Kosmetisch, nicht gebaut. |
| `quellBasis`, Prüfmasse, `raster.cell` | **Keine Kopie, sondern Pfänder** des Drei-Wege-Vergleichs (so entschieden, U8). |

### Was das für das Urteil von Teil 3 heisst

Zwei der drei Punkte aus „Nicht bestanden, ehrlich" sind eingelöst: die Nehmerseite der Zielart ist nicht mehr Code je Operation (eine zweite Operation kostet 7 Zeilen, keine davon fachlich), und die Zustandskopie innerhalb eines Vorgangs ist für das Paar Planum/Böschung weg. Offen bleibt der dritte: **der Stapel hat weiterhin keine eine Faltfunktion.** Es gibt jetzt einen gemeinsamen Helfer für den KONTEXT (`mitVorherigen`, benutzt von Formung, Wirkbereich, Feinheit und Flicken), aber `formeNach` wird weiterhin an fünf Stellen gerufen, jede mit ihrem eigenen Ur und ihrem eigenen Bereich.
