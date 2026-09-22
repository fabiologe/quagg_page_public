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
# Rollen, die aus einer LINIE direkt ein parametrisches Objekt machen —
# mit denselben Vorbelegungen, die vorher im Editor-Zeichnen steckten.
# Sie gelten für Handskizzen UND für CAD-Polylinien gleichermassen; die
# Masse sind danach im Eigenschaftenpanel aenderbar.
LINIEN_OBJEKT_ROLLEN = {"gerinne", "wand", "damm", "stutzen",
                        "planum", "becken", "verfeinerung", "koerper",
                        "vorfuellung"}

SAFE_FILENAME = re.compile(r"^[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9. _()+-]*$")

# Abgeleitete Dateien (gerasterte TINs, transformierte STL-Kopien,
# Netzvorschau) leben unter derived/ im Fallverzeichnis: wegwerfbar und
# über die gespeicherte Import-Anwendung (anwendung.json) neu ableitbar.
# Quellen bleiben oben: case.yaml und imports/.
DERIVED = "derived"


def derived_pfad(case_dir: Path, name: str) -> Path:
    p = case_dir / DERIVED
    p.mkdir(exist_ok=True)
    return p / name


def _rel(case_dir: Path, p: Path) -> str:
    return p.relative_to(case_dir).as_posix()

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


def _guess_role(stats: dict, name: str = "",
                faktor: float | None = None) -> str:
    low = name.lower()
    for key, role in _NAME_HINTS:
        if key in low:
            return role
    sx, sy = stats["span_xy"]
    dz = stats["z_range"][1] - stats["z_range"][0]
    # Die Schwellen unten sind METER-Maße. Nennt die Zeichnung ihre Einheit
    # ($INSUNITS, `faktor`), wird damit gerechnet. Sonst der alte Verdacht:
    # Millimeter-Dateien lägen ohne Umrechnung um den Faktor 10³ daneben —
    # ein mm-Gelände zerfiele in Ein-Dreieck-Kandidaten, kein Körper träfe
    # seine Klasse (Audit I7: ein 3-m-Schacht in mm galt als Gelände, ein
    # 6-km-Fluss in Metern als Millimeter).
    if faktor:
        sx, sy, dz = sx * faktor, sy * faktor, dz * faktor
    elif max(sx, sy) > UNIT_SUSPECT_SPAN:
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


def _candidate(name: str, mesh: trimesh.Trimesh,
               faktor: float | None = None) -> dict:
    stats = _mesh_stats(mesh.vertices, mesh.faces, mesh.is_watertight)
    return {"name": name, "kind": "mesh", "stats": stats,
            "role_guess": _guess_role(stats, name, faktor)}


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


def _dxf_polyline_points(e) -> tuple[list[list[float]], bool]:
    """
    Stützpunkte MIT Höhe, dazu das closed-Flag. Die Höhe ist der ganze
    Wert einer Böschungs- oder Bruchkante — sie wegzuwerfen macht aus
    Vermessungsdaten eine beliebige Grundrisslinie. LWPOLYLINE trägt eine
    gemeinsame Höhe (elevation), die echte 3D-POLYLINE eine je Stützpunkt.

    Das Flag: ein Beckenrand aus dem CAD ist als Polylinie GESCHLOSSEN
    gezeichnet, wiederholt seinen Anfangspunkt aber nicht — bis 2026-09-22
    wurde das Flag nie gelesen, der Rand zählte als offene Linie, und aus
    neun Linien blieb nur die Sohle als Ring übrig (Audit I1).
    """
    if e.dxftype() == "LWPOLYLINE":
        z = float(getattr(e.dxf, "elevation", 0.0) or 0.0)
        return ([[float(p[0]), float(p[1]), z] for p in e.get_points("xy")],
                bool(e.closed))
    return ([[float(v.dxf.location.x), float(v.dxf.location.y),
              float(v.dxf.location.z)] for v in e.vertices],
            bool(e.is_closed))


def _ist_ring(pts) -> bool:
    """
    DIE Ringprüfung: der Anfangspunkt wird am Ende wiederholt (im
    Grundriss, 1e-6). Dieselbe Regel wie `Vermessungskante.geschlossen`
    (casespec); hier der einzige Ort im Importer.
    """
    a, b = pts[0], pts[-1]
    return abs(float(a[0]) - float(b[0])) < 1e-6 and \
        abs(float(a[1]) - float(b[1])) < 1e-6


def _ring_schliessen(pts: list[list[float]]) -> list[list[float]]:
    """
    Eine Polylinie mit closed-Flag so schreiben, wie der Rest des Systems
    einen Ring erkennt: Anfangspunkt am Ende wiederholt. Einmal hier, damit
    Ringerkennung, Kanten (`geschlossen`) und Zwangskanten keine zweite
    Definition brauchen.
    """
    if len(pts) >= 3 and not _ist_ring(pts):
        return pts + [list(pts[0])]
    return pts


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


def dxf_einheit(doc) -> dict | None:
    """
    Die Einheit, die die Zeichnung selbst nennt ($INSUNITS: 4 = mm, 5 = cm,
    6 = m, 1 = Zoll …), als Faktor nach Meter. 0 = die Zeichnung sagt es
    nicht → None, dann bleibt nur der Verdacht aus der Spannweite. Bis
    2026-09-22 wurde der Kopf nie gelesen (Audit I7).
    """
    from ezdxf import units

    try:
        code = int(doc.header.get("$INSUNITS", 0) or 0)
        if code <= 0:
            return None
        return {"code": code, "name": units.unit_name(code),
                "faktor": float(units.conversion_factor(code, 6))}
    except Exception:                       # noqa: BLE001
        return None


def analyze_dxf(data: bytes, filename: str) -> tuple[list[dict], dict]:
    """
    DXF je LAYER zerlegen: Dreiecks-/Facetten-Entities (3DFACE, POLYFACE,
    MESH) werden zu Mesh-Kandidaten, Polylinien zu Trassen-Kandidaten,
    3DSOLID zu einem Hinweis-Kandidaten (nicht triangulierbar). Dazu, was
    die DATEI als Ganzes sagt: ihre Einheit.
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
        einheit = dxf_einheit(doc)
        return _dxf_kandidaten(doc, {}, einheit), {"einheit": einheit}

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
    einheit = dxf_einheit(doc)
    return _dxf_kandidaten(doc, entfernt, einheit), {"einheit": einheit}


def _dxf_kandidaten(doc, entfernt: dict,
                    einheit: dict | None = None) -> list[dict]:
    from ezdxf.render import MeshVertexMerger

    faktor = einheit["faktor"] if einheit else None
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
            # 3DFACE darf ein Viereck sein -> zweites Dreieck. Ein Dreieck
            # schreibt AutoCAD mit vtx3 == vtx2, BricsCAD mit vtx3 == vtx0
            # (Audit I14: 243 Flächen wurden 486 „Dreiecke", die Hälfte
            # entartet, und die Prüfung meldete „Beckenwände")
            if tuple(pts[3]) not in (tuple(pts[2]), tuple(pts[0])):
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
            except Exception:               # noqa: BLE001
                # NICHT stumm verschwinden lassen: eine unlesbare Netz-
                # Entität fehlt sonst im Import, ohne dass es irgendwo
                # steht (Audit F9) — der Zähler landet im Import-Bericht
                unbekannt[t] = unbekannt.get(t, 0) + 1
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
            except Exception:               # noqa: BLE001
                unbekannt["POLYLINE"] = unbekannt.get("POLYLINE", 0) + 1
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
            pts, geschlossen = _dxf_polyline_points(e)
            if geschlossen:
                pts = _ring_schliessen(pts)
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
        if _guess_role(_mesh_stats(verts, faces, m.is_watertight), layer,
                       faktor) == "gelaende":
            teile = [("teil", m)]
        else:
            teile = _split_named(m)
        for name, part in teile:
            label = layer if name == "teil" else f"{layer}_{name.split('_')[-1]}"
            c = _candidate(label, part, faktor)
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
                          "hoehen": bool(hat_z),
                          # ein Ring (closed-Flag oder wiederholter Anfang)
                          # wird bei der Übernahme zur GRENZE der Vermaschung
                          "geschlossen": bool(len(pts) >= 4 and _ist_ring(pts))},
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
            # Ein Kreis ist nur dann ein Rohrquerschnitt, wenn seine Ebene
            # STEHT (Achse etwa waagerecht). In der Draufsicht (Achse
            # senkrecht) ist er ein Schachtdeckel, ein Baum, eine Signatur.
            # Bis 2026-09-22 wurde jeder Kreis ein Ablaufrohr — ein
            # senkrechter Stutzen, zwei Durchmesser lang (Audit I10).
            querschnitt = abs(float(n[2])) < 0.5
            c = {
                "name": f"{layer}_rohr_{i}" if len(kreise) > 1 else f"{layer}_rohr",
                "kind": "kreis",
                "role_guess": _kreis_rolle(layer) if querschnitt else "ignorieren",
                "stats": {"durchmesser": round(2 * r, 3),
                          "mitte": [round(v, 3) for v in mitte],
                          "achse": [round(v, 4) for v in n],
                          "lage": "querschnitt" if querschnitt else "draufsicht",
                          "sohle": round(mitte[2] - r, 3),
                          "scheitel": round(mitte[2] + r, 3)},
                "_kreis": {"mitte": list(mitte), "radius": r, "achse": list(n)},
            }
            if not querschnitt:
                c["hint"] = ("Kreis in der Draufsicht (Achse senkrecht) — ein "
                             "Schachtdeckel, Baum oder eine Signatur, kein "
                             "Rohrquerschnitt. Als Rohr nur übernehmen, wenn "
                             "es wirklich eine senkrechte Mündung ist.")
            cands.append(c)

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
    # Lage der Datei (Quelleinheit) — damit auch ein Raster in Landes-
    # koordinaten einen Offset-Vorschlag bekommt (Audit I2)
    try:
        _, bbox = _raster_transformieren(data, 1.0, None)
        if bbox is not None:
            stats["bbox"] = [[round(float(v), 3) for v in bbox[0]],
                             [round(float(v), 3) for v in bbox[1]]]
    except Exception:                       # noqa: BLE001
        pass                                # unlesbar meldet die Übernahme
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


def _analysieren(data: bytes, filename: str) -> tuple[list[dict], dict]:
    """
    Die Datei nach ihrer Endung in Kandidaten zerlegen. Dazu, was über die
    DATEI bekannt ist (`einheit`, nur DXF nennt sie).
    """
    ext = filename.rsplit(".", 1)[-1].lower()
    info: dict = {"einheit": None}
    if ext == "dxf":
        cands, info = analyze_dxf(data, filename)
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
    return cands, info


def _kandidat_bbox(c: dict) -> np.ndarray | None:
    """
    Hüllquader EINES Kandidaten in Quelleinheit, (2,3) oder None. Bis
    2026-09-22 zählten für Bbox, Offset-Vorschlag und Einheitenverdacht nur
    Netze — eine Datei aus Linien und Kreisen bekam nichts davon, und drei
    Importe eines Betriebsfalls landeten in Gauß-Krüger (Audit I2).
    """
    if c.get("_mesh") is not None:
        return np.asarray(c["stats"]["bbox"], dtype=float)
    if c.get("_polyline") is not None:
        arr = np.asarray(c["_polyline"], dtype=float)
        if arr.ndim != 2 or not len(arr):
            return None
        if arr.shape[1] < 3:
            arr = np.column_stack([arr, np.zeros(len(arr))])
        return np.array([arr.min(axis=0), arr.max(axis=0)])
    if c.get("_kreis") is not None:
        m = np.asarray(c["_kreis"]["mitte"], dtype=float)
        r = float(c["_kreis"]["radius"])
        return np.array([m - r, m + r])
    if c.get("_raster") is not None and c["stats"].get("bbox"):
        return np.asarray(c["stats"]["bbox"], dtype=float)
    return None


def _kandidaten_ablegen(cands: list[dict], imp_dir: Path, import_id: str,
                        filename: str, created: float,
                        info: dict | None = None) -> dict:
    """
    Kandidaten-Dateien und Manifest schreiben — für den ersten Import und
    für das Neu-Zerlegen aus der Rohdatei (import_neu_analysieren).

    Netze liegen als STL und damit in einfacher Genauigkeit. In
    Landeskoordinaten (2,58 Mio / 5,46 Mio) ist ein float32-Schritt 0,25
    bzw. 0,5 m — ein 12-m-Becken-TIN verlor so bis 76 cm Höhe und 25 cm
    Lage, ohne dass es jemand sah (Audit I3). Deshalb werden alle Netze
    eines Imports um EINEN gemeinsamen, ganzzahligen Ursprung verschoben
    abgelegt (`stl_ursprung` im Manifest); load_mesh rechnet ihn in
    doppelter Genauigkeit zurück. Ein gemeinsamer Ursprung, damit die
    Körper eines Imports zueinander liegen bleiben.
    """
    # Ablage-Ursprung NUR aus den Netzen (die liegen als float32-STL); die
    # Lage der Datei dagegen aus allen Kandidatenarten
    netz_los = [c["stats"]["bbox"][0] for c in cands if c.get("_mesh") is not None]
    ursprung = np.zeros(3)
    if netz_los:
        lo = np.min(np.asarray(netz_los, dtype=float), axis=0)
        ursprung = np.array([math.floor(lo[0]), math.floor(lo[1]), 0.0])
    boxen = [b for b in (_kandidat_bbox(c) for c in cands) if b is not None]
    einheit = (info or {}).get("einheit")

    for i, c in enumerate(cands):
        c["id"] = f"k{i}"
        mesh = c.pop("_mesh", None)
        if mesh is not None:
            mesh.apply_translation(-ursprung)
            mesh.export(imp_dir / f"{c['id']}.stl")
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
                "created": created, "candidates": cands,
                "stl_ursprung": [float(ursprung[0]), float(ursprung[1])],
                "einheit": einheit}
    if boxen:
        lo = np.min(np.asarray(boxen, dtype=float)[:, 0], axis=0)
        hi = np.max(np.asarray(boxen, dtype=float)[:, 1], axis=0)
        span = hi - lo
        # In Metern urteilen, wenn die Zeichnung ihre Einheit nennt; der
        # Spannweiten-Verdacht bleibt nur für Dateien ohne Einheit
        f = einheit["faktor"] if einheit else 1.0
        manifest["bbox"] = [[round(float(v), 3) for v in lo],
                            [round(float(v), 3) for v in hi]]
        manifest["unit_suspect"] = bool(
            einheit is None and max(span[0], span[1]) > UNIT_SUSPECT_SPAN)
        manifest["offset_suggest"] = (
            [round(float(lo[0]), 3), round(float(lo[1]), 3)]
            if max(abs(lo[0]), abs(lo[1])) * f > OFFSET_SUSPECT else None)
    (imp_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False))
    return manifest


def analyze_file(data: bytes, filename: str, case_dir: Path) -> dict:
    """Datei analysieren, Kandidaten-Meshes ablegen, Manifest zurückgeben."""
    if not SAFE_FILENAME.match(filename):
        raise ValueError(f"Unsicherer Dateiname: {filename!r}")
    cands, info = _analysieren(data, filename)
    import_id = f"imp-{uuid.uuid4().hex[:8]}"
    imp_dir = case_dir / "imports" / import_id
    imp_dir.mkdir(parents=True)
    (imp_dir / filename).write_bytes(data)
    return _kandidaten_ablegen(cands, imp_dir, import_id, filename,
                               time.time(), info)


def import_neu_analysieren(case_dir: Path, import_id: str) -> dict:
    """
    Die Kandidaten eines Imports aus der ROHDATEI neu zerlegen — in
    dasselbe Verzeichnis, unter denselben Kennungen (k0, k1, … folgen der
    Reihenfolge in der Datei), die gespeicherte Anwendung bleibt gültig.
    Nötig, wenn die abgelegten Netze selbst verdorben sind: vor dem
    2026-09-22 lagen sie in Landeskoordinaten als float32.
    """
    imp_dir = case_dir / "imports" / import_id
    alt = json.loads((imp_dir / "manifest.json").read_text())
    filename = alt["filename"]
    cands, info = _analysieren((imp_dir / filename).read_bytes(), filename)
    return _kandidaten_ablegen(cands, imp_dir, import_id, filename,
                               float(alt.get("created") or time.time()), info)


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
    # gemessen — und bleibt in der Datei NODATA. Was dort im Modell steht,
    # entscheidet EINE Stelle beim Lesen (terrain.lade_basis): eine Ebene auf
    # der Außenhöhe. Die Datei mit der höchsten Höhe vollzuschreiben, wie es
    # bis 2026-09-21 geschah, warf genau die Information weg, die die
    # Prüfung braucht, um „hier ist nichts vermessen" zu melden.
    aus_tin = float(np.mean(~np.isnan(z)))
    _asc_schreiben(z, out_path, float(x0), float(y0), resolution)
    return {"nx": nx, "ny": ny,
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "senkrecht_verworfen": verworfen,
            "coverage": round(aus_tin, 3),
            "aussenhoehe": _randkrone_tin(mesh)}


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


# Die Außenhöhe — die Ebene außerhalb der Vermessung — kommt beim Import aus
# den RANDPUNKTEN der Vermessung: der Krone des TIN-Rands bzw. der äußersten
# Linien. Die zellbasierte Ableitung des Lesers (terrain.randkrone) ist nur
# der Rückfall für fertige Raster und Altfälle: ein Zellmittelpunkt trifft
# den Kronenknoten selten, an einem Betriebsfall lag sie 18 cm unter der
# Zeichnungskrone und stützte sich auf zwei Zellen.

def _randkrone_punkte(pts: np.ndarray, resolution: float) -> float | None:
    """Höchster Punkt auf der konvexen Hülle der Stützpunkte (n,3)."""
    import shapely
    p = np.asarray(pts, dtype=float)
    if len(p) < 3:
        return float(p[:, 2].max()) if len(p) else None
    huelle = shapely.MultiPoint(p[:, :2]).convex_hull
    if huelle.geom_type != "Polygon":
        return float(p[:, 2].max())
    am_rand = shapely.distance(huelle.exterior,
                               shapely.points(p[:, 0], p[:, 1])) <= resolution / 2
    return round(float(p[am_rand, 2].max()), 3) if am_rand.any() \
        else round(float(p[:, 2].max()), 3)


def _randkrone_tin(mesh: trimesh.Trimesh) -> float | None:
    """Höchster Knoten auf dem offenen Rand eines Netzes (Kanten mit nur
    einem Dreieck); ohne offenen Rand der höchste Knoten überhaupt."""
    v = np.asarray(mesh.vertices, dtype=float)
    if not len(v):
        return None
    kanten, anzahl = np.unique(np.sort(np.asarray(mesh.edges), axis=1),
                               axis=0, return_counts=True)
    rand = np.unique(kanten[anzahl == 1])
    return round(float(v[rand, 2].max() if len(rand) else v[:, 2].max()), 3)


def _gelaende_setzen(spec, case_dir: Path, quelle: str, res: float,
                     koerper: str | None = None,
                     aussenhoehe: float | None = None) -> None:
    """
    Die Geländebasis eines Falls neu setzen — an EINER Stelle, damit beim
    Neuaufbau nichts verloren geht, was zum Fall und nicht zur Datei gehört:
    Vermessungskanten, Operationen, Material und eine von Hand gesetzte
    Außenhöhe. `original`/`original_abbildung` beginnen neu — die neue
    Datei IST das Original. Ausnahme: das Neu-Ableiten DESSELBEN Imports
    in einem gedrehten Fall (die neue Datei ist das bisherige Original) —
    dann bleibt die Abbildung, und das gedrehte Raster wird aus der neuen
    Datei neu abgetastet. Vorher warf ein Reapply die Drehung des Geländes
    weg, während Bauwerke und Ränder gedreht blieben (Audit I5).
    """
    from .casespec import Terrain, TerrainBase
    alt = spec.terrain
    if aussenhoehe is None and alt is not None:
        aussenhoehe = alt.base.aussenhoehe
    base = TerrainBase(source=quelle, resolution=res, koerper=koerper,
                       aussenhoehe=aussenhoehe)
    gedreht = (alt is not None and alt.base.original == quelle
               and alt.base.original_abbildung is not None)
    if gedreht:
        base.original = quelle
        base.original_abbildung = alt.base.original_abbildung
        base.source = alt.base.source
    spec.terrain = Terrain(
        base=base,
        kanten=(alt.kanten if alt else []),
        operations=(alt.operations if alt else []),
        material=(alt.material if alt else "erde"))
    if gedreht:
        from .rotate import terrain_neu_abtasten
        neu = terrain_neu_abtasten(spec, case_dir)
        if neu:
            spec.terrain.base.source = neu


def _stuetzzellen_einbrennen(z: np.ndarray, linien: list, innen,
                             x0: float, y0: float, resolution: float) -> dict:
    """
    Offene Linien als gemessene Stützzellen ins Raster legen — verdichtet
    auf eine halbe Zelle, jede Zelle bekommt die Höhe der Linie. Nur
    innerhalb der shapely-Fläche `innen` (der äußerste Ring): außerhalb ist
    nichts vermascht, dort trüge eine einzelne Zellreihe nichts bei. Zählt
    Linien und Zellen für den Bericht.
    """
    import shapely

    ny, nx = z.shape
    linien_innen = linien_aussen = 0
    zellen: set[tuple[int, int]] = set()
    for li in linien:
        li = np.asarray(li, dtype=float)
        if len(li) < 2:
            continue
        p = _verdichten(li, 0.5 * resolution)
        drin = shapely.contains_xy(innen, p[:, 0], p[:, 1])
        if not drin.any():
            linien_aussen += 1
            continue
        p = p[drin]
        si = np.clip(np.round((p[:, 0] - x0) / resolution).astype(int), 0, nx - 1)
        sj = np.clip(np.round((p[:, 1] - y0) / resolution).astype(int), 0, ny - 1)
        z[sj, si] = p[:, 2]
        linien_innen += 1
        zellen.update(zip(sj.tolist(), si.tolist()))
    return {"linien_eingebrannt": linien_innen,
            "linien_ausserhalb": linien_aussen,
            "zellen_eingebrannt": len(zellen)}


def tin_aus_ringen(ringe: list, out_path: Path, resolution: float,
                   offene: list = ()) -> dict:
    """
    Gelände aus GESCHLOSSENEN Vermessungskanten — mit Zwangskanten.

    `ringe`: [(kennung, (n,3)-Array), …], jeder Ring geschlossen.
    `offene`: die übrigen Linien derselben Vermessung (Böschungslinien,
    ein Auslaufquerschnitt). Innerhalb des äußersten Rings liegen sie als
    Stützzellen im Raster; außerhalb tragen sie nichts bei und werden
    gezählt. Bis 2026-09-22 fielen mit dem ersten Ring ALLE offenen Linien
    aus dem Raster (Audit I1).

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
    wurzeln: list[str] = []               # die äußersten Ringe
    for kid in polys:
        e = eltern(kid)
        if e is not None:
            kinder[e].append(kid)
        else:
            wurzeln.append(kid)

    dreiecke: list[np.ndarray] = []
    vermaschung_fehlgeschlagen: list[str] = []
    for kid, poly in polys.items():
        loecher = [np.asarray(polys[c].exterior.coords) for c in kinder[kid]]
        try:
            flaeche = shapely.Polygon(poly.exterior.coords, holes=loecher)
            if not flaeche.is_valid:
                flaeche = flaeche.buffer(0)
            teile = shapely.constrained_delaunay_triangles(flaeche)
        except Exception:                   # noqa: BLE001
            # Ein nicht vermaschbarer Ring darf nicht STUMM aus der
            # Fläche verschwinden (Audit F9) — er wird unten gemeldet
            vermaschung_fehlgeschlagen.append(kid)
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
    eingebrannt = _stuetzzellen_einbrennen(
        z, list(offene), shapely.unary_union([polys[k] for k in wurzeln]),
        float(x0), float(y0), resolution)
    abdeckung = float(np.mean(~np.isnan(z)))
    # Außerhalb des äußersten Rings ist nichts vermessen — das bleibt in der
    # Datei NODATA; die Ebene darüber setzt der Leser (terrain.lade_basis).
    _asc_schreiben(z, out_path, float(x0), float(y0), resolution)
    return {"nx": nx, "ny": ny,
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "n_dreiecke": len(dreiecke), "n_punkte": len(hoehen),
            "n_ringe": len(polys),
            **({"vermaschung_fehlgeschlagen": vermaschung_fehlgeschlagen}
               if vermaschung_fehlgeschlagen else {}),
            "coverage": round(abdeckung, 3),
            "z_min": round(float(np.nanmin(z)), 3),
            "z_max": round(float(np.nanmax(z)), 3),
            **eingebrannt,
            "aussenhoehe": _randkrone_punkte(alle, resolution)}


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

    # Die Stützpunkte selbst sind immer gemessen — auch wenn kein Dreieck
    # die Kantengrenze überlebt (zwei Linien weit auseinander). Ohne sie
    # hätte die Ergänzung keinen festen Knoten; das Raster blieb dann leer
    # und die Datei bestand aus „nan nan nan" (Audit I4).
    si = np.clip(np.round((v[:, 0] - x0) / resolution).astype(int), 0, nx - 1)
    sj = np.clip(np.round((v[:, 1] - y0) / resolution).astype(int), 0, ny - 1)
    frei = np.isnan(z[sj, si])
    z[sj[frei], si[frei]] = v[frei, 2]

    # Die Vermessung endet an der konvexen Hülle der Stützpunkte. Eine halbe
    # Zelle Puffer, damit ein Knoten haarscharf auf der Hüllkante (die
    # Rasterränder liegen GENAU auf den äußersten Punkten) nicht herausfällt.
    import shapely
    huelle = shapely.contains_xy(
        shapely.MultiPoint(v[:, :2]).convex_hull.buffer(0.5 * resolution),
        xx, yy)
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

    # Außerhalb der Hülle ist nichts gemessen — das bleibt NODATA; die Ebene
    # darüber setzt der Leser (terrain.lade_basis). Innen bleibt bitgleich.
    z = np.where(huelle, z, np.nan)
    _asc_schreiben(z, out_path, float(x0), float(y0), resolution)
    return {"nx": nx, "ny": ny, "n_punkte": int(len(v)),
            "max_kante": round(float(grenze), 2),
            "extent": [round(float(x0), 3), round(float(y0), 3),
                       round(float(x1), 3), round(float(y1), 3)],
            "coverage": round(aus_maschen, 3),
            "innen_ergaenzt": round(float(np.mean(luecke & huelle)), 3),
            "ausserhalb": round(float(np.mean(~huelle)), 3),
            "z_min": round(float(np.nanmin(z)), 3),
            "z_max": round(float(np.nanmax(z)), 3),
            "aussenhoehe": _randkrone_punkte(v, resolution)}


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


def _linien_objekt(spec, case_dir: Path, role: str, arr: np.ndarray,
                   sid: str):
    """
    Aus einer 2D-/3D-Linie ein parametrisches Objekt bauen — die
    Vorbelegungen entsprechen dem früheren Editor-Zeichnen: Höhen aus dem
    Gelände, gängige Maße, alles im Panel änderbar. Rückgabe:
    [(Zielliste, Objekt)] oder None bei zu wenigen Punkten.
    """
    from .casespec import (CulvertProfile, OpChannelCarve, OpEmbankment,
                          OpPad, RefineBox, StructBasin, StructCulvert,
                          StructWall, Alignment)
    from .terrain import TerrainField

    pts = [(round(float(p[0]), 3), round(float(p[1]), 3)) for p in arr]
    # geschlossene Ringe: der doppelte Schlusspunkt verfälscht Mittelwerte
    stat_pts = pts[:-1] if len(pts) > 3 and pts[0] == pts[-1] else pts
    braucht = 3 if role in ("planum", "becken", "verfeinerung", "koerper", "vorfuellung") else 2
    if len(pts) < braucht:
        return None

    # Geländehöhen entlang der Linie — ohne Gelände greift eine Ebene auf
    # Gebietsniveau, damit die Vorbelegung nicht ins Leere zeigt
    try:
        feld = TerrainField.from_spec(spec.terrain, spec.domain, case_dir)
        zs = [float(feld.sample(np.array([x]), np.array([y]))[0])
              for x, y in stat_pts]
    except Exception:                       # noqa: BLE001
        gz = spec.domain.z_min + 1.0 if spec.domain else 95.0
        zs = [gz] * len(stat_pts)
    zmin, zmax = min(zs), max(zs)
    r2 = lambda v: round(float(v), 2)

    ops = spec.terrain.operations if spec.terrain else None
    if role == "gerinne":
        return [(ops, OpChannelCarve(
            id=sid, type="channel_carve", polyline=pts,
            invert_start=r2(zmin - 1.2), invert_end=r2(zmin - 1.4),
            bottom_width=2.0, depth=1.5, side_slope=1.5))] if ops is not None else None
    if role == "damm":
        return [(ops, OpEmbankment(
            id=sid, type="embankment", polyline=pts,
            crest_level=r2(zmax + 1.5), crest_width=2.0,
            side_slope=2.0))] if ops is not None else None
    if role == "planum":
        return [(ops, OpPad(id=sid, type="pad", polygon=stat_pts,
                            level=r2(sum(zs) / len(zs))))] if ops is not None else None
    if role == "wand":
        crest = r2(zmax + 1.5)
        return [(spec.structures, StructWall(
            id=sid, type="wall", patch=sid,
            alignment=Alignment(points=[(x, y, crest) for x, y in pts],
                                kind="polyline"),
            height=2.0, thickness=0.4, material="beton"))]
    if role == "stutzen":
        achse = [(x, y, r2(z + 0.6)) for (x, y), z in zip(pts, zs)]
        return [(spec.structures, StructCulvert(
            id=sid, type="culvert", patch=sid, axis=achse,
            profile=CulvertProfile(kind="circular", diameter=0.8)))]
    if role == "becken":
        return [(spec.structures, StructBasin(
            id=sid, type="basin", patch=sid, footprint=stat_pts,
            invert_level=r2(zmin - 0.5), wall_height=2.0,
            wall_thickness=0.3, material="beton"))]
    if role == "koerper":
        # extrudiertes Prisma = parametrischer Pfeiler mit freiem
        # Grundriss: bleibt voll editierbar (Sohle/Oberkante/Grundriss),
        # 0,3 m Einbindung gegen den Spalt unterm Körper
        from .casespec import StructPier
        return [(spec.structures, StructPier(
            id=sid, type="pier", patch=sid, shape="polygon",
            footprint=stat_pts, base_level=r2(zmin - 0.3),
            top_level=r2(zmax + 2.0), material="beton"))]
    if role == "vorfuellung":
        # Startwasserspiegel im Bereich: 1 m überm tiefsten Geländepunkt
        from .casespec import Vorfuellung
        return [(spec.solver.vorfuellungen, Vorfuellung(
            id=sid, polygon=stat_pts, level=r2(zmin + 1.0)))]
    if role == "verfeinerung":
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        ziel = spec.mesh.refinements if spec.mesh else None
        return [(ziel, RefineBox(
            id=sid, type="box",
            extent=(min(xs), min(ys), r2(zmin - 1.0),
                    max(xs), max(ys), r2(zmin + 3.0)),
            level=2))] if ziel is not None else None
    return None


def import_objekte_entfernen(spec, import_id: str) -> int:
    """
    Alle Objekte entfernen, die aus dem Import `import_id` stammen
    (erkennbar am import_ref). Grundlage des idempotenten Re-Apply und
    später des „Import löschen"-Wegs.
    """
    def bleibt(o) -> bool:
        r = getattr(o, "import_ref", None)
        return r is None or r.import_id != import_id

    n = 0
    vorher = len(spec.structures)
    spec.structures = [s for s in spec.structures if bleibt(s)]
    n += vorher - len(spec.structures)
    vorher = len(spec.evaluation.sections)
    spec.evaluation.sections = [s for s in spec.evaluation.sections
                                if bleibt(s)]
    n += vorher - len(spec.evaluation.sections)
    vorher = len(spec.solver.vorfuellungen)
    spec.solver.vorfuellungen = [v for v in spec.solver.vorfuellungen
                                 if bleibt(v)]
    n += vorher - len(spec.solver.vorfuellungen)
    if spec.terrain is not None:
        vorher = len(spec.terrain.kanten)
        spec.terrain.kanten = [k for k in spec.terrain.kanten if bleibt(k)]
        n += vorher - len(spec.terrain.kanten)
        vorher = len(spec.terrain.operations)
        spec.terrain.operations = [o for o in spec.terrain.operations
                                   if bleibt(o)]
        n += vorher - len(spec.terrain.operations)
    return n


# Rollen, die aus einem NETZ einen Bauwerkskörper machen (StructImported)
_SOLID_ROLLEN = ("wand", "pfeiler", "wehr", "becken", "bauwerk")


def _p3(arr) -> list:
    return [[round(float(q[0]), 3), round(float(q[1]), 3),
             round(float(q[2]), 3)] for q in arr]


class _Uebernahme:
    """
    Zustand EINER Übernahme (apply_import): was jeder Schritt braucht und
    was die Schritte einander weiterreichen (Bericht, Gelände-Hüllquader,
    vergebene Kennungen). Vorher steckte das in inneren Funktionen mit
    `nonlocal` in einer 480-Zeilen-Funktion, in die jede Import-Reparatur
    hineingreifen musste (E2a, Audit W3-P1.2).
    """

    def __init__(self, spec, case_dir: Path, import_id: str, manifest: dict,
                 unit_factor: float, offset: list[float] | None,
                 rotation_deg: float) -> None:
        self.spec = spec
        self.case_dir = case_dir
        self.import_id = import_id
        self.imp_dir = case_dir / "imports" / import_id
        self.manifest = manifest
        self.by_id = {c["id"]: c for c in self.manifest["candidates"]}
        # die WIRKSAMEN Lage-Parameter (nach _verortung_ergaenzen) — sie
        # landen in der Anwendung und in der Verortung des Falls
        self.unit_factor = unit_factor
        self.offset = offset
        self.rotation_deg = rotation_deg
        self.off = np.asarray([offset[0], offset[1], 0.0] if offset else [0, 0, 0],
                              dtype=float)
        # Modell drehen: das Rechengebiet ist ein achsparalleler Quader. Liegt
        # das Bauwerk schräg im Landeskoordinatensystem, verschenkt man damit
        # Fläche und schneidet an den falschen Stellen ab. Deshalb wird beim
        # Import EINMAL alles in ein lokales System gedreht, in dem das
        # Bauwerk gerade steht — danach passt der Quader eng darum.
        self.rot = math.radians(rotation_deg or 0.0)
        self._c, self._s = math.cos(self.rot), math.sin(self.rot)
        # Ablage-Ursprung der Netze (Quelleinheit, siehe _kandidaten_ablegen);
        # Importe von vor dem 2026-09-22 haben keinen — dort liegt das STL
        # noch in Landeskoordinaten
        self.stl_ursprung = np.asarray(
            self.manifest.get("stl_ursprung") or [0.0, 0.0], dtype=float)
        self.report: list[str] = []
        self.terrain_bbox = None
        self.gelaende_gesetzt = False
        self.existing: set[str] = set()
        self.vorhandene_ops: set[str] = set()
        self.vorhandene_kanten: set[str] = set()
        self.vorhandene_qs: set[str] = set()

    def bestand_erfassen(self) -> None:
        """Vergebene Kennungen — NACH dem Ersetzen des alten Standes."""
        spec = self.spec
        self.existing = {s.id for s in spec.structures}
        self.vorhandene_ops = {o.id for o in (spec.terrain.operations
                                              if spec.terrain else [])}
        self.vorhandene_ops |= {r.id for r in (spec.mesh.refinements
                                               if spec.mesh else [])}
        self.vorhandene_kanten = {k.id for k in (spec.terrain.kanten
                                  if spec.terrain else [])}
        self.vorhandene_qs = {x.id for x in spec.evaluation.sections}

    def ref(self, cid: str):
        from .casespec import ImportRef
        return ImportRef(import_id=self.import_id, kandidat=cid)

    def aufloesung(self, rueckfall: float) -> float:
        return (self.spec.terrain.base.resolution if self.spec.terrain
                else rueckfall)

    def drehen(self, pkte: np.ndarray) -> np.ndarray:
        """(n,2) oder (n,3) um die z-Achse durch den Ursprung drehen."""
        if not self.rot:
            return pkte
        a = np.array(pkte, dtype=float, copy=True)
        x, y = a[..., 0].copy(), a[..., 1].copy()
        a[..., 0] = self._c * x - self._s * y
        a[..., 1] = self._s * x + self._c * y
        return a

    def load_mesh(self, cid: str) -> trimesh.Trimesh:
        # Reihenfolge: erst den Ablage-Ursprung zurück (Quelleinheit), dann
        # skalieren (mm -> m), dann verschieben — der Offset wird in der
        # ZIELeinheit angegeben (Editor zeigt ihn so an)
        m = trimesh.load(self.imp_dir / f"{cid}.stl", force="mesh")
        if self.stl_ursprung.any():
            m.apply_translation([self.stl_ursprung[0], self.stl_ursprung[1], 0.0])
        if self.unit_factor != 1.0:
            m.apply_scale(self.unit_factor)
        m.apply_translation(-self.off)
        if self.rot:
            m.apply_transform(trimesh.transformations.rotation_matrix(
                self.rot, [0, 0, 1]))
        return m

    def linie_laden(self, c: dict) -> np.ndarray:
        pts = json.loads((self.imp_dir / f"{c['id']}.json").read_text())
        arr = np.asarray(pts, dtype=float)
        if arr.shape[1] < 3:                      # alte Importe ohne Höhe
            arr = np.column_stack([arr, np.zeros(len(arr))])
        arr = arr * self.unit_factor
        return self.drehen(arr - self.off)


def _verortung_ergaenzen(spec, manifest: dict, unit_factor: float,
                         offset: list[float] | None, rotation_deg: float
                         ) -> tuple[float, list[float] | None, float, str | None]:
    """
    Fehlt der Offset bei einer Datei in Landeskoordinaten, wird er nicht
    still auf 0 gesetzt: Liegt der Vorschlag der Datei in der Welt des
    Falls (`meta.transform` des ersten Imports, binnen OFFSET_SUSPECT), gilt
    dessen Verortung — Offset, Drehung, Einheit; sonst der Vorschlag der
    Datei selbst. Bis 2026-09-22 landeten so drei Importe eines
    Betriebsfalls in Gauß-Krüger neben einem lokalen Gebiet, und vier
    Rohre lagen in drei Koordinatenwelten (Audit I2). Lokale Dateien (kein
    Vorschlag) bleiben unberührt. Liefert die wirksamen Parameter und den
    Satz für den Bericht.
    """
    vorschlag = manifest.get("offset_suggest")
    if offset or not vorschlag:
        return unit_factor, offset, rotation_deg, None
    from .casespec import lokal_nach_welt

    s = [float(vorschlag[0]) * unit_factor, float(vorschlag[1]) * unit_factor]
    t = spec.meta.transform
    if t is not None:
        alt = lokal_nach_welt(t, 0.0, 0.0)          # Weltpunkt des Ursprungs
        if math.dist(alt, s) < OFFSET_SUSPECT:
            rot = rotation_deg or t.rotation_deg
            uf = unit_factor if unit_factor != 1.0 else t.unit_factor
            return (uf, [round(alt[0], 3), round(alt[1], 3)], rot,
                    "Lage: kein Offset angegeben — die Verortung des ersten "
                    f"Imports gilt (Offset {alt[0]:.2f}, {alt[1]:.2f}; "
                    f"Drehung {rot:g}°; Einheit ×{uf:g}).")
    return (unit_factor, [round(s[0], 3), round(s[1], 3)], rotation_deg,
            "Lage: die Datei liegt in Landeskoordinaten, kein Offset "
            f"angegeben — Vorschlag ({s[0]:.2f}, {s[1]:.2f}) angewandt; "
            "ohne ihn rechneten Viewer und Vernetzer mit 7-stelligen Zahlen.")


def _uebernahme_vorbereiten(spec, case_dir: Path, import_id: str,
                            decisions: list[dict], unit_factor: float,
                            offset: list[float] | None,
                            rotation_deg: float) -> _Uebernahme:
    imp_dir = case_dir / "imports" / import_id
    manifest = json.loads((imp_dir / "manifest.json").read_text())
    unit_factor, offset, rotation_deg, lage = _verortung_ergaenzen(
        spec, manifest, unit_factor, offset, rotation_deg)
    u = _Uebernahme(spec, case_dir, import_id, manifest, unit_factor, offset,
                    rotation_deg)
    # Re-Apply ERSETZT: alles, was aus diesem Import stammt, fliegt vorher
    # raus. Zweimal Übernehmen (andere Rolle, andere Auflösung) erzeugt
    # damit keine _2-Duplikate mehr, sondern den neu abgeleiteten Stand.
    ersetzt = import_objekte_entfernen(spec, import_id)
    # Ein fertiges Raster lässt sich nicht drehen, ohne es neu abzutasten —
    # das gehört nicht in den Import. Ehrlich ablehnen statt still ignorieren
    # (sonst liegen Raster und gedrehte Körper desselben Imports schief
    # zueinander und niemand merkt es).
    if u.rot and any(u.by_id.get(d.get("candidate"), {}).get("kind") == "raster"
                     and d.get("role") != "ignorieren" for d in decisions):
        raise ValueError(
            "Drehung beim Import ist für fertige Höhenraster (.asc/.xyz) "
            "nicht möglich — ein Raster müsste dafür neu abgetastet werden. "
            "Ohne Drehwinkel importieren und den Fall danach über „Modell "
            "drehen“ ausrichten, oder das Gelände als TIN/Kanten liefern.")
    if ersetzt:
        u.report.append(f"{ersetzt} Objekte aus früherem Übernehmen dieses "
                        "Imports ersetzt — kein Duplikat angelegt.")
    if lage:
        u.report.append(lage)
    u.bestand_erfassen()
    return u


def _linien_fuer_gelaende(u: _Uebernahme, decisions: list[dict],
                          terrain_from_lines: bool | None) -> list[dict]:
    """
    Vermessungsdaten kommen oft ohne TIN: nur Bruch-, Böschungs- und
    Sohlkanten. Dann bilden genau diese Linien das Gelände. Ohne
    Basisgelände ist das der einzig sinnvolle Weg — eine Kante allein
    hätte sonst nichts, was sie verändern könnte. Liefert die Linien-
    Entscheidungen, aus denen das Gelände entsteht — oder nichts.
    """
    hat_gelaende_mesh = any(d.get("role") in ("gelaende", "gelaende_koerper")
                            for d in decisions)
    linien_ent = [d for d in decisions
                  if u.by_id.get(d["candidate"], {}).get("kind") == "polyline"
                  and d.get("role") in GELAENDE_KANTEN]
    aus_linien = terrain_from_lines
    if aus_linien is None:
        aus_linien = (not hat_gelaende_mesh and u.spec.terrain is None
                      and bool(linien_ent))
    return linien_ent if (aus_linien and linien_ent) else []


def _gelaende_aus_linien(u: _Uebernahme, ent: list[dict]) -> None:
    res = u.aufloesung(0.5)
    linien = [u.linie_laden(u.by_id[d["candidate"]]) for d in ent]
    asc = derived_pfad(u.case_dir, f"gelaende_{u.import_id}_linien.asc")

    # Geschlossene Kanten sind GRENZEN, keine bloßen Punktwolken. Liegt
    # eine Sohle in einem Beckenrand, gehört die Fläche dazwischen
    # vermascht und die quer durchs Becken NICHT — das entscheidet eine
    # gewöhnliche Delaunay nicht, sie kennt die Ringe gar nicht. Mit
    # Zwangskanten wird jeder Ring zur Grenze und der nächstinnere zum
    # Loch, und es entsteht kein einziger neuer Stützpunkt.
    ist_ring = [len(li) >= 4 and _ist_ring(li) for li in linien]
    ringe = [(re.sub(r"[^a-z0-9_]", "_", u.by_id[d["candidate"]]["name"].lower()),
              li) for d, li, r in zip(ent, linien, ist_ring) if r]
    offene = [li for li, r in zip(linien, ist_ring) if not r]
    info, ueber_ringe = None, False
    if ringe:
        try:
            info = tin_aus_ringen(ringe, asc, res, offene=offene)
            ueber_ringe = True
        except Exception as e:
            u.report.append(f"Vermaschung über die geschlossenen Kanten "
                            f"nicht möglich ({e}) — gewöhnliche "
                            "Vermaschung verwendet.")
    if info is None:
        info = tin_from_lines(linien, asc, res)
    # Die Vermessungskanten müssen den Neuaufbau überleben — sie sind
    # das, WAS gezeichnet wurde, nicht eine Folge der Geländebasis
    _gelaende_setzen(u.spec, u.case_dir, _rel(u.case_dir, asc), res,
                     aussenhoehe=info.get("aussenhoehe"))
    # Hüllquader und Höhenspanne aus dem RASTER — nicht aus den Linien:
    # der Bericht nannte sonst „223,05 … 225,56 m" zu einer Platte auf
    # Sohlniveau, weil der Beckenrand gar nicht im Raster war (Audit I1).
    e = info["extent"]
    z_lo, z_hi = float(info["z_min"]), float(info["z_max"])
    u.terrain_bbox = np.array([[e[0], e[1], z_lo], [e[2], e[3], z_hi]])
    if ueber_ringe:
        n_innen = info.get("linien_eingebrannt", 0)
        n_aussen = info.get("linien_ausserhalb", 0)
        u.report.append(
            f"Gelände aus {info['n_ringe']} geschlossenen Kanten mit "
            f"ZWANGSKANTEN vermascht: {info['n_dreiecke']} Dreiecke aus "
            f"{info['n_punkte']} Stützpunkten auf "
            f"{info['nx']}×{info['ny']} Raster, Höhen {z_lo:.2f} … "
            f"{z_hi:.2f} m, Abdeckung {info['coverage']:.0%}. Jeder "
            "Ring ist eine Grenze und der nächstinnere sein Loch — es "
            "wurde kein Stützpunkt hinzuerfunden, alle liegen auf den "
            "Kanten."
            + (f" {n_innen} offene Linie(n) innerhalb des äußersten Rings "
               "liegen als Stützzellen im Raster "
               f"({info['zellen_eingebrannt']} Zellen)." if n_innen else "")
            + (f" {n_aussen} offene Linie(n) liegen außerhalb der "
               "geschlossenen Kanten und tragen nicht zum Raster bei — als "
               "Kanten bleiben sie erhalten." if n_aussen else "")
            + (f" Die restlichen {1 - info['coverage']:.0%} liegen "
               "außerhalb des äußersten Rings — dort ist nichts "
               "vermessen; im Modell steht dort eine Ebene auf "
               f"{info['aussenhoehe']:.2f} m (Außenhöhe, im "
               "Gelände-Panel änderbar)."
               if info["coverage"] < 0.999 else ""))
    else:
        u.report.append(
            f"Gelände aus {len(linien)} Kanten vermascht: "
            f"{info['n_punkte']} Stützpunkte auf {info['nx']}×{info['ny']} "
            f"Raster, Höhen {z_lo:.2f} … {z_hi:.2f} m. "
            f"{info['coverage']:.0%} der Fläche liegen zwischen den Kanten "
            f"(Dreiecke bis {info['max_kante']:g} m Kantenlänge), "
            f"{info['innen_ergaenzt']:.0%} dazwischen werden stufenfrei "
            "ergänzt — die glatteste Fläche durch die bekannten Höhen, "
            f"keine Aussage der Vermessung. {info['ausserhalb']:.0%} des "
            "Rasters liegen außerhalb der Vermessung; im Modell steht "
            f"dort eine Ebene auf {info['aussenhoehe']:.2f} m "
            "(Außenhöhe, im Gelände-Panel änderbar).")


def _rohr_aus_kreis(u: _Uebernahme, c: dict, role: str) -> None:
    # Rohrmündung -> Stutzen als Durchlass. Die Achse folgt der
    # Kreisnormalen; die Länge ist bewusst kurz (zwei Durchmesser):
    # was VOR der Mündung passiert, entscheidet sich dort, das
    # Rohrinnere trägt dazu nichts bei.
    from .casespec import CulvertProfile, StructCulvert
    k = json.loads((u.imp_dir / f"{c['id']}.kreis.json").read_text())
    mitte = u.drehen((np.asarray(k["mitte"], dtype=float)
                      * u.unit_factor) - u.off)
    n = u.drehen(np.asarray(k["achse"], dtype=float))
    n = n / (np.linalg.norm(n) or 1.0)
    d = 2 * k["radius"] * u.unit_factor
    halb = d                      # je Seite ein Durchmesser
    sid = re.sub(r"[^a-z0-9_]", "_", c["name"].lower())[:40]
    n_ = 2
    while sid in u.existing:
        sid = f"{sid[:36]}_{n_}"
        n_ += 1
    u.existing.add(sid)
    # Was der Layer über den Zweck sagt, bleibt am Objekt: `role`
    # trägt hier bereits die Wahl aus dem Dialog, die die
    # Namensvermutung `role_guess` überschreibt.
    rolle = {"zulaufrohr": "zulauf", "ablaufrohr": "ablauf"}.get(role)
    u.spec.structures.append(StructCulvert(
        id=sid, type="culvert", patch=sid,
        axis=[tuple(np.round(mitte - n * halb, 3)),
              tuple(np.round(mitte + n * halb, 3))],
        profile=CulvertProfile(kind="circular", diameter=round(d, 3)),
        rolle=rolle, material=None,
        herkunft="import", import_ref=u.ref(c["id"])))
    u.report.append(
        f"Rohrmündung „{sid}“: DN{d * 1000:.0f}, Achse "
        f"({mitte[0]:.2f}, {mitte[1]:.2f}, {mitte[2]:.2f}), "
        f"Sohle {mitte[2] - d / 2:.3f} m, Richtung "
        f"({n[0]:.3f}, {n[1]:.3f}); als {halb * 2:.2f} m langer "
        "Stutzen eingebaut"
        + (f", laut Layer ein {rolle.capitalize()} — "
           "„⚯ Anschlüsse herstellen“ koppelt ihn an den passenden "
           "Rand" if rolle else " — Randbedingung noch zuordnen"))


def _gelaende_aus_raster(u: _Uebernahme, c: dict, role: str) -> None:
    roh = (u.imp_dir / f"{c['id']}.grid").read_bytes()
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", c["name"])[:40]
    ziel = derived_pfad(u.case_dir, f"{name}.asc")
    # Einheit/Offset gelten für ALLE Kandidaten eines Imports gleich —
    # sonst liegen Raster und Bauwerkskörper zueinander verschoben.
    roh, raster_bbox = _raster_transformieren(roh, u.unit_factor, u.off)
    ziel.write_bytes(roh)
    off = u.off
    umgerechnet = (f"; Einheit ×{u.unit_factor:g}, Offset "
                   f"({off[0]:g}, {off[1]:g}) angewandt"
                   if u.unit_factor != 1.0 or off[0] or off[1] else "")
    if role == "gelaende":
        res = u.aufloesung(0.5)
        _gelaende_setzen(u.spec, u.case_dir, _rel(u.case_dir, ziel), res)
        u.report.append(f"Gelände aus Raster „{ziel.name}“ übernommen "
                        f"({c['stats'].get('format')}){umgerechnet}")
        if raster_bbox is not None:
            u.terrain_bbox = raster_bbox
        if u.gelaende_gesetzt:
            u.report.append(
                "ACHTUNG: mehrere Layer als Gelände gewählt — "
                f"„{c['name']}“ ersetzt das vorherige. Für zwei "
                "Zustände (Bestand/Planung) zwei Fälle anlegen.")
        u.gelaende_gesetzt = True
    else:
        u.report.append(
            f"Zusatzraster „{ziel.name}“ liegt jetzt im Fall — in "
            f"einer Operation „Bereich ersetzen“ auswählbar"
            f"{umgerechnet}")


def _gelaende_aus_netz(u: _Uebernahme, c: dict, role: str) -> None:
    from .solids import oberseite

    m = u.load_mesh(c["id"])
    res = u.aufloesung(1.0)
    asc = derived_pfad(u.case_dir, f"gelaende_{u.import_id}.asc")
    koerper_name = None
    if role == "gelaende_koerper":
        # Volumenkörper: er selbst geht an den Vernetzer, das
        # Höhenraster wird aus seiner OBERSEITE abgeleitet (Boden
        # und senkrechte Wände liegen im Grundriss darüber und
        # machten die Vermaschung sonst unbrauchbar).
        if not m.is_watertight:
            m.fill_holes()
            m.fix_normals()
        koerper_name = _rel(u.case_dir, derived_pfad(
            u.case_dir, f"gelaendekoerper_{u.import_id}.stl"))
        m.export(u.case_dir / koerper_name)
        info = rasterize_tin_to_asc(oberseite(m), asc, res)
    else:
        info = rasterize_tin_to_asc(m, asc, res)
        m.export(derived_pfad(u.case_dir,
                              f"gelaende_{u.import_id}_tin.stl"))
    _gelaende_setzen(u.spec, u.case_dir, _rel(u.case_dir, asc), res,
                     koerper_name, aussenhoehe=info.get("aussenhoehe"))
    if koerper_name:
        u.report.append(
            f"Geländekörper „{c['name']}“ übernommen: "
            f"{len(m.faces)} Dreiecke, "
            f"{'geschlossen' if m.is_watertight else 'NICHT geschlossen'}"
            f", Volumen {abs(m.volume):.1f} m³. Der Vernetzer bekommt "
            "diesen Körper; das Höhenraster daneben stammt aus seiner "
            "Oberseite und trägt Prüfung, Fensterlage und Anzeige.")
    u.terrain_bbox = m.bounds
    if u.gelaende_gesetzt:
        u.report.append("ACHTUNG: mehrere Layer als Gelände gewählt — "
                        f"„{c['name']}“ ersetzt das vorherige. Für zwei "
                        "Zustände (Bestand/Planung) zwei Fälle anlegen.")
    u.gelaende_gesetzt = True
    senk = info.get("senkrecht_verworfen") or 0
    u.report.append(f"Gelände „{c['name']}“: {c['stats']['n_triangles']} "
                    f"Dreiecke auf {info['nx']}×{info['ny']} Raster "
                    f"(Abdeckung {info['coverage']:.0%})"
                    + (f"; {senk} senkrechte Dreiecke übersprungen — "
                       "ein Höhenraster kann keine senkrechte Wand "
                       "abbilden" if senk else "")
                    + f"; die übrigen {1 - info['coverage']:.0%} "
                    "liegen außerhalb des TIN — dort ist nichts "
                    "vermessen; im Modell steht dort eine Ebene auf "
                    f"{info['aussenhoehe']:.2f} m (Außenhöhe = höchster "
                    "Randpunkt der Vermessung, im Gelände-Panel "
                    "änderbar)")
    if senk > 0.3 * (c["stats"]["n_triangles"] or 1):
        u.report.append(
            f"ACHTUNG: {senk} von {c['stats']['n_triangles']} "
            f"Dreiecken stehen senkrecht — das sind Beckenwände "
            "oder Mauern. Ein Höhenraster hat je Punkt genau eine "
            "Höhe und kann sie nicht abbilden; zwischen Ober- und "
            "Unterkante rechnet es eine Schräge. Für senkrechte "
            "Wände denselben Layer als „Gelände als Volumenkörper“ "
            "einlesen oder die Kanten als Mauerkrone/Beckenrand "
            "zuordnen.")


def _koerper_aus_netz(u: _Uebernahme, c: dict, d: dict, role: str) -> None:
    from .casespec import StructImported

    base = re.sub(r"[^a-z0-9_]", "_", (d.get("patch")
                                       or c["name"]).lower()) or "import"
    sid = base
    n = 2
    while sid in u.existing:
        sid = f"{base}_{n}"
        n += 1
    u.existing.add(sid)
    m = u.load_mesh(c["id"])
    stl_name = _rel(u.case_dir,
                    derived_pfad(u.case_dir, f"import_{sid}.stl"))
    m.export(u.case_dir / stl_name)
    # Vorbelegung aus der Rolle: ohne Material rechnet der Solver
    # eine hydraulisch GLATTE Wand — für ein Betonbauteil die
    # falsche Seite der Unsicherheit. „bauwerk" bleibt offen, da
    # sagt die Rolle nichts über die Oberfläche.
    werkstoff = d.get("material") or (
        "beton" if role in ("wand", "pfeiler", "wehr", "becken")
        else None)
    u.spec.structures.append(StructImported(
        id=sid, type="imported", patch=sid, source=stl_name,
        role=role, material=werkstoff,
        herkunft="import", import_ref=u.ref(c["id"])))
    u.report.append(f"{role} „{sid}“: {c['stats']['n_triangles']} "
                    f"Dreiecke{'' if c['stats']['watertight'] else ' (NICHT wasserdicht!)'}"
                    + (f"; Material {werkstoff} vorbelegt"
                       if werkstoff and not d.get("material") else ""))


def _querschnitt_aus_linie(u: _Uebernahme, c: dict) -> None:
    from .casespec import Section

    arr = u.linie_laden(c)
    sid = re.sub(r"[^a-z0-9_]", "_", c["name"].lower())
    sid = re.sub(r"_linie(_\d+)?$", r"\1", sid) or sid
    if not sid.startswith("qs"):        # Layer heißt oft schon QS_…
        sid = f"qs_{sid}"
    # zweimal dieselbe Datei importiert -> sonst zwei Querschnitte
    # mit identischer Kennung, die sich gegenseitig verdecken
    sid = _kanten_id(sid, "qs", u.vorhandene_qs)
    u.spec.evaluation.sections.append(Section(
        id=sid[:40],
        polyline=[[round(float(p[0]), 2), round(float(p[1]), 2)]
                  for p in arr],
        herkunft="import", import_ref=u.ref(c["id"])))
    u.report.append(f"Querschnitt „{sid}“ aus Trasse übernommen")


def _objekt_aus_linie(u: _Uebernahme, c: dict, role: str) -> None:
    arr = u.linie_laden(c)
    basis = re.sub(r"[^a-z0-9_]", "_", c["name"].lower())[:36] or role
    sid = basis
    n_ = 2
    while sid in u.existing or sid in u.vorhandene_ops:
        sid = f"{basis}_{n_}"
        n_ += 1
    u.existing.add(sid)
    u.vorhandene_ops.add(sid)
    neu_objekte = _linien_objekt(u.spec, u.case_dir, role, arr, sid)
    if neu_objekte is None:
        u.report.append(f"„{c['name']}“ übersprungen: für die Rolle "
                        f"„{role}“ braucht es mindestens "
                        f"{3 if role in ('planum', 'becken', 'verfeinerung', 'koerper', 'vorfuellung') else 2} Punkte")
        return
    for ziel, obj in neu_objekte:
        obj.herkunft = "import"
        obj.import_ref = u.ref(c["id"])
        ziel.append(obj)
    u.report.append(f"{role} „{sid}“ aus der Linie übernommen — "
                    "Maße sind Vorbelegungen, im Panel änderbar")


def _kante_aus_linie(u: _Uebernahme, c: dict, role: str) -> None:
    # Die Linie wird als VERMESSUNGSKANTE übernommen, mit ihrer
    # Rolle. Was daraus für das Gelände folgt (Böschung zwischen
    # Sohle und Beckenrand, ebene Sohle), leitet core/kanten.py
    # anschließend aus Rolle UND Lage ab — früher wurde hier
    # sofort eine Operation erzeugt und die Bedeutung ging
    # verloren, und Ober-/Unterkante wurden über den LAYERNAMEN
    # gepaart statt über ihre Lage zueinander.
    from .casespec import Vermessungskante

    if u.spec.terrain is None:
        u.report.append(f"„{c['name']}“ übersprungen: es gibt noch kein "
                        "Gelände, das die Kante verändern könnte")
        return
    arr = u.linie_laden(c)
    sid = _kanten_id(c["name"], "kante", u.vorhandene_kanten)
    u.spec.terrain.kanten.append(Vermessungskante(
        id=sid, polyline=_p3(arr), rolle=KANTEN_ROLLEN[role],
        breite=1.0, quelle=c["name"],
        herkunft="import", import_ref=u.ref(c["id"])))
    u.vorhandene_kanten.add(sid)
    u.report.append(
        f"{ROLLEN_TEXT[role]} „{sid}“: {len(arr)} Stützpunkte, "
        f"{arr[:, 2].min():.2f} … {arr[:, 2].max():.2f} m")


def _kandidat_uebernehmen(u: _Uebernahme, d: dict) -> None:
    """Eine Entscheidung des Dialogs auf ihren Kandidaten anwenden."""
    c = u.by_id.get(d["candidate"])
    role = d.get("role", "ignorieren")
    if c is None or role == "ignorieren":
        return
    if c["kind"] == "acis":
        u.report.append(c.get("hint", "ACIS übersprungen"))
        return
    if c["kind"] == "kreis":
        _rohr_aus_kreis(u, c, role)
        return
    if c["kind"] == "raster":
        _gelaende_aus_raster(u, c, role)
        return
    if role in ("gelaende", "gelaende_koerper"):
        _gelaende_aus_netz(u, c, role)
    elif role in _SOLID_ROLLEN and c.get("kind") == "mesh":
        _koerper_aus_netz(u, c, d, role)
    elif role == "querschnitt":
        _querschnitt_aus_linie(u, c)
    # Linienrollen greifen nur für POLYLINIEN — „becken"/„wand"
    # gibt es auch als Mesh-Rolle (Körper aus dem CAD)
    elif role in LINIEN_OBJEKT_ROLLEN and c.get("kind") == "polyline":
        _objekt_aus_linie(u, c, role)
    elif role in KANTEN_ROLLEN:
        _kante_aus_linie(u, c, role)


def _lage_pruefen(u: _Uebernahme, unit_factor: float,
                  offset: list[float] | None, rotation_deg: float) -> None:
    from .casespec import transform_import

    if not (rotation_deg or offset or unit_factor != 1.0):
        return
    neu = transform_import(unit_factor, offset, rotation_deg or 0.0)
    alt = u.spec.meta.transform
    if alt is None:
        u.spec.meta.transform = neu
        u.report.append(
            f"Verortung gespeichert: Drehung {neu.rotation_deg:g}°, "
            f"Verschiebung ({neu.translation[0]:g}, "
            f"{neu.translation[1]:g}), Einheit ×{unit_factor:g} — "
            "die Rückverortung in Landeskoordinaten ist damit "
            "rechnerisch möglich")
    elif (alt.rotation_deg != neu.rotation_deg
          or alt.translation != neu.translation):
        u.report.append(
            "ACHTUNG: Lage-Parameter weichen vom ersten Import ab — "
            "die gespeicherte Verortung bezieht sich weiterhin auf den "
            "ersten Import. Gleiche Einheit/Offset/Drehung für alle "
            "Importe eines Falls verwenden.")


def _gebiet_ableiten(u: _Uebernahme) -> None:
    from .casespec import Domain

    spec = u.spec
    gel_lo, gel_hi = np.asarray(u.terrain_bbox, dtype=float)
    lo, hi = gel_lo.copy(), gel_hi.copy()
    # Mitimportierte Rohre gehören ins Gebiet — mit Wandung. Bis 2026-09-22
    # war das Gebiet die nackte Gelände-Bbox: ein Rohr unter der Sohle
    # wurde bei z_min gekappt, ein Stutzen am Rand ragte hinaus (Audit I12).
    rohre = 0
    for s in spec.structures:
        r = getattr(s, "import_ref", None)
        if s.type != "culvert" or r is None or r.import_id != u.import_id:
            continue
        a = np.asarray(s.axis, dtype=float)
        pr = s.profile
        quer = (pr.diameter if pr.kind == "circular"
                else max(pr.width or 0.0, pr.height or 0.0))
        aussen = float(quer) / 2 + float(pr.wandstaerke or 0.0)
        lo = np.minimum(lo, a.min(axis=0) - aussen)
        hi = np.maximum(hi, a.max(axis=0) + aussen)
        rohre += 1
    dz = max(hi[2] - lo[2], 1.0)
    spec.domain = Domain(
        extent=(round(float(lo[0]), 2), round(float(lo[1]), 2),
                round(float(hi[0]), 2), round(float(hi[1]), 2)),
        z_min=round(float(lo[2] - 0.5), 2),
        z_max=round(float(hi[2] + max(2.0, 0.5 * dz)), 2))
    u.report.append(f"Domäne aus Gelände abgeleitet: {spec.domain.extent}, "
                    f"z {spec.domain.z_min}…{spec.domain.z_max}"
                    + (f" — einschließlich {rohre} Rohr(en) aus diesem "
                       "Import" if rohre else ""))
    lo = gel_lo                                  # trockener Start: Gelände
    # Der Anfangswasserspiegel stammt aus der alten Höhenlage und läge
    # sonst außerhalb des neuen Gebiets (Prüfung würde sofort meckern) —
    # auf trockenen Start setzen und das offen sagen.
    lvl = spec.solver.initial_level
    if lvl is None or not (spec.domain.z_min < lvl < spec.domain.z_max):
        # tiefster Geländepunkt = trockener Start und sicher INNERHALB
        # des Gebiets (validate verlangt echte Ungleichungen)
        neu = round(float(lo[2]), 2)
        spec.solver.initial_level = neu
        u.report.append(f"Anfangswasserspiegel auf {neu} m gesetzt "
                        "(tiefster Geländepunkt, trockener Start) — der "
                        f"bisherige Wert ({lvl}) lag außerhalb des neuen "
                        "Gebiets")


def _anwendung_schreiben(u: _Uebernahme, decisions: list[dict],
                         unit_factor: float, offset: list[float] | None,
                         derive_domain: bool, terrain_from_lines: bool | None,
                         rotation_deg: float) -> None:
    # Die ANWENDUNG gehört zu den Rohdaten: mit ihr ist jede Ableitung in
    # derived/ reproduzierbar (Wegwerf-Test) und ein Re-Apply braucht keine
    # erneute Deklaration im Dialog.
    (u.imp_dir / "anwendung.json").write_text(json.dumps({
        "decisions": decisions,
        "unit_factor": unit_factor,
        "offset": [float(offset[0]), float(offset[1])] if offset else None,
        "derive_domain": bool(derive_domain),
        "terrain_from_lines": terrain_from_lines,
        "rotation_deg": float(rotation_deg or 0.0),
    }, ensure_ascii=False, indent=1))
    # Der Bericht bleibt beim Import liegen. Im Dialog stand er 1,8 Sekunden
    # — und genau dort stand der einzige Satz, der sagte, dass das Gelände
    # außerhalb der Vermessung erfunden ist. Neben der Anwendung, nicht in
    # ihr: die Anwendung ist Eingabe und muss reproduzierbar bleiben.
    (u.imp_dir / "bericht.json").write_text(json.dumps(
        {"report": u.report, "created": time.time()},
        ensure_ascii=False, indent=1))


def apply_import(spec, case_dir: Path, import_id: str,
                 decisions: list[dict], unit_factor: float = 1.0,
                 offset: list[float] | None = None,
                 derive_domain: bool = False,
                 terrain_from_lines: bool | None = None,
                 rotation_deg: float = 0.0) -> dict:
    """
    Deklarierte Kandidaten in den Fall übernehmen. decisions:
    [{candidate, role, patch?, material?}] — gültige Rollen: siehe
    utils/importRollen.js (Client) bzw. KANTEN_ROLLEN + _SOLID_ROLLEN hier,
    plus gelaende, gelaende_koerper, zusatzraster, zulaufrohr/ablaufrohr,
    querschnitt, ignorieren.
    Rückgabe: geänderte Spec (als dict) + Bericht.

    Die Schritte in ihrer Reihenfolge — jeder eine Funktion, der Zustand
    dazwischen in `_Uebernahme` (tests/test_import_schnitt.py hält den
    Stand golden):
      vorbereiten -> Gelände aus Linien -> je Kandidat übernehmen ->
      Kanten verknüpfen -> Lage prüfen -> Gebiet ableiten -> Anwendung
      und Bericht schreiben.
    """
    u = _uebernahme_vorbereiten(spec, case_dir, import_id, decisions,
                                unit_factor, offset, rotation_deg)

    linien_ent = _linien_fuer_gelaende(u, decisions, terrain_from_lines)
    if linien_ent:
        _gelaende_aus_linien(u, linien_ent)

    for d in decisions:
        _kandidat_uebernehmen(u, d)

    # ---- Aus den Kanten das Gelände ableiten ----------------------------
    # Früher wurden Ober- und Unterkante hier über den LAYERNAMEN gepaart
    # (`_paar_schluessel`). Hießen die Layer „BK_oben" und
    # „Boeschung_unten", fiel die Paarung aus und beide wurden einzelne
    # Bruchkanten. Jetzt entscheidet die LAGE, und die Rolle bleibt am
    # Objekt erhalten — nachträglich änderbar.
    if spec.terrain is not None and spec.terrain.kanten:
        from .kanten import verknuepfen
        u.report.extend(verknuepfen(spec))

    # die WIRKSAMEN Lage-Parameter (ggf. aus der Verortung des Falls ergänzt)
    _lage_pruefen(u, u.unit_factor, u.offset, u.rotation_deg)

    if derive_domain and u.terrain_bbox is not None:
        _gebiet_ableiten(u)

    _anwendung_schreiben(u, decisions, u.unit_factor, u.offset, derive_domain,
                         terrain_from_lines, u.rotation_deg)
    return {"report": u.report}


def import_neu_ableiten(spec, case_dir: Path, import_id: str,
                        rollen: dict | None = None) -> dict:
    """
    Den Import mit seiner GESPEICHERTEN Anwendung erneut ableiten: baut
    alle derived/-Dateien neu und ersetzt die Fallobjekte (idempotent).
    `derive_domain` wird dabei bewusst NICHT wiederholt — Gebiet und
    Anfangswasserspiegel sind inzwischen ggf. Handarbeit.

    `rollen` ({kandidat: rolle}) ändert die ZUORDNUNG nachträglich — eine
    als Querschnitt übernommene Trasse wird so z. B. zur Bruchkante, ohne
    Neu-Upload. Die geänderte Wahl wird in der Anwendung gespeichert und
    gilt damit auch für jedes künftige Neu-Ableiten.
    """
    pfad = case_dir / "imports" / import_id / "anwendung.json"
    a = json.loads(pfad.read_text())
    decisions = a.get("decisions") or []
    if rollen:
        for cand, rolle in rollen.items():
            for d in decisions:
                if d.get("candidate") == cand:
                    d["role"] = rolle
                    break
            else:
                decisions.append({"candidate": cand, "role": rolle})
        a["decisions"] = decisions
        pfad.write_text(json.dumps(a, ensure_ascii=False, indent=1))
    return apply_import(
        spec, case_dir, import_id, decisions,
        unit_factor=float(a.get("unit_factor", 1.0)),
        offset=a.get("offset"),
        derive_domain=False,
        terrain_from_lines=a.get("terrain_from_lines"),
        rotation_deg=float(a.get("rotation_deg") or 0.0))
