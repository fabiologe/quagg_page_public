#!/usr/bin/env python3
"""
Fall 2 — Gleichfoermiger Abfluss im SGC-Rechteckgerinne (Manning-Normalwassertiefe).

Warum dieser Fall: Er trifft den Pfad, den die App TATSAECHLICH exportiert —
ein Sub-Grid-Gerinne (SGC) mit Rechteckquerschnitt. Waehrend der Ritter-Fall den
nackten Flachwasserkern prueft, prueft dieser die Gerinnehydraulik: Reibung,
hydraulischer Radius, stationaerer Zustand.

Referenzloesung — verifiziert am Solver-Quelltext, nicht angenommen:

1. sgc.cpp:869 rechnet den Kanalfluss mit der TRAEGHEITSGLEICHUNG
       Q_neu = (Q - g*A*dt*Sf) / (1 + dt*g*cn*|Q| / (R^(4/3)*A))
   Im stationaeren Zustand (Q_neu = Q) faellt das exakt auf Manning zusammen:
       Q*|Q| = A^2 * S * R^(4/3) / n^2     ->    Q = (1/n) * A * R^(2/3) * S^(1/2)
   (cn ist bereits n^2 — sgc.cpp:396 quadriert SGCn beim Einlesen.)

2. CalcSGC_R, case 1 (Rechteck) liefert den VOLLEN hydraulischen Radius
       R = A / (w + 2h)
   also den benetzten Umfang inkl. beider Waende — nicht die Breitgerinne-
   Naeherung R ≈ h. Die Referenz ist damit die Lehrbuch-Normalwassertiefe.

3. Der Maeanderkoeffizient m geht als S = dh/(dx*m) ein; mit m = 1 (in
   chanprams gesetzt) ist S die reine Sohlneigung.

Ausgelesen wird `.wd`: bei eingeschaltetem SGC steht dort Arrptr->H, und das ist
die Tiefe UEBER DER KANALSOHLE (output.cpp:692 addiert fuer `.elev` genau diese
H auf SGCz). Also direkt das h aus Manning.

Bekannte Vereinfachung: SGC erzwingt `acceleration` (pars.cpp:730) — ein anderes
Schema ist hier gar nicht waehlbar.
"""
import math

G = 9.81

NAME = "manning_normalflow"
TITLE = "Manning-Normalabfluss im SGC-Rechteckgerinne"

# ── Geometrie/Physik ─────────────────────────────────────────────────────────
DOMAIN_LENGTH = 2000.0     # m
NROWS = 5
CH_ROW = 2                 # Kanalzeile (file row, top-down) = Mitte
CELLSIZE = 10.0
SLOPE = 0.001              # Sohlneigung
WIDTH = 5.0                # Gerinnebreite (SGCwidth)
MANNING_N = 0.030          # SGCn
Q_IN = 10.0                # m3/s Zufluss am Oberwasser
BANKFULL = 4.0             # Kanaltiefe bis Bordvoll (muss > h_n sein)
Z_TOP = 10.0               # Sohlhoehe am Oberwasserrand
FLOODPLAIN_FREEBOARD = 5.0 # Vorland ueber Bordvoll — hier soll nichts hin

T_END = 14400.0            # 4 h: Fuellzeit (~1800 s) + Einschwingen
SAVEINT = 1200.0

WET_THRESHOLD = 0.01

# Gleichgewichtsfall: das Ergebnis gilt nur, wenn der Lauf eingeschwungen ist.
STEADY_STATE = True

# Auswertefenster: mittleres Drittel. Am Zulauf und am freien Auslauf weicht die
# Wasserspiegellage systematisch ab (Stau- bzw. Senkungskurve) — das ist Physik,
# nicht Fehler, gehoert aber nicht in den Normalabfluss-Vergleich.
EVAL_FROM, EVAL_TO = 0.30, 0.75

# Fuer diesen Fall interessant: die Normalwassertiefe ist ein LOKALES
# Kraeftegleichgewicht und sollte praktisch nicht von der Zellweite abhaengen.
# Tut sie es doch, ist das ein Befund.
CONVERGENCE_CELLSIZES = (40.0, 20.0, 10.0, 5.0)

SCHEMES = ("acceleration",)   # SGC laesst nichts anderes zu (pars.cpp:730)


def ncols_for(cellsize=CELLSIZE):
    return int(round(DOMAIN_LENGTH / cellsize))


def cell_x(col, cellsize=CELLSIZE):
    return (col + 0.5) * cellsize


def bed_z(x):
    """Sohlhoehe: faellt mit SLOPE nach Osten."""
    return Z_TOP - SLOPE * x


def manning_Q(h, w=WIDTH, n=MANNING_N, s=SLOPE):
    """Abfluss im Rechteckgerinne bei Tiefe h (voller hydraulischer Radius)."""
    if h <= 0:
        return 0.0
    a = w * h
    r = a / (w + 2 * h)
    return a * r ** (2 / 3) * math.sqrt(s) / n


def normal_depth(q=Q_IN, w=WIDTH, n=MANNING_N, s=SLOPE):
    """
    Normalwassertiefe: loest Manning nach h. Bisektion statt Newton — die
    Funktion ist monoton in h, damit ist Bisektion robust und ohne Startwert.
    """
    lo, hi = 1e-6, 100.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, w, n, s) < q:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


H_NORMAL = normal_depth()


def reference_profile(cellsize=CELLSIZE):
    """Analytisch ist die Normalwassertiefe entlang des Gerinnes konstant."""
    return [H_NORMAL] * ncols_for(cellsize)


def x_axis(cellsize=CELLSIZE):
    return [cell_x(c, cellsize) for c in range(ncols_for(cellsize))]


def active_mask(cellsize=CELLSIZE):
    return [EVAL_FROM * DOMAIN_LENGTH <= cell_x(c, cellsize) <= EVAL_TO * DOMAIN_LENGTH
            for c in range(ncols_for(cellsize))]


def sim_row(rows):
    """
    Aus dem Ergebnisraster die Kanalzeile ziehen.

    Wird von run_benchmark bevorzugt gegenueber der Mittelzeile benutzt: bei
    einem Gerinne liegt das Wasser NUR in der Kanalzeile, eine Vorlandzeile
    waere durchgehend trocken.
    """
    return rows[CH_ROW]


def write_scenario(inp, scheme="acceleration", cellsize=CELLSIZE):
    ncols = ncols_for(cellsize)
    header = (f"ncols {ncols}\nnrows {NROWS}\nxllcorner 0\nyllcorner 0\n"
              f"cellsize {cellsize:g}\nNODATA_value -9999\n")

    def write_asc(path, rows):
        path.write_text(header + "\n".join(
            " ".join(f"{v:.4f}" for v in row) for row in rows) + "\n")

    bank_z = [bed_z(cell_x(c, cellsize)) + BANKFULL for c in range(ncols)]

    # DEM: Kanalzeile auf Bordvollhoehe, Vorland deutlich darueber. Damit bleibt
    # der Abfluss im Gerinne und der Vergleich misst reine Gerinnehydraulik.
    dem = []
    for r in range(NROWS):
        if r == CH_ROW:
            dem.append(list(bank_z))
        else:
            dem.append([z + FLOODPLAIN_FREEBOARD for z in bank_z])
    write_asc(inp / "terrain.asc", dem)

    width_rows, bed_rows, bank_rows, group_rows = [], [], [], []
    for r in range(NROWS):
        if r == CH_ROW:
            width_rows.append([WIDTH] * ncols)
            bed_rows.append([bed_z(cell_x(c, cellsize)) for c in range(ncols)])
            bank_rows.append(list(bank_z))
            group_rows.append([0] * ncols)
        else:
            width_rows.append([0.0] * ncols)
            bed_rows.append([-9999.0] * ncols)
            bank_rows.append([-9999.0] * ncols)
            group_rows.append([-1] * ncols)
    write_asc(inp / "sgc.width.asc", width_rows)
    write_asc(inp / "sgc.bed.asc", bed_rows)
    write_asc(inp / "sgc.bank.asc", bank_rows)
    write_asc(inp / "sgc.group.asc", group_rows)

    # chanprams: num type p r s n m a  (input.cpp:2360)
    # Typ 1 = Rechteck; p/r/s sind Exponentialgerinne-Parameter und hier ohne
    # Wirkung. m = 1 -> keine Maeanderkorrektur, S ist die reine Sohlneigung.
    (inp / "sgc.chanprams.txt").write_text(
        f"1\n0 1 0.78 0.12 1.5 {MANNING_N:.4f} 1 -1\n")

    # Kanal-Weltkoordinate y (yllcorner = 0, Zeile 0 ist oben)
    ch_y = (NROWS - 1 - CH_ROW + 0.5) * cellsize

    # ACHTUNG Einheit: QFIX einer Punktquelle ist auf einem projizierten Gitter
    # in m^2/s und wird vom Solver mit dx multipliziert
    # (sgc.cpp:1059  "if (Statesptr->latlong == OFF) Q_multiplier = Parptr->dx;"
    #  sgc.cpp:1075  "dV = PS_Val * Q_multiplier * Tstep").
    # Wer hier m^3/s hinschreibt, speist um den Faktor Zellweite zu viel ein —
    # beim ersten Lauf dieses Falls kamen so 100 statt 10 m^3/s heraus.
    q_per_width = Q_IN / cellsize

    # Unterwasserrand auf die Normalwasserspiegellage statt FREE.
    #
    # Grund (gemessen, nicht vermutet): mit freiem Auslauf stellt sich eine
    # Senkungskurve ein, die bei stroemendem Abfluss (Fr ≈ 0.26) weit stromauf
    # wirkt — Laengenskala h/S0 ≈ 1800 m, also ueber das ganze Gebiet. Der erste
    # Lauf zeigte einen monotonen Abfall von 1.808 m am Zulauf auf 1.095 m am
    # Auslauf; ein Normalabflussvergleich war darin gar nicht enthalten.
    #
    # Das macht den Test NICHT zirkulaer: vorgegeben ist nur der Wasserstand am
    # letzten Querschnitt. Ob der Solver daraus ueber 2 km GLEICHFOERMIGEN
    # Abfluss macht, entscheidet allein sein Reibungsansatz. Weicht seine
    # Konveyanz von der Handrechnung ab, kippt der Wasserspiegel gegen die
    # Sohle — genau das misst die Prueffgroesse "Profilneigung".
    h_bc = bed_z(DOMAIN_LENGTH) + H_NORMAL

    (inp / "flow.bci").write_text(
        f"P {cell_x(0, cellsize):.2f} {ch_y:.2f} QFIX {q_per_width:.6f}\n"
        f"E 0 {NROWS * cellsize:g} HFIX {h_bc:.4f}\n"
    )

    (inp / "run.par").write_text(
        "DEMfile terrain.asc\nresroot res\ndirroot results\n"
        f"sim_time {T_END:g}\ninitial_tstep 1\nsaveint {SAVEINT:g}\nmassint 60\n"
        "fpfric 0.030\nbcifile flow.bci\nacceleration\n"
        "SGCwidth sgc.width.asc\nSGCbed sgc.bed.asc\nSGCbank sgc.bank.asc\n"
        "SGCchangroup sgc.group.asc\nSGCchanprams sgc.chanprams.txt\n"
        f"SGCn {MANNING_N:.4f}\n"
    )
