"""
belag — Oberflächenbeläge des Geländes als eigene Netz-Patches.

Warum das nötig ist: In OpenFOAM hängt die Rauheit nicht an einer Zelle,
sondern an der WANDFLÄCHE, und sie wird je Patch als eine Zahl
geschrieben (`Ks uniform 0.03` in 0/nut). Ein Bauwerk hat deshalb schon
heute sein Material — das Gelände aber ist EIN Patch, und darauf liegen
in Wirklichkeit verschiedene Beläge nebeneinander: betonierte Sohle,
Rasenböschung, Schotterstreifen.

Der Weg dorthin, an OpenFOAM v2406 verifiziert:

    topoSet   patchToFace terrain              → alle Geländeflächen
              subset searchableSurfaceToFace   → die unter dem Belag
    createPatch                                → eigener Patch je Belag
    0/nut                                      → dessen k_s

Gegenprobe im Container (20x20 Bodenflächen, Prisma über 40 % davon):
400 Flächen ausgewählt, nach dem Subset exakt 160 — die Mechanik trägt.

Der Nebeneffekt ist die halbe Miete: Sohlschubspannung und Kräfte werden
in OpenFOAM JE PATCH ausgewertet. Mit eigenen Belag-Patches bekommt man
τ getrennt je Materialregion, ohne dafür etwas zu bauen.

Hier steht nur die Geometrie: aus der gemalten Rasterkarte je Belag ein
Polygon und daraus ein Prisma. Reine Funktionen, keine OpenFOAM-Dicts.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import shapely
import shapely.ops
import trimesh
from trimesh.creation import extrude_polygon

# Kleinste Fläche, die noch einen eigenen Patch bekommt. Darunter ist der
# Belag im Netz ohnehin nicht auflösbar und erzeugte nur einen leeren
# Patch, an dem später jede Auswertung vorbeiläuft.
MINDEST_FLAECHE = 1e-6


def lade_belagskarte(pfad: Path) -> tuple[np.ndarray, float, float, float]:
    """
    ESRI-ASCII mit Belag-Kennungen lesen.

    BEWUSST ohne Interpolation: zwischen Kennung 1 und 3 läge sonst 2 —
    ein Belag, den niemand gemalt hat. Gelesen werden ganze Zahlen, und
    die Zuordnung bleibt die gemalte.

    Rückgabe: (ids (ny, nx), x0, y0, zellgroesse) — Zeile 0 ist die
    UNTERSTE Zeile (y0), anders als in der Datei.
    """
    kopf: dict[str, float] = {}
    zeilen: list[np.ndarray] = []
    with open(pfad) as f:
        for zeile in f:
            teile = zeile.split()
            if not teile:
                continue
            if teile[0].lower() in ("ncols", "nrows", "xllcorner", "yllcorner",
                                    "cellsize", "nodata_value"):
                kopf[teile[0].lower()] = float(teile[1])
                continue
            zeilen.append(np.array(teile, dtype=float))
    if not zeilen or "cellsize" not in kopf:
        raise ValueError(f"Belagskarte {pfad.name} ist kein ESRI-ASCII-Raster")
    # ESRI zählt von oben nach unten, das Modell von unten nach oben
    ids = np.flipud(np.vstack(zeilen)).astype(np.int32)
    return (ids, float(kopf.get("xllcorner", 0.0)),
            float(kopf.get("yllcorner", 0.0)), float(kopf["cellsize"]))


def belag_polygone(ids: np.ndarray, x0: float, y0: float,
                   zelle: float) -> dict[int, shapely.geometry.base.BaseGeometry]:
    """
    Je Belag-Kennung die zusammenhängende Fläche als Polygon.

    Die gemalten Rasterzellen werden zu Rechtecken und vereinigt; aus dem
    Treppenrand wird dabei EIN Umriss. Genauer als die Pinselauflösung ist
    das nicht — und braucht es auch nicht zu sein: der Belag wird am Ende
    ein Patch, und dessen Rand kann ohnehin nur an Zellkanten liegen.
    """
    aus: dict[int, shapely.geometry.base.BaseGeometry] = {}
    for kennung in np.unique(ids):
        k = int(kennung)
        if k <= 0:                      # 0 und NODATA: kein Belag
            continue
        jj, ii = np.nonzero(ids == k)
        kacheln = [
            shapely.geometry.box(x0 + i * zelle, y0 + j * zelle,
                                 x0 + (i + 1) * zelle, y0 + (j + 1) * zelle)
            for j, i in zip(jj, ii)
        ]
        if not kacheln:
            continue
        flaeche = shapely.ops.unary_union(kacheln)
        if flaeche.is_empty or flaeche.area < MINDEST_FLAECHE:
            continue
        aus[k] = flaeche
    return aus


def belag_koerper(flaeche, z_min: float, z_max: float) -> trimesh.Trimesh | None:
    """
    Das Prisma über einer Belagsfläche — der Suchkörper für topoSet.

    Es reicht von unter dem Gelände bis darüber: `searchableSurfaceToFace`
    wählt die Flächen, deren Mittelpunkt DARIN liegt, und die
    Geländeflächen liegen irgendwo dazwischen. Ein zu knappes Prisma
    verlöre die Flächen an Böschungen, wo das Gelände steil steht.
    """
    hoehe = float(z_max - z_min)
    if hoehe <= 0:
        return None
    teile = []
    for poly in (flaeche.geoms if hasattr(flaeche, "geoms") else [flaeche]):
        if poly.is_empty or poly.area < MINDEST_FLAECHE:
            continue
        m = extrude_polygon(poly, height=hoehe)
        m.apply_translation([0.0, 0.0, float(z_min)])
        if m.volume < 0:
            m.invert()
        teile.append(m)
    if not teile:
        return None
    if len(teile) == 1:
        return teile[0]
    # Getrennte Flecken desselben Belags bleiben EIN Suchkörper: sie
    # bekommen auch einen gemeinsamen Patch.
    return trimesh.util.concatenate(teile)
