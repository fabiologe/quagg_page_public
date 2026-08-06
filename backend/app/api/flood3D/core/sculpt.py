"""
sculpt — die Sculpt-Ebene des Geländes (Pinsel im Editor).

Alle Pinsel (heben, senken, glätten, an Bruchkanten anpassen) erzeugen
dasselbe: ein DELTA aufs Höhenfeld. Das Delta liegt als eigenes Raster
(`sculpt.npz`: dz, x0, y0, res) im Fallordner — Primärdatum wie ein
importiertes Raster, KEIN derived. terrain.from_spec addiert es NACH dem
Operationsstapel: geformt wird, was man sieht.

Der Client schickt Patches in Gitterindizes des aktuellen Geländerasters
(i0, j0, dz-Teilfeld) — exakt, ohne Resampling-Verlust. Rückgängig ist
das inverse Patch (-dz), es gibt keinen zweiten Mechanismus.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np

SCULPT_DATEI = "sculpt.npz"
# Obergrenze je Aufruf — ein Patch ist ein Pinselstrich, kein Raster-Upload
MAX_PATCH_ZELLEN = 2_000_000
MAX_DELTA = 100.0                 # m; mehr ist kein Pinselstrich mehr


def _gitter(terrain, domain):
    """Das eine Geländegitter — identisch zu TerrainField.from_spec."""
    x0, y0, x1, y1 = domain.extent
    res = terrain.base.resolution
    nx = int(round((x1 - x0) / res)) + 1
    ny = int(round((y1 - y0) / res)) + 1
    return x0, y0, res, nx, ny


def lade_ebene(terrain, domain, base_dir: Path) -> np.ndarray:
    """
    Sculpt-Ebene auf dem AKTUELLEN Geländegitter. Passt das gespeicherte
    Gitter nicht mehr (Gebiet geändert), wird bilinear umgetastet —
    außerhalb des alten Gitters ist das Delta 0.
    """
    x0, y0, res, nx, ny = _gitter(terrain, domain)
    if not terrain.sculpt:
        return np.zeros((ny, nx), dtype=np.float64)
    pfad = Path(base_dir) / terrain.sculpt
    if not pfad.exists():
        raise FileNotFoundError(f"Sculpt-Ebene nicht gefunden: {pfad}")
    d = np.load(pfad)
    dz = np.asarray(d["dz"], dtype=np.float64)
    ax0, ay0, ares = float(d["x0"]), float(d["y0"]), float(d["res"])
    any_, anx = dz.shape
    if (ax0, ay0, ares, anx, any_) == (x0, y0, res, nx, ny):
        return dz
    from .terrain import _sample_bilinear
    xx, yy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
    out = _sample_bilinear(dz, ax0, ay0, ares, xx, yy)
    innen = ((xx >= ax0) & (xx <= ax0 + (anx - 1) * ares)
             & (yy >= ay0) & (yy <= ay0 + (any_ - 1) * ares))
    return np.where(innen, out, 0.0)


def _speichern(spec, base_dir: Path, dz: np.ndarray) -> None:
    x0, y0, res, _, _ = _gitter(spec.terrain, spec.domain)
    pfad = Path(base_dir) / SCULPT_DATEI
    dz32 = dz.astype(np.float32)
    np.savez_compressed(pfad, dz=dz32, x0=x0, y0=y0, res=res)
    spec.terrain.sculpt = SCULPT_DATEI
    # Stand-Stempel: ohne ihn bliebe die case.yaml bei jedem weiteren
    # Strich unverändert — Netzvorschau und case_hash wüssten nichts vom
    # neuen Gelände
    spec.terrain.sculpt_stand = hashlib.sha1(dz32.tobytes()).hexdigest()[:12]


def patch_anwenden(spec, base_dir, patches: list[dict]) -> str:
    """Pinsel-Patches (Gitterindizes + dz-Teilfeld) auf die Ebene addieren."""
    if spec.terrain is None or spec.domain is None:
        raise ValueError("Fall ohne Gelände oder Gebiet — nichts zu formen.")
    if spec.terrain.base.koerper:
        raise ValueError("Geländekörper (STL) lässt sich nicht mit dem "
                         "Pinsel formen — nur rasterbasiertes Gelände.")
    if not patches:
        raise ValueError("Keine Pinsel-Patches übergeben.")
    _, _, _, nx, ny = _gitter(spec.terrain, spec.domain)
    ebene = lade_ebene(spec.terrain, spec.domain, Path(base_dir))
    zellen = 0
    dz_max = 0.0
    for p in patches:
        teil = np.asarray(p.get("dz"), dtype=np.float64)
        if teil.ndim != 2 or teil.size == 0:
            raise ValueError("Patch ohne dz-Teilfeld.")
        if not np.isfinite(teil).all():
            raise ValueError("Patch enthält NaN/Inf.")
        if np.abs(teil).max() > MAX_DELTA:
            raise ValueError(f"Patch-Delta über {MAX_DELTA:g} m — "
                             "das ist kein Pinselstrich mehr.")
        i0, j0 = int(p.get("i0", -1)), int(p.get("j0", -1))
        pj, pi = teil.shape
        if i0 < 0 or j0 < 0 or i0 + pi > nx or j0 + pj > ny:
            raise ValueError(f"Patch ({i0},{j0})+({pi}×{pj}) liegt außerhalb "
                             f"des Geländerasters ({nx}×{ny}).")
        zellen += teil.size
        if zellen > MAX_PATCH_ZELLEN:
            raise ValueError("Zu viele Zellen in einem Aufruf.")
        ebene[j0:j0 + pj, i0:i0 + pi] += teil
        dz_max = max(dz_max, float(np.abs(teil).max()))
    _speichern(spec, Path(base_dir), ebene)
    meldung = (f"Gelände geformt: {len(patches)} Strich(e), "
               f"größte Änderung {dz_max:.2f} m.")
    beruehrt = _sollhoehen_ueberlapp(spec, patches)
    if beruehrt:
        meldung += (" Hinweis: der Strich überlappt "
                    + ", ".join(f"„{b}“" for b in beruehrt)
                    + " — dort gelten weiter die Sollhöhen der Operation.")
    return meldung


# Operationen, die eine feste Zielhöhe zusichern — der Pinsel wirkt VOR
# ihnen, dort bleibt seine Wirkung (teils) aus. Relative Operationen
# (raise_lower, smooth) vertragen sich mit jedem Untergrund.
_SOLLHOEHEN_TYPEN = {"channel_carve", "pad", "ramp", "embankment",
                     "replace_region", "set_level", "bruchkante",
                     "boeschung", "aussenkante"}


def _op_bbox(op):
    """Grobe Grundriss-Hülle einer Operation, mit Wirkungs-Rand."""
    pts = None
    rand = 0.0
    for attr in ("polygon", "polyline"):
        p = getattr(op, attr, None)
        if p:
            pts = np.asarray(p, dtype=float)[:, :2]
            break
    if pts is None:
        return None
    t = op.type
    if t == "channel_carve":
        rand = op.bottom_width / 2 + op.depth * max(op.side_slope, 0.0)
    elif t == "embankment":
        rand = op.crest_width / 2
    elif t == "bruchkante":
        rand = getattr(op, "breite", 0.0)
    elif t == "set_level":
        rand = getattr(op, "blend_width", 0.0) or 0.0
    return (pts[:, 0].min() - rand, pts[:, 1].min() - rand,
            pts[:, 0].max() + rand, pts[:, 1].max() + rand)


def _sollhoehen_ueberlapp(spec, patches) -> list[str]:
    x0, y0, res, _, _ = _gitter(spec.terrain, spec.domain)
    kisten = []
    for p in patches:
        teil = np.asarray(p["dz"])
        pj, pi = teil.shape
        kisten.append((x0 + p["i0"] * res, y0 + p["j0"] * res,
                       x0 + (p["i0"] + pi - 1) * res,
                       y0 + (p["j0"] + pj - 1) * res))
    beruehrt = []
    for op in spec.terrain.operations:
        if op.type not in _SOLLHOEHEN_TYPEN:
            continue
        ob = _op_bbox(op)
        if ob is None:
            continue
        for k in kisten:
            if not (k[2] < ob[0] or ob[2] < k[0]
                    or k[3] < ob[1] or ob[3] < k[1]):
                beruehrt.append(op.id)
                break
    return beruehrt
