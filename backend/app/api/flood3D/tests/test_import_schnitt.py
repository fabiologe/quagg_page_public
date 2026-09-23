"""
Goldener Stand des Imports — Wächter für den Schnitt von `apply_import`
(Etappe E2a der Sanierung, docs/flood3d/AUDIT_CODE_QUALITAET_FLOOD3D.md W3-P1.2).

`apply_import` war eine 480-Zeilen-Funktion mit inneren Funktionen und
`nonlocal`; jede Import-Reparatur (I1, I2, I7, I10, I8) greift hinein. Vor
dem Zerlegen wird hier festgehalten, was der Import HEUTE aus den beiden
DXF-Fabriken macht — die gesamte Spec, jede abgeleitete Datei, der Bericht,
die gespeicherte Anwendung. Nach dem Schnitt muss alles bitgleich sein.

Der Stand liegt als lesbares JSON unter tests/golden/import_schnitt.json,
nicht als nackter Hash: bricht der Test, zeigt pytest das abweichende Feld.
Fehlt die Datei, schreibt der Test sie und schlägt einmal bewusst fehl —
so entsteht ein neuer goldener Stand nur sichtbar, nie nebenbei. Etappen,
die das Importverhalten ABSICHTLICH ändern (E2b ff.), löschen die Datei,
lassen den Test einmal laufen und nehmen den neuen Stand in den Commit.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from ..core.importer import _analysieren, _kandidaten_ablegen, apply_import
from . import dxf_fabrik as fx
from .synthetic_case import build_spec_stage3

GOLDEN = Path(__file__).parent / "golden" / "import_schnitt.json"
IMPORT_ID = "imp-golden"


def _importieren(d: Path, data: bytes, filename: str, rolle, **kw) -> dict:
    """
    Wie analyze_file + apply_import, aber mit fester Import-Kennung — die
    uuid aus analyze_file stünde sonst in jedem Dateinamen und import_ref.
    """
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.to_yaml(d / "case.yaml")
    cands, info = _analysieren(data, filename)
    imp_dir = d / "imports" / IMPORT_ID
    imp_dir.mkdir(parents=True)
    (imp_dir / filename).write_bytes(data)
    m = _kandidaten_ablegen(cands, imp_dir, IMPORT_ID, filename, 0.0, info)
    decisions = [{"candidate": c["id"], "role": rolle(c)}
                 for c in m["candidates"]]
    info = apply_import(spec, d, IMPORT_ID, decisions, **kw)
    derived = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()[:16]
               for p in sorted((d / "derived").glob("*")) if p.is_file()}
    manifest = {k: v for k, v in m.items() if k != "created"}
    return {
        "manifest": manifest,
        "spec": spec.model_dump(mode="json"),
        "derived": derived,
        "report": info["report"],
        "anwendung": json.loads((imp_dir / "anwendung.json").read_text()),
    }


def _becken(d: Path) -> dict:
    b = fx.nacktes_becken()
    m_roles = {"mesh": "gelaende", "kreis": "ablaufrohr"}
    # Offset aus der Lage des Netzes (wie der Vorschlag vor E2c)
    cands, _ = _analysieren(b["dxf"], "becken.dxf")
    lo = min((c["stats"]["bbox"][0] for c in cands if c.get("_mesh") is not None),
             key=lambda p: (p[0], p[1]))
    return _importieren(
        d, b["dxf"], "becken.dxf",
        lambda c: m_roles.get(c["kind"], "ignorieren"),
        offset=[round(float(lo[0]), 3), round(float(lo[1]), 3)],
        derive_domain=True)


def _linien(d: Path) -> dict:
    n = fx.neun_linien()

    def rolle(c):
        if c["kind"] == "polyline":
            return "querschnitt" if c["name"].startswith("AUSLAUF") else "bruchkante"
        if c["kind"] == "kreis":
            return "ablaufrohr"
        return "ignorieren"

    # HEUTIGER Stand, bewusst: ohne Offset (das Manifest schlägt für reine
    # Linien keinen vor — Audit I2), Gelände aus den Linien
    return _importieren(d, n["dxf"], "linien.dxf", rolle, offset=None,
                        derive_domain=True, terrain_from_lines=True)


FAELLE = {"becken": _becken, "linien": _linien}


def _stand(tmp_path: Path) -> dict:
    stand = {}
    for name, bauen in FAELLE.items():
        d = tmp_path / name
        d.mkdir(parents=True)
        stand[name] = bauen(d)
    return stand


def test_import_ist_deterministisch(tmp_path):
    """Zweimal dieselbe Fabrik -> derselbe Stand (sonst taugt kein Golden)."""
    a = _stand(tmp_path / "a")
    b = _stand(tmp_path / "b")
    assert a == b


@pytest.mark.parametrize("name", list(FAELLE))
def test_import_stand_ist_golden(tmp_path, name):
    stand = FAELLE[name](tmp_path)
    if not GOLDEN.is_file():
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(_stand(tmp_path / "golden"), indent=1,
                                     ensure_ascii=False, sort_keys=True))
        pytest.fail(f"goldener Stand fehlte und wurde geschrieben: {GOLDEN} "
                    "— Test erneut laufen lassen und die Datei committen")
    golden = json.loads(GOLDEN.read_text())[name]
    for teil in ("manifest", "spec", "derived", "report", "anwendung"):
        assert stand[teil] == golden[teil], f"{name}: {teil} weicht ab"
