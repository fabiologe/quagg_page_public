"""Der Server-Kernel der CDE (Teil XIV, G7): 3D-Booleans, die im Browser
nicht laufen sollen.

Der Client rechnet 2,5D (Raster, Linien, Sweeps) selbst; was ECHTE
Verschneidungen unregelmaessiger Koerper braucht — Verfuellung = Graben minus
Rohr, Aussparungen, Kollisionen — kommt hierher: manifold3d ueber trimesh,
dieselbe Kette wie in flood-3D (`flood3D/core/solids._sicher_abziehen` ist
das Muster, KOPIERT, nie importiert — Hausregel).

Das MESHPAKET ist der Draht: `[u32 kopfLaenge][Kopf-JSON utf8][Float64-Bloecke
in Kopf-Reihenfolge]`. Ein Block ist eine UNINDIZIERTE Dreiecksliste (9 Zahlen
je Dreieck, Welt-XYZ, three-Konvention: Y ist oben) — exakt die Form, die der
Kernel des Clients fuehrt. Der Kopf nennt je Block Name, Form und Dreieckszahl;
`eingaben` ordnet Schlitze den Bloecken zu. Antwort im selben Format.

ERGEBNISPRUEFUNG IST PFLICHT: manifold liefert auf zweifelhaftem Eingang
keine Exception, sondern still Muell — mal ausgehoehlt, mal Material
HINZUGEFUEGT. Deshalb: Eingaenge muessen Volumen sein (`is_volume`), und das
Ergebnis muss die Groessenordnung einhalten (Differenz <= A, Vereinigung >=
max(A, B), Schnitt <= min(A, B)). Scheitert das, gibt es einen GRUND, keinen
halben Koerper. Kein blender-Rueckfall: die Binary fehlt auf dem Server.
"""

from __future__ import annotations

import json
import struct
import time

import numpy as np
import trimesh

VERSION = 1
ENGINE = "manifold"
MAX_DREIECKE = 2_000_000
MAX_BYTES = MAX_DREIECKE * 9 * 8 + 1_000_000
TIMEOUT_S = 30
OPS = ("booleDifferenz", "booleVereinigung", "booleSchnitt", "kollisionen", "huelle")
_DREIECKS_FORMEN = ("mesh", "koerper")


class GeometrieAbgelehnt(Exception):
    """Fachlich nicht rechenbar (422): kaputtes Paket, offener Koerper, unbekannte Op."""


class GeometrieZuGross(Exception):
    """Ueber den Limits (413)."""


class GeometrieZeit(Exception):
    """Zu langsam (504)."""


def faehigkeiten() -> dict:
    return {
        "version": VERSION,
        "ops": list(OPS),
        "limits": {"maxDreiecke": MAX_DREIECKE, "maxBytes": MAX_BYTES, "timeoutS": TIMEOUT_S},
        "engine": f"trimesh {trimesh.__version__} + {ENGINE}",
    }


# ── Meshpaket ────────────────────────────────────────────────────────────────

def _werte_je(form: str) -> int:
    return 9 if form in _DREIECKS_FORMEN else 3


def lese_meshpaket(daten: bytes) -> tuple[dict, dict[str, np.ndarray]]:
    """Kopf + Bloecke (Name -> flaches Float64-Array). Wirft bei jedem Formbruch."""
    if len(daten) < 4:
        raise GeometrieAbgelehnt("Meshpaket zu kurz")
    (n,) = struct.unpack_from("<I", daten, 0)
    if 4 + n > len(daten):
        raise GeometrieAbgelehnt("Meshpaket: Kopf reicht ueber das Paket hinaus")
    try:
        kopf = json.loads(bytes(daten[4:4 + n]).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as fehler:
        raise GeometrieAbgelehnt(f"Meshpaket: Kopf unlesbar ({fehler})") from fehler
    if not isinstance(kopf, dict) or kopf.get("version") != VERSION:
        raise GeometrieAbgelehnt(f"Meshpaket: Version {kopf.get('version') if isinstance(kopf, dict) else '?'} statt {VERSION}")
    off = 4 + n
    bloecke: dict[str, np.ndarray] = {}
    for b in kopf.get("bloecke", []):
        form = b.get("form")
        anzahl = int(b.get("triCount", b.get("n", 0)))
        werte = anzahl * _werte_je(form)
        groesse = werte * 8
        if off + groesse > len(daten):
            raise GeometrieAbgelehnt(f"Meshpaket: Block „{b.get('name')}“ reicht ueber das Paket hinaus")
        bloecke[str(b.get("name"))] = np.frombuffer(daten, dtype="<f8", count=werte, offset=off).copy()
        off += groesse
    if off != len(daten):
        raise GeometrieAbgelehnt(f"Meshpaket: {len(daten) - off} Bytes ohne Block am Ende")
    return kopf, bloecke


def schreibe_meshpaket(kopf: dict, bloecke: list[tuple[str, str, np.ndarray]]) -> bytes:
    """`bloecke` = (name, form, flaches Float64-Array). Der Kopf bekommt die Blockliste angehaengt."""
    # Schluesselreihenfolge und Trennzeichen EXAKT wie JSON.stringify im
    # Client (Meshpaket.js) — dann ist dasselbe Paket auf beiden Seiten
    # byteidentisch, und die Golden-Datei prueft beide Schreiber zugleich.
    k = {"version": VERSION, **{a: b for a, b in kopf.items() if a not in ("version", "bloecke")}}
    k["bloecke"] = [
        ({"name": name, "form": form, "triCount": len(arr) // 9} if form in _DREIECKS_FORMEN
         else {"name": name, "form": form, "n": len(arr) // 3})
        for name, form, arr in bloecke
    ]
    kj = json.dumps(k, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    out = bytearray(struct.pack("<I", len(kj)))
    out += kj
    for _, _, arr in bloecke:
        out += np.ascontiguousarray(arr, dtype="<f8").tobytes()
    return bytes(out)


# ── Netze ────────────────────────────────────────────────────────────────────

def als_trimesh(positions: np.ndarray) -> trimesh.Trimesh:
    """Unindizierte Dreiecksliste -> Trimesh mit verschmolzenen Ecken (1 mm).

    NACH dem Verschmelzen fallen entartete Flaechen weg (2026-09-09): manifold
    laesst an einer Schnittkurve Splitter unter 1 mm, die das 1-mm-Verschmelzen
    beim WIEDERLESEN zu Nullflaechen macht — das Ergebnis der ersten Differenz
    kam als "kein geschlossener Koerper" zurueck, sobald es ein zweites Mal
    ueber das Paket reiste (Kanalgraben: Graben minus acht Rohre). Ohne die
    Nullflaechen ist derselbe Koerper wieder wasserdicht.
    """
    tri = np.asarray(positions, dtype=np.float64).reshape(-1, 3)
    faces = np.arange(len(tri)).reshape(-1, 3)
    m = trimesh.Trimesh(vertices=tri, faces=faces, process=False)
    m.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=3)
    gut = m.nondegenerate_faces()
    if not bool(np.all(gut)):
        m.update_faces(gut)
        m.remove_unreferenced_vertices()
    return m


def als_positions(m: trimesh.Trimesh) -> np.ndarray:
    return np.asarray(m.triangles, dtype="<f8").reshape(-1)


def pruefe_ergebnis(op: str, ergebnis: trimesh.Trimesh, a: trimesh.Trimesh, b: trimesh.Trimesh | None) -> str | None:
    """None = in Ordnung, sonst der Grund. Das Muster aus flood-3D `_sicher_abziehen`."""
    if ergebnis is None or len(ergebnis.faces) == 0:
        return "Ergebnis ist leer"
    if not ergebnis.is_volume:
        return "Ergebnis ist kein geschlossener Koerper"
    eps = 1e-6
    va = abs(a.volume)
    vb = abs(b.volume) if b is not None else 0.0
    ve = abs(ergebnis.volume)
    if op == "booleDifferenz" and ve > va * (1 + eps) + eps:
        return "Differenz groesser als A — invertierter Schnitt"
    if op == "booleVereinigung" and ve < max(va, vb) * (1 - eps) - eps:
        return "Vereinigung kleiner als der groessere Eingang"
    if op == "booleSchnitt" and ve > min(va, vb) * (1 + eps) + eps:
        return "Schnitt groesser als der kleinere Eingang"
    return None


def _boole(op: str, a: trimesh.Trimesh, b: trimesh.Trimesh) -> trimesh.Trimesh:
    if op == "booleDifferenz":
        return trimesh.boolean.difference([a, b], engine=ENGINE)
    if op == "booleVereinigung":
        return trimesh.boolean.union([a, b], engine=ENGINE)
    if op == "booleSchnitt":
        return trimesh.boolean.intersection([a, b], engine=ENGINE)
    raise GeometrieAbgelehnt(f"Operation „{op}“ ist unbekannt")


def _ueberlappen(a: trimesh.Trimesh, b: trimesh.Trimesh, toleranz: float = 0.01) -> bool:
    return bool(np.all(a.bounds[0] <= b.bounds[1] + toleranz) and np.all(b.bounds[0] <= a.bounds[1] + toleranz))


def op(name: str, meshes: dict[str, trimesh.Trimesh | list[trimesh.Trimesh]], parameter: dict | None = None) -> dict:
    """Rechnet eine Operation. Rueckgabe {ergebnis: Trimesh|list|None, form, warnungen}."""
    parameter = parameter or {}
    warnungen: list[str] = []
    if name not in OPS:
        raise GeometrieAbgelehnt(f"Operation „{name}“ ist unbekannt")

    if name in ("booleDifferenz", "booleVereinigung", "booleSchnitt"):
        a, b = meshes.get("a"), meshes.get("b")
        if a is None or b is None:
            raise GeometrieAbgelehnt(f"{name}: Schlitze a und b sind Pflicht")
        # b darf eine LISTE sein (Differenz/Vereinigung): gekettet IN-PROCESS,
        # ohne Rundreise ueber das Paket zwischen den Schritten (2026-09-09).
        b_liste = b if isinstance(b, list) else [b]
        if isinstance(b, list) and name == "booleSchnitt":
            raise GeometrieAbgelehnt("booleSchnitt: b muss ein einzelner Koerper sein")
        if not b_liste:
            raise GeometrieAbgelehnt(f"{name}: b ist leer")
        if not a.is_volume:
            raise GeometrieAbgelehnt(f"{name}: Eingang „a“ ist kein geschlossener Koerper")
        for i, m in enumerate(b_liste):
            if not m.is_volume:
                raise GeometrieAbgelehnt(f"{name}: Eingang „b{'[' + str(i) + ']' if isinstance(b, list) else ''}“ ist kein geschlossener Koerper")
        if name == "booleSchnitt" and not _ueberlappen(a, b_liste[0]):
            return {"ergebnis": None, "form": "koerper", "warnungen": ["schnitt_leer: die Huellen beruehren sich nicht"]}
        neu = a
        try:
            for bi in b_liste:
                if name == "booleDifferenz" and not _ueberlappen(neu, bi):
                    continue                      # ein Rohr ausserhalb des Grabens aendert nichts
                neu = _boole(name, neu, bi)
                if name != "booleSchnitt" and not neu.is_volume:
                    # Zwischenstand bereinigen wie beim Wiederlesen — Splitter unter 1 mm.
                    neu = als_trimesh(als_positions(neu))
        except Exception as fehler:  # noqa: BLE001 — manifold wirft frei
            raise GeometrieAbgelehnt(f"{name}: {type(fehler).__name__}: {fehler}") from fehler
        if name == "booleSchnitt" and (neu is None or len(neu.faces) == 0):
            return {"ergebnis": None, "form": "koerper", "warnungen": ["schnitt_leer"]}
        groesstes_b = max(b_liste, key=lambda m: abs(float(m.volume)))
        grund = pruefe_ergebnis(name, neu, a, groesstes_b)
        if grund:
            raise GeometrieAbgelehnt(f"{name}: {grund}")
        if isinstance(b, list):
            warnungen.append(f"gekettet: {len(b_liste)} Koerper in einem Aufruf")
        return {"ergebnis": neu, "form": "koerper", "warnungen": warnungen}

    if name == "huelle":
        m = meshes.get("mesh")
        if m is None:
            raise GeometrieAbgelehnt("huelle: Schlitz mesh ist Pflicht")
        return {"ergebnis": m.convex_hull, "form": "koerper", "warnungen": warnungen}

    # kollisionen: paarweiser Schnitt aller Koerper, deren Huellen sich beruehren.
    liste = meshes.get("koerper") or []
    if not isinstance(liste, list) or len(liste) < 2:
        raise GeometrieAbgelehnt("kollisionen: mindestens zwei Koerper")
    paare = []
    for i, ki in enumerate(liste):
        if not ki.is_volume:
            warnungen.append(f"koerper[{i}] ist kein geschlossener Koerper — uebersprungen")
    for i in range(len(liste)):
        for j in range(i + 1, len(liste)):
            a, b = liste[i], liste[j]
            if not (a.is_volume and b.is_volume) or not _ueberlappen(a, b):
                continue
            try:
                s = trimesh.boolean.intersection([a, b], engine=ENGINE)
            except Exception as fehler:  # noqa: BLE001
                warnungen.append(f"koerper[{i}]∩koerper[{j}]: {type(fehler).__name__}: {fehler}")
                continue
            if s is None or len(s.faces) == 0 or not s.is_volume:
                continue
            v = abs(float(s.volume))
            if v > 1e-9:
                paare.append({"a": i, "b": j, "volumen": v})
    return {"ergebnis": paare, "form": "paare", "warnungen": warnungen}


# ── Der Endpunkt-Kern ────────────────────────────────────────────────────────

def rechne(daten: bytes) -> bytes:
    """Meshpaket rein, Meshpaket raus. Wirft die drei Fehlerklassen."""
    if len(daten) > MAX_BYTES:
        raise GeometrieZuGross(f"Paket {len(daten)} Bytes ueber {MAX_BYTES}")
    kopf, bloecke = lese_meshpaket(daten)
    name = str(kopf.get("op", ""))
    dreiecke = sum(len(a) // 9 for b, a in bloecke.items())
    if dreiecke > MAX_DREIECKE:
        raise GeometrieZuGross(f"{dreiecke} Dreiecke ueber {MAX_DREIECKE}")
    start = time.perf_counter()

    meshes: dict = {}
    for schlitz, verweis in (kopf.get("eingaben") or {}).items():
        if isinstance(verweis, list):
            meshes[schlitz] = [als_trimesh(bloecke[n]) for n in verweis]
        else:
            if verweis not in bloecke:
                raise GeometrieAbgelehnt(f"Schlitz „{schlitz}“ zeigt auf fehlenden Block „{verweis}“")
            meshes[schlitz] = als_trimesh(bloecke[verweis])

    r = op(name, meshes, kopf.get("parameter") or {})
    dauer = time.perf_counter() - start
    if dauer > TIMEOUT_S:
        raise GeometrieZeit(f"{name}: {dauer:.1f} s ueber {TIMEOUT_S} s")

    antwort = {"ok": True, "op": name, "warnungen": r["warnungen"], "dauerMs": round(dauer * 1000)}
    ausgabe: list[tuple[str, str, np.ndarray]] = []
    if r["form"] == "paare":
        antwort["ergebnis"] = {"form": "paare", "paare": r["ergebnis"]}
    elif r["ergebnis"] is None:
        antwort["ergebnis"] = None
    else:
        m = r["ergebnis"]
        antwort["ergebnis"] = {"form": "koerper", "block": "ergebnis", "closed": bool(m.is_volume),
                               "volumen": abs(float(m.volume))}
        ausgabe.append(("ergebnis", "koerper", als_positions(m)))
    return schreibe_meshpaket(antwort, ausgabe)
