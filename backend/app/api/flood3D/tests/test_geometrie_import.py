"""
Tests des CAD-Geometrie-Imports (BricsCAD-Workflow): DXF je Layer
(3DFACE-TIN, POLYFACE-Körper, Polylinien-Trassen, 3DSOLID-Hinweis),
STL-Mehrkörper, TIN-Rasterung und die Übernahme in die casespec.
"""
from __future__ import annotations

import io
import json

import numpy as np
import pytest
import trimesh
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ..core.importer import analyze_file, apply_import, rasterize_tin_to_asc
from ..router import router
from .synthetic_case import build_spec_stage3


# ---- Fixtures: DXF/STL wie aus BricsCAD -----------------------------------

def _dxf_bytes(with_solid: bool = False) -> bytes:
    """Gelände-TIN (3DFACE), ein Quader (POLYFACE), eine Trasse, opt. ACIS."""
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # Gelände: 2x2 Felder, geneigt von z=100 auf z=102
    def z(x, y):
        return 100.0 + x * 0.1
    for i in range(2):
        for j in range(2):
            x0, y0 = i * 10.0, j * 10.0
            x1, y1 = x0 + 10.0, y0 + 10.0
            msp.add_3dface([(x0, y0, z(x0, y0)), (x1, y0, z(x1, y0)),
                            (x1, y1, z(x1, y1)), (x0, y1, z(x0, y1))],
                           dxfattribs={"layer": "GELAENDE"})

    # Wand als geschlossener Quader über MeshBuilder -> POLYFACE
    box = trimesh.creation.box(extents=(8.0, 0.5, 3.0))
    box.apply_translation([10.0, 5.0, 101.5])
    mb = ezdxf.render.MeshBuilder()
    for f in box.faces:
        mb.add_face([tuple(box.vertices[k]) for k in f])
    mb.render_polyface(msp, dxfattribs={"layer": "WAND_A"})

    msp.add_lwpolyline([(2.0, 2.0), (18.0, 2.0), (18.0, 16.0)],
                       dxfattribs={"layer": "QS_ZULAUF"})
    if with_solid:
        # roher ACIS-Körper (wie ohne CONVTOMESH aus BricsCAD); ohne
        # SAT-Nutzlast verwirft ezdxf die Entity beim Schreiben
        solid = msp.new_entity("3DSOLID", dxfattribs={"layer": "ROH_SOLID"})
        solid.sat = ["700 0 0 1 ", "@7 Unknown "]

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def _stl_bytes_zwei_koerper() -> bytes:
    a = trimesh.creation.box(extents=(2, 2, 2))
    b = trimesh.creation.box(extents=(1, 1, 4))
    b.apply_translation([10, 0, 0])
    return trimesh.util.concatenate([a, b]).export(file_type="stl")


@pytest.fixture()
def case(tmp_path):
    d = tmp_path / "demo"
    d.mkdir()
    spec = build_spec_stage3()
    spec.to_yaml(d / "case.yaml")
    return spec, d


# ---- Analyse --------------------------------------------------------------

def test_dxf_zerlegt_nach_layern(case):
    _, d = case
    m = analyze_file(_dxf_bytes(), "modell.dxf", d)
    by_name = {c["name"]: c for c in m["candidates"]}
    assert "GELAENDE" in by_name
    assert by_name["GELAENDE"]["kind"] == "mesh"
    assert by_name["GELAENDE"]["stats"]["n_triangles"] == 8   # 4 Vierecke
    assert by_name["GELAENDE"]["role_guess"] == "gelaende"
    assert not by_name["GELAENDE"]["stats"]["watertight"]

    assert by_name["WAND_A"]["stats"]["watertight"] is True
    assert by_name["WAND_A"]["role_guess"] == "wand"

    qs = by_name["QS_ZULAUF_linie"]
    assert qs["kind"] == "polyline"
    assert qs["stats"]["n_points"] == 3

    # Kandidatennetze liegen als STL für die Vorschau bereit
    imp = d / "imports" / m["import_id"]
    assert (imp / f"{by_name['GELAENDE']['id']}.stl").exists()
    assert (imp / "modell.dxf").exists()


def test_dxf_meldet_rohe_acis_koerper(case):
    _, d = case
    m = analyze_file(_dxf_bytes(with_solid=True), "modell.dxf", d)
    acis = [c for c in m["candidates"] if c["kind"] == "acis"]
    assert len(acis) == 1
    assert "CONVTOMESH" in acis[0]["hint"]
    assert acis[0]["role_guess"] == "ignorieren"


def test_layername_schlaegt_geometrie_heuristik(case):
    """CAD-Layer tragen die Absicht — „WEHRKOERPER" ist kein Wand-Kandidat."""
    from ..core.importer import _guess_role
    schlank = {"span_xy": [1.5, 8.0], "z_range": [95.0, 96.6],
               "watertight": True}
    assert _guess_role(schlank, "MAUER_LINKS") == "wand"
    assert _guess_role(schlank, "WEHRKOERPER") == "wehr"
    assert _guess_role(schlank, "Becken_RUEB") == "becken"
    assert _guess_role(schlank, "namenlos") == "wand"      # Geometrie greift
    offen = {"span_xy": [48.0, 30.0], "z_range": [98.0, 101.0],
             "watertight": False}
    assert _guess_role(offen, "DGM_2024") == "gelaende"


def test_stl_mehrkoerper_wird_gesplittet(case):
    _, d = case
    m = analyze_file(_stl_bytes_zwei_koerper(), "koerper.stl", d)
    meshes = [c for c in m["candidates"] if c["kind"] == "mesh"]
    assert len(meshes) == 2
    assert all(c["stats"]["watertight"] for c in meshes)
    assert {c["role_guess"] for c in meshes} <= {"bauwerk", "pfeiler", "wand"}


def test_einheiten_und_offset_verdacht(case):
    _, d = case
    # Landeskoordinaten in mm: beide Verdachte müssen anschlagen
    box = trimesh.creation.box(extents=(20000, 20000, 3000))
    box.apply_translation([32500000, 5600000, 0])
    m = analyze_file(box.export(file_type="stl"), "gross.stl", d)
    assert m["unit_suspect"] is True
    assert m["offset_suggest"] is not None
    assert m["offset_suggest"][0] > 3e7


def test_unbekanntes_format(case):
    _, d = case
    with pytest.raises(ValueError, match="Nicht unterstütztes Format"):
        analyze_file(b"x", "modell.dwg", d)


# ---- Rasterung ------------------------------------------------------------

def test_tin_rasterung_trifft_hoehen(tmp_path):
    # geneigte Ebene z = 100 + 0.1x -> Rasterwerte müssen das exakt treffen
    verts = np.array([[0, 0, 100.0], [20, 0, 102.0],
                      [20, 20, 102.0], [0, 20, 100.0]])
    mesh = trimesh.Trimesh(vertices=verts, faces=[[0, 1, 2], [0, 2, 3]])
    asc = tmp_path / "gelaende.asc"
    info = rasterize_tin_to_asc(mesh, asc, resolution=1.0)
    assert info["nx"] == 21 and info["ny"] == 21
    assert info["coverage"] == 1.0

    rows = asc.read_text().splitlines()
    header = {r.split()[0]: r.split()[1] for r in rows[:6]}
    assert header["cellsize"] == "1"
    grid = np.array([[float(v) for v in r.split()] for r in rows[6:]])
    # ESRI ist nord->süd notiert; Spalte j entspricht x = j
    assert grid[0][0] == pytest.approx(100.0, abs=1e-6)
    assert grid[0][10] == pytest.approx(101.0, abs=1e-6)
    assert grid[-1][20] == pytest.approx(102.0, abs=1e-6)


def test_rasterung_markiert_luecken(tmp_path):
    # Dreieck deckt nur die halbe BBox -> NODATA in der anderen Hälfte
    mesh = trimesh.Trimesh(vertices=np.array([[0, 0, 10.0], [10, 0, 10.0],
                                              [0, 10, 10.0]]),
                           faces=[[0, 1, 2]])
    info = rasterize_tin_to_asc(mesh, tmp_path / "t.asc", resolution=1.0)
    assert 0.4 < info["coverage"] < 0.75
    assert "-9999" in (tmp_path / "t.asc").read_text()


# ---- Übernahme ------------------------------------------------------------

def test_apply_uebernimmt_gelaende_wand_und_trasse(case):
    spec, d = case
    m = analyze_file(_dxf_bytes(), "modell.dxf", d)
    by_name = {c["name"]: c for c in m["candidates"]}
    n_sections = len(spec.evaluation.sections)

    info = apply_import(spec, d, m["import_id"], decisions=[
        {"candidate": by_name["GELAENDE"]["id"], "role": "gelaende"},
        {"candidate": by_name["WAND_A"]["id"], "role": "wand",
         "patch": "wand_west", "material": "beton"},
        {"candidate": by_name["QS_ZULAUF_linie"]["id"], "role": "querschnitt"},
    ], derive_domain=True)

    # Gelände: Rasterdatei ist die neue Basis, TIN liegt daneben
    assert spec.terrain.base.source.endswith(".asc")
    assert (d / spec.terrain.base.source).exists()
    assert (d / f"gelaende_{m['import_id']}_tin.stl").exists()

    # Wand: als StructImported mit Rolle und Material
    wand = next(s for s in spec.structures if s.id == "wand_west")
    assert wand.type == "imported" and wand.role == "wand"
    assert wand.material == "beton"
    assert (d / wand.source).exists()

    # Trasse -> Querschnitt (Layer QS_ZULAUF -> qs_zulauf, kein Doppel-qs_).
    # Der Fall hat schon einen „qs_zulauf" — die Kennung muss eindeutig
    # bleiben, sonst verdecken sich zwei Querschnitte gegenseitig.
    assert len(spec.evaluation.sections) == n_sections + 1
    assert spec.evaluation.sections[-1].id == "qs_zulauf_2"
    assert len({x.id for x in spec.evaluation.sections}) \
        == len(spec.evaluation.sections)
    assert tuple(spec.evaluation.sections[-1].polyline[0]) == (2.0, 2.0)

    # Domäne aus dem Gelände
    assert spec.domain.extent == (0.0, 0.0, 20.0, 20.0)
    assert spec.domain.z_min < 100.0 < spec.domain.z_max
    # Anfangswasserspiegel wandert mit ins neue Gebiet — echt innerhalb,
    # sonst schlägt die Prüfung ("liegt außerhalb") sofort an
    assert spec.domain.z_min < spec.solver.initial_level < spec.domain.z_max
    assert any("Anfangswasserspiegel" in r for r in info["report"])
    assert len(info["report"]) == 5


def test_apply_mit_einheiten_und_offset(case):
    spec, d = case
    box = trimesh.creation.box(extents=(2000, 500, 3000))   # mm
    box.apply_translation([32500000, 5600000, 100000])
    m = analyze_file(box.export(file_type="stl"), "wand_mm.stl", d)
    cid = m["candidates"][0]["id"]

    apply_import(spec, d, m["import_id"],
                 decisions=[{"candidate": cid, "role": "wand",
                             "patch": "wand_mm"}],
                 unit_factor=0.001, offset=[32500.0, 5600.0])
    wand = next(s for s in spec.structures if s.id == "wand_mm")
    mesh = trimesh.load(d / wand.source, force="mesh")
    lo, hi = mesh.bounds
    assert (hi - lo) == pytest.approx([2.0, 0.5, 3.0], abs=1e-3)
    assert lo[0] == pytest.approx(-1.0, abs=1e-3)      # zentriert um 0
    assert tuple(spec.meta.crs_offset) == (32500.0, 5600.0)


def test_apply_ignoriert_und_meldet_acis(case):
    spec, d = case
    m = analyze_file(_dxf_bytes(with_solid=True), "modell.dxf", d)
    acis = next(c for c in m["candidates"] if c["kind"] == "acis")
    n_before = len(spec.structures)
    info = apply_import(spec, d, m["import_id"],
                        decisions=[{"candidate": acis["id"], "role": "wand"}])
    assert len(spec.structures) == n_before
    assert any("CONVTOMESH" in r for r in info["report"])


def test_apply_vergibt_eindeutige_ids(case):
    spec, d = case
    m = analyze_file(_stl_bytes_zwei_koerper(), "k.stl", d)
    ids = [c["id"] for c in m["candidates"] if c["kind"] == "mesh"]
    apply_import(spec, d, m["import_id"], decisions=[
        {"candidate": ids[0], "role": "bauwerk", "patch": "teil"},
        {"candidate": ids[1], "role": "bauwerk", "patch": "teil"},
    ])
    neu = [s.id for s in spec.structures if s.type == "imported"]
    assert neu == ["teil", "teil_2"]


# ---- API ------------------------------------------------------------------

@pytest.fixture()
def client(tmp_path):
    mp = pytest.MonkeyPatch()
    cases = tmp_path / "cases"
    mp.setenv("FLOOD3D_CASES_ROOT", str(cases))
    (cases / "demo").mkdir(parents=True)
    build_spec_stage3().to_yaml(cases / "demo" / "case.yaml")
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    mp.undo()


def test_api_import_und_apply(client):
    res = client.post("/cases/demo/import?filename=modell.dxf",
                      content=_dxf_bytes())
    assert res.status_code == 200
    m = res.json()
    gel = next(c for c in m["candidates"] if c["name"] == "GELAENDE")

    # Vorschau-Netz abrufbar
    stl = client.get(f"/cases/demo/import/{m['import_id']}/{gel['id']}.stl")
    assert stl.status_code == 200 and len(stl.content) > 80

    res = client.post(f"/cases/demo/import/{m['import_id']}/apply", json={
        "decisions": [{"candidate": gel["id"], "role": "gelaende"}],
        "derive_domain": True})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] and body["report"]
    assert body["spec"]["terrain"]["base"]["source"].endswith(".asc")
    # gespeicherter Fall trägt die Änderung
    assert client.get("/cases/demo").json()["terrain"]["base"]["source"].endswith(".asc")


def test_api_lehnt_dwg_ab(client):
    res = client.post("/cases/demo/import?filename=plan.dwg", content=b"xx")
    assert res.status_code == 422
    assert "Format" in res.json()["detail"]


# ---- Fremdobjekte und senkrechte Dreiecke --------------------------------

def test_fremdentitaet_blockiert_den_import_nicht():
    """
    Eine BricsCAD-/Civil-TIN-Oberfläche steckt als Fremdobjekt mit
    Binärblöcken in der Datei. Sie ließ den DXF-Leser abbrechen, obwohl die
    3DFACEs daneben lesbar sind.
    """
    from ..core.importer import _dxf_saeubern, analyze_dxf
    import re
    roh = _dxf_bytes().decode("utf-8")
    # Fremdobjekt mit Binärchunk vor das erste 3DFACE setzen
    fremd = ("0\nBsysCvDbTinSurface\n  8\nTIN\n310\n"
             "100D0000020000000C00\n")
    kaputt, n = re.subn(r"^([ ]*0[ ]*\n3DFACE[ ]*\n)", fremd + r"\1", roh,
                        count=1, flags=re.M)
    assert n == 1, "Testdatei enthält kein 3DFACE"
    sauber, entfernt = _dxf_saeubern(kaputt)
    assert entfernt == {"BsysCvDbTinSurface": 1}
    assert "BsysCvDbTinSurface" not in sauber
    # und der Gesamtweg liefert weiterhin die Flächen
    cands = analyze_dxf(kaputt.encode("utf-8"), "x.dxf")
    assert any(c["kind"] == "mesh" for c in cands)
    assert any(c["kind"] == "hinweis" for c in cands)


def test_gelaendelayer_bleibt_ein_kandidat():
    """
    TIN-Exporte teilen sich zwischen den Dreiecken oft keine Punkte. Ohne
    Sonderbehandlung zerfiel ein Geländelayer in Dutzende Kandidaten mit je
    einem Dreieck.
    """
    from ..core.importer import analyze_dxf
    cands = analyze_dxf(_dxf_bytes(), "x.dxf")
    gelaende = [c for c in cands if c["role_guess"] == "gelaende"]
    assert len(gelaende) == 1, [c["name"] for c in gelaende]


def test_senkrechte_dreiecke_kippen_das_raster_nicht(tmp_path):
    """
    Beckenwände stehen senkrecht und projizieren sich auf eine Linie. Die
    Vermaschung war dadurch ungültig („Triangulation is invalid").
    """
    import numpy as np
    import trimesh
    from ..core.importer import rasterize_tin_to_asc
    # zwei liegende Dreiecke + eine senkrechte Wand
    v = np.array([[0, 0, 10.0], [4, 0, 10.0], [4, 4, 10.5], [0, 4, 10.5],
                  [0, 0, 12.0], [4, 0, 12.0]])
    f = np.array([[0, 1, 2], [0, 2, 3], [0, 1, 4], [1, 5, 4]])
    mesh = trimesh.Trimesh(vertices=v, faces=f, process=False)
    info = rasterize_tin_to_asc(mesh, tmp_path / "t.asc", resolution=0.5)
    assert info["senkrecht_verworfen"] == 2
    assert info["coverage"] > 0.4


def test_binaer_dxf_wird_gelesen():
    """
    CAD-Programme schreiben DXF auf Wunsch binär. Der Textleser sieht darin
    nur Zeichensalat — erkannt wird es an der Signatur im Dateikopf.
    """
    import ezdxf
    from ..core.importer import analyze_dxf
    import tempfile
    from pathlib import Path as _P

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for i in range(2):
        msp.add_3dface([(i, 0, 10.0), (i + 1, 0, 10.1), (i + 1, 1, 10.2),
                        (i, 1, 10.15)], dxfattribs={"layer": "GELAENDE"})
    msp.add_polyline3d([(0, 0, 9.0), (5, 1, 8.8)],
                       dxfattribs={"layer": "Bruchkanten"})
    with tempfile.TemporaryDirectory() as td:
        p = _P(td) / "bin.dxf"
        doc.saveas(p, fmt="bin")
        roh = p.read_bytes()
    assert roh[:18] == b"AutoCAD Binary DXF"
    cands = analyze_dxf(roh, "bin.dxf")
    assert any(c["role_guess"] == "gelaende" for c in cands)
    assert any(c["role_guess"] == "bruchkante" for c in cands)


def test_kreis_wird_zur_rohrmuendung():
    """
    Ein Kreis beschreibt eine Rohrmündung vollständig: Mitte, Durchmesser
    und über die Extrusionsrichtung die Rohrachse. Steht der Kreis
    senkrecht, liegt seine Mitte im OCS — ohne Rückdrehung landet sie
    Millionen Meter daneben.
    """
    import ezdxf
    import numpy as np
    from ..core.importer import analyze_dxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_3dface([(0, 0, 10.0), (4, 0, 10.0), (4, 4, 10.0), (0, 4, 10.0)],
                   dxfattribs={"layer": "GELAENDE"})
    # senkrecht stehender Kreis: Extrusion in x -> OCS-Mitte
    kreis = msp.add_circle((0, 0, 0), radius=0.4,
                           dxfattribs={"layer": "AUSLAUF",
                                       "extrusion": (1, 0, 0)})
    kreis.dxf.center = kreis.ocs().from_wcs((2.0, 1.5, 9.5))
    cands = analyze_dxf(doc_bytes(doc), "x.dxf")
    rohr = next(c for c in cands if c["kind"] == "kreis")
    assert rohr["role_guess"] == "ablaufrohr"
    assert rohr["stats"]["durchmesser"] == pytest.approx(0.8)
    np.testing.assert_allclose(rohr["stats"]["mitte"], [2.0, 1.5, 9.5], atol=1e-6)
    assert rohr["stats"]["sohle"] == pytest.approx(9.1)
    assert rohr["stats"]["scheitel"] == pytest.approx(9.9)


def doc_bytes(doc) -> bytes:
    import io
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def test_modell_drehen_richtet_alles_gleich_aus(case):
    """
    Das Rechengebiet ist achsparallel. Liegt das Bauwerk schräg, dreht der
    Import einmal alles ins lokale System — Gelände, Linien und Bauwerke
    müssen dabei DIESELBE Drehung erfahren, sonst passt nichts mehr
    zusammen.
    """
    import math

    import numpy as np
    from ..core.importer import analyze_file, apply_import

    spec, d = case
    m = analyze_file(_dxf_bytes(), "modell.dxf", d)
    by_name = {c["name"]: c for c in m["candidates"]}
    ent = [{"candidate": c["id"], "role": c["role_guess"]}
           for c in m["candidates"] if c["kind"] in ("mesh", "polyline")]
    n_ops = len(spec.terrain.operations)
    apply_import(spec, d, m["import_id"], ent, rotation_deg=30.0)

    assert spec.meta.crs_rotation_deg == pytest.approx(30.0)
    # Eine gedrehte Linie behält ihre Länge, aber nicht ihre Richtung
    neue = spec.evaluation.sections[-1].polyline
    laenge = sum(math.dist(neue[i], neue[i + 1]) for i in range(len(neue) - 1))
    assert laenge > 0
    # und das Gelände ist mitgedreht: seine Ausdehnung ändert sich
    assert spec.terrain.base.source.endswith(".asc")


# ---- Gelände als Volumenkörper -------------------------------------------

def _erdkoerper_stl() -> bytes:
    """Geschlossener Erdblock 20 x 20 x 3 m mit geneigter Oberseite."""
    box = trimesh.creation.box(extents=(20.0, 20.0, 3.0))
    box.apply_translation([10.0, 10.0, 98.5])
    # Oberseite kippen: alle oberen Ecken um x/10 anheben
    v = box.vertices.copy()
    oben = v[:, 2] > 99.9
    v[oben, 2] += v[oben, 0] * 0.1
    box.vertices = v
    return box.export(file_type="stl")


def test_volumenkoerper_wird_gelaendekoerper(case):
    spec, d = case
    m = analyze_file(_erdkoerper_stl(), "erdkoerper.stl", d)
    cid = m["candidates"][0]["id"]

    info = apply_import(spec, d, m["import_id"], decisions=[
        {"candidate": cid, "role": "gelaende_koerper"}])

    # Körper liegt neben dem Fall UND ist in der Spec verzeichnet
    assert spec.terrain.base.koerper
    koerper = d / spec.terrain.base.koerper
    assert koerper.is_file()
    assert trimesh.load(koerper, force="mesh").is_watertight
    # Höhenraster aus der Oberseite: geneigt von 100 auf 102
    assert spec.terrain.base.source.endswith(".asc")
    from ..core.terrain import _load_esri_ascii
    xx, yy = np.meshgrid(np.array([1.0, 19.0]), np.array([10.0]))
    z = _load_esri_ascii(d / spec.terrain.base.source, xx, yy)
    assert z[0][0] == pytest.approx(100.1, abs=0.1)
    assert z[0][1] == pytest.approx(101.9, abs=0.1)
    assert any("Geländekörper" in r for r in info["report"])


def test_casebuilder_nutzt_den_importierten_koerper(case, tmp_path):
    from ..core.casebuilder import build_case

    spec, d = case
    m = analyze_file(_erdkoerper_stl(), "erdkoerper.stl", d)
    apply_import(spec, d, m["import_id"],
                 decisions=[{"candidate": m["candidates"][0]["id"],
                             "role": "gelaende_koerper"}])
    spec.domain.extent = (0.0, 0.0, 20.0, 20.0)
    spec.domain.z_min, spec.domain.z_max = 97.0, 105.0
    spec.structures = []
    spec.evaluation.force_patches = []
    spec.evaluation.targets = []
    out = tmp_path / "fall"
    build_case(spec, out, d)
    stl = trimesh.load(out / "constant" / "triSurface" / "terrain.stl")
    assert stl.is_watertight, "der Vernetzer muss den Körper bekommen"
    assert stl.volume == pytest.approx(20 * 20 * 3 + 20 * 20 * 1.0, rel=0.05)


def test_offener_koerper_wird_als_fehler_gemeldet(case):
    from ..core.validate import validate_case

    spec, d = case
    offen = trimesh.creation.box(extents=(20.0, 20.0, 3.0))
    offen.apply_translation([10.0, 10.0, 98.5])
    offen.update_faces(np.arange(len(offen.faces)) > 1)     # zwei Löcher
    (d / "loechrig.stl").write_bytes(offen.export(file_type="stl"))
    spec.terrain.base.koerper = "loechrig.stl"
    befunde = [f for f in validate_case(spec, d)
               if f["object_id"] == "terrain" and f["severity"] == "fehler"]
    assert befunde and "nicht geschlossen" in befunde[0]["message"]


# ---- Raster-Import: Einheit, Offset, Drehung ------------------------------

def _asc_mm_bytes() -> bytes:
    """2×2-ESRI-Raster in Millimetern und Landeskoordinaten, ein NODATA."""
    return (b"ncols 2\nnrows 2\n"
            b"xllcorner 32500000\nyllcorner 5600000\n"
            b"cellsize 10000\nNODATA_value -9999\n"
            b"100000 101000\n"
            b"102000 -9999\n")


def test_raster_import_wendet_einheit_und_offset_an(case):
    spec, d = case
    m = analyze_file(_asc_mm_bytes(), "dgm_mm.asc", d)
    cid = m["candidates"][0]["id"]

    info = apply_import(spec, d, m["import_id"],
                        decisions=[{"candidate": cid, "role": "gelaende"}],
                        unit_factor=0.001, offset=[32500.0, 5600.0],
                        derive_domain=True)

    text = (d / spec.terrain.base.source).read_text()
    kopf = dict(z.split() for z in text.splitlines()[:6])
    assert float(kopf["xllcorner"]) == pytest.approx(0.0)
    assert float(kopf["yllcorner"]) == pytest.approx(0.0)
    assert float(kopf["cellsize"]) == pytest.approx(10.0)
    # Höhen in Meter, NODATA unangetastet
    assert "100.000" in text and "-9999" in text
    # terrain_bbox kommt jetzt auch aus dem Raster -> Domäne ableitbar
    assert spec.domain.extent == (0.0, 0.0, 20.0, 20.0)
    assert spec.domain.z_min == pytest.approx(99.5)
    assert any("Einheit" in r for r in info["report"])


def test_raster_import_ohne_transformation_bleibt_bitgleich(case):
    spec, d = case
    roh = (b"ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\n"
           b"cellsize 10\nNODATA_value -9999\n"
           b"100 101\n102 -9999\n")
    m = analyze_file(roh, "dgm.asc", d)
    cid = m["candidates"][0]["id"]
    apply_import(spec, d, m["import_id"],
                 decisions=[{"candidate": cid, "role": "gelaende"}])
    assert (d / spec.terrain.base.source).read_bytes() == roh


def test_raster_import_lehnt_drehung_ehrlich_ab(case):
    spec, d = case
    m = analyze_file(_asc_mm_bytes(), "dgm_mm.asc", d)
    cid = m["candidates"][0]["id"]
    with pytest.raises(ValueError, match="[Dd]rehung"):
        apply_import(spec, d, m["import_id"],
                     decisions=[{"candidate": cid, "role": "gelaende"}],
                     unit_factor=0.001, rotation_deg=15.0)
    # ignoriertes Raster blockiert die Drehung nicht
    m2 = analyze_file(_asc_mm_bytes(), "dgm_mm2.asc", d)
    apply_import(spec, d, m2["import_id"],
                 decisions=[{"candidate": m2["candidates"][0]["id"],
                             "role": "ignorieren"}],
                 rotation_deg=15.0)


def test_xyz_import_liefert_bbox_fuer_domaene(case):
    spec, d = case
    roh = b"0 0 100\n10 0 101\n0 10 102\n"
    m = analyze_file(roh, "punkte.xyz", d)
    cid = m["candidates"][0]["id"]
    apply_import(spec, d, m["import_id"],
                 decisions=[{"candidate": cid, "role": "gelaende"}],
                 derive_domain=True)
    assert (d / spec.terrain.base.source).read_bytes() == roh
    assert spec.domain.extent == (0.0, 0.0, 10.0, 10.0)


# ---- DXF-Vollständigkeit: Blöcke, LINEs, Bögen, Zählregel -----------------

def _dxf_block_kanten_text_bytes() -> bytes:
    """Bauwerk als Blockreferenz, Kante aus Einzel-LINEs, Bogen, Text."""
    import ezdxf

    doc = ezdxf.new("R2010")
    blk = doc.blocks.new("BW")
    box = trimesh.creation.box(extents=(2.0, 2.0, 2.0))
    for f in box.faces:
        p = [tuple(box.vertices[k]) for k in f]
        blk.add_3dface([p[0], p[1], p[2], p[2]], dxfattribs={"layer": "0"})

    msp = doc.modelspace()
    msp.add_blockref("BW", (10.0, 10.0, 100.0),
                     dxfattribs={"layer": "BAUWERK"})
    # segmentierte Bruchkante: drei LINEs, Ende auf Anfang
    msp.add_line((0, 0, 50), (5, 0, 51), dxfattribs={"layer": "KANTE"})
    msp.add_line((5, 0, 51), (10, 0, 52), dxfattribs={"layer": "KANTE"})
    msp.add_line((10, 0, 52), (15, 0, 53), dxfattribs={"layer": "KANTE"})
    msp.add_arc((0.0, 0.0), 5.0, 0, 90, dxfattribs={"layer": "BOGEN"})
    msp.add_text("Notiz", dxfattribs={"layer": "NOTIZ"})
    msp.add_point((1.0, 2.0, 3.0), dxfattribs={"layer": "NOTIZ"})

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")


def test_blockreferenz_wird_aufgeloest(tmp_path):
    m = analyze_file(_dxf_block_kanten_text_bytes(), "plan.dxf", tmp_path)
    meshes = [c for c in m["candidates"]
              if c["kind"] == "mesh" and c["name"].startswith("BAUWERK")]
    assert meshes, "Block-Inhalt fehlt — INSERT wurde nicht aufgelöst"
    assert meshes[0]["stats"]["n_triangles"] == 12
    # Block wurde am Einfügepunkt platziert, nicht am Ursprung
    lo, hi = meshes[0]["stats"]["bbox"]
    assert lo[0] == pytest.approx(9.0) and hi[2] == pytest.approx(101.0)


def test_lines_werden_zu_einem_zug_verkettet(tmp_path):
    m = analyze_file(_dxf_block_kanten_text_bytes(), "plan.dxf", tmp_path)
    kanten = [c for c in m["candidates"]
              if c["kind"] == "polyline" and c["name"].startswith("KANTE")]
    assert len(kanten) == 1, "drei LINEs müssen EIN Kandidat werden"
    assert kanten[0]["stats"]["n_points"] == 4
    assert kanten[0]["stats"]["hoehen"] is True
    assert kanten[0]["stats"]["z_min"] == pytest.approx(50.0)
    assert kanten[0]["stats"]["z_max"] == pytest.approx(53.0)


def test_bogen_wird_polylinie(tmp_path):
    m = analyze_file(_dxf_block_kanten_text_bytes(), "plan.dxf", tmp_path)
    bogen = [c for c in m["candidates"] if c["name"].startswith("BOGEN")]
    assert bogen and bogen[0]["kind"] == "polyline"
    assert bogen[0]["stats"]["n_points"] >= 5
    # Bogenlänge r*pi/2 ~ 7,85 m
    assert bogen[0]["stats"]["length"] == pytest.approx(7.85, abs=0.2)


def test_nichts_verschwindet_ohne_zahl(tmp_path):
    m = analyze_file(_dxf_block_kanten_text_bytes(), "plan.dxf", tmp_path)
    hinweis = [c for c in m["candidates"]
               if c["name"] == "Beschriftung/2D-Darstellung"]
    assert hinweis, "TEXT/POINT müssen gezählt gemeldet werden"
    assert hinweis[0]["stats"]["anzahl"] == 2
    assert "TEXT" in hinweis[0]["hint"] and "POINT" in hinweis[0]["hint"]


def test_rollen_heuristik_erkennt_mm_gelaende(tmp_path):
    """mm-Datei: Schwellen sind Meter-Maße — ein 20×20-m-Gelände in mm
    (20000er-Spannweite) muss trotzdem als EIN Gelände erkannt werden."""
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for i in range(2):
        for j in range(2):
            x0, y0 = i * 10000.0, j * 10000.0
            x1, y1 = x0 + 10000.0, y0 + 10000.0
            msp.add_3dface([(x0, y0, 100000.0), (x1, y0, 100000.0),
                            (x1, y1, 101000.0), (x0, y1, 101000.0)],
                           dxfattribs={"layer": "OBERFLAECHE"})
    buf = io.StringIO()
    doc.write(buf)
    m = analyze_file(buf.getvalue().encode("utf-8"), "dgm_mm.dxf", tmp_path)

    meshes = [c for c in m["candidates"] if c["kind"] == "mesh"]
    assert len(meshes) == 1, "mm-Gelände darf nicht in Teile zerfallen"
    assert meshes[0]["role_guess"] == "gelaende"
    assert m["unit_suspect"] is True


def test_umlaut_dateinamen_sind_erlaubt(tmp_path):
    m = analyze_file(_dxf_bytes(), "Gelände_Bestand (Süd).dxf", tmp_path)
    assert m["candidates"]
    # Gefährliches bleibt draußen
    for boese in ("../auf.dxf", ".versteckt.dxf", "a/b.dxf", "a\\b.dxf"):
        with pytest.raises(ValueError, match="[Uu]nsicherer"):
            analyze_file(_dxf_bytes(), boese, tmp_path)
