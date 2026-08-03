"""
Normalisierte Zwischendatei (Spez. 4.2): eine Langformat-Tabelle als Parquet,
einzige Eingangsgröße für evaluate und render.

Regel zur Zeitachse: hier bleibt die native, nicht äquidistante Zeitachse
jeder Quelle erhalten. Resampling passiert ausschließlich in evaluate.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .conventions import NORMALIZED_COLUMNS


def write_normalized(df: pd.DataFrame, path: str | Path) -> None:
    missing = set(NORMALIZED_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Zwischendatei unvollständig, fehlende Spalten: {sorted(missing)}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df[NORMALIZED_COLUMNS].to_parquet(path, index=False)


def read_normalized(path: str | Path) -> pd.DataFrame:
    return pd.read_parquet(path)


def get_series(df: pd.DataFrame, quantity: str, location_id: str,
               component: str = "") -> tuple[np.ndarray, np.ndarray]:
    """Eine Zeitreihe als (t, werte), nach Zeit sortiert, Duplikate entfernt."""
    sel = df[(df["quantity"] == quantity)
             & (df["location_id"] == location_id)
             & (df["component"] == component)]
    sel = sel.sort_values("time").drop_duplicates("time", keep="last")
    return sel["time"].to_numpy(float), sel["value"].to_numpy(float)


def list_series(df: pd.DataFrame) -> pd.DataFrame:
    """Inventar aller vorhandenen Zeitreihen mit Punktanzahl und Zeitbereich."""
    g = df.groupby(["quantity", "location_id", "component"], sort=True)
    return g.agg(n=("time", "size"), t_min=("time", "min"),
                 t_max=("time", "max")).reset_index()
