"""
Wo der Pinsel wirkt — Etappe E3 der Sanierung
(docs/flood3d/AUDIT_FLOOD3D_FALLSPEZIFISCH.md).

Bis zum 2026-09-22 lag die Sculpt-Ebene VOR dem ganzen Operationsstapel.
Das schützte die zugesicherten Sollhöhen (Planum, Gerinnesohle) — traf aber
auch die aus Vermessungskanten ABGELEITETEN Operationen, und die sind die
Vermessung selbst. In Fällen aus Linien war der Pinsel damit auf 27–43 %
der Fläche wirkungslos: der Strich erschien live, und nach der Antwort des
Servers schnappte er zurück. Niemand sagte, warum.

Jetzt: abgeleitete Operationen → Pinsel → eigene Operationen. Und wo eine
eigene Sollhöhe hält, sagt der Server es exakt statt über Hüllboxen.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import casespec as cs
from ..core import kur
from ..core.rotate import rotate_case
from ..core.sculpt import patch_anwenden, sichtbar_geworden
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3, build_spec_tal


def _feld(spec, d):
    return TerrainField.from_spec(spec.terrain, spec.domain, d)


def _bei(feld, x, y):
    return float(feld.sample([x], [y])[0])


def _mit_kante(tmp_path):
    """Fall mit einer ABGELEITETEN Bruchkante (wie aus der Vermessung)."""
    spec = build_spec_stage3()
    spec.terrain.operations = [
        cs.OpBruchkante(id="kante_sohle_1", type="bruchkante",
                        polyline=[(4.0, 4.0, 95.0), (20.0, 4.0, 95.0)],
                        breite=3.0, modus="ziehen",
                        aus_kanten=["kante_sohle_1"]),
    ]
    spec.to_yaml(tmp_path / "case.yaml")
    return spec


def test_strich_auf_abgeleiteter_flaeche_kommt_an(tmp_path):
    spec = _mit_kante(tmp_path)
    vor = _feld(spec, tmp_path)
    assert _bei(vor, 12.0, 4.0) == pytest.approx(95.0, abs=0.05), \
        "die abgeleitete Kante zieht das Gelände auf 95 m"

    g = vor.z.shape
    meldung = patch_anwenden(spec, tmp_path,
                             [{"i0": 0, "j0": 0, "dz": np.full(g, 1.0).tolist()}])
    nach = _feld(spec, tmp_path)
    # auf der Kante: der Strich wirkt jetzt (vorher blieb er wirkungslos)
    assert _bei(nach, 12.0, 4.0) == pytest.approx(96.0, abs=0.05)
    # und der Server meldet keine Sperre, denn es gibt keine eigene Sollhöhe
    assert "ohne Wirkung" not in meldung


def test_eigene_sollhoehe_haelt_und_sagt_es(tmp_path):
    spec = _mit_kante(tmp_path)
    spec.terrain.operations.append(
        cs.OpPad(id="planum", type="pad", level=97.0,
                 polygon=[(14, 10), (22, 10), (22, 16), (14, 16)]))
    spec.to_yaml(tmp_path / "case.yaml")
    vor = _feld(spec, tmp_path)

    g = vor.z.shape
    meldung = patch_anwenden(spec, tmp_path,
                             [{"i0": 0, "j0": 0, "dz": np.full(g, 1.0).tolist()}])
    nach = _feld(spec, tmp_path)
    assert _bei(nach, 18.0, 13.0) == pytest.approx(97.0, abs=0.02), \
        "das Planum hält seine Sollhöhe"
    assert _bei(nach, 12.0, 4.0) == pytest.approx(96.0, abs=0.05), \
        "die abgeleitete Kante nicht"
    assert "Sollhöhen" in meldung and "planum" in meldung
    assert "%" in meldung, "die Meldung nennt den Anteil, nicht nur den Namen"


def test_sperrmaske_ist_exakt_und_benennt_die_operation(tmp_path):
    spec = _mit_kante(tmp_path)
    spec.terrain.operations.append(
        cs.OpPad(id="planum", type="pad", level=97.0,
                 polygon=[(14, 10), (22, 10), (22, 16), (14, 16)]))
    feld = _feld(spec, tmp_path)
    sperre = feld.pinsel_sperre()
    assert sperre["ops"] == ["planum"]
    xx, yy = feld.mesh_xy()
    im_planum = (xx > 14.2) & (xx < 21.8) & (yy > 10.2) & (yy < 15.8)
    weit_weg = (xx < 13.5) | (xx > 22.5) | (yy < 9.5) | (yy > 16.5)
    assert (sperre["ebene"][im_planum] == 1).all(), "im Planum gesperrt"
    assert (sperre["ebene"][weit_weg] == 0).all(), "daneben nicht"
    # die ABGELEITETE Kante sperrt nichts — sie ist die Vermessung, kein
    # zugesichertes Maß; genau darum ging der Strich dort früher verloren
    assert "kante_sohle_1" not in sperre["ops"]

    # Das Gerinne des Abnahmefalls sperrt seinen Einschnitt samt Böschung,
    # aber nicht das ganze umschriebene Rechteck: quer dazu, gut 4 m von der
    # Achse weg, kommt ein Strich durch — die alte Hüllbox (Achse + Breite
    # + Tiefe·Neigung) sperrte dort mit.
    voll = build_spec_stage3()
    f2 = _feld(voll, tmp_path)
    s2 = f2.pinsel_sperre()
    assert set(s2["ops"]) == {"t01", "t02"}
    assert 0.0 < s2["anteil"] < 0.5
    x2, y2 = f2.mesh_xy()
    auf_der_achse = (np.abs(y2 - 9.0) < 0.3) & (x2 > 4) & (x2 < 20)
    daneben = (np.abs(y2 - 14.0) < 0.3) & (x2 > 4) & (x2 < 14)
    assert (s2["ebene"][auf_der_achse] > 0).all()
    assert (s2["ebene"][daneben] == 0).all()


def test_ohne_eigene_sollhoehe_gibt_es_keine_sperre(tmp_path):
    spec = _mit_kante(tmp_path)
    assert _feld(spec, tmp_path).pinsel_sperre() is None
    spec.terrain.operations.append(
        cs.OpRaiseLower(id="hub", type="raise_lower", center=(12.0, 9.0),
                        radius=3.0, strength=0.5))
    assert _feld(spec, tmp_path).pinsel_sperre() is None, \
        "raise_lower sichert keine Höhe zu — der Pinsel kommt durch"


def test_unsichtbare_altstriche_werden_gemeldet_und_verworfen(tmp_path):
    """
    Ein Strich aus der Zeit vor der Umstellung: unter der abgeleiteten Kante
    war er unsichtbar, jetzt wirkt er. Die Regel sagt es, die Kur räumt ihn
    weg — und misst dabei dieselbe Größe.
    """
    spec = _mit_kante(tmp_path)
    feld = _feld(spec, tmp_path)
    # Strich NUR auf der Kante (dort war er früher wirkungslos)
    xx, yy = feld.mesh_xy()
    dz = np.where(np.abs(yy - 4.0) < 0.6, 0.8, 0.0)
    patch_anwenden(spec, tmp_path, [{"i0": 0, "j0": 0, "dz": dz.tolist()}])
    spec.to_yaml(tmp_path / "case.yaml")

    info = sichtbar_geworden(spec, tmp_path)
    assert info and info["max_dz"] == pytest.approx(0.8, abs=0.05)
    assert info["knoten"] > 0

    hinweise = [b for b in validate_case(spec, tmp_path)
                if (b.get("fix") or {}).get("aktion") == "striche_verwerfen"]
    assert len(hinweise) == 1
    assert "0.80 m" in hinweise[0]["message"]

    text = kur.anwenden(spec, "striche_verwerfen", {}, tmp_path)
    assert "zurückgesetzt" in text
    assert sichtbar_geworden(spec, tmp_path) is None
    assert _bei(_feld(spec, tmp_path), 12.0, 4.0) == pytest.approx(95.0, abs=0.05)
    assert not [b for b in validate_case(spec, tmp_path)
                if (b.get("fix") or {}).get("aktion") == "striche_verwerfen"]


def test_strich_neben_der_kante_bleibt_beim_verwerfen(tmp_path):
    spec = _mit_kante(tmp_path)
    feld = _feld(spec, tmp_path)
    xx, yy = feld.mesh_xy()
    dz = np.where((np.abs(yy - 4.0) < 0.6) | (np.abs(yy - 15.0) < 0.6), 0.8, 0.0)
    patch_anwenden(spec, tmp_path, [{"i0": 0, "j0": 0, "dz": dz.tolist()}])
    kur.anwenden(spec, "striche_verwerfen", {}, tmp_path)
    nach = _feld(spec, tmp_path)
    assert _bei(nach, 12.0, 4.0) == pytest.approx(95.0, abs=0.05), "Kante frei"
    assert _bei(nach, 12.0, 15.0) == pytest.approx(96.8, abs=0.05), \
        "der Strich im freien Gelände bleibt"


# ---- Drehen nimmt alles mit (Audit I5) ------------------------------------

def test_drehen_nimmt_kanten_und_vorfuellung_mit(tmp_path):
    spec = build_spec_tal(tmp_path)
    spec.terrain.kanten = [cs.Vermessungskante(
        id="k1", rolle="sohle",
        polyline=[(20.0, 30.0, 51.0), (40.0, 30.0, 51.5)])]
    spec.solver.vorfuellungen = [cs.Vorfuellung(
        id="v1", polygon=[(20, 30), (40, 30), (40, 50), (20, 50)], level=52.0)]
    alt_k = [tuple(p) for p in spec.terrain.kanten[0].polyline]
    alt_v = [tuple(p) for p in spec.solver.vorfuellungen[0].polygon]

    rotate_case(spec, 90.0, tmp_path)
    assert [tuple(p) for p in spec.terrain.kanten[0].polyline] != alt_k
    assert [tuple(p) for p in spec.solver.vorfuellungen[0].polygon] != alt_v
    # Höhen bleiben, nur die Lage dreht
    assert [p[2] for p in spec.terrain.kanten[0].polyline] == [51.0, 51.5]
    assert spec.solver.vorfuellungen[0].level == 52.0
    # und die Drehung um 360° bringt beide zurück
    for _ in range(3):
        rotate_case(spec, 90.0, tmp_path)
    zurueck = [tuple(round(v, 2) for v in p)
               for p in spec.terrain.kanten[0].polyline]
    assert zurueck == [tuple(round(v, 2) for v in p) for p in alt_k]
