"""
Tests „Rohr durch den Damm": ein Höhenfeld hat ein z je x/y und kann keinen
Tunnel haben — ein vergrabenes Rohr wird beim Vernetzen zugeschüttet. Mit
`durchstoesst_gelaende` entsteht stattdessen ein Erdkörper mit
ausgeschnittener Bohrung.
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import trimesh

from ..core import casespec as cs
from ..core.casebuilder import build_case
from ..core.solids import bohrkoerper, gelaende_koerper_bauen
from ..core.terrain import TerrainField
from ..core.validate import validate_case
from .synthetic_case import build_spec_stage3


# Punkt-in-Körper per Strahlzählung (Möller-Trumbore). trimesh.contains
# braucht `rtree`, das hier nicht installiert ist — und fünf Strahlen mit
# Mehrheitsentscheid sind gegen Kanten- und Eckentreffer robuster als der
# eine Strahl, den trimesh benutzt.
_STRAHLEN = np.array([(0.37, 0.21, 0.91), (0.91, -0.33, 0.25),
                      (-0.19, 0.88, 0.44), (0.55, 0.61, -0.57),
                      (-0.71, -0.42, 0.57)])


def _im_koerper(mesh: trimesh.Trimesh, punkt) -> bool:
    V = mesh.vertices[mesh.faces]
    e1, e2 = V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]
    s = np.asarray(punkt, dtype=float) - V[:, 0]
    treffer = 0
    for d in _STRAHLEN:
        h = np.cross(d, e2)
        a = np.einsum("ij,ij->i", e1, h)
        gut = np.abs(a) > 1e-12
        f = np.zeros_like(a)
        f[gut] = 1.0 / a[gut]
        u = f * np.einsum("ij,ij->i", s, h)
        q = np.cross(s, e1)
        v = f * np.einsum("j,ij->i", d, q)
        t = f * np.einsum("ij,ij->i", e2, q)
        schnitte = gut & (u >= 0) & (u <= 1) & (v >= 0) & (u + v <= 1) & (t > 1e-9)
        treffer += int(schnitte.sum()) % 2
    return treffer >= 3


def _damm_fall(bohren: bool) -> cs.CaseSpec:
    """Flaches Gelände auf 96 m, Rohr auf 94,5 m quer hindurch."""
    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.structures = [cs.StructCulvert(
        id="dn800", type="culvert", patch="dn800",
        axis=[(12.0, 9.0, 94.5), (-0.5, 9.0, 94.5)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8),
        durchstoesst_gelaende=bohren)]
    spec.mesh.refinements = []
    spec.evaluation = cs.Evaluation()
    return spec


def _feld(spec) -> TerrainField:
    return TerrainField.from_spec(spec.terrain, spec.domain, ".")


def test_geländekörper_ist_dicht_und_ragt_über_das_gebiet():
    f = TerrainField(x0=0.0, y0=0.0, resolution=1.0,
                     z=np.array([[1.0, 2.0, 3.0], [1.0, 2.0, 3.0],
                                 [1.0, 2.0, 4.0]]))
    m = f.to_solid(-1.0, ueberstand=0.5)
    assert m.is_watertight and m.volume > 0
    # die senkrechten Wände dürfen nicht auf den Gebietsflächen liegen
    assert m.bounds[0][0] < 0.0 and m.bounds[1][0] > 2.0


def test_bohrkoerper_verlaengert_die_achse_in_ihrer_richtung():
    s = _damm_fall(True).structures[0]
    s.bohr_ueberstand = 1.0
    b = bohrkoerper(s)
    # Achse läuft in -x von 12.0 bis -0.5, also 13.0 bis -1.5 mit Überstand
    assert b.bounds[0][0] < -1.4 and b.bounds[1][0] > 12.9
    # Bohrmaß = Licht + 2x Wandstärke - 2x Einbindung = 0.8 + 0.3 - 0.04
    assert b.bounds[1][1] - b.bounds[0][1] == pytest.approx(1.06, abs=0.02)


def test_bohrung_macht_ein_echtes_loch_im_erdkoerper():
    """
    Geprüft wird über das Volumen: dem Erdkörper muss genau der Rohrraum
    fehlen (Zylinder mit Bohr-Außenradius über die Strecke im Erdreich).
    """
    spec = _damm_fall(True)
    spec.structures[0].bohr_ueberstand = 0.75
    feld = _feld(spec)
    zelle = spec.mesh.base_cell
    unterkante = min(float(np.min(feld.z)), spec.domain.z_min) - max(4 * zelle, 1.0)
    voll = feld.to_solid(unterkante, ueberstand=2 * zelle)
    gebohrt = gelaende_koerper_bauen(feld, spec)
    assert gebohrt is not None and gebohrt.is_watertight

    r = 0.4 + 0.15 - 0.02
    # BEIDE Enden werden um bohr_ueberstand verlängert: die Bohrung läuft
    # von x = 12.75 bis -1.25 — der Erdkörper endet bei -1 (Überstand
    # 2 Zellen), dort ist die Mündung also sauber durchgestoßen
    laenge_im_erdreich = 12.75 - (-2 * zelle)
    erwartet = np.pi * r ** 2 * laenge_im_erdreich
    assert voll.volume - gebohrt.volume == pytest.approx(erwartet, rel=0.03)
    # die Bohrung darf nie Material HINZUFÜGEN (B2: invertierter Schnitt)
    assert gebohrt.volume < voll.volume


def test_beide_enden_bekommen_den_spec_ueberstand():
    """
    Regler statt Raterei: früher entschied der Abstand zur Gebietskante,
    ob ein Ende „Mündung" (voller Überstand) oder „innen" (5 cm) ist.
    Jetzt gilt an BEIDEN Enden exakt `bohr_ueberstand` aus der Spec.
    """
    spec = _damm_fall(True)
    s = spec.structures[0]
    for ueberstand in (1.2, 0.5, 0.0):
        s.bohr_ueberstand = ueberstand
        b = bohrkoerper(s)
        # Achse 12.0 … -0.5, beidseits um denselben Betrag verlängert
        assert b.bounds[0][0] == pytest.approx(-0.5 - ueberstand, abs=0.02)
        assert b.bounds[1][0] == pytest.approx(12.0 + ueberstand, abs=0.02)


def test_wandstaerke_aus_der_spec_wirkt_auf_die_bohrung():
    """DN800 mit 10 cm Wand: Bohr-Ø = 0.8 + 0.2 - 0.04 = 0.96 m."""
    s = _damm_fall(True).structures[0]
    s.profile.wandstaerke = 0.10
    b = bohrkoerper(s)
    assert b.bounds[1][1] - b.bounds[0][1] == pytest.approx(0.96, abs=0.02)


def test_kaputter_erdkoerper_wird_gemeldet_statt_geschnitten():
    """B2: nicht wasserdichter Geländekörper → klare Meldung, kein Roulette."""
    spec = _damm_fall(True)
    # ein importierter, absichtlich offener Körper (eine einzelne Platte)
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        platte = trimesh.Trimesh(
            vertices=[(0, 0, 96), (24, 0, 96), (24, 18, 96), (0, 18, 96)],
            faces=[(0, 1, 2), (0, 2, 3)])
        stl = f"{td}/koerper.stl"
        platte.export(stl)
        spec.terrain.base.koerper = "koerper.stl"
        hinweise: list[str] = []
        gelaende_koerper_bauen(_feld(spec), spec, hinweise=hinweise,
                               base_dir=td)
        assert any("nicht wasserdicht" in h for h in hinweise)


def test_ohne_schalter_bleibt_das_gelaende_die_hoehenflaeche():
    spec = _damm_fall(False)
    assert gelaende_koerper_bauen(_feld(spec), spec) is None


def test_pruefung_meldet_das_vergrabene_rohr():
    spec = _damm_fall(False)
    befunde = [f for f in validate_case(spec, ".") if f["object_id"] == "dn800"]
    assert any("unter dem Gelände" in f["message"] for f in befunde)
    # mit Schalter ist der Vergraben-Befund weg (die Rohrmund-Warnung ist
    # ein ANDERER, eigener Befund — siehe test_rohrmund_im_erdreich)
    spec = _damm_fall(True)
    assert not [f for f in validate_case(spec, ".")
                if f["object_id"] == "dn800"
                and "unter dem Gelände" in f["message"]]


def test_build_case_schreibt_den_gebohrten_koerper(tmp_path):
    spec = _damm_fall(True)
    build_case(spec, tmp_path, ".")
    m = trimesh.load(tmp_path / "constant" / "triSurface" / "terrain.stl")
    assert m.is_watertight, "der Erdkörper muss geschlossen sein"
    # ohne Bohrung wäre die Fläche eine offene Höhenfläche ohne Volumen
    assert m.volume > 0

    ohne = _damm_fall(False)
    build_case(ohne, tmp_path / "ohne", ".")
    flaeche = trimesh.load(tmp_path / "ohne" / "constant" / "triSurface"
                           / "terrain.stl")
    assert not flaeche.is_watertight


def test_seitenwaende_sind_richtig_gewickelt():
    """
    Der Erdkörper muss OHNE fix_normals() ein gültiger Volumenkörper sein.
    Die nachträgliche Reparatur traversiert den ganzen Flächengraphen und
    kostet bei einem 100-x-100-m-Gelände 90 Sekunden statt 0,4 — und der
    Körper wird bei jedem Geometrieabruf neu gebaut.
    """
    z = 100 + np.add.outer(np.arange(12) * 0.05, np.arange(9) * 0.02)
    f = TerrainField(x0=0.0, y0=0.0, resolution=0.5, z=z)
    m = f.to_solid(95.0, ueberstand=0.25)
    assert m.is_watertight and m.is_winding_consistent and m.is_volume
    assert m.volume > 0
    # jede Seitenwand zeigt nach außen: die Summe der Flächennormalen mal
    # Fläche verschwindet bei einem geschlossenen Körper
    gewicht = (m.face_normals * m.area_faces[:, None]).sum(axis=0)
    assert np.allclose(gewicht, 0.0, atol=1e-6)


def test_grundriss_auch_bei_zusammengesetzten_koerpern():
    """
    Ein Becken besteht aus Sohlplatte UND Ringwand. Der frühere Weg über
    trimesh.path.polygons.projected brauchte dafür `rtree` und lieferte
    ohne die Bibliothek still None — damit wirkte die Bearbeitung
    „Gelände" am Becken gar nicht und zwei Prüfregeln feuerten nie.
    """
    from ..core.solids import build_basin, grundriss, umriss_teile

    b = cs.StructBasin(id="b", type="basin", patch="b",
                       footprint=[(10, 10), (18, 10), (18, 16), (10, 16)],
                       invert_level=94.0, wall_height=2.0,
                       wall_thickness=0.3)
    m = build_basin(b)
    assert len(m.split(only_watertight=False)) == 2, "zusammengesetzt"
    g = grundriss(m)
    assert g is not None
    # Außenkontur = Grundriss + beidseits die Wanddicke
    assert g.area == pytest.approx((8 + 0.6) * (6 + 0.6), rel=0.01)
    assert len(umriss_teile(g)) == 1


def test_gelaende_anschluss_wirkt_am_becken():
    """Der Sockel muss den Körper bis unter das Gelände führen."""
    from ..core.solids import build_basin
    from ..core.solids import apply_edits

    spec = build_spec_stage3()
    spec.terrain.operations = []
    feld = _feld(spec)                       # flaches Gelände auf 96 m
    b = cs.StructBasin(id="b", type="basin", patch="b",
                       footprint=[(10, 10), (18, 10), (18, 16), (10, 16)],
                       invert_level=96.5, wall_height=2.0,
                       wall_thickness=0.3,
                       edits=[cs.EditGelaende(id="g", modus="einbinden",
                                              einbindetiefe=0.3)])
    roh = build_basin(b)
    assert roh.bounds[0][2] > 96.0, "Becken hängt zunächst über dem Gelände"
    mit = apply_edits(build_basin(b), b, spec.domain, feld)
    assert mit.bounds[0][2] == pytest.approx(96.0 - 0.3, abs=0.05)


def test_rechteckdurchlass_behaelt_breite_und_hoehe():
    """
    Die kürzeste Drehung von +z auf die Achse lässt offen, wie der
    Querschnitt um die Achse verdreht wird. Beim Kreis egal, beim Rechteck
    nicht: ein Durchlass 2,0 m breit und 1,0 m hoch kam in y-Richtung als
    1,0 m breit und 2,0 m hoch heraus.
    """
    from ..core.solids import build_culvert

    for achse in ([(0, 0, 95.0), (10, 0, 95.0)], [(0, 0, 95.0), (0, 10, 95.0)]):
        cv = cs.StructCulvert(
            id="c", type="culvert", patch="c", axis=achse,
            profile=cs.CulvertProfile(kind="rectangular", width=2.0,
                                      height=1.0))
        d = build_culvert(cv).extents
        # lichte Weite + beidseits 0,15 m Wand, Höhe entsprechend
        assert sorted(np.round(d, 2))[:2] == [1.3, 2.3]
        assert d[2] == pytest.approx(1.3, abs=0.01), "Höhe bleibt Höhe"


def test_maulprofil_wird_gebaut():
    """`arch` war im Schema zulässig und warf beim Bau."""
    from ..core.solids import bohrkoerper, build_culvert

    cv = cs.StructCulvert(
        id="maul", type="culvert", patch="maul",
        axis=[(0, 0, 95.0), (8, 0, 95.0)],
        profile=cs.CulvertProfile(kind="arch", width=2.0, height=1.6))
    m = build_culvert(cv)
    assert m.is_watertight and m.volume > 0
    # Scheitel als Halbkreis: Höhe 1,6 m + 2 x 0,15 m Wand
    assert m.extents[2] == pytest.approx(1.9, abs=0.02)
    assert bohrkoerper(cv) is not None


def test_erdkoerper_schalter_traegt_sohle_und_ueberstand():
    """
    Der Erdkörper ist eine EIGENSCHAFT des Geländes (kein Stapeleintrag):
    der Schalter macht ihn an, Sohle und Überstand stehen daneben. Die
    frühere Pseudo-Operation „Berechnungskörper" ist aufgelöst.
    """
    from ..core.solids import gelaende_koerper_bauen

    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.structures = []
    feld = _feld(spec)
    assert gelaende_koerper_bauen(feld, spec) is None, "ohne Angabe Fläche"

    spec.terrain.erdkoerper = "an"
    spec.terrain.erdkoerper_unterkante = 90.0
    spec.terrain.erdkoerper_ueberstand = 1.5
    k = gelaende_koerper_bauen(_feld(spec), spec)
    assert k is not None and k.is_watertight and k.volume > 0
    assert k.bounds[0][2] == pytest.approx(90.0, abs=0.01), "Sohle wie angegeben"
    x0, y0, x1, y1 = spec.domain.extent
    assert k.bounds[0][0] == pytest.approx(x0 - 1.5, abs=0.01)
    assert k.bounds[1][1] == pytest.approx(y1 + 1.5, abs=0.01)


def test_erdkoerper_ohne_masse_nimmt_sinnvolle_vorbelegung():
    from ..core.solids import gelaende_koerper_bauen

    spec = build_spec_stage3()
    spec.terrain.operations = []
    spec.terrain.erdkoerper = "an"
    spec.structures = []
    feld = _feld(spec)
    k = gelaende_koerper_bauen(feld, spec)
    # vier Zellhöhen (mindestens 1 m) unter dem tiefsten Punkt von
    # Gelände und Modellgebiet
    tief = min(float(feld.z.min()), spec.domain.z_min)
    luft = max(4 * spec.mesh.base_cell, 1.0)
    assert k.bounds[0][2] == pytest.approx(tief - luft, abs=0.05)


def test_knickachse_bohrt_einen_dichten_koerper():
    """
    S4: an einem inneren Achspunkt stoßen die Segmente stumpf — am
    Außenbogen bliebe ein Keil Erdreich im Rohrquerschnitt stehen. Eine
    Kugel mit Bohr-Außenradius am Knick füllt ihn.
    """
    def cv(axis):
        return cs.StructCulvert(
            id="k", type="culvert", patch="k", axis=axis,
            profile=cs.CulvertProfile(kind="circular", diameter=0.8),
            bohr_ueberstand=0.0)

    knick = bohrkoerper(cv([(0, 0, 95.0), (6, 0, 95.0), (10, 4, 95.0)]))
    assert knick.is_watertight
    assert len(knick.split(only_watertight=False)) == 1, "EIN Körper"
    # ohne die Kugel: dieselben zwei Segmente stumpf vereinigt
    stumpf = trimesh.boolean.union([
        bohrkoerper(cv([(0, 0, 95.0), (6, 0, 95.0)])),
        bohrkoerper(cv([(6, 0, 95.0), (10, 4, 95.0)]))])
    assert knick.volume > stumpf.volume, "der Keil am Knick ist gefüllt"


def test_knickachse_laesst_den_wasserweg_offen():
    """
    DER Test am Knick: der lichte Querschnitt bleibt frei.

    Vorgeschichte (Testrunde 2026-08-16, gemeldet als „innen sieht das Rohr
    nicht mehr durchgängig aus"). Nachgemessen an einem DN800 mit
    90°-Knick waren 0,3 bis 0,5 m hinter dem Knick rund die HÄLFTE des
    lichten Querschnitts zu — aus zwei Gründen:

      * die Ringsegmente stießen stumpf, der Wandring des einen Schenkels
        ragte quer durch den lichten Raum des anderen;
      * die Kugelschale am Knick hatte ihren Hohlraum vom KNICKPUNKT aus
        gemessen — der lichte Kanal ist aber keine Kugel.

    Der alte Test prüfte die Bauweise (vier lose Teile) statt der Zusage.
    Deshalb ist er hier nicht angepasst, sondern ersetzt: geprüft wird,
    dass man durch das Rohr hindurchsieht.
    """
    from ..core.solids import build_culvert

    knick = (6.0, 0.0, 95.0)
    cv = cs.StructCulvert(
        id="k", type="culvert", patch="k",
        axis=[(0, 0, 95.0), knick, (10, 4, 95.0)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8))
    m = build_culvert(cv)

    assert m.is_watertight, "Rohrkörper muss ein Volumen sein"
    assert len(m.split(only_watertight=False)) == 1, "EIN zusammenhängender Körper"

    # Der Wasserweg des ZWEITEN Schenkels, dicht hinter dem Knick — dort
    # saß das Material. Achsrichtung (4,4)/|…| ab dem Knickpunkt.
    richtung = np.array([4.0, 4.0, 0.0]) / math.hypot(4.0, 4.0)
    quer = np.array([richtung[1], -richtung[0], 0.0])
    hoch = np.array([0.0, 0.0, 1.0])
    r = 0.4 * 0.9                       # knapp innerhalb des lichten Radius
    proben = []
    for s in (0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.90, 1.50):
        for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
            proben.append(np.asarray(knick) + s * richtung
                          + r * math.cos(a) * quer + r * math.sin(a) * hoch)

    verbaut = [p for p in proben if _im_koerper(m, p)]
    assert not verbaut, (
        f"{len(verbaut)} von {len(proben)} Punkten im lichten Querschnitt "
        f"sind verbaut, erster bei {verbaut[0] if verbaut else None}")

    # eine gerade 2-Punkt-Achse bleibt ein einfaches Rohr
    cv2 = cs.StructCulvert(
        id="g", type="culvert", patch="g",
        axis=[(0, 0, 95.0), (6, 0, 95.0)],
        profile=cs.CulvertProfile(kind="circular", diameter=0.8))
    gerade = build_culvert(cv2)
    assert gerade.is_watertight
    assert not _im_koerper(gerade, np.array([3.0, 0.0, 95.0])), \
        "die Rohrachse liegt im Wasserweg, nicht in der Wand"


def test_knick_verbaut_auch_rechteck_und_maul_nicht():
    """Dieselbe Zusage für die eckigen Profile — dort liegt der lichte
    Raum nicht rotationssymmetrisch um die Achse."""
    from ..core.solids import build_culvert

    knick = (6.0, 0.0, 95.0)
    for profil in (cs.CulvertProfile(kind="rectangular", width=1.2, height=0.9),
                   cs.CulvertProfile(kind="arch", width=1.2, height=1.0)):
        cv = cs.StructCulvert(id="k", type="culvert", patch="k",
                              axis=[(0, 0, 95.0), knick, (10, 4, 95.0)],
                              profile=profil)
        m = build_culvert(cv)
        assert m.is_watertight, profil.kind
        # auf der Achse (beim Maulprofil liegt sie auf der Sohle, deshalb
        # ein Stück darüber) hinter dem Knick
        hoch = 0.0 if profil.kind == "rectangular" else 0.35
        richtung = np.array([4.0, 4.0, 0.0]) / math.hypot(4.0, 4.0)
        for s in (0.1, 0.3, 0.5, 0.9):
            p = np.asarray(knick) + s * richtung + np.array([0, 0, hoch])
            assert not _im_koerper(m, p), f"{profil.kind} bei s = {s} m verbaut"


def test_rohrmund_im_erdreich_wird_gewarnt():
    """
    Die Bohrung endet bohr_ueberstand hinter dem Achsende — liegt das
    Gelände dort über dem Rohrscheitel, steckt die Mündung im Erdreich.
    Geneigte Achse im flachen Gelände auf 96 m: das tiefe Ende ist
    begraben, das hohe Ende ragt frei heraus.
    """
    spec = _damm_fall(True)
    s = spec.structures[0]
    s.axis = [(2.0, 9.0, 97.5), (12.0, 9.0, 94.5)]
    befunde = [f for f in validate_case(spec, ".")
               if f["object_id"] == "dn800" and "Rohrmund" in f["message"]]
    assert len(befunde) == 1, "nur das begrabene Ende wird gemeldet"
    # Zahlen im Befund: Überdeckung am Bohrende (x ≈ 12.48)
    v = np.array([10.0, 0.0, -3.0])
    mund_z = 94.5 + 0.5 * v[2] / np.linalg.norm(v)
    ueberdeckung = 96.0 - (mund_z + 0.4)
    assert f"{ueberdeckung:.2f} m über dem Rohrscheitel" in befunde[0]["message"]
    assert "Fräs-Überstand" in befunde[0]["message"]

    # frei liegendes Rohr auf dem Gelände: keine Rohrmund-Warnung
    s.axis = [(2.0, 9.0, 97.5), (12.0, 9.0, 97.5)]
    assert not [f for f in validate_case(spec, ".")
                if "Rohrmund" in f["message"]]


def test_ungewoehnliche_nennweite_wird_gewarnt():
    """DN800 als Radius importiert ergibt 1,60 m — das riecht nach Import."""
    spec = _damm_fall(True)
    spec.structures[0].profile.diameter = 1.6
    assert [f for f in validate_case(spec, ".")
            if f["object_id"] == "dn800" and "ungewöhnlich" in f["message"]
            and "Kreisradius" in f["message"]]
    spec.structures[0].profile.diameter = 0.8
    assert not [f for f in validate_case(spec, ".")
                if f["object_id"] == "dn800" and "ungewöhnlich" in f["message"]]


def test_rechteckdurchlass_bohrt_durch_den_erdkoerper():
    """Wie der Kreis-Test, nur mit Kastenprofil: Volumenabnahme = Kasten."""
    spec = _damm_fall(True)
    spec.structures[0] = cs.StructCulvert(
        id="kasten", type="culvert", patch="kasten",
        axis=[(12.0, 9.0, 94.5), (-0.5, 9.0, 94.5)],
        profile=cs.CulvertProfile(kind="rectangular", width=1.0, height=0.8),
        durchstoesst_gelaende=True, bohr_ueberstand=0.75)
    feld = _feld(spec)
    zelle = spec.mesh.base_cell
    unterkante = min(float(np.min(feld.z)), spec.domain.z_min) - max(4 * zelle, 1.0)
    voll = feld.to_solid(unterkante, ueberstand=2 * zelle)
    gebohrt = gelaende_koerper_bauen(feld, spec)
    assert gebohrt is not None and gebohrt.is_watertight
    b, h = 1.0 + 2 * (0.15 - 0.02), 0.8 + 2 * (0.15 - 0.02)
    erwartet = b * h * (12.75 - (-2 * zelle))
    assert voll.volume - gebohrt.volume == pytest.approx(erwartet, rel=0.03)


def test_migration_schreibt_den_bohr_ueberstand_in_alte_faelle():
    """
    Alte Fälle kannten nur die Enden-Heuristik. Beim Laden bekommt jeder
    bohrende Durchlass den Regler EXPLIZIT mit 0.5 hineingeschrieben —
    sichtbar im Fall, nicht still als Schema-Default.
    """
    spec = _damm_fall(True)
    daten = spec.model_dump(mode="json", exclude_none=True)
    del daten["structures"][0]["bohr_ueberstand"]
    neu = cs.migriere(daten)
    assert neu["structures"][0]["bohr_ueberstand"] == 0.5
    # ohne den Schalter bleibt es beim (unsichtbaren) Schema-Default
    daten["structures"][0]["durchstoesst_gelaende"] = False
    del daten["structures"][0]["bohr_ueberstand"]
    assert "bohr_ueberstand" not in cs.migriere(daten)["structures"][0]


def test_migration_loest_berechnungskoerper_auf():
    """Alte Fälle mit der Pseudo-Operation laden sauber: die Operation
    verschwindet, Schalter und Maße wandern ans Gelände."""
    spec = build_spec_stage3()
    daten = spec.model_dump(mode="json", exclude_none=True)
    daten["terrain"]["operations"].append({
        "id": "koerper", "type": "berechnungskoerper",
        "unterkante": 91.0, "ueberstand": 2.5})
    neu = cs.CaseSpec.model_validate(cs.migriere(daten))
    assert not any(o.type == "berechnungskoerper"
                   for o in neu.terrain.operations
                   if hasattr(o, "type"))
    assert neu.terrain.erdkoerper == "an"
    assert neu.terrain.erdkoerper_unterkante == 91.0
    assert neu.terrain.erdkoerper_ueberstand == 2.5
