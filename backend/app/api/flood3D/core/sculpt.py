"""
sculpt — die Sculpt-Ebene des Geländes (Pinsel im Editor).

Alle Pinsel (heben, senken, glätten, an Bruchkanten anpassen) erzeugen
dasselbe: ein DELTA aufs Höhenfeld. Das Delta liegt als eigenes Raster
(`sculpt.npz`: dz, x0, y0, res) im Fallordner — Primärdatum wie ein
importiertes Raster, KEIN derived. terrain.from_spec addiert es VOR dem
Operationsstapel: der Pinsel formt das gewachsene Gelände, die
deklarierten Operationen (Gerinnesohle, Planum, …) behalten ihre
Sollhöhen obendrauf.

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
    verschluckt = _verschluckt(spec, Path(base_dir), patches)
    if verschluckt:
        meldung += " " + verschluckt
    return meldung


def _strich_maske(spec, patches) -> np.ndarray:
    """Welche Rasterknoten der Strich berührt hat."""
    _, _, _, nx, ny = _gitter(spec.terrain, spec.domain)
    maske = np.zeros((ny, nx), dtype=bool)
    for p in patches:
        teil = np.asarray(p["dz"], dtype=float)
        pj, pi = teil.shape
        i0, j0 = int(p["i0"]), int(p["j0"])
        maske[j0:j0 + pj, i0:i0 + pi] |= teil != 0.0
    return maske


def _verschluckt(spec, base_dir: Path, patches) -> str:
    """
    Wie viel des Strichs kommt NICHT an, und wer hält dort die Höhe?

    Gemessen am fertigen Feld (TerrainField.pinsel_sperre), nicht an
    Hüllboxen: eine geschlossene Bruchkante „ebnen" sperrt ihre ganze
    Fläche, ein Gerinne nur seinen Einschnitt. Ohne diese Auskunft sah der
    Bearbeiter nur, wie sein Strich nach dem Speichern verschwand.
    """
    from .terrain import TerrainField
    try:
        feld = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
        sperre = feld.pinsel_sperre()
    except Exception:                    # Auskunft, kein Hindernis
        return ""
    if not sperre:
        return ""
    beruehrt = _strich_maske(spec, patches)
    if beruehrt.shape != sperre["ebene"].shape:
        return ""
    getroffen = beruehrt & (sperre["ebene"] > 0)
    if not getroffen.any():
        return ""
    anteil = float(getroffen.sum()) / float(beruehrt.sum())
    namen = sorted({sperre["ops"][int(k) - 1]
                    for k in np.unique(sperre["ebene"][getroffen])})
    return (f"Auf {anteil:.0%} der bestrichenen Fläche bleibt er ohne "
            "Wirkung: dort gelten die Sollhöhen von "
            + ", ".join(f"„{n}“" for n in namen)
            + " — wer dort formen will, ändert die Operation.")


def sichtbar_geworden(spec, base_dir, eps: float = 0.01) -> dict | None:
    """
    Striche, die vor dem 2026-09-22 unter einer ABGELEITETEN Operation
    verschwanden und seit der neuen Reihenfolge wirken.

    Bis dahin lag der Pinsel vor dem ganzen Operationsstapel, also auch vor
    den aus Vermessungskanten abgeleiteten Böschungen und Sohlen. Wer dort
    strich, sah nichts — der Strich blieb aber in der Datei stehen. Jetzt
    wirkt er. Fünf Bestandsfälle tragen solche Striche, bis 1,10 m tief;
    ohne diese Messung änderte der Umbau ihr Gelände still.

    Rückgabe: Maske, größte Abweichung und Anteil — oder None.
    """
    from .terrain import TerrainField
    t = spec.terrain
    if t is None or spec.domain is None or not t.sculpt:
        return None
    if not any(getattr(o, "aus_kanten", None) for o in t.operations):
        return None

    ohne = t.model_copy(deep=True)
    ohne.sculpt = None
    z_ohne = TerrainField.from_spec(ohne, spec.domain, base_dir).z
    z_neu = TerrainField.from_spec(t, spec.domain, base_dir).z

    # alte Reihenfolge nachstellen: Pinsel auf die nackte Basis, dann ALLE
    # Operationen
    nackt = t.model_copy(deep=True)
    nackt.operations = []
    nackt.sculpt = None
    alt = TerrainField.from_spec(nackt, spec.domain, base_dir)
    alt.z = alt.z + lade_ebene(t, spec.domain, Path(base_dir))
    alt._ops = list(t.operations)
    alt._base_dir = Path(base_dir)
    for op in t.operations:
        alt.apply(op)

    war_unsichtbar = np.abs(alt.z - z_ohne) < eps
    wirkt_jetzt = np.abs(z_neu - z_ohne) >= eps
    maske = war_unsichtbar & wirkt_jetzt
    if not maske.any():
        return None
    return {"maske": maske,
            "max_dz": float(np.abs(z_neu - z_ohne)[maske].max()),
            "anteil": float(maske.mean()),
            "knoten": int(maske.sum())}
