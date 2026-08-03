"""
Fachliche Leser: eine Funktion je Ergebnisquelle, Ausgabe sind Zeilen der
normalisierten Zwischendatei (Spez. 4.2).

Namenskontrakt zwischen casebuilder und extract (casebuilder erzeugt die
functionObjects in Stufe 3 mit genau diesen Namen):

    postProcessing/forces_<patch_id>/        forces.dat oder force.dat+moment.dat
    postProcessing/discharge_<section_id>/   surfaceFieldValue.dat
    postProcessing/gauge_<gauge_id>/         position.dat (interfaceHeight),
                                             ersatzweise height.dat
    postProcessing/water_volume/             volFieldValue.dat
    postProcessing/residuals/                residuals.dat oder solverInfo.dat
    log.<application>                        Courant, deltaT, Kontinuität

Sonderwerte der Spalte location_id für Größen ohne Ortsbezug:
    "domain" für das Wasservolumen, "solver" für Courant, Zeitschritt und
    Kontinuität, Feldname (p_rgh, Ux, …) für Residuen.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

from ..conventions import UNITS, Component, Quantity
from .datfile import (list_start_dirs, merge_restart_rows, read_scalar_fo,
                      read_vector_fo)


def _row(run_id, time, quantity: Quantity, location, component: Component,
         value, source) -> dict:
    return {
        "run_id": run_id, "time": float(time), "quantity": quantity.value,
        "location_id": location, "component": component.value,
        "value": float(value), "unit": UNITS[quantity], "source": source,
    }


def _mag(v: tuple[float, float, float]) -> float:
    return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)


# --------------------------------------------------------------------------
# Kräfte und Momente
# --------------------------------------------------------------------------

def read_forces(fo_dir: Path, patch_id: str, run_id: str) -> list[dict]:
    """
    Foundation: forces.dat mit 4 bzw. 6 Tripeln je Zeile
    (Kraft p/v[/porös], Moment p/v[/porös]), Gesamtkraft = Summe der Anteile.
    ESI: force.dat und moment.dat mit je 3 Tripeln (total, pressure, viscous).
    """
    rows: list[dict] = []
    src = fo_dir.name

    def emit(quantity: Quantity, t, total, pres, visc):
        for comp, val in ((Component.X, total[0]), (Component.Y, total[1]),
                          (Component.Z, total[2]), (Component.MAGNITUDE, _mag(total))):
            rows.append(_row(run_id, t, quantity, patch_id, comp, val, src))
        # Druck- und Reibungsanteil als Betrag (Spez. 2: getrennt ausweisen)
        rows.append(_row(run_id, t, quantity, patch_id, Component.PRESSURE, _mag(pres), src))
        rows.append(_row(run_id, t, quantity, patch_id, Component.VISCOUS, _mag(visc), src))

    combined = read_vector_fo(fo_dir, "forces.dat")
    if combined:
        for t, triples in combined:
            if len(triples) not in (4, 6):
                continue
            half = len(triples) // 2
            f_parts, m_parts = triples[:half], triples[half:]
            f_tot = tuple(sum(p[i] for p in f_parts) for i in range(3))
            m_tot = tuple(sum(p[i] for p in m_parts) for i in range(3))
            emit(Quantity.FORCE, t, f_tot, f_parts[0], f_parts[1])
            emit(Quantity.MOMENT, t, m_tot, m_parts[0], m_parts[1])
        return rows

    for fname, quantity in (("force.dat", Quantity.FORCE), ("moment.dat", Quantity.MOMENT)):
        parsed = read_vector_fo(fo_dir, fname)
        if parsed:
            for t, triples in parsed:
                if len(triples) >= 3:
                    emit(quantity, t, triples[0], triples[1], triples[2])
            continue
        # ESI 2406 schreibt spaltenbasiert ohne Klammern:
        # Time total_x..z pressure_x..z viscous_x..z
        _, table = read_scalar_fo(fo_dir, fname)
        for r in table:
            if len(r) >= 10:
                emit(quantity, r[0], tuple(r[1:4]), tuple(r[4:7]), tuple(r[7:10]))
    return rows


# --------------------------------------------------------------------------
# Durchfluss je Querschnitt
# --------------------------------------------------------------------------

def read_discharge(fo_dir: Path, section_id: str, normal,
                   run_id: str) -> list[dict]:
    """
    Durchfluss durch einen Querschnitt.

    Der functionObject liefert `weightedAreaIntegrate` von U mit
    alpha.water als Gewicht, also den VEKTOR ∫ α·U dA. Der Durchfluss ist
    dessen Anteil senkrecht zur Schnittebene — deshalb wird hier mit der
    Querschnittsnormalen multipliziert (dieselbe Funktion, die auch die
    Ebene im casebuilder aufspannt).

    Wichtig: `areaNormalIntegrate` wäre der naheliegende Weg, IGNORIERT
    aber das weightField (OpenFOAM v2406 kennt kein
    weightedAreaNormalIntegrate) — damit wurde die Luftströmung
    mitintegriert und der Durchfluss war um Größenordnungen zu hoch.
    """
    rows = read_vector_fo(fo_dir, "surfaceFieldValue.dat")
    n = normal or (1.0, 0.0, 0.0)
    out = []
    for t, triples in rows:
        if not triples:
            continue
        vec = triples[0]
        q = sum(vec[i] * n[i] for i in range(3))
        out.append(_row(run_id, t, Quantity.DISCHARGE, section_id,
                        Component.NONE, q, fo_dir.name))
    return out


# --------------------------------------------------------------------------
# Wasserspiegel je Pegelpunkt
# --------------------------------------------------------------------------

def read_wall_shear(fo_dir: Path, patch_id: str, komponente,
                    run_id: str) -> list[dict]:
    """
    Wandschubspannung auf einer Bauwerksflaeche (max bzw. Flaechenmittel).

    interFoam gibt wallShearStress KINEMATISCH aus (m²/s²) — der Betrag muss
    mit der Dichte multipliziert werden, sonst steht dort ein Tausendstel
    des wahren Wertes. Dieselbe Umrechnung wie beim Gelaendefeld.
    """
    _, table = read_scalar_fo(fo_dir, "surfaceFieldValue.dat")
    return [_row(run_id, r[0], Quantity.BED_SHEAR, patch_id, komponente,
                 r[-1] * 1000.0, fo_dir.name) for r in table]


def read_tracer(fo_dir: Path, patch_id: str, run_id: str) -> list[dict]:
    """
    Markierungsstoff am Ablauf (0…1). Der functionObject mittelt T über die
    Randfläche, gewichtet mit dem Wasseranteil — Luftzellen zählen also
    nicht mit. Aus dieser Durchbruchskurve folgen Verweilzeit und
    Kurzschlussanteil.
    """
    _, table = read_scalar_fo(fo_dir, "surfaceFieldValue.dat")
    return [_row(run_id, r[0], Quantity.TRACER, patch_id, Component.NONE,
                 r[-1], fo_dir.name) for r in table]


def read_gauge(fo_dir: Path, gauge_id: str, run_id: str) -> list[dict]:
    """
    interfaceHeight, ein functionObject je Pegelpunkt. position.dat enthält
    die Lage der Phasengrenze, die z-Spalte (letzte Datenspalte) ist die
    absolute Wasserspiegellage. Fallback height.dat: einspaltige Höhe.
    """
    names, table = read_scalar_fo(fo_dir, "position.dat")
    if table:
        return [_row(run_id, r[0], Quantity.LEVEL, gauge_id, Component.NONE,
                     r[-1], fo_dir.name) for r in table]
    _, table = read_scalar_fo(fo_dir, "height.dat")
    return [_row(run_id, r[0], Quantity.LEVEL, gauge_id, Component.NONE,
                 r[1], fo_dir.name) for r in table]


# --------------------------------------------------------------------------
# Wasservolumen im Modellgebiet
# --------------------------------------------------------------------------

def read_volume(fo_dir: Path, run_id: str) -> list[dict]:
    _, table = read_scalar_fo(fo_dir, "volFieldValue.dat")
    return [_row(run_id, r[0], Quantity.VOLUME, "domain", Component.NONE,
                 r[1], fo_dir.name) for r in table]


# --------------------------------------------------------------------------
# Residuen
# --------------------------------------------------------------------------

def read_residuals(fo_dir: Path, run_id: str) -> list[dict]:
    """
    Foundation residuals.dat: eine Spalte je Feld (Anfangsresiduum).
    ESI solverInfo.dat: Spalten <Feld>_initial / <Feld>_final, gemischt mit
    Textspalten (<Feld>_solver) — deshalb tokenweise statt Zahlenregex.
    """
    rows: list[dict] = []
    for fname in ("residuals.dat", "solverInfo.dat"):
        chunks, names = [], []
        for d in list_start_dirs(fo_dir):
            f = d / fname
            if not f.exists():
                continue
            header, data = [], []
            for line in f.read_text(errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("#"):
                    header = line.lstrip("#").split()
                    continue
                tokens = line.split()
                try:
                    t = float(tokens[0])
                except ValueError:
                    continue
                data.append((t, tokens))
            if data:
                names = names or header
                chunks.append((float(d.name), data))
        merged = merge_restart_rows(chunks)
        if not merged:
            continue
        for i, name in enumerate(names[1:] if names and
                                 names[0].lower() == "time" else names):
            comp = Component.INITIAL
            field = name
            if name.endswith("_initial"):
                field = name[:-8]
            elif name.endswith("_final"):
                field, comp = name[:-6], Component.FINAL
            elif name.endswith(("_iters", "_solver", "_converged")):
                continue
            elif not re.fullmatch(r"[\w.]+", name):
                continue
            for t, tokens in merged:
                if len(tokens) > i + 1:
                    try:
                        value = float(tokens[i + 1])
                    except ValueError:
                        continue
                    rows.append(_row(run_id, t, Quantity.RESIDUAL, field,
                                     comp, value, fo_dir.name))
        break
    return rows


# --------------------------------------------------------------------------
# Solverlog: Courant, Zeitschritt, Kontinuität
# --------------------------------------------------------------------------

_LOG_TIME = re.compile(r"^Time = ([\d.eE+-]+)")
_LOG_CO = re.compile(r"^Courant Number mean: ([\d.eE+-]+) max: ([\d.eE+-]+)")
_LOG_DT = re.compile(r"^deltaT = ([\d.eE+-]+)")
_LOG_CONT = re.compile(r"continuity errors : .*cumulative = ([\d.eE+-]+)")


def read_log(log_path: Path, run_id: str) -> list[dict]:
    """
    Reihenfolge im interFoam-Log je Zeitschritt: Courant und deltaT stehen
    VOR der "Time = t"-Zeile und gehören zu diesem t (Puffer, Flush bei
    Time-Zeile). Die Kontinuitätsfehler stehen NACH der Time-Zeile und
    gehören zum zuletzt gesehenen t.
    """
    rows: list[dict] = []
    pending: list[tuple[Quantity, str, Component, float]] = []
    current_t: float | None = None
    src = log_path.name
    for line in log_path.read_text(errors="replace").splitlines():
        if m := _LOG_CO.match(line):
            pending.append((Quantity.COURANT, "solver", Component.MEAN, float(m.group(1))))
            pending.append((Quantity.COURANT, "solver", Component.MAX, float(m.group(2))))
        elif m := _LOG_DT.match(line):
            pending.append((Quantity.TIMESTEP, "solver", Component.NONE, float(m.group(1))))
        elif m := _LOG_CONT.search(line):
            if current_t is not None:
                rows.append(_row(run_id, current_t, Quantity.CONTINUITY,
                                 "solver", Component.NONE, float(m.group(1)), src))
        elif m := _LOG_TIME.match(line):
            current_t = float(m.group(1))
            rows.extend(_row(run_id, current_t, q, loc, c, v, src)
                        for q, loc, c, v in pending)
            pending = []
    return rows


def merge_log_restarts(case_dir: Path, application: str, run_id: str) -> list[dict]:
    """log.<application> plus nummerierte Neustartlogs (log.interFoam.1, …)."""
    chunks = []
    for i, p in enumerate(sorted(case_dir.glob(f"log.{application}*"))):
        rows = read_log(p, run_id)
        if rows:
            chunks.append((rows[0]["time"] if i else -1.0,
                           [(r["time"], r) for r in rows]))
    merged = merge_restart_rows(chunks)
    return [r for _, r in merged]
