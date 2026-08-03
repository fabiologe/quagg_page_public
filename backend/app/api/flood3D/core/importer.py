"""
importer — Geometrie-Import aus CAD-Welten (Spez.: BricsCAD-Workflow).

Ein Kanal für DXF (Gelände-TIN als 3DFACE/POLYFACE/MESH je Layer, Trassen
als Polylinien, 3DSOLID wird ERKANNT aber abgewiesen — ACIS ist proprietär,
in BricsCAD vor dem Export CONVTOMESH ausführen) und STL/OBJ (Mehrkörper
zerfallen per Komponenten-Split). Jede Datei wird zu einer Liste von
KANDIDATEN mit Kennzahlen und Rollen-Vorschlag; die Übernahme geschieht
erst nach der Deklaration im Editor (apply_import).

Interne Ablage: <fall>/imports/<import_id>/kand_<n>.stl + manifest.json.
Gelände-Kandidaten werden bei der Übernahme auf das Raster der Geländebasis
interpoliert (.asc) — damit funktionieren alle bestehenden Ketten
(Geländeoperationen, sample(), Editor) unverändert; das Original-TIN bleibt
als STL neben dem Fall liegen.
"""
from __future__ import annotations

import json
import math
import re
import time
import uuid
from pathlib import Path

import numpy as np
import trimesh

SAFE_FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9. _()-]*$")

# Einheiten-Verdacht: Gebäudemaße in mm ergeben BBoxen im Zehntausender-
# Bereich; Landeskoordinaten (UTM) ergeben Offsets im Millionenbereich.
UNIT_SUSPECT_SPAN = 5000.0
OFFSET_SUSPECT = 10000.0


# --------------------------------------------------------------------------
# Analyse
# --------------------------------------------------------------------------

def _mesh_stats(vertices: np.ndarray, faces: np.ndarray,
                watertight: bool) -> dict:
    lo = vertices.min(axis=0)
    hi = vertices.max(axis=0)
    return {
        "n_triangles": int(len(faces)),
        "bbox": [[round(float(v), 3) for v in lo],
                 [round(float(v), 3) for v in hi]],
        "span_xy": [round(float(hi[0] - lo[0]), 3),
                    round(float(hi[1] - lo[1]), 3)],
        "z_range": [round(float(lo[2]), 3), round(float(hi[2]), 3)],
        "watertight": bool(watertight),
    }


# CAD-Layer tragen die Absicht im Namen — das schlägt jede Geometrie-
# Heuristik. Reihenfolge zählt: „gelaende" vor „gel", Wehr vor Wand.
_NAME_HINTS = [
    ("gelaende", "gelaende"), ("gelände", "gelaende"), ("terrain", "gelaende"),
    ("dgm", "gelaende"), ("dom", "gelaende"), ("tin", "gelaende"),
    ("wehr", "wehr"), ("ueberfall", "wehr"), ("überfall", "wehr"),
    ("pfeiler", "pfeiler"), ("stuetze", "pfeiler"), ("stütze", "pfeiler"),
    ("pier", "pfeiler"),
    ("becken", "becken"), ("basin", "becken"), ("wanne", "becken"),
    ("mauer", "wand"), ("wand", "wand"), ("wall", "wand"),
]


def _guess_role(stats: dict, name: str = "") -> str:
    low = name.lower()
    for key, role in _NAME_HINTS:
        if key in low:
            return role
    sx, sy = stats["span_xy"]
    dz = stats["z_range"][1] - stats["z_range"][0]
    if not stats["watertight"] and sx * sy > 25 and max(sx, sy) > 10:
        return "gelaende"
    if stats["watertight"]:
        slim = min(sx, sy) < 0.2 * max(sx, sy)
        if slim and max(sx, sy) > 2:
            return "wand"
        if max(sx, sy) < 6 and dz > 0.5:
            return "pfeiler"
        return "bauwerk"
    return "bauwerk"


def _candidate(name: str, mesh: trimesh.Trimesh) -> dict:
    stats = _mesh_stats(mesh.vertices, mesh.faces, mesh.is_watertight)
    return {"name": name, "kind": "mesh", "stats": stats,
            "role_guess": _guess_role(stats, name)}


def _split_named(mesh_or_scene) -> list[tuple[str, trimesh.Trimesh]]:
    """Szene/Netz in benannte Einzelkörper zerlegen."""
    out: list[tuple[str, trimesh.Trimesh]] = []
    if isinstance(mesh_or_scene, trimesh.Scene):
        for name, geom in mesh_or_scene.geometry.items():
            if isinstance(geom, trimesh.Trimesh) and len(geom.faces):
                out.append((str(name), geom))
    elif isinstance(mesh_or_scene, trimesh.Trimesh):
        out.append(("teil", mesh_or_scene))
    parts: list[tuple[str, trimesh.Trimesh]] = []
    for name, m in out:
        comps = m.split(only_watertight=False)
        if len(comps) <= 1:
            parts.append((name, m))
        else:
            for i, c in enumerate(comps, 1):
                parts.append((f"{name}_{i}", c))
    return parts


def analyze_stl_obj(data: bytes, filename: str) -> list[dict]:
    import io
    kind = filename.rsplit(".", 1)[-1].lower()
    loaded = trimesh.load(io.BytesIO(data), file_type=kind)
    cands = []
    for name, m in _split_named(loaded):
        c = _candidate(name, m)
        c["_mesh"] = m
        cands.append(c)
    return cands


def _dxf_polyline_points(e) -> list[list[float]]:
    """
    Stützpunkte MIT Höhe. Die Höhe ist der ganze Wert einer Böschungs-
    oder Bruchkante — sie wegzuwerfen macht aus Vermessungsdaten eine
    beliebige Grundrisslinie. LWPOLYLINE trägt eine gemeinsame Höhe
    (elevation), die echte 3D-POLYLINE eine je Stützpunkt.
    """
    if e.dxftype() == "LWPOLYLINE":
        z = float(getattr(e.dxf, "elevation", 0.0) or 0.0)
        return [[float(p[0]), float(p[1]), z] for p in e.get_points("xy")]
    return [[float(v.dxf.location.x), float(v.dxf.location.y),
             float(v.dxf.location.z)] for v in e.vertices]


# Layernamen aus der Vermessung deuten: BOK/BÖOK/OK -> Oberkante usw.
def _linien_rolle(layer: str) -> str:
    n = layer.lower()
    if any(t in n for t in ("bok", "bö_ok", "boe_ok", "oberkante", "_ok")):
        return "boeschung_ok"
    if any(t in n for t in ("buk", "bö_uk", "boe_uk", "unterkante", "_uk")):
        return "boeschung_uk"
    if any(t in n for t in ("kante", "bruch")):
        return "bruchkante"
    if any(t in n for t in ("sohle", "gerinne", "graben")):
        return "bruchkante"
    return "querschnitt"


def _kreis_rolle(layer: str) -> str:
    n = layer.lower()
    if any(t in n for t in ("auslauf", "ablauf", "drossel", "abfluss")):
        return "ablaufrohr"
    if any(t in n for t in ("einlauf", "zulauf", "zufluss")):
        return "zulaufrohr"
    return "ablaufrohr"


def _paar_schluessel(name: str) -> str:
    """
    Name ohne OK/UK-Kennung — damit finden sich die beiden Kanten. Die
    laufende Nummer bleibt stehen: liegen zwei Böschungen auf DEMSELBEN
    Layer, unterscheidet nur sie die Paare (sonst überschreiben sie sich).
    """
    n = re.sub(r"_linie(?:_(\d+))?$",
               lambda m: f"_{m.group(1)}" if m.group(1) else "", name.lower())
    for t in ("boeschung", "böschung", "boe", "bö"):
        n = n.replace(t, "")
    for t in ("bok", "buk", "oberkante", "unterkante", "ok", "uk"):
        n = re.sub(rf"(^|[_-]){t}([_-]|$)", "_", n)
    return re.sub(r"[_-]+", "_", n).strip("_")


# Entitäten, die wir lesen können. Alles andere fliegt beim Säubern raus —
# fremde Objekte (Civil-3D-/BricsCAD-Oberflächen, Proxys) tragen ihre Daten
# in Binärblöcken, an denen jeder Fremdleser scheitert.
_DXF_BEKANNT = {
    "3DFACE", "POLYLINE", "VERTEX", "SEQEND", "LWPOLYLINE", "MESH", "LINE",
    "POINT", "CIRCLE", "ARC", "SPLINE", "3DSOLID", "REGION", "BODY", "INSERT",
    "TEXT", "MTEXT", "SOLID", "ELLIPSE", "HATCH", "DIMENSION", "LEADER",
    "ATTRIB", "ATTDEF", "VIEWPORT",
}


def _dxf_saeubern(text: str) -> tuple[str, dict]:
    """
    Unbekannte Entitäten aus dem ENTITIES-Abschnitt entfernen.

    Eine einzige Fremdentität — etwa die TIN-Oberfläche von BricsCAD Civil —
    lässt den DXF-Leser mit „Invalid binary data" abbrechen, obwohl die
    lesbaren Flächen und Linien daneben völlig in Ordnung sind. Gearbeitet
    wird auf der Ebene der Gruppencode-Paare; das ist unabhängig davon,
    was in einer Entität steht.
    """
    zeilen = text.splitlines()
    paare = [(zeilen[i].strip(), zeilen[i + 1] if i + 1 < len(zeilen) else "")
             for i in range(0, len(zeilen) - 1, 2)]
    raus: dict[str, int] = {}
    out: list[str] = []
    in_entities = False
    ueberspringen = False
    for code, wert in paare:
        w = wert.strip()
        if code == "0":
            if w == "SECTION":
                ueberspringen = False
            elif w == "ENDSEC":
                in_entities = False
                ueberspringen = False
            elif in_entities:
                ueberspringen = w not in _DXF_BEKANNT
                if ueberspringen:
                    raus[w] = raus.get(w, 0) + 1
        elif code == "2" and w == "ENTITIES":
            in_entities = True
        if not ueberspringen:
            out.append(code)
            out.append(wert)
    return "\n".join(out) + "\n", raus


def analyze_dxf(data: bytes, filename: str) -> list[dict]:
    """
    DXF je LAYER zerlegen: Dreiecks-/Facetten-Entities (3DFACE, POLYFACE,
    MESH) werden zu Mesh-Kandidaten, Polylinien zu Trassen-Kandidaten,
    3DSOLID zu einem Hinweis-Kandidaten (nicht triangulierbar).
    """
    import io

    import ezdxf
    from ezdxf.render import MeshVertexMerger

    # Binär-DXF: CAD-Programme schreiben das auf Wunsch, es ist kompakter
    # und verlustfrei. Der Textleser sieht darin nur Zeichensalat.
    if data[:18] == b"AutoCAD Binary DXF":
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            doc = ezdxf.readfile(tmp)
        finally:
            Path(tmp).unlink(missing_ok=True)
        return _dxf_kandidaten(doc, {})

    text = data.decode("utf-8", errors="replace")
    entfernt: dict = {}
    try:
        doc = ezdxf.read(io.StringIO(text))
    except Exception:                       # noqa: BLE001
        # zweiter Anlauf ohne die Fremdentitäten
        sauber, entfernt = _dxf_saeubern(text)
        if not entfernt:
            raise
        doc = ezdxf.read(io.StringIO(sauber))
    return _dxf_kandidaten(doc, entfernt)


def _dxf_kandidaten(doc, entfernt: dict) -> list[dict]:
    from ezdxf.render import MeshVertexMerger

    msp = doc.modelspace()

    unbekannt: dict[str, int] = {}
    kreise_per_layer: dict[str, list] = {}
    tri_per_layer: dict[str, MeshVertexMerger] = {}
    lines_per_layer: dict[str, list[list[list[float]]]] = {}
    acis_layers: dict[str, int] = {}

    for e in msp:
        # Fremdentitäten kennt ezdxf teils nur als Hülle ohne Standard-
        # attribute — ein blindes e.dxf.layer wirft dort einen Fehler und
        # riss den gesamten Import mit sich.
        t = e.dxftype()
        if t not in _DXF_BEKANNT:
            unbekannt[t] = unbekannt.get(t, 0) + 1
            continue
        try:
            layer = e.dxf.get("layer", "0") or "0"
        except Exception:                   # noqa: BLE001
            unbekannt[t] = unbekannt.get(t, 0) + 1
            continue
        if t == "3DFACE":
            merger = tri_per_layer.setdefault(layer, MeshVertexMerger())
            pts = [tuple(e.dxf.vtx0), tuple(e.dxf.vtx1),
                   tuple(e.dxf.vtx2), tuple(e.dxf.vtx3)]
            merger.add_face(pts[:3])
            # 3DFACE darf ein Viereck sein: vtx3 != vtx2 -> zweites Dreieck
            if tuple(pts[3]) != tuple(pts[2]):
                merger.add_face([pts[0], pts[2], pts[3]])
        elif t in ("MESH", "POLYFACE"):
            merger = tri_per_layer.setdefault(layer, MeshVertexMerger())
            try:
                from ezdxf.render import MeshBuilder
                mb = (MeshBuilder.from_mesh(e) if t == "MESH"
                      else MeshBuilder.from_polyface(e))
                for face in mb.faces_as_vertices():
                    face = [tuple(v) for v in face]
                    for k in range(1, len(face) - 1):
                        merger.add_face([face[0], face[k], face[k + 1]])
            except Exception:
                continue
        elif t == "POLYLINE" and e.is_poly_face_mesh:
            merger = tri_per_layer.setdefault(layer, MeshVertexMerger())
            try:
                from ezdxf.render import MeshBuilder
                mb = MeshBuilder.from_polyface(e)
                for face in mb.faces_as_vertices():
                    face = [tuple(v) for v in face]
                    for k in range(1, len(face) - 1):
                        merger.add_face([face[0], face[k], face[k + 1]])
            except Exception:
                continue
        elif t == "CIRCLE":
            # Ein Kreis ist die vollständige Beschreibung einer Rohrmündung:
            # Mitte, Durchmesser und — über die Extrusionsrichtung — die
            # Rohrachse. Achtung: liegt der Kreis nicht waagerecht, steht
            # seine Mitte im OCS und muss erst in Weltkoordinaten gedreht
            # werden (sonst landet sie irgendwo im Nirgendwo).
            try:
                mitte = tuple(float(v) for v in e.ocs().to_wcs(e.dxf.center))
                n = tuple(float(v) for v in e.dxf.get("extrusion", (0, 0, 1)))
                kreise_per_layer.setdefault(layer, []).append(
                    (mitte, float(e.dxf.radius), n))
            except Exception:               # noqa: BLE001
                unbekannt["CIRCLE"] = unbekannt.get("CIRCLE", 0) + 1
        elif t in ("LWPOLYLINE", "POLYLINE"):
            pts = _dxf_polyline_points(e)
            if len(pts) >= 2:
                lines_per_layer.setdefault(layer, []).append(pts)
        elif t in ("3DSOLID", "REGION", "BODY"):
            acis_layers[layer] = acis_layers.get(layer, 0) + 1

    cands: list[dict] = []
    for layer, merger in sorted(tri_per_layer.items()):
        verts = np.asarray(merger.vertices, dtype=float)
        faces = np.asarray(merger.faces, dtype=int)
        if not len(faces):
            continue
        m = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
        # Ein Layer kann mehrere KÖRPER tragen -> Komponenten-Split. Ein
        # Gelände dagegen ist EINE Fläche, auch wenn die Dreiecke keine
        # gemeinsamen Punkte haben (aus TIN-Exporten der Normalfall) —
        # sonst zerfällt ein Layer in Dutzende Ein-Dreieck-Kandidaten.
        if _guess_role(_mesh_stats(verts, faces, m.is_watertight), layer) \
                == "gelaende":
            teile = [("teil", m)]
        else:
            teile = _split_named(m)
        for name, part in teile:
            label = layer if name == "teil" else f"{layer}_{name.split('_')[-1]}"
            c = _candidate(label, part)
            c["_mesh"] = part
            cands.append(c)
    for layer, lines in sorted(lines_per_layer.items()):
        for i, pts in enumerate(lines, 1):
            arr = np.asarray(pts)
            hat_z = arr.shape[1] > 2 and float(np.ptp(arr[:, 2])) > 1e-6
            cands.append({
                "name": f"{layer}_linie_{i}" if len(lines) > 1 else f"{layer}_linie",
                "kind": "polyline",
                "role_guess": _linien_rolle(layer),
                "stats": {"n_points": len(pts),
                          "length": round(float(np.linalg.norm(
                              np.diff(arr[:, :2], axis=0), axis=1).sum()), 2),
                          "z_min": round(float(arr[:, 2].min()), 2)
                          if arr.shape[1] > 2 else None,
                          "z_max": round(float(arr[:, 2].max()), 2)
                          if arr.shape[1] > 2 else None,
                          "hoehen": bool(hat_z)},
                "_polyline": pts,
            })
    for t, n in unbekannt.items():
        entfernt[t] = entfernt.get(t, 0) + n
    if entfernt:
        liste = ", ".join(f"{n}× {t}" for t, n in sorted(entfernt.items()))
        cands.append({
            "name": "nicht lesbare Objekte", "kind": "hinweis",
            "role_guess": "ignorieren", "stats": {"anzahl": sum(entfernt.values())},
            "hint": f"Die Datei enthält Fremdobjekte ({liste}), die kein "
                    "Fremdprogramm lesen kann — ihre Geometrie steckt in "
                    "Binärblöcken. Sie wurden übersprungen; alles andere "
                    "wurde eingelesen. Fehlt dadurch das Gelände, in "
                    "BricsCAD/Civil die Oberfläche über EXPORTTIN bzw. "
                    "„In 3D-Flächen konvertieren\" ausgeben.",
        })

    for layer, kreise in sorted(kreise_per_layer.items()):
        for i, (mitte, r, n) in enumerate(kreise, 1):
            cands.append({
                "name": f"{layer}_rohr_{i}" if len(kreise) > 1 else f"{layer}_rohr",
                "kind": "kreis",
                "role_guess": _kreis_rolle(layer),
                "stats": {"durchmesser": round(2 * r, 3),
                          "mitte": [round(v, 3) for v in mitte],
                          "achse": [round(v, 4) for v in n],
                          "sohle": round(mitte[2] - r, 3),
                          "scheitel": round(mitte[2] + r, 3)},
                "_kreis": {"mitte": list(mitte), "radius": r, "achse": list(n)},
            })

    for layer, n in sorted(acis_layers.items()):
        cands.append({
            "name": layer, "kind": "acis", "role_guess": "ignorieren",
            "stats": {"n_solids": n},
            "hint": f"{n} 3DSOLID/ACIS-Körper auf Layer „{layer}“ — nicht "
                    "triangulierbar. In BricsCAD CONVTOMESH ausführen "
                    "(oder als STL exportieren) und neu importieren.",
        })
    return cands


def analyze_raster(data: bytes, filename: str) -> list[dict]:
    """
    Fertiges Höhenraster (ESRI-ASCII oder XYZ). Zwei Verwendungen: als
    Basisgelände oder als Zusatzraster für die Operation „Bereich ersetzen"
    — dafür gab es bisher überhaupt keinen Weg, die zweite Datei in den
    Fall zu bekommen.
    """
    text = data.decode("utf-8", errors="replace")
    kopf = {}
    for zeile in text.split("\n")[:6]:
        teile = zeile.split()
        if len(teile) == 2 and teile[0].lower() in (
                "ncols", "nrows", "cellsize", "xllcorner", "yllcorner"):
            kopf[teile[0].lower()] = float(teile[1])
    stats = {"format": "ESRI-ASCII" if "ncols" in kopf else "XYZ",
             "nx": int(kopf.get("ncols", 0)) or None,
             "ny": int(kopf.get("nrows", 0)) or None,
             "cellsize": kopf.get("cellsize"),
             "kb": round(len(data) / 1024)}
    return [{"name": filename.rsplit(".", 1)[0], "kind": "raster",
             "role_guess": "gelaende", "stats": stats, "_raster": data}]


def analyze_file(data: bytes, filename: str, case_dir: Path) -> dict:
    """Datei analysieren, Kandidaten-Meshes ablegen, Manifest zurückgeben."""
    if not SAFE_FILENAME.match(filename):
        raise ValueError(f"Unsicherer Dateiname: {filename!r}")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "dxf":
        cands = analyze_dxf(data, filename)
    elif ext in ("stl", "obj"):
        cands = analyze_stl_obj(data, filename)
    elif ext in ("asc", "xyz", "txt"):
        cands = analyze_raster(data, filename)
    else:
        raise ValueError(f"Nicht unterstütztes Format: .{ext} "
                         "(unterstützt: .dxf, .stl, .obj, .asc, .xyz)")
    if not cands:
        raise ValueError("Keine verwertbare Geometrie gefunden — enthält die "
                         "Datei 3DFACE/POLYFACE/MESH-Flächen oder Polylinien?")

    import_id = f"imp-{uuid.uuid4().hex[:8]}"
    imp_dir = case_dir / "imports" / import_id
    imp_dir.mkdir(parents=True)
    (imp_dir / filename).write_bytes(data)

    # globale Lage-/Einheiten-Verdachte über alle Mesh-Kandidaten
    los, his = [], []
    for i, c in enumerate(cands):
        c["id"] = f"k{i}"
        mesh = c.pop("_mesh", None)
        if mesh is not None:
            mesh.export(imp_dir / f"{c['id']}.stl")
            los.append(c["stats"]["bbox"][0])
            his.append(c["stats"]["bbox"][1])
        kreis = c.pop("_kreis", None)
        if kreis is not None:
            (imp_dir / f"{c['id']}.kreis.json").write_text(json.dumps(kreis))
        roh = c.pop("_raster", None)
        if roh is not None:
            (imp_dir / f"{c['id']}.grid").write_bytes(roh)
        poly = c.pop("_polyline", None)
        if poly is not None:
            (imp_dir / f"{c['id']}.json").write_text(json.dumps(poly))

    manifest = {"import_id": import_id, "filename": filename,
                "created": time.time(), "candidates": cands}
    if los:
        lo = np.min(np.asarray(los), axis=0)
        hi = np.max(np.asarray(his), axis=0)
        span = hi - lo
        manifest["bbox"] = [[round(float(v), 3) for v in lo],
                            [round(float(v), 3) for v in hi]]
        manifest["unit_suspect"] = bool(max(span[0], span[1]) > UNIT_SUSPECT_SPAN)
        manifest["offset_suggest"] = (
            [round(float(lo[0]), 3), round(float(lo[1]), 3)]
            if max(abs(lo[0]), abs(lo[1])) > OFFSET_SUSPECT else None)
    (imp_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False))
    return manifest


# --------------------------------------------------------------------------
# Rasterung Gelände-TIN -> ESRI-ASCII
# --------------------------------------------------------------------------

def rasterize_tin_to_asc(mesh: trimesh.Trimesh, out_path: Path,
                         resolution: float) -> dict:
    """
    TIN baryzentrisch auf ein Raster interpolieren (matplotlib-Triangulation
    — die Lib ist ohnehin da). Zellen außerhalb des TIN bleiben NODATA.
    """
    from matplotlib.tri import LinearTriInterpolator, Triangulation

    v = np.asarray(mesh.vertices, dtype=float)
    f = np.asarray(mesh.faces, dtype=int)
    x0, y0 = v[:, 0].min(), v[:, 1].min()
    x1, y1 = v[:, 0].max(), v[:, 1].max()
    nx = max(2, int(np.ceil((x1 - x0) / resolution)) + 1)
    ny = max(2, int(np.ceil((y1 - y0) / resolution)) + 1)
    xs = x0 + np.arange(nx) * resolution
    ys = y0 + np.arange(ny) * resolution
    xx, yy = np.meshgrid(xs, ys)

    # Senkrechte Dreiecke (Beckenwände, Mauern) projizieren sich im Grundriss
    # auf eine Linie. Sie tragen keine Höheninformation und machen die
    # Vermaschung ungültig — matplotlib bricht dann mit „Triangulation is
    # invalid" ab, obwohl das TIN in Ordnung ist.
    a = v[f[:, 0], :2]
    b = v[f[:, 1], :2]
    c = v[f[:, 2], :2]
    flaeche = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1])
                     - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])) / 2
    brauchbar = flaeche > 1e-9
    verworfen = int((~brauchbar).sum())
    f = f[brauchbar]
    if not len(f):
        raise ValueError("Alle Dreiecke stehen senkrecht — daraus lässt sich "
                         "kein Höhenraster bilden. Ist das wirklich ein "
                         "Gelände und keine Wandfläche?")

    try:
        tri = Triangulation(v[:, 0], v[:, 1], f)
        z = np.ma.filled(LinearTriInterpolator(tri, v[:, 2])(xx, yy), np.nan)
    except (RuntimeError, ValueError):
        # Letzte Rettung: eigene Vermaschung der Stützpunkte. Verliert die
        # Zwangskanten des TIN, liefert aber ein brauchbares Raster.
        from scipy.interpolate import LinearNDInterpolator
        pkte = v[np.unique(f)]
        z = LinearNDInterpolator(pkte[:, :2], pkte[:, 2])(xx, yy)

    # Löcher schließen: ein TIN deckt den Hüllquader nie ganz ab (Ecken,
    # senkrechte Wände). Blieben sie als NODATA stehen, füllt der Leser sie
    # mit dem MITTELWERT aller Höhen — mitten im Becken entstand daraus ein
    # Plateau von über einem Meter.
    aus_tin = float(np.mean(~np.isnan(z)))
    luecke = np.isnan(z)
    if luecke.any() and not luecke.all():
        from scipy.spatial import cKDTree
        gy, gx = np.nonzero(~luecke)
        baum = cKDTree(np.column_stack([xx[~luecke], yy[~luecke]]))
        _, nachbar = baum.query(np.column_stack([xx[luecke], yy[luecke]]))
        z = z.copy()
        z[luecke] = z[~luecke][nachbar]

    nodata = -9999.0
    grid = np.where(np.isnan(z), nodata, z)
    lines = [f"ncols {nx}", f"nrows {ny}",
             f"xllcorner {x0 - resolution / 2:.3f}",
             f"yllcorner {y0 - resolution / 2:.3f}",
             f"cellsize {resolution:g}", f"nodata_value {nodata:g}"]
    for row in grid[::-1]:                     # ESRI: von Nord nach Süd
        lines.append(" ".join(f"{val:.3f}" for val in row))
    out_path.write_text("\n".join(lines))
    return {"nx": nx, "ny": ny,
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "senkrecht_verworfen": verworfen,
            "coverage": round(aus_tin, 3)}


def _verdichten(pts: np.ndarray, schritt: float) -> np.ndarray:
    """
    Polylinie mit Zwischenpunkten auffüllen. Eine gewöhnliche Delaunay-
    Vermaschung kennt keine Zwangskanten — sie darf über eine Böschungs-
    kante hinweg triangulieren und die Kante damit abschneiden. Liegen die
    Stützpunkte dichter als das Zielraster, bleibt praktisch keine
    Dreieckskante mehr übrig, die sie überspringen könnte.
    """
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        L = float(np.linalg.norm(b[:2] - a[:2]))
        n = max(1, int(np.ceil(L / max(schritt, 1e-6))))
        for k in range(1, n + 1):
            out.append(a + (b - a) * (k / n))
    return np.asarray(out, dtype=float)


def _kanten_grenze(pkte: list, schritt: float) -> float:
    """
    Ab welcher Kantenlänge ein Dreieck als „erfunden" gilt. Maßstab ist der
    typische Abstand ZWISCHEN den Linien: Dreiecke, die benachbarte Kanten
    verbinden, sollen bleiben; solche, die quer über das ganze Gebiet
    springen, nicht.
    """
    from scipy.spatial import cKDTree

    if len(pkte) < 2:
        return max(20 * schritt, 1.0)
    alle = np.vstack(pkte)
    marke = np.concatenate([np.full(len(p), i) for i, p in enumerate(pkte)])
    baum = cKDTree(alle[:, :2])
    # bis zu 32 Nachbarn abfragen und den ersten von EINER ANDEREN Linie nehmen
    k = min(32, len(alle))
    d, idx = baum.query(alle[:, :2], k=k)
    fremd = []
    for i in range(len(alle)):
        anders = np.nonzero(marke[idx[i]] != marke[i])[0]
        if len(anders):
            fremd.append(d[i][anders[0]])
    if not fremd:
        return max(20 * schritt, 1.0)
    return float(max(1.5 * np.median(fremd), 3 * schritt))


def tin_from_lines(linien: list, out_path: Path, resolution: float,
                   max_kante: float | None = None) -> dict:
    """
    Geländeraster AUS 3D-Linien: Bruch-, Böschungs- und Sohlkanten sind in
    Vermessungsdaten oft das Einzige, was geliefert wird — ein fertiges TIN
    gibt es nicht. Die Punkte werden vermascht und baryzentrisch
    interpoliert. Dreiecke mit sehr langer Kante fallen heraus (dort würde
    Gelände erfunden); die verbleibenden Lücken werden von der nächsten
    bekannten Höhe fortgeführt, damit kein Loch im Rechengebiet bleibt.
    """
    from matplotlib.tri import LinearTriInterpolator, Triangulation
    from scipy.spatial import cKDTree

    schritt = max(resolution, 1e-3)
    pkte = [_verdichten(np.asarray(li, dtype=float), schritt)
            for li in linien if len(li) >= 2]
    if not pkte:
        raise ValueError("Zu wenige Linien für ein Gelände")
    v = np.vstack(pkte)
    if len(v) < 3:
        raise ValueError("Zu wenige Stützpunkte für ein Gelände")
    grenze = max_kante if max_kante is not None else _kanten_grenze(pkte, schritt)

    x0, y0 = v[:, 0].min(), v[:, 1].min()
    x1, y1 = v[:, 0].max(), v[:, 1].max()
    nx = max(2, int(np.ceil((x1 - x0) / resolution)) + 1)
    ny = max(2, int(np.ceil((y1 - y0) / resolution)) + 1)
    xx, yy = np.meshgrid(x0 + np.arange(nx) * resolution,
                         y0 + np.arange(ny) * resolution)

    tri = Triangulation(v[:, 0], v[:, 1])          # Delaunay über qhull
    ecken = v[tri.triangles][:, :, :2]
    kanten = np.linalg.norm(ecken - np.roll(ecken, 1, axis=1), axis=2)
    tri.set_mask(kanten.max(axis=1) > grenze)
    z = np.ma.filled(LinearTriInterpolator(tri, v[:, 2])(xx, yy), np.nan)
    aus_maschen = float(np.mean(~np.isnan(z)))

    luecke = np.isnan(z)
    if luecke.any():
        _, nachbar = cKDTree(v[:, :2]).query(
            np.column_stack([xx[luecke], yy[luecke]]))
        z[luecke] = v[nachbar, 2]

    zeilen = [f"ncols {nx}", f"nrows {ny}",
              f"xllcorner {x0 - resolution / 2:.3f}",
              f"yllcorner {y0 - resolution / 2:.3f}",
              f"cellsize {resolution:g}", "nodata_value -9999"]
    for row in z[::-1]:                            # ESRI: Nord nach Süd
        zeilen.append(" ".join(f"{val:.3f}" for val in row))
    out_path.write_text("\n".join(zeilen))
    return {"nx": nx, "ny": ny, "n_punkte": int(len(v)),
            "max_kante": round(float(grenze), 2),
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "coverage": round(aus_maschen, 3)}


# --------------------------------------------------------------------------
# Übernahme
# --------------------------------------------------------------------------

def _kanten_id(name: str, praefix: str, vergeben: set) -> str:
    basis = re.sub(r"[^a-z0-9_]", "_", name.lower()).strip("_") or praefix
    if not basis.startswith(praefix):
        basis = f"{praefix}_{basis}"
    sid, n = basis[:40], 2
    while sid in vergeben:
        sid = f"{basis[:36]}_{n}"
        n += 1
    vergeben.add(sid)
    return sid


def _mittlere_neigung(ok: np.ndarray, uk: np.ndarray) -> float:
    """Mittlere Böschungsneigung 1:n — die Kennzahl, die der Prüfer sucht."""
    dz = abs(float(ok[:, 2].mean() - uk[:, 2].mean()))
    # mittlerer Abstand: jeder OK-Punkt zum nächsten UK-Punkt
    d = np.linalg.norm(ok[:, None, :2] - uk[None, :, :2], axis=2).min(axis=1)
    return float(d.mean() / dz) if dz > 1e-6 else float("inf")


def apply_import(spec, case_dir: Path, import_id: str,
                 decisions: list[dict], unit_factor: float = 1.0,
                 offset: list[float] | None = None,
                 derive_domain: bool = False,
                 terrain_from_lines: bool | None = None,
                 rotation_deg: float = 0.0) -> dict:
    """
    Deklarierte Kandidaten in den Fall übernehmen. decisions:
    [{candidate, role, patch?, material?}], role in gelaende | wand |
    pfeiler | wehr | becken | bauwerk | querschnitt | ignorieren.
    Rückgabe: geänderte Spec (als dict) + Bericht.
    """
    from .casespec import OpBoeschung, OpBruchkante, Section, StructImported

    imp_dir = case_dir / "imports" / import_id
    manifest = json.loads((imp_dir / "manifest.json").read_text())
    by_id = {c["id"]: c for c in manifest["candidates"]}
    off = np.asarray([offset[0], offset[1], 0.0] if offset else [0, 0, 0],
                     dtype=float)
    # Modell drehen: das Rechengebiet ist ein achsparalleler Quader. Liegt
    # das Bauwerk schräg im Landeskoordinatensystem, verschenkt man damit
    # Fläche und schneidet an den falschen Stellen ab. Deshalb wird beim
    # Import EINMAL alles in ein lokales System gedreht, in dem das
    # Bauwerk gerade steht — danach passt der Quader eng darum.
    rot = math.radians(rotation_deg or 0.0)
    _c, _s = math.cos(rot), math.sin(rot)

    def drehen(pkte: np.ndarray) -> np.ndarray:
        """(n,2) oder (n,3) um die z-Achse durch den Ursprung drehen."""
        if not rot:
            return pkte
        a = np.array(pkte, dtype=float, copy=True)
        x, y = a[..., 0].copy(), a[..., 1].copy()
        a[..., 0] = _c * x - _s * y
        a[..., 1] = _s * x + _c * y
        return a
    report: list[str] = []
    terrain_bbox = None
    gelaende_gesetzt = False

    def load_mesh(cid: str) -> trimesh.Trimesh:
        # Reihenfolge: erst skalieren (mm -> m), dann verschieben — der
        # Offset wird in der ZIELeinheit angegeben (Editor zeigt ihn so an)
        m = trimesh.load(imp_dir / f"{cid}.stl", force="mesh")
        if unit_factor != 1.0:
            m.apply_scale(unit_factor)
        m.apply_translation(-off)
        if rot:
            m.apply_transform(trimesh.transformations.rotation_matrix(
                rot, [0, 0, 1]))
        return m

    solid_roles = {"wand": "wand", "pfeiler": "pfeiler", "wehr": "wehr",
                   "becken": "becken", "bauwerk": "bauwerk"}
    existing = {s.id for s in spec.structures}
    # Böschungskanten werden erst gesammelt und danach paarweise verheiratet
    kanten: dict[str, dict] = {}
    vorhandene_ops = {o.id for o in (spec.terrain.operations
                                     if spec.terrain else [])}
    vorhandene_qs = {x.id for x in spec.evaluation.sections}

    def linie_laden(c) -> np.ndarray:
        pts = json.loads((imp_dir / f"{c['id']}.json").read_text())
        arr = np.asarray(pts, dtype=float)
        if arr.shape[1] < 3:                      # alte Importe ohne Höhe
            arr = np.column_stack([arr, np.zeros(len(arr))])
        arr = arr * unit_factor
        return drehen(arr - off)

    def _p3(arr) -> list:
        return [[round(float(q[0]), 3), round(float(q[1]), 3),
                 round(float(q[2]), 3)] for q in arr]

    def gelaende_aus_linien(ent: list) -> None:
        from .casespec import Terrain, TerrainBase
        res = spec.terrain.base.resolution if spec.terrain else 0.5
        linien = [linie_laden(by_id[d["candidate"]]) for d in ent]
        asc = case_dir / f"gelaende_{import_id}_linien.asc"
        info = tin_from_lines(linien, asc, res)
        ops = spec.terrain.operations if spec.terrain else []
        mat = spec.terrain.material if spec.terrain else "erde"
        spec.terrain = Terrain(base=TerrainBase(source=asc.name,
                                                resolution=res),
                               operations=ops, material=mat)
        nonlocal terrain_bbox
        e = info["extent"]
        zs = np.concatenate([li[:, 2] for li in linien])
        terrain_bbox = np.array([[e[0], e[1], float(zs.min())],
                                 [e[2], e[3], float(zs.max())]])
        report.append(
            f"Gelände aus {len(linien)} Kanten vermascht: "
            f"{info['n_punkte']} Stützpunkte auf {info['nx']}×{info['ny']} "
            f"Raster, Höhen {zs.min():.2f} … {zs.max():.2f} m. "
            f"{info['coverage']:.0%} der Fläche liegen zwischen den Kanten "
            f"(Dreiecke bis {info['max_kante']:g} m Kantenlänge), der Rest "
            "führt die nächstgelegene Höhe fort.")

    # ---- Gelände AUS den Linien -----------------------------------------
    # Vermessungsdaten kommen oft ohne TIN: nur Bruch-, Böschungs- und
    # Sohlkanten. Dann bilden genau diese Linien das Gelände. Ohne
    # Basisgelände ist das der einzig sinnvolle Weg — eine Kante allein
    # hätte sonst nichts, was sie verändern könnte.
    hat_gelaende_mesh = any(d.get("role") in ("gelaende", "gelaende_koerper")
                            for d in decisions)
    linien_ent = [d for d in decisions
                  if by_id.get(d["candidate"], {}).get("kind") == "polyline"
                  and d.get("role") in ("bruchkante", "boeschung_ok",
                                        "boeschung_uk")]
    aus_linien = terrain_from_lines
    if aus_linien is None:
        aus_linien = (not hat_gelaende_mesh and spec.terrain is None
                      and bool(linien_ent))

    if aus_linien and linien_ent:
        gelaende_aus_linien(linien_ent)

    for d in decisions:
        c = by_id.get(d["candidate"])
        role = d.get("role", "ignorieren")
        if c is None or role == "ignorieren":
            continue
        if c["kind"] == "acis":
            report.append(c.get("hint", "ACIS übersprungen"))
            continue

        if c["kind"] == "kreis":
            # Rohrmündung -> Stutzen als Durchlass. Die Achse folgt der
            # Kreisnormalen; die Länge ist bewusst kurz (zwei Durchmesser):
            # was VOR der Mündung passiert, entscheidet sich dort, das
            # Rohrinnere trägt dazu nichts bei.
            from .casespec import CulvertProfile, StructCulvert
            k = json.loads((imp_dir / f"{c['id']}.kreis.json").read_text())
            mitte = drehen((np.asarray(k["mitte"], dtype=float)
                            * unit_factor) - off)
            n = drehen(np.asarray(k["achse"], dtype=float))
            n = n / (np.linalg.norm(n) or 1.0)
            d = 2 * k["radius"] * unit_factor
            halb = d                      # je Seite ein Durchmesser
            sid = re.sub(r"[^a-z0-9_]", "_", c["name"].lower())[:40]
            n_ = 2
            while sid in existing:
                sid = f"{sid[:36]}_{n_}"
                n_ += 1
            existing.add(sid)
            spec.structures.append(StructCulvert(
                id=sid, type="culvert", patch=sid,
                axis=[tuple(np.round(mitte - n * halb, 3)),
                      tuple(np.round(mitte + n * halb, 3))],
                profile=CulvertProfile(kind="circular", diameter=round(d, 3)),
                material=None))
            report.append(
                f"Rohrmündung „{sid}“: DN{d * 1000:.0f}, Achse "
                f"({mitte[0]:.2f}, {mitte[1]:.2f}, {mitte[2]:.2f}), "
                f"Sohle {mitte[2] - d / 2:.3f} m, Richtung "
                f"({n[0]:.3f}, {n[1]:.3f}); als {halb * 2:.2f} m langer "
                "Stutzen eingebaut — Randbedingung noch zuordnen")
            continue

        if c["kind"] == "raster":
            roh = (imp_dir / f"{c['id']}.grid").read_bytes()
            name = re.sub(r"[^A-Za-z0-9_.-]", "_", c["name"])[:40]
            ziel = case_dir / f"{name}.asc"
            ziel.write_bytes(roh)
            if role == "gelaende":
                from .casespec import Terrain, TerrainBase
                res = spec.terrain.base.resolution if spec.terrain else 0.5
                ops = spec.terrain.operations if spec.terrain else []
                mat = spec.terrain.material if spec.terrain else "erde"
                spec.terrain = Terrain(
                    base=TerrainBase(source=ziel.name, resolution=res),
                    operations=ops, material=mat)
                report.append(f"Gelände aus Raster „{ziel.name}“ übernommen "
                              f"({c['stats'].get('format')})")
            else:
                report.append(
                    f"Zusatzraster „{ziel.name}“ liegt jetzt im Fall — in "
                    "einer Operation „Bereich ersetzen“ auswählbar")
            continue

        if role in ("gelaende", "gelaende_koerper"):
            from .solids import oberseite

            m = load_mesh(c["id"])
            res = spec.terrain.base.resolution if spec.terrain else 1.0
            asc = case_dir / f"gelaende_{import_id}.asc"
            koerper_name = None
            if role == "gelaende_koerper":
                # Volumenkörper: er selbst geht an den Vernetzer, das
                # Höhenraster wird aus seiner OBERSEITE abgeleitet (Boden
                # und senkrechte Wände liegen im Grundriss darüber und
                # machten die Vermaschung sonst unbrauchbar).
                if not m.is_watertight:
                    m.fill_holes()
                    m.fix_normals()
                koerper_name = f"gelaendekoerper_{import_id}.stl"
                m.export(case_dir / koerper_name)
                info = rasterize_tin_to_asc(oberseite(m), asc, res)
            else:
                info = rasterize_tin_to_asc(m, asc, res)
                m.export(case_dir / f"gelaende_{import_id}_tin.stl")
            from .casespec import Terrain, TerrainBase
            ops = spec.terrain.operations if spec.terrain else []
            mat = spec.terrain.material if spec.terrain else "erde"
            spec.terrain = Terrain(
                base=TerrainBase(source=asc.name, resolution=res,
                                 koerper=koerper_name),
                operations=ops, material=mat)
            if koerper_name:
                report.append(
                    f"Geländekörper „{c['name']}“ übernommen: "
                    f"{len(m.faces)} Dreiecke, "
                    f"{'geschlossen' if m.is_watertight else 'NICHT geschlossen'}"
                    f", Volumen {abs(m.volume):.1f} m³. Der Vernetzer bekommt "
                    "diesen Körper; das Höhenraster daneben stammt aus seiner "
                    "Oberseite und trägt Prüfung, Fensterlage und Anzeige.")
            terrain_bbox = m.bounds
            if gelaende_gesetzt:
                report.append("ACHTUNG: mehrere Layer als Gelände gewählt — "
                              f"„{c['name']}“ ersetzt das vorherige. Für zwei "
                              "Zustände (Bestand/Planung) zwei Fälle anlegen.")
            gelaende_gesetzt = True
            senk = info.get("senkrecht_verworfen") or 0
            report.append(f"Gelände „{c['name']}“: {c['stats']['n_triangles']} "
                          f"Dreiecke auf {info['nx']}×{info['ny']} Raster "
                          f"(Abdeckung {info['coverage']:.0%})"
                          + (f"; {senk} senkrechte Dreiecke übersprungen — "
                             "ein Höhenraster kann keine senkrechte Wand "
                             "abbilden" if senk else ""))

        elif role in solid_roles:
            base = re.sub(r"[^a-z0-9_]", "_", (d.get("patch")
                                               or c["name"]).lower()) or "import"
            sid = base
            n = 2
            while sid in existing:
                sid = f"{base}_{n}"
                n += 1
            existing.add(sid)
            m = load_mesh(c["id"])
            stl_name = f"import_{sid}.stl"
            m.export(case_dir / stl_name)
            spec.structures.append(StructImported(
                id=sid, type="imported", patch=sid, source=stl_name,
                role=role, material=d.get("material")))
            report.append(f"{role} „{sid}“: {c['stats']['n_triangles']} "
                          f"Dreiecke{'' if c['stats']['watertight'] else ' (NICHT wasserdicht!)'}")

        elif role == "querschnitt":
            arr = linie_laden(c)
            sid = re.sub(r"[^a-z0-9_]", "_", c["name"].lower())
            sid = re.sub(r"_linie(_\d+)?$", r"\1", sid) or sid
            if not sid.startswith("qs"):        # Layer heißt oft schon QS_…
                sid = f"qs_{sid}"
            # zweimal dieselbe Datei importiert -> sonst zwei Querschnitte
            # mit identischer Kennung, die sich gegenseitig verdecken
            sid = _kanten_id(sid, "qs", vorhandene_qs)
            spec.evaluation.sections.append(Section(
                id=sid[:40],
                polyline=[[round(float(p[0]), 2), round(float(p[1]), 2)]
                          for p in arr]))
            report.append(f"Querschnitt „{sid}“ aus Trasse übernommen")

        elif role == "bruchkante":
            if spec.terrain is None:
                report.append(f"„{c['name']}“ übersprungen: es gibt noch kein "
                              "Gelände, das die Kante verändern könnte")
                continue
            arr = linie_laden(c)
            sid = _kanten_id(c["name"], "kante", vorhandene_ops)
            spec.terrain.operations.append(OpBruchkante(
                id=sid, type="bruchkante", polyline=_p3(arr), breite=1.0))
            report.append(f"Bruchkante „{sid}“: {len(arr)} Stützpunkte, "
                          f"{arr[:, 2].min():.2f} … {arr[:, 2].max():.2f} m")

        elif role in ("boeschung_ok", "boeschung_uk"):
            seite = "ok" if role == "boeschung_ok" else "uk"
            k = _paar_schluessel(c["name"])
            # belegte Seite -> eigener Schlüssel, sonst ginge eine Kante
            # stillschweigend verloren
            n = 2
            while kanten.get(k, {}).get(seite) is not None:
                k = f"{_paar_schluessel(c['name'])}#{n}"
                n += 1
            kanten.setdefault(k, {})[seite] = c

    # ---- Böschungen aus Ober-/Unterkante --------------------------------
    if kanten and spec.terrain is None:
        report.append("Böschungskanten übersprungen: es gibt noch kein "
                      "Gelände, das sie verändern könnten")
        kanten = {}
    for schluessel, paar in kanten.items():
        if "ok" in paar and "uk" in paar:
            ok = linie_laden(paar["ok"])
            uk = linie_laden(paar["uk"])
            sid = _kanten_id(schluessel or "boeschung", "boeschung",
                             vorhandene_ops)
            spec.terrain.operations.append(OpBoeschung(
                id=sid, type="boeschung",
                oberkante=_p3(ok), unterkante=_p3(uk)))
            neigung = _mittlere_neigung(ok, uk)
            report.append(
                f"Böschung „{sid}“ aus Ober- und Unterkante: "
                f"{ok[:, 2].mean():.2f} m auf {uk[:, 2].mean():.2f} m, "
                f"mittlere Neigung 1:{neigung:.1f}")
        else:
            # nur eine Kante da -> als Bruchkante übernehmen, damit die
            # Höhe nicht verloren geht
            c = paar.get("ok") or paar.get("uk")
            arr = linie_laden(c)
            sid = _kanten_id(c["name"], "kante", vorhandene_ops)
            spec.terrain.operations.append(OpBruchkante(
                id=sid, type="bruchkante", polyline=_p3(arr), breite=1.0))
            report.append(f"„{c['name']}“ hat keine Gegenkante — als "
                          f"Bruchkante „{sid}“ übernommen")

    if rotation_deg:
        spec.meta.crs_rotation_deg = float(rotation_deg)
        report.append(f"Modell um {rotation_deg:g}° gedreht — das "
                      "Rechengebiet liegt damit eng um das Bauwerk; der "
                      "Winkel ist im Fall gespeichert")
    if offset:
        spec.meta.crs_offset = [float(offset[0]), float(offset[1])]
        report.append(f"Koordinaten um ({offset[0]:g}, {offset[1]:g}) "
                      "verschoben — Ursprung im Fall gespeichert")

    if derive_domain and terrain_bbox is not None:
        from .casespec import Domain
        lo, hi = terrain_bbox
        dz = max(hi[2] - lo[2], 1.0)
        spec.domain = Domain(
            extent=(round(float(lo[0]), 2), round(float(lo[1]), 2),
                    round(float(hi[0]), 2), round(float(hi[1]), 2)),
            z_min=round(float(lo[2] - 0.5), 2),
            z_max=round(float(hi[2] + max(2.0, 0.5 * dz)), 2))
        report.append(f"Domäne aus Gelände abgeleitet: {spec.domain.extent}, "
                      f"z {spec.domain.z_min}…{spec.domain.z_max}")
        # Der Anfangswasserspiegel stammt aus der alten Höhenlage und läge
        # sonst außerhalb des neuen Gebiets (Prüfung würde sofort meckern) —
        # auf trockenen Start setzen und das offen sagen.
        lvl = spec.solver.initial_level
        if lvl is None or not (spec.domain.z_min < lvl < spec.domain.z_max):
            # tiefster Geländepunkt = trockener Start und sicher INNERHALB
            # des Gebiets (validate verlangt echte Ungleichungen)
            neu = round(float(lo[2]), 2)
            spec.solver.initial_level = neu
            report.append(f"Anfangswasserspiegel auf {neu} m gesetzt "
                          "(tiefster Geländepunkt, trockener Start) — der "
                          f"bisherige Wert ({lvl}) lag außerhalb des neuen "
                          "Gebiets")

    return {"report": report}
