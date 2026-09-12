# quagg_page — Arbeitsregeln für Claude Code

Monorepo: `client/` (Vue 3 + Vite, Features unter `src/features/<name>/`), `backend/` (FastAPI, pm2-Dienst `quagg-api`, Port 8001).

## Drei Python-Umgebungen — wer darf was

| venv | wofür | Regel |
|---|---|---|
| `backend/venv` | Produktion (quagg-api) | nie `pip install`; nur Tests damit laufen lassen |
| `backend/app/ifc/.venv-ifc` | ifcopenshell 0.8.5, ifctester, IFC-Tests | gehört Nutzer `claude` — pip nur als `claude` |
| `backend/app/mcp/.venv-mcp` | MCP-Server (fastmcp) | kein ifcopenshell — liest nur Schnappschüsse |

## Testen

```bash
cd client  && npx vitest run src/features/cde/test                                   # CDE-Client (6 übersprungen = StorageBox fehlt)
cd backend && PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m pytest app/ifc/tests -q   # IFC, ~10 min
cd backend && venv/bin/python -m pytest app/api/projekt/tests -q                     # Projekt/CDE-Server
```

- **Nie `npm run build` zum Prüfen** — quagg-engineering.org ist der dist-Ordner, der Build geht live.
- Den Dev-Server auf :3000 nie beenden (`pkill -f vite` trifft Fabios Server).
- „Erledigt" heißt nachgeprüft: eine Zahl vorher und nachher, nicht „Tests grün".
- Tests prüfen die ECHTE Schnittstelle; eine Regel und ihre Kur messen dieselbe Größe.

## Produktion

- `backend/app/ifc/*` wirkt SOFORT: quagg-api startet den Prüf-Unterprozess von der Platte. Nie einen halben Stand liegen lassen; nach jeder Änderung die Syntax prüfen.
- Server-Module (`backend/app/api/**`) wirken erst nach `pm2 restart quagg-api` — nur mit Fabios OK.
- Commit nur auf Zuruf. Nie ins echte Projekt `1337_Genau` schreiben; Testprojekt ist `42069_BlazeIT`.

## IFC — jedes Wissen an EINEM Ort

- **Schema-Wahrheit:** `backend/app/ifc/schema.py` + `daten/schema_IFC4X3_ADD2.json` (aus dem gepinnten ifcopenshell). Nachschlagen statt raten: MCP-Server `ifc` (`ifc_entity`, `ifc_vererbung`, `ifc_pset`, …).
- **Client-Wörterbuch nie von Hand:** `client/src/features/cde/data/{entity-schema,pset-templates,altnamen}.js` und `quagg-starter.ids` schreibt `python3 -m app.ifc.generiere_client` (in `backend/`); `--pruefe` vergleicht.
- **Ein Prüftor:** `backend/app/ifc/pruefe.py`, Stufen schema | verbund | ids | gherkin | motor. Sperren tut nur Schwere „fehler" (`pruefe.offen`, im Client `services/Pruefbericht.js`). `ok=None` = ungeprüft = nicht bestanden.
- **IDS 1.0 ist kanonisch** (`daten/quagg-starter.ids`); die Klassenfacette kennt keine Vererbung. Die Vorschau im Client (`IdsXml.js`, `IdsValidator.js`) wird gegen ifctester gehalten (`idsVergleich.test.js`).
- Vererbung im Client: `bauform/Typprofile.vererbungskette`, fachliche Wurzeln in `services/Kategorien.js` — keine neuen Typlisten mit exaktem String-Vergleich.
- Kein Feature importiert aus einem anderen Feature.

## Werkzeuge

- Skill `ifc-pruefung`: eine Datei prüfen, den Bericht lesen.
- Hook `.claude/hooks/ifc-wache.sh` nach Edit/Write unter `backend/app/ifc/` oder den erzeugten Daten (5 s bzw. 0,4 s).
- Stand und Messwerte: `backend/app/ifc/README.md`.
