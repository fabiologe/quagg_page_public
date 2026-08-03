"""
Synthetische räumliche Felddaten passend zum damBreak-artigen Fall aus
synthetic_case.py: ein Muldengelände mit Wasserspiegel level(t), rotierender
Beckenströmung und analytischer Sohlschubspannung. Erwartungswerte:

    Gitter          64 x 48 x 32 Zellen, Zelle 1.5 x 1.5 x 0.25 m
    Gelände         z = 96.5 - 1.8*exp(-r²/28²), Mulde um (48, 36)
    alpha           1 unter der Wasserspiegellage level(t, amp), 0 darüber
    U               Kreisströmung um das Muldenzentrum, |U| max U_MAX,
                    linear auf 0 zur Sohle hin
    p_rgh           rho*g*(surface - z) im Wasser, 0 in der Luft
    bed_shear       RHO_CF * |U_sohle|²
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from ..core.fields import (VolumeGrid, write_geometry, write_index,
                           write_timestep)
from .synthetic_case import level

GRID = VolumeGrid(origin=(0.0, 0.0, 92.0), spacing=(1.5, 1.5, 0.25),
                  dims=(64, 48, 32))
FIELD_TIMES = [0.0, 0.25, 0.5, 0.75, 1.0]
FIELD_NAMES = ["alpha", "U", "p_rgh", "bed_shear"]
U_MAX = 1.2
RHO_CF = 3.0
G = 9.81
RHO = 1000.0

_CENTER = (48.0, 36.0)
_R_BASIN = 28.0


def terrain_z(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    r2 = (x - _CENTER[0]) ** 2 + (y - _CENTER[1]) ** 2
    return 96.5 - 1.8 * np.exp(-r2 / _R_BASIN**2)


def _mesh():
    nx, ny, nz = GRID.dims
    x = GRID.origin[0] + (np.arange(nx) + 0.5) * GRID.spacing[0]
    y = GRID.origin[1] + (np.arange(ny) + 0.5) * GRID.spacing[1]
    z = GRID.origin[2] + (np.arange(nz) + 0.5) * GRID.spacing[2]
    return np.meshgrid(z, y, x, indexing="ij")  # (nz, ny, nx)


def fields_at(t: float, level_amp: float = 0.5) -> dict[str, np.ndarray]:
    zz, yy, xx = _mesh()
    surface = float(level(t, level_amp))
    ground = terrain_z(xx, yy)
    wet = (zz < surface) & (zz >= ground)

    alpha = wet.astype(np.float32)

    # Kreisströmung um das Muldenzentrum, zur Sohle hin abklingend
    dx, dy = xx - _CENTER[0], yy - _CENTER[1]
    r = np.sqrt(dx**2 + dy**2) + 1e-9
    swirl = U_MAX * np.clip(r / _R_BASIN, 0, 1) * np.exp(1 - r / _R_BASIN)
    depth = np.maximum(surface - ground, 1e-6)
    frac = np.clip((zz - ground) / depth, 0, 1)
    ux = (-dy / r) * swirl * frac
    uy = (dx / r) * swirl * frac
    uz = np.zeros_like(ux)
    U = np.stack([ux, uy, uz]).astype(np.float32) * wet

    p_rgh = (RHO * G * np.maximum(surface - zz, 0) * wet).astype(np.float32)

    # Sohlschubspannung aus der sohlnahen Geschwindigkeit (frac -> 0: nutze
    # das Strömungsprofil knapp über der Sohle, frac = 0.1)
    u_bed = swirl[0] * 0.1
    tau = (RHO_CF * u_bed**2 * (ground[0] < surface)).astype(np.float32)

    return {"alpha": alpha, "U": U, "p_rgh": p_rgh, "bed_shear": tau}


def build_fields(run_root: Path, level_amp: float = 0.5) -> None:
    zz, yy, xx = _mesh()
    write_geometry(run_root, GRID, terrain_z(xx[0], yy[0]))
    for i, t in enumerate(FIELD_TIMES):
        write_timestep(run_root, i, t, fields_at(t, level_amp))
    write_index(run_root, GRID, FIELD_TIMES, FIELD_NAMES)
