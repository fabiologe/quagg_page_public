"""
terrain — Höhenfeld und Operationsstapel (Spez. Kap. 5.1 und 6.2).

Das Gelände ist ein reguläres Knotenraster (ny, nx) über dem Modellgebiet.
Die Operationen werden in Reihenfolge des Stapels auf das Raster angewendet
und bleiben in der casespec dokumentiert — das Raster ist reine Ableitung.
Die Tessellierung nach STL ist die eine Codestelle für Vorschau und
Rechnung (Spez. Kap. 11).

Basisquellen: "flat:<z>" (konstante Höhe), ESRI-ASCII-Grid (.asc),
XYZ-Punktliste (.xyz). GeoTIFF folgt, wenn ein echter Anwendungsfall
es braucht (rasterio wäre eine schwere Zusatzabhängigkeit).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import shapely
import trimesh
from matplotlib.path import Path as MplPath

from .casespec import Domain, Terrain


# --------------------------------------------------------------------------
# Geometrie-Helfer
# --------------------------------------------------------------------------

def _polygon_mask(xx: np.ndarray, yy: np.ndarray, polygon: list) -> np.ndarray:
    path = MplPath(np.asarray(polygon))
    pts = np.column_stack([xx.ravel(), yy.ravel()])
    return path.contains_points(pts).reshape(xx.shape)


def _dist_and_param_to_polyline(xx, yy, polyline):
    """
    Abstand jedes Rasterpunkts zur Polylinie und Bogenlängenparameter s in
    [0, 1] des Fußpunkts — für entlang der Achse interpolierte Sohlhöhen.
    """
    pts = np.column_stack([xx.ravel(), yy.ravel()])
    poly = np.asarray(polyline, dtype=float)
    seg_vec = np.diff(poly, axis=0)
    seg_len = np.linalg.norm(seg_vec, axis=1)
    total = seg_len.sum()
    seg_start_s = np.concatenate([[0.0], np.cumsum(seg_len)[:-1]])

    best_d = np.full(len(pts), np.inf)
    best_s = np.zeros(len(pts))
    for a, vec, length, s0 in zip(poly[:-1], seg_vec, seg_len, seg_start_s):
        if length == 0:
            continue
        t = np.clip(((pts - a) @ vec) / (length**2), 0.0, 1.0)
        foot = a + t[:, None] * vec
        d = np.linalg.norm(pts - foot, axis=1)
        closer = d < best_d
        best_d[closer] = d[closer]
        best_s[closer] = (s0 + t[closer] * length) / total
    return best_d.reshape(xx.shape), best_s.reshape(xx.shape)


def laplace_fuellen(z: np.ndarray, fest: np.ndarray,
                    schritte: int = 400, toleranz: float = 1e-4) -> np.ndarray:
    """
    Freie Rasterknoten stufenfrei aus den festen ergänzen.

    Gelöst wird die Laplace-Gleichung mit den festen Knoten als Randwert:
    jeder freie Knoten wird zum Mittel seiner vier Nachbarn. Das Ergebnis
    ist die Fläche mit der geringsten Krümmung, die durch die gegebenen
    Höhen geht — keine Stufen, keine Beulen, und an den festen Knoten
    exakt der vorgegebene Wert.

    Der bisherige Weg war „nimm die Höhe des NÄCHSTEN Stützpunkts". Das
    ist ein Voronoi-Feld: stückweise konstant, mit einer Stufe an jeder
    Zellgrenze. Liegen Ober- und Unterkante einer Böschung nebeneinander,
    steht dazwischen die volle Höhendifferenz als senkrechte Wand statt
    einer Neigung — genau die „automatischen Höhensprünge" beim Import.

    `fest` ist die Maske der bekannten Knoten. Sind keine bekannt, bleibt
    das Feld unverändert.
    """
    z = np.array(z, dtype=float)
    fest = np.asarray(fest, dtype=bool)
    if not fest.any() or fest.all():
        return z
    # Startwert: die Höhe des nächsten bekannten Knotens. Das ist genau das
    # alte Voronoi-Feld — als ERGEBNIS untauglich (die Stufen), als
    # Startwert aber das Beste, was ohne Rechnung zu haben ist: die
    # Relaxation muss danach nur noch glätten statt die Höhe erst zu
    # finden. Ohne diesen Start blieb eine 8 m weite Fläche 0,11 m unter
    # ihrer Randhöhe hängen, weil die Iteration nicht durchlief.
    from scipy.spatial import cKDTree

    frei = ~fest
    jj, ii = np.nonzero(fest)
    _, nachbar = cKDTree(np.column_stack([jj, ii])).query(
        np.column_stack(np.nonzero(frei)))
    z[frei] = z[fest][nachbar]

    # Nur um den freien Bereich herum rechnen. Eine Bruchkante mit
    # `fuellen` betrifft oft ein paar Meter in einem 100-m-Gebiet — über
    # das ganze Raster zu iterieren kostete dort Sekunden, und das
    # Gelände wird bei JEDER Eingabe neu gebaut (Entwurfsvorschau).
    jz, iz = np.nonzero(frei)
    j0, j1 = max(int(jz.min()) - 1, 0), min(int(jz.max()) + 2, z.shape[0])
    i0, i1 = max(int(iz.min()) - 1, 0), min(int(iz.max()) + 2, z.shape[1])
    aus = z
    z = z[j0:j1, i0:i1]
    fest = fest[j0:j1, i0:i1]

    for _ in range(max(schritte, 1)):
        # Rand über 'edge' fortsetzen: am Gebietsrand gilt Neumann
        # (Ableitung null), das Gelände läuft dort waagerecht aus statt
        # gegen eine erfundene Höhe zu ziehen
        p = np.pad(z, 1, mode="edge")
        mittel = 0.25 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
        neu = np.where(fest, z, mittel)
        aenderung = float(np.max(np.abs(neu - z)))
        z = neu
        if aenderung < toleranz:
            break
    aus[j0:j1, i0:i1] = z
    return aus


def _z_entlang(poly3: np.ndarray, s: np.ndarray) -> np.ndarray:
    """
    Höhe der 3D-Polylinie am Bogenlängenparameter s (0…1) — das Gegenstück
    zu _dist_and_param_to_polyline, damit eine Kante ihre Höhe JE
    STÜTZPUNKT behält statt sie zwischen Anfang und Ende zu raten.
    """
    seg = np.linalg.norm(np.diff(poly3[:, :2], axis=0), axis=1)
    ges = seg.sum()
    if ges <= 0:
        return np.full(np.shape(s), float(poly3[0, 2]))
    knoten = np.concatenate([[0.0], np.cumsum(seg)]) / ges
    return np.interp(s, knoten, poly3[:, 2])


def _gleichlaeufig(a: list, b: list) -> list:
    """
    Zweite Linie umdrehen, wenn sie gegenläufig digitalisiert wurde.
    Sonst kreuzen sich Ober- und Unterkante, das Band wird zur Schleife
    und die Böschung entsteht an der falschen Stelle — ein Fehler, den man
    im Vermessungs-DXF nicht sieht.
    """
    a0 = np.asarray(a[0][:2], dtype=float)
    b0 = np.asarray(b[0][:2], dtype=float)
    b1 = np.asarray(b[-1][:2], dtype=float)
    return list(b) if np.linalg.norm(a0 - b0) <= np.linalg.norm(a0 - b1) \
        else list(b)[::-1]


def _box_blur(z: np.ndarray, k: int) -> np.ndarray:
    """Separierbarer Mittelwertfilter über (2k+1)² ohne scipy."""
    if k < 1:
        return z.copy()
    win = 2 * k + 1
    pad = np.pad(z, k, mode="edge")                      # (ny+2k, nx+2k)
    c = np.cumsum(np.vstack([np.zeros((1, pad.shape[1])), pad]), axis=0)
    v = (c[win:, :] - c[:-win, :]) / win                 # (ny, nx+2k)
    c = np.cumsum(np.hstack([np.zeros((v.shape[0], 1)), v]), axis=1)
    return (c[:, win:] - c[:, :-win]) / win              # (ny, nx)


def _sample_bilinear(src_z, src_x0, src_y0, src_res, x, y):
    fx = np.clip((x - src_x0) / src_res, 0, src_z.shape[1] - 1.001)
    fy = np.clip((y - src_y0) / src_res, 0, src_z.shape[0] - 1.001)
    i0 = fx.astype(int)
    j0 = fy.astype(int)
    dx = fx - i0
    dy = fy - j0
    return (src_z[j0, i0] * (1 - dx) * (1 - dy) + src_z[j0, i0 + 1] * dx * (1 - dy)
            + src_z[j0 + 1, i0] * (1 - dx) * dy + src_z[j0 + 1, i0 + 1] * dx * dy)


# --------------------------------------------------------------------------
# Basisquellen
# --------------------------------------------------------------------------

def _load_base(source: str, base_dir: Path, xx, yy) -> np.ndarray:
    if source.startswith("flat:"):
        return np.full(xx.shape, float(source.split(":", 1)[1]))
    path = (base_dir / source) if not Path(source).is_absolute() else Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Geländebasis nicht gefunden: {path}")
    if path.suffix.lower() == ".asc":
        return _load_esri_ascii(path, xx, yy)
    if path.suffix.lower() == ".xyz":
        return _load_xyz(path, xx, yy)
    raise ValueError(f"Nicht unterstützte Geländebasis: {path.suffix} "
                     "(unterstützt: flat:<z>, .asc, .xyz)")


def _load_esri_ascii(path: Path, xx, yy) -> np.ndarray:
    header: dict[str, float] = {}
    rows: list[np.ndarray] = []
    with open(path) as f:
        for line in f:
            parts = line.split()
            if not parts:
                continue
            if parts[0].lower() in ("ncols", "nrows", "xllcorner", "yllcorner",
                                    "cellsize", "nodata_value"):
                header[parts[0].lower()] = float(parts[1])
            else:
                rows.append(np.array(parts, dtype=float))
    z = np.vstack(rows)[::-1]     # ASCII-Grid ist von Nord nach Süd notiert
    nodata = header.get("nodata_value")
    if nodata is not None and np.any(z == nodata):
        # Fehlstellen von der NÄCHSTEN bekannten Höhe fortführen. Der
        # Mittelwert aller Zellen war hier lange der Standard — bei einem
        # Becken mit tiefer Sohle und hohem Rand entstand daraus mitten im
        # Modell ein Plateau auf mittlerer Höhe.
        luecke = z == nodata
        if not luecke.all():
            from scipy.spatial import cKDTree
            jj, ii = np.nonzero(~luecke)
            baum = cKDTree(np.column_stack([ii, jj]))
            qj, qi = np.nonzero(luecke)
            _, nachbar = baum.query(np.column_stack([qi, qj]))
            z = z.copy()
            z[luecke] = z[~luecke][nachbar]
        else:
            z = np.zeros_like(z)
    x0 = header["xllcorner"] + header["cellsize"] / 2
    y0 = header["yllcorner"] + header["cellsize"] / 2
    return _sample_bilinear(z, x0, y0, header["cellsize"], xx, yy)


def _load_xyz(path: Path, xx, yy) -> np.ndarray:
    data = np.loadtxt(path)
    res = float(np.median(np.diff(np.unique(data[:, 0]))) or 1.0)
    x0, y0 = data[:, 0].min(), data[:, 1].min()
    nx = int(round((data[:, 0].max() - x0) / res)) + 1
    ny = int(round((data[:, 1].max() - y0) / res)) + 1
    z = np.full((ny, nx), np.nan)
    i = np.round((data[:, 0] - x0) / res).astype(int)
    j = np.round((data[:, 1] - y0) / res).astype(int)
    z[j, i] = data[:, 2]
    if np.isnan(z).any():
        z = np.where(np.isnan(z), np.nanmean(z), z)
    return _sample_bilinear(z, x0, y0, res, xx, yy)


# --------------------------------------------------------------------------
# Höhenfeld
# --------------------------------------------------------------------------

@dataclass
class TerrainField:
    x0: float
    y0: float
    resolution: float
    z: np.ndarray                 # (ny, nx), Knotenwerte
    # Operationsstapel, damit eine Außenkante ihre innere Bezugslinie
    # findet — sie bezieht sich auf eine ANDERE Operation
    _ops: list = field(default_factory=list, repr=False, compare=False)
    # Verzeichnis des Falls: dort liegen die Zusatzraster von
    # „Bereich ersetzen"
    _base_dir: Path = field(default_factory=lambda: Path("."), repr=False,
                            compare=False)

    @classmethod
    def from_spec(cls, terrain: Terrain, domain: Domain,
                  base_dir: Path | str = ".") -> "TerrainField":
        x0, y0, x1, y1 = domain.extent
        res = terrain.base.resolution
        nx = int(round((x1 - x0) / res)) + 1
        ny = int(round((y1 - y0) / res)) + 1
        xx, yy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
        z = _load_base(terrain.base.source, Path(base_dir), xx, yy)
        field = cls(x0=x0, y0=y0, resolution=res, z=z.astype(float))
        field._ops = list(terrain.operations)
        field._base_dir = Path(base_dir)
        for op in terrain.operations:
            field.apply(op)
        return field

    # -- Raster --

    def mesh_xy(self):
        ny, nx = self.z.shape
        return np.meshgrid(self.x0 + np.arange(nx) * self.resolution,
                           self.y0 + np.arange(ny) * self.resolution)

    def sample(self, x, y):
        return _sample_bilinear(self.z, self.x0, self.y0, self.resolution,
                                np.asarray(x, dtype=float), np.asarray(y, dtype=float))

    # -- Operationsstapel (Spez. 6.2) --

    def apply(self, op) -> None:
        getattr(self, f"_op_{op.type}")(op)

    def _op_channel_carve(self, op):
        xx, yy = self.mesh_xy()
        dist, s = _dist_and_param_to_polyline(xx, yy, op.polyline)
        invert = op.invert_start + (op.invert_end - op.invert_start) * s
        n = max(op.side_slope, 1e-6)
        z_target = invert + np.maximum(0.0, dist - op.bottom_width / 2) / n
        influence = dist <= op.bottom_width / 2 + op.depth * n
        self.z = np.where(influence, np.minimum(self.z, z_target), self.z)

    def _op_bruchkante(self, op):
        xx, yy = self.mesh_xy()
        poly = np.asarray(op.polyline, dtype=float)
        dist, s = _dist_and_param_to_polyline(xx, yy, poly[:, :2])
        z_linie = _z_entlang(poly, s)
        # linear ausblenden: auf der Linie voll, an der Wirkungsbreite null
        w = np.clip(1.0 - dist / max(op.breite, 1e-6), 0.0, 1.0)
        ziel = self.z * (1 - w) + z_linie * w
        if op.modus == "absenken":
            self.z = np.minimum(self.z, ziel)
        elif op.modus == "anheben":
            self.z = np.maximum(self.z, ziel)
        elif op.modus in ("ebnen", "fuellen"):
            self._kante_flaechig(op, poly, xx, yy, ziel, w)
        else:
            self.z = ziel

    def _kante_flaechig(self, op, poly, xx, yy, ziel, w):
        """
        Die Fläche INNERHALB einer geschlossenen Bruchkante herstellen.

        Ohne das wirkt eine geschlossene Kante nur als Ring der Breite
        `breite`; alles weiter innen bleibt so liegen, wie es der Import
        hinterlassen hat. Für ein Planum, eine Beckensohle oder eine
        Parkfläche ist genau das Innere das Gewollte.

            ebnen    Ausgleichsebene durch die Kantenhöhen (kleinste
                     Fehlerquadrate). Innen garantiert eben.
            fuellen  Fläche geringster Krümmung durch die Kante — folgt
                     einer geneigten Kante und schließt bündig an.

        Die Kante selbst wird in beiden Fällen wie gewohnt eingezogen,
        damit der Übergang nach außen stufenfrei bleibt.
        """
        ring = poly[:, :2]
        if np.linalg.norm(ring[0] - ring[-1]) > 1e-9:
            ring = np.vstack([ring, ring[:1]])          # gedanklich schließen
        innen = _polygon_mask(xx, yy, ring)
        if not innen.any():
            self.z = ziel                                # zu klein: wie ziehen
            return

        if op.modus == "ebnen":
            # z = a*x + b*y + c über die Stützpunkte, kleinste Quadrate.
            # Bei einer waagerechten Kante fällt daraus exakt ihre Höhe.
            a = np.column_stack([poly[:, 0], poly[:, 1], np.ones(len(poly))])
            koef, *_ = np.linalg.lstsq(a, poly[:, 2], rcond=None)
            flaeche = koef[0] * xx + koef[1] * yy + koef[2]
            self.z = np.where(innen, flaeche, ziel)
            return

        # fuellen: die KANTE ist der feste Rand, das Innere wird daraus
        # stufenfrei ergänzt. Der Kantenschlauch muss mindestens eine
        # Rasterweite breit sein, sonst trennt er innen und außen nicht und
        # das Außengelände zieht die Fläche zu sich.
        schlauch = self._kantenschlauch(op, xx, yy)
        frei = innen & ~schlauch
        if not frei.any():
            self.z = ziel
            return
        start = np.where(schlauch, self._z_auf_kante(poly, xx, yy), ziel)
        self.z = laplace_fuellen(start, ~frei)

    def _kantenschlauch(self, op, xx, yy):
        dist, _ = _dist_and_param_to_polyline(xx, yy, np.asarray(
            op.polyline, dtype=float)[:, :2])
        return dist <= max(op.breite, self.resolution * 1.5)

    @staticmethod
    def _z_auf_kante(poly, xx, yy):
        _, s = _dist_and_param_to_polyline(xx, yy, poly[:, :2])
        return _z_entlang(poly, s)

    def _op_boeschung(self, op):
        xx, yy = self.mesh_xy()
        ok = np.asarray(op.oberkante, dtype=float)
        uk = np.asarray(_gleichlaeufig(op.oberkante, op.unterkante),
                        dtype=float)
        d_o, s_o = _dist_and_param_to_polyline(xx, yy, ok[:, :2])
        d_u, s_u = _dist_and_param_to_polyline(xx, yy, uk[:, :2])
        z_o = _z_entlang(ok, s_o)
        z_u = _z_entlang(uk, s_u)
        # Anteil quer zur Böschung: 0 an der Ober-, 1 an der Unterkante
        t = d_o / np.maximum(d_o + d_u, 1e-9)
        flaeche = z_o + (z_u - z_o) * t
        # wirksam ist nur das Band ZWISCHEN den Kanten
        rand = np.vstack([ok[:, :2], uk[::-1, :2]])
        # Knoten GENAU auf einer Kante zählt contains_points als außen —
        # dort bliebe sonst die alte Höhe als Stufe stehen. Eine halbe
        # Rasterweite Toleranz beidseitig räumt das ab.
        band = (_polygon_mask(xx, yy, rand)
                | (d_o <= self.resolution / 2)
                | (d_u <= self.resolution / 2))
        self.z = np.where(band, flaeche, self.z)
        # optional greifen die Kanten selbst noch etwas nach außen
        if op.kanten_breite > 0:
            for linie in (ok, uk):
                dist, s = _dist_and_param_to_polyline(xx, yy, linie[:, :2])
                w = np.clip(1.0 - dist / op.kanten_breite, 0.0, 1.0)
                w = np.where(band, 0.0, w)      # innen gilt die Regelfläche
                self.z = self.z * (1 - w) + _z_entlang(linie, s) * w

    def _op_aussenkante(self, op):
        """
        Das Gelände außerhalb der letzten Vermessungslinie bestimmen.

        Regelfall (ohne `polygon`): von der Bezugskante aus mit `gefaelle`
        nach außen fortführen, bis an den Gebietsrand. Das ist die Antwort
        auf die Frage, was hinter der Böschungsoberkante passiert — ohne
        diese Operation steht dort, was der Import aus der NÄCHSTEN
        gemessenen Höhe fortgeführt hat, und das kann jede Welle des
        Aufmaßes bis über den Gebietsdeckel tragen.

        Mit `polygon`: zwischen Bezugskante und diesem Rahmen linear
        überblenden — für den Fall, dass die Ränder von Hand gesetzt werden.

        Innerhalb der Bezugskante bleibt das Gelände unangetastet, dort
        liegt die Vermessung.
        """
        innen = self._bezugskante(op)
        if innen is None:
            return
        xx, yy = self.mesh_xy()
        i = np.vstack([innen, innen[:1]]) if not np.allclose(
            innen[0], innen[-1]) else innen
        d_i, s_i = _dist_and_param_to_polyline(xx, yy, i[:, :2])
        z_i = _z_entlang(i, s_i)
        aussen = ~_polygon_mask(xx, yy, i[:, :2])

        if not op.polygon:
            # adaptiv: die Kante trägt sich selbst nach außen fort
            self.z = np.where(aussen, z_i + op.gefaelle * d_i, self.z)
            return

        rahmen = np.asarray(op.polygon, dtype=float)
        if len(rahmen) < 3:
            return
        r = np.vstack([rahmen, rahmen[:1]])
        d_r, s_r = _dist_and_param_to_polyline(xx, yy, r[:, :2])
        z_r = _z_entlang(r, s_r)
        t = d_i / np.maximum(d_i + d_r, 1e-9)
        self.z = np.where(aussen, z_i + (z_r - z_i) * t, self.z)

    def _bezugskante(self, op) -> np.ndarray | None:
        """Innere Linie der Außenkante: benannte Operation oder die erste
        Böschungsoberkante im Stapel."""
        kandidaten = getattr(self, "_ops", []) or []
        for o in kandidaten:
            if op.innen and o.id != op.innen:
                continue
            if getattr(o, "oberkante", None):
                return np.asarray(o.oberkante, dtype=float)
            if o.type == "bruchkante" and getattr(o, "polyline", None):
                return np.asarray(o.polyline, dtype=float)
        return None

    def _op_pad(self, op):
        xx, yy = self.mesh_xy()
        self.z = np.where(_polygon_mask(xx, yy, op.polygon), op.level, self.z)

    def _op_raise_lower(self, op):
        xx, yy = self.mesh_xy()
        r = np.hypot(xx - op.center[0], yy - op.center[1]) / max(op.radius, 1e-6)
        if op.falloff == "constant":
            f = (r <= 1).astype(float)
        elif op.falloff == "linear":
            f = np.clip(1 - r, 0, 1)
        else:                      # smooth
            f = np.clip(1 - r**2, 0, 1) ** 2
        self.z = self.z + op.strength * f

    def _op_smooth(self, op):
        xx, yy = self.mesh_xy()
        if op.polygon:
            mask = _polygon_mask(xx, yy, op.polygon)
        else:
            mask = np.hypot(xx - op.center[0], yy - op.center[1]) <= op.radius
        k = max(1, int(round(op.radius / self.resolution / 2)))
        blurred = _box_blur(self.z, k)
        w = np.clip(op.strength, 0, 1) * mask
        self.z = self.z * (1 - w) + blurred * w

    def _op_ramp(self, op):
        xx, yy = self.mesh_xy()
        mask = _polygon_mask(xx, yy, op.polygon)
        d = np.asarray(op.direction, dtype=float)
        d = d / (np.linalg.norm(d) or 1.0)
        proj = xx * d[0] + yy * d[1]
        p = proj[mask]
        if not p.size:
            return
        t = (proj - p.min()) / max(p.max() - p.min(), 1e-9)
        levels = op.level_start + (op.level_end - op.level_start) * np.clip(t, 0, 1)
        self.z = np.where(mask, levels, self.z)

    def _op_embankment(self, op):
        xx, yy = self.mesh_xy()
        dist, _ = _dist_and_param_to_polyline(xx, yy, op.polyline)
        n = max(op.side_slope, 1e-6)
        z_target = op.crest_level - np.maximum(0.0, dist - op.crest_width / 2) / n
        self.z = np.maximum(self.z, z_target)

    def _op_replace_region(self, op):
        xx, yy = self.mesh_xy()
        mask = _polygon_mask(xx, yy, op.polygon)
        replacement = _load_base(op.source, self._base_dir, xx, yy)
        self.z = np.where(mask, replacement, self.z)

    def _op_set_level(self, op):
        xx, yy = self.mesh_xy()
        mask = _polygon_mask(xx, yy, op.polygon)
        z_new = np.where(mask, op.level, self.z)
        if op.blend_width > 0:
            ring = shapely.Polygon(op.polygon).exterior
            pts = shapely.points(xx.ravel(), yy.ravel())
            d = shapely.distance(pts, ring).reshape(xx.shape)
            w = np.clip(1 - d / op.blend_width, 0, 1)
            outside = ~mask
            z_new = np.where(outside, self.z * (1 - w) + op.level * w, z_new)
        self.z = z_new

    # -- Tessellierung: die eine Codestelle für Vorschau und Rechnung --

    def to_trimesh(self) -> trimesh.Trimesh:
        ny, nx = self.z.shape
        xx, yy = self.mesh_xy()
        verts = np.column_stack([xx.ravel(), yy.ravel(), self.z.ravel()])
        idx = np.arange(nx * ny).reshape(ny, nx)
        a = idx[:-1, :-1].ravel()
        b = idx[:-1, 1:].ravel()
        c = idx[1:, 1:].ravel()
        d = idx[1:, :-1].ravel()
        faces = np.concatenate([np.column_stack([a, b, c]),
                                np.column_stack([a, c, d])])
        return trimesh.Trimesh(vertices=verts, faces=faces, process=False)

    def to_solid(self, unterkante: float,
                 ueberstand: float = 0.0) -> trimesh.Trimesh:
        """
        Das Gelände als geschlossener Erdkörper: Oberfläche, vier Seiten
        bis `unterkante` und ein Boden. Nur so lässt sich etwas
        HERAUSSCHNEIDEN — eine offene Höhenfläche hat kein Innen und kein
        Außen, ein Rohr könnte sie nicht durchstoßen.

        `ueberstand` schiebt die Ränder nach außen: die senkrechten Wände
        des Körpers dürfen NICHT genau auf den Gebietsflächen liegen, sonst
        schneidet snappyHexMesh zwei deckungsgleiche Flächen gegeneinander.
        """
        ny, nx = self.z.shape
        xx, yy = self.mesh_xy()
        if ueberstand:
            xx = xx.copy()
            yy = yy.copy()
            xx[:, 0] -= ueberstand
            xx[:, -1] += ueberstand
            yy[0, :] -= ueberstand
            yy[-1, :] += ueberstand
        oben = np.column_stack([xx.ravel(), yy.ravel(), self.z.ravel()])
        unten = oben.copy()
        unten[:, 2] = unterkante
        verts = np.vstack([oben, unten])
        n = nx * ny
        idx = np.arange(n).reshape(ny, nx)

        def quads(a, b, c, d):
            """zwei Dreiecke je Viereck (a-b-c-d im Gegenuhrzeigersinn)"""
            return np.vstack([np.column_stack([a, b, c]),
                              np.column_stack([a, c, d])])

        faces = [quads(idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(),
                       idx[1:, 1:].ravel(), idx[1:, :-1].ravel())]
        # Boden (umgekehrter Umlaufsinn, damit die Normale nach unten zeigt)
        b = idx + n
        faces.append(quads(b[:-1, :-1].ravel(), b[1:, :-1].ravel(),
                           b[1:, 1:].ravel(), b[:-1, 1:].ravel()))
        # Vier Seitenwände. Der Umlaufsinn muss hier von Hand stimmen: eine
        # nachträgliche Reparatur über fix_normals() traversiert den ganzen
        # Flächengraphen und kostet bei einem 100-x-100-m-Gelände (0,25 m
        # Raster, 320.000 Dreiecke) 90 Sekunden statt 0,4.
        faces.append(quads(idx[0, :-1], b[0, :-1], b[0, 1:], idx[0, 1:]))
        faces.append(quads(idx[-1, 1:], b[-1, 1:], b[-1, :-1], idx[-1, :-1]))
        faces.append(quads(idx[1:, 0], b[1:, 0], b[:-1, 0], idx[:-1, 0]))
        faces.append(quads(idx[:-1, -1], b[:-1, -1], b[1:, -1], idx[1:, -1]))
        return trimesh.Trimesh(vertices=verts, faces=np.vstack(faces),
                               process=True)

    def to_stl(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.to_trimesh().export(path)
