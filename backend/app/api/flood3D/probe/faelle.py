"""
Die Probefälle der Messlatte (Fahrplan A0).

Fall K — ein kleines Gerinne mit TROCKENEM Start: der harte Fall für den
Zulauf. 10 × 1 m, Sohle 0,2 % Gefälle, Q = 0,28 m³/s. Bei k_s = 3 cm
(Material „erde") ist die Normalwassertiefe nach Manning-Strickler
(n ≈ k_s^(1/6)/26 = 0,0215) rund 0,30 m, v ≈ 0,93 m/s, Fr ≈ 0,54 — ruhig,
drei Zellen tief bei 0,1-m-Zellen. Der Ablauf am Ende ist frei; er zieht
den Spiegel zum Rand hin ab, deshalb misst der Pegel in der Mitte.

Fall A — eine Kopie eines echten Falls (Vorgabe Rentrich_BetaTest08:
Trapezfenster am Zulauf, kein Anfangswasserspiegel, 24 k Zellen).
Gekürzt auf wenige Sekunden: gemessen wird der Anlauf.

Wehr — der bestehende Verifikationsfall (tests/verifikation_wehr.py),
unverändert.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from ..core import casespec as cs

K_LAENGE, K_BREITE = 10.0, 1.0
K_SOHLE, K_GEFAELLE = 100.0, 0.002
K_Q = 0.28
K_ZELLE = 0.1


def fall_k(ende: float = 15.0) -> cs.CaseSpec:
    """Fall K (synthetisch, ohne Anfangswasser)."""
    oben = K_SOHLE + K_GEFAELLE * K_LAENGE          # Sohle am Zulauf
    ganz = [(-1.0, -1.0), (K_LAENGE + 1, -1.0),
            (K_LAENGE + 1, K_BREITE + 1), (-1.0, K_BREITE + 1)]
    mitte = K_LAENGE / 2
    return cs.CaseSpec(
        meta=cs.Meta(id="probe-k", title="Probe Fall K: Gerinne, trockener Start"),
        domain=cs.Domain(extent=(0.0, 0.0, K_LAENGE, K_BREITE),
                         z_min=K_SOHLE - 0.4, z_max=K_SOHLE + 1.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source=f"flat:{K_SOHLE}", resolution=0.25),
            operations=[cs.OpRamp(id="gefaelle", type="ramp", polygon=ganz,
                                  level_start=oben + K_GEFAELLE,
                                  level_end=K_SOHLE - K_GEFAELLE,
                                  direction=(1.0, 0.0))]),
        structures=[],
        mesh=cs.Mesh(base_cell=K_ZELLE),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=K_Q, face="x_min"),
            cs.BcOutflowFree(id="ablauf", patch="outlet",
                             type="outflow_free", face="x_max"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ],
        solver=cs.Solver(application="interFoam", end_time=ende,
                         write_interval_fields=0.5,
                         write_interval_series=0.05),
        evaluation=cs.Evaluation(
            sections=[cs.Section(id="qs_mitte",
                                 polyline=[(mitte, 0.0), (mitte, K_BREITE)])],
            gauges=[cs.Gauge(id="pegel_mitte", point=(mitte, K_BREITE / 2))],
            verweilzeit=True))


def fall_aus_ordner(quelle: Path, ziel: Path, ende: float | None = None,
                    felder_s: float | None = None) -> cs.CaseSpec:
    """
    Kopie eines gespeicherten Falls nach `ziel` (NIE am Original rechnen)
    und die Spec daraus — optional mit kürzerer Simulationsdauer und
    gröberem Feldtakt, damit die Probe Minuten statt Stunden dauert.
    """
    if ziel.exists():
        shutil.rmtree(ziel)
    shutil.copytree(quelle, ziel, ignore=shutil.ignore_patterns(
        "staende", "_mesh_preview"))
    spec = cs.CaseSpec.from_yaml(ziel / "case.yaml")
    if ende is not None:
        spec.solver.end_time = float(ende)
    if felder_s is not None:
        spec.solver.write_interval_fields = float(felder_s)
    spec.to_yaml(ziel / "case.yaml")
    return spec


def wehr() -> cs.CaseSpec:
    from ..tests.verifikation_wehr import referenz_spec
    return referenz_spec()
