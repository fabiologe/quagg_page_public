"""
Gelände außerhalb der Vermessung — Etappe E1a der Sanierung
(docs/AUDIT_FLOOD3D_FALLSPEZIFISCH.md, Teil 1).

Bis 2026-09-21 klemmte das Abtasten jede Koordinate außerhalb des
Höhenrasters auf den Randwert; eine tiefe Stelle am Rasterrand wurde als
Rinne bis an den Gebietsrand fortgeschrieben (+72 % Rückhaltevolumen), und
keine Prüfregel sagte, dass 92 % des Gebiets erfunden waren. Jetzt gilt:
NODATA bleibt in der Datei, außerhalb der Vermessung steht eine Ebene auf
der Außenhöhe (höchste gemessene Randzelle oder von Hand), die Prüfung
meldet den Anteil, und Regel und Kur messen dieselbe Größe.

Gemessen wird hier an Referenzfall B (Tal) und am nackten Becken — nicht am
Abnahmefall, an dem das Klemmen nie auffiel.
"""
from __future__ import annotations

import numpy as np
import pytest

from ..core import kur
from ..core.importer import analyze_file, apply_import, tin_from_lines
from ..core.rotate import rotate_case
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from . import dxf_fabrik as fx
from .messlatte import messe_fall
from .synthetic_case import (TAL_RASTER, build_spec_stage3, build_spec_tal,
                             tal_hoehe)


def _abdeckung(spec, d):
    return [b for b in validate_case(spec, d)
            if b["object_id"] == "terrain"
            and ("Vermessung" in b["message"] or "überlappen" in b["message"])]


def _raster_kante():
    r = TAL_RASTER
    return (r["x0"], r["y0"], r["x0"] + (r["ncols"] - 1) * r["res"],
            r["y0"] + (r["nrows"] - 1) * r["res"])


# ---- Fall B: das Raster deckt nur die Mitte des Gebiets --------------------

def test_tal_ausserhalb_der_vermessung_liegt_die_ebene(tmp_path):
    spec = build_spec_tal(tmp_path)
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    xx, yy = f.mesh_xy()
    rx0, ry0, rx1, ry1 = _raster_kante()
    aussen = ((xx < rx0 - 0.5) | (xx > rx1 + 0.5)
              | (yy < ry0 - 0.5) | (yy > ry1 + 0.5))
    innen = (xx >= rx0) & (xx <= rx1) & (yy >= ry0) & (yy <= ry1)
    krone = float(tal_hoehe(rx1, ry0))       # die höchste Ecke des Rasters

    assert f.aussenhoehe == pytest.approx(krone, abs=1e-6) and f.aussenhoehe_auto
    # draußen: die Ebene, nicht der fortgeschriebene Randwert
    assert np.allclose(f.z[aussen], krone)
    assert not f.gemessen[aussen].any()
    # drinnen: die Vermessung, unverändert
    assert f.gemessen[innen].all()
    assert np.allclose(f.z[innen], tal_hoehe(xx[innen], yy[innen]), atol=0.02)
    a = f.abdeckung()
    assert a["ueberlappt"] and 0.5 < a["ausserhalb"] < 0.7 and a["innen"] == 0.0
    assert a["huelle"] == pytest.approx((10.3, 20.3, 89.3, 69.3))


def test_regel_und_kur_messen_dieselbe_groesse(tmp_path):
    spec = build_spec_tal(tmp_path)
    warn = [b for b in _abdeckung(spec, tmp_path) if b["severity"] == "warnung"]
    assert len(warn) == 1, warn
    assert warn[0]["fix"]["aktion"] == "gebiet_auf_vermessung"
    assert "% des Gebiets" in warn[0]["message"]
    assert "x_min 100%" in warn[0]["message"]      # der Zulauf steht auf der Ebene

    text = kur.anwenden(spec, "gebiet_auf_vermessung", {}, tmp_path)
    assert "auf die Vermessung gesetzt" in text
    assert spec.domain.extent == pytest.approx((10.3, 20.3, 89.3, 69.3))
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.abdeckung()["ausserhalb"] == 0.0
    assert not [b for b in _abdeckung(spec, tmp_path) if b["severity"] == "warnung"]
    # zweiter Klick: nichts mehr zu tun, nichts verstellt
    assert "bereits" in kur.anwenden(spec, "gebiet_auf_vermessung", {}, tmp_path)


def test_kur_verkleinert_nicht_ueber_ein_bauwerk_hinweg(tmp_path):
    spec = build_spec_tal(tmp_path)
    # die Leitwand steht dort, wo nur die Ebene ist
    spec.structures[0].alignment.points = [(100.0, 30.0, 55.0), (100.0, 58.0, 55.0)]
    warn = [b for b in _abdeckung(spec, tmp_path) if b["severity"] == "warnung"]
    assert warn and warn[0].get("fix") is None
    assert "leitwand" in warn[0]["message"]
    alt = spec.domain.extent
    assert "nicht verkleinert" in kur.anwenden(spec, "gebiet_auf_vermessung",
                                               {}, tmp_path)
    assert spec.domain.extent == alt


def test_gebiet_auf_der_vermessung_hat_keinen_saum(tmp_path):
    """
    Ein aus dem Gelände abgeleitetes Gebiet endet auf den äußersten
    Rasterknoten (auf cm gerundet, der Rasterkopf auf mm) — es darf keinen
    Ring aus Ebene bekommen: eine halbe Zelle über den Knoten hinaus ist
    noch Raster.
    """
    spec = build_spec_tal(tmp_path)
    spec.domain.extent = _raster_kante()
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.gemessen.all()
    assert f.abdeckung()["ausserhalb"] == 0.0
    assert not _abdeckung(spec, tmp_path)
    # auch 0,3 Zellen darüber hinaus bleibt alles gemessen
    spec.domain.extent = (10.05, 19.85, 89.05, 68.85)
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.gemessen.all()


def test_aussenhoehe_von_hand(tmp_path):
    spec = build_spec_tal(tmp_path)
    spec.terrain.base.aussenhoehe = 56.0
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.aussenhoehe == 56.0 and not f.aussenhoehe_auto
    assert float(f.z.max()) == pytest.approx(56.0)
    assert any("im Fall gesetzt" in b["message"] for b in _abdeckung(spec, tmp_path))


# ---- Hash-Neutralität ------------------------------------------------------

def test_leeres_neues_feld_aendert_keinen_hash():
    """
    Goldene Hashes des Abnahmefalls, am 2026-09-22 mit dem Code VOR dem Feld
    `aussenhoehe` gerechnet. Bliebe ein leeres neues Feld im Hash, gälte mit
    dem nächsten Deploy jede gespeicherte Netzvorschau als veraltet. Ändert
    sich hier etwas, muss es eine bewusste Entscheidung sein.
    """
    s = build_spec_stage3()
    assert (s.case_hash(), s.geometrie_hash(), s.netz_hash()) == (
        "5b875a5a8bb7d5eb", "61ab37913c5b9274", "f2822c1a15bfee69")
    s.terrain.base.aussenhoehe = 99.0
    assert s.netz_hash() != "f2822c1a15bfee69"
    assert s.geometrie_hash() != "61ab37913c5b9274"


# ---- Das nackte Becken, Ende zu Ende ---------------------------------------

def test_nacktes_becken_bekommt_keine_rinne(tmp_path):
    """
    Der Betriebsfall: ein offen vermessenes Becken-TIN, danach das Gebiet
    von Hand weit größer gezogen. Vorher: 677 Phantom-Knoten, 74,9 m³
    erfundene Vertiefung außerhalb der Vermessung. Nachher: null.
    """
    d = tmp_path / "fall"
    d.mkdir()
    spec = build_spec_stage3()
    spec.terrain.operations = []        # der Import behält Operationen — hier
    spec.to_yaml(d / "case.yaml")       # sollen nur Vermessung und Ebene zählen
    b = fx.nacktes_becken()
    m = analyze_file(b["dxf"], "becken.dxf", d)
    tin = next(c for c in m["candidates"] if c["kind"] == "mesh")
    assert tin["role_guess"] == "gelaende"
    info = apply_import(spec, d, m["import_id"],
                        decisions=[{"candidate": tin["id"], "role": "gelaende"}],
                        offset=list(m["offset_suggest"]), derive_domain=True)
    assert any("Außenhöhe" in r for r in info["report"])

    x0, y0, x1, y1 = spec.domain.extent
    spec.domain.extent = (x0 - 12.0, y0 - 42.0, x1 + 24.0, y1 + 16.0)
    spec.structures = []
    spec.to_yaml(d / "case.yaml")
    f = TerrainField.from_spec(spec.terrain, spec.domain, d)
    assert f.aussenhoehe == pytest.approx(fx.KRONE, abs=0.02), \
        "die Krone des Rands, nicht die Scharte"
    assert float(f.z.min()) < fx.SOHLE + 0.3, "die Scharte selbst bleibt"

    z = messe_fall(d)
    assert z["anteil_ausserhalb"] > 0.8
    assert z["nodata_zellen"] > 0
    assert z["phantom_knoten"] == 0 and z["phantom_m3"] == 0.0

    warn = [x for x in _abdeckung(spec, d) if x["severity"] == "warnung"]
    assert warn and warn[0]["fix"]["aktion"] == "gebiet_auf_vermessung"
    kur.anwenden(spec, "gebiet_auf_vermessung", {}, d)
    a = TerrainField.from_spec(spec.terrain, spec.domain, d).abdeckung()
    assert a["ausserhalb"] == 0.0
    assert a["innen"] > 0.3, "die Ecken des gedrehten Quadrats bleiben ungemessen"
    assert any("Innerhalb der Vermessung" in x["message"]
               for x in _abdeckung(spec, d) if x["severity"] == "hinweis")


def test_linien_vermaschung_laesst_die_ecken_ungemessen(tmp_path):
    linien = [[(0, 0, 100.0), (20, 0, 100.0)],
              [(0, 0, 100.0), (10, 20, 102.0)],
              [(20, 0, 100.0), (10, 20, 102.0)]]
    info = tin_from_lines(linien, tmp_path / "g.asc", 0.5)
    z = np.loadtxt(tmp_path / "g.asc", skiprows=6)
    assert info["ausserhalb"] > 0.3 and (z == -9999).sum() > 0
    assert info["innen_ergaenzt"] > 0.0
    assert info["aussenhoehe"] == pytest.approx(102.0, abs=0.01)


# ---- Drehen ----------------------------------------------------------------

def test_drehung_nimmt_die_maske_mit(tmp_path):
    spec = build_spec_tal(tmp_path)
    vorher = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    p = np.array([50.0]), np.array([40.0])
    z_vorher = float(vorher.sample(*p)[0])
    rotate_case(spec, 37.0, tmp_path)
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.aussenhoehe == pytest.approx(vorher.aussenhoehe, abs=0.01)
    assert f.quelle_nodata > 0, "die gedrehte Datei kennt „nicht gemessen“"
    assert not any("neu abtasten" in b["message"]
                   for b in validate_case(spec, tmp_path))
    # derselbe Punkt, gedreht, hat dieselbe Höhe
    from ..core.rotate import _dreh
    import math
    x0, y0, x1, y1 = spec.domain.extent
    mitte_alt = np.array([(-3.7 + 118.9) / 2, (12.3 + 92.6) / 2])
    q = _dreh(np.array([[50.0, 40.0]]), math.cos(math.radians(37)),
              math.sin(math.radians(37)), mitte_alt)[0]
    assert float(f.sample(np.array([q[0]]), np.array([q[1]]))[0]) == \
        pytest.approx(z_vorher, abs=0.03)


def test_altes_schief_gedrehtes_raster_bekommt_die_kur(tmp_path):
    """
    So sah eine gedrehte Datei vor dem 22.09.2026 aus: kein NODATA, die
    Ecken mit dem geklemmten Randwert vollgeschrieben. Die Prüfung erkennt
    das an „schief gedreht und ohne NODATA“, die Kur tastet neu ab — und
    misst danach dieselbe Zahl: die Datei trägt NODATA.
    """
    spec = build_spec_tal(tmp_path)
    rotate_case(spec, 37.0, tmp_path)
    krone = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path).aussenhoehe
    pfad = tmp_path / spec.terrain.base.source
    zeilen = pfad.read_text().split("\n")
    daten = [" ".join(f"{krone:.3f}" if v.startswith("-9999") else v
                      for v in zeile.split())
             for zeile in zeilen[6:] if zeile.strip()]
    pfad.write_text("\n".join(zeilen[:6] + daten))

    def kur_angeboten():
        return [b for b in validate_case(spec, tmp_path)
                if (b.get("fix") or {}).get("aktion") == "gelaende_neu_abtasten"]

    assert len(kur_angeboten()) == 1
    assert "neu abgetastet" in kur.anwenden(spec, "gelaende_neu_abtasten",
                                            {}, tmp_path)
    f = TerrainField.from_spec(spec.terrain, spec.domain, tmp_path)
    assert f.quelle_nodata > 0
    assert not kur_angeboten()
