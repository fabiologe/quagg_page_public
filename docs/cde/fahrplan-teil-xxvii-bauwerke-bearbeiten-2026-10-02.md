# Teil XXVII — Bauwerke bearbeiten

**Fahrplan, Stand 2026-10-02. Geplant, nicht gebaut.** Halt nach diesem Dokument;
gebaut wird erst nach Freigabe der Entscheidungen E24–E30.

Grundlage: Teil XXVI ([fahrplan-teil-xxvi-bauwerke-2026-10-01.md](fahrplan-teil-xxvi-bauwerke-2026-10-01.md))
hat Bauwerke **erzeugbar** gemacht — Kammer und RÜB stehen nur über Kommandos im IFC.
Dieser Teil macht sie **bearbeitbar**: als Ganzes bewegen, Teile, die einander folgen,
Öffnungen, die eine Öffnung sind, Griffe, die aus dem Katalog entstehen. Pfade relativ
zum Repo; jede Aussage sagt, ob sie **gemessen** oder **gelesen** ist.

---

## 0 · Das Ziel in einem Satz

Wer die Bodenplatte einer Kammer anhebt, die Kammer um 10 m verschiebt oder ein Rohr
durch ihre Wand führt, tut das mit **einem** Kommando — und alles, was daran hängt,
folgt, ohne dass ein Werkzeug den Bauteiltyp kennt.

---

## 1 · Vorprüfung — was heute geht (gemessen 2026-10-02)

Gemessen mit `passende` (Werkzeugleiste), `griffeFuer` (Griffe im Raum) und `fuehreAus`
(Kommandoweg) am RÜB aus Z9.2 (`test/hilfen/ruebKommandos.js`).

**Angebot je Bauteil** (Werkzeugleiste, eigenes Bauteil):

| Bauteil | Werkzeuge | Lage und Form | Griffe im Raum |
|---|---|---|---|
| Wand | 28 | verschieben, kopieren, drehen, spiegeln, Stützpunkt verschieben / einfügen / entfernen, Linie trimmen / versetzen / umkehren, Kante verschieben | 4 Stützpunkt, 1 Kante, 1 Kante +, 1 Drehung |
| Platte | 18 | verschieben, kopieren, drehen, spiegeln | 8 Stützpunkt, 4 Stützpunkt −, 4 Kante, 4 Kante +, 1 Drehung |
| Raum | 22 | wie Platte, dazu Reihe | wie Platte |
| Überlaufschwelle | 29 | wie Wand | wie Wand |
| Bauwerk | 11 | verschieben, löschen | **keine** |

Dazu an jedem Bauteil die Werte aus seinem Rezept („… ändern") und die Ableitungen
„Aussparung ableiten", „Baugrube ums Bauwerk".

**Funde:**

| # | Fund | Art | Beleg |
|---|---|---|---|
| **1** | **Werkzeugleiste und Griff sind sich an der Platte uneinig.** Die Eckgriffe der Platte rufen `stuetzpunkt-verschieben`; die Werkzeugleiste bietet es nicht an (Bauformliste ohne `flaeche+dicke`). Der Griff umgeht `passende` (`useBearbeitung.starte`: „wer ein Subjekt hereinreicht, bürgt dafür") — und das Kommando läuft durch | Unstimmigkeit | gemessen: Ecke 0 der Bodenplatte über `fuehreAus` gezogen, (0 \| 210 \| 0) → (−0,5 \| 210 \| −0,5) |
| **2** | **Ein Kanalgraben an einer Wand wird angenommen.** `kanalgraben-ableiten` braucht nur `achse+profil` — eine Wand hat das. Abgelehnt wurde das Kommando allein an der Zahl der Kennungen („neu nennt 6 mehr, als entstehen") — mit der richtigen Zahl entstünde ein Graben entlang der Wandachse, eine Wand als Rohr | **Fehler, heute** | gemessen |
| **3** | **Ein Erdbau-Werkzeug am Raum** (`erdbau-stuetzpunkt-verschieben`, Bauform `koerper`) wird angeboten und lehnt dann mit einer Adress-Meldung ab („ein Punkt wird über seine Lage angesprochen") statt mit dem Grund („nur an einem Erdbau-Vorgang") | Unstimmigkeit | gemessen |
| **4** | **Ein Bauwerk lässt sich nicht verschieben**, obwohl das Werkzeug angeboten wird: Vorbelegung (0 \| 0 \| 0), Ablehnung „Dem Bauteil fehlt der Bezug für diese Bearbeitung". Kopieren, drehen, spiegeln gibt es am Bauwerk gar nicht | Lücke | gemessen |
| **5** | **Die Aussparung zerstört den Bauplan der Wand.** Sie verdeckt die Wand (`geloescht`) und setzt ein abgeleitetes Teil `IFCWALL` „(mit Aussparung)" an ihre Stelle — **ohne** `teilVon`, ohne Merkmalsfelder, ohne Ausführung, ohne deklarierte Mengen. Die Wand fällt aus ihrem Bauwerk. Im IFC ist das Ergebnis ein Netz aus der Server-Differenz, kein `IfcOpeningElement` | **Fehler, heute** | gemessen (Journal); IFC gelesen (`Ableitungen.js`, `aussparung.leite` → `booleDifferenz`) |
| **6** | **Teile folgen einander nicht.** Bodenplatte um 1 m verschoben → Längswand Süd bleibt bei (0 \| 210 \| 3,45). Die Wand kennt ihre Platte nicht; ihre Punkte sind absolute Kopien | Lücke | gemessen |

**Was schon richtig bereitliegt:**
- Der Schreiber kennt Wirt-Beziehungen (`IfcRelVoidsElement` für den Aushub,
  `eigenbau.wirte_herstellen`). Eine Öffnung braucht dieselbe — nur für eine andere Klasse.
- Der Auflöser „Sollhöhe am Ort" (`gelaende/Sollhoehe.js`, Teil XXIV-4) und das Muster
  „Verweis statt Kopie, beim Anfassen umgestellt" (`kopienAlsVerweise`) gibt es für
  Geländeoperationen. Teile von Bauwerken brauchen dasselbe für Höhen.
- „Ecken als Maß" (`gelaende/Eckmasse.js`, Teil XXII) leitet Griffe aus Daten ab —
  für Erdbau-Operationen. Rezeptfelder können es genauso.
- Die Kandidaten `eigene:bauwerk` und `teilVon` (Teil XXVI) sagen, welche Teile zu
  einem Bauwerk gehören.

---

## 2 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Verworfen |
|---|---|---|---|
| **E24** | **Was heißt „ein Bauwerk verschieben / kopieren / drehen / spiegeln"?** | **Auffächern:** dasselbe Werkzeug, angewandt auf jedes Teil mit `teilVon` = Bauwerk, mit DEMSELBEN Versatz bzw. derselben Drehung um denselben Bezugspunkt (Schwerpunkt aller Teile). Ein Kommando, ein Vorgang, ein Rückgängig. Beim Kopieren bekommen Bauwerk UND Teile neue Kennungen (`neu`), die Kopie ist ein eigenes Bauwerk | Ein eigenes „Bauwerk verschieben"-Werkzeug je Behälter: dieselbe Rechnung zweimal |
| **E25** | **Welche Verweise zwischen Teilen?** | Zuerst **nur Höhen**: der Fuß einer Wand (oder eines Fundaments) und der Boden eines Raums dürfen auf die **Oberkante eines anderen Bauteils** zeigen (`hoeheVon: { bauteil: 'cde-BP', mass: 'oberkante' }`), die Unterkante einer Decke auf die Oberkante einer Wand. Lage-Verweise (Wandachse folgt Plattenrand) erst, wenn die Höhen tragen | Alles auf einmal (Lage + Höhe + Maß): drei Auflöser, ein Abnahmefall |
| **E26** | **Wie entsteht ein Verweis?** | Beim Zeichnen über den **Fang**: ein Punkt, der auf einer Plattenoberkante landet, trägt den Verweis (wie heute `{knoten}` beim Rohr, K8). Bestand wird beim Anfassen umgestellt (Muster `kopienAlsVerweise`), nie vorher | Ein Assistent „Teile verknüpfen" nachträglich: ein Arbeitsschritt, den niemand macht |
| **E27** | **Was ist eine Öffnung?** | Ein **eigenes Rezept** `oeffnung` — Profil (Rechteck / Kreis) × Tiefe, Klasse `IFCOPENINGELEMENT`, Pflichtverweis `wirt` auf das Bauteil. Der Schreiber hängt sie per `IfcRelVoidsElement` an den Wirt, nie in die Raumgliederung (Where-Rule NotContained). Die Wand behält ihren Bauplan; ihre **Menge** `NetVolume` zieht die Öffnungen ab, `GrossVolume` nicht | Die heutige Aussparung (Fund 5) weiter benutzen; sie bleibt für **gelieferte** Körper, an eigenen Bauteilen wird sie nicht mehr angeboten |
| **E28** | **Wie sieht man eine Öffnung im Raum?** | Durchscheinend, als Körper in Katalogfarbe — fragments schneidet nicht, und eine Boolesche Differenz im Browser gibt es nicht (Teil XXI). Der Lageplan zeichnet sie als Umriss in der Wand | Server-Differenz nur fürs Bild: Wartezeit bei jedem Zug |
| **E29** | **Woher kommen Griffe?** | Aus dem **Feld**: ein setzbares Maß erklärt seinen Griff (`griff: { richtung: 'y', von: 'fuss' }` für die Wandhöhe, `{ richtung: 'quer' }` für die Dicke). `Griffe.js` liest die Erklärung — ein neues Rezept bekommt seine Griffe ohne Code | Griffe je Rezept in `Griffe.js`: wächst mit jedem Rezept |
| **E30** | **Bauwerk-Vorlagen (Rechteckkammer, Zweikammer-RÜB)?** | **Nicht in diesem Teil.** Sie werden erst sinnvoll, wenn Verweise (E25) tragen — sonst ist „lichte Länge ändern" eine Neuauswertung, die jede Handarbeit an den Teilen überschreibt. Benannt in Abschnitt 7 | Jetzt bauen: ein Makro ohne Verweise |

---

## 3 · Leitplanken

1. **Erst messen, dann bauen.** Jede Stufe beginnt mit dem Zahlenwert von heute.
2. **Ein Kommando, ein Vorgang, ein Rückgängig** — auch wenn es zwölf Teile bewegt.
3. **Kein Werkzeug kennt einen Bauteiltyp.** Gefragt wird nach Eigenschaften (AE) und
   Rezeptdeklarationen; ein neuer Wächterfall in `architekturWaechter.test.js`, wenn nötig.
4. **Alte Journale bleiben lesbar.** Neue Felder (`hoeheVon`, `wirt`) sind additiv; eine
   neue Bedeutung bekommt eine Schreibstufe (7) und eine Auslieferung, wie Stufe 6.
5. `backend/app/ifc/*` wirkt sofort — Schreiberstufen treffen das Gold aus Teil XXVI.
6. Ein Commit je Stufe mit Test und Gegenprobe. Kein Build, kein Push, kein pm2 ohne Zuruf.
7. Wird Kern über die genannten Stellen hinaus nötig → Befund, anhalten.

---

## 4 · Die Stufen

| Stufe | Inhalt | Fund | Art | Halbtage |
|---|---|---|---|---|
| **B0** | Messen und einfrieren: die sechs Funde als Tests mit ihrem heutigen Ergebnis | alle | Test | 1 |
| **B1** | Angebot = Ausführung: Werkzeugleiste, Griff und Kommando fragen dieselbe Regel | 1, 2, 3 | Kern klein | 2 |
| **B2** | Das Bauwerk als Ganzes: verschieben, kopieren, drehen, spiegeln | 4 | Kern | 3 |
| **B3** | Öffnungen: Rezept `oeffnung`, Wirt, `IfcRelVoidsElement`, Nettomenge | 5 | Kern + Schreiber | 4 |
| **B4** | Rohrdurchführung: Öffnung aus Rohrachse ∩ Wand | — | Ableitung | 2 |
| **B5** | Höhen folgen: `hoeheVon` (Fuß auf Oberkante), Fang, Bestand beim Anfassen | 6 | Kern | 4 |
| **B6** | Griffe aus Feldern | — | Kern klein + Katalog | 2 |
| **B7** | Abnahme: die Kammer bearbeiten, nur über Kommandos; Browserprobe | — | Test + Browser | 2 |
| | | | **Summe** | **20** |

### B0 · Messen und einfrieren

Je Fund ein Test mit dem Ergebnis von heute (`test/bauwerkeBearbeiten.test.js`), über
`fuehreAus` am RÜB-Helfer. Die Stufe, die einen Fund behebt, dreht die Erwartung um.

### B1 · Angebot = Ausführung (Funde 1–3)

- `werteAus` prüft dieselbe Eignung wie `passende` (Bauform, Eigenschaften, `nurEigene`,
  `nurRezept`). Lehnt ein Werkzeug ab, sagt es den Grund aus `warumNicht` — nicht eine
  Adress- oder Kennungsmeldung (Fund 3).
- Der Griff (`starte` mit Subjekt) fragt dieselbe Regel; Fund 1 wird entschieden, indem
  `stuetzpunkt-verschieben`, `stuetzpunkt-einfuegen/-entfernen`, `kante-verschieben`
  die Bauform `flaeche+dicke` bekommen — der Griff kann es, also darf die Leiste es zeigen.
- `kanalgraben-ableiten` verlangt `netzrolle:kante` (Fund 2). Eine Wand hat eine Achse,
  aber keine Netzrolle.
- **Zahl:** Werkzeuge, die die Leiste anbietet und das Kommando ablehnt, je Bauteil der
  Kammer → 0 (heute mindestens 3: Kanalgraben an der Wand, Erdbau-Stützpunkt am Raum,
  Verschieben am Bauwerk). Gemessen über alle Kandidaten von `passende` mit Vorbelegung.

### B2 · Das Bauwerk als Ganzes (Fund 4, E24)

- Ein Behälter-Subjekt (`istBehaelter`) bekommt die Lage-Werkzeuge über **Auffächerung**:
  `anwenden(bauwerk, werte)` = für jedes Teil mit `teilVon` das Werkzeug mit dem Versatz
  bzw. der Drehung um den gemeinsamen Bezugspunkt; Vorbelegung = Schwerpunkt aller Teile.
  Eine Funktion für alle vier Werkzeuge, angesiedelt bei der Auswertung, nicht je Werkzeug.
- Kopieren: neue Kennungen für Bauwerk und Teile; Räume und Zerlegung gehen mit, das
  Original bleibt unberührt. Untergeordnete Bauwerke (Anlagenteil, Baugruppe) fächern mit.
- Griff am Bauwerk: ein Verschiebe- und ein Drehgriff am Bezugspunkt.
- **Zahl:** Kammer +10 m Ost → 7 Teile um genau 10,000 m verschoben, Beton 22,164 m³
  unverändert, 1 Vorgang, 1 Rückgängig stellt alle 7 her. Kopie → 2 Bauwerke, 14 Teile.

### B3 · Öffnungen (Fund 5, E27, E28)

- Rezept `oeffnung` in `rezept/Eingebaut.js`: Profil `rechteck` (Breite, Höhe) oder
  `kreis` (Durchmesser), Tiefe = Dicke des Wirts (Vorgabe), Kategorie `IFCOPENINGELEMENT`,
  Pflichtverweis `wirt`. Gezeichnet mit einem Punkt AUF der Wand (Fang an der Wandfläche).
- Das Tor aus Teil XXVI (Z1) lässt `IFCOPENINGELEMENT` nur über dieses Rezept zu.
- Schreiber: Öffnung mit `wirt` → `IfcRelVoidsElement`, nicht enthalten, nicht zerlegt;
  die Regel aus `wirte_herstellen` gilt für jede `IfcFeatureElementSubtraction`, nicht nur
  für den Aushub (`Kategorien.istAushub` wird zur Frage nach der Wurzelklasse).
- Mengen: Wand `NetVolume` = Körper − Σ Öffnungen (Prisma, im Client gerechnet),
  `GrossVolume` = Körper. Methode `koerper`, wie in Z4.
- „Aussparung ableiten" wird an eigenen Bauteilen nicht mehr angeboten (bleibt für
  Geliefertes). Bestehende Aussparungen in Journalen bleiben lesbar.
- **Zahl:** Öffnung Ø 0,30 m in der Längswand Nord (0,30 m dick) → im IFC 1
  `IfcOpeningElement`, 1 `IfcRelVoidsElement` an der Wand; Wand bleibt im Bauwerk;
  NetVolume 3,450 − π · 0,15² · 0,30 = **3,429 m³** (3,428 794), GrossVolume 3,450;
  Prüftor 0, IDS 0 von 18.

### B4 · Rohrdurchführung

- Ableitung `durchfuehrung`: Quellen `rohr` (Achse, DN) und `wand`; Ergebnis eine
  Öffnung (B3) am Schnittpunkt der Achse mit der Wand, Durchmesser DN + 2 · Ringspalt
  (Feld, Vorgabe 0,05 m), Richtung der Achse. Bewegt sich das Rohr, folgt die Öffnung.
- **Zahl:** Rohr DN 300 quer durch die Längswand → Öffnung Ø 0,40 m, Mitte auf der
  Rohrachse ± 1 mm; Rohr um 1 m verschoben → Öffnung folgt, Kennung bleibt.

### B5 · Höhen folgen (Fund 6, E25, E26)

- Bauplan-Feld `hoeheVon: { bauteil, mass: 'oberkante' | 'unterkante' }` an Wand,
  Streifenfundament, Raum, Platte. Der Rezeptbau löst ihn beim Bauen auf (Form `umriss`
  des Bezugs liefert Ober- und Unterkante — seit Fund 12 für jeden eigenen Körper).
- Fang beim Zeichnen: landet der Fuß auf einer Plattenoberkante, trägt der Bauplan den
  Verweis. Bestand: beim Anfassen umgestellt, wenn die kopierte Höhe genau die Oberkante
  ist (Muster `kopienAlsVerweise`).
- Kreisschutz: ein Verweis auf sich selbst oder im Kreis wird abgelehnt (`pruefeBezuege`).
- Schreibstufe 7 (neue Bedeutung: ein Teil ohne eigene Höhe), eine Auslieferung.
- **Zahl:** Bodenplatte +0,20 m → vier Wände und der Raum mit Fuß 210,20, die Decke mit
  Unterkante 212,70 (wenn sie auf die Wände zeigt); kein zweites Kommando.

### B6 · Griffe aus Feldern (E29)

- Feldschlüssel `griff` im Katalogschema (`richtung: 'y' | 'quer' | 'laengs'`, `von`);
  `Griffe.js` erzeugt je erklärtem Feld einen Maßgriff, der den Setzer des Feldes ruft.
- Wand: Höhe (y, vom Fuß), Dicke (quer). Platte: Dicke. Raum: lichte Höhe. Schwelle: Höhe.
- **Zahl:** Griffe der Wand 7 → 9; ein Bibliotheksrezept nur aus JSON mit `griff` am Feld
  bekommt seinen Griff ohne Codezeile (Beweis wie A5).

### B7 · Abnahme

1. Die Kammer, nur über Kommandos: verschieben (+10 m), kopieren, Bodenplatte +0,20 m
   (Wände folgen), Öffnung Ø 0,30 in der Längswand, Rohrdurchführung DN 300; dann
   Rückgängig Schritt für Schritt bis zum Anfang. Paket und IFC nach jedem Schritt.
2. Browserprobe (Ablauf wie Z9.4, Konto `claude-bearb2`, ohne Projekt): dieselbe Folge
   mit Griffen statt Konsole, wo es Griffe gibt.

---

## 5 · Zwischenstände

- **Nach B1 (≈ 1½ Tage):** die Werkzeugleiste lügt nicht mehr — was angeboten wird, läuft.
- **Nach B3 (≈ 5 Tage):** Öffnungen sind IFC-richtig; die Aussparung verliert keine Wand
  mehr aus dem Bauwerk. Für sich auslieferbar.
- **Nach B5 (≈ 8 Tage):** die Kammer verhält sich wie ein Bauwerk: verschieben als Ganzes,
  Platte anheben, Wände folgen.

**Heute realistisch:** B0 und B1.

---

## 6 · Was nicht gebaut wird

- Lage-Verweise (Wandachse folgt Plattenrand), Maß-Verweise (lichte Länge) — nach B5,
  wenn die Höhen tragen.
- Bauwerk-Vorlagen „Rechteckkammer", „Zweikammer-RÜB" (E30) — eigener Teil, braucht B5.
- Boolesche Differenz im Browser, Wandverschneidung an Ecken (Gehrung), Wandanschluss-
  Automatik — Wände bleiben stumpf gestoßen, wie in der Kammer.
- Ports (S8) und die Zerlegung des Schachts (E21) — weiter offen aus Teil XXVI.

## 7 · Danach

Wenn B5 trägt, sind **Bauwerk-Vorlagen** der nächste große Hebel: eine Vorlage ist dann
eine Kommandofolge mit Verweisen und benannten Maßen (lichte Länge, Breite, Höhe,
Wanddicke), gespeichert am Bauwerk (`vorlage: { id, werte }`). „Lichte Länge 4,00 → 5,00"
wertet die Vorlage neu aus; die Teile behalten ihre Kennungen (Zuordnung über ihre Rolle
in der Vorlage), Handänderungen an Teilen werden als Abweichung gezeigt, nicht still
überschrieben. Vorbild ist der Vorlagenbezug aus Teil XXIII (A1).
