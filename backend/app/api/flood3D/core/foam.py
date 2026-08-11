"""Gemeinsame Formatierung für OpenFOAM-Dictionaries (Foundation-Dialekt)."""
from __future__ import annotations

import re
from pathlib import Path


def foam_file(object_name: str, body: str, class_: str = "dictionary",
              location: str | None = None) -> str:
    loc = f'    location    "{location}";\n' if location else ""
    return (
        "/*--------------------------------*- C++ -*----------------------------------*\\\n"
        "|  Erzeugt von quagg flood3D casebuilder — nicht von Hand bearbeiten,         |\n"
        "|  maßgeblich ist die casespec (Spez. Kap. 4.1).                              |\n"
        "\\*---------------------------------------------------------------------------*/\n"
        "FoamFile\n{\n"
        "    version     2.0;\n"
        "    format      ascii;\n"
        f"    class       {class_};\n"
        f"{loc}"
        f"    object      {object_name};\n"
        "}\n"
        "// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //\n\n"
        f"{body}\n"
        "\n// ************************************************************************* //\n"
    )


def vec(v) -> str:
    return "(" + " ".join(_num(x) for x in v) + ")"


def _num(x) -> str:
    if isinstance(x, float) and x == int(x) and abs(x) < 1e15:
        return str(int(x))
    return repr(x) if not isinstance(x, float) else f"{x:g}"


def table(pairs) -> str:
    """Inline-Zeitreihe: table ((t0 v0) (t1 v1) ...)"""
    inner = " ".join(f"({t:g} {v:g})" for t, v in pairs)
    return f"table ({inner})"


# --------------------------------------------------------------------------
# Welche OpenFOAM-Ausgabe hat WIRKLICH gerechnet?
# --------------------------------------------------------------------------
# Server (opencfd/openfoam-run:2406) und Nutzer-Maschine
# (fabiologe/quagg-foam-local, FROM demselben Image) laufen auf derselben
# Ausgabe — geprüft am 2026-08-11: identische Basis-Schichten, v2406,
# OpenMPI 4.1.6. Damit das so bleibt, ohne dass es jemand von Hand
# nachschaut, schreibt jeder Lauf mit, was in SEINEM Container stand.
# Quelle ist die Kopfzeile jedes Foam-Logs — das kostet nichts und sagt
# das Wahre, im Gegensatz zu einer Nachfrage beim Image.
FOAM_API_ERWARTET = "2406"

_BAU = re.compile(r"OPENFOAM=(\d+)")
_HASH = re.compile(r"Build\s*:\s*(\S+)")


def foam_version_aus_log(case_dir) -> dict | None:
    """
    ``{"api": "2406", "build": "_be01ca78-20240625"}`` aus dem Kopf des
    ersten lesbaren Foam-Logs. ``None``, wenn kein Log da ist (dann hat
    auch nichts gerechnet).
    """
    case = Path(case_dir)
    if not case.is_dir():
        return None
    for log in sorted(case.glob("log.*")):
        try:
            kopf = log.read_text(errors="replace")[:2000]
        except OSError:
            continue
        api = _BAU.search(kopf)
        if not api:
            continue
        bau = _HASH.search(kopf)
        return {"api": api.group(1),
                "build": bau.group(1) if bau else None}
    return None


def foam_abweichung(gefunden: dict | None) -> str | None:
    """Meldung, wenn der Container eine andere Ausgabe fährt als erwartet.

    Kein Fehler: der Lauf ist ja schon gerechnet. Aber er gehört in den
    Nachweis — die eingefrorene Verifikation (C_d) hängt an der Ausgabe.
    """
    if not gefunden or not gefunden.get("api"):
        return None
    if gefunden["api"] != FOAM_API_ERWARTET:
        return (f"OpenFOAM v{gefunden['api']} gerechnet, erwartet war "
                f"v{FOAM_API_ERWARTET}. Ergebnisse sind nicht ohne Weiteres "
                f"mit anderen Läufen und mit der Verifikation vergleichbar.")
    return None
