"""
Messlatte — dieselben Zahlen vor und nach jeder Etappe der Sanierung
(docs/AUDIT_FLOOD3D_FALLSPEZIFISCH.md), an Fällen auf der Platte und an
den Referenzfällen.

    venv/bin/python -m app.api.flood3D.tests.messlatte <cases_root> [fall ...]

Hier schreibt NICHTS: kein Endpunkt, keine case.yaml, keine derived-Datei.
Jede Zahl entsteht im Speicher aus dem, was `TerrainField.from_spec` auch
dem Vernetzer geben würde. Die Fälle unter data/cases sind nicht
versioniert — wer sie anfasst, hat kein Netz.

Was gemessen wird (je Fall):

    anteil_ausserhalb   Anteil der Geländeknoten des Gebiets, die außerhalb
                        der Zellfläche des Höhenrasters liegen — dort ist
                        nichts vermessen, und was dort steht, hat das
                        Werkzeug erfunden.
    randspanne          Höhenspanne der Randzellen des Rasters. Ist sie
                        null, schreibt eine Fortführung des Randwerts eine
                        Ebene fort und bleibt unsichtbar; ist sie groß,
                        entstehen Rinnen und Rücken (das Phantom-Gerinne).
    phantom_knoten      Außenknoten mehr als 10 cm unter dem Plateau
                        (= höchste Randzelle), phantom_m3 das Volumen
                        darunter — beides müsste null sein, wenn außerhalb
                        eine Ebene gilt.
    nodata_zellen       NODATA-Zellen in den DATEN des Rasters (nicht im
                        Kopf). Null heißt: die Maske „nicht gemessen" ist
                        beim Import verloren gegangen.
    pinsel_wirkungslos  Anteil der Fläche, auf dem ein Pinselstrich keine
                        Wirkung hätte, weil eine Sollhöhen-Operation ihn
                        überschreibt — `jetzt` fragt das Werkzeug selbst,
                        `vorher` stellt die Reihenfolge von vor dem
                        2026-09-22 nach (Pinsel vor dem ganzen Stapel).
    sculpt_dz_unter_abgeleitet
                        größter Pinselhub, der unter einer abgeleiteten
                        Fläche lag und dort unsichtbar war — seit der neuen
                        Reihenfolge wirkt er (Kur „Striche verwerfen").
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from ..core.casespec import CaseSpec
from ..core.sculpt import lade_ebene
from ..core.terrain import SOLLHOEHEN_TYPEN, TerrainField, randkrone

PLATEAU_TOLERANZ = 0.10     # m: ab hier gilt ein Außenknoten als „darunter"
PINSEL_PROBE = 1.0          # m: Testhub des gedachten Pinselstrichs
PINSEL_SCHWELLE = 0.5       # m: weniger als der halbe Hub kommt an = wirkungslos

_KOPF = ("ncols", "nrows", "xllcorner", "yllcorner", "cellsize", "nodata_value")


def _asc_lesen(pfad: Path) -> tuple[dict, np.ndarray]:
    """Kopf + Daten (Süd nach Nord, NODATA als NaN) — ohne jede Füllung."""
    kopf: dict[str, float] = {}
    zeilen: list[np.ndarray] = []
    with open(pfad) as f:
        for zeile in f:
            teile = zeile.split()
            if not teile:
                continue
            if teile[0].lower() in _KOPF:
                kopf[teile[0].lower()] = float(teile[1])
            else:
                zeilen.append(np.array(teile, dtype=float))
    z = np.vstack(zeilen)[::-1]
    nodata = kopf.get("nodata_value")
    if nodata is not None:
        z = np.where(z == nodata, np.nan, z)
    return kopf, z


def raster_masse(spec: CaseSpec, base_dir: Path) -> dict | None:
    """Ausdehnung (Zellfläche), Randspanne, Plateau und NODATA des Rasters."""
    quelle = spec.terrain.base.source
    if quelle.startswith("flat:") or not quelle.lower().endswith(".asc"):
        return None
    kopf, z = _asc_lesen(Path(base_dir) / quelle)
    cs = kopf["cellsize"]
    # Randzellen wie der Leser sie sieht (terrain.randkrone): gemessene
    # Zellen am Rand der Vermessung — bei einem lückenlosen Raster sind das
    # die äußeren Zeilen und Spalten, bei einem TIN mit NODATA sein Saum
    kr = randkrone(z, ~np.isnan(z))
    return {
        "x0": kopf["xllcorner"], "y0": kopf["yllcorner"],
        "x1": kopf["xllcorner"] + kopf["ncols"] * cs,
        "y1": kopf["yllcorner"] + kopf["nrows"] * cs,
        "nodata_zellen": int(np.isnan(z).sum()),
        "zellen": int(z.size),
        "randspanne": (kr["rand_max"] - kr["rand_min"]) if kr else 0.0,
        "plateau": kr["krone"] if kr else float("nan"),
    }


def gelaende_aussen(spec: CaseSpec, base_dir: Path, raster: dict) -> dict:
    """Was steht dort, wo das Raster nicht hinreicht?"""
    feld = TerrainField.from_spec(spec.terrain, spec.domain, base_dir)
    xx, yy = feld.mesh_xy()
    aussen = ((xx < raster["x0"]) | (xx > raster["x1"])
              | (yy < raster["y0"]) | (yy > raster["y1"]))
    res = feld.resolution
    tiefe = np.clip(raster["plateau"] - feld.z, 0.0, None)
    return {
        "knoten": int(aussen.size),
        "anteil_ausserhalb": float(aussen.mean()),
        "ueberlappt": bool((~aussen).any()),
        "phantom_knoten": int((aussen & (tiefe > PLATEAU_TOLERANZ)).sum()),
        "phantom_m3": float((tiefe * aussen).sum() * res * res),
        "z_min": float(feld.z.min()), "z_max": float(feld.z.max()),
    }


def pinsel_wirkung(spec: CaseSpec, base_dir: Path) -> dict:
    """
    Ein gedachter Pinselhub von 1 m — wie viel davon überlebt die
    Operationen?

    `jetzt` fragt das Werkzeug selbst (TerrainField.pinsel_sperre), misst
    also die ECHTE Schnittstelle und nicht eine Nachbildung. `vorher` stellt
    zum Vergleich die Reihenfolge von vor dem 2026-09-22 nach (Pinsel vor
    dem ganzen Stapel) — die Zahl, an der die Etappe gemessen wird.
    """
    t = spec.terrain
    ops = list(t.operations)
    abgeleitet = [o for o in ops if getattr(o, "aus_kanten", None)]
    eigene = [o for o in ops if not getattr(o, "aus_kanten", None)]

    feld = TerrainField.from_spec(t, spec.domain, base_dir)
    sperre = feld.pinsel_sperre(PINSEL_PROBE, PINSEL_SCHWELLE)
    eigene_soll = [o for o in eigene if o.type in SOLLHOEHEN_TYPEN]
    if sperre is not None:
        jetzt = sperre["anteil"]
    else:
        # None heißt „nichts sperrt" — oder „zu groß für die Maske"
        jetzt = 0.0 if not eigene_soll else None

    basis_t = t.model_copy(deep=True)
    basis_t.operations = []
    basis_t.sculpt = None
    basis = TerrainField.from_spec(basis_t, spec.domain, base_dir)

    def lauf(z_start: np.ndarray, welche: list) -> np.ndarray:
        f = TerrainField(x0=basis.x0, y0=basis.y0,
                         resolution=basis.resolution, z=z_start.copy())
        f._ops = ops                 # Außenkante sucht hier ihre Bezugskante
        f._base_dir = Path(base_dir)
        for op in welche:
            f.apply(op)
        return f.z

    ref = lauf(basis.z, ops)
    vorher = np.abs(lauf(basis.z + PINSEL_PROBE, ops) - ref) < PINSEL_SCHWELLE

    aus = {
        "ops": len(ops), "ops_abgeleitet": len(abgeleitet),
        "ops_eigene_sollhoehe": len(eigene_soll),
        "pinsel_wirkungslos_vorher": float(vorher.mean()),
        "pinsel_wirkungslos_jetzt": jetzt,
        "sculpt_dz_unter_abgeleitet": None,
    }
    if t.sculpt:
        # was unter einer abgeleiteten Fläche lag und jetzt wirkt
        from ..core.sculpt import sichtbar_geworden
        info = sichtbar_geworden(spec, Path(base_dir))
        aus["sculpt_dz_unter_abgeleitet"] = info["max_dz"] if info else 0.0
    return aus


def messe_fall(case_dir: Path) -> dict:
    """Alle Kennzahlen eines Falls; jede Gruppe fällt für sich aus."""
    case_dir = Path(case_dir)
    spec = CaseSpec.from_yaml(case_dir / "case.yaml")
    aus: dict = {"fall": case_dir.name}
    if spec.terrain is None or spec.domain is None:
        aus["hinweis"] = "ohne Gelände oder Gebiet"
        return aus
    x0, y0, x1, y1 = spec.domain.extent
    aus["gebiet"] = f"{x1 - x0:.0f}×{y1 - y0:.0f}"
    raster = None
    try:
        raster = raster_masse(spec, case_dir)
    except Exception as e:                      # Kennzahl fehlt, Lauf geht weiter
        aus["raster_fehler"] = str(e)[:80]
    if raster is None:
        aus["raster"] = "—"
    else:
        aus["raster"] = f"{raster['x1'] - raster['x0']:.0f}×{raster['y1'] - raster['y0']:.0f}"
        aus["randspanne"] = raster["randspanne"]
        aus["nodata_zellen"] = raster["nodata_zellen"]
        try:
            aus.update(gelaende_aussen(spec, case_dir, raster))
        except Exception as e:
            aus["aussen_fehler"] = str(e)[:80]
    try:
        aus.update(pinsel_wirkung(spec, case_dir))
    except Exception as e:
        aus["pinsel_fehler"] = str(e)[:80]
    return aus


_SPALTEN = [
    ("fall", "Fall", "{}"), ("gebiet", "Gebiet", "{}"), ("raster", "Raster", "{}"),
    ("anteil_ausserhalb", "außerhalb", "{:.1%}"),
    ("randspanne", "Randspanne", "{:.2f} m"),
    ("phantom_knoten", "Phantom-Knoten", "{}"),
    ("phantom_m3", "Phantom m³", "{:.1f}"),
    ("nodata_zellen", "NODATA", "{}"),
    ("pinsel_wirkungslos_vorher", "Pinsel tot vorher", "{:.0%}"),
    ("pinsel_wirkungslos_jetzt", "Pinsel tot jetzt", "{:.0%}"),
    ("sculpt_dz_unter_abgeleitet", "dz unter abgeleitet", "{:.2f}"),
]


def tabelle(zeilen: list[dict]) -> str:
    kopf = "| " + " | ".join(t for _, t, _ in _SPALTEN) + " |"
    trenn = "|" + "|".join("---" for _ in _SPALTEN) + "|"
    aus = [kopf, trenn]
    for z in zeilen:
        werte = []
        for k, _, fmt in _SPALTEN:
            v = z.get(k)
            werte.append("—" if v is None else fmt.format(v))
        aus.append("| " + " | ".join(werte) + " |")
    fehler = [f"{z['fall']}: {z[k]}" for z in zeilen for k in z if k.endswith("_fehler")]
    return "\n".join(aus + [""] + fehler)


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    wurzel = Path(argv[0])
    namen = argv[1:] or sorted(p.name for p in wurzel.iterdir()
                               if (p / "case.yaml").exists())
    zeilen = []
    for name in namen:
        try:
            zeilen.append(messe_fall(wurzel / name))
        except Exception as e:
            zeilen.append({"fall": name, "lade_fehler": str(e)[:80]})
    if "--json" in sys.argv:
        print(json.dumps(zeilen, indent=1, ensure_ascii=False))
    else:
        print(tabelle(zeilen))
    return 0


if __name__ == "__main__":
    sys.exit(main([a for a in sys.argv[1:] if not a.startswith("--")]))
