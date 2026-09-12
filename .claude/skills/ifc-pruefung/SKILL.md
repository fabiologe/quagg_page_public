---
name: ifc-pruefung
description: Eine IFC-Datei durch das Prüftor der Quagg-CDE schicken und den Prüfbericht lesen (SPF-Syntax/Schema/Where-Rules, Verbundregeln, IDS, zweiter Motor), oder eine IFC-Klasse, Vererbung, Pset-/Qto-Vorlage nachschlagen. Nutzen, wenn eine .ifc geprüft, ein Befund gedeutet oder IFC-Wissen gebraucht wird.
---

# IFC prüfen und den Bericht lesen

## Nachschlagen statt raten

Die Schema-Wahrheit ist `backend/app/ifc/schema.py` mit dem Schnappschuss `backend/app/ifc/daten/schema_IFC4X3_ADD2.json` (gepinntes ifcopenshell 0.8.5). Fragen über den MCP-Server `ifc`:

- `ifc_entity`, `ifc_vererbung`, `ifc_attribute` — Klasse, Kette, Attribute; Schreibweise egal.
- `ifc_where_rules` — Regeln samt Quelltext; erklärt einen SPF-Befund.
- `ifc_pset` — welche Pset/Qto-Vorlagen gelten, oder eine Vorlage beim Namen.
- `ifc_altname` — IFC2X3/IFC4-Namen: umbenannt, gestrichen, abgekündigt.

Ohne MCP geht dasselbe in `backend/` mit `python3 -m app.ifc.schema --json IfcWall` (Vererbung, Attribute, Where-Rules, Vorlagen — ohne ifcopenshell).

## Eine Datei prüfen

```bash
cd backend
PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m app.ifc.pruefe <datei.ifc> --lieferung                  # Tabelle
PYTHONPATH=. app/ifc/.venv-ifc/bin/python -m app.ifc.pruefe <datei.ifc> --lieferung --json \
    --ids app/ifc/daten/quagg-starter.ids                                                            # mit IDS
```

`--lieferung` prüft wie eine einzelne Lieferung: Verbundregeln melden nur. Ohne den Schalter gilt das Urteil eines Verbunds. `--ohne-regeln` lässt die Where-Rules weg; das spart die Hälfte der Zeit, sieht aber weniger. Gemessen: 27–81 s mit Where-Rules, bis 490 MB. Das MCP-Werkzeug `ifc_pruefe_datei` fährt denselben Unterprozess.

## Den Bericht lesen

- Jeder Befund hat `id, titel, ok, sagt, zahl, stufe, schwere, beispiele`, dazu `teile` bei SPF und IDS.
- **Sperrend ist nur:** `ok` nicht `true` UND `schwere == "fehler"` (`pruefe.offen`). `ok: null` heißt ungeprüft, und ungeprüft gilt als nicht bestanden.
- Stufen: `schema` (SPF: Syntax, Schema, Where-Rules), `verbund` (V00–V08), `ids` (je Spezifikation `IDS:<datei>:<nr>`, Schwere Warnung), `gherkin` (Hinweis: nicht eingerichtet), `motor` (V09: web-ifc liest dieselbe Datei).
- `beispiele` sind höchstens 5 Instanzen bzw. GlobalIds; `zahl` ist die ganze Menge.
- IDS 1.0 trifft genau die Klasse, keine Untertypen. Eine Regel für IFCWALL zählt keinen IfcWallStandardCase.

## Der Probelauf über die echten Gruppenmodelle

`cd backend && app/ifc/.venv-ifc/bin/python -m app.ifc.probe` baut das Dreier-Tor (etwa 155 s) und muss 0 Verstöße zeigen.

## Verbote

- `backend/app/ifc/*` wirkt sofort in Produktion. Nie einen halben Stand liegen lassen; nach jeder Änderung die Syntax prüfen.
- Kein `pip` in `backend/venv`. Kein `pm2 restart` ohne Fabios OK. Nie `npm run build` zum Prüfen.
- Nie ins echte Projekt `1337_Genau` schreiben; das Testprojekt ist `42069_BlazeIT`.
- Das Client-Wörterbuch (`client/src/features/cde/data/*.js`) nie von Hand ändern: `python3 -m app.ifc.generiere_client`.
