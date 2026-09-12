"""Der Pruefbericht als VERTRAG (Fahrplan IFC-Konsistenz, Stufe 6).

Der Client zeigt den Bericht (`client/src/features/cde/components/PruefberichtPanel.vue`,
`services/Pruefbericht.js`). Damit er keinen Bericht zeigt, den es nicht gibt,
liegt ein ECHTER daneben: `tests/daten/bericht_pruefe.json`, geschrieben vom
Unterprozess selbst (`python -m app.ifc.cli <laufordner>`, Modus pruefe) — dem
Weg, den der Server geht. Dieser Test haelt die Fixture gegen einen frischen
Lauf: gleiche Befunde, gleiche Felder, gleiche Sperr-Zahl. Die Gegenseite,
`client/src/features/cde/test/pruefberichtPanel.test.js`, haelt das Panel gegen
dieselbe Datei.

Als Unterprozess, nicht im Testprozess: `cli.lauf` setzt als erste Handlung einen
Speicherdeckel auf den EIGENEN Prozess — im pytest-Prozess erbte ihn jeder
folgende Test.

Fixture neu schreiben (wenn sich die Form des Berichts aendert):
    PYTHONPATH=. app/ifc/.venv-ifc/bin/python app/ifc/tests/test_bericht.py
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("ifcopenshell", reason="ifcopenshell fehlt — mit dem IFC-venv laufen lassen")

from app.ifc import pruefe as P  # noqa: E402

BACKEND = Path(__file__).resolve().parents[3]
DATEN = Path(__file__).parent / "daten"
FIXTURE = DATEN / "bericht_pruefe.json"
MODELL = DATEN / "ids_vergleich.ifc"
STARTER = Path(__file__).parents[1] / "daten" / "quagg-starter.ids"


def pruefe_im_laufordner(ordner: Path) -> dict:
    """Ein Dokument durch das Tor — ueber den Unterprozess, wie der Server ihn startet."""
    ordner.mkdir(parents=True, exist_ok=True)
    datei = ordner / "Vergleich.ifc"
    shutil.copyfile(MODELL, datei)
    shutil.copyfile(STARTER, ordner / "ids-01-quagg-starter.ids")
    (ordner / "auftrag.json").write_text(json.dumps({
        "modus": "pruefe", "datei": str(datei), "sha256": "0" * 64, "dokument": datei.name,
        "ids": ["ids-01-quagg-starter.ids"], "bearbeiter": "pytest"}), encoding="utf-8")
    (ordner / "status.json").write_text(json.dumps({"zustand": "wartet"}), encoding="utf-8")
    umgebung = {**os.environ, "PYTHONPATH": str(BACKEND)}
    r = subprocess.run([sys.executable, "-m", "app.ifc.cli", str(ordner)], cwd=BACKEND, env=umgebung,
                       capture_output=True, text=True, timeout=600)
    status = json.loads((ordner / "status.json").read_text(encoding="utf-8"))
    assert status.get("zustand") == "geprueft", (status, r.stderr[-2000:])
    return json.loads((ordner / "bericht.json").read_text(encoding="utf-8"))


def form(bericht: dict) -> dict:
    """Was Client und Register vom Bericht erwarten — ohne Messwerte, die jeder Lauf anders hat."""
    return {"oben": sorted(bericht), "verstoesse": bericht["verstoesse"],
            "befunde": [(b["id"], b["stufe"], b["schwere"], b["ok"], b["zahl"], sorted(b))
                        for b in bericht["befunde"]]}


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def frisch(tmp_path_factory) -> dict:
    return pruefe_im_laufordner(tmp_path_factory.mktemp("lauf") / "p-0-000000")


def test_die_fixture_ist_ein_frischer_lauf(frisch):
    assert form(frisch) == form(_fixture()), \
        "Der Bericht hat seine Form geaendert — Fixture neu schreiben (Kopf dieser Datei), Panel nachziehen"


def test_jeder_befund_hat_die_felder_von_befund():
    """Die Feldmenge jedes Befunds == die von `pruefe._befund` (`teile` nur, wo gesetzt)."""
    grund = set(P._befund("X", "t", True))
    for b in _fixture()["befunde"]:
        assert set(b) - {"teile"} == grund, b["id"]


def test_alle_stufen_schweren_und_urteile_stehen_drin():
    """Das Panel wird an allem geprueft, was es zeigen kann — sonst waere seine Probe billig."""
    befunde = _fixture()["befunde"]
    assert {b["stufe"] for b in befunde} == {"schema", "verbund", "ids", "gherkin", "motor"}
    assert {b["schwere"] for b in befunde} == set(P.SCHWEREN)
    assert {b["ok"] for b in befunde} == {True, False, None}
    assert any(b.get("teile") for b in befunde) and any(b["beispiele"] for b in befunde)


def test_die_sperr_zahl_ist_die_von_offen():
    bericht = _fixture()
    assert sum(P.offen(b) for b in bericht["befunde"]) == bericht["verstoesse"]


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as t:
        neu = pruefe_im_laufordner(Path(t) / "p-0-000000")
    FIXTURE.write_text(json.dumps(neu, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(FIXTURE, len(neu["befunde"]), "Befunde,", neu["verstoesse"], "sperrend")
