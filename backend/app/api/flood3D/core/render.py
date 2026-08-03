"""
render — Ergebnis-JSON und Berichtsabbildungen (Spez. 4.3, Kap. 2).

Eingang sind ausschließlich das Ergebnis-Dict aus evaluate und die
normalisierte Zwischendatei. Abbildungen werden als PNG und SVG geschrieben,
die Bildunterschrift trägt die Laufkennung (Spez. Kap. 8, Abbildungsexport).
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from .casespec import CaseSpec
from .conventions import Quantity
from .normalize import get_series

_FIG_SIZE = (8.0, 4.0)


def _save(fig, figures_dir: Path, fig_id: str, caption: str) -> dict:
    figures_dir.mkdir(parents=True, exist_ok=True)
    png = figures_dir / f"{fig_id}.png"
    fig.savefig(png, dpi=150, bbox_inches="tight")
    fig.savefig(figures_dir / f"{fig_id}.svg", bbox_inches="tight")
    plt.close(fig)
    return {"id": fig_id, "path": str(png), "caption": caption}


def _series_figure(df: pd.DataFrame, run_id: str, quantity: Quantity,
                   locations: list[str], component: str, ylabel: str,
                   fig_id: str, caption: str, figures_dir: Path,
                   limits: dict[str, float] | None = None,
                   logy: bool = False) -> dict | None:
    fig, ax = plt.subplots(figsize=_FIG_SIZE)
    plotted = False
    for loc in locations:
        t, v = get_series(df, quantity, loc, component)
        if not len(t):
            continue
        ax.plot(t, v, label=loc, linewidth=1.2)
        plotted = True
        if limits and loc in limits:
            ax.axhline(limits[loc], linestyle="--", linewidth=1.0,
                       color="crimson", label=f"Grenzwert {loc}")
    if not plotted:
        plt.close(fig)
        return None
    if logy:
        ax.set_yscale("log")
    ax.set_xlabel("Zeit in s")
    ax.set_ylabel(ylabel)
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=8)
    return _save(fig, figures_dir, fig_id, f"{caption} — Lauf {run_id}")


def render_run(result: dict, df: pd.DataFrame, spec: CaseSpec,
               out_dir: str | Path) -> dict:
    out_dir = Path(out_dir)
    figures_dir = out_dir / "figures"
    run_id = result["run_id"]
    figs: list[dict] = []

    level_limits = {t.at: t.limit_max for t in spec.evaluation.targets
                    if t.kind == "max_level" and t.limit_max is not None}
    jobs = [
        (Quantity.LEVEL, [g.id for g in spec.evaluation.gauges], "",
         "Wasserspiegellage in m", "wasserspiegel",
         "Wasserspiegellage je Pegelpunkt", level_limits, False),
        (Quantity.DISCHARGE, [s.id for s in spec.evaluation.sections], "",
         "Durchfluss in m³/s", "durchfluss",
         "Durchfluss je Querschnitt", None, False),
        (Quantity.FORCE, spec.evaluation.force_patches, "magnitude",
         "Kraft in N", "kraefte", "Kraftbetrag je Bauteil", None, False),
        (Quantity.VOLUME, ["domain"], "",
         "Wasservolumen in m³", "volumen",
         "Wasservolumen im Modellgebiet", None, False),
        (Quantity.COURANT, ["solver"], "max",
         "Courant-Zahl", "courant", "Maximale Courant-Zahl", None, False),
    ]
    for quantity, locs, comp, ylabel, fig_id, caption, limits, logy in jobs:
        f = _series_figure(df, run_id, quantity, locs, comp, ylabel,
                           fig_id, caption, figures_dir, limits, logy)
        if f:
            figs.append(f)

    res_fields = sorted(df.loc[df["quantity"] == Quantity.RESIDUAL.value,
                               "location_id"].unique())
    for comp in ("initial", "final"):
        f = _series_figure(df, run_id, Quantity.RESIDUAL, res_fields, comp,
                           "Residuum", f"residuen_{comp}",
                           f"Residuen ({comp})", figures_dir, logy=True)
        if f:
            figs.append(f)
            break

    result = dict(result, figures=figs)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "result.json", "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)
    return result
