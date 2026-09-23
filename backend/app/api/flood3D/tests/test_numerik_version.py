"""Fahrplan A6: jeder Lauf trägt den Stand der Hülle; der Leser erfährt, ob er verifiziert ist."""
from __future__ import annotations

import io
import json
import zipfile

from ..core.conventions import NUMERIK_VERSION
from ..core.evaluate import numerik_hinweise
from ..core.store import read_manifest, run_paths
from ..laufwerk import _import_entpacken, geometrie_sichern
from ..probe.faelle import fall_k


def test_hinweise_je_stand():
    alt = numerik_hinweise({}, NUMERIK_VERSION)
    assert len(alt) == 1 and "Wasserwand" in alt[0]["message"]
    offen = numerik_hinweise({"numerik_version": NUMERIK_VERSION}, None)
    assert len(offen) == 1 and "nicht am Wehrfall verifiziert" in offen[0]["message"]
    assert numerik_hinweise({"numerik_version": NUMERIK_VERSION}, NUMERIK_VERSION) == []


def test_start_schreibt_version_und_zulauf_und_import_bewahrt_sie(tmp_path):
    spec = fall_k()
    fall = tmp_path / "fall"; fall.mkdir()
    spec.to_yaml(fall / "case.yaml")
    lauf = tmp_path / "runs" / "k_r001"; lauf.mkdir(parents=True)
    geometrie_sichern(spec, fall, lauf)
    m = read_manifest(run_paths(lauf.parent, lauf.name))
    assert m["numerik_version"] == NUMERIK_VERSION
    (z,) = m["zulauf"]
    assert z["art"] == "freispiegel" and z["turbulenz"]["k"] > 0
    # das Ergebnisarchiv bringt sein eigenes Manifest mit und überschreibt
    puffer = io.BytesIO()
    with zipfile.ZipFile(puffer, "w") as a:
        a.writestr("manifest.json", json.dumps({"status": "completed"}))
    _import_entpacken(lauf, lauf.name, puffer.getvalue())
    m = read_manifest(run_paths(lauf.parent, lauf.name))
    assert m["numerik_version"] == NUMERIK_VERSION and m["zulauf"]
