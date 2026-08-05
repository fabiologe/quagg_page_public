"""
Abnahmetests Stufe 1 (Spez. Kap. 12/13): extract -> normalize -> evaluate
-> render am synthetischen damBreak-Fall. Alle Erwartungswerte sind
analytisch aus synthetic_case.py herleitbar, keine Bildvergleiche.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from ..cli import main as cli_main
from ..core.casespec import CaseSpec, Evaluation, Gauge, Meta, Section, Solver, TargetMaxLevel
from ..core.conventions import NORMALIZED_COLUMNS
from ..core.evaluate import evaluate_run
from ..core.extract import extract_case
from ..core.extract.datfile import merge_restart_rows, parse_scalar_table, parse_vector_table
from ..core.normalize import get_series, read_normalized, write_normalized
from . import synthetic_case as syn


@pytest.fixture(scope="module")
def case_dir(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("of_case")
    syn.build_case(d)
    return d


@pytest.fixture(scope="module")
def spec() -> CaseSpec:
    return syn.build_spec()


@pytest.fixture(scope="module")
def normalized(case_dir, spec):
    df, missing = extract_case(case_dir, spec, "r001")
    return df, missing


# --------------------------------------------------------------------------
# Low-Level-Parser
# --------------------------------------------------------------------------

def test_vector_table_foundation_format(tmp_path):
    f = tmp_path / "forces.dat"
    f.write_text("# Kopf\n0.5\t((10 2 0) (1 0 0)) ((5 0 0) (0.5 0 0))\n")
    rows = parse_vector_table(f)
    assert rows == [(0.5, [(10, 2, 0), (1, 0, 0), (5, 0, 0), (0.5, 0, 0)])]


def test_scalar_table_header_names(tmp_path):
    f = tmp_path / "surfaceFieldValue.dat"
    f.write_text("# Region : plane\n# Time sum(phi)\n0.1\t2.5\n0.2\t2.6\n")
    names, rows = parse_scalar_table(f)
    assert names == ["sum(phi)"]
    assert rows == [(0.1, 2.5), (0.2, 2.6)]


def test_restart_merge_spaeterer_start_gewinnt():
    chunks = [(0.0, [(0.0, "a"), (0.2, "a"), (0.4, "a"), (0.6, "a")]),
              (0.4, [(0.4, "b"), (0.6, "b"), (0.8, "b")])]
    merged = merge_restart_rows(chunks)
    assert merged == [(0.0, "a"), (0.2, "a"), (0.4, "b"), (0.6, "b"), (0.8, "b")]


# --------------------------------------------------------------------------
# extract + normalize
# --------------------------------------------------------------------------

def test_extract_vollstaendig(normalized):
    df, missing = normalized
    assert missing == []
    assert list(df.columns) == NORMALIZED_COLUMNS
    assert set(df["quantity"]) == {"force", "moment", "discharge", "level",
                                   "volume", "residual", "courant",
                                   "timestep", "continuity"}


def test_neustart_ersetzt_alte_zeilen(normalized):
    df, _ = normalized
    t, fy = get_series(df, "force", "wand_ost", "y")
    # y-Marker existiert nur in den Neustartzeilen: vor 0.4 Null, danach 5.0
    assert np.all(fy[t < syn.RESTART_T] == 0.0)
    assert np.all(fy[t >= syn.RESTART_T] == syn.MARKER_Y)
    # keine doppelten Zeitpunkte aus dem Überlappungsbereich
    assert len(t) == len(np.unique(t)) == len(syn.time_grid())


def test_kraft_druck_und_reibungsanteil(normalized):
    df, _ = normalized
    t, fp = get_series(df, "force", "wand_ost", "pressure")
    _, fv = get_series(df, "force", "wand_ost", "viscous")
    i = np.argmin(np.abs(t - 0.2))
    assert fp[i] == pytest.approx(200.0)   # |(1000*0.2, 0, 0)|
    assert np.all(fv == 10.0)


def test_pegel_und_kontinuitaet(normalized):
    df, _ = normalized
    t, lv = get_series(df, "level", "pegel_becken")
    assert lv.max() == pytest.approx(99.5)
    assert t[np.argmax(lv)] == pytest.approx(0.5)
    t_c, cont = get_series(df, "continuity", "solver")
    assert len(t_c) == len(syn.time_grid()) - 1
    assert cont[-1] == pytest.approx(1e-5 * syn.T_END, rel=1e-4)


def test_parquet_roundtrip(normalized, tmp_path):
    df, _ = normalized
    p = tmp_path / "normalized.parquet"
    write_normalized(df, p)
    df2 = read_normalized(p)
    assert len(df2) == len(df)
    assert list(df2.columns) == NORMALIZED_COLUMNS


# --------------------------------------------------------------------------
# evaluate
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def result(normalized, spec):
    df, _ = normalized
    return evaluate_run(df, spec, "r001")


def _target(result, tid):
    return next(t for t in result["targets"] if t["id"] == tid)


def test_target_max_level(result):
    t = _target(result, "max_einstau_becken")
    assert t["result"] == "erfuellt"
    assert t["value"] == pytest.approx(99.5)
    assert t["time_of_occurrence"] == pytest.approx(0.5)
    assert t["utilisation"] == pytest.approx(99.5 / 99.6)


def test_target_discharge_ratio(result):
    t = _target(result, "aufteilung_klaerueberlauf")
    assert t["result"] == "erfuellt"
    assert t["value"] == pytest.approx(0.3)          # 0.6 / 2.0, Volumenverhältnis
    assert t["utilisation"] == pytest.approx(0.3 / 0.35)


def test_target_max_force_informativ(result):
    t = _target(result, "last_wand")
    assert t["result"] == "informativ"
    erwartet = math.sqrt((1000.0 * syn.T_END + 10.0) ** 2 + syn.MARKER_Y ** 2)
    assert t["value"] == pytest.approx(erwartet)
    assert t["time_of_occurrence"] == pytest.approx(syn.T_END)


def test_target_ohne_daten_nicht_auswertbar(result):
    t = _target(result, "sohlschub_becken")
    assert t["result"] == "nicht_auswertbar"


def test_qualitaetsblock(result):
    q = result["quality"]
    assert q["courant_mean"] == pytest.approx(0.2)
    assert q["courant_max"] == pytest.approx(0.5)
    assert q["mass_balance_error_rel_max"] == pytest.approx(1e-5 / 20.0, rel=1e-3)
    assert q["residual_p_rgh_initial"] == pytest.approx(1e-3 * math.exp(-5.0), rel=1e-3)


def test_extremwerttabelle(result):
    ext = {(e["quantity"], e["location_id"]): e for e in result["extremes"]}
    assert ext[("level", "pegel_becken")]["value"] == pytest.approx(99.5)
    assert ext[("volume", "domain")]["value"] == pytest.approx(20.0)
    assert ("force", "wand_ost") in ext


# --------------------------------------------------------------------------
# casespec-Validierung
# --------------------------------------------------------------------------

def test_casespec_yaml_roundtrip(spec, tmp_path):
    p = tmp_path / "case.yaml"
    spec.to_yaml(p)
    again = CaseSpec.from_yaml(p)
    assert again.case_hash() == spec.case_hash()


def test_casespec_unbekannter_pegel_wird_gemeldet_nicht_abgelehnt():
    """
    Ein Kriterium ohne Bezugsobjekt ist ein BEFUND, kein Schemafehler.

    Als harter Validator machte diese Regel den Fall im Zwischenzustand
    unlesbar: wer einen Pegel löschte, auf den ein Kriterium zeigte, bekam
    422 aus der Entwurfsvorschau (die Szene fror auf dem Stand VOR dem
    Löschen ein) und aus dem Speichern — der einzige Ausweg war Undo. Ein
    Editor muss einen unfertigen Stand halten und sichern können; gesperrt
    wird der LAUF, und das tut die Prüfung.
    """
    from ..core.validate import validate_case

    spec = CaseSpec(
        meta=Meta(id="kaputt"),
        solver=Solver(end_time=1.0),
        evaluation=Evaluation(
            gauges=[Gauge(id="p1", point=(0, 0))],
            targets=[TargetMaxLevel(id="t1", kind="max_level",
                                    at="gibtsnicht", limit_max=1.0)]))
    # lesbar UND speicherbar
    CaseSpec.model_validate(spec.model_dump(mode="json"))

    befund = next(b for b in validate_case(spec) if b["object_id"] == "t1")
    assert befund["severity"] == "fehler"
    assert "gibtsnicht" in befund["message"]
    assert befund["fix"]["aktion"] == "verweis_entfernen"


def test_casespec_schema_generierbar():
    schema = CaseSpec.json_schema()
    assert "properties" in schema and "evaluation" in schema["properties"]


# --------------------------------------------------------------------------
# CLI-Durchlauf (Abnahmetest der Stufe)
# --------------------------------------------------------------------------

def test_cli_all_durchlauf(case_dir, spec, tmp_path, capsys):
    spec_path = tmp_path / "case.yaml"
    spec.to_yaml(spec_path)
    out_root = tmp_path / "runs"

    cli_main(["all", "--case", str(case_dir), "--spec", str(spec_path),
              "--run-id", "r001", "--out", str(out_root)])

    run_dir = out_root / "r001"
    assert (run_dir / "normalized.parquet").exists()
    result = json.loads((run_dir / "result.json").read_text())
    assert result["run_id"] == "r001"
    assert {t["id"] for t in result["targets"]} == {
        "max_einstau_becken", "aufteilung_klaerueberlauf",
        "last_wand", "sohlschub_becken"}
    assert result["figures"], "keine Abbildungen erzeugt"
    for fig in result["figures"]:
        assert Path(fig["path"]).exists()
        assert (run_dir / "figures" / (fig["id"] + ".svg")).exists()
        assert "r001" in fig["caption"]
