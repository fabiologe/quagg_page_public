"""
Synthetischer, damBreak-artiger OpenFOAM-Ergebnisfall mit analytisch
bekannten Zeitreihen. Erwartungswerte für die Tests:

    Pegel pegel_becken      level(t) = 99.0 + 0.5*sin(pi*t)  -> max 99.5 bei t=0.5
    Zulauf qs_zulauf        Q = 2.0 konstant
    Entlastung qs_klaerueberlauf  Q = 0.6 konstant           -> Verhältnis 0.30
    Kraft wand_ost          fp = (1000*t, MARKER_Y, 0), fv = (10, 0, 0)
                            Neustart ab t=0.4; nur Neustartzeilen tragen
                            MARKER_Y in der y-Komponente
    Volumen                 V(t) = 10 + 10*t                 -> max 20
    Kontinuität kumuliert   1e-5*t                           -> Bilanzfehler 5e-7
    Courant                 mean 0.2, max 0.5 je Schritt
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from ..core import casespec as cs

T_END = 1.0
DT = 0.05
RESTART_T = 0.4
MARKER_Y = 5.0


def time_grid() -> np.ndarray:
    return np.round(np.arange(0.0, T_END + DT / 2, DT), 10)


def level(t, amp: float = 0.5):
    return 99.0 + amp * np.sin(np.pi * t)


def _write(path: Path, header: str, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + "\n".join(lines) + "\n")


def _forces_line(t: float, marker_y: float) -> str:
    fp = (1000.0 * t, marker_y, 0.0)
    fv = (10.0, 0.0, 0.0)
    mp = (100.0 * t, 0.0, 0.0)
    mv = (1.0, 0.0, 0.0)

    def tri(v):
        return f"({v[0]} {v[1]} {v[2]})"

    return f"{t}\t({tri(fp)} {tri(fv)}) ({tri(mp)} {tri(mv)})"


def build_case(case_dir: Path, *, level_amp: float = 0.5,
               q_split: float = 0.6) -> None:
    """level_amp und q_split erlauben unterscheidbare Varianten für
    Laufvergleiche (Demo-Läufe); die Tests nutzen die Standardwerte."""
    pp = case_dir / "postProcessing"
    t_all = time_grid()

    # Kräfte, Foundation-Format, mit Neustartordner ab RESTART_T. Der erste
    # Lauf schreibt über RESTART_T hinaus (t bis 0.6) — genau das muss die
    # Neustartlogik wegschneiden.
    first = [_forces_line(t, 0.0) for t in t_all if t <= 0.6]
    second = [_forces_line(t, MARKER_Y) for t in t_all if t >= RESTART_T]
    _write(pp / "forces_wand_ost" / "0" / "forces.dat",
           "# Forces\n# Time forces(pressure viscous) moment(pressure viscous)\n", first)
    _write(pp / "forces_wand_ost" / str(RESTART_T) / "forces.dat",
           "# Forces\n# Time forces(pressure viscous) moment(pressure viscous)\n", second)

    # weightedAreaIntegrate(U) mit alpha-Gewicht schreibt einen VEKTOR;
    # der Durchfluss ist dessen Anteil in Richtung der Schnittnormalen
    # (hier x, weil die Querschnitte in y verlaufen).
    for sec_id, q in (("qs_zulauf", 2.0), ("qs_klaerueberlauf", q_split)):
        _write(pp / f"discharge_{sec_id}" / "0" / "surfaceFieldValue.dat",
               "# Region : plane\n# Time weightedAreaIntegrate(U)\n",
               [f"{t}\t({q} 0 0)" for t in t_all])

    _write(pp / "gauge_pegel_becken" / "0" / "position.dat",
           "# Time x y z\n",
           [f"{t}\t75.0\t45.0\t{level(t, level_amp)}" for t in t_all])

    _write(pp / "water_volume" / "0" / "volFieldValue.dat",
           "# Time volIntegrate(alpha.water)\n",
           [f"{t}\t{10.0 + 10.0 * t}" for t in t_all])

    _write(pp / "residuals" / "0" / "residuals.dat",
           "# Time p_rgh Ux Uy\n",
           [f"{t}\t{1e-3 * np.exp(-5 * t):.6e}\t1e-4\t1e-4" for t in t_all])

    log_blocks = []
    for t in t_all[1:]:
        log_blocks.append(
            f"Courant Number mean: 0.2 max: 0.5\n"
            f"Interface Courant Number mean: 0.01 max: 0.1\n"
            f"deltaT = {DT}\n"
            f"Time = {t}\n\n"
            f"smoothSolver:  Solving for alpha.water, Initial residual = 1e-3\n"
            f"GAMG:  Solving for p_rgh, Initial residual = 1e-3, Final residual = 1e-07, No Iterations 8\n"
            f"time step continuity errors : sum local = 1e-09, global = 2e-10, cumulative = {1e-5 * t:.6e}\n"
            f"ExecutionTime = 1 s\n\n")
    (case_dir / "log.interFoam").write_text("".join(log_blocks))


def build_spec_stage3() -> cs.CaseSpec:
    """
    Vollständige casespec für das PreProzessing (Stufe 3): kleines Gebiet
    24 x 18 m, Gelände flach auf 96 m mit eingeschnittenem Gerinne und
    Planum, ein Bauwerk je Katalogtyp der ersten Ausbaustufe.
    Basiszelle 0.5 m -> blockMesh 48 x 36 x 16 Zellen.
    """
    return cs.CaseSpec(
        meta=cs.Meta(id="test-stufe3", title="PreProzessing-Abnahmefall"),
        domain=cs.Domain(extent=(0.0, 0.0, 24.0, 18.0), z_min=92.0, z_max=100.0),
        terrain=cs.Terrain(
            base=cs.TerrainBase(source="flat:96.0", resolution=0.5),
            operations=[
                cs.OpChannelCarve(id="t01", type="channel_carve",
                                  polyline=[(2, 9), (22, 9)],
                                  invert_start=94.8, invert_end=94.6,
                                  bottom_width=2.0, depth=1.5, side_slope=1.5),
                cs.OpPad(id="t02", type="pad",
                         polygon=[(16, 2), (22, 2), (22, 7), (16, 7)],
                         level=96.5),
            ]),
        structures=[
            cs.StructWall(id="wand_becken", type="wall", patch="wand_becken",
                          alignment=cs.Alignment(points=[(8, 3, 98.0), (8, 8, 98.0)]),
                          height=2.0, thickness=0.5),
            cs.StructBasin(id="becken_1", type="basin", patch="becken_1",
                           footprint=[(10, 12), (14, 12), (14, 17), (10, 17)],
                           invert_level=95.0, wall_height=2.0, wall_thickness=0.3),
            cs.StructCulvert(id="dl_1", type="culvert", patch="dl_1",
                             axis=[(4, 4, 94.5), (4, 14, 94.3)],
                             profile=cs.CulvertProfile(kind="circular", diameter=1.2)),
            cs.StructPier(id="pfeiler_1", type="pier", patch="pfeiler_1",
                          footprint=[(18, 10), (20, 10), (20, 13), (18, 13)],
                          base_level=94.0, top_level=97.0),
            cs.StructScreen(id="rechen_1", type="screen", patch="rechen_1",
                            plane_polygon=[(6, 8.0, 94.6), (6, 10.0, 94.6),
                                           (6, 10.0, 96.6), (6, 8.0, 96.6)],
                            bar_spacing=0.02, bar_thickness=0.008,
                            resistance=cs.ScreenResistance(
                                f=(120.0, 0.0, 0.0), blockage_ratio=0.3)),
        ],
        mesh=cs.Mesh(
            base_cell=0.5,
            refinements=[
                cs.RefineBox(id="r01", type="box",
                             extent=(4, 6, 94.0, 12, 12, 97.0), level=2),
                cs.RefineSurface(id="r02", type="surface",
                                 target="wand_becken", level=3),
                cs.RefineSurface(id="r03", type="surface",
                                 target="becken_1", level=1),
            ],
            boundary_layers=cs.BoundaryLayers(patches=["wand_becken"],
                                              n_layers=3, expansion_ratio=1.2)),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=0.5),
            cs.BcOutflowFixedLevel(id="ablauf", patch="outlet",
                                   type="outflow_fixed_level", level=94.9),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ],
        solver=cs.Solver(application="interFoam", end_time=60.0,
                         initial_level=94.9,
                         write_interval_fields=5.0, write_interval_series=0.1),
        evaluation=cs.Evaluation(
            sections=[cs.Section(id="qs_zulauf", polyline=[(4, 2), (4, 16)]),
                      cs.Section(id="qs_ablauf", polyline=[(20, 2), (20, 16)])],
            gauges=[cs.Gauge(id="pegel_becken", point=(12, 14))],
            force_patches=["wand_becken"],
            targets=[cs.TargetMaxLevel(id="einstau", kind="max_level",
                                       at="pegel_becken", limit_max=96.8),
                     cs.TargetMinBedShear(id="sohlschub_becken",
                                          kind="min_bed_shear",
                                          region="r01", limit_min=0.001)]))


def build_spec() -> cs.CaseSpec:
    return cs.CaseSpec(
        meta=cs.Meta(id="test-dambreak", title="Synthetischer Abnahmefall Stufe 1"),
        structures=[cs.StructWall(
            id="wand_ost", type="wall", patch="wand_ost",
            alignment=cs.Alignment(points=[(62, 44, 99.5), (78, 45, 99.3)]),
            height=3.0, thickness=0.35)],
        solver=cs.Solver(application="interFoam", end_time=T_END),
        evaluation=cs.Evaluation(
            sections=[cs.Section(id="qs_zulauf", polyline=[(20, 45), (20, 55)]),
                      cs.Section(id="qs_klaerueberlauf", polyline=[(72, 40), (72, 50)])],
            gauges=[cs.Gauge(id="pegel_becken", point=(75, 45))],
            force_patches=["wand_ost"],
            targets=[
                cs.TargetMaxLevel(id="max_einstau_becken", kind="max_level",
                                  at="pegel_becken", limit_max=99.6),
                cs.TargetDischargeRatio(id="aufteilung_klaerueberlauf",
                                        kind="discharge_ratio",
                                        of="qs_klaerueberlauf", to="qs_zulauf",
                                        limit_max=0.35),
                cs.TargetMaxForce(id="last_wand", kind="max_force", at="wand_ost"),
                cs.TargetMinBedShear(id="sohlschub_becken", kind="min_bed_shear",
                                     region="r01", limit_min=1.0),
            ]))
