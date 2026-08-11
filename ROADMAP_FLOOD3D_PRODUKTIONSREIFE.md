# Fahrplan flood-3D → Produktionsreife

Stand: 2026-08-11 · Grundlage: `AUDIT_FLOOD3D_DEAD_ENDS.md` (F/U/H/T/V/N-Befunde)
· Ansage: **kein Anbau, keine Erweiterung** — das Vorhandene wird korrekt, ehrlich
und betreibbar gemacht.

**Arbeitsprinzip:** Jede Runde ist in sich abgeschlossen, endet mit
(1) grünen Suiten, (2) einem Commit, (3) einer kurzen Testrunde von Fabio.
Erst wenn die Testrunde durch ist, beginnt die nächste. Referenzen (F1, U5, …)
zeigen auf das Audit-Log.

---

## R0 — Fundament sichern ✅ (erledigt 2026-08-11, Commits a099950/429bf2b)

Nichts davon ist Code-Arbeit im Feature — es macht alle weiteren Runden gefahrlos.

- [x] **Committen.** Testing-Runde 1 + Audit-Fixes (inkl. Container-Fix F0) als
      Commit(s) auf `flood3d-versionskontrolle`; danach Merge-Stand mit master klären.
      *Größtes Einzelrisiko im ganzen Projekt (§0 des Audits).*
- [x] Audit-Worktree-Leichen löschen (`.claude/worktrees/flood3d-*`), verwaiste
      `test_gpu_backend.pyc` entfernen.
- [x] `data/`-Hygiene: verwaiste Laufordner (nur `manifest.json`) löschen;
      Altfälle `BetaTest01/02` einmal öffnen+speichern (migriert das Layout) oder
      nach `data/archiv/` verschieben. Backup-Frage notieren (151 MB, nicht in git).
- [x] Alte Audit-MDs (`AUDIT_FLOOD3D_{PREPROCESSING,POSTPROCESSING,UI}.md`):
      erledigte Befunde abhaken oder Kopfvermerk „historisch, Stand < 2026-08-11".
- [x] Docker-Wächter: beim API-Start verwaiste `f3d_*`-Container aufräumen
      (heutiger Vorfall F0 — ein Neustart mitten im Lauf hinterlässt sonst Leichen).

**Fertig wenn:** `git status` sauber, ein Branch-Stand, keine Worktrees, data/ aufgeräumt.

---

## R1 — Rechenfehler und stille Falschaussagen ✅ (erledigt 2026-08-11, Commit 02c1341 — Fabios Testrunde offen)

Alles, was heute FALSCHE Zahlen oder falsches Verhalten liefert.

- [x] **F1 Kirschmer-Faktor** *(wichtigster Punkt des Fahrplans)*: Zonentiefe als
      EINE Konstante, `f = ζ/Zonentiefe` statt `ζ/bar_depth`; Test, der Δp gegen die
      Kirschmer-Formel prüft. Bestehende Fälle mit Rechen danach neu bewerten.
- [x] **Folgefehler der Testing-Runde 1** in einem Aufwasch:
      F2 Vorfüllung-Verschieben (translateObject-Zweig), U1 `kante`-Optgroup-Label,
      U5 Querschnitte anklickbar machen (merken), U6 objectZable für vorfuellung.
- [x] F3 Meldungsart `warnung` als eigene Stufe halten (kein 10-s-Autoclear),
      State-Kommentar korrigieren.
- [x] F4 Fenster-Punktliste: Spalten als „Kante/Höhe" beschriften, Hover-Fokusmarke
      für window.points deaktivieren oder korrekt auf die Randfläche projizieren.
- [x] F5 Kaputte `mesh_preview.json` als „beschädigt — neu rechnen" melden statt
      als „nie gerechnet".
- [x] F6 `localClippingEnabled`-Reset in `koerperBeschneiden(null)`.
- [x] F10 `location_in_mesh`: prüfen, ob der Punkt in einem Bauwerks-Körper liegt;
      wenn ja, Ausweichpunkt suchen (sonst vernetzt snappy die falsche Seite).
- [x] F8 Manifest-Schreiben im Lauf-Thread: bei Fehlschlag wenigstens
      Server-Log-Eintrag statt `pass` (Platte-voll-Fall).
- [x] F9 Stumme Fehlerpfade entschärfen: Import zählt übersprungene Entitäten und
      meldet sie im Report; validate-Ausnahmen (Durchdringung, _screen_resistance)
      werden als `hinweis` sichtbar statt verschluckt.

**Fertig wenn:** Rechen-Testfall rechnet mit korrektem ζ; die vier Editor-Folgefehler
sind in deiner Testrunde nicht mehr reproduzierbar.

**Testrunde R1/R2 (2026-08-11, Fabio) — Ergebnis:** Pinsel ✓ (aber Fang nur an
Vermessungskanten → gefixt: fängt jetzt auch Bruchkanten-Operationen),
Rechtsklick-Pan/Deselekt ✓, Vorfüllung ✓, Ecke↔Kante ✓ (Latenz → R3-Punkt),
Zoom-Zittern (Altbestand) → gefixt, Solverblick → auf Fabios Frage hin
ENTFERNT (Netz ist die eine Ansicht), Rechen-Porositätszone jetzt in der
Szene sichtbar. Commit c25f80b.

---

## R2 — Leichen raus, Beschriftungen ehrlich ✅ (erledigt 2026-08-11, Commit ac2ebd9 — Conventions-Felder bewusst behalten, siehe Audit-T4-Vermerk; GET /health behalten für die R5-Betriebsnotiz)

Nichts Neues — nur weg damit oder ehrlich benennen. Reduziert die Fläche, die
alle späteren Runden testen müssen.

- [x] **T1 Skizzen-Weg komplett entfernen**: `POST /cases/{id}/skizze`,
      `store.skizzeZeichnen`, `api.skizzeHinzufuegen`, zugehörige Tests
      (`test_skizze.py` prüfen: Backend-Logik ggf. behalten, wenn der Import sie
      nutzt — sonst mit raus).
- [x] T2–T6: `store.write_manifest`, totes `except NotImplementedError`,
      `Component.POROUS/MIN`, ungenutzte Conventions-/Meta-Felder (ACHTUNG:
      gehen in `case_hash` ein — Entfernen invalidiert Hashes → beim Entfernen
      Netz-Hash-Migrationstest), Client-Leichen (inventory, kennwert, selectedRuns,
      startedRun, …), verwaiste Kommentare, `.f3d-chooser`-CSS.
- [x] T7 `make_demo_runs.py`: löschen oder nach `tests/` als Fixture-Generator.
- [x] T8 `make_beispiele.py`: `boeschungskanten.dxf` mit erzeugen oder im Skript
      dokumentieren, dass sie handgepflegt ist.
- [x] T9 `_mesh_preview`-Altlastcode entfernen (nach R0-Migration der Altfälle).
- [x] U2 „Polygon (frei zeichnen)" → „Polygon (Ecken ziehen)"; U3 Ei/Maul/Tropfen
      als „Polygon-Vorlage (…)"" beschriften — ODER ganz raus (Empfehlung: beschriften).
- [x] U26 `LTSInterFoam` aus dem Schema-Enum entfernen (existiert nur, um verboten
      zu werden). Kommt wieder, wenn Stufe F je gebaut wird.
- [x] H4-Teil: `POST /runs/{id}/import` (ungestückelter Zwilling) entfernen;
      `GET /health` entweder vom Monitoring nutzen oder raus;
      `terrain-solid.stl` bekommt den 120k-Deckel der Vorschau.
- [x] T11: dieses Dokument + Dead-End-Log werden die EINZIGEN lebenden
      Statusdokumente; alte Roadmap-/Audit-MDs bekommen Verweis hierher.

**Fertig wenn:** Grep nach den entfernten Namen = 0 Treffer; Suiten grün;
kein UI-Text verspricht mehr etwas, das es nicht gibt.

---

## R3 — Stumme Kanäle anschließen ✅ (erledigt 2026-08-11, Commit a495814 — offen: H6-Teil-2 WSP-Nachbau; Entscheidung „Vernetzung serverseitig parallelisieren" weiter bei Fabio)

Fehler, die heute schon ERZEUGT, aber nie ANGEZEIGT werden — der Nutzer steht
sonst „vor einem Lauf ohne Gelände und ohne Erklärung".

- [x] **H1/H2**: `terrain_error`, `fields_error`, `viz_volume_error_rel_*` im
      Lauf-&-Log-Panel anzeigen (Warnkachel). `has_normalized` in der Laufliste
      auswerten oder aus der Antwort entfernen.
- [x] **H3 Lauf-Abbruch**: `_active_runs` von Schreib-nur zu nutzbar — ein
      „Lauf abbrechen"-Knopf (Container killen, Manifest → `abgebrochen`).
      *Einstufung: Betriebsreife, kein Feature — ohne das ist ein hängender Lauf
      nur per SSH totbar.*
- [x] **F12 Runner-Drift** (Minimum): `convert_case_fields` im local_runner
      schützen wie im Server; EINE Kernzahl-Quelle (`FLOOD3D_CORES`);
      „No times selected"-Übersetzung auch serverseitig.
      *Optional (Entscheidung Fabio): Vernetzung serverseitig parallelisieren wie
      im Companion — beschleunigt die Netzvorschau spürbar, ist aber die einzige
      „Verbesserung" in diesem Fahrplan.*
- [x] H5 Companion-Reservierungen: Läufe mit `status: lokal` älter als 7 Tage in
      der Laufliste als „verfallen" markieren (Löschknopf existiert schon).
- [x] H6 Raum3D auf den gemeinsamen Feld-Cache umstellen (Doppel-Downloads weg) —
      **Teil 2 offen:** der doppelte WSP-Rekonstruktions-Nachbau in Raum3D ist noch
      nicht auf `planFields` zurückgeführt (eigener Punkt, risikoreichere Chirurgie).
- [x] F11 Kamera-Speicher je FALL schlüsseln (`flood3d-camera-views:<case>`).
- [x] **NEU aus Testrunde R2:** Entwurfsvorschau-Latenz („jede Verschiebung
      dauert lange"): jeder Draft baut ALLE Körper serverseitig neu. Die
      Entflechtung ist im Entwurf schon übersprungen (c25f80b) — weiter
      prüfen: nur die GEÄNDERTE Struktur neu bauen, STL-Cache je Patch,
      Debounce-Feintuning.

**Fertig wenn:** Ein absichtlich provozierter Feldkonvertierungs-Fehler erscheint
im Lauf-Panel; ein Lauf lässt sich aus der UI abbrechen.

---

## R4 — Vertrauen ✅ (Code erledigt 2026-08-11, Commit 13d7c89 — VERIFIKATION BESTANDEN: C_d = 0,6443 ± 0,0093 im Band 0,55–0,75; offen nur Fabios N-Testrunden)

Produktionsreife heißt bei einem Nachweiswerkzeug vor allem: belegte Korrektheit.
Kein neues Feature — Absicherung des Bestands.

- [x] **U21 EIN physikalischer Referenzfall** (Spez. Kap. 13): Wehrüberfall gegen
      die Überfallformel, klein genug für ~Minuten Rechenzeit; als markierter
      Slow-Test (`pytest -m verifikation`, nicht in der Standard-Suite), Ergebnis
      mit Toleranzband eingefroren. Läuft nach jeder Änderung an
      casebuilder/meshgen/solids von Hand bzw. vor jedem Release.
- [x] F7 Kraft nach Druck-/Reibungsanteil im Zeitreihen-Panel wählbar
      (Daten liegen längst in `normalized.parquet`).
- [x] U12 `overfall_cd`/`energy_head` von der Target-Kopplung lösen: Reihe
      entsteht, sobald ein Wehr + Querschnitt existiert (Diagramm dafür gibt es).
- [x] U15-Kern: Panels rechnen mit den FALL-Kriterien statt mit eigenen Literalen
      (Verweilzeit 0,3/0,5, y⁺>500, τ 20 N/m² → aus `evaluation.targets` bzw. als
      EINE Konstantendatei). Kein neues Nachweisblatt — nur eine Wahrheit statt zwei.
- [x] U18 Kostenmodell: Ist-Kosten (`duration_s × cores × Preis`) ins Manifest und
      ins Lauf-Panel; Schätzkonstante an den inzwischen vorhandenen echten Läufen
      nachkalibrieren („wird nach den ersten Läufen kalibriert" einlösen).
- [ ] **Testrunde-2-Checkliste (N-Befunde)** mit Fabio abarbeiten (OFFEN — Fabios Part):
      N1 heutige Fixes, N2 echter Snappy-Lauf über den Knopf (beide Varianten),
      N3 Bohrung am echten Fall, N5 alle 6 Rezepte bis zum Lauf, N6 Drehen,
      N10 Fensterformen. N4 (Companion e2e auf deinem Rechner) als eigener Termin.

**Fertig wenn:** Referenzfall im Toleranzband; N-Liste im Audit-Log abgehakt
oder als neue Befunde in R1-Manier nachgezogen.

---

## R5 — Abschluss: Versionsstand & Betrieb

- [ ] Merge auf master + Tag (z. B. `flood3d-v1.0-beta`), damit „Produktionsstand"
      ein benennbarer Commit ist.
- [ ] `data/cases`-Backupweg festlegen (mind. case.yaml + imports/ sichern).
- [ ] Kurze Betriebsnotiz in README oder eigenem `BETRIEB_FLOOD3D.md`:
      PM2-Restart wann nötig, Docker-Image, Timeouts, Kerne, bekannte Deckel
      (1,5 M Viz-Zellen, 120 k Körper-Knoten, 20 min Mesh-Timeout).
- [ ] Spez-Stand ehrlich machen: `spezifikation-3d-cfd-nachweis.md` bekommt einen
      Vermerk je bewusst verworfener Position (V-Liste: Bericht-Dokument, GeoTIFF,
      deck.gl, Spline, Schema-Panel) — die Spez. lügt sonst gegen den Code.

---

## Parkliste — ausdrücklich NICHT in diesem Fahrplan

Alles hier ist ERWEITERUNG und wartet, bis der Bestand produktionsreif ist:

| Thema | Audit-Ref | Bemerkung |
|---|---|---|
| Stufe C (Assistent, neue Nachweistypen, Reifegrad-Ampel) | U23 | nächster Ausbauschritt NACH diesem Fahrplan |
| Stufe D (Kennlinien-Randbedingungen, Regen, Fahrplan) | U24 | |
| Stufe E1 Ganglinien-Kopplung isybau/flood-2D → flood-3D | U25 | laut altem Plan „kleinster Schritt, größte Wirkung" — erster Kandidat danach |
| Stufe F (Varianten, Zielsuche, LTSInterFoam) | U26 | |
| RunPod / Miet-Rechenleistung | U27 | Companion-Weg ist der gebaute Ersatz |
| Berichts-/Kartenabbildungen, Bildsequenz-Export | U14 | |
| Echte Spiegelhaltung `outflow_fixed_level` | U28 | fachlich prüfen, ob die Vereinfachung je stört |
| RÜB/RRB-Rezept + weitere Rezepte | U29 | |
| GeoTIFF, deck.gl, gemeinsame Grundrisskomponente, Messwerkzeug, `evaluation.profiles` | 7.x/U11/U19 | |
| Netzkonvergenzstudie, WSP-Genauigkeitsausweis (Kap. 14) | U17 | gehört zu „Nachweis nach Regelwerk", nicht zu „Werkzeug stabil" |

---

## Reihenfolge-Logik in einem Satz je Runde

R0 sichert, dass nichts verloren geht · R1 macht die Zahlen richtig ·
R2 verkleinert die Angriffsfläche · R3 macht Fehler sichtbar und Läufe steuerbar ·
R4 belegt die Korrektheit und holt deine Testrunden nach · R5 friert den Stand
benennbar ein.
