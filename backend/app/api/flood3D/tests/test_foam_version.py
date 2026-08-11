"""
Server und Nutzer-Maschine muessen dieselbe OpenFOAM-Ausgabe fahren —
sonst liefert derselbe Fall je nach Rechenort andere Zahlen, und die
eingefrorene Verifikation (C_d) gilt nur noch fuer eine der beiden Seiten.

Am 2026-08-11 von Hand gegenuebergestellt: beide Images v2406, identische
Basis-Schichten, OpenMPI 4.1.6. Diese Tests halten das fest, damit es
nicht bei einer einmaligen Handpruefung bleibt.
"""
from __future__ import annotations

import re
from pathlib import Path

from ..core.foam import (FOAM_API_ERWARTET, foam_abweichung,
                         foam_version_aus_log)

KOPF = """/*---------------------------------------------------------------------------*\\
| =========                 |                                                 |
|  \\\\    /   O peration     | Version:  2406                                  |
\\*---------------------------------------------------------------------------*/
Build  : _be01ca78-20240625 OPENFOAM=2406 version=2406
Exec   : blockMesh
"""


def test_liest_ausgabe_aus_dem_logkopf(tmp_path):
    (tmp_path / "log.blockMesh").write_text(KOPF)
    assert foam_version_aus_log(tmp_path) == {"api": "2406",
                                              "build": "_be01ca78-20240625"}


def test_ohne_log_keine_angabe(tmp_path):
    """Kein Log = es hat nichts gerechnet — dann wird auch nichts behauptet."""
    assert foam_version_aus_log(tmp_path) is None
    assert foam_version_aus_log(tmp_path / "gibtsnicht") is None


def test_fremde_ausgabe_wird_gemeldet(tmp_path):
    (tmp_path / "log.blockMesh").write_text(KOPF.replace("2406", "2606"))
    gefunden = foam_version_aus_log(tmp_path)
    assert gefunden["api"] == "2606"
    hinweis = foam_abweichung(gefunden)
    assert hinweis and "2606" in hinweis and FOAM_API_ERWARTET in hinweis


def test_erwartete_ausgabe_meldet_nichts(tmp_path):
    (tmp_path / "log.blockMesh").write_text(KOPF)
    assert foam_abweichung(foam_version_aus_log(tmp_path)) is None
    assert foam_abweichung(None) is None


def test_server_image_traegt_die_erwartete_ausgabe():
    from ..core.runner import OF_IMAGE
    assert OF_IMAGE.rsplit(":", 1)[-1] == FOAM_API_ERWARTET, (
        f"Server rechnet mit {OF_IMAGE}, erwartet wird aber "
        f"v{FOAM_API_ERWARTET} — eines von beiden ist vergessen worden.")


def test_local_image_baut_auf_derselben_ausgabe_auf():
    """
    Das Image der Nutzer-Maschine wird aus diesem Dockerfile gebaut. Zieht
    jemand dort eine neuere Basis ein, ohne den Server mitzunehmen, faellt
    es hier auf — nicht erst an abweichenden Ergebnissen.
    """
    docker = (Path(__file__).resolve().parents[1]
              / "engines" / "local" / "Dockerfile")
    basis = re.search(r"^FROM\s+(\S+)", docker.read_text(), re.M)
    assert basis, "Dockerfile ohne FROM"
    assert basis.group(1).rsplit(":", 1)[-1] == FOAM_API_ERWARTET
