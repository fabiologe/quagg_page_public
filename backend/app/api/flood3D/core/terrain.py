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


def naechste_hoehe(z: np.ndarray, bekannt: np.ndarray) -> np.ndarray:
    """
    Jede unbekannte Zelle erbt die Höhe der nächsten bekannten.

    Mit scipy exakt über den kd-Baum. Ohne scipy — das Rechen-Image auf
    der Nutzer-Maschine trägt nur die Kernpakete, und dieser Code reist
    im Bundle dorthin — schichtweise Ausbreitung: je Runde bekommen die
    Zellen am Rand des Bekannten den Mittelwert ihrer bekannten Nachbarn.
    Das misst Gitterschritte statt Meter; für einen Füll- oder Startwert
    ist der Unterschied belanglos. Ohne diesen Rückfall verlor ein lokaler
    Lauf still seine Geländeschicht (ModuleNotFoundError, gefangen und
    wegprotokolliert).
    """
    bekannt = np.asarray(bekannt, dtype=bool)
    aus = np.array(z, dtype=float)
    if bekannt.all() or not bekannt.any():
        return aus
    try:
        from scipy.spatial import cKDTree
        jj, ii = np.nonzero(bekannt)
        qj, qi = np.nonzero(~bekannt)
        _, nachbar = cKDTree(np.column_stack([jj, ii])).query(
            np.column_stack([qj, qi]))
        aus[~bekannt] = aus[bekannt][nachbar]
        return aus
    except ModuleNotFoundError:
        pass
    offen = ~bekannt
    # Vier Nachbarn über Slices — np.roll wickelte über den Gebietsrand
    RICHTUNGEN = (
        ((slice(1, None), slice(None)), (slice(None, -1), slice(None))),
        ((slice(None, -1), slice(None)), (slice(1, None), slice(None))),
        ((slice(None), slice(1, None)), (slice(None), slice(None, -1))),
        ((slice(None), slice(None, -1)), (slice(None), slice(1, None))))
    while offen.any():
        fest = ~offen
        summe = np.zeros_like(aus)
        anzahl = np.zeros(aus.shape)
        for ziel, quelle in RICHTUNGEN:
            gut = fest[quelle]
            summe[ziel] += np.where(gut, aus[quelle], 0.0)
            anzahl[ziel] += gut
        neu = offen & (anzahl > 0)
        if not neu.any():
            break
        aus[neu] = summe[neu] / anzahl[neu]
        offen &= ~neu
    return aus


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
    frei = ~fest
    z = naechste_hoehe(z, fest)

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
# Basisquellen — und was außerhalb der Vermessung gilt
# --------------------------------------------------------------------------
#
# Ein Höhenraster deckt selten genau das Gebiet: importiert wird die
# Vermessung, das Gebiet zieht der Bearbeiter danach von Hand größer. Bis zum
# 2026-09-21 klemmte das Abtasten jede Koordinate außerhalb des Rasters auf
# den Randwert. Eine tiefe Stelle am Rasterrand (Auslaufscharte, offene
# TIN-Spitze) wurde dadurch als Rinne bis an den Gebietsrand fortgeschrieben
# — das Phantom-Gerinne, +72 % Rückhaltevolumen in einem Fall, den niemand
# so gezeichnet hatte. Jetzt gilt EINE Regel: was nicht gemessen ist (NODATA
# in der Datei, außerhalb des Rasters), liegt auf einer waagerechten Ebene,
# der AUSSENHÖHE. Sie ist im Fall setzbar (TerrainBase.aussenhoehe); sonst
# ist sie die höchste gemessene RANDzelle — die Krone, nicht die Öffnung:
# eine Ebene erfindet keine Form, und oben liegt sie im Einstaunachweis auf
# der sicheren Seite. Wer das Feld liest, sieht an `gemessen`, wo die
# Vermessung aufhört; die Prüfung meldet den Anteil.

# Operationen, die eine feste Zielhöhe ZUSICHERN. Über ihnen wirkt der
# Pinsel nicht — sie schreiben ihre Sollhöhe, egal was darunter liegt.
# Relative Operationen (raise_lower, smooth) vertragen jeden Untergrund.
SOLLHOEHEN_TYPEN = frozenset({
    "channel_carve", "pad", "ramp", "embankment", "replace_region",
    "set_level", "bruchkante", "boeschung", "aussenkante"})

# Deckel für die Sperrmaske: sie kostet eine Auswertung des Stapels je
# Operation. Darüber bleibt es bei der allgemeinen Erklärung im Panel,
# statt jede Entwurfsvorschau sekundenlang aufzuhalten.
MAX_SPERRE_OPS = 12
MAX_SPERRE_KNOTEN = 400_000

RAND_TOLERANZ = 0.10        # m: Randzellen so nah unter der Krone stützen sie
RASTER_SAUM = 0.5           # Zellen: eine halbe Zelle über die äußersten
                            # Knoten hinaus gilt noch als „im Raster" — die
                            # Zellfläche, nicht der Knotenkamm. Sonst bekäme
                            # jedes aus dem Gelände abgeleitete Gebiet einen
                            # Saum aus Ebene, weil Gebiet und Rasterkopf auf
                            # cm bzw. mm gerundet sind.


@dataclass
class Basis:
    """Ein Basisgelände auf dem Zielgitter, mit seiner Herkunft."""
    z: np.ndarray                   # Höhe je Knoten; ungemessen = aussenhoehe
    gemessen: np.ndarray            # bool je Knoten
    aussenhoehe: float | None       # wirksame Ebene; None nur bei flat:
    auto: bool                      # True = abgeleitet, False = im Fall gesetzt
    rand: tuple[float, float] | None    # (min, max) der gemessenen Randzellen
    stuetzung: int                  # Randzellen ≤ RAND_TOLERANZ unter der Krone
    quelle_nodata: int              # NODATA-Zellen in der Quelldatei


def randkrone(z: np.ndarray, gemessen: np.ndarray) -> dict | None:
    """
    Die Randzellen der Vermessung und ihre Krone. Randzelle = gemessene Zelle
    mit einem nicht gemessenen 4-Nachbarn oder am Rasterrand. Die Außenhöhe
    ist ihr MAXIMUM: erklärbar, auf der sicheren Seite, und bei einem
    lückenlosen Altraster genau der bisherige Randwert. Der Median schiede
    aus — an einem offen vermessenen Becken liegen die meisten Randknoten
    unter der Krone, er träfe die Öffnung. `stuetzung` sagt, auf wie vielen
    Zellen das Maximum ruht; ein Ausreißer fällt daran auf.
    """
    gemessen = np.asarray(gemessen, dtype=bool)
    if not gemessen.any():
        return None
    p = np.pad(gemessen, 1, constant_values=False)
    nachbar_frei = (~p[:-2, 1:-1] | ~p[2:, 1:-1] | ~p[1:-1, :-2] | ~p[1:-1, 2:])
    zr = np.asarray(z, dtype=float)[gemessen & nachbar_frei]
    krone = float(zr.max())
    return {"krone": krone, "rand_min": float(zr.min()), "rand_max": krone,
            "stuetzung": int((zr >= krone - RAND_TOLERANZ).sum()),
            "randzellen": int(zr.size)}


def _roh_esri_ascii(path: Path) -> tuple[dict, np.ndarray]:
    """Kopf und Daten (Süd nach Nord), NODATA als NaN — ohne jede Füllung."""
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
    if nodata is not None:
        z = np.where(z == nodata, np.nan, z)
    res = header["cellsize"]
    return {"x0": header["xllcorner"] + res / 2,
            "y0": header["yllcorner"] + res / 2, "res": res}, z


def _roh_xyz(path: Path) -> tuple[dict, np.ndarray]:
    """Punktliste als Raster; Zellen ohne Punkt bleiben NaN."""
    data = np.loadtxt(path)
    res = float(np.median(np.diff(np.unique(data[:, 0]))) or 1.0)
    x0, y0 = data[:, 0].min(), data[:, 1].min()
    nx = int(round((data[:, 0].max() - x0) / res)) + 1
    ny = int(round((data[:, 1].max() - y0) / res)) + 1
    z = np.full((max(ny, 2), max(nx, 2)), np.nan)
    i = np.round((data[:, 0] - x0) / res).astype(int)
    j = np.round((data[:, 1] - y0) / res).astype(int)
    z[j, i] = data[:, 2]
    return {"x0": float(x0), "y0": float(y0), "res": res}, z


def _roh(path: Path) -> tuple[dict, np.ndarray]:
    suffix = path.suffix.lower()
    if suffix == ".asc":
        return _roh_esri_ascii(path)
    if suffix == ".xyz":
        return _roh_xyz(path)
    raise ValueError(f"Nicht unterstützte Geländebasis: {path.suffix} "
                     "(unterstützt: flat:<z>, .asc, .xyz)")


def raster_zellflaeche(path: Path) -> tuple[float, float, float, float]:
    """Zellfläche (x0, y0, x1, y1) eines Rasters — eine halbe Zelle über die
    äußersten Knoten hinaus, wie RASTER_SAUM sie rechnet."""
    lage, roh = _roh(Path(path))
    ny, nx = roh.shape
    r = lage["res"]
    return (lage["x0"] - r / 2, lage["y0"] - r / 2,
            lage["x0"] + (nx - 1) * r + r / 2, lage["y0"] + (ny - 1) * r + r / 2)


def _lage_auf_gitter(gemessen: np.ndarray, x0: float, y0: float, res: float,
                     x, y) -> tuple[np.ndarray, np.ndarray]:
    """
    Je Zielknoten: liegt er in der Zellfläche des Rasters (`innen`), und
    stehen alle vier Quellzellen seiner bilinearen Abtastung auf gemessenem
    Grund (`vier`)? Die Wand zwischen gemessen und Ebene ist damit höchstens
    eine Quellzelle breit, und ein Knoten am Übergang gilt als ungemessen —
    er trägt schon einen Anteil Ebene.
    """
    ny, nx = gemessen.shape
    # auf 9 Dezimalen gerundet: ein Gebiet, das die Kur auf die (auf mm
    # gerundete) Hülle setzt, legt seine Knoten 1e-15 neben die alten — an
    # einer Zellgrenze kippte int() sonst in die Nachbarzelle
    fx = np.round((np.asarray(x, dtype=float) - x0) / res, 9)
    fy = np.round((np.asarray(y, dtype=float) - y0) / res, 9)
    innen = ((fx >= -RASTER_SAUM) & (fx <= nx - 1 + RASTER_SAUM)
             & (fy >= -RASTER_SAUM) & (fy <= ny - 1 + RASTER_SAUM))
    i0 = np.clip(fx, 0, nx - 1.001).astype(int)
    j0 = np.clip(fy, 0, ny - 1.001).astype(int)
    vier = (gemessen[j0, i0] & gemessen[j0, i0 + 1]
            & gemessen[j0 + 1, i0] & gemessen[j0 + 1, i0 + 1])
    return innen, vier


def lade_basis(source: str, base_dir: Path, xx, yy,
               aussenhoehe: float | None = None) -> Basis:
    """
    Das Basisgelände auf dem Zielgitter (xx, yy). Alles, was Gelände liest,
    kommt hier durch — `from_spec`, „Bereich ersetzen", das Drehen —, damit
    es nur EINE Antwort auf „was steht außerhalb der Vermessung?" gibt.
    """
    form = np.shape(xx)
    if source.startswith("flat:"):
        z = np.full(form, float(source.split(":", 1)[1]))
        return Basis(z=z, gemessen=np.ones(form, dtype=bool), aussenhoehe=None,
                     auto=True, rand=None, stuetzung=0, quelle_nodata=0)
    path = (base_dir / source) if not Path(source).is_absolute() else Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Geländebasis nicht gefunden: {path}")
    lage, roh = _roh(path)
    gemessen_roh = ~np.isnan(roh)
    kr = randkrone(roh, gemessen_roh)
    if kr is None:
        raise ValueError("Höhenraster ohne eine einzige gemessene Zelle: "
                         f"{path.name}")
    auto = aussenhoehe is None
    hoehe = kr["krone"] if auto else float(aussenhoehe)
    # NODATA erst füllen, dann abtasten — -9999 darf nie in die Bilinearität
    gefuellt = np.where(gemessen_roh, roh, hoehe)
    z = _sample_bilinear(gefuellt, lage["x0"], lage["y0"], lage["res"], xx, yy)
    innen, vier = _lage_auf_gitter(gemessen_roh, lage["x0"], lage["y0"],
                                   lage["res"], xx, yy)
    # außerhalb der Zellfläche gilt nicht der geklemmte Randwert, sondern die
    # Ebene — DAS ist die Kur gegen das Phantom-Gerinne
    z = np.where(innen, z, hoehe)
    return Basis(z=z, gemessen=innen & vier, aussenhoehe=hoehe, auto=auto,
                 rand=(kr["rand_min"], kr["rand_max"]),
                 stuetzung=kr["stuetzung"],
                 quelle_nodata=int((~gemessen_roh).sum()))


def _load_base(source: str, base_dir: Path, xx, yy) -> np.ndarray:
    """Nur die Höhen — für Aufrufer, die die Maske nicht brauchen."""
    return lade_basis(source, base_dir, xx, yy).z


def _load_esri_ascii(path: Path, xx, yy) -> np.ndarray:
    return lade_basis(str(path), Path("."), xx, yy).z


def _load_xyz(path: Path, xx, yy) -> np.ndarray:
    return lade_basis(str(path), Path("."), xx, yy).z


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
    # Wo die Vermessung aufhört (lade_basis): bool je Knoten. None nur, wenn
    # das Feld ohne Basis gebaut wurde (Messungen, Tests).
    gemessen: np.ndarray | None = field(default=None, repr=False, compare=False)
    aussenhoehe: float | None = None        # wirksame Ebene außerhalb
    aussenhoehe_auto: bool = True           # abgeleitet oder im Fall gesetzt
    rand: tuple[float, float] | None = None  # (min, max) der Randzellen
    stuetzung: int = 0
    quelle_nodata: int = 0                  # NODATA-Zellen in der Quelldatei
    # Stand nach den abgeleiteten Operationen und dem Pinsel, VOR den von
    # Hand angelegten — daraus rechnet `pinsel_sperre`, wo ein Strich
    # ankommt (siehe from_spec)
    _vor_eigen: np.ndarray | None = field(default=None, repr=False,
                                          compare=False)
    _eigen_ops: list = field(default_factory=list, repr=False, compare=False)

    @classmethod
    def from_spec(cls, terrain: Terrain, domain: Domain,
                  base_dir: Path | str = ".") -> "TerrainField":
        x0, y0, x1, y1 = domain.extent
        res = terrain.base.resolution
        nx = int(round((x1 - x0) / res)) + 1
        ny = int(round((y1 - y0) / res)) + 1
        xx, yy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
        basis = lade_basis(terrain.base.source, Path(base_dir), xx, yy,
                           terrain.base.aussenhoehe)
        field = cls(x0=x0, y0=y0, resolution=res, z=basis.z.astype(float),
                    gemessen=basis.gemessen, aussenhoehe=basis.aussenhoehe,
                    aussenhoehe_auto=basis.auto, rand=basis.rand,
                    stuetzung=basis.stuetzung, quelle_nodata=basis.quelle_nodata)
        field._ops = list(terrain.operations)
        field._base_dir = Path(base_dir)
        # Die aus Vermessungskanten ABGELEITETEN Operationen sind die
        # Vermessung selbst (kanten.verknuepfen legt sie immer nach vorn):
        # Böschung, Sohle, Beckenrand — nichts, was jemand zugesichert hat,
        # sondern das gewachsene Gelände in Operationsform. Der Pinsel
        # gehört deshalb DAHINTER und weiter VOR die von Hand angelegten
        # Operationen, deren Sollhöhen (Planum, Gerinnesohle, Dammkrone)
        # zugesichert bleiben. Bis 2026-09-22 lag er vor allen: in Fällen
        # aus Vermessungslinien war er damit auf 27–43 % der Fläche
        # wirkungslos, und der Strich schnappte nach dem Speichern zurück.
        abgeleitet = [o for o in terrain.operations if getattr(o, "aus_kanten", None)]
        eigen = [o for o in terrain.operations if not getattr(o, "aus_kanten", None)]
        for op in abgeleitet:
            field.apply(op)
        if terrain.sculpt:
            from .sculpt import lade_ebene
            field.z = field.z + lade_ebene(terrain, domain, Path(base_dir))
        field._vor_eigen = field.z.copy()
        field._eigen_ops = eigen
        for op in eigen:
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

    def abdeckung(self) -> dict | None:
        """
        DIE Messfunktion für Regel und Kur „Gelände außerhalb der Vermessung":
        `ausserhalb` = Anteil der Knoten außerhalb des Hüllquaders der
        gemessenen Knoten — den bringt die Kur „Gebiet auf die Vermessung
        setzen" auf null; `innen` = ungemessene Knoten innerhalb des
        Hüllquaders (Ecken eines gedrehten TIN, Löcher — die bleiben, wie
        das Gebiet auch liegt); `je_rand` = Anteil je Gebietsseite. None,
        wenn das Feld ohne Basis gebaut wurde.
        """
        g = self.gemessen
        if g is None:
            return None
        seiten = {"x_min": g[:, 0], "x_max": g[:, -1],
                  "y_min": g[0, :], "y_max": g[-1, :]}
        aus = {"ueberlappt": bool(g.any()), "ungemessen": float((~g).mean()),
               "je_rand": {k: float((~v).mean()) for k, v in seiten.items()},
               "aussenhoehe": self.aussenhoehe, "auto": self.aussenhoehe_auto,
               "rand": self.rand, "stuetzung": self.stuetzung,
               "quelle_nodata": self.quelle_nodata}
        if not g.any():
            aus.update(ausserhalb=1.0, innen=0.0, huelle=None)
            return aus
        jj, ii = np.nonzero(g)
        i0, i1 = int(ii.min()), int(ii.max())
        j0, j1 = int(jj.min()), int(jj.max())
        box = np.zeros_like(g)
        box[j0:j1 + 1, i0:i1 + 1] = True
        r = self.resolution
        aus.update(ausserhalb=float((~box).mean()),
                   innen=float((box & ~g).mean()),
                   huelle=(round(self.x0 + i0 * r, 3), round(self.y0 + j0 * r, 3),
                           round(self.x0 + i1 * r, 3), round(self.y0 + j1 * r, 3)))
        return aus

    def _stapel(self, z_start: np.ndarray) -> np.ndarray:
        """Die eigenen Operationen auf ein gegebenes Feld — ohne Nebenwirkung."""
        f = TerrainField(x0=self.x0, y0=self.y0, resolution=self.resolution,
                         z=np.array(z_start, dtype=float))
        f._ops = self._ops                  # die Außenkante sucht hier ihre
        f._base_dir = self._base_dir        # Bezugskante
        for op in self._eigen_ops:
            f.apply(op)
        return f.z

    def pinsel_sperre(self, probe: float = 1.0,
                      schwelle: float = 0.5) -> dict | None:
        """
        Wo kommt ein Pinselstrich an, und wo nicht?

        Gemessen wird, was von einem Probe-Hub durch die von Hand angelegten
        Operationen hindurch überlebt: liegt darüber ein Planum, eine
        Gerinnesohle oder eine Dammkrone, schreibt sie ihre Sollhöhe, und
        der Strich verschwindet darunter. Das ist gewollt — aber der Editor
        muss es ZEIGEN, statt den Strich still zurückschnappen zu lassen.

        Die frühere Auskunft waren Hüllboxen der Operationen (sculpt.py):
        grob nach außen (ein Gerinne sperrte sein ganzes Rechteck) und blind
        nach innen (eine geschlossene Bruchkante „ebnen" meldete nur ihren
        Ring). Hier zählt, was das Feld wirklich tut.

        `ebene`: 0 = frei, k = die k-te sperrende Operation (1-basiert, für
        die Statuszeile). None, wenn nichts sperrt oder der Fall zu groß
        ist — dann bleibt es bei der allgemeinen Erklärung im Panel.
        """
        if self._vor_eigen is None:
            return None
        kandidaten = [o for o in self._eigen_ops
                      if o.type in SOLLHOEHEN_TYPEN]
        if not kandidaten or len(kandidaten) > MAX_SPERRE_OPS \
                or self.z.size > MAX_SPERRE_KNOTEN:
            return None
        ref = self._stapel(self._vor_eigen)
        durch = self._stapel(self._vor_eigen + probe) - ref
        gesperrt = durch < schwelle * probe
        if not gesperrt.any():
            return None
        # je Operation getrennt, damit die Statuszeile sagen kann, WER hält
        ebene = np.zeros(self.z.shape, dtype=np.int8)
        ids: list[str] = []
        alle = self._eigen_ops
        for op in kandidaten:
            self._eigen_ops = [op]
            try:
                einzeln = (self._stapel(self._vor_eigen + probe)
                           - self._stapel(self._vor_eigen)) < schwelle * probe
            finally:
                self._eigen_ops = alle
            neu = gesperrt & einzeln & (ebene == 0)
            if neu.any():
                ids.append(op.id)
                ebene[neu] = len(ids)
        return {"ebene": ebene, "ops": ids,
                "anteil": float(gesperrt.mean())}

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
        diese Operation steht dort, was die Basis hergibt: innerhalb der
        Vermessung deren Höhen, außerhalb die Ebene auf der Außenhöhe
        (lade_basis).

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
        # nur, wo das Zusatzraster wirklich gemessen ist — sonst stünde im
        # Polygon dessen Ebene (oder früher: sein geklemmter Randwert)
        ersatz = lade_basis(op.source, self._base_dir, xx, yy)
        ersetzen = mask & ersatz.gemessen
        self.z = np.where(ersetzen, ersatz.z, self.z)
        if self.gemessen is not None:
            self.gemessen = self.gemessen | ersetzen

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
