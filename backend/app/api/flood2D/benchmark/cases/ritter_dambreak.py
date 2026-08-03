#!/usr/bin/env python3
"""
Fall 1 — Ritter-Dammbruch (analytisch, 1892).

Der einfachste Fall mit exakter Loesung: senkrechter Dammbruch auf trockenem,
horizontalem, REIBUNGSFREIEM Bett. Testet den nackten Kern der Flachwasser-
gleichungen — Wellenausbreitung, Benetzungsfront, Trocken-Nass-Uebergang.
Wenn ein Solver das nicht trifft, ist jede Aussage ueber komplexere Faelle
wertlos; deshalb steht dieser Fall am Anfang.

Analytische Loesung (h0 = Anfangstiefe im Oberwasser, x0 = Dammlage, t > 0):

    c0 = sqrt(g*h0)                      Wellenschnelle im ruhenden Wasser
    xi = (x - x0) / t                    Aehnlichkeitsvariable

    xi <= -c0        ->  h = h0                        ungestoertes Oberwasser
    -c0 < xi < 2*c0  ->  h = (2*c0 - xi)^2 / (9*g)     Verduennungswelle
    xi >= 2*c0       ->  h = 0                         trocken

Die Front laeuft mit 2*c0, der Kopf der Verduennungswelle mit -c0. Domaenen-
laenge und Simulationsdauer sind so gewaehlt, dass beide die Raender NICHT
erreichen — sonst verfaelschen Reflexionen das Ergebnis.

Bekannte Abweichung: LISFLOOD-FP kennt kein exakt reibungsfreies Bett; wir
setzen fpfric auf einen sehr kleinen Wert (s. FPFRIC). Der dadurch verursachte
Fehler ist klein gegen die Schemafehler, die hier gemessen werden.
"""
import math

G = 9.81

NAME = "ritter_dambreak"
TITLE = "Ritter-Dammbruch (trockenes, reibungsfreies Bett)"

# ── Geometrie/Physik ─────────────────────────────────────────────────────────
DOMAIN_LENGTH = 1000.0     # m
NROWS = 5                  # Querrichtung; der Fall ist effektiv 1D
CELLSIZE = 2.0             # Standardaufloesung (ueberschreibbar, s. write_scenario)
X_DAM = 500.0              # Dammlage (Weltkoordinate)
H0 = 10.0                  # Anfangstiefe Oberwasser
T_END = 20.0               # Auswertezeitpunkt
FPFRIC = 1e-6              # "reibungsfrei" — s. Modulkopf
BED = 0.0                  # horizontale Sohle

WET_THRESHOLD = 0.01       # ab welcher Tiefe eine Zelle als nass gilt (m)

# Transienter Fall: das Profil aendert sich per Definition staendig, eine
# Stationaritaetspruefung waere hier sinnlos.
STEADY_STATE = False

C0 = math.sqrt(G * H0)     # 9.905 m/s
# Kontrolle: Front bei x0+2*c0*T, Wellenkopf bei x0-c0*T — beide im Gebiet.
FRONT_END = X_DAM + 2 * C0 * T_END      # ~896 m  < 1000
TAIL_END = X_DAM - C0 * T_END           # ~302 m  > 0

# Aufloesungen fuer den Konvergenznachweis. Ein Verfahren 1. Ordnung MUSS bei
# Halbierung der Zellweite genauer werden; bleibt der Fehler stehen, misst man
# nicht Diskretisierung, sondern einen Modell- oder Harness-Fehler.
CONVERGENCE_CELLSIZES = (8.0, 4.0, 2.0, 1.0)


def ncols_for(cellsize=CELLSIZE):
    return int(round(DOMAIN_LENGTH / cellsize))


def cell_x(col, cellsize=CELLSIZE):
    """Weltkoordinate der Zellmitte (xllcorner = 0)."""
    return (col + 0.5) * cellsize


def analytical_depth(x, t=T_END, h0=H0, x0=X_DAM):
    """Ritter-Loesung an der Stelle x zur Zeit t."""
    if t <= 0:
        return h0 if x <= x0 else 0.0
    c0 = math.sqrt(G * h0)
    xi = (x - x0) / t
    if xi <= -c0:
        return h0
    if xi >= 2 * c0:
        return 0.0
    return (2 * c0 - xi) ** 2 / (9 * G)


def reference_profile(cellsize=CELLSIZE):
    """Analytisches Tiefenprofil entlang der Zellmitten."""
    return [analytical_depth(cell_x(c, cellsize))
            for c in range(ncols_for(cellsize))]


def x_axis(cellsize=CELLSIZE):
    return [cell_x(c, cellsize) for c in range(ncols_for(cellsize))]


def active_mask(cellsize=CELLSIZE):
    """
    True fuer Zellen in der Verduennungswelle (dort, wo tatsaechlich Physik
    passiert). Ausserhalb ist die Loesung trivial konstant h0 bzw. 0 — wer nur
    ueber die volle Domaene mittelt, versteckt den Fehler hinter Nullen.
    """
    return [TAIL_END <= cell_x(c, cellsize) <= FRONT_END
            for c in range(ncols_for(cellsize))]


def write_scenario(inp, scheme="fv1", cellsize=CELLSIZE):
    """
    Schreibt terrain.asc, start.asc (Anfangstiefen) und run.par.

    scheme: 'fv1' | 'dg2' | 'acceleration' | 'roe' — welches numerische
    Verfahren LISFLOOD benutzen soll. Der Vergleich ueber mehrere Schemata ist
    der eigentliche Zweck: er zeigt, welches fuer schnelle Transienten taugt.
    """
    ncols = ncols_for(cellsize)
    header = (f"ncols {ncols}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {cellsize:g}\nNODATA_value -9999\n")

    # Horizontale Sohle
    dem_row = " ".join(f"{BED:.3f}" for _ in range(ncols))
    (inp / "terrain.asc").write_text(header + "\n".join([dem_row] * NROWS) + "\n")

    # Anfangsbedingung: startfile enthaelt TIEFEN (input.cpp:1184 laedt direkt
    # nach Arrptr->H; nur mit dem Zusatz-Keyword 'startelev' waeren es Hoehen).
    start_row = " ".join(
        f"{(H0 if cell_x(c, cellsize) <= X_DAM else 0.0):.4f}"
        for c in range(ncols))
    (inp / "start.asc").write_text(header + "\n".join([start_row] * NROWS) + "\n")

    par = [
        "DEMfile terrain.asc",
        "startfile start.asc",
        "resroot res",
        "dirroot results",
        f"sim_time {T_END:g}",
        "initial_tstep 0.01",
        f"saveint {T_END:g}",
        "massint 1",
        f"fpfric {FPFRIC:g}",
    ]
    # Schema-spezifische Keywords. CFL-Werte gemaess engines/docker/README.md 3.1.
    if scheme == "fv1":
        par += ["fv1", "cfl 0.5"]
    elif scheme == "dg2":
        par += ["dg2", "limitslopes", "cfl 0.33"]
    elif scheme == "acceleration":
        par += ["acceleration", "cfl 0.7"]
    elif scheme == "roe":
        par += ["Roe", "cfl 0.7"]
    else:
        raise ValueError(f"unbekanntes Schema: {scheme}")

    (inp / "run.par").write_text("\n".join(par) + "\n")


# Welche Schemata dieser Fall abklopft.
SCHEMES = ("fv1", "acceleration")
