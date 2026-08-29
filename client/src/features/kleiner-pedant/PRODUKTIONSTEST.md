# Produktionstest kleiner Pedant — Prüf- und To-do-Liste

Stand 2026-08-24. Phasen 1–6 gebaut, getestet (112 pytest + 52 vitest) und deployt;
diese Liste ist der Fahrplan für den Test am ECHTEN System. Reihenfolge einhalten —
Block A vor allem anderen. Einstieg: https://quagg-engineering.org → Login (INTERNAL)
→ Interner Bereich → **Buchhaltung**.

**Wichtig vorab — zwei Dinge, die man wissen muss:**
1. Im Journal stehen bereits die Buchungen Nr. 1 und Nr. 2: das ist der dokumentierte
   E2E-Teststand von Phase 2 (eine Testbuchung plus ihr Storno per Gegenbuchung).
   Kein echter Geschäftsvorfall, bleibt als Spur stehen — genau so soll das System arbeiten.
2. Eine GESTELLTE Rechnung ist endgültig (Nummer verbraucht, unveränderlich). Deshalb:
   alle Rechnungs-Tests laufen über die **Vorprüfung** (verbraucht KEINE Nummer);
   der Stellen-Knopf wird erst bei der **ersten ECHTEN Rechnung** gedrückt — die ist
   der eigentliche Prod-E2E.

---

## A. Vorbereitung (einmalig, VOR dem Testen)

### A1. admin-Passwort ändern — PFLICHT vor echten Finanzdaten
Der Login ist noch admin/secret aus der Erstinstallation. Auf dem Server:
```bash
cd /home/fabio/quagg_page/backend && venv/bin/python -c "
from app.core.security import get_password_hash
import sqlite3
neu = 'HIER-DEIN-NEUES-PASSWORT'
db = sqlite3.connect('quagg.db')
db.execute('UPDATE user SET hashed_password=? WHERE username=?', (get_password_hash(neu), 'admin'))
db.commit(); print('geaendert')"
```
Kein pm2-Restart nötig. Danach: Login mit neuem Passwort prüfen, alter schlägt fehl.

### A2. Firmendaten füllen (Rechnungen-Tab → Karte „Eigene Firmendaten")
Ohne sie geht keine XRechnung. Pflicht (BR-DE-Regeln): Name, Straße, PLZ, Ort,
**USt-ID ODER Steuernummer**, IBAN, **Ansprechpartner + Telefon + E-Mail** (deutsche
Zusatzpflicht — über die E-Mail melden Portale Ablehnungen zurück!). Optional: BIC,
Bank, Rechtsform-Zusatz. DATEV-Berater-/Mandantennummer: beim Steuerberater erfragen;
leer = Platzhalter 1001/1 (der Steuerberater korrigiert beim Import).
✅ Erwartung: Pille springt von „unvollständig" auf „vollständig".

### A3. Ersten echten Auftraggeber anlegen (Rechnungen-Tab → Karte „Auftraggeber")
Mit der ECHTEN Leitweg-ID aus der Beauftragung/Ausschreibung. Die Prüfziffer wird
live geprüft — Probe: eine Ziffer ändern → Fehlermeldung; korrigieren → speicherbar.
Portal wählen (ZRE RLP gilt auch fürs Saarland).

### A4. Backup-Automatik prüfen
```bash
systemctl status pedant-backup.timer --no-pager | head -5
ls -lh /mnt/storagebox/pedant-backups/ | tail -3
```
✅ Timer aktiv; ab morgen früh liegt täglich ein frischer `pedant_prod_*.dump`.

### A5. OCR scharfstellen — NACH bestandenem Grundtest (Blöcke B–G), als letzter Schritt
1. In `backend/.env`: `ANTHROPIC_API_KEY=sk-ant-…` und `PEDANT_OCR=1` eintragen.
2. `venv/bin/pip install anthropic` und Eintrag in requirements.txt.
3. **Claude den Erkennungs-Aufrufpfad finalisieren lassen** — der API-Aufruf in
   `core/erkennung.py::AnthropicErkenner.erkenne` ist bewusst nur skizziert und
   wird erst MIT Key ausgebaut und getestet (Absprache vom 23.08.).
4. Test: 2–3 Belege hochladen, `venv/bin/python -m app.api.pedant.cli beleg-erkennen --ziel prod --limit 3`
   → Felder vorausgefüllt (Status „erkannt"), unsichere Werte leer + markiert.
   Die menschliche Prüfung + Freigabe bleibt IMMER Pflicht — OCR füllt nur vor.

---

## B. Journal & Fundament (Tabs „Journal" + „Status")

- [ ] B1 Status-Tab: DB erreichbar (prod), **KoSIT-Validator: bereit**, Kette intakt (2 Zeilen).
- [ ] B2 Manuelle Testbuchung: z. B. 6815 Bürobedarf an 1800 Bank, 1,00 €, Text „Prod-Test".
      ✅ Erscheint sofort im Journal mit Nr. 3, Status-Tab zählt hoch.
- [ ] B3 Kette prüfen (Status-Tab → „Jetzt prüfen") → „Kette intakt, 3 Zeilen".
- [ ] B4 Negativproben im Formular: Soll = Haben → Ablehnung; Betrag 0 → Ablehnung;
      leerer Text → Ablehnung. Nichts davon landet im Journal.
- [ ] B5 Testbuchung aus B2 stornieren (Storno-Symbol, Grund „Prod-Test") →
      Gegenbuchung Nr. 4 mit getauschten Konten, Kette weiter intakt.
- [ ] B6 Konsole (optional, beweist die DB-Garantie):
      `psql`-Probe schlägt fehl: UPDATE/DELETE auf buchungssaetze als pedant_app → „permission denied".

## C. Belegerfassung (Tab „Belege")

- [ ] C1 Beleg hochladen: echtes PDF oder Foto eines Kassenbons (Drag&Drop oder Datei wählen).
      ✅ Belegnummer B-2026-…, Status „erfasst".
- [ ] C2 **Vom Handy**: quagg-engineering.org am Smartphone → „Foto aufnehmen" öffnet die Kamera.
- [ ] C3 Duplikat: dieselbe Datei nochmal hochladen → Meldung „bereits erfasst als B-…".
- [ ] C4 Falschdatei: eine .txt in .pdf umbenennen und hochladen → Ablehnung (Magic-Bytes-Prüfung).
- [ ] C5 Felder erfassen, dabei Brutto absichtlich 2 Cent daneben → Pille „unstimmig"
      mit erwartetem Betrag; korrigieren → Status „geprüft". (±1 Cent ist ok — Kassenbon-Rundung.)
- [ ] C6 GWG-Probe: einen Beleg mit 300 € netto erfassen → Vorschlagskarte zeigt
      Konto 6260 + Anlageverzeichnis-Hinweis.
- [ ] C7 Freigeben (Konto wählen, Geldkonto 1800) → Buchung im Journal (BRUTTO, bei
      19 % mit BU-Schlüssel 9), Beleg „gebucht", Felder fest.
- [ ] C8 Verwerfen-Probe mit einem Wegwerf-Beleg (Grund Pflicht; endgültig, Datei bleibt).
- [ ] C9 Ablage-Kontrolle auf dem Server (optional):
      `ls /mnt/storagebox/3_Buchhaltung/belege/2026/` — Datei liegt content-adressiert da.

## D. Rechnung & XRechnung (Tab „Rechnungen") — der kritische Block

- [ ] D1 Entwurf anlegen („Neue Rechnung") → Auftraggeber gewählt, Leitweg-ID automatisch übernommen.
- [ ] D2 Zwei Positionen: einmal Stunden (z. B. 12,5 h × 95 €), einmal pauschal.
      ✅ Netto/USt/Brutto rechnen live und stimmen (positionsweise gerundet).
- [ ] D3 „Stellen…" öffnen — NUR die Vorprüfung ansehen, NICHT stellen:
      ✅ Pflichtfelder grün UND „KoSIT-Validator: valide" (das ist der echte
      Validator mit den Portal-Prüfregeln; verbraucht keine Nummer). Dialog abbrechen.
- [ ] D4 Rot-Probe: in den Firmendaten kurz die IBAN leeren → Vorprüfung meldet
      „IBAN (BT-84)"; IBAN wieder eintragen → grün.
- [ ] D5 Verwerfen-Probe: den Testentwurf verwerfen (Grund) → keine Nummer verbraucht.
- [ ] D6 **Erste ECHTE Rechnung** (wenn eine ansteht): Entwurf → Vorprüfung grün →
      **Stellen** → RE-2026-0001, Journal-Buchung 1200 an 4400 (brutto), Kette intakt.
- [ ] D7 XML-Download + Prüfbericht öffnen (beide Knöpfe in der Aktionsleiste).
- [ ] D8 XML im Portal hochladen (RLP/Saarland: e-rechnung.service.rlp.de;
      BW: ZRE Baden-Württemberg) → im Tool „Versand vermerken".
- [ ] D9 Nach Zahlungseingang NICHT manuell „bezahlt" klicken — das erledigt Block F sauberer.

## E. Geld-Sichten (Tab „Geld")

- [ ] E1 Kacheln plausibel: „Gestellt, offen" zeigt die Rechnung aus D6; Bezahlt/Kommend passen.
- [ ] E2 Erwartetes Geld: echtes Vorhaben eintragen (z. B. beauftragte Vergabe,
      Status „beauftragt", erwarteter Monat) → Kommend-Kachel + Chart-Monat springen an.
- [ ] E3 Chart: Legende, Hover-Tooltip, Umschalter „Tabelle" (Werte identisch zum Chart).

## F. Bankabgleich (Tab „Bank")

- [ ] F1 Echten Kontoauszug exportieren (Bank-CSV oder CAMT.053) und importieren
      → „X neu, 0 bereits bekannt".
- [ ] F2 Dieselbe Datei nochmal importieren → „0 neu, X bereits bekannt" (Dedup).
- [ ] F3 Eine Bewegung öffnen: Vorschläge mit Konfidenz (sicher/betrag/referenz) plausibel?
- [ ] F4 Zahlungseingang der Rechnung aus D6 zuordnen → Journal-Buchung 1800 an 1200,
      Rechnung springt auf „bezahlt" (bei Betrag ±1 Cent), Geld-Kacheln ziehen nach.
- [ ] F5 Einen Ausgang einem gebuchten Beleg zuordnen → NUR abgehakt, KEINE neue
      Buchung (Journal-Zähler unverändert — der Aufwand steht seit der Freigabe drin).
- [ ] F6 Lösen-Probe: eine Test-Zuordnung wieder lösen → Storno-Gegenbuchung entsteht,
      Bewegung zurück auf „offen", Kette intakt.
- [ ] F7 Privatposten ignorieren (Grund) — und einmal Auto-Abgleich drücken:
      ordnet nur eindeutige Sicher-Treffer zu.

## G. DATEV-Export (Tab „Status" → Karte „Steuerberater-Export")

- [ ] G1 Zeitraum „letzter Monat" → Prüfliste: Befunde plausibel (offene Belege/Bank
      werden genannt; „sauber" erst, wenn alles verarbeitet ist).
- [ ] G2 EXTF-Buchungsstapel laden → Datei `EXTF_Buchungsstapel_*.csv`; in einem
      Editor: 1. Zeile beginnt mit `"EXTF";700;21;"Buchungsstapel";13;`, Umlaute korrekt (CP1252).
- [ ] G3 Belegbilder-ZIP laden → je Beleg `B-2026-XXXX_<name>`, referenziert über Belegfeld 1.
- [ ] G4 **Windows-Schritt:** DATEV-Format-Prüfprogramm (developer.datev.de → File-Format
      → Tools, Registrierung nötig) → EXTF-Datei laden → erwarte fehlerfrei.
      Alternative: dem Steuerberater als Testimport geben. ⚠️ Einziger Prüfschritt,
      der nicht auf dem Server möglich ist (Windows-only, keine CLI).
- [ ] G5 Beim Steuerberater klären: echte Berater-/Mandantennummer, SKR04 bestätigt,
      gewünschter Rhythmus (Empfehlung: monatlich).

## H. Betrieb & Sicherheit (Server, einmal durchgehen)

- [ ] H1 `pm2 status` → quagg-api online; `df -h /` → Platte unter 80 %.
- [ ] H2 Morgen früh: `ls -lh /mnt/storagebox/pedant-backups/` → Dump von heute Nacht.
- [ ] H3 `venv/bin/python -m app.api.pedant.cli kette-pruefen --ziel prod` → ok.
- [ ] H4 Restore-Probe (Vertrauen ins Backup, ~2 Minuten):
      ```bash
      runuser -u postgres -- createdb pedant_probe
      runuser -u postgres -- pg_restore -d pedant_probe --no-owner < /mnt/storagebox/pedant-backups/pedant_prod_JJJJ-MM-TT.dump
      runuser -u postgres -- psql -tAc "SELECT count(*) FROM buchungssaetze" pedant_probe
      runuser -u postgres -- dropdb pedant_probe
      ```
- [ ] H5 Mobil-Rundgang: alle sechs Tabs am Handy — lesbar, bedienbar, kein Querscrollen.

## I. Formales / GoBD (To-dos, kein Klicktest)

- [ ] I1 **Verfahrensdokumentation beginnen** (Fahrplan Kap. 9 — existiert noch nicht
      als eigenes Dokument!). Basis: FAHRPLAN.md Kap. 16 beschreibt die technische
      Umsetzung; daraus ein lebendes Dokument machen (wer erfasst wie, welche
      Garantien, Backup/Restore, Aufbewahrung). Bei Betriebsprüfung der erste Ansatzpunkt.
- [ ] I2 Jahresabschluss-Prozess vormerken (Kap. 10): zum Jahresende versiegelter
      DB-Schnappschuss in die Langzeitablage (8/10 Jahre) — steht als Ausbau an,
      rechtzeitig vor Ende des ersten Geschäftsjahrs.
- [ ] I3 Bekannte, bewusste Grenzen (kein Fehler, aber wissen): Rechnungssteuersatz
      fix 19 % · verworfene Belege/Entwürfe sind endgültig · E-Mail-Versand/-Eingang
      außen vor (kommt nach diesem Projekt) · Timeline-Vollausbau (Phase 7) folgt,
      sobald echte Daten da sind.

---

**Abbruchkriterien:** Bricht die Hash-Kette, verschwindet eine Buchung, oder lehnt
das Portal eine valide geprüfte XRechnung ab → Test stoppen, Zustand NICHT
„reparieren", Claude mit der Fehlermeldung draufsetzen (die Spuren im Auditlog
sind dann das wichtigste Beweismittel).
