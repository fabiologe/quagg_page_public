"""
rotate — den ganzen Fall um die z-Achse drehen.

Das Rechengebiet ist ein achsparalleler Quader: blockMesh, die Namen der
Randflächen, die Fensterlage entlang einer Kante und das Höhenraster hängen
alle daran. Ein schräg stehender Quader würde die halbe Kette umkrempeln.
Der übliche Weg im Wasserbau ist deshalb der umgekehrte: nicht das Gebiet
drehen, sondern das MODELL — dann steht das Bauwerk gerade und der Quader
legt sich eng darum. Genau das macht dieses Modul: es dreht jede Koordinate
der Spezifikation und leitet das Gebiet neu ab.

Gedreht wird um den Mittelpunkt des Modellgebiets, damit das Modell an Ort
und Stelle bleibt. `meta.crs_rotation_deg` summiert die Drehungen mit, damit
die Rückverortung ins Landessystem erhalten bleibt.

Drei Dinge kann eine Drehung nicht exakt, sie werden als Hinweis gemeldet:
eine Randbedingung sitzt auf einer ACHSPARALLELEN Gebietsfläche — nach 37°
gibt es diese Fläche nicht mehr, das Fenster wandert auf die nächstgelegene;
ein Verfeinerungsquader wird wieder achsparallel umschrieben und dadurch
etwas größer; ein Schnitt an einer x- oder y-Ebene steht nach der Drehung
schief. Bei Vielfachen von 90° ist alles davon exakt.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from .casespec import CaseSpec
from .terrain import TerrainField


def _dreh(pkte, c: float, s: float, mitte: np.ndarray):
    """(…,2) oder (…,3) um `mitte` drehen; z bleibt unberührt."""
    a = np.array(pkte, dtype=float)
    x = a[..., 0] - mitte[0]
    y = a[..., 1] - mitte[1]
    a[..., 0] = mitte[0] + c * x - s * y
    a[..., 1] = mitte[1] + s * x + c * y
    return a


def _liste(pkte, c, s, mitte) -> list:
    if not pkte:
        return pkte
    return [tuple(round(float(v), 4) for v in p)
            for p in _dreh(np.asarray(pkte, dtype=float), c, s, mitte)]


def _punkt(p, c, s, mitte):
    if p is None:
        return None
    return tuple(round(float(v), 4)
                 for v in _dreh(np.asarray([p], dtype=float), c, s, mitte)[0])


def _normiert(grad: float) -> float:
    """Winkel auf [0, 360) bringen — vier Vierteldrehungen sind wieder 0."""
    return round(float(grad) % 360.0, 4)


def _richtung(v, c, s):
    """Richtungsvektor: dreht ohne Verschiebung."""
    if v is None:
        return None
    x, y = float(v[0]), float(v[1])
    return (round(c * x - s * y, 6), round(s * x + c * y, 6))


# --------------------------------------------------------------------------
# Randbedingungsfenster
# --------------------------------------------------------------------------

_FEST = {"x_min": 0, "x_max": 2, "y_min": 1, "y_max": 3}


def _entlang_achse(face: str) -> np.ndarray:
    """Einheitsvektor der Kante, entlang der ein Fenster vermaßt ist."""
    return np.array([0.0, 1.0]) if face.startswith("x") else np.array([1.0, 0.0])


def _fenster_entlang(spec: CaseSpec, b) -> float | None:
    """Mittlere Lage des Fensters entlang seiner Randkante."""
    w = getattr(b, "window", None)
    x0, y0, x1, y1 = spec.domain.extent
    if w is not None:
        if w.span is not None:
            return (w.span[0] + w.span[1]) / 2
        if w.center is not None:
            return w.center
        if w.points:
            a = [p[0] for p in w.points]
            return (min(a) + max(a)) / 2
    return (y0 + y1) / 2 if b.face.startswith("x") else (x0 + x1) / 2


def _fenstermitte(spec: CaseSpec, b) -> tuple[float, float] | None:
    """Weltlage (x, y) der Fenstermitte auf ihrer Randfläche."""
    if b.face is None or b.face == "z_max" or spec.domain is None:
        return None
    fest = spec.domain.extent[_FEST[b.face]]
    entlang = _fenster_entlang(spec, b)
    return (fest, entlang) if b.face.startswith("x") else (entlang, fest)


def _naechste_flaeche(p, extent) -> str:
    x0, y0, x1, y1 = extent
    abstand = {"x_min": abs(p[0] - x0), "x_max": abs(p[0] - x1),
               "y_min": abs(p[1] - y0), "y_max": abs(p[1] - y1)}
    return min(abstand, key=abstand.get)


# --------------------------------------------------------------------------
# Gelände
# --------------------------------------------------------------------------

def _terrain_drehen(spec: CaseSpec, base_dir: Path, c: float, s: float,
                    mitte: np.ndarray, neues_extent) -> str | None:
    """
    Höhenraster neu abtasten. Ein Raster lässt sich nicht drehen, ohne es
    neu aufzubauen — für jeden Punkt des NEUEN Rasters wird die Höhe an der
    zurückgedrehten Stelle im alten Feld geholt.
    """
    if spec.terrain is None or spec.terrain.base.source.startswith("flat:"):
        return None
    # nur die Basis abtasten; die Operationen wandern als Geometrie mit und
    # würden sonst zweimal wirken
    ohne_ops = spec.terrain.model_copy(update={"operations": []})
    alt = TerrainField.from_spec(ohne_ops, spec.domain, base_dir)
    res = spec.terrain.base.resolution
    x0, y0, x1, y1 = neues_extent
    nx = max(2, int(round((x1 - x0) / res)) + 1)
    ny = max(2, int(round((y1 - y0) / res)) + 1)
    xx, yy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
    # zurückdrehen: die Quelle liegt im ungedrehten System
    quelle = _dreh(np.stack([xx, yy], axis=-1), c, -s, mitte)
    z = np.asarray(alt.sample(quelle[..., 0], quelle[..., 1]), dtype=float)
    # Ecken außerhalb des alten Rasters: mit dem Randwert füllen, damit
    # kein Loch im Gelände entsteht
    gut = np.isfinite(z)
    if not gut.all():
        z = np.where(gut, z, float(z[gut].min()) if gut.any() else 0.0)

    stempel = abs(hash((round(x0, 3), round(y0, 3), nx, ny))) % 10 ** 8
    name = f"gelaende_gedreht_{stempel}.asc"
    zeilen = [f"ncols {nx}", f"nrows {ny}",
              f"xllcorner {x0 - res / 2:.3f}", f"yllcorner {y0 - res / 2:.3f}",
              f"cellsize {res:g}", "nodata_value -9999"]
    for row in z[::-1]:
        zeilen.append(" ".join(f"{v:.3f}" for v in row))
    (base_dir / name).write_text("\n".join(zeilen))
    return name


# --------------------------------------------------------------------------

def rotate_case(spec: CaseSpec, grad: float, base_dir: str | Path = ".") -> dict:
    """
    Fall um `grad` (gegen den Uhrzeigersinn) um die Gebietsmitte drehen.
    Ändert die Spezifikation an Ort und Stelle und gibt Hinweise zurück.
    """
    base_dir = Path(base_dir)
    hinweise: list[str] = []
    if not grad or spec.domain is None:
        return {"hinweise": hinweise}
    r = math.radians(grad)
    c, s = math.cos(r), math.sin(r)
    rechtwinklig = abs(((grad + 45) % 90) - 45) < 1e-6
    x0, y0, x1, y1 = spec.domain.extent
    mitte = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
    R = np.array([[c, -s], [s, c]])
    # Verschiebeanteil der Drehung: G(p) = R·p + a
    a = mitte - R @ mitte

    # Randbedingungen VOR dem Drehen verorten
    alte_lage = {b.id: _fenstermitte(spec, b) for b in spec.boundaries}
    alt_entlang = {b.id: (_fenster_entlang(spec, b)
                          if b.face and b.face != "z_max" else None)
                   for b in spec.boundaries}
    alte_flaeche = {b.id: b.face for b in spec.boundaries}

    # --- neues Gebiet: umschriebenes Rechteck der gedrehten Ecken
    ecken = _dreh(np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]),
                  c, s, mitte)
    neues_extent = (round(float(ecken[:, 0].min()), 3),
                    round(float(ecken[:, 1].min()), 3),
                    round(float(ecken[:, 0].max()), 3),
                    round(float(ecken[:, 1].max()), 3))

    # --- Gelände zuerst (braucht noch das alte Gebiet)
    neuer_name = _terrain_drehen(spec, base_dir, c, s, mitte, neues_extent)
    spec.domain.extent = neues_extent
    if neuer_name:
        spec.terrain.base.source = neuer_name

    # --- Geländeoperationen
    for op in (spec.terrain.operations if spec.terrain else []):
        for feld in ("polyline", "polygon", "oberkante", "unterkante"):
            if getattr(op, feld, None):
                setattr(op, feld, _liste(getattr(op, feld), c, s, mitte))
        if getattr(op, "center", None) is not None:
            op.center = _punkt(op.center, c, s, mitte)
        if getattr(op, "direction", None) is not None:
            op.direction = _richtung(op.direction, c, s)

    # --- Bauwerke
    for st in spec.structures:
        for feld in ("footprint", "axis", "crest_polyline", "plane_polygon"):
            if getattr(st, feld, None):
                setattr(st, feld, _liste(getattr(st, feld), c, s, mitte))
        if getattr(st, "alignment", None) is not None:
            st.alignment.points = _liste(st.alignment.points, c, s, mitte)
        if getattr(st, "center", None) is not None:
            st.center = _punkt(st.center, c, s, mitte)
        if getattr(st, "insert_point", None) is not None:
            st.insert_point = _punkt(st.insert_point, c, s, mitte)
        if getattr(st, "invert_slope_dir", None) is not None:
            st.invert_slope_dir = _richtung(st.invert_slope_dir, c, s)
        if getattr(st, "rotation_deg", None) is not None:
            st.rotation_deg = _normiert(float(st.rotation_deg) + grad)
        for e in getattr(st, "edits", []) or []:
            _edit_drehen(e, c, s, mitte, R, a, grad, rechtwinklig,
                         st.id, hinweise)

    # --- Verfeinerungsquader: gedreht umschrieben
    boxen = [f for f in (spec.mesh.refinements if spec.mesh else [])
             if f.type == "box"]
    for ref in boxen:
        bx0, by0, bz0, bx1, by1, bz1 = ref.extent
        p = _dreh(np.array([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]]),
                  c, s, mitte)
        ref.extent = (round(float(p[:, 0].min()), 3),
                      round(float(p[:, 1].min()), 3), bz0,
                      round(float(p[:, 0].max()), 3),
                      round(float(p[:, 1].max()), 3), bz1)
    if boxen and not rechtwinklig:
        hinweise.append("Verfeinerungsquader wurden achsparallel umschrieben "
                        "— sie sind dadurch etwas größer als vorher")

    # --- Auswertung
    for sec in spec.evaluation.sections:
        sec.polyline = _liste(sec.polyline, c, s, mitte)
    for g in spec.evaluation.gauges:
        g.point = _punkt(g.point, c, s, mitte)

    # --- Randbedingungen: Fläche und Fensterlage neu bestimmen
    for b in spec.boundaries:
        lage = alte_lage.get(b.id)
        if lage is None:
            continue
        neu = _dreh(np.array([lage]), c, s, mitte)[0]
        b.face = _naechste_flaeche(neu, spec.domain.extent)
        if alte_flaeche[b.id] != b.face:
            hinweise.append(f"Rand „{b.id}“ liegt jetzt auf {b.face} "
                            f"(vorher {alte_flaeche[b.id]})")
        w = getattr(b, "window", None)
        if w is None or w.follow is not None:
            continue
        neu_entlang = float(neu[1] if b.face.startswith("x") else neu[0])
        # Läuft die Kante nach der Drehung andersherum, kehrt sich die
        # Vermaßung entlang der Kante mit um
        vz = float(np.sign(np.dot(R @ _entlang_achse(alte_flaeche[b.id]),
                                  _entlang_achse(b.face))) or 1.0)
        alt_a = alt_entlang[b.id]

        def abbilden(a_alt: float) -> float:
            return round(neu_entlang + vz * (a_alt - alt_a), 4)

        if w.span is not None:
            e0, e1 = abbilden(w.span[0]), abbilden(w.span[1])
            w.span = (min(e0, e1), max(e0, e1))
        if w.center is not None:
            w.center = round(neu_entlang, 4)
        if w.points:
            w.points = [(abbilden(p[0]), p[1]) for p in w.points]
    if spec.boundaries and not rechtwinklig:
        hinweise.append("Die Drehung ist kein Vielfaches von 90° — die "
                        "Randfenster sitzen jetzt auf der nächstgelegenen "
                        "Gebietsfläche, bitte Lage und Höhe prüfen")
    if not rechtwinklig:
        hinweise.append("Das Gebiet umschreibt den gedrehten Quader und ist "
                        "dadurch größer geworden: mit den Eckgriffen eng um "
                        "das Modell ziehen und Zu-/Ablaufstutzen bis an die "
                        "neue Kante verlängern")

    spec.meta.crs_rotation_deg = _normiert(
        float(spec.meta.crs_rotation_deg or 0.0) + grad)
    return {"hinweise": hinweise, "extent": spec.domain.extent,
            "rotation_deg": spec.meta.crs_rotation_deg,
            "terrain": neuer_name}


def _edit_drehen(e, c, s, mitte, R, a, grad, rechtwinklig, struct_id,
                 hinweise: list) -> None:
    """Eine Bearbeitung mitdrehen."""
    if getattr(e, "point", None) is not None:
        e.point = _punkt(e.point, c, s, mitte)
    if getattr(e, "direction", None) is not None:
        e.direction = _richtung(e.direction, c, s)

    if e.type == "transform":
        # T(p) = R_d·p + t (Drehung um den Ursprung!). Gesucht ist T' mit
        # T'∘G = G∘T, also T' = G∘T∘G⁻¹. Für Drehungen um z vertauschbar:
        # R_d bleibt, die Verschiebung wird t' = R·t + (I − R_d)·a
        rd = math.radians(e.drehen_deg or 0.0)
        Rd = np.array([[math.cos(rd), -math.sin(rd)],
                       [math.sin(rd), math.cos(rd)]])
        t = np.array(e.verschieben[:2], dtype=float)
        neu = R @ t + (np.eye(2) - Rd) @ a
        e.verschieben = (round(float(neu[0]), 4), round(float(neu[1]), 4),
                         float(e.verschieben[2]))

    elif e.type == "schnitt" and e.achse in ("x", "y"):
        # Schnittebene: Normale mitdrehen und auf die nächste Achse legen
        n = R @ (np.array([1.0, 0.0]) if e.achse == "x" else np.array([0.0, 1.0]))
        # ein Punkt der alten Ebene, gedreht
        p_alt = np.array([e.position, mitte[1]]) if e.achse == "x" \
            else np.array([mitte[0], e.position])
        p_neu = _dreh(np.array([p_alt]), c, s, mitte)[0]
        if abs(n[0]) >= abs(n[1]):
            e.achse, e.position, vz = "x", round(float(p_neu[0]), 4), n[0]
        else:
            e.achse, e.position, vz = "y", round(float(p_neu[1]), 4), n[1]
        if vz < 0:
            e.behalten = "ueber" if e.behalten == "unter" else "unter"
        if not rechtwinklig:
            hinweise.append(
                f"Schnitt „{e.id}“ an {struct_id} stand senkrecht zu einer "
                "Achse — nach der Drehung ist er auf die nächste Achse "
                "gelegt und damit nur noch näherungsweise richtig")
