"""
Böschungs- und Bruchkanten aus der Vermessung (3D-Polylinien im DXF).
Die Höhe je Stützpunkt ist der eigentliche Inhalt dieser Daten — die Tests
prüfen, dass sie vom Import bis ins Geländeraster durchkommt.
"""
from __future__ import annotations

import json

import numpy as np
import pytest

from ..core import casespec as cs
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


def _flach(hoehe=100.0, res=0.5, n=41):
    return TerrainField(x0=0, y0=0, resolution=res,
                        z=np.full((n, n), float(hoehe)))


def _z(f, x, y):
    return float(f.sample(np.array([float(x)]), np.array([float(y)]))[0])


# ---- Böschung ------------------------------------------------------------

def _boeschung(**kw):
    return cs.OpBoeschung(
        id="b", type="boeschung",
        oberkante=[(0, 12, 103.0), (20, 12, 104.0)],
        unterkante=[(0, 6, 100.0), (20, 6, 100.5)], **kw)


def test_boeschung_interpoliert_zwischen_den_kanten():
    f = _flach()
    f.apply(_boeschung())
    # auf den Kanten gilt deren Höhe, dazwischen linear
    assert _z(f, 10, 12) == pytest.approx(103.5, abs=1e-6)
    assert _z(f, 10, 6) == pytest.approx(100.25, abs=1e-6)
    assert _z(f, 10, 9) == pytest.approx(101.875, abs=1e-6)


def test_boeschung_laesst_umgebung_in_ruhe():
    f = _flach()
    f.apply(_boeschung())
    assert _z(f, 10, 2) == pytest.approx(100.0)
    assert _z(f, 10, 16) == pytest.approx(100.0)


def test_boeschung_dreht_gegenlaeufige_unterkante():
    """
    Im DXF ist die Digitalisierrichtung nicht garantiert. Läuft die
    Unterkante andersherum, kreuzen sich die Linien — ohne Korrektur
    entstünde die Böschung an der falschen Stelle.
    """
    f = _flach()
    f.apply(cs.OpBoeschung(id="b", type="boeschung",
        oberkante=[(0, 12, 103.0), (20, 12, 104.0)],
        unterkante=[(20, 6, 100.5), (0, 6, 100.0)]))
    assert _z(f, 10, 9) == pytest.approx(101.875, abs=1e-6)


def test_boeschung_kanten_breite_wirkt_nach_aussen():
    f = _flach()
    f.apply(_boeschung(kanten_breite=2.0))
    # 1 m über der Oberkante: halbe Wirkung Richtung 103.5
    assert _z(f, 10, 13) == pytest.approx((100.0 + 103.5) / 2, abs=0.02)
    assert _z(f, 10, 15) == pytest.approx(100.0, abs=1e-6)


# ---- Bruchkante ----------------------------------------------------------

def test_bruchkante_zieht_das_gelaende_auf_die_linie():
    f = _flach()
    f.apply(cs.OpBruchkante(id="k", type="bruchkante",
        polyline=[(0, 10, 102.0), (20, 10, 106.0)], breite=2.0))
    assert _z(f, 10, 10) == pytest.approx(104.0, abs=1e-6)   # Höhe je Punkt!
    assert _z(f, 0, 10) == pytest.approx(102.0, abs=1e-6)
    assert _z(f, 10, 11) == pytest.approx(102.0, abs=1e-6)   # halb ausgeblendet
    assert _z(f, 10, 13) == pytest.approx(100.0, abs=1e-6)   # außerhalb


def test_bruchkante_absenken_hebt_nichts_an():
    f = _flach()
    f.apply(cs.OpBruchkante(id="k", type="bruchkante",
        polyline=[(0, 10, 102.0), (20, 10, 98.0)], breite=2.0,
        modus="absenken"))
    assert _z(f, 0, 10) == pytest.approx(100.0)      # 102 > Gelände: bleibt
    # am Rasterrand mittelt die bilineare Abfrage minimal -> 1 mm Toleranz
    assert _z(f, 20, 10) == pytest.approx(98.0, abs=1e-3)


# ---- Prüfregeln ----------------------------------------------------------

def _spec_mit_op(op):
    spec = build_spec_stage3()
    spec.terrain.operations = [op]
    return spec


def test_vertauschte_kanten_werden_gemeldet():
    spec = _spec_mit_op(cs.OpBoeschung(id="b", type="boeschung",
        oberkante=[(2, 12, 94.0), (8, 12, 94.0)],
        unterkante=[(2, 16, 97.0), (8, 16, 97.0)]))
    msgs = [x["message"] for x in validate_case(spec) if x["object_id"] == "b"]
    assert any("vertauscht" in m for m in msgs), msgs


def test_boeschung_schmaler_als_das_raster_wird_gemeldet():
    spec = _spec_mit_op(cs.OpBoeschung(id="b", type="boeschung",
        oberkante=[(2, 12.0, 97.0), (8, 12.0, 97.0)],
        unterkante=[(2, 12.1, 94.0), (8, 12.1, 94.0)]))
    msgs = [x["message"] for x in validate_case(spec) if x["object_id"] == "b"]
    assert any("zur Stufe" in m for m in msgs), msgs


def test_bruchkante_ohne_hoehen_wird_gemeldet():
    spec = _spec_mit_op(cs.OpBruchkante(id="k", type="bruchkante",
        polyline=[(2, 12, 0.0), (8, 12, 0.0)], breite=1.0))
    msgs = [x["message"] for x in validate_case(spec) if x["object_id"] == "k"]
    assert any("Höhe 0" in m for m in msgs), msgs


# ---- Gelände AUS den Linien ---------------------------------------------

def test_gelaende_aus_linien_trifft_die_kanten(tmp_path):
    from ..core.importer import tin_from_lines
    from ..core.terrain import TerrainField
    from ..core.casespec import Terrain, TerrainBase, Domain
    linien = [
        [(0, 12, 103.0), (20, 12, 104.0)],       # Oberkante
        [(0, 6, 100.0), (20, 6, 100.5)],         # Unterkante
    ]
    asc = tmp_path / "g.asc"
    info = tin_from_lines(linien, asc, 0.5)
    # 2 Linien á 20 m, verdichtet auf 0,5 m -> rund 2×41 Punkte
    assert info["n_punkte"] >= 80
    f = TerrainField.from_spec(
        Terrain(base=TerrainBase(source="g.asc", resolution=0.5)),
        Domain(extent=(0, 4, 20, 14), z_min=95, z_max=110), tmp_path)
    z = lambda x, y: float(f.sample(np.array([x * 1.0]), np.array([y * 1.0]))[0])
    assert z(10, 12) == pytest.approx(103.5, abs=0.02)
    assert z(10, 6) == pytest.approx(100.25, abs=0.02)
    assert z(10, 9) == pytest.approx(101.875, abs=0.05)


def test_gelaende_aus_linien_erfindet_nichts_ueber_grosse_luecken(tmp_path):
    from ..core.importer import tin_from_lines
    # zwei Linien 40 m auseinander: dazwischen darf nicht vermascht werden
    linien = [[(0, 0, 100.0), (20, 0, 100.0)],
              [(0, 40, 110.0), (20, 40, 110.0)]]
    info = tin_from_lines(linien, tmp_path / "g.asc", 0.5)
    assert info["coverage"] < 0.3, info
    text = (tmp_path / "g.asc").read_text()
    assert "-9999" not in text.split("\n", 6)[6]   # Lücken sind gefüllt


def test_kanten_ohne_gelaende_stuerzen_nicht_ab(tmp_path):
    """Bruchkante ohne Basisgelände: klare Meldung statt AttributeError."""
    from ..core import importer
    spec = build_spec_stage3()
    spec.terrain = None
    imp = tmp_path / "imports" / "imp-1"
    imp.mkdir(parents=True)
    (imp / "manifest.json").write_text(json.dumps({"candidates": [
        {"id": "k0", "name": "sohle_linie", "kind": "polyline",
         "role_guess": "bruchkante", "stats": {}}]}))
    (imp / "k0.json").write_text(json.dumps([[0, 0, 96.0], [10, 0, 95.5]]))
    out = importer.apply_import(spec, tmp_path, "imp-1",
                                [{"candidate": "k0", "role": "bruchkante"}],
                                terrain_from_lines=False)
    assert spec.terrain is None
    assert any("kein Gelände" in r for r in out["report"]), out["report"]


# ---- naechste_hoehe: der scipy-freie Rückfall ----------------------------
# Das Rechen-Image auf der Nutzer-Maschine trägt nur die Kernpakete; der
# Core reist im Bundle dorthin. Als terrain.py scipy bekam, verlor jeder
# lokale Lauf still seine Geländeschicht (ModuleNotFoundError, gefangen
# und nur in den Logstrom geschrieben).

def test_naechste_hoehe_rueckfall_entspricht_scipy(monkeypatch):
    import builtins

    import numpy as np

    from ..core.terrain import naechste_hoehe

    rng = np.random.default_rng(7)
    z = rng.uniform(90, 110, (24, 31))
    bekannt = rng.random((24, 31)) > 0.6
    bekannt[0, 0] = True                      # mindestens ein Anker

    mit_scipy = naechste_hoehe(z, bekannt)

    echt = builtins.__import__

    def ohne_scipy(name, *a, **kw):
        if name.startswith("scipy"):
            raise ModuleNotFoundError(name)
        return echt(name, *a, **kw)

    monkeypatch.setattr(builtins, "__import__", ohne_scipy)
    ohne = naechste_hoehe(z, bekannt)

    # Bekannte Knoten exakt, freie plausibel: beide Wege füllen aus den
    # Nachbarn — die Metrik ist verschieden (Meter vs. Gitterschritte),
    # die Werte bleiben im Wertebereich der bekannten Höhen
    assert np.array_equal(mit_scipy[bekannt], z[bekannt])
    assert np.array_equal(ohne[bekannt], z[bekannt])
    assert not np.isnan(ohne).any()
    assert ohne.min() >= z[bekannt].min() - 1e-9
    assert ohne.max() <= z[bekannt].max() + 1e-9


def test_laplace_fuellen_laeuft_ohne_scipy(monkeypatch):
    import builtins

    import numpy as np

    from ..core.terrain import laplace_fuellen

    echt = builtins.__import__

    def ohne_scipy(name, *a, **kw):
        if name.startswith("scipy"):
            raise ModuleNotFoundError(name)
        return echt(name, *a, **kw)

    monkeypatch.setattr(builtins, "__import__", ohne_scipy)

    z = np.zeros((20, 20))
    fest = np.zeros((20, 20), dtype=bool)
    fest[:, 0], fest[:, -1] = True, True
    z[:, 0], z[:, -1] = 100.0, 96.0
    aus = laplace_fuellen(z, fest)
    # Laplace zwischen zwei parallelen Rändern ist die Gerade
    mitte = aus[10, 9]
    assert abs(mitte - (100.0 - 4.0 * 9 / 19)) < 0.2
