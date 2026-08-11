#!/usr/bin/env python3
"""
Beispiel-Geometrien für den Import-Dialog erzeugen (flood-3D).

Schreibt nach client/public/beispiele/ — die Dateien sind über die Web-App
herunterladbar und dienen als Testfälle für den DXF-/STL-Import:

  gelaende_bauwerke.dxf   BricsCAD-typisch: Gelände-TIN mit eingeschnittenem
                          Gerinne, zwei Mauern, zwei Pfeiler, ein Wehrkörper,
                          zwei Auswerte-Trassen — je auf eigenem Layer.
  koerper.stl             Mehrkörper-STL: Pfeilerreihe (3), Wand, Beckenwanne.
  problemfall.dxf         Absichtlich fies: Millimeter, Landeskoordinaten
                          (UTM32), ein roher 3DSOLID ohne CONVTOMESH.

ACHTUNG: `boeschungskanten.dxf` im selben Zielordner ist HANDGEPFLEGT und
wird von diesem Skript NICHT erzeugt — beim Aufräumen des Ordners nicht
löschen (der Import-Dialog bietet sie als viertes Beispiel an).

Aufruf:  venv/bin/python app/api/flood3D/engines/local/make_beispiele.py
"""
from __future__ import annotations

from pathlib import Path

import ezdxf
import numpy as np
import trimesh

# .../backend/app/api/flood3D/engines/local/ -> 6 Ebenen bis zum Projekt
OUT = Path(__file__).resolve().parents[6] / "client" / "public" / "beispiele"


def gelaende_z(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Talmulde mit Gefälle: Grundneigung 1 %, dazu ein 6 m breites Gerinne
    entlang y = 15 m, 1,2 m tief, plus etwas Relief.
    """
    z = 100.0 - 0.01 * x + 0.35 * np.sin(x / 9.0) + 0.25 * np.cos(y / 7.0)
    rinne = np.exp(-(((y - 15.0) / 3.5) ** 2))
    return z - 1.2 * rinne


def _polyface(msp, mesh: trimesh.Trimesh, layer: str) -> None:
    mb = ezdxf.render.MeshBuilder()
    for f in mesh.faces:
        mb.add_face([tuple(mesh.vertices[k]) for k in f])
    mb.render_polyface(msp, dxfattribs={"layer": layer})


def _box(size, center) -> trimesh.Trimesh:
    m = trimesh.creation.box(extents=size)
    m.apply_translation(center)
    return m


def make_gelaende_bauwerke(path: Path) -> None:
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 6          # Meter
    msp = doc.modelspace()
    for name, color in (("GELAENDE", 3), ("MAUER_LINKS", 1),
                        ("MAUER_RECHTS", 1), ("PFEILER_MITTE", 2),
                        ("PFEILER_RAND", 2), ("WEHRKOERPER", 5),
                        ("QS_OBERWASSER", 4), ("QS_UNTERWASSER", 4)):
        doc.layers.add(name, color=color)

    # Gelände als TIN, 2 m Raster über 48 x 30 m
    step = 2.0
    xs = np.arange(0.0, 48.0 + step, step)
    ys = np.arange(0.0, 30.0 + step, step)
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            x0, x1 = xs[i], xs[i + 1]
            y0, y1 = ys[j], ys[j + 1]
            corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
            pts = [(float(cx), float(cy),
                    float(gelaende_z(np.array(cx), np.array(cy))))
                   for cx, cy in corners]
            msp.add_3dface(pts, dxfattribs={"layer": "GELAENDE"})

    # Ufermauern beidseitig des Gerinnes (Länge 20 m, 0,4 m dick, 2,5 m hoch)
    z_ufer = float(gelaende_z(np.array(24.0), np.array(11.0)))
    _polyface(msp, _box((20.0, 0.4, 2.5), (24.0, 11.0, z_ufer + 0.8)),
              "MAUER_LINKS")
    _polyface(msp, _box((20.0, 0.4, 2.5), (24.0, 19.0, z_ufer + 0.8)),
              "MAUER_RECHTS")

    # Brückenpfeiler im Gerinne (rechteckig) und einer am Rand
    z_sohle = float(gelaende_z(np.array(30.0), np.array(15.0)))
    _polyface(msp, _box((1.2, 3.0, 4.0), (30.0, 15.0, z_sohle + 1.4)),
              "PFEILER_MITTE")
    _polyface(msp, _box((1.0, 1.0, 3.5), (30.0, 21.0, z_sohle + 1.6)),
              "PFEILER_RAND")

    # Wehrkörper quer im Gerinne
    _polyface(msp, _box((1.5, 8.0, 1.6), (16.0, 15.0, z_sohle + 0.6)),
              "WEHRKOERPER")

    # Auswerte-Trassen quer zum Gerinne
    msp.add_lwpolyline([(10.0, 6.0), (10.0, 24.0)],
                       dxfattribs={"layer": "QS_OBERWASSER"})
    msp.add_lwpolyline([(38.0, 6.0), (38.0, 24.0)],
                       dxfattribs={"layer": "QS_UNTERWASSER"})

    doc.saveas(path)


def make_koerper_stl(path: Path) -> None:
    """
    Mehrkörper-STL. Wichtig: Körper, die sich nur BERÜHREN, sind
    topologisch nicht verbunden und zerfallen beim Import in Einzelteile —
    die Beckenwände entstehen deshalb als EIN Ringprofil (Polygon mit
    Loch, extrudiert) statt aus vier aneinandergestellten Platten.
    """
    from shapely.geometry import Polygon

    parts = [
        _box((1.0, 1.0, 3.0), (4.0, 5.0, 1.5)),      # Pfeilerreihe, eckig
        _box((1.0, 1.0, 3.0), (8.0, 5.0, 1.5)),
        _box((1.0, 1.0, 3.0), (12.0, 5.0, 1.5)),
        _box((14.0, 0.5, 2.0), (8.0, 10.0, 1.0)),    # Wand
    ]
    # runder Pfeiler, damit auch eine gekrümmte Fläche dabei ist
    rund = trimesh.creation.cylinder(radius=0.6, height=3.0, sections=24)
    rund.apply_translation([16.0, 5.0, 1.5])
    parts.append(rund)

    aussen = Polygon([(5.0, 15.0), (11.0, 15.0), (11.0, 21.0), (5.0, 21.0)])
    innen = Polygon([(5.4, 15.4), (10.6, 15.4), (10.6, 20.6), (5.4, 20.6)])
    wanne = trimesh.creation.extrude_polygon(
        aussen.difference(innen), height=1.6)
    parts.append(wanne)

    trimesh.util.concatenate(parts).export(path)


def make_problemfall(path: Path) -> None:
    """Millimeter + Landeskoordinaten + roher ACIS-Körper."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4          # Millimeter
    msp = doc.modelspace()
    for name in ("GELAENDE_MM", "WAND_MM", "ROH_SOLID"):
        doc.layers.add(name)

    ox, oy = 32_500_000.0, 5_600_000.0   # UTM32 in mm
    step = 5000.0                        # 5 m in mm
    for i in range(6):
        for j in range(4):
            x0, y0 = ox + i * step, oy + j * step
            x1, y1 = x0 + step, y0 + step
            def z(x):
                return 100_000.0 + (x - ox) * 0.01
            msp.add_3dface([(x0, y0, z(x0)), (x1, y0, z(x1)),
                            (x1, y1, z(x1)), (x0, y1, z(x0))],
                           dxfattribs={"layer": "GELAENDE_MM"})

    wand = _box((10_000.0, 400.0, 2500.0),
                (ox + 15_000.0, oy + 10_000.0, 101_500.0))
    _polyface(msp, wand, "WAND_MM")

    solid = msp.new_entity("3DSOLID", dxfattribs={"layer": "ROH_SOLID"})
    solid.sat = ["700 0 0 1 ", "@7 Unknown "]   # ohne Nutzlast verwirft ezdxf

    doc.saveas(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_gelaende_bauwerke(OUT / "gelaende_bauwerke.dxf")
    make_koerper_stl(OUT / "koerper.stl")
    make_problemfall(OUT / "problemfall.dxf")
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:26} {f.stat().st_size / 1024:7.1f} kB")


if __name__ == "__main__":
    main()
