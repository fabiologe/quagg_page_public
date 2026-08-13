# Audit flood-3D — Dead Ends

Stand: 2026-08-11 · Anlass: „gezieltes Audit für DEAD ENDS: nicht zu Ende gebaut,
fehlerhaft, nicht ausdrücklich getestet, nicht weiter betrieben."
Methode: drei unabhängige Such-Durchgänge (Backend, Frontend, Spezifikation/Fahrplan-Abgleich),
Kernbefunde per Stichprobe am Code verifiziert. Umfang: `backend/app/api/flood3D/` +
`client/src/features/flood-3D/` + Spez. `spezifikation-3d-cfd-nachweis.md` +
Fahrplan `virtual-splashing-lark.md`.

Kategorien: **F** fehlerhaft/verdächtig · **U** unfertig/teilweise · **H** halbverdrahtet
(eine Seite gebaut, die andere fehlt) · **T** tot/verlassen · **V** bewusst verworfen (Akte) ·
**N** nie ausdrücklich von Fabio getestet.

---

## 0 · Versionsstand ist selbst ein Befund

- **Die komplette Testing-Runde 1 (2026-08-11) ist uncommitted** — 18 geänderte + 2 neue
  Dateien auf `flood3d-versionskontrolle` (K1-Domainsicherheit, Bohr-Fix, Wand-Sweep,
  alle Editor-Umbauten). Dasselbe Risiko, das schon `AUDIT_FLOOD3D_PREPROCESSING.md §0`
  angemahnt hat: ein Checkout-Wechsel verliert alles.
- **`backend/app/api/flood3D/data/` (151 MB) liegt ungetrackt im Quellbaum** — echte Fälle
  `Rentrisch_BetaTest01…06` + Läufe. `BetaTest01/02` tragen noch das ALTE Fall-Layout
  (`gelaende_*.asc` in der Wurzel), `03+` das neue (`derived/`) — die Layoutmigration hat
  die Altfälle stehen lassen. Kein Backup außer der Platte.
- **Zwei Audit-Worktree-Leichen**: `.claude/worktrees/flood3d-data-flow-audit-592b04/` und
  `…/flood3d-preprocessing-audit-3c5d15/` — verdoppeln jeden Grep-Treffer im Repo.
- `tests/__pycache__/test_gpu_backend…pyc`: kompilierter Rest eines gelöschten
  GPU-Tests — Spur eines aufgegebenen GPU-Pfads.

---

## 1 · F — Fehlerhaft / dringend verdächtig

| # | Fund | Beleg |
|---|---|---|
| F1 | **Rechen-Verlust um Faktor 2,5 überschätzt (Physik-Bug).** Die Porositätszone ist fix 0,15 m tief (`casebuilder.py:824`), der Kirschmer-Beiwert wird aber auf die STABTIEFE normiert: `f = ζ/bar_depth` (`casebuilder.py:881`, Vorbelegung 0,06 m). Δp = ζ·(0,15/bar_depth)·½ρu² statt ζ·½ρu². Richtig wäre `f = ζ/Zonentiefe`. Stichprobenverifiziert. | `core/casebuilder.py:824,881` |
| F2 | **Vorfüllung „springt zurück".** Die neue Wasserebene ist per Shift/Strg-Ziehen greifbar, aber `translateObject` hat keinen `vorfuellung`-Zweig — das Mesh bewegt sich sichtbar, beim Loslassen wird das UNVERÄNDERTE Objekt zurückgeschrieben. | `editor/objektZugriff.js` (translateObject), `marker.js` |
| F3 | **Meldungsart `warnung` verschwindet wie ein Hinweis.** `melden(…, 'warnung')` (PropertyPanel, sculpt) fällt in den 10-s-Autoclear-Zweig, obwohl `MeldungsLeiste.vue` sie als eigene Stufe führt; der State-Kommentar kennt `warnung` gar nicht. | `stores/usePreStore.js:136-138` |
| F4 | **Fenster-Punktliste zeigt falsche Semantik.** `window.points` sind (Kanten-Station, Höhe)-Paare, die `PunktListe` beschriftet sie als x/y, und der Hover setzt die 3D-Fokusmarke auf (Station, Höhe) als Weltkoordinate — Marke landet im Nirgendwo. | `PropertyPanel.vue:202-206` → `PunktListe.vue` |
| F5 | **Kaputte `mesh_preview.json` = „nie gerechnet".** Eine beschädigte Vorschaudatei wird als `vorhanden: false` gemeldet — der Nutzer kann „Datei zerschossen" nicht von „nie gerechnet" unterscheiden. | `router.py:305-308` |
| F6 | **`localClippingEnabled` bleibt hängen.** `koerperBeschneiden` schaltet es beim Gebiets-Drag ein, nimmt es beim Aufheben aber nie zurück; nur „Freischneiden" räumt je auf. | `Editor3D.vue` (koerperBeschneiden) |
| F7 | **Kraft nur als Betrag.** Spez. Kap. 2 verlangt Druck- und Reibungsanteil getrennt; Extract liest `pressure/viscous`, das Zeitreihen-Panel zeigt nur `magnitude`. Seit Plan-L2 bekannt, unverändert. | `extract/readers.py:52,86` vs. `TimeSeriesPanel.vue:41-44` |
| F8 | **Lauf kann spurlos in `status: building` sterben.** `except Exception: pass` im Lauf-Thread verlässt sich darauf, dass `_write_manifest` funktioniert — genau bei voller Platte (dem dokumentierten Plattenfresser) tut es das nicht. | `router.py:1425-1429` |
| F9 | **Stumm geschluckte Fehlerpfade** (Auswahl): Durchdringungsprüfung (`validate.py:546`), `_screen_resistance` in der Prüfung (`validate.py:1155`), CAD-Entitäten beim Import (`importer.py:450,461,987` — unlesbare Objekte verschwinden ohne Zählung), `resolve_window` bei „Anschlüsse herstellen" (`anschluss.py:437`), Raster-/Importlisten im Store (`usePreStore.js:204,312`). | je Fundstelle |
| F10 | **`location_in_mesh` fix bei 15 %/35 %** ohne Prüfung, ob dort ein Bauwerk steht — snappy vernetzt dann die falsche Seite. | `core/meshgen.py:94,98` |
| F11 | **Kamera-Speicher projektblind.** `flood3d-camera-views` im localStorage ist nicht fall-/laufbezogen — gespeicherte Stellungen eines anderen Projekts werden im nächsten unbrauchbar angeboten (Spez. sieht `GET /runs/{id}/views` vor). | `Raum3DPanel.vue:315,1151` |
| F0 | **[GEFIXT 2026-08-11, durch Fabios ersten Klick gefunden]** Netzvorschau-Container hieß für ALLE Fälle gleich (`f3d_mesh_preview_shm` — gebildet aus dem Verzeichnisnamen, nicht aus dem Fall): zweiter Klick → Namenskollision → 422; obendrein löschte der zweite Klick das Arbeitsverzeichnis des noch laufenden ersten Versuchs. Fix: eindeutiger Container-Suffix (uuid) + Doppelstart-Sperre je Fall (409 „läuft bereits"). | `core/runner.py:96`, `router.py` mesh-preview |
| F12 | **Runner-Drift Server ↔ Local Companion.** (a) `convert_case_fields` serverseitig try/except, lokal ungeschützt → derselbe Fehler killt lokal den ganzen Lauf nach Stunden; (b) lokal wird parallel vernetzt, serverseitig seriell → potenziell verschiedene Netze; (c) zwei Env-Variablen für Kerne (`FLOOD3D_CORES` vs. `QUAGG_FOAM_CORES`) mit verschiedenen Defaults; (d) Fehlerübersetzung „No times selected" nur lokal. | `core/runner.py` vs. `engines/local/local_runner.py` |

---

## 2 · U — Nicht zu Ende gebaut

### 2a Kleinteilig (Editor/Panels)

| # | Fund | Beleg |
|---|---|---|
| U1 | „＋ Neu anlegen"-Optgroup für die neue Vermessungskanten-Vorlage heißt roh `kante` (kein `KATALOG_LABELS`-Eintrag). *(Folge der heutigen Runde.)* | `ObjectTreePanel.vue:183-187` |
| U2 | Fenster-Menü verspricht „Polygon (frei zeichnen)" — das Zeichnen-Werkzeug existiert nicht mehr; es geht nur Ecken ziehen. | `PropertyPanel.vue:185` |
| U3 | Fensterformen Ei/Maul/Tropfen sind reine Vorlagen-Aliase: werden sofort auf `polygon` abgebildet, kein Layer kennt sie als eigene Form. | `PropertyPanel.vue:186-188,529-531` |
| U4 | Hinweiszeile im Editor hat für `stanzen` keinen Text. | `Editor3D.vue:146-150` |
| U5 | Querschnittslinien sind in der 3D-Szene NICHT anklickbar (kein `merken()`), obwohl Griffe und Verschieben voll unterstützt sind — Auswahl nur über den Baum. | `marker.js` (section-Block) |
| U6 | `objectZable` kennt `vorfuellung` nicht → „Z hier nicht möglich"-Hinweis, obwohl `writeZ` existiert. | `objektZugriff.js` |
| U7 | ImportModal: Spalte „Umfang" leer für `raster`/`kreis`/`hinweis`; Text nennt „DXF, STL, OBJ", accept erlaubt zusätzlich `.asc/.xyz`. | `ImportModal.vue:19-22,128-139` |
| U8 | „Solverblick" ist bei Erdkörper-Fällen dauerhaft disabled — es gibt keinen Weg mehr, ihn zu benutzen (fast jeder echte Fall hat einen Erdkörper). | `Editor3D.vue:33-40` |
| U9 | Grundriss-Längsschnitt (Post) kennt die im Pre definierten `evaluation.sections` nicht — nur frei gezogene Linien. | `GrundrissPanel.vue:84-93` |
| U10 | Profil-Endpunkt liefert nur Gelände + Anfangsspiegel — die von der Spez. verlangten Bauwerksschnittpunkte fehlen; die Schnittansicht („wichtigste Kontrollansicht", Spez. 6.1) zeigt keine Bauwerkssilhouette. | `router.py` /profile, `SectionView.vue` |
| U11 | Kein Messwerkzeug (Abstand/Höhendifferenz/Neigung, Spez. 6.4) — nur die Δ-Anzeige während des Ziehens. | `Editor3D.vue` |

### 2b Nachweis-/Ergebnisseite

| # | Fund | Beleg |
|---|---|---|
| U12 | **`overfall_cd`/`energy_head` entstehen nur, wenn zufällig ein Target existiert** — obwohl Diagramme dafür da sind. Plan-Befund L2, unverändert. | `evaluate.py:232-234` |
| U13 | Kein Vergleich des C_d gegen tabellierte Beiwerte/Gültigkeitsbereich (Spez. 1.4/1.6). | — |
| U14 | Berichtsabbildungen: `render.py` erzeugt NUR Zeitreihen — keine einzige Karten-/Feldabbildung (Wassertiefe, WSP-Höhenlinien, Sohlschub …); kein Datentabellen-Export zu den Diagrammen; keine Bildsequenz, PNG-mit-Unterschrift nur in Raum3D. | `core/render.py`, `FiguresPanel.vue` |
| U15 | C4-Nachweisblatt halb: Regelwerk nur pauschal pro Lauf, keine Regelwerksstelle je Kriterium, keine Herkunft je Kennwert. Panels rechnen parallel mit eigenen Literalen (Verweilzeit 0,3/0,5, y⁺>500, τ 20 N/m²) statt mit den Fall-Kriterien. | `TargetsPanel.vue`, `VerweilzeitPanel.vue:34,155`, `QualityPanel.vue:75`, `utils/kennwerte.js` |
| U16 | Sohlschub als FLÄCHE nur für `terrain` — Bauwerksflächen fehlen (Spez. Kap. 8); als Zeitreihe je Patch vorhanden. | `foamfields.py:263-276` |
| U17 | Kap. 14 großteils offen: keine Ist-Kosten im Manifest (14.7/4.4), keine Netzkonvergenzstudie (14.2), Kraft ohne Phasenwichtung und ohne Vermerk (14.3), keine ausgewiesene WSP-Genauigkeit (14.6), Randabstand nicht je Bauwerkskategorie (14.5). | Spez.-Abgleich §2 |
| U18 | Kostenmodell hängt an EINEM Referenzlauf (`CELL_UPDATES_PER_CORE_S=100000`, Preis fix 0,05 €/Kern-h); der eigene Hinweistext sagt „wird nach den ersten Läufen kalibriert" — ist nie passiert. | `runner.py:25,30,33,164` |
| U19 | `evaluation.profiles[]` (Längsschnitt als Teil des FALLS, Spez. 4.1) existiert nicht — Längsschnitte sind ad hoc im Panel und damit nicht reproduzierbar dokumentiert. Client hat noch ein leeres `profiles: []`-Relikt. | `casespec.py` Evaluation, `usePreStore.js:652` |
| U20 | CLI unvollständig (Spez.: „jeder Schritt ohne Frontend"): kein `validate`, `mesh-preview`, `run`, `rezept`, `kur`. | `cli.py` |
| U21 | Physikalische Verifikation (Spez. Kap. 13) existiert nicht: kein Wehrüberfall-, Öffnungs-, GMS-Normalabfluss-Referenzfall im Testbestand — nur Formeltests an synthetischen Reihen. | `tests/` |
| U22 | Geometrie-Prüfregeln unvollständig: degenerierte Dreiecke und Sweep-Selbstdurchdringung haben keine eigene Regel (Wasserdichtheit/Spalt/Überschneidung ja). | `validate.py` |

### 2c Ganze Stufen des Fahrplans

| # | Fund | Status |
|---|---|---|
| U23 | **Stufe C** („der Fall beantwortet eine Frage": Assistent C1, Nachweistypen C3 — ζ, Kolk/Shields, Absetzwirkung/Hazen, Fischaufstieg, Lufteintrag —, Reifegrad-Ampel C5) | **nicht begonnen** — als Nächstes geplant |
| U24 | **Stufe D** (Q(h)-Kennlinie, Pumpenkennlinie, Unterwasserbeziehung, Regen auf die Fläche, Betriebsfahrplan) | nicht begonnen |
| U25 | **Stufe E1 / Kopplungslücke L3**: CSV-Ganglinienexport aus isybau/flood-2D/flood-wave/kostra → flood-3D. `BcInflowHydrograph` LIEST das Format längst — niemand schreibt es. Laut Plan „kleinster Schritt mit größter Wirkung". | nicht begonnen |
| U26 | **Stufe F** (Variantenfamilie, Zielsuche, LTSInterFoam): `LTSInterFoam` steht wählbar im Schema und wird von der Prüfung hart als „nicht verdrahtet" abgewiesen — Enum-Wert, der nur existiert, um verboten zu werden. | nicht begonnen |
| U27 | **RunPod/Miet-Rechenleistung** (Spez. 1.2, Stufe 5 zweite Hälfte): `engines/` enthält nur `local/`; der Kommentar „RunPod dockt später an" steht seit Stufe 5. Der Companion-Weg ist der gebaute Ersatz — aber Eigen-Hardware, kein Mietmodell. | nicht begonnen |
| U28 | `outflow_fixed_level` ist seit Stufe 3 die „bewusste Vereinfachung" p_rgh=0 + inletOutlet — die echte Spiegelhaltung „wird in Stufe 5 nachgezogen" wurde nie nachgezogen. | `casebuilder.py:12-16` |
| U29 | Rezept-Katalog: **RÜB/RRB fehlt** — der wichtigste Bauwerkstyp der Spez. (1.3) hat kein Rezept (stattdessen kam `strassenablauf`); Stauraumkanal/Düker/Kolk ebenfalls ohne Rezept. | `core/rezepte.py` |

---

## 3 · H — Halbverdrahtet (eine Seite gebaut, die andere fehlt)

| # | Fund | Beleg |
|---|---|---|
| H1 | `terrain_error` (Companion) und `fields_error` (Server) werden extra ins Manifest geschrieben („muss mit zum Server…") — **kein Client liest sie**. Der Nutzer steht weiter „vor einem Lauf ohne Gelände und ohne Erklärung". | `local_runner.py:376-380`, `runner.py:344` |
| H2 | Volumen-Selbsttest `viz_volume_error_rel_*` (Audit P3-12) landet im Manifest, wird nirgends angezeigt — stiller Selbsttest ohne Alarm. Gleiches Schicksal: `has_normalized`, `steps_estimate`, `crs_epsg`, `nachweis.bearbeiter/lastfall` im Ergebnis. | `foamfields.py:400`, `router.py:146`, `evaluate.py:460` |
| H3 | `_active_runs` ist ein Schreib-nur-Dict: Threads rein, Threads raus, nie gelesen — kein Lauf-Abbruch, keine Statusabfrage darüber. Stichprobenverifiziert. | `router.py:1132,1431,1434` |
| H4 | Endpunkte ohne Client: `GET /health`, `DELETE /cases/{id}/derived` („Härtetest der Schichtentrennung"), `POST /runs/{id}/import` (ungestückelter Zwilling), `GET /cases/{id}/terrain-solid.stl` (bewusster Prüfer-Export — aber OHNE Größendeckel, anders als die Vorschau). | `router.py:89,645,1310,324` |
| H5 | Reservierte Companion-Läufe (`status: lokal`) bleiben ewig stehen, wenn der Import nie abgeschlossen wird — kein Timeout/Aufräumer. | `router.py` bundle |
| H6 | Raum3DPanel umgeht den gemeinsamen Feld-Cache (`fetchGeometry` direkt statt `useFieldCache`) → Doppel-Downloads beim Tabwechsel; daneben eigener Nachbau der WSP-/Tiefen-Rekonstruktion neben `planFields` (der Kommentar sagt es selbst). | `Raum3DPanel.vue:289,1109` |
| H7 | `series()`-API hat einen `locationId`-Filter, den kein Aufrufer je setzt. | `api.js:118` vs. `usePostStore.js:135` |
| H8 | Pre und Post haben ZWEI Grundriss-Implementierungen (three.js-Draufsicht vs. Canvas-Panel) — exakt der Architekturfehler, den die Spez. Kap. 10 als „wahrscheinlichsten" vorhergesagt hat. deck.gl (Spez. Kap. 11) wurde nie installiert. | `Editor3D.vue` / `GrundrissPanel.vue` |

---

## 4 · T — Tot / Verlassen

| # | Fund | Beleg |
|---|---|---|
| T1 | **`skizzeZeichnen` + `flood3dApi.skizzeHinzufuegen` + Backend `POST /cases/{id}/skizze`**: nach der heutigen Werkzeug-Entfernung 0 Aufrufer im Client. Kompletter Skizzen-Weg = Leiche (Backend-Endpunkt + Store-Action + API-Eintrag). Stichprobenverifiziert. | `usePreStore.js:279`, `api.js:69`, `router.py` /skizze |
| T2 | `store.write_manifest()` — einziger toter Top-Level-Name im Core; runner hat sein eigenes `_write_manifest`. | `core/store.py:47` |
| T3 | `except NotImplementedError` in validate fängt eine Ausnahme, die nirgends mehr geworfen wird (Wehr baut längst). Stichprobenverifiziert. | `validate.py:380` |
| T4 | Tote Kleinteile: `Component.POROUS`/`MIN`, `Conventions.length_unit/force_sign/level_reference` (gehen trotzdem in jeden case_hash!), `Meta.vertical_datum`, `welt_nach_lokal` (0 Produktions-Leser), doppelte/ungenutzte Imports (`tempfile`, `io`, `zipfile`, lokale `shutil`). | `conventions.py:53,57`, `casespec.py:84-96,125-141`, `router.py` |
| T5 | Client-Leichen: `inventory()`-API, `volume.js`-Re-Export, `kennwert()`, Getter `selectedRuns`, State `startedRun`, `transformEdit`/`importPos`-Destrukturierung im Editor, `sculpt.laeuft`, `__f3dProject`/`__f3dHandles`-Testhelfer ohne Nutzer, unerreichbarer boundary-Zweig in `_begrenzeDelta`. | Frontend-Audit §2 |
| T6 | Verwaiste Kommentare an falschen Stellen (Reste von Umbauten): über `skizzeZeichnen`, `ladeRezepte`, `loescheGruppe`; verwaister Aussparungs-Kommentarblock im PropertyPanel; `.f3d-chooser`-CSS ohne Template-Nutzer. | Frontend-Audit §5 |
| T7 | `make_demo_runs.py`: Demo-Läufe-Generator ohne Aufrufer/Test, importiert aus `.tests` in den Produktionsbaum; inzwischen gibt es echte Läufe. | `make_demo_runs.py` |
| T8 | `make_beispiele.py` erzeugt 3 Beispieldateien, der Import-Dialog bietet 4 an (`boeschungskanten.dxf` würde bei Neu-Generierung verloren gehen). | `engines/local/make_beispiele.py` vs. `ImportModal.vue:268` |
| T9 | `_mesh_preview`-Altlast-Aufräumcode an zwei Stellen für ein Format, das kein Fall mehr erzeugt. | `router.py:656,1173` |
| T10 | Laufordner nur mit `manifest.json` (BetaTest05_r001-003, BetaTest06) — abgebrochene Reservierungen, die in `GET /runs` als `unbekannt`/`stale` mitlaufen. | `data/runs/` |
| T11 | Drei ältere Audit-Berichte im Root (`AUDIT_FLOOD3D_{PREPROCESSING,POSTPROCESSING,UI}.md`) — sofern die Befunde erledigt sind, Karteileichen; mindestens der Verweis `cli.py:68` stimmt nicht mehr. | Repo-Root |

---

## 5 · V — Bewusst verworfen (zur Akte, kein Handlungsbedarf)

- **Bericht als Dokument** (docx-Pipeline, `POST /runs/{id}/report`): Entscheidung 2026-08-03 —
  „Nachweisblatt als Panel, kein Dokument". ABER: der Ersatz (C4) ist selbst nur teilweise da (→ U15).
- **GeoTIFF-Import**: „folgt, wenn ein echter Anwendungsfall es braucht" (`terrain.py:10`) —
  das Spez.-Beispiel (`source: dgm.tif`) widerspricht dem Code, Spez. wäre zu aktualisieren.
- **Spline-Achsen**: ehrlich auf `polyline` reduziert.
- **Wirbelfallschacht, Rigole** als Rezepte: dokumentiert nicht gebaut.
- **Kur für „Bauwerk unter Gelände"**: bewusst fachliche Entscheidung des Bearbeiters.
- **Schema-generiertes Eigenschaftspanel**: `feldTypen.js` bewusst als Quelle behalten.
- **PropertyPanel-Vorlagen ei/maul/tropfen → polygon**: war vermutlich als Bequemlichkeit gedacht,
  wirkt aber wie U3 — entweder zur echten Form ausbauen oder als „Polygon-Vorlage" beschriften.

---

## 6 · N — Nie ausdrücklich von Fabio getestet

Aus dem Projektlog rekonstruiert (pytest/Playwright ≠ Nutzertest). Korrigiere, was du
längst geprüft hast:

| # | Feature | Stand |
|---|---|---|
| N1 | **Alle 15 Fixes der Testing-Runde 1 von heute** — insbesondere: Kur „In das Gebiet einpassen", Domain-Clamp beim Ziehen, neuer Bruchkanten-Pinsel, Ecke↔Kante-Umschalter, Rechen-Kipp-Griff, Vorfüllungs-Wasserebene, Deselekt/Auswahl-Toggle, Rechtsklick-Pan | nur automatisch verifiziert |
| N2 | **Snappy-Preview aus der Netz-Ansicht**: über den neuen Knopf lief noch KEIN einziger echter Docker-Lauf; die Variante „ohne Verfeinerung" wurde überhaupt noch nie gerechnet | ungetestet e2e |
| N3 | **Durchlass-Bohrung nach dem Fix** an einem echten Fall mit importiertem Gelände-STL (der nicht-wasserdichte Fall, der jetzt gemeldet statt geraten wird) | ungetestet |
| N4 | **Local-Companion-Weg komplett** (Bundle → lokal rechnen → Import-chunk) auf deinem Rechner | pytest ja, Nutzertest nicht dokumentiert |
| N5 | **Alle 6 Bauwerksrezepte** im Editor eingesetzt und bis zum Lauf gebracht | pytest ja |
| N6 | **Modell-Drehen** (Dreh-Gizmo/Kur) an einem echten Fall | nicht dokumentiert |
| N7 | **Nachweise `overfall_cd`, `verweilzeit`, `kurzschluss`, `massenbilanz`, `head_difference`** an einem ECHTEN Lauf (bisher nur synthetisch/Formeltest) | ungetestet |
| N8 | **PostViewer-Spezialitäten**: Stromlinien, Punktabfrage, Ebenenstapel, Kamera-Speicher, PNG-Export — Playwright-verifiziert, Nutzertest nicht dokumentiert | teils |
| N9 | **Kanten-verknüpfen / Vermessungskanten-Rollen** (Stufe G) nach dem No-op-Bug vom 2026-08-05 | teilweise |
| N10 | **Fenster-Formen** (kreis/trapez/polygon) am Rand inkl. Griffe — deine Tests liefen bisher v. a. über Rechteck/follow | unklar |

---

## 7 · Priorisierte Empfehlung

1. **Committen** (§0) — bevor irgendetwas anderes passiert.
2. **F1 Kirschmer-Faktor** fixen (eine Zeile: `f = ζ/0.15` bzw. Zonentiefe als gemeinsame
   Konstante) — das ist ein stiller Rechenfehler in jedem Fall mit Rechen.
3. **F2/U1/U5/U6** — die vier kleinen Folgefehler der heutigen Runde (Vorfüllung-Verschieben,
   `kante`-Beschriftung, Querschnitt anklickbar, Vorfüllung-Z-Hinweis) in einem Aufwasch.
4. **T1 Skizzen-Leiche entfernen** (Endpunkt + Store + API) — sonst gräbt sie das nächste Audit
   wieder aus.
5. **H1/H2** — die stummen Manifest-Fehler (`terrain_error`, `fields_error`) im Lauf-Panel
   anzeigen: kleiner Aufwand, verhindert „Lauf ohne Gelände ohne Erklärung".
6. **U12** overfall_cd/energy_head von der Target-Kopplung lösen (Plan-L2, seit Monaten offen).
7. **U25 / Stufe E1** Ganglinien-Export isybau/flood-2D → flood-3D — laut deinem eigenen
   Fahrplan „kleinster Schritt mit größter Wirkung".
8. **F12 Runner-Drift** — mindestens das ungeschützte `convert_case_fields` im local_runner.
9. **N2/N3** in deine nächste Testrunde aufnehmen (echter Snappy-Lauf über den neuen Knopf,
   Bohrung am echten Fall).
10. **§0 Datenbestand**: `data/`-Altfälle migrieren oder archivieren, Worktrees löschen,
    alte Audit-MDs abhaken oder entfernen.
