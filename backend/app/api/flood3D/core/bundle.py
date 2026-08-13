"""
Ein Fall als ``case.zip`` — das Paket, mit dem anderswo gerechnet wird.

Genau dieses Paket bekommt der Local Companion auf Fabios Rechner UND der
RunPod-Worker in der Cloud; beide fahren denselben ``local_runner.py``.
Deshalb liegt der Bau hier und nicht im Endpunkt: Zwei Kopien davon wären
zwei Gelegenheiten, verschieden zu altern.

Inhalt:
    case/…                 vom casebuilder erzeugter OpenFOAM-Fall
    case.yaml              die Spezifikation selbst
    run_id.txt             reservierte Lauf-Kennung
    <Datenreferenzen>      Geländeraster, Pinselebene, STLs … (relativ
                           referenziert, s. CaseSpec.datei_referenzen)
    quagg_runtime/flood3D  Core UND Runner DIESES Servers

Warum der Core mitreist: Die eingebackene Kopie im Image darf beliebig alt
sein — der Läufer zieht die mitgelieferte vor. Ohne das scheitert jeder
auswärtige Lauf, sobald die Spezifikation ein neues Feld bekommt („Extra
inputs are not permitted"), bis der Nutzer sein Image neu zieht.
"""
from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from pathlib import Path


class BundleFehler(ValueError):
    """Vorhersehbar: fehlende Datendateien oder Geometrieprobleme."""


def runtime_baum_kopieren(case_out: Path) -> Path:
    """
    Den mitreisenden Code (``quagg_runtime/flood3D``) unter ``case_out``
    ablegen: ``__init__.py``, der GANZE ``core/``-Baum und der Runner.

    Eigene Funktion, weil der Bundle-Wächter-Test GENAU diesen Baum in
    einer Container-Simulation importiert — Bundle und Test dürfen nie
    zwei verschiedene Vorstellungen davon haben, was verschifft wird.
    Vertrag des Baums: importierbar mit ``flood3D`` als Top-Level und
    OHNE fastapi/boto3 (der Container hat nur numpy scipy pandas pyarrow
    matplotlib pyyaml pydantic shapely trimesh).
    """
    hier = Path(__file__).resolve().parent.parent          # …/flood3D
    rt = Path(case_out) / "quagg_runtime" / "flood3D"
    rt.mkdir(parents=True)
    shutil.copy2(hier / "__init__.py", rt / "__init__.py")
    # der GANZE Core-Baum: core/extract ist ein Unterpaket, ohne das
    # bricht der Nachlauf mit ModuleNotFoundError ab
    shutil.copytree(hier / "core", rt / "core",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    # der Runner reist mit (local_runner._runner_uebergabe übernimmt ihn)
    eng = rt / "engines" / "local"
    eng.mkdir(parents=True)
    shutil.copy2(hier / "engines" / "local" / "local_runner.py",
                 eng / "local_runner.py")
    return rt


def fehlende_dateien(spec, case_dir: Path) -> list[str]:
    """
    Relativ referenzierte Dateien, die neben dem Fall fehlen.

    VOR dem Bau prüfen: sonst liefe die Simulation durch und der Nachlauf
    scheiterte erst danach an der fehlenden Datei — teuer und ärgerlich
    (genau so ist 2026-08-11 ein Lauf ohne Gelände entstanden).
    """
    return [n for n in spec.datei_referenzen() if not (Path(case_dir) / n).is_file()]


def bundle_bauen(spec, case_dir: Path, run_id: str,
                 checkpoint: dict | None = None) -> bytes:
    """``case.zip`` als Bytes. Wirft ``BundleFehler`` mit lesbarem Grund.

    ``checkpoint``: Speicherpunkt-Anweisung fuer den Laeufer (vorsignierte
    PUT-URL + Mindestabstand) — nur der Cloud-Weg setzt sie; der Companion
    auf der Nutzer-Maschine braucht keine (dort liegen die Daten schon
    lokal und Pause/Fortsetzen existiert).
    """
    from .casebuilder import build_case

    case_dir = Path(case_dir)
    fehlend = fehlende_dateien(spec, case_dir)
    if fehlend:
        raise BundleFehler("Für den auswärtigen Lauf fehlen Datendateien "
                           f"neben dem Fall: {', '.join(fehlend)}")

    referenced = spec.datei_referenzen()
    with tempfile.TemporaryDirectory() as td:
        case_out = Path(td) / "case"
        info = build_case(spec, case_out, case_dir)
        if info["problems"]:
            raise BundleFehler("Geometrieprobleme: " + "; ".join(info["problems"]))
        (case_out / "case.yaml").write_text((case_dir / "case.yaml").read_text())
        (case_out / "run_id.txt").write_text(run_id)
        # Netzvorschau-Kennzahlen mitgeben: das Netz-Tor im Laeufer warnt,
        # wenn die gebaute Zellzahl weit von der Vorschau abweicht (nur
        # Warnung — die Vorschau ist laut Entscheidung nur eine Vorschau)
        vp = case_dir / "derived" / "mesh_preview" / "mesh_preview.json"
        if vp.is_file():
            shutil.copy2(vp, case_out / "mesh_preview.json")
        if checkpoint:
            import json as _json
            (case_out / "checkpoint.json").write_text(_json.dumps(checkpoint))

        for name in referenced:
            ziel = case_out / name
            ziel.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(case_dir / name, ziel)

        runtime_baum_kopieren(case_out)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for f in sorted(case_out.rglob("*")):
                if f.is_file():
                    z.write(f, str(f.relative_to(case_out)))
        return buf.getvalue()
