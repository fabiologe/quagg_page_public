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

# Umlaute sind im deutschsprachigen Workflow der Normalfall
# („Gelände_Bestand.dxf") — die Liste bleibt eine Positivliste ohne
# Pfadtrenner, führende Punkte oder Steuerzeichen.
SAFE_FILENAME = re.compile(r"^[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9. _()+-]*$")

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
    # Die Schwellen unten sind METER-Maße. Millimeter-Dateien (BricsCAD-
    # Normalfall) lägen ohne Umrechnung um den Faktor 10³ daneben — ein
    # mm-Gelände zerfiele in Ein-Dreieck-Kandidaten, kein Körper träfe
    # seine Klasse. Derselbe Verdacht wie beim globalen unit_suspect.
    if max(sx, sy) > UNIT_SUSPECT_SPAN:
        sx, sy, dz = sx / 1000.0, sy / 1000.0, dz / 1000.0
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


# Import-Rollen, die zu einer VERMESSUNGSKANTE werden, und die Rolle, die
# die Kante im Fall trägt. Was daraus für das Gelände folgt, leitet
# core/kanten.py aus Rolle und Lage ab.
KANTEN_ROLLEN = {
    "bruchkante": "frei",
    "boeschung_ok": "boeschung_ok",
    "boeschung_uk": "boeschung_uk",
    "sohle": "sohle",
    "beckenrand": "beckenrand",
    "krone": "krone",
    # Diese beiden ergeben ein BAUTEIL statt einer Geländeoperation
    "mauer": "mauer",
    "wehrkrone": "wehrkrone",
}
ROLLEN_TEXT = {
    "bruchkante": "Bruchkante", "boeschung_ok": "Böschungsoberkante",
    "boeschung_uk": "Böschungsunterkante", "sohle": "Sohle",
    "beckenrand": "Beckenrand", "krone": "Krone",
    "mauer": "Mauerkrone", "wehrkrone": "Überfallkante",
}
# Rollen, aus denen ein GELÄNDE entstehen kann — die Bauteilrollen nicht:
# aus einer Mauerkrone allein lässt sich keine Höhenfläche bilden.
GELAENDE_KANTEN = tuple(r for r in KANTEN_ROLLEN
                        if r not in ("mauer", "wehrkrone"))


# Layernamen aus der Vermessung deuten: BOK/BÖOK/OK -> Oberkante usw.
def _linien_rolle(layer: str) -> str:
    n = layer.lower()
    if any(t in n for t in ("bok", "bö_ok", "boe_ok", "oberkante", "_ok")):
        return "boeschung_ok"
    if any(t in n for t in ("buk", "bö_uk", "boe_uk", "unterkante", "_uk")):
        return "boeschung_uk"
    # Bauteile vor Gelände: „Wehrkrone" ist ein Wehr, keine Dammkrone
    if any(t in n for t in ("wehr", "ueberfall", "überfall", "streich")):
        return "wehrkrone"
    if any(t in n for t in ("mauer", "wand")):
        return "mauer"
    if any(t in n for t in ("beckenrand", "beckenkante")):
        return "beckenrand"
    if any(t in n for t in ("krone", "damm")):
        return "krone"
    if any(t in n for t in ("sohle", "gerinne", "graben")):
        return "sohle"
    if any(t in n for t in ("kante", "bruch")):
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

# Lesbar, aber ohne verwertbare 3D-Geometrie: Beschriftung und
# 2D-Darstellung. Wird beim Import GEZÄHLT und gemeldet — die Regel des
# Importers lautet: nichts verschwindet ohne Zahl.
_NUR_ANZEIGE = {"TEXT", "MTEXT", "DIMENSION", "LEADER", "HATCH", "SOLID",
                "POINT", "ATTDEF", "VIEWPORT"}


def _segmente_verketten(linien: list) -> list:
    """
    2-Punkt-Segmente (LINEs) zu Zügen verbinden: Endpunkt auf Endpunkt
    (mm-genau). Eine als 200 Einzellinien exportierte Böschungskante wird
    so EIN Kandidat statt 200. Echte Polylinien bleiben unangetastet.
    """
    segs = [l for l in linien if len(l) == 2]
    zuege = [l for l in linien if len(l) != 2]
    if len(segs) <= 1:
        return zuege + segs

    def key(p):
        return (round(float(p[0]), 3), round(float(p[1]), 3),
                round(float(p[2]), 3))

    adj: dict[tuple, list] = {}
    for i, s in enumerate(segs):
        adj.setdefault(key(s[0]), []).append((i, 0))
        adj.setdefault(key(s[1]), []).append((i, 1))
    benutzt = [False] * len(segs)
    ketten: list = []
    # offene Enden zuerst (Grad != 2), damit Züge nicht mittendrin starten;
    # danach der Rest — das sind geschlossene Ringe
    starts = [k for k, v in adj.items() if len(v) != 2] + list(adj)
    for start in starts:
        for i, ende in adj.get(start, []):
            if benutzt[i]:
                continue
            benutzt[i] = True
            kette = [segs[i][ende], segs[i][1 - ende]]
            while True:
                naechste = [(j, e2) for j, e2 in adj.get(key(kette[-1]), [])
                            if not benutzt[j]]
                if len(naechste) != 1:
                    break                     # Ende oder Verzweigung
                j, e2 = naechste[0]
                benutzt[j] = True
                kette.append(segs[j][1 - e2])
            ketten.append(kette)
    return zuege + ketten


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
    uebersprungen: dict[str, int] = {}
    kreise_per_layer: dict[str, list] = {}
    tri_per_layer: dict[str, MeshVertexMerger] = {}
    lines_per_layer: dict[str, list[list[list[float]]]] = {}
    acis_layers: dict[str, int] = {}

    # Blockreferenzen werden AUFGELÖST statt übersprungen — ein Bauwerk, das
    # als Block eingefügt ist, wäre sonst komplett unsichtbar und der Layer
    # sähe leer aus. Der Stapel erlaubt Blöcke in Blöcken.
    stapel = list(msp)
    while stapel:
        e = stapel.pop(0)
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
        if t == "INSERT":
            try:
                subs = list(e.virtual_entities())
            except Exception:               # noqa: BLE001
                unbekannt["INSERT"] = unbekannt.get("INSERT", 0) + 1
                continue
            for s in subs:
                # Layer „0" IM Block bedeutet: erbt den Layer der Referenz
                try:
                    if (s.dxf.get("layer", "0") or "0") == "0":
                        s.dxf.layer = layer
                except Exception:           # noqa: BLE001
                    pass
            stapel = subs + stapel
            continue
        if t in _NUR_ANZEIGE:
            # lesbar, aber ohne verwertbare Geometrie (Beschriftung,
            # 2D-Darstellung) — gezählt, damit nichts stillschweigend fehlt
            uebersprungen[t] = uebersprungen.get(t, 0) + 1
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
        elif t == "LINE":
            # Einzelne LINEs sind oft segmentierte Bruch-/Böschungskanten —
            # sie werden gesammelt und unten zu Zügen verkettet.
            try:
                s, z = e.dxf.start, e.dxf.end
                lines_per_layer.setdefault(layer, []).append(
                    [[float(s.x), float(s.y), float(s.z)],
                     [float(z.x), float(z.y), float(z.z)]])
            except Exception:               # noqa: BLE001
                unbekannt["LINE"] = unbekannt.get("LINE", 0) + 1
        elif t in ("ARC", "SPLINE", "ELLIPSE"):
            # Bögen/Splines als verdichtete Polylinie (Pfeilhöhe 2 cm) —
            # 3D-Splines sind der Normalfall für vermessene Kanten
            try:
                pts = [[float(p[0]), float(p[1]), float(p[2])]
                       for p in e.flattening(0.02)]
            except Exception:               # noqa: BLE001
                unbekannt[t] = unbekannt.get(t, 0) + 1
                continue
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
        lines = _segmente_verketten(lines)
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
    if uebersprungen:
        liste = ", ".join(f"{n}× {t}"
                          for t, n in sorted(uebersprungen.items()))
        cands.append({
            "name": "Beschriftung/2D-Darstellung", "kind": "hinweis",
            "role_guess": "ignorieren",
            "stats": {"anzahl": sum(uebersprungen.values())},
            "hint": f"Übersprungen, weil ohne 3D-Geometrie: {liste}. "
                    "Das ist normal für Pläne mit Texten, Bemaßung und "
                    "Schraffuren — hier nur der Vollständigkeit halber.",
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


def _raster_transformieren(roh: bytes, unit: float,
                           off: np.ndarray) -> tuple[bytes, np.ndarray | None]:
    """
    Einheitenfaktor und Offset auf ein fertiges Höhenraster anwenden —
    dieselbe Konvention wie bei Meshes und Linien: erst skalieren, dann
    verschieben (der Offset ist in der Zieleinheit angegeben). NODATA-Werte
    bleiben unangetastet. Liefert die (ggf. unveränderten) Bytes und die
    Bounding-Box [[x0,y0,z0],[x1,y1,z1]], damit „Gebiet ableiten" auch beim
    Rasterimport funktioniert.
    """
    import io as _io

    text = roh.decode("utf-8", errors="replace")
    zeilen = text.splitlines()
    kopf: dict[str, float] = {}
    kopf_ende = 0
    for i, zeile in enumerate(zeilen[:6]):
        teile = zeile.split()
        if len(teile) == 2 and teile[0].lower() in (
                "ncols", "nrows", "cellsize", "xllcorner", "yllcorner",
                "nodata_value"):
            kopf[teile[0].lower()] = float(teile[1])
            kopf_ende = i + 1

    ox = float(off[0]) if off is not None else 0.0
    oy = float(off[1]) if off is not None else 0.0
    unveraendert = unit == 1.0 and ox == 0.0 and oy == 0.0

    if "ncols" in kopf:                                   # ESRI-ASCII
        nodata = kopf.get("nodata_value", -9999.0)
        werte = np.atleast_2d(np.loadtxt(
            _io.StringIO("\n".join(zeilen[kopf_ende:]))))
        gueltig = werte[werte != nodata]
        x0 = kopf.get("xllcorner", 0.0) * unit - ox
        y0 = kopf.get("yllcorner", 0.0) * unit - oy
        zelle = kopf.get("cellsize", 1.0) * unit
        nx, ny = int(kopf.get("ncols", 0)), int(kopf.get("nrows", 0))
        bbox = None
        if gueltig.size:
            zmin, zmax = float(gueltig.min()) * unit, float(gueltig.max()) * unit
            bbox = np.array([[x0, y0, zmin],
                             [x0 + nx * zelle, y0 + ny * zelle, zmax]])
        if unveraendert:
            return roh, bbox
        werte = np.where(werte != nodata, werte * unit, nodata)
        buf = _io.StringIO()
        buf.write(f"ncols {nx}\nnrows {ny}\n"
                  f"xllcorner {x0:.3f}\nyllcorner {y0:.3f}\n"
                  f"cellsize {zelle:.6g}\nNODATA_value {nodata:g}\n")
        np.savetxt(buf, werte, fmt="%.3f")
        return buf.getvalue().encode("utf-8"), bbox

    # XYZ: eine Zeile je Punkt, mindestens x y z
    arr = np.atleast_2d(np.loadtxt(_io.StringIO(text)))
    if arr.shape[1] < 3:
        raise ValueError("XYZ-Raster hat weniger als drei Spalten — "
                         "erwartet wird „x y z“ je Zeile.")
    pts = arr[:, :3] * unit
    pts[:, 0] -= ox
    pts[:, 1] -= oy
    bbox = np.array([pts.min(axis=0), pts.max(axis=0)])
    if unveraendert:
        return roh, bbox
    buf = _io.StringIO()
    np.savetxt(buf, pts, fmt="%.3f")
    return buf.getvalue().encode("utf-8"), bbox


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

def _raster_aus_dreiecken(v: np.ndarray, f: np.ndarray,
                          xx: np.ndarray, yy: np.ndarray) -> np.ndarray:
    """
    Gegebene Dreiecke baryzentrisch auf das Raster legen — und sonst nichts.

    Der Punkt ist, was hier NICHT passiert: es wird nicht neu vermascht. Die
    Dreiecke sind die des TIN, also genau das, was gezeichnet wurde. Wo kein
    Dreieck liegt, bleibt NaN — dort ist nicht gemessen, und das soll man
    dem Raster ansehen. (Der vorherige Weg über matplotlib lehnte manches
    gültige TIN mit „Triangulation is invalid" ab und wich dann auf eine
    frische Delaunay über die Punktwolke aus. Die füllt die konvexe Hülle
    lückenlos und spannt dabei quer über ungemessenes Gebiet — beim Becken
    Dreiecke über die halbe Grube.)
    """
    z = np.full(xx.shape, np.nan)
    if not len(f):
        return z
    ny, nx = xx.shape
    x0, y0 = float(xx[0, 0]), float(yy[0, 0])
    dx = float(xx[0, 1] - xx[0, 0]) if nx > 1 else 1.0
    dy = float(yy[1, 0] - yy[0, 0]) if ny > 1 else 1.0
    for ecken in v[f]:
        (ax, ay), (bx, by), (cx, cy) = ecken[0, :2], ecken[1, :2], ecken[2, :2]
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-12:
            continue                       # steht senkrecht, trägt keine Höhe
        i0 = max(int(np.floor((ecken[:, 0].min() - x0) / dx)), 0)
        i1 = min(int(np.ceil((ecken[:, 0].max() - x0) / dx)) + 1, nx)
        j0 = max(int(np.floor((ecken[:, 1].min() - y0) / dy)), 0)
        j1 = min(int(np.ceil((ecken[:, 1].max() - y0) / dy)) + 1, ny)
        if i1 <= i0 or j1 <= j0:
            continue
        X, Y = xx[j0:j1, i0:i1], yy[j0:j1, i0:i1]
        l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / det
        l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / det
        l3 = 1.0 - l1 - l2
        drin = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not drin.any():
            continue
        ziel = z[j0:j1, i0:i1]
        neu = drin & np.isnan(ziel)
        ziel[neu] = (l1 * ecken[0, 2] + l2 * ecken[1, 2]
                     + l3 * ecken[2, 2])[neu]
    return z


def rasterize_tin_to_asc(mesh: trimesh.Trimesh, out_path: Path,
                         resolution: float) -> dict:
    """
    TIN baryzentrisch auf ein Raster legen. Zellen außerhalb des TIN
    bleiben NODATA und werden danach als „nicht gemessen" gefüllt.
    """

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

    # Das TIN selbst rastern — keine zweite Vermaschung, keine erfundenen
    # Stützpunkte. Die Dreiecke sind die der Zeichnung.
    z = _raster_aus_dreiecken(v, f, xx, yy)

    # Was der Hüllquader mehr umfasst als das TIN (Ecken, Ränder), ist NICHT
    # gemessen. Blieben diese Zellen NODATA, füllte der Leser sie mit dem
    # MITTELWERT aller Höhen — mitten im Becken entstand daraus ein Plateau
    # von über einem Meter. Gefüllt wird deshalb WAAGERECHT auf der höchsten
    # gemessenen Höhe: eine Ebene erfindet keine Form, und dass sie oben
    # liegt, ist im Einstaunachweis die sichere Seite — Wasser verlässt das
    # Modell nicht über eine Senke, die niemand vermessen hat.
    aus_tin = float(np.mean(~np.isnan(z)))
    luecke = np.isnan(z)
    if luecke.any() and not luecke.all():
        z = np.asarray(z, dtype=float).copy()
        z[luecke] = float(np.nanmax(z))

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


def _asc_schreiben(z: np.ndarray, out_path: Path, x0: float, y0: float,
                   resolution: float) -> None:
    nodata = -9999.0
    grid = np.where(np.isnan(z), nodata, z)
    zeilen = [f"ncols {z.shape[1]}", f"nrows {z.shape[0]}",
              f"xllcorner {x0 - resolution / 2:.3f}",
              f"yllcorner {y0 - resolution / 2:.3f}",
              f"cellsize {resolution:g}", f"nodata_value {nodata:g}"]
    for row in grid[::-1]:                     # ESRI: von Nord nach Süd
        zeilen.append(" ".join(f"{v:.3f}" for v in row))
    out_path.write_text("\n".join(zeilen))


def tin_aus_ringen(ringe: list, out_path: Path, resolution: float) -> dict:
    """
    Gelände aus GESCHLOSSENEN Vermessungskanten — mit Zwangskanten.

    `ringe`: [(kennung, (n,3)-Array), …], jeder Ring geschlossen.

    Der Unterschied zur gewöhnlichen Delaunay (`tin_from_lines`): dort wird
    über die Punktwolke vermascht und hinterher weggeschnitten, was zu weit
    greift. Das ist eine Näherung — Dreiecke schneiden Ecken ab und springen
    über das Becken, weil die Vermaschung die Ringe gar nicht kennt.

    Hier sind die Ringe die GRENZE. Liegt die Sohle im Beckenrand, entstehen
    zwei getrennte Gebiete:

        innerhalb der Sohle                  -> vermascht (die Sohlfläche)
        zwischen Sohle und Beckenrand        -> vermascht (die Böschung)
        quer durch das Becken, den Ring
        ignorierend                          -> gibt es nicht

    Der Ring wird dazu als Polygon MIT LOCH aufgespannt; das Loch ist der
    nächstinnere Ring. GEOS triangelt so nur den Zwischenraum und benutzt
    dabei ausschließlich die vorhandenen Stützpunkte — es wird kein einziger
    Punkt hinzuerfunden.
    """
    import shapely

    gueltig = [(kid, np.asarray(p, dtype=float)) for kid, p in ringe
               if len(np.asarray(p)) >= 4]
    polys: dict[str, shapely.Polygon] = {}
    for kid, p in gueltig:
        poly = shapely.Polygon(p[:, :2])
        if not poly.is_valid:
            poly = poly.buffer(0)
        if isinstance(poly, shapely.Polygon) and poly.area > 1e-9:
            polys[kid] = poly
    if not polys:
        raise ValueError("Keine geschlossene Kante, aus der eine Fläche "
                         "entstehen könnte")

    # Höhe je Stützpunkt — die Ringe sind die einzige Höhenquelle
    hoehen: dict[tuple, float] = {}
    for _, p in gueltig:
        for x, y, z in p:
            hoehen[(round(float(x), 6), round(float(y), 6))] = float(z)

    # Wer liegt in wem? Maßgeblich ist der KLEINSTE umschließende Ring —
    # bei Rand > Berme > Sohle gehört die Sohle zur Berme, nicht zum Rand.
    def eltern(kid: str) -> str | None:
        innen = polys[kid]
        kand = [(polys[a].area, a) for a in polys
                if a != kid and polys[a].area > innen.area
                and polys[a].contains(innen.representative_point())]
        return min(kand)[1] if kand else None

    kinder: dict[str, list[str]] = {k: [] for k in polys}
    for kid in polys:
        e = eltern(kid)
        if e is not None:
            kinder[e].append(kid)

    dreiecke: list[np.ndarray] = []
    for kid, poly in polys.items():
        loecher = [np.asarray(polys[c].exterior.coords) for c in kinder[kid]]
        try:
            flaeche = shapely.Polygon(poly.exterior.coords, holes=loecher)
            if not flaeche.is_valid:
                flaeche = flaeche.buffer(0)
            teile = shapely.constrained_delaunay_triangles(flaeche)
        except Exception:
            continue
        for t in getattr(teile, "geoms", []):
            ecken = np.asarray(t.exterior.coords)[:3]
            z = [hoehen.get((round(float(x), 6), round(float(y), 6)))
                 for x, y in ecken]
            if any(v is None for v in z):
                continue          # Punkt ohne Vermessungshöhe: nicht raten
            dreiecke.append(np.column_stack([ecken, z]))

    if not dreiecke:
        raise ValueError("Aus den geschlossenen Kanten ließ sich keine "
                         "Fläche vermaschen")

    alle = np.vstack([np.asarray(p, dtype=float) for _, p in gueltig])
    x0, y0 = alle[:, 0].min(), alle[:, 1].min()
    x1, y1 = alle[:, 0].max(), alle[:, 1].max()
    nx = max(2, int(np.ceil((x1 - x0) / resolution)) + 1)
    ny = max(2, int(np.ceil((y1 - y0) / resolution)) + 1)
    xx, yy = np.meshgrid(x0 + np.arange(nx) * resolution,
                         y0 + np.arange(ny) * resolution)

    ecken = np.vstack(dreiecke)
    f = np.arange(len(ecken)).reshape(-1, 3)
    z = _raster_aus_dreiecken(ecken, f, xx, yy)
    abdeckung = float(np.mean(~np.isnan(z)))
    luecke = np.isnan(z)
    if luecke.any() and not luecke.all():
        # Außerhalb des äußersten Rings ist nichts vermessen. Waagerecht auf
        # der höchsten gemessenen Höhe: eine Ebene erfindet keine Form, und
        # oben liegt sie auf der sicheren Seite — Wasser verlässt das Modell
        # nicht über eine Senke, die niemand aufgenommen hat.
        z = z.copy()
        z[luecke] = float(np.nanmax(z))

    _asc_schreiben(z, out_path, float(x0), float(y0), resolution)
    return {"nx": nx, "ny": ny,
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "n_dreiecke": len(dreiecke), "n_punkte": len(hoehen),
            "n_ringe": len(polys),
            "coverage": round(abdeckung, 3)}


def tin_from_lines(linien: list, out_path: Path, resolution: float,
                   max_kante: float | None = None) -> dict:
    """
    Geländeraster AUS 3D-Linien: Bruch-, Böschungs- und Sohlkanten sind in
    Vermessungsdaten oft das Einzige, was geliefert wird — ein fertiges TIN
    gibt es nicht. Die Punkte werden vermascht und baryzentrisch
    interpoliert. Dreiecke mit sehr langer Kante fallen heraus (dort würde
    Gelände erfunden); die verbleibenden Lücken werden STUFENFREI
    geschlossen (Fläche geringster Krümmung durch die bekannten Höhen).
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
        # Außerhalb der Dreiecksmaschen war bisher „nimm die Höhe des
        # NÄCHSTEN Stützpunkts". Das ergibt ein Voronoi-Feld: stückweise
        # konstant, mit einer Stufe an jeder Zellgrenze. Liegen Ober- und
        # Unterkante einer Böschung nebeneinander, stand dazwischen die
        # volle Höhendifferenz als senkrechte Wand — das waren die
        # „automatischen Höhensprünge" beim Import von Bruchkanten.
        # Jetzt wird die Lücke stufenfrei geschlossen: die Fläche mit der
        # geringsten Krümmung durch die bekannten Höhen.
        from .terrain import laplace_fuellen
        z = laplace_fuellen(z, ~luecke)

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
    from .casespec import (OpBoeschung, OpBruchkante, Section,
                          StructImported, Vermessungskante)

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
    # Ein fertiges Raster lässt sich nicht drehen, ohne es neu abzutasten —
    # das gehört nicht in den Import. Ehrlich ablehnen statt still ignorieren
    # (sonst liegen Raster und gedrehte Körper desselben Imports schief
    # zueinander und niemand merkt es).
    if rot and any(by_id.get(d.get("candidate"), {}).get("kind") == "raster"
                   and d.get("role") != "ignorieren" for d in decisions):
        raise ValueError(
            "Drehung beim Import ist für fertige Höhenraster (.asc/.xyz) "
            "nicht möglich — ein Raster müsste dafür neu abgetastet werden. "
            "Ohne Drehwinkel importieren und den Fall danach über „Modell "
            "drehen“ ausrichten, oder das Gelände als TIN/Kanten liefern.")

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
    vorhandene_kanten = {k.id for k in (spec.terrain.kanten
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

        # Geschlossene Kanten sind GRENZEN, keine bloßen Punktwolken. Liegt
        # eine Sohle in einem Beckenrand, gehört die Fläche dazwischen
        # vermascht und die quer durchs Becken NICHT — das entscheidet eine
        # gewöhnliche Delaunay nicht, sie kennt die Ringe gar nicht. Mit
        # Zwangskanten wird jeder Ring zur Grenze und der nächstinnere zum
        # Loch, und es entsteht kein einziger neuer Stützpunkt.
        ringe = [(re.sub(r"[^a-z0-9_]", "_", by_id[d["candidate"]]["name"].lower()),
                  li) for d, li in zip(ent, linien)
                 if len(li) >= 4
                 and abs(li[0][0] - li[-1][0]) < 1e-6
                 and abs(li[0][1] - li[-1][1]) < 1e-6]
        info, ueber_ringe = None, False
        if ringe:
            try:
                info = tin_aus_ringen(ringe, asc, res)
                ueber_ringe = True
            except Exception as e:
                report.append(f"Vermaschung über die geschlossenen Kanten "
                              f"nicht möglich ({e}) — gewöhnliche "
                              "Vermaschung verwendet.")
        if info is None:
            info = tin_from_lines(linien, asc, res)
        ops = spec.terrain.operations if spec.terrain else []
        # Die Vermessungskanten müssen den Neuaufbau überleben — sie sind
        # das, WAS gezeichnet wurde, nicht eine Folge der Geländebasis
        vk = spec.terrain.kanten if spec.terrain else []
        mat = spec.terrain.material if spec.terrain else "erde"
        spec.terrain = Terrain(base=TerrainBase(source=asc.name,
                                                resolution=res),
                               kanten=vk, operations=ops, material=mat)
        nonlocal terrain_bbox
        e = info["extent"]
        zs = np.concatenate([li[:, 2] for li in linien])
        terrain_bbox = np.array([[e[0], e[1], float(zs.min())],
                                 [e[2], e[3], float(zs.max())]])
        if ueber_ringe:
            report.append(
                f"Gelände aus {info['n_ringe']} geschlossenen Kanten mit "
                f"ZWANGSKANTEN vermascht: {info['n_dreiecke']} Dreiecke aus "
                f"{info['n_punkte']} Stützpunkten auf "
                f"{info['nx']}×{info['ny']} Raster, Höhen {zs.min():.2f} … "
                f"{zs.max():.2f} m, Abdeckung {info['coverage']:.0%}. Jeder "
                "Ring ist eine Grenze und der nächstinnere sein Loch — es "
                "wurde kein Stützpunkt hinzuerfunden, alle liegen auf den "
                "Kanten."
                + (f" Die restlichen {1 - info['coverage']:.0%} liegen "
                   "außerhalb des äußersten Rings und werden waagerecht auf "
                   "der höchsten gemessenen Höhe ergänzt."
                   if info["coverage"] < 0.999 else ""))
        else:
            report.append(
                f"Gelände aus {len(linien)} Kanten vermascht: "
                f"{info['n_punkte']} Stützpunkte auf {info['nx']}×{info['ny']} "
                f"Raster, Höhen {zs.min():.2f} … {zs.max():.2f} m. "
                f"{info['coverage']:.0%} der Fläche liegen zwischen den Kanten "
                f"(Dreiecke bis {info['max_kante']:g} m Kantenlänge). Die "
                f"übrigen {1 - info['coverage']:.0%} werden stufenfrei "
                "ergänzt — dort ist nichts gemessen, das Gelände dazwischen "
                "ist die glatteste Fläche durch die bekannten Höhen und "
                "keine Aussage der Vermessung.")

    # ---- Gelände AUS den Linien -----------------------------------------
    # Vermessungsdaten kommen oft ohne TIN: nur Bruch-, Böschungs- und
    # Sohlkanten. Dann bilden genau diese Linien das Gelände. Ohne
    # Basisgelände ist das der einzig sinnvolle Weg — eine Kante allein
    # hätte sonst nichts, was sie verändern könnte.
    hat_gelaende_mesh = any(d.get("role") in ("gelaende", "gelaende_koerper")
                            for d in decisions)
    linien_ent = [d for d in decisions
                  if by_id.get(d["candidate"], {}).get("kind") == "polyline"
                  and d.get("role") in GELAENDE_KANTEN]
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
            # Was der Layer über den Zweck sagt, bleibt am Objekt: `role`
            # trägt hier bereits die Wahl aus dem Dialog, die die
            # Namensvermutung `role_guess` überschreibt.
            rolle = {"zulaufrohr": "zulauf", "ablaufrohr": "ablauf"}.get(role)
            spec.structures.append(StructCulvert(
                id=sid, type="culvert", patch=sid,
                axis=[tuple(np.round(mitte - n * halb, 3)),
                      tuple(np.round(mitte + n * halb, 3))],
                profile=CulvertProfile(kind="circular", diameter=round(d, 3)),
                rolle=rolle, material=None))
            report.append(
                f"Rohrmündung „{sid}“: DN{d * 1000:.0f}, Achse "
                f"({mitte[0]:.2f}, {mitte[1]:.2f}, {mitte[2]:.2f}), "
                f"Sohle {mitte[2] - d / 2:.3f} m, Richtung "
                f"({n[0]:.3f}, {n[1]:.3f}); als {halb * 2:.2f} m langer "
                "Stutzen eingebaut"
                + (f", laut Layer ein {rolle.capitalize()} — "
                   "„⚯ Anschlüsse herstellen“ koppelt ihn an den passenden "
                   "Rand" if rolle else " — Randbedingung noch zuordnen"))
            continue

        if c["kind"] == "raster":
            roh = (imp_dir / f"{c['id']}.grid").read_bytes()
            name = re.sub(r"[^A-Za-z0-9_.-]", "_", c["name"])[:40]
            ziel = case_dir / f"{name}.asc"
            # Einheit/Offset gelten für ALLE Kandidaten eines Imports gleich —
            # sonst liegen Raster und Bauwerkskörper zueinander verschoben.
            roh, raster_bbox = _raster_transformieren(roh, unit_factor, off)
            ziel.write_bytes(roh)
            umgerechnet = (f"; Einheit ×{unit_factor:g}, Offset "
                           f"({off[0]:g}, {off[1]:g}) angewandt"
                           if unit_factor != 1.0 or off[0] or off[1] else "")
            if role == "gelaende":
                from .casespec import Terrain, TerrainBase
                res = spec.terrain.base.resolution if spec.terrain else 0.5
                ops = spec.terrain.operations if spec.terrain else []
                mat = spec.terrain.material if spec.terrain else "erde"
                spec.terrain = Terrain(
                    base=TerrainBase(source=ziel.name, resolution=res),
                    kanten=(spec.terrain.kanten if spec.terrain else []),
                    operations=ops, material=mat)
                report.append(f"Gelände aus Raster „{ziel.name}“ übernommen "
                              f"({c['stats'].get('format')}){umgerechnet}")
                if raster_bbox is not None:
                    terrain_bbox = raster_bbox
                if gelaende_gesetzt:
                    report.append(
                        "ACHTUNG: mehrere Layer als Gelände gewählt — "
                        f"„{c['name']}“ ersetzt das vorherige. Für zwei "
                        "Zustände (Bestand/Planung) zwei Fälle anlegen.")
                gelaende_gesetzt = True
            else:
                report.append(
                    f"Zusatzraster „{ziel.name}“ liegt jetzt im Fall — in "
                    f"einer Operation „Bereich ersetzen“ auswählbar"
                    f"{umgerechnet}")
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
                kanten=(spec.terrain.kanten if spec.terrain else []),
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
                             "abbilden" if senk else "")
                          + f"; die übrigen {1 - info['coverage']:.0%} "
                          "liegen außerhalb des TIN und werden waagerecht "
                          "auf der höchsten gemessenen Höhe ergänzt — dort "
                          "ist nichts vermessen")
            if senk > 0.3 * (c["stats"]["n_triangles"] or 1):
                report.append(
                    f"ACHTUNG: {senk} von {c['stats']['n_triangles']} "
                    f"Dreiecken stehen senkrecht — das sind Beckenwände "
                    "oder Mauern. Ein Höhenraster hat je Punkt genau eine "
                    "Höhe und kann sie nicht abbilden; zwischen Ober- und "
                    "Unterkante rechnet es eine Schräge. Für senkrechte "
                    "Wände denselben Layer als „Gelände als Volumenkörper“ "
                    "einlesen oder die Kanten als Mauerkrone/Beckenrand "
                    "zuordnen.")

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
            # Vorbelegung aus der Rolle: ohne Material rechnet der Solver
            # eine hydraulisch GLATTE Wand — für ein Betonbauteil die
            # falsche Seite der Unsicherheit. „bauwerk" bleibt offen, da
            # sagt die Rolle nichts über die Oberfläche.
            werkstoff = d.get("material") or (
                "beton" if role in ("wand", "pfeiler", "wehr", "becken")
                else None)
            spec.structures.append(StructImported(
                id=sid, type="imported", patch=sid, source=stl_name,
                role=role, material=werkstoff))
            report.append(f"{role} „{sid}“: {c['stats']['n_triangles']} "
                          f"Dreiecke{'' if c['stats']['watertight'] else ' (NICHT wasserdicht!)'}"
                          + (f"; Material {werkstoff} vorbelegt"
                             if werkstoff and not d.get("material") else ""))

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

        elif role in KANTEN_ROLLEN:
            # Die Linie wird als VERMESSUNGSKANTE übernommen, mit ihrer
            # Rolle. Was daraus für das Gelände folgt (Böschung zwischen
            # Sohle und Beckenrand, ebene Sohle), leitet core/kanten.py
            # anschließend aus Rolle UND Lage ab — früher wurde hier
            # sofort eine Operation erzeugt und die Bedeutung ging
            # verloren, und Ober-/Unterkante wurden über den LAYERNAMEN
            # gepaart statt über ihre Lage zueinander.
            if spec.terrain is None:
                report.append(f"„{c['name']}“ übersprungen: es gibt noch kein "
                              "Gelände, das die Kante verändern könnte")
                continue
            arr = linie_laden(c)
            sid = _kanten_id(c["name"], "kante", vorhandene_kanten)
            spec.terrain.kanten.append(Vermessungskante(
                id=sid, polyline=_p3(arr), rolle=KANTEN_ROLLEN[role],
                breite=1.0, quelle=c["name"]))
            vorhandene_kanten.add(sid)
            report.append(
                f"{ROLLEN_TEXT[role]} „{sid}“: {len(arr)} Stützpunkte, "
                f"{arr[:, 2].min():.2f} … {arr[:, 2].max():.2f} m")

    # ---- Aus den Kanten das Gelände ableiten ----------------------------
    # Früher wurden Ober- und Unterkante hier über den LAYERNAMEN gepaart
    # (`_paar_schluessel`). Hießen die Layer „BK_oben" und
    # „Boeschung_unten", fiel die Paarung aus und beide wurden einzelne
    # Bruchkanten. Jetzt entscheidet die LAGE, und die Rolle bleibt am
    # Objekt erhalten — nachträglich änderbar.
    if spec.terrain is not None and spec.terrain.kanten:
        from .kanten import verknuepfen
        report.extend(verknuepfen(spec))

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
