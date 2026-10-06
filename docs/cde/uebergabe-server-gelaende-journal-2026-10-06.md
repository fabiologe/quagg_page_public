# Übergabe an die Sitzung mit Serverzugang — Gelände-Auftrag und gepacktes Journal

**Stand 2026-10-06, Branch `cde-bimfy`.** Gebaut und im Client getestet; die Server-Teile
liegen in `backend/app/api/**` und wirken erst nach `pm2 restart quagg-api` (Fabios OK liegt vor:
„jop baue … der andere Agent kann ausführen“). In der Bau-Sitzung fehlten die Test-DB und
`app.api.flood2D.env_util`, die Server-Tests sind dort **nicht gelaufen** — bitte hier.

## Was sich am Server ändert

| Datei | Änderung |
|---|---|
| `core/cde.py` | `MAX_JOURNAL_BYTES = 32 MB` für `…aenderungen` (andere Schlüssel bleiben 4 MB); `nutzlast_lesen` entpackt `Content-Encoding: gzip` mit Deckel (Zip-Bombe); `GELAENDE_PRAEFIX`, `ERZEUGT_MUSTER` mit `Gelaende`, `GELAENDE_ENDUNGEN` |
| `core/verbund_lauf.py` | `PRAEFIX["gelaende"]`, `gelaende_starten` (Rohdatei aus dem Register, Modus `gelaende`, CRS Pflicht) |
| `router.py` | `PUT /cde/repo/{key}` liest über `nutzlast_lesen` (gzip oder roh); neu `POST /{id}/cde/{sha256}/gelaende` `{crs, toleranz?, name?}` |
| `app/ifc/cli.py`, `app/ifc/gelaende.py` | Modus `gelaende` im Unterprozess (wirkt sofort, schon getestet: `test_gelaende.py`, 8 grün) |

Auf der Platte bleibt das Journal **lesbares JSON** — `_bezuege`, `journale_mit` und der
Journal-Wächter lesen es wie vorher.

## Reihenfolge

1. Merge `cde-bimfy` (Fabio).
2. Server-Tests im Produktions-venv (nichts installieren):
   ```bash
   cd backend && venv/bin/python -m pytest app/api/projekt/tests/test_cde.py -q -k "gzip or viewer_repo"
   cd backend && venv/bin/python -m pytest app/api/projekt/tests/test_verbund_lauf.py -q -k gelaende
   cd backend && venv/bin/python -m pytest app/api/projekt/tests -q
   ```
   Neu: `test_journal_gzip_und_groessere_grenze`, `test_gelaende_ueber_die_echte_schnittstelle`
   (braucht das IFC-venv), `test_gelaende_sagt_nein_ohne_bezugssystem_und_bei_falscher_datei`.
3. `pm2 restart quagg-api`.
4. Gegenprobe im Testprojekt `42069_BlazeIT` (nie `1337_Genau`):
   - BIMFY: eine `.asc` oder ein XYZ-Raster laden → „Gelände erkannt“, Bezugssystem prüfen,
     „Als Gelände anlegen“ → `Gelaende_<Name>_R01.ifc` im Register, laden, Längsschnitt zeigt es.
   - Journal: ein großes BIMFY-Netz anlegen → im Netzwerk-Tab `PUT …/cde/repo/global:aenderungen`
     mit `Content-Encoding: gzip`, Antwort 200; `CDE/_repo/global:aenderungen.json` ist JSON.

## Verhalten vor dem Neustart (Client schon neu, Server alt)

- Gepackt abgelehnt → der Client schickt **einmal roh nach** und packt in diesem Tab nicht mehr
  (`RemoteBackend._putGepackt`). Nichts geht verloren; die alte 4-MB-Grenze gilt dann weiter.
- „Als Gelände anlegen“ → Meldung „Der Server kennt den Gelände-Auftrag noch nicht — er braucht
  einen Neustart“ (404/405).
- Journal-Stufe 7: ältere Browser-Tabs lesen ein Journal ab jetzt nur (`mindestClient: 7`), bis
  man neu lädt — derselbe Mechanismus wie bei Stufe 5 und 6.
