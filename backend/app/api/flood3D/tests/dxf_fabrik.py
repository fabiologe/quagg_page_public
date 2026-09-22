"""
Synthetische Vermessungs-DXF, die bewusst NICHT wie der Abnahmefall aussehen.

Der Import wurde an einer Datei entwickelt, die alles mitbrachte, was die
Heuristiken voraussetzen: ein 3DFACE-TIN, Ringe mit wiederholtem
Anfangspunkt, ein Kreis in senkrechter Ebene, Meter, lokale Koordinaten.
Die zwei Fabriken hier bauen die Formen nach, an denen das Werkzeug im
Betrieb gescheitert ist — synthetisch, weil das Repo öffentlich ist und
die echten Projektdateien dort nichts verloren haben:

    nacktes_becken   ein offenes Becken-TIN in Landeskoordinaten, wie es
                     BricsCAD schreibt (3DFACE mit vtx3 == vtx0), mit
                     einer tiefen Auslauf-Scharte im Rand und einem
                     Rohrkreis in waagerechter Achse.
    neun_linien      dieselbe Vermessung als Linien: Beckenrand mit
                     closed-Flag, aber OHNE wiederholten Anfangspunkt,
                     Sohle als echter Ring, Böschungslinien, Auslauf.

Beide liegen in einer synthetischen Gauß-Krüger-Größenordnung: 2,5 Mio /
5,4 Mio ist dieselbe Zweierpotenz-Klasse wie die echten 2,58 Mio /
5,46 Mio, der float32-Schritt ist dort 0,25 m in x und 0,5 m in y.
"""
from __future__ import annotations

import io
import math

import numpy as np

# synthetischer Landeskoordinaten-Ursprung (siehe Modulkopf)
GK_URSPRUNG = (2_500_000.0, 5_400_000.0)

# Höhen des Beckens — dieselbe Größenordnung wie im Betrieb, damit ein
# Fehler in der Höhenlage (z = 0, z = 95) sofort auffällt
SOHLE = 223.05
KRONE = 225.55
SCHARTE = SOHLE + 0.20          # Auslaufscharte: offen und tief
ROHR_RADIUS = 0.8               # r = 0,8 -> d = 1,6 (wie in der Zeichnung)


def _drehung(grad: float) -> np.ndarray:
    a = math.radians(grad)
    return np.array([[math.cos(a), -math.sin(a)],
                     [math.sin(a), math.cos(a)]])


def _becken_hoehe(u: float, v: float) -> float:
    """
    Beckenform über dem Einheitsquadrat: flache Sohle, ansteigende
    Böschung, Krone am Rand. Entlang der +u-Achse liegt die Scharte: dort
    ist der Rand auf Sohlniveau offen, genau der Fall, bei dem eine
    Fortschreibung des Randwerts eine Rinne bis zum Gebietsrand erzeugt.
    """
    r = max(abs(u), abs(v))
    t = min(max((r - 0.4) / 0.6, 0.0), 1.0)
    z = SOHLE + (KRONE - SOHLE) * t ** 1.5
    if u >= 0.55 and abs(v) <= 0.4:
        z = min(z, SCHARTE + (u - 0.55) * 0.05)
    return z


def nacktes_becken(n: int = 10, kante: float = 8.5, rotation_deg: float = 45.0,
                   ursprung: tuple[float, float] = GK_URSPRUNG) -> dict:
    """
    Becken-TIN als DXF-Bytes, dazu die Kennzahlen, gegen die ein Test
    misst. `n` Stützpunkte je Achse -> 2·(n-1)² Dreiecke, jedes als 3DFACE
    mit vtx3 == vtx0 (BricsCAD-Konvention). Das Quadrat ist um
    `rotation_deg` gedreht, damit der Hüllquader deutlich mehr umfasst als
    das TIN (die ungemessenen Ecken).
    """
    import ezdxf
    from ezdxf.math import OCS, Vec3

    R = _drehung(rotation_deg)
    ox, oy = ursprung
    us = np.linspace(-1.0, 1.0, n)

    def wcs(u: float, v: float) -> tuple[float, float, float]:
        x, y = R @ np.array([u, v]) * (kante / 2)
        return (round(ox + 6.0 + float(x), 3), round(oy + 6.0 + float(y), 3),
                round(_becken_hoehe(u, v), 3))

    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 6              # Meter — wird heute nie gelesen
    msp = doc.modelspace()

    n_faces = 0
    for i in range(n - 1):
        for j in range(n - 1):
            p00, p10 = wcs(us[i], us[j]), wcs(us[i + 1], us[j])
            p11, p01 = wcs(us[i + 1], us[j + 1]), wcs(us[i], us[j + 1])
            for tri in ((p00, p10, p11), (p00, p11, p01)):
                # vtx3 == vtx0: so schreibt BricsCAD ein Dreieck
                msp.add_3dface([tri[0], tri[1], tri[2], tri[0]],
                               dxfattribs={"layer": "3D_FL"})
                n_faces += 1

    # Randpunkte des TIN (max(|u|,|v|) == 1) — daraus leitet sich die
    # Außenhöhe ab; die Scharte liegt bei u = 1, |v| <= 0.4
    rand = [wcs(u, v) for u in us for v in us
            if max(abs(u), abs(v)) >= 1.0 - 1e-9]

    # Rohrkreis an der Scharte: Achse waagerecht nach außen (Richtung +u)
    richtung = R @ np.array([1.0, 0.0])
    extrusion = (round(float(richtung[0]), 6), round(float(richtung[1]), 6), 0.0)
    mx, my, _ = wcs(1.0, 0.0)
    mitte_wcs = (mx, my, SCHARTE + ROHR_RADIUS)
    mitte_ocs = OCS(Vec3(extrusion)).from_wcs(Vec3(mitte_wcs))
    msp.add_circle(mitte_ocs, ROHR_RADIUS,
                   dxfattribs={"layer": "AUSLAUF", "extrusion": extrusion})

    buf = io.StringIO()
    doc.write(buf)
    xs = [p[0] for p in rand]
    ys = [p[1] for p in rand]
    return {
        "dxf": buf.getvalue().encode("utf-8"),
        "n_faces": n_faces,
        "rand": np.array(rand),
        "rohr": {"mitte": mitte_wcs, "radius": ROHR_RADIUS,
                 "achse": extrusion},
        "bbox": ((min(xs), min(ys)), (max(xs), max(ys))),
        "sohle": SOHLE, "krone": KRONE, "scharte": SCHARTE,
    }


def _ring_punkte(cx: float, cy: float, r: float, n: int, z0: float,
                 z1: float) -> list[tuple[float, float, float]]:
    """n Punkte auf einem Kreis, Höhe wechselt zwischen z0 und z1."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        z = z0 + (z1 - z0) * (0.5 + 0.5 * math.sin(3 * a))
        pts.append((round(cx + r * math.cos(a), 3),
                    round(cy + r * math.sin(a), 3), round(z, 3)))
    return pts


def neun_linien(ursprung: tuple[float, float] = GK_URSPRUNG) -> dict:
    """
    Die Vermessung als Linien, in der Form, wie sie ein Betriebsfall
    lieferte: der Beckenrand trägt das closed-Flag, wiederholt seinen
    Anfangspunkt aber nicht (Enden liegen offen auseinander); nur die Sohle
    ist ein Ring mit wiederholtem Anfangspunkt. Dazu Böschungslinien mit
    Höhe je Stützpunkt, ein Auslauf-Querschnitt und der Rohrkreis.
    """
    import ezdxf
    from ezdxf.math import OCS, Vec3

    ox, oy = ursprung
    cx, cy = ox + 6.0, oy + 6.0
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 6
    msp = doc.modelspace()

    def linie(name: str, pts, close: bool = False):
        msp.add_polyline3d(pts, close=close, dxfattribs={"layer": name})

    # Beckenrand: closed=True, Anfangspunkt NICHT wiederholt, Enden offen
    rand = _ring_punkte(cx, cy, 5.8, 16, KRONE - 0.3, KRONE)
    rand_offen = rand[:-1]                     # letztes Stück fehlt: Lücke
    linie("Bruchkanten_linie_3", rand_offen, close=True)
    # Sohle: echter Ring mit wiederholtem Anfangspunkt
    sohle = _ring_punkte(cx, cy, 2.4, 4, SOHLE, SOHLE + 0.34)
    linie("Bruchkanten_linie_1", sohle + [sohle[0]])
    # Auslaufstück und zwei kurze Kronenstücke
    linie("Bruchkanten_linie_2", [(cx + 5.6, cy - 0.4, KRONE - 0.3),
                                  (cx + 5.9, cy - 0.2, KRONE - 0.1),
                                  (cx + 6.1, cy + 0.2, KRONE - 0.1),
                                  (cx + 5.8, cy + 0.4, KRONE - 0.3)])
    linie("Bruchkanten_linie_4", [(cx + 5.6, cy - 0.4, KRONE - 0.29),
                                  (cx + 5.7, cy - 0.6, KRONE - 0.28)])
    linie("Bruchkanten_linie_5", [(cx + 5.8, cy + 0.4, KRONE - 0.30),
                                  (cx + 5.7, cy + 0.6, KRONE - 0.29)])
    # Böschungslinien Sohle -> Krone
    for k, a in enumerate((0.7, 2.3, 3.9, 5.2)):
        linie(f"Bruchkanten_linie_{6 + k}",
              [(round(cx + 2.4 * math.cos(a), 3),
                round(cy + 2.4 * math.sin(a), 3), SOHLE + 0.3),
               (round(cx + 5.7 * math.cos(a), 3),
                round(cy + 5.7 * math.sin(a), 3), KRONE - 0.1)])
    linie("AUSLAUF_linie", [(cx + 6.4, cy - 0.5, KRONE - 0.05),
                            (cx + 6.5, cy - 0.2, KRONE - 0.3),
                            (cx + 6.6, cy + 0.2, KRONE - 0.3),
                            (cx + 6.7, cy + 0.5, KRONE - 0.05)])

    extrusion = (1.0, 0.0, 0.0)
    mitte_wcs = (cx + 6.0, cy, SCHARTE + ROHR_RADIUS)
    msp.add_circle(OCS(Vec3(extrusion)).from_wcs(Vec3(mitte_wcs)), ROHR_RADIUS,
                   dxfattribs={"layer": "AUSLAUF_rohr", "extrusion": extrusion})

    buf = io.StringIO()
    doc.write(buf)
    return {
        "dxf": buf.getvalue().encode("utf-8"),
        "rand": np.array(rand_offen),
        "rand_luecke": float(math.dist(rand_offen[0][:2], rand_offen[-1][:2])),
        "sohle": np.array(sohle),
        "rohr": {"mitte": mitte_wcs, "radius": ROHR_RADIUS,
                 "achse": extrusion},
        "n_linien": 10,
    }


def lese_dxf(data: bytes):
    """DXF-Bytes als ezdxf-Dokument — für Tests, die die Fabrik prüfen."""
    import ezdxf
    return ezdxf.read(io.StringIO(data.decode("utf-8")))
