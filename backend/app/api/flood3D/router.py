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
import json
import os
import re
import shutil
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from .core import fields as vol_fields
from .core.casespec import CaseSpec, migriere
from .core.normalize import get_series, list_series
from .core.solids import build_solids
from .core.store import read_manifest, run_paths
from .core.terrain import TerrainField
from .core.validate import validate_case

router = APIRouter()

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")
_SAFE_FIG = re.compile(r"^[A-Za-z0-9._-]+\.(png|svg)$")


def runs_root() -> Path:
    return Path(os.environ.get("FLOOD3D_RUNS_ROOT",
                               Path(__file__).parent / "data" / "runs"))


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


@lru_cache(maxsize=16)
def _read_parquet_cached(path_str: str, mtime_ns: int) -> pd.DataFrame:
    return pd.read_parquet(path_str)


def _normalized(paths) -> pd.DataFrame:
    if not paths.normalized.exists():
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegt keine Zwischendatei vor.")
    return _read_parquet_cached(str(paths.normalized),
                                paths.normalized.stat().st_mtime_ns)


def _series_payload(df: pd.DataFrame, quantity: str, location_id: str,
                    component: str) -> dict:
    t, v = get_series(df, quantity, location_id, component)
    sel = df[(df["quantity"] == quantity) & (df["location_id"] == location_id)]
    unit = sel["unit"].iloc[0] if len(sel) else ""
    return {"quantity": quantity, "location_id": location_id,
            "component": component, "unit": unit,
            "t": t.tolist(), "v": v.tolist()}


# --------------------------------------------------------------------------

@router.get("/health")
async def health():
    root = runs_root()
    n = sum(1 for d in root.iterdir() if d.is_dir()) if root.is_dir() else 0
    return {"status": "ok", "service": "flood3d", "runs": n}


# "lokal" = auf der Nutzer-Maschine reserviert/gerechnet — der Server kann
# den Fortschritt nicht sehen, darum weder pollen noch als hängend markieren
_TERMINAL_STATUS = {"completed", "failed", "lokal"}


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
        out.append({
            "run_id": d.name,
            "status": status,
            "stale": _run_stale(d, status),
            "size_mb": _run_size_mb(d),
            "title": manifest.get("title", ""),
            "case_hash": (result or {}).get("case_hash"),
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
    df = _normalized(_paths(run_id))
    return list_series(df).to_dict(orient="records")


@router.get("/runs/{run_id}/series")
async def run_series(run_id: str,
                     quantity: str = Query(...),
                     location_id: str | None = Query(None),
                     component: str = Query("")):
    """Zeitreihen auf nativer Zeitachse. Ohne location_id alle Orte der Größe."""
    df = _normalized(_paths(run_id))
    if location_id is not None:
        locs = [location_id]
    else:
        locs = sorted(df.loc[df["quantity"] == quantity, "location_id"].unique())
    series = [_series_payload(df, quantity, loc, component) for loc in locs]
    return {"run_id": run_id, "series": [s for s in series if s["t"]]}


@router.get("/runs/{run_id}/balance")
async def run_balance(run_id: str):
    """Bilanz- und Konvergenzreihen für die Qualitätsansicht (Spez. Kap. 8)."""
    df = _normalized(_paths(run_id))
    payload = {
        "run_id": run_id,
        "volume": _series_payload(df, "volume", "domain", ""),
        "continuity": _series_payload(df, "continuity", "solver", ""),
        "courant_mean": _series_payload(df, "courant", "solver", "mean"),
        "courant_max": _series_payload(df, "courant", "solver", "max"),
        "timestep": _series_payload(df, "timestep", "solver", ""),
        "residuals": [],
    }
    res = df[df["quantity"] == "residual"]
    for (field, comp), _ in res.groupby(["location_id", "component"]):
        payload["residuals"].append(_series_payload(df, "residual", field, comp))
    return payload


@router.get("/runs/{run_id}/timesteps")
async def run_timesteps(run_id: str):
    """Ausgabezeitpunkte der räumlichen Felder mit Datengröße (Spez. Kap. 9)."""
    paths = _paths(run_id)
    index = vol_fields.read_index(paths.root)
    if index is None:
        raise HTTPException(status_code=404,
                            detail="Für diesen Lauf liegen keine Felddaten vor.")
    return index


@router.get("/runs/{run_id}/geometry")
async def run_geometry(run_id: str):
    """
    Statische Szenengeometrie, einmal je Lauf (Spez. Kap. 9):
    Gelände-Höhenfeld, Eingabe-Bauwerke (triSurface-STLs des Falls) und —
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
    tri_dir = paths.root / "case" / "constant" / "triSurface"
    if tri_dir.is_dir():
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
        return {"vorhanden": False, "stale": False, "preview": None}
    # Altfall-Fallback: Vorschauen vor 2026-08-05 tragen keinen netz_hash
    if info.get("netz_hash"):
        stale = info["netz_hash"] != spec.netz_hash()
    else:
        stale = info.get("case_hash") != spec.case_hash()
    return {"vorhanden": True, "preview": info, "stale": stale}


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
        raise HTTPException(status_code=422, detail=str(e))
    spec.to_yaml(d / "case.yaml")
    # Geometrie gleich mitliefern: das Speichern war bisher 4 Roundtrips
    # (PUT + 3 Geometrie-GETs) — jetzt einer. `validation`/`netz_stale`
    # stecken in der Geometrie-Antwort.
    return {"ok": True, "case_hash": spec.case_hash(),
            **_geometrie_payload(spec, d)}


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


@router.post("/cases/{case_id}/skizze")
async def case_skizze(case_id: str, payload: dict = Body(...)):
    """
    Handgezeichnetes als CAD-Objekt aufnehmen — die Skizze ist ein Import
    aus der Hand: Kandidat + Zuordnung in `imports/skizze/`, dann derselbe
    Ableitungsweg wie beim Dateiimport. payload: {kind: polyline|polygon|
    kreis, rolle, punkte?|kreis?, name?}.
    """
    from .core.importer import skizze_hinzufuegen

    def wirken(spec, d):
        info = skizze_hinzufuegen(
            spec, d,
            kind=str(payload.get("kind") or "polyline"),
            rolle=str(payload.get("rolle") or "ignorieren"),
            punkte=payload.get("punkte"),
            kreis=payload.get("kreis"),
            name=str(payload.get("name") or ""))
        return info["report"]

    return _mutation(case_id, wirken, "Skizze fehlgeschlagen")


@router.delete("/cases/{case_id}/derived")
async def case_derived_leeren(case_id: str):
    """
    Die Ableitungsablage leeren — der Härtetest der Schichtentrennung:
    danach stellt ein Reapply (je Import) alles bitidentisch wieder her.
    Quellen (case.yaml, imports/) bleiben unberührt.
    """
    import shutil

    d = _case_dir(case_id)
    entfernt = []
    for pfad in (d / "derived", d / "_mesh_preview"):
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
        raise HTTPException(status_code=422,
                            detail=f"Import ergäbe einen ungültigen Fall: {e}")
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
        raise HTTPException(status_code=422, detail=f"{fehlertext}: {e}")
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


def _geometrie_payload(spec: CaseSpec, d: Path) -> dict:
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
        for patch, mesh in sorted(
                build_solids(spec, d, include_screens=True,
                             hinweise=[]).items()):
            out["solids"].append({
                "patch": patch,
                "stl_b64": base64.b64encode(
                    mesh.export(file_type="stl")).decode()})
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
                                "message": f"Entwurf nicht lesbar: {e}"}],
                "spec_ungueltig": True, "solids": [], "terrain": None,
                "terrain_solid": None, "netz_stale": False}
    return _geometrie_payload(spec, d)


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
# --------------------------------------------------------------------------

_active_runs: dict[str, object] = {}


@router.post("/cases/{case_id}/mesh-preview")
async def case_mesh_preview(case_id: str):
    """
    Billiger Vernetzungsprobelauf (Spez. Kap. 6.1): Zellenzahl,
    checkMesh-Kennwerte, Laufzeit- und Kostenschätzung. Läuft synchron im
    Threadpool — für Vorschau-Netze im Minutenbereich ausreichend.
    """
    import tempfile

    from .core.casebuilder import build_case
    from .core.runner import FoamError, mesh_preview

    spec, d = _load_case(case_id)

    def work():
        # Nicht unter /tmp (Snap-Docker-Falle) — Vorschau neben den Fall,
        # aber unter derived/: wegwerfbar, gehoert nicht zu den Quellen
        preview_dir = _derived_dir(d) / "mesh_preview"
        import shutil
        if preview_dir.exists():
            shutil.rmtree(preview_dir)
        alt = d / "_mesh_preview"          # Ablage vor P2 aufraeumen
        if alt.exists():
            shutil.rmtree(alt)
        info = build_case(spec, preview_dir, d)
        if info["problems"]:
            raise FoamError("Geometrieprobleme: " + "; ".join(info["problems"]))
        return mesh_preview(spec, preview_dir)

    try:
        return await asyncio.to_thread(work)
    except (FoamError, RuntimeError) as e:
        # RuntimeError kommt aus der Patch-Prüfung nach createPatch: eine
        # Randbedingung ohne einzige Fläche ist ein Modellfehler, kein
        # Serverfehler — der Nutzer soll den Text lesen, keine 500 sehen
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/cases/{case_id}/bundle")
async def case_bundle(case_id: str):
    """
    Fall für den Local Companion paketieren: serverseitig gebauter Fall
    (system/constant/0/Allrun) + case.yaml + reservierte run_id. Die
    Nutzer-Maschine rechnet, /runs/{run_id}/import bringt die Artefakte
    zurück — die Ergebnis-Phase merkt keinen Unterschied zum Serverlauf.
    """
    import io
    import tempfile
    import zipfile

    from .core.casebuilder import build_case

    spec, d = _load_case(case_id)
    root = runs_root()
    root.mkdir(parents=True, exist_ok=True)
    n = 1
    while (root / f"{case_id}_r{n:03d}").exists():
        n += 1
    run_id = f"{case_id}_r{n:03d}"
    run_root = root / run_id

    # Datendateien, auf die die casespec RELATIV verweist, müssen mit ins
    # Bundle — der Nachlauf auf der Nutzer-Maschine liest sie erneut (das
    # Geländeraster z. B. für write_geometry). Fehlen sie, liefe die
    # Simulation durch und scheiterte erst danach: teuer und ärgerlich.
    # Deshalb VOR dem Fallbau prüfen und sofort abbrechen.
    import shutil as _sh
    referenced: list[str] = []
    if spec.terrain is not None \
            and not spec.terrain.base.source.startswith("flat:"):
        referenced.append(spec.terrain.base.source)
    if spec.terrain is not None and spec.terrain.base.koerper:
        referenced.append(spec.terrain.base.koerper)
    for b in spec.boundaries:
        src = getattr(b, "source", None)
        if src:
            referenced.append(src)
    fehlend = [n for n in referenced if not (d / n).is_file()]
    if fehlend:
        raise HTTPException(
            status_code=422,
            detail="Für den lokalen Lauf fehlen Datendateien neben dem "
                   f"Fall: {', '.join(fehlend)}")

    with tempfile.TemporaryDirectory() as td:
        case_out = Path(td) / "case"
        info = build_case(spec, case_out, d)
        if info["problems"]:
            raise HTTPException(status_code=422,
                                detail="Geometrieprobleme: "
                                       + "; ".join(info["problems"]))
        (case_out / "case.yaml").write_text((d / "case.yaml").read_text())
        (case_out / "run_id.txt").write_text(run_id)

        for name in referenced:
            ziel = case_out / name
            ziel.parent.mkdir(parents=True, exist_ok=True)
            _sh.copy2(d / name, ziel)

        # Den Core DIESES Servers mitgeben. Das Image auf der Nutzer-
        # Maschine hat eine eingebackene Kopie, die beliebig alt sein darf;
        # der Runner zieht die mitgelieferte vor. Ohne das scheitert jeder
        # lokale Lauf, sobald die Spezifikation ein neues Feld bekommt
        # ("Extra inputs are not permitted"), bis der Nutzer neu zieht.
        hier = Path(__file__).parent
        rt = case_out / "quagg_runtime" / "flood3D"
        rt.mkdir(parents=True)
        _sh.copy2(hier / "__init__.py", rt / "__init__.py")
        # den GANZEN Core-Baum, nicht nur die obersten Module: core/extract
        # ist ein Unterpaket, und ohne das bricht der Nachlauf im Container
        # mit ModuleNotFoundError ab
        _sh.copytree(hier / "core", rt / "core",
                     ignore=_sh.ignore_patterns("__pycache__", "*.pyc"))
        # Auch der RUNNER reist mit: die Image-Kopie übergibt an diese
        # Bundle-Kopie (local_runner._runner_uebergabe) — sonst fehlt dem
        # eingebackenen Skript jeder neue Pipeline-Schritt, bis der Nutzer
        # sein Image neu zieht (2026-08-06: surfaceFeatureExtract fehlte,
        # snappy fand keine .eMesh-Kanten)
        eng = rt / "engines" / "local"
        eng.mkdir(parents=True)
        _sh.copy2(hier / "engines" / "local" / "local_runner.py",
                  eng / "local_runner.py")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for f in sorted(case_out.rglob("*")):
                if f.is_file():
                    z.write(f, str(f.relative_to(case_out)))
        data = buf.getvalue()

    # run_id erst NACH erfolgreichem Bau reservieren
    run_root.mkdir()
    (run_root / "manifest.json").write_text(json.dumps({
        "status": "lokal", "origin": "companion",
        "title": spec.meta.title, "created": time.time()}))
    return Response(content=data, media_type="application/zip",
                    headers={"X-F3D-Run-Id": run_id,
                             "Access-Control-Expose-Headers": "X-F3D-Run-Id"})


_IMPORT_TOP = {"manifest.json", "result.json", "normalized.parquet"}
_IMPORT_MEMBER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


@router.post("/runs/{run_id}/import")
async def import_run(run_id: str, request: Request):
    """Artefakte eines lokalen Companion-Laufs in die Laufablage übernehmen."""
    import io
    import zipfile

    root = runs_root().resolve()
    run_root = (root / run_id).resolve()
    if run_root.parent != root or not run_root.is_dir():
        raise HTTPException(status_code=404,
                            detail="Lauf nicht reserviert — zuerst das "
                                   "Bundle über /bundle holen")
    data = await request.body()
    return _import_entpacken(run_root, run_id, data)


def _import_entpacken(run_root: Path, run_id: str, data: bytes) -> dict:
    import io
    import zipfile

    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Kein gültiges Archiv")
    for m in z.namelist():
        if m.endswith("/"):
            continue
        ok = (_IMPORT_MEMBER.match(m) and ".." not in m
              and (m in _IMPORT_TOP
                   or m.startswith(("figures/", "fields/"))
                   # Szenengeometrie: Bauwerks-STLs und die vernetzte
                   # Solver-Oberflaeche (dort sucht /runs/{id}/geometry)
                   or (m.startswith("case/") and m.endswith(".stl")
                       and (m.startswith("case/constant/triSurface/")
                            or m.startswith("case/meshSurface")))))
        if not ok:
            raise HTTPException(status_code=422,
                                detail=f"Unerlaubter Archivpfad: {m!r}")
    for m in z.namelist():
        if m.endswith("/"):
            continue
        target = run_root / m
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(z.read(m))
    # Konsistenz: die Artefakte müssen zum reservierten Lauf gehören
    result_path = run_root / "result.json"
    if result_path.exists():
        got = json.loads(result_path.read_text()).get("run_id")
        if got != run_id:
            raise HTTPException(status_code=422,
                                detail=f"Artefakte tragen run_id {got!r}, "
                                       f"erwartet {run_id!r}")
    return {"run_id": run_id, "status": "completed"}


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
    return ergebnis


@router.post("/runs")
async def start_run(payload: dict = Body(...)):
    """Lauf starten (Spez. Kap. 9); die Pipeline läuft im Hintergrund."""
    import threading

    from .core.runner import run_pipeline

    case_id = payload.get("case_id", "")
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

    root = runs_root()
    root.mkdir(parents=True, exist_ok=True)
    n = 1
    while (root / f"{case_id}_r{n:03d}").exists():
        n += 1
    run_id = f"{case_id}_r{n:03d}"
    run_root = root / run_id

    def work():
        try:
            run_pipeline(spec, case_dir, run_root, run_id)
        except Exception:
            pass    # Fehlerzustand steht im Manifest
        finally:
            _active_runs.pop(run_id, None)

    t = threading.Thread(target=work, name=f"flood3d-{run_id}", daemon=True)
    _active_runs[run_id] = t
    t.start()
    return {"run_id": run_id, "status": "building"}


@router.get("/runs/{run_id}/log")
async def run_log(run_id: str, tail: int = Query(80, le=2000)):
    """Logausgabe des aktuellen Schritts (Spez. Kap. 9)."""
    paths = _paths(run_id)
    case_dir = paths.root / "case"
    logs = sorted(case_dir.glob("log.*"), key=lambda p: p.stat().st_mtime)
    if not logs:
        return {"log": "", "source": None}
    text = logs[-1].read_text(errors="replace").splitlines()[-tail:]
    return {"log": "\n".join(text), "source": logs[-1].name}


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
