> **Historisch** — Stand vor 2026-08-11. Viele Befunde sind inzwischen behoben.
> Aktueller Stand: `AUDIT_FLOOD3D_DEAD_ENDS.md` · Abarbeitung: `ROADMAP_FLOOD3D_PRODUKTIONSREIFE.md`

# Audit flood-3D-Preprocessing — Import, Geometriehandling, Modellierung

Stand: 2026-08-05 · Basis: Commit `a1682b4` (Branch-Stand des Audit-Worktrees) ·
Anlass: „UI völlig überlaufen, wir haben uns verlaufen; Bauwerke zu schnell zu weit;
säubern in Rohgeometrie / reale Preprocessing-Geometrie / Solver-Geometrie."

---

## 0. Vorab: der Versionsstand ist selbst ein Befund

- **master ist veraltet.** Die letzten zwei Commits (`0150c55`, `a1682b4`) liegen nur auf
  `flood3d-versionskontrolle`, nicht auf master/origin.
- **Stufe B ist nie committet worden.** `core/rezepte.py` (581 Z., 6 Bauwerksrezepte:
  Drosselschacht, Trennbauwerk, Tosbecken, Absturz, Pumpensumpf, Straßenablauf),
  `core/kanten.py` und 8 neue Testdateien existieren nur als uncommittete Änderung im
  Hauptcheckout — zusammen ~2.580 eingefügte Zeilen über 34+ Dateien.
- Der Import-Dialog ist im **committeten** Stand kaputt (§2, Befund I-1); der uncommittete
  Stand behebt das bereits. Ein `git stash` oder Checkout-Wechsel würde den Fix und die
  komplette Stufe B verlieren.

**Konsequenz:** Erst committen, dann aufräumen. Alles Weitere bezieht sich auf den
committeten Stand; wo der uncommittete Stand abweicht, ist es vermerkt.

---

## 1. Kernbefund

Die Trennung, die du forderst, existiert im Code **in Ansätzen** — aber an drei Stellen
wird sie systematisch durchbrochen:

1. **Der Importer** führt Rohdaten → Semantik → teilweise Solver-Ableitung in einem
   einzigen, unwiederholbaren Schritt aus und hinterlässt Dateizustände als Modellwahrheit.
   Die Original-Rohdaten liegen zwar unter `imports/<id>/`, aber die `case.yaml`
   referenziert sie nirgends — der Bezug ist nach dem Apply verloren.
2. **Mutierende Endpunkte** (`rotate`, `anschluss`, `kur`, teils der Import selbst)
   schreiben Ableitungs**ergebnisse** zurück in die bearbeitbare Schicht: gedrehte
   Punktlisten ersetzen die Vermessung, Kuren verschieben `domain.z_min/z_max`,
   `derive_domain` überschreibt `solver.initial_level`.
3. **Das Fallverzeichnis** ist gleichzeitig Rohdatenablage (`imports/`),
   Ableitungsablage (`gelaende_*.asc`, `import_*.stl`, `gelaendekoerper_*.stl`) und
   Solver-Arbeitsverzeichnis (`_mesh_preview/` = kompletter OpenFOAM-Fall). Der
   Raster-Endpunkt listet Quell- und Ableitungsraster ununterscheidbar — eine Ableitung
   kann zur Quelle einer weiteren werden (`replace_region`).

Die UI spiegelt diese Modellunschärfe: weil das Datenmodell nicht weiß, was Rohdaten,
Modellierung und Artefakt ist, zeigt der Objektbaum alles gleichrangig, mit denselben
Griffen, demselben Löschknopf, ohne Herkunfts-Flag, ohne Sperren, ohne Mehrfachauswahl.

---

## 2. Import (ImportModal.vue · importer.py 1.053 Z. · router.py)

### Harte Fehler

- **I-1 · Import-Dialog crasht ab Schritt 2** (committeter Stand). Die Warnzeile für
  nicht geschlossene Volumengelände steht als Geschwister-`<tr>` **außerhalb** des
  `v-for` (`ImportModal.vue:162`), `c` ist im Scope nicht definiert → `TypeError` beim
  Rendern, sobald das Manifest da ist. Dieselbe Bug-Klasse wie am 04.08.
  *Im uncommitteten Stand über `<template v-for>` bereits behoben.*
- **I-2 · Raster-Importe ignorieren alle Transformationen.** `.asc`/`.xyz` werden als
  Rohbytes 1:1 kopiert (`importer.py:861–880`) — `unit_factor`, `offset`, `rotation`
  werden nicht angewandt, obwohl Meshes/Linien desselben Imports sie bekommen. Raster +
  Bauwerks-STL aus einem Import liegen danach ggf. kilometerweit auseinander. Außerdem
  setzt der Rasterpfad kein `terrain_bbox` → `derive_domain` verpufft still.
- **I-3 · DXF-Entitäten verschwinden still.** `INSERT` (Blöcke!), `LINE`, `ARC`,
  `SPLINE`, `ELLIPSE` u.a. passieren die Whitelist (`importer.py:181`), werden aber von
  keinem Zweig verarbeitet und tauchen in keiner Statistik auf — für den Nutzer sieht der
  Layer leer aus. Bauwerke in Blockreferenzen sind komplett unsichtbar.
- **I-4 · Rollen-Heuristik rechnet in Dateieinheiten.** Schwellen (25 m², 10 m, …)
  gelten vor der Einheitenumrechnung — bei mm-Dateien alles um 10³ daneben, inklusive
  der Layer-Split-Entscheidung (mm-Gelände zerfällt in Dutzende Ein-Dreieck-Kandidaten).
- **I-5 · Dateinamen mit Umlauten werden abgelehnt** (`SAFE_FILENAME`, `importer.py:29`):
  „Gelände_Bestand.dxf" → 422. Deutscher Workflow, häufigster Fall.

### Strukturelle Befunde

- **Kein Wiederholen ohne Neu-Upload.** Es gibt keinen Endpunkt, der Importe listet oder
  Manifeste zurückliest; die `import_id` lebt nur im Vue-ref des Modals. `apply` ist
  additiv statt idempotent (zweites Apply erzeugt `_2`-Duplikate). Ein „gleicher Import,
  andere Auflösung/Einheit" bedeutet: Datei neu hochladen, alles neu deklarieren.
- **Zwei Drehkonventionen für dasselbe Meta-Feld.** Importer dreht um den Ursprung und
  *setzt* `crs_rotation_deg`; `rotate.py` dreht um die Gebietsmitte und *summiert*.
  Drehzentrum wird nicht gespeichert → Rückverortung ins Landessystem rechnerisch
  unmöglich. `unit_factor` wird gar nicht persistiert.
- **Verlustkette ohne Protokoll:** Vertex-Merge → TIN→Raster (Auflösung aus
  `terrain.base.resolution`, Default 0,5 m) → zweite bilineare Abtastung aufs
  Domain-Raster (`terrain.py:118–165`). Reports dazu sind flüchtige UI-Meldungen, nichts
  davon steht im Fall.
- Toter Vorschau-Endpunkt `GET …/import/{iid}/{cand}.stl` (nie aufgerufen), doppelte
  Rollen-Whitelist Frontend/Backend (unbekannte Rolle fällt im Backend still durch alle
  `elif`), Dateikollisionen bei zwei Gelände-Layern in einem Import.

---

## 3. Datenmodell (casespec.py 881 Z. · usePreStore.js 562 Z. · preTemplates/feldTypen)

- **Kein Herkunfts-Flag.** In der ganzen Spec gibt es kein `imported`/`provenance`/
  `readonly`. Herkunft steckt in drei impliziten Kodierungen: `type === 'imported'`
  (zugleich Katalogtyp — „importierte Wand" ist nicht darstellbar, nur `imported` mit
  ungelesenem `role`), Dateinamens-Präfixe (`flat:`, `gelaende_gedreht_*`), und für
  importierte Bruchkanten/Böschungen/Querschnitte **gar nichts** — sie sind von
  handgezeichneten nicht unterscheidbar und voll editier-/löschbar.
- **Ein Dokument, fünf Ebenen.** `CaseSpec` trägt Grundlagen-Referenzen, Semantik,
  Netzsteuerung, Solversteuerung und Nachweiskriterien zugleich. Schicht-Verletzungen im
  Kleinen: `OpBerechnungskoerper` ist ein No-op im Terrain-Stapel, gelesen von
  `solids.py`; `durchstoesst_gelaende` ist ein Bauwerksschalter, der die
  Gelände-Ableitung umschaltet; `patch` (Solverbegriff) ist faktischer Primärschlüssel
  des Modells; `addObject` überschreibt Vorlagen-Patchnamen mit der Objekt-ID.
- **Erdkörper hat vier Auslöser** für einen Effekt: `TerrainBase.koerper`,
  `OpBerechnungskoerper`, `durchstoesst_gelaende`, plus die Kur `_durchstoss_ein`.
- **Geschrieben, nie gelesen:** `crs_offset`, `crs_rotation_deg` (nur Protokoll),
  `vertical_datum`, `Conventions.*`, `Alignment.kind='spline'`, `ScreenResistance.model`,
  `StructImported.role`, `_ENTFALLEN`.
- **Feldkunde doppelt gepflegt:** ~40 % in `feldTypen.js` (11 Sonderfalltabellen), ~60 %
  in `PropertyPanel.vue` (92 `FIELD_LABELS` mit 2 toten Duplikaten — die
  Böschungs-Unterkante wird als „Sohle des Erdkörpers" beschriftet). Der fertige
  Backend-Endpunkt `GET /cases/{id}/schema` wird **von niemandem aufgerufen** — die
  eigentliche Ursache der Doppelpflege.
- **Undo:** Ganz-Spec-Snapshots, aber vier Kopien der Push-Logik, Server-Mutationen
  (`drehen`/`kur`/`anschluss`) schreiben erst auf Platte und undoen nur clientseitig —
  die Datei behält bis zum nächsten Save den mutierten Stand.

---

## 4. UI (Phase Modell)

- **Bis zu 13 gleichzeitige Flächen:** 5 Panels (Baum, Editor, Schnitt, Eigenschaften,
  Prüfung) + bis zu 8 Editor-Overlays; zwei Overlays teilen sich exakt dieselbe Position
  (`.f3d-meshhint`/`.f3d-chooser`, beide `top:48 left:10`) und überdecken sich.
  ≈ 45 dauerhaft sichtbare Bedienelemente ohne Listeninhalte.
- **Editor3D.vue = 3.126 Zeilen mit 13 Verantwortlichkeiten**, darunter 363 Zeilen
  `handleAccess` mit ~20 Typzweigen, vier parallele Drag-Zustandsmaschinen, 6+4
  Interaktionsmodi (der 6. Modus „Stanzen" ist in der Toolbar unsichtbar) — und
  **drei duplizierte Serverregeln** (`resolveWindow`, `resolveBcFaces`, `openingPos`
  spiegeln `casebuilder`/`meshgen`/`solids`).
- **11 Aktionen mit mehreren parallelen UI-Wegen** — Objekt anlegen: 5 Wege; Bearbeitung
  anlegen: 4; Löschen: 5; Modellgebiet ändern: 3 (inkl. eigener Karte im
  SimulationPanel). „Schnitt" bedeutet vier verschiedene Dinge, „Netz" drei.
- **37 Katalogeinträge in 7 Dropdown-Gruppen**; Formularpfad 4 Komponenten tief
  (PropertyPanel → EditListe → UnterGruppe → PunktListe) in einem 320-px-Streifen;
  dieselbe Feldkennung `shape` bedeutet in 3 Kontexten Verschiedenes.
- **Roh vs. modelliert ist in der UI nicht existent:** alles landet gleichrangig im Baum,
  kein Sichtbarkeits-/Sperr-Schalter, keine Gruppierung, keine Mehrfachauswahl
  (`selection` ist genau ein Objekt). Ein Import mit 20 Kandidaten = 20 gleichrangige
  Einzelobjekte.

---

## 5. Bauwerke — „zu schnell zu weit" bestätigt, aber anders als gedacht

- Im committeten Stand gibt es **6 parametrische Typen + Importkörper**, kein
  Schacht/Kammer/Graben-Rezept — die Rezepte liegen uncommittet in `rezepte.py` und
  setzen Objekte **zusammen** (gut: Komposition statt neuer Typen).
- Die Verschränkung ist beim **Durchlass** am größten (16 Fundstellen außerhalb
  casespec: anschluss, kur, casebuilder, validate, router) und beim **Rechen** am
  hässlichsten: `screen` ist der einzige Typ ohne Solver-Körper (wird zu
  topoSet+fvOptions), erzeugt dadurch Sonderfälle in mindestens 6 Modulen und eine
  zweite Bedeutung von „Bauwerkskörper".
- Solver-Parameter (Darcy-Forchheimer `d[3]`/`f[3]`) leben im selben Objekt wie die
  Geometrie des Rechens — Schicht (b) und (c) in einem Datensatz.
- Doppelstrukturen: Anschluss als Endpunkt **und** als Kur; `EditGelaende` vs. Kur
  `_gelaende_einbinden`; `build_solids` läuft pro `build_case` zweimal; jeder
  mutierende Endpunkt validiert komplett inkl. Boolean-Operationen.

---

## 6. Ziel-Schichtenmodell — Soll-Zuordnung

**(a) Rohgeometrie** — unveränderlich, adressierbar, wiederverwendbar:
`imports/<id>/` inkl. Manifest wird Teil des Modells: `CaseSpec` referenziert Kandidaten
(`import_ref: {import_id, kandidat}`) statt einkopierter Punktlisten/transformierter
STL-Kopien. Transformation (Einheit, Offset, Drehung inkl. **Zentrum**) wird als
Parameter am Verweis geführt, nie in die Daten gebacken. Ein Import ist damit mit
anderen Einstellungen **neu ableitbar** ohne Neu-Upload.

**(b) Preprocessing-Geometrie** — bearbeitbar, deklarativ, aus (a) ableitbar:
Der heutige Operations-/Edit-Stapel ist das richtige Muster (deklarativ, reproduzierbar)
und bleibt der Kern. Aufzuräumen: `rotate`/`anschluss`/`kur` erzeugen **Stapeleinträge
oder Parameter** statt Quelldaten zu überschreiben; Erdkörper bekommt genau **einen**
Schalter; `patch` wird generierter Output, nicht Primärschlüssel; jedes Objekt trägt
`herkunft: import|manuell|kur` + optional `gesperrt`.

**(c) Solver-Geometrie** — generiert, wegwerfbar, außerhalb der Quelldaten:
Alles Generierte (`gelaende_*.asc`-Ableitungen, `import_*.stl`, `_mesh_preview/`,
OpenFOAM-Fall) wandert in ein `derived/`-Unterverzeichnis mit `case_hash`-Stempel;
`rasters`-Liste zeigt nur echte Quellen. Löschen von `derived/` ist jederzeit erlaubt
und folgenlos — das ist der Test, ob die Trennung steht.

---

## 7. Aufräumplan (Vorschlag, priorisiert)

**S0 — Sichern (sofort, kein Redesign):**
Stufe B committen; master nachziehen. Import-Crash I-1 ist damit erledigt.
I-2 (Raster-Transformationen) und I-5 (Umlaute) als Bugfixes hinterher.

**S1 — Herkunft & Wiederholbarkeit (Modell, klein aber tragend):**
`herkunft`-Feld + Import-Referenz in die Spec; Endpunkt `GET /cases/{id}/imports`
(Manifeste lesen); `apply` idempotent machen (Re-Apply ersetzt statt `_2`-Duplikate);
`unit_factor`/Drehzentrum persistieren, Drehkonvention vereinheitlichen.

**S2 — Verzeichnistrennung:** `derived/` einführen; `_mesh_preview` und alle
generierten Raster/STLs dorthin; `rasters`-Endpunkt filtert Ableitungen.

**S3 — UI-Entflechtung (erst nach S1, sonst fehlt der UI die Information):**
Baum nach Herkunft gruppieren (Grundlagen [gesperrt] / Modellierung / abgeleitet),
Doppelwege streichen (ein Anlege-Weg, ein Lösch-Weg, eine Gebietskarte),
`caseSchema` endlich nutzen und die Feldkunde an eine Stelle ziehen,
Editor3D in Composables schneiden (Szene / Werkzeuge / Handles / Gizmo) und die drei
Backend-Spiegel durch Server-Antworten ersetzen (`/preview` liefert die Flächen schon).

**S4 — Totholz:** toter STL-Vorschau-Endpunkt (oder nutzen: 3D-Vorschau im Import wäre
wertvoll), `caseSchema`-Doppelpflege, `importRun`, `_ENTFALLEN`, `RHO_WATER`-Zwilling,
ungelesene Meta-Felder, tote `addEdit`-Vorlagen, doppelte `FIELD_LABELS`;
`anschluss`/`rotate`/`kur` auf **einen** Mutationsvertrag zusammenziehen.

---

*Erstellt aus vier parallelen Detailanalysen (Backend-Pipeline, Frontend-UI,
Datenmodell/Store, Import Ende-zu-Ende); Einzelbefunde mit Datei:Zeile im Sitzungsverlauf.*
