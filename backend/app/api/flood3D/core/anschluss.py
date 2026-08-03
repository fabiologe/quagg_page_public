"""
anschluss — den Fall nach einer Drehung oder einem Zuschnitt wieder
anschlussfähig machen.

Ein Rechengebiet ist ein achsparalleler Quader; die Zu- und Abläufe leben
auf seinen Flächen. Sobald das Gebiet gedreht oder enger gezogen wird,
stimmen drei mechanische Dinge nicht mehr, die nichts mit Wasserbau zu tun
haben, den Lauf aber blockieren:

* die Randbedingung zeigt auf die falsche Gebietsfläche (das Rohr endet
  inzwischen an einer anderen),
* die Rohrachse endet vor oder weit hinter der Fläche, sodass die Mündung
  nicht mehr angeschnitten wird,
* ein Verfeinerungsquader ragt aus dem Gebiet heraus.

Alle drei lassen sich eindeutig aus der Geometrie herleiten — genau das
macht dieses Modul. Es ändert bewusst NICHTS an der Fachaussage: die
Rohrachse behält ihre Richtung (der Rohrscheitel bleibt, wie er liegt),
sie wird nur bis an die Gebietsfläche verlängert bzw. gekürzt.
"""
from __future__ import annotations

import numpy as np

from .casespec import CaseSpec

_PLANE = {"x_min": 0, "x_max": 2, "y_min": 1, "y_max": 3}
_ACHSE = {"x_min": 0, "x_max": 0, "y_min": 1, "y_max": 1}


def _naechste_flaeche(spec: CaseSpec, punkt) -> str:
    x0, y0, x1, y1 = spec.domain.extent
    return min({"x_min": abs(punkt[0] - x0), "x_max": abs(punkt[0] - x1),
                "y_min": abs(punkt[1] - y0), "y_max": abs(punkt[1] - y1)}.items(),
               key=lambda kv: kv[1])[0]


def _durchstoss(p, richtung, ebene: float, achse: int, ueberstand: float):
    """
    Punkt auf der Achse, der die Ebene um `ueberstand` überragt. None, wenn
    die Achse (nahezu) parallel zur Fläche läuft — dann ist die Verlängerung
    keine Frage der Länge, sondern der Ausrichtung.
    """
    d = richtung[achse]
    if abs(d) < 1e-9:
        return None
    t = (ebene - p[achse]) / d
    ziel = np.asarray(p, dtype=float) + t * richtung
    # ein Stück weiter in Achsrichtung: eine Fläche, die exakt auf der
    # Gebietsebene endet, schneidet snappyHexMesh unsauber an
    return ziel + (ueberstand / abs(d)) * richtung


def stutzen_anschliessen(spec: CaseSpec, cv, face: str,
                         ueberstand: float | None = None) -> str | None:
    """
    Achsende des Durchlasses bis auf die Gebietsfläche `face` führen
    (Richtung bleibt). Gibt eine Beschreibung der Änderung zurück oder None.
    """
    if spec.domain is None or len(cv.axis) < 2:
        return None
    ebene = spec.domain.extent[_PLANE[face]]
    achse = _ACHSE[face]
    if ueberstand is None:
        ueberstand = spec.mesh.base_cell if spec.mesh else 0.25

    # das Ende, das der Fläche näher liegt, wird angeschlossen
    kopf = abs(cv.axis[0][achse] - ebene) <= abs(cv.axis[-1][achse] - ebene)
    p = np.asarray(cv.axis[0] if kopf else cv.axis[-1], dtype=float)
    nachbar = np.asarray(cv.axis[1] if kopf else cv.axis[-2], dtype=float)
    richtung = p - nachbar
    if np.linalg.norm(richtung[:2]) < 1e-9:
        return (f"Stutzen „{cv.id}“: das Achsende steht senkrecht — die "
                "Richtung lässt sich nicht fortsetzen")
    ziel = _durchstoss(p, richtung, ebene, achse, ueberstand)
    if ziel is None:
        return (f"Stutzen „{cv.id}“ läuft parallel zur Fläche {face} — "
                "bitte die Achse ausrichten oder eine andere Fläche wählen")
    alt = p[achse]
    neu = tuple(round(float(v), 4) for v in ziel)
    if kopf:
        cv.axis[0] = neu
    else:
        cv.axis[-1] = neu
    weg = abs(ziel[achse] - alt)
    return (f"Stutzen „{cv.id}“: Achsende um {weg:.2f} m in seiner eigenen "
            f"Richtung verschoben — es steht jetzt {ueberstand:g} m über die "
            f"Fläche {face} hinaus (Rohrlage und -neigung unverändert)")


def boxen_ins_gebiet(spec: CaseSpec) -> list[str]:
    """Verfeinerungsquader auf das Modellgebiet beschneiden."""
    meldungen: list[str] = []
    if spec.domain is None or spec.mesh is None:
        return meldungen
    x0, y0, x1, y1 = spec.domain.extent
    for ref in spec.mesh.refinements:
        if ref.type != "box":
            continue
        bx0, by0, bz0, bx1, by1, bz1 = ref.extent
        nx0, ny0 = max(bx0, x0), max(by0, y0)
        nx1, ny1 = min(bx1, x1), min(by1, y1)
        nz0 = max(bz0, spec.domain.z_min)
        nz1 = min(bz1, spec.domain.z_max)
        if (nx0, ny0, nz0, nx1, ny1, nz1) == tuple(ref.extent):
            continue
        if nx1 - nx0 < 1e-6 or ny1 - ny0 < 1e-6 or nz1 - nz0 < 1e-6:
            meldungen.append(f"Verfeinerungsquader „{ref.id}“ liegt komplett "
                             "außerhalb des Gebiets — bitte löschen oder "
                             "neu setzen")
            continue
        ref.extent = (round(nx0, 3), round(ny0, 3), round(nz0, 3),
                      round(nx1, 3), round(ny1, 3), round(nz1, 3))
        meldungen.append(f"Verfeinerungsquader „{ref.id}“ auf das Gebiet "
                         "beschnitten")
    return meldungen


def gebiet_umschliesst_fenster(spec: CaseSpec) -> list[str]:
    """
    Gebietshöhe so weit aufziehen, dass jede Öffnung hineinpasst. Eine
    Rohrmündung, die unter der Gebietssohle liegt, kann der Vernetzer nicht
    anschneiden — das Loch fehlt dann einfach, und der Lauf endet mit
    „No matching patches".
    """
    from .casebuilder import resolve_window

    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen
    rand = 0.5 * (spec.mesh.base_cell if spec.mesh else 0.25)
    for b in spec.boundaries:
        if getattr(b, "window", None) is None:
            continue
        try:
            r = resolve_window(spec, b)
        except Exception:
            continue
        if r is None or r.get("zlo") is None:
            continue
        if r["zlo"] < spec.domain.z_min:
            alt = spec.domain.z_min
            spec.domain.z_min = round(r["zlo"] - rand, 3)
            meldungen.append(
                f"Gebietssohle von {alt:g} auf {spec.domain.z_min:g} m "
                f"abgesenkt — die Öffnung „{b.id}“ lag darunter")
        if r.get("zhi") is not None and r["zhi"] > spec.domain.z_max:
            alt = spec.domain.z_max
            spec.domain.z_max = round(r["zhi"] + rand, 3)
            meldungen.append(
                f"Gebietsdeckel von {alt:g} auf {spec.domain.z_max:g} m "
                f"angehoben — die Öffnung „{b.id}“ ragte darüber")
    return meldungen


def anschluesse_herstellen(spec: CaseSpec) -> list[str]:
    """
    Alle mechanischen Anschlüsse in Ordnung bringen. Rückgabe: was geändert
    wurde (leere Liste = es war schon alles stimmig).
    """
    from .casebuilder import _follow_channel, _follow_culvert

    meldungen: list[str] = []
    if spec.domain is None:
        return meldungen

    for b in spec.boundaries:
        w = getattr(b, "window", None)
        if w is None or w.follow is None:
            continue
        cv = _follow_culvert(spec, w)
        ch = _follow_channel(spec, w)
        if cv is not None:
            enden = [cv.axis[0], cv.axis[-1]]
        elif ch is not None:
            enden = [ch.polyline[0], ch.polyline[-1]]
        else:
            continue
        # die Fläche ergibt sich aus der Geometrie, nicht umgekehrt: das
        # Ende, das dem Gebietsrand am nächsten liegt, bestimmt sie
        kandidaten = [(_naechste_flaeche(spec, e), e) for e in enden]
        face, ende = min(kandidaten, key=lambda ke: abs(
            ke[1][_ACHSE[ke[0]]] - spec.domain.extent[_PLANE[ke[0]]]))
        belegt = {x.face: x.id for x in spec.boundaries
                  if x.id != b.id and x.face is not None}
        if face in belegt and b.face != face:
            # zwei Randbedingungen auf einer Quaderfläche kann blockMesh
            # nicht — das ist eine fachliche Entscheidung, keine mechanische
            meldungen.append(
                f"Rand „{b.id}“ endet an der Fläche {face}, dort liegt aber "
                f"schon „{belegt[face]}“ — eine der beiden muss auf eine "
                "andere Fläche, oder das Gebiet ist anders zu schneiden")
            continue
        if b.face != face:
            meldungen.append(f"Rand „{b.id}“ auf die Fläche {face} gelegt "
                             f"(war {b.face}) — dort endet „{w.follow}“")
            b.face = face
        if cv is not None:
            zelle = spec.mesh.base_cell if spec.mesh else 0.25
            # Soll: das Achsende steht eine Basiszelle ÜBER die Fläche
            # hinaus. Nur wenn es davon merklich abweicht, wird angefasst —
            # sonst meldete jede Reparatur eine Verschiebung um 0,00 m.
            aussen = 1.0 if face.endswith("max") else -1.0
            ueber = aussen * (ende[_ACHSE[face]]
                              - spec.domain.extent[_PLANE[face]])
            if abs(ueber - zelle) > 0.5 * zelle:
                m = stutzen_anschliessen(spec, cv, face)
                if m:
                    meldungen.append(m)

    meldungen.extend(gebiet_umschliesst_fenster(spec))
    meldungen.extend(boxen_ins_gebiet(spec))
    return meldungen
