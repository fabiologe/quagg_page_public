> **Stand: VOR Teil XXIII.** Dieser Bericht beschreibt den Code vom 2026-09-18 vormittags. Die meisten Befunde sind seither gebaut (Fahrplan A0–A9, AE, AR; Commits `c24a6a8` … `443919b`). Wörtlich aus dem Gesprächsprotokoll übernommen; Zeilennummern und Dateipfade gelten für den damaligen Stand (u. a. `geometry/` → `ifcleser/`, `ops/Graben.js` → `ops/Profilkoerper.js`).

# Architektur-Audit Quagg-CDE — Befundbericht (Stand 2026-09-18)

Geprüft: `client/src/features/cde` (107 Services, 35 Komponenten, 15 Composables, 11 Stores; 62 400 Zeilen) und `backend/app/ifc`. Der Kern im Sinne des Konzepts ist `services/geometrie` (Kernel + Formen) und `services/bauform` (Bauformen); die Fachschicht sind `gelaende/`, `ableitung/`, `Bauteilrezepte.js`, `Bearbeitungen.js`.

---

## 1 · Typprüfung statt Eigenschaftsprüfung

**B1 · hoch — das Wissen über eine Geländeoperation liegt in fünf Verzweigungen statt in ihrem Tabelleneintrag.**
Die Tabelle [`GELAENDE_OPS`](client/src/features/cde/services/gelaende/Operationen.js#L935) kennt je Operation nur `titel` und `wende`. Alles andere fragt per `art`:
- Wirkbereich: [`wirkbereichVon`](client/src/features/cde/services/gelaende/Operationen.js#L636) — `if (art === 'gerinne') … else if (art === 'planum' || 'boeschung') … else if ('grube' || 'schuettung') … else if ('boeschungLinie')`
- Vorschau: [Ableitungen.js:490–534](client/src/features/cde/services/ableitung/Ableitungen.js#L490-L534) — dieselbe Kette noch einmal
- PredefinedType: [Ableitungen.js:328](client/src/features/cde/services/ableitung/Ableitungen.js#L328), [348–349](client/src/features/cde/services/ableitung/Ableitungen.js#L348-L349)
- Kennhöhen der Böschungskanten: [Boeschungskanten.js:107–113](client/src/features/cde/services/gelaende/Boeschungskanten.js#L107-L113) (`switch (op?.art)`)
- Sohlbreite/Vorschaumaß: [Ableitungen.js:643–644](client/src/features/cde/services/ableitung/Ableitungen.js#L643-L644), und meine eigene Stelle [Ableitungen.js:1000](client/src/features/cde/services/ableitung/Ableitungen.js#L1000) (`ops.filter(o => o.art === 'gerinne')`).

Die Punkt- und Höhenfelder sind dagegen schon Tabellen ([`ERDBAU_PUNKTHOEHEN`](client/src/features/cde/services/ableitung/Ableitungen.js#L57)) — der richtige Weg ist also im Haus. Eine neue Operation kostet heute sieben Stellen in vier Dateien.
*Kleinster Umbau:* der `GELAENDE_OPS`-Eintrag trägt `wirkbereich(parameter)`, `vorschau(parameter)`, `kennhoehen(parameter)`, `punktfelder`, `hoehenfelder`, `predefinedType`; die fünf Ketten werden zu `GELAENDE_OPS[op.art].x(...)`. Wer später `ops.filter(o => o.art === 'gerinne')` schreiben will, fragt stattdessen `GELAENDE_OPS[art].profilfaehig`.

**B2 · mittel — Griffe und Werkzeuge schalten auf Rezeptnamen.**
[`LAGE_REZEPTE = new Set(['linie','rohr','schacht','flaeche'])`](client/src/features/cde/services/Griffe.js#L48), [`erdbauRezepte = new Set(['erdbau','kanalgraben','bauwerksgrube'])`](client/src/features/cde/services/Griffe.js#L57). Ein neues Rezept mit Punkten bekommt keine Griffe, bis jemand die Liste kennt.
*Kleinster Umbau:* das Rezept sagt es selbst — `punkteIn: 'parameter' | 'operationen'` und `lageVerschiebbar: true`; `griffeFuer` liest `rezeptNach(plan.rezept).punkteIn`.

**B3 · mittel — der Mengenreiter entscheidet nach Rezeptname, was „Auftrag“ heißt.**
[IfcEngine.js:4055–4056](client/src/features/cde/services/IfcEngine.js#L4055-L4056): `(b.rezept === 'kanalgraben' || b.rezept === 'bauwerksgrube') ? null : …`, `b.rezept === 'kanalgraben' ? k.verfuellung : null`. Die Eigenschaft steht daneben: `k.verfuellung != null`, bzw. die `menge`-Deklaration des Teils (`compactedVolume` vs. `verfuellung`).
*Kleinster Umbau:* Zeile lesen als `verfuellung: k.verfuellung ?? null, auftrag: k.verfuellung != null ? null : k.auftragRaster`.

**B4 · niedrig — Oberflächenstellen mit Rezeptnamen.** Icon nach Rezept [CdeToolbox.vue:58](client/src/features/cde/components/CdeToolbox.vue#L58); Filter [IfcVolumeTab.vue:227](client/src/features/cde/components/IfcVolumeTab.vue#L227) (`rezept === 'gelaende' || 'anzeige' || …erdbau` — der dritte Teil ist schon eine Eigenschaft, die ersten zwei nicht); Anzeigeform-Regel doppelt in [Bezuege.js:155–157](client/src/features/cde/services/ableitung/Bezuege.js#L155-L157) und [Bauteilrezepte.js:699–700](client/src/features/cde/services/Bauteilrezepte.js#L699-L700). *Umbau:* `icon` ans Rezept, `istAnzeigeform` an einer Stelle.

**B5 · niedrig, bewusst so gebaut — Verhalten nach IFC-Kategoriewurzel.** [Kategorien.js:23–51](client/src/features/cde/services/Kategorien.js#L23-L51) (`istLinear`, `istSchacht`, `istAushub`) steuert die Achsgewinnung im Resolver ([GeometryResolver.js:395](client/src/features/cde/services/geometry/GeometryResolver.js#L395)) und den Längsschnitt ([LaengsschnittBuilder.js:113](client/src/features/cde/services/LaengsschnittBuilder.js#L113)). Das ist das Muster, das die Hausregel vorschreibt (Wurzeln mit Vererbung statt Stringlisten), aber es bleibt eine Typprüfung: ein als `IfcBuildingElementProxy` geliefertes Rohr bekommt keine Achse, obwohl die [`Formsignatur`](client/src/features/cde/services/bauform/Formsignatur.js#L211) es als `achse+profil` erkennen könnte. *Umbau, wenn es weh tut:* Kategorie als Vorschlag, gemessene Bauform als Entscheider.

**Sauber:** die Python-Seite prüft Schema-Eigenschaften (`el.is_a("IfcFeatureElementSubtraction")`, [eigenbau.py:555](backend/app/ifc/eigenbau.py#L555)) und zieht Qto-Vorlagen aus den bSI-Daten — kein Dispatch auf „Kanalgraben“.

---

## 2 · Vererbung statt Komposition

Sauber: 19 Klassen im Client, alle Infrastruktur (Viewer, Repo-Backends, Overlays), keine einzige `extends`-Beziehung; Fachobjekte sind Baupläne (`{rezept, rolle, parameter}`), also Eigenschaftssammlungen. Die `isinstance`-Aufrufe auf der Python-Seite sind JSON-Typkoerzion, keine Bauteilhierarchie.

---

## 3 · Katalog im Code statt in Daten

**B6 · hoch — ein Bauteil ist ein Commit in zwei Dateien, kein Katalogeintrag.**
Jedes Rezept in [Bauteilrezepte.js:508–625](client/src/features/cde/services/Bauteilrezepte.js#L508-L625) trägt Code-Hooks (`baue`, `formAus`, `fachmodell`), jede Ableitung in `Ableitungen.js` dazu `leite`, `vorschau`, `zusatzQuellen`, `predefinedType(fn)`, `name(fn)`. Die Bibliothek sagt es selbst: [„Ein Rezept ist Code, kurze geschlossene Liste im Feature“](client/src/features/cde/services/Bibliothek.js#L9-L16) — Bibliothekseinträge (`{rezept, vorgaben}`) können nur bestehende Rezepte umparametrieren. Ein Regenbecken oder Rechen ist damit kein Datensatz.
Dabei sind Schacht und Rohr geometrisch trivial: `_formAusRohr` = Kreisprofil + Sweep, Schacht = dasselbe mit 16 Ecken ([Bauteilrezepte.js:589, 614](client/src/features/cde/services/Bauteilrezepte.js#L589)).
*Kleinster Umbau:* ein deklarativer Rezepttyp für die einfachen Fälle — `{ bauform: 'achse+profil', profil: {art:'kreis', mass:'dn'} }` → generischer Sweep, `{ bauform: 'koerper', profil: 'kreis', hoehe: 'hoehe' }` → generische Extrusion. `rezeptNach` liefert für beide Sorten dieselbe Schnittstelle; Schacht, Rohr, Linie, Fläche werden Einträge, nur Ableitungen bleiben Code.

**B7 · hoch — der Werkzeugkatalog ist ein Code-Katalog.**
[Bearbeitungen.js](client/src/features/cde/services/Bearbeitungen.js): 47 Einträge, 48 handgeschriebene `anwenden:`-Hooks, 3 080 Zeilen. Die Hülle ist schon deklarativ (`felder`, `bauform`, `gruppe`, `vorbelegung`), der Kern jedes Werkzeugs nicht.
*Kleinster Umbau:* eine datengetriebene Werkzeugart `setzt: ['sohle']` (Parameter schreiben = `erzeugtEintrag` mit `{...parameter, [feld]: wert}`); nur Werkzeuge mit Geometrieregel behalten `anwenden`. Wie viele der 48 das trifft, habe ich nicht gezählt — die `_xSchritte`-Helfer wiederholen sich aber sichtbar.

**B8 · mittel — „schacht“ steht namentlich in 14 Dateien außerhalb des Rezepts.** Icon ([CdeIcon.vue:163](client/src/features/cde/components/ui/CdeIcon.vue#L163)), Plansymbol ([DefaultLineStyles.js:97](client/src/features/cde/services/DefaultLineStyles.js#L97), [VectorStylePresets.js:116](client/src/features/cde/services/VectorStylePresets.js#L116)), PDF-Zeile ([LaengsschnittPdf.js:21](client/src/features/cde/services/LaengsschnittPdf.js#L21)), Fang ([Fangpunkte.js:46](client/src/features/cde/services/Fangpunkte.js#L46), [useEingabe.js:169](client/src/features/cde/composables/useEingabe.js#L169)), Griffe ([useGriffe.js:233–241](client/src/features/cde/composables/useGriffe.js#L233-L241)). Darstellung gehört ans Rezept (`icon`, `symbol`, `laengsschnittZeile`); Fang- und Griffverhalten an eine Eigenschaft („hat Anschlüsse“, `form: 'knoten'`).

**Sauber:** IFC-Wörterbücher erzeugt, nicht von Hand ([data/*.js](client/src/features/cde/data/entity-schema.js)); Regelwerke als Tabellen mit Quelle ([`GRABENREGELN`, `WANDFORMEN`, `AUFLOCKERUNG`](client/src/features/cde/services/gelaende/Grabenregeln.js#L42)); Farben ([`BAUTEILFARBEN`](client/src/features/cde/services/Bauteilfarben.js#L70)); IDS und Qto-Vorlagen als Daten.

---

## 4 · Ebenendurchgriff

**B9 · hoch — der Kern importiert nach oben.**
[Koerper.js:31](client/src/features/cde/services/geometrie/ops/Koerper.js#L31) und [Raster.js:18](client/src/features/cde/services/geometrie/ops/Raster.js#L18) holen `gleicherBezug` aus `../../gelaende/Operationen.js` — die Geometrieschicht kennt die Geländeschicht. *Umbau:* `gleicherBezug` ist ein Rastervergleich; nach `geometrie/ops/Raster.js` ziehen, `Operationen.js` importiert es von dort.

**B10 · hoch — eine Kernel-Operation trägt Fachwissen (mein eigener Beitrag von gestern).**
[geometrie/ops/Graben.js](client/src/features/cde/services/geometrie/ops/Graben.js) heißt Graben, kennt Sohlbreite, Böschung, Stationen und die Regel aus `gerinne`. Der Kern soll nur Körper kennen. *Umbau:* umbenennen und entkleiden zu `profilkoerper({raster}, {bahn: [{x,y,z,halbbreite}], neigung, ausstreichen})` — „Trapez entlang einer Bahn, vom Höhenfeld gedeckelt“; der Kanalgraben übersetzt seine Begriffe in `Ableitungen.js`.

**B11 · mittel — der Geometrie-Resolver kennt IFC-Kategorien und Rohrsemantik.** [GeometryResolver.js:35–36](client/src/features/cde/services/geometry/GeometryResolver.js#L35-L36) importiert `Kategorien.istLinear` und `Achsbezug`. Geometrie sollte Achsen liefern, nicht wissen, dass es Rohre sind.

**B12 · mittel — zwei Wege zur Geometrie: Kernel-Vertrag und Direktimport.** [Ableitungen.js:31–35](client/src/features/cde/services/ableitung/Ableitungen.js#L31-L35) und [Bauteilrezepte.js:43–44](client/src/features/cde/services/Bauteilrezepte.js#L43-L44) importieren `sweep`, `extrudiere`, `rasterAbtasten`, `versetztePunkte`, `umrissFlaeche` direkt aus `geometrie/ops`, obwohl [Kernel.js](client/src/features/cde/services/geometrie/Kernel.js#L2) „EIN Vertrag, drei Backends“ verspricht. Der Vertrag gilt damit nur für die teuren Ops.

**B13 · mittel — `IfcEngine` ist Renderer, Kernel-Wirt, Massenrechner und Geländeleser in einem.** 4 258 Zeilen; Importe aus jeder Schicht ([3, 5, 25–27, 31, 34](client/src/features/cde/services/IfcEngine.js#L1-L40)), darunter gestern meiner (`aushubMasseVon`). `erdmassen` und `gelaendeKandidaten` lesen Rezepte und Kennzahlen. *Umbau:* beides in einen Service, der `autor.ableitungen` liest; die Engine zeichnet.

**B14 · mittel — Griffe und Werkzeuge kennen Rezept-Interna.** [Griffe.js:43](client/src/features/cde/services/Griffe.js#L43), [Bearbeitungen.js:74](client/src/features/cde/services/Bearbeitungen.js#L74) importieren `ERDBAU_PUNKTHOEHEN`/`KOERPERHAFT` aus der Ableitungsschicht. Fällt mit B1/B2 weg.

**Sauber:** keine Querimporte aus anderen Features; von 51 Komponenten und Composables fasst **keine** three.js oder fragments direkt an — die Engine kapselt das Rendering vollständig.

---

## 5 · Aggregation mit fester Tiefe

**Zu früh, um es als Mangel zu werten.** Der Eigenbau-Baum hat zwei feste Ebenen ([Bauwerksstruktur.js:248, 258](client/src/features/cde/services/Bauwerksstruktur.js#L248): Eigenbau → Vorgang → Teil), `ableitung.teile` ist eine flache Liste, der Schreiber gruppiert flach per `IfcRelAssignsToGroup` ([eigenbau.py:594, 767](backend/app/ifc/eigenbau.py#L594)) — bewusst, wegen V08. Die *Abhängigkeitskette* ist dagegen schon rekursiv (ein Kanalgraben aus eigenen Rohren, ein Vorgang auf dem Gelände des vorigen). Es gibt heute kein zusammengesetztes Bauteil (Bauwerk aus Bauteilen); erst dann braucht es `IfcRelAggregates` und einen Baumknoten mit Kindern, die Kinder haben. Vorbereitung kostet nichts: den Baumknoten-Typ nicht auf `VORGANG`/`EIGENBAU` festlegen.

---

## 6 · Redundant gepflegte Außensicht

**B15 · mittel — abgeleitete Werte im Journal, gegen das eigene Gesetz 5.**
[`ableitungsSchritte`](client/src/features/cde/services/Bauteilrezepte.js#L756-L770) schreibt in jeden Teil-Bauplan `kategorie`, `predefinedType` und `name`, obwohl das Rezept alle drei deklariert — `predefinedType` sogar als Funktion der Parameter ([TRENCH/EXCAVATION](client/src/features/cde/services/ableitung/Ableitungen.js#L328), [BACKFILL/SLOPEFILL](client/src/features/cde/services/ableitung/Ableitungen.js#L348-L349)) und `name` als Funktion des Quellnamens. 27 Leser nehmen den gespeicherten Namen, 5 leiten ihn ab. Der Rebase ([JournalRebase.js:82–90](client/src/features/cde/services/JournalRebase.js#L82-L90)) schreibt `quellen` um, `name` nicht — nach dem Umhängen auf ein umbenanntes Gelände heißt der Vorgang weiter nach dem alten. Ändert sich die PredefinedType-Regel, tragen alte Journale den alten Typ.
*Kleinster Umbau:* `kategorie` bleibt gespeichert (Formularfeld, Nutzer darf überstimmen); `predefinedType` und `name` beim Lesen aus dem Rezept ableiten (`titelVon(bauplan)`), gespeichert nur ein ausdrücklicher Nutzername (`nameEigen`). Nachträglich reparierbar, weil die Eingaben im Journal stehen.

**Sauber:** Geometrie, Raster und Massen werden nie gespeichert; `quellBasis` ist ein bewusster Schnappschuss für den Drei-Wege-Vergleich; die Punkthöhen in den Operationen sind Eingabe (Idempotenz), nicht Ableitung.

---

## 7 · Änderungen als Mutation

Der Kern ist sauber: das Journal ist ereignisbasiert (`art`, `vorher`, `nachher`, Faltung „letzter gewinnt“, Commits, Rebase; [useAenderungen.js:759](client/src/features/cde/stores/useAenderungen.js#L759)), Werkzeuge geben Schritte zurück statt zu verändern. Die Zuweisungen in 778/785 bauen den Eintrag, bevor er ins Journal geht. Zwei Befunde:

**B16 · mittel — Planinhalte und Rotstift leben außerhalb des Journals.** [usePlanInhalt.js:90–96](client/src/features/cde/stores/usePlanInhalt.js#L90-L96) (`Object.assign(e, patch); _sichern()`) und [useRotstift.js](client/src/features/cde/stores/useRotstift.js) mutieren und persistieren direkt: kein Undo, keine Version, kein Drei-Wege-Abgleich für Beschriftungen und Anmerkungen. Das Journal kennt schon Arten, die das Modell nicht berühren ([`beruehrtModell`](client/src/features/cde/stores/useAenderungen.js#L777)). *Umbau:* Art `planinhalt` mit `nachher` = Eintrag; die beiden Stores werden Leser des Journals.

**B17 · mittel — Kommandos sind Zustandskopien.** Ein gezogener Knickpunkt schreibt die [VOLLE Operationsliste](client/src/features/cde/services/Bearbeitungen.js#L493), die Anzeige ihre [volle `vorgaenge`-Liste](client/src/features/cde/services/Bearbeitungen.js#L561). Das Journal wächst quadratisch (im Code selbst so benannt), und zwei Bearbeiter, die verschiedene Ecken ziehen, kollidieren auf dem ganzen Vorgang. *Umbau:* Schrittart `parameterpfad` (`pfad: ['operationen', 0, 'umriss', 2]`, `nachher: punkt`) — die Faltung wendet Pfade an; Journalgröße linear, Merge je Ecke.

---

## 8 · Überabstraktion

**B18 · mittel — der Kernel-Katalog deklariert mehr, als er vermittelt.** [Kernel.js:29–45](client/src/features/cde/services/geometrie/Kernel.js#L29-L45): 16 Ops. Über `kernel.op` laufen in Produktion 7 (`rasterDifferenz` 1×, `koerperZwischenRastern` 4×, `grabenkoerper` 1×, `isolinie` 1×, `sweep` 1×, `booleDifferenz` 2×, `kollisionen` 1×). `rasterAusMesh`, `rasterResample`, `drape`, `offset`, `extrudiere` haben keinen Produktionsaufruf über den Vertrag (teils Direktimport, s. B12); `booleVereinigung`, `booleSchnitt`, `huelle` sind serverseitig gebaut ([geometrie.py:38](backend/app/api/projekt/core/geometrie.py#L38)), aber unbenutzt; `cdt` ist deklariert und nicht gebaut. Die drei Backends sind echt angebunden ([IfcEngine.js:398–401](client/src/features/cde/services/IfcEngine.js#L398-L401)) — die Abstraktion trägt also, sie ist nur halb bevölkert. *Umbau:* `cdt`, `drape`, `offset` aus dem Katalog nehmen, bis ein Aufrufer da ist; `sweep`/`extrudiere` entweder durch den Vertrag routen oder ehrlich als Hilfsfunktionen führen.

**Kein Befund, sondern das Gegenteil:** [`ErdbauUmrisse`](client/src/features/cde/services/ErdbauUmrisse.js) ist eine Kopie des Musters [`GelaendeKanten`](client/src/features/cde/services/GelaendeKanten.js) — zwei Anwendungsfälle, richtig *nicht* abstrahiert. `Herleitung.js`, `Beziehungen.js`, `Formen.js` haben je echte Nutzer.

---

## 9 · Bauformen ohne Semantik

Die acht Bauformen ([Bauformen.js:73–124](client/src/features/cde/services/bauform/Bauformen.js#L73-L124)) sind Klassifikationen mit `braucht`; Träger der Zahlen sind die Kernel-Formen ([Formen.js:22–33](client/src/features/cde/services/geometrie/Formen.js#L22-L33)). Zwei Semantiken sind diese Woche dazugekommen und zeigen, wie es aussehen soll: `achsbezug` auf der Rohrachse, `unterkante` am Knoten. Der Rest:

| Bauform / Form | trägt heute | fehlt, damit eine Regel ohne Typwissen greifen kann |
|---|---|---|
| `punkt` / `knoten` `{x,y,z,unterkante?}` | Ort, Sohle | **Höhenbezug von `y`** (Platzierung? Sohle? Deckel?) und `oberkante` — „Rohr schließt unter dem Deckel an“ ist ohne das nicht formulierbar |
| `linie` `{punkte}` | Lage | **Stationierung** (Anfangsstation, Richtung) und Höhenbezug; die Seite einer Böschungslinie liegt im Op-Parameter, nicht an der Linie |
| `achse+profil` (`linie`+`dn`+`achsbezug`) | Nennweite, Höhenbezug | **Stationierung** (Stationen werden an 4 Stellen neu gerechnet), Fließrichtung/Gefälle, **Profilform** (Kreis ist angenommen), Wanddicke (kommt aus dem Formular, nicht von der Achse) — die Mindestgefälleregel braucht zwei Sohlhöhen *und* das Profil |
| `flaeche` (`umriss`) | Ring, Löcher | **Rolle** (Planum, Baufeld, Sohle) und Höhenbezug — eine Fläche ohne Anschlussbedeutung |
| `flaeche+dicke` | — | **hat keine Kernel-Form**; `dicke`, `oberkante`, `unterkante` existieren nirgends als Größe |
| `hoehenfeld` (`raster`) | Zellen, Höhen | **welcher Stand** (Ur, geformt, Planum) — genau hier entstand der Überdeckungsfehler mit drei Aussagen (P2d) |
| `koerper` `{closed, volumen}` | Volumen mit Attest | **Mengenart** (gewachsen / lose / verdichtet) und Rolle — heute im Rezept (`menge`) und Bauplan (`rolle`), nicht am Körper; `mengenVon` braucht deshalb das Rezept |
| `profil` `{punkte:[{u,v}]}` | Kontur | Nennmaß, Wanddicke, innen/außen |
| `netz` | — | absichtlich nichts — sauber |

**B19 · mittel** — die Tabelle als ein Befund: die Formen tragen Zahlen, die Bedeutung liegt im Bauplan und im Rezept. *Kleinster Umbau:* je Form ein optionales `bezug`-Feld wie bei `achsbezug` (Knoten: `hoehenbezug`, Raster: `stand`, Körper: `mengenart`, Fläche: `rolle`), gesetzt von dem, der die Form erzeugt; `pruefeForm` lässt es zu, verlangt es nicht.

---

## 10 · Verhältnis Bauform zu Objekt

Sauber getrennt auf der Ebene Bauform: die Bauformen sind gemessene Klassifikationen ([`bauformAusNetz`](client/src/features/cde/services/bauform/Formsignatur.js#L228)) und halten keinen Platzierungszustand. Vorlage und Instanz existieren als Konzept — Bibliothekseintrag `{rezept, vorgaben}` gegen Bauplan `{rezept, parameter}` — aber:

**B20 · mittel, nicht nachholbar — die Instanz vergisst ihre Vorlage im Moment des Anwendens.**
[Bearbeitungen.js:2247–2256](client/src/features/cde/services/Bearbeitungen.js#L2247-L2256): die `vorgaben` werden in `parameter` kopiert, die Vorlagen-Id wird nirgends gespeichert. Danach weiß niemand, dass dieser Schacht „Schacht DN 1000“ war; eine geänderte Vorlage lässt sich nicht nachziehen, eine Abweichung nicht zeigen. Das Gegenmuster steht im selben Haus: [`grabenbreite`](client/src/features/cde/services/gelaende/Grabenregeln.js#L155) merkt sich `eigene` Sohlbreite *und* meldet die Abweichung von der Norm.
*Kleinster Umbau:* `parameter.vorlage = vorlage.id` in Zeile 2253; Abweichung zur Lesezeit berechnen (`vorgaben` gegen `parameter`), Instanz darf frei abweichen, Bezug bleibt.

**B21 · mittel — der Typ erreicht das IFC nicht.** Weder [IfcAutor.js](client/src/features/cde/services/IfcAutor.js) noch [EigenbauPaket.js](client/src/features/cde/services/EigenbauPaket.js) noch [eigenbau.py](backend/app/ifc/eigenbau.py) schreiben `IfcRelDefinesByType`/`Ifc…Type`. Jede Instanz trägt alle Eigenschaften selbst; das, was die Bibliothek als Typ modelliert, gibt es in der Datei nicht. Folgt aus B20: erst mit gespeicherter Vorlagen-Id kann der Schreiber je Vorlage ein Typobjekt anlegen.

---

## Reihenfolge nach den Kosten, wenn wir es erst in sechs Monaten anfassen

| # | Befund | warum es dann teuer ist |
|---|---|---|
| 1 | **B20** Vorlagenbezug verloren | **einziger Befund ohne Rückweg**: jede in sechs Monaten platzierte Instanz ist dann für immer vorlagenlos; keine Ableitung kann den Bezug rekonstruieren |
| 2 | **B6 + B7** Rezepte und Werkzeuge als Code | der Stil, in dem jede Woche neue Einträge entstehen; jeder neue Eintrag vergrößert die spätere Umschreibung (heute 47 Werkzeuge, 3 080 Zeilen) |
| 3 | **B16** Planinhalte/Rotstift außerhalb des Journals | zweites Persistenzmodell in echten Projekten; später zusammenführen heißt migrieren, während Nutzer Undo erwarten |
| 4 | **B17** Kommandos als Zustandskopien | Journale wachsen quadratisch in jedem Projekt; das Format ist die Wahrheit, ein Wechsel braucht eine Faltung, die beides versteht |
| 5 | **B1 + B2 + B14** Op-Wissen in fünf Ketten, Rezeptlisten in Griffen | linear mit jeder neuen Operation; heute ein Tabellen-Refactor |
| 6 | **B15** abgeleitete Werte im Journal | reparabel durch Ableiten beim Lesen — deshalb erst hier |
| 7 | **B9 + B10 + B11 + B13** Kern importiert nach oben, Graben im Kern, Engine als Sammelbecken | Code-Schulden ohne Datenanteil; wachsen mit der Engine |
| 8 | **B12 + B18** Kernel-Vertrag halb bevölkert und umgangen | billig, solange die Zahl der Ops klein ist |
| 9 | **B19** Formsemantik | je Form ein Feld; teuer wird nur, was inzwischen als Bug auftritt (siehe Überdeckung) |
| 10 | **B3, B4, B5, B8** Namensprüfungen an der Oberfläche | kosmetisch, mit B6 erledigt |
| — | K2 sauber; K5 zu früh | |

## Die eine Stelle, die zuerst umgebaut werden muss

**[Bearbeitungen.js:2253](client/src/features/cde/services/Bearbeitungen.js#L2253) — `const parameter = { ...plan.parameter, ...vorgaben };` bekommt ein `vorlage: vorlage.id`.**

Nicht, weil es der größte Umbau ist — es ist der kleinste im ganzen Bericht. Sondern weil es der einzige Befund ist, dessen Schaden sich nachträglich nicht mehr beheben lässt: bei allen anderen stehen die Eingaben im Journal, und ein späterer Umbau kann daraus ableiten, migrieren oder falten. Hier wird Wissen im Moment des Anwendens weggeworfen, und jede Instanz, die bis zum Umbau entsteht, bleibt vorlagenlos — die Bibliothek ist seit dem 2. September live. Mit dem Bezug in der Instanz werden drei weitere Befunde erst möglich: Abweichung von der Vorlage zeigen, Vorlagen nachziehen, Typobjekte ins IFC schreiben (B21).

Direkt danach, als erster *struktureller* Schritt: `GELAENDE_OPS` zur einen Tabelle machen, die alles über eine Operation weiß (B1). Das ist die Vorlage für den großen Umbau B6 — Bauteile als Daten — und zeigt im Kleinen, ob das Konzept trägt, bevor 47 Werkzeuge daran hängen.
