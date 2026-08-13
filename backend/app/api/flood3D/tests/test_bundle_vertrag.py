"""
Bundle-Wächter (Welle 1 des Umbau-Fahrplans): Der mitreisende Code
(``quagg_runtime/flood3D``) muss im Container importierbar sein — dort
ist ``flood3D`` TOP-LEVEL (kein ``app.api`` darüber, kein ``flood2D``
daneben) und es gibt weder fastapi noch boto3.

Genau diese Landmine lag scharf: ``core/gate.py`` importierte fastapi
und ``...flood2D`` und reiste trotzdem in jedes case.zip — überlebt hat
das nur, weil den Modul dort zufällig niemand lud. Dieser Test lädt
ALLES, was verschifft wird, in einer Container-Simulation. Ein einziges
verbotenes Import irgendwo im Core-Baum macht ihn rot, BEVOR ein
bezahlter Cloud-Lauf daran stirbt.
"""
from __future__ import annotations

import subprocess
import sys
import textwrap

from ..core.bundle import runtime_baum_kopieren

# Simulation der Container-Umgebung: diese Pakete existieren im
# Foam-Image NICHT (es hat nur numpy scipy pandas pyarrow matplotlib
# pyyaml pydantic shapely trimesh — s. engines/local/Dockerfile).
_IM_CONTAINER_VERBOTEN = ("fastapi", "starlette", "boto3", "botocore",
                          "ezdxf", "app", "flood2D")

_PRUEFSKRIPT = textwrap.dedent("""
    import builtins, importlib, pkgutil, sys

    wurzel = sys.argv[1]
    verboten = set(sys.argv[2].split(","))
    sys.path.insert(0, wurzel)

    echt = builtins.__import__
    def _zoll(name, *a, **k):
        if name.split(".")[0] in verboten:
            raise ImportError(name + " existiert im Container nicht")
        return echt(name, *a, **k)
    builtins.__import__ = _zoll

    fehler = []
    try:
        flood3D = importlib.import_module("flood3D")
    except Exception as e:          # noqa: BLE001 — Sammelbericht
        print("flood3D selbst: %s: %s" % (type(e).__name__, e))
        sys.exit(1)
    for mod in pkgutil.walk_packages(flood3D.__path__, "flood3D."):
        try:
            importlib.import_module(mod.name)
        except Exception as e:      # noqa: BLE001 — Sammelbericht
            fehler.append("%s: %s: %s" % (mod.name, type(e).__name__, e))
    print("\\n".join(fehler))
    sys.exit(1 if fehler else 0)
""")


def test_verschiffter_baum_importiert_im_container(tmp_path):
    rt = runtime_baum_kopieren(tmp_path)
    wurzel = str(rt.parent)                       # …/quagg_runtime
    lauf = subprocess.run(
        [sys.executable, "-c", _PRUEFSKRIPT, wurzel,
         ",".join(_IM_CONTAINER_VERBOTEN)],
        capture_output=True, text=True, timeout=120)
    assert lauf.returncode == 0, (
        "Der verschiffte Baum ist im Container NICHT importierbar — jeder "
        "auswärtige Lauf würde sterben:\n"
        + lauf.stdout + lauf.stderr)


def test_runner_reist_mit_und_core_ist_vollstaendig(tmp_path):
    """Der Baum enthält Runner + core/extract (das Unterpaket, dessen
    Fehlen 'ModuleNotFoundError' im Nachlauf bedeutete)."""
    rt = runtime_baum_kopieren(tmp_path)
    assert (rt / "engines" / "local" / "local_runner.py").is_file()
    assert (rt / "core" / "extract" / "__init__.py").is_file()
    assert (rt / "__init__.py").is_file()
    assert not (rt / "core" / "gate.py").exists(), \
        "gate.py (fastapi!) darf nie wieder in den Container reisen"
