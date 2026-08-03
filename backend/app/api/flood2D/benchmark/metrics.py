#!/usr/bin/env python3
"""
metrics.py — Fehlermasse fuer den Vergleich Simulation vs. Referenz.

Bewusst abhaengigkeitsfrei (nur stdlib), damit die Benchmarks ueberall laufen,
wo auch der Handler laeuft — kein numpy/scipy noetig.

Unterschied zur bestehenden Testsuite: die Regressionstests unter engines/docker/
pruefen, ob der Code tut was er soll. Diese Metriken pruefen, ob das ERGEBNIS
stimmt — gegen eine analytische Loesung oder Messdaten. Das ist die Groesse, die
darueber entscheidet, ob man den Zahlen glauben darf.
"""
import math


def _pairs(sim, ref):
    """Nur Paare, in denen beide Werte endlich sind."""
    return [(s, r) for s, r in zip(sim, ref)
            if math.isfinite(s) and math.isfinite(r)]


def rmse(sim, ref):
    """Wurzel der mittleren quadratischen Abweichung (Einheit wie die Daten)."""
    p = _pairs(sim, ref)
    if not p:
        return float("nan")
    return math.sqrt(sum((s - r) ** 2 for s, r in p) / len(p))


def mae(sim, ref):
    """Mittlerer Absolutfehler — robuster gegen einzelne Ausreisser als RMSE."""
    p = _pairs(sim, ref)
    if not p:
        return float("nan")
    return sum(abs(s - r) for s, r in p) / len(p)


def max_abs_error(sim, ref):
    """Groesste Einzelabweichung — zeigt lokale Defekte, die RMSE wegmittelt."""
    p = _pairs(sim, ref)
    if not p:
        return float("nan")
    return max(abs(s - r) for s, r in p)


def nash_sutcliffe(sim, ref):
    """
    NSE: 1.0 = perfekt, 0.0 = nicht besser als der Mittelwert der Referenz,
    < 0 = schlechter als der Mittelwert. In der Hydrologie das uebliche Guetemass.

    Undefiniert (nan) bei (nahezu) konstanter Referenz — dann ist der Nenner
    die Varianz einer Konstanten. Der Vergleich gegen "exakt 0" reicht dafuer
    nicht: bei einem konstanten Sollwert bleibt numerisches Rauschen stehen und
    liefert absurde Werte (gemessen: -6.7e26). Deshalb relative Schranke.
    """
    p = _pairs(sim, ref)
    if len(p) < 2:
        return float("nan")
    mean_ref = sum(r for _, r in p) / len(p)
    denom = sum((r - mean_ref) ** 2 for _, r in p)
    scale = len(p) * (mean_ref ** 2 + 1e-30)
    if denom <= 1e-12 * scale:
        return float("nan")
    return 1.0 - sum((s - r) ** 2 for s, r in p) / denom


def wet_front(xs, depths, threshold):
    """
    Position der Benetzungsfront: groesstes x mit Tiefe >= threshold.

    Der Schwellwert ist noetig, weil numerische Schemata eine duenne
    Wasserhaut vorauslaufen lassen; ohne ihn misst man Rundungsrauschen.
    Gibt None zurueck, wenn nirgends Wasser ueber der Schwelle steht.
    """
    wet = [x for x, h in zip(xs, depths)
           if math.isfinite(h) and h >= threshold]
    return max(wet) if wet else None


def f_statistic(sim, ref, threshold):
    """
    Uebereinstimmung der Ueberflutungsflaeche (Critical Success Index):

        F = |A_sim ∩ A_ref| / |A_sim ∪ A_ref|

    1.0 = deckungsgleich, 0.0 = kein gemeinsames nasses Feld. Das Standardmass,
    um simulierte gegen beobachtete Ueberflutungsgrenzen zu vergleichen — wird
    fuer die spaeteren Realfaelle (P1.2, Schritt 5) gebraucht.
    """
    inter = union = 0
    for s, r in zip(sim, ref):
        s_wet = math.isfinite(s) and s >= threshold
        r_wet = math.isfinite(r) and r >= threshold
        if s_wet and r_wet:
            inter += 1
        if s_wet or r_wet:
            union += 1
    if union == 0:
        return float("nan")
    return inter / union


# Die Frontlage haengt stark davon ab, ab welcher Tiefe man "nass" nennt: der
# analytische Dammbruch-Auslauf ist ein extrem duenner Keil, den jedes Verfahren
# 1. Ordnung wegdiffundiert. Deshalb wird die Front bei MEHREREN Schwellen
# gemessen — eine einzelne Zahl waere hier irrefuehrend.
FRONT_THRESHOLDS = (0.20, 0.05, 0.01)


def summarize(sim, ref, xs=None, threshold=0.01):
    """Alle Profilmetriken auf einmal — das, was in report.json landet."""
    out = {
        "n": len(_pairs(sim, ref)),
        "rmse": rmse(sim, ref),
        "mae": mae(sim, ref),
        "max_abs_error": max_abs_error(sim, ref),
        "nse": nash_sutcliffe(sim, ref),
        "f_statistic": f_statistic(sim, ref, threshold),
    }
    if xs is not None:
        fronts = {}
        for th in FRONT_THRESHOLDS:
            fs = wet_front(xs, sim, th)
            fr = wet_front(xs, ref, th)
            fronts[f"{th:g}"] = {
                "sim_m": fs,
                "ref_m": fr,
                "error_m": (fs - fr) if (fs is not None and fr is not None) else None,
            }
        out["fronts"] = fronts
        main = fronts[f"{threshold:g}"] if f"{threshold:g}" in fronts else {}
        out["front_sim_m"] = main.get("sim_m")
        out["front_ref_m"] = main.get("ref_m")
        out["front_error_m"] = main.get("error_m")
    return out
