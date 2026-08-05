"""
evaluate — Nachweisgrößen und Bewertung (Spez. Kap. 2 und 4.3).

Eingang: normalisierte Zwischendatei + casespec. Ausgang: das Ergebnis-Dict,
das render unverändert als Ergebnis-JSON schreibt. Zeitintegrale werden über
die tatsächlichen Zeitschritte gebildet (Trapezregel auf der nativen
Zeitachse), nicht als einfache Summe.

Bewertungsvokabular je Target:
    erfuellt / nicht_erfuellt   Kennwert gegen Grenzwert geprüft
    informativ                  kein Grenzwert angesetzt, Wert wird dokumentiert
    nicht_auswertbar            benötigte Zeitreihe fehlt im Lauf
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .casespec import CaseSpec
from .conventions import UNITS, Quantity
from .normalize import get_series


def _extreme(t: np.ndarray, v: np.ndarray) -> tuple[float, float]:
    """Betragsmaximum mit Vorzeichen und Auftretenszeitpunkt."""
    i = int(np.argmax(np.abs(v)))
    return float(v[i]), float(t[i])


def _integral(t: np.ndarray, v: np.ndarray) -> float:
    return float(np.trapezoid(np.abs(v), t)) if len(t) > 1 else 0.0


def _verdict(value: float, limit_max: float | None, limit_min: float | None,
             ) -> tuple[str, float | None]:
    if limit_max is not None:
        return ("erfuellt" if value <= limit_max else "nicht_erfuellt",
                value / limit_max if limit_max else None)
    if limit_min is not None:
        return ("erfuellt" if value >= limit_min else "nicht_erfuellt",
                limit_min / value if value else None)
    return "informativ", None


# --------------------------------------------------------------------------
# Targets
# --------------------------------------------------------------------------

def _eval_target(df: pd.DataFrame, target) -> dict:
    out: dict = {"id": target.id, "kind": target.kind}
    # Ortsbezug ins Ergebnis echoen, damit Viewer und Bericht Grenzwerte dem
    # Pegel/Querschnitt zuordnen können, ohne die casespec zu laden.
    for ref in ("at", "of", "to", "region", "upstream", "downstream"):
        if hasattr(target, ref):
            out[ref] = getattr(target, ref)

    def missing(msg: str) -> dict:
        out.update(result="nicht_auswertbar", message=msg)
        return out

    if target.kind == "max_level":
        t, v = get_series(df, Quantity.LEVEL, target.at)
        if not len(t):
            return missing(f"Keine Wasserspiegelreihe am Pegelpunkt {target.at}")
        value, t_occ = float(v.max()), float(t[int(np.argmax(v))])
        result, util = _verdict(value, target.limit_max, None)
        out.update(value=value, unit=UNITS[Quantity.LEVEL], time_of_occurrence=t_occ,
                   limit_max=target.limit_max, result=result, utilisation=util)

    elif target.kind == "discharge_ratio":
        t1, v1 = get_series(df, Quantity.DISCHARGE, target.of)
        t2, v2 = get_series(df, Quantity.DISCHARGE, target.to)
        if len(t1) < 2 or len(t2) < 2:
            return missing(f"Durchflussreihe fehlt an {target.of} oder {target.to}")
        vol_of, vol_to = _integral(t1, v1), _integral(t2, v2)
        if vol_to == 0.0:
            return missing(f"Bezugsquerschnitt {target.to} ohne Durchfluss")
        value = vol_of / vol_to  # Volumenverhältnis über die gesamte Laufzeit
        result, util = _verdict(value, target.limit_max, target.limit_min)
        out.update(value=value, unit="-", volume_of=vol_of, volume_to=vol_to,
                   limit_max=target.limit_max, limit_min=target.limit_min,
                   result=result, utilisation=util)

    elif target.kind == "max_force":
        comp = target.component
        t, v = get_series(df, Quantity.FORCE, target.at, comp)
        if not len(t):
            return missing(f"Keine Kraftreihe am Bauteil {target.at} ({comp})")
        value, t_occ = _extreme(t, v)
        result, util = _verdict(abs(value), target.limit_max, None)
        out.update(value=value, unit=UNITS[Quantity.FORCE], component=comp,
                   time_of_occurrence=t_occ, limit_max=target.limit_max,
                   result=result, utilisation=util)

    elif target.kind == "min_bed_shear":
        t, v = get_series(df, Quantity.BED_SHEAR, target.region)
        if not len(t):
            return missing(f"Keine Sohlschubspannungsreihe für Region {target.region}")
        value, t_occ = float(v.min()), float(t[int(np.argmin(v))])
        result, util = _verdict(value, None, target.limit_min)
        out.update(value=value, unit=UNITS[Quantity.BED_SHEAR],
                   time_of_occurrence=t_occ, limit_min=target.limit_min,
                   result=result, utilisation=util)

    elif target.kind == "max_bed_shear":
        t, v = get_series(df, Quantity.BED_SHEAR, target.region, "max")
        if not len(t):
            return missing(f"Keine Sohlschubspannungsreihe für Region {target.region}")
        value, t_occ = float(v.max()), float(t[int(np.argmax(v))])
        result, util = _verdict(value, target.limit_max, None)
        out.update(value=value, unit=UNITS[Quantity.BED_SHEAR],
                   time_of_occurrence=t_occ, limit_max=target.limit_max,
                   result=result, utilisation=util)

    elif target.kind == "overfall_cd":
        t, v = get_series(df, Quantity.OVERFALL_CD, target.weir)
        if not len(t):
            return missing(f"Keine Überfallbeiwert-Reihe für Wehr {target.weir} "
                           "— Querschnitts- oder Pegelreihe fehlt, oder die "
                           "Krone war nie überströmt")
        value = float(np.median(v))
        if target.limit_max is None and target.limit_min is None:
            out.update(value=value, unit="-", result="informativ",
                       n_samples=int(len(v)))
        else:
            result, util = _verdict(value, target.limit_max, target.limit_min)
            out.update(value=value, unit="-", limit_max=target.limit_max,
                       limit_min=target.limit_min, result=result,
                       utilisation=util, n_samples=int(len(v)))

    elif target.kind == "head_difference":
        t1, v1 = get_series(df, Quantity.ENERGY_HEAD, target.upstream)
        t2, v2 = get_series(df, Quantity.ENERGY_HEAD, target.downstream)
        if not len(t1) or not len(t2):
            return missing("Energiehöhenreihen fehlen — Felder wurden für "
                           "diesen Lauf nicht konvertiert")
        grid = np.union1d(t1, t2)
        dh = np.interp(grid, t1, v1) - np.interp(grid, t2, v2)
        value, t_occ = _extreme(grid, dh)
        result, util = _verdict(abs(value), target.limit_max, None)
        out.update(value=value, unit="m", time_of_occurrence=t_occ,
                   limit_max=target.limit_max, result=result, utilisation=util)

    return out


# --------------------------------------------------------------------------
# Extremwerttabelle
# --------------------------------------------------------------------------

_EXTREME_SET = {
    (Quantity.LEVEL.value, ""), (Quantity.DISCHARGE.value, ""),
    (Quantity.VOLUME.value, ""), (Quantity.FORCE.value, "magnitude"),
    (Quantity.MOMENT.value, "magnitude"), (Quantity.BED_SHEAR.value, ""),
    (Quantity.BED_SHEAR.value, "max"),
}


def _extremes(df: pd.DataFrame) -> list[dict]:
    out = []
    keys = df[["quantity", "location_id", "component"]].drop_duplicates()
    for _, k in keys.iterrows():
        if (k["quantity"], k["component"]) not in _EXTREME_SET:
            continue
        t, v = get_series(df, k["quantity"], k["location_id"], k["component"])
        if not len(t):
            continue
        # stat benennt, WAS der Extremwert ist — Nachweistabelle und
        # Extremwerttabelle nutzen sonst stillschweigend verschiedene Werte
        if k["quantity"] == Quantity.BED_SHEAR.value and k["component"] == "":
            value, t_occ = float(v.min()), float(t[int(np.argmin(v))])
            stat = "min"
        elif k["quantity"] in (Quantity.LEVEL.value, Quantity.VOLUME.value) \
                or k["component"] == "max":
            value, t_occ = float(v.max()), float(t[int(np.argmax(v))])
            stat = "max"
        else:
            value, t_occ = _extreme(t, v)
            stat = "betrag_max"
        out.append({"location_id": k["location_id"], "quantity": k["quantity"],
                    "component": k["component"], "value": value, "stat": stat,
                    "unit": UNITS[Quantity(k["quantity"])],
                    "time_of_occurrence": t_occ})
    return sorted(out, key=lambda e: (e["quantity"], e["location_id"], e["component"]))


# --------------------------------------------------------------------------
# Abgeleitete Reihen — entstehen VOR write_normalized im Runner
# --------------------------------------------------------------------------

def overfall_cd_rows(df: pd.DataFrame, spec: CaseSpec, run_id: str) -> list[dict]:
    """
    Überfallbeiwert-Zeitreihe je Wehr: C_d = Q / (2/3·√(2g)·b·h^1.5) mit
    h = Oberwasserstand − mittlere Kronenhöhe, b = Kronenlänge. Nur
    Zeitpunkte mit nennenswerter Überströmung (h > 2 cm, Q > 0).
    """
    rows: list[dict] = []
    for tg in spec.evaluation.targets:
        if tg.kind != "overfall_cd":
            continue
        weir = next((s for s in spec.structures
                     if s.id == tg.weir and s.type == "weir"), None)
        if weir is None:
            continue
        crest = float(np.mean([p[2] for p in weir.crest_polyline]))
        pts = np.asarray([(p[0], p[1]) for p in weir.crest_polyline], float)
        b = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
        tq, q = get_series(df, Quantity.DISCHARGE, tg.section)
        tl, lv = get_series(df, Quantity.LEVEL, tg.gauge)
        if len(tq) < 2 or len(tl) < 2 or b <= 0:
            continue
        grid = np.union1d(tq, tl)
        qi = np.interp(grid, tq, q)
        h = np.interp(grid, tl, lv) - crest
        ok = (h > 0.02) & (np.abs(qi) > 1e-6)
        cd = np.abs(qi[ok]) / ((2.0 / 3.0) * np.sqrt(2 * 9.81) * b * h[ok] ** 1.5)
        for t, v in zip(grid[ok], cd):
            rows.append({"run_id": run_id, "time": float(t),
                         "quantity": Quantity.OVERFALL_CD.value,
                         "location_id": tg.weir, "component": "",
                         "value": float(v), "unit": UNITS[Quantity.OVERFALL_CD],
                         "source": "abgeleitet/ueberfall"})
    return rows


# --------------------------------------------------------------------------
# Qualitätsblock — beantwortet, ob der Lauf verwertbar ist (Spez. Kap. 8)
# --------------------------------------------------------------------------

def _quality(df: pd.DataFrame, manifest: dict | None) -> dict:
    q: dict = {}

    _, vol = get_series(df, Quantity.VOLUME, "domain")
    _, cont = get_series(df, Quantity.CONTINUITY, "solver")
    if len(cont) and len(vol) and vol.max() > 0:
        q["mass_balance_error_rel_max"] = float(np.abs(cont).max() / vol.max())

    for comp in ("final", "initial"):
        _, res = get_series(df, Quantity.RESIDUAL, "p_rgh", comp)
        if len(res):
            q[f"residual_p_rgh_{comp}"] = float(res[-1])
            break

    _, co_mean = get_series(df, Quantity.COURANT, "solver", "mean")
    _, co_max = get_series(df, Quantity.COURANT, "solver", "max")
    if len(co_mean):
        q["courant_mean"] = float(co_mean.mean())
    if len(co_max):
        q["courant_max"] = float(co_max.max())

    if manifest:
        q["checkmesh_ok"] = manifest.get("checkmesh_ok")
        if manifest.get("y_plus_range"):
            q["y_plus_range"] = manifest["y_plus_range"]
    return q


# --------------------------------------------------------------------------
# Gesamtauswertung
# --------------------------------------------------------------------------

def evaluate_run(df: pd.DataFrame, spec: CaseSpec, run_id: str,
                 manifest: dict | None = None) -> dict:
    return {
        "run_id": run_id,
        "case_hash": spec.case_hash(),
        "status": (manifest or {}).get("status", "completed"),
        "nachweis": spec.meta.nachweis.model_dump(),
        "crs_epsg": spec.meta.crs.epsg if spec.meta.crs else None,
        "quality": _quality(df, manifest),
        "targets": [_eval_target(df, t) for t in spec.evaluation.targets],
        "extremes": _extremes(df),
        "figures": [],
    }
