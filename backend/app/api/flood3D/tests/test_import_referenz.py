"""
P1 der Preprocessing-Sanierung: Herkunft und Referenz.

Jedes importierte Objekt kennt seine Rohdaten (import_ref), Re-Apply
ersetzt statt zu duplizieren, und Meta.transform ist die EINE Abbildung
Landeskoordinaten <-> lokales Fallsystem — für Import UND nachträgliches
Drehen, mit rechnerisch möglicher Rückverortung.
"""
from __future__ import annotations

import io

import numpy as np
import pytest
import trimesh
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core.casespec import (CaseSpec, CrsTransform, lokal_nach_welt,
                             migriere, transform_drehung, transform_import,
                             welt_nach_lokal)
from ..core.importer import analyze_file, apply_import
from ..router import router
from .synthetic_case import build_spec_stage3


def _dxf_gelaende_wand_kante() -> bytes:
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for i in range(2):
        for j in range(2):
            x0, y0 = i * 10.0, j * 10.0
            x1, y1 = x0 + 10.0, y0 + 10.0
            msp.add_3dface([(x0, y0, 100.0), (x1, y0, 100.0),
                            (x1, y1, 101.0), (x0, y1, 101.0)],
                           dxfattribs={"layer": "GELAENDE"})
    box = trimesh.creation.box(extents=(8.0, 0.5, 3.0))
    box.apply_translation([10.0, 5.0, 101.5])
    mb = ezdxf.render.MeshBuilder()
    for f in box.faces:
        mb.add_face([tuple(box.vertices[k]) for k in f])
    mb.render_polyface(msp, dxfattribs={"layer": "WAND_A"})
    msp.add_lwpolyline([(2.0, 2.0), (18.0, 2.0)],
                       dxfattribs={"layer": "QS_MITTE"})
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


@pytest.fixture()
def case(tmp_path):
    d = tmp_path / "demo"
    d.mkdir()
    spec = build_spec_stage3()
    spec.to_yaml(d / "case.yaml")
    return spec, d


def _decisions(m):
    by = {c["name"]: c for c in m["candidates"]}
    return [
        {"candidate": by["GELAENDE"]["id"], "role": "gelaende"},
        {"candidate": by["WAND_A"]["id"], "role": "wand", "patch": "wand_a"},
        {"candidate": by["QS_MITTE_linie"]["id"], "role": "querschnitt"},
    ]


# ---- Herkunft & import_ref ------------------------------------------------

def test_importierte_objekte_kennen_ihre_herkunft(case):
    spec, d = case
    m = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m["import_id"], _decisions(m))

    wand = next(s for s in spec.structures if s.id == "wand_a")
    assert wand.herkunft == "import"
    assert wand.import_ref.import_id == m["import_id"]
    assert wand.import_ref.kandidat in {c["id"] for c in m["candidates"]}
    qs = spec.evaluation.sections[-1]
    assert qs.herkunft == "import"
    assert qs.import_ref.import_id == m["import_id"]
    # Handangelegtes bleibt ohne Eintrag (None = manuell), auch im YAML
    spec.to_yaml(d / "case.yaml")
    text = (d / "case.yaml").read_text()
    manuell = build_spec_stage3().structures[0]
    assert manuell.herkunft is None
    assert text.count("herkunft: import") >= 2


def test_reapply_ersetzt_statt_zu_duplizieren(case):
    spec, d = case
    m = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m["import_id"], _decisions(m))
    n_struct = len(spec.structures)
    n_qs = len(spec.evaluation.sections)

    # zweites Übernehmen desselben Imports: gleiche Zahlen, keine _2-IDs
    info = apply_import(spec, d, m["import_id"], _decisions(m))
    assert len(spec.structures) == n_struct
    assert len(spec.evaluation.sections) == n_qs
    assert not any(s.id.endswith("_2") for s in spec.structures)
    assert not any(x.id.endswith("_2") for x in spec.evaluation.sections)
    assert any("ersetzt" in r for r in info["report"])

    # Re-Apply mit ANDERER Rollenwahl: die Wand verschwindet sauber
    nur_gelaende = [d_ for d_ in _decisions(m) if d_["role"] == "gelaende"]
    apply_import(spec, d, m["import_id"], nur_gelaende)
    assert not any(s.id == "wand_a" for s in spec.structures)


def test_alter_fall_wird_migriert(tmp_path):
    spec = build_spec_stage3()
    daten = spec.model_dump(mode="json", exclude_none=True)
    daten["structures"].append({
        "id": "alt_koerper", "type": "imported", "patch": "alt_koerper",
        "source": "import_alt.stl"})
    daten["meta"]["crs_offset"] = [32500.0, 5600.0]
    daten["meta"]["crs_rotation_deg"] = 0.0
    alt = CaseSpec.model_validate(migriere(daten))
    koerper = next(s for s in alt.structures if s.id == "alt_koerper")
    assert koerper.herkunft == "import"          # nachträglich gestempelt
    assert alt.meta.transform.translation == (-32500.0, -5600.0)


# ---- Eine Transformations-Wahrheit ---------------------------------------

def test_rueckverortung_roundtrip_import():
    # Datei in mm, Offset 32500/5600 (m), Drehung 30°
    t = transform_import(0.001, (32500.0, 5600.0), 30.0)
    # Landeskoordinate (in m): 32510, 5605
    lx, ly = welt_nach_lokal(t, 32510.0, 5605.0)
    wx, wy = lokal_nach_welt(t, lx, ly)
    assert (wx, wy) == pytest.approx((32510.0, 5605.0), abs=1e-9)


def test_import_und_drehung_ergeben_eine_kette(case):
    """Nach Import (mit Offset) + rotate_case muss die Rückverortung einer
    mitgedrehten Geometrie wieder die Original-Landeskoordinate liefern."""
    from ..core.rotate import rotate_case

    spec, d = case
    m = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m["import_id"], _decisions(m),
                 offset=[1000.0, 2000.0], derive_domain=True)
    # Querschnitt-Startpunkt: Welt = Dateikoordinate (2,2),
    # lokal = (2,2) − Offset = (−998, −1998)
    p_lokal = tuple(spec.evaluation.sections[-1].polyline[0])
    assert p_lokal == pytest.approx((-998.0, -1998.0), abs=0.01)
    assert lokal_nach_welt(spec.meta.transform, *p_lokal) \
        == pytest.approx((2.0, 2.0), abs=0.01)

    rotate_case(spec, 35.0, d)
    p_gedreht = tuple(spec.evaluation.sections[-1].polyline[0])
    assert p_gedreht != pytest.approx(p_lokal, abs=1e-3)
    # Die Kette (Import-Offset ∘ Drehung um die Gebietsmitte) führt zurück
    assert lokal_nach_welt(spec.meta.transform, *p_gedreht) \
        == pytest.approx((2.0, 2.0), abs=0.05)


def test_transform_drehung_komponiert():
    t = CrsTransform()
    a = transform_drehung(t, 90.0, (10.0, 0.0))
    b = transform_drehung(a, 90.0, (10.0, 0.0))
    # zwei 90°-Drehungen um (10,0) = eine 180°-Drehung um (10,0)
    direkt = transform_drehung(t, 180.0, (10.0, 0.0))
    assert b.rotation_deg == pytest.approx(direkt.rotation_deg)
    assert b.translation == pytest.approx(direkt.translation, abs=1e-9)


# ---- Import-Verwaltung ----------------------------------------------------

def test_imports_endpunkt_listet_aktiv_und_verwaist(case, monkeypatch):
    from .. import router as router_modul

    spec, d = case
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(d.parent))

    m1 = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m1["import_id"], _decisions(m1))
    spec.to_yaml(d / "case.yaml")
    m2 = analyze_file(_dxf_gelaende_wand_kante(), "zweite.dxf", d)

    app = FastAPI()
    app.include_router(router_modul.router)
    client = TestClient(app)
    res = client.get(f"/cases/{d.name}/imports")
    assert res.status_code == 200
    imps = {i["import_id"]: i for i in res.json()["imports"]}
    assert imps[m1["import_id"]]["aktiv"] is True
    assert imps[m2["import_id"]]["aktiv"] is False
    assert imps[m1["import_id"]]["filename"] == "modell.dxf"
    # Kandidaten-STL ist über den dokumentierten Weg abrufbar
    cid = imps[m1["import_id"]]["candidates"][0]["id"]
    stl = client.get(f"/cases/{d.name}/import/{m1['import_id']}/{cid}.stl")
    assert stl.status_code == 200


def test_kanten_ableitungen_erben_die_herkunft(case):
    import ezdxf

    spec, d = case
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_polyline3d([(0, 0, 99.0), (10, 0, 99.5), (20, 0, 100.0)],
                       dxfattribs={"layer": "BK_1"})
    buf = io.StringIO()
    doc.write(buf)
    m = analyze_file(buf.getvalue().encode("utf-8"), "kanten.dxf", d)
    cid = next(c["id"] for c in m["candidates"] if c["kind"] == "polyline")

    apply_import(spec, d, m["import_id"],
                 [{"candidate": cid, "role": "bruchkante"}])
    kante = spec.terrain.kanten[-1]
    assert kante.herkunft == "import"
    abgeleitet = [o for o in spec.terrain.operations
                  if getattr(o, "aus_kanten", None)]
    assert abgeleitet, "aus der Kante muss eine Operation folgen"
    assert all(o.herkunft == "import" and o.import_ref is not None
               for o in abgeleitet)

    # Re-Apply räumt auch die Ableitungen auf — keine Duplikate
    n_ops = len(spec.terrain.operations)
    n_kanten = len(spec.terrain.kanten)
    apply_import(spec, d, m["import_id"],
                 [{"candidate": cid, "role": "bruchkante"}])
    assert len(spec.terrain.operations) == n_ops
    assert len(spec.terrain.kanten) == n_kanten


# ---- P2: derived/ ist wegwerfbar ------------------------------------------

def test_wegwerf_derived_ist_bitidentisch_rekonstruierbar(case):
    """Der Härtetest der Schichtentrennung: derived/ löschen + Reapply mit
    der gespeicherten Anwendung stellt alles bitidentisch wieder her, ohne
    die Spec zu verändern."""
    import hashlib
    import shutil

    from ..core.importer import import_neu_ableiten

    spec, d = case
    m = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m["import_id"], _decisions(m))

    derived = d / "derived"
    dateien = sorted(p.relative_to(derived).as_posix()
                     for p in derived.rglob("*") if p.is_file())
    assert dateien, "Ableitungen müssen unter derived/ liegen"
    # und NUR dort: im Wurzelverzeichnis liegen nur Quellen
    wurzel = {p.name for p in d.glob("*") if p.is_file()}
    assert wurzel <= {"case.yaml"}
    haschs = {n: hashlib.sha256((derived / n).read_bytes()).hexdigest()
              for n in dateien}
    spec_vorher = spec.model_dump(mode="json", exclude_none=True)

    shutil.rmtree(derived)
    import_neu_ableiten(spec, d, m["import_id"])

    dateien_neu = sorted(p.relative_to(derived).as_posix()
                         for p in derived.rglob("*") if p.is_file())
    assert dateien_neu == dateien
    for n in dateien:
        neu = hashlib.sha256((derived / n).read_bytes()).hexdigest()
        assert neu == haschs[n], f"{n} ist nach dem Neuableiten anders"
    assert spec.model_dump(mode="json", exclude_none=True) == spec_vorher


def test_rasters_liefert_keine_gelaende_ableitungen(case, monkeypatch):
    from .. import router as router_modul

    spec, d = case
    monkeypatch.setenv("FLOOD3D_CASES_ROOT", str(d.parent))
    m = analyze_file(_dxf_gelaende_wand_kante(), "modell.dxf", d)
    apply_import(spec, d, m["import_id"], _decisions(m))
    # Zusatzraster (nicht Gelände) über den Rasterweg
    roh = (b"ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\n"
           b"cellsize 10\nNODATA_value -9999\n100 101\n102 -9999\n")
    m2 = analyze_file(roh, "zusatz.asc", d)
    apply_import(spec, d, m2["import_id"],
                 decisions=[{"candidate": m2["candidates"][0]["id"],
                             "role": "zusatzraster"}])
    spec.to_yaml(d / "case.yaml")

    app = FastAPI()
    app.include_router(router_modul.router)
    client = TestClient(app)
    raster = client.get(f"/cases/{d.name}/rasters").json()
    namen = {r["name"] for r in raster}
    assert "derived/zusatz.asc" in namen
    basis = spec.terrain.base.source
    for r in raster:
        if r["name"].startswith("derived/gelaende_"):
            assert r["name"] == basis and r["basis"] is True

    # DELETE derived leert die Ablage, Quellen bleiben
    res = client.delete(f"/cases/{d.name}/derived")
    assert res.status_code == 200 and "derived" in res.json()["entfernt"]
    assert not (d / "derived").exists()
    assert (d / "imports").is_dir() and (d / "case.yaml").is_file()
    # und der Reapply-Endpunkt stellt sie wieder her
    res = client.post(f"/cases/{d.name}/import/{m['import_id']}/reapply")
    assert res.status_code == 200
    assert (d / "derived").is_dir()
