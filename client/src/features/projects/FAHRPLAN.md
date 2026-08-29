# Fahrplan Projekt-Cockpit für Ingenieurbüros (HOAI · Pauschal · Stunden)

Stand: beschlossen 2026-08-25 (Fabio + Claude). Noch keine Stufe gebaut.
Schwester-Dokument: `client/src/features/kleiner-pedant/FAHRPLAN.md` (Buchhaltung, Kap. 15 kündigt dieses Modul an).

## 1. Ausgangslage

`views/intern/ProjectsView.vue` ist eine Dummy-Ansicht: Kennzahlen 12/5/8 hartkodiert, darunter der (funktionierende) Ordner-Browser und ein `DocReader` mit einem Save-Endpunkt, den es nicht gibt. Unter `features/projects` liegen eine Projektliste gegen einen nicht existierenden Endpunkt, ein Kanban mit drei erfundenen Aufgaben und ein nie gerouteter Workspace. Im Backend gibt es `api/projects.py` mit drei FS-Endpunkten (`/list`, `/all_ids`, `/file`) und in `models/domain.py` totes, aber brauchbares Vokabular (HOAI-Leistungsphasen 1–9 mit Labels).

Was bereits trägt und bleibt:

- **Projekt = Ordner** auf der StorageBox: `/mnt/storagebox/1_Projekte/{00_Angebote,01_Laufend,02_Pausiert,03_Abgeschlossen,04_Abgelehnt,05_Bezahlt}/<id>_<name>/`. `projekt_id` = numerischer Ordnername, bewusst ohne Fremdschlüssel (Muster `EmailEvent.project_id: int`).
- **E-Mail-Bezug**: `GET /emails/projects/{project_id}/emails` existiert.
- **Pedant** (Buchhaltung): `auftraggeber`, `rechnungen` (+Positionen, XRechnung/KoSIT), `erwartetes_geld` (brutto), `belege.kostenmerkmal`.
- **CDE** (`features/cde`): `RepoFacade.js` mit `RemoteBackend`, `useCdeStore.createProject({nummer,name,bauherr,lph,notiz})`, Dokumentregister ISO 19650, BCF-Issues. Stufe C ist gebaut — nicht als eigenes `api/cde/`, sondern im Projekt-Cockpit: `projekt/core/cde.py` + 5 Endpunkte, Ablage `<Projektordner>/CDE/manifest.yaml` und `CDE/_repo/`.
- **KI-Infrastruktur**: `app/mcp/literatur_server.py` (FastMCP, Google-OAuth 2.1, systemd, nginx `mcp.quagg-engineering.org`), `ingest/` (Textextraktion → FTS5-SQLite), Anthropic-SDK lazy vorbereitet (kein Key).
- Client-Deps: `xlsx`, `jspdf`, `chart.js`, `lucide-vue-next`. Im venv: pymupdf, pdfplumber. **Fehlen**: docxtpl/python-docx, openpyxl, anthropic, mammoth (Client).

Real liegen heute ein Angebot und ein laufendes Projekt (`1337_Genau`, leer) auf der StorageBox — eine Unterordner-Konvention gibt es noch nicht, wir dürfen sie festlegen.

## 2. Ziele

1. Ein **Portfolio**, das die echten Zahlen zeigt (Anzahl je Phase, offene Angebote, unabgerechnete Leistung, fällige Fristen) und je Projekt einen Fortschrittsbalken.
2. Eine **Projektakte** mit Leistungsstand nach HOAI-Leistungsphasen, freien Pauschal-Abschnitten oder Stundenbudget — und der ehrlichen Lücke zwischen Leistung, Abrechnung und Zahlung.
3. **Verzahnung mit dem Pedanten**: Abschlagsrechnung aus dem Leistungsstand, Rechnung aus Stunden, Fremdkosten je Projekt.
4. **Dokumente**: Word/Excel am Netzlaufwerk und im Browser (ONLYOFFICE), Vorlagen mit Projektdaten, Volltextsuche über den Projektordner.
5. **CDE** je Projekt (Modelle, Pläne, Revisionen) mit Deep-Link statt Einbettung.
6. Eine **Hintergrund-KI mit echtem Kontext** — zuerst als MCP-Server über das Abo, später als In-App-Assistent — die nur Vorschläge macht.

## 3. Was das Modul bewusst nicht macht

- Kein HOAI-Honorartafel-Rechner im Kern (anrechenbare Kosten, Honorarzone, Interpolation, Umbauzuschlag) — HOAI ist seit 2021 unverbindlich; real wird ein Honorar vereinbart und nach LPH-Gewichten aufgeteilt. Der Rechner ist eine optionale Stufe 2b für die Angebotserstellung.
- Kein Kanban-Wiederbeleben; Aufgaben sind eine schlanke Liste mit Status, Fälligkeit und Abschnittsbezug.
- Kein Einbetten des IFC-Viewers ins Cockpit (Vollbild-Layout, WASM); das Cockpit verlinkt.
- Keine KI, die Fakten schreibt: alles landet als Vorschlag mit Bestätigung im Cockpit.
- Kein Kundenportal in den Kernstufen (fehlendes Auftraggeber→User-Mapping) — optionale Stufe 8.

## 4. Leitentscheidungen

1. **Projekt = Ordner bleibt; die Ordnerlage ist die einzige Wahrheit für die Phase.** Keine `status`-Spalte in der DB. Das Backend liest die Phase beim Listen aus dem Dateisystem (≤ 100 Projekte, CIFS `actimeo=1` → billig). Phasenwechsel = `verschiebe(id, phase)` = ein Rename. Damit bleibt der Explorer am Netzlaufwerk gleichberechtigt; ein Verschieben von Hand erzeugt keinen Drift. `05_Bezahlt` ist Zahlungsstatus, keine Phase: das Cockpit **schlägt** den Umzug vor (alle Rechnungen bezahlt).
2. **Bewegungsdaten in Postgres, Schema `projekt` in `pedant_prod`/`pedant_test`.** Keine zweite Datenbank: Level-Bar und Geld werden ein Join, kein zweiter Verbindungspool im `LimitNOFILE=100`-Budget. Eigener Migrationsordner `backend/app/api/projekt/migrations/` mit eigener Versionstabelle `projekt.schema_version`, ausgeführt über `pedant/cli.py migrate --modul projekt --ziel test|prod` (Prod verweigert vor Test). Grants für `pedant_app` auf `projekt.*` explizit (REVOKE-ALL aus Pedant-Migration 002 trifft jede neue Tabelle). Der `pedant-backup.timer` sichert das Schema automatisch mit.
3. **Stammdaten-Snapshot im Ordner:** `<Projekt>/_akte/akte.yaml` wird vom Backend nach jeder Änderung geschrieben — lesbar, überlebt DB-Verlust, ist Kontext für die KI. Schreibrichtung nur DB → Datei, nie umgekehrt.
4. **Honorar in Cent netto je Abschnitt** ist die Primärgröße; Anteile werden abgeleitet. Kein Promille-Schema (bricht bei Nachträgen: Σ ≠ 100 %, Neunormierung verfälscht alle Altabschnitte). Der Fortschrittsbalken rechnet durchgehend **netto**; das Pedant-`erwartetes_geld` (brutto) wird nur **befüllt**, nicht als Quelle gelesen.
5. **HOAI ist Vorlage, nicht Rechner.** `honorarmodell IN ('hoai','pauschal','stunden')`: `hoai` = Abschnitte aus einer Leistungsbild-Vorlage vorbefüllt (Teilbeauftragung = nur gewählte LPH), `pauschal` = freie Abschnitte, `stunden` = Budget aus Satz × Stunden.
6. **KI schreibt nie Fakten.** MCP-Schreibwerkzeuge erzeugen `projekt.vorschlaege(status='offen')`; Bestätigung im Cockpit (Vier-Augen wie beim Beleg).
7. **Viewer wird nicht eingebettet**: `/cde?projekt=<id>`.
8. **Kundenportal-Projektsicht wird in Stufe 0 entfernt** und kommt als optionale Stufe 8 zurück.

## 5. Zielbild

**Portfolio** (`/intern/projects`): Kacheln je Projekt mit Mini-Fortschrittsbalken, Phase (aus der Ordnerlage), nächstem Termin, unabgerechneter Leistung. Kennzahlen-Karten echt: Anzahl je Phase, Σ offene Angebote, Σ unabgerechnet, fällige Wiedervorlagen. Abgleich-Karte „Ordner ohne Akte / Akte ohne Ordner". Knopf „Neues Projekt": Nummer = max über alle Phasenordner + 1, Ordner-Template, Akte.

**Projektakte** (`/intern/projects/:id`) mit Tabs, je Tab eine Wurzelkomponente unter 250 Zeilen:

| Tab | Inhalt |
|---|---|
| Übersicht | Stammdaten, Beteiligte, großer Fortschrittsbalken (3 Schichten), Meilensteine/Fristen, offene KI-Vorschläge |
| Leistung | Abschnitte (LPH oder frei): Honorar netto, Fortschritt %, Status; Nachträge, Besondere Leistungen, Nebenkosten; Honorarhistorie (append-only) |
| Geld | Pedant-Sichten gefiltert: erwartetes Geld, Rechnungen (Abschläge), Belege mit `kostenmerkmal = '#P<id>'`; Knopf „Abschlag aus Leistungsstand" |
| Zeiten | Zeitbuchungen (Timer + manuell), Auswertung Woche/Monat/Abschnitt, Stundennachweis PDF/xlsx |
| Aufgaben | schlanke Liste mit Status/Fälligkeit/Abschnitt |
| Dokumente | Explorer (bestehend), „In Word/Excel öffnen", „Im Browser bearbeiten" (ONLYOFFICE), Vorlagen erzeugen, Volltextsuche |
| Modelle | CDE-Dokumentregister aus `CDE/manifest.yaml`, Deep-Link `/cde?projekt=<id>` |
| Kommunikation | Mails je Projekt (Endpunkt vorhanden) |
| Dossier | das generierte `DOSSIER.md`, „neu erzeugen" |

## 6. Datenmodell (Schema `projekt`)

```
projekt.projekte             id BIGINT PK (= Ordnernummer), name, kurzname, ordnername,
                             honorarmodell hoai|pauschal|stunden, leistungsbild NULL,
                             stundensatz_cent NULL, budget_stunden NULL,
                             auftraggeber_id BIGINT NULL (→ pedant.auftraggeber, nur Zahl),
                             angelegt_am, aktualisiert_am              -- KEIN status (Ordnerlage!)
projekt.beteiligte           projekt_id, rolle (bauherr|auftraggeber|rechnungsempfaenger|architekt|behoerde|…),
                             name, kontakt, pedant_auftraggeber_id NULL
projekt.abschnitte           id, projekt_id, nr, bezeichnung, lph SMALLINT NULL (1–9),
                             art grund|besondere|nachtrag|nebenkosten,
                             honorar_cent BIGINT (netto), beauftragt BOOL,
                             fortschritt_prozent SMALLINT 0–100, status offen|laufend|fertig|abgenommen
projekt.honorar_aenderungen  append-only: abschnitt_id, alt_cent, neu_cent, grund, akteur, am
projekt.meilensteine         projekt_id, art (termin|abgabe|bindefrist|gewaehrleistung|aufbewahrung|wiedervorlage),
                             bezeichnung, faellig_am, erledigt_am NULL
projekt.aufgaben             projekt_id, abschnitt_id NULL, titel, status offen|laufend|erledigt,
                             faellig_am NULL, quelle manuell|ki|bcf, quelle_ref
projekt.zeitbuchungen        projekt_id, abschnitt_id NULL, start, ende, dauer_min, taetigkeit,
                             abrechenbar BOOL, rechnung_id BIGINT NULL (→ pedant.rechnungen, nur Zahl)
projekt.leistungsbilder      Vorlagen: paragraf (35|39|43|47|51|55), jahrgang 2021, lph, bezeichnung, prozent — editierbar
projekt.vorschlaege          projekt_id, art (aufgabe|notiz|termin|fortschritt), nutzlast JSONB,
                             status offen|uebernommen|verworfen, von 'mcp'|'assistent'
projekt.auditlog             Muster Pedant (Aktion, Akteur, Erfolg, Detail)
```

Trigger: `honorar_aenderungen` bei UPDATE von `abschnitte.honorar_cent`; Sperre von `zeitbuchungen` mit gesetzter `rechnung_id`; `aktualisiert_am`.

**Ordner-Template** bei Anlage: `_akte/` (intern: akte.yaml, DOSSIER.md, index.sqlite) · `00_Vertrag/` · `01_Grundlagen/` · `02_Planung/LPHn_…/` je beauftragter Phase · `03_Schriftverkehr/` · `04_Berechnungen/` · `05_Rechnungen/` · `CDE/`. `_akte/` wird vom FS-Browser, vom Kundenportal und vom CDE-Listing ausgeblendet.

## 7. Fortschritt und Fortschrittsbalken (Level-Bar)

- **Leistung (netto):** `L = Σ honorar_cent_i × fortschritt_i / 100` über beauftragte Abschnitte; Gesamtfortschritt `= L / Σ honorar_cent_i`.
- **Abgerechnet:** Σ gestellte Rechnungen netto mit `projekt_id` (Pedant). **Bezahlt:** davon Status bezahlt.
- **Stunden-Projekte:** Fortschritt = gebuchte Stunden / Budget (über 100 % kippt der Balken auf Warnfarbe); Leistung = Stunden × Satz.
- **Komponente `FortschrittLeiste.vue`:** Segmente je Abschnitt (Breite ∝ Honorar), Füllung = Fortschritt, darunter zwei dünne Marker-Schichten (abgerechnet/bezahlt). Die Lücke „Leistung − Abgerechnet" ist die Kennzahl **unabgerechnete Leistung**, portfolio-weit summiert. Rechenlogik rein in `services/Fortschritt.js` (vitest ohne DOM).
- **HOAI-Gewichte (Seed, editierbar):** § 43 Ingenieurbauwerke **2/20/25/5/15/13/4/15/1** und § 47 Verkehrsanlagen **2/20/25/8/15/10/4/15/1** (verifiziert gegen den Gesetzestext, 2026-08-25); § 35 Gebäude 2/7/15/3/25/10/4/32/2 und § 39 Freianlagen 3/10/16/4/25/7/3/30/2 (vor dem Seed gegen hoai.de gegenlesen). LPH-Bezeichnungen aus `domain.py::ServicePhase`; LPH 8 heißt bei § 43/§ 47 „Bauoberleitung".

## 8. Verzahnung mit dem Pedanten

- Pedant-Migration **009**: `erwartetes_geld.projekt_id INT NULL`, `rechnungen.projekt_id INT NULL` (kein FK; der `rechnungen`-Trigger prüft nur die explizite Spaltenliste, die neue Spalte ist unkritisch); Konvention `belege.kostenmerkmal = '#P<id>'`.
- Projektanlage mit Honorar → **eine** Planzeile in `erwartetes_geld` (brutto = netto × 1,19, `erwartet_am` = letzter Meilenstein); Honoraränderung aktualisiert sie.
- **Abschlag aus Leistungsstand (4a):** Positionsvorschlag im Rechnungsentwurf = je Abschnitt `honorar × fortschritt − bereits gestellt` (kumuliert), Text „n. Abschlag, Leistungsstand TT.MM.JJJJ", weiterhin Typ 380 über den bestehenden XRechnung/KoSIT-Pfad. **4b später:** Typcodes 326/384 und Vorrechnungs-Referenzen (BG-3) in `xrechnung.py`.
- **Rechnung aus Stunden:** nicht abgerechnete `zeitbuchungen` → Positionen (Einheit HUR); nach dem Stellen wird `rechnung_id` gesetzt und die Buchung gesperrt.

## 9. Dokumente und Office

**O1 Desktop-Office.** StorageBox nativ als Netzlaufwerk — **WebDAV** `https://uXXXX.your-storagebox.de` (empfohlen; SMB braucht „externe Erreichbarkeit" und Port 445 ist bei vielen Anschlüssen gesperrt). Cockpit-Knopf „In Word/Excel öffnen" = Office-URI `ms-word:ofe|u|<WebDAV-URL>` bzw. `ms-excel:ofe|u|…` (offizielles Schema; Office kann bei fremder Sicherheitszone warnen → Fallback O2). Vorlagen-Generator im Backend (`docxtpl` + `openpyxl`): Anschreiben, Aktennotiz, Stundennachweis, Honorarermittlung — mit Projektdaten befüllt, in den Projektordner geschrieben. Lesende Vorschau im Browser: docx via `mammoth`, xlsx via vorhandenem `xlsx`.

**O2 Online-Office (feste Stufe).** **ONLYOFFICE Docs Community Edition** per Docker (`onlyoffice/documentserver`, ~0,5–1,3 GB RAM; die Grenze von 20 gleichzeitigen Dokumenten ist für ein Büro irrelevant) hinter `office.quagg-engineering.org`, JWT-Secret in `.env`. FastAPI wird **WOPI-Host**: `GET /wopi/files/{id}` (CheckFileInfo), `GET/POST /wopi/files/{id}/contents` (GetFile/PutFile mit Lock-Semantik); Datei-IDs = signierte Token auf Projektpfade unter `_safe_path`. Editor als eigener Vollbild-Tab `/office?projekt=…&pfad=…` (Muster PDF-Editor). Vorbedingung: `free -m` vor der Installation (7,6 GB Server, Docker-Snap für lisflood läuft bereits); `sudo` nur nach Rückfrage.

**Volltextindex.** `_akte/index.sqlite` (FTS5) je Projekt nach `ingest`-Muster: pdf (pymupdf), docx (python-docx), xlsx (openpyxl), E-Mails (aus `EmailEvent`); inkrementell über mtime; Suche im Tab und als MCP-Werkzeug.

## 10. CDE-Anbindung

CDE-Roadmap **Stufe C** wird Teil dieses Fahrplans: `backend/app/api/cde/` mit `<Projekt>/CDE/manifest.yaml` (Revisionen, ISO-19650-Status, Chunked-Upload, audit.jsonl), `RemoteBackend` in `RepoFacade.js` mit Scope = `projekt_id`. Vertrag ab Stufe 1: `CdeView` versteht `?projekt=<id>`; `useCdeStore.createProject` liest Nummer, Bezeichnung, Bauherr und LPH aus der Projekt-API statt aus Handeingabe — der Plankopf füllt sich damit automatisch. BCF-Issues → optional `aufgaben(quelle='bcf')`. Die Stufe ist von den übrigen unabhängig und kann parallel ab Stufe 1 laufen.

## 11. Hintergrund-KI

**7a Dossier + MCP (direkt nach Stufe 2).**

- `core/dossier.py` erzeugt deterministisch `<Projekt>/_akte/DOSSIER.md` (~5–20k Token): Stammdaten, Beteiligte, Abschnitte mit Fortschritt/Honorar, Geldstand (Pedant), Meilensteine/Fristen, offene Aufgaben, letzte Zeitbuchungen, Mail-Betreffzeilen, Dokumentliste mit Datum, CDE-Register. API `GET /projekte/{id}/dossier`.
- **Projekt-MCP-Server** `backend/app/mcp/projekt_server.py` nach dem Muster des Literatur-Servers (FastMCP, Google-OAuth, eigener systemd-Dienst, eigener Pfad auf `mcp.quagg-engineering.org`). Lese-Werkzeuge: `projekte_liste`, `projekt_dossier`, `projekt_suche` (FTS5), `projekt_termine`, `projekt_geld`, `projekt_aufgaben`, `dokument_lesen`. Schreib-Werkzeuge erzeugen **nur Vorschläge**: `vorschlag_aufgabe`, `vorschlag_notiz`, `vorschlag_zeitbuchung`. Damit werden Claude Desktop, claude.ai und Claude Code zum Projektassistenten — über das Abo, ohne API-Key.

**7b In-App-Assistent (nach Key-Lieferung).** Hintergrund-Jobs mit dem Anthropic-SDK (Muster `pedant/core/erkennung.py`): Wochenbrief („was liegt an"), Mail-Triage → Aufgabenvorschläge, Risiko-Hinweise (Leistung ≫ Abrechnung, Frist < 14 Tage). Kontext = Dossier + FTS-Treffer; Ausgabe immer in `vorschlaege`; Kosten-Deckel je Job (Muster Cloud-Leitplanken).

## 12. Reihenfolge des Bauens

| Stufe | Inhalt | Ergebnis / Test |
|---|---|---|
| **0 Aufräumen** | `projectApi.js`, `ProjectWorkspace.vue`, `KanbanBoard.vue`, `ProjectList.vue`, `domain.py` (nach Übernahme der LPH-Labels) löschen; `InternDashboardView`-Import fixen; Kundenportal-Projektroute entfernen; `DocReader`-Save-Endpunkt rausnehmen | SFC-Compile-Check, Render-Test der Views |
| **1 Fundament** | Migration `projekt/001` (projekte, beteiligte, meilensteine, auditlog + Grants); `backend/app/api/projekt/` (Router hinter INTERNAL-Gate; `core/ordner.py`: Phasenscan, Nummernkreis, Template-Anlage, `verschiebe`, `_safe_path` übernommen; `core/akte.py`: akte.yaml); Client `features/projects/` neu: `ProjekteApi.js`, Store, Portfolio mit echten Zahlen, Anlage-Dialog, Abgleich-Karte, Akte-Gerüst (Übersicht/Dokumente); Netzlaufwerk-Anleitung (O1, kein Code) | pytest gegen Fake-Root + `pedant_test`; vitest Render-Prüfstand |
| **2 Honorar & Fortschritt** | Migration 002 (abschnitte, honorar_aenderungen, leistungsbilder mit Seed § 43/§ 47/§ 35/§ 39); `core/fortschritt.py`; Tab „Leistung"; `FortschrittLeiste.vue` (Schicht Leistung); Teilbeauftragung, Nachträge; Meilenstein-Arten/Fristen | Rechenlogik-Tests (Σ, Nachtrag, Teilbeauftragung); 2b optional Honorartafel-Rechner |
| **7a Dossier + MCP** | `core/dossier.py`, `projekt_server.py`, systemd + nginx, `vorschlaege` + Cockpit-Karte | MCP-Werkzeuge per Claude Desktop gegen Testprojekt |
| **4 Geld** | Pedant-Migration 009, Planzeilen-Sync, Tab „Geld", Abschlag aus Leistungsstand (4a), Balken-Schichten abgerechnet/bezahlt, Portfolio „unabgerechnet" | E2E gegen `pedant_test`: Abschlag → Entwurf → stellen → Balken |
| **3 Zeit & Aufgaben** | Migration 003 (zeitbuchungen, aufgaben); Timer, Auswertungen, Stundennachweis (jspdf/xlsx), Rechnung aus Stunden (HUR) | Sperre nach Abrechnung getestet |
| **5 Dokumente & Office** | Volltextindex + Suche; Office-URI-Knöpfe; Vorlagen-Generator; Vorschau (mammoth/xlsx); ONLYOFFICE + WOPI-Host hinter `office.`-Subdomain | WOPI-Roundtrip (Öffnen → Speichern → sha ändert sich, Lock korrekt) |
| **6 CDE** | CDE Stufe C (Backend `cde/`, RemoteBackend), `?projekt=`-Vertrag, Tab „Modelle", Plankopf-Autofill | bestehende CDE-Tests + Repo-Roundtrip |
| **7b Assistent** | nach Key: Wochenbrief, Mail-Triage, Risiko-Hinweise → `vorschlaege` | Kosten-Deckel je Job |
| **8 optional** | Tab „Kommunikation", Kundenportal-Status (Balken read-only; braucht Auftraggeber→User-Mapping) | |

Begründung der Reihenfolge: Geld vor Zeit (der Abschlag aus dem Leistungsstand ist der Schmerzpunkt; Zeit braucht nur, wer Stundenprojekte fährt oder nachkalkuliert); Dossier + MCP früh (Infrastruktur existiert, größter Nutzen pro Aufwand); CDE unabhängig.

## 13. Client-Struktur (`client/src/features/projects/`)

`services/ProjekteApi.js` (Axios-Instanz aus `@/services/api`), `services/Fortschritt.js` (rein); Stores `useProjekte.js`, `useAbschnitte.js`, `useZeiten.js`, `useAufgaben.js`; `components/portfolio/` (Kacheln, Kennzahlen, Abgleich), `components/akte/` (je Tab eine Datei), `components/ui/` (`FortschrittLeiste.vue`, `ProjektIcon.vue` als einziges lucide-Tor wie `PedantIcon`); `styles/theme.css` mit `--prj-*` **auf `:root`** (Teleport-Falle); `views/intern/ProjectsView.vue` = Portfolio, neu `ProjektAkteView.vue` unter `/intern/projects/:id`. Jede Komponente unter 250 Zeilen; Geld immer Integer-Cent (`Geld.js` aus dem Pedanten wiederverwenden); Tests in `features/projects/test/` inklusive Render-Prüfstand.

## 14. Landminen (aus Pedant und CDE gelernt)

- REVOKE ALL (Pedant-Migration 002) → jede neue Tabelle braucht Grants und `GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt`.
- psycopg-Savepoint-Falle: `conn.rollback()` vor `conn.transaction()` nach Lese-SELECTs.
- CIFS `soft`-Mount: ein Rename kann scheitern — erst Rename, dann Audit, nie umgekehrt.
- `_akte/` niemals ins Kundenportal oder CDE-Listing.
- Theme-Tokens auf `:root`; kein Build direkt in `dist`; kein `pkill -f vite`.
- Keine Tests gegen `pedant_prod`: Kreditkarten-Sperre in `conftest` um `PROJEKTE_ROOT` → tmp erweitern.
- ONLYOFFICE erst nach RAM-Prüfung und Rückfrage.
- Office-URI-Links funktionieren nur mit gespeicherten WebDAV-Anmeldedaten in Windows; Zonenwarnung von Office ist bekannt.

## 15. Testframework und Produktivsetzung

Je Stufe: pytest (Fake-Root + `pedant_test`) und vitest grün, SFC-Compile-Check, Prod-Migration nur nach Test-Migration, `pm2 restart quagg-api` nach Import-Test im PM2-Pfadkontext, Build atomar über `dist_neu`. Produktionstest am Ende aller Stufen nach dem Muster `PRODUKTIONSTEST.md` (Prüfliste + Artifact): Testprojekt in `00_Angebote` mit Bindefrist, Abschnitten nach § 43, Abschlag-Vorschlag (nur Vorprüfung, **nicht stellen** — die Rechnungsnummer ist unwiderruflich), Dossier per MCP abgefragt, WOPI-Roundtrip an einer Wegwerf-Datei.

## 16. Offene Fragen für später

- Honorartafel-Rechner (Stufe 2b) — nur, wenn Angebote regelmäßig nach HOAI-Tafeln kalkuliert werden.
- Kundenportal: Auftraggeber→User-Mapping, was der Kunde sehen darf (Balken, Termine, freigegebene Dokumente).
- Beteiligte ↔ Pedant-Auftraggeber: bleibt die Zahl-Referenz, oder wird `auftraggeber` zur gemeinsamen Stammdatentabelle?
- Gewährleistungs- (§ 634a BGB, 5 Jahre) und Aufbewahrungsfristen (10 Jahre) als automatische Meilensteine beim Abschluss.

---

## 17. Stand der Umsetzung (2026-08-26, in einem Durchgang gebaut)

| Stufe | Status | Was steht |
|---|---|---|
| 0 Aufräumen | **fertig** | tote Attrappen entfernt (projectApi, Workspace, Kanban, ProjectList, ProjectDetailView, domain.py), Kundenportal-Absturz behoben, InternDashboard mit Bereichs-Kacheln |
| 1 Fundament | **fertig, prod** | Schema `projekt` (Migration 001), `backend/app/api/projekt/` (Ordner-Scan = Phase, Nummernkreis, Template, `_akte/akte.yaml`), Portfolio mit echten Kennzahlen, Akte (Übersicht, Beteiligte, Termine, Dokumente), Abgleich-Karte, `NETZLAUFWERK.md` |
| 2 Honorar & Fortschritt | **fertig, prod** | Migration 002 (abschnitte, honorar_aenderungen, leistungsbilder § 35/39/43/47), Tab „Leistung", `FortschrittLeiste`, Vorlagen-Dialog mit Teilbeauftragung, Nachträge, Honorarhistorie |
| 7a Dossier + MCP | **fertig, prod** | `_akte/DOSSIER.md`, Tab „Dossier", Migration 003 (vorschlaege), Vorschläge-Karte; **Projekt-Werkzeuge im Literatur-Connector** (`projekte_liste`, `projekt_dossier`, `projekt_termine`, `projekt_leistung`, `projekt_dokumente`, `projekt_dokument_lesen`, `projekt_suche`, `projekt_aufgaben`, `projekt_zeiten`, `projekt_vorschlag_*`) — 21 Werkzeuge gesamt |
| 4 Geld | **fertig inkl. 4b, prod** | Pedant-Migration 009 (projekt_id, abschnitt_id) + **010** (rechnungstyp 326/380, Vorrechnungen BG-3, Vorab BT-113, zahlbar BT-115), Planzeilen-Sync, **Abschlag = Typ 326**, **Schlussrechnung = 380 mit Vorrechnungen — bucht nur den Rest**, KoSIT-geprüft; Rechnung ↔ Projekt, Belege per Kostenmerkmal, Balken mit drei Schichten (Abschläge zählen nach der Schlussrechnung nicht doppelt), Portfolio „Unabgerechnet", Pedant-Deep-Link |
| 3 Zeit & Aufgaben | **fertig, prod** | Migration 004 (aufgaben, zeitbuchungen, timer), Tabs „Zeiten" (Timer, Buchen, Auswertung, Stundennachweis xlsx/csv, Rechnung aus Stunden HUR) und „Aufgaben"; Stunden-Fortschritt gegen Budget |
| 5 Dokumente & Office | **fertig (O1), vorbereitet (O2)** | Volltextindex FTS5 je Projekt (pdf/docx/xlsx/Text/Mails) + Suche, Office-URI-Links (`PROJEKTE_WEBDAV_URL`), Vorlagen (Anschreiben, Aktennotiz, Stundennachweis, Honorarermittlung), Vorschau docx/xlsx/pdf/Bild; **WOPI-Host** gebaut und getestet — ONLYOFFICE-Container wartet auf RAM/DNS-Entscheidung (`backend/deploy/onlyoffice/README.md`) |
| 6 CDE | **fertig (Stufe C), prod** | Register `<Projekt>/CDE/manifest.yaml` (Upload, Revision aus Dateiname, ISO-19650-Status), Tab „Modelle", Viewer-Deep-Link `/cde?projekt=<id>&datei=…` (eigener Tab) mit Stammdaten-Übernahme; **RemoteBackend** der `RepoFacade`: Ansichten, Issues, Stile, KG-Zuweisungen, Kennwerte und Dokumentregister des Viewers liegen als JSON in `<Projekt>/CDE/_repo/`, Modell-Blobs sind die Dateien des Registers (neu geladene Modelle werden automatisch als WIP registriert) |
| 7b Assistent | offen | wartet auf API-Key |
| 2b Honorartafel-Rechner | offen | optional; Tafeln § 35/§ 44/§ 48 müssten aus dem Gesetzestext übernommen werden |
| 8 Kommunikation + Portal | **fertig, prod** | Tab „Kommunikation" (Mails je Projekt); **Kundenportal**: Migration 005 (`portal_freigaben`), Freigaben-Karte in der Übersicht (CLIENT-Nutzer der App), `/FastAPI/portal/projekte` liefert nur Phase, Leistungsstand, Abschnitte in Prozent/Anteilen und Termine — nie Beträge; `/client` zeigt die freigegebenen Projekte |
| Zugaben | **fertig, prod** | Timer-Leiste auf Portfolio und in jeder Akte; Wochen-Karte (Stunden je Projekt, blätterbar); beim Verschieben nach 03_Abgeschlossen entstehen automatisch Gewährleistung (5 J.) und Aufbewahrung (10 J.) als Fristen |

Tests: 155 pytest (Projekt + Pedant), 384 vitest (Projekt, Pedant, CDE). Konfiguration in `backend/.env`:
`PROJEKTE_WEBDAV_URL` (Office-Links), optional `ONLYOFFICE_URL` + `PUBLIC_BASE_URL` (O2), `PROJEKTE_ROOT` (Default StorageBox).
