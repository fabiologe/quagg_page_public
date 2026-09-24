"""
Planraster aus den echten Rechenzellen (Fahrplan C2, 2026-09-24).

Bis dahin rechnete der Browser Tiefe, Wasserspiegel, Geschwindigkeiten
und Froude aus dem Voxel-Raster (`useFieldCache.planFields`). Das Raster
mittelt Zellwerte ungewichtet in Rasterzellen; das Volumen, das der
Grundriss zeigte, wich 34–100 % vom gerechneten ab (Audit F4). Hier
entstehen dieselben Größen EINMAL, auf dem Server, aus Zellzentren,
Zellvolumen und Phasenanteil — und der Client zeigt sie nur noch an.

Säule = Rasterzelle des xy-Gitters des Laufs (`viz_grid_for`, dasselbe
Gitter wie Voxel und Sohlschub).

Zellgeometrie: der achsparallele Quader jeder Zelle aus dem Netz
(`foamfields.zellquader`) — Grundfläche und Unterkante exakt, auch für
Zellen, die snappyHexMesh am Gelände anschneidet; Höhe volumentreu
V / Grundfläche. Aus dem Volumen geschätzt taugte das nicht: ∛V irrt bei
flachen Zellen (Fall K 0,05 × 0,05 × 0,047 m legte die Sohle 3 mm unters
Gelände), die Stufe aus V bei angeschnittenen (Fall A: eine 0,25-m-Zelle
als 0,125 × 0,125 × 0,32 m). Ohne Netz (Tests mit Würfeln) gilt ∛V.

Eine Zelle wird mit ihrer Grundfläche anteilig auf die Säulen verteilt, die
sie überdeckt; die Anteile summieren sich zu 1. Deshalb ist

    Σ h·A = Σ α·V                         (exakt volumentreu)

auch dann, wenn das Raster gröber ist als die Zellen oder schräg liegt.

Definitionen (eine je Größe, der Client rechnet keine eigene mehr):

- Tiefe          h = Σ w·α·V / A — mittlere Tiefe über die Säulenfläche,
                 volumentreu; mit ihr rechnen Froude und Energiehöhe.
- Wasserspiegel  WSP = u + W / A_S. u = Unterkante der obersten nassen
                 Zelle (α ≥ 0,5) der Säule; W = Wasservolumen aller Zellen
                 der Säule ab u aufwärts; A_S = Grundfläche der Zellen in
                 der Schicht bei u (Fluidfläche, höchstens die Säule).
                 Nebeneinanderliegende feine Zellen zählen so als Fläche,
                 nicht übereinander; an einer Böschung teilt nur die
                 benetzte Rinne. NICHT Sohle + h: in Fall A lag das im
                 Median 0,15 m zu tief, weil die Sohle in der Säule steigt
                 (gemessen 2026-09-24, PROTOKOLL_C). Überfallstrahl über
                 Luft: der Spiegel, den man von oben sieht. Filme ohne nasse
                 Zelle: Sohle + h (Sohle = unterste Zellunterkante).
- ū              tiefengemittelt, horizontal: Σ w·α·V·U_h / Σ w·α·V
- u_oben         Geschwindigkeit der obersten nassen Zelle der Säule
                 (bei Filmen ohne nasse Zelle: der obersten benetzten)
- Froude         Fr = |ū| / √(g·h), nur für h ≥ 2 Zellhöhen, sonst leer —
                 am Benetzungsrand ginge Fr gegen unendlich.

Trocken ist eine Säule mit h ≤ TIEFE_TROCKEN (wie im Client,
`utils/anzeigeSchwellen.js`): WSP und Fr leer, Geschwindigkeiten 0.
"""
from __future__ import annotations

import numpy as np

from .fields import VolumeGrid

G = 9.81
TIEFE_TROCKEN = 0.001      # m — gleich utils/anzeigeSchwellen.js
TIEFE_BENETZT = 0.01       # m — ebenso; ab hier gilt eine Säule als nass für
                           # Nachweise (Sohlschub), darunter ist es ein Film
ALPHA_NASS = 0.5

# Namen im Zeitpunkt-Paket (fields/t_XXXX.npz), je (ny, nx)
PLAN_FELDER = ("plan_h", "plan_wsp", "plan_ux", "plan_uy",
               "plan_uox", "plan_uoy", "plan_uo", "plan_fr")


class PlanNetz:
    """
    Was sich über die Zeit nicht ändert: die Zuordnung Zelle → Säulen mit
    Anteilen, Säule der Zellmitte, Zellmaße, Sohle und kleinste Zellhöhe je
    Säule. Einmal je Lauf gebaut, dann für jeden Zeitpunkt benutzt.

    `quader` = (lo, hi) je Zelle aus `foamfields.zellquader`; ohne gelten
    Würfel der Kante ∛V um das Zellzentrum.
    """

    def __init__(self, centres: np.ndarray, volumes: np.ndarray,
                 grid: VolumeGrid,
                 quader: tuple[np.ndarray, np.ndarray] | None = None):
        centres = np.asarray(centres, dtype=np.float64)
        volumes = np.asarray(volumes, dtype=np.float64)
        if len(centres) != len(volumes):
            raise ValueError(f"{len(centres)} Zellzentren, {len(volumes)} Volumen")
        self.grid = grid
        self.nx, self.ny = grid.dims[0], grid.dims[1]
        self.flaeche = grid.spacing[0] * grid.spacing[1]
        self.volumes = volumes
        n_col = self.nx * self.ny
        if quader is not None:
            lo, hi = (np.asarray(q, dtype=np.float64) for q in quader)
            dx, dy = hi[:, 0] - lo[:, 0], hi[:, 1] - lo[:, 1]
            mx, my = (lo[:, 0] + hi[:, 0]) / 2, (lo[:, 1] + hi[:, 1]) / 2
            unterkante = lo[:, 2]
        else:
            k = np.cbrt(volumes)
            dx = dy = k
            mx, my = centres[:, 0], centres[:, 1]
            unterkante = centres[:, 2] - k / 2
        hoehe = volumes / (dx * dy)
        self.hoehe = hoehe
        self.grundflaeche = dx * dy

        # anteilige Überdeckung je Achse: Zellintervall [m − d/2, m + d/2]
        # gegen die Säulenintervalle
        def achse(m, d, o, s, n):
            a, b = m - d / 2, m + d / 2
            i0 = np.floor((a - o) / s).astype(np.int64)
            i1 = np.floor((b - o) / s - 1e-9).astype(np.int64)
            teile = []
            for off in range(int((i1 - i0).max()) + 1 if len(m) else 0):
                i = i0 + off
                lo = np.maximum(a, o + i * s)
                hi = np.minimum(b, o + (i + 1) * s)
                w = np.clip(hi - lo, 0.0, None) / d
                ok = (w > 0) & (i >= 0) & (i < n)
                teile.append((i, w, ok))
            return teile

        tx = achse(mx, dx, grid.origin[0], grid.spacing[0], self.nx)
        ty = achse(my, dy, grid.origin[1], grid.spacing[1], self.ny)
        zellen, saeulen, anteile = [], [], []
        idx = np.arange(len(centres))
        for ix, wx, okx in tx:
            for iy, wy, oky in ty:
                ok = okx & oky
                zellen.append(idx[ok])
                saeulen.append(iy[ok] * self.nx + ix[ok])
                anteile.append(wx[ok] * wy[ok])
        self.zelle = np.concatenate(zellen) if zellen else np.zeros(0, np.int64)
        self.saeule = np.concatenate(saeulen) if saeulen else np.zeros(0, np.int64)
        self.anteil = np.concatenate(anteile) if anteile else np.zeros(0)

        # Säule der Zellmitte — für Sohle, Zellhöhe, Spiegel
        i = np.floor((centres[:, 0] - grid.origin[0]) / grid.spacing[0]).astype(np.int64)
        j = np.floor((centres[:, 1] - grid.origin[1]) / grid.spacing[1]).astype(np.int64)
        drin = (i >= 0) & (i < self.nx) & (j >= 0) & (j < self.ny)
        self._drin = np.nonzero(drin)[0]
        self.mitte = np.where(drin, j * self.nx + i, -1)
        self.z = centres[:, 2]
        self.unterkante = unterkante

        d = self._drin
        self.sohle = np.full(n_col, np.inf)
        np.minimum.at(self.sohle, self.mitte[d], self.unterkante[d])
        self.sohle[~np.isfinite(self.sohle)] = np.nan
        self.zellhoehe = np.full(n_col, np.inf)
        np.minimum.at(self.zellhoehe, self.mitte[d], hoehe[d])
        self.zellhoehe[~np.isfinite(self.zellhoehe)] = np.nan

        # Zellen je Säule von unten nach oben — die letzte einer Auswahl je
        # Säule ist ihre oberste
        ordnung = np.lexsort((self.z[d], self.mitte[d]))
        self._sortiert = d[ordnung]

    def _oberste(self, maske: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Je Säule die oberste Zelle unter `maske`: (Säulen, Zellindizes)."""
        z = self._sortiert[maske[self._sortiert]]
        if not len(z):
            return np.zeros(0, np.int64), np.zeros(0, np.int64)
        s = self.mitte[z]
        letzte = np.ones(len(z), dtype=bool)
        letzte[:-1] = s[:-1] != s[1:]
        return s[letzte], z[letzte]

    def _spiegel(self, a: np.ndarray, wasser: np.ndarray, n_col: int
                 ) -> np.ndarray:
        """WSP = u + W / A_S je Säule mit nasser Zelle, sonst NaN."""
        s_top, z_top = self._oberste(a >= ALPHA_NASS)
        u = np.full(n_col, np.nan)
        eps = np.full(n_col, np.nan)
        u[s_top] = self.unterkante[z_top]
        eps[s_top] = 0.25 * self.hoehe[z_top]
        d = self._drin
        col = self.mitte[d]
        uk = self.unterkante[d]
        ab_u = np.isfinite(u[col]) & (uk >= u[col] - eps[col])
        schicht = ab_u & (uk <= u[col] + eps[col])
        W = np.bincount(col[ab_u], weights=wasser[d][ab_u], minlength=n_col)
        A = np.bincount(col[schicht], weights=self.grundflaeche[d][schicht],
                        minlength=n_col)
        A = np.minimum(A, self.flaeche)
        out = np.full(n_col, np.nan)
        ok = np.isfinite(u) & (A > 0)
        out[ok] = u[ok] + W[ok] / A[ok]
        return out

    def raster(self, alpha: np.ndarray, U: np.ndarray | None = None
               ) -> tuple[dict[str, np.ndarray], dict]:
        """Planraster eines Zeitpunkts + Kennzahlen (Volumen, Säulen)."""
        n_col = self.nx * self.ny
        a = np.clip(np.asarray(alpha, dtype=np.float64), 0.0, 1.0)
        wasser = a * self.volumes                        # m³ je Zelle
        gew = wasser[self.zelle] * self.anteil
        wv = np.bincount(self.saeule, weights=gew, minlength=n_col)
        h = wv / self.flaeche

        ux = np.zeros(n_col)
        uy = np.zeros(n_col)
        if U is not None:
            U = np.asarray(U, dtype=np.float64)
            sx = np.bincount(self.saeule, weights=gew * U[self.zelle, 0],
                             minlength=n_col)
            sy = np.bincount(self.saeule, weights=gew * U[self.zelle, 1],
                             minlength=n_col)
            nass_h = wv > 1e-12
            ux[nass_h] = sx[nass_h] / wv[nass_h]
            uy[nass_h] = sy[nass_h] / wv[nass_h]

        nass = h > TIEFE_TROCKEN
        wsp = np.where(nass, self.sohle + h, np.nan)       # Filme
        oben = self._spiegel(a, wasser, n_col)
        mit_zelle = nass & np.isfinite(oben)
        wsp[mit_zelle] = oben[mit_zelle]
        # Säulen, in denen der Spiegel mehr als eine Zellhöhe über Sohle + h
        # liegt: steigende Sohle in der Säule (Böschung) oder Luft darunter
        # (Überfallstrahl) — nur gezählt, die Definition gilt für beide
        teil = mit_zelle & np.isfinite(self.zellhoehe) \
            & (oben - (self.sohle + h) > self.zellhoehe)

        # Oberflächengeschwindigkeit: oberste nasse, bei Filmen oberste
        # benetzte Zelle
        uox = np.zeros(n_col)
        uoy = np.zeros(n_col)
        uo = np.zeros(n_col)
        if U is not None:
            s_film, z_film = self._oberste(a > 0.0)
            s_top, z_top = self._oberste(a >= ALPHA_NASS)
            for s, z in ((s_film, z_film), (s_top, z_top)):   # nass gewinnt
                uox[s] = U[z, 0]
                uoy[s] = U[z, 1]
                uo[s] = np.linalg.norm(U[z], axis=1)
            for arr in (uox, uoy, uo):
                arr[~nass] = 0.0
        ux[~nass] = 0.0
        uy[~nass] = 0.0

        fr = np.full(n_col, np.nan)
        tief = nass & (h >= 2 * np.nan_to_num(self.zellhoehe, nan=np.inf))
        fr[tief] = np.hypot(ux[tief], uy[tief]) / np.sqrt(G * h[tief])

        shape = (self.ny, self.nx)
        felder = {"plan_h": h, "plan_wsp": wsp, "plan_ux": ux, "plan_uy": uy,
                  "plan_uox": uox, "plan_uoy": uoy, "plan_uo": uo,
                  "plan_fr": fr}
        felder = {k: v.reshape(shape).astype(np.float32) for k, v in felder.items()}
        info = {"volumen_raster": float(wv.sum()),
                "volumen_zellen": float(wasser.sum()),
                "nasse_saeulen": int(nass.sum()),
                "teil_saeulen": int(teil.sum())}
        return felder, info


def plan_volume_check(infos: list[tuple[float, dict]], df) -> dict | None:
    """
    Selbsttest wie `viz_volume_check`, für die Planraster: Σ h·A gegen die
    Volumenreihe des Solvers (volFieldValue) je Ausgabezeitpunkt innerhalb
    der Reihe.
    """
    from .conventions import Quantity
    if not infos:
        return None
    sub = df[(df["quantity"] == Quantity.VOLUME.value)
             & (df["location_id"] == "domain")]
    if sub.empty:
        return None
    t_ref = sub["time"].to_numpy(float)
    v_ref = sub["value"].to_numpy(float)
    rel = []
    for t, info in infos:
        if not t_ref[0] - 1e-9 <= t <= t_ref[-1] + 1e-9:
            continue            # außerhalb der Reihe (t = 0 vor dem ersten Takt)
        soll = float(np.interp(t, t_ref, v_ref))
        if soll > 1e-9:
            rel.append(abs(info["volumen_raster"] - soll) / soll)
    if not rel:
        return None
    return {"plan_volume_error_rel_max": round(float(max(rel)), 5),
            "plan_volume_error_rel_mean": round(float(np.mean(rel)), 5),
            "plan_teil_saeulen_max": max(i["teil_saeulen"] for _, i in infos)}
