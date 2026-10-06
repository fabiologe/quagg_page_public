"""DAS GELAENDE AUS XYZ UND ASCII-GRID (Fahrplan BIMFY XYZ, Stufe X2).

Eine klassische DGM-Datei der Landesvermessung — XYZ-Raster (`x y z` je Zeile)
oder ESRI-ASCII-Grid (`.asc`) — wird ein eigenes IFC-Modell:
`IfcGeographicElement/TERRAIN` mit einem `IfcTriangulatedIrregularNetwork`,
georeferenziert im Bezugssystem des Projekts. Danach ist es ein geliefertes
Gelaende wie jedes andere (X-E1): Laengsschnitt, Erdbau und Pruefung brauchen
nichts Neues.

AUSDUENNEN OHNE RISSE (X-E2): ein Raster wird als rechtwinkliges, irreguläres
Dreiecksnetz verfeinert (RTIN, Evans/Kirkpatrick/Townsend 2001; Zaehlung und
Weitergabe der Fehler wie in mapbox/martini, das Fehlermass aber EXAKT: die groesste
Abweichung jedes Rasterpunkts von der Ebene seines Dreiecks). Jedes Dreieck wird an
seiner Hypotenuse geteilt, solange ein Rasterpunkt darin weiter als die Toleranz von
der Flaeche abweicht. Weil
Nachbarn ihre Hypotenuse teilen, entsteht nie ein T-Stoss — die Flaeche bleibt
dicht. Luecken im Raster (NODATA) bleiben Luecken, es wird nichts erfunden.

Rein bis auf das Schreiben: numpy und ifcopenshell, kein scipy.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# Die groesste Kachel, die EIN Netz rechnet (2^11 Zellen). Groesser wird gekachelt;
# an den Kachelraendern gilt dann volle Aufloesung, damit nichts aufreisst.
KACHEL = 2048
# Die Vorgabe der Hoehentoleranz (X-E2): 2 cm.
TOLERANZ_M = 0.02


@dataclass
class Raster:
    """Ein Hoehenraster: z[zeile, spalte], Zeile 0 im SUEDEN, Spalte 0 im WESTEN.

    `x0, y0` sind die Koordinaten des Rasterpunkts (0, 0) — Zellmitte, nicht Ecke.
    """
    x0: float
    y0: float
    dx: float
    dy: float
    z: np.ndarray
    quelle: str = ""
    format: str = ""
    hinweise: list = field(default_factory=list)

    @property
    def punkte(self) -> int:
        return int(np.isfinite(self.z).sum())


class GelaendeFehler(ValueError):
    """Die Datei ist kein lesbares Hoehenraster — mit Grund."""


# ── Lesen ──────────────────────────────────────────────────────────────────

def _zahl(t: str) -> float:
    return float(t.replace(",", ".")) if re.fullmatch(r"-?\d+,\d+", t) else float(t)


def lies_asc(text: str, quelle: str = "") -> Raster:
    """ESRI-ASCII-Grid: Kopf (ncols, nrows, xll…, yll…, cellsize, NODATA_value), dann Zeilen von NORD nach SUED."""
    zeilen = text.splitlines()
    kopf, i = {}, 0
    while i < len(zeilen):
        teile = zeilen[i].split()
        if len(teile) == 2 and re.fullmatch(r"[A-Za-z_]+", teile[0]):
            kopf[teile[0].lower()] = teile[1]
            i += 1
        else:
            break
    try:
        nx, ny = int(kopf["ncols"]), int(kopf["nrows"])
    except (KeyError, ValueError):
        raise GelaendeFehler("ASCII-Grid ohne ncols/nrows im Kopf")
    if "cellsize" in kopf:
        dx = dy = _zahl(kopf["cellsize"])
    elif "dx" in kopf and "dy" in kopf:
        dx, dy = _zahl(kopf["dx"]), _zahl(kopf["dy"])
    else:
        raise GelaendeFehler("ASCII-Grid ohne cellsize")
    # Ecke oder Mitte: ...corner ist die Aussenecke der Zelle, ...center ihre Mitte.
    if "xllcenter" in kopf:
        x0, y0 = _zahl(kopf["xllcenter"]), _zahl(kopf["yllcenter"])
    elif "xllcorner" in kopf:
        x0, y0 = _zahl(kopf["xllcorner"]) + dx / 2, _zahl(kopf["yllcorner"]) + dy / 2
    else:
        raise GelaendeFehler("ASCII-Grid ohne xllcorner/xllcenter")
    nodata = _zahl(kopf["nodata_value"]) if "nodata_value" in kopf else None
    werte = np.array([_zahl(t) for t in " ".join(zeilen[i:]).split()], dtype=float)
    if werte.size != nx * ny:
        raise GelaendeFehler(f"ASCII-Grid: {werte.size} Werte, erwartet {nx} × {ny} = {nx * ny}")
    z = werte.reshape(ny, nx)[::-1].copy()            # Datei: Nord zuerst — hier Sued in Zeile 0
    if nodata is not None:
        z[z == nodata] = np.nan
    return Raster(x0, y0, dx, dy, z, quelle=quelle, format="ascii-grid")


def lies_xyz(text: str, quelle: str = "") -> Raster:
    """XYZ-Raster: je Zeile `x y z` (Leerzeichen, Tab, Semikolon oder Komma). Eine Kopfzeile wird uebergangen.

    Nur ein REGELMAESSIGES Raster wird ein Gelaende; eine unregelmaessige Aufnahme
    braucht Delaunay mit Bruchkanten (Stufe X5) — das wird gesagt, nicht geraten.
    """
    xs, ys, zs = [], [], []
    uebergangen = 0
    for zeile in text.splitlines():
        s = zeile.strip()
        if not s or s.startswith("#"):
            continue
        teile = re.split(r"[;\t ]+", s) if ";" in s or "\t" in s or " " in s else s.split(",")
        teile = [t for t in teile if t]
        try:
            x, y, z = (_zahl(t) for t in teile[:3])
        except (ValueError, TypeError):
            uebergangen += 1
            continue
        xs.append(x); ys.append(y); zs.append(z)
    if len(xs) < 4:
        raise GelaendeFehler("XYZ: weniger als vier lesbare Punkte")
    x, y, z = np.array(xs), np.array(ys), np.array(zs)
    ux, uy = np.unique(np.round(x, 4)), np.unique(np.round(y, 4))
    schritt = lambda u: np.diff(u) if u.size > 1 else np.array([0.0])   # noqa: E731
    sx, sy = schritt(ux), schritt(uy)
    dx, dy = float(np.median(sx)), float(np.median(sy))
    regelmaessig = dx > 0 and dy > 0 and np.allclose(sx % dx, 0, atol=1e-3) and np.allclose(sy % dy, 0, atol=1e-3)
    if not regelmaessig or ux.size * uy.size > 4 * len(xs):
        raise GelaendeFehler(f"XYZ: kein regelmaessiges Raster ({len(xs)} Punkte, {ux.size} × {uy.size} Lagen) — "
                             "eine Aufnahme braucht Delaunay mit Bruchkanten (Stufe X5)")
    nx = int(round((ux[-1] - ux[0]) / dx)) + 1
    ny = int(round((uy[-1] - uy[0]) / dy)) + 1
    gitter = np.full((ny, nx), np.nan)
    spalte = np.round((x - ux[0]) / dx).astype(int)
    zeile_ = np.round((y - uy[0]) / dy).astype(int)
    gitter[zeile_, spalte] = z
    r = Raster(float(ux[0]), float(uy[0]), dx, dy, gitter, quelle=quelle, format="xyz-raster")
    if uebergangen:
        r.hinweise.append(f"{uebergangen} Zeile(n) ohne drei Zahlen uebergangen")
    return r


def lies(pfad, text: str | None = None) -> Raster:
    """Eine Datei nach Inhalt: ASCII-Grid am Kopf `ncols`, sonst XYZ."""
    pfad = Path(pfad)
    if text is None:
        roh = pfad.read_bytes()
        try:
            text = roh.decode("utf-8")
        except UnicodeDecodeError:
            text = roh.decode("latin-1")
    kopf = text.lstrip()[:200].lower()
    if kopf.startswith("ncols") or kopf.startswith("nrows"):
        return lies_asc(text, quelle=pfad.name)
    return lies_xyz(text, quelle=pfad.name)


# ── Ausduennen: RTIN ───────────────────────────────────────────────────────

def _dreiecke_der_stufe(groesse: int, ids: np.ndarray):
    """Die Hypotenusen (a, b) aller Dreiecke mit diesen Kennungen — vektoriell.

    Kennung 2 und 3 sind die beiden Haelften des Quadrats; die Kinder von k sind 2k
    und 2k+1. Dieselbe Zaehlung wie mapbox/martini.
    """
    # Kennung ungerade: a = (0, 0), b = (g, g), c = (g, 0); gerade: a = (g, g), b = (0, 0), c = (0, g).
    ungerade = (ids & 1).astype(bool)
    ax = np.where(ungerade, 0, groesse); ay = ax.copy()
    bx = np.where(ungerade, groesse, 0); by = bx.copy()
    cx = np.where(ungerade, groesse, 0); cy = np.where(ungerade, 0, groesse)
    k = ids.copy()
    while True:
        k = k >> 1
        if (k <= 1).all():
            break
        mx, my = (ax + bx) >> 1, (ay + by) >> 1
        u = (k & 1).astype(bool)
        nax = np.where(u, cx, bx); nay = np.where(u, cy, by)
        nbx = np.where(u, ax, cx); nby = np.where(u, ay, cy)
        ax, ay, bx, by, cx, cy = nax, nay, nbx, nby, mx, my
    return ax, ay, bx, by


def _ebenenfehler(h: np.ndarray, gueltig: np.ndarray, n: int, ax, ay, bx, by, cx, cy) -> np.ndarray:
    """Die EXAKTE Abweichung je Dreieck: der groesste Abstand eines gueltigen Rasterpunkts
    darin (Rand eingeschlossen) von der Ebene durch seine drei Ecken. Eine Stufe hat nur
    wenige Formen — je Form werden die Punkte einmal bestimmt und fuer alle Dreiecke
    zugleich verglichen. Ecken in einer Luecke zaehlen 0 (dafuer sorgt die Lueckenregel)."""
    aus = np.zeros(len(ax))
    ui, uj, vi, vj = by - ay, bx - ax, cy - ay, cx - ax
    form = np.stack([ui, uj, vi, vj], axis=1)
    formen, welche = np.unique(form, axis=0, return_inverse=True)
    welche = welche.ravel()
    za = h[ay * n + ax]; zb = h[by * n + bx]; zc = h[cy * n + cx]
    eck = gueltig[ay * n + ax] & gueltig[by * n + bx] & gueltig[cy * n + cx]
    for k, (fi, fj, gi_, gj_) in enumerate(formen):
        d = fi * gj_ - fj * gi_
        if d == 0:
            continue
        oi, oj = np.mgrid[min(0, fi, gi_):max(0, fi, gi_) + 1, min(0, fj, gj_):max(0, fj, gj_) + 1]
        oi, oj = oi.ravel(), oj.ravel()
        s_ = (oi * gj_ - oj * gi_) / d
        t_ = (fi * oj - fj * oi) / d
        drin = (s_ >= -1e-9) & (t_ >= -1e-9) & (s_ + t_ <= 1 + 1e-9)
        oi, oj, s_, t_ = oi[drin], oj[drin], s_[drin], t_[drin]
        if len(oi) <= 3:                       # nur die Ecken: auf der Ebene
            continue
        tri = np.nonzero((welche == k) & eck)[0]
        block = max(1, 2_000_000 // len(oi))
        for x in range(0, len(tri), block):
            t = tri[x:x + block]
            idx = (ay[t, None] + oi[None, :]) * n + (ax[t, None] + oj[None, :])
            ebene = (1 - s_ - t_)[None, :] * za[t, None] + s_[None, :] * zb[t, None] + t_[None, :] * zc[t, None]
            abw = np.where(gueltig[idx], np.abs(ebene - h[idx]), 0.0)
            aus[t] = abw.max(axis=1)
    return aus


def _fehler(z: np.ndarray, rand_voll: bool) -> np.ndarray:
    """Der Fehler je Rasterpunkt als Mitte einer Hypotenuse — von den feinsten Dreiecken aufwaerts.

    Gemischte Dreiecke (Rasterpunkte UND Luecken darin) bekommen unendlich: sie werden
    geteilt, bis ein Dreieck ganz in den Daten oder ganz in der Luecke liegt.
    """
    n = z.shape[0]
    g = n - 1
    gueltig = np.isfinite(z).ravel()
    h = np.where(gueltig, z.ravel(), 0.0)
    fehler = np.zeros(n * n)
    if rand_voll:
        # VOR der Rechnung: die Eltern erben das Unendlich ihrer Randkinder und teilen sich bis zum Rand.
        f2 = fehler.reshape(n, n)
        f2[0, :] = f2[-1, :] = f2[:, 0] = f2[:, -1] = np.inf
    hat_luecke = np.zeros(n * n, dtype=bool)
    hat_wert = np.zeros(n * n, dtype=bool)
    anzahl = g * g * 2 - 2
    eltern = anzahl - g * g
    stufen = int(math.log2(anzahl + 1))
    for laenge in range(stufen + 1, 1, -1):          # Bitlaenge der Kennung, die feinsten zuerst
        von, bis = 1 << (laenge - 1), min((1 << laenge) - 1, anzahl + 1)
        if von > bis:
            continue
        ids = np.arange(von, bis + 1, dtype=np.int64)
        i = ids - 2
        ax, ay, bx, by = _dreiecke_der_stufe(g, ids)
        mx, my = (ax + bx) >> 1, (ay + by) >> 1
        a, b, m = ay * n + ax, by * n + bx, my * n + mx
        cx, cy = mx + my - ay, my + ax - mx
        # Exakt statt der Hypotenusen-Mitte (gemessen: die Mitte allein liess 3 cm statt 2 cm durch).
        e = _ebenenfehler(h, gueltig, n, ax, ay, bx, by, cx, cy)
        luecke = ~gueltig[a] | ~gueltig[b] | ~gueltig[m]
        wert = gueltig[a] | gueltig[b] | gueltig[m]
        e = np.where(luecke, 0.0, e)
        innen = i < eltern
        if innen.any():
            links = ((ay + cy) >> 1) * n + ((ax + cx) >> 1)
            rechts = ((by + cy) >> 1) * n + ((bx + cx) >> 1)
            e = np.where(innen, np.maximum(e, np.maximum(fehler[links], fehler[rechts])), e)
            luecke = luecke | (innen & (hat_luecke[links] | hat_luecke[rechts]))
            wert = wert | (innen & (hat_wert[links] | hat_wert[rechts]))
        np.maximum.at(fehler, m, e)
        np.logical_or.at(hat_luecke, m, luecke)
        np.logical_or.at(hat_wert, m, wert)
    fehler[hat_luecke & hat_wert] = np.inf
    return fehler


def rtin(z: np.ndarray, toleranz: float = TOLERANZ_M, *, rand_voll: bool = False) -> np.ndarray:
    """Ein quadratisches Raster (2^k + 1) als Dreiecke `[(i1, j1, i2, j2, i3, j3), …]` (Zeile, Spalte).

    Dreiecke mit einer Luecke an einer Ecke fallen weg. `rand_voll`: am Rand volle
    Aufloesung (Kacheln passen dann ohne Riss aneinander).
    """
    n = z.shape[0]
    g = n - 1
    if z.shape != (n, n) or g < 1 or g & (g - 1):
        raise ValueError(f"RTIN braucht ein Quadrat mit 2^k + 1 Punkten, nicht {z.shape}")
    fehler = _fehler(z, rand_voll)
    gueltig = np.isfinite(z)
    aus = []
    stapel = [(0, 0, g, g, g, 0), (g, g, 0, 0, 0, g)]
    while stapel:
        ax, ay, bx, by, cx, cy = stapel.pop()
        mx, my = (ax + bx) >> 1, (ay + by) >> 1
        if abs(ax - cx) + abs(ay - cy) > 1 and fehler[my * n + mx] > toleranz:
            stapel.append((cx, cy, ax, ay, mx, my))
            stapel.append((bx, by, cx, cy, mx, my))
        elif gueltig[ay, ax] and gueltig[by, bx] and gueltig[cy, cx]:
            aus.append((ay, ax, by, bx, cy, cx))
    return np.array(aus, dtype=np.int64).reshape(-1, 6)


def netz(raster: Raster, toleranz: float = TOLERANZ_M):
    """Das Raster als ausgeduenntes Netz: (punkte [n×3] in Landeskoordinaten, dreiecke [m×3] Indizes).

    Bis KACHEL Zellen in einem Stueck; groesser in Kacheln mit vollem Rand.
    """
    ny, nx = raster.z.shape
    kachel = min(KACHEL, 1 << max(1, math.ceil(math.log2(max(nx, ny) - 1 or 1))))
    gross = max(nx, ny) - 1 > KACHEL
    index = {}
    punkte, dreiecke = [], []

    def nummer(i, j):
        k = i * nx + j
        if k not in index:
            index[k] = len(punkte)
            punkte.append((raster.x0 + j * raster.dx, raster.y0 + i * raster.dy, float(raster.z[i, j])))
        return index[k]

    for i0 in range(0, max(ny - 1, 1), kachel):
        for j0 in range(0, max(nx - 1, 1), kachel):
            teil = np.full((kachel + 1, kachel + 1), np.nan)
            stueck = raster.z[i0:i0 + kachel + 1, j0:j0 + kachel + 1]
            teil[:stueck.shape[0], :stueck.shape[1]] = stueck
            for i1, j1, i2, j2, i3, j3 in rtin(teil, toleranz, rand_voll=gross):
                a, b, c = nummer(i0 + i1, j0 + j1), nummer(i0 + i2, j0 + j2), nummer(i0 + i3, j0 + j3)
                # Gegen den Uhrzeigersinn von oben: die Normale zeigt nach oben.
                pa, pb, pc = punkte[a], punkte[b], punkte[c]
                if (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]) < 0:
                    b, c = c, b
                dreiecke.append((a, b, c))
    return np.array(punkte, dtype=float).reshape(-1, 3), np.array(dreiecke, dtype=np.int64).reshape(-1, 3)


def groesste_abweichung(raster: Raster, punkte: np.ndarray, dreiecke: np.ndarray) -> float:
    """Die groesste Hoehenabweichung eines Rasterpunkts von der Netzflaeche — die Gegenprobe zur Toleranz.

    Ein RTIN kennt nur wenige Dreiecksformen (rechtwinklig, Schenkel 2^k). Je Form
    werden die Rasterpunkte darin EINMAL bestimmt (baryzentrisch) und dann fuer alle
    Dreiecke dieser Form zugleich verglichen — jeder Rasterpunkt etwa einmal.
    """
    if not len(dreiecke):
        return 0.0
    z = raster.z
    j = np.round((punkte[:, 0] - raster.x0) / raster.dx).astype(np.int64)
    i = np.round((punkte[:, 1] - raster.y0) / raster.dy).astype(np.int64)
    ia, ib, ic = i[dreiecke[:, 0]], i[dreiecke[:, 1]], i[dreiecke[:, 2]]
    ja, jb, jc = j[dreiecke[:, 0]], j[dreiecke[:, 1]], j[dreiecke[:, 2]]
    form = np.stack([ib - ia, jb - ja, ic - ia, jc - ja], axis=1)
    formen, welche = np.unique(form, axis=0, return_inverse=True)
    groesste = 0.0
    for k, (ui, uj, vi, vj) in enumerate(formen):
        d = ui * vj - uj * vi
        if d == 0:
            continue
        lo_i, hi_i = min(0, ui, vi), max(0, ui, vi)
        lo_j, hi_j = min(0, uj, vj), max(0, uj, vj)
        oi, oj = np.mgrid[lo_i:hi_i + 1, lo_j:hi_j + 1]
        oi, oj = oi.ravel(), oj.ravel()
        s_ = (oi * vj - oj * vi) / d
        t_ = (ui * oj - uj * oi) / d
        drin = (s_ >= -1e-9) & (t_ >= -1e-9) & (s_ + t_ <= 1 + 1e-9)
        oi, oj, s_, t_ = oi[drin], oj[drin], s_[drin], t_[drin]
        tri = np.nonzero(welche.ravel() == k)[0]
        za, zb, zc = punkte[dreiecke[tri, 0], 2], punkte[dreiecke[tri, 1], 2], punkte[dreiecke[tri, 2], 2]
        # In Bloecken, damit grosse Formen mit vielen Dreiecken den Speicher nicht sprengen.
        block = max(1, 2_000_000 // max(1, len(oi)))
        for x in range(0, len(tri), block):
            sl = slice(x, x + block)
            gi = ia[tri[sl], None] + oi[None, :]
            gj = ja[tri[sl], None] + oj[None, :]
            flaeche = (1 - s_ - t_)[None, :] * za[sl, None] + s_[None, :] * zb[sl, None] + t_[None, :] * zc[sl, None]
            echt = z[gi, gj]
            ok = np.isfinite(echt)
            if ok.any():
                groesste = max(groesste, float(np.max(np.abs(flaeche - echt)[ok])))
    return groesste


def netz_eingehalten(raster: Raster, toleranz: float = TOLERANZ_M, versuche: int = 6):
    """Wie `netz`, aber NACHGEMESSEN: das Fehlermass des RTIN prueft die Hypotenusen-Mitten,
    nicht jede Flaeche — die echte Abweichung kann darueber liegen (gemessen: 2,25 cm bei 2 cm).
    Dann wird mit 3/4 der Toleranz neu gerechnet, bis sie eingehalten ist.
    @returns (punkte, dreiecke, groesste_abweichung, gerechnete_toleranz)
    """
    t = toleranz
    for _ in range(versuche):
        punkte, dreiecke = netz(raster, t)
        abw = groesste_abweichung(raster, punkte, dreiecke)
        if abw <= toleranz + 1e-9:
            return punkte, dreiecke, abw, t
        t *= 0.75
    raise GelaendeFehler(f"Toleranz {toleranz} m nach {versuche} Versuchen nicht eingehalten (zuletzt {abw:.4f} m)")


# ── Schreiben ──────────────────────────────────────────────────────────────

PSET_GELAENDE = "Quagg_Gelaende"


def schreibe_gelaende(raster: Raster, ziel, *, crs: str | None, name: str | None = None,
                      toleranz: float = TOLERANZ_M, schluessel: str = "gelaende", bearbeiter: str = "",
                      firma: str = "", pruefen_abweichung: bool = True) -> dict:
    """Das Raster als IFC4X3_ADD2: ein IfcGeographicElement/TERRAIN mit IfcTriangulatedIrregularNetwork.

    Die Punkte stehen relativ zu einem Ursprung im Gelaende (kleine Zahlen, Float-fest),
    die Platzierung traegt die Landeskoordinate; die Georeferenz kommt aus `crs`.
    """
    from . import guids
    from .eigenbau import _merkmale
    from . import herkunft as H
    from .verbund import zielgeruest

    punkte, dreiecke, abweichung, gerechnet = netz_eingehalten(raster, toleranz) if pruefen_abweichung \
        else (*netz(raster, toleranz), None, toleranz)
    if not len(dreiecke):
        raise GelaendeFehler("das Raster ergibt kein einziges Dreieck (nur Luecken?)")
    name = name or Path(raster.quelle or "Gelaende").stem
    satz = f"gelaende:{schluessel}"
    g = zielgeruest(f"Gelaende {name}", crs=crs, bearbeiter=bearbeiter, firma=firma, schluessel=satz,
                    crs_herkunft="Bezugssystem des Projekts (XYZ und ASCII-Grid tragen keines)")
    f, site, besitz, koerper = g["datei"], g["site"], g["besitz"], g["koerper"]

    ursprung = np.floor(punkte.min(axis=0))
    lokal = punkte - ursprung
    platz = f.create_entity("IfcLocalPlacement", PlacementRelTo=site.ObjectPlacement,
                            RelativePlacement=f.create_entity(
                                "IfcAxis2Placement3D",
                                Location=f.create_entity("IfcCartesianPoint", Coordinates=tuple(float(v) for v in ursprung))))
    koord = f.create_entity("IfcCartesianPointList3D", CoordList=[tuple(round(float(c), 4) for c in p) for p in lokal])
    tin = f.create_entity("IfcTriangulatedIrregularNetwork", Coordinates=koord, Closed=False,
                          CoordIndex=[(int(a) + 1, int(b) + 1, int(c) + 1) for a, b, c in dreiecke],
                          # Flags je Dreieck: 1 = Teil der Flaeche (0 waere eine Luecke). Bruchkanten kommen in X5.
                          Flags=[1] * len(dreiecke))
    darstellung = f.create_entity("IfcShapeRepresentation", ContextOfItems=koerper, RepresentationIdentifier="Body",
                                  RepresentationType="Tessellation", Items=[tin])
    gelaende = f.create_entity("IfcGeographicElement", GlobalId=guids.guid_aus_cde_id(f"{satz}|tin"), OwnerHistory=besitz,
                               Name=name, ObjectPlacement=platz, PredefinedType="TERRAIN",
                               Representation=f.create_entity("IfcProductDefinitionShape", Representations=[darstellung]))
    f.create_entity("IfcRelContainedInSpatialStructure", GlobalId=guids.guid_aus_cde_id(f"{satz}|enthalten"),
                    OwnerHistory=besitz, RelatingStructure=site, RelatedElements=[gelaende])

    _merkmale(f, besitz, gelaende, PSET_GELAENDE, {
        "Quelle": raster.quelle or None,
        "Format": raster.format,
        "Rasterweite": f"{raster.dx:g} × {raster.dy:g} m",
        "Rasterpunkte": raster.punkte,
        "Netzpunkte": int(len(punkte)),
        "Dreiecke": int(len(dreiecke)),
        "Toleranz": toleranz,
        "ToleranzGerechnet": gerechnet if gerechnet != toleranz else None,
        "GroessteAbweichung": round(abweichung, 4) if abweichung is not None else None,
        "Verfahren": "RTIN (rechtwinklige Dreiecke, rissfrei), Luecken bleiben Luecken",
    }, schluessel=f"{satz}|tin")
    # V08: auch ein Gelaende gehoert einer Fachmodell-Gruppe an.
    gruppe = f.create_entity("IfcGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|gruppe"), OwnerHistory=besitz,
                             Name="Gelaende", Description=f"Gelaendemodell aus {raster.quelle or 'Rasterdatei'}",
                             ObjectType="Fachmodell")
    f.create_entity("IfcRelAssignsToGroup", GlobalId=guids.guid_aus_cde_id(f"{satz}|gruppe-rel"), OwnerHistory=besitz,
                    RelatedObjects=[gelaende], RelatingGroup=gruppe)
    _merkmale(f, besitz, gruppe, H.PSET_FACHMODELL, {"Datei": name, "Quelle": raster.quelle or None,
                                                     "Bauteile": 1}, schluessel=f"{satz}|gruppe")
    Path(ziel).parent.mkdir(parents=True, exist_ok=True)
    f.write(str(ziel))
    return {"ziel": str(ziel), "crs": g.get("crs"), "format": raster.format, "rasterweite": [raster.dx, raster.dy],
            "rasterpunkte": raster.punkte, "netzpunkte": int(len(punkte)), "dreiecke": int(len(dreiecke)),
            "toleranz": toleranz, "toleranz_gerechnet": gerechnet, "groesste_abweichung": abweichung, "hinweise": list(raster.hinweise)}


def _main(argv=None) -> int:
    import argparse
    import json
    ap = argparse.ArgumentParser(description="XYZ-Raster oder ASCII-Grid als IFC-Gelaende (TERRAIN, TIN)")
    ap.add_argument("eingabe")
    ap.add_argument("ziel")
    ap.add_argument("--crs", default=None, help="z. B. EPSG:25832 (das System des Projekts)")
    ap.add_argument("--toleranz", type=float, default=TOLERANZ_M)
    ap.add_argument("--name", default=None)
    a = ap.parse_args(argv)
    bericht = schreibe_gelaende(lies(a.eingabe), a.ziel, crs=a.crs, name=a.name, toleranz=a.toleranz)
    print(json.dumps(bericht, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
