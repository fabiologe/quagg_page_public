"""
Headless-CLI der flood3D-Pipeline (Spez. Kap. 3: jeder Schritt ohne Frontend
ausführbar). Aufruf aus dem backend-Verzeichnis:

    venv/bin/python -m app.api.flood3D.cli all \
        --case <openfoam-fall> --spec case.yaml --run-id rueb-nord-v3_r001 \
        --out data/flood3D/runs

Einzelschritte: extract | evaluate | render | inventory | schema

PreProzessing (Stufe 3): casespec -> rechenfähiger OpenFOAM-Fall:

    venv/bin/python -m app.api.flood3D.cli build \
        --spec case.yaml --out <fallverzeichnis> [--base-dir <datenordner>]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core.casespec import CaseSpec
from .core.evaluate import evaluate_run
from .core.extract import extract_case
from .core.normalize import list_series, read_normalized, write_normalized
from .core.render import render_run
from .core.store import read_manifest, run_paths


def _load(spec_path: str) -> CaseSpec:
    try:
        return CaseSpec.from_yaml(spec_path)
    except Exception as e:
        sys.exit(f"casespec ungültig: {e}")


def cmd_extract(a) -> None:
    df, missing = extract_case(a.case, _load(a.spec), a.run_id)
    if df.empty:
        sys.exit(f"Keine Ergebnisquellen in {a.case} gefunden (fehlend: {missing})")
    write_normalized(df, a.out)
    print(f"{len(df)} Zeilen -> {a.out}")
    for m in missing:
        print(f"  Hinweis: Quelle fehlt: {m}")


def cmd_evaluate(a) -> None:
    spec = _load(a.spec)
    df = read_normalized(a.normalized)
    manifest = json.loads(Path(a.manifest).read_text()) if a.manifest else None
    result = evaluate_run(df, spec, a.run_id, manifest)
    Path(a.out).write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Ergebnis -> {a.out}")
    for t in result["targets"]:
        print(f"  {t['id']}: {t.get('result')} "
              f"(Wert {t.get('value')}, Auslastung {t.get('utilisation')})")


def cmd_render(a) -> None:
    spec = _load(a.spec)
    df = read_normalized(a.normalized)
    result = json.loads(Path(a.result).read_text())
    result = render_run(result, df, spec, a.out)
    print(f"{len(result['figures'])} Abbildungen -> {a.out}")


def cmd_all(a) -> None:
    spec = _load(a.spec)
    paths = run_paths(a.out, a.run_id)
    paths.root.mkdir(parents=True, exist_ok=True)

    df, missing = extract_case(a.case, spec, a.run_id)
    if df.empty:
        sys.exit(f"Keine Ergebnisquellen in {a.case} gefunden (fehlend: {missing})")
    write_normalized(df, paths.normalized)

    result = evaluate_run(df, spec, a.run_id, read_manifest(paths))
    result = render_run(result, df, spec, paths.root)

    print(f"Lauf {a.run_id}: {len(df)} Zeilen, "
          f"{len(result['figures'])} Abbildungen -> {paths.root}")
    for m in missing:
        print(f"  Hinweis: Quelle fehlt: {m}")
    for t in result["targets"]:
        print(f"  {t['id']}: {t.get('result')}")


def cmd_build(a) -> None:
    from .core.casebuilder import build_case
    info = build_case(_load(a.spec), a.out, a.base_dir)
    print(f"Fall {info['case_hash']} -> {info['case_dir']}")
    print(f"  Gelände: {'ja' if info['terrain'] else 'nein'}, "
          f"Bauwerke: {', '.join(info['solids']) or 'keine'}, "
          f"poröse Zonen: {', '.join(info['screens']) or 'keine'}")
    print(f"  Gebietsränder: {info['faces']}")
    for p in info["problems"]:
        print(f"  PROBLEM: {p}")
    if info["problems"]:
        sys.exit(1)


def cmd_inventory(a) -> None:
    print(list_series(read_normalized(a.normalized)).to_string(index=False))


def cmd_schema(a) -> None:
    print(json.dumps(CaseSpec.json_schema(), indent=2, ensure_ascii=False))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="flood3d", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    px = sub.add_parser("extract", help="OpenFOAM-Fall -> Zwischendatei")
    px.add_argument("--case", required=True)
    px.add_argument("--spec", required=True)
    px.add_argument("--run-id", required=True)
    px.add_argument("--out", required=True)
    px.set_defaults(fn=cmd_extract)

    pe = sub.add_parser("evaluate", help="Zwischendatei -> Ergebnis-JSON")
    pe.add_argument("--normalized", required=True)
    pe.add_argument("--spec", required=True)
    pe.add_argument("--run-id", required=True)
    pe.add_argument("--manifest")
    pe.add_argument("--out", required=True)
    pe.set_defaults(fn=cmd_evaluate)

    pr = sub.add_parser("render", help="Ergebnis + Zwischendatei -> Abbildungen")
    pr.add_argument("--normalized", required=True)
    pr.add_argument("--spec", required=True)
    pr.add_argument("--result", required=True)
    pr.add_argument("--out", required=True)
    pr.set_defaults(fn=cmd_render)

    pa = sub.add_parser("all", help="komplette Pipeline in die Laufablage")
    pa.add_argument("--case", required=True)
    pa.add_argument("--spec", required=True)
    pa.add_argument("--run-id", required=True)
    pa.add_argument("--out", required=True, help="Wurzel der Laufablage")
    pa.set_defaults(fn=cmd_all)

    pb = sub.add_parser("build", help="casespec -> rechenfähiger OpenFOAM-Fall")
    pb.add_argument("--spec", required=True)
    pb.add_argument("--out", required=True)
    pb.add_argument("--base-dir", default=".",
                    help="Wurzel für relative Datenpfade (DGM, CSV, STL)")
    pb.set_defaults(fn=cmd_build)

    pi = sub.add_parser("inventory", help="Zeitreihen-Inventar einer Zwischendatei")
    pi.add_argument("--normalized", required=True)
    pi.set_defaults(fn=cmd_inventory)

    ps = sub.add_parser("schema", help="JSON-Schema der casespec ausgeben")
    ps.set_defaults(fn=cmd_schema)

    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
