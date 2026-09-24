# Etappe „Tragfähig" — 2026-09-24

Anlass: Kassensturz nach der Viewer-Kur (Plan `irgendwie-ist-der-viewer-wild-umbrella.md`, Teil C/D).
Vor „Körper bearbeiten" (Teil B) zuerst: nichts darf still falsch sein, die CI muss ehrlich
laufen, und am echten Testmodell müssen Längsschnitt und Gelände funktionieren.

Gemessen: Vitest (Client), pytest (Server, IFC), Browserprobe projektlos auf `127.0.0.1:3001`
(IndexedDB im Wegwerfprofil, kein `?projekt=`). Jede neue Prüfung lief zur Gegenprobe
gegen den alten Stand und war dort rot.

## Zahlen

| Stufe | Größe | vorher | nachher |
|---|---|---|---|
| T0 | CDE-Suite (Client) | 303 Dateien · 3405 grün + 1 Timeout (allein grün) · 6 übersprungen | 305 · 3432 grün · 6 übersprungen |
| T1 | IDS-Vorschau: Score bei gescheitertem Datenlesen | 1 (bestanden) | `null` = ungeprüft, nicht bestanden |
| T2 | `erzeugeAlle`: `ok:true` bei gescheitertem `applyChanges` | 100 % | 0 % |
| T3 | PUTs nach gescheitertem Erstladen des Repos | ≥ 1 („leer + neu" über den Server) | 0, Journal liest nur, Banner |
| T3 | Satz-Migration bei unerreichbarem Server | Marke gesetzt, läuft nie wieder | keine Marke |
| T3 | Cache nach gescheitertem PUT | Phantomwert | alter Wert |
| T4 | unlesbare Repo-Datei im GET | fehlt still | `@unlesbar: [key]` + Log |
| T4 | PUT auf unlesbares Journal | 200, überschrieben | 409, Datei unverändert |
| T4 | Dokument entfernen bei unlesbarem Journal | erlaubt | 422 mit Grund |
| T5 | CI-Läufe „IFC-Waechter" | 4/4 rot (`app.mcp` fehlt im Repo) | offen bis zum Push |
| T6 | ProVI-Modell: Achsen / Knoten | 0 / 0 | 17 / 19 |
| T6 | Längsschnitt-Knopf | gesperrt („keine Haltungsachsen") | frei, Strang wird gezeichnet |
| T6 | Prüfliste | 0 Befunde | 9 an 8 Bauteilen |
| T7 | Geländepixel nach „Ausheben" (4 Punkte außerhalb der Grube) | (32,41,50) = Hintergrund | (111,109,103) = Gelände |
| T7 | Fanghöhe am selben Punkt | 0,711 | 0,711 (Gegenprobe: unverändert) |

Bilder: `viewer/bilder/t6-provi-vorher.png`, `t6-provi-laengsschnitt.png`,
`t7-ausheben-vorher-einseitig.png`, `t7-ausheben-nachher-zweiseitig.png`.

## Was gebaut ist

- **T1** `services/IdsValidator.js`: Fetch-Fehler je Kategorie → `ungeprueft` je Regel, `summary.ungeprueft`,
  `score = null`. `IfcQualityTab.vue` zeigt „ungeprüft" (rot) statt einer Prozentzahl.
- **T2** `services/IfcAutor.js` `erzeugeAlle`: wirft `applyChanges`, sind alle Teile `ok:false`
  (`anwenden_gescheitert: …`); kein zweiter Auftrag (das Delta hat die Elemente schon).
- **T3** `services/RepoFacade.js` (Remote- und Büro-Backend): scheitert das **erste** Laden, sperrt
  sich das Backend bis zum Neuladen (`unerreichbar`), `set`/`delete` schicken nichts. `getFrisch`
  wirft (Mehrbenutzer-Wächter liest „unerreichbar" nicht mehr als „nichts da"). Cache erst nach
  erfolgreichem PUT/DELETE. `useAenderungen._ladeEbene` → `nurLesen` mit Grund; `kopiereSatz` prüft
  das Ergebnis von `set`; `SatzMigration` setzt die Marke nur, wenn sie sitzt; Banner im Viewer.
  `get` behält seinen Vertrag (`null`) — 20+ Aufrufer bleiben unverändert und sind trotzdem geschützt,
  weil ihre späteren `set` abgewiesen werden.
- **T4** Server `core/cde.py`: `_ablage_lesen` meldet unlesbare Dateien unter `@unlesbar` (`@` ist in
  keinem Schlüssel erlaubt) und loggt; `_journal_waechter` weist unlesbare Journale ab (409);
  `_globalids_der_datei` unterscheidet „fehlt" von „unlesbar"; `journale_mit` rät nicht bei
  unlesbarem Journal. `ifc/verbund.py`: `fremde_projekte_entfernt` zählte auch Gescheiterte —
  jetzt ehrlich, dazu `fremde_projekte_geblieben`. **Server-Teil wirkt erst nach `pm2 restart quagg-api`.**
- **T5** `.gitignore`: `backend/app/mcp/{__init__,ifc_tools,ifc_server}.py` im Repo (gelesen, keine
  Geheimnisse). Workflow: `shell: bash` (= `-eo pipefail`; `false | tee` gab vorher 0).
  Projekt-Tests laufen in der CI **nicht**: ihr conftest zieht `app.api.flood2D.env_util` und die
  Pedant-Datenbank nach, beides nicht im Repo (gemessen an einem `git archive`-Abzug).
- **T6** `services/ifcleser/Achsen.js` + neu `AchsenAusMerkmalen.js`: Proxys, die eine Bauformregel zur
  Netzrolle macht, werden Knoten/Kanten. Ort aus dem Merkmalssatz; **welche** Merkmale, sagt die Regel
  (`knotenAus`, `achseAus` an `provi-schacht`/`provi-haltung`, geprüft im Katalog). Kein `PVI_` im
  Leser (Wächter). Regeln und Profilsatz kommen per `engine.setzeNetzregeln` vor jedem `leseAchsen`.
  Achsbezug der Herkunft `merkmale` = Sohle (`Achsbezug.achsbezugVon`). Was nicht verortbar ist,
  steht im Import-Befund. Nebenbefund behoben: die Klassenwurzeln nahmen den eingebauten statt den
  wirksamen Profilsatz.
- **T7** `Bauteilfarben.GELAENDE_FARBE.zweiseitig` → `IfcAutor._materialFuer` setzt `DoubleSide`.
  Ursache im Browser bestätigt: `side` im laufenden Bild umgeschaltet → Fläche sofort da.
  `Ableitungen` (Anzeige): nicht lesbare Lieferung → Warnung `anzeige_raster` statt stillem Raster.

## Befunde in den Daten (keine Codefehler)

- **Schacht „20" fehlt im ProVI-Export.** Die Haltung #186246 läuft von 19 nach 20; die Datei führt nur
  die Schächte 1–19. Deshalb 17 statt 18 Achsen, Schacht 19 ohne Anschluss. Steht im Import-Befund.
- **Gegenprobe der Achsen gegen den Exporteur:** Gefälle = `PVI_GEFAELLE_PM` auf 0,01 ‰; Länge =
  `PVI_ELEMENT_LAENGE` (waagerecht) auf die Neigung umgerechnet (z. B. 218,486 m · √(1 + 0,0416²) =
  218,67 m, gelesen 218,68 m). „Länger als üblich" an 6 Haltungen (100–219 m) ist also echt.
- **„Durchdringt Haltung [0,00 m]"** an zwei Haltungen stammt aus dem Beziehungsindex der
  **gelieferten Netzgeometrie** (Art `schnitt`), nicht aus den neuen Achsen. Welches Paar: nicht nachgesehen.

## Offen

- **pm2-Neustart** für T4 (Server) — erst mit Fabios OK.
- **CI grün** ist erst nach dem Push messbar (T5); lokal: 175 IFC-Tests sammeln sich aus einem
  `git archive`-Abzug, `test_mcp_werkzeuge` grün.
- **T6c** Sohl-/Deckelgriffe am ProVI-Proxy: brauchen Typprofil-Felder (`Griffe.js:243`). Eine Regel
  müsste ein Profil „leihen" — das bewegt Formulare, Eigenschaften und Massen, nicht nur Griffe.
  Eigener Schritt.
- **PDF-Längsschnitt** (`usePlanExport` → `LaengsschnittBuilder`, eigener Leser mit fester Klassenliste)
  sieht die ProVI-Haltungen weiter nicht.
- Merkmals-Koordinaten werden wie die übrige Achslese als Dateieinheit gelesen (hier METRE);
  die Einheit am Merkmal (`IfcPropertySingleValue.Unit`) wird nicht ausgewertet.
- Firefox-Abnahme durch Fabio: Längsschnitt am ProVI-Modell, Gelände nach „Ausheben".
