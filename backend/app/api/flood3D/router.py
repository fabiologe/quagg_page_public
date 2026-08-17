"""
flood3D-API (Spez. Kap. 9), Stufe 2: die lesenden Endpunkte für den
PostViewer-Kennwertteil. Hängt in main.py unter prefix='/FastAPI/flood3d' —
damit läuft es in Dev (vite-Proxy '/FastAPI') und Prod (nginx) ohne
zusätzliche Proxy-Regel.

Die Laufablage ist das store-Layout aus core/store.py. Wurzel per
Umgebungsvariable FLOOD3D_RUNS_ROOT übersteuerbar (Tests), Standard ist
data/runs neben diesem Modul.
"""
from __future__ import annotations

import asyncio

import base64
import hashlib
import json
import os
import re
import shutil
import time
from functools import lru_cache
from collections import OrderedDict
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import (APIRouter, Body, Depends, HTTPException, Query, Request,
                     Response)

from .gate import schreib_gate
from fastapi.responses import FileResponse

# VOR den core-Imports: FLOOD3D_*-Werte aus backend/.env in die Umgebung
# spiegeln. PM2 exportiert die .env nicht, und die core-Module (reisen im
# Bundle, duerfen env_util nicht importieren) lesen rohes os.environ —
# teils schon zur Importzeit (meshgen.MESH_RANKS). Ohne den Spiegel wurden
# diese Werte in Produktion still ignoriert.
from ..flood2D.env_util import env_spiegeln

env_spiegeln("FLOOD3D_")

from .core import fields as vol_fields
from .core.casespec import GEOMETRIE_TEILE, CaseSpec, migriere
from .core.solids import build_solids
from .core.store import (lauf_reservieren, manifest_schreiben,
                         read_manifest, run_paths, runs_root)
from .core.terrain import TerrainField
from .core.validate import validate_case
# Das Laufwerk fährt und bewacht die Läufe (Registries, RunPod-Thread,
# Wächter) — der Router bleibt die HTTP-Schicht davor. Importrichtung:
# Router → laufwerk, nie umgekehrt.
from . import laufwerk
from .laufwerk import _import_entpacken

# Kosten- und Schreib-Gate an EINER Stelle: jede schreibende Anfrage muss das
# Passwort tragen (gate.py). Am Router statt an 22 Endpunkten — damit ist
# auch der nächste neue Endpunkt geschützt, ohne dass jemand daran denkt.
router = APIRouter(dependencies=[Depends(schreib_gate)])

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")
_SAFE_FIG = re.compile(r"^[A-Za-z0-9._-]+\.(png|svg)$")


# runs_root() lebt jetzt als Pfad-Politik in core/store.py


def _paths(run_id: str):
    if not _SAFE.match(run_id):
        raise HTTPException(status_code=422, detail=f"Ungültige Laufkennung: {run_id}")
    p = run_paths(runs_root(), run_id)
    if not p.root.is_dir():
        raise HTTPException(status_code=404, detail=f"Lauf {run_id} unbekannt.")
    return p


def _result(paths) -> dict | None:
    if paths.result.exists():
        with open(paths.result, encoding="utf-8") as f:
            return json.load(f)
    return None


# Die Zwischendatei wird NIE mehr im Ganzen gelesen.
#
# Rentrich_BetaTest08_r004 hat 7,6 Mio Zeilen: 77 MB auf der Platte, aber
# 906 MB als DataFrame. pm2 laeuft in einer Cgroup mit 1 GiB (MemoryMax) —
# ein einziger solcher Lauf hat den Server am 2026-08-15 reihenweise vom
# OOM-Killer erschiessen lassen, waehrend Fabio nur die Ergebnisse ansehen
# wollte. Parquet ist spaltenweise und filtert schon beim LESEN: fuer eine
# Zeitreihe kommen damit 480 Zeilen und 0,06 MB statt 906 MB an (0,23 s).
#
# NACHGEMESSEN (2026-08-15, zweiter Anlauf): die erste Kur sprang zu kurz.
# `read_parquet(filters=…)` liefert zwar nur die gewuenschte Groesse — aber
# `residual` IST 3 Mio Zeilen (367 MB), und im Cache lagen bis zu acht
# davon: drei harmlose Abfragen brachten den Prozess auf 1,35 GB. Der
# Dataset-Scanner der Bilanz las ausserdem 16 Stapel voraus (925 MB
# Spitze). Deshalb jetzt EIN Weg fuer alle Zeitreihen:
#   ParquetFile.iter_batches  (ein Stapel, kein Vorauslesen)
#   -> je Reihe nur (t, v) als float-Arrays  (die STRINGS sind das Schwere)
#   -> ausduennen auf Diagrammgroesse
#   -> und nur DIESES kleine Ergebnis wird gemerkt (KB statt MB).


# Fuer die Bilanz-/Konvergenzansicht: mehr Punkte als das Diagramm breit
# ist, kann niemand sehen — und 760.881 Solverschritte (so viele hat
# Rentrich_BetaTest08_r004) sind weder uebertragbar noch zeichenbar.
_BILANZ_MAX_PUNKTE = 4000


def _ausduennen(t, v, komponente: str):
    """
    Auf hoechstens _BILANZ_MAX_PUNKTE eindampfen. Maximum-Reihen (Courant!)
    werden je Fenster als MAXIMUM zusammengefasst, nicht abgetastet — sonst
    verschwindet genau die Spitze, wegen der man hinsieht.
    """
    import numpy as np

    n = len(t)
    if n <= _BILANZ_MAX_PUNKTE:
        return t, v
    fenster = int(np.ceil(n / _BILANZ_MAX_PUNKTE))
    rest = n - (n % fenster)
    tb = t[:rest].reshape(-1, fenster)
    vb = v[:rest].reshape(-1, fenster)
    if komponente == "max":
        stelle = vb.argmax(axis=1)
        zeile = np.arange(len(stelle))
        return tb[zeile, stelle], vb[zeile, stelle]
    return tb[:, -1], vb[:, -1]        # letzter Wert je Fenster


def _reihen_verdichtet(paths, quantities: tuple[str, ...]) -> dict:
    """Ausgeduennte Zeitreihen eines Laufs, gemerkt (klein)."""
    if not paths.normalized.exists():
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegt keine Zwischendatei vor.")
    return _reihen_gelesen(str(paths.normalized),
                           paths.normalized.stat().st_mtime_ns,
                           tuple(sorted(quantities)))


@lru_cache(maxsize=6)
def _reihen_gelesen(pfad: str, mtime_ns: int, quantities: tuple[str, ...]
                    ) -> dict[tuple[str, str, str], dict]:
    """
    Zeitreihen stapelweise einsammeln, je Reihe nur (t, v) behalten und auf
    Diagrammgroesse eindampfen.

    ``iter_batches`` statt ``dataset.to_batches``: der Dataset-Scanner liest
    16 Stapel voraus und stand damit bei 925 MB, obwohl die Schleife
    stapelweise aussah (gemessen 2026-08-15). ParquetFile liest genau einen.
    """
    import numpy as np
    import pyarrow.parquet as pq

    roh: dict[tuple[str, str, str], dict] = {}
    datei = pq.ParquetFile(pfad)
    for stapel in datei.iter_batches(
            columns=["quantity", "location_id", "component", "time",
                     "value", "unit"],
            batch_size=100_000):
        teil = stapel.to_pandas()
        teil = teil[teil["quantity"].isin(quantities)]
        if teil.empty:
            continue
        for schluessel, gruppe in teil.groupby(
                ["quantity", "location_id", "component"], sort=False):
            eintrag = roh.setdefault(schluessel, {"t": [], "v": [], "unit": ""})
            eintrag["t"].append(gruppe["time"].to_numpy(float))
            eintrag["v"].append(gruppe["value"].to_numpy(float))
            if not eintrag["unit"] and len(gruppe):
                eintrag["unit"] = str(gruppe["unit"].iloc[0])

    fertig = {}
    for (menge, ort, komponente), eintrag in roh.items():
        t = np.concatenate(eintrag["t"])
        v = np.concatenate(eintrag["v"])
        ordnung = np.argsort(t, kind="stable")
        t, v = _ausduennen(t[ordnung], v[ordnung], komponente)
        fertig[(menge, ort, komponente)] = {
            "quantity": menge, "location_id": ort, "component": komponente,
            "unit": eintrag["unit"], "t": t.tolist(), "v": v.tolist()}
    return fertig


def _leere_reihe(menge: str, ort: str, komponente: str) -> dict:
    return {"quantity": menge, "location_id": ort, "component": komponente,
            "unit": "", "t": [], "v": []}


def _inventar(paths) -> list[dict]:
    if not paths.normalized.exists():
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegt keine Zwischendatei vor.")
    return _inventar_gelesen(str(paths.normalized),
                             paths.normalized.stat().st_mtime_ns)


@lru_cache(maxsize=4)
def _inventar_gelesen(pfad: str, mtime_ns: int) -> list[dict]:
    """
    Inventar aller Zeitreihen — stapelweise, damit auch eine 7,6-Mio-Zeilen-
    Datei in den Speicher passt: je Stapel gruppieren und die Teilergebnisse
    zusammenfuehren (nie mehr als ein Stapel gleichzeitig im RAM).
    """
    import pyarrow.parquet as pq

    teile = []
    datei = pq.ParquetFile(pfad)
    for stapel in datei.iter_batches(
            columns=["quantity", "location_id", "component", "time"],
            batch_size=200_000):
        teile.append(stapel.to_pandas()
                     .groupby(["quantity", "location_id", "component"],
                              sort=False)["time"]
                     .agg(n="size", t_min="min", t_max="max"))
    if not teile:
        return []
    gesamt = pd.concat(teile).groupby(level=[0, 1, 2], sort=True).agg(
        n=("n", "sum"), t_min=("t_min", "min"), t_max=("t_max", "max"))
    return gesamt.reset_index().to_dict(orient="records")


# --------------------------------------------------------------------------

@router.on_event("startup")
async def _docker_waechter():
    """
    Verwaiste f3d_*-Container beim Start abräumen: Läufe leben in Threads
    dieses Prozesses — nach einem Neustart wartet auf keinen Container mehr
    jemand, er rechnet nur ins Leere und frisst Kerne. Genau so entstand
    der Vorfall vom 2026-08-11 (Vorschau-Container überlebte den Restart
    und blockierte den Containernamen).
    """
    from .core.runner import verwaiste_container_entfernen

    entfernt = await asyncio.to_thread(verwaiste_container_entfernen)
    if entfernt:
        print(f"flood3d: {len(entfernt)} verwaiste OpenFOAM-Container "
              f"entfernt ({', '.join(entfernt)})")


@router.get("/verifikation")
async def verifikation():
    """
    Ergebnisse der physikalischen Verifikationsläufe (Spez. Kap. 13):
    Referenzfälle gegen analytische Formeln, geschrieben von
    tests/test_verifikation.py (FLOOD3D_VERIFIKATION=1). Der Client zeigt
    sie in der Phase „Simulation" — damit sichtbar ist, WANN zuletzt
    belegt wurde, dass die Pipeline richtige Zahlen liefert.
    """
    verz = Path(__file__).resolve().parent / "data" / "verifikation"
    out = []
    if verz.is_dir():
        for p in sorted(verz.glob("*.json")):
            try:
                out.append(json.loads(p.read_text()))
            except Exception:                # noqa: BLE001
                out.append({"fall": p.stem, "beschaedigt": True})
    return out


@router.get("/health")
async def health():
    root = runs_root()
    n = sum(1 for d in root.iterdir() if d.is_dir()) if root.is_dir() else 0
    return {"status": "ok", "service": "flood3d", "runs": n}


# "lokal" = auf der Nutzer-Maschine reserviert/gerechnet — der Server kann
# den Fortschritt nicht sehen, darum weder pollen noch als hängend markieren
_TERMINAL_STATUS = {"completed", "failed", "lokal", "abgebrochen",
                    "teilergebnis"}


def _run_size_mb(d: Path) -> float:
    return round(sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
                 / 1e6, 1)


def _run_stale(d: Path, status: str) -> bool:
    """
    Lauf im Zwischenzustand, dessen Logs seit 15 min nicht mehr wachsen —
    vermutlich abgestürzter Runner. Sonst pollt die Laufliste ewig.
    """
    if status in _TERMINAL_STATUS:
        return False
    newest = 0.0
    for f in list(d.glob("manifest.json")) + list((d / "case").glob("log.*")):
        try:
            newest = max(newest, f.stat().st_mtime)
        except OSError:
            continue
    return newest > 0 and (time.time() - newest) > 900


@router.get("/runs")
async def list_runs():
    root = runs_root()
    out = []
    if not root.is_dir():
        return out
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        paths = run_paths(root, d.name)
        result = _result(paths)
        manifest = read_manifest(paths) or {}
        targets = (result or {}).get("targets", [])
        status = (result or {}).get("status", manifest.get("status", "unbekannt"))
        # Companion-Reservierung, deren Import nie kam: nach 7 Tagen als
        # verfallen kennzeichnen — der Löschknopf existiert (Audit H5)
        verfallen = (status == "lokal"
                     and (time.time() - float(manifest.get("created", 0)))
                     > 7 * 86400)
        from .core.archiv import marke_lesen
        marke = marke_lesen(d)
        out.append({
            "run_id": d.name,
            "status": status,
            "verfallen": verfallen,
            # Ausgelagert auf die StorageBox: Manifest und Bewertung liegen
            # weiter lokal, Felder/Abbildungen holt der Server auf Anforderung
            "archiviert": marke is not None,
            "archiv_bytes": (marke or {}).get("bytes"),
            # Qualitaets-Befunde als Zaehler fuer den Listen-Chip — die
            # Zahlen selbst zeigt die Qualitaetsansicht
            "befunde_fehler": sum(1 for b in (manifest.get("befunde") or [])
                                  if b.get("severity") == "fehler"),
            "befunde_warnung": sum(1 for b in (manifest.get("befunde") or [])
                                   if b.get("severity") == "warnung"),
            "stale": _run_stale(d, status),
            "size_mb": _run_size_mb(d),
            "title": manifest.get("title", ""),
            # Manifest zuerst: es trägt den Hash seit dem START, das Ergebnis
            # erst am Ende — gescheiterte Läufe hatten sonst gar keinen
            "case_hash": manifest.get("case_hash") or (result or {}).get("case_hash"),
            # Netz-Identitaet aus dem Manifest — zur Anzeige. Fuer die
            # Paarung zweier Laeufe ist sie NICHT massgeblich: dort
            # rechnet /runs/vergleich die Kennung aus dem gesicherten
            # Stand neu, weil die hier gespeicherten Werte aus der alten,
            # zu strengen Rechnung stammen (vor 2026-08-17 steckte die
            # Zuflussmenge mit im Netz-Hash).
            "netz_hash": (manifest.get("netz") or {}).get("netz_hash"),
            # Liegt die Geometrie dieses Laufs gesichert daneben? Nur dann
            # lässt sie sich als Stand zurückholen (Altläufe: nein)
            "spec_gesichert": (paths.root / "spec" / "case.yaml").is_file(),
            "n_targets": len(targets),
            "n_erfuellt": sum(1 for t in targets if t.get("result") == "erfuellt"),
            "n_nicht_erfuellt": sum(1 for t in targets if t.get("result") == "nicht_erfuellt"),
            "has_normalized": paths.normalized.exists(),
        })
    return out


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    """Lauf samt Feldern löschen — Läufe sind der Plattenfresser des Tools."""
    root = runs_root().resolve()
    target = (root / run_id).resolve()
    if target.parent != root or not target.is_dir():
        raise HTTPException(status_code=404, detail="Lauf nicht gefunden")
    shutil.rmtree(target)
    return {"deleted": run_id}


@router.post("/runs/{run_id}/archivieren")
async def run_archivieren(run_id: str, request: Request):
    """
    Fertigen Lauf auf die StorageBox auslagern (Spez.: Platte ist der Deckel).

    Kosten-Gate davor: Ein Fremder soll weder Bandbreite verbrennen noch
    Läufe verschieben.
    """
    from .core.archiv import ArchivFehler, archivieren
    from .gate import pruefe_kosten_gate

    pruefe_kosten_gate(request)
    paths = _paths(run_id)
    result = _result(paths)
    manifest = read_manifest(paths) or {}
    status = (result or {}).get("status", manifest.get("status", "unbekannt"))
    root = runs_root().resolve()
    ziel = (root / run_id).resolve()
    if ziel.parent != root or not ziel.is_dir():
        raise HTTPException(status_code=404, detail="Lauf nicht gefunden")
    try:
        marke = archivieren(ziel, status)
    except ArchivFehler as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"run_id": run_id, "archiviert": True, **marke}


@router.post("/runs/{run_id}/wiederherstellen")
async def run_wiederherstellen(run_id: str, request: Request):
    """Ausgelagerten Lauf zurückholen — nötig für 3D-Felder und Abbildungen."""
    from .core.archiv import ArchivFehler, wiederherstellen
    from .gate import pruefe_kosten_gate

    pruefe_kosten_gate(request)
    root = runs_root().resolve()
    ziel = (root / run_id).resolve()
    if ziel.parent != root or not ziel.is_dir():
        raise HTTPException(status_code=404, detail="Lauf nicht gefunden")
    try:
        return wiederherstellen(ziel)
    except ArchivFehler as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/archiv")
async def archiv_stand(alter_tage: float = Query(14.0)):
    """
    Was liegt im Archiv, was könnte hin? (Anzeige, ohne etwas zu bewegen.)
    """
    from .core.archiv import (archiv_bereit, archiv_wurzel, ist_archiviert,
                              kandidaten, marke_lesen)

    root = runs_root()
    bereit, grund = archiv_bereit()

    def _status(d):
        paths = run_paths(root, d.name)
        result = _result(paths)
        return (result or {}).get("status",
                                  (read_manifest(paths) or {}).get("status", ""))

    archiviert, frei_gemacht = [], 0
    if root.is_dir():
        for d in sorted(root.iterdir()):
            if d.is_dir() and ist_archiviert(d):
                marke = marke_lesen(d) or {}
                archiviert.append({"run_id": d.name, "bytes": marke.get("bytes", 0),
                                   "archiviert_am": marke.get("archiviert_am")})
                frei_gemacht += marke.get("bytes", 0)
    offen = []
    if root.is_dir() and bereit:
        offen = [{"run_id": d.name, "status": st, "bytes": b}
                 for d, st, b in kandidaten(root, alter_tage, _status)]
    return {"wurzel": str(archiv_wurzel()), "bereit": bereit, "grund": grund,
            "archiviert": archiviert, "frei_gemacht_bytes": frei_gemacht,
            "kandidaten": offen, "alter_tage": alter_tage}


# WICHTIG: vor "/runs/{run_id}" — sonst verschluckt der Platzhalter den
# Pfad und "vergleich" käme als Laufkennung an.
@router.get("/runs/vergleich")
async def runs_vergleich(a: str = Query(...), b: str = Query(...)):
    """
    Worin unterscheiden sich zwei Läufe — und darf man ihre Karten
    übereinanderlegen?

    Gebaut für die Laubkarten, die zwei Läufe Zelle für Zelle verschneiden.
    Vorher entschied das ein einziger Netz-Hash, und der war zu streng: er
    umfasste die Randbedingungen vollständig, also auch die Zuflussmenge.
    Damit fiel ausgerechnet das Paar durch, für das die Prüfung da ist —
    ein Leerlauf und ein Spülschwall unterscheiden sich per Definition im
    Zufluss (gemessen an Rentrich_BetaTest08 r006/r007: gleiches Netz,
    29.010 Zellen, identisches Ausgaberaster, einziger Unterschied
    q = 0,0 gegen 0,8 m³/s).

    Jetzt getrennt beantwortet:
      `raster`     deckt sich das Ausgabegitter? — die einzige HARTE
                   Bedingung, und die einzige, die `rechenbar` bestimmt
      `netz`       dieselbe Vernetzung?
      `geometrie`  dasselbe Bauwerk? (`unbekannt` bei Läufen ohne
                   gesicherten Stand)
      `unterschiede` die Fundstellen im Klartext, damit aus „ungleich"
                   eine Aussage wird
    """
    from .core.vergleich import paar_stufe, raster_gleich, spec_unterschiede

    def stand(run_id: str) -> tuple[dict, dict | None, CaseSpec | None]:
        paths = _paths(run_id)
        index = vol_fields.read_index(paths.root)
        manifest = read_manifest(paths) or {}
        yaml = paths.root / "spec" / "case.yaml"
        spec = None
        if yaml.is_file():
            try:
                spec = CaseSpec.from_yaml(yaml)
            except Exception:      # noqa: BLE001 — unlesbar = wie nicht da
                spec = None
        return manifest, index, spec

    ma, ia, sa = stand(a)
    mb, ib, sb = stand(b)

    raster = raster_gleich((ia or {}).get("grid"), (ib or {}).get("grid"))

    # Die Kennungen aus dem GESICHERTEN STAND nachrechnen, nicht aus dem
    # Manifest lesen: die dort gespeicherten Werte stammen aus der alten,
    # zu strengen Rechnung. Nur so wirkt die Korrektur rückwirkend.
    netz_a = sa.netz_hash() if sa else (ma.get("netz") or {}).get("netz_hash")
    netz_b = sb.netz_hash() if sb else (mb.get("netz") or {}).get("netz_hash")
    netz_gleich = bool(netz_a and netz_b and netz_a == netz_b)

    if sa is None or sb is None:
        geometrie = "unbekannt"
        unterschiede: list[dict] = []
    elif sa.geometrie_hash() == sb.geometrie_hash():
        geometrie = "gleich"
        unterschiede = spec_unterschiede(
            sa.model_dump(mode="json").get("boundaries"),
            sb.model_dump(mode="json").get("boundaries"), "boundaries")
    else:
        geometrie = "verschieden"
        unterschiede = spec_unterschiede(
            {k: sa.model_dump(mode="json").get(k) for k in GEOMETRIE_TEILE},
            {k: sb.model_dump(mode="json").get(k) for k in GEOMETRIE_TEILE})

    return {"a": a, "b": b,
            "raster": raster,
            "netz": {"gleich": netz_gleich, "a": netz_a, "b": netz_b},
            "geometrie": {"stand": geometrie},
            "unterschiede": unterschiede,
            "stufe": paar_stufe(raster["gleich"], netz_gleich, geometrie),
            # Rechnen darf man, sobald sich die Karten decken. Eine rote
            # Ampel warnt dann, sperrt aber nicht — sonst säße man wieder
            # fest wie vorher am Netz-Hash.
            "rechenbar": raster["gleich"]}


@router.get("/runs/{run_id}")
async def run_detail(run_id: str):
    paths = _paths(run_id)
    result = _result(paths)
    manifest = read_manifest(paths) or {}
    return {"run_id": run_id,
            "status": (result or {}).get(
                "status", manifest.get("status", "unbekannt")),
            "manifest": manifest,
            "quality": (result or {}).get("quality", {})}


@router.get("/runs/{run_id}/result")
async def run_result(run_id: str):
    result = _result(_paths(run_id))
    if result is None:
        raise HTTPException(status_code=404, detail="Kein Ergebnis-JSON vorhanden.")
    return result


@router.get("/runs/{run_id}/extremes")
async def run_extremes(run_id: str):
    result = _result(_paths(run_id))
    return (result or {}).get("extremes", [])


@router.get("/runs/{run_id}/inventory")
async def run_inventory(run_id: str):
    return await asyncio.to_thread(lambda: _inventar(_paths(run_id)))


@router.get("/runs/{run_id}/series")
async def run_series(run_id: str,
                     quantity: str = Query(...),
                     location_id: str | None = Query(None),
                     component: str = Query("")):
    """
    Zeitreihen auf nativer Zeitachse. Ohne location_id alle Orte der Größe.

    Läuft im Thread und filtert EINMAL nach der Größe: bei 7,6 Mio Zeilen
    (Rentrich_BetaTest08_r004) kostete jeder Ort vorher zwei Vollscans über
    die ganze Tabelle — und weil das im Ereignis-Schleifen-Faden lief, stand
    dabei der GESAMTE Server, bis hin zu /health (2026-08-15 real erlebt).
    """
    def arbeit():
        reihen = _reihen_verdichtet(_paths(run_id), (quantity,))
        passend = [r for (menge, ort, komp), r in sorted(reihen.items())
                   if menge == quantity and komp == component
                   and (location_id is None or ort == location_id)]
        return {"run_id": run_id, "series": [r for r in passend if r["t"]]}
    return await asyncio.to_thread(arbeit)


@router.get("/runs/{run_id}/balance")
async def run_balance(run_id: str):
    """Bilanz- und Konvergenzreihen für die Qualitätsansicht (Spez. Kap. 8).
    Im Thread, aus demselben Grund wie /series."""
    def arbeit():
        reihen = _reihen_verdichtet(
            _paths(run_id), ("volume", "continuity", "courant",
                             "timestep", "residual"))

        def hol(menge, ort, komponente=""):
            return reihen.get((menge, ort, komponente)) \
                or _leere_reihe(menge, ort, komponente)

        return {
            "run_id": run_id,
            "volume": hol("volume", "domain"),
            "continuity": hol("continuity", "solver"),
            "courant_mean": hol("courant", "solver", "mean"),
            "courant_max": hol("courant", "solver", "max"),
            "timestep": hol("timestep", "solver"),
            "residuals": [r for (menge, _, _), r in sorted(reihen.items())
                          if menge == "residual"],
        }
    return await asyncio.to_thread(arbeit)


@router.get("/runs/{run_id}/timesteps")
async def run_timesteps(run_id: str):
    """Ausgabezeitpunkte der räumlichen Felder mit Datengröße (Spez. Kap. 9)."""
    paths = _paths(run_id)
    index = vol_fields.read_index(paths.root)
    if index is None:
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegen keine Felddaten vor.")
    return index


# 4 statt 32 Plaetze: je Eintrag 4,1 MB base64 — 32 waeren
# 133 MB, die nie wieder freigegeben werden
@lru_cache(maxsize=4)
def _terrain_solid_b64(pfad: str, mtime: float) -> str | None:
    """
    terrain.stl des Laufs als base64 — aber NUR, wenn sie ein
    geschlossener ERDKÖRPER ist (Bohrungen/Aushübe enthalten!). Der
    Höhenflächen-Export ohne Erdkörper ist eine offene Fläche und bringt
    gegenüber dem Höhenfeld nichts. Entschieden wird am Artefakt des
    Laufs selbst (wasserdicht?), nicht an der Fall-Spec: importierte
    Läufe tragen keine case.yaml, und die Spec im Fallordner kann seit
    dem Lauf weitergeändert sein. mtime im Schlüssel: Import/Archiv-
    Rückholung tauscht die Datei, der Cache folgt.
    """
    import trimesh
    try:
        m = trimesh.load(pfad, force="mesh")
        if not bool(m.is_watertight):
            return None
    except Exception:  # noqa: BLE001 — kaputtes STL heisst nur: Hoehenfeld
        return None
    return base64.b64encode(Path(pfad).read_bytes()).decode()


@router.get("/runs/{run_id}/geometry")
async def run_geometry(run_id: str):
    """
    Statische Szenengeometrie, einmal je Lauf (Spez. Kap. 9):
    Gelände (als Erdkörper MIT Aussparungen, wenn der Lauf einen hat,
    sonst Höhenfeld), Eingabe-Bauwerke (triSurface-STLs des Falls) und —
    falls extrahiert — die tatsächlich vernetzte Solver-Oberfläche je Patch.
    """
    from .core.meshsurface import mesh_surface_patches

    paths = _paths(run_id)
    index = vol_fields.read_index(paths.root)
    terrain = vol_fields.read_geometry(paths.root)
    if index is None:
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegt keine Szenengeometrie vor.")
    # Fehlt nur das Gelände (der Nachlauf auf der Nutzer-Maschine meldet
    # das als Warnung und liefert den Rest), bleiben Bauwerke und
    # Netzoberfläche trotzdem sehenswert — ein 404 machte aus einer
    # fehlenden Schicht einen leeren Viewer.

    solids = []
    terrain_solid = None
    tri_dir = paths.root / "case" / "constant" / "triSurface"
    if tri_dir.is_dir():
        t = tri_dir / "terrain.stl"
        if t.is_file():
            terrain_solid = _terrain_solid_b64(str(t), t.stat().st_mtime)
        for stl in sorted(tri_dir.glob("*.stl")):
            if stl.stem == "terrain":
                continue
            # Vorfüllungs-Prismen sind Anfangszustand, keine Bauwerke
            if stl.stem.startswith("vorfuellung_"):
                continue
            solids.append({"patch": stl.stem,
                           "stl_b64": base64.b64encode(stl.read_bytes()).decode()})

    mesh_patches = []
    extracted = mesh_surface_patches(paths.root / "case")
    if extracted:
        mesh_patches = [{"patch": e["patch"],
                         "stl_b64": base64.b64encode(e["stl"]).decode()}
                        for e in extracted]

    return {
        "grid": index["grid"],
        "terrain": None if terrain is None else {
            "dims": list(terrain.shape),          # (ny, nx)
            "dtype": "f32",
            "z_b64": base64.b64encode(
                terrain.astype("<f4").tobytes()).decode(),
        },
        "solids": solids,
        # der Erdkörper, der WIRKLICH an den Solver ging (inkl. Bohrungen) —
        # None bei Läufen ohne Erdkörper: dann gilt das Höhenfeld
        "terrain_solid": terrain_solid,
        "mesh_patches": mesh_patches,
    }


def _preview_stand(spec: CaseSpec, d: Path) -> dict:
    """
    Steht das Vorschaunetz noch zu diesem Fall? Ohne diese Marke zeigt die
    Netzansicht nach jeder Änderung (Drehung, Zuschnitt, verschobenes
    Bauwerk) klaglos das alte Netz — und man sucht den Fehler in der Physik.

    Verglichen wird der NETZ-Hash, nicht der des ganzen Falls: ein
    geänderter Grenzwert oder eine andere Simulationsdauer lassen das Netz
    unberührt. Ältere Vorschauen kennen den Netz-Hash noch nicht — für die
    bleibt es beim Vergleich über den ganzen Fall.
    """
    p = _derived_dir(d) / "mesh_preview" / "mesh_preview.json"
    if not p.is_file():
        return {"vorhanden": False, "stale": False, "preview": None}
    try:
        info = json.loads(p.read_text())
    except Exception:
        # Eine BESCHÄDIGTE Vorschaudatei ist etwas anderes als „nie
        # gerechnet" — als vorhanden-aber-kaputt melden, damit der Nutzer
        # weiß, dass er neu rechnen muss (Audit F5)
        return {"vorhanden": True, "beschaedigt": True, "stale": True,
                "preview": None}
    # Zwei Wege, gültig zu sein — es genügt EINER:
    #   * der Netz-Hash passt: am Netz hat sich nichts geändert;
    #   * der Fall-Hash passt: am Fall hat sich ÜBERHAUPT nichts geändert.
    # Der zweite Weg ist der Rückfall für Altvorschauen (vor 2026-08-05
    # ohne netz_hash) UND für die Neuberechnung des Netz-Hashes vom
    # 2026-08-17: sonst hätte jede vorhandene Vorschau einmalig als
    # veraltet gegolten, und seit dem 16.08. zeigt der Editor ein
    # veraltetes Netz gar nicht mehr an.
    passt = ((info.get("netz_hash") and info["netz_hash"] == spec.netz_hash())
             or (info.get("case_hash") and info["case_hash"] == spec.case_hash()))
    return {"vorhanden": True, "preview": info, "stale": not passt}


@router.get("/cases/{case_id}/mesh-preview")
async def case_mesh_preview_state(case_id: str):
    """Gespeicherte Netzvorschau samt Aktualitätsmarke (ohne neu zu rechnen)."""
    spec, d = _load_case(case_id)
    return _preview_stand(spec, d)


@router.get("/cases/{case_id}/terrain-solid.stl")
async def case_terrain_solid_stl(case_id: str):
    """BEWUSSTER Prüfer-Export ohne UI-Verlinkung: den Erdkörper als STL
    laden und in FreeCAD/Meshlab nachmessen — deshalb bleibt die Route,
    obwohl kein Client sie ruft."""
    from .core.solids import gelaende_koerper_bauen

    spec, d = _load_case(case_id)
    if spec.terrain is None or spec.domain is None:
        raise HTTPException(status_code=404, detail="Fall ohne Gelände.")
    feld = TerrainField.from_spec(spec.terrain, spec.domain, d)
    # Derselbe Deckel wie bei der Editor-Vorschau (Audit H4): der Bau des
    # Erdkörpers macht Boolesche Abzüge — bei sehr großen Rastern liefe
    # dieser unverlinkte Prüfer-Export sonst minutenlang im Request
    if feld.z.size > _KOERPER_VORSCHAU_KNOTEN:
        raise HTTPException(
            status_code=413,
            detail=f"Höhenraster hat {feld.z.size} Knoten — über dem "
                   f"Deckel ({_KOERPER_VORSCHAU_KNOTEN}). Für den Export "
                   "die Rasterweite vergröbern.")
    try:
        koerper = gelaende_koerper_bauen(feld, spec, hinweise=[], base_dir=d)
    except Exception as e:
        raise HTTPException(status_code=422,
                            detail=f"Geländekörper nicht baubar: {e}")
    # Ohne Körper die offene Höhenfläche liefern — das ist genau die
    # Geometrie, die der Vernetzer in diesem Fall bekommt
    mesh = koerper if koerper is not None else feld.to_trimesh()
    return Response(
        content=mesh.export(file_type="stl"),
        media_type="model/stl",
        headers={"Content-Disposition":
                 f'attachment; filename="{case_id}_gelaende.stl"'})


@router.get("/cases/{case_id}/mesh-surface")
async def case_mesh_surface(case_id: str):
    """Vernetzte Oberfläche des Vorschaunetzes (nach mesh-preview) je Patch."""
    from .core.meshsurface import mesh_surface_patches

    spec, d = _load_case(case_id)
    extracted = mesh_surface_patches(_derived_dir(d) / "mesh_preview")
    if not extracted:
        raise HTTPException(
            status_code=404,
            detail="Noch kein Vorschaunetz — zuerst die Netzvorschau ausführen.")
    return {"patches": [{"patch": e["patch"],
                         "stl_b64": base64.b64encode(e["stl"]).decode()}
                        for e in extracted],
            "stale": _preview_stand(spec, d)["stale"]}


@router.get("/runs/{run_id}/volume")
async def run_volume(request: Request, run_id: str,
                     time: float = Query(...),
                     fields: str | None = Query(None)):
    """
    Räumliche Felddaten zum nächstgelegenen Ausgabezeitpunkt als Binärblock
    (Format siehe core/fields.py), feldweise abrufbar über ?fields=a,b.
    """
    paths = _paths(run_id)
    index = vol_fields.read_index(paths.root)
    if index is None:
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegen keine Felddaten vor.")
    entry = vol_fields.nearest_timestep(index, time)
    # Der F3DV-Blob ging bisher UNKOMPRIMIERT raus (weder FastAPI- noch
    # nginx-gzip greifen bei octet-stream) — dabei ist alpha fast überall
    # exakt 0 oder 1 und U in der Luft konstant: deflate schafft hier
    # typischerweise 10–20×. Level 3 komprimiert bei ~100 MB/s; der
    # Browser dekomprimiert Content-Encoding nativ vor arrayBuffer(),
    # das 4-Byte-Alignment fürs Zero-Copy bleibt also erhalten.
    gzip_ok = "gzip" in request.headers.get("accept-encoding", "").lower()

    def work():
        t, data = vol_fields.read_timestep(paths.root, entry["index"])
        wanted = [f.strip() for f in fields.split(",")] if fields else None
        blob = vol_fields.pack_volume(t, index["grid"], data, wanted)
        if gzip_ok and len(blob) > 4096:
            import gzip
            return t, gzip.compress(blob, compresslevel=3), True
        return t, blob, False

    # npz-Dekompression + Packen sind CPU-lastig — nicht den Event-Loop
    # blockieren (beim Zeit-Scrubbing kommen die Anfragen im Sekundentakt)
    t_actual, blob, komprimiert = await asyncio.to_thread(work)
    headers = {"X-F3D-Time": str(t_actual),
               "Cache-Control": "max-age=3600",
               "Vary": "Accept-Encoding"}
    if komprimiert:
        headers["Content-Encoding"] = "gzip"
    return Response(content=blob, media_type="application/octet-stream",
                    headers=headers)


# --------------------------------------------------------------------------
# Fälle (PreViewer, Spez. Kap. 9): die maßgebliche Geometrie entsteht
# serverseitig — das Frontend zeigt terrain/solids nur an (Spez. Kap. 3).
# --------------------------------------------------------------------------

def cases_root() -> Path:
    return Path(os.environ.get("FLOOD3D_CASES_ROOT",
                               Path(__file__).parent / "data" / "cases"))


def _case_dir(case_id: str, must_exist: bool = True) -> Path:
    if not _SAFE.match(case_id):
        raise HTTPException(status_code=422, detail=f"Ungültige Fallkennung: {case_id}")
    d = cases_root() / case_id
    if must_exist and not (d / "case.yaml").exists():
        raise HTTPException(status_code=404, detail=f"Fall {case_id} unbekannt.")
    return d


def _derived_dir(d: Path) -> Path:
    """Ableitungsablage des Falls — wegwerfbar, siehe importer.DERIVED."""
    p = d / "derived"
    p.mkdir(exist_ok=True)
    return p


def _load_case(case_id: str) -> tuple[CaseSpec, Path]:
    d = _case_dir(case_id)
    try:
        return CaseSpec.from_yaml(d / "case.yaml"), d
    except Exception as e:
        raise HTTPException(status_code=500,
                            detail=f"Fall {case_id} nicht lesbar: {e}")


# Wegweiser fuer die Fundstelle eines Modellfehlers. Pydantic nennt sie als
# Pfad ("structures.0.culvert.profile") — der ist praezise und fuer den
# Nutzer unlesbar.
_ORT_WORTE = {
    "structures": "Bauwerk", "boundaries": "Randbedingung",
    "evaluation": "Auswertung", "gauges": "Pegel", "sections": "Querschnitt",
    "targets": "Kriterium", "solver": "Simulation", "mesh": "Netz",
    "domain": "Modellgebiet", "terrain": "Gelaende", "operations": "Gelaendeform",
    "edits": "Bearbeitung", "profile": "Profil", "resistance": "Widerstand",
    "alignment": "Achse", "meta": "Fallangaben", "vorfuellungen": "Vorfuellung",
    "culvert": "Durchlass", "weir": "Wehr", "wall": "Wand", "pier": "Pfeiler",
    "graben": "Graben", "schacht": "Schacht", "kammer": "Kammer",
    "screen": "Rechen", "imported": "Importkoerper",
}


def _lesbar(e: Exception) -> str:
    """
    Einen Modellfehler in einen Satz uebersetzen, den man lesen kann.

    Pydantic liefert roh etwa

        1 validation error for CaseSpec
        structures.0.culvert.profile
          Value error, arch-Profil braucht width und height
          [type=value_error, input_value={'kind': 'arch', ...}, input_type=dict]
          For further information visit https://errors.pydantic.dev/2.12/...

    Genau das stand bisher als „Speichern fehlgeschlagen" in der
    Meldungsleiste (2026-08-16 aus der Testrunde). Der Nutzer braucht die
    Fundstelle und den Grund — nicht den Eingabewert, den er selbst gerade
    eingetippt hat, und keine Verweis-URL auf die Bibliothek.
    """
    hole = getattr(e, "errors", None)
    if not callable(hole):
        return str(e)
    try:
        fehler = hole()
    except Exception:
        return str(e)

    zeilen: list[str] = []
    for f in fehler:
        worte = []
        for teil in f.get("loc", ()):
            if isinstance(teil, int):
                # Listenindex an das vorige Wort haengen: „Bauwerk 1"
                if worte:
                    worte[-1] = f"{worte[-1]} {teil + 1}"
                continue
            worte.append(_ORT_WORTE.get(teil, str(teil)))
        grund = str(f.get("msg", "")).removeprefix("Value error, ")
        satz = f"{' / '.join(worte)}: {grund}" if worte else grund
        if satz not in zeilen:          # Union-Zweige melden dasselbe mehrfach
            zeilen.append(satz)
    if not zeilen:
        return str(e)
    if len(zeilen) > 5:
        zeilen = zeilen[:5] + [f"… und {len(fehler) - 5} weitere"]
    return " · ".join(zeilen)


def _new_case_template(case_id: str, title: str) -> CaseSpec:
    from .core import casespec as cs
    return CaseSpec(
        meta=cs.Meta(id=case_id, title=title),
        domain=cs.Domain(extent=(0.0, 0.0, 100.0, 100.0), z_min=90.0, z_max=100.0),
        terrain=cs.Terrain(base=cs.TerrainBase(source="flat:95.0", resolution=0.5)),
        mesh=cs.Mesh(base_cell=1.0),
        boundaries=[
            cs.BcInflowConstant(id="zulauf", patch="inlet",
                                type="inflow_constant", q=1.0),
            cs.BcOutflowFree(id="ablauf", patch="outlet", type="outflow_free"),
            cs.BcAtmosphere(id="atmo", patch="atmosphere", type="atmosphere"),
        ],
        solver=cs.Solver(end_time=120.0, initial_level=94.0))


@router.get("/cases")
async def list_cases():
    root = cases_root()
    out = []
    if not root.is_dir():
        return out
    for d in sorted(root.iterdir()):
        yaml_path = d / "case.yaml"
        if not yaml_path.exists():
            continue
        try:
            spec = CaseSpec.from_yaml(yaml_path)
            title = spec.meta.title
        except Exception:
            title = "(nicht lesbar)"
        out.append({"id": d.name, "title": title,
                    "updated": yaml_path.stat().st_mtime})
    return out


@router.post("/cases")
async def create_case(payload: dict = Body(...)):
    case_id = payload.get("id", "").strip()
    if not _SAFE.match(case_id):
        raise HTTPException(status_code=422,
                            detail="Fallkennung: nur Buchstaben, Ziffern, . _ -")
    d = _case_dir(case_id, must_exist=False)
    if (d / "case.yaml").exists():
        raise HTTPException(status_code=409, detail=f"Fall {case_id} existiert bereits.")
    d.mkdir(parents=True, exist_ok=True)
    spec = _new_case_template(case_id, payload.get("title", case_id))
    spec.to_yaml(d / "case.yaml")
    return {"id": case_id}


@router.get("/cases/{case_id}")
async def get_case(case_id: str):
    spec, _ = _load_case(case_id)
    return spec.model_dump(mode="json", exclude_none=True)


@router.put("/cases/{case_id}")
async def put_case(case_id: str, payload: dict = Body(...)):
    d = _case_dir(case_id)
    try:
        spec = CaseSpec.model_validate(migriere(payload))
    except Exception as e:
        raise HTTPException(status_code=422, detail=_lesbar(e))
    spec.to_yaml(d / "case.yaml")
    # Geometrie gleich mitliefern: das Speichern war bisher 4 Roundtrips
    # (PUT + 3 Geometrie-GETs) — jetzt einer. `validation`/`netz_stale`
    # stecken in der Geometrie-Antwort.
    return {"ok": True, "case_hash": spec.case_hash(),
            **_geometrie_payload(spec, d)}


# ── Geometrie-Stände ────────────────────────────────────────────────────────
# Benannte Speicherstände der Fallgeometrie. Der Arbeitsfall bleibt EINER
# (kein Verzweigen): Stände sind flache Kopien, zwischen denen man springt —
# und weil jedes Laden vorher automatisch sichert, ist der Sprung umkehrbar.

@router.get("/cases/{case_id}/staende")
async def list_staende(case_id: str):
    from .core.staende import staende_liste
    return {"staende": staende_liste(_case_dir(case_id))}


@router.post("/cases/{case_id}/staende")
async def create_stand(case_id: str, payload: dict = Body(...)):
    from .core.staende import StandFehler, stand_anlegen
    d = _case_dir(case_id)
    try:
        return {"stand": stand_anlegen(d, payload.get("name", ""))}
    except StandFehler as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/cases/{case_id}/staende/{stand_id}/laden")
async def load_stand(case_id: str, stand_id: str):
    from .core.staende import StandFehler, stand_laden
    d = _case_dir(case_id)
    try:
        erg = stand_laden(d, stand_id)
    except StandFehler as e:
        raise HTTPException(status_code=404, detail=str(e))
    # Gegenprobe: der eingespielte Stand muss lesbar sein — sonst stünde
    # der Nutzer vor einem Fall, den der Editor nicht mehr öffnen kann
    spec, _ = _load_case(case_id)
    return {"ok": True, "case_hash": spec.case_hash(),
            "auto_stand": erg["auto_stand"]}


@router.delete("/cases/{case_id}/staende/{stand_id}")
async def delete_stand(case_id: str, stand_id: str):
    from .core.staende import StandFehler, stand_loeschen
    try:
        stand_loeschen(_case_dir(case_id), stand_id)
    except StandFehler as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.post("/runs/{run_id}/geometrie-als-stand")
async def run_geometrie_als_stand(run_id: str):
    """
    Die Geometrie, mit der DIESER Lauf gerechnet wurde, als Stand in seinen
    Fall zurückholen. Damit ist der Weg „Wehr verschoben, Lauf gemacht,
    zurück zum alten Stand" geschlossen, ohne den Fall vorher von Hand
    kopiert zu haben.
    """
    from .core.staende import StandFehler, stand_anlegen

    paths = _paths(run_id)
    spec_dir = paths.root / "spec"
    if not (spec_dir / "case.yaml").is_file():
        raise HTTPException(
            status_code=409,
            detail="Dieser Lauf stammt aus der Zeit vor den Ständen — seine "
                   "Geometrie wurde nicht gesichert und lässt sich nicht "
                   "wiederherstellen.")
    case_id = (read_manifest(paths) or {}).get("case_id") \
        or re.sub(r"_r\d+$", "", run_id)
    d = _case_dir(case_id)
    try:
        stand = stand_anlegen(d, f"aus Lauf {run_id}", quelle=f"lauf:{run_id}",
                              ueberlagern=spec_dir)
    except StandFehler as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"case_id": case_id, "stand": stand}


@router.post("/cases/{case_id}/import")
async def case_import_analyze(case_id: str, request: Request,
                              filename: str = Query(...)):
    """
    CAD-Datei analysieren (Spez.: Geometrie-Import). Zerlegt DXF je Layer
    bzw. STL/OBJ je Komponente in Kandidaten mit Kennzahlen und
    Rollen-Vorschlag — übernommen wird erst nach der Deklaration.
    """
    from .core.importer import analyze_file

    _, d = _load_case(case_id)
    data = await request.body()
    if not data:
        raise HTTPException(status_code=422, detail="Leere Datei")
    if len(data) > 400 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Datei größer als 400 MB")
    try:
        return analyze_file(data, filename, d)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500,
                            detail=f"Import fehlgeschlagen: {e}")


@router.get("/cases/{case_id}/imports")
async def case_imports(case_id: str):
    """
    Alle Importe des Falls: Manifest + Status. `aktiv` heißt, mindestens
    ein Fallobjekt verweist per import_ref darauf (oder das Gelände stammt
    daraus); alles andere ist verwaist und kann gefahrlos neu übernommen
    oder aufgeräumt werden. Kandidaten-Netze liegen unter
    `import/{import_id}/{kandidat}.stl` (3D-Vorschau).
    """
    import json as _json

    spec, d = _load_case(case_id)
    aktiv_ids: set[str] = set()
    for liste in (spec.structures, spec.evaluation.sections,
                  (spec.terrain.kanten if spec.terrain else []),
                  (spec.terrain.operations if spec.terrain else [])):
        for o in liste:
            r = getattr(o, "import_ref", None)
            if r is not None:
                aktiv_ids.add(r.import_id)
    quelle = spec.terrain.base.source if spec.terrain else ""
    ergebnis = []
    imp_root = d / "imports"
    if imp_root.is_dir():
        for mdatei in sorted(imp_root.glob("*/manifest.json")):
            try:
                m = _json.loads(mdatei.read_text())
            except Exception:               # noqa: BLE001
                continue
            iid = m.get("import_id") or mdatei.parent.name
            anwendung = None
            apfad = mdatei.parent / "anwendung.json"
            if apfad.is_file():
                try:
                    anwendung = _json.loads(apfad.read_text())
                except Exception:           # noqa: BLE001
                    anwendung = None
            ergebnis.append({
                "import_id": iid,
                "filename": m.get("filename"),
                "created": m.get("created"),
                "candidates": m.get("candidates"),
                "unit_suspect": m.get("unit_suspect"),
                "aktiv": iid in aktiv_ids or iid in quelle,
                "wiederholbar": anwendung is not None,
                # die GESPEICHERTE Zuordnung — Grundlage für „Rolle ändern"
                "anwendung": anwendung,
            })
    return {"imports": ergebnis}


@router.post("/cases/{case_id}/import/{import_id}/reapply")
async def case_import_reapply(case_id: str, import_id: str,
                              payload: dict = Body(default={})):
    """
    Import mit seiner gespeicherten Anwendung neu ableiten: baut die
    derived/-Dateien neu und ersetzt die Fallobjekte (idempotent). Der Weg,
    der aus „derived/ ist weg" oder „Auflösung geändert" einen normalen
    Vorgang macht statt eines Neu-Uploads.
    """
    from .core.importer import import_neu_ableiten

    spec, d = _load_case(case_id)
    if not _SAFE.match(import_id) \
            or not (d / "imports" / import_id / "anwendung.json").is_file():
        raise HTTPException(status_code=404,
                            detail="Import ohne gespeicherte Anwendung")
    try:
        info = import_neu_ableiten(spec, d, import_id,
                                    rollen=payload.get("rollen"))
        spec = CaseSpec.model_validate(spec.model_dump(mode="json"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    spec.to_yaml(d / "case.yaml")
    return {"ok": True, "report": info["report"],
            "spec": spec.model_dump(mode="json", exclude_none=True),
            "validation": validate_case(spec, d),
            "netz_stale": _preview_stand(spec, d)["stale"]}


@router.delete("/cases/{case_id}/derived")
async def case_derived_leeren(case_id: str):
    """
    Die Ableitungsablage leeren — der Härtetest der Schichtentrennung:
    danach stellt ein Reapply (je Import) alles bitidentisch wieder her.
    Quellen (case.yaml, imports/) bleiben unberührt.
    """
    d = _case_dir(case_id)
    entfernt = []
    for pfad in (d / "derived",):
        if pfad.exists():
            shutil.rmtree(pfad)
            entfernt.append(pfad.name)
    return {"ok": True, "entfernt": entfernt}


@router.get("/cases/{case_id}/import/{import_id}/{cand_id}.stl")
async def case_import_mesh(case_id: str, import_id: str, cand_id: str):
    """Kandidaten-Netz für die 3D-Vorschau im Import-Dialog."""
    _, d = _load_case(case_id)
    for part in (import_id, cand_id):
        if not _SAFE.match(part):
            raise HTTPException(status_code=404, detail="unbekannt")
    p = d / "imports" / import_id / f"{cand_id}.stl"
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Kandidat ohne Netz")
    return FileResponse(p, media_type="model/stl")


@router.post("/cases/{case_id}/import/{import_id}/apply")
async def case_import_apply(case_id: str, import_id: str,
                            payload: dict = Body(...)):
    """Deklarierte Kandidaten in den Fall übernehmen und speichern."""
    from .core.importer import apply_import

    spec, d = _load_case(case_id)
    if not _SAFE.match(import_id) or not (d / "imports" / import_id).is_dir():
        raise HTTPException(status_code=404, detail="Import unbekannt")
    try:
        info = apply_import(
            spec, d, import_id,
            decisions=payload.get("decisions") or [],
            unit_factor=float(payload.get("unit_factor", 1.0)),
            offset=payload.get("offset"),
            derive_domain=bool(payload.get("derive_domain")),
            terrain_from_lines=payload.get("terrain_from_lines"),
            rotation_deg=float(payload.get("rotation_deg") or 0.0))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        spec = CaseSpec.model_validate(spec.model_dump(mode="json"))
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Import ergäbe einen ungültigen Fall — {_lesbar(e)}")
    spec.to_yaml(d / "case.yaml")
    return {"ok": True, "report": info["report"],
            "spec": spec.model_dump(mode="json", exclude_none=True),
            "validation": validate_case(spec, d),

            "netz_stale": _preview_stand(spec, d)["stale"]}


def _mutation(case_id: str, wirken, fehlertext: str) -> dict:
    """
    DER eine Vertrag aller Fall-Mutationen: laden → wirken(spec, d) →
    erneut validieren → NUR BEI ÄNDERUNG speichern → einheitliche Antwort
    {meldungen, geaendert, spec, validation, netz_stale}. Eine Kur, die
    „war schon so" meldet, fasst die case.yaml nicht mehr an.
    """
    spec, d = _load_case(case_id)
    vorher = spec.model_dump(mode="json", exclude_none=True)
    try:
        meldungen = wirken(spec, d)
        spec = CaseSpec.model_validate(spec.model_dump(mode="json"))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"{fehlertext}: {_lesbar(e)}")
    nachher = spec.model_dump(mode="json", exclude_none=True)
    geaendert = nachher != vorher
    if geaendert:
        spec.to_yaml(d / "case.yaml")
    if isinstance(meldungen, str):
        meldungen = [meldungen] if meldungen else []
    return {"ok": True, "meldungen": meldungen, "geaendert": geaendert,
            "spec": nachher,
            "validation": validate_case(spec, d),
            "netz_stale": _preview_stand(spec, d)["stale"]}


@router.post("/cases/{case_id}/sculpt")
async def case_sculpt(case_id: str, payload: dict = Body(...)):
    """
    Pinsel-Patches auf die Sculpt-Ebene des Geländes (core/sculpt.py).
    Alle Pinsel des Editors — heben, senken, glätten, Bruchkanten-
    Anpassung — schicken dasselbe: Gitterindizes + dz-Teilfeld.
    Rückgängig ist das inverse Patch.
    """
    def wirken(spec, d):
        from .core.sculpt import patch_anwenden
        return patch_anwenden(spec, d, payload.get("patches") or [])

    return _mutation(case_id, wirken, "Formen fehlgeschlagen")


@router.post("/cases/{case_id}/rotate")
async def case_rotate(case_id: str, payload: dict = Body(...)):
    """
    Den ganzen Fall um die z-Achse drehen. Nicht das Gebiet steht danach
    schief, sondern das Modell steht gerade — das achsparallele Rechengebiet
    legt sich dadurch eng um ein schräg liegendes Bauwerk. Läuft als Kur
    über den einen Mutationsvertrag.
    """
    from .core.kur import anwenden

    grad = float(payload.get("deg") or 0.0)
    return _mutation(case_id,
                     lambda spec, d: anwenden(spec, "drehen",
                                              {"deg": grad}, d),
                     "Drehung fehlgeschlagen")


@router.post("/cases/{case_id}/anschluss")
async def case_anschluss(case_id: str):
    """
    Mechanische Anschlüsse in Ordnung bringen: Randbedingung auf die Fläche
    legen, an der ihr Bauwerk endet, Rohrachse bis dorthin führen,
    Verfeinerungsquader ins Gebiet beschneiden. Ändert keine Hydraulik.
    """
    from .core.kur import anwenden

    return _mutation(case_id,
                     lambda spec, d: anwenden(spec, "anschluesse_herstellen",
                                              {}, d),
                     "Anschluss fehlgeschlagen")


@router.post("/cases/{case_id}/kur")
async def case_kur(case_id: str, payload: dict = Body(...)):
    """
    Die Reparatur zu einem Prüfbefund ausführen. Der Befund selbst liefert
    Aktion und Argumente (`fix` in der Prüfung) — hier wird nur noch
    angewandt; gespeichert wird nur, wenn sich wirklich etwas ändert.
    """
    from .core.kur import anwenden

    aktion = str(payload.get("aktion") or "")
    args = payload.get("args") or {}
    return _mutation(case_id,
                     lambda spec, d: anwenden(spec, aktion, args, d),
                     "Kur fehlgeschlagen")


@router.post("/cases/{case_id}/kanten-verknuepfen")
async def case_kanten_verknuepfen(case_id: str):
    """
    Aus den Vermessungskanten ableiten, was daraus folgt: eine Sohle
    innerhalb eines Beckenrands ergibt die Böschung dazwischen und die
    ebene Sohle darin, eine Ober- und eine Unterkante nebeneinander eine
    Böschung, zwei einander zugewandte Böschungen die Gerinnesohle bzw.
    Dammkrone dazwischen. Gepaart wird über die LAGE, nicht über den
    Layernamen. Mauerkronen und Überfallkanten werden zu BAUTEILEN.
    """
    from .core.kanten import verknuepfen
    from .core.terrain import TerrainField

    def wirken(spec, d):
        # Nur zum Messen der Gründungstiefe abgeleiteter Bauteile. Scheitert
        # das Gelände, wird vorbelegt statt abgebrochen — die Kantenlogik
        # selbst braucht es nicht.
        feld = None
        if spec.terrain is not None and spec.domain is not None:
            try:
                feld = TerrainField.from_spec(spec.terrain, spec.domain, d)
            except Exception:
                feld = None
        return verknuepfen(spec, feld)

    return _mutation(case_id, wirken, "Kanten verknüpfen fehlgeschlagen")


@router.get("/rezepte")
async def rezept_katalog():
    """Bauwerkskatalog: was sich in einem Zug einsetzen lässt."""
    from .core.rezepte import katalog

    return {"rezepte": katalog()}


@router.post("/cases/{case_id}/rezept")
async def case_rezept(case_id: str, payload: dict = Body(...)):
    """
    Ein Bauwerk in einem Zug einsetzen: Aushub, Bauteile, Verfeinerung,
    Bezugsobjekte und Nachweiskriterium. Jedes Teil bleibt danach einzeln
    im Objektbaum bearbeitbar — das Rezept ist die Anordnung, kein neuer
    Bauwerkstyp.
    """
    from .core.rezepte import einsetzen

    name = str(payload.get("rezept") or "")
    args = payload.get("args") or {}
    return _mutation(case_id,
                     lambda spec, d: einsetzen(spec, name, args, d),
                     "Rezept fehlgeschlagen")


@router.get("/cases/{case_id}/schema")
async def case_schema(case_id: str):
    return CaseSpec.json_schema()


@router.get("/cases/{case_id}/rasters")
async def case_rasters(case_id: str):
    """
    Höhenraster, die neben dem Fall liegen. Der Editor braucht die Liste
    für „Bereich ersetzen" — sonst müsste man den Dateinamen raten.
    """
    d = _case_dir(case_id)
    basis = None
    try:
        spec, _ = _load_case(case_id)
        basis = spec.terrain.base.source if spec.terrain else None
    except HTTPException:
        pass
    out = []
    # Quellen im Fallwurzelverzeichnis (Alt-Fälle) plus importierte Raster
    # unter derived/ — aber KEINE Gelände-Ableitungen (gelaende_*,
    # gelaende_gedreht_*): eine Ableitung des eigenen Geländes als Quelle
    # für „Bereich ersetzen" wäre eine Rückkopplungsschleife.
    kandidaten = list(d.glob("*")) + list((d / "derived").glob("*"))
    for f in sorted(kandidaten):
        if not (f.is_file() and f.suffix.lower() in (".asc", ".xyz")):
            continue
        name = f.relative_to(d).as_posix()
        if f.name.startswith("gelaende_") and name != basis:
            continue
        out.append({"name": name, "mb": round(f.stat().st_size / 1e6, 2),
                    "basis": name == basis})
    return out


# Ab dieser Rastergröße wird der Erdkörper in der Entwurfsvorschau NICHT
# mitgerechnet: der Boolesche Abzug dauert dann länger als die Vorschau
# selbst, und die Szene soll dem Ziehen folgen können. Der Körper wird
# beim Speichern nachgezogen.
_KOERPER_VORSCHAU_KNOTEN = 120_000


def _koerper_vorschau(spec: CaseSpec, feld, d: Path, out: dict) -> dict | None:
    """
    Erdkörper für die Live-Vorschau. Ohne ihn folgt der Volumenkörper dem
    Ziehen an Böschungskante, Rohr oder Gebietsecke erst nach dem Speichern.
    """
    from .core.solids import braucht_erdkoerper, gelaende_koerper_bauen

    # Bedarf VOR Größe fragen. Andersherum blieb nach dem Löschen des
    # letzten Aushubs der alte Körper mit seinem Krater stehen: der Client
    # behält ihn bei `koerper_zu_gross` bewusst, und die Antwort „gar kein
    # Körper mehr nötig" wäre ohne jede Boolesche Operation zu haben
    # gewesen. Jetzt verschwindet er sofort, auch auf Millionenrastern.
    if not braucht_erdkoerper(spec, feld):
        return None
    if feld.z.size > _KOERPER_VORSCHAU_KNOTEN:
        out["koerper_zu_gross"] = True
        # Woran der gehaltene Körper hängt — der Client kann damit sagen,
        # dass er veraltet ist, statt ihn als aktuell auszugeben
        out["koerper_signatur"] = spec.netz_hash()
        # Audit P2-8: vorher verschwand der Körper KOMMENTARLOS aus der
        # Szene — Aushübe/Bohrungen wurden gerechnet, aber nicht gezeigt
        out.setdefault("validation", []).append({
            "object_id": "vorschau", "severity": "hinweis",
            "message": (f"Erdkörper-Vorschau übersprungen — Geländeraster mit "
                        f"{feld.z.size} Knoten über der Vorschaugrenze "
                        f"({_KOERPER_VORSCHAU_KNOTEN}). Aushübe und Bohrungen "
                        "werden GERECHNET, die Szene zeigt sie nur nicht "
                        "live; beim Speichern wird der Körper nachgezogen.")})
        return None
    try:
        koerper = gelaende_koerper_bauen(feld, spec, hinweise=[], base_dir=d)
    except Exception as e:
        out.setdefault("validation", []).append({
            "object_id": "vorschau", "severity": "warnung",
            "message": (f"Erdkörper-Vorschau fehlgeschlagen "
                        f"({type(e).__name__}: {e}) — die Szene zeigt das "
                        "Gelände ohne Aushub/Bohrung.")})
        return None
    if koerper is None:
        return None
    return {"stl_b64": base64.b64encode(
                koerper.export(file_type="stl")).decode(),
            "watertight": bool(koerper.is_watertight),
            "volume": round(float(abs(koerper.volume)), 2),
            "triangles": int(len(koerper.faces)),
            "importiert": bool(spec.terrain.base.koerper),
            # Woran dieser Körper hängt — der Client vergleicht sie beim
            # nächsten Entwurf und weiß, ob der gehaltene noch gilt
            "signatur": spec.netz_hash(),
            "bohrungen": [s.id for s in spec.structures
                          if s.type == "culvert"
                          and getattr(s, "durchstoesst_gelaende", False)]}


# Entwurfs-Körper-Cache: Bauteile, die weder vom Gelände abhängen (keine
# gelaende-Bearbeitung, wirkung=bauteil) noch klassifiziert werden müssen,
# sind allein durch ihre eigene Spezifikation + das Gebiet bestimmt — ihr
# STL kann über Draft-Zyklen wiederverwendet werden. Bewusst NUR für den
# Entwurf: der gespeicherte Stand wird immer voll gebaut.
_DRAFT_SOLIDS: "OrderedDict[str, tuple[str, str | None]]" = OrderedDict()
_DRAFT_SOLIDS_MAX = 512


def _draft_solid_schluessel(s, spec: CaseSpec) -> str | None:
    """Cache-Schlüssel eines Bauwerks — None, wenn nicht cachebar."""
    if getattr(s, "wirkung", "bauteil") != "bauteil":
        return None                  # auto/aushub: Lage-Klassifikation nötig
    if any(e.type == "gelaende" for e in (getattr(s, "edits", None) or [])):
        return None                  # Sockel/Kappen hängt am Gelände
    if s.type == "imported":
        return None                  # hängt an einer STL-Datei, deren
                                     # Inhalt ein Reapply still austauscht
    blob = json.dumps(
        [s.model_dump(mode="json"),
         spec.domain.model_dump(mode="json") if spec.domain else None],
        sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def _geometrie_payload(spec: CaseSpec, d: Path, entwurf: bool = False) -> dict:
    """
    DIE eine Geometrie-Antwort: Gelände, Bauwerkskörper, Erdkörper, Prüfung
    — plus die serverseitig aufgelösten Regeln (Randflächen, wirksame
    Fenster, Öffnungslagen), damit der Editor sie nicht spiegeln muss.
    Genutzt von /preview (Entwurf), PUT (Speichern) und GET /geometry.
    """
    out: dict = {"validation": validate_case(spec, d), "solids": [],
                 "terrain": None, "terrain_solid": None,
                 # Ob das gespeicherte Vorschaunetz noch zu DIESEM Stand
                 # steht — der Editor rät das nicht mehr selbst.
                 "netz_stale": _preview_stand(spec, d)["stale"]}
    if spec.terrain is not None and spec.domain is not None:
        try:
            t = TerrainField.from_spec(spec.terrain, spec.domain, d)
            out["terrain"] = {
                "x0": t.x0, "y0": t.y0, "resolution": t.resolution,
                "dims": list(t.z.shape),
                "z_b64": base64.b64encode(t.z.astype("<f4").tobytes()).decode(),
            }
            out["terrain_solid"] = _koerper_vorschau(spec, t, d, out)
        except Exception as e:
            # Audit P2-8: die Szene blieb still leer/alt, während build_case
            # an genau derselben Stelle scheitern konnte
            out["validation"].append({
                "object_id": "vorschau", "severity": "warnung",
                "message": (f"Gelände in der Vorschau nicht darstellbar "
                            f"({type(e).__name__}: {e}) — die Szene ist "
                            "unvollständig.")})
    try:
        # build_solids fängt seit dem B4-Fix jedes Bauwerk einzeln ab und
        # meldet Ausfälle über `hinweise` — EIN kaputtes Bauwerk lässt die
        # anderen nicht mehr aus der Szene verschwinden. Das äußere try
        # bleibt als letzter Fangzaun (z. B. Geländeaufbau).
        ausfaelle: list[dict] = []
        # Entwurfsvorschau OHNE Entflechtung (hinweise=None überspringt die
        # Booleschen Verschnitte über alle Körperpaare) und MIT Körper-
        # Cache: beim Ziehen einer Wand ändert sich genau EIN Bauwerk —
        # alle anderen kommen aus dem Cache statt neu gebaut zu werden
        # (Fabios Befund Testrunde R2: „jede Verschiebung dauert lange").
        # Der GESPEICHERTE Stand (PUT/GET) wird weiter voll gebaut und
        # entflochten gezeigt.
        fertig: dict[str, str] = {}          # patch -> stl_b64
        schluessel_je_patch: dict[str, str] = {}
        bau_spec = spec
        if entwurf:
            zu_bauen = []
            for s in spec.structures:
                key = _draft_solid_schluessel(s, spec)
                if key is not None:
                    treffer = _DRAFT_SOLIDS.get(key)
                    if treffer is not None:
                        _DRAFT_SOLIDS.move_to_end(key)
                        if treffer[1] is not None:
                            fertig[treffer[0]] = treffer[1]
                        continue
                    schluessel_je_patch[s.patch] = key
                zu_bauen.append(s)
            bau_spec = spec.model_copy(update={"structures": zu_bauen})
        for patch, mesh in build_solids(
                bau_spec, d, include_screens=True,
                hinweise=None if entwurf else [],
                ausfaelle=ausfaelle).items():
            fertig[patch] = base64.b64encode(
                mesh.export(file_type="stl")).decode()
        # Cache füllen — auch „kein Körper" (Aushub) ist ein Ergebnis
        for s in (bau_spec.structures if entwurf else []):
            key = schluessel_je_patch.get(s.patch)
            if key is None:
                continue
            _DRAFT_SOLIDS[key] = (s.patch, fertig.get(s.patch))
            while len(_DRAFT_SOLIDS) > _DRAFT_SOLIDS_MAX:
                _DRAFT_SOLIDS.popitem(last=False)
        for patch in sorted(fertig):
            out["solids"].append({"patch": patch, "stl_b64": fertig[patch]})
        for a in ausfaelle:
            out["validation"].append({
                "object_id": a["id"], "severity": "warnung",
                "message": a["meldung"]})
    except Exception as e:
        out["validation"].append({
            "object_id": "vorschau", "severity": "warnung",
            "message": (f"Bauwerkskörper in der Vorschau nicht darstellbar "
                        f"({type(e).__name__}: {e}) — die Szene zeigt "
                        "möglicherweise einen alten Stand.")})

    # Aufgelöste Serverregeln: welcher Rand auf welcher Gebietsfläche
    # sitzt, das wirksame Fenster dazu, und wo die Bearbeitungen auf der
    # Bauteilachse liegen. Die früheren Editor-Spiegel dieser drei Regeln
    # sind GELÖSCHT — Marker und Fenstergriffe lesen diese Antwort.
    try:
        from .core.casebuilder import resolve_window
        from .core.meshgen import assign_faces
        from .core.solids import _axis_point_and_dir

        flaechen = assign_faces(spec)
        # geschlüsselt nach OBJEKT-ID (nicht Patchname) — der Editor
        # adressiert seine Randbedingungen über die Kennung
        patch_zu_face = {patch: face
                         for face, (patch, _typ) in flaechen.items()}
        out["bc_faces"] = {b.id: patch_zu_face[b.patch]
                           for b in spec.boundaries
                           if b.patch in patch_zu_face}
        out["fenster"] = {}
        for b in spec.boundaries:
            w = resolve_window(spec, b)
            if w is not None:
                out["fenster"][b.id] = w
        out["oeffnungen"] = {}
        for s in spec.structures:
            achse = None
            geschlossen = False
            if s.type == "wall" and s.alignment and len(s.alignment.points) >= 2:
                achse = np.asarray([p[:2] for p in s.alignment.points])
            elif s.type == "basin" and len(s.footprint) >= 2:
                achse = np.asarray(s.footprint, dtype=float)
                geschlossen = True
            if achse is None:
                continue
            for e in (s.edits or []):
                station = getattr(e, "station", None)
                if station is None:
                    continue
                p, richt = _axis_point_and_dir(achse, float(station),
                                               geschlossen)
                out["oeffnungen"].setdefault(s.id, {})[e.id] = {
                    "point": [round(float(p[0]), 3), round(float(p[1]), 3)],
                    "dir": [round(float(richt[0]), 4),
                            round(float(richt[1]), 4)]}
    except Exception as e:
        # Zusatzinformation — nie Grund, die Antwort zu verweigern, aber
        # auch kein Grund zu schweigen (Audit P2-8)
        out["validation"].append({
            "object_id": "vorschau", "severity": "hinweis",
            "message": (f"Randflächen/Fenster-Marker unvollständig "
                        f"({type(e).__name__}: {e}).")})

    # Rechen: im Editor stehen Stäbe, im Netz existiert keine Stabgeometrie
    # — gerechnet wird eine poröse Widerstandszone (Kirschmer). Ohne diesen
    # Hinweis sah die Szene nach mehr Modell aus, als der Solver bekommt.
    for s in spec.structures:
        if s.type == "screen":
            out["validation"].append({
                "object_id": s.id, "severity": "hinweis",
                "message": ("Rechen wird als poröse Widerstandszone gerechnet "
                            "(Kirschmer-Verlust, 0,15 m Zonentiefe) — die "
                            "Stäbe in der Szene sind reine Darstellung.")})
    return out


@router.post("/cases/{case_id}/preview")
async def case_preview(case_id: str, payload: dict = Body(...)):
    """
    Live-Vorschau eines ENTWURFS ohne Speichern: der Editor schickt die
    aktuelle casespec, zurück kommen Gelände, Bauwerkskörper und Prüfung.
    Damit reagiert die Szene unmittelbar auf jede Änderung (scharfer Editor),
    während die maßgebliche Geometrie serverseitig bleibt (Spez. Kap. 3).
    """
    d = _case_dir(case_id)
    try:
        spec = CaseSpec.model_validate(migriere(payload))
    except Exception as e:
        # KEIN 422: die Vorschau ist der Kanal, über den der Editor erfährt,
        # was nicht stimmt — ein Fehlerstatus lässt ihn auf dem letzten
        # Stand einfrieren und zeigt dann etwas, das es nicht mehr gibt.
        # Also 200 mit einem Befund; die Szene bleibt stehen, aber sichtbar
        # als veraltet markiert. `PUT` behält seine 422 — eine unlesbare
        # Datei wird nicht geschrieben.
        return {"validation": [{"object_id": "case", "severity": "fehler",
                                "message": f"Entwurf nicht lesbar — {_lesbar(e)}"}],
                "spec_ungueltig": True, "solids": [], "terrain": None,
                "terrain_solid": None, "netz_stale": False}
    return _geometrie_payload(spec, d, entwurf=True)


@router.get("/cases/{case_id}/geometry")
async def case_geometry(case_id: str):
    """
    Der GESPEICHERTE Stand als eine Geometrie-Antwort — ersetzt die drei
    Einzel-GETs terrain/solids/terrain-solid (ein Roundtrip statt drei).
    """
    spec, d = _load_case(case_id)
    return _geometrie_payload(spec, d)


@router.post("/cases/{case_id}/profile")
async def case_profile(case_id: str, payload: dict = Body(...)):
    """Polylinie hinein, Geländeprofil heraus (Spez. Kap. 9)."""
    spec, d = _load_case(case_id)
    if spec.terrain is None or spec.domain is None:
        raise HTTPException(status_code=404, detail="Fall ohne Gelände/Modellgebiet.")
    polyline = np.asarray(payload.get("polyline", []), dtype=float)
    if len(polyline) < 2:
        raise HTTPException(status_code=422, detail="Polylinie braucht mindestens 2 Punkte.")
    n = int(payload.get("samples", 200))
    t = TerrainField.from_spec(spec.terrain, spec.domain, d)

    seg = np.diff(polyline, axis=0)
    seg_len = np.linalg.norm(seg, axis=1)
    total = float(seg_len.sum())
    s = np.linspace(0.0, total, n)
    cum = np.concatenate([[0.0], np.cumsum(seg_len)])
    xs = np.interp(s, cum, polyline[:, 0])
    ys = np.interp(s, cum, polyline[:, 1])
    ground = t.sample(xs, ys)
    return {"s": s.tolist(), "x": xs.tolist(), "y": ys.tolist(),
            "ground": np.asarray(ground).tolist(),
            "initial_level": spec.solver.initial_level}


# --------------------------------------------------------------------------
# Ausführung (Stufe 5): Netzvorschau und Rechenläufe im OpenFOAM-Container
# — die Registries (_active_runs, _laufende_previews) leben im laufwerk.
# --------------------------------------------------------------------------

@router.post("/cases/{case_id}/mesh-preview")
async def case_mesh_preview(case_id: str, request: Request,
                            payload: dict | None = Body(None)):
    """
    Billiger Vernetzungsprobelauf (Spez. Kap. 6.1): Zellenzahl,
    checkMesh-Kennwerte, Laufzeit- und Kostenschätzung. Läuft synchron im
    Threadpool — für Vorschau-Netze im Minutenbereich ausreichend.

    `ohne_verfeinerung`: Schnellvorschau ohne die verschachtelte
    Verfeinerung (Boxen und Flächenstufen) — deutlich schneller, Zellzahl
    und Kosten sind dann eine UNTERE Grenze. Das Ergebnis wird als solches
    gekennzeichnet.
    """
    from .core.casebuilder import build_case
    from .gate import pruefe_kosten_gate
    from .core.runner import FoamError, mesh_preview

    # Kosten-Gate: die Vorschau vernetzt wirklich (Minuten Serverzeit)
    pruefe_kosten_gate(request, payload)

    spec, d = _load_case(case_id)
    ohne_verfeinerung = bool((payload or {}).get("ohne_verfeinerung"))

    # Doppelstart-Sperre: ein zweiter Klick löschte sonst das
    # Arbeitsverzeichnis des noch LAUFENDEN ersten Versuchs (rmtree unten)
    # — dessen Container schrieb dann ins Leere, und der zweite starb an
    # der Container-Namenskollision. Ein Fall rechnet immer nur EINE
    # Vorschau zugleich.
    if case_id in laufwerk._laufende_previews:
        raise HTTPException(
            status_code=409,
            detail="Für diesen Fall läuft bereits eine Netzvorschau — "
                   "bitte warten, bis sie fertig ist (blockMesh + "
                   "snappyHexMesh brauchen einige Minuten).")

    # Dasselbe Tor wie vor POST /runs: Fehler-Befunde starten keinen
    # minutenlangen Vernetzungslauf, der erst im Container stirbt — dieser
    # Endpunkt war der einzige lauf-artige ohne Prüfung.
    fehler = [b for b in validate_case(spec, d)
              if b.get("severity") == "fehler"]
    if fehler:
        raise HTTPException(
            status_code=422,
            detail="Der Fall hat Fehler-Befunde: "
                   + " | ".join(b["message"] for b in fehler[:5]))

    def work():
        # Nicht unter /tmp (Snap-Docker-Falle) — Vorschau neben den Fall,
        # aber unter derived/: wegwerfbar, gehoert nicht zu den Quellen
        preview_dir = _derived_dir(d) / "mesh_preview"
        import shutil
        if preview_dir.exists():
            shutil.rmtree(preview_dir)
        bau_spec = spec
        if ohne_verfeinerung:
            bau_spec = spec.model_copy(deep=True)
            bau_spec.mesh.refinements = []
        info = build_case(bau_spec, preview_dir, d)
        if info["problems"]:
            raise FoamError("Geometrieprobleme: " + "; ".join(info["problems"]))
        ergebnis = mesh_preview(bau_spec, preview_dir)
        if ohne_verfeinerung:
            # Kennzeichnen und die Hashes des ECHTEN Falls eintragen: die
            # Schnellvorschau gilt für diesen Stand, ist aber gröber — das
            # sagt das Flag, nicht ein fälschliches „veraltet"
            ergebnis["ohne_verfeinerung"] = True
            ergebnis["case_hash"] = spec.case_hash()
            ergebnis["netz_hash"] = spec.netz_hash()
            import json as _json
            (preview_dir / "mesh_preview.json").write_text(
                _json.dumps(ergebnis, indent=2, ensure_ascii=False))
        return ergebnis

    laufwerk._laufende_previews.add(case_id)
    try:
        return await asyncio.to_thread(work)
    except (FoamError, RuntimeError) as e:
        # RuntimeError kommt aus der Patch-Prüfung nach createPatch: eine
        # Randbedingung ohne einzige Fläche ist ein Modellfehler, kein
        # Serverfehler — der Nutzer soll den Text lesen, keine 500 sehen
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        laufwerk._laufende_previews.discard(case_id)


@router.post("/cases/{case_id}/bundle")
async def case_bundle(case_id: str, request: Request):
    """
    Fall für den Local Companion paketieren: serverseitig gebauter Fall
    (system/constant/0/Allrun) + case.yaml + reservierte run_id. Die
    Nutzer-Maschine rechnet, /runs/{run_id}/import bringt die Artefakte
    zurück — die Ergebnis-Phase merkt keinen Unterschied zum Serverlauf.
    """
    from .core.bundle import BundleFehler, bundle_bauen
    from .gate import pruefe_kosten_gate

    # Kosten-Gate: baut den Fall serverseitig und reserviert eine run_id
    pruefe_kosten_gate(request)

    spec, d = _load_case(case_id)
    run_id, run_root = lauf_reservieren(runs_root(), case_id)

    # Speicherpunkte auch fuer den LOKALEN Weg (Wunsch 2026-08-12): der
    # Laeufer laedt Teilstaende auf S3 hoch, der Browser stoesst beim
    # checkpoint-Ereignis /runs/{id}/teilstand an, der Server spielt sie
    # ein — Ergebnis-3D zeigt den Lauf, waehrend die Nutzer-Maschine noch
    # rechnet, und ein Absturz kostet nur noch Minuten. Ohne R2-Zugang
    # laeuft alles wie bisher (Speicherpunkte sind Beiwerk).
    try:
        from .engines.runpod.relay import speicherpunkt_urls
        checkpoint = speicherpunkt_urls(run_id)
    except Exception:  # noqa: BLE001 — kein R2 = keine Speicherpunkte, kein Drama
        checkpoint = None

    # Gebaut wird in core/bundle.py — dasselbe Paket geht an den Companion
    # UND an den RunPod-Worker; zwei Kopien wären zwei Gelegenheiten,
    # verschieden zu altern.
    try:
        data = bundle_bauen(spec, d, run_id, checkpoint=checkpoint)
    except BundleFehler as e:
        # Reservierung zurückgeben — sonst bleibt ein leerer „lokal"-Lauf
        # in der Liste stehen (genau die Leichen der Putzrunde 2026-08-13)
        shutil.rmtree(run_root, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(e))

    manifest_schreiben(run_root, status="lokal", origin="companion",
                       title=spec.meta.title, created=time.time())
    laufwerk.geometrie_sichern(spec, d, run_root)
    return Response(content=data, media_type="application/zip",
                    headers={"X-F3D-Run-Id": run_id,
                             "Access-Control-Expose-Headers": "X-F3D-Run-Id"})


# _import_entpacken (samt Pfad-Whitelist) lebt im laufwerk — Orchestrierung
# UND Endpunkte entpacken über dieselbe Funktion.


@router.post("/runs/{run_id}/import-chunk")
async def import_run_chunk(run_id: str, request: Request,
                           index: int = Query(...),
                           last: bool = Query(False)):
    """
    Artefakte stückweise übernehmen. Die Feldausgaben eines grossen Laufs
    gehen leicht über jede Body-Grenze (nginx 200 MB) — deshalb hängt der
    Browser das Archiv in Häppchen an und löst mit last=true das
    Entpacken aus.
    """
    root = runs_root().resolve()
    run_root = (root / run_id).resolve()
    if run_root.parent != root or not run_root.is_dir():
        raise HTTPException(status_code=404, detail="Lauf nicht reserviert")
    teil = run_root / "_upload.zip"
    if index == 0:
        teil.unlink(missing_ok=True)
    elif not teil.exists():
        raise HTTPException(status_code=409,
                            detail="Kein begonnener Upload — bei 0 anfangen")
    daten = await request.body()
    with open(teil, "ab") as f:
        f.write(daten)
    if not last:
        return {"run_id": run_id, "received": teil.stat().st_size}
    try:
        ergebnis = _import_entpacken(run_root, run_id, teil.read_bytes())
    finally:
        teil.unlink(missing_ok=True)
    # Transit-Rest auf S3 abraeumen — das Endergebnis ist da
    # (schluckt Fehler selbst: Aufraeumen ist Beiwerk)
    from .engines.runpod.relay import transit_loeschen
    transit_loeschen(run_id)
    return ergebnis


@router.post("/runs")
async def start_run(request: Request, payload: dict = Body(...)):
    """Lauf starten (Spez. Kap. 9); die Pipeline läuft im Hintergrund."""
    from .gate import pruefe_kosten_gate

    # Kosten-Gate VOR allem anderen: ein Lauf bindet Server-Kerne (und ueber
    # RunPod echtes Geld). Oeffentliche API — Oberflaeche umgehen zaehlt nicht.
    pruefe_kosten_gate(request, payload)

    case_id = payload.get("case_id", "")
    ort = (payload.get("ort") or "runpod").strip()
    if ort == "server":
        # Entscheidung Fabio 2026-08-13: der Server rechnet keine Laeufe
        # mehr — er teilt sich die Maschine mit der Webseite. run_pipeline
        # bleibt als Code (Verifikation/Notfaelle), ist aber ueber die API
        # nicht mehr erreichbar.
        raise HTTPException(
            status_code=410,
            detail="Der Server-Rechenort entfällt — bitte Lokal (Companion) "
                   "oder RunPod wählen.")
    if ort != "runpod":
        raise HTTPException(status_code=422,
                            detail=f"Unbekannter Rechenort {ort!r}")
    spec, case_dir = _load_case(case_id)

    # Tor vor dem Lauf: Fehler-Befunde starten keinen bezahlten Lauf, der
    # erst im Container stirbt.
    fehler = [b for b in validate_case(spec, case_dir)
              if b.get("severity") == "fehler"]
    if fehler:
        raise HTTPException(
            status_code=422,
            detail="Der Fall hat Fehler-Befunde: "
                   + " | ".join(b["message"] for b in fehler[:5]))

    run_id, run_root = lauf_reservieren(runs_root(), case_id)
    # Geometrie von JETZT konservieren, bevor irgendetwas rechnet — der
    # Fallordner wandert weiter, der Lauf soll seinen Stand behalten
    laufwerk.geometrie_sichern(spec, case_dir, run_root)

    # Orchestrierung (Bundle → R2 → Job → Ereignisstrom → Import) fährt
    # das Laufwerk im Hintergrund-Thread — der Endpunkt ist nur noch
    # Gate + Validierungstor + Reservierung.
    laufwerk.runpod_lauf_starten(
        spec, case_dir, run_id, run_root,
        cores=payload.get("cores"),
        checkpoint_s=payload.get("checkpoint_s", 600),
        max_laufzeit_s=payload.get("max_laufzeit_s"))
    return {"run_id": run_id, "status": "building", "ort": ort}


@router.post("/runs/{run_id}/abort")
async def abort_run(run_id: str):
    """
    Laufenden Serverlauf abbrechen (Audit H3): Marke setzen, Container des
    aktuellen Schritts killen — der Lauf-Thread endet am FoamError und
    schreibt status=abgebrochen statt failed. Ohne diesen Endpunkt war ein
    hängender Lauf nur per SSH totbar.
    """
    from .core.runner import laufende_container_stoppen

    root = runs_root().resolve()
    run_root = (root / run_id).resolve()
    if run_root.parent != root or not run_root.is_dir():
        raise HTTPException(status_code=404, detail="Lauf unbekannt")
    manifest_pfad = run_root / "manifest.json"
    status = ""
    if manifest_pfad.is_file():
        try:
            status = json.loads(manifest_pfad.read_text()).get("status", "")
        except Exception:                    # noqa: BLE001
            status = ""
    if status in _TERMINAL_STATUS:
        raise HTTPException(status_code=409,
                            detail=f"Lauf ist bereits beendet ({status})")
    (run_root / "ABBRUCH").touch()
    gestoppt = await asyncio.to_thread(laufende_container_stoppen, run_root)
    if not gestoppt and run_id not in laufwerk._active_runs:
        # kein Container, kein Thread: der Lauf ist verwaist (z. B. nach
        # einem API-Neustart) — Status direkt ehrlich machen
        (run_root / "ABBRUCH").unlink(missing_ok=True)
        manifest_schreiben(run_root, status="abgebrochen",
                           error="Vom Nutzer abgebrochen (Lauf war verwaist)",
                           finished=time.time())
    return {"run_id": run_id, "gestoppte_container": len(gestoppt)}


# Die Wächter (Teilstände einsammeln, Auto-Archiv, R2-Putzrunde) und das
# Wiederanknüpfen leben im laufwerk — hier bleiben nur die Startup-Haken.

@router.on_event("startup")
async def _relays_wiederanknuepfen_starten():
    try:
        laufwerk.relays_wiederanknuepfen()
    except Exception:  # noqa: BLE001 — der Start darf daran nie scheitern
        pass


@router.on_event("startup")
async def _teilstand_waechter_starten():
    laufwerk.teilstand_waechter_starten()


@router.post("/runs/{run_id}/teilstand")
async def run_teilstand(run_id: str, payload: dict | None = Body(None)):
    """
    Teilstand eines LOKALEN Laufs vom S3 abholen und einspielen.

    Der Laeufer auf der Nutzer-Maschine laedt seine Speicherpunkte selbst
    nach S3 (checkpoint.json im Bundle); der Browser hoert das
    checkpoint-Ereignis und ruft diesen Endpunkt — beim Cloud-Lauf macht
    dasselbe der Relay-Thread. Schreibend, also automatisch hinter dem Gate.
    """
    from .engines.runpod.relay import RunPodFehler, teilstand_holen

    root = runs_root().resolve()
    run_root = (root / run_id).resolve()
    if run_root.parent != root or not run_root.is_dir():
        raise HTTPException(status_code=404, detail="Lauf nicht reserviert")
    try:
        daten = teilstand_holen(run_id)
    except RunPodFehler as e:
        raise HTTPException(status_code=503, detail=str(e))
    if daten is None:
        raise HTTPException(status_code=404,
                            detail="Kein Teilstand hinterlegt (noch keiner "
                                   "hochgeladen oder schon eingespielt und geloescht)")
    _import_entpacken(run_root, run_id, daten)
    m = manifest_schreiben(run_root, teilstand=True,
                           teilstand_zeiten=(payload or {}).get("zeiten"),
                           letzte_zeit=(payload or {}).get("letzte_zeit"))
    return {"run_id": run_id, "teilstand_zeiten": m.get("teilstand_zeiten")}


@router.get("/runs/{run_id}/log")
async def run_log(run_id: str, tail: int = Query(80, le=2000)):
    """
    Logausgabe des aktuellen Schritts (Spez. Kap. 9).

    Beim CLOUD-Lauf gibt es keinen lokalen Fallordner, solange gerechnet
    wird — die Ausgabe kommt als Ereignisstrom (`log.runpod`). Ohne diesen
    Rückfall stand das Panel bei RunPod-Läufen auf „keine Logausgabe"
    (gemeldet 2026-08-12).
    """
    paths = _paths(run_id)
    case_dir = paths.root / "case"
    logs = sorted(case_dir.glob("log.*"), key=lambda p: p.stat().st_mtime)
    if logs:
        text = logs[-1].read_text(errors="replace").splitlines()[-tail:]
        return {"log": "\n".join(text), "source": logs[-1].name}

    strom = paths.root / "log.runpod"
    if strom.is_file():
        zeilen = []
        for roh in strom.read_text(errors="replace").splitlines():
            try:
                ev = json.loads(roh)
            except json.JSONDecodeError:
                zeilen.append(roh)
                continue
            art = ev.get("event")
            if art == "log":
                zeilen.append(str(ev.get("text", "")))
            elif art == "progress":
                t = ev.get("time")
                phase = ev.get("phase", "")
                anteil = ev.get("fraction")
                rest = ev.get("eta_s")
                stueck = [p for p in (
                    f"{phase}" if phase else "",
                    f"t = {t:g} s" if isinstance(t, (int, float)) else "",
                    f"{anteil * 100:.0f} %" if isinstance(anteil, (int, float)) else "",
                    f"noch ca. {rest / 60:.0f} min" if isinstance(rest, (int, float)) else "",
                ) if p]
                zeilen.append("· " + " · ".join(stueck))
            elif art == "checkpoint":
                zeilen.append(f"💾 Zwischenstand: {ev.get('zeiten')} Zeitschritte "
                              f"bis t = {ev.get('letzte_zeit')} s gesichert — "
                              "im Ergebnis-3D sichtbar.")
            elif art == "error":
                zeilen.append("FEHLER: " + str(ev.get("text", "")))
            elif art == "done":
                zeilen.append("Ergebnis übertragen.")
        return {"log": "\n".join(zeilen[-tail:]), "source": "RunPod"}

    return {"log": "", "source": None}


@router.get("/runs/{run_id}/figures/{filename}")
async def run_figure(run_id: str, filename: str):
    paths = _paths(run_id)
    if not _SAFE_FIG.match(filename):
        raise HTTPException(status_code=422, detail=f"Ungültiger Abbildungsname: {filename}")
    f = paths.figures_dir / filename
    if not f.exists():
        raise HTTPException(status_code=404, detail=f"Abbildung {filename} nicht vorhanden.")
    media = "image/png" if filename.endswith(".png") else "image/svg+xml"
    return FileResponse(f, media_type=media)
