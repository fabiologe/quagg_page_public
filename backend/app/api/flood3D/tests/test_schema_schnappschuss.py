"""
Der Client hält ein Typregister (utils/typRegister.js) gegen das JSON-Schema
der casespec — über einen Schnappschuss in
client/src/features/flood-3D/test/fixtures/casespec.schema.json. Dieser
Test hält den Schnappschuss aktuell: ändert sich das Modell, schlägt er an,
und der Schnappschuss wird bewusst neu erzeugt (dann prüft vitest, ob das
Register den neuen Typ kennt). Dasselbe Muster wie `generiere_client
--pruefe` im IFC-Teil: das Wörterbuch des Clients wird nie von Hand gepflegt.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..core.casespec import CaseSpec

SCHNAPPSCHUSS = (Path(__file__).resolve().parents[5] / "client" / "src"
                 / "features" / "flood-3D" / "test" / "fixtures"
                 / "casespec.schema.json")


def test_schema_schnappschuss_ist_aktuell():
    assert SCHNAPPSCHUSS.is_file(), (
        f"Schnappschuss fehlt: {SCHNAPPSCHUSS} — erzeugen mit "
        "`python -m app.api.flood3D.cli schema > <Pfad>`")
    gespeichert = json.loads(SCHNAPPSCHUSS.read_text())
    aktuell = json.loads(json.dumps(CaseSpec.json_schema()))
    assert gespeichert == aktuell, (
        "Das Modell hat sich geändert. Schnappschuss neu erzeugen: "
        "`cd backend && venv/bin/python -m app.api.flood3D.cli schema > "
        "../client/src/features/flood-3D/test/fixtures/casespec.schema.json` "
        "— und dann `npx vitest run src/features/flood-3D/test/typRegister` "
        "laufen lassen, damit das Typregister den neuen Typ kennt.")
