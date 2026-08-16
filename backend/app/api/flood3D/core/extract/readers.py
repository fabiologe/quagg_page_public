"""
Fachliche Leser: eine Funktion je Ergebnisquelle, Ausgabe sind Zeilen der
normalisierten Zwischendatei (Spez. 4.2).

Namenskontrakt zwischen casebuilder und extract (casebuilder erzeugt die
functionObjects in Stufe 3 mit genau diesen Namen):

    postProcessing/forces_<patch_id>/        forces.dat oder force.dat+moment.dat
    postProcessing/discharge_<section_id>/   surfaceFieldValue.dat
    postProcessing/gauge_<gauge_id>/         position.dat (interfaceHeight),
                                             ersatzweise height.dat
    postProcessing/water_volume/             volFieldValue.dat
    postProcessing/residuals/                residuals.dat oder solverInfo.dat
    log.<application>                        Courant, deltaT, Kontinuität

Sonderwerte der Spalte location_id für Größen ohne Ortsbezug:
    "domain" für das Wasservolumen, "solver" für Courant, Zeitschritt und
    Kontinuität, Feldname (p_rgh, Ux, …) für Residuen.
"""
from __future__ import annotations

import math
import os
import re
from pathlib import Path

from ..conventions import UNITS, Component, Quantity
from .datfile import (list_start_dirs, merge_restart_rows, read_scalar_fo,
                      read_vector_fo)


def _row(run_id, time, quantity: Quantity, location, component: Component,
         value, source) -> dict:
    return {
        "run_id": run_id, "time": float(time), "quantity": quantity.value,
        "location_id": location, "component": component.value,
        "value": float(value), "unit": UNITS[quantity], "source": source,
    }


def _mag(v: tuple[float, float, float]) -> float:
    return math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)


# --------------------------------------------------------------------------
# Kräfte und Momente
# --------------------------------------------------------------------------

def read_forces(fo_dir: Path, patch_id: str, run_id: str) -> list[dict]:
    """
    Foundation: forces.dat mit 4 bzw. 6 Tripeln je Zeile
    (Kraft p/v[/porös], Moment p/v[/porös]), Gesamtkraft = Summe der Anteile.
    ESI: force.dat und moment.dat mit je 3 Tripeln (total, pressure, viscous).
    """
    rows: list[dict] = []
    src = fo_dir.name

    def emit(quantity: Quantity, t, total, pres, visc):
        for comp, val in ((Component.X, total[0]), (Component.Y, total[1]),
                          (Component.Z, total[2]), (Component.MAGNITUDE, _mag(total))):
            rows.append(_row(run_id, t, quantity, patch_id, comp, val, src))
        # Druck- und Reibungsanteil als Betrag (Spez. 2: getrennt ausweisen)
        rows.append(_row(run_id, t, quantity, patch_id, Component.PRESSURE, _mag(pres), src))
        rows.append(_row(run_id, t, quantity, patch_id, Component.VISCOUS, _mag(visc), src))

    combined = read_vector_fo(fo_dir, "forces.dat")
    if combined:
        for t, triples in combined:
            if len(triples) not in (4, 6):
                continue
            half = len(triples) // 2
            f_parts, m_parts = triples[:half], triples[half:]
            f_tot = tuple(sum(p[i] for p in f_parts) for i in range(3))
            m_tot = tuple(sum(p[i] for p in m_parts) for i in range(3))
            emit(Quantity.FORCE, t, f_tot, f_parts[0], f_parts[1])
            emit(Quantity.MOMENT, t, m_tot, m_parts[0], m_parts[1])
        return rows

    for fname, quantity in (("force.dat", Quantity.FORCE), ("moment.dat", Quantity.MOMENT)):
        parsed = read_vector_fo(fo_dir, fname)
        if parsed:
            for t, triples in parsed:
                if len(triples) >= 3:
                    emit(quantity, t, triples[0], triples[1], triples[2])
            continue
        # ESI 2406 schreibt spaltenbasiert ohne Klammern:
        # Time total_x..z pressure_x..z viscous_x..z
        _, table = read_scalar_fo(fo_dir, fname)
        for r in table:
            if len(r) >= 10:
                emit(quantity, r[0], tuple(r[1:4]), tuple(r[4:7]), tuple(r[7:10]))
    return rows


# --------------------------------------------------------------------------
# Durchfluss je Querschnitt
# --------------------------------------------------------------------------

def read_discharge(fo_dir: Path, section_id: str, normal,
                   run_id: str) -> list[dict]:
    """
    Durchfluss durch einen Querschnitt.

    Der functionObject liefert `weightedAreaIntegrate` von U mit
    alpha.water als Gewicht, also den VEKTOR ∫ α·U dA. Der Durchfluss ist
    dessen Anteil senkrecht zur Schnittebene — deshalb wird hier mit der
    Querschnittsnormalen multipliziert (dieselbe Funktion, die auch die
    Ebene im casebuilder aufspannt).

    Wichtig: `areaNormalIntegrate` wäre der naheliegende Weg, IGNORIERT
    aber das weightField (OpenFOAM v2406 kennt kein
    weightedAreaNormalIntegrate) — damit wurde die Luftströmung
    mitintegriert und der Durchfluss war um Größenordnungen zu hoch.
    """
    rows = read_vector_fo(fo_dir, "surfaceFieldValue.dat")
    n = normal or (1.0, 0.0, 0.0)
    out = []
    for t, triples in rows:
        if not triples:
            continue
        vec = triples[0]
        q = sum(vec[i] * n[i] for i in range(3))
        out.append(_row(run_id, t, Quantity.DISCHARGE, section_id,
                        Component.NONE, q, fo_dir.name))
    return out


# --------------------------------------------------------------------------
# Wasserspiegel je Pegelpunkt
# --------------------------------------------------------------------------

def wall_shear_rho_factor(case_dir: Path, rho: float = 1000.0) -> float:
    """
    Umrechnungsfaktor fuer wallShearStress-Zeitreihen: interFoam gibt das
    Feld ueblicherweise KINEMATISCH aus (m²/s², erste Dimension 0) — dann
    fehlt die Dichte. Erkannt wird das an der dimensions-Zeile der
    Felddatei eines beliebigen Zeitschritts, also an DERSELBEN Quelle wie
    beim Gelaendefeld (foamfields) — vorher multiplizierte die Zeitreihe
    bedingungslos mit 1000 und lief bei dynamischer Ausgabe um den Faktor
    1000 vom Feld weg. Ohne auffindbare Felddatei bleibt die
    interFoam-Annahme (kinematisch).
    """
    for d in sorted(case_dir.iterdir() if case_dir.is_dir() else []):
        if not d.is_dir():
            continue
        try:
            float(d.name)
        except ValueError:
            continue
        for p in (d / "wallShearStress", d / "wallShearStress.gz"):
            if not p.exists():
                continue
            if p.suffix == ".gz":
                import gzip
                with gzip.open(p, "rt", errors="replace") as fh:
                    text = fh.read(2048)
            else:
                text = p.read_text(errors="replace")[:2048]
            m = re.search(r"dimensions\s+\[([^\]]+)\]", text)
            if m:
                return rho if m.group(1).split()[0] == "0" else 1.0
    return rho


def read_wall_shear(fo_dir: Path, patch_id: str, komponente, rho_faktor: float,
                    run_id: str) -> list[dict]:
    """
    Wandschubspannung auf einer Bauwerksflaeche (max bzw. Flaechenmittel).
    rho_faktor kommt aus wall_shear_rho_factor — Dichte nur dann, wenn das
    Feld kinematisch geschrieben wurde.
    """
    _, table = read_scalar_fo(fo_dir, "surfaceFieldValue.dat")
    return [_row(run_id, r[0], Quantity.BED_SHEAR, patch_id, komponente,
                 r[-1] * rho_faktor, fo_dir.name) for r in table]


def read_tracer(fo_dir: Path, patch_id: str, run_id: str) -> list[dict]:
    """
    Markierungsstoff am Ablauf (0…1). Der functionObject mittelt T über die
    Randfläche, gewichtet mit dem Wasseranteil — Luftzellen zählen also
    nicht mit. Aus dieser Durchbruchskurve folgen Verweilzeit und
    Kurzschlussanteil.
    """
    _, table = read_scalar_fo(fo_dir, "surfaceFieldValue.dat")
    return [_row(run_id, r[0], Quantity.TRACER, patch_id, Component.NONE,
                 r[-1], fo_dir.name) for r in table]


def read_gauge(fo_dir: Path, gauge_id: str, z_ref: float,
               run_id: str) -> list[dict]:
    """
    interfaceHeight, ein functionObject je Pegelpunkt. position.dat enthält
    die Lage der Phasengrenze, die z-Spalte (letzte Datenspalte) ist die
    absolute Wasserspiegellage. Fallback height.dat: Höhe der Grenzfläche
    ÜBER dem Bezugspunkt des functionObjects — erst plus Bezugshöhe z_ref
    ist das wieder die absolute Lage. Quantity.LEVEL ist als absolute Höhe
    definiert (conventions); vorher wanderte hier die relative Zahl
    unverändert in max_level- und Überfall-Nachweise.
    """
    names, table = read_scalar_fo(fo_dir, "position.dat")
    if table:
        return [_row(run_id, r[0], Quantity.LEVEL, gauge_id, Component.NONE,
                     r[-1], fo_dir.name) for r in table]
    _, table = read_scalar_fo(fo_dir, "height.dat")
    return [_row(run_id, r[0], Quantity.LEVEL, gauge_id, Component.NONE,
                 r[1] + z_ref, fo_dir.name) for r in table]


# --------------------------------------------------------------------------
# Wasservolumen im Modellgebiet
# --------------------------------------------------------------------------

def read_volume(fo_dir: Path, run_id: str) -> list[dict]:
    _, table = read_scalar_fo(fo_dir, "volFieldValue.dat")
    return [_row(run_id, r[0], Quantity.VOLUME, "domain", Component.NONE,
                 r[1], fo_dir.name) for r in table]


# --------------------------------------------------------------------------
# Residuen
# --------------------------------------------------------------------------

def read_residuals(fo_dir: Path, run_id: str) -> list[dict]:
    """
    Foundation residuals.dat: eine Spalte je Feld (Anfangsresiduum).
    ESI solverInfo.dat: Spalten <Feld>_initial / <Feld>_final, gemischt mit
    Textspalten (<Feld>_solver) — deshalb tokenweise statt Zahlenregex.
    """
    rows: list[dict] = []
    for fname in ("residuals.dat", "solverInfo.dat"):
        chunks, names = [], []
        for d in list_start_dirs(fo_dir):
            f = d / fname
            if not f.exists():
                continue
            header, data = [], []
            for line in f.read_text(errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("#"):
                    header = line.lstrip("#").split()
                    continue
                tokens = line.split()
                try:
                    t = float(tokens[0])
                except ValueError:
                    continue
                data.append((t, tokens))
            if data:
                names = names or header
                chunks.append((float(d.name), data))
        merged = merge_restart_rows(chunks)
        if not merged:
            continue
        for i, name in enumerate(names[1:] if names and
                                 names[0].lower() == "time" else names):
            comp = Component.INITIAL
            field = name
            if name.endswith("_initial"):
                field = name[:-8]
            elif name.endswith("_final"):
                field, comp = name[:-6], Component.FINAL
            elif name.endswith(("_iters", "_solver", "_converged")):
                continue
            elif not re.fullmatch(r"[\w.]+", name):
                continue
            for t, tokens in merged:
                if len(tokens) > i + 1:
                    try:
                        value = float(tokens[i + 1])
                    except ValueError:
                        continue
                    rows.append(_row(run_id, t, Quantity.RESIDUAL, field,
                                     comp, value, fo_dir.name))
        break
    return rows


# --------------------------------------------------------------------------
# Solverlog: Courant, Zeitschritt, Kontinuität
# --------------------------------------------------------------------------

_LOG_TIME = re.compile(r"^Time = ([\d.eE+-]+)")
_LOG_CO = re.compile(r"^Courant Number mean: ([\d.eE+-]+) max: ([\d.eE+-]+)")
_LOG_DT = re.compile(r"^deltaT = ([\d.eE+-]+)")
_LOG_CONT = re.compile(r"continuity errors : .*cumulative = ([\d.eE+-]+)")


# Wie viele Punkte je Diagnose-Reihe hoechstens uebrig bleiben. 20.000 sind
# fuer jede Fehlersuche mehr als genug (bei 240 s Simulationszeit ein Punkt
# alle 12 ms) und kosten rund 1 MB — die ungefilterte Fassung erzeugte an
# einem echten Lauf 4,6 Mio Punkte und 77 MB.
DIAG_PUNKTE = int(os.environ.get("FLOOD3D_DIAG_PUNKTE", "20000"))

# Wie zwei benachbarte Fenster einer Reihe verschmelzen. Die Wahl ist keine
# Geschmacksfrage: sie entscheidet, ob die BEWERTUNG exakt bleibt.
#   courant/max  -> max   (die Spitze ist der Befund; max(max) = max)
#   courant/mean -> mean  (Mittel gleich breiter Fenster = Gesamtmittel)
#   timestep     -> min   (ein dt-Einbruch ist die Signatur, die man sucht)
#   continuity   -> last  (kumulativer Fehler; der letzte Wert zaehlt)
_VERSCHMELZEN = {
    (Quantity.COURANT, Component.MAX): "max",
    (Quantity.COURANT, Component.MEAN): "mean",
    (Quantity.TIMESTEP, Component.NONE): "min",
    (Quantity.CONTINUITY, Component.NONE): "last",
}


class _Verdichter:
    """
    Haelt hoechstens ``2*ziel`` Punkte einer Reihe, jeder Punkt fasst genau
    ``breite`` Zeitschritte zusammen. Laeuft der Puffer voll, verschmelzen
    je zwei Nachbarn und die Fensterbreite verdoppelt sich.

    Warum die Fenster GLEICH breit sein muessen: sonst mischt ein Mittelwert
    Fenster verschiedener Laenge, und `evaluate` (das ungewichtet mittelt)
    bekaeme einen anderen Wert als vorher. Deshalb sammelt ein offenes
    Fenster erst seine ``breite`` Schritte, bevor es in den Puffer geht —
    zusammengefasst wird nie Halbfertiges mit Fertigem.

    Damit bleiben exakt erhalten: Maximum (Courant-Spitze = Befundschwelle),
    Minimum (dt-Einbruch) und letzter Wert (kumulativer Kontinuitaetsfehler).
    Der Mittelwert stimmt bis auf das letzte, womoeglich angebrochene
    Fenster — also besser als ein Promille.
    """

    def __init__(self, ziel: int, art: str):
        self.ziel = max(1, ziel)
        self.art = art
        self.breite = 1
        self.t: list[float] = []
        self.v: list[float] = []
        self._n = 0                 # Zeitschritte im offenen Fenster
        self._t = 0.0
        self._summe = 0.0
        self._wert: float | None = None

    def dazu(self, t: float, wert: float) -> None:
        self._t = t
        self._n += 1
        if self.art == "mean":
            self._summe += wert
        elif self._wert is None or self.art == "last":
            self._wert = wert
        elif self.art == "max":
            if wert > self._wert:
                self._wert = wert
        elif wert < self._wert:     # "min"
            self._wert = wert
        if self._n >= self.breite:
            self._fenster_schliessen()

    def fertig(self) -> None:
        """Das angebrochene Fenster am Ende des Logs noch mitnehmen."""
        if self._n:
            self._fenster_schliessen()

    def _fenster_schliessen(self) -> None:
        wert = (self._summe / self._n) if self.art == "mean" else self._wert
        self.t.append(self._t)
        self.v.append(float(wert))
        self._n, self._summe, self._wert = 0, 0.0, None
        if len(self.t) >= 2 * self.ziel:
            self._halbieren()
            self.breite *= 2

    def _halbieren(self) -> None:
        t_neu, v_neu = [], []
        for i in range(0, len(self.t) - 1, 2):
            a, b = self.v[i], self.v[i + 1]
            if self.art == "max":
                wert = a if a > b else b
            elif self.art == "min":
                wert = a if a < b else b
            elif self.art == "mean":
                wert = (a + b) / 2.0        # gleich breite Fenster: exakt
            else:                           # "last"
                wert = b
            t_neu.append(self.t[i + 1])
            v_neu.append(wert)
        if len(self.t) % 2:                 # ungerader Rest bleibt stehen
            t_neu.append(self.t[-1])
            v_neu.append(self.v[-1])
        self.t, self.v = t_neu, v_neu


def read_log(log_path: Path, run_id: str) -> list[dict]:
    """
    Reihenfolge im interFoam-Log je Zeitschritt: Courant und deltaT stehen
    VOR der "Time = t"-Zeile und gehören zu diesem t (Puffer, Flush bei
    Time-Zeile). Die Kontinuitätsfehler stehen NACH der Time-Zeile und
    gehören zum zuletzt gesehenen t.

    Gelesen wird ZEILENWEISE und die Diagnose-Reihen werden dabei auf
    DIAG_PUNKTE eingedampft: ein Log mit 760.881 Zeitschritten ist mehrere
    hundert MB Text und ergab 4,6 Mio Zeilen — beides hat niemand je
    angesehen, und beides hat den Server umgebracht (2026-08-15).
    """
    verdichter: dict[tuple, _Verdichter] = {}

    def merke(t: float, quantity: Quantity, loc: str, comp: Component,
              wert: float) -> None:
        schluessel = (quantity, loc, comp)
        v = verdichter.get(schluessel)
        if v is None:
            art = _VERSCHMELZEN.get((quantity, comp), "last")
            v = verdichter[schluessel] = _Verdichter(DIAG_PUNKTE, art)
        v.dazu(t, wert)

    pending: list[tuple[Quantity, str, Component, float]] = []
    current_t: float | None = None
    src = log_path.name
    with open(log_path, encoding="utf-8", errors="replace") as _f:
        for line in _f:
            if m := _LOG_CO.match(line):
                pending.append((Quantity.COURANT, "solver", Component.MEAN,
                                float(m.group(1))))
                pending.append((Quantity.COURANT, "solver", Component.MAX,
                                float(m.group(2))))
            elif m := _LOG_DT.match(line):
                pending.append((Quantity.TIMESTEP, "solver", Component.NONE,
                                float(m.group(1))))
            elif m := _LOG_CONT.search(line):
                if current_t is not None:
                    merke(current_t, Quantity.CONTINUITY, "solver",
                          Component.NONE, float(m.group(1)))
            elif m := _LOG_TIME.match(line):
                current_t = float(m.group(1))
                for q, loc, c, v in pending:
                    merke(current_t, q, loc, c, v)
                pending = []

    # erst jetzt Zeilen bauen — und zwar nur noch die verdichteten
    rows: list[dict] = []
    for (quantity, loc, comp), v in verdichter.items():
        v.fertig()
        rows.extend(_row(run_id, t, quantity, loc, comp, wert, src)
                    for t, wert in zip(v.t, v.v))
    rows.sort(key=lambda r: r["time"])
    return rows


def merge_log_restarts(case_dir: Path, application: str, run_id: str) -> list[dict]:
    """log.<application> plus nummerierte Neustartlogs (log.interFoam.1, …)."""
    chunks = []
    for i, p in enumerate(sorted(case_dir.glob(f"log.{application}*"))):
        rows = read_log(p, run_id)
        if rows:
            chunks.append((rows[0]["time"] if i else -1.0,
                           [(r["time"], r) for r in rows]))
    merged = merge_restart_rows(chunks)
    return [r for _, r in merged]
