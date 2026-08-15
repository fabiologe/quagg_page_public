"""
staende — benannte Speicherstände der Fallgeometrie.

Warum eine VOLLKOPIE des Fallordners und kein Spec-Schnappschuss: Die
Geometrie eines Falls steckt nicht allein in ``case.yaml``. Die
Pinsel-Ebene ``sculpt.npz`` wird bei jedem Strich unter demselben Namen
überschrieben, und die gedrehten Geländeraster unter ``derived/`` tragen
einen Stempel aus der Gittergeometrie, nicht aus ihrem Inhalt. Ein
Schnappschuss, der nur die Spezifikation sichert, zeigt nach dem
Zurückholen auf Dateien mit fremdem Inhalt — genau die Falle, an der der
Undo-Stapel im Client bewusst vorbeigebaut ist.

Ein Stand ist deshalb der ganze Fallordner, ohne zweierlei: die
Netzvorschau (``derived/mesh_preview``, 17–26 MB Ableitung zu EINEM
netz_hash) und die Stände selbst. Damit kostet ein Stand unter 2 MB und
bleibt mit ``cp -r`` wiederherstellbar, auch ohne dieses Werkzeug.
"""
from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path

STAENDE = "staende"
_VORSCHAU = ("derived", "mesh_preview")
AUTO_BEHALTEN = 5            # ältere Sicherheitsnetze räumt das Anlegen weg
_UNWORT = re.compile(r"[^a-z0-9]+")


class StandFehler(ValueError):
    """Vorhersehbar: unbekannter Stand, Fall ohne case.yaml."""


def staende_dir(case_dir: str | Path) -> Path:
    return Path(case_dir) / STAENDE


def _slug(name: str) -> str:
    roh = (name or "").strip().lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        roh = roh.replace(a, b)
    return _UNWORT.sub("-", roh).strip("-")[:40] or "stand"


def _uebergehen(rel: Path) -> bool:
    """Was nie in einen Stand gehört (Pfad relativ zum Fallordner)."""
    teile = rel.parts
    return teile[:1] == (STAENDE,) or teile[:2] == _VORSCHAU


def _bytes(pfad: Path) -> int:
    return sum(p.stat().st_size for p in Path(pfad).rglob("*") if p.is_file())


def _kopiere_fall(case_dir: Path, ziel: Path) -> None:
    """Fallordner spiegeln — ohne Stände und ohne Netzvorschau."""
    case_dir = Path(case_dir).resolve()

    def ignorieren(verzeichnis: str, namen: list[str]) -> set[str]:
        rel = Path(verzeichnis).resolve().relative_to(case_dir)
        return {n for n in namen
                if _uebergehen(rel / n) or n == "__pycache__"}

    shutil.copytree(case_dir, ziel, ignore=ignorieren, dirs_exist_ok=True)


def _case_hash(yaml_pfad: Path) -> str | None:
    """Hash der gesicherten Spec — Chip in der Oberfläche, kein Vertrag.
    Unlesbare Spec ist kein Grund, den Stand zu verweigern."""
    try:
        from .casespec import CaseSpec
        return CaseSpec.from_yaml(yaml_pfad).case_hash()
    except Exception:        # noqa: BLE001
        return None


def _stand_dir(case_dir: str | Path, stand_id: str) -> Path:
    if not stand_id or "/" in stand_id or stand_id.startswith("."):
        raise StandFehler(f"Ungültige Standkennung: {stand_id!r}")
    d = staende_dir(case_dir) / stand_id
    if not (d / "stand.json").is_file():
        raise StandFehler(f"Stand {stand_id} unbekannt.")
    return d


def _info_lesen(stand_dir: Path) -> dict:
    info = json.loads((stand_dir / "stand.json").read_text(encoding="utf-8"))
    info.setdefault("id", stand_dir.name)
    return info


def _auto_aufraeumen(wurzel: Path) -> None:
    """Nur die jüngsten AUTO_BEHALTEN Sicherheitsnetze behalten — von Hand
    benannte Stände bleiben immer."""
    autos = [s for s in staende_liste(wurzel.parent) if s.get("quelle") == "auto"]
    for alt in autos[AUTO_BEHALTEN:]:
        shutil.rmtree(wurzel / alt["id"], ignore_errors=True)


def stand_anlegen(case_dir: str | Path, name: str, quelle: str = "hand",
                  ueberlagern: str | Path | None = None) -> dict:
    """
    Den aktuellen Fallordner als benannten Stand ablegen.

    ``ueberlagern``: Verzeichnis, dessen Inhalt NACH der Kopie darüber
    gelegt wird — so entsteht der Stand aus der gesicherten Geometrie
    eines Laufs (``run_root/spec``): erst der heutige Fall (Importquellen,
    Ableitungen), dann die Spezifikation von damals darüber. Importe sind
    unveränderlich, das kann nicht in die Irre führen.
    """
    case_dir = Path(case_dir)
    if not (case_dir / "case.yaml").is_file():
        raise StandFehler("Der Fall hat keine case.yaml — nichts zu sichern.")
    wurzel = staende_dir(case_dir)
    wurzel.mkdir(exist_ok=True)

    stempel = time.strftime("%Y%m%d-%H%M%S")
    stand_id, n = f"{stempel}_{_slug(name)}", 1
    while (wurzel / stand_id).exists():          # zwei Stände in einer Sekunde
        n += 1
        stand_id = f"{stempel}-{n}_{_slug(name)}"
    ziel = wurzel / stand_id

    _kopiere_fall(case_dir, ziel)
    if ueberlagern is not None:
        for quelle_datei in sorted(Path(ueberlagern).rglob("*")):
            if not quelle_datei.is_file():
                continue
            rel = quelle_datei.relative_to(Path(ueberlagern))
            (ziel / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(quelle_datei, ziel / rel)

    info = {"id": stand_id,
            "name": (name or "").strip() or stand_id,
            "erstellt": time.time(),
            "quelle": quelle,
            "case_hash": _case_hash(ziel / "case.yaml"),
            "groesse_mb": round(_bytes(ziel) / 1e6, 2)}
    (ziel / "stand.json").write_text(
        json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8")
    if quelle == "auto":
        _auto_aufraeumen(wurzel)
    return info


def staende_liste(case_dir: str | Path) -> list[dict]:
    """Stände des Falls, jüngster zuerst."""
    wurzel = staende_dir(case_dir)
    if not wurzel.is_dir():
        return []
    out = []
    for d in wurzel.iterdir():
        if not (d / "stand.json").is_file():
            continue
        try:
            out.append(_info_lesen(d))
        except Exception:    # noqa: BLE001 — ein kaputter Stand verdeckt nie den Rest
            continue
    return sorted(out, key=lambda s: s.get("erstellt") or 0, reverse=True)


def stand_laden(case_dir: str | Path, stand_id: str) -> dict:
    """
    Einen Stand zum Arbeitsstand machen. Rückgabe: case_hash des Standes
    und der zuvor automatisch angelegte Sicherheits-Stand.

    Reihenfolge ist Absicht: ERST den jetzigen Zustand wegschreiben, dann
    ersetzen. Laden ist damit nie ein Datenverlust, sondern ein Sprung,
    den man rückwärts genauso gehen kann.
    """
    case_dir = Path(case_dir)
    quelle_dir = _stand_dir(case_dir, stand_id)
    info = _info_lesen(quelle_dir)

    auto = stand_anlegen(case_dir, f"vor Laden von {info['name']}",
                         quelle="auto")

    # Arbeitsstand leeren — die Stände selbst bleiben. Dass dabei
    # derived/mesh_preview verschwindet, ist gewollt: die Vorschau gehörte
    # zu der Geometrie, die gerade ersetzt wird.
    for eintrag in sorted(case_dir.iterdir()):
        if eintrag.name == STAENDE:
            continue
        if eintrag.is_dir():
            shutil.rmtree(eintrag, ignore_errors=True)
        else:
            eintrag.unlink(missing_ok=True)

    for eintrag in sorted(quelle_dir.iterdir()):
        if eintrag.name == "stand.json":
            continue
        if eintrag.is_dir():
            shutil.copytree(eintrag, case_dir / eintrag.name)
        else:
            shutil.copy2(eintrag, case_dir / eintrag.name)

    return {"case_hash": info.get("case_hash"),
            "auto_stand": {"id": auto["id"], "name": auto["name"]}}


def stand_loeschen(case_dir: str | Path, stand_id: str) -> None:
    shutil.rmtree(_stand_dir(case_dir, stand_id), ignore_errors=True)
