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

def _eval_target(df: pd.DataFrame, target, spec: CaseSpec = None) -> dict:
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

    elif target.kind == "massenbilanz":
        # |dV/dt| am Ende, bezogen auf den Zufluss — die 2 %/10 %-Ampel des
        # Bilanzpanels als benanntes, prüfbares Kriterium
        kw = kennwerte(df, spec) if spec is not None else {}
        anteil = (kw.get("bilanz") or {}).get("anteil")
        if anteil is None:
            return missing("Ohne Volumenreihe und Zufluss keine Bilanz.")
        out["value"] = anteil
        out["unit"] = "-"
        out["result"], out["utilisation"] = _verdict(
            anteil, target.limit_max, None)

    elif target.kind == "kurzschluss":
        # t10/τ aus der Tracer-Durchbruchskurve — größer ist besser
        kw = kennwerte(df, spec) if spec is not None else {}
        wert = (kw.get("verweilzeit") or {}).get("kurzschluss")
        if wert is None:
            return missing("Ohne Tracer-Durchbruch (Verweilzeit mitrechnen) "
                           "keine Kurzschlusskennzahl.")
        out["value"] = wert
        out["unit"] = "-"
        out["result"], out["utilisation"] = _verdict(
            wert, None, target.limit_min)

    elif target.kind == "verweilzeit_min":
        kw = kennwerte(df, spec) if spec is not None else {}
        wert = (kw.get("verweilzeit") or {}).get("t50")
        if wert is None:
            return missing("Ohne Tracer-Durchbruch keine Verweilzeit t50.")
        out["value"] = round(wert, 1)
        out["unit"] = "s"
        out["result"], out["utilisation"] = _verdict(
            wert, None, target.limit_min)

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
    # Wehr/Querschnitt/Pegel-Tripel: aus den Kriterien — und, von der
    # Target-Kopplung gelöst (Audit U12, Plan-Befund L2), zusätzlich für
    # jedes NICHT abgedeckte Wehr, sofern der Fall genau EINEN Querschnitt
    # und EINEN Pegel hat (dann ist die Zuordnung eindeutig; bei mehreren
    # bleibt sie eine fachliche Entscheidung über ein Kriterium).
    paare = [(tg.weir, tg.section, tg.gauge)
             for tg in spec.evaluation.targets if tg.kind == "overfall_cd"]
    abgedeckt = {w for w, _, _ in paare}
    if (len(spec.evaluation.sections) == 1
            and len(spec.evaluation.gauges) == 1):
        for s in spec.structures:
            if s.type == "weir" and s.id not in abgedeckt:
                paare.append((s.id, spec.evaluation.sections[0].id,
                              spec.evaluation.gauges[0].id))
    for weir_id, section_id, gauge_id in paare:
        weir = next((s for s in spec.structures
                     if s.id == weir_id and s.type == "weir"), None)
        if weir is None:
            continue
        crest = float(np.mean([p[2] for p in weir.crest_polyline]))
        pts = np.asarray([(p[0], p[1]) for p in weir.crest_polyline], float)
        b = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
        tq, q = get_series(df, Quantity.DISCHARGE, section_id)
        tl, lv = get_series(df, Quantity.LEVEL, gauge_id)
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
                         "location_id": weir_id, "component": "",
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

# --------------------------------------------------------------------------
# Kennwerte (Stufe C2): die Größen, die bisher NUR im Browser gerechnet
# wurden (BilanzPanel, VerweilzeitPanel, BauwerkePanel) — jetzt einmal
# serverseitig, in result.json, und damit an Nachweise bindbar und im
# Bericht zitierfähig. Formeln 1:1 aus den Panels übernommen.
# --------------------------------------------------------------------------

def _zeit_bei(t: np.ndarray, v: np.ndarray, f: float) -> float | None:
    """Erster Zeitpunkt, an dem die Kurve den Anteil f überschreitet
    (linear interpoliert, damit t50 nicht aufs Schreibintervall rundet)."""
    for i in range(len(v)):
        if v[i] >= f:
            if i == 0:
                return float(t[0])
            d = v[i] - v[i - 1]
            a = (f - v[i - 1]) / d if d > 1e-12 else 0.0
            return float(t[i - 1] + (t[i] - t[i - 1]) * a)
    return None


def _steigung(t: np.ndarray, v: np.ndarray, anteil: float = 0.25) -> float | None:
    """Steigung über das letzte Stück der Zeitachse (wie im BilanzPanel)."""
    if len(t) < 3:
        return None
    t_ende = t[-1]
    t_start = t_ende - (t_ende - t[0]) * anteil
    i0 = int(np.searchsorted(t, t_start))
    dt = t_ende - t[i0]
    if not dt > 0:
        return None
    return float((v[-1] - v[i0]) / dt)


def _beharrung_ab(t: np.ndarray, q: np.ndarray,
                  toleranz: float = 0.02) -> float | None:
    """Erster Zeitpunkt, ab dem der Ablauf im Toleranzband des Endwerts
    bleibt — und danach nicht wieder ausbricht. Ein Treffer im letzten
    Zehntel zählt nicht (das ist der Endpunkt, keine Beharrung)."""
    if len(t) < 10:
        return None
    q_ende = q[-1]
    if not abs(q_ende) > 1e-9:
        return None
    abweichung = np.abs(q - q_ende) / abs(q_ende)
    ok = abweichung <= toleranz
    # von hinten: längster stabiler Schwanz
    if not ok[-1]:
        return None
    i = len(ok) - 1
    while i > 0 and ok[i - 1]:
        i -= 1
    spaet = t[0] + (t[-1] - t[0]) * 0.9
    return float(t[i]) if t[i] < spaet else None


def _zufluss(spec: CaseSpec) -> float:
    return sum(float(b.q or 0.0) for b in spec.boundaries
               if b.type == "inflow_constant")


def _zufluss_reihe(df: pd.DataFrame, spec: CaseSpec,
                   t: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """
    Zufluss als Zeitreihe auf der Volumen-Zeitachse. Konstante Zuflüsse aus
    der Vorgabe; Hydrographen aus den GEMESSENEN patchflow-Reihen des Laufs
    (positiv = verlässt das Gebiet, Zufluss zählt daher negativ). Vorher
    zählte nur inflow_constant — bei einem Hydrographen war der Zufluss 0
    und massenbilanz/verweilzeit fielen still auf nicht_auswertbar.
    Zweiter Rückgabewert: Hydrograph-Patches ohne Messreihe.
    """
    reihe = np.full(len(t), _zufluss(spec))
    fehlt: list[str] = []
    for b in spec.boundaries:
        if b.type != "inflow_hydrograph":
            continue
        tq, vq = get_series(df, Quantity.DISCHARGE, b.patch)
        if len(tq):
            reihe = reihe + np.interp(t, tq, -np.asarray(vq, dtype=float))
        else:
            fehlt.append(b.patch)
    return reihe, fehlt


def kennwerte(df: pd.DataFrame, spec: CaseSpec) -> dict:
    out: dict = {}

    # ---- Bilanz: Speicheränderung, Beharrung, Austausch ------------------
    t, vol = get_series(df, Quantity.VOLUME, "domain")
    zu = _zufluss(spec)
    if len(t) >= 3:
        zu_reihe, zu_fehlt = _zufluss_reihe(df, spec, t)
        # massgeblicher Zufluss: Mittel über dasselbe End-Viertel wie die
        # Speicheränderungs-Sekante — bei konstantem Zufluss exakt die
        # Vorgabe, beim Hydrographen der gemessene Endzustand
        i0 = int(np.searchsorted(t, t[-1] - (t[-1] - t[0]) * 0.25))
        zu = float(np.mean(zu_reihe[i0:])) if len(zu_reihe) else zu
        dv = _steigung(t, vol) or 0.0
        # Ablaufreihe aus der Bilanz (Zufluss − gleitende Speicheränderung)
        dv_reihe = np.zeros(len(t))
        for i in range(len(t)):
            i0 = max(0, i - 5)
            dt = t[i] - t[i0]
            dv_reihe[i] = (vol[i] - vol[i0]) / dt if dt > 0 else 0.0
        q_ab = np.maximum(zu_reihe - dv_reihe, 0.0)
        dauer = float(t[-1])
        volumen = float(vol[-1])
        bilanz = {
            "zufluss": round(zu, 4),
            "speicheraenderung": round(dv, 4),
            "ablauf_aus_bilanz": round(max(zu - dv, 0.0), 4),
            "anteil": round(abs(dv) / zu, 4) if zu > 0 else None,
            "beharrung_ab": _beharrung_ab(t, q_ab),
            "austausch": (round(zu * dauer / volumen, 3)
                          if volumen > 0 and zu > 0 else None),
        }
        if zu_fehlt:
            # Hydrograph ohne patchflow-Messreihe: Bilanz gilt nur teilweise
            bilanz["zufluss_unvollstaendig"] = zu_fehlt
        out["bilanz"] = bilanz

    # ---- Verweilzeit: τ, t10/t50/t90, Kurzschlusskennzahl ----------------
    tracer_orte = sorted(df.loc[df["quantity"] == Quantity.TRACER,
                                "location_id"].unique())
    if tracer_orte and len(t) and zu > 0:
        tt, tv = get_series(df, Quantity.TRACER, tracer_orte[0])
        vol_mittel = float(np.mean(vol)) if len(vol) else 0.0
        tau = vol_mittel / zu if zu > 0 else None
        t10 = _zeit_bei(tt, tv, 0.1)
        out["verweilzeit"] = {
            "ablauf": tracer_orte[0],
            "tau": round(tau, 2) if tau else None,
            "t_an": _zeit_bei(tt, tv, 0.01),
            "t10": t10,
            "t50": _zeit_bei(tt, tv, 0.5),
            "t90": _zeit_bei(tt, tv, 0.9),
            "kurzschluss": (round(t10 / tau, 3)
                            if t10 is not None and tau else None),
            "ausgelaufen": bool(len(tv) and tv[-1] >= 0.85),
        }

    # ---- Bauwerke: Hebelarm der Resultierenden ---------------------------
    for patch in spec.evaluation.force_patches:
        _, fx = get_series(df, Quantity.FORCE, patch, "x")
        _, fy = get_series(df, Quantity.FORCE, patch, "y")
        _, mm = get_series(df, Quantity.MOMENT, patch, "magnitude")
        if not (len(fx) and len(fy) and len(mm)):
            continue
        fh = float(np.hypot(fx[-1], fy[-1]))
        if fh > 1e-6:
            out.setdefault("bauwerke", {})[patch] = {
                "horizontalkraft": round(fh, 1),
                "kippmoment": round(float(mm[-1]), 1),
                "hebelarm": round(float(mm[-1]) / fh, 3),
            }
    return out


BEFUND_YPLUS_MAX = 500.0
BEFUND_COURANT_MAX = 1.5
BEFUND_VIZ_VOLUMEN = 0.05


def befunde_ableiten(quality: dict, manifest: dict) -> list[dict]:
    """
    Qualitaetszahlen in sichtbare Befunde uebersetzen (Schema wie
    validate._finding). r007 hatte y+ 81.201, Courant 2,24 und 32 %
    Viz-Volumenfehler — alles im Manifest vergraben, nirgends sichtbar.
    """
    befunde: list[dict] = []

    def b(severity, message, **extra):
        befunde.append({"object_id": "qualitaet", "severity": severity,
                        "message": message, **extra})

    yp = quality.get("y_plus_range") or [None, None]
    if yp[1] is not None and float(yp[1]) > BEFUND_YPLUS_MAX:
        b("warnung", f"y+ bis {float(yp[1]):,.0f} — die Wandfunktion ist "
                     "dort nicht mehr gültig (gesund: 30–300); Sohlschub "
                     "an diesen Stellen mit Vorsicht lesen."
                     .replace(",", "."),
          wert=float(yp[1]), grenze=BEFUND_YPLUS_MAX, quelle="yplus")
    co = quality.get("courant_max")
    if co is not None and float(co) > BEFUND_COURANT_MAX:
        b("warnung", f"Courant-Spitze {float(co):g} über {BEFUND_COURANT_MAX:g} "
                     "trotz Zeitschrittbegrenzung — einzelne Zellen laufen "
                     "heiß (oft ein Netz- oder Randproblem).",
          wert=float(co), grenze=BEFUND_COURANT_MAX, quelle="courant")
    viz = manifest.get("viz_volume_error_rel_max")
    if viz is not None and float(viz) > BEFUND_VIZ_VOLUMEN:
        b("warnung", f"Viz-Volumen-Selbsttest: {float(viz) * 100:.0f} % "
                     "Abweichung zum Solver-Volumen — die 3D-Ansicht ist "
                     "dort gröber als die Rechnung.",
          wert=float(viz), grenze=BEFUND_VIZ_VOLUMEN, quelle="viz_volume")
    if quality.get("checkmesh_ok") is False:
        b("fehler", "checkMesh war durchgefallen — Ergebnis nur mit "
                    "Vorsicht verwenden (Altlauf vor dem Netz-Tor).",
          quelle="checkmesh")
    return befunde


def evaluate_run(df: pd.DataFrame, spec: CaseSpec, run_id: str,
                 manifest: dict | None = None) -> dict:
    return {
        "run_id": run_id,
        "case_hash": spec.case_hash(),
        "status": (manifest or {}).get("status", "completed"),
        "nachweis": spec.meta.nachweis.model_dump(),
        "crs_epsg": spec.meta.crs.epsg if spec.meta.crs else None,
        "quality": _quality(df, manifest),
        "kennwerte": kennwerte(df, spec),
        "targets": [_eval_target(df, t, spec) for t in spec.evaluation.targets],
        "extremes": _extremes(df),
        "figures": [],
    }
