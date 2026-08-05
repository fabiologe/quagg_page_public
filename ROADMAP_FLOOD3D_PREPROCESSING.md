# flood-3D Preprocessing — Sanierungs-Roadmap

Stand: 2026-08-05 · Basis: `AUDIT_FLOOD3D_PREPROCESSING.md` (gleicher Branch) ·
Ergänzt den Fahrplan `virtual-splashing-lark` (Stufen A–F), ersetzt ihn nicht:
**Konsolidierung vor Ausbau.** Stufe C („der Fall beantwortet eine Frage") wird
bewusst hinter diese Sanierung gestellt.

---

## 0. Der eine Satz

Das Werkzeug kann fast alles bauen — aber es weiß nicht mehr, **woher seine Geometrie
kommt**. Die Sanierung gibt jedem Objekt seine Herkunft zurück und trennt dann drei
Schichten so, dass man jede einzeln wegwerfen, neu ableiten oder bearbeiten kann.

---

## 1. Zielbild: drei Schichten mit je einem Härtetest

| Schicht | Inhalt | Der Test, ob sie steht |
|---|---|---|
| **(a) Rohgeometrie** | `imports/<id>/` (Originaldatei, Kandidaten, Manifest), referenziert aus der Spec, nie mutiert | Derselbe Import lässt sich mit anderen Einstellungen (Einheit, Auflösung, Rolle) **neu ableiten, ohne die Datei neu hochzuladen** |
| **(b) Preprocessing-Geometrie** | `case.yaml`: deklarativer Operations-/Edit-Stapel, Semantik, Referenzen auf (a) | Jedes Objekt beantwortet „woher kommst du?" (`herkunft`) und **kein Endpunkt überschreibt Quelldaten destruktiv** |
| **(c) Solver-Geometrie** | `derived/`: Raster-Ableitungen, STLs, `_mesh_preview/`, OpenFOAM-Fall | `rm -rf derived/` + ein Preview-Lauf **rekonstruiert alles bitidentisch** — als automatischer Test |

Drei Arbeitsgrundsätze aus den letzten Wochen gelten durchgehend:
*Erledigt heißt nachgeprüft* (jede Phase hat eine Nachprüfungs-Liste) ·
*Regel und Kur messen dieselbe Größe* · *Keine Tests an echten Fällen* (Fixtures,
`_mesh_preview/system/*` ist der Rettungsanker).

---

## 2. Was wir bewusst NICHT tun (bis P5 abgenommen ist)

- Keine neuen Bauwerkstypen, keine neuen Rezepte über die 6 vorhandenen hinaus.
- Kein CAD-Funktionsausbau (ACIS-Konvertierung, Spline-Achsen bleiben liegen).
- Keine neuen Solver-Features, keine neuen Nachweisgrößen, keine Kopplung (L3).
- Keine UI-Verschönerung vor der UI-Entflechtung — erst Struktur, dann Politur.

Alles davon ist danach **leichter**, weil es auf die drei Schichten aufsetzt.

---

## 3. Phasenplan

Reihenfolge ist Abhängigkeit, nicht Priorität im Bauchgefühl: P1 liefert die
Information (Herkunft), ohne die P5 (UI) nichts darstellen kann; P2 liefert die
Verzeichniswahrheit, ohne die der P2-Härtetest nichts beweist.

```
P0 Sichern ─► P1 Herkunft & Referenz ─► P2 derived/ ─► P3 Mutationsvertrag
                                                          │
              P4 Feldkunde & API ◄────────────────────────┘
                     │
              P5 UI-Entflechtung ─► P6 Wiedereinstieg Fahrplan (Stufe C)
```

---

### P0 — Sichern & Sofort-Bugs (kein Redesign) · ~1–2 Sitzungen

**Ziel:** Nichts mehr verlierbar; die vier Import-Bugs weg, die echte Projekte sofort treffen.

| Paket | Inhalt |
|---|---|
| **P0.1 Stufe B committen** | Im Hauptcheckout: `rezepte.py`, `kanten.py`, 8 Testdateien + alle offenen Änderungen committen; `flood3d-versionskontrolle` → master mergen, origin pushen. Vorher Backend- (442+) und Client-Tests (45+) laufen lassen. |
| **P0.2 Raster-Transformationen** | `importer.py:861–880`: `unit_factor`/`offset` auf `xllcorner/yllcorner/cellsize` anwenden; `terrain_bbox` setzen (sonst verpufft `derive_domain`). Rotation für Raster **ehrlich ablehnen** (Meldung statt still ignorieren) — Raster drehen hieße resampeln, das gehört nach P3. |
| **P0.3 DXF-Vollständigkeit** | `INSERT` explodieren (`ezdxf` virtual_entities), `LINE`/`ARC`/`SPLINE` als Linienkandidaten aufnehmen; **jede** unverarbeitete Entität je Layer zählen und im Manifest ausweisen. Regel: nichts verschwindet ohne Zahl. |
| **P0.4 Einheitenfeste Heuristik** | Rollen-/Split-Schwellen (`_guess_role`, 25 m²/10 m/…) mit dem Einheitenfaktor skalieren — Analyse nimmt `unit_hint` entgegen oder Vorschlag wird nach Einheitenwahl neu gerechnet. |
| **P0.5 Dateinamen** | `SAFE_FILENAME` um Umlaute erweitern oder transliterieren statt 422 („Gelände_Bestand.dxf" muss gehen). |

**Nachprüfung:** mm-DXF mit Blöcken + Gelände-Raster mit Offset in **einem** Import →
alle Teile liegen deckungsgleich; Manifest weist 0 ungezählte Entitäten aus; Testfall
im Repo als Fixture (`tests/fixtures/import_gemischt/`).

---

### P1 — Herkunft & Referenz (das tragende Stück) · ~2–3 Sitzungen

**Ziel:** Jedes Objekt kennt seine Herkunft; ein Import ist eine wiederholbare Ableitung, kein Einmalereignis.

| Paket | Inhalt |
|---|---|
| **P1.1 `herkunft`-Feld** | `casespec`: `herkunft: manuell \| import \| kur` an Structure, TerrainOp, Section, Gauge, Boundary (+ `migriere` setzt Bestand auf `manuell`). `StructImported.role` (nie gelesen) dabei entsorgen oder endlich nutzen. |
| **P1.2 Import-Referenz** | `import_ref: {import_id, kandidat}` an jedem importierten Objekt. `apply_import` schreibt Referenzen statt nur Kopien. **Re-Apply ersetzt per Referenz** statt `_2`-Suffixe anzuhängen (Idempotenz). |
| **P1.3 Eine Transformations-Wahrheit** | `Meta.transform: {unit_factor, offset, rotation_deg, rotation_center}` — vollständig, EINE Konvention. Importer (`drehen`, um Ursprung, setzt) und `rotate.py` (um Gebietsmitte, summiert) auf dieselbe Funktion ziehen. Rückverortung `p_welt = f(p_lokal)` als getestete Utility (Backend **und** ein Export für den Client). |
| **P1.4 Import-Verwaltung** | `GET /cases/{id}/imports` (Manifeste + Status verwaist/aktiv); toten Kandidaten-STL-Endpunkt entweder für die 3D-Vorschau im Modal nutzen oder löschen — nicht liegen lassen. |

**Nachprüfung:** Import → Apply → Re-Apply mit anderer Auflösung: keine Duplikate,
`case_hash` ändert sich nur wo erwartet; Rückverortungs-Roundtrip-Test
(Landeskoordinate → lokal → Landeskoordinate, < 1 mm); ein Fall aus Vor-P1-Bestand
lädt per `migriere` fehlerfrei.

---

### P2 — Verzeichnistrennung `derived/` · ~1 Sitzung

**Ziel:** Das Fallverzeichnis lügt nicht mehr: Quellen und Ableitungen getrennt.

| Paket | Inhalt |
|---|---|
| **P2.1 `derived/` einführen** | Dorthin: abgeleitete `gelaende_*.asc`, `*_tin.stl`, `gelaendekoerper_*.stl`, `import_*.stl`, `_mesh_preview/`. Jede Ableitung trägt den `case_hash`-Stempel ihrer Quelle. |
| **P2.2 Quellenlisten filtern** | `GET /cases/{id}/rasters` liefert nur echte Quellen; `replace_region` kann nur noch Quellen wählen (Ableitung-als-Quelle-Schleife gekappt). |
| **P2.3 Aufräumbarkeit** | Endpunkt oder CLI `derived/ leeren`; Bundle packt `derived/` nicht mit ein (Rebuild beim Runner). |

**Nachprüfung:** **Der Wegwerf-Test als CI-Test:** Fall bauen → `derived/` löschen →
Preview neu → Artefakte bitidentisch (Hash-Vergleich). Kein Endpunkt schreibt mehr
außerhalb `derived/` außer in `case.yaml` und `imports/`.

---

### P3 — Ein Mutationsvertrag, nicht-destruktiv · ~2 Sitzungen

**Ziel:** Server-Mutationen sind Ableitungen mit Protokoll, keine Überschreiber.

| Paket | Inhalt |
|---|---|
| **P3.1 Ein Vertrag** | `rotate`/`anschluss`/`kur` haben identische Antwortform und identischen Client-Code (Audit §5.4/5.5) → **ein** Endpunkt `POST /cases/{id}/kur {aktion, args}`; `anschluss` und `rotate` werden Kuren. Ein Client-Codepfad statt drei. |
| **P3.2 Drehen ohne Kette** | Drehung rastert immer vom **Original**-Raster (aus `imports/`) neu, nie vom letzten Resampling; Winkel summiert, Zentrum gespeichert (P1.3). Punktlisten importierter Objekte werden nicht angefasst — deren Lage kommt aus `import_ref` + `Meta.transform`. |
| **P3.3 Kur-Hygiene** | Kur speichert nur bei tatsächlicher Änderung (`case_hash`-Vergleich) — „war schon so" invalidiert die Netzvorschau nicht mehr. Kuren stempeln erzeugte Objekte mit `herkunft: kur`. Regel und Kur messen dieselbe Größe (Testpflicht je Kur, wie am 04.08. gelernt). |
| **P3.4 Ein Erdkörper-Schalter** | Vier Auslöser (`TerrainBase.koerper`, `OpBerechnungskoerper`, `durchstoesst_gelaende`, Kur) → **ein** Feld `terrain.koerper_modus`, Rest via `migriere` überführt und als `_ENTFALLEN` wirklich entfernt. |

**Nachprüfung:** 3× drehen um 30° = 1× um 90° (bitidentisches Raster); zweimal dieselbe
Kur = ein `case_hash`; jede Kur hat einen Test „Befund weg nach Kur".

---

### P4 — Feldkunde & API-Konsolidierung · ~2 Sitzungen

**Ziel:** Eine Wahrheit über Felder (das Backend-Schema), halb so viele Endpunkt-Pfade.

| Paket | Inhalt |
|---|---|
| **P4.1 Schema-getriebene Formulare** | `GET /cases/{id}/schema` (fertig, ungenutzt!) wird die Quelle des PropertyPanels. `feldTypen.js`-Tabellen + die 92 `FIELD_LABELS` (mit 2 toten Duplikaten) schrumpfen auf **eine** Übersetzungs-/Widget-Hint-Tabelle. |
| **P4.2 Geometrie aus einer Quelle** | `PUT /cases/{id}` liefert Geometrie mit (wie `/preview`) → `refreshGeometry`-Doppelpfad und 3 Nach-GETs entfallen; `GET terrain/solids/terrain-solid` deprecaten. b64-Dekodierung an genau einer Stelle. |
| **P4.3 Editor-Serverspiegel raus** | `/preview` liefert aufgelöste Fensterflächen und BC-Face-Zuordnung mit → `resolveWindow`/`resolveBcFaces`/`openingPos` aus `Editor3D.vue` löschen (drei duplizierte Serverregeln weniger). |
| **P4.4 Totholz** | `importRun`, `_ENTFALLEN`, `RHO_WATER`-Zwilling (`casebuilder.py:34` vs. `:868` — Dichte-Inkonsistenz zum Solver gleich mit klären), ungelesene Meta-/Conventions-Felder, tote `addEdit`-Vorlagen, `Alignment.kind='spline'` (raus oder bauen — nicht wählbar-wirkungslos lassen). Doppeltes `build_solids` pro `build_case` auf eins. |

**Nachprüfung:** `grep FIELD_LABELS` liefert eine Fundstelle; Speichern = 1 Request
(vorher 4); `vite build` grün; Golden-Dictionaries unverändert (oder bewusst neu
eingefroren).

---

### P5 — UI-Entflechtung · ~3 Sitzungen

**Ziel:** Die drei Schichten sind **sichtbar**; jede Aktion hat einen Weg.

| Paket | Inhalt |
|---|---|
| **P5.1 Baum nach Herkunft** | Drei Wurzeln statt 8 Gruppen-Dropdowns: **Grundlagen** (herkunft=import: gesperrt, Sichtbarkeits-Toggle, „neu ableiten…"-Aktion), **Modellierung** (voll editierbar), **Abgeleitet** (Netzvorschau, Raster — nur Anzeige). Löschen von Grundlagen mit Rückfrage. |
| **P5.2 Ein Weg pro Aktion** | Anlegen: ein durchsuchbarer Katalog (37 Einträge, gruppiert) statt 7 Selects + 4 Nebenwege. Löschen: ein Weg + Entf. Modellgebiet: Editor-Griffe + PropertyPanel — die Drittkarte im SimulationPanel fällt. Bearbeitungen: Zeichnen **oder** Formular je Typ, nicht beides halb. |
| **P5.3 Editor3D schneiden** | 3.126 Zeilen → Composables: `useSzene`, `useWerkzeuge`, `useHandles` (die 363-Zeilen-Typweiche wird eine Registry je Objekttyp), `useGizmo`, `useOverlays`. Overlay-Kollision (`.f3d-meshhint`/`.f3d-chooser` auf derselben Position) fixen; „Stanzen" als sichtbares Werkzeug. |
| **P5.4 Sprache** | „Schnitt" (4 Bedeutungen) und „Netz" (3) auseinanderbenennen: Clipping = „Freischneiden", SectionView = „Längsschnitt", section-Tool = „Querschnitt", Edit = „Zuschnitt". |
| **P5.5 JSON als Experten-Fallback** | Rohe JSON-Textareas verschwinden hinter einem „Experte"-Toggle; Normalweg ist das Schema-Formular (P4.1) + PunktListe + Griffe. |

**Nachprüfung (Zahlen aus dem Audit als Messlatte):** gleichzeitige Flächen 13 → ≤ 7;
dauerhafte Bedienelemente ~45 → ≤ 25; Mehrfachwege 11 → ≤ 3 (begründete);
`Editor3D.vue` < 800 Zeilen; Playwright-Durchlauf: Import → Modellieren → Prüfen →
Netzvorschau ohne Konsole-Fehler.

---

### P6 — Wiedereinstieg in den Fahrplan · danach

Erst jetzt Stufe C („der Fall beantwortet eine Frage"), und sie wird billiger:

- **Rezepte** (Stufe B) setzen auf dem Katalog + `herkunft` auf: ein Rezept erzeugt
  Objekte mit `herkunft: rezept`-Gruppierung — im Baum als ein zusammenklappbares
  Bauwerk sichtbar, als Ganzes verschieb-/löschbar. Das beantwortet „Bauwerke zu
  schnell zu weit": nicht zurückbauen, sondern **auf die neuen Schichten stellen**.
- **Nachweislücke L2** und **Kopplungslücke L3** aus `virtual-splashing-lark` bleiben
  die nächsten Ausbauziele danach.

---

## 4. Risiken & Leitplanken

| Risiko | Leitplanke |
|---|---|
| Migration bricht Bestandsfälle | `migriere` + Fixture-Fälle aus jeder Ära; echte Fälle **vorher kopieren** (Endpunkte schreiben sofort!) |
| P1/P3 verändern `case_hash`-Semantik | Golden-Tests je Phase neu einfrieren, bewusst und einzeln |
| UI-Umbau bricht stille Workflows | Playwright-Kernpfad ab P0 als Pflichtlauf vor jedem Phasenabschluss |
| Scope-Kriechen („wenn wir schon dabei sind…") | §2-Liste gilt; neue Ideen landen als Notiz in P6, nicht im laufenden Paket |
| Build/Deploy | Nie direkt in `dist` bauen (RAM prüfen, atomar über `dist_neu`); Dev-Server nicht killen |

## 5. Grobe Bilanz

P0 (1–2) + P1 (2–3) + P2 (1) + P3 (2) + P4 (2) + P5 (3) ≈ **11–13 Arbeitssitzungen**
bis zum sauberen Fundament — etwa der Umfang, den Stufe A+B zusammen hatten. Danach
ist jede weitere Stufe des alten Fahrplans günstiger, weil Import, Modell und UI
dieselbe Sprache sprechen: *Grundlagen sind unantastbar, Modellierung ist deklarativ,
Abgeleitetes ist wegwerfbar.*
