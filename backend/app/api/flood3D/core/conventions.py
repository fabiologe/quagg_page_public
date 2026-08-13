"""
Einheiten-, Vorzeichen- und Namenskonventionen (Spez. Kap. 3, Modul conventions).

Alle Werte in der normalisierten Zwischendatei sind SI. Die hier definierten
Enums sind die einzige Quelle für die Spalten `quantity` und `component`
(Spez. 4.2) — extract, evaluate und render importieren sie von hier, damit
kein String-Tippfehler zwei Module auseinanderlaufen lässt.
"""
from enum import Enum


class Quantity(str, Enum):
    FORCE = "force"          # N
    MOMENT = "moment"        # N m
    DISCHARGE = "discharge"  # m3/s
    LEVEL = "level"          # m, absolute Höhe (level_reference: absolute)
    VOLUME = "volume"        # m3
    RESIDUAL = "residual"    # -
    COURANT = "courant"      # -
    TIMESTEP = "timestep"    # s
    CONTINUITY = "continuity"  # kumulierter Kontinuitätsfehler, m3
    BED_SHEAR = "bed_shear"  # N/m2
    ENERGY_HEAD = "energy_head"  # m, Energiehöhe je Querschnitt
    OVERFALL_CD = "overfall_cd"  # -, Überfallbeiwert je Wehr
    TRACER = "tracer"        # -, Markierungsstoff (0…1) für die Verweilzeit


UNITS: dict[Quantity, str] = {
    Quantity.FORCE: "N",
    Quantity.MOMENT: "N m",
    Quantity.DISCHARGE: "m3/s",
    Quantity.LEVEL: "m",
    Quantity.VOLUME: "m3",
    Quantity.RESIDUAL: "-",
    Quantity.COURANT: "-",
    Quantity.TIMESTEP: "s",
    Quantity.CONTINUITY: "m3",
    Quantity.BED_SHEAR: "N/m2",
    Quantity.ENERGY_HEAD: "m",
    Quantity.OVERFALL_CD: "-",
    Quantity.TRACER: "-",
}


def befund(object_id: str, severity: str, message: str, **extra) -> dict:
    """Einheitliches Befund-Dict (severity: fehler|warnung|hinweis) — EINE
    Definition statt drei lokaler Kopien in validate/evaluate/meshgen."""
    return {"object_id": object_id, "severity": severity,
            "message": message, **extra}


class Component(str, Enum):
    # Nur, was auch erzeugt wird: `porous` (Kraft-Porositätsanteil) und
    # `min` (Courant) hat nie ein Reader geschrieben — tote Enum-Werte
    # täuschen einen Vertrag vor, den es nicht gibt (Audit T4)
    X = "x"
    Y = "y"
    Z = "z"
    MAGNITUDE = "magnitude"
    PRESSURE = "pressure"    # Druckanteil einer Kraft/eines Moments
    VISCOUS = "viscous"      # Reibungsanteil
    MEAN = "mean"
    MAX = "max"
    INITIAL = "initial"      # Anfangsresiduum einer Iteration
    FINAL = "final"
    NONE = ""


# Spalten der normalisierten Zwischendatei (Spez. 4.2). Reihenfolge ist Teil
# des Vertrags — die Referenz-Parquets der Regressionstests hängen daran.
NORMALIZED_COLUMNS = [
    "run_id", "time", "quantity", "location_id",
    "component", "value", "unit", "source",
]


def section_normal(polyline) -> tuple[float, float, float]:
    """
    Normale eines Auswerte-Querschnitts (Grundriss, Rechtsdrehung).
    EINE Quelle für casebuilder (Schnittebene) UND extract (Projektion des
    Durchflussvektors) — liefen die auseinander, käme ein falscher
    Durchfluss heraus, ohne dass es auffällt.
    """
    x0, y0 = float(polyline[0][0]), float(polyline[0][1])
    x1, y1 = float(polyline[-1][0]), float(polyline[-1][1])
    dx, dy = x1 - x0, y1 - y0
    length = (dx * dx + dy * dy) ** 0.5 or 1.0
    return (dy / length, -dx / length, 0.0)


# ── Ereignis-Vokabular des Laeufers ─────────────────────────────────────────
# local_runner.emit() sendet GENAU diese fuenf Arten als NDJSON-Zeilen;
# jeder Hop (Worker, Companion, Relay, run_log, Client) reicht sie durch
# statt zu uebersetzen. Feldnamen sind Vertrag — der Drift-Waechter
# (test_runpod_relay.test_runner_progress_vokabular_ist_das_erwartete)
# prueft die Runner-Seite per AST. Ein progress-Ereignis traegt ev["time"],
# NICHT ev["t"]: genau diese Verwechslung liess letzte_zeit jeden frischen
# Cloud-Lauf lang leer (Bug 2026-08-13).
#
#   log         text
#   progress    phase (meshing|solving|postprocessing), fraction,
#               time?, end_time?, eta_s?, elapsed_s?
#   checkpoint  run_id, letzte_zeit  (Teilstand liegt dann im S3)
#   done        run_id, artifactsFile→artifactsUrl (Worker signiert um),
#               sizeBytes
#   error       text, befunde?, netz?  (Netz-Tor-Abbrueche tragen Zahlen)
#
# Vom Client ERFUNDENE Arten (localCompanion.js: 'job', synthetische
# 'log'/'progress') existieren nur im Browser und duerfen nie hierher.
LAUF_EREIGNISSE = ("log", "progress", "checkpoint", "done", "error")


# Aussennormale je Gebietsflaeche. Positiver Durchfluss heisst damit
# „verlaesst das Gebiet" — ein Zulauf zaehlt negativ.
FACE_NORMALS = {
    "x_min": (-1.0, 0.0, 0.0),
    "x_max": (1.0, 0.0, 0.0),
    "y_min": (0.0, -1.0, 0.0),
    "y_max": (0.0, 1.0, 0.0),
    "z_max": (0.0, 0.0, 1.0),
}
