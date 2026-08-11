"""
Physikalischer Referenzfall (Spez. Kap. 13, Audit U21): Überfall über ein
breitkroniges Wehr, gerechnet mit der ECHTEN Pipeline (blockMesh → snappy →
interFoam), verglichen mit der Überfallformel Q = C_d · 2/3·√(2g)·b·h^1,5.

Der Fall ist bewusst klein, kostet aber trotzdem RECHENZEIT (Erstlauf:
82 min auf 4 Kernen bei end_time 25 s; nach Kürzung auf 18 s ≈ 1 h — der
dünne Überfallstrahl drückt den Zeitschritt auf ~0,6 ms) und läuft NICHT
in der Standard-Suite — Aufruf über test_verifikation.py mit FLOOD3D_VERIFIKATION=1
oder direkt:

    FLOOD3D_VERIFIKATION=1 venv/bin/python -m pytest \
        app/api/flood3D/tests/test_verifikation.py -q

Das Ergebnis wird nach data/verifikation/wehr_ueberfall.json geschrieben
und im Client (Phase „Simulation") als Verifikations-Karte angezeigt.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..core import casespec as cs

# Toleranzband. `CD_REFERENZ` wird nach dem ERSTEN bestandenen Lauf auf den
# gemessenen Wert eingefroren (Regression); bis dahin zählt allein das
# Plausibilitätsfenster der Literatur für breitkronige Wehre.
CD_PLAUSIBEL = (0.50, 0.80)      # Literaturspanne breitkronig (µ ≈ 0,5–0,58
                                 # nach Poleni entspricht C_d ≈ 0,55–0,75)
# Erstlauf 2026-08-11: C_d = 0,6443 ± 0,0093 (20.896 Zellen, 82 min auf
# 4 Kernen) — mitten im Literaturband. Ab jetzt ist DIESER Wert die
# Regressions-Referenz; das Plausibilitätsfenster bleibt als zweite Schranke.
CD_REFERENZ: float | None = 0.644
CD_TOLERANZ_REL = 0.10           # ± um die eingefrorene Referenz


def referenz_spec() -> cs.CaseSpec:
    """Gerinne 8×1 m, breitkroniges Wehr quer, konstanter Zufluss."""
    return cs.CaseSpec(
        meta=cs.Meta(id="verifikation-wehr",
                     title="Verifikation Wehrüberfall (breitkronig)"),
        domain=cs.Domain(extent=(0.0, 0.0, 8.0, 1.0), z_min=94.6, z_max=96.6),
        terrain=cs.Terrain(base=cs.TerrainBase(source="flat:95.0",
                                               resolution=0.25)),
        structures=[cs.StructWeir(
            id="wehr", type="weir", patch="wehr",
            crest_polyline=[(4.0, 0.0, 95.6), (4.0, 1.0, 95.6)],
            crest_width=0.4, slope_upstream=0.0, slope_downstream=0.0,
            profile_type="breitkronig", base_level=95.0)],
        mesh=cs.Mesh(
            base_cell=0.125,
            refinements=[cs.RefineBox(
                id="wehrzone", type="box",
                extent=(3.0, 0.0, 95.3, 5.5, 1.0, 96.2), level=1)]),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=0.12),
            cs.BcOutflowFree(id="ablauf", patch="outlet",
                             type="outflow_free"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere",
                            type="atmosphere")],
        # 18 s statt 25 s: der Überfallbeiwert ist ab t ≈ 12 s stationär
        # (Erstlauf: Median ab 12 s = 0,6436 vs. Endwert 0,6443) — das
        # ausgewertete letzte Drittel beginnt bei 12 s, alles danach war
        # nur Rechenzeit (~30 % Ersparnis je Verifikationslauf)
        solver=cs.Solver(application="interFoam", end_time=18.0,
                         initial_level=95.55,
                         write_interval_fields=5.0,
                         write_interval_series=0.2),
        evaluation=cs.Evaluation(
            sections=[cs.Section(id="qs_ow", polyline=[(3.0, 0.0),
                                                       (3.0, 1.0)])],
            gauges=[cs.Gauge(id="pegel_ow", point=(2.5, 0.5))],
            targets=[cs.TargetOverfallCd(id="cd_wehr", kind="overfall_cd",
                                         weir="wehr", section="qs_ow",
                                         gauge="pegel_ow")]))


def verifikation_rechnen(arbeitsdir: Path,
                         ziel_json: Path) -> dict:
    """
    Referenzfall komplett rechnen und bewerten. Schreibt das Ergebnis als
    JSON (für GET /verifikation + Client-Karte) und gibt es zurück.
    """
    import pandas as pd

    from ..core.runner import run_pipeline

    spec = referenz_spec()
    run_root = arbeitsdir / "verifikation_wehr"
    t0 = time.time()
    manifest = run_pipeline(spec, arbeitsdir, run_root, "verifikation_wehr")

    df = pd.read_parquet(run_root / "normalized.parquet")
    cd = df[(df["quantity"] == "overfall_cd")
            & (df["location_id"] == "wehr")].sort_values("time")
    if not len(cd):
        raise AssertionError("Keine Überfallbeiwert-Reihe entstanden — "
                             "Wehr wird nicht überströmt?")
    # eingeschwungener Bereich: letztes Drittel der Reihe
    hinten = cd.iloc[int(len(cd) * 2 / 3):]
    cd_sim = float(hinten["value"].median())
    streuung = float(hinten["value"].std())

    if CD_REFERENZ is not None:
        band = (CD_REFERENZ * (1 - CD_TOLERANZ_REL),
                CD_REFERENZ * (1 + CD_TOLERANZ_REL))
        band_art = f"eingefrorene Referenz {CD_REFERENZ:g} ± " \
                   f"{CD_TOLERANZ_REL:.0%}"
    else:
        band = CD_PLAUSIBEL
        band_art = "Literatur-Plausibilität breitkronig (Erstlauf — " \
                   "Referenz danach einfrieren)"
    bestanden = band[0] <= cd_sim <= band[1]

    ergebnis = {
        "fall": "wehr_ueberfall",
        "titel": "Wehrüberfall (breitkronig) gegen die Überfallformel",
        "geprueft": time.strftime("%Y-%m-%d %H:%M"),
        "dauer_s": round(time.time() - t0, 1),
        "zellen": manifest.get("checkmesh", {}).get("cells"),
        "cd_sim": round(cd_sim, 4),
        "cd_streuung": round(streuung, 4) if np.isfinite(streuung) else None,
        "band": [round(band[0], 4), round(band[1], 4)],
        "band_art": band_art,
        "bestanden": bool(bestanden),
        "formel": "Q = C_d · 2/3 · √(2g) · b · h^1,5",
    }
    ziel_json.parent.mkdir(parents=True, exist_ok=True)
    ziel_json.write_text(json.dumps(ergebnis, indent=2, ensure_ascii=False))
    return ergebnis
