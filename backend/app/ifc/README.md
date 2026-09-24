# IFC-Verbundexport

Aus mehreren Fachmodellen eine konforme IFC4X3_ADD2-Datei bauen — die fremden
Lieferungen der Beteiligten **und** das, was die CDE selbst erzeugt hat.

## Warum ein eigenes venv

`ifcopenshell` steht in `.venv-ifc/`, nicht im Produktions-venv `backend/venv`.
Zwei Gründe, beide gemessen:

- Dort hängt der laufende pm2-Dienst `quagg-api` dran, und dort stehen `numpy`
  und `shapely` bereits — an ihnen hängen `trimesh`, `manifold3d`, `scipy`.
  Ein pip-Lauf, der sie anfasst, legt den Dienst lahm.
- `uvicorn` fährt mit `workers=1` (SQLite hat nur einen Schreiber,
  `backend/app/main.py:204`). Ein Merge im API-Prozess würde den **einzigen**
  Arbeiter blockieren. Der Verbund läuft deshalb als Unterprozess.

Hausmuster: `backend/app/mcp/.venv-mcp` (Begründung in `projekt/core/env.py`).

Aufsetzen:

```bash
cd backend/app/ifc
python3 -m venv .venv-ifc
.venv-ifc/bin/pip install --no-cache-dir -r requirements-ifc.txt
```

Kostet 287 MB auf der Platte. Prüfen: `df -h /` vorher und nachher — die Platte
lief schon einmal voll.

## Tests

```bash
backend/app/ifc/.venv-ifc/bin/python -m pytest backend/app/ifc/tests/ -q
```

`tests/test_vertrag.py` nagelt fest, was wir von ifcopenshell verlangen. Fällt
ein Name weg, soll das dort auffallen — mit Namen — und nicht nach 40 Sekunden
Rechenzeit mitten in einer 300 000-Entitäten-Datei.

## Gemessene Ausgangslage (2026-09-09)

Die drei echten Gruppenmodelle in `client/src/features/cde/test/`:

| Datei | Schema | Längeneinheit | Entitäten | IfcProduct |
|---|---|---|---|---|
| `BIM26_Gruppe5_BODEN_Erdarbeiten.ifc` | IFC4X3_ADD2 | METRE | 101 658 | 4 |
| `BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc` | IFC4X3_ADD2 | **MILLI·METRE** | 39 185 | 9 |
| `IFCOUT_Entwässerung Export .IFC` | IFC2X3 | METRE | 187 629 | 41 |

Keines der drei Gruppenmodelle trägt `IfcMapConversion` oder `IfcProjectedCRS`. Die Koordinaten
*sind* die Weltkoordinaten, alle drei in UTM32. EPSG:25832 ist damit eine
begründete Annahme aus den Ostwerten — sie wird als solche mitgeschrieben, nicht
als Tatsache behauptet.

Die isyifc-Exporte (A64, ENQUIER) tragen dagegen eine — und zwar doppelt: Landes-
koordinaten in der Geometrie UND denselben Ursprung in der `IfcMapConversion`;
ENQUIER deklariert UTM32 und liegt in Gauß-Krüger Zone 2. Der Verbund misst
deshalb, welche Lesart in ein bekanntes Fenster fällt (`bezugssysteme.py`),
statt der Datei zu glauben.

### Schemanamen: Familie ≠ Fassung

`f.schema` ist die **Familie** (`IFC4X3`), `f.schema_identifier` die **Fassung**
(`IFC4X3_ADD2`). Der Migrator arbeitet mit der Familie, die Dateien nennen die
Fassung. Beides ist richtig — es sind zwei Ebenen, und wer sie verwechselt,
sucht lange. `ifcopenshell.file(schema='IFC4X3_ADD2')` schreibt
`FILE_SCHEMA(('IFC4X3_ADD2'))`.

### Migration IFC2X3 → IFC4X3: nur über IFC4

Der Migrator kennt **genau zwei** Paare: `IFC4↔IFC2X3` und `IFC4X3↔IFC4`. Einen
direkten Weg gibt es nicht. Am ProVI-Modell gemessen:

| Schritt | Entitäten | IfcProduct | Verlust |
|---|---|---|---|
| IFC2X3 (Quelle) | 187 629 | 41 | — |
| → IFC4 | 187 629 | 41 | keiner |
| → IFC4X3 | 187 592 | 41 | 37 × `IfcPresentationStyleAssignment` + 37 `IfcStyledItem` |

41 s, Spitzenspeicher 343 MB. Verloren geht **nur Einfärbung**:
`IfcPresentationStyleAssignment` ist in IFC4 abgekündigt und in IFC4X3 fort. In
IFC4+ zeigt `IfcStyledItem.Styles` direkt auf den Stil — die Farben lassen sich
also retten, das gehört in den Verbund.

## Prüfaufwand und Werkzeuge (gemessen 2026-09-11)

`ifcopenshell.validate` mit strukturiertem Bericht (`json_logger`), einmal ohne
und einmal mit Where-Rules (`express_rules=True`):

| Datei | ohne Where-Rules | mit Where-Rules | Spitzenspeicher | Befunde |
|---|---|---|---|---|
| `IFCOUT_Entwässerung Export .IFC` (IFC2X3, 187 629 Entitäten) | 18,9 s | 38,3 s | 242 / 310 MB | 1 |
| Verbund aus dem Produktionsdurchstich (42069, IFC4X3_ADD2) | 30,2 s | 81,1 s | 335 / 490 MB | 0 |
| `BIM26_Gruppe5_BODEN_Erdarbeiten.ifc` (IFC4X3_ADD2) | 10,2 s | 27,4 s | 197 / 356 MB | 0 |

Die Where-Rules verdoppeln bis verdreifachen die Prüfzeit. Der eine Befund in
der ProVI-Lieferung ist echt: `#51=IfcRelAggregates(…,())` — eine Zerlegung
ohne Teile, `RelatedObjects` verlangt `SET [1:?]`.

**Die SPF-Syntax misst `pruefe.py` inzwischen mit** (Nachtrag 2026-09-24):
`schema_pruefen()` übergibt den PFAD, nicht das geöffnete Datei-Objekt — nur so
fängt `validate` die Parserfehler der C++-Schicht (Docstring in
`ifcopenshell/validate.py`); `teile.syntax` zählt sie.

- **ifctester 0.8.5** ist installiert (IDS 1.0). venv 287 → 355 MB, ifcopenshell
  bleibt 0.8.5, numpy und shapely unberührt.
- **buildingSMART ifc-gherkin-rules: nicht eingerichtet.** Kein pip-Paket; die
  `requirements.txt` des Repos pinnt `numpy==2.2.6` und `shapely==2.1.1` (dieses
  venv hat 2.5.3 und 2.1.2) und zieht django, sqlalchemy, pandas, pyproj, rtree
  nach; `validation_results.py` importiert django schon beim Laden. Ginge nur in
  einem dritten venv — die Platte stand bei 83 %.

## IDS — Projektanforderungen (Stufe 5, 2026-09-11)

- **Kanonisch ist IDS 1.0 als XML.** `daten/quagg-starter.ids` (18 Regeln,
  XSD-gültig) ist die mitgelieferte Datei; der Client liest eine erzeugte Kopie
  für seine Vorschau (`generiere_client.py`, Wächter `test_client_woerterbuch.py`).
  Die Schwere steht als `instructions="Schwere: Fehler|Warnung|Hinweis"` an der
  Spezifikation — IDS selbst kennt keine.
- **Woher eine Prüfung ihre Regeln nimmt:** zuerst aus dem Büro (Büro-Repository,
  Schlüssel `ids:<name>`, Wert `{"datei": "<name>.ids", "xml": "…"}`, gesetzt über
  `PUT /FastAPI/buero/cde/repo/ids:<name>`), dann aus dem Projekt (hochgeladene
  `.ids`, Art `regelwerk`, nicht archiviert). Beide werden in den Laufordner
  KOPIERT (`verbund_lauf._ids_ablegen`). Ohne Regelwerk sagt der Bericht „keine
  IDS-Datei hinterlegt"; die Starter-Datei gilt nicht von selbst.
- **Das Urteil ist eine Warnung, keine Sperre.** Je Spezifikation ein Befund
  `IDS:<datei>:<nr>`: `zahl` = verfehlte Elemente, `beispiele` = deren GlobalIds,
  `teile = {anwendbar, erfuellt}`.
- **Gemessen an ifctester 0.8.5:** die Klassenfacette trifft GENAU die Klasse,
  keine Untertypen (`by_type(name, include_subtypes=False)`) — eine Regel für
  IFCWALL zählt keinen IfcWallStandardCase. `Specification.parse` liest
  `identifier` nicht ein; der Bericht zählt deshalb durch. `TRUE` und `true`
  gelten als gleich.
- **Zwei Motoren, eine Zahl:** `tests/daten/ids_vergleich.ifc` trifft jede der 18
  Regeln, `ids_vergleich.json` hält die Zählung von ifctester, und
  `client/src/features/cde/test/idsVergleich.test.js` hält die Vorschau dagegen.
  Die echten Testdateien treffen nur eine Regel (BODEN: 2 Schüttungen ohne
  `CompactedVolume`). Grenze der Vorschau: Merkmale am TYP
  (`IfcTypeObject.HasPropertySets`) sieht sie nicht, ifctester schon.
- **Der abgeleitete Container (Fahrplan Erdbau-Container, Stufe 4).** Vier Regeln
  gelten nur für Elemente der CDE (`Quagg_CDE.CdeId` vorhanden — in IDS eine
  Property ohne Wert): `spec-aushub-herkunft`/`spec-auftrag-herkunft` verlangen
  `Quagg_Herkunft.QuellRevision` (Schwere Fehler), `spec-aushub-typ`/`spec-auftrag-typ`
  einen PredefinedType aus dem Schema ohne NOTDEFINED/USERDEFINED (Warnung). Die
  Aufzählung steht als `xs:restriction` in der Datei; `test_ids.py` hält sie gleich
  `schema.predefined`. Die Vorschau im Client kann keine Aufzählung — genau diese
  zwei Regeln stehen in `nichtInVorschau`. **Nicht per IDS:** der Wirt eines
  Aushubs. ifctester 0.8.5 prüft `partOf IFCRELVOIDSELEMENT` nur für
  IfcOpeningElement (`test_vertrag.py::test_partof_voids_kennt_keinen_earthworkscut`);
  den Wirt misst V07.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `verbund.py` | `fuehre_zusammen()` — je Quelle Einheit, Schema und Lage klären, Zielgerüst, übernehmen (die Sites der Lieferungen gehen in EINER auf, `_site_aufloesen`), aufräumen, schreiben; dazu `zielgeruest()`, `georeferenz_setzen()` |
| `bezugssysteme.py` | Fenster der Bezugssysteme (gespiegelt aus `cde/services/Koordinatensysteme.js`, ein Test vergleicht beide). Rein — auch der API-Server importiert es |
| `schema.py` | **Die eine Schema-Wahrheit.** Zieht aus dem gepinnten ifcopenshell den Schnappschuss `daten/schema_IFC4X3_ADD2.json` (Klassen, Vererbung, Attribute, PredefinedTypes, Where-Rules mit Quelltext, Pset-/Qto-Vorlagen, Altnamen). Jede Abfrage liest nur den Schnappschuss — läuft ohne ifcopenshell |
| `generiere_client.py` | Erzeugt daraus das Client-Wörterbuch (`client/src/features/cde/data/entity-schema.js`, `pset-templates.js`, `altnamen.js`) und die Kopie der Starter-IDS. Nie von Hand ändern |
| `diagramme.py` | Mermaid der GENUTZTEN Teilmenge nach `docs/ifc/` (Klassen, Beziehungen, Prüfstufen) — aus Code und Schnappschuss, `--pruefe` vergleicht |
| `kopf.py` | Import-Tor ohne ifcopenshell: STEP-/ZIP-Kopf, `FILE_SCHEMA`, Längeneinheit als Hinweis, IFCPROJECT-GlobalId. Rein — der Upload im API-Server nutzt es; Falltabelle `tests/daten/kopf_faelle.json` teilt es mit `ModelIdentity.js` |
| `kategorien.py` | fachliche Wurzeln (Aushub) über die Vererbung des Schnappschusses, Spiegel von `cde/services/Kategorien.js` |
| `pruefe.py` | Prüftor, der EINE Orchestrator: Stufen `schema` (SPF: Syntax, Schema, Where-Rules), `verbund` (V00–V08; V10/V11 aus dem Eigenbau-Paket: kein Misserfolg im Container), `ids` (ifctester), `gherkin` (Hinweis: nicht eingerichtet); `offen()` ist die eine Sperr-Regel |
| `probe.py` | das Dreier-Tor über die echten Gruppenmodelle, samt V09: web-ifc liest dieselbe Datei und zählt dasselbe |
| `cli.py` | der Unterprozess, den der Server startet — der Vertrag über den Laufordner steht im Kopfkommentar |
| `guids.py` | abgeleitete statt gewürfelter GlobalIds |
| `eigenbau.py` | CDE-Eigenbau (Paket des Browsers) → eigene IFC-Quelle: Klasse und PredefinedType aus dem Schema, Qto nach bSI-Vorlage, Wirt-Beziehung, Vorgangs- und Fachmodell-Gruppen, `Quagg_CDE` und `Quagg_Herkunft` je Element |
| `herkunft.py` | **Die Herkunft erzeugter Elemente an EINER Stelle:** `Quagg_Herkunft` (ergänzt einen vorhandenen Satz statt einen zweiten anzulegen), Quelldokumente als `IfcDocumentInformation` + `IfcDocumentReference` + `IfcRelAssociatesDocument`, Eingabe-Hash, Journalstand. Kein ifcopenshell auf Modulebene |
| `__init__.py` | nur `WERKZEUG`/`FASSUNG` (heute „2") — für IfcApplication, STEP-Kopf, `Quagg_Herkunft.Werkzeug` und den Bericht; der API-Server importiert das Paket ohne ifcopenshell |

Der Server-Weg (`POST /FastAPI/projekte/{id}/cde/verbund` → 202, dann
`GET …/cde/verbund/{lauf_id}`, der ganze Bericht unter `…/{lauf_id}/bericht`) steht in
`backend/app/api/projekt/core/verbund_lauf.py` —
in Git, wirkt aber erst nach `pm2 restart quagg-api` (anders als `app/ifc/*`, das der
Unterprozess bei jedem Lauf von der Platte lädt). Ins Register kommt nur ein Verbund,
der jedes Kriterium bestanden hat.

## Erdbau-Dokument und Verbund (Fahrplan Erdbau-Container, 2026-09-11)

Leitsatz: **föderiert, nicht gemergt.** Jeder erzeugende Prozess liefert seinen eigenen
Container mit Herkunft; der Verbund ist ein Abgabe-Artefakt, kein Arbeitsstand.
Architektur und Entscheidungen: `docs/ifc/fachmodelle.md`.

| Frage | Antwort | Ort |
|---|---|---|
| Modi des Unterprozesses | `verbund` (Satz → ein Modell), `erdbau` (Gelände der Wirte + Eigenbau → `Erdbau_<Satz>_R<nn>.ifc`), `pruefe` (ein Registerdokument durchs Tor) | `cli.py`, `verbund_lauf.auftrag_bauen` |
| Quellen des Erdbau-Dokuments | genau die Registerdateien der Wirte (`paket.quellDokumente`); ein Wirt ohne Registerdatei → 422; ein selbst erzeugtes Dokument ist keine Quelle | `verbund_lauf._auftrag_erdbau` |
| Verbund mit Erdbau-Dokument im Satz | das Gelände darin fällt weg (`weggelassen`, „steckt in …") | `verbund_lauf.auftrag_bauen` |
| Wie viele Sites | EINE — die Sites der Lieferungen gehen auf; ihre Attribute wandern, wenn dort leer; bei Widerspruch bleibt die Site geschachtelt, und der Bericht sagt es; `Quagg_Fachmodell.OriginalSiteGlobalId` | `verbund._site_aufloesen` |
| Herkunft am Element | `Quagg_Herkunft`: QuellDokument, QuellRevision, QuellSHA256, QuellGlobalIds (JSON), Journalstand (`<commit>[+Sitzung]`), Erzeugt, Werkzeug, EingabeHash (sha256[:16] über Klasse, Typ, Geometrie, Mengen, Quellen); OriginalGlobalId/OriginalDatei nur bei Kollision. Nur aus der CDE: QuellDokument „CDE-Journal"; aus einer Lieferung ohne Registerdatei: keine Quelle | `herkunft.py`, `eigenbau.baue_datei` |
| Quelle als Dokument | je sha256 ein `IfcDocumentInformation` (Identification = sha256, Revision, Location = Ablage) und eine `IfcDocumentReference` ohne Namen (`WR1`), verknüpft mit Fachmodell-Gruppe und Elementen; im Verbund verschmolzen | `herkunft.dokument`, `verbund._einmalige_verschmelzen` |
| GlobalIds | bleiben an der Journal-Kennung (E4) — dasselbe Element über Revisionen; ob sich der Inhalt änderte, sagt der EingabeHash | `guids.py` |
| Typobjekte (Teil XXIII A9b) | je (Typklasse, Vorlage) EIN `Ifc…Type` — Klasse aus der Where-Rule `CorrectTypeAssigned` (`schema.typklasse`), Name aus der Bibliothek, Tag = Vorlagen-Id, PredefinedType gemeinsam oder NOTDEFINED; `IfcRelDefinesByType`, erklärt am Projekt (`IfcRelDeclares`); Paketfeld `typ` optional, nur mit Vorlage; Klasse ohne Typ (Aushub, Auftrag) → Warnung + `Quagg_CDE.Vorlage`. Im Verbund erklärt `_typen_erklaeren` jeden Typ ohne Projekt am Verbundprojekt | `eigenbau._typen_schreiben`, `verbund._typen_erklaeren` |
| Unvollständiger Container | V10 sperrt, wenn das Paket `misserfolge` führt; V11 nennt Leeres und Ausgeblendetes (Hinweis) | `pruefe.paketregeln` |
| Fassung | `FASSUNG = "2"`; ein älteres Dokument (Fassung 1) im Verbund bekommt seine Fassung in die ApplicationIdentifier (UR1) | `__init__.py`, `verbund._einmalige_verschmelzen` |
| Namen und Register | `^(Verbund\|Erdbau)_[A-Za-z0-9_-]+_R\d{2,}\.ifc$`, Satzname in ASCII; Eignung S1 beim Eintragen, Vorgabe je Status (S2/A1/CR); ein Verbund gehört in keinen Satz | `backend/app/api/projekt/core/cde.py` |

## Prüfen

```bash
cd backend
app/ifc/.venv-ifc/bin/python -m app.ifc.probe                          # Dreier-Tor, ~2,5 min
PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m pytest app/ifc/tests/ -q   # alle IFC-Tests
PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m app.ifc.pruefe <datei.ifc> # eine beliebige Datei
```

„Ungeprüft" zählt als nicht bestanden: fehlt dem Lauf etwa `node` für den zweiten
Motor, wird der Verbund abgelehnt, nicht durchgewunken.
