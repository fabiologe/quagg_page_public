"""
Erzeugt zwei synthetische Demo-Läufe in der Laufablage, damit der PostViewer
vor der ersten echten Rechnung Daten zum Anzeigen hat. Variante r002 hat
höheren Einstau (verletzt den Grenzwert) und stärkeren Abschlag — damit sind
Laufvergleich und die Bewertung "nicht_erfuellt" im UI sichtbar.

Aufruf:  venv/bin/python -m app.api.flood3D.make_demo_runs
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from .cli import cmd_all
from .router import cases_root, runs_root
from .tests import synthetic_case as syn
from .tests.synthetic_fields import build_fields


class _Args:
    def __init__(self, case, spec, run_id, out):
        self.case, self.spec, self.run_id, self.out = case, spec, run_id, out


def main() -> None:
    variants = [("demo_rueb_v1", dict(level_amp=0.5, q_split=0.6)),
                ("demo_rueb_v2", dict(level_amp=0.75, q_split=0.8))]
    out_root = runs_root()
    for run_id, kw in variants:
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            case_dir = tmp / "case"
            syn.build_case(case_dir, **kw)
            spec_path = tmp / "case.yaml"
            syn.build_spec().to_yaml(spec_path)
            if (out_root / run_id).exists():
                shutil.rmtree(out_root / run_id)
            cmd_all(_Args(str(case_dir), str(spec_path), run_id, str(out_root)))
            build_fields(out_root / run_id, level_amp=kw["level_amp"])

    # Demo-Fall für den PreViewer (Stufe 4)
    case_dir = cases_root() / "demo-stufe3"
    case_dir.mkdir(parents=True, exist_ok=True)
    spec = syn.build_spec_stage3()
    spec.meta.title = "Demo: Becken mit Gerinne, Rechen und Durchlass"
    spec.to_yaml(case_dir / "case.yaml")


if __name__ == "__main__":
    main()
