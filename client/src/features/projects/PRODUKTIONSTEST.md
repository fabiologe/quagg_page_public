# Produktionstest Projekt-Cockpit — Prüfliste

Reihenfolge wie die Arbeit im Büro. Alles unter `/intern/projects`. Nichts davon ist unwiderruflich —
außer „Rechnung stellen" im Pedanten (nicht Teil dieses Tests).

## A Vorbereitung
- [ ] A1 `backend/.env`: `PROJEKTE_WEBDAV_URL=https://uXXXXXX.your-storagebox.de/1_Projekte` eintragen, `pm2 restart quagg-api`.
- [ ] A2 Netzlaufwerk nach `NETZLAUFWERK.md` einbinden (WebDAV), `P:\01_Laufend` sichtbar.
- [ ] A3 Portfolio öffnen: Kennzahlen zeigen 0 Projekte, Abgleich meldet `1337_Genau` und `42069_BlazeIT` als „Ordner ohne Akte".

## B Bestandsordner und neues Projekt
- [ ] B1 Abgleich → „Akte anlegen" für `1337_Genau` → Akte erscheint, Phase „Laufend", `_akte/akte.yaml` liegt im Ordner.
- [ ] B2 „Neues Projekt": Name, Kurzname, HOAI, LPH 1–3 anhaken, Phase Angebot → Ordner `00_Angebote/<Nr>_<Kurzname>` mit Template (00_Vertrag … CDE, 02_Planung/LPH1…3).
- [ ] B3 Phase im Akte-Kopf auf „Laufend" stellen → Ordner wandert nach `01_Laufend` (im Explorer prüfen).
- [ ] B4 Ordner im Explorer von Hand nach `02_Pausiert` schieben → Portfolio zeigt „Pausiert" (Ordnerlage = Wahrheit).
- [ ] B5 Phase „Abgeschlossen" → Termine zeigen automatisch Gewährleistung (+5 J.) und Aufbewahrung (+10 J.).

## C Leistung und Geld
- [ ] C1 Tab Leistung → „Aus Leistungsbild" § 43, 100.000 €, LPH 1–5 → 9 Abschnitte, Balken schraffiert 6–9.
- [ ] C2 Fortschritt LPH 1 auf 100 %, LPH 2 auf 50 % → Übersicht zeigt Leistung 12 %, Portfolio-Kachel ebenso.
- [ ] C3 Honorar eines Abschnitts ändern (Grund „Nachtrag 1") → Historie-Eintrag.
- [ ] C4 Stammdaten: Pedant-Auftraggeber wählen → Tab Geld → Planzeile im Pedanten sichtbar (Geld → erwartet).
- [ ] C5 „Abschlag aus Leistungsstand" → Entwurf im Pedanten (Link) → dort **nur Vorprüfung**, NICHT stellen.
- [ ] C6 Beleg zuordnen (Picker) → Fremdkosten in den Kennwerten; im Pedanten trägt der Beleg `#P<Nr>`.
- [ ] C7 Der Abschlag-Entwurf trägt im Pedanten „Abschlag" (Typ 326); Vorprüfung mit Validator grün.
- [ ] C8 Schlussrechnungs-Karte zeigt Gesamtleistung − gestellte Abschläge = zahlbarer Rest (erst sinnvoll, wenn ein Abschlag wirklich gestellt ist).

## D Zeit und Aufgaben
- [ ] D1 Timer starten, 2 Minuten warten, stoppen → Buchung mit 2 min.
- [ ] D2 Manuell „1:30" buchen mit Abschnitt → Auswertung je Abschnitt.
- [ ] D3 Stundennachweis xlsx herunterladen, in Excel öffnen (Summenzeile).
- [ ] D4 Aufgabe mit Frist gestern anlegen → Portfolio „Aufgaben überfällig" = 1, Kachel zeigt „überfällig".

## E Dokumente
- [ ] E1 Vorlage „Aktennotiz" → Datei in 03_Schriftverkehr, Vorschau zeigt Projektname und Firmendaten.
- [ ] E2 „In Word öffnen" → Word öffnet die Datei vom Netzlaufwerk (bei Zonenwarnung: Site als vertrauenswürdig eintragen).
- [ ] E3 „Index aktualisieren", dann Suche nach einem Wort aus der Aktennotiz → Treffer mit Markierung.
- [ ] E4 PDF ins Projekt legen (Explorer), Index aktualisieren, Suche findet Text aus dem PDF.

## F CDE
- [ ] F1 Tab Modelle → IFC hochladen → Rev. 1, Status WIP; zweite Datei `…_R02.ifc` → Rev. 2.
- [ ] F2 „Im Viewer laden" → `/cde?projekt=…&datei=…` öffnet das Modell, Plankopf „Aus Projekt" zeigt Nummer/Bezeichnung/Bauherr.
- [ ] F3 Status auf „Shared" → Viewer-Wasserzeichen ZUR PRÜFUNG (im PDF-Export).
- [ ] F4 Im Viewer eine Ansicht speichern und ein Issue setzen → im Projektordner liegen `CDE/_repo/global:saved-views.json` und `…annotations…json`; Viewer-Tab schließen, erneut öffnen → beides ist wieder da.
- [ ] F5 Im Viewer eine IFC per Datei-Dialog laden → sie erscheint im Tab „Modelle" als WIP.

## G KI
- [ ] G1 Tab Dossier → Text enthält Stammdaten, Abschnitte, Termine, Aufgaben, Zeiten, Mails, Dokumente, CDE.
- [ ] G2 claude.ai (Connector NormRAG): „Welche Projekte habe ich und wo steht #P<Nr>?" → `projekte_liste` + `projekt_dossier`.
- [ ] G3 In claude.ai: „Schlag einen Termin vor …" → Vorschlag erscheint in der Übersicht → Übernehmen → Meilenstein da.
- [ ] G4 `projekt_suche` in claude.ai mit einem Wort aus E3 → Treffer.

## I Kundenportal
- [ ] I1 Übersicht → Kundenportal → Nutzer „kunde" freigeben.
- [ ] I2 Als „kunde" anmelden → `/client` zeigt das Projekt mit Phase, Balken und Terminen — keine Euro-Beträge, keine Bindefristen.
- [ ] I3 Freigabe entziehen → Portal leer.

## H Betrieb
- [ ] H1 `pedant-backup.timer` läuft; Dump enthält Schema `projekt` (`pg_restore -l | grep projekt`).
- [ ] H2 ONLYOFFICE läuft unter `/onlyoffice/` (Container `quagg-onlyoffice`): im Dokumente-Tab eine docx → „Im Browser bearbeiten (neuer Tab)" → `/office?…` öffnet als eigener Vollbild-Tab (wie der PDF-Editor), Editor lädt, Änderung speichern → Datei im Projektordner ist geändert (WOPI-Roundtrip).
- [ ] H3 Bestandsordner `42069_BlazeIT` übernehmen oder nach 04_Abgelehnt verschieben.
