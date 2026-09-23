"""Fahrplan A5: Atmosphäre-Regel mit Kur, y+ je Patch."""
from __future__ import annotations

from pathlib import Path

import pytest

from ..core.evaluate import befunde_ableiten
from ..core.kur import anwenden, hat_atmosphaere
from ..core.meshgen import assign_faces
from ..core.runner import _y_plus_je_patch, _y_plus_range
from ..core.validate import validate_case
from ..probe.faelle import fall_k


def _atmo_befunde(spec, tmp_path):
    return [b for b in validate_case(spec, tmp_path)
            if "Atmosphären-Rand" in b["message"]]


def test_ohne_atmosphaere_fehler_und_kur_heilt(tmp_path):
    spec = fall_k()
    assert not _atmo_befunde(spec, tmp_path)
    spec.boundaries = [b for b in spec.boundaries if b.type != "atmosphere"]
    assert assign_faces(spec)["z_max"] == ("farfield", "wall")    # dichter Deckel
    bef = _atmo_befunde(spec, tmp_path)
    assert bef and bef[0]["severity"] == "fehler"
    assert bef[0]["fix"]["aktion"] == "atmosphaere_anlegen"
    anwenden(spec, "atmosphaere_anlegen")
    assert hat_atmosphaere(spec)
    assert not _atmo_befunde(spec, tmp_path)                       # dieselbe Messung
    assert assign_faces(spec)["z_max"] == ("atmosphere", "patch")


def test_kur_verweigert_belegte_oberseite():
    spec = fall_k()
    spec.boundaries = [b for b in spec.boundaries if b.type != "atmosphere"]
    spec.boundaries[1].face = "z_max"
    with pytest.raises(ValueError, match="Oberseite"):
        anwenden(spec, "atmosphaere_anlegen")


def test_y_plus_je_patch(tmp_path):
    d = tmp_path / "postProcessing" / "y_plus" / "0"
    d.mkdir(parents=True)
    (d / "yPlus.dat").write_text(
        "# y+ ()\n# Time  \tpatch  \tmin  \tmax  \taverage\n"
        "1\tterrain\t120\t3700\t2200\n1\tfarfield\t18\t5300\t1400\n"
        "2\tterrain\t110\t3900\t2300\n2\tfarfield\t19\t5100\t1400\n")
    je = _y_plus_je_patch(tmp_path)
    assert je == {"terrain": [110.0, 3900.0], "farfield": [18.0, 5300.0]}
    assert _y_plus_range(tmp_path) == [18.0, 5300.0]
    msg = befunde_ableiten({"y_plus_range": [18.0, 5300.0],
                            "y_plus_je_patch": je}, {})[0]["message"]
    assert "„farfield“ bis 5.300" in msg and "„terrain“ bis 3.900" in msg
    assert msg.index("farfield") < msg.index("terrain")            # größter zuerst
