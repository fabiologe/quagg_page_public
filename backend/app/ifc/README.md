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
| `BIM26_Gruppe5_BODEN_Erdarbeiten.ifc` | IFC4X3_ADD2 | METRE | — | — |
| `BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc` | IFC4X3_ADD2 | **MILLI·METRE** | — | — |
| `IFCOUT_Entwässerung Export .IFC` | IFC2X3 | METRE | 187 629 | 41 |

Keines der drei trägt `IfcMapConversion` oder `IfcProjectedCRS`. Die Koordinaten
*sind* die Weltkoordinaten, alle drei in UTM32. EPSG:25832 ist damit eine
begründete Annahme aus den Ostwerten — sie wird als solche mitgeschrieben, nicht
als Tatsache behauptet.

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
