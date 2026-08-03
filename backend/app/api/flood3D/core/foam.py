"""Gemeinsame Formatierung für OpenFOAM-Dictionaries (Foundation-Dialekt)."""
from __future__ import annotations


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
